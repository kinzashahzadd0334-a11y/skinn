import type {
  AIAgentConfig,
  AdminRole,
  AdminUser,
  CategoryRecord,
  CouponRecord,
  CustomerProfile,
  OrderRecord,
  OrderStatus,
  Product,
  Product3DConfig,
  StoreSettingsFull,
  SupportTicket,
  WebsiteContentCMS,
} from '../types/store';
import {
  LocalDatabaseError,
  adjustProductStockLocal,
  buildAdminOverviewLocal,
  buildAnalyticsReportLocal,
  countAdminUsersLocal,
  createAdminUserLocal,
  createCategoryLocal,
  createCouponLocal,
  createProductLocal,
  deleteAdminUserLocal,
  deleteCategoryLocal,
  deleteCouponLocal,
  deleteProductLocal,
  deleteReviewLocal,
  findAdminUserByEmailLocal,
  findAdminUserByIdLocal,
  getAIAnalyticsSummaryLocal,
  getCmsContentLocal,
  getStoreSettingsLocal,
  listAIAgentsLocal,
  listAdminUsersLocal,
  listAllReviewsForAdminLocal,
  listAuditLogsLocal,
  listCategoriesLocal,
  listCouponsLocal,
  listCustomerSummariesLocal,
  listNotificationsLocal,
  listOrdersLocal,
  listProductsLocal,
  listStockHistoryLocal,
  listSupportTicketsLocal,
  listWhatsAppReferralsLocal,
  markNotificationsReadLocal,
  moderateReviewLocal,
  recordAuditLogLocal,
  updateAIAgentLocal,
  updateAdminUserLocal,
  updateCategoryLocal,
  updateCmsContentLocal,
  updateCouponLocal,
  updateCustomerProfileLocal,
  updateOrderInternalNotesLocal,
  updateOrderStatusLocal,
  updateProduct3DConfigLocal,
  updateProductLocal,
  updateStoreSettingsLocal,
  updateSupportTicketLocal,
  verifyPasswordLocal,
} from './localDatabase';
import { getSavedAdminSession, saveAdminSession } from './localPrefs';

export interface LocalAdminSessionUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
}

const ALL_ROLES: AdminRole[] = ['super_admin', 'store_manager', 'inventory_manager', 'support_agent'];

async function resolveAdminActor(token: string): Promise<LocalAdminSessionUser> {
  if (!token) {
    throw new LocalDatabaseError('Administrator authentication required.', 401, 'UNAUTHORIZED');
  }

  if (token.startsWith('local-adm:')) {
    const id = token.slice('local-adm:'.length);
    const user = await findAdminUserByIdLocal(id);
    if (!user || !user.isActive) {
      throw new LocalDatabaseError('Admin account is inactive or no longer exists.', 401, 'UNAUTHORIZED');
    }
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }

  const saved = getSavedAdminSession();
  if (saved && saved.token === token && saved.admin?.id === 'env-super-admin') {
    return saved.admin;
  }

  throw new LocalDatabaseError('Invalid or expired administrator session. Please sign in again.', 401, 'UNAUTHORIZED');
}

function assertRole(actor: LocalAdminSessionUser, allowed: AdminRole[]): void {
  if (!allowed.includes(actor.role)) {
    throw new LocalDatabaseError(
      `Access denied. Role "${actor.role}" is not permitted to perform this action.`,
      403,
      'FORBIDDEN',
    );
  }
}

export async function validateStoredAdminSessionLocal(): Promise<{
  token: string;
  admin: LocalAdminSessionUser;
} | null> {
  const saved = getSavedAdminSession();
  if (!saved) return null;
  try {
    const actor = await resolveAdminActor(saved.token);
    return { token: saved.token, admin: actor };
  } catch {
    return null;
  }
}

