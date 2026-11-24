import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  BEAUTY_TIPS,
  HAIRCARE_CATEGORIES,
  INITIAL_PRODUCTS,
  INITIAL_REVIEWS,
  SKINCARE_CATEGORIES,
  STORE_IMAGES,
} from '../../src/data/catalog';
import type {
  AIAgentConfig,
  AIAnalyticsSummary,
  AdminNotification,
  AdminRole,
  AdminUser,
  AnalyticsReportData,
  AuditLogEntry,
  CategoryRecord,
  CouponRecord,
  CustomerProfile,
  CustomerSummaryRecord,
  OrderRecord,
  OrderStatus,
  Product,
  ProductReview,
  ReviewModerationRecord,
  StockHistoryEntry,
  StoreConfig,
  StoreSettingsFull,
  SupportMessage,
  SupportTicket,
  WebsiteContentCMS,
  WhatsAppReferralRecord,
} from '../../src/types/store';

export interface StoredCustomer extends CustomerProfile {
  passwordHash: string;
  passwordSalt: string;
}

export interface StoredAdminUser extends AdminUser {
  passwordHash: string;
  passwordSalt: string;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const LEGACY_JSON_FILE = path.join(DATA_DIR, 'store.json');

function getDbFilePath(): string {
  const configured = process.env.SQLITE_DB_PATH?.trim();
  if (!configured) return path.join(DATA_DIR, 'aurelia.db');
  return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
}

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (_db) return _db;
  const dbPath = getDbFilePath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  _db = db;
  initSchema(db);
  seedAndMigrateIfNeeded(db);
  return db;
}

export function withTransaction<T>(fn: (db: DatabaseSync) => T): T {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = fn(db);
    db.exec('COMMIT;');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignore rollback errors if not in transaction
    }
    throw err;
  }
}

