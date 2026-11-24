import {
  BEAUTY_TIPS,
  HAIRCARE_CATEGORIES,
  INITIAL_PRODUCTS,
  INITIAL_REVIEWS,
  SKINCARE_CATEGORIES,
  STORE_IMAGES,
} from '../data/catalog';
import type {
  AIAgentConfig,
  AIAnalyticsSummary,
  AdminNotification,
  AdminOverviewStats,
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
  Product3DConfig,
  ProductReview,
  ReviewModerationRecord,
  StockHistoryEntry,
  StoreConfig,
  StoreSettingsFull,
  SupportMessage,
  SupportTicket,
  WebsiteContentCMS,
  WhatsAppReferralRecord,
} from '../types/store';
import {
  getBackupMetaPrefs,
  saveBackupMetaPrefs,
  syncLightweightStorePrefs,
  type AdminUiPrefs,
  type LightweightStorePrefs,
} from './localPrefs';
import {
  IDB_MEDIA_PREFIX,
  blobToDataUrl,
  clearMediaObjectUrlCache,
  dataUrlToBlob,
  registerMediaBlobLoader,
  type MediaBlobRecord,
} from './mediaResolver';

export const LOCAL_DB_NAME = 'aurelia_botanica_local_db';
export const LOCAL_DB_VERSION = 1;

export type LocalDbStatus = 'initializing' | 'ready' | 'error';

export class LocalDatabaseError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 500, code = 'LOCAL_DB_ERROR') {
    super(message);
    this.name = 'LocalDatabaseError';
    this.status = status;
    this.code = code;
  }
}

export interface StoredReviewRecord extends ProductReview {
  productId: string;
  productSlug: string;
  status: 'approved' | 'pending' | 'hidden';
}

export interface StoredCustomerLocal extends CustomerProfile {
  passwordHash: string;
  passwordSalt: string;
}

export interface StoredAdminUserLocal extends AdminUser {
  passwordHash: string;
  passwordSalt: string;
}