export async function getAdminAuthStatusLocal(): Promise<{
  needsInitialSetup: boolean;
  hasDbAdmins: boolean;
  envBootstrapAvailable: boolean;
}> {
  const count = await countAdminUsersLocal();
  if (count > 0) {
    return { needsInitialSetup: false, hasDbAdmins: true, envBootstrapAvailable: false };
  }
  try {
    const res = await fetch('/api/admin/auth/status');
    if (res.ok) {
      const data = (await res.json()) as { envBootstrapAvailable?: boolean };
      const envAvail = Boolean(data.envBootstrapAvailable);
      return { needsInitialSetup: !envAvail, hasDbAdmins: false, envBootstrapAvailable: envAvail };
    }
  } catch {
    // Offline/local fallback
  }
  return { needsInitialSetup: true, hasDbAdmins: false, envBootstrapAvailable: false };
}

export async function setupInitialAdminLocal(input: {
  name: string;
  email: string;
  password: string;
}): Promise<{ token: string; admin: LocalAdminSessionUser }> {
  const count = await countAdminUsersLocal();
  if (count > 0) {
    throw new LocalDatabaseError('Initial Super Admin account has already been configured.', 409, 'ALREADY_SETUP');
  }
  const created = await createAdminUserLocal({
    name: input.name,
    email: input.email,
    role: 'super_admin',
    password: input.password,
  });
  await updateAdminUserLocal(created.id, { lastLoginAt: new Date().toISOString() });
  const admin: LocalAdminSessionUser = {
    id: created.id,
    name: created.name,
    email: created.email,
    role: created.role,
  };
  await recordAuditLogLocal({
    actorId: admin.id,
    actorEmail: admin.email,
    actorRole: admin.role,
    action: 'admin_setup',
    targetType: 'admin_user',
    targetId: admin.id,
    details: 'Initial Super Admin setup completed (IndexedDB)',
  });
  const token = `local-adm:${admin.id}`;
  saveAdminSession({ token, admin, savedAt: new Date().toISOString() });
  return { token, admin };
}

export async function loginAdminLocal(
  email: string,
  password: string,
): Promise<{ token: string; admin: LocalAdminSessionUser }> {
  if (!email.trim() || !password) {
    throw new LocalDatabaseError('Admin email and password are required.', 400, 'VALIDATION_ERROR');
  }
  const dbAdmin = await findAdminUserByEmailLocal(email);
  if (dbAdmin) {
    if (!dbAdmin.isActive) {
      throw new LocalDatabaseError('This administrator account has been deactivated.', 403, 'ACCOUNT_DISABLED');
    }
    const ok = await verifyPasswordLocal(password, dbAdmin.passwordSalt, dbAdmin.passwordHash);
    if (!ok) {
      throw new LocalDatabaseError('Invalid administrator credentials.', 401, 'INVALID_CREDENTIALS');
    }
    await updateAdminUserLocal(dbAdmin.id, { lastLoginAt: new Date().toISOString() });
    const admin: LocalAdminSessionUser = {
      id: dbAdmin.id,
      name: dbAdmin.name,
      email: dbAdmin.email,
      role: dbAdmin.role,
    };
    await recordAuditLogLocal({
      actorId: admin.id,
      actorEmail: admin.email,
      actorRole: admin.role,
      action: 'admin_login',
      targetType: 'session',
    });
    const token = `local-adm:${admin.id}`;
    saveAdminSession({ token, admin, savedAt: new Date().toISOString() });
    return { token, admin };
  }

  // Fallback for env-configured super admin if any
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    });
    const data = (await res.json()) as { token?: string; admin?: LocalAdminSessionUser; error?: string };
    if (res.ok && data.token && data.admin) {
      saveAdminSession({ token: data.token, admin: data.admin, savedAt: new Date().toISOString() });
      return { token: data.token, admin: data.admin };
    }
  } catch {
    // Ignore network fallback failure
  }

  throw new LocalDatabaseError('Invalid administrator credentials.', 401, 'INVALID_CREDENTIALS');
}

