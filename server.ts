import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import { Type, type Content } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import type {
  AIAgentConfig,
  AIAnalyticsSummary,
  AIImageAnalysisResult,
  AIMemoryPreferences,
  AIRoutinePlan,
  AdminOverviewStats,
  CartItem,
  CustomerProfile,
  OrderRecord,
  Product,
  ReviewModerationRecord,
  SavedRoutine,
  StoreConfig,
  WebsiteContentCMS,
} from './src/types/store';
import {
  AIServiceError,
  GEMINI_MODEL,
  formatGeminiError,
  getGeminiClient,
  isGeminiConfigured,
  withGeminiRetry,
} from './server/ai/client';
import {
  AI_MODULE_GUIDELINES,
  SHOPPING_TOOLS,
  buildCatalogSummaryForPrompt,
  buildConsultantSystemInstruction,
  executeShoppingTool,
  type ToolSideEffects,
} from './server/ai/modules';
import {
  addCustomerReview,
  createCustomer,
  createSupportTicket,
  evaluateCoupon,
  findCustomerByEmail,
  findCustomerById,
  getAIAgent,
  getCmsContent,
  getDb,
  getProductBySlug,
  getPublicStoreConfig,
  getStoreSettings,
  listAIAgents,
  listCategories,
  listOrders,
  listProducts,
  placeOrderTransactional,
  recordAIEvent,
  recordWhatsAppReferral,
  updateCustomerProfile,
  verifyPassword,
  type StoredCustomer,
} from './server/db/database';
import { createAdminRouter } from './server/routes/admin';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const AUTH_SECRET = process.env.AUTH_SECRET || 'aurelia-botanica-local-session-secret';
const UPLOAD_DIR = path.resolve(process.cwd(), 'public', 'uploads');

function signCustomerToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ uid: userId, role: 'customer', iat: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyCustomerToken(token: string | undefined): string | null {
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
      role?: string;
    };
    if (!decoded.uid || decoded.role !== 'customer') return null;
    return decoded.uid;
  } catch {
    return null;
  }
}

function extractAuthCustomer(req: express.Request): StoredCustomer | null {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
  const uid = verifyCustomerToken(token);
  if (!uid) return null;
  const user = findCustomerById(uid);
  if (!user || user.isActive === false) return null;
  return user;
}