export interface AIEventRecord {
  id: string;
  eventType:
    | 'conversation'
    | 'image_analysis'
    | 'routine_build'
    | 'recommendation'
    | 'rec_click'
    | 'ai_add_to_cart'
    | 'ai_order'
    | 'error';
  agentKey: string;
  queryText: string;
  productSlug: string;
  errorMessage: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

interface MetaEntry {
  key: string;
  value: string;
}

interface KeyedJsonEntry<T> {
  key: string;
  value: T;
  updatedAt: string;
}

export interface MediaAssetBackupEntry {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
  createdAt: string;
}

export interface AureliaBackupV1 {
  app: 'Aurelia Botanica';
  schemaVersion: 1;
  exportedAt: string;
  localPrefs?: {
    adminUiPrefs?: Partial<AdminUiPrefs>;
    storePrefs?: Partial<LightweightStorePrefs>;
    lastBackupAt?: string | null;
  };
  data: {
    products: Product[];
    categories: CategoryRecord[];
    reviews: StoredReviewRecord[];
    customers: StoredCustomerLocal[];
    orders: OrderRecord[];
    stockHistory: StockHistoryEntry[];
    coupons: CouponRecord[];
    supportTickets: SupportTicket[];
    whatsappReferrals: WhatsAppReferralRecord[];
    aiAgents: AIAgentConfig[];
    aiEvents: AIEventRecord[];
    cmsContent: WebsiteContentCMS;
    storeSettings: StoreSettingsFull;
    notifications: AdminNotification[];
    adminUsers: StoredAdminUserLocal[];
    auditLogs: AuditLogEntry[];
    meta: Record<string, string>;
  };
  mediaAssets: MediaAssetBackupEntry[];
}

export interface BackupValidationPreview {
  valid: boolean;
  errors: string[];
  warnings: string[];
  preview?: {
    app: string;
    schemaVersion: number;
    exportedAt: string;
    counts: {
      products: number;
      categories: number;
      reviews: number;
      customers: number;
      orders: number;
      coupons: number;
      supportTickets: number;
      mediaAssets: number;
      adminUsers: number;
    };
    conflictingProductSlugs: string[];
    conflictingCouponCodes: string[];
    parsed: AureliaBackupV1;
  };
}

export interface DatabaseDashboardMetrics {
  dbStatus: LocalDbStatus;
  dbError: string | null;
  dbName: string;
  dbVersion: number;
  totalProducts: number;
  totalCategories: number;
  totalOrders: number;
  totalCustomers: number;
  totalCoupons: number;
  totalReviews: number;
  totalMediaBlobs: number;
  estimatedUsageBytes: number | null;
  estimatedQuotaBytes: number | null;
  lastBackupAt: string | null;
  lastBackupFileName?: string;
  lastRestoreAt?: string;
  lastResetAt?: string;
}

const ALL_STORES = [
  'meta',
  'products',
  'categories',
  'reviews',
  'customers',
  'orders',
  'stockHistory',
  'coupons',
  'supportTickets',
  'whatsappReferrals',
  'aiAgents',
  'aiEvents',
  'cmsContent',
  'storeSettings',
  'notifications',
  'adminUsers',
  'auditLogs',
  'mediaBlobs',
] as const;

type StoreName = (typeof ALL_STORES)[number];

let dbInstance: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase> | null = null;
let currentDbStatus: LocalDbStatus = 'initializing';
let currentDbError: string | null = null;

export function getLocalDatabaseStatus(): {
  status: LocalDbStatus;
  error: string | null;
  dbName: string;
  version: number;
} {
  return {
    status: currentDbStatus,
    error: currentDbError,
    dbName: LOCAL_DB_NAME,
    version: LOCAL_DB_VERSION,
  };
}

function generateShortId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36).slice(-4)}${rand}`.slice(0, prefix.length + 9);
}

function createRandomSalt(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
    const data = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback deterministic FNV-1a mix if subtle crypto is unavailable in an unusual context
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + (i << 3);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

export async function hashPasswordLocal(
  password: string,
  existingSalt?: string,
): Promise<{ salt: string; hash: string }> {
  const salt = existingSalt || createRandomSalt();
  const hash = await sha256Hex(`aurelia-botanica:${salt}:${password}`);
  return { salt, hash };
}

export async function verifyPasswordLocal(
  password: string,
  salt: string,
  expectedHash: string,
): Promise<boolean> {
  const { hash } = await hashPasswordLocal(password, salt);
  if (hash.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i += 1) {
    diff |= hash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// DEFAULT FACTORY SEEDS
// ---------------------------------------------------------------------------

export function getDefaultSettings(): StoreSettingsFull {
  return {
    brandName: 'Aurelia Botanica',
    logoUrl: '',
    whatsappNumber: '923001234567',
    whatsappEnabled: true,
    whatsappWelcomeMessage:
      'Assalam-o-Alaikum! Welcome to Aurelia Botanica Concierge. How may we help with your skincare or haircare ritual today?',
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

export function getDefaultCmsContent(): WebsiteContentCMS {
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

export function getDefaultAIAgents(): AIAgentConfig[] {
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
      customInstructions:
        'Warm, refined Pakistani luxury beauty consultant. Always cite exact catalog slugs and PKR prices.',
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

function buildDefaultSeedData(nowIso = new Date().toISOString()) {
  const categories: CategoryRecord[] = [
    ...SKINCARE_CATEGORIES.map((name, idx) => ({
      id: `cat-sk-${idx + 1}`,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      name,
      department: 'skincare' as const,
      description: `Small-batch botanical ${name.toLowerCase()} calibrated for daily comfort.`,
      imageUrl: '',
      displayOrder: idx + 1,
      isActive: true,
    })),
    ...HAIRCARE_CATEGORIES.map((name, idx) => ({
      id: `cat-hc-${idx + 1}`,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      name,
      department: 'haircare' as const,
      description: `Silicone-light botanical ${name.toLowerCase()} for strength and shine.`,
      imageUrl: '',
      displayOrder: idx + 1,
      isActive: true,
    })),
  ];

  const products: Product[] = INITIAL_PRODUCTS.map((p) => ({
    ...p,
    sku: p.sku || `AB-${p.department === 'skincare' ? 'SK' : 'HC'}-${p.id.toUpperCase()}`,
    status: p.status || 'published',
    isFeaturedHome: p.isFeaturedHome ?? Boolean(p.isBestSeller || p.isTrending),
    createdAt: p.createdAt || nowIso,
    updatedAt: p.updatedAt || nowIso,
  }));

  const prodBySlug = new Map(products.map((p) => [p.slug, p]));
  const reviews: StoredReviewRecord[] = [];
  for (const [slug, list] of Object.entries(INITIAL_REVIEWS)) {
    const prod = prodBySlug.get(slug);
    if (!prod) continue;
    for (const r of list) {
      reviews.push({
        ...r,
        productId: prod.id,
        productSlug: prod.slug,
        status: r.status || 'approved',
      });
    }
  }

  const coupons: CouponRecord[] = [
    {
      id: 'cpn-aurelia10',
      code: 'AURELIA10',
      description: '10% off your entire skincare & haircare bag',
      discountType: 'percentage',
      discountValue: 10,
      minOrderAmountPkr: 0,
      maxDiscountPkr: 2500,
      scope: 'all',
      targetCategories: [],
      targetProductIds: [],
      startDate: '',
      expiryDate: '',
      usageLimit: undefined,
      usedCount: 0,
      isActive: true,
      showBanner: true,
      createdAt: nowIso,
    },
    {
      id: 'cpn-glow500',
      code: 'GLOW500',
      description: 'PKR 500 off orders PKR 3,500 or more',
      discountType: 'fixed',
      discountValue: 500,
      minOrderAmountPkr: 3500,
      maxDiscountPkr: 500,
      scope: 'all',
      targetCategories: [],
      targetProductIds: [],
      startDate: '',
      expiryDate: '',
      usageLimit: undefined,
      usedCount: 0,
      isActive: true,
      showBanner: true,
      createdAt: nowIso,
    },
    {
      id: 'cpn-freeship',
      code: 'FREESHIP',
      description: 'Complimentary nationwide Pakistan delivery',
      discountType: 'free_shipping',
      discountValue: 0,
      minOrderAmountPkr: 0,
      maxDiscountPkr: undefined,
      scope: 'all',
      targetCategories: [],
      targetProductIds: [],
      startDate: '',
      expiryDate: '',
      usageLimit: undefined,
      usedCount: 0,
      isActive: true,
      showBanner: false,
      createdAt: nowIso,
    },
  ];

  const storeSettings = getDefaultSettings();
  const cmsContent = getDefaultCmsContent();
  const aiAgents = getDefaultAIAgents();

  return {
    categories,
    products,
    reviews,
    coupons,
    storeSettings,
    cmsContent,
    aiAgents,
  };
}

// ---------------------------------------------------------------------------
// LOW-LEVEL INDEXEDDB PRIMITIVES & TRANSACTION HELPERS
// ---------------------------------------------------------------------------

function mapDomError(err: unknown, fallbackMsg: string): LocalDatabaseError {
  if (err instanceof LocalDatabaseError) return err;
  const domErr = err as { name?: string; message?: string };
  if (domErr?.name === 'QuotaExceededError') {
    return new LocalDatabaseError(
      'Browser IndexedDB storage quota exceeded. Please export a JSON backup and delete unused media files or old records.',
      507,
      'QUOTA_EXCEEDED',
    );
  }
  if (domErr?.name === 'ConstraintError') {
    return new LocalDatabaseError(
      'Duplicate record conflict detected (SKU, slug, email, or code already exists).',
      409,
      'DUPLICATE_CONSTRAINT',
    );
  }
  if (domErr?.name === 'SecurityError' || domErr?.name === 'InvalidStateError') {
    return new LocalDatabaseError(
      'Browser local storage is restricted (private browsing or blocked site data). Changes cannot persist.',
      503,
      'STORAGE_BLOCKED',
    );
  }
  return new LocalDatabaseError(domErr?.message || fallbackMsg, 500, 'IDB_ERROR');
}

function requestToPromise<T>(req: IDBRequest<T>, context = 'Database operation'): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(mapDomError(req.error, `${context} failed.`));
  });
}

function transactionDone(tx: IDBTransaction, context = 'Database transaction'): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(mapDomError(tx.error, `${context} failed.`));
    tx.onabort = () => reject(mapDomError(tx.error, `${context} was aborted.`));
  });
}

function createSchemaStores(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains('meta')) {
    db.createObjectStore('meta', { keyPath: 'key' });
  }
  if (!db.objectStoreNames.contains('products')) {
    const store = db.createObjectStore('products', { keyPath: 'id' });
    store.createIndex('slug', 'slug', { unique: true });
    store.createIndex('department', 'department', { unique: false });
    store.createIndex('category', 'category', { unique: false });
    store.createIndex('status', 'status', { unique: false });
  }
  if (!db.objectStoreNames.contains('categories')) {
    const store = db.createObjectStore('categories', { keyPath: 'id' });
    store.createIndex('slug', 'slug', { unique: true });
    store.createIndex('department', 'department', { unique: false });
  }
  if (!db.objectStoreNames.contains('reviews')) {
    const store = db.createObjectStore('reviews', { keyPath: 'id' });
    store.createIndex('productId', 'productId', { unique: false });
    store.createIndex('productSlug', 'productSlug', { unique: false });
  }
  if (!db.objectStoreNames.contains('customers')) {
    const store = db.createObjectStore('customers', { keyPath: 'id' });
    store.createIndex('email', 'email', { unique: true });
  }
  if (!db.objectStoreNames.contains('orders')) {
    const store = db.createObjectStore('orders', { keyPath: 'id' });
    store.createIndex('orderNumber', 'orderNumber', { unique: true });
    store.createIndex('userId', 'userId', { unique: false });
    store.createIndex('status', 'status', { unique: false });
  }
  if (!db.objectStoreNames.contains('stockHistory')) {
    const store = db.createObjectStore('stockHistory', { keyPath: 'id' });
    store.createIndex('productId', 'productId', { unique: false });
  }
  if (!db.objectStoreNames.contains('coupons')) {
    const store = db.createObjectStore('coupons', { keyPath: 'id' });
    store.createIndex('code', 'code', { unique: true });
  }
  if (!db.objectStoreNames.contains('supportTickets')) {
    const store = db.createObjectStore('supportTickets', { keyPath: 'id' });
    store.createIndex('ticketNumber', 'ticketNumber', { unique: true });
  }
  if (!db.objectStoreNames.contains('whatsappReferrals')) {
    db.createObjectStore('whatsappReferrals', { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains('aiAgents')) {
    db.createObjectStore('aiAgents', { keyPath: 'agentKey' });
  }
  if (!db.objectStoreNames.contains('aiEvents')) {
    const store = db.createObjectStore('aiEvents', { keyPath: 'id' });
    store.createIndex('eventType', 'eventType', { unique: false });
  }
  if (!db.objectStoreNames.contains('cmsContent')) {
    db.createObjectStore('cmsContent', { keyPath: 'key' });
  }
  if (!db.objectStoreNames.contains('storeSettings')) {
    db.createObjectStore('storeSettings', { keyPath: 'key' });
  }
  if (!db.objectStoreNames.contains('notifications')) {
    db.createObjectStore('notifications', { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains('adminUsers')) {
    const store = db.createObjectStore('adminUsers', { keyPath: 'id' });
    store.createIndex('email', 'email', { unique: true });
  }
  if (!db.objectStoreNames.contains('auditLogs')) {
    db.createObjectStore('auditLogs', { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains('mediaBlobs')) {
    db.createObjectStore('mediaBlobs', { keyPath: 'id' });
  }
}

async function seedIfUninitialized(db: IDBDatabase): Promise<void> {
  const readTx = db.transaction(['meta', 'products'], 'readonly');
  const [initMeta, existingProdCount] = await Promise.all([
    requestToPromise<MetaEntry | undefined>(readTx.objectStore('meta').get('initialized'), 'Check initialization'),
    requestToPromise<number>(readTx.objectStore('products').count(), 'Count products'),
  ]);

  if (initMeta?.value === 'true' || existingProdCount > 0) {
    if (initMeta?.value !== 'true') {
      const markTx = db.transaction(['meta'], 'readwrite');
      markTx.objectStore('meta').put({ key: 'initialized', value: 'true' });
      await transactionDone(markTx, 'Mark DB initialized');
    }
    return;
  }

  const nowIso = new Date().toISOString();
  const seeds = buildDefaultSeedData(nowIso);

  const writeTx = db.transaction(
    ['meta', 'categories', 'products', 'reviews', 'coupons', 'storeSettings', 'cmsContent', 'aiAgents'],
    'readwrite',
  );

  for (const cat of seeds.categories) {
    writeTx.objectStore('categories').put(cat);
  }
  for (const prod of seeds.products) {
    writeTx.objectStore('products').put(prod);
  }
  for (const rev of seeds.reviews) {
    writeTx.objectStore('reviews').put(rev);
  }
  for (const cpn of seeds.coupons) {
    writeTx.objectStore('coupons').put(cpn);
  }
  writeTx.objectStore('storeSettings').put({
    key: 'main',
    value: seeds.storeSettings,
    updatedAt: nowIso,
  });
  writeTx.objectStore('cmsContent').put({
    key: 'main',
    value: seeds.cmsContent,
    updatedAt: nowIso,
  });
  for (const agent of seeds.aiAgents) {
    writeTx.objectStore('aiAgents').put(agent);
  }
  writeTx.objectStore('meta').put({ key: 'orderSequence', value: '1041' });
  writeTx.objectStore('meta').put({ key: 'ticketSequence', value: '500' });
  writeTx.objectStore('meta').put({ key: 'initialized', value: 'true' });

  await transactionDone(writeTx, 'Initial database seed');
  syncLightweightStorePrefs(seeds.storeSettings);
}

export async function getLocalDb(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;
  if (dbInitPromise) return dbInitPromise;

  let settled = false;
  let pending: Promise<IDBDatabase> | null = null;
  pending = (async () => {
    currentDbStatus = 'initializing';
    currentDbError = null;

    try {
      if (typeof indexedDB === 'undefined') {
        throw new LocalDatabaseError(
          'IndexedDB is not available in this browser or runtime.',
          503,
          'IDB_UNAVAILABLE',
        );
      }
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(LOCAL_DB_NAME, LOCAL_DB_VERSION);
        req.onupgradeneeded = () => {
          createSchemaStores(req.result);
        };
        req.onblocked = () => {
          reject(
            new LocalDatabaseError(
              'Database upgrade blocked by another open Aurelia tab. Please close other tabs and reload.',
              409,
              'IDB_BLOCKED',
            ),
          );
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(mapDomError(req.error, 'Could not open local IndexedDB database.'));
      });

      db.onversionchange = () => {
        db.close();
        dbInstance = null;
        dbInitPromise = null;
      };

      await seedIfUninitialized(db);
      dbInstance = db;
      currentDbStatus = 'ready';
      currentDbError = null;
      return db;
    } catch (err) {
      const mapped = mapDomError(err, 'Failed to initialize local browser database.');
      currentDbStatus = 'error';
      currentDbError = mapped.message;
      throw mapped;
    } finally {
      settled = true;
      if (pending && dbInitPromise === pending) {
        dbInitPromise = null;
      }
    }
  })();

  if (!settled) {
    dbInitPromise = pending;
  }
  return pending;
}

export function closeLocalDbForTests(): void {
  if (dbInstance) {
    dbInstance.close();
  }
  dbInstance = null;
  dbInitPromise = null;
  currentDbStatus = 'initializing';
  currentDbError = null;
  clearMediaObjectUrlCache();
}

async function getAllFromStore<T>(storeName: StoreName): Promise<T[]> {
  const db = await getLocalDb();
  const tx = db.transaction([storeName], 'readonly');
  return requestToPromise<T[]>(tx.objectStore(storeName).getAll(), `Read ${storeName}`);
}

async function getOneFromStore<T>(storeName: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await getLocalDb();
  const tx = db.transaction([storeName], 'readonly');
  return requestToPromise<T | undefined>(tx.objectStore(storeName).get(key), `Get ${storeName}`);
}

// Register media blob loader immediately for SafeImage & 3D GLB resolution
registerMediaBlobLoader(async (id: string) => {
  const rec = await getOneFromStore<MediaBlobRecord>('mediaBlobs', id);
  return rec || null;
});

// ---------------------------------------------------------------------------
// MEDIA BLOB STORAGE (INDEXEDDB)
// ---------------------------------------------------------------------------

export async function saveUploadedMediaBlob(input: {
  fileName: string;
  mimeType: string;
  blob: Blob;
}): Promise<{ url: string; id: string; mimeType: string; sizeBytes: number }> {
  const db = await getLocalDb();
  const id = generateShortId('med');
  const nowIso = new Date().toISOString();
  const record: MediaBlobRecord = {
    id,
    fileName: input.fileName || 'upload',
    mimeType: input.mimeType || input.blob.type || 'application/octet-stream',
    sizeBytes: input.blob.size,
    blob: input.blob,
    createdAt: nowIso,
  };
  const tx = db.transaction(['mediaBlobs'], 'readwrite');
  tx.objectStore('mediaBlobs').put(record);
  await transactionDone(tx, 'Save uploaded media file');
  return {
    url: `${IDB_MEDIA_PREFIX}${id}`,
    id,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
  };
}

export async function saveUploadedMediaBase64(input: {
  fileName: string;
  mimeType: string;
  dataBase64: string;
}): Promise<{ url: string; id: string; mimeType: string; sizeBytes: number }> {
  const blob = dataUrlToBlob(input.dataBase64, input.mimeType);
  return saveUploadedMediaBlob({
    fileName: input.fileName,
    mimeType: input.mimeType || blob.type,
    blob,
  });
}

// ---------------------------------------------------------------------------
// AUDIT LOGS & NOTIFICATIONS
// ---------------------------------------------------------------------------

export async function recordAuditLogLocal(input: {
  actorId: string;
  actorEmail: string;
  actorRole: AdminRole;
  action: string;
  targetType: string;
  targetId?: string;
  details?: string;
}): Promise<void> {
  const db = await getLocalDb();
  const entry: AuditLogEntry = {
    id: generateShortId('aud'),
    actorId: input.actorId,
    actorEmail: input.actorEmail,
    actorRole: input.actorRole,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId || '',
    details: input.details || '',
    createdAt: new Date().toISOString(),
  };
  const tx = db.transaction(['auditLogs'], 'readwrite');
  tx.objectStore('auditLogs').put(entry);
  await transactionDone(tx, 'Record audit log');
}

export async function listAuditLogsLocal(limit = 120): Promise<AuditLogEntry[]> {
  const rows = await getAllFromStore<AuditLogEntry>('auditLogs');
  return rows.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, limit);
}

function appendNotificationToStore(
  store: IDBObjectStore,
  input: Omit<AdminNotification, 'id' | 'isRead' | 'createdAt'>,
): void {
  const entry: AdminNotification = {
    id: generateShortId('ntf'),
    type: input.type,
    title: input.title,
    message: input.message,
    linkSection: input.linkSection || 'dashboard',
    isRead: false,
    createdAt: new Date().toISOString(),
  };
  store.put(entry);
}

export async function listNotificationsLocal(limit = 40): Promise<AdminNotification[]> {
  const rows = await getAllFromStore<AdminNotification>('notifications');
  return rows.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, limit);
}

export async function markNotificationsReadLocal(id?: string): Promise<AdminNotification[]> {
  const db = await getLocalDb();
  const rows = await getAllFromStore<AdminNotification>('notifications');
  const tx = db.transaction(['notifications'], 'readwrite');
  const store = tx.objectStore('notifications');
  for (const row of rows) {
    if (!id || row.id === id) {
      if (!row.isRead) {
        store.put({ ...row, isRead: true });
      }
    }
  }
  await transactionDone(tx, 'Mark notifications read');
  return listNotificationsLocal(40);
}

// ---------------------------------------------------------------------------
// STORE SETTINGS & CMS CONTENT
// ---------------------------------------------------------------------------

export async function getStoreSettingsLocal(): Promise<StoreSettingsFull> {
  const [entry, coupons] = await Promise.all([
    getOneFromStore<KeyedJsonEntry<StoreSettingsFull>>('storeSettings', 'main'),
    listCouponsLocal(true),
  ]);
  const defaults = getDefaultSettings();
  const parsed = entry?.value || defaults;
  const availableCoupons = coupons
    .filter((c) => c.showBanner || ['AURELIA10', 'GLOW500', 'FREESHIP'].includes(c.code))
    .map((c) => ({ code: c.code, description: c.description }));

  return {
    ...defaults,
    ...parsed,
    brandColors: {
      primary: parsed.brandColors?.primary || defaults.brandColors!.primary,
      secondary: parsed.brandColors?.secondary || defaults.brandColors!.secondary,
      accent: parsed.brandColors?.accent || defaults.brandColors!.accent,
    },
    socialLinks: {
      ...defaults.socialLinks,
      ...(parsed.socialLinks || {}),
    },
    availableCoupons,
  };
}

export async function getPublicStoreConfigLocal(): Promise<StoreConfig> {
  const full = await getStoreSettingsLocal();
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

export async function updateStoreSettingsLocal(patch: Partial<StoreSettingsFull>): Promise<StoreSettingsFull> {
  const db = await getLocalDb();
  const current = await getStoreSettingsLocal();
  const nowIso = new Date().toISOString();
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
  const tx = db.transaction(['storeSettings'], 'readwrite');
  tx.objectStore('storeSettings').put({ key: 'main', value: next, updatedAt: nowIso });
  await transactionDone(tx, 'Update store settings');
  syncLightweightStorePrefs(next);
  return getStoreSettingsLocal();
}

export async function getCmsContentLocal(): Promise<WebsiteContentCMS> {
  const entry = await getOneFromStore<KeyedJsonEntry<WebsiteContentCMS>>('cmsContent', 'main');
  return entry?.value ? { ...getDefaultCmsContent(), ...entry.value } : getDefaultCmsContent();
}

export async function updateCmsContentLocal(patch: Partial<WebsiteContentCMS>): Promise<WebsiteContentCMS> {
  const db = await getLocalDb();
  const current = await getCmsContentLocal();
  const nowIso = new Date().toISOString();
  const next: WebsiteContentCMS = {
    ...current,
    ...patch,
    updatedAt: nowIso,
  };
  const tx = db.transaction(['cmsContent'], 'readwrite');
  tx.objectStore('cmsContent').put({ key: 'main', value: next, updatedAt: nowIso });
  await transactionDone(tx, 'Update website content');
  return next;
}

// ---------------------------------------------------------------------------
// CATEGORIES
// ---------------------------------------------------------------------------

export async function listCategoriesLocal(includeCounts = false): Promise<CategoryRecord[]> {
  const rows = await getAllFromStore<CategoryRecord>('categories');
  let countMap = new Map<string, number>();
  if (includeCounts) {
    const prods = await getAllFromStore<Product>('products');
    for (const p of prods) {
      countMap.set(p.category, (countMap.get(p.category) || 0) + 1);
    }
  }
  return rows
    .map((r) => ({
      ...r,
      productCount: includeCounts ? countMap.get(r.name) || 0 : undefined,
    }))
    .sort((a, b) => {
      if (a.department !== b.department) return a.department.localeCompare(b.department);
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
      return a.name.localeCompare(b.name);
    });
}

export async function createCategoryLocal(input: {
  name: string;
  slug?: string;
  department: 'skincare' | 'haircare';
  description?: string;
  imageUrl?: string;
  displayOrder?: number;
  isActive?: boolean;
}): Promise<CategoryRecord> {
  const db = await getLocalDb();
  const name = input.name.trim();
  if (!name) {
    throw new LocalDatabaseError('Category name is required.', 400, 'VALIDATION_ERROR');
  }
  const slug = (input.slug?.trim() || name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const existing = await getAllFromStore<CategoryRecord>('categories');
  if (existing.some((c) => c.slug.toLowerCase() === slug)) {
    throw new LocalDatabaseError(`A category with slug "${slug}" already exists.`, 409, 'DUPLICATE_CATEGORY');
  }
  if (existing.some((c) => c.department === input.department && c.name.toLowerCase() === name.toLowerCase())) {
    throw new LocalDatabaseError(
      `Category "${name}" already exists under ${input.department}.`,
      409,
      'DUPLICATE_CATEGORY',
    );
  }

  const record: CategoryRecord = {
    id: generateShortId('cat'),
    slug,
    name,
    department: input.department,
    description: (input.description || '').trim(),
    imageUrl: (input.imageUrl || '').trim(),
    displayOrder: Number.isFinite(Number(input.displayOrder)) ? Number(input.displayOrder) : existing.length + 1,
    isActive: input.isActive !== false,
  };
  const tx = db.transaction(['categories'], 'readwrite');
  tx.objectStore('categories').put(record);
  await transactionDone(tx, 'Create category');
  return record;
}

export async function updateCategoryLocal(
  id: string,
  patch: Partial<CategoryRecord>,
): Promise<CategoryRecord | null> {
  const db = await getLocalDb();
  const existing = await getOneFromStore<CategoryRecord>('categories', id);
  if (!existing) return null;

  const nextName = (patch.name ?? existing.name).trim();
  const nextSlug = (patch.slug ?? existing.slug).trim().toLowerCase();
  const nextDept = patch.department ?? existing.department;

  const all = await getAllFromStore<CategoryRecord>('categories');
  if (all.some((c) => c.id !== id && c.slug.toLowerCase() === nextSlug)) {
    throw new LocalDatabaseError(`Another category already uses slug "${nextSlug}".`, 409, 'DUPLICATE_CATEGORY');
  }

  const next: CategoryRecord = {
    ...existing,
    ...patch,
    id,
    name: nextName,
    slug: nextSlug,
    department: nextDept,
  };

  const tx = db.transaction(['categories', 'products'], 'readwrite');
  tx.objectStore('categories').put(next);

  if (existing.name !== nextName) {
    const prods = await requestToPromise<Product[]>(tx.objectStore('products').getAll(), 'Read products for category rename');
    for (const p of prods) {
      if (p.category === existing.name) {
        tx.objectStore('products').put({
          ...p,
          category: nextName,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }

  await transactionDone(tx, 'Update category');
  return next;
}

export async function deleteCategoryLocal(id: string): Promise<boolean> {
  const db = await getLocalDb();
  const existing = await getOneFromStore<CategoryRecord>('categories', id);
  if (!existing) return false;
  const tx = db.transaction(['categories'], 'readwrite');
  tx.objectStore('categories').delete(id);
  await transactionDone(tx, 'Delete category');
  return true;
}

// ---------------------------------------------------------------------------
// PRODUCTS & INVENTORY
// ---------------------------------------------------------------------------

function slugifyProduct(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function listApprovedReviewsBySlugMap(onlyApproved = true): Promise<Map<string, ProductReview[]>> {
  const all = await getAllFromStore<StoredReviewRecord>('reviews');
  const map = new Map<string, ProductReview[]>();
  const sorted = all.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  for (const r of sorted) {
    if (onlyApproved && r.status !== 'approved') continue;
    const list = map.get(r.productSlug) || [];
    list.push({
      id: r.id,
      authorName: r.authorName,
      city: r.city,
      rating: r.rating,
      title: r.title,
      comment: r.comment,
      skinOrHairProfile: r.skinOrHairProfile,
      verifiedPurchase: r.verifiedPurchase,
      status: r.status,
      adminReply: r.adminReply,
      adminRepliedAt: r.adminRepliedAt,
      createdAt: r.createdAt,
    });
    map.set(r.productSlug, list);
  }
  return map;
}

export async function listProductsLocal(options?: {
  includeUnpublished?: boolean;
  includeReviews?: boolean;
}): Promise<Product[]> {
  const all = await getAllFromStore<Product>('products');
  const filtered = options?.includeUnpublished
    ? all
    : all.filter((p) => (p.status || 'published') === 'published');

  const reviewMap = options?.includeReviews ? await listApprovedReviewsBySlugMap(true) : null;

  return filtered
    .map((p) => ({
      ...p,
      reviews: reviewMap ? reviewMap.get(p.slug) || [] : p.reviews,
    }))
    .sort((a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || '') || a.id.localeCompare(b.id));
}

export async function getProductByIdLocal(id: string): Promise<Product | null> {
  const prod = await getOneFromStore<Product>('products', id);
  if (!prod) return null;
  const revMap = await listApprovedReviewsBySlugMap(true);
  return { ...prod, reviews: revMap.get(prod.slug) || [] };
}

export async function getProductBySlugLocal(slug: string, includeUnpublished = false): Promise<Product | null> {
  const all = await listProductsLocal({ includeUnpublished, includeReviews: true });
  return all.find((p) => p.slug === slug) || null;
}

export async function createProductLocal(input: Partial<Product>): Promise<Product> {
  const db = await getLocalDb();
  const name = (input.name || '').trim();
  if (!name || !input.department || !input.category || Number(input.pricePkr) <= 0) {
    throw new LocalDatabaseError(
      'Product name, department, category, and positive price (PKR) are required.',
      400,
      'VALIDATION_ERROR',
    );
  }

  const all = await getAllFromStore<Product>('products');
  const id = input.id?.trim() || generateShortId('prd');
  const baseSlug = slugifyProduct(input.slug || name) || id;

  if (all.some((p) => p.id === id)) {
    throw new LocalDatabaseError(`A product with ID "${id}" already exists.`, 409, 'DUPLICATE_PRODUCT');
  }
  if (all.some((p) => p.slug.toLowerCase() === baseSlug.toLowerCase())) {
    throw new LocalDatabaseError(`A product with slug "${baseSlug}" already exists.`, 409, 'DUPLICATE_PRODUCT_SLUG');
  }

  const sku = (
    input.sku?.trim() ||
    `AB-${input.department === 'haircare' ? 'HC' : 'SK'}-${id.slice(-4).toUpperCase()}`
  ).trim();
  if (sku && all.some((p) => (p.sku || '').toLowerCase() === sku.toLowerCase())) {
    throw new LocalDatabaseError(`A product with SKU "${sku}" already exists.`, 409, 'DUPLICATE_SKU');
  }

  const nowIso = new Date().toISOString();
  const pricePkr = Math.round(Number(input.pricePkr));
  const discountPricePkr =
    typeof input.discountPricePkr === 'number' && input.discountPricePkr > 0 && input.discountPricePkr < pricePkr
      ? Math.round(input.discountPricePkr)
      : undefined;

  const product: Product = {
    id,
    slug: baseSlug,
    sku,
    name,
    subtitle: (input.subtitle || 'Botanical Formulation').trim(),
    brandLine: (input.brandLine || 'Aurelia Reserve').trim(),
    department: input.department,
    category: input.category,
    pricePkr,
    discountPricePkr,
    volume: (input.volume || '50 ml').trim(),
    rating: input.rating ?? 5.0,
    reviewCount: input.reviewCount ?? 0,
    stock: Math.max(0, Math.round(Number(input.stock ?? 20))),
    status: input.status || 'published',
    isBestSeller: Boolean(input.isBestSeller),
    isNewArrival: input.isNewArrival ?? true,
    isTrending: Boolean(input.isTrending),
    isFeaturedHome: Boolean(input.isFeaturedHome),
    suitableTypes: input.suitableTypes?.length ? input.suitableTypes : ['Normal Skin'],
    concerns: input.concerns?.length ? input.concerns : ['Daily Care'],
    keyIngredients: input.keyIngredients?.length ? input.keyIngredients : ['Botanical Extracts'],
    fullIngredientList: input.fullIngredientList || 'Aqua, Botanical Glycerin, Tocopherol.',
    ingredientNotes: input.ingredientNotes?.length
      ? input.ingredientNotes
      : [{ name: 'Botanical Complex', role: 'Supports balanced daily cosmetic nourishment.' }],
    description: (input.description || input.subtitle || name).trim(),
    benefits: input.benefits?.length ? input.benefits : ['Supports balanced hydration and glow'],
    howToUse: input.howToUse || 'Apply evenly onto clean skin or hair as directed.',
    routineTime: input.routineTime || 'Morning & Night',
    precautions: input.precautions || 'For external cosmetic use only. Patch test prior to first use.',
    images: input.images?.length ? input.images : [STORE_IMAGES.serum],
    videoUrl: input.videoUrl?.trim() || undefined,
    variants: input.variants || [],
    modelSilhouette: input.modelSilhouette || 'dropper',
    defaultFinish: input.defaultFinish || 'emerald',
    modelConfig: input.modelConfig,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const tx = db.transaction(['products'], 'readwrite');
  tx.objectStore('products').put(product);
  await transactionDone(tx, 'Create product');
  return { ...product, reviews: [] };
}

export async function updateProductLocal(id: string, patch: Partial<Product>): Promise<Product | null> {
  const db = await getLocalDb();
  const existing = await getOneFromStore<Product>('products', id);
  if (!existing) return null;

  const all = await getAllFromStore<Product>('products');
  const nextSlug = (patch.slug ? slugifyProduct(patch.slug) : existing.slug) || existing.slug;
  const nextSku = patch.sku !== undefined ? patch.sku.trim() : existing.sku || '';

  if (all.some((p) => p.id !== id && p.slug.toLowerCase() === nextSlug.toLowerCase())) {
    throw new LocalDatabaseError(`Another product already uses slug "${nextSlug}".`, 409, 'DUPLICATE_PRODUCT_SLUG');
  }
  if (nextSku && all.some((p) => p.id !== id && (p.sku || '').toLowerCase() === nextSku.toLowerCase())) {
    throw new LocalDatabaseError(`Another product already uses SKU "${nextSku}".`, 409, 'DUPLICATE_SKU');
  }

  const nowIso = new Date().toISOString();
  const pricePkr = Math.round(Number(patch.pricePkr ?? existing.pricePkr));
  const rawDisc = patch.discountPricePkr !== undefined ? patch.discountPricePkr : existing.discountPricePkr;
  const discountPricePkr =
    typeof rawDisc === 'number' && rawDisc > 0 && rawDisc < pricePkr ? Math.round(rawDisc) : undefined;

  const next: Product = {
    ...existing,
    ...patch,
    id,
    slug: nextSlug,
    sku: nextSku,
    pricePkr,
    discountPricePkr,
    stock: Math.max(0, Math.round(Number(patch.stock ?? existing.stock))),
    createdAt: existing.createdAt || nowIso,
    updatedAt: nowIso,
  };
  delete next.reviews;

  const tx = db.transaction(['products'], 'readwrite');
  tx.objectStore('products').put(next);
  await transactionDone(tx, 'Update product');
  return getProductByIdLocal(id);
}

export async function updateProduct3DConfigLocal(id: string, cfg: Product3DConfig): Promise<Product | null> {
  const existing = await getOneFromStore<Product>('products', id);
  if (!existing) return null;
  return updateProductLocal(id, {
    modelConfig: cfg,
    modelSilhouette: cfg.silhouette || existing.modelSilhouette,
    defaultFinish: cfg.finish || existing.defaultFinish,
  });
}

export async function deleteProductLocal(id: string): Promise<boolean> {
  const db = await getLocalDb();
  const existing = await getOneFromStore<Product>('products', id);
  if (!existing) return false;
  const reviews = await getAllFromStore<StoredReviewRecord>('reviews');
  const tx = db.transaction(['products', 'reviews'], 'readwrite');
  tx.objectStore('products').delete(id);
  for (const rev of reviews) {
    if (rev.productId === id) {
      tx.objectStore('reviews').delete(rev.id);
    }
  }
  await transactionDone(tx, 'Delete product');
  return true;
}

export async function adjustProductStockLocal(params: {
  productId: string;
  delta?: number;
  setStock?: number;
  reason: string;
  actorEmail: string;
}): Promise<{ product: Product; entry: StockHistoryEntry } | null> {
  const db = await getLocalDb();
  const existing = await getOneFromStore<Product>('products', params.productId);
  if (!existing) return null;

  const settings = await getStoreSettingsLocal();
  const prevStock = existing.stock;
  const nextStock =
    typeof params.setStock === 'number'
      ? Math.max(0, Math.round(params.setStock))
      : Math.max(0, prevStock + Math.round(params.delta || 0));
  const delta = nextStock - prevStock;
  const nowIso = new Date().toISOString();

  const updatedProduct: Product = {
    ...existing,
    stock: nextStock,
    updatedAt: nowIso,
  };
  delete updatedProduct.reviews;

  const entry: StockHistoryEntry = {
    id: generateShortId('stk'),
    productId: existing.id,
    productName: existing.name,
    sku: existing.sku,
    delta,
    previousStock: prevStock,
    newStock: nextStock,
    reason: params.reason.trim() || 'Manual inventory update',
    actorEmail: params.actorEmail,
    createdAt: nowIso,
  };

  const tx = db.transaction(['products', 'stockHistory', 'notifications'], 'readwrite');
  tx.objectStore('products').put(updatedProduct);
  tx.objectStore('stockHistory').put(entry);

  if (settings.notifyLowStock && nextStock <= settings.lowStockThreshold && prevStock > settings.lowStockThreshold) {
    appendNotificationToStore(tx.objectStore('notifications'), {
      type: 'low_stock',
      title: `Low Stock Alert: ${existing.name}`,
      message: `${nextStock} units remaining (threshold: ${settings.lowStockThreshold}).`,
      linkSection: 'inventory',
    });
  }

  await transactionDone(tx, 'Adjust inventory');
  return { product: updatedProduct, entry };
}

export async function listStockHistoryLocal(limit = 100): Promise<StockHistoryEntry[]> {
  const rows = await getAllFromStore<StockHistoryEntry>('stockHistory');
  return rows.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, limit);
}

// ---------------------------------------------------------------------------
// REVIEWS & MODERATION
// ---------------------------------------------------------------------------

async function recalculateProductRatingInTx(
  reviewsStore: IDBObjectStore,
  productsStore: IDBObjectStore,
  productId: string,
): Promise<void> {
  const allReviews = await requestToPromise<StoredReviewRecord[]>(reviewsStore.getAll(), 'Read reviews for rating');
  const approved = allReviews.filter((r) => r.productId === productId && r.status === 'approved');
  const prod = await requestToPromise<Product | undefined>(productsStore.get(productId), 'Get product for rating');
  if (!prod) return;

  const count = approved.length;
  const avg = count > 0 ? Number((approved.reduce((s, r) => s + r.rating, 0) / count).toFixed(1)) : 5.0;
  productsStore.put({
    ...prod,
    rating: avg,
    reviewCount: count,
    updatedAt: new Date().toISOString(),
  });
}

export async function addCustomerReviewLocal(
  slug: string,
  input: {
    authorName: string;
    city?: string;
    rating: number;
    title?: string;
    comment: string;
    skinOrHairProfile?: string;
  },
): Promise<{ review: ProductReview; product: Product } | null> {
  const db = await getLocalDb();
  const product = await getProductBySlugLocal(slug, false);
  if (!product) return null;

  const nowIso = new Date().toISOString();
  const review: StoredReviewRecord = {
    id: generateShortId('rev'),
    productId: product.id,
    productSlug: product.slug,
    authorName: input.authorName.trim(),
    city: input.city?.trim() || 'Pakistan',
    rating: Math.min(5, Math.max(1, Math.round(Number(input.rating) || 5))),
    title: input.title?.trim() || 'Verified Customer Experience',
    comment: input.comment.trim(),
    skinOrHairProfile: input.skinOrHairProfile?.trim() || 'Customer Review',
    verifiedPurchase: false,
    status: 'approved',
    createdAt: nowIso,
  };

  const tx = db.transaction(['reviews', 'products', 'notifications'], 'readwrite');
  tx.objectStore('reviews').put(review);
  await recalculateProductRatingInTx(tx.objectStore('reviews'), tx.objectStore('products'), product.id);
  appendNotificationToStore(tx.objectStore('notifications'), {
    type: 'review',
    title: `New ${review.rating}★ Review`,
    message: `${review.authorName} reviewed ${product.name}.`,
    linkSection: 'reviews',
  });
  await transactionDone(tx, 'Submit product review');

  const updatedProd = await getProductBySlugLocal(slug, false);
  return { review, product: updatedProd! };
}

export async function listAllReviewsForAdminLocal(): Promise<ReviewModerationRecord[]> {
  const [reviews, products] = await Promise.all([
    getAllFromStore<StoredReviewRecord>('reviews'),
    getAllFromStore<Product>('products'),
  ]);
  const prodNameMap = new Map(products.map((p) => [p.id, p.name]));
  return reviews
    .map((r) => ({
      id: r.id,
      productId: r.productId,
      productSlug: r.productSlug,
      productName: prodNameMap.get(r.productId) || r.productSlug,
      authorName: r.authorName,
      city: r.city,
      rating: r.rating,
      title: r.title,
      comment: r.comment,
      skinOrHairProfile: r.skinOrHairProfile,
      verifiedPurchase: r.verifiedPurchase,
      status: r.status || 'approved',
      adminReply: r.adminReply,
      adminRepliedAt: r.adminRepliedAt,
      createdAt: r.createdAt,
    }))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function moderateReviewLocal(
  id: string,
  patch: { status?: 'approved' | 'pending' | 'hidden'; adminReply?: string },
): Promise<ReviewModerationRecord | null> {
  const db = await getLocalDb();
  const existing = await getOneFromStore<StoredReviewRecord>('reviews', id);
  if (!existing) return null;

  const nowIso = new Date().toISOString();
  const next: StoredReviewRecord = {
    ...existing,
    status: patch.status || existing.status || 'approved',
    adminReply: patch.adminReply !== undefined ? patch.adminReply.trim() : existing.adminReply,
    adminRepliedAt: patch.adminReply !== undefined ? nowIso : existing.adminRepliedAt,
  };

  const tx = db.transaction(['reviews', 'products'], 'readwrite');
  tx.objectStore('reviews').put(next);
  await recalculateProductRatingInTx(tx.objectStore('reviews'), tx.objectStore('products'), existing.productId);
  await transactionDone(tx, 'Moderate review');

  const all = await listAllReviewsForAdminLocal();
  return all.find((r) => r.id === id) || null;
}

export async function deleteReviewLocal(id: string): Promise<boolean> {
  const db = await getLocalDb();
  const existing = await getOneFromStore<StoredReviewRecord>('reviews', id);
  if (!existing) return false;
  const tx = db.transaction(['reviews', 'products'], 'readwrite');
  tx.objectStore('reviews').delete(id);
  await recalculateProductRatingInTx(tx.objectStore('reviews'), tx.objectStore('products'), existing.productId);
  await transactionDone(tx, 'Delete review');
  return true;
}

// ---------------------------------------------------------------------------
// COUPONS
// ---------------------------------------------------------------------------

export async function listCouponsLocal(activeOnly = false): Promise<CouponRecord[]> {
  const rows = await getAllFromStore<CouponRecord>('coupons');
  return rows
    .filter((c) => (!activeOnly ? true : c.isActive))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function evaluateCouponLocal(
  rawCode: string | undefined,
  subtotalPkr: number,
  options?: { itemCategories?: string[]; itemProductIds?: string[]; userId?: string },
): Promise<{ valid: boolean; code: string; discountPkr: number; freeShipping: boolean; message: string }> {
  const code = (rawCode || '').trim().toUpperCase();
  if (!code) {
    return { valid: false, code: '', discountPkr: 0, freeShipping: false, message: 'Enter a promo code.' };
  }
  const coupons = await listCouponsLocal(false);
  const coupon = coupons.find((c) => c.code === code);
  if (!coupon || !coupon.isActive) {
    return {
      valid: false,
      code,
      discountPkr: 0,
      freeShipping: false,
      message: 'This promo code is invalid or inactive.',
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
    const orders = await getAllFromStore<OrderRecord>('orders');
    const prevOrders = orders.filter((o) => o.userId === options.userId && o.status !== 'Cancelled').length;
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

export async function createCouponLocal(input: Partial<CouponRecord>): Promise<CouponRecord> {
  const db = await getLocalDb();
  const code = (input.code || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!code) {
    throw new LocalDatabaseError('Coupon code is required.', 400, 'VALIDATION_ERROR');
  }
  const existing = await getAllFromStore<CouponRecord>('coupons');
  if (existing.some((c) => c.code === code)) {
    throw new LocalDatabaseError(`Coupon code "${code}" already exists.`, 409, 'DUPLICATE_COUPON');
  }
  const coupon: CouponRecord = {
    id: generateShortId('cpn'),
    code,
    description: (input.description || '').trim(),
    discountType: input.discountType || 'percentage',
    discountValue: Number(input.discountValue || 0),
    minOrderAmountPkr: Math.max(0, Math.round(Number(input.minOrderAmountPkr || 0))),
    maxDiscountPkr: input.maxDiscountPkr ? Math.round(Number(input.maxDiscountPkr)) : undefined,
    scope: input.scope || 'all',
    targetCategories: input.targetCategories || [],
    targetProductIds: input.targetProductIds || [],
    startDate: input.startDate || '',
    expiryDate: input.expiryDate || '',
    usageLimit: input.usageLimit ? Math.round(Number(input.usageLimit)) : undefined,
    usedCount: 0,
    isActive: input.isActive !== false,
    showBanner: Boolean(input.showBanner),
    createdAt: new Date().toISOString(),
  };
  const tx = db.transaction(['coupons'], 'readwrite');
  tx.objectStore('coupons').put(coupon);
  await transactionDone(tx, 'Create coupon');
  return coupon;
}

export async function updateCouponLocal(id: string, patch: Partial<CouponRecord>): Promise<CouponRecord | null> {
  const db = await getLocalDb();
  const existing = await getOneFromStore<CouponRecord>('coupons', id);
  if (!existing) return null;
  const nextCode = (patch.code || existing.code).trim().toUpperCase().replace(/\s+/g, '');
  const all = await getAllFromStore<CouponRecord>('coupons');
  if (all.some((c) => c.id !== id && c.code === nextCode)) {
    throw new LocalDatabaseError(`Another coupon already uses code "${nextCode}".`, 409, 'DUPLICATE_COUPON');
  }
  const next: CouponRecord = { ...existing, ...patch, id, code: nextCode };
  const tx = db.transaction(['coupons'], 'readwrite');
  tx.objectStore('coupons').put(next);
  await transactionDone(tx, 'Update coupon');
  return next;
}

export async function deleteCouponLocal(id: string): Promise<boolean> {
  const db = await getLocalDb();
  const existing = await getOneFromStore<CouponRecord>('coupons', id);
  if (!existing) return false;
  const tx = db.transaction(['coupons'], 'readwrite');
  tx.objectStore('coupons').delete(id);
  await transactionDone(tx, 'Delete coupon');
  return true;
}

// ---------------------------------------------------------------------------
// CUSTOMERS & CUSTOMER AUTH
// ---------------------------------------------------------------------------

export function sanitizeCustomer(c: StoredCustomerLocal): CustomerProfile {
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
  };
}

export async function findCustomerByIdLocal(id: string): Promise<StoredCustomerLocal | null> {
  const found = await getOneFromStore<StoredCustomerLocal>('customers', id);
  return found || null;
}

export async function findCustomerByEmailLocal(email: string): Promise<StoredCustomerLocal | null> {
  const norm = email.trim().toLowerCase();
  const all = await getAllFromStore<StoredCustomerLocal>('customers');
  return all.find((c) => c.email.toLowerCase() === norm) || null;
}

export async function registerCustomerLocal(input: {
  name: string;
  email: string;
  phone?: string;
  password: string;
}): Promise<{ token: string; user: CustomerProfile }> {
  const db = await getLocalDb();
  const email = input.email.trim().toLowerCase();
  if (!input.name.trim() || !email || input.password.length < 6) {
    throw new LocalDatabaseError(
      'Name, email, and a password of at least 6 characters are required.',
      400,
      'VALIDATION_ERROR',
    );
  }
  const existing = await findCustomerByEmailLocal(email);
  if (existing) {
    throw new LocalDatabaseError('An account with this email already exists.', 409, 'DUPLICATE_CUSTOMER');
  }
  const { salt, hash } = await hashPasswordLocal(input.password);
  const record: StoredCustomerLocal = {
    id: generateShortId('usr'),
    name: input.name.trim(),
    email,
    phone: (input.phone || '').trim(),
    passwordHash: hash,
    passwordSalt: salt,
    isActive: true,
    savedAddresses: [],
    savedRoutines: [],
    wishlistIds: [],
    createdAt: new Date().toISOString(),
  };
  const tx = db.transaction(['customers'], 'readwrite');
  tx.objectStore('customers').put(record);
  await transactionDone(tx, 'Register customer');
  return { token: `local-cust:${record.id}`, user: sanitizeCustomer(record) };
}

export async function loginCustomerLocal(
  email: string,
  password: string,
): Promise<{ token: string; user: CustomerProfile }> {
  const customer = await findCustomerByEmailLocal(email);
  if (!customer) {
    throw new LocalDatabaseError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  }
  if (customer.isActive === false) {
    throw new LocalDatabaseError('This customer account is currently disabled.', 403, 'ACCOUNT_DISABLED');
  }
  const ok = await verifyPasswordLocal(password, customer.passwordSalt, customer.passwordHash);
  if (!ok) {
    throw new LocalDatabaseError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  }
  return { token: `local-cust:${customer.id}`, user: sanitizeCustomer(customer) };
}

export async function getCustomerFromTokenLocal(token: string | undefined | null): Promise<StoredCustomerLocal | null> {
  if (!token || !token.startsWith('local-cust:')) return null;
  const id = token.slice('local-cust:'.length);
  const user = await findCustomerByIdLocal(id);
  if (!user || user.isActive === false) return null;
  return user;
}

export async function updateCustomerProfileLocal(
  id: string,
  patch: Partial<CustomerProfile>,
): Promise<StoredCustomerLocal | null> {
  const db = await getLocalDb();
  const existing = await findCustomerByIdLocal(id);
  if (!existing) return null;
  const next: StoredCustomerLocal = {
    ...existing,
    name: typeof patch.name === 'string' && patch.name.trim() ? patch.name.trim() : existing.name,
    phone: typeof patch.phone === 'string' ? patch.phone.trim() : existing.phone,
    savedAddresses: Array.isArray(patch.savedAddresses) ? patch.savedAddresses : existing.savedAddresses,
    savedRoutines: Array.isArray(patch.savedRoutines) ? patch.savedRoutines : existing.savedRoutines,
    wishlistIds: Array.isArray(patch.wishlistIds) ? patch.wishlistIds : existing.wishlistIds,
    isActive: typeof patch.isActive === 'boolean' ? patch.isActive : existing.isActive !== false,
  };
  const tx = db.transaction(['customers'], 'readwrite');
  tx.objectStore('customers').put(next);
  await transactionDone(tx, 'Update customer profile');
  return next;
}

export async function listCustomerSummariesLocal(): Promise<CustomerSummaryRecord[]> {
  const [customers, orders] = await Promise.all([
    getAllFromStore<StoredCustomerLocal>('customers'),
    listOrdersLocal(500),
  ]);
  return customers
    .sort((a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''))
    .map((c) => {
      const custOrders = orders.filter(
        (o) => o.userId === c.id || (o.customerEmail && o.customerEmail.toLowerCase() === c.email.toLowerCase()),
      );
      const validOrders = custOrders.filter((o) => o.status !== 'Cancelled' && o.status !== 'Returned');
      return {
        ...sanitizeCustomer(c),
        orderCount: custOrders.length,
        totalSpentPkr: validOrders.reduce((s, o) => s + o.totalPkr, 0),
        lastOrderAt: custOrders[0]?.createdAt,
        orders: custOrders,
      };
    });
}

// ---------------------------------------------------------------------------
// ORDERS (TRANSACTIONAL)
// ---------------------------------------------------------------------------

export async function listOrdersLocal(limit = 500): Promise<OrderRecord[]> {
  const rows = await getAllFromStore<OrderRecord>('orders');
  return rows.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, limit);
}

export async function getOrderByIdLocal(id: string): Promise<OrderRecord | null> {
  const found = await getOneFromStore<OrderRecord>('orders', id);
  return found || null;
}

export async function placeOrderTransactionalLocal(params: {
  authUser?: StoredCustomerLocal | null;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  shippingAddress: OrderRecord['shippingAddress'];
  paymentMethod: 'cod' | 'whatsapp';
  items: { productId: string; quantity: number }[];
  couponCode?: string;
}): Promise<OrderRecord> {
  if (!params.customerName?.trim() || !params.customerPhone?.trim() || !params.shippingAddress?.street?.trim() || !params.shippingAddress?.city?.trim()) {
    throw new LocalDatabaseError(
      'Please complete your name, phone number, street address, and city.',
      400,
      'VALIDATION_ERROR',
    );
  }
  if (!Array.isArray(params.items) || params.items.length === 0) {
    throw new LocalDatabaseError('Your shopping bag is empty.', 400, 'EMPTY_BAG');
  }

  const db = await getLocalDb();
  const [settings, allProducts, allCoupons, seqEntry] = await Promise.all([
    getStoreSettingsLocal(),
    getAllFromStore<Product>('products'),
    getAllFromStore<CouponRecord>('coupons'),
    getOneFromStore<MetaEntry>('meta', 'orderSequence'),
  ]);

  const prodMap = new Map(allProducts.map((p) => [p.id, p]));
  const orderItems: OrderRecord['items'] = [];
  const itemCategories: string[] = [];
  const itemProductIds: string[] = [];

  for (const reqItem of params.items) {
    const product = prodMap.get(reqItem.productId);
    if (!product || (product.status || 'published') !== 'published') {
      throw new LocalDatabaseError(`Product ${reqItem.productId} is no longer available.`, 400, 'PRODUCT_UNAVAILABLE');
    }
    const qty = Math.max(1, Math.min(20, Math.floor(Number(reqItem.quantity) || 1)));
    if (product.stock < qty) {
      throw new LocalDatabaseError(
        `Insufficient stock for ${product.name} (${product.stock} remaining).`,
        400,
        'INSUFFICIENT_STOCK',
      );
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

  const subtotalPkr = orderItems.reduce((sum, i) => sum + i.unitPricePkr * i.quantity, 0);
  const couponResult = params.couponCode
    ? await evaluateCouponLocal(params.couponCode, subtotalPkr, {
        itemCategories,
        itemProductIds,
        userId: params.authUser?.id,
      })
    : null;

  const discountPkr = couponResult?.valid ? couponResult.discountPkr : 0;
  const afterDiscount = Math.max(0, subtotalPkr - discountPkr);
  const qualifiesFreeShipping =
    afterDiscount >= settings.freeShippingThresholdPkr || Boolean(couponResult?.valid && couponResult.freeShipping);
  const shippingPkr = qualifiesFreeShipping ? 0 : settings.shippingFeePkr;
  const taxPkr = settings.taxPercent ? Math.round((afterDiscount * settings.taxPercent) / 100) : 0;
  const totalPkr = afterDiscount + shippingPkr + taxPkr;

  const nextSeq = Number(seqEntry?.value || 1041) + 1;
  const orderNumber = `AB-${nextSeq}`;
  const nowIso = new Date().toISOString();

  const order: OrderRecord = {
    id: generateShortId('ord'),
    orderNumber,
    userId: params.authUser?.id,
    customerName: params.customerName.trim(),
    customerPhone: params.customerPhone.trim(),
    customerEmail: params.customerEmail?.trim() || params.authUser?.email || undefined,
    shippingAddress: params.shippingAddress,
    paymentMethod: params.paymentMethod,
    items: orderItems,
    subtotalPkr,
    shippingPkr,
    discountPkr,
    taxPkr,
    couponCode: couponResult?.valid ? couponResult.code : undefined,
    totalPkr,
    status: 'Pending',
    internalNotes: '',
    statusHistory: [
      {
        status: 'Pending',
        note: 'Order placed on storefront',
        changedBy: params.customerEmail?.trim() || params.authUser?.email || 'customer',
        changedAt: nowIso,
      },
    ],
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const tx = db.transaction(
    ['meta', 'products', 'stockHistory', 'coupons', 'orders', 'notifications'],
    'readwrite',
  );
  tx.objectStore('meta').put({ key: 'orderSequence', value: String(nextSeq) });

  for (const item of orderItems) {
    const prod = prodMap.get(item.productId)!;
    const newStock = Math.max(0, prod.stock - item.quantity);
    const updatedProd: Product = { ...prod, stock: newStock, updatedAt: nowIso };
    delete updatedProd.reviews;
    tx.objectStore('products').put(updatedProd);
    prodMap.set(prod.id, updatedProd);

    tx.objectStore('stockHistory').put({
      id: generateShortId('stk'),
      productId: prod.id,
      productName: prod.name,
      sku: prod.sku,
      delta: -item.quantity,
      previousStock: prod.stock,
      newStock,
      reason: `Order ${orderNumber} placed`,
      actorEmail: params.customerEmail?.trim() || params.authUser?.email || 'customer',
      createdAt: nowIso,
    } satisfies StockHistoryEntry);

    if (settings.notifyLowStock && newStock <= settings.lowStockThreshold && prod.stock > settings.lowStockThreshold) {
      appendNotificationToStore(tx.objectStore('notifications'), {
        type: 'low_stock',
        title: `Low Stock Alert: ${prod.name}`,
        message: `${newStock} units remaining after ${orderNumber}.`,
        linkSection: 'inventory',
      });
    }
  }

  if (couponResult?.valid) {
    const cpn = allCoupons.find((c) => c.code === couponResult.code);
    if (cpn) {
      tx.objectStore('coupons').put({ ...cpn, usedCount: cpn.usedCount + 1 });
    }
  }

  tx.objectStore('orders').put(order);
  if (settings.notifyNewOrders) {
    appendNotificationToStore(tx.objectStore('notifications'), {
      type: 'order',
      title: `New Order ${orderNumber}`,
      message: `${order.customerName} (${order.shippingAddress.city}) · PKR ${order.totalPkr.toLocaleString('en-PK')}`,
      linkSection: 'orders',
    });
  }

  await transactionDone(tx, 'Place order');
  return order;
}

export async function updateOrderStatusLocal(params: {
  id: string;
  status: OrderStatus;
  note?: string;
  actorEmail: string;
}): Promise<OrderRecord | null> {
  const db = await getLocalDb();
  const existing = await getOrderByIdLocal(params.id);
  if (!existing) return null;

  const nowIso = new Date().toISOString();
  const shouldRestock =
    (params.status === 'Cancelled' || params.status === 'Returned') &&
    existing.status !== 'Cancelled' &&
    existing.status !== 'Returned';

  const history = [
    ...(existing.statusHistory || []),
    {
      status: params.status,
      note: params.note?.trim() || undefined,
      changedBy: params.actorEmail,
      changedAt: nowIso,
    },
  ];

  const updated: OrderRecord = {
    ...existing,
    status: params.status,
    statusHistory: history,
    updatedAt: nowIso,
  };

  const allProducts = shouldRestock ? await getAllFromStore<Product>('products') : [];
  const prodMap = new Map(allProducts.map((p) => [p.id, p]));

  const tx = db.transaction(['orders', 'products', 'stockHistory'], 'readwrite');
  tx.objectStore('orders').put(updated);

  if (shouldRestock) {
    for (const item of existing.items) {
      const prod = prodMap.get(item.productId);
      if (prod) {
        const nextStock = prod.stock + item.quantity;
        const nextProd: Product = { ...prod, stock: nextStock, updatedAt: nowIso };
        delete nextProd.reviews;
        tx.objectStore('products').put(nextProd);
        tx.objectStore('stockHistory').put({
          id: generateShortId('stk'),
          productId: prod.id,
          productName: prod.name,
          sku: prod.sku,
          delta: item.quantity,
          previousStock: prod.stock,
          newStock: nextStock,
          reason: `Order ${existing.orderNumber} marked ${params.status}`,
          actorEmail: params.actorEmail,
          createdAt: nowIso,
        } satisfies StockHistoryEntry);
      }
    }
  }

  await transactionDone(tx, 'Update order status');
  return updated;
}

export async function updateOrderInternalNotesLocal(id: string, internalNotes: string): Promise<OrderRecord | null> {
  const db = await getLocalDb();
  const existing = await getOrderByIdLocal(id);
  if (!existing) return null;
  const updated: OrderRecord = {
    ...existing,
    internalNotes,
    updatedAt: new Date().toISOString(),
  };
  const tx = db.transaction(['orders'], 'readwrite');
  tx.objectStore('orders').put(updated);
  await transactionDone(tx, 'Update order notes');
  return updated;
}

// ---------------------------------------------------------------------------
// SUPPORT TICKETS, WHATSAPP REFERRALS & AI AGENTS / TELEMETRY
// ---------------------------------------------------------------------------

export async function listSupportTicketsLocal(): Promise<SupportTicket[]> {
  const rows = await getAllFromStore<SupportTicket>('supportTickets');
  return rows.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export async function createSupportTicketLocal(input: {
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  subject: string;
  message: string;
  source?: SupportTicket['source'];
  priority?: SupportTicket['priority'];
}): Promise<SupportTicket> {
  const db = await getLocalDb();
  const seqEntry = await getOneFromStore<MetaEntry>('meta', 'ticketSequence');
  const nextSeq = Number(seqEntry?.value || 500) + 1;
  const nowIso = new Date().toISOString();
  const status: SupportTicket['status'] = input.source === 'ai_escalation' ? 'escalated' : 'open';
  const ticketNumber = `SUP-${nextSeq}`;
  const messages: SupportMessage[] = [
    {
      id: generateShortId('msg'),
      senderRole: 'customer',
      senderName: input.customerName.trim(),
      text: input.message.trim(),
      createdAt: nowIso,
    },
  ];
  const ticket: SupportTicket = {
    id: generateShortId('tkt'),
    ticketNumber,
    customerName: input.customerName.trim(),
    customerEmail: input.customerEmail?.trim() || undefined,
    customerPhone: input.customerPhone?.trim() || undefined,
    subject: input.subject.trim(),
    source: input.source || 'support_form',
    status,
    priority: input.priority || (status === 'escalated' ? 'high' : 'normal'),
    messages,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const tx = db.transaction(['meta', 'supportTickets', 'notifications'], 'readwrite');
  tx.objectStore('meta').put({ key: 'ticketSequence', value: String(nextSeq) });
  tx.objectStore('supportTickets').put(ticket);
  appendNotificationToStore(tx.objectStore('notifications'), {
    type: 'support',
    title: `${status === 'escalated' ? 'AI Escalation' : 'Support Ticket'} ${ticketNumber}`,
    message: `${ticket.customerName}: ${ticket.subject}`,
    linkSection: 'support',
  });
  await transactionDone(tx, 'Create support ticket');
  return ticket;
}

export async function updateSupportTicketLocal(
  id: string,
  patch: {
    status?: SupportTicket['status'];
    priority?: SupportTicket['priority'];
    assignedAgentEmail?: string;
    replyText?: string;
    replySenderName?: string;
  },
): Promise<SupportTicket | null> {
  const db = await getLocalDb();
  const existing = await getOneFromStore<SupportTicket>('supportTickets', id);
  if (!existing) return null;
  const nowIso = new Date().toISOString();
  const messages = [...existing.messages];
  if (patch.replyText?.trim()) {
    messages.push({
      id: generateShortId('msg'),
      senderRole: 'admin',
      senderName: patch.replySenderName || 'Aurelia Support Team',
      text: patch.replyText.trim(),
      createdAt: nowIso,
    });
  }
  const updated: SupportTicket = {
    ...existing,
    status: patch.status || existing.status,
    priority: patch.priority || existing.priority,
    assignedAgentEmail:
      patch.assignedAgentEmail !== undefined ? patch.assignedAgentEmail : existing.assignedAgentEmail,
    messages,
    updatedAt: nowIso,
  };
  const tx = db.transaction(['supportTickets'], 'readwrite');
  tx.objectStore('supportTickets').put(updated);
  await transactionDone(tx, 'Update support ticket');
  return updated;
}

export async function recordWhatsAppReferralLocal(
  source: string,
  summary: string,
  customerPhone?: string,
): Promise<void> {
  const db = await getLocalDb();
  const entry: WhatsAppReferralRecord = {
    id: generateShortId('war'),
    source,
    customerPhone: customerPhone || undefined,
    summary: summary.slice(0, 400),
    createdAt: new Date().toISOString(),
  };
  const tx = db.transaction(['whatsappReferrals'], 'readwrite');
  tx.objectStore('whatsappReferrals').put(entry);
  await transactionDone(tx, 'Record WhatsApp referral');
}

export async function listWhatsAppReferralsLocal(limit = 50): Promise<WhatsAppReferralRecord[]> {
  const rows = await getAllFromStore<WhatsAppReferralRecord>('whatsappReferrals');
  return rows.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, limit);
}

export async function listAIAgentsLocal(): Promise<AIAgentConfig[]> {
  const rows = await getAllFromStore<AIAgentConfig>('aiAgents');
  return rows.sort((a, b) => a.agentKey.localeCompare(b.agentKey));
}

export async function updateAIAgentLocal(
  agentKey: string,
  patch: Partial<AIAgentConfig>,
): Promise<AIAgentConfig | null> {
  const db = await getLocalDb();
  const existing = await getOneFromStore<AIAgentConfig>('aiAgents', agentKey);
  if (!existing) return null;
  const next: AIAgentConfig = {
    ...existing,
    ...patch,
    agentKey,
    updatedAt: new Date().toISOString(),
  };
  const tx = db.transaction(['aiAgents'], 'readwrite');
  tx.objectStore('aiAgents').put(next);
  await transactionDone(tx, 'Update AI agent config');
  return next;
}

export async function recordAIEventLocal(input: {
  eventType: AIEventRecord['eventType'];
  agentKey?: string;
  queryText?: string;
  productSlug?: string;
  errorMessage?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const db = await getLocalDb();
  const entry: AIEventRecord = {
    id: generateShortId('aie'),
    eventType: input.eventType,
    agentKey: input.agentKey || 'beauty_expert',
    queryText: (input.queryText || '').slice(0, 240),
    productSlug: input.productSlug || '',
    errorMessage: (input.errorMessage || '').slice(0, 500),
    meta: input.meta || {},
    createdAt: new Date().toISOString(),
  };
  const settings = await getStoreSettingsLocal();
  const tx = db.transaction(['aiEvents', 'notifications'], 'readwrite');
  tx.objectStore('aiEvents').put(entry);
  if (input.eventType === 'error' && input.errorMessage && settings.notifyAiErrors) {
    appendNotificationToStore(tx.objectStore('notifications'), {
      type: 'ai_error',
      title: `AI Error (${entry.agentKey})`,
      message: entry.errorMessage.slice(0, 180),
      linkSection: 'ai',
    });
  }
  await transactionDone(tx, 'Record AI event');
}

export async function getAIAnalyticsSummaryLocal(serverAiConfigured = true): Promise<AIAnalyticsSummary> {
  const [events, products] = await Promise.all([
    getAllFromStore<AIEventRecord>('aiEvents'),
    getAllFromStore<Product>('products'),
  ]);
  const prodNameBySlug = new Map(products.map((p) => [p.slug, p.name]));
  const countBy = (t: AIEventRecord['eventType']) => events.filter((e) => e.eventType === t).length;

  const qCounts = new Map<string, number>();
  const recCounts = new Map<string, number>();
  for (const e of events) {
    if (e.eventType === 'conversation' && e.queryText.trim()) {
      qCounts.set(e.queryText, (qCounts.get(e.queryText) || 0) + 1);
    }
    if (e.eventType === 'recommendation' && e.productSlug) {
      recCounts.set(e.productSlug, (recCounts.get(e.productSlug) || 0) + 1);
    }
  }

  return {
    serverAiConfigured,
    activeModel: 'gemini-4-hydrogen',
    totalConversations: countBy('conversation'),
    totalImageAnalyses: countBy('image_analysis'),
    totalRoutineBuilds: countBy('routine_build'),
    recommendationClicks: countBy('rec_click'),
    aiAssistedAddToCart: countBy('ai_add_to_cart'),
    aiAssistedOrders: countBy('ai_order'),
    failedResponses: countBy('error'),
    mostAskedQuestions: Array.from(qCounts.entries())
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    mostRecommendedProducts: Array.from(recCounts.entries())
      .map(([slug, count]) => ({ slug, name: prodNameBySlug.get(slug) || slug, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
    recentErrors: events
      .filter((e) => e.eventType === 'error')
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 12)
      .map((e) => ({ id: e.id, agentKey: e.agentKey, message: e.errorMessage, createdAt: e.createdAt })),
  };
}

// ---------------------------------------------------------------------------
// ADMIN USERS (LOCAL INDEXEDDB + WEB CRYPTO HASHING)
// ---------------------------------------------------------------------------

function sanitizeAdminUser(u: StoredAdminUserLocal): AdminUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt || undefined,
  };
}

export async function countAdminUsersLocal(): Promise<number> {
  const all = await getAllFromStore<StoredAdminUserLocal>('adminUsers');
  return all.length;
}

export async function listAdminUsersLocal(): Promise<AdminUser[]> {
  const all = await getAllFromStore<StoredAdminUserLocal>('adminUsers');
  return all.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)).map(sanitizeAdminUser);
}

export async function findAdminUserByIdLocal(id: string): Promise<StoredAdminUserLocal | null> {
  const found = await getOneFromStore<StoredAdminUserLocal>('adminUsers', id);
  return found || null;
}

export async function findAdminUserByEmailLocal(email: string): Promise<StoredAdminUserLocal | null> {
  const norm = email.trim().toLowerCase();
  const all = await getAllFromStore<StoredAdminUserLocal>('adminUsers');
  return all.find((u) => u.email.toLowerCase() === norm) || null;
}

export async function createAdminUserLocal(input: {
  name: string;
  email: string;
  role: AdminRole;
  password: string;
}): Promise<AdminUser> {
  const db = await getLocalDb();
  const email = input.email.trim().toLowerCase();
  if (!input.name.trim() || !email || !input.password || input.password.length < 8) {
    throw new LocalDatabaseError(
      'Name, valid email, and password (min 8 characters) are required.',
      400,
      'VALIDATION_ERROR',
    );
  }
  const existing = await findAdminUserByEmailLocal(email);
  if (existing) {
    throw new LocalDatabaseError('An admin user with this email already exists.', 409, 'DUPLICATE_ADMIN');
  }
  const { salt, hash } = await hashPasswordLocal(input.password);
  const nowIso = new Date().toISOString();
  const record: StoredAdminUserLocal = {
    id: generateShortId('adm'),
    name: input.name.trim(),
    email,
    role: input.role,
    passwordHash: hash,
    passwordSalt: salt,
    isActive: true,
    createdAt: nowIso,
    lastLoginAt: '',
  };
  const tx = db.transaction(['adminUsers'], 'readwrite');
  tx.objectStore('adminUsers').put(record);
  await transactionDone(tx, 'Create admin user');
  return sanitizeAdminUser(record);
}

export async function updateAdminUserLocal(
  id: string,
  patch: { name?: string; role?: AdminRole; isActive?: boolean; password?: string; lastLoginAt?: string },
): Promise<AdminUser | null> {
  const db = await getLocalDb();
  const existing = await findAdminUserByIdLocal(id);
  if (!existing) return null;

  let nextHash = existing.passwordHash;
  let nextSalt = existing.passwordSalt;
  if (patch.password && patch.password.length >= 8) {
    const hashed = await hashPasswordLocal(patch.password);
    nextHash = hashed.hash;
    nextSalt = hashed.salt;
  }

  const next: StoredAdminUserLocal = {
    ...existing,
    name: patch.name?.trim() || existing.name,
    role: patch.role || existing.role,
    isActive: typeof patch.isActive === 'boolean' ? patch.isActive : existing.isActive,
    passwordHash: nextHash,
    passwordSalt: nextSalt,
    lastLoginAt: patch.lastLoginAt !== undefined ? patch.lastLoginAt : existing.lastLoginAt,
  };
  const tx = db.transaction(['adminUsers'], 'readwrite');
  tx.objectStore('adminUsers').put(next);
  await transactionDone(tx, 'Update admin user');
  return sanitizeAdminUser(next);
}

export async function deleteAdminUserLocal(id: string): Promise<boolean> {
  const db = await getLocalDb();
  const existing = await findAdminUserByIdLocal(id);
  if (!existing) return false;
  const tx = db.transaction(['adminUsers'], 'readwrite');
  tx.objectStore('adminUsers').delete(id);
  await transactionDone(tx, 'Delete admin user');
  return true;
}

// ---------------------------------------------------------------------------
// ANALYTICS & OVERVIEW COMPUTATION
// ---------------------------------------------------------------------------

export async function buildAdminOverviewLocal(): Promise<AdminOverviewStats> {
  const [products, orders, customers, settings, notifications] = await Promise.all([
    listProductsLocal({ includeUnpublished: true }),
    listOrdersLocal(500),
    listCustomerSummariesLocal(),
    getStoreSettingsLocal(),
    listNotificationsLocal(10),
  ]);

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
      if (meta?.department === 'haircare') haircareRevenuePkr += lineRev;
      else skincareRevenuePkr += lineRev;

      const catName = meta?.category || 'General';
      const catEntry = categoryMap.get(catName) || { category: catName, revenuePkr: 0, units: 0 };
      catEntry.revenuePkr += lineRev;
      catEntry.units += item.quantity;
      categoryMap.set(catName, catEntry);
    }
  }

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

  const statusCounts = new Map<string, number>();
  for (const o of orders) {
    statusCounts.set(o.status, (statusCounts.get(o.status) || 0) + 1);
  }

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

export async function buildAnalyticsReportLocal(params: {
  range?: AnalyticsReportData['range'];
  department?: string;
  category?: string;
}): Promise<AnalyticsReportData> {
  const range = params.range || '30d';
  const [products, settings, allOrders, aiSummary] = await Promise.all([
    listProductsLocal({ includeUnpublished: true }),
    getStoreSettingsLocal(),
    listOrdersLocal(500),
    getAIAnalyticsSummaryLocal(),
  ]);
  const productMeta = new Map(products.map((p) => [p.slug, p]));
  const threshold = settings.lowStockThreshold ?? 10;

  const now = Date.now();
  const daysLimit =
    range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : range === '365d' ? 365 : 99999;

  const ordersInWindow = allOrders.filter((o) => (now - Date.parse(o.createdAt)) / 86_400_000 <= daysLimit);
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
        (sum, p) =>
          sum + p.stock * (p.discountPricePkr && p.discountPricePkr < p.pricePkr ? p.discountPricePkr : p.pricePkr),
        0,
      ),
    },
  };
}

export async function generateCsvReportLocal(kind: 'orders' | 'inventory'): Promise<string> {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  if (kind === 'inventory') {
    const rows = await listProductsLocal({ includeUnpublished: true });
    const header = ['SKU', 'Name', 'Department', 'Category', 'Status', 'Price_PKR', 'Discount_PKR', 'Stock', 'Rating'];
    return [
      header.join(','),
      ...rows.map((p) =>
        [
          p.sku || '',
          p.name,
          p.department,
          p.category,
          p.status || 'published',
          p.pricePkr,
          p.discountPricePkr || '',
          p.stock,
          p.rating,
        ]
          .map(esc)
          .join(','),
      ),
    ].join('\n');
  }

  const orders = await listOrdersLocal(1000);
  const header = [
    'OrderNumber',
    'Date',
    'Customer',
    'Phone',
    'City',
    'PaymentMethod',
    'Status',
    'Coupon',
    'Discount_PKR',
    'Shipping_PKR',
    'Total_PKR',
  ];
  return [
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
}

// ---------------------------------------------------------------------------
// JSON BACKUP EXPORT, VALIDATION, RESTORE (MERGE / REPLACE) & RESET
// ---------------------------------------------------------------------------

export async function getDatabaseDashboardMetrics(): Promise<DatabaseDashboardMetrics> {
  const backupMeta = getBackupMetaPrefs();
  let estimatedUsageBytes: number | null = null;
  let estimatedQuotaBytes: number | null = null;

  if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.estimate === 'function') {
    try {
      const est = await navigator.storage.estimate();
      estimatedUsageBytes = typeof est.usage === 'number' ? est.usage : null;
      estimatedQuotaBytes = typeof est.quota === 'number' ? est.quota : null;
    } catch {
      // Ignore storage estimate failure
    }
  }

  try {
    const db = await getLocalDb();
    const tx = db.transaction(
      ['products', 'categories', 'orders', 'customers', 'coupons', 'reviews', 'mediaBlobs'],
      'readonly',
    );
    const [
      totalProducts,
      totalCategories,
      totalOrders,
      totalCustomers,
      totalCoupons,
      totalReviews,
      totalMediaBlobs,
    ] = await Promise.all([
      requestToPromise<number>(tx.objectStore('products').count()),
      requestToPromise<number>(tx.objectStore('categories').count()),
      requestToPromise<number>(tx.objectStore('orders').count()),
      requestToPromise<number>(tx.objectStore('customers').count()),
      requestToPromise<number>(tx.objectStore('coupons').count()),
      requestToPromise<number>(tx.objectStore('reviews').count()),
      requestToPromise<number>(tx.objectStore('mediaBlobs').count()),
    ]);

    return {
      dbStatus: currentDbStatus,
      dbError: currentDbError,
      dbName: LOCAL_DB_NAME,
      dbVersion: LOCAL_DB_VERSION,
      totalProducts,
      totalCategories,
      totalOrders,
      totalCustomers,
      totalCoupons,
      totalReviews,
      totalMediaBlobs,
      estimatedUsageBytes,
      estimatedQuotaBytes,
      lastBackupAt: backupMeta.lastBackupAt,
      lastBackupFileName: backupMeta.lastBackupFileName,
      lastRestoreAt: backupMeta.lastRestoreAt,
      lastResetAt: backupMeta.lastResetAt,
    };
  } catch (err) {
    const mapped = mapDomError(err, 'Could not inspect IndexedDB metrics.');
    return {
      dbStatus: 'error',
      dbError: mapped.message,
      dbName: LOCAL_DB_NAME,
      dbVersion: LOCAL_DB_VERSION,
      totalProducts: 0,
      totalCategories: 0,
      totalOrders: 0,
      totalCustomers: 0,
      totalCoupons: 0,
      totalReviews: 0,
      totalMediaBlobs: 0,
      estimatedUsageBytes,
      estimatedQuotaBytes,
      lastBackupAt: backupMeta.lastBackupAt,
      lastBackupFileName: backupMeta.lastBackupFileName,
      lastRestoreAt: backupMeta.lastRestoreAt,
      lastResetAt: backupMeta.lastResetAt,
    };
  }
}

export async function exportDatabaseBackupJson(options?: {
  recordBackupTimestamp?: boolean;
  fileName?: string;
}): Promise<{ backup: AureliaBackupV1; json: string; fileName: string }> {
  const [
    products,
    categories,
    reviews,
    customers,
    orders,
    stockHistory,
    coupons,
    supportTickets,
    whatsappReferrals,
    aiAgents,
    aiEvents,
    cmsContent,
    storeSettings,
    notifications,
    adminUsers,
    auditLogs,
    metaEntries,
    mediaBlobRows,
  ] = await Promise.all([
    getAllFromStore<Product>('products'),
    getAllFromStore<CategoryRecord>('categories'),
    getAllFromStore<StoredReviewRecord>('reviews'),
    getAllFromStore<StoredCustomerLocal>('customers'),
    getAllFromStore<OrderRecord>('orders'),
    getAllFromStore<StockHistoryEntry>('stockHistory'),
    getAllFromStore<CouponRecord>('coupons'),
    getAllFromStore<SupportTicket>('supportTickets'),
    getAllFromStore<WhatsAppReferralRecord>('whatsappReferrals'),
    getAllFromStore<AIAgentConfig>('aiAgents'),
    getAllFromStore<AIEventRecord>('aiEvents'),
    getCmsContentLocal(),
    getStoreSettingsLocal(),
    getAllFromStore<AdminNotification>('notifications'),
    getAllFromStore<StoredAdminUserLocal>('adminUsers'),
    getAllFromStore<AuditLogEntry>('auditLogs'),
    getAllFromStore<MetaEntry>('meta'),
    getAllFromStore<MediaBlobRecord>('mediaBlobs'),
  ]);

  const meta: Record<string, string> = {};
  for (const m of metaEntries) {
    meta[m.key] = m.value;
  }

  const mediaAssets: MediaAssetBackupEntry[] = [];
  for (const rec of mediaBlobRows) {
    const dataUrl = await blobToDataUrl(rec.blob);
    mediaAssets.push({
      id: rec.id,
      fileName: rec.fileName,
      mimeType: rec.mimeType,
      sizeBytes: rec.sizeBytes,
      dataUrl,
      createdAt: rec.createdAt,
    });
  }

  const exportedAt = new Date().toISOString();
  const fileName =
    options?.fileName || `aurelia-botanica-backup-${exportedAt.slice(0, 10)}.json`;

  const backup: AureliaBackupV1 = {
    app: 'Aurelia Botanica',
    schemaVersion: 1,
    exportedAt,
    localPrefs: {
      lastBackupAt: exportedAt,
    },
    data: {
      products,
      categories,
      reviews,
      customers,
      orders,
      stockHistory,
      coupons,
      supportTickets,
      whatsappReferrals,
      aiAgents,
      aiEvents,
      cmsContent,
      storeSettings,
      notifications,
      adminUsers,
      auditLogs,
      meta,
    },
    mediaAssets,
  };

  const json = JSON.stringify(backup, null, 2);
  if (options?.recordBackupTimestamp !== false) {
    saveBackupMetaPrefs({ lastBackupAt: exportedAt, lastBackupFileName: fileName });
  }
  return { backup, json, fileName };
}

export async function validateAndPreviewBackupJson(rawText: string): Promise<BackupValidationPreview> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    return { valid: false, errors: ['Backup file is empty.'], warnings: [] };
  }

  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(rawText);
  } catch (err) {
    return {
      valid: false,
      errors: [`Invalid JSON syntax: ${err instanceof Error ? err.message : 'Unable to parse file'}.`],
      warnings: [],
    };
  }

  if (!parsedRaw || typeof parsedRaw !== 'object' || Array.isArray(parsedRaw)) {
    return { valid: false, errors: ['Backup root must be a JSON object.'], warnings: [] };
  }

  const obj = parsedRaw as Record<string, unknown>;
  if (obj.app !== 'Aurelia Botanica') {
    errors.push('Invalid backup source: missing or mismatched "app": "Aurelia Botanica" signature.');
  }
  if (obj.schemaVersion !== 1) {
    errors.push(`Unsupported or missing schemaVersion (${String(obj.schemaVersion)}). Expected schemaVersion: 1.`);
  }
  if (!obj.data || typeof obj.data !== 'object' || Array.isArray(obj.data)) {
    errors.push('Backup is missing a valid "data" payload object.');
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  const data = obj.data as Record<string, unknown>;
  const requiredArrayKeys = [
    'products',
    'categories',
    'reviews',
    'customers',
    'orders',
    'coupons',
  ] as const;

  for (const key of requiredArrayKeys) {
    if (!Array.isArray(data[key])) {
      errors.push(`Backup "data.${key}" must be an array.`);
    }
  }
  if (!data.storeSettings || typeof data.storeSettings !== 'object') {
    errors.push('Backup "data.storeSettings" must be an object.');
  }
  if (!data.cmsContent || typeof data.cmsContent !== 'object') {
    errors.push('Backup "data.cmsContent" must be an object.');
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  const products = data.products as Product[];
  const categories = data.categories as CategoryRecord[];
  const coupons = data.coupons as CouponRecord[];
  const orders = data.orders as OrderRecord[];
  const customers = data.customers as StoredCustomerLocal[];
  const reviews = data.reviews as StoredReviewRecord[];
  const adminUsers = Array.isArray(data.adminUsers) ? (data.adminUsers as StoredAdminUserLocal[]) : [];
  const mediaAssets = Array.isArray(obj.mediaAssets) ? (obj.mediaAssets as MediaAssetBackupEntry[]) : [];

  const seenProdIds = new Set<string>();
  const seenProdSlugs = new Set<string>();
  for (let i = 0; i < products.length; i += 1) {
    const p = products[i];
    if (!p || typeof p.id !== 'string' || !p.id.trim() || typeof p.slug !== 'string' || !p.slug.trim() || typeof p.name !== 'string' || !p.name.trim()) {
      errors.push(`Product at index ${i} is missing required fields (id, slug, name).`);
      continue;
    }
    if (typeof p.pricePkr !== 'number' || Number.isNaN(p.pricePkr) || p.pricePkr < 0) {
      errors.push(`Product "${p.name}" has an invalid pricePkr.`);
    }
    if (typeof p.stock !== 'number' || Number.isNaN(p.stock) || p.stock < 0) {
      errors.push(`Product "${p.name}" has an invalid stock count.`);
    }
    if (seenProdIds.has(p.id)) errors.push(`Duplicate product id "${p.id}" inside backup.`);
    if (seenProdSlugs.has(p.slug.toLowerCase())) errors.push(`Duplicate product slug "${p.slug}" inside backup.`);
    seenProdIds.add(p.id);
    seenProdSlugs.add(p.slug.toLowerCase());
  }

  const seenCatIds = new Set<string>();
  for (let i = 0; i < categories.length; i += 1) {
    const c = categories[i];
    if (!c || typeof c.id !== 'string' || typeof c.slug !== 'string' || typeof c.name !== 'string' || (c.department !== 'skincare' && c.department !== 'haircare')) {
      errors.push(`Category at index ${i} is invalid.`);
      continue;
    }
    if (seenCatIds.has(c.id)) errors.push(`Duplicate category id "${c.id}" inside backup.`);
    seenCatIds.add(c.id);
  }

  for (let i = 0; i < coupons.length; i += 1) {
    const cpn = coupons[i];
    if (!cpn || typeof cpn.id !== 'string' || typeof cpn.code !== 'string') {
      errors.push(`Coupon at index ${i} is missing id or code.`);
    }
  }

  for (let i = 0; i < mediaAssets.length; i += 1) {
    const m = mediaAssets[i];
    if (!m || typeof m.id !== 'string' || typeof m.dataUrl !== 'string' || !m.dataUrl.startsWith('data:')) {
      errors.push(`Media asset at index ${i} is corrupted or missing a valid base64 dataUrl.`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  const [existingProds, existingCoupons] = await Promise.all([
    getAllFromStore<Product>('products'),
    getAllFromStore<CouponRecord>('coupons'),
  ]);
  const existingSlugSet = new Set(existingProds.map((p) => p.slug.toLowerCase()));
  const existingCouponSet = new Set(existingCoupons.map((c) => c.code.toUpperCase()));

  const conflictingProductSlugs = products
    .filter((p) => existingSlugSet.has(p.slug.toLowerCase()))
    .map((p) => p.slug);
  const conflictingCouponCodes = coupons
    .filter((c) => existingCouponSet.has(c.code.toUpperCase()))
    .map((c) => c.code);

  if (conflictingProductSlugs.length > 0) {
    warnings.push(
      `${conflictingProductSlugs.length} product slug(s) already exist locally. Merge mode updates matching items cleanly; Replace mode replaces all local data.`,
    );
  }

  const normalizedBackup: AureliaBackupV1 = {
    app: 'Aurelia Botanica',
    schemaVersion: 1,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
    localPrefs: (obj.localPrefs as AureliaBackupV1['localPrefs']) || undefined,
    data: {
      products,
      categories,
      reviews,
      customers,
      orders,
      stockHistory: Array.isArray(data.stockHistory) ? (data.stockHistory as StockHistoryEntry[]) : [],
      coupons,
      supportTickets: Array.isArray(data.supportTickets) ? (data.supportTickets as SupportTicket[]) : [],
      whatsappReferrals: Array.isArray(data.whatsappReferrals)
        ? (data.whatsappReferrals as WhatsAppReferralRecord[])
        : [],
      aiAgents: Array.isArray(data.aiAgents) && data.aiAgents.length > 0 ? (data.aiAgents as AIAgentConfig[]) : getDefaultAIAgents(),
      aiEvents: Array.isArray(data.aiEvents) ? (data.aiEvents as AIEventRecord[]) : [],
      cmsContent: { ...getDefaultCmsContent(), ...(data.cmsContent as WebsiteContentCMS) },
      storeSettings: { ...getDefaultSettings(), ...(data.storeSettings as StoreSettingsFull) },
      notifications: Array.isArray(data.notifications) ? (data.notifications as AdminNotification[]) : [],
      adminUsers,
      auditLogs: Array.isArray(data.auditLogs) ? (data.auditLogs as AuditLogEntry[]) : [],
      meta: data.meta && typeof data.meta === 'object' ? (data.meta as Record<string, string>) : { initialized: 'true' },
    },
    mediaAssets,
  };

  return {
    valid: true,
    errors: [],
    warnings,
    preview: {
      app: normalizedBackup.app,
      schemaVersion: normalizedBackup.schemaVersion,
      exportedAt: normalizedBackup.exportedAt,
      counts: {
        products: products.length,
        categories: categories.length,
        reviews: reviews.length,
        customers: customers.length,
        orders: orders.length,
        coupons: coupons.length,
        supportTickets: normalizedBackup.data.supportTickets.length,
        mediaAssets: mediaAssets.length,
        adminUsers: adminUsers.length,
      },
      conflictingProductSlugs,
      conflictingCouponCodes,
      parsed: normalizedBackup,
    },
  };
}

export async function importDatabaseBackup(
  backup: AureliaBackupV1,
  mode: 'merge' | 'replace',
): Promise<{ mode: 'merge' | 'replace'; restoredProducts: number; restoredMedia: number }> {
  const db = await getLocalDb();
  const preparedMedia: MediaBlobRecord[] = [];
  for (const m of backup.mediaAssets || []) {
    preparedMedia.push({
      id: m.id,
      fileName: m.fileName || 'restored-asset',
      mimeType: m.mimeType || 'application/octet-stream',
      sizeBytes: m.sizeBytes || 0,
      blob: dataUrlToBlob(m.dataUrl, m.mimeType),
      createdAt: m.createdAt || new Date().toISOString(),
    });
  }

  if (mode === 'replace') {
    const tx = db.transaction([...ALL_STORES], 'readwrite');
    try {
      for (const storeName of ALL_STORES) {
        tx.objectStore(storeName).clear();
      }
      const d = backup.data;
      for (const p of d.products) {
        const clean = { ...p };
        delete clean.reviews;
        tx.objectStore('products').put(clean);
      }
      for (const c of d.categories) tx.objectStore('categories').put(c);
      for (const r of d.reviews) tx.objectStore('reviews').put(r);
      for (const u of d.customers) tx.objectStore('customers').put(u);
      for (const o of d.orders) tx.objectStore('orders').put(o);
      for (const s of d.stockHistory) tx.objectStore('stockHistory').put(s);
      for (const cpn of d.coupons) tx.objectStore('coupons').put(cpn);
      for (const t of d.supportTickets) tx.objectStore('supportTickets').put(t);
      for (const w of d.whatsappReferrals) tx.objectStore('whatsappReferrals').put(w);
      for (const a of d.aiAgents) tx.objectStore('aiAgents').put(a);
      for (const ev of d.aiEvents) tx.objectStore('aiEvents').put(ev);
      for (const n of d.notifications) tx.objectStore('notifications').put(n);
      for (const adm of d.adminUsers) tx.objectStore('adminUsers').put(adm);
      for (const aud of d.auditLogs) tx.objectStore('auditLogs').put(aud);
      for (const med of preparedMedia) tx.objectStore('mediaBlobs').put(med);

      const nowIso = new Date().toISOString();
      tx.objectStore('storeSettings').put({ key: 'main', value: d.storeSettings, updatedAt: nowIso });
      tx.objectStore('cmsContent').put({ key: 'main', value: d.cmsContent, updatedAt: nowIso });

      const metaObj: Record<string, string> = { ...(d.meta || {}), initialized: 'true' };
      for (const [k, v] of Object.entries(metaObj)) {
        tx.objectStore('meta').put({ key: k, value: String(v) });
      }

      await transactionDone(tx, 'Replace database from JSON backup');
      clearMediaObjectUrlCache();
      syncLightweightStorePrefs(d.storeSettings);
      saveBackupMetaPrefs({ lastRestoreAt: nowIso });
      return {
        mode,
        restoredProducts: d.products.length,
        restoredMedia: preparedMedia.length,
      };
    } catch (err) {
      try {
        tx.abort();
      } catch {
        // Already aborted
      }
      throw mapDomError(err, 'Failed to restore JSON backup.');
    }
  }

  // MERGE MODE: read current stores first, resolve unique indexes deterministically, then apply atomically
  const [
    exProducts,
    exCategories,
    exCustomers,
    exOrders,
    exCoupons,
    exTickets,
    exAdminUsers,
    exSettings,
    exCms,
  ] = await Promise.all([
    getAllFromStore<Product>('products'),
    getAllFromStore<CategoryRecord>('categories'),
    getAllFromStore<StoredCustomerLocal>('customers'),
    getAllFromStore<OrderRecord>('orders'),
    getAllFromStore<CouponRecord>('coupons'),
    getAllFromStore<SupportTicket>('supportTickets'),
    getAllFromStore<StoredAdminUserLocal>('adminUsers'),
    getStoreSettingsLocal(),
    getCmsContentLocal(),
  ]);

  const tx = db.transaction([...ALL_STORES], 'readwrite');
  try {
    const d = backup.data;

    // Resolve unique keys (id vs unique index) cleanly before put()
    const exProdBySlug = new Map(exProducts.map((p) => [p.slug.toLowerCase(), p]));
    for (const p of d.products) {
      const clean = { ...p };
      delete clean.reviews;
      const slugMatch = exProdBySlug.get(clean.slug.toLowerCase());
      if (slugMatch && slugMatch.id !== clean.id) {
        // Merge onto the existing local product ID to avoid ConstraintError on unique slug index
        clean.id = slugMatch.id;
      }
      tx.objectStore('products').put(clean);
    }

    const exCatBySlug = new Map(exCategories.map((c) => [c.slug.toLowerCase(), c]));
    for (const c of d.categories) {
      const slugMatch = exCatBySlug.get(c.slug.toLowerCase());
      const mergedCat = slugMatch && slugMatch.id !== c.id ? { ...c, id: slugMatch.id } : c;
      tx.objectStore('categories').put(mergedCat);
    }

    const exCustByEmail = new Map(exCustomers.map((u) => [u.email.toLowerCase(), u]));
    for (const u of d.customers) {
      const match = exCustByEmail.get(u.email.toLowerCase());
      const merged = match && match.id !== u.id ? { ...u, id: match.id } : u;
      tx.objectStore('customers').put(merged);
    }

    const exOrdByNum = new Map(exOrders.map((o) => [o.orderNumber, o]));
    for (const o of d.orders) {
      const match = exOrdByNum.get(o.orderNumber);
      const merged = match && match.id !== o.id ? { ...o, id: match.id } : o;
      tx.objectStore('orders').put(merged);
    }

    const exCpnByCode = new Map(exCoupons.map((c) => [c.code.toUpperCase(), c]));
    for (const cpn of d.coupons) {
      const match = exCpnByCode.get(cpn.code.toUpperCase());
      const merged = match && match.id !== cpn.id ? { ...cpn, id: match.id } : cpn;
      tx.objectStore('coupons').put(merged);
    }

    const exTktByNum = new Map(exTickets.map((t) => [t.ticketNumber, t]));
    for (const t of d.supportTickets) {
      const match = exTktByNum.get(t.ticketNumber);
      const merged = match && match.id !== t.id ? { ...t, id: match.id } : t;
      tx.objectStore('supportTickets').put(merged);
    }

    const exAdmByEmail = new Map(exAdminUsers.map((a) => [a.email.toLowerCase(), a]));
    for (const adm of d.adminUsers) {
      const match = exAdmByEmail.get(adm.email.toLowerCase());
      const merged = match && match.id !== adm.id ? { ...adm, id: match.id } : adm;
      tx.objectStore('adminUsers').put(merged);
    }

    for (const r of d.reviews) tx.objectStore('reviews').put(r);
    for (const s of d.stockHistory) tx.objectStore('stockHistory').put(s);
    for (const w of d.whatsappReferrals) tx.objectStore('whatsappReferrals').put(w);
    for (const a of d.aiAgents) tx.objectStore('aiAgents').put(a);
    for (const ev of d.aiEvents) tx.objectStore('aiEvents').put(ev);
    for (const n of d.notifications) tx.objectStore('notifications').put(n);
    for (const aud of d.auditLogs) tx.objectStore('auditLogs').put(aud);
    for (const med of preparedMedia) tx.objectStore('mediaBlobs').put(med);

    const nowIso = new Date().toISOString();
    const mergedSettings: StoreSettingsFull = { ...exSettings, ...d.storeSettings };
    const mergedCms: WebsiteContentCMS = { ...exCms, ...d.cmsContent, updatedAt: nowIso };
    tx.objectStore('storeSettings').put({ key: 'main', value: mergedSettings, updatedAt: nowIso });
    tx.objectStore('cmsContent').put({ key: 'main', value: mergedCms, updatedAt: nowIso });
    tx.objectStore('meta').put({ key: 'initialized', value: 'true' });

    await transactionDone(tx, 'Merge JSON backup');
    clearMediaObjectUrlCache();
    syncLightweightStorePrefs(mergedSettings);
    saveBackupMetaPrefs({ lastRestoreAt: nowIso });
    return {
      mode,
      restoredProducts: d.products.length,
      restoredMedia: preparedMedia.length,
    };
  } catch (err) {
    try {
      tx.abort();
    } catch {
      // Already aborted
    }
    throw mapDomError(err, 'Failed to merge JSON backup.');
  }
}

export async function resetLocalDatabase(options?: { preserveAdminUsers?: boolean }): Promise<void> {
  const db = await getLocalDb();
  const existingAdmins = options?.preserveAdminUsers !== false
    ? await getAllFromStore<StoredAdminUserLocal>('adminUsers')
    : [];

  const nowIso = new Date().toISOString();
  const seeds = buildDefaultSeedData(nowIso);

  const tx = db.transaction([...ALL_STORES], 'readwrite');
  try {
    for (const storeName of ALL_STORES) {
      tx.objectStore(storeName).clear();
    }
    for (const cat of seeds.categories) tx.objectStore('categories').put(cat);
    for (const prod of seeds.products) tx.objectStore('products').put(prod);
    for (const rev of seeds.reviews) tx.objectStore('reviews').put(rev);
    for (const cpn of seeds.coupons) tx.objectStore('coupons').put(cpn);
    tx.objectStore('storeSettings').put({ key: 'main', value: seeds.storeSettings, updatedAt: nowIso });
    tx.objectStore('cmsContent').put({ key: 'main', value: seeds.cmsContent, updatedAt: nowIso });
    for (const agent of seeds.aiAgents) tx.objectStore('aiAgents').put(agent);
    for (const adm of existingAdmins) tx.objectStore('adminUsers').put(adm);

    tx.objectStore('meta').put({ key: 'orderSequence', value: '1041' });
    tx.objectStore('meta').put({ key: 'ticketSequence', value: '500' });
    tx.objectStore('meta').put({ key: 'initialized', value: 'true' });

    await transactionDone(tx, 'Reset local database');
    clearMediaObjectUrlCache();
    syncLightweightStorePrefs(seeds.storeSettings);
    saveBackupMetaPrefs({ lastResetAt: nowIso });
  } catch (err) {
    try {
      tx.abort();
    } catch {
      // Already aborted
    }
    throw mapDomError(err, 'Failed to reset local database.');
  }
}
