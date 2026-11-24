import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { Content } from '@google/genai';
import {
  AIServiceError,
  GEMINI_MODEL,
  formatGeminiError,
  getGeminiClient,
  withGeminiRetry,
} from '../ai/client';
import { AI_MODULE_GUIDELINES, buildCatalogSummaryForPrompt } from '../ai/modules';
import {
  buildAdminOverview,
  buildAnalyticsReport,
  countAdminUsers,
  createAdminUser,
  createCategory,
  createCoupon,
  createProduct,
  deleteAdminUser,
  deleteCategory,
  deleteCoupon,
  deleteProduct,
  deleteReview,
  findAdminUserByEmail,
  findAdminUserById,
  getAIAnalyticsSummary,
  getCmsContent,
  getOrderById,
  getProductById,
  getStoreSettings,
  hashPassword,
  listAIAgents,
  listAdminUsers,
  listAllReviewsForAdmin,
  listAuditLogs,
  listCategories,
  listCoupons,
  listCustomerSummaries,
  listNotifications,
  listOrders,
  listProducts,
  listStockHistory,
  listSupportTickets,
  listWhatsAppReferrals,
  markNotificationsRead,
  moderateReview,
  recordAuditLog,
  touchAdminLastLogin,
  updateAIAgent,
  updateAdminUser,
  updateCategory,
  updateCmsContent,
  updateCoupon,
  updateCustomerProfile,
  updateOrderInternalNotes,
  updateOrderStatusTransactional,
  updateProduct,
  updateStoreSettings,
  updateSupportTicket,
  verifyPassword,
} from '../db/database';
import type {
  AIAgentConfig,
  AdminRole,
  CategoryRecord,
  CouponRecord,
  OrderStatus,
  Product,
  Product3DConfig,
  StoreSettingsFull,
  SupportTicket,
  WebsiteContentCMS,
} from '../../src/types/store';

export interface AuthenticatedAdmin {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
}

declare global {
  namespace Express {
    interface Request {
      adminUser?: AuthenticatedAdmin;
    }
  }
}

const AUTH_SECRET = process.env.AUTH_SECRET || 'aurelia-botanica-local-session-secret';
const ENV_ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim().toLowerCase() || '';
const ENV_ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || '';
const UPLOAD_DIR = path.resolve(process.cwd(), 'public', 'uploads');

const ALL_ROLES: AdminRole[] = ['super_admin', 'store_manager', 'inventory_manager', 'support_agent'];
const ORDER_STATUSES: OrderStatus[] = [
  'Pending',
  'Confirmed',
  'Processing',
  'Shipped',
  'Out for Delivery',
  'Delivered',
  'Cancelled',
  'Returned',
];

function constantTimeMatch(a: string, b: string): boolean {
  const da = crypto.createHash('sha256').update(a).digest();
  const db = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(da, db);
}

export function signAdminToken(admin: AuthenticatedAdmin): string {
  const payload = Buffer.from(
    JSON.stringify({
      uid: admin.id,
      email: admin.email,
      role: admin.role,
      kind: 'admin',
      exp: Date.now() + 1000 * 60 * 60 * 12,
    }),
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyAdminToken(token: string | undefined): { uid: string; email: string; role: AdminRole } | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  if (sig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
      uid?: string;
      email?: string;
      role?: AdminRole;
      kind?: string;
      exp?: number;
    };
    if (decoded.kind !== 'admin' || !decoded.uid || !decoded.role) return null;
    if (decoded.exp && Date.now() > decoded.exp) return null;
    return { uid: decoded.uid, email: decoded.email || '', role: decoded.role };
  } catch {
    return null;
  }
}

// Simple in-memory sliding-window rate limiter
const rateBuckets = new Map<string, number[]>();
function createRateLimiter(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'local';
    const key = `${req.path}:${ip}`;
    const now = Date.now();
    const recent = (rateBuckets.get(key) || []).filter((ts) => now - ts < windowMs);
    if (recent.length >= maxRequests) {
      res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
      return;
    }
    recent.push(now);
    rateBuckets.set(key, recent);
    next();
  };
}

const authLimiter = createRateLimiter(20, 60_000);

function requireAdminRole(allowedRoles: AdminRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
    const parsed = verifyAdminToken(token);
    if (!parsed) {
      res.status(401).json({ error: 'Administrator authentication required.' });
      return;
    }

    if (parsed.uid === 'env-super-admin') {
      req.adminUser = {
        id: 'env-super-admin',
        name: 'Store Owner (Super Admin)',
        email: parsed.email || ENV_ADMIN_EMAIL || 'admin@aureliabotanica.pk',
        role: 'super_admin',
      };
    } else {
      const dbUser = findAdminUserById(parsed.uid);
      if (!dbUser || !dbUser.isActive) {
        res.status(401).json({ error: 'Admin account is inactive or no longer exists.' });
        return;
      }
      req.adminUser = {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        role: dbUser.role,
      };
    }

    if (!allowedRoles.includes(req.adminUser.role)) {
      res.status(403).json({
        error: `Access denied. Role "${req.adminUser.role}" is not permitted to perform this action.`,
      });
      return;
    }
    next();
  };
}