function sanitizeUser(user: StoredCustomer): CustomerProfile {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    isActive: user.isActive,
    createdAt: user.createdAt,
    savedAddresses: user.savedAddresses,
    savedRoutines: user.savedRoutines,
    wishlistIds: user.wishlistIds,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  // Initialize SQLite database & run automatic first-boot migration/seeding
  getDb();

  // Ensure upload directory exists and serve uploaded media / 3D models statically
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
  app.use('/uploads', express.static(UPLOAD_DIR));

  // Mount complete RBAC-secured Admin Portal API
  app.use('/api/admin', createAdminRouter());

  // ---------------------------------------------------------------------------
  // PUBLIC STOREFRONT & CONTENT ENDPOINTS
  // ---------------------------------------------------------------------------

  app.get('/api/health', (_req, res) => {
    const cfg = getPublicStoreConfig();
    res.json({ ok: true, brand: cfg.brandName, db: 'sqlite', geminiConfigured: isGeminiConfigured() });
  });

  app.get('/api/store-config', (_req, res) => {
    res.json(getPublicStoreConfig());
  });

  app.get('/api/content', (_req, res) => {
    res.json({
      content: getCmsContent(),
      categories: listCategories(false).filter((c) => c.isActive),
    });
  });

  app.get('/api/products', (_req, res) => {
    const products = listProducts({ includeUnpublished: false, includeReviews: true });
    res.json({ products });
  });

  app.get('/api/products/:slug', (req, res) => {
    const product = getProductBySlug(req.params.slug, false);
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    res.json({ product });
  });

  app.post('/api/products/:slug/reviews', (req, res) => {
    const { authorName, city, rating, title, comment, skinOrHairProfile } = req.body as {
      authorName?: string;
      city?: string;
      rating?: number;
      title?: string;
      comment?: string;
      skinOrHairProfile?: string;
    };

    if (!authorName?.trim() || !comment?.trim() || !rating || rating < 1 || rating > 5) {
      res.status(400).json({ error: 'Please provide your name, rating (1-5), and review comment.' });
      return;
    }

    const result = addCustomerReview(req.params.slug, {
      authorName,
      city,
      rating,
      title,
      comment,
      skinOrHairProfile,
    });
    if (!result) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }
    res.status(201).json(result);
  });

  app.post('/api/coupons/validate', (req, res) => {
    const authUser = extractAuthCustomer(req);
    const { code, subtotalPkr, itemCategories, itemProductIds } = req.body as {
      code?: string;
      subtotalPkr?: number;
      itemCategories?: string[];
      itemProductIds?: string[];
    };
    const result = evaluateCoupon(code, Number(subtotalPkr) || 0, {
      itemCategories,
      itemProductIds,
      userId: authUser?.id,
    });
    res.status(result.valid ? 200 : 400).json(result);
  });

  app.post('/api/orders', (req, res) => {
    const authUser = extractAuthCustomer(req);
    const { customerName, customerPhone, customerEmail, shippingAddress, paymentMethod, items, couponCode, viaAi } =
      req.body as {
        customerName?: string;
        customerPhone?: string;
        customerEmail?: string;
        shippingAddress?: {
          street?: string;
          area?: string;
          city?: string;
          postalCode?: string;
          notes?: string;
        };
        paymentMethod?: 'cod' | 'whatsapp';
        items?: { productId: string; quantity: number }[];
        couponCode?: string;
        viaAi?: boolean;
      };

    if (
      !customerName?.trim() ||
      !customerPhone?.trim() ||
      !shippingAddress?.street?.trim() ||
      !shippingAddress?.city?.trim()
    ) {
      res.status(400).json({ error: 'Please complete your name, phone number, street address, and city.' });
      return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Your shopping bag is empty.' });
      return;
    }

    const result = placeOrderTransactional({
      authUser,
      customerName,
      customerPhone,
      customerEmail,
      shippingAddress: {
        street: shippingAddress.street,
        area: shippingAddress.area || '',
        city: shippingAddress.city,
        postalCode: shippingAddress.postalCode || '',
        notes: shippingAddress.notes,
      },
      paymentMethod: paymentMethod === 'whatsapp' ? 'whatsapp' : 'cod',
      items,
      couponCode,
    });

    if (result.ok === false) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    if (paymentMethod === 'whatsapp') {
      recordWhatsAppReferral(
        'checkout',
        `Order ${result.order.orderNumber} (${result.order.items.length} items) — PKR ${result.order.totalPkr}`,
        customerPhone,
      );
    }
    if (viaAi) {
      recordAIEvent({ eventType: 'ai_order', agentKey: 'shopping_assistant', meta: { orderId: result.order.id } });
    }

    res.status(201).json({ order: result.order });
  });

  app.get('/api/orders', (req, res) => {
    const authUser = extractAuthCustomer(req);
    const orderNumberQuery = typeof req.query.orderNumber === 'string' ? req.query.orderNumber.trim().toUpperCase() : '';
    const phoneQuery = typeof req.query.phone === 'string' ? req.query.phone.replace(/\D/g, '') : '';
    const allOrders = listOrders(500);

    if (orderNumberQuery && phoneQuery) {
      const match = allOrders.find(
        (o) =>
          o.orderNumber.toUpperCase() === orderNumberQuery &&
          o.customerPhone.replace(/\D/g, '').endsWith(phoneQuery.slice(-7)),
      );
      if (!match) {
        res.status(404).json({ error: 'No order found matching that order number and phone.' });
        return;
      }
      res.json({ orders: [match] });
      return;
    }

    if (!authUser) {
      res.status(401).json({ error: 'Sign in or search by Order Number and Phone.' });
      return;
    }

    const userOrders = allOrders.filter(
      (o) =>
        o.userId === authUser.id ||
        (o.customerEmail && o.customerEmail.toLowerCase() === authUser.email.toLowerCase()),
    );
    res.json({ orders: userOrders });
  });

  // ---------------------------------------------------------------------------
  // CUSTOMER AUTHENTICATION & SAVED ROUTINES
  // ---------------------------------------------------------------------------

  app.post('/api/auth/register', (req, res) => {
    const { name, email, phone, password } = req.body as {
      name?: string;
      email?: string;
      phone?: string;
      password?: string;
    };

    if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
      res.status(400).json({ error: 'Name, valid email, and password (min 6 characters) are required.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (findCustomerByEmail(normalizedEmail)) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const user = createCustomer({ name, email: normalizedEmail, phone, password });
    const token = signCustomerToken(user.id);
    res.status(201).json({ token, user: sanitizeUser(user) });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email?.trim() || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }
    const user = findCustomerByEmail(email);
    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }
    if (user.isActive === false) {
      res.status(403).json({ error: 'This customer account is currently suspended. Please contact support.' });
      return;
    }
    const token = signCustomerToken(user.id);
    res.json({ token, user: sanitizeUser(user) });
  });

  app.get('/api/auth/me', (req, res) => {
    const user = extractAuthCustomer(req);
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    res.json({ user: sanitizeUser(user) });
  });

  app.patch('/api/auth/me', (req, res) => {
    const user = extractAuthCustomer(req);
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const { name, phone, savedAddresses, wishlistIds } = req.body as Partial<CustomerProfile>;
    const updated = updateCustomerProfile(user.id, { name, phone, savedAddresses, wishlistIds });
    res.json({ user: sanitizeUser(updated || user) });
  });

  app.post('/api/routines', (req, res) => {
    const user = extractAuthCustomer(req);
    if (!user) {
      res.status(401).json({ error: 'Sign in to save routines to your account.' });
      return;
    }
    const routine = req.body as SavedRoutine;
    if (!routine?.title || !routine.skinType) {
      res.status(400).json({ error: 'Invalid routine payload.' });
      return;
    }
    const saved: SavedRoutine = {
      ...routine,
      id: routine.id || `rtn-${crypto.randomUUID().slice(0, 8)}`,
      createdAt: routine.createdAt || new Date().toISOString(),
    };
    const nextRoutines = [saved, ...user.savedRoutines.filter((r) => r.id !== saved.id)].slice(0, 10);
    const updated = updateCustomerProfile(user.id, { savedRoutines: nextRoutines });
    res.status(201).json({ routine: saved, user: sanitizeUser(updated || user) });
  });

  // ---------------------------------------------------------------------------
  // CUSTOMER SUPPORT INQUIRY, WHATSAPP REFERRALS & AI TELEMETRY EVENTS
  // ---------------------------------------------------------------------------

  app.post('/api/support/tickets', (req, res) => {
    const { customerName, customerEmail, customerPhone, subject, message, source } = req.body as {
      customerName?: string;
      customerEmail?: string;
      customerPhone?: string;
      subject?: string;
      message?: string;
      source?: 'support_form' | 'ai_escalation' | 'whatsapp';
    };
    if (!customerName?.trim() || !subject?.trim() || !message?.trim()) {
      res.status(400).json({ error: 'Please include your name, subject, and message.' });
      return;
    }
    const ticket = createSupportTicket({
      customerName,
      customerEmail,
      customerPhone,
      subject,
      message,
      source: source || 'support_form',
    });
    res.status(201).json({ ticket });
  });

  app.post('/api/whatsapp/referral', (req, res) => {
    const { source, summary, customerPhone } = req.body as {
      source?: string;
      summary?: string;
      customerPhone?: string;
    };
    recordWhatsAppReferral(source || 'storefront', summary || 'Customer opened WhatsApp concierge', customerPhone);
    res.status(201).json({ recorded: true });
  });

  app.post('/api/ai/events', (req, res) => {
    const { eventType, agentKey, productSlug, queryText } = req.body as {
      eventType?: 'rec_click' | 'ai_add_to_cart' | 'ai_order';
      agentKey?: string;
      productSlug?: string;
      queryText?: string;
    };
    if (!eventType || !['rec_click', 'ai_add_to_cart', 'ai_order'].includes(eventType)) {
      res.status(400).json({ error: 'Invalid AI telemetry event.' });
      return;
    }
    recordAIEvent({ eventType, agentKey, productSlug, queryText });
    res.status(201).json({ recorded: true });
  });

  // ---------------------------------------------------------------------------
  // CUSTOMER AI BEAUTY AGENT ENDPOINTS (ADMIN CONFIG AWARE)
  // ---------------------------------------------------------------------------

  app.post('/api/ai/chat', async (req, res) => {
    const requestAbort = new AbortController();
    let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
    let sseStarted = false;

    const cleanup = () => {
      if (keepaliveTimer) {
        clearInterval(keepaliveTimer);
        keepaliveTimer = null;
      }
    };

    res.on('close', () => {
      cleanup();
      if (!res.writableEnded) {
        requestAbort.abort(new Error('Client closed SSE connection.'));
      }
    });

    const sendEvent = (event: string, data: unknown) => {
      if (res.writableEnded) return;
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const authUser = extractAuthCustomer(req);
      const body = (req.body || {}) as {
        messages?: { role: 'user' | 'assistant'; text: string }[];
        language?: string;
        memory?: AIMemoryPreferences;
        cart?: CartItem[];
      };
      const messages = body.messages;
      const language = typeof body.language === 'string' && body.language.trim() ? body.language : 'auto';
      const memory = body.memory;
      const cart = Array.isArray(body.cart) ? body.cart : [];

      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'Please send at least one message.', code: 'EMPTY_MESSAGES' });
        return;
      }

      const validMessages = messages.filter(
        (m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim().length > 0,
      );
      if (validMessages.length === 0) {
        res.status(400).json({ error: 'Message content cannot be empty.', code: 'EMPTY_MESSAGES' });
        return;
      }

      const primaryAgent = getAIAgent('beauty_expert');
      if (primaryAgent && !primaryAgent.enabled) {
        res.status(503).json({
          error: 'The AI Beauty Expert is currently paused by the store team. Please reach us via WhatsApp Concierge.',
          code: 'AI_AGENT_PAUSED',
        });
        return;
      }

      const lastUserMessage = [...validMessages].reverse().find((m) => m.role === 'user')?.text || '';
      recordAIEvent({
        eventType: 'conversation',
        agentKey: 'beauty_expert',
        queryText: lastUserMessage.trim().slice(0, 160),
      });

      const settings = getStoreSettings();
      const matchedKeyword = (settings.aiEscalationKeywords || []).find(
        (kw) => kw && lastUserMessage.toLowerCase().includes(kw.toLowerCase()),
      );
      if (matchedKeyword && authUser) {
        createSupportTicket({
          customerName: authUser.name,
          customerEmail: authUser.email,
          customerPhone: authUser.phone,
          subject: `AI Chat Escalation (${matchedKeyword})`,
          message: lastUserMessage,
          source: 'ai_escalation',
          priority: 'high',
        });
      }

      // Check API key before upgrading to SSE so missing key returns clean HTTP 503 JSON
      const ai = getGeminiClient();

      // Flush SSE headers immediately so Nginx / Cloud Run reverse proxies never buffer or timeout before first byte
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();
      sseStarted = true;
      res.write(': connected\n\n');

      keepaliveTimer = setInterval(() => {
        if (!res.writableEnded) {
          res.write(': ping\n\n');
        }
      }, 8000);

      const bodyWithContext = req.body as {
        catalogProducts?: Product[];
        storeConfig?: StoreConfig;
        agentConfigs?: AIAgentConfig[];
        cmsContent?: WebsiteContentCMS;
        orders?: OrderRecord[];
      };
      const publishedProducts =
        Array.isArray(bodyWithContext.catalogProducts) && bodyWithContext.catalogProducts.length > 0
          ? bodyWithContext.catalogProducts.filter((p) => (p.status || 'published') === 'published')
          : listProducts({ includeUnpublished: false });
      const storeConfig = bodyWithContext.storeConfig || getPublicStoreConfig();
      const agentConfigs =
        Array.isArray(bodyWithContext.agentConfigs) && bodyWithContext.agentConfigs.length > 0
          ? bodyWithContext.agentConfigs
          : listAIAgents();
      const cmsContent = bodyWithContext.cmsContent || getCmsContent();
      const orders = Array.isArray(bodyWithContext.orders) ? bodyWithContext.orders : listOrders(300);

      const primaryOverride = agentConfigs.find((a) => a.agentKey === 'beauty_expert');
      if (primaryOverride && !primaryOverride.enabled) {
        sendEvent('error', {
          status: 503,
          code: 'AI_AGENT_PAUSED',
          message: 'The AI Beauty Expert is currently paused by the store team.',
        });
        cleanup();
        if (!res.writableEnded) res.end();
        return;
      }

      const systemInstruction = buildConsultantSystemInstruction({
        language,
        products: publishedProducts,
        cart,
        memory,
        customer: authUser ? sanitizeUser(authUser) : null,
        storeConfig,
        agentConfigs,
        cmsContent,
      });

      const conversation: Content[] = validMessages.slice(-12).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.text }],
      }));

      const effects: ToolSideEffects = {
        recommendedSlugs: [],
        cartActions: [],
      };

      const toolContext = {
        products: publishedProducts,
        cart,
        orders,
        customer: authUser ? sanitizeUser(authUser) : null,
        storeConfig,
        evaluateCoupon: (code: string, subtotal: number) => evaluateCoupon(code, subtotal, { userId: authUser?.id }),
      };

      let finalText = '';

      for (let round = 0; round < 3; round++) {
        const response = await withGeminiRetry(
          (signal) =>
            ai.models.generateContent({
              model: GEMINI_MODEL,
              contents: conversation,
              config: {
                abortSignal: signal,
                systemInstruction,
                tools: [{ functionDeclarations: SHOPPING_TOOLS }],
              },
            }),
          { timeoutMs: 35_000, maxRetries: 2, parentSignal: requestAbort.signal },
        );

        const functionCalls = response.functionCalls;
        const modelContent = response.candidates?.[0]?.content;

        if (functionCalls && functionCalls.length > 0 && modelContent) {
          conversation.push(modelContent);
          const fnParts = functionCalls.map((fc) => ({
            functionResponse: {
              id: fc.id,
              name: fc.name || '',
              response: {
                result: executeShoppingTool(
                  fc.name || '',
                  (fc.args as Record<string, unknown>) || {},
                  toolContext,
                  effects,
                ),
              },
            },
          }));
          conversation.push({ role: 'user', parts: fnParts });
          continue;
        }

        finalText = (response.text || '').trim();
        break;
      }

      if (!finalText) {
        const fallbackSynthesis = await withGeminiRetry(
          (signal) =>
            ai.models.generateContent({
              model: GEMINI_MODEL,
              contents: conversation,
              config: { abortSignal: signal, systemInstruction },
            }),
          { timeoutMs: 30_000, maxRetries: 1, parentSignal: requestAbort.signal },
        );
        finalText = (fallbackSynthesis.text || '').trim();
      }

      if (!finalText && !effects.routinePlan && !effects.whatsappDraft && effects.recommendedSlugs.length === 0) {
        throw new AIServiceError('Empty response from Gemini.', 502, 'EMPTY_AI_RESPONSE');
      }

      if (!finalText) {
        finalText = effects.routinePlan
          ? `I have prepared your personalized **${effects.routinePlan.title}** below.`
          : effects.whatsappDraft
          ? 'Your WhatsApp concierge order summary is ready for confirmation below.'
          : 'Here are the Aurelia Botanica formulations selected for you:';
      }

      for (const product of publishedProducts) {
        if (finalText.includes(product.slug) && !effects.recommendedSlugs.includes(product.slug)) {
          effects.recommendedSlugs.push(product.slug);
        }
      }

      for (const slug of effects.recommendedSlugs.slice(0, 6)) {
        recordAIEvent({ eventType: 'recommendation', agentKey: 'recommendation_agent', productSlug: slug });
      }
      if (effects.routinePlan) {
        recordAIEvent({ eventType: 'routine_build', agentKey: 'routine_builder' });
      }
      for (const ca of effects.cartActions) {
        if (ca.type === 'add') {
          recordAIEvent({ eventType: 'ai_add_to_cart', agentKey: 'shopping_assistant', productSlug: ca.slug });
        }
      }

      sendEvent('meta', {
        recommendedSlugs: effects.recommendedSlugs.slice(0, 6),
        cartActions: effects.cartActions,
        routinePlan: effects.routinePlan,
        whatsappDraft: effects.whatsappDraft,
      });

      const tokens = finalText.split(/(\s+)/);
      const chunkSize = 4;
      for (let i = 0; i < tokens.length; i += chunkSize) {
        const chunk = tokens.slice(i, i + chunkSize).join('');
        if (chunk) {
          sendEvent('delta', { text: chunk });
        }
      }

      sendEvent('done', { ok: true });
      cleanup();
      if (!res.writableEnded) res.end();
    } catch (error) {
      cleanup();
      if (requestAbort.signal.aborted && res.writableEnded) {
        return;
      }
      const formatted = formatGeminiError(error, 'POST /api/ai/chat');
      recordAIEvent({
        eventType: 'error',
        agentKey: 'beauty_expert',
        errorMessage: formatted.message,
      });
      if (!sseStarted && !res.headersSent) {
        res.status(formatted.status).json({ error: formatted.message, code: formatted.code });
        return;
      }
      sendEvent('error', { status: formatted.status, code: formatted.code, message: formatted.message });
      if (!res.writableEnded) res.end();
    }
  });

  const handleAnalyzeImage = async (req: express.Request, res: express.Response, defaultMode?: 'skin' | 'hair') => {
    try {
      const imgAgent = getAIAgent('image_analyzer');
      if (imgAgent && !imgAgent.enabled) {
        res.status(503).json({ error: 'AI Image Analyzer is currently disabled by store administration.' });
        return;
      }

      const body = (req.body || {}) as {
        mode?: 'skin' | 'hair';
        imageBase64?: string;
        mimeType?: string;
        consentGiven?: boolean;
        hairType?: string;
        hairConcerns?: string[];
        notes?: string;
      };
      const mode = body.mode || defaultMode;
      const { imageBase64, mimeType, consentGiven, hairType, hairConcerns, notes } = body;

      if (consentGiven !== true) {
        res.status(400).json({ error: 'Explicit photo analysis permission is required before processing.' });
        return;
      }
      if (mode !== 'skin' && mode !== 'hair') {
        res.status(400).json({ error: 'Analysis mode must be either "skin" or "hair".' });
        return;
      }
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        res.status(400).json({ error: 'Please upload or capture a clear photo to analyze.' });
        return;
      }

      const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+.-]+;base64,/, '').trim();
      const normalizedMime =
        mimeType && ['image/jpeg', 'image/png', 'image/webp'].includes(mimeType) ? mimeType : 'image/jpeg';

      if (cleanBase64.length < 100 || cleanBase64.length > 8_500_000) {
        res.status(400).json({ error: 'Image size must be under 6 MB and contain valid image data.' });
        return;
      }

      const bodyExt = req.body as {
        catalogProducts?: Product[];
        agentConfig?: AIAgentConfig;
      };
      const activeImgAgent = bodyExt.agentConfig || imgAgent;
      if (activeImgAgent && !activeImgAgent.enabled) {
        res.status(503).json({ error: 'AI Image Analyzer is currently disabled by store administration.' });
        return;
      }

      const ai = getGeminiClient();
      const publishedProducts =
        Array.isArray(bodyExt.catalogProducts) && bodyExt.catalogProducts.length > 0
          ? bodyExt.catalogProducts.filter((p) => (p.status || 'published') === 'published')
          : listProducts({ includeUnpublished: false });
      const catalogSummary = buildCatalogSummaryForPrompt(publishedProducts);
      const userContextLines = [
        hairType ? `Reported hair/skin texture: ${hairType}` : null,
        Array.isArray(hairConcerns) && hairConcerns.length > 0 ? `User concerns: ${hairConcerns.join(', ')}` : null,
        notes?.trim() ? `Customer notes: ${notes.trim()}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      const promptText =
        mode === 'skin'
          ? `Analyze this facial photograph for visible cosmetic skincare characteristics ONLY (e.g., visible surface shine/oiliness, dryness/flaking, uneven tone, visible blemishes or redness, texture).
NEVER diagnose medical conditions or diseases. State gentle, honest cosmetic observations.
Recommend 2 to 4 real skincare slugs from the Aurelia Botanica catalog below and practical morning/evening cosmetic guidance.
${userContextLines}

LIVE CATALOG:
${catalogSummary}`
          : `Analyze this hair or scalp photograph for visible cosmetic haircare characteristics ONLY (e.g., frizz/flyaways, dryness/dullness, curl/wave definition, visible scalp oiliness or flaking, split-end dryness).
NEVER diagnose medical alopecia or scalp disease. State gentle, honest cosmetic observations.
Recommend 2 to 4 real haircare slugs from the Aurelia Botanica catalog below and practical wash-day / oiling guidance.
${userContextLines}

LIVE CATALOG:
${catalogSummary}`;

      const response = await withGeminiRetry(
        (signal) =>
          ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [
              {
                role: 'user',
                parts: [
                  { text: promptText },
                  {
                    inlineData: {
                      data: cleanBase64,
                      mimeType: normalizedMime,
                    },
                  },
                ],
              },
            ],
            config: {
              abortSignal: signal,
              systemInstruction: `${AI_MODULE_GUIDELINES.skincareExpert}\n${AI_MODULE_GUIDELINES.haircareExpert}\n${AI_MODULE_GUIDELINES.productRecommendation}\n${imgAgent?.customInstructions || ''}`,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  visibleObservations: { type: Type.ARRAY, items: { type: Type.STRING } },
                  identifiedConcerns: { type: Type.ARRAY, items: { type: Type.STRING } },
                  suggestedIngredients: { type: Type.ARRAY, items: { type: Type.STRING } },
                  recommendedProductSlugs: { type: Type.ARRAY, items: { type: Type.STRING } },
                  routineGuidance: { type: Type.ARRAY, items: { type: Type.STRING } },
                  cautionNotice: { type: Type.STRING },
                },
                required: [
                  'visibleObservations',
                  'identifiedConcerns',
                  'suggestedIngredients',
                  'recommendedProductSlugs',
                  'routineGuidance',
                  'cautionNotice',
                ],
              },
            },
          }),
        { timeoutMs: 45_000, maxRetries: 2 },
      );

      const rawText = (response.text || '')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```$/i, '')
        .trim();

      if (!rawText) {
        throw new AIServiceError('Empty photo analysis response.', 502, 'EMPTY_AI_RESPONSE');
      }

      let parsed: Partial<AIImageAnalysisResult>;
      try {
        parsed = JSON.parse(rawText) as Partial<AIImageAnalysisResult>;
      } catch {
        throw new AIServiceError('Unreadable photo analysis JSON.', 502, 'INVALID_AI_JSON');
      }

      const validSlugSet = new Set(publishedProducts.map((p) => p.slug));
      let verifiedSlugs = (parsed.recommendedProductSlugs || []).filter((slug) => validSlugSet.has(slug));
      if (verifiedSlugs.length === 0) {
        verifiedSlugs = publishedProducts
          .filter((p) => p.department === (mode === 'skin' ? 'skincare' : 'haircare') && p.stock > 0)
          .slice(0, 3)
          .map((p) => p.slug);
      }

      const result: AIImageAnalysisResult = {
        mode,
        visibleObservations: parsed.visibleObservations?.slice(0, 5) || [],
        identifiedConcerns: parsed.identifiedConcerns?.slice(0, 5) || [],
        suggestedIngredients: parsed.suggestedIngredients?.slice(0, 5) || [],
        recommendedProductSlugs: verifiedSlugs.slice(0, 4),
        routineGuidance: parsed.routineGuidance?.slice(0, 5) || [],
        cautionNotice:
          parsed.cautionNotice ||
          'Cosmetic visual assessment only — not a medical or dermatological diagnosis. Always patch test new formulas and consult a licensed dermatologist for persistent or severe conditions.',
      };

      recordAIEvent({ eventType: 'image_analysis', agentKey: 'image_analyzer' });
      for (const s of result.recommendedProductSlugs) {
        recordAIEvent({ eventType: 'recommendation', agentKey: 'image_analyzer', productSlug: s });
      }

      res.json({ analysis: result });
    } catch (error) {
      const formatted = formatGeminiError(error, `POST ${req.originalUrl}`);
      recordAIEvent({ eventType: 'error', agentKey: 'image_analyzer', errorMessage: formatted.message });
      res.status(formatted.status).json({ error: formatted.message, code: formatted.code });
    }
  };

  app.post('/api/ai/analyze-image', (req, res) => {
    void handleAnalyzeImage(req, res);
  });

  app.post('/api/skin-analysis', (req, res) => {
    void handleAnalyzeImage(req, res, 'skin');
  });

  app.post('/api/ai/routine', async (req, res) => {
    const routineAgent = getAIAgent('routine_builder');
    if (routineAgent && !routineAgent.enabled) {
      res.status(503).json({ error: 'AI Routine Builder is currently paused by store administration.' });
      return;
    }

    const {
      focus = 'both',
      skinType,
      hairType,
      concerns = [],
      budgetMaxPkr,
      preferredCategories = [],
      catalogProducts,
      agentConfig,
    } = req.body as {
      focus?: 'skincare' | 'haircare' | 'both';
      skinType?: string;
      hairType?: string;
      concerns?: string[];
      budgetMaxPkr?: number;
      preferredCategories?: string[];
      catalogProducts?: Product[];
      agentConfig?: AIAgentConfig;
    };

    const effectiveRoutineAgent = agentConfig || routineAgent;
    if (effectiveRoutineAgent && !effectiveRoutineAgent.enabled) {
      res.status(503).json({ error: 'AI Routine Builder is currently paused by store administration.' });
      return;
    }

    try {
      const ai = getGeminiClient();
      const publishedProducts =
        Array.isArray(catalogProducts) && catalogProducts.length > 0
          ? catalogProducts.filter((p) => (p.status || 'published') === 'published')
          : listProducts({ includeUnpublished: false });
      const catalogSummary = buildCatalogSummaryForPrompt(publishedProducts);

      const stepSchema = {
        type: Type.OBJECT,
        properties: {
          stepNumber: { type: Type.NUMBER },
          stepRole: { type: Type.STRING },
          productSlug: { type: Type.STRING },
          usageInstruction: { type: Type.STRING },
          frequency: { type: Type.STRING },
        },
        required: ['stepNumber', 'stepRole', 'productSlug', 'usageInstruction', 'frequency'],
      };

      const prompt = `Build a personalized Aurelia Botanica beauty routine.
Focus: ${focus}
Skin Type: ${skinType || 'Not specified'}
Hair Type: ${hairType || 'Not specified'}
Primary Concerns: ${Array.isArray(concerns) && concerns.length > 0 ? concerns.join(', ') : 'Balanced daily care'}
Budget Ceiling: ${budgetMaxPkr ? `PKR ${budgetMaxPkr}` : 'Flexible'}
Preferred Categories: ${preferredCategories.join(', ') || 'Any suitable'}

RULES:
- ONLY use exact slugs from the LIVE CATALOG below where stock > 0.
- If focus is 'skincare', keep weeklyHaircare empty []. If focus is 'haircare', keep morningSkincare and nightSkincare empty []. If 'both', include morningSkincare, nightSkincare, and weeklyHaircare.
- Avoid layering incompatible strong exfoliants and retinol in the same evening step.
- Include realistic usage instructions and frequency (e.g. Daily AM, Daily PM, 2-3x Weekly).

LIVE CATALOG:
${catalogSummary}`;

      const response = await withGeminiRetry(
        (signal) =>
          ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: prompt,
            config: {
              abortSignal: signal,
              systemInstruction: `${AI_MODULE_GUIDELINES.skincareExpert}\n${AI_MODULE_GUIDELINES.haircareExpert}\n${AI_MODULE_GUIDELINES.productRecommendation}\n${routineAgent?.customInstructions || ''}`,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  safetyNote: { type: Type.STRING },
                  morningSkincare: { type: Type.ARRAY, items: stepSchema },
                  nightSkincare: { type: Type.ARRAY, items: stepSchema },
                  weeklyHaircare: { type: Type.ARRAY, items: stepSchema },
                },
                required: ['title', 'summary', 'safetyNote', 'morningSkincare', 'nightSkincare', 'weeklyHaircare'],
              },
            },
          }),
        { timeoutMs: 40_000, maxRetries: 2 },
      );

      const rawText = (response.text || '')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```$/i, '')
        .trim();

      if (!rawText) {
        throw new AIServiceError('Empty routine response.', 502, 'EMPTY_AI_RESPONSE');
      }

      let raw: Partial<AIRoutinePlan>;
      try {
        raw = JSON.parse(rawText) as Partial<AIRoutinePlan>;
      } catch {
        throw new AIServiceError('Unreadable routine JSON.', 502, 'INVALID_AI_JSON');
      }

      const productBySlug = new Map(publishedProducts.map((p) => [p.slug, p]));

      const sanitizeSteps = (steps: AIRoutinePlan['morningSkincare'] | undefined) =>
        (Array.isArray(steps) ? steps : [])
          .filter((s) => productBySlug.has(s.productSlug))
          .map((s, idx) => ({
            ...s,
            stepNumber: idx + 1,
          }));

      const morningSkincare = sanitizeSteps(raw.morningSkincare);
      const nightSkincare = sanitizeSteps(raw.nightSkincare);
      const weeklyHaircare = sanitizeSteps(raw.weeklyHaircare);

      const uniqueSlugs = Array.from(
        new Set([...morningSkincare, ...nightSkincare, ...weeklyHaircare].map((s) => s.productSlug)),
      );
      const totalEstimatedPkr = uniqueSlugs.reduce((sum, slug) => {
        const prod = productBySlug.get(slug);
        if (!prod) return sum;
        const unit = prod.discountPricePkr && prod.discountPricePkr < prod.pricePkr ? prod.discountPricePkr : prod.pricePkr;
        return sum + unit;
      }, 0);

      const routine: AIRoutinePlan = {
        title: raw.title || 'Custom Aurelia Botanica Ritual',
        summary: raw.summary || 'Tailored botanical layering regimen built from live catalog formulations.',
        safetyNote:
          raw.safetyNote ||
          'Introduce one new active at a time, patch test behind the ear for 24 hours, and wear broad-spectrum sunscreen daily.',
        morningSkincare,
        nightSkincare,
        weeklyHaircare,
        totalEstimatedPkr,
      };

      recordAIEvent({ eventType: 'routine_build', agentKey: 'routine_builder' });
      res.json({ routine });
    } catch (error) {
      const formatted = formatGeminiError(error, 'POST /api/ai/routine');
      recordAIEvent({ eventType: 'error', agentKey: 'routine_builder', errorMessage: formatted.message });
      res.status(formatted.status).json({ error: formatted.message, code: formatted.code });
    }
  });

  app.post('/api/ai/admin-copilot', async (req, res) => {
    const { question, history = [], liveTelemetry } = req.body as {
      question?: string;
      history?: { role: 'user' | 'assistant'; text: string }[];
      liveTelemetry?: {
        overview?: AdminOverviewStats;
        products?: Product[];
        orders?: OrderRecord[];
        reviews?: ReviewModerationRecord[];
        aiStats?: AIAnalyticsSummary;
      };
    };

    if (!question?.trim()) {
      res.status(400).json({ error: 'Please enter an analytics or operations question.' });
      return;
    }

    try {
      const ai = getGeminiClient();
      const overview = liveTelemetry?.overview;
      const products = Array.isArray(liveTelemetry?.products)
        ? liveTelemetry.products
        : listProducts({ includeUnpublished: true });
      const orders = Array.isArray(liveTelemetry?.orders) ? liveTelemetry.orders : [];
      const reviews = Array.isArray(liveTelemetry?.reviews) ? liveTelemetry.reviews : [];
      const aiStats = liveTelemetry?.aiStats;

      const couponUsage: Record<string, number> = {};
      for (const ord of orders) {
        if (ord.couponCode) {
          couponUsage[ord.couponCode] = (couponUsage[ord.couponCode] || 0) + 1;
        }
      }

      const recentReviewSnippets = reviews
        .slice(0, 14)
        .map((r) => `[${r.productSlug}] ${r.rating}/5 (${r.status}): "${r.title} - ${r.comment}"`)
        .join('\n');

      const systemInstruction = `${AI_MODULE_GUIDELINES.adminAssistant}