export function hashPassword(password: string, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const { hash } = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expectedHash, 'hex'));
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta_kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      department TEXT NOT NULL CHECK(department IN ('skincare', 'haircare')),
      description TEXT NOT NULL DEFAULT '',
      image_url TEXT DEFAULT '',
      display_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      sku TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      subtitle TEXT NOT NULL DEFAULT '',
      brand_line TEXT NOT NULL DEFAULT 'Aurelia Reserve',
      department TEXT NOT NULL CHECK(department IN ('skincare', 'haircare')),
      category TEXT NOT NULL,
      price_pkr INTEGER NOT NULL,
      discount_price_pkr INTEGER,
      volume TEXT NOT NULL DEFAULT '30 ml',
      rating REAL NOT NULL DEFAULT 5.0,
      review_count INTEGER NOT NULL DEFAULT 0,
      stock INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published', 'draft', 'archived')),
      is_best_seller INTEGER NOT NULL DEFAULT 0,
      is_new_arrival INTEGER NOT NULL DEFAULT 0,
      is_trending INTEGER NOT NULL DEFAULT 0,
      is_featured_home INTEGER NOT NULL DEFAULT 0,
      model_silhouette TEXT NOT NULL DEFAULT 'dropper',
      default_finish TEXT NOT NULL DEFAULT 'emerald',
      video_url TEXT DEFAULT '',
      data_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      product_slug TEXT NOT NULL,
      author_name TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT 'Pakistan',
      rating INTEGER NOT NULL,
      title TEXT NOT NULL,
      comment TEXT NOT NULL,
      skin_or_hair_profile TEXT NOT NULL DEFAULT '',
      verified_purchase INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('approved', 'pending', 'hidden')),
      admin_reply TEXT DEFAULT '',
      admin_replied_at TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      saved_addresses_json TEXT NOT NULL DEFAULT '[]',
      saved_routines_json TEXT NOT NULL DEFAULT '[]',
      wishlist_ids_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number TEXT UNIQUE NOT NULL,
      user_id TEXT,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_email TEXT DEFAULT '',
      shipping_address_json TEXT NOT NULL,
      payment_method TEXT NOT NULL CHECK(payment_method IN ('cod', 'whatsapp')),
      items_json TEXT NOT NULL,
      subtotal_pkr INTEGER NOT NULL,
      shipping_pkr INTEGER NOT NULL,
      discount_pkr INTEGER NOT NULL DEFAULT 0,
      tax_pkr INTEGER NOT NULL DEFAULT 0,
      coupon_code TEXT DEFAULT '',
      total_pkr INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'Confirmed',
      internal_notes TEXT DEFAULT '',
      status_history_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stock_history (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      sku TEXT DEFAULT '',
      delta INTEGER NOT NULL,
      previous_stock INTEGER NOT NULL,
      new_stock INTEGER NOT NULL,
      reason TEXT NOT NULL,
      actor_email TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS coupons (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      discount_type TEXT NOT NULL CHECK(discount_type IN ('percentage', 'fixed', 'free_shipping')),
      discount_value REAL NOT NULL DEFAULT 0,
      min_order_amount_pkr INTEGER NOT NULL DEFAULT 0,
      max_discount_pkr INTEGER,
      scope TEXT NOT NULL DEFAULT 'all',
      target_categories_json TEXT NOT NULL DEFAULT '[]',
      target_product_ids_json TEXT NOT NULL DEFAULT '[]',
      start_date TEXT DEFAULT '',
      expiry_date TEXT DEFAULT '',
      usage_limit INTEGER,
      used_count INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      show_banner INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('super_admin', 'store_manager', 'inventory_manager', 'support_agent')),
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      last_login_at TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      actor_email TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT DEFAULT '',
      details TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_agents (
      agent_key TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      personality_tone TEXT NOT NULL DEFAULT 'luxury_consultant',
      custom_instructions TEXT NOT NULL DEFAULT '',
      supported_languages_json TEXT NOT NULL DEFAULT '["english","roman_urdu","urdu"]',
      faq_knowledge_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      agent_key TEXT NOT NULL DEFAULT 'beauty_expert',
      query_text TEXT DEFAULT '',
      product_slug TEXT DEFAULT '',
      error_message TEXT DEFAULT '',
      meta_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      ticket_number TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT DEFAULT '',
      customer_phone TEXT DEFAULT '',
      subject TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'support_form',
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'escalated', 'resolved')),
      priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal', 'high')),
      assigned_agent_email TEXT DEFAULT '',
      messages_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cms_content (
      key TEXT PRIMARY KEY,
      json_value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS store_settings (
      key TEXT PRIMARY KEY,
      json_value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link_section TEXT DEFAULT 'dashboard',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS whatsapp_referrals (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      customer_phone TEXT DEFAULT '',
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

function getDefaultSettings(): StoreSettingsFull {
  return {
    brandName: 'Aurelia Botanica',
    logoUrl: '',
    whatsappNumber: (process.env.WHATSAPP_BUSINESS_NUMBER || '923001234567').replace(/\D/g, ''),
    whatsappEnabled: true,
    whatsappWelcomeMessage: 'Assalam-o-Alaikum! Welcome to Aurelia Botanica Concierge. How may we help with your skincare or haircare ritual today?',
    whatsappOrderTemplate: 'Hello! I want to confirm my Aurelia Botanica order:',
    whatsappSupportMessage: 'Hello Aurelia Botanica! I would like help placing an order or choosing products.',
    shippingFeePkr: 250,
    freeShippingThresholdPkr: 5000,
    taxPercent: 0,
    codEnabled: true,
    returnPolicyDays: 14,
    contactEmail: 'care@aureliabotanica.pk',
    promoBannerText: 'Free Nationwide Delivery above PKR 5,000 · Use code AURELIA10 for 10% off',
    promoBannerActive: true,
    lowStockThreshold: 10,
    notifyNewOrders: true,
    notifyLowStock: true,
    notifyAiErrors: true,
    aiEscalationKeywords: ['refund', 'damaged', 'complaint', 'missing parcel', 'urgent', 'speak to human', 'agent'],
    aiAutoEscalateOnLowConfidence: true,
    brandColors: {
      primary: '#1C3B2B',
      secondary: '#4A5D3F',
      accent: '#C5A059',
    },
    socialLinks: {
      instagram: 'https://instagram.com/aureliabotanica.pk',
      facebook: 'https://facebook.com/aureliabotanica.pk',
      tiktok: 'https://tiktok.com/@aureliabotanica.pk',
    },
    availableCoupons: [],
  };
}

function getDefaultCmsContent(): WebsiteContentCMS {
  return {
    heroEyebrow: 'Botanical Skincare & Haircare · Crafted for Pakistan Climates',
    heroTitle: 'Quiet Luxury Rituals for Skin & Scalp',
    heroSubtitle:
      'Cold-pressed botanical oils, barrier-loving ceramides, and clinical-grade actives in small batches—paired with 3D vessel inspection, an AI Beauty Consultant, and effortless WhatsApp or Cash on Delivery checkout.',
    heroPrimaryCta: 'Shop Skincare',
    heroSecondaryCta: 'Shop Haircare',
    heroImage: STORE_IMAGES.hero,
    heroDefaultProductSlug: 'niacinamide-saffron-glow-serum',
    heroDefaultBackdrop: 'sage',
    promoBannerText: 'Complimentary Nationwide Pakistan Courier on Orders PKR 5,000+ · Use Code AURELIA10',
    promoBannerEnabled: true,
    editorialTitle: 'From Barrier Serums to Rosemary Scalp Elixirs',
    editorialBody:
      'Every bottle is formulated without harsh sulfates or heavy silicones—calibrated for Pakistan’s sun, urban dust, and seasonal humidity shifts.',
    aboutHeading: 'Crafted in Small Batches for South Asian Climates',
    aboutStory:
      'Aurelia Botanica was founded in Lahore to bridge evidence-led cosmetic actives with heirloom botanicals like saffron, amla, rosemary, and cold-pressed olive squalane. Every batch is pH-tested, tamper-sealed, and shipped fresh nationwide.',
    contactHeading: 'Lahore Botanical Studio & Customer Care',
    contactAddress: 'Suite 14, Gulberg Galleria, Main Boulevard Gulberg III, Lahore, Pakistan',
    contactPhone: '+92 300 1234567',
    contactEmail: 'care@aureliabotanica.pk',
    contactHours: 'Monday – Saturday · 10:00 AM – 7:00 PM PKT',
    shippingPolicyBody:
      'Orders placed before 3:00 PM PKT dispatch the same business day from our temperature-controlled studio in Lahore. Major cities (Lahore, Karachi, Islamabad, Rawalpindi) arrive in 2–3 business days; nationwide regional hubs arrive in 3–5 business days.',
    returnPolicyBody:
      'Because cosmetic formulas require strict hygiene integrity, unopened bottles with intact tamper seals may be exchanged or refunded within 14 days of delivery. If a glass vessel arrives damaged in courier transit, share a photograph via WhatsApp within 48 hours for an immediate complimentary replacement.',
    privacyPolicyBody:
      'We collect only the customer details necessary to fulfill Cash on Delivery parcels, remember saved skin quiz routines, and confirm orders via WhatsApp when requested. We never sell customer phone numbers or addresses to third parties.',
    termsBody:
      'All prices are listed in Pakistani Rupees (PKR). Promotional codes apply at checkout subject to active order eligibility thresholds and usage limits.',
    faqs: [
      {
        id: 'faq-1',
        question: 'Are Aurelia Botanica products suitable for sensitive skin?',
        answer:
          'All cleansers and ceramide moisturizers are formulated without harsh sulfates or added synthetic dyes. We recommend patch-testing active acids and essential-oil blends on your inner forearm before first facial or scalp use.',
      },
      {
        id: 'faq-2',
        question: 'How do I order via WhatsApp?',
        answer:
          'Click “Order via WhatsApp” on any product page or inside your shopping bag—your selected items, PKR totals, and address pre-fill automatically in a WhatsApp message.',
      },
      {
        id: 'faq-3',
        question: 'Do your formulas diagnose or treat medical skin conditions?',
        answer:
          'No. Our products, AI analyzers, and Skin Quiz provide general cosmetic skincare and haircare guidance and are not a substitute for professional dermatological care.',
      },
    ],
    blogArticles: BEAUTY_TIPS.map((t) => ({ ...t })),
    updatedAt: new Date().toISOString(),
  };
}

function getDefaultAIAgents(): AIAgentConfig[] {
  const now = new Date().toISOString();
  const baseFaq = [
    {
      id: 'ai-faq-1',
      question: 'How fast is delivery in Lahore, Karachi, and Islamabad?',
      answer: 'Major cities deliver within 2–3 business days; other cities nationwide take 3–5 business days.',
    },
    {
      id: 'ai-faq-2',
      question: 'Can I pay Cash on Delivery?',
      answer: 'Yes! Cash on Delivery (COD) and WhatsApp-assisted checkout are available across Pakistan.',
    },
  ];
  return [
    {
      agentKey: 'beauty_expert',
      name: 'AI Beauty Expert',
      description: 'Primary conversational concierge across Skincare, Haircare, English, Urdu & Roman Urdu.',
      enabled: true,
      personalityTone: 'luxury_consultant',
      customInstructions: 'Warm, refined Pakistani luxury beauty consultant. Always cite exact catalog slugs and PKR prices.',
      supportedLanguages: ['english', 'roman_urdu', 'urdu'],
      faqKnowledge: baseFaq,
      updatedAt: now,
    },
    {
      agentKey: 'skincare_consultant',
      name: 'AI Skincare Consultant',
      description: 'Advises on acne, barrier repair, pigmentation, sunscreens, and safe active layering.',
      enabled: true,
      personalityTone: 'clinical_educator',
      customInstructions: 'Avoid recommending retinoids and high-strength acids together on the same night.',
      supportedLanguages: ['english', 'roman_urdu', 'urdu'],
      faqKnowledge: [],
      updatedAt: now,
    },
    {
      agentKey: 'haircare_consultant',
      name: 'AI Haircare Consultant',
      description: 'Specializes in hair fall, dandruff, frizz, dry scalp, curls, and rosemary scalp rituals.',
      enabled: true,
      personalityTone: 'warm_concierge',
      customInstructions: 'Distinguish cosmetic scalp care from medical alopecia.',
      supportedLanguages: ['english', 'roman_urdu', 'urdu'],
      faqKnowledge: [],
      updatedAt: now,
    },
    {
      agentKey: 'recommendation_agent',
      name: 'AI Product Recommendation Agent',
      description: 'Grounds product matching strictly on live in-stock inventory and budget constraints.',
      enabled: true,
      personalityTone: 'concise_direct',
      customInstructions: 'Only suggest in-stock published products with exact PKR pricing.',
      supportedLanguages: ['english', 'roman_urdu', 'urdu'],
      faqKnowledge: [],
      updatedAt: now,
    },
    {
      agentKey: 'routine_builder',
      name: 'AI Routine Builder',
      description: 'Generates structured Morning, Night, and Weekly Haircare routine cards.',
      enabled: true,
      personalityTone: 'clinical_educator',
      customInstructions: 'Keep routines practical (3–4 morning steps, 3–4 evening steps) and budget-aware.',
      supportedLanguages: ['english', 'roman_urdu', 'urdu'],
      faqKnowledge: [],
      updatedAt: now,
    },
    {
      agentKey: 'customer_support',
      name: 'AI Customer Support',
      description: 'Handles shipping, returns, order tracking verification, and human escalation.',
      enabled: true,
      personalityTone: 'warm_concierge',
      customInstructions: 'Verify Order Number and Phone before revealing order details; escalate damaged parcel reports.',
      supportedLanguages: ['english', 'roman_urdu', 'urdu'],
      faqKnowledge: baseFaq,
      updatedAt: now,
    },
    {
      agentKey: 'image_analyzer',
      name: 'AI Image Analyzer',
      description: 'Consent-gated facial skin and hair/scalp cosmetic photo observation module.',
      enabled: true,
      personalityTone: 'clinical_educator',
      customInstructions: 'Strictly cosmetic observations only; never provide a medical diagnosis.',
      supportedLanguages: ['english', 'roman_urdu', 'urdu'],
      faqKnowledge: [],
      updatedAt: now,
    },
    {
      agentKey: 'shopping_assistant',
      name: 'AI Shopping Assistant',
      description: 'Handles add-to-cart, coupon validation, bag totals, and WhatsApp order drafts.',
      enabled: true,
      personalityTone: 'concise_direct',
      customInstructions: 'Always ask customer confirmation before finalizing WhatsApp dispatch.',
      supportedLanguages: ['english', 'roman_urdu', 'urdu'],
      faqKnowledge: [],
      updatedAt: now,
    },
  ];
}

function insertProductRow(db: DatabaseSync, p: Product, nowIso: string): void {
  const status = p.status || 'published';
  const sku = p.sku || `AB-${p.department === 'skincare' ? 'SK' : 'HC'}-${p.id.toUpperCase()}`;
  const fullData: Product = {
    ...p,
    sku,
    status,
    isFeaturedHome: p.isFeaturedHome ?? Boolean(p.isBestSeller || p.isTrending),
    createdAt: p.createdAt || nowIso,
    updatedAt: nowIso,
  };
  delete fullData.reviews;

  db.prepare(`
    INSERT INTO products (
      id, slug, sku, name, subtitle, brand_line, department, category,
      price_pkr, discount_price_pkr, volume, rating, review_count, stock,
      status, is_best_seller, is_new_arrival, is_trending, is_featured_home,
      model_silhouette, default_finish, video_url, data_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    fullData.id,
    fullData.slug,
    fullData.sku || '',
    fullData.name,
    fullData.subtitle || '',
    fullData.brandLine || 'Aurelia Reserve',
    fullData.department,
    fullData.category,
    Math.round(fullData.pricePkr),
    fullData.discountPricePkr ? Math.round(fullData.discountPricePkr) : null,
    fullData.volume || '30 ml',
    fullData.rating ?? 5.0,
    fullData.reviewCount ?? 0,
    Math.max(0, Math.round(fullData.stock ?? 0)),
    status,
    fullData.isBestSeller ? 1 : 0,
    fullData.isNewArrival ? 1 : 0,
    fullData.isTrending ? 1 : 0,
    fullData.isFeaturedHome ? 1 : 0,
    fullData.modelSilhouette || 'dropper',
    fullData.defaultFinish || 'emerald',
    fullData.videoUrl || '',
    JSON.stringify(fullData),
    fullData.createdAt!,
    fullData.updatedAt!,
  );
}

function seedAndMigrateIfNeeded(db: DatabaseSync): void {
  const nowIso = new Date().toISOString();

  // 1. Seed categories if empty
  const catCount = (db.prepare('SELECT COUNT(*) as cnt FROM categories').get() as { cnt: number }).cnt;
  if (catCount === 0) {
    const insertCat = db.prepare(
      'INSERT INTO categories (id, slug, name, department, description, display_order, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
    );
    SKINCARE_CATEGORIES.forEach((name, idx) => {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      insertCat.run(`cat-sk-${idx + 1}`, slug, name, 'skincare', `Small-batch botanical ${name.toLowerCase()} calibrated for daily comfort.`, idx + 1);
    });
    HAIRCARE_CATEGORIES.forEach((name, idx) => {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      insertCat.run(`cat-hc-${idx + 1}`, slug, name, 'haircare', `Silicone-light botanical ${name.toLowerCase()} for strength and shine.`, idx + 1);
    });
  }

  // 2. Seed / migrate products, reviews, customers, orders
  const prodCount = (db.prepare('SELECT COUNT(*) as cnt FROM products').get() as { cnt: number }).cnt;
  if (prodCount === 0) {
    interface LegacyJson {
      products?: Product[];
      reviews?: Record<string, ProductReview[]>;
      users?: StoredCustomer[];
      orders?: OrderRecord[];
      orderSequence?: number;
    }

    let legacy: LegacyJson | null = null;
    if (fs.existsSync(LEGACY_JSON_FILE)) {
      try {
        legacy = JSON.parse(fs.readFileSync(LEGACY_JSON_FILE, 'utf-8')) as LegacyJson;
      } catch {
        legacy = null;
      }
    }

    const productsToSeed =
      legacy?.products && legacy.products.length > 0 ? legacy.products : INITIAL_PRODUCTS;
    const reviewsToSeed =
      legacy?.reviews && Object.keys(legacy.reviews).length > 0 ? legacy.reviews : INITIAL_REVIEWS;

    for (const p of productsToSeed) {
      insertProductRow(db, p, nowIso);
    }

    const prodIdBySlug = new Map(productsToSeed.map((p) => [p.slug, p.id]));
    const insertReview = db.prepare(`
      INSERT OR IGNORE INTO reviews (
        id, product_id, product_slug, author_name, city, rating, title, comment,
        skin_or_hair_profile, verified_purchase, status, admin_reply, admin_replied_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const [slug, list] of Object.entries(reviewsToSeed)) {
      const pid = prodIdBySlug.get(slug) || slug;
      for (const r of list) {
        insertReview.run(
          r.id,
          pid,
          slug,
          r.authorName,
          r.city || 'Pakistan',
          r.rating,
          r.title || 'Customer Review',
          r.comment,
          r.skinOrHairProfile || '',
          r.verifiedPurchase ? 1 : 0,
          r.status || 'approved',
          r.adminReply || '',
          r.adminRepliedAt || '',
          r.createdAt || nowIso,
        );
      }
    }

    if (legacy?.users) {
      const insertCust = db.prepare(`
        INSERT OR IGNORE INTO customers (
          id, name, email, phone, password_hash, password_salt, is_active,
          saved_addresses_json, saved_routines_json, wishlist_ids_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
      `);
      for (const u of legacy.users) {
        insertCust.run(
          u.id,
          u.name,
          u.email.toLowerCase(),
          u.phone || '',
          u.passwordHash,
          u.passwordSalt,
          JSON.stringify(u.savedAddresses || []),
          JSON.stringify(u.savedRoutines || []),
          JSON.stringify(u.wishlistIds || []),
          u.createdAt || nowIso,
        );
      }
    }

    if (legacy?.orders) {
      const insertOrd = db.prepare(`
        INSERT OR IGNORE INTO orders (
          id, order_number, user_id, customer_name, customer_phone, customer_email,
          shipping_address_json, payment_method, items_json, subtotal_pkr, shipping_pkr,
          discount_pkr, tax_pkr, coupon_code, total_pkr, status, internal_notes,
          status_history_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const o of legacy.orders) {
        insertOrd.run(
          o.id,
          o.orderNumber,
          o.userId || null,
          o.customerName,
          o.customerPhone,
          o.customerEmail || '',
          JSON.stringify(o.shippingAddress),
          o.paymentMethod || 'cod',
          JSON.stringify(o.items || []),
          o.subtotalPkr,
          o.shippingPkr,
          o.discountPkr || 0,
          o.taxPkr || 0,
          o.couponCode || '',
          o.totalPkr,
          o.status || 'Confirmed',
          o.internalNotes || '',
          JSON.stringify(
            o.statusHistory || [{ status: o.status || 'Confirmed', changedAt: o.createdAt || nowIso }],
          ),
          o.createdAt || nowIso,
          o.updatedAt || o.createdAt || nowIso,
        );
      }
    }

    const seq = legacy?.orderSequence || 1041;
    db.prepare('INSERT OR REPLACE INTO meta_kv (key, value) VALUES (?, ?)').run('orderSequence', String(seq));
  }

  // Ensure orderSequence & ticketSequence exist
  db.prepare('INSERT OR IGNORE INTO meta_kv (key, value) VALUES (?, ?)').run('orderSequence', '1041');
  db.prepare('INSERT OR IGNORE INTO meta_kv (key, value) VALUES (?, ?)').run('ticketSequence', '500');

  // 3. Seed default coupons if empty
  const couponCount = (db.prepare('SELECT COUNT(*) as cnt FROM coupons').get() as { cnt: number }).cnt;
  if (couponCount === 0) {
    const insertCoupon = db.prepare(`
      INSERT INTO coupons (
        id, code, description, discount_type, discount_value, min_order_amount_pkr,
        max_discount_pkr, scope, target_categories_json, target_product_ids_json,
        start_date, expiry_date, usage_limit, used_count, is_active, show_banner, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertCoupon.run(
      'cpn-aurelia10',
      'AURELIA10',
      '10% off your entire skincare & haircare bag',
      'percentage',
      10,
      0,
      2500,
      'all',
      '[]',
      '[]',
      '',
      '',
      null,
      0,
      1,
      1,
      nowIso,
    );
    insertCoupon.run(
      'cpn-glow500',
      'GLOW500',
      'PKR 500 off orders PKR 3,500 or more',
      'fixed',
      500,
      3500,
      500,
      'all',
      '[]',
      '[]',
      '',
      '',
      null,
      0,
      1,
      1,
      nowIso,
    );
    insertCoupon.run(
      'cpn-freeship',
      'FREESHIP',
      'Complimentary nationwide Pakistan delivery',
      'free_shipping',
      0,
      0,
      null,
      'all',
      '[]',
      '[]',
      '',
      '',
      null,
      0,
      1,
      0,
      nowIso,
    );
  }

  // 4. Seed store_settings if empty
  const settingsRow = db.prepare("SELECT key FROM store_settings WHERE key = 'main'").get();
  if (!settingsRow) {
    db.prepare('INSERT INTO store_settings (key, json_value, updated_at) VALUES (?, ?, ?)').run(
      'main',
      JSON.stringify(getDefaultSettings()),
      nowIso,
    );
  }

  // 5. Seed cms_content if empty
  const cmsRow = db.prepare("SELECT key FROM cms_content WHERE key = 'main'").get();
  if (!cmsRow) {
    db.prepare('INSERT INTO cms_content (key, json_value, updated_at) VALUES (?, ?, ?)').run(
      'main',
      JSON.stringify(getDefaultCmsContent()),
      nowIso,
    );
  }

  // 6. Seed 8 AI Agents if empty
  const aiCount = (db.prepare('SELECT COUNT(*) as cnt FROM ai_agents').get() as { cnt: number }).cnt;
  if (aiCount === 0) {
    const insertAgent = db.prepare(`
      INSERT INTO ai_agents (
        agent_key, name, description, enabled, personality_tone,
        custom_instructions, supported_languages_json, faq_knowledge_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const agent of getDefaultAIAgents()) {
      insertAgent.run(
        agent.agentKey,
        agent.name,
        agent.description,
        agent.enabled ? 1 : 0,
        agent.personalityTone,
        agent.customInstructions,
        JSON.stringify(agent.supportedLanguages),
        JSON.stringify(agent.faqKnowledge),
        agent.updatedAt,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// STORE SETTINGS & CMS HELPERS
// ---------------------------------------------------------------------------

export function getStoreSettings(): StoreSettingsFull {
  const db = getDb();
  const row = db.prepare("SELECT json_value FROM store_settings WHERE key = 'main'").get() as
    | { json_value: string }
    | undefined;
  const parsed = row ? (JSON.parse(row.json_value) as StoreSettingsFull) : getDefaultSettings();
  const activeCoupons = listCoupons(true)
    .filter((c) => c.showBanner || ['AURELIA10', 'GLOW500', 'FREESHIP'].includes(c.code))
    .map((c) => ({ code: c.code, description: c.description }));
  return {
    ...getDefaultSettings(),
    ...parsed,
    availableCoupons: activeCoupons,
  };
}

export function getPublicStoreConfig(): StoreConfig {
  const full = getStoreSettings();
  return {
    brandName: full.brandName,
    logoUrl: full.logoUrl,
    whatsappNumber: full.whatsappNumber,
    whatsappEnabled: full.whatsappEnabled,
    whatsappWelcomeMessage: full.whatsappWelcomeMessage,
    whatsappOrderTemplate: full.whatsappOrderTemplate,
    whatsappSupportMessage: full.whatsappSupportMessage,
    shippingFeePkr: full.shippingFeePkr,
    freeShippingThresholdPkr: full.freeShippingThresholdPkr,
    taxPercent: full.taxPercent,
    codEnabled: full.codEnabled,
    returnPolicyDays: full.returnPolicyDays,
    contactEmail: full.contactEmail,
    promoBannerText: full.promoBannerText,
    promoBannerActive: full.promoBannerActive,
    brandColors: full.brandColors,
    socialLinks: full.socialLinks,
    availableCoupons: full.availableCoupons,
  };
}

export function updateStoreSettings(patch: Partial<StoreSettingsFull>): StoreSettingsFull {
  const db = getDb();
  const current = getStoreSettings();
  const next: StoreSettingsFull = {
    ...current,
    ...patch,
    brandColors: {
      primary: patch.brandColors?.primary || current.brandColors?.primary || '#1C3B2B',
      secondary: patch.brandColors?.secondary || current.brandColors?.secondary || '#4A5D3F',
      accent: patch.brandColors?.accent || current.brandColors?.accent || '#C5A059',
    },
    socialLinks: { ...current.socialLinks, ...(patch.socialLinks || {}) },
    whatsappNumber: (patch.whatsappNumber ?? current.whatsappNumber).replace(/\D/g, ''),
  };
  db.prepare('INSERT OR REPLACE INTO store_settings (key, json_value, updated_at) VALUES (?, ?, ?)').run(
    'main',
    JSON.stringify(next),
    new Date().toISOString(),
  );
  return getStoreSettings();
}

export function getCmsContent(): WebsiteContentCMS {
  const db = getDb();
  const row = db.prepare("SELECT json_value FROM cms_content WHERE key = 'main'").get() as
    | { json_value: string }
    | undefined;
  return row ? { ...getDefaultCmsContent(), ...(JSON.parse(row.json_value) as WebsiteContentCMS) } : getDefaultCmsContent();
}

export function updateCmsContent(patch: Partial<WebsiteContentCMS>): WebsiteContentCMS {
  const db = getDb();
  const current = getCmsContent();
  const next: WebsiteContentCMS = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  db.prepare('INSERT OR REPLACE INTO cms_content (key, json_value, updated_at) VALUES (?, ?, ?)').run(
    'main',
    JSON.stringify(next),
    next.updatedAt,
  );
  return next;
}

// ---------------------------------------------------------------------------
// CATEGORIES
// ---------------------------------------------------------------------------

export function listCategories(includeCounts = false): CategoryRecord[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM categories ORDER BY department ASC, display_order ASC, name ASC')
    .all() as {
    id: string;
    slug: string;
    name: string;
    department: 'skincare' | 'haircare';
    description: string;
    image_url: string;
    display_order: number;
    is_active: number;
  }[];

  let countMap = new Map<string, number>();
  if (includeCounts) {
    const counts = db
      .prepare('SELECT category, COUNT(*) as cnt FROM products GROUP BY category')
      .all() as { category: string; cnt: number }[];
    countMap = new Map(counts.map((c) => [c.category, c.cnt]));
  }

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    department: r.department,
    description: r.description,
    imageUrl: r.image_url || undefined,
    displayOrder: r.display_order,
    isActive: r.is_active === 1,
    productCount: includeCounts ? countMap.get(r.name) || 0 : undefined,
  }));
}

export function createCategory(input: Partial<CategoryRecord>): CategoryRecord {
  const db = getDb();
  const name = (input.name || '').trim();
  const department = input.department === 'haircare' ? 'haircare' : 'skincare';
  const slug =
    (input.slug || name)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || `cat-${crypto.randomUUID().slice(0, 6)}`;
  const id = `cat-${crypto.randomUUID().slice(0, 8)}`;
  const maxOrder = (
    db.prepare('SELECT COALESCE(MAX(display_order), 0) as m FROM categories WHERE department = ?').get(department) as {
      m: number;
    }
  ).m;
  const displayOrder = typeof input.displayOrder === 'number' ? input.displayOrder : maxOrder + 1;
  db.prepare(
    'INSERT INTO categories (id, slug, name, department, description, image_url, display_order, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    id,
    slug,
    name,
    department,
    (input.description || '').trim(),
    input.imageUrl || '',
    displayOrder,
    input.isActive === false ? 0 : 1,
  );
  return listCategories(true).find((c) => c.id === id)!;
}

export function updateCategory(id: string, patch: Partial<CategoryRecord>): CategoryRecord | null {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as
    | { id: string; name: string; department: string; description: string; image_url: string; display_order: number; is_active: number }
    | undefined;
  if (!existing) return null;

  const nextName = patch.name?.trim() || existing.name;
  const nextDept = patch.department === 'haircare' ? 'haircare' : patch.department === 'skincare' ? 'skincare' : existing.department;
  const nextDesc = patch.description !== undefined ? patch.description.trim() : existing.description;
  const nextImg = patch.imageUrl !== undefined ? patch.imageUrl : existing.image_url;
  const nextOrder = typeof patch.displayOrder === 'number' ? patch.displayOrder : existing.display_order;
  const nextActive = typeof patch.isActive === 'boolean' ? (patch.isActive ? 1 : 0) : existing.is_active;

  withTransaction(() => {
    db.prepare(
      'UPDATE categories SET name = ?, department = ?, description = ?, image_url = ?, display_order = ?, is_active = ? WHERE id = ?',
    ).run(nextName, nextDept, nextDesc, nextImg, nextOrder, nextActive, id);

    if (nextName !== existing.name) {
      db.prepare('UPDATE products SET category = ? WHERE category = ?').run(nextName, existing.name);
      const affected = db.prepare('SELECT id, data_json FROM products WHERE category = ?').all(nextName) as {
        id: string;
        data_json: string;
      }[];
      for (const row of affected) {
        const parsed = JSON.parse(row.data_json) as Product;
        parsed.category = nextName;
        db.prepare('UPDATE products SET data_json = ? WHERE id = ?').run(JSON.stringify(parsed), row.id);
      }
    }
  });

  return listCategories(true).find((c) => c.id === id) || null;
}

export function deleteCategory(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  return Number(result.changes) > 0;
}

// ---------------------------------------------------------------------------
// PRODUCTS & REVIEWS
// ---------------------------------------------------------------------------

function mapProductRow(row: {
  id: string;
  slug: string;
  sku: string;
  name: string;
  subtitle: string;
  brand_line: string;
  department: 'skincare' | 'haircare';
  category: string;
  price_pkr: number;
  discount_price_pkr: number | null;
  volume: string;
  rating: number;
  review_count: number;
  stock: number;
  status: 'published' | 'draft' | 'archived';
  is_best_seller: number;
  is_new_arrival: number;
  is_trending: number;
  is_featured_home: number;
  model_silhouette: Product['modelSilhouette'];
  default_finish: Product['defaultFinish'];
  video_url: string;
  data_json: string;
  created_at: string;
  updated_at: string;
}): Product {
  const parsed = JSON.parse(row.data_json) as Product;
  return {
    ...parsed,
    id: row.id,
    slug: row.slug,
    sku: row.sku || parsed.sku,
    name: row.name,
    subtitle: row.subtitle,
    brandLine: row.brand_line,
    department: row.department,
    category: row.category,
    pricePkr: row.price_pkr,
    discountPricePkr: row.discount_price_pkr ?? undefined,
    volume: row.volume,
    rating: row.rating,
    reviewCount: row.review_count,
    stock: row.stock,
    status: row.status,
    isBestSeller: row.is_best_seller === 1,
    isNewArrival: row.is_new_arrival === 1,
    isTrending: row.is_trending === 1,
    isFeaturedHome: row.is_featured_home === 1,
    modelSilhouette: row.model_silhouette,
    defaultFinish: row.default_finish,
    videoUrl: row.video_url || parsed.videoUrl || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listProducts(options?: { includeUnpublished?: boolean; includeReviews?: boolean }): Product[] {
  const db = getDb();
  const where = options?.includeUnpublished ? '' : "WHERE status = 'published'";
  const rows = db.prepare(`SELECT * FROM products ${where} ORDER BY created_at DESC`).all() as Parameters<
    typeof mapProductRow
  >[0][];
  const products = rows.map(mapProductRow);

  if (!options?.includeReviews) {
    return products;
  }

  const reviewRows = db
    .prepare(
      options?.includeUnpublished
        ? 'SELECT * FROM reviews ORDER BY created_at DESC'
        : "SELECT * FROM reviews WHERE status = 'approved' ORDER BY created_at DESC",
    )
    .all() as {
    id: string;
    product_slug: string;
    author_name: string;
    city: string;
    rating: number;
    title: string;
    comment: string;
    skin_or_hair_profile: string;
    verified_purchase: number;
    status: 'approved' | 'pending' | 'hidden';
    admin_reply: string;
    admin_replied_at: string;
    created_at: string;
  }[];

  const reviewsBySlug = new Map<string, ProductReview[]>();
  for (const r of reviewRows) {
    const list = reviewsBySlug.get(r.product_slug) || [];
    list.push({
      id: r.id,
      authorName: r.author_name,
      city: r.city,
      rating: r.rating,
      title: r.title,
      comment: r.comment,
      skinOrHairProfile: r.skin_or_hair_profile,
      verifiedPurchase: r.verified_purchase === 1,
      status: r.status,
      adminReply: r.admin_reply || undefined,
      adminRepliedAt: r.admin_replied_at || undefined,
      createdAt: r.created_at,
    });
    reviewsBySlug.set(r.product_slug, list);
  }

  return products.map((p) => ({
    ...p,
    reviews: reviewsBySlug.get(p.slug) || [],
  }));
}

export function getProductBySlug(slug: string, includeUnpublished = false): Product | null {
  const db = getDb();
  const row = (
    includeUnpublished
      ? db.prepare('SELECT * FROM products WHERE slug = ?').get(slug)
      : db.prepare("SELECT * FROM products WHERE slug = ? AND status = 'published'").get(slug)
  ) as Parameters<typeof mapProductRow>[0] | undefined;
  if (!row) return null;
  const prod = mapProductRow(row);
  const reviews = db
    .prepare("SELECT * FROM reviews WHERE product_slug = ? AND status = 'approved' ORDER BY created_at DESC")
    .all(slug) as {
    id: string;
    author_name: string;
    city: string;
    rating: number;
    title: string;
    comment: string;
    skin_or_hair_profile: string;
    verified_purchase: number;
    status: 'approved' | 'pending' | 'hidden';
    admin_reply: string;
    admin_replied_at: string;
    created_at: string;
  }[];
  prod.reviews = reviews.map((r) => ({
    id: r.id,
    authorName: r.author_name,
    city: r.city,
    rating: r.rating,
    title: r.title,
    comment: r.comment,
    skinOrHairProfile: r.skin_or_hair_profile,
    verifiedPurchase: r.verified_purchase === 1,
    status: r.status,
    adminReply: r.admin_reply || undefined,
    adminRepliedAt: r.admin_replied_at || undefined,
    createdAt: r.created_at,
  }));
  return prod;
}

export function getProductById(id: string): Product | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as
    | Parameters<typeof mapProductRow>[0]
    | undefined;
  return row ? mapProductRow(row) : null;
}

export function createProduct(body: Partial<Product>, actorEmail = 'admin@aureliabotanica.pk'): Product {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const baseSlug = (body.slug || body.name || 'product')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const slugConflict = db.prepare('SELECT id FROM products WHERE slug = ?').get(baseSlug);
  const uniqueSlug = slugConflict ? `${baseSlug}-${crypto.randomUUID().slice(0, 4)}` : baseSlug;

  const dept = body.department === 'haircare' ? 'haircare' : 'skincare';
  const fallbackImg =
    dept === 'haircare'
      ? '/src/assets/images/haircare_elixir_ritual_1795173203621.jpg'
      : '/src/assets/images/skincare_serum_dropper_1795173202035.jpg';

  const id = `prod-${crypto.randomUUID().slice(0, 8)}`;
  const sku = (body.sku || `AB-${dept === 'skincare' ? 'SK' : 'HC'}-${id.slice(-4).toUpperCase()}`).trim();
  const stock = Math.max(0, Math.round(Number(body.stock ?? 25)));
  const pricePkr = Math.round(Number(body.pricePkr));

  const created: Product = {
    id,
    slug: uniqueSlug,
    sku,
    name: (body.name || 'Botanical Formulation').trim(),
    subtitle: body.subtitle?.trim() || 'Small-batch botanical formulation',
    brandLine: body.brandLine?.trim() || 'Aurelia Reserve',
    department: dept,
    category: (body.category || (dept === 'skincare' ? 'Serums' : 'Hair Oils')).trim(),
    pricePkr,
    discountPricePkr:
      typeof body.discountPricePkr === 'number' && body.discountPricePkr > 0 && body.discountPricePkr < pricePkr
        ? Math.round(body.discountPricePkr)
        : undefined,
    volume: body.volume?.trim() || '50 ml',
    rating: 4.9,
    reviewCount: 0,
    stock,
    status: body.status || 'published',
    isBestSeller: Boolean(body.isBestSeller),
    isNewArrival: body.isNewArrival ?? true,
    isTrending: Boolean(body.isTrending),
    isFeaturedHome: Boolean(body.isFeaturedHome ?? body.isBestSeller),
    suitableTypes:
      Array.isArray(body.suitableTypes) && body.suitableTypes.length > 0 ? body.suitableTypes : ['Normal Skin'],
    concerns: Array.isArray(body.concerns) && body.concerns.length > 0 ? body.concerns : ['Daily Care'],
    keyIngredients:
      Array.isArray(body.keyIngredients) && body.keyIngredients.length > 0
        ? body.keyIngredients
        : ['Botanical Complex'],
    fullIngredientList: body.fullIngredientList?.trim() || 'Aqua, Glycerin, Botanical Extracts, Tocopherol.',
    ingredientNotes:
      Array.isArray(body.ingredientNotes) && body.ingredientNotes.length > 0
        ? body.ingredientNotes
        : [{ name: body.keyIngredients?.[0] || 'Botanical Active', role: 'Core conditioning complex' }],
    description: body.description?.trim() || 'Crafted in small batches for gentle everyday skin & hair wellness.',
    benefits:
      Array.isArray(body.benefits) && body.benefits.length > 0
        ? body.benefits
        : ['Supports barrier comfort and natural radiance'],
    howToUse: body.howToUse?.trim() || 'Apply gently as directed on clean skin or damp hair.',
    routineTime: body.routineTime || 'Morning & Night',
    precautions: body.precautions?.trim() || 'For external cosmetic use only. Patch test before first use.',
    images: Array.isArray(body.images) && body.images.length > 0 ? body.images : [fallbackImg],
    videoUrl: body.videoUrl?.trim() || undefined,
    variants: Array.isArray(body.variants) ? body.variants : [],
    modelSilhouette: body.modelSilhouette || (dept === 'haircare' ? 'pump' : 'dropper'),
    defaultFinish: body.defaultFinish || (dept === 'haircare' ? 'olive' : 'emerald'),
    modelConfig: body.modelConfig,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  withTransaction(() => {
    insertProductRow(db, created, nowIso);
    recordStockHistoryEntry(db, {
      productId: created.id,
      productName: created.name,
      sku: created.sku,
      delta: stock,
      previousStock: 0,
      newStock: stock,
      reason: 'Initial catalog creation',
      actorEmail,
    });
  });

  return getProductById(created.id)!;
}

export function updateProduct(
  id: string,
  patch: Partial<Product> & { stockReason?: string },
  actorEmail = 'admin@aureliabotanica.pk',
): Product | null {
  const db = getDb();
  const current = getProductById(id);
  if (!current) return null;

  const nowIso = new Date().toISOString();
  const nextPrice =
    typeof patch.pricePkr === 'number' && patch.pricePkr > 0 ? Math.round(patch.pricePkr) : current.pricePkr;

  let nextDiscount = current.discountPricePkr;
  if (patch.discountPricePkr === null || patch.discountPricePkr === 0) {
    nextDiscount = undefined;
  } else if (typeof patch.discountPricePkr === 'number' && patch.discountPricePkr > 0 && patch.discountPricePkr < nextPrice) {
    nextDiscount = Math.round(patch.discountPricePkr);
  }

  const nextStock =
    typeof patch.stock === 'number' && patch.stock >= 0 ? Math.round(patch.stock) : current.stock;

  const updated: Product = {
    ...current,
    ...patch,
    id: current.id,
    slug: current.slug,
    pricePkr: nextPrice,
    discountPricePkr: nextDiscount,
    stock: nextStock,
    images: Array.isArray(patch.images) && patch.images.length > 0 ? patch.images : current.images,
    videoUrl: patch.videoUrl !== undefined ? patch.videoUrl?.trim() || undefined : current.videoUrl,
    modelConfig: patch.modelConfig !== undefined ? patch.modelConfig : current.modelConfig,
    updatedAt: nowIso,
  };
  delete updated.reviews;

  withTransaction(() => {
    db.prepare(`
      UPDATE products SET
        sku = ?, name = ?, subtitle = ?, brand_line = ?, department = ?, category = ?,
        price_pkr = ?, discount_price_pkr = ?, volume = ?, stock = ?, status = ?,
        is_best_seller = ?, is_new_arrival = ?, is_trending = ?, is_featured_home = ?,
        model_silhouette = ?, default_finish = ?, video_url = ?, data_json = ?, updated_at = ?
      WHERE id = ?
    `).run(
      updated.sku || '',
      updated.name,
      updated.subtitle,
      updated.brandLine,
      updated.department,
      updated.category,
      updated.pricePkr,
      updated.discountPricePkr ?? null,
      updated.volume,
      updated.stock,
      updated.status || 'published',
      updated.isBestSeller ? 1 : 0,
      updated.isNewArrival ? 1 : 0,
      updated.isTrending ? 1 : 0,
      updated.isFeaturedHome ? 1 : 0,
      updated.modelSilhouette,
      updated.defaultFinish,
      updated.videoUrl || '',
      JSON.stringify(updated),
      nowIso,
      id,
    );

    if (nextStock !== current.stock) {
      recordStockHistoryEntry(db, {
        productId: current.id,
        productName: updated.name,
        sku: updated.sku,
        delta: nextStock - current.stock,
        previousStock: current.stock,
        newStock: nextStock,
        reason: patch.stockReason || 'Manual catalog update',
        actorEmail,
      });
      checkAndNotifyLowStock(db, updated);
    }
  });

  return getProductById(id);
}

export function deleteProduct(id: string): boolean {
  const db = getDb();
  const res = db.prepare('DELETE FROM products WHERE id = ?').run(id);
  return Number(res.changes) > 0;
}

export function recordStockHistoryEntry(
  db: DatabaseSync,
  entry: Omit<StockHistoryEntry, 'id' | 'createdAt'>,
): void {
  db.prepare(`
    INSERT INTO stock_history (
      id, product_id, product_name, sku, delta, previous_stock, new_stock, reason, actor_email, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `stk-${crypto.randomUUID().slice(0, 8)}`,
    entry.productId,
    entry.productName,
    entry.sku || '',
    entry.delta,
    entry.previousStock,
    entry.newStock,
    entry.reason,
    entry.actorEmail,
    new Date().toISOString(),
  );
}

export function listStockHistory(limit = 100): StockHistoryEntry[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM stock_history ORDER BY created_at DESC LIMIT ?').all(limit) as {
    id: string;
    product_id: string;
    product_name: string;
    sku: string;
    delta: number;
    previous_stock: number;
    new_stock: number;
    reason: string;
    actor_email: string;
    created_at: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    productId: r.product_id,
    productName: r.product_name,
    sku: r.sku || undefined,
    delta: r.delta,
    previousStock: r.previous_stock,
    newStock: r.new_stock,
    reason: r.reason,
    actorEmail: r.actor_email,
    createdAt: r.created_at,
  }));
}

function checkAndNotifyLowStock(db: DatabaseSync, product: Product): void {
  const settingsRow = db.prepare("SELECT json_value FROM store_settings WHERE key = 'main'").get() as
    | { json_value: string }
    | undefined;
  const threshold = settingsRow ? (JSON.parse(settingsRow.json_value) as StoreSettingsFull).lowStockThreshold ?? 10 : 10;
  if (product.stock <= threshold) {
    createNotification(db, {
      type: 'low_stock',
      title: product.stock === 0 ? `Out of Stock: ${product.name}` : `Low Stock Alert: ${product.name}`,
      message: `${product.name} (${product.sku || product.slug}) has ${product.stock} units remaining.`,
      linkSection: 'inventory',
    });
  }
}

export function addCustomerReview(
  slug: string,
  input: {
    authorName: string;
    city?: string;
    rating: number;
    title?: string;
    comment: string;
    skinOrHairProfile?: string;
  },
): { review: ProductReview; product: Product } | null {
  const db = getDb();
  const product = getProductBySlug(slug, true);
  if (!product) return null;

  const newReview: ProductReview = {
    id: `rev-${crypto.randomUUID().slice(0, 8)}`,
    authorName: input.authorName.trim(),
    city: input.city?.trim() || 'Pakistan',
    rating: Math.max(1, Math.min(5, Math.round(input.rating))),
    title: input.title?.trim() || 'Customer Review',
    comment: input.comment.trim(),
    skinOrHairProfile: input.skinOrHairProfile?.trim() || String(product.suitableTypes[0] || 'Customer'),
    verifiedPurchase: false,
    status: 'approved',
    createdAt: new Date().toISOString(),
  };

  withTransaction(() => {
    db.prepare(`
      INSERT INTO reviews (
        id, product_id, product_slug, author_name, city, rating, title, comment,
        skin_or_hair_profile, verified_purchase, status, admin_reply, admin_replied_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'approved', '', '', ?)
    `).run(
      newReview.id,
      product.id,
      product.slug,
      newReview.authorName,
      newReview.city,
      newReview.rating,
      newReview.title,
      newReview.comment,
      newReview.skinOrHairProfile,
      newReview.createdAt,
    );

    recalculateProductRating(db, product.slug);
    createNotification(db, {
      type: 'review',
      title: `New ${newReview.rating}-Star Review`,
      message: `${newReview.authorName} reviewed ${product.name}: "${newReview.title}"`,
      linkSection: 'reviews',
    });
  });

  return { review: newReview, product: getProductBySlug(slug, true)! };
}

function recalculateProductRating(db: DatabaseSync, slug: string): void {
  const approved = db
    .prepare("SELECT rating FROM reviews WHERE product_slug = ? AND status = 'approved'")
    .all(slug) as { rating: number }[];
  if (approved.length === 0) return;
  const avg = approved.reduce((acc, r) => acc + r.rating, 0) / approved.length;
  db.prepare('UPDATE products SET rating = ?, review_count = ? WHERE slug = ?').run(
    Number(avg.toFixed(1)),
    approved.length,
    slug,
  );
}

export function listAllReviewsForAdmin(): ReviewModerationRecord[] {
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT r.*, COALESCE(p.name, r.product_slug) as product_name
      FROM reviews r
      LEFT JOIN products p ON p.slug = r.product_slug
      ORDER BY r.created_at DESC
    `)
    .all() as {
    id: string;
    product_id: string;
    product_slug: string;
    product_name: string;
    author_name: string;
    city: string;
    rating: number;
    title: string;
    comment: string;
    skin_or_hair_profile: string;
    verified_purchase: number;
    status: 'approved' | 'pending' | 'hidden';
    admin_reply: string;
    admin_replied_at: string;
    created_at: string;
  }[];

  return rows.map((r) => ({
    id: r.id,
    productId: r.product_id,
    productSlug: r.product_slug,
    productName: r.product_name,
    authorName: r.author_name,
    city: r.city,
    rating: r.rating,
    title: r.title,
    comment: r.comment,
    skinOrHairProfile: r.skin_or_hair_profile,
    verifiedPurchase: r.verified_purchase === 1,
    status: r.status,
    adminReply: r.admin_reply || undefined,
    adminRepliedAt: r.admin_replied_at || undefined,
    createdAt: r.created_at,
  }));
}

export function moderateReview(
  id: string,
  patch: { status?: 'approved' | 'pending' | 'hidden'; adminReply?: string },
): ReviewModerationRecord | null {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM reviews WHERE id = ?').get(id) as
    | { id: string; product_slug: string; status: string; admin_reply: string; admin_replied_at: string }
    | undefined;
  if (!existing) return null;

  const nextStatus = patch.status || existing.status;
  const nextReply = patch.adminReply !== undefined ? patch.adminReply.trim() : existing.admin_reply;
  const nextRepliedAt =
    patch.adminReply !== undefined && patch.adminReply.trim()
      ? new Date().toISOString()
      : existing.admin_replied_at;

  withTransaction(() => {
    db.prepare('UPDATE reviews SET status = ?, admin_reply = ?, admin_replied_at = ? WHERE id = ?').run(
      nextStatus,
      nextReply,
      nextRepliedAt,
      id,
    );
    recalculateProductRating(db, existing.product_slug);
  });

  return listAllReviewsForAdmin().find((r) => r.id === id) || null;
}

export function deleteReview(id: string): boolean {
  const db = getDb();
  const row = db.prepare('SELECT product_slug FROM reviews WHERE id = ?').get(id) as
    | { product_slug: string }
    | undefined;
  if (!row) return false;
  withTransaction(() => {
    db.prepare('DELETE FROM reviews WHERE id = ?').run(id);
    recalculateProductRating(db, row.product_slug);
  });
  return true;
}

// ---------------------------------------------------------------------------
// COUPONS & PROMOTIONS
// ---------------------------------------------------------------------------

export function listCoupons(onlyActive = false): CouponRecord[] {
  const db = getDb();
  const where = onlyActive ? 'WHERE is_active = 1' : '';
  const rows = db.prepare(`SELECT * FROM coupons ${where} ORDER BY created_at DESC`).all() as {
    id: string;
    code: string;
    description: string;
    discount_type: CouponRecord['discountType'];
    discount_value: number;
    min_order_amount_pkr: number;
    max_discount_pkr: number | null;
    scope: CouponRecord['scope'];
    target_categories_json: string;
    target_product_ids_json: string;
    start_date: string;
    expiry_date: string;
    usage_limit: number | null;
    used_count: number;
    is_active: number;
    show_banner: number;
    created_at: string;
  }[];

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    description: r.description,
    discountType: r.discount_type,
    discountValue: r.discount_value,
    minOrderAmountPkr: r.min_order_amount_pkr,
    maxDiscountPkr: r.max_discount_pkr ?? undefined,
    scope: r.scope,
    targetCategories: JSON.parse(r.target_categories_json || '[]') as string[],
    targetProductIds: JSON.parse(r.target_product_ids_json || '[]') as string[],
    startDate: r.start_date || undefined,
    expiryDate: r.expiry_date || undefined,
    usageLimit: r.usage_limit ?? undefined,
    usedCount: r.used_count,
    isActive: r.is_active === 1,
    showBanner: r.show_banner === 1,
    createdAt: r.created_at,
  }));
}

export function evaluateCoupon(
  rawCode: string | undefined,
  subtotalPkr: number,
  options?: { itemCategories?: string[]; itemProductIds?: string[]; userId?: string },
): { valid: boolean; code: string; discountPkr: number; freeShipping: boolean; message: string } {
  const code = (rawCode || '').trim().toUpperCase();
  if (!code) {
    return { valid: false, code: '', discountPkr: 0, freeShipping: false, message: 'Enter a promo code.' };
  }

  const coupon = listCoupons(false).find((c) => c.code.toUpperCase() === code);
  if (!coupon || !coupon.isActive) {
    return {
      valid: false,
      code,
      discountPkr: 0,
      freeShipping: false,
      message: 'Coupon code is invalid or currently inactive.',
    };
  }

  const now = Date.now();
  if (coupon.startDate && Date.parse(coupon.startDate) > now) {
    return { valid: false, code, discountPkr: 0, freeShipping: false, message: 'This promotion has not started yet.' };
  }
  if (coupon.expiryDate && Date.parse(coupon.expiryDate) + 86_400_000 < now) {
    return { valid: false, code, discountPkr: 0, freeShipping: false, message: 'This coupon has expired.' };
  }
  if (typeof coupon.usageLimit === 'number' && coupon.usedCount >= coupon.usageLimit) {
    return {
      valid: false,
      code,
      discountPkr: 0,
      freeShipping: false,
      message: 'This coupon has reached its redemption limit.',
    };
  }
  if (subtotalPkr < coupon.minOrderAmountPkr) {
    return {
      valid: false,
      code,
      discountPkr: 0,
      freeShipping: false,
      message: `${code} requires a minimum subtotal of PKR ${coupon.minOrderAmountPkr.toLocaleString('en-PK')}.`,
    };
  }

  if (coupon.scope === 'first_order' && options?.userId) {
    const db = getDb();
    const prevOrders = (
      db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE user_id = ? AND status != 'Cancelled'").get(options.userId) as {
        cnt: number;
      }
    ).cnt;
    if (prevOrders > 0) {
      return {
        valid: false,
        code,
        discountPkr: 0,
        freeShipping: false,
        message: `${code} is valid on your first order only.`,
      };
    }
  }

  if (coupon.scope === 'category' && coupon.targetCategories.length > 0 && options?.itemCategories) {
    const matched = options.itemCategories.some((c) => coupon.targetCategories.includes(c));
    if (!matched) {
      return {
        valid: false,
        code,
        discountPkr: 0,
        freeShipping: false,
        message: `${code} applies to ${coupon.targetCategories.join(', ')} items.`,
      };
    }
  }

  if (coupon.scope === 'selected_products' && coupon.targetProductIds.length > 0 && options?.itemProductIds) {
    const matched = options.itemProductIds.some((pid) => coupon.targetProductIds.includes(pid));
    if (!matched) {
      return {
        valid: false,
        code,
        discountPkr: 0,
        freeShipping: false,
        message: `${code} does not apply to the items currently in your bag.`,
      };
    }
  }

  if (coupon.discountType === 'free_shipping') {
    return {
      valid: true,
      code,
      discountPkr: 0,
      freeShipping: true,
      message: 'Complimentary nationwide delivery unlocked.',
    };
  }

  let discountPkr =
    coupon.discountType === 'percentage'
      ? Math.round((subtotalPkr * coupon.discountValue) / 100)
      : Math.round(coupon.discountValue);

  if (typeof coupon.maxDiscountPkr === 'number' && coupon.maxDiscountPkr > 0) {
    discountPkr = Math.min(discountPkr, coupon.maxDiscountPkr);
  }
  discountPkr = Math.min(discountPkr, subtotalPkr);

  return {
    valid: true,
    code,
    discountPkr,
    freeShipping: false,
    message:
      coupon.discountType === 'percentage'
        ? `${coupon.discountValue}% savings applied (-PKR ${discountPkr.toLocaleString('en-PK')}).`
        : `PKR ${discountPkr.toLocaleString('en-PK')} botanical credit applied.`,
  };
}

export function createCoupon(input: Partial<CouponRecord>): CouponRecord {
  const db = getDb();
  const id = `cpn-${crypto.randomUUID().slice(0, 8)}`;
  const code = (input.code || '').trim().toUpperCase().replace(/\s+/g, '');
  const nowIso = new Date().toISOString();
  db.prepare(`
    INSERT INTO coupons (
      id, code, description, discount_type, discount_value, min_order_amount_pkr,
      max_discount_pkr, scope, target_categories_json, target_product_ids_json,
      start_date, expiry_date, usage_limit, used_count, is_active, show_banner, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
  `).run(
    id,
    code,
    (input.description || '').trim(),
    input.discountType || 'percentage',
    Number(input.discountValue || 0),
    Math.max(0, Math.round(Number(input.minOrderAmountPkr || 0))),
    input.maxDiscountPkr ? Math.round(Number(input.maxDiscountPkr)) : null,
    input.scope || 'all',
    JSON.stringify(input.targetCategories || []),
    JSON.stringify(input.targetProductIds || []),
    input.startDate || '',
    input.expiryDate || '',
    input.usageLimit ? Math.round(Number(input.usageLimit)) : null,
    input.isActive === false ? 0 : 1,
    input.showBanner ? 1 : 0,
    nowIso,
  );
  return listCoupons(false).find((c) => c.id === id)!;
}

export function updateCoupon(id: string, patch: Partial<CouponRecord>): CouponRecord | null {
  const db = getDb();
  const existing = listCoupons(false).find((c) => c.id === id);
  if (!existing) return null;
  const next: CouponRecord = { ...existing, ...patch, code: (patch.code || existing.code).trim().toUpperCase() };
  db.prepare(`
    UPDATE coupons SET
      code = ?, description = ?, discount_type = ?, discount_value = ?, min_order_amount_pkr = ?,
      max_discount_pkr = ?, scope = ?, target_categories_json = ?, target_product_ids_json = ?,
      start_date = ?, expiry_date = ?, usage_limit = ?, is_active = ?, show_banner = ?
    WHERE id = ?
  `).run(
    next.code,
    next.description,
    next.discountType,
    next.discountValue,
    next.minOrderAmountPkr,
    next.maxDiscountPkr ?? null,
    next.scope,
    JSON.stringify(next.targetCategories || []),
    JSON.stringify(next.targetProductIds || []),
    next.startDate || '',
    next.expiryDate || '',
    next.usageLimit ?? null,
    next.isActive ? 1 : 0,
    next.showBanner ? 1 : 0,
    id,
  );
  return listCoupons(false).find((c) => c.id === id) || null;
}

export function deleteCoupon(id: string): boolean {
  const db = getDb();
  const res = db.prepare('DELETE FROM coupons WHERE id = ?').run(id);
  return Number(res.changes) > 0;
}

// ---------------------------------------------------------------------------
// CUSTOMERS
// ---------------------------------------------------------------------------

function mapCustomerRow(row: {
  id: string;
  name: string;
  email: string;
  phone: string;
  password_hash: string;
  password_salt: string;
  is_active: number;
  saved_addresses_json: string;
  saved_routines_json: string;
  wishlist_ids_json: string;
  created_at: string;
}): StoredCustomer {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    isActive: row.is_active === 1,
    savedAddresses: JSON.parse(row.saved_addresses_json || '[]'),
    savedRoutines: JSON.parse(row.saved_routines_json || '[]'),
    wishlistIds: JSON.parse(row.wishlist_ids_json || '[]'),
    createdAt: row.created_at,
  };
}

export function findCustomerById(id: string): StoredCustomer | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as
    | Parameters<typeof mapCustomerRow>[0]
    | undefined;
  return row ? mapCustomerRow(row) : null;
}

export function findCustomerByEmail(email: string): StoredCustomer | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM customers WHERE LOWER(email) = LOWER(?)').get(email.trim()) as
    | Parameters<typeof mapCustomerRow>[0]
    | undefined;
  return row ? mapCustomerRow(row) : null;
}

export function createCustomer(input: { name: string; email: string; phone?: string; password: string }): StoredCustomer {
  const db = getDb();
  const { salt, hash } = hashPassword(input.password);
  const id = `usr-${crypto.randomUUID().slice(0, 8)}`;
  const nowIso = new Date().toISOString();
  db.prepare(`
    INSERT INTO customers (
      id, name, email, phone, password_hash, password_salt, is_active,
      saved_addresses_json, saved_routines_json, wishlist_ids_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, '[]', '[]', '[]', ?)
  `).run(id, input.name.trim(), input.email.trim().toLowerCase(), input.phone?.trim() || '', hash, salt, nowIso);
  return findCustomerById(id)!;
}

export function updateCustomerProfile(
  id: string,
  patch: Partial<CustomerProfile>,
): StoredCustomer | null {
  const db = getDb();
  const existing = findCustomerById(id);
  if (!existing) return null;
  const nextName = typeof patch.name === 'string' && patch.name.trim() ? patch.name.trim() : existing.name;
  const nextPhone = typeof patch.phone === 'string' ? patch.phone.trim() : existing.phone;
  const nextAddr = Array.isArray(patch.savedAddresses) ? patch.savedAddresses : existing.savedAddresses;
  const nextWish = Array.isArray(patch.wishlistIds) ? patch.wishlistIds : existing.wishlistIds;
  const nextRoutines = Array.isArray(patch.savedRoutines) ? patch.savedRoutines : existing.savedRoutines;
  const nextActive = typeof patch.isActive === 'boolean' ? patch.isActive : existing.isActive !== false;

  db.prepare(`
    UPDATE customers SET
      name = ?, phone = ?, is_active = ?,
      saved_addresses_json = ?, saved_routines_json = ?, wishlist_ids_json = ?
    WHERE id = ?
  `).run(
    nextName,
    nextPhone,
    nextActive ? 1 : 0,
    JSON.stringify(nextAddr),
    JSON.stringify(nextRoutines),
    JSON.stringify(nextWish),
    id,
  );
  return findCustomerById(id);
}

export function listCustomerSummaries(): CustomerSummaryRecord[] {
  const db = getDb();
  const customers = (db.prepare('SELECT * FROM customers ORDER BY created_at DESC').all() as Parameters<
    typeof mapCustomerRow
  >[0][]).map(mapCustomerRow);
  const orders = listOrders();

  return customers.map((c) => {
    const custOrders = orders.filter(
      (o) =>
        o.userId === c.id ||
        (o.customerEmail && o.customerEmail.toLowerCase() === c.email.toLowerCase()),
    );
    const validOrders = custOrders.filter((o) => o.status !== 'Cancelled' && o.status !== 'Returned');
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      isActive: c.isActive,
      createdAt: c.createdAt,
      savedAddresses: c.savedAddresses,
      savedRoutines: c.savedRoutines,
      wishlistIds: c.wishlistIds,
      orderCount: custOrders.length,
      totalSpentPkr: validOrders.reduce((sum, o) => sum + o.totalPkr, 0),
      lastOrderAt: custOrders[0]?.createdAt,
      orders: custOrders,
    };
  });
}

// ---------------------------------------------------------------------------
// ORDERS (TRANSACTIONAL)
// ---------------------------------------------------------------------------

function mapOrderRow(row: {
  id: string;
  order_number: string;
  user_id: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  shipping_address_json: string;
  payment_method: 'cod' | 'whatsapp';
  items_json: string;
  subtotal_pkr: number;
  shipping_pkr: number;
  discount_pkr: number;
  tax_pkr: number;
  coupon_code: string;
  total_pkr: number;
  status: OrderStatus;
  internal_notes: string;
  status_history_json: string;
  created_at: string;
  updated_at: string;
}): OrderRecord {
  return {
    id: row.id,
    orderNumber: row.order_number,
    userId: row.user_id || undefined,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email || undefined,
    shippingAddress: JSON.parse(row.shipping_address_json),
    paymentMethod: row.payment_method,
    items: JSON.parse(row.items_json),
    subtotalPkr: row.subtotal_pkr,
    shippingPkr: row.shipping_pkr,
    discountPkr: row.discount_pkr,
    taxPkr: row.tax_pkr || 0,
    couponCode: row.coupon_code || undefined,
    totalPkr: row.total_pkr,
    status: row.status,
    internalNotes: row.internal_notes || '',
    statusHistory: JSON.parse(row.status_history_json || '[]'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listOrders(limit = 500): OrderRecord[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT ?').all(limit) as Parameters<
    typeof mapOrderRow
  >[0][];
  return rows.map(mapOrderRow);
}

export function getOrderById(id: string): OrderRecord | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as
    | Parameters<typeof mapOrderRow>[0]
    | undefined;
  return row ? mapOrderRow(row) : null;
}

export function placeOrderTransactional(params: {
  authUser?: StoredCustomer | null;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  shippingAddress: OrderRecord['shippingAddress'];
  paymentMethod: 'cod' | 'whatsapp';
  items: { productId: string; quantity: number }[];
  couponCode?: string;
}): { ok: true; order: OrderRecord } | { ok: false; status: number; error: string } {
  return withTransaction((db) => {
    const settings = getStoreSettings();
    const orderItems: OrderRecord['items'] = [];
    const itemCategories: string[] = [];
    const itemProductIds: string[] = [];

    for (const reqItem of params.items) {
      const prodRow = db
        .prepare("SELECT * FROM products WHERE id = ? AND status = 'published'")
        .get(reqItem.productId) as Parameters<typeof mapProductRow>[0] | undefined;
      if (!prodRow) {
        return { ok: false, status: 400, error: `Product ${reqItem.productId} is no longer available.` };
      }
      const product = mapProductRow(prodRow);
      const qty = Math.max(1, Math.min(20, Math.floor(Number(reqItem.quantity) || 1)));
      if (product.stock < qty) {
        return {
          ok: false,
          status: 400,
          error: `Insufficient stock for ${product.name} (${product.stock} remaining).`,
        };
      }
      const unitPricePkr =
        typeof product.discountPricePkr === 'number' && product.discountPricePkr < product.pricePkr
          ? product.discountPricePkr
          : product.pricePkr;

      orderItems.push({
        productId: product.id,
        slug: product.slug,
        name: product.name,
        volume: product.volume,
        unitPricePkr,
        quantity: qty,
        image: product.images[0],
      });
      itemCategories.push(product.category);
      itemProductIds.push(product.id);
    }

    const subtotalPkr = orderItems.reduce((sum, item) => sum + item.unitPricePkr * item.quantity, 0);
    const coupon = params.couponCode
      ? evaluateCoupon(params.couponCode, subtotalPkr, {
          itemCategories,
          itemProductIds,
          userId: params.authUser?.id,
        })
      : null;

    const discountPkr = coupon?.valid ? coupon.discountPkr : 0;
    const afterDiscount = Math.max(0, subtotalPkr - discountPkr);
    const qualifiesFreeShipping =
      afterDiscount >= settings.freeShippingThresholdPkr || Boolean(coupon?.valid && coupon.freeShipping);
    const shippingPkr = qualifiesFreeShipping ? 0 : settings.shippingFeePkr;
    const taxPkr = settings.taxPercent ? Math.round((afterDiscount * settings.taxPercent) / 100) : 0;
    const totalPkr = afterDiscount + shippingPkr + taxPkr;

    const seqRow = db.prepare("SELECT value FROM meta_kv WHERE key = 'orderSequence'").get() as { value: string };
    const nextSeq = Number(seqRow?.value || 1041) + 1;
    db.prepare("INSERT OR REPLACE INTO meta_kv (key, value) VALUES ('orderSequence', ?)").run(String(nextSeq));
    const orderNumber = `AB-${nextSeq}`;
    const nowIso = new Date().toISOString();

    for (const item of orderItems) {
      const prod = getProductById(item.productId)!;
      const newStock = Math.max(0, prod.stock - item.quantity);
      const updatedJson = { ...prod, stock: newStock, updatedAt: nowIso };
      delete updatedJson.reviews;
      db.prepare('UPDATE products SET stock = ?, data_json = ?, updated_at = ? WHERE id = ?').run(
        newStock,
        JSON.stringify(updatedJson),
        nowIso,
        prod.id,
      );
      recordStockHistoryEntry(db, {
        productId: prod.id,
        productName: prod.name,
        sku: prod.sku,
        delta: -item.quantity,
        previousStock: prod.stock,
        newStock,
        reason: `Order ${orderNumber} placed`,
        actorEmail: params.customerEmail?.trim() || params.authUser?.email || 'customer',
      });
      if (newStock <= settings.lowStockThreshold && settings.notifyLowStock) {
        createNotification(db, {
          type: 'low_stock',
          title: newStock === 0 ? `Out of Stock: ${prod.name}` : `Low Stock Alert: ${prod.name}`,
          message: `${prod.name} dropped to ${newStock} units after order ${orderNumber}.`,
          linkSection: 'inventory',
        });
      }
    }

    if (coupon?.valid) {
      db.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE UPPER(code) = ?').run(coupon.code);
    }

    const orderId = `ord-${crypto.randomUUID().slice(0, 8)}`;
    const statusHistory = [
      {
        status: 'Confirmed' as OrderStatus,
        note: `Order submitted via ${params.paymentMethod === 'whatsapp' ? 'WhatsApp + COD' : 'Cash on Delivery'}`,
        changedBy: 'system',
        changedAt: nowIso,
      },
    ];

    db.prepare(`
      INSERT INTO orders (
        id, order_number, user_id, customer_name, customer_phone, customer_email,
        shipping_address_json, payment_method, items_json, subtotal_pkr, shipping_pkr,
        discount_pkr, tax_pkr, coupon_code, total_pkr, status, internal_notes,
        status_history_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Confirmed', '', ?, ?, ?)
    `).run(
      orderId,
      orderNumber,
      params.authUser?.id || null,
      params.customerName.trim(),
      params.customerPhone.trim(),
      params.customerEmail?.trim() || params.authUser?.email || '',
      JSON.stringify({
        street: params.shippingAddress.street.trim(),
        area: params.shippingAddress.area?.trim() || '',
        city: params.shippingAddress.city.trim(),
        postalCode: params.shippingAddress.postalCode?.trim() || '',
        notes: params.shippingAddress.notes?.trim() || undefined,
      }),
      params.paymentMethod === 'whatsapp' ? 'whatsapp' : 'cod',
      JSON.stringify(orderItems),
      subtotalPkr,
      shippingPkr,
      discountPkr,
      taxPkr,
      coupon?.valid ? coupon.code : '',
      totalPkr,
      JSON.stringify(statusHistory),
      nowIso,
      nowIso,
    );

    if (settings.notifyNewOrders) {
      createNotification(db, {
        type: 'order',
        title: `New Order ${orderNumber}`,
        message: `${params.customerName.trim()} (${params.shippingAddress.city.trim()}) — PKR ${totalPkr.toLocaleString('en-PK')}`,
        linkSection: 'orders',
      });
    }

    return { ok: true, order: getOrderById(orderId)! };
  });
}

export function updateOrderStatusTransactional(
  orderId: string,
  status: OrderStatus,
  note: string | undefined,
  actorEmail: string,
): OrderRecord | null {
  return withTransaction((db) => {
    const existing = getOrderById(orderId);
    if (!existing) return null;
    const nowIso = new Date().toISOString();
    const prevWasCancelledOrReturned = existing.status === 'Cancelled' || existing.status === 'Returned';
    const nextIsCancelledOrReturned = status === 'Cancelled' || status === 'Returned';

    // Restore stock once when transitioning from active -> Cancelled/Returned
    if (!prevWasCancelledOrReturned && nextIsCancelledOrReturned) {
      for (const item of existing.items) {
        const prod = getProductById(item.productId);
        if (prod) {
          const restored = prod.stock + item.quantity;
          const updatedJson = { ...prod, stock: restored, updatedAt: nowIso };
          delete updatedJson.reviews;
          db.prepare('UPDATE products SET stock = ?, data_json = ?, updated_at = ? WHERE id = ?').run(
            restored,
            JSON.stringify(updatedJson),
            nowIso,
            prod.id,
          );
          recordStockHistoryEntry(db, {
            productId: prod.id,
            productName: prod.name,
            sku: prod.sku,
            delta: item.quantity,
            previousStock: prod.stock,
            newStock: restored,
            reason: `Stock restored — Order ${existing.orderNumber} ${status}`,
            actorEmail,
          });
        }
      }
    }

    const nextHistory = [
      ...(existing.statusHistory || []),
      {
        status,
        note: note?.trim() || undefined,
        changedBy: actorEmail,
        changedAt: nowIso,
      },
    ];

    db.prepare('UPDATE orders SET status = ?, status_history_json = ?, updated_at = ? WHERE id = ?').run(
      status,
      JSON.stringify(nextHistory),
      nowIso,
      orderId,
    );

    return getOrderById(orderId);
  });
}

export function updateOrderInternalNotes(orderId: string, internalNotes: string): OrderRecord | null {
  const db = getDb();
  const existing = getOrderById(orderId);
  if (!existing) return null;
  db.prepare('UPDATE orders SET internal_notes = ?, updated_at = ? WHERE id = ?').run(
    internalNotes,
    new Date().toISOString(),
    orderId,
  );
  return getOrderById(orderId);
}

// ---------------------------------------------------------------------------
// ADMIN USERS, RBAC & AUDIT LOGS
// ---------------------------------------------------------------------------

export function countAdminUsers(): number {
  const db = getDb();
  return (db.prepare('SELECT COUNT(*) as cnt FROM admin_users').get() as { cnt: number }).cnt;
}

export function findAdminUserByEmail(email: string): StoredAdminUser | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM admin_users WHERE LOWER(email) = LOWER(?)').get(email.trim()) as
    | {
        id: string;
        name: string;
        email: string;
        role: AdminRole;
        password_hash: string;
        password_salt: string;
        is_active: number;
        created_at: string;
        last_login_at: string;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at || undefined,
  };
}

export function findAdminUserById(id: string): StoredAdminUser | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(id) as
    | {
        id: string;
        name: string;
        email: string;
        role: AdminRole;
        password_hash: string;
        password_salt: string;
        is_active: number;
        created_at: string;
        last_login_at: string;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at || undefined,
  };
}

export function createAdminUser(input: {
  name: string;
  email: string;
  role: AdminRole;
  password: string;
}): AdminUser {
  const db = getDb();
  const id = `adm-${crypto.randomUUID().slice(0, 8)}`;
  const { salt, hash } = hashPassword(input.password);
  const nowIso = new Date().toISOString();
  db.prepare(`
    INSERT INTO admin_users (id, name, email, role, password_hash, password_salt, is_active, created_at, last_login_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, '')
  `).run(id, input.name.trim(), input.email.trim().toLowerCase(), input.role, hash, salt, nowIso);
  const created = findAdminUserById(id)!;
  return {
    id: created.id,
    name: created.name,
    email: created.email,
    role: created.role,
    isActive: created.isActive,
    createdAt: created.createdAt,
  };
}

export function listAdminUsers(): AdminUser[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM admin_users ORDER BY created_at ASC').all() as {
    id: string;
    name: string;
    email: string;
    role: AdminRole;
    is_active: number;
    created_at: string;
    last_login_at: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    isActive: r.is_active === 1,
    createdAt: r.created_at,
    lastLoginAt: r.last_login_at || undefined,
  }));
}

export function touchAdminLastLogin(id: string): void {
  const db = getDb();
  db.prepare('UPDATE admin_users SET last_login_at = ? WHERE id = ?').run(new Date().toISOString(), id);
}

export function updateAdminUser(
  id: string,
  patch: { name?: string; role?: AdminRole; isActive?: boolean; password?: string },
): AdminUser | null {
  const db = getDb();
  const existing = findAdminUserById(id);
  if (!existing) return null;
  const nextName = patch.name?.trim() || existing.name;
  const nextRole = patch.role || existing.role;
  const nextActive = typeof patch.isActive === 'boolean' ? (patch.isActive ? 1 : 0) : existing.isActive ? 1 : 0;
  let nextHash = existing.passwordHash;
  let nextSalt = existing.passwordSalt;
  if (patch.password && patch.password.length >= 8) {
    const hashed = hashPassword(patch.password);
    nextHash = hashed.hash;
    nextSalt = hashed.salt;
  }
  db.prepare(
    'UPDATE admin_users SET name = ?, role = ?, is_active = ?, password_hash = ?, password_salt = ? WHERE id = ?',
  ).run(nextName, nextRole, nextActive, nextHash, nextSalt, id);
  return listAdminUsers().find((u) => u.id === id) || null;
}

export function deleteAdminUser(id: string): boolean {
  const db = getDb();
  const res = db.prepare('DELETE FROM admin_users WHERE id = ?').run(id);
  return Number(res.changes) > 0;
}

export function recordAuditLog(entry: Omit<AuditLogEntry, 'id' | 'createdAt'>): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO audit_logs (id, actor_id, actor_email, actor_role, action, target_type, target_id, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `aud-${crypto.randomUUID().slice(0, 8)}`,
    entry.actorId,
    entry.actorEmail,
    entry.actorRole,
    entry.action,
    entry.targetType,
    entry.targetId || '',
    entry.details || '',
    new Date().toISOString(),
  );
}

export function listAuditLogs(limit = 120): AuditLogEntry[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?').all(limit) as {
    id: string;
    actor_id: string;
    actor_email: string;
    actor_role: AdminRole;
    action: string;
    target_type: string;
    target_id: string;
    details: string;
    created_at: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    actorId: r.actor_id,
    actorEmail: r.actor_email,
    actorRole: r.actor_role,
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id || undefined,
    details: r.details || undefined,
    createdAt: r.created_at,
  }));
}

// ---------------------------------------------------------------------------
// AI AGENTS & TELEMETRY
// ---------------------------------------------------------------------------

export function listAIAgents(): AIAgentConfig[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM ai_agents ORDER BY rowid ASC').all() as {
    agent_key: string;
    name: string;
    description: string;
    enabled: number;
    personality_tone: AIAgentConfig['personalityTone'];
    custom_instructions: string;
    supported_languages_json: string;
    faq_knowledge_json: string;
    updated_at: string;
  }[];
  return rows.map((r) => ({
    agentKey: r.agent_key,
    name: r.name,
    description: r.description,
    enabled: r.enabled === 1,
    personalityTone: r.personality_tone,
    customInstructions: r.custom_instructions,
    supportedLanguages: JSON.parse(r.supported_languages_json || '["english"]'),
    faqKnowledge: JSON.parse(r.faq_knowledge_json || '[]'),
    updatedAt: r.updated_at,
  }));
}

export function getAIAgent(agentKey: string): AIAgentConfig | null {
  return listAIAgents().find((a) => a.agentKey === agentKey) || null;
}

export function updateAIAgent(agentKey: string, patch: Partial<AIAgentConfig>): AIAgentConfig | null {
  const db = getDb();
  const existing = getAIAgent(agentKey);
  if (!existing) return null;
  const next: AIAgentConfig = {
    ...existing,
    ...patch,
    agentKey,
    updatedAt: new Date().toISOString(),
  };
  db.prepare(`
    UPDATE ai_agents SET
      enabled = ?, personality_tone = ?, custom_instructions = ?,
      supported_languages_json = ?, faq_knowledge_json = ?, updated_at = ?
    WHERE agent_key = ?
  `).run(
    next.enabled ? 1 : 0,
    next.personalityTone,
    next.customInstructions,
    JSON.stringify(next.supportedLanguages),
    JSON.stringify(next.faqKnowledge),
    next.updatedAt,
    agentKey,
  );
  return getAIAgent(agentKey);
}

export function recordAIEvent(input: {
  eventType:
    | 'conversation'
    | 'image_analysis'
    | 'routine_build'
    | 'recommendation'
    | 'rec_click'
    | 'ai_add_to_cart'
    | 'ai_order'
    | 'error';
  agentKey?: string;
  queryText?: string;
  productSlug?: string;
  errorMessage?: string;
  meta?: Record<string, unknown>;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO ai_events (id, event_type, agent_key, query_text, product_slug, error_message, meta_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `aie-${crypto.randomUUID().slice(0, 8)}`,
    input.eventType,
    input.agentKey || 'beauty_expert',
    (input.queryText || '').slice(0, 240),
    input.productSlug || '',
    (input.errorMessage || '').slice(0, 500),
    JSON.stringify(input.meta || {}),
    new Date().toISOString(),
  );

  if (input.eventType === 'error' && input.errorMessage) {
    const settings = getStoreSettings();
    if (settings.notifyAiErrors) {
      createNotification(db, {
        type: 'ai_error',
        title: `AI Error (${input.agentKey || 'beauty_expert'})`,
        message: input.errorMessage.slice(0, 180),
        linkSection: 'ai',
      });
    }
  }
}

export function getAIAnalyticsSummary(): AIAnalyticsSummary {
  const db = getDb();
  const countByType = (type: string) =>
    (db.prepare('SELECT COUNT(*) as cnt FROM ai_events WHERE event_type = ?').get(type) as { cnt: number }).cnt;

  const topQuestions = db
    .prepare(`
      SELECT query_text as query, COUNT(*) as count
      FROM ai_events
      WHERE event_type = 'conversation' AND TRIM(query_text) != ''
      GROUP BY query_text
      ORDER BY count DESC
      LIMIT 8
    `)
    .all() as { query: string; count: number }[];

  const topRecRows = db
    .prepare(`
      SELECT e.product_slug as slug, COALESCE(p.name, e.product_slug) as name, COUNT(*) as count
      FROM ai_events e
      LEFT JOIN products p ON p.slug = e.product_slug
      WHERE e.event_type = 'recommendation' AND e.product_slug != ''
      GROUP BY e.product_slug
      ORDER BY count DESC
      LIMIT 6
    `)
    .all() as { slug: string; name: string; count: number }[];

  const recentErrors = db
    .prepare(`
      SELECT id, agent_key as agentKey, error_message as message, created_at as createdAt
      FROM ai_events
      WHERE event_type = 'error'
      ORDER BY created_at DESC
      LIMIT 12
    `)
    .all() as { id: string; agentKey: string; message: string; createdAt: string }[];

  return {
    serverAiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    activeModel: 'gemini-4-hydrogen',
    totalConversations: countByType('conversation'),
    totalImageAnalyses: countByType('image_analysis'),
    totalRoutineBuilds: countByType('routine_build'),
    recommendationClicks: countByType('rec_click'),
    aiAssistedAddToCart: countByType('ai_add_to_cart'),
    aiAssistedOrders: countByType('ai_order'),
    failedResponses: countByType('error'),
    mostAskedQuestions: topQuestions,
    mostRecommendedProducts: topRecRows,
    recentErrors,
  };
}

// ---------------------------------------------------------------------------
// SUPPORT TICKETS, NOTIFICATIONS & WHATSAPP LOGS
// ---------------------------------------------------------------------------

export function listSupportTickets(): SupportTicket[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM support_tickets ORDER BY updated_at DESC').all() as {
    id: string;
    ticket_number: string;
    customer_name: string;
    customer_email: string;
    customer_phone: string;
    subject: string;
    source: SupportTicket['source'];
    status: SupportTicket['status'];
    priority: SupportTicket['priority'];
    assigned_agent_email: string;
    messages_json: string;
    created_at: string;
    updated_at: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    ticketNumber: r.ticket_number,
    customerName: r.customer_name,
    customerEmail: r.customer_email || undefined,
    customerPhone: r.customer_phone || undefined,
    subject: r.subject,
    source: r.source,
    status: r.status,
    priority: r.priority,
    assignedAgentEmail: r.assigned_agent_email || undefined,
    messages: JSON.parse(r.messages_json || '[]'),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function createSupportTicket(input: {
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  subject: string;
  message: string;
  source?: SupportTicket['source'];
  priority?: SupportTicket['priority'];
}): SupportTicket {
  return withTransaction((db) => {
    const seqRow = db.prepare("SELECT value FROM meta_kv WHERE key = 'ticketSequence'").get() as { value: string };
    const nextSeq = Number(seqRow?.value || 500) + 1;
    db.prepare("INSERT OR REPLACE INTO meta_kv (key, value) VALUES ('ticketSequence', ?)").run(String(nextSeq));

    const id = `tkt-${crypto.randomUUID().slice(0, 8)}`;
    const ticketNumber = `SUP-${nextSeq}`;
    const nowIso = new Date().toISOString();
    const status: SupportTicket['status'] = input.source === 'ai_escalation' ? 'escalated' : 'open';
    const initialMessages: SupportMessage[] = [
      {
        id: `msg-${crypto.randomUUID().slice(0, 8)}`,
        senderRole: 'customer',
        senderName: input.customerName.trim(),
        text: input.message.trim(),
        createdAt: nowIso,
      },
    ];

    db.prepare(`
      INSERT INTO support_tickets (
        id, ticket_number, customer_name, customer_email, customer_phone,
        subject, source, status, priority, assigned_agent_email, messages_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?)
    `).run(
      id,
      ticketNumber,
      input.customerName.trim(),
      input.customerEmail?.trim() || '',
      input.customerPhone?.trim() || '',
      input.subject.trim(),
      input.source || 'support_form',
      status,
      input.priority || (status === 'escalated' ? 'high' : 'normal'),
      JSON.stringify(initialMessages),
      nowIso,
      nowIso,
    );

    createNotification(db, {
      type: 'support',
      title: `${status === 'escalated' ? 'AI Escalation' : 'Support Ticket'} ${ticketNumber}`,
      message: `${input.customerName.trim()}: ${input.subject.trim()}`,
      linkSection: 'support',
    });

    return listSupportTickets().find((t) => t.id === id)!;
  });
}

export function updateSupportTicket(
  id: string,
  patch: {
    status?: SupportTicket['status'];
    priority?: SupportTicket['priority'];
    assignedAgentEmail?: string;
    replyText?: string;
    replySenderName?: string;
  },
): SupportTicket | null {
  const db = getDb();
  const existing = listSupportTickets().find((t) => t.id === id);
  if (!existing) return null;
  const nowIso = new Date().toISOString();
  const messages = [...existing.messages];
  if (patch.replyText?.trim()) {
    messages.push({
      id: `msg-${crypto.randomUUID().slice(0, 8)}`,
      senderRole: 'admin',
      senderName: patch.replySenderName || 'Aurelia Support Team',
      text: patch.replyText.trim(),
      createdAt: nowIso,
    });
  }
  const nextStatus = patch.status || existing.status;
  const nextPriority = patch.priority || existing.priority;
  const nextAssigned =
    patch.assignedAgentEmail !== undefined ? patch.assignedAgentEmail : existing.assignedAgentEmail || '';

  db.prepare(`
    UPDATE support_tickets
    SET status = ?, priority = ?, assigned_agent_email = ?, messages_json = ?, updated_at = ?
    WHERE id = ?
  `).run(nextStatus, nextPriority, nextAssigned, JSON.stringify(messages), nowIso, id);

  return listSupportTickets().find((t) => t.id === id) || null;
}

export function createNotification(
  db: DatabaseSync,
  input: Omit<AdminNotification, 'id' | 'isRead' | 'createdAt'>,
): void {
  db.prepare(`
    INSERT INTO notifications (id, type, title, message, link_section, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(
    `ntf-${crypto.randomUUID().slice(0, 8)}`,
    input.type,
    input.title,
    input.message,
    input.linkSection || 'dashboard',
    new Date().toISOString(),
  );
}

export function listNotifications(limit = 40): AdminNotification[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?').all(limit) as {
    id: string;
    type: AdminNotification['type'];
    title: string;
    message: string;
    link_section: AdminNotification['linkSection'];
    is_read: number;
    created_at: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    message: r.message,
    linkSection: r.link_section,
    isRead: r.is_read === 1,
    createdAt: r.created_at,
  }));
}

export function markNotificationsRead(id?: string): void {
  const db = getDb();
  if (id) {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(id);
  } else {
    db.prepare('UPDATE notifications SET is_read = 1').run();
  }
}

export function recordWhatsAppReferral(source: string, summary: string, customerPhone?: string): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO whatsapp_referrals (id, source, customer_phone, summary, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(
    `war-${crypto.randomUUID().slice(0, 8)}`,
    source,
    customerPhone || '',
    summary.slice(0, 400),
    new Date().toISOString(),
  );
}

export function listWhatsAppReferrals(limit = 50): WhatsAppReferralRecord[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM whatsapp_referrals ORDER BY created_at DESC LIMIT ?')
    .all(limit) as { id: string; source: string; customer_phone: string; summary: string; created_at: string }[];
  return rows.map((r) => ({
    id: r.id,
    source: r.source,
    customerPhone: r.customer_phone || undefined,
    summary: r.summary,
    createdAt: r.created_at,
  }));
}

// ---------------------------------------------------------------------------
// REAL ANALYTICS & REPORTS AGGREGATION
// ---------------------------------------------------------------------------

export function buildAdminOverview(): import('../../src/types/store').AdminOverviewStats {
  const products = listProducts({ includeUnpublished: true });
  const orders = listOrders();
  const customers = listCustomerSummaries();
  const settings = getStoreSettings();
  const threshold = settings.lowStockThreshold ?? 10;

  const validOrders = orders.filter((o) => o.status !== 'Cancelled' && o.status !== 'Returned');
  const totalRevenuePkr = validOrders.reduce((sum, o) => sum + o.totalPkr, 0);
  const pendingOrdersCount = orders.filter(
    (o) => o.status === 'Pending' || o.status === 'Confirmed' || o.status === 'Processing',
  ).length;
  const deliveredOrdersCount = orders.filter((o) => o.status === 'Delivered').length;
  const lowStockProducts = products.filter((p) => p.stock <= threshold);

  const now = Date.now();
  const dayMs = 86_400_000;
  const sumWithinDays = (days: number) =>
    validOrders
      .filter((o) => now - Date.parse(o.createdAt) <= days * dayMs)
      .reduce((s, o) => s + o.totalPkr, 0);

  const prev30Rev = validOrders
    .filter((o) => {
      const age = now - Date.parse(o.createdAt);
      return age > 30 * dayMs && age <= 60 * dayMs;
    })
    .reduce((s, o) => s + o.totalPkr, 0);
  const cur30Rev = sumWithinDays(30);
  const revenueGrowthPercent =
    prev30Rev > 0 ? Math.round(((cur30Rev - prev30Rev) / prev30Rev) * 100) : cur30Rev > 0 ? 100 : 0;

  const productMeta = new Map(products.map((p) => [p.slug, p]));
  const salesMap = new Map<string, { name: string; slug: string; unitsSold: number; revenuePkr: number }>();
  const categoryMap = new Map<string, { category: string; revenuePkr: number; units: number }>();
  let skincareRevenuePkr = 0;
  let haircareRevenuePkr = 0;

  for (const order of validOrders) {
    for (const item of order.items) {
      const lineRev = item.unitPricePkr * item.quantity;
      const existing = salesMap.get(item.slug) || {
        name: item.name,
        slug: item.slug,
        unitsSold: 0,
        revenuePkr: 0,
      };
      existing.unitsSold += item.quantity;
      existing.revenuePkr += lineRev;
      salesMap.set(item.slug, existing);

      const meta = productMeta.get(item.slug);
      const dept = meta?.department === 'haircare' ? 'haircare' : 'skincare';
      if (dept === 'haircare') haircareRevenuePkr += lineRev;
      else skincareRevenuePkr += lineRev;

      const catName = meta?.category || 'General';
      const catEntry = categoryMap.get(catName) || { category: catName, revenuePkr: 0, units: 0 };
      catEntry.revenuePkr += lineRev;
      catEntry.units += item.quantity;
      categoryMap.set(catName, catEntry);
    }
  }

  // Last 14 days sales trend series
  const trendMap = new Map<
    string,
    { label: string; revenuePkr: number; orders: number; skincarePkr: number; haircarePkr: number }
  >();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now - i * dayMs);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('en-PK', { month: 'short', day: 'numeric' });
    trendMap.set(key, { label, revenuePkr: 0, orders: 0, skincarePkr: 0, haircarePkr: 0 });
  }

  for (const order of validOrders) {
    const key = order.createdAt.slice(0, 10);
    const bucket = trendMap.get(key);
    if (bucket) {
      bucket.revenuePkr += order.totalPkr;
      bucket.orders += 1;
      for (const item of order.items) {
        const meta = productMeta.get(item.slug);
        if (meta?.department === 'haircare') bucket.haircarePkr += item.unitPricePkr * item.quantity;
        else bucket.skincarePkr += item.unitPricePkr * item.quantity;
      }
    }
  }

  // Order status counts
  const statusCounts = new Map<string, number>();
  for (const o of orders) {
    statusCounts.set(o.status, (statusCounts.get(o.status) || 0) + 1);
  }

  // Customer growth last 6 months
  const growthBuckets = new Map<string, number>();
  for (let m = 5; m >= 0; m--) {
    const d = new Date();
    d.setMonth(d.getMonth() - m);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    growthBuckets.set(key, 0);
  }
  for (const c of customers) {
    const key = (c.createdAt || '').slice(0, 7);
    if (growthBuckets.has(key)) {
      growthBuckets.set(key, (growthBuckets.get(key) || 0) + 1);
    }
  }

  // Recent Activity combining orders & notifications
  const notifications = listNotifications(10);
  const recentActivity = [
    ...orders.slice(0, 5).map((o) => ({
      id: `act-ord-${o.id}`,
      title: `Order ${o.orderNumber} (${o.status})`,
      detail: `${o.customerName} · PKR ${o.totalPkr.toLocaleString('en-PK')}`,
      createdAt: o.createdAt,
      kind: 'order',
    })),
    ...notifications.slice(0, 5).map((n) => ({
      id: `act-ntf-${n.id}`,
      title: n.title,
      detail: n.message,
      createdAt: n.createdAt,
      kind: n.type,
    })),
  ]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 8);

  return {
    totalOrders: orders.length,
    totalRevenuePkr,
    totalProducts: products.length,
    totalCustomers: customers.length,
    pendingOrdersCount,
    deliveredOrdersCount,
    revenueGrowthPercent,
    salesWindows: {
      dailyPkr: sumWithinDays(1),
      weeklyPkr: sumWithinDays(7),
      monthlyPkr: cur30Rev,
      yearlyPkr: sumWithinDays(365),
    },
    lowStockProducts,
    recentOrders: orders.slice(0, 30),
    topSellingProducts: Array.from(salesMap.values())
      .sort((a, b) => b.unitsSold - a.unitsSold || b.revenuePkr - a.revenuePkr)
      .slice(0, 8),
    departmentSplit: { skincareRevenuePkr, haircareRevenuePkr },
    salesTrend: Array.from(trendMap.values()),
    categorySales: Array.from(categoryMap.values()).sort((a, b) => b.revenuePkr - a.revenuePkr),
    orderStatusBreakdown: Array.from(statusCounts.entries()).map(([status, count]) => ({ status, count })),
    customerGrowth: Array.from(growthBuckets.entries()).map(([label, count]) => ({ label, customers: count })),
    recentActivity,
  };
}

export function buildAnalyticsReport(params: {
  range?: AnalyticsReportData['range'];
  department?: string;
  category?: string;
}): AnalyticsReportData {
  const range = params.range || '30d';
  const products = listProducts({ includeUnpublished: true });
  const productMeta = new Map(products.map((p) => [p.slug, p]));
  const settings = getStoreSettings();
  const threshold = settings.lowStockThreshold ?? 10;

  const now = Date.now();
  const daysLimit =
    range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : range === '365d' ? 365 : 99999;

  const ordersInWindow = listOrders().filter((o) => {
    const ageDays = (now - Date.parse(o.createdAt)) / 86_400_000;
    return ageDays <= daysLimit;
  });

  const cancelledCount = ordersInWindow.filter((o) => o.status === 'Cancelled' || o.status === 'Returned').length;
  const validOrders = ordersInWindow.filter((o) => o.status !== 'Cancelled' && o.status !== 'Returned');

  let totalRevenuePkr = 0;
  let discountGivenPkr = 0;
  const seriesMap = new Map<string, { label: string; revenuePkr: number; orders: number; discountPkr: number }>();
  const catMap = new Map<string, { category: string; department: string; units: number; revenuePkr: number }>();
  const couponMap = new Map<string, { code: string; redemptions: number; discountPkr: number; revenuePkr: number }>();

  for (const order of validOrders) {
    let orderMatchedRev = 0;
    let orderMatched = false;

    for (const item of order.items) {
      const meta = productMeta.get(item.slug);
      if (params.department && params.department !== 'all' && meta?.department !== params.department) continue;
      if (params.category && params.category !== 'all' && meta?.category !== params.category) continue;
      orderMatched = true;
      const lineRev = item.unitPricePkr * item.quantity;
      orderMatchedRev += lineRev;

      const catKey = meta?.category || 'General';
      const catEntry = catMap.get(catKey) || {
        category: catKey,
        department: meta?.department || 'skincare',
        units: 0,
        revenuePkr: 0,
      };
      catEntry.units += item.quantity;
      catEntry.revenuePkr += lineRev;
      catMap.set(catKey, catEntry);
    }

    if (!orderMatched) continue;

    const revToAdd =
      (!params.department || params.department === 'all') && (!params.category || params.category === 'all')
        ? order.totalPkr
        : orderMatchedRev;
    totalRevenuePkr += revToAdd;
    discountGivenPkr += order.discountPkr || 0;

    const dateKey = order.createdAt.slice(0, 10);
    const label = new Date(order.createdAt).toLocaleDateString('en-PK', { month: 'short', day: 'numeric' });
    const sEntry = seriesMap.get(dateKey) || { label, revenuePkr: 0, orders: 0, discountPkr: 0 };
    sEntry.revenuePkr += revToAdd;
    sEntry.orders += 1;
    sEntry.discountPkr += order.discountPkr || 0;
    seriesMap.set(dateKey, sEntry);

    if (order.couponCode) {
      const cEntry = couponMap.get(order.couponCode) || {
        code: order.couponCode,
        redemptions: 0,
        discountPkr: 0,
        revenuePkr: 0,
      };
      cEntry.redemptions += 1;
      cEntry.discountPkr += order.discountPkr || 0;
      cEntry.revenuePkr += revToAdd;
      couponMap.set(order.couponCode, cEntry);
    }
  }

  const aiSummary = getAIAnalyticsSummary();
  const aiConversionRatePercent =
    aiSummary.totalConversations > 0
      ? Number(((aiSummary.aiAssistedAddToCart / aiSummary.totalConversations) * 100).toFixed(1))
      : 0;

  return {
    range,
    totalRevenuePkr,
    totalOrders: validOrders.length,
    averageOrderValuePkr: validOrders.length > 0 ? Math.round(totalRevenuePkr / validOrders.length) : 0,
    discountGivenPkr,
    cancellationRatePercent:
      ordersInWindow.length > 0 ? Number(((cancelledCount / ordersInWindow.length) * 100).toFixed(1)) : 0,
    aiConversionRatePercent,
    salesSeries: Array.from(seriesMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, val]) => val),
    categoryPerformance: Array.from(catMap.values()).sort((a, b) => b.revenuePkr - a.revenuePkr),
    couponPerformance: Array.from(couponMap.values()).sort((a, b) => b.redemptions - a.redemptions),
    inventoryHealth: {
      totalSkus: products.length,
      lowStockCount: products.filter((p) => p.stock > 0 && p.stock <= threshold).length,
      outOfStockCount: products.filter((p) => p.stock === 0).length,
      stockValuationPkr: products.reduce(
        (sum, p) => sum + p.stock * (p.discountPricePkr && p.discountPricePkr < p.pricePkr ? p.discountPricePkr : p.pricePkr),
        0,
      ),
    },
  };
}