const ALLOWED_UPLOADS: Record<string, { ext: string; maxBytes: number }> = {
  'image/png': { ext: '.png', maxBytes: 8 * 1024 * 1024 },
  'image/jpeg': { ext: '.jpg', maxBytes: 8 * 1024 * 1024 },
  'image/webp': { ext: '.webp', maxBytes: 8 * 1024 * 1024 },
  'video/mp4': { ext: '.mp4', maxBytes: 20 * 1024 * 1024 },
  'video/webm': { ext: '.webm', maxBytes: 20 * 1024 * 1024 },
  'model/gltf-binary': { ext: '.glb', maxBytes: 20 * 1024 * 1024 },
  'model/gltf+json': { ext: '.gltf', maxBytes: 20 * 1024 * 1024 },
  'application/octet-stream': { ext: '.glb', maxBytes: 20 * 1024 * 1024 },
};

export function createAdminRouter(): express.Router {
  const router = express.Router();

  // -------------------------------------------------------------------------
  // AUTHENTICATION & FIRST-RUN SETUP
  // -------------------------------------------------------------------------

  router.get('/auth/status', (_req, res) => {
    const adminCount = countAdminUsers();
    const envConfigured = Boolean(ENV_ADMIN_EMAIL && ENV_ADMIN_PASSCODE);
    res.json({
      needsInitialSetup: adminCount === 0 && !envConfigured,
      hasDbAdmins: adminCount > 0,
      envBootstrapAvailable: envConfigured,
    });
  });

  router.post('/auth/setup', authLimiter, (req, res) => {
    const adminCount = countAdminUsers();
    if (adminCount > 0) {
      res.status(409).json({ error: 'Initial Super Admin account has already been configured.' });
      return;
    }
    const { name, email, password } = req.body as { name?: string; email?: string; password?: string };
    if (!name?.trim() || !email?.trim() || !password || password.length < 8) {
      res.status(400).json({ error: 'Name, valid email, and password (min 8 characters) are required.' });
      return;
    }
    const created = createAdminUser({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: 'super_admin',
      password,
    });
    const admin: AuthenticatedAdmin = {
      id: created.id,
      name: created.name,
      email: created.email,
      role: created.role,
    };
    touchAdminLastLogin(created.id);
    recordAuditLog({
      actorId: admin.id,
      actorEmail: admin.email,
      actorRole: admin.role,
      action: 'admin_setup',
      targetType: 'admin_user',
      targetId: admin.id,
      details: 'Initial Super Admin setup completed',
    });
    const token = signAdminToken(admin);
    res.status(201).json({ token, admin });
  });

  router.post('/login', authLimiter, (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email?.trim() || !password) {
      res.status(400).json({ error: 'Admin email and password are required.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const dbAdmin = findAdminUserByEmail(normalizedEmail);
    if (dbAdmin) {
      if (!dbAdmin.isActive) {
        res.status(403).json({ error: 'This administrator account has been deactivated.' });
        return;
      }
      if (!verifyPassword(password, dbAdmin.passwordSalt, dbAdmin.passwordHash)) {
        res.status(401).json({ error: 'Invalid administrator credentials.' });
        return;
      }
      touchAdminLastLogin(dbAdmin.id);
      const admin: AuthenticatedAdmin = {
        id: dbAdmin.id,
        name: dbAdmin.name,
        email: dbAdmin.email,
        role: dbAdmin.role,
      };
      recordAuditLog({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        action: 'admin_login',
        targetType: 'session',
        details: 'Signed in via DB credentials',
      });
      res.json({ token: signAdminToken(admin), admin });
      return;
    }

    // Fallback to explicit server environment credentials if configured
    if (
      ENV_ADMIN_EMAIL &&
      ENV_ADMIN_PASSCODE &&
      constantTimeMatch(normalizedEmail, ENV_ADMIN_EMAIL) &&
      constantTimeMatch(password, ENV_ADMIN_PASSCODE)
    ) {
      const admin: AuthenticatedAdmin = {
        id: 'env-super-admin',
        name: 'Store Owner',
        email: ENV_ADMIN_EMAIL,
        role: 'super_admin',
      };
      recordAuditLog({
        actorId: admin.id,
        actorEmail: admin.email,
        actorRole: admin.role,
        action: 'admin_login',
        targetType: 'session',
        details: 'Signed in via server environment Super Admin credentials',
      });
      res.json({ token: signAdminToken(admin), admin });
      return;
    }

    res.status(401).json({ error: 'Invalid administrator credentials.' });
  });

  router.get('/me', requireAdminRole(ALL_ROLES), (req, res) => {
    res.json({ admin: req.adminUser });
  });

  router.patch('/profile', requireAdminRole(ALL_ROLES), (req, res) => {
    const actor = req.adminUser!;
    if (actor.id === 'env-super-admin') {
      res.status(400).json({ error: 'Environment-provisioned Super Admin credentials are managed via server secrets.' });
      return;
    }
    const { name, password } = req.body as { name?: string; password?: string };
    if (password && password.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters.' });
      return;
    }
    const updated = updateAdminUser(actor.id, { name, password });
    if (!updated) {
      res.status(404).json({ error: 'Admin user not found.' });
      return;
    }
    recordAuditLog({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'update_own_profile',
      targetType: 'admin_user',
      targetId: actor.id,
    });
    res.json({ admin: { id: updated.id, name: updated.name, email: updated.email, role: updated.role } });
  });

  // -------------------------------------------------------------------------
  // SECURE MEDIA / 3D ASSET UPLOAD (/public/uploads)
  // -------------------------------------------------------------------------

  router.post(
    '/uploads',
    requireAdminRole(['super_admin', 'store_manager', 'inventory_manager']),
    (req, res) => {
      const { fileName, mimeType, dataBase64 } = req.body as {
        fileName?: string;
        mimeType?: string;
        dataBase64?: string;
      };
      if (!dataBase64 || typeof dataBase64 !== 'string') {
        res.status(400).json({ error: 'Missing uploaded file data.' });
        return;
      }

      const lowerName = (fileName || '').toLowerCase();
      let resolvedMime = (mimeType || '').toLowerCase();
      if (lowerName.endsWith('.glb')) resolvedMime = 'model/gltf-binary';
      else if (lowerName.endsWith('.gltf')) resolvedMime = 'model/gltf+json';

      const rule = ALLOWED_UPLOADS[resolvedMime];
      if (!rule) {
        res.status(400).json({
          error: 'Unsupported file format. Allowed: PNG, JPG, WEBP images, MP4/WEBM videos, or GLB/GLTF 3D models.',
        });
        return;
      }

      const base64Body = dataBase64.replace(/^data:[^;]+;base64,/, '').trim();
      const buffer = Buffer.from(base64Body, 'base64');
      if (buffer.length === 0 || buffer.length > rule.maxBytes) {
        res.status(400).json({
          error: `File size exceeds limit (${Math.round(rule.maxBytes / (1024 * 1024))} MB max).`,
        });
        return;
      }

      if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      }
      const safeName = `${crypto.randomUUID()}${rule.ext}`;
      const targetPath = path.resolve(UPLOAD_DIR, safeName);
      if (!targetPath.startsWith(UPLOAD_DIR + path.sep)) {
        res.status(400).json({ error: 'Invalid upload path.' });
        return;
      }

      fs.writeFileSync(targetPath, buffer);
      const actor = req.adminUser!;
      recordAuditLog({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'upload_asset',
        targetType: 'file',
        targetId: safeName,
        details: `${resolvedMime} (${buffer.length} bytes)`,
      });

      res.status(201).json({ url: `/uploads/${safeName}`, mimeType: resolvedMime, sizeBytes: buffer.length });
    },
  );

  // -------------------------------------------------------------------------
  // 1. DASHBOARD OVERVIEW & GLOBAL SEARCH
  // -------------------------------------------------------------------------

  router.get('/overview', requireAdminRole(ALL_ROLES), (_req, res) => {
    res.json({ overview: buildAdminOverview() });
  });

  router.get('/search', requireAdminRole(ALL_ROLES), (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    if (!q) {
      res.json({ products: [], orders: [], customers: [] });
      return;
    }
    const products = listProducts({ includeUnpublished: true })
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q) ||
          (p.sku || '').toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q),
      )
      .slice(0, 6);
    const orders = listOrders(200)
      .filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          o.customerPhone.toLowerCase().includes(q),
      )
      .slice(0, 6);
    const customers = listCustomerSummaries()
      .filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
      .slice(0, 6);
    res.json({ products, orders, customers });
  });

  // -------------------------------------------------------------------------
  // 2. PRODUCTS CRUD & 3D MODEL STUDIO ASSIGNMENT
  // -------------------------------------------------------------------------

  router.get('/products', requireAdminRole(ALL_ROLES), (_req, res) => {
    res.json({ products: listProducts({ includeUnpublished: true, includeReviews: true }) });
  });

  router.post(
    '/products',
    requireAdminRole(['super_admin', 'store_manager', 'inventory_manager']),
    (req, res) => {
      const body = req.body as Partial<Product>;
      if (!body.name?.trim() || !body.category?.trim() || !body.department || !body.pricePkr || body.pricePkr <= 0) {
        res.status(400).json({ error: 'Name, department, category, and positive PKR price are required.' });
        return;
      }
      const actor = req.adminUser!;
      const created = createProduct(body, actor.email);
      recordAuditLog({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'create_product',
        targetType: 'product',
        targetId: created.id,
        details: created.name,
      });
      res.status(201).json({ product: created });
    },
  );

  router.patch(
    '/products/:id',
    requireAdminRole(['super_admin', 'store_manager', 'inventory_manager']),
    (req, res) => {
      const actor = req.adminUser!;
      const patch = req.body as Partial<Product> & { stockReason?: string };
      // Inventory Manager can adjust stock, SKU, status, and 3D preview only, or price if permitted? Let's allow standard product updates for store_manager/super_admin, and stock/sku/low-risk fields for inventory_manager.
      const existing = getProductById(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Product not found.' });
        return;
      }
      const updated = updateProduct(req.params.id, patch, actor.email);
      recordAuditLog({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'update_product',
        targetType: 'product',
        targetId: req.params.id,
        details: updated?.name,
      });
      res.json({ product: updated });
    },
  );

  router.patch(
    '/products/:id/3d-config',
    requireAdminRole(['super_admin', 'store_manager']),
    (req, res) => {
      const actor = req.adminUser!;
      const config = req.body as Product3DConfig;
      const existing = getProductById(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Product not found.' });
        return;
      }
      const updated = updateProduct(
        req.params.id,
        {
          modelConfig: config,
          modelSilhouette: config.silhouette || existing.modelSilhouette,
          defaultFinish: config.finish || existing.defaultFinish,
        },
        actor.email,
      );
      recordAuditLog({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'update_product_3d',
        targetType: 'product',
        targetId: req.params.id,
        details: `${existing.name} (${config.mode})`,
      });
      res.json({ product: updated });
    },
  );

  router.delete(
    '/products/:id',
    requireAdminRole(['super_admin', 'store_manager']),
    (req, res) => {
      const actor = req.adminUser!;
      const existing = getProductById(req.params.id);
      if (!existing || !deleteProduct(req.params.id)) {
        res.status(404).json({ error: 'Product not found.' });
        return;
      }
      recordAuditLog({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'delete_product',
        targetType: 'product',
        targetId: req.params.id,
        details: existing.name,
      });
      res.json({ deletedId: req.params.id });
    },
  );

  // -------------------------------------------------------------------------
  // 3. CATEGORIES MANAGEMENT
  // -------------------------------------------------------------------------

  router.get('/categories', requireAdminRole(ALL_ROLES), (_req, res) => {
    res.json({ categories: listCategories(true) });
  });

  router.post('/categories', requireAdminRole(['super_admin', 'store_manager']), (req, res) => {
    const body = req.body as Partial<CategoryRecord>;
    if (!body.name?.trim() || (body.department !== 'skincare' && body.department !== 'haircare')) {
      res.status(400).json({ error: 'Category name and department (skincare or haircare) are required.' });
      return;
    }
    const created = createCategory(body);
    const actor = req.adminUser!;
    recordAuditLog({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'create_category',
      targetType: 'category',
      targetId: created.id,
      details: created.name,
    });
    res.status(201).json({ category: created });
  });

  router.patch('/categories/:id', requireAdminRole(['super_admin', 'store_manager']), (req, res) => {
    const updated = updateCategory(req.params.id, req.body as Partial<CategoryRecord>);
    if (!updated) {
      res.status(404).json({ error: 'Category not found.' });
      return;
    }
    const actor = req.adminUser!;
    recordAuditLog({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'update_category',
      targetType: 'category',
      targetId: updated.id,
      details: updated.name,
    });
    res.json({ category: updated });
  });

  router.delete('/categories/:id', requireAdminRole(['super_admin', 'store_manager']), (req, res) => {
    if (!deleteCategory(req.params.id)) {
      res.status(404).json({ error: 'Category not found.' });
      return;
    }
    const actor = req.adminUser!;
    recordAuditLog({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'delete_category',
      targetType: 'category',
      targetId: req.params.id,
    });
    res.json({ deletedId: req.params.id });
  });

  // -------------------------------------------------------------------------
  // 4. ORDERS MANAGEMENT
  // -------------------------------------------------------------------------

  router.get('/orders', requireAdminRole(['super_admin', 'store_manager', 'support_agent']), (req, res) => {
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : 'all';
    const paymentFilter = typeof req.query.paymentMethod === 'string' ? req.query.paymentMethod : 'all';
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';

    const orders = listOrders(500).filter((o) => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (paymentFilter !== 'all' && o.paymentMethod !== paymentFilter) return false;
      if (q) {
        const hay = `${o.orderNumber} ${o.customerName} ${o.customerPhone} ${o.shippingAddress.city}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    res.json({ orders });
  });

  router.get('/orders/:id', requireAdminRole(['super_admin', 'store_manager', 'support_agent']), (req, res) => {
    const order = getOrderById(req.params.id);
    if (!order) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }
    res.json({ order });
  });

  router.patch(
    '/orders/:id/status',
    requireAdminRole(['super_admin', 'store_manager', 'support_agent']),
    (req, res) => {
      const { status, note } = req.body as { status?: OrderStatus; note?: string };
      if (!status || !ORDER_STATUSES.includes(status)) {
        res.status(400).json({ error: 'Invalid order status.' });
        return;
      }
      const actor = req.adminUser!;
      const updated = updateOrderStatusTransactional(req.params.id, status, note, actor.email);
      if (!updated) {
        res.status(404).json({ error: 'Order not found.' });
        return;
      }
      recordAuditLog({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'update_order_status',
        targetType: 'order',
        targetId: updated.id,
        details: `${updated.orderNumber} -> ${status}`,
      });
      res.json({ order: updated });
    },
  );

  router.patch(
    '/orders/:id/notes',
    requireAdminRole(['super_admin', 'store_manager', 'support_agent']),
    (req, res) => {
      const { internalNotes } = req.body as { internalNotes?: string };
      const updated = updateOrderInternalNotes(req.params.id, String(internalNotes || ''));
      if (!updated) {
        res.status(404).json({ error: 'Order not found.' });
        return;
      }
      res.json({ order: updated });
    },
  );

  // -------------------------------------------------------------------------
  // 5. CUSTOMERS CRM
  // -------------------------------------------------------------------------

  router.get('/customers', requireAdminRole(['super_admin', 'store_manager', 'support_agent']), (_req, res) => {
    res.json({ customers: listCustomerSummaries() });
  });

  router.patch(
    '/customers/:id/status',
    requireAdminRole(['super_admin', 'store_manager']),
    (req, res) => {
      const { isActive } = req.body as { isActive?: boolean };
      if (typeof isActive !== 'boolean') {
        res.status(400).json({ error: 'isActive boolean is required.' });
        return;
      }
      const updated = updateCustomerProfile(req.params.id, { isActive });
      if (!updated) {
        res.status(404).json({ error: 'Customer not found.' });
        return;
      }
      const actor = req.adminUser!;
      recordAuditLog({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: isActive ? 'activate_customer' : 'suspend_customer',
        targetType: 'customer',
        targetId: updated.id,
        details: updated.email,
      });
      res.json({ customer: listCustomerSummaries().find((c) => c.id === updated.id) });
    },
  );

  // -------------------------------------------------------------------------
  // 6. INVENTORY & STOCK LEDGER
  // -------------------------------------------------------------------------

  router.get('/inventory', requireAdminRole(['super_admin', 'store_manager', 'inventory_manager']), (_req, res) => {
    const products = listProducts({ includeUnpublished: true });
    const settings = getStoreSettings();
    const history = listStockHistory(120);
    res.json({
      products,
      lowStockThreshold: settings.lowStockThreshold,
      history,
    });
  });

  router.post(
    '/inventory/adjust',
    requireAdminRole(['super_admin', 'store_manager', 'inventory_manager']),
    (req, res) => {
      const { productId, newStock, reason } = req.body as {
        productId?: string;
        newStock?: number;
        reason?: string;
      };
      if (!productId || typeof newStock !== 'number' || newStock < 0) {
        res.status(400).json({ error: 'Valid productId and non-negative newStock are required.' });
        return;
      }
      const actor = req.adminUser!;
      const updated = updateProduct(
        productId,
        { stock: Math.round(newStock), stockReason: reason?.trim() || 'Inventory adjustment' },
        actor.email,
      );
      if (!updated) {
        res.status(404).json({ error: 'Product not found.' });
        return;
      }
      recordAuditLog({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'adjust_inventory',
        targetType: 'product',
        targetId: updated.id,
        details: `${updated.name} -> ${updated.stock} units (${reason?.trim() || 'Manual'})`,
      });
      res.json({ product: updated, history: listStockHistory(120) });
    },
  );

  router.patch(
    '/inventory/threshold',
    requireAdminRole(['super_admin', 'store_manager', 'inventory_manager']),
    (req, res) => {
      const { lowStockThreshold } = req.body as { lowStockThreshold?: number };
      if (typeof lowStockThreshold !== 'number' || lowStockThreshold < 0 || lowStockThreshold > 500) {
        res.status(400).json({ error: 'Threshold must be between 0 and 500.' });
        return;
      }
      const settings = updateStoreSettings({ lowStockThreshold: Math.round(lowStockThreshold) });
      res.json({ lowStockThreshold: settings.lowStockThreshold });
    },
  );

  // -------------------------------------------------------------------------
  // 7. DISCOUNTS & COUPONS
  // -------------------------------------------------------------------------

  router.get('/coupons', requireAdminRole(['super_admin', 'store_manager']), (_req, res) => {
    res.json({ coupons: listCoupons(false) });
  });

  router.post('/coupons', requireAdminRole(['super_admin', 'store_manager']), (req, res) => {
    const body = req.body as Partial<CouponRecord>;
    if (!body.code?.trim()) {
      res.status(400).json({ error: 'Coupon code is required.' });
      return;
    }
    try {
      const created = createCoupon(body);
      const actor = req.adminUser!;
      recordAuditLog({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'create_coupon',
        targetType: 'coupon',
        targetId: created.id,
        details: created.code,
      });
      res.status(201).json({ coupon: created });
    } catch {
      res.status(409).json({ error: 'A coupon with this code already exists.' });
    }
  });

  router.patch('/coupons/:id', requireAdminRole(['super_admin', 'store_manager']), (req, res) => {
    const updated = updateCoupon(req.params.id, req.body as Partial<CouponRecord>);
    if (!updated) {
      res.status(404).json({ error: 'Coupon not found.' });
      return;
    }
    res.json({ coupon: updated });
  });

  router.delete('/coupons/:id', requireAdminRole(['super_admin', 'store_manager']), (req, res) => {
    if (!deleteCoupon(req.params.id)) {
      res.status(404).json({ error: 'Coupon not found.' });
      return;
    }
    res.json({ deletedId: req.params.id });
  });

  // -------------------------------------------------------------------------
  // 8. REVIEWS MODERATION
  // -------------------------------------------------------------------------

  router.get('/reviews', requireAdminRole(['super_admin', 'store_manager', 'support_agent']), (_req, res) => {
    res.json({ reviews: listAllReviewsForAdmin() });
  });

  router.patch(
    '/reviews/:id',
    requireAdminRole(['super_admin', 'store_manager', 'support_agent']),
    (req, res) => {
      const { status, adminReply } = req.body as {
        status?: 'approved' | 'pending' | 'hidden';
        adminReply?: string;
      };
      const updated = moderateReview(req.params.id, { status, adminReply });
      if (!updated) {
        res.status(404).json({ error: 'Review not found.' });
        return;
      }
      const actor = req.adminUser!;
      recordAuditLog({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'moderate_review',
        targetType: 'review',
        targetId: updated.id,
        details: `${updated.status} on ${updated.productSlug}`,
      });
      res.json({ review: updated });
    },
  );

  router.delete('/reviews/:id', requireAdminRole(['super_admin', 'store_manager']), (req, res) => {
    if (!deleteReview(req.params.id)) {
      res.status(404).json({ error: 'Review not found.' });
      return;
    }
    res.json({ deletedId: req.params.id });
  });

  // -------------------------------------------------------------------------
  // 9. AI MANAGEMENT & ADMIN AI BUSINESS ASSISTANT
  // -------------------------------------------------------------------------

  router.get('/ai', requireAdminRole(['super_admin', 'store_manager', 'support_agent']), (_req, res) => {
    res.json({
      agents: listAIAgents(),
      analytics: getAIAnalyticsSummary(),
    });
  });

  router.patch('/ai/agents/:agentKey', requireAdminRole(['super_admin', 'store_manager']), (req, res) => {
    const updated = updateAIAgent(req.params.agentKey, req.body as Partial<AIAgentConfig>);
    if (!updated) {
      res.status(404).json({ error: 'AI Agent not found.' });
      return;
    }
    const actor = req.adminUser!;
    recordAuditLog({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'update_ai_agent',
      targetType: 'ai_agent',
      targetId: updated.agentKey,
      details: `${updated.name} (enabled=${updated.enabled})`,
    });
    res.json({ agent: updated });
  });

  router.post('/ai/sync-catalog', requireAdminRole(['super_admin', 'store_manager']), (req, res) => {
    const products = listProducts({ includeUnpublished: false });
    const cms = getCmsContent();
    const actor = req.adminUser!;
    recordAuditLog({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'sync_ai_catalog',
      targetType: 'ai_knowledge',
      details: `Indexed ${products.length} published SKUs and ${cms.faqs.length} FAQs`,
    });
    res.json({
      synced: true,
      publishedCount: products.length,
      faqCount: cms.faqs.length,
      syncedAt: new Date().toISOString(),
    });
  });

  router.post('/ai-assistant', requireAdminRole(ALL_ROLES), async (req, res) => {
    const { question, history = [] } = req.body as {
      question?: string;
      history?: { role: 'user' | 'assistant'; text: string }[];
    };

    if (!question?.trim()) {
      res.status(400).json({ error: 'Please enter an analytics or operations question.' });
      return;
    }

    try {
      const ai = getGeminiClient();
      const overview = buildAdminOverview();
      const products = listProducts({ includeUnpublished: true });
      const orders = listOrders(150);
      const reviews = listAllReviewsForAdmin().slice(0, 14);
      const aiStats = getAIAnalyticsSummary();

      const couponUsage: Record<string, number> = {};
      for (const ord of orders) {
        if (ord.couponCode) {
          couponUsage[ord.couponCode] = (couponUsage[ord.couponCode] || 0) + 1;
        }
      }

      const recentReviewSnippets = reviews
        .map((r) => `[${r.productSlug}] ${r.rating}/5 (${r.status}): "${r.title} - ${r.comment}"`)
        .join('\n');

      const systemInstruction = `${AI_MODULE_GUIDELINES.adminAssistant}

LIVE STORE TELEMETRY (USE ONLY THESE EXACT NUMBERS):
- Total Orders: ${overview.totalOrders} (Pending/Active: ${overview.pendingOrdersCount} | Delivered: ${overview.deliveredOrdersCount})
- Total Net Revenue: PKR ${overview.totalRevenuePkr.toLocaleString('en-PK')}
- Sales Windows: Daily PKR ${overview.salesWindows.dailyPkr.toLocaleString('en-PK')} | Weekly PKR ${overview.salesWindows.weeklyPkr.toLocaleString('en-PK')} | Monthly PKR ${overview.salesWindows.monthlyPkr.toLocaleString('en-PK')}
- Total Registered Customers: ${overview.totalCustomers}
- Department Split: Skincare PKR ${overview.departmentSplit.skincareRevenuePkr.toLocaleString('en-PK')} | Haircare PKR ${overview.departmentSplit.haircareRevenuePkr.toLocaleString('en-PK')}
- Low Stock Alerts: ${
        overview.lowStockProducts.length > 0
          ? overview.lowStockProducts.map((p) => `${p.name} (${p.stock} left)`).join(', ')
          : 'None — all SKUs above threshold'
      }
- Top Selling Products: ${
        overview.topSellingProducts.length > 0
          ? overview.topSellingProducts.map((t) => `${t.name}: ${t.unitsSold} units (PKR ${t.revenuePkr})`).join(' | ')
          : 'No completed order volume yet'
      }
- AI Beauty Expert Telemetry: ${aiStats.totalConversations} chats, ${aiStats.totalImageAnalyses} photo scans, ${aiStats.aiAssistedAddToCart} AI bag adds, ${aiStats.failedResponses} errors
- Coupon Usage: ${Object.keys(couponUsage).length > 0 ? JSON.stringify(couponUsage) : 'No coupons redeemed yet'}
- Recent Customer Reviews:\n${recentReviewSnippets || 'None yet'}
- Catalog Inventory:\n${buildCatalogSummaryForPrompt(products)}`;

      const contents: Content[] = [
        ...history.slice(-8).map((h) => ({
          role: (h.role === 'assistant' ? 'model' : 'user') as 'model' | 'user',
          parts: [{ text: h.text }],
        })),
        { role: 'user', parts: [{ text: question.trim() }] },
      ];

      const response = await withGeminiRetry(
        (signal) =>
          ai.models.generateContent({
            model: GEMINI_MODEL,
            contents,
            config: { abortSignal: signal, systemInstruction },
          }),
        { timeoutMs: 35_000, maxRetries: 2 },
      );

      const replyText = (response.text || '').trim();
      if (!replyText) {
        throw new AIServiceError('Empty admin assistant reply.', 502, 'EMPTY_AI_RESPONSE');
      }

      res.json({ reply: replyText });
    } catch (error) {
      const formatted = formatGeminiError(error, 'POST /api/admin/ai-assistant');
      res.status(formatted.status).json({ error: formatted.message, code: formatted.code });
    }
  });

  // -------------------------------------------------------------------------
  // 10. WEBSITE CONTENT CMS
  // -------------------------------------------------------------------------

  router.get('/content', requireAdminRole(['super_admin', 'store_manager', 'support_agent']), (_req, res) => {
    res.json({ content: getCmsContent() });
  });

  router.put('/content', requireAdminRole(['super_admin', 'store_manager']), (req, res) => {
    const updated = updateCmsContent(req.body as Partial<WebsiteContentCMS>);
    const actor = req.adminUser!;
    recordAuditLog({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'update_cms_content',
      targetType: 'cms_content',
    });
    res.json({ content: updated });
  });

  // -------------------------------------------------------------------------
  // 11. ANALYTICS & REPORTS + CSV EXPORT
  // -------------------------------------------------------------------------

  router.get('/reports', requireAdminRole(ALL_ROLES), (req, res) => {
    const range = (typeof req.query.range === 'string' ? req.query.range : '30d') as
      | '7d'
      | '30d'
      | '90d'
      | '365d'
      | 'all';
    const department = typeof req.query.department === 'string' ? req.query.department : 'all';
    const category = typeof req.query.category === 'string' ? req.query.category : 'all';
    res.json({ report: buildAnalyticsReport({ range, department, category }) });
  });

  router.get('/reports/export', requireAdminRole(['super_admin', 'store_manager', 'inventory_manager']), (req, res) => {
    const kind = typeof req.query.kind === 'string' ? req.query.kind : 'orders';
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

    if (kind === 'inventory') {
      const rows = listProducts({ includeUnpublished: true });
      const header = ['SKU', 'Name', 'Department', 'Category', 'Status', 'Price_PKR', 'Discount_PKR', 'Stock', 'Rating'];
      const csv = [
        header.join(','),
        ...rows.map((p) =>
          [p.sku || '', p.name, p.department, p.category, p.status || 'published', p.pricePkr, p.discountPricePkr || '', p.stock, p.rating]
            .map(esc)
            .join(','),
        ),
      ].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="aurelia-inventory-report.csv"');
      res.send(csv);
      return;
    }

    const orders = listOrders(1000);
    const header = ['OrderNumber', 'Date', 'Customer', 'Phone', 'City', 'PaymentMethod', 'Status', 'Coupon', 'Discount_PKR', 'Shipping_PKR', 'Total_PKR'];
    const csv = [
      header.join(','),
      ...orders.map((o) =>
        [
          o.orderNumber,
          o.createdAt,
          o.customerName,
          o.customerPhone,
          o.shippingAddress.city,
          o.paymentMethod,
          o.status,
          o.couponCode || '',
          o.discountPkr,
          o.shippingPkr,
          o.totalPkr,
        ]
          .map(esc)
          .join(','),
      ),
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="aurelia-orders-report.csv"');
    res.send(csv);
  });

  // -------------------------------------------------------------------------
  // 12. CUSTOMER SUPPORT INBOX
  // -------------------------------------------------------------------------

  router.get('/support', requireAdminRole(['super_admin', 'store_manager', 'support_agent']), (_req, res) => {
    const settings = getStoreSettings();
    res.json({
      tickets: listSupportTickets(),
      escalationRules: {
        keywords: settings.aiEscalationKeywords,
        autoEscalateOnLowConfidence: settings.aiAutoEscalateOnLowConfidence,
      },
    });
  });

  router.patch(
    '/support/:id',
    requireAdminRole(['super_admin', 'store_manager', 'support_agent']),
    (req, res) => {
      const actor = req.adminUser!;
      const body = req.body as {
        status?: SupportTicket['status'];
        priority?: SupportTicket['priority'];
        assignedAgentEmail?: string;
        replyText?: string;
      };
      const updated = updateSupportTicket(req.params.id, {
        ...body,
        replySenderName: `${actor.name} (${actor.role.replace('_', ' ')})`,
      });
      if (!updated) {
        res.status(404).json({ error: 'Support ticket not found.' });
        return;
      }
      recordAuditLog({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'update_support_ticket',
        targetType: 'support_ticket',
        targetId: updated.id,
        details: `${updated.ticketNumber} (${updated.status})`,
      });
      res.json({ ticket: updated });
    },
  );

  // -------------------------------------------------------------------------
  // 13. NOTIFICATIONS & WHATSAPP MANAGEMENT
  // -------------------------------------------------------------------------

  router.get('/notifications', requireAdminRole(ALL_ROLES), (_req, res) => {
    res.json({ notifications: listNotifications(40) });
  });

  router.patch('/notifications/read', requireAdminRole(ALL_ROLES), (req, res) => {
    const { id } = req.body as { id?: string };
    markNotificationsRead(id);
    res.json({ notifications: listNotifications(40) });
  });

  router.get('/whatsapp', requireAdminRole(['super_admin', 'store_manager', 'support_agent']), (_req, res) => {
    const settings = getStoreSettings();
    res.json({
      config: {
        whatsappNumber: settings.whatsappNumber,
        whatsappEnabled: settings.whatsappEnabled,
        whatsappWelcomeMessage: settings.whatsappWelcomeMessage,
        whatsappOrderTemplate: settings.whatsappOrderTemplate,
        whatsappSupportMessage: settings.whatsappSupportMessage,
      },
      referrals: listWhatsAppReferrals(50),
    });
  });

  router.put('/whatsapp', requireAdminRole(['super_admin', 'store_manager']), (req, res) => {
    const updated = updateStoreSettings(req.body as Partial<StoreSettingsFull>);
    const actor = req.adminUser!;
    recordAuditLog({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'update_whatsapp_config',
      targetType: 'settings',
    });
    res.json({
      config: {
        whatsappNumber: updated.whatsappNumber,
        whatsappEnabled: updated.whatsappEnabled,
        whatsappWelcomeMessage: updated.whatsappWelcomeMessage,
        whatsappOrderTemplate: updated.whatsappOrderTemplate,
        whatsappSupportMessage: updated.whatsappSupportMessage,
      },
    });
  });

  // -------------------------------------------------------------------------
  // 14. STORE SETTINGS, ADMIN TEAM RBAC & AUDIT LOGS
  // -------------------------------------------------------------------------

  router.get('/settings', requireAdminRole(ALL_ROLES), (_req, res) => {
    res.json({ settings: getStoreSettings() });
  });

  router.put('/settings', requireAdminRole(['super_admin', 'store_manager']), (req, res) => {
    const updated = updateStoreSettings(req.body as Partial<StoreSettingsFull>);
    const actor = req.adminUser!;
    recordAuditLog({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'update_store_settings',
      targetType: 'settings',
    });
    res.json({ settings: updated });
  });

  router.get('/team', requireAdminRole(['super_admin']), (_req, res) => {
    res.json({
      users: listAdminUsers(),
      auditLogs: listAuditLogs(120),
    });
  });

  router.post('/team', requireAdminRole(['super_admin']), (req, res) => {
    const { name, email, role, password } = req.body as {
      name?: string;
      email?: string;
      role?: AdminRole;
      password?: string;
    };
    if (!name?.trim() || !email?.trim() || !role || !ALL_ROLES.includes(role) || !password || password.length < 8) {
      res.status(400).json({ error: 'Name, email, valid role, and password (min 8 chars) are required.' });
      return;
    }
    if (findAdminUserByEmail(email)) {
      res.status(409).json({ error: 'An admin user with this email already exists.' });
      return;
    }
    const created = createAdminUser({ name, email, role, password });
    const actor = req.adminUser!;
    recordAuditLog({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'create_admin_user',
      targetType: 'admin_user',
      targetId: created.id,
      details: `${created.email} (${created.role})`,
    });
    res.status(201).json({ user: created });
  });

  router.patch('/team/:id', requireAdminRole(['super_admin']), (req, res) => {
    const updated = updateAdminUser(
      req.params.id,
      req.body as { name?: string; role?: AdminRole; isActive?: boolean; password?: string },
    );
    if (!updated) {
      res.status(404).json({ error: 'Team member not found.' });
      return;
    }
    const actor = req.adminUser!;
    recordAuditLog({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'update_admin_user',
      targetType: 'admin_user',
      targetId: updated.id,
      details: `${updated.email} (role=${updated.role}, active=${updated.isActive})`,
    });
    res.json({ user: updated });
  });

  router.delete('/team/:id', requireAdminRole(['super_admin']), (req, res) => {
    const actor = req.adminUser!;
    if (actor.id === req.params.id) {
      res.status(400).json({ error: 'You cannot delete your own active session account.' });
      return;
    }
    if (!deleteAdminUser(req.params.id)) {
      res.status(404).json({ error: 'Team member not found.' });
      return;
    }
    recordAuditLog({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'delete_admin_user',
      targetType: 'admin_user',
      targetId: req.params.id,
    });
    res.json({ deletedId: req.params.id });
  });

  return router;
}