LIVE STORE TELEMETRY (USE ONLY THESE EXACT NUMBERS):
- Total Orders: ${overview?.totalOrders ?? orders.length} (Pending/Active: ${overview?.pendingOrdersCount ?? 0} | Delivered: ${overview?.deliveredOrdersCount ?? 0})
- Total Net Revenue: PKR ${(overview?.totalRevenuePkr ?? 0).toLocaleString('en-PK')}
- Sales Windows: Daily PKR ${(overview?.salesWindows?.dailyPkr ?? 0).toLocaleString('en-PK')} | Weekly PKR ${(overview?.salesWindows?.weeklyPkr ?? 0).toLocaleString('en-PK')} | Monthly PKR ${(overview?.salesWindows?.monthlyPkr ?? 0).toLocaleString('en-PK')}
- Total Registered Customers: ${overview?.totalCustomers ?? 0}
- Department Split: Skincare PKR ${(overview?.departmentSplit?.skincareRevenuePkr ?? 0).toLocaleString('en-PK')} | Haircare PKR ${(overview?.departmentSplit?.haircareRevenuePkr ?? 0).toLocaleString('en-PK')}
- Low Stock Alerts: ${
        overview?.lowStockProducts?.length
          ? overview.lowStockProducts.map((p) => `${p.name} (${p.stock} left)`).join(', ')
          : 'None — all SKUs above threshold'
      }