function parseBody(body: BodyInit | null | undefined): Record<string, unknown> {
  if (!body || typeof body !== 'string') return {};
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function dispatchAdminLocalApi<T>(
  url: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const actor = await resolveAdminActor(token);
  const method = (options.method || 'GET').toUpperCase();
  const parsedUrl = new URL(url, 'http://localhost');
  const pathname = parsedUrl.pathname.replace(/^\/api\/admin/, '') || '/';
  const body = parseBody(options.body);

  // 1. Overview
  if (method === 'GET' && pathname === '/overview') {
    assertRole(actor, ALL_ROLES);
    const overview = await buildAdminOverviewLocal();
    return { overview } as T;
  }

  // 2. Global search
  if (method === 'GET' && pathname === '/search') {
    assertRole(actor, ALL_ROLES);
    const q = (parsedUrl.searchParams.get('q') || '').trim().toLowerCase();
    if (!q) return { products: [], orders: [], customers: [] } as T;
    const [allProds, allOrds, allCusts] = await Promise.all([
      listProductsLocal({ includeUnpublished: true }),
      listOrdersLocal(200),
      listCustomerSummariesLocal(),
    ]);
    return {
      products: allProds
        .filter((p) => `${p.name} ${p.sku || ''} ${p.category} ${p.slug}`.toLowerCase().includes(q))
        .slice(0, 6),
      orders: allOrds
        .filter((o) => `${o.orderNumber} ${o.customerName} ${o.customerPhone}`.toLowerCase().includes(q))
        .slice(0, 6),
      customers: allCusts
        .filter((c) => `${c.name} ${c.email} ${c.phone}`.toLowerCase().includes(q))
        .slice(0, 6),
    } as T;
  }

  // 3. Notifications
  if (method === 'GET' && pathname === '/notifications') {
    assertRole(actor, ALL_ROLES);
    return { notifications: await listNotificationsLocal(40) } as T;
  }
  if (method === 'PATCH' && pathname === '/notifications/read') {
    assertRole(actor, ALL_ROLES);
    const id = typeof body.id === 'string' ? body.id : undefined;
    return { notifications: await markNotificationsReadLocal(id) } as T;
  }

  // 4. Products
  if (method === 'GET' && pathname === '/products') {
    assertRole(actor, ALL_ROLES);
    return { products: await listProductsLocal({ includeUnpublished: true, includeReviews: true }) } as T;
  }
  if (method === 'POST' && pathname === '/products') {
    assertRole(actor, ['super_admin', 'store_manager', 'inventory_manager']);
    const product = await createProductLocal(body as Partial<Product>);
    await recordAuditLogLocal({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'create_product',
      targetType: 'product',
      targetId: product.id,
      details: product.name,
    });
    return { product } as T;
  }
  const prod3dMatch = pathname.match(/^\/products\/([^/]+)\/3d-config$/);
  if (method === 'PATCH' && prod3dMatch) {
    assertRole(actor, ['super_admin', 'store_manager', 'inventory_manager']);
    const id = decodeURIComponent(prod3dMatch[1]);
    const product = await updateProduct3DConfigLocal(id, body as unknown as Product3DConfig);
    if (!product) throw new LocalDatabaseError('Product not found.', 404, 'NOT_FOUND');
    await recordAuditLogLocal({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'update_product_3d',
      targetType: 'product',
      targetId: id,
      details: `${product.name} (${(body as unknown as Product3DConfig).mode})`,
    });
    return { product } as T;
  }
  const prodIdMatch = pathname.match(/^\/products\/([^/]+)$/);
  if (prodIdMatch) {
    const id = decodeURIComponent(prodIdMatch[1]);
    if (method === 'PATCH') {
      assertRole(actor, ['super_admin', 'store_manager', 'inventory_manager']);
      const product = await updateProductLocal(id, body as Partial<Product>);
      if (!product) throw new LocalDatabaseError('Product not found.', 404, 'NOT_FOUND');
      await recordAuditLogLocal({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'update_product',
        targetType: 'product',
        targetId: id,
        details: product.name,
      });
      return { product } as T;
    }
    if (method === 'DELETE') {
      assertRole(actor, ['super_admin', 'store_manager']);
      const ok = await deleteProductLocal(id);
      if (!ok) throw new LocalDatabaseError('Product not found.', 404, 'NOT_FOUND');
      await recordAuditLogLocal({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'delete_product',
        targetType: 'product',
        targetId: id,
      });
      return { deletedId: id } as T;
    }
  }

  // 5. Categories
  if (method === 'GET' && pathname === '/categories') {
    assertRole(actor, ALL_ROLES);
    return { categories: await listCategoriesLocal(true) } as T;
  }
  if (method === 'POST' && pathname === '/categories') {
    assertRole(actor, ['super_admin', 'store_manager', 'inventory_manager']);
    const category = await createCategoryLocal(body as unknown as Parameters<typeof createCategoryLocal>[0]);
    await recordAuditLogLocal({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'create_category',
      targetType: 'category',
      targetId: category.id,
      details: `${category.name} (${category.department})`,
    });
    return { category } as T;
  }
  const catIdMatch = pathname.match(/^\/categories\/([^/]+)$/);
  if (catIdMatch) {
    const id = decodeURIComponent(catIdMatch[1]);
    if (method === 'PATCH') {
      assertRole(actor, ['super_admin', 'store_manager', 'inventory_manager']);
      const category = await updateCategoryLocal(id, body as Partial<CategoryRecord>);
      if (!category) throw new LocalDatabaseError('Category not found.', 404, 'NOT_FOUND');
      await recordAuditLogLocal({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'update_category',
        targetType: 'category',
        targetId: id,
        details: category.name,
      });
      return { category } as T;
    }
    if (method === 'DELETE') {
      assertRole(actor, ['super_admin', 'store_manager']);
      const ok = await deleteCategoryLocal(id);
      if (!ok) throw new LocalDatabaseError('Category not found.', 404, 'NOT_FOUND');
      await recordAuditLogLocal({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'delete_category',
        targetType: 'category',
        targetId: id,
      });
      return { deletedId: id } as T;
    }
  }

  // 6. Inventory
  if (method === 'GET' && pathname === '/inventory') {
    assertRole(actor, ['super_admin', 'store_manager', 'inventory_manager']);
    const [products, history, settings] = await Promise.all([
      listProductsLocal({ includeUnpublished: true }),
      listStockHistoryLocal(120),
      getStoreSettingsLocal(),
    ]);
    return { products, history, lowStockThreshold: settings.lowStockThreshold } as T;
  }
  if (method === 'POST' && pathname === '/inventory/adjust') {
    assertRole(actor, ['super_admin', 'store_manager', 'inventory_manager']);
    const res = await adjustProductStockLocal({
      productId: String(body.productId || ''),
      delta: typeof body.delta === 'number' ? body.delta : undefined,
      setStock: typeof body.setStock === 'number' ? body.setStock : undefined,
      reason: String(body.reason || ''),
      actorEmail: actor.email,
    });
    if (!res) throw new LocalDatabaseError('Product not found.', 404, 'NOT_FOUND');
    await recordAuditLogLocal({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'adjust_inventory',
      targetType: 'product',
      targetId: res.product.id,
      details: `${res.product.name}: ${res.entry.previousStock} → ${res.entry.newStock} (${res.entry.reason})`,
    });
    return res as T;
  }

  // 7. Orders
  if (method === 'GET' && pathname === '/orders') {
    assertRole(actor, ['super_admin', 'store_manager', 'support_agent']);
    return { orders: await listOrdersLocal(500) } as T;
  }
  const orderStatusMatch = pathname.match(/^\/orders\/([^/]+)\/status$/);
  if (method === 'PATCH' && orderStatusMatch) {
    assertRole(actor, ['super_admin', 'store_manager', 'support_agent']);
    const id = decodeURIComponent(orderStatusMatch[1]);
    const order = await updateOrderStatusLocal({
      id,
      status: body.status as OrderStatus,
      note: typeof body.note === 'string' ? body.note : undefined,
      actorEmail: actor.email,
    });
    if (!order) throw new LocalDatabaseError('Order not found.', 404, 'NOT_FOUND');
    await recordAuditLogLocal({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'update_order_status',
      targetType: 'order',
      targetId: id,
      details: `${order.orderNumber} → ${order.status}`,
    });
    return { order } as T;
  }
  const orderNotesMatch = pathname.match(/^\/orders\/([^/]+)\/notes$/);
  if (method === 'PATCH' && orderNotesMatch) {
    assertRole(actor, ['super_admin', 'store_manager', 'support_agent']);
    const id = decodeURIComponent(orderNotesMatch[1]);
    const order = await updateOrderInternalNotesLocal(id, String(body.internalNotes || ''));
    if (!order) throw new LocalDatabaseError('Order not found.', 404, 'NOT_FOUND');
    return { order } as T;
  }

  // 8. Customers
  if (method === 'GET' && pathname === '/customers') {
    assertRole(actor, ['super_admin', 'store_manager', 'support_agent']);
    return { customers: await listCustomerSummariesLocal() } as T;
  }
  const custMatch = pathname.match(/^\/customers\/([^/]+)$/);
  if (method === 'PATCH' && custMatch) {
    assertRole(actor, ['super_admin', 'store_manager']);
    const id = decodeURIComponent(custMatch[1]);
    const updated = await updateCustomerProfileLocal(id, body as Partial<CustomerProfile>);
    if (!updated) throw new LocalDatabaseError('Customer not found.', 404, 'NOT_FOUND');
    await recordAuditLogLocal({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'update_customer_status',
      targetType: 'customer',
      targetId: id,
      details: `${updated.email} (active=${updated.isActive !== false})`,
    });
    return { customer: updated } as T;
  }

  // 9. Coupons
  if (method === 'GET' && pathname === '/coupons') {
    assertRole(actor, ['super_admin', 'store_manager']);
    return { coupons: await listCouponsLocal(false) } as T;
  }
  if (method === 'POST' && pathname === '/coupons') {
    assertRole(actor, ['super_admin', 'store_manager']);
    const coupon = await createCouponLocal(body as Partial<CouponRecord>);
    await recordAuditLogLocal({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'create_coupon',
      targetType: 'coupon',
      targetId: coupon.id,
      details: coupon.code,
    });
    return { coupon } as T;
  }
  const cpnMatch = pathname.match(/^\/coupons\/([^/]+)$/);
  if (cpnMatch) {
    const id = decodeURIComponent(cpnMatch[1]);
    if (method === 'PATCH') {
      assertRole(actor, ['super_admin', 'store_manager']);
      const coupon = await updateCouponLocal(id, body as Partial<CouponRecord>);
      if (!coupon) throw new LocalDatabaseError('Coupon not found.', 404, 'NOT_FOUND');
      await recordAuditLogLocal({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'update_coupon',
        targetType: 'coupon',
        targetId: id,
        details: coupon.code,
      });
      return { coupon } as T;
    }
    if (method === 'DELETE') {
      assertRole(actor, ['super_admin', 'store_manager']);
      const ok = await deleteCouponLocal(id);
      if (!ok) throw new LocalDatabaseError('Coupon not found.', 404, 'NOT_FOUND');
      await recordAuditLogLocal({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'delete_coupon',
        targetType: 'coupon',
        targetId: id,
      });
      return { deletedId: id } as T;
    }
  }

  // 10. Reviews
  if (method === 'GET' && pathname === '/reviews') {
    assertRole(actor, ['super_admin', 'store_manager', 'support_agent']);
    return { reviews: await listAllReviewsForAdminLocal() } as T;
  }
  const revMatch = pathname.match(/^\/reviews\/([^/]+)$/);
  if (revMatch) {
    const id = decodeURIComponent(revMatch[1]);
    if (method === 'PATCH') {
      assertRole(actor, ['super_admin', 'store_manager', 'support_agent']);
      const review = await moderateReviewLocal(id, body as { status?: 'approved' | 'pending' | 'hidden'; adminReply?: string });
      if (!review) throw new LocalDatabaseError('Review not found.', 404, 'NOT_FOUND');
      await recordAuditLogLocal({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'moderate_review',
        targetType: 'review',
        targetId: id,
        details: `${review.productSlug} (${review.status})`,
      });
      return { review } as T;
    }
    if (method === 'DELETE') {
      assertRole(actor, ['super_admin', 'store_manager']);
      const ok = await deleteReviewLocal(id);
      if (!ok) throw new LocalDatabaseError('Review not found.', 404, 'NOT_FOUND');
      await recordAuditLogLocal({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'delete_review',
        targetType: 'review',
        targetId: id,
      });
      return { deletedId: id } as T;
    }
  }

  // 11. AI Management & Admin AI Copilot
  if (method === 'GET' && pathname === '/ai') {
    assertRole(actor, ['super_admin', 'store_manager', 'support_agent']);
    let serverConfigured = true;
    try {
      const h = await fetch('/api/health');
      if (h.ok) {
        const hd = (await h.json()) as { geminiConfigured?: boolean };
        if (typeof hd.geminiConfigured === 'boolean') serverConfigured = hd.geminiConfigured;
      }
    } catch {
      // Ignore health check errors
    }
    const [agents, analytics] = await Promise.all([
      listAIAgentsLocal(),
      getAIAnalyticsSummaryLocal(serverConfigured),
    ]);
    return { agents, analytics } as T;
  }
  const agentMatch = pathname.match(/^\/ai\/agents\/([^/]+)$/);
  if (method === 'PATCH' && agentMatch) {
    assertRole(actor, ['super_admin', 'store_manager']);
    const agentKey = decodeURIComponent(agentMatch[1]);
    const agent = await updateAIAgentLocal(agentKey, body as Partial<AIAgentConfig>);
    if (!agent) throw new LocalDatabaseError('AI Agent module not found.', 404, 'NOT_FOUND');
    await recordAuditLogLocal({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'update_ai_agent',
      targetType: 'ai_agent',
      targetId: agentKey,
      details: `${agent.name} (enabled=${agent.enabled})`,
    });
    return { agent } as T;
  }
  if (method === 'POST' && pathname === '/ai/sync-catalog') {
    assertRole(actor, ['super_admin', 'store_manager']);
    const products = await listProductsLocal({ includeUnpublished: false });
    await recordAuditLogLocal({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'sync_ai_catalog',
      targetType: 'ai',
      details: `Indexed ${products.length} published products for AI`,
    });
    return {
      syncedProducts: products.length,
      syncedAt: new Date().toISOString(),
    } as T;
  }
  if (method === 'POST' && pathname === '/ai-assistant') {
    assertRole(actor, ALL_ROLES);
    const [overview, products, orders, reviews, aiStats] = await Promise.all([
      buildAdminOverviewLocal(),
      listProductsLocal({ includeUnpublished: true }),
      listOrdersLocal(150),
      listAllReviewsForAdminLocal(),
      getAIAnalyticsSummaryLocal(),
    ]);
    const res = await fetch('/api/ai/admin-copilot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: body.question,
        history: body.history || [],
        liveTelemetry: {
          overview,
          products,
          orders,
          reviews: reviews.slice(0, 14),
          aiStats,
        },
      }),
    });
    const text = await res.text();
    let parsed: { reply?: string; error?: string } = {};
    try {
      parsed = text ? (JSON.parse(text) as { reply?: string; error?: string }) : {};
    } catch {
      throw new LocalDatabaseError('Unexpected response from AI Copilot.', 502, 'AI_RESPONSE_ERROR');
    }
    if (!res.ok) {
      throw new LocalDatabaseError(parsed.error || `AI Copilot request failed (${res.status}).`, res.status, 'AI_ERROR');
    }
    return parsed as T;
  }

  // 12. Content CMS
  if (method === 'GET' && pathname === '/content') {
    assertRole(actor, ['super_admin', 'store_manager', 'support_agent']);
    return { content: await getCmsContentLocal() } as T;
  }
  if (method === 'PUT' && pathname === '/content') {
    assertRole(actor, ['super_admin', 'store_manager']);
    const content = await updateCmsContentLocal(body as Partial<WebsiteContentCMS>);
    await recordAuditLogLocal({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'update_cms_content',
      targetType: 'cms_content',
    });
    return { content } as T;
  }

  // 13. Analytics & Reports
  if (method === 'GET' && pathname === '/reports') {
    assertRole(actor, ALL_ROLES);
    const range = (parsedUrl.searchParams.get('range') || '30d') as '7d' | '30d' | '90d' | '365d' | 'all';
    const department = parsedUrl.searchParams.get('department') || 'all';
    const category = parsedUrl.searchParams.get('category') || 'all';
    return { report: await buildAnalyticsReportLocal({ range, department, category }) } as T;
  }

  // 14. Customer Support
  if (method === 'GET' && pathname === '/support') {
    assertRole(actor, ['super_admin', 'store_manager', 'support_agent']);
    const [tickets, settings] = await Promise.all([listSupportTicketsLocal(), getStoreSettingsLocal()]);
    return {
      tickets,
      escalationRules: {
        keywords: settings.aiEscalationKeywords,
        autoEscalateOnLowConfidence: settings.aiAutoEscalateOnLowConfidence,
      },
    } as T;
  }
  const tktMatch = pathname.match(/^\/support\/([^/]+)$/);
  if (method === 'PATCH' && tktMatch) {
    assertRole(actor, ['super_admin', 'store_manager', 'support_agent']);
    const id = decodeURIComponent(tktMatch[1]);
    const ticket = await updateSupportTicketLocal(id, {
      ...(body as Partial<SupportTicket> & { replyText?: string }),
      replySenderName: `${actor.name} (${actor.role.replace('_', ' ')})`,
    });
    if (!ticket) throw new LocalDatabaseError('Support ticket not found.', 404, 'NOT_FOUND');
    await recordAuditLogLocal({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'update_support_ticket',
      targetType: 'support_ticket',
      targetId: id,
      details: `${ticket.ticketNumber} (${ticket.status})`,
    });
    return { ticket } as T;
  }

  // 15. WhatsApp & Store Settings
  if (method === 'GET' && pathname === '/whatsapp') {
    assertRole(actor, ['super_admin', 'store_manager', 'support_agent']);
    const [settings, referrals] = await Promise.all([getStoreSettingsLocal(), listWhatsAppReferralsLocal(50)]);
    return {
      config: {
        whatsappNumber: settings.whatsappNumber,
        whatsappEnabled: settings.whatsappEnabled,
        whatsappWelcomeMessage: settings.whatsappWelcomeMessage,
        whatsappOrderTemplate: settings.whatsappOrderTemplate,
        whatsappSupportMessage: settings.whatsappSupportMessage,
      },
      referrals,
    } as T;
  }
  if (method === 'PUT' && pathname === '/whatsapp') {
    assertRole(actor, ['super_admin', 'store_manager']);
    const updated = await updateStoreSettingsLocal(body as Partial<StoreSettingsFull>);
    await recordAuditLogLocal({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'update_whatsapp_config',
      targetType: 'settings',
    });
    return {
      config: {
        whatsappNumber: updated.whatsappNumber,
        whatsappEnabled: updated.whatsappEnabled,
        whatsappWelcomeMessage: updated.whatsappWelcomeMessage,
        whatsappOrderTemplate: updated.whatsappOrderTemplate,
        whatsappSupportMessage: updated.whatsappSupportMessage,
      },
    } as T;
  }
  if (method === 'GET' && pathname === '/settings') {
    assertRole(actor, ALL_ROLES);
    return { settings: await getStoreSettingsLocal() } as T;
  }
  if (method === 'PUT' && pathname === '/settings') {
    assertRole(actor, ['super_admin', 'store_manager']);
    const settings = await updateStoreSettingsLocal(body as Partial<StoreSettingsFull>);
    await recordAuditLogLocal({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'update_store_settings',
      targetType: 'settings',
    });
    return { settings } as T;
  }

  // 16. Admin Team, Roles & Own Profile
  if (method === 'GET' && pathname === '/team') {
    assertRole(actor, ['super_admin']);
    const [users, auditLogs] = await Promise.all([listAdminUsersLocal(), listAuditLogsLocal(120)]);
    return { users, auditLogs } as T;
  }
  if (method === 'POST' && pathname === '/team') {
    assertRole(actor, ['super_admin']);
    const user = await createAdminUserLocal({
      name: String(body.name || ''),
      email: String(body.email || ''),
      role: body.role as AdminRole,
      password: String(body.password || ''),
    });
    await recordAuditLogLocal({
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'create_admin_user',
      targetType: 'admin_user',
      targetId: user.id,
      details: `${user.email} (${user.role})`,
    });
    return { user } as T;
  }
  const teamMatch = pathname.match(/^\/team\/([^/]+)$/);
  if (teamMatch) {
    const id = decodeURIComponent(teamMatch[1]);
    if (method === 'PATCH') {
      assertRole(actor, ['super_admin']);
      const user = await updateAdminUserLocal(
        id,
        body as { name?: string; role?: AdminRole; isActive?: boolean; password?: string },
      );
      if (!user) throw new LocalDatabaseError('Team member not found.', 404, 'NOT_FOUND');
      await recordAuditLogLocal({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'update_admin_user',
        targetType: 'admin_user',
        targetId: id,
        details: `${user.email} (role=${user.role}, active=${user.isActive})`,
      });
      return { user } as T;
    }
    if (method === 'DELETE') {
      assertRole(actor, ['super_admin']);
      if (actor.id === id) {
        throw new LocalDatabaseError('You cannot delete your own active session account.', 400, 'INVALID_ACTION');
      }
      const ok = await deleteAdminUserLocal(id);
      if (!ok) throw new LocalDatabaseError('Team member not found.', 404, 'NOT_FOUND');
      await recordAuditLogLocal({
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'delete_admin_user',
        targetType: 'admin_user',
        targetId: id,
      });
      return { deletedId: id } as T;
    }
  }
  if (method === 'PATCH' && pathname === '/profile') {
    assertRole(actor, ALL_ROLES);
    const updated = await updateAdminUserLocal(actor.id, {
      name: typeof body.name === 'string' ? body.name : undefined,
      password: typeof body.password === 'string' && body.password.length >= 8 ? body.password : undefined,
    });
    if (!updated) throw new LocalDatabaseError('Profile not found.', 404, 'NOT_FOUND');
    const nextAdmin: LocalAdminSessionUser = {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
    };
    saveAdminSession({ token, admin: nextAdmin, savedAt: new Date().toISOString() });
    return { admin: nextAdmin } as T;
  }

  throw new LocalDatabaseError(`Unsupported local admin route: ${method} ${pathname}`, 404, 'NOT_FOUND');
}