- Top Selling Products: ${
        overview?.topSellingProducts?.length
          ? overview.topSellingProducts.map((t) => `${t.name}: ${t.unitsSold} units (PKR ${t.revenuePkr})`).join(' | ')
          : 'No completed order volume yet'
      }
- AI Beauty Expert Telemetry: ${aiStats?.totalConversations ?? 0} chats, ${aiStats?.totalImageAnalyses ?? 0} photo scans, ${aiStats?.aiAssistedAddToCart ?? 0} AI bag adds, ${aiStats?.failedResponses ?? 0} errors
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
      const formatted = formatGeminiError(error, 'POST /api/ai/admin-copilot');
      res.status(formatted.status).json({ error: formatted.message, code: formatted.code });
    }
  });

  // ---------------------------------------------------------------------------
  // API 404 & GLOBAL JSON ERROR HANDLERS (NEVER RETURN HTML FOR /api/*)
  // ---------------------------------------------------------------------------

  app.use('/api', (req, res) => {
    res.status(404).json({
      error: `API route not found: ${req.method} ${req.originalUrl}`,
      code: 'API_ROUTE_NOT_FOUND',
    });
  });

  app.use(
    (
      err: unknown,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (res.headersSent) {
        next(err);
        return;
      }

      const errObj = err as { type?: string; status?: number; statusCode?: number; message?: string };
      if (errObj?.type === 'entity.too.large' || errObj?.status === 413) {
        res.status(413).json({
          error: 'Uploaded image payload is too large. Please select an image under 6 MB.',
          code: 'PAYLOAD_TOO_LARGE',
        });
        return;
      }
      if (errObj?.type === 'entity.parse.failed' || (err instanceof SyntaxError && errObj?.status === 400)) {
        res.status(400).json({
          error: 'Malformed JSON request body.',
          code: 'INVALID_JSON',
        });
        return;
      }

      if (req.originalUrl.startsWith('/api')) {
        const status = errObj?.statusCode || errObj?.status || 500;
        res.status(status >= 400 && status < 600 ? status : 500).json({
          error: errObj?.message || 'Unexpected server error.',
          code: 'API_SERVER_ERROR',
        });
        return;
      }

      next(err);
    },
  );

  // ---------------------------------------------------------------------------
  // VITE DEV MIDDLEWARE / PRODUCTION STATIC SERVING
  // ---------------------------------------------------------------------------

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    const indexHtmlPath = path.join(distDir, 'index.html');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
    } else {
      console.warn('[Startup] Production build directory dist/ does not exist. Run "npm run build" before starting in production.');
    }
    app.get('*', (req, res) => {
      if (req.originalUrl.startsWith('/api')) {
        res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}`, code: 'API_ROUTE_NOT_FOUND' });
        return;
      }
      if (!fs.existsSync(indexHtmlPath)) {
        res.status(503).send('Storefront build not found. Please run "npm run build".');
        return;
      }
      res.sendFile(indexHtmlPath);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    const keyState = isGeminiConfigured() ? 'configured' : 'MISSING_OR_PLACEHOLDER';
    console.log(`Aurelia Botanica server running at http://localhost:${PORT} (env=${process.env.NODE_ENV || 'development'}, geminiKey=${keyState})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
