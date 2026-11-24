export type Department = 'skincare' | 'haircare';

export type SkinType =
  | 'Oily Skin'
  | 'Dry Skin'
  | 'Combination Skin'
  | 'Normal Skin'
  | 'Sensitive Skin'
  | 'Acne-Prone Skin';

export type HairType =
  | 'Dry Hair'
  | 'Oily Hair'
  | 'Normal Hair'
  | 'Curly Hair'
  | 'Straight Hair'
  | 'Wavy Hair'
  | 'Frizzy Hair'
  | 'Damaged Hair';

export type HairConcern =
  | 'Hair Fall'
  | 'Dandruff'
  | 'Dry Scalp'
  | 'Frizz'
  | 'Split Ends'
  | 'Hair Damage';

export type SkincareCategory =
  | 'Face Wash & Cleansers'
  | 'Moisturizers'
  | 'Serums'
  | 'Sunscreens'
  | 'Toners'
  | 'Face Masks'
  | 'Exfoliators'
  | 'Acne Care'
  | 'Pigmentation Care'
  | 'Eye Care';

export type HaircareCategory =
  | 'Shampoos'
  | 'Conditioners'
  | 'Hair Oils'
  | 'Hair Serums'
  | 'Hair Masks'
  | 'Hair Growth Care'
  | 'Anti-Dandruff Products'
  | 'Hair Styling Products'
  | 'Scalp Treatments'
  | 'Hair Repair Products';

export type ModelSilhouette = 'dropper' | 'jar' | 'pump';
export type ModelFinish = 'emerald' | 'ivory' | 'aqua' | 'amber' | 'olive' | 'champagne';
export type StudioBackdrop = 'sage' | 'blush' | 'linen' | 'obsidian';

export interface Product3DConfig {
  mode: 'procedural' | 'glb';
  glbUrl?: string;
  silhouette?: ModelSilhouette;
  finish?: ModelFinish;
  bottleColor?: string;
  liquidColor?: string;
  capColor?: string;
  capMetalness?: number;
  capRoughness?: number;
  glassTransmission?: number;
  glassRoughness?: number;
  labelBgColor?: string;
  labelTextColor?: string;
  labelTitleOverride?: string;
  lightIntensity?: number;
  lightWarmth?: number;
  backdrop?: StudioBackdrop;
}

export interface ProductVariant {
  id: string;
  label: string;
  sku?: string;
  pricePkr: number;
  stock: number;
}

export interface ProductReview {
  id: string;
  authorName: string;
  city: string;
  rating: number;
  title: string;
  comment: string;
  skinOrHairProfile: string;
  verifiedPurchase: boolean;
  status?: 'approved' | 'pending' | 'hidden';
  adminReply?: string;
  adminRepliedAt?: string;
  createdAt: string;
}

export interface Product {
  id: string;
  slug: string;
  sku?: string;
  name: string;
  subtitle: string;
  brandLine: string;
  department: Department;
  category: SkincareCategory | HaircareCategory | string;
  pricePkr: number;
  discountPricePkr?: number;
  volume: string;
  rating: number;
  reviewCount: number;
  stock: number;
  status?: 'published' | 'draft' | 'archived';
  isBestSeller?: boolean;
  isNewArrival?: boolean;
  isTrending?: boolean;
  isFeaturedHome?: boolean;
  suitableTypes: (SkinType | HairType | string)[];
  concerns: string[];
  keyIngredients: string[];
  fullIngredientList: string;
  ingredientNotes: { name: string; role: string }[];
  description: string;
  benefits: string[];
  howToUse: string;
  routineTime: 'Morning' | 'Night' | 'Morning & Night' | 'Weekly Ritual';
  precautions: string;
  images: string[];
  videoUrl?: string;
  variants?: ProductVariant[];
  modelSilhouette: ModelSilhouette;
  defaultFinish: ModelFinish;
  modelConfig?: Product3DConfig;
  createdAt?: string;
  updatedAt?: string;
  reviews?: ProductReview[];
}

export interface IngredientEntry {
  id: string;
  name: string;
  categoryLabel: string;
  origin: string;
  department: 'Skincare' | 'Haircare' | 'Skincare & Haircare';
  summary: string;
  cosmeticPurpose: string;
  suitableFor: string[];
  precautions: string;
  featuredProductSlugs: string[];
}

export interface CartItem {
  productId: string;
  slug: string;
  name: string;
  volume: string;
  pricePkr: number;
  image: string;
  quantity: number;
}

export interface SavedAddress {
  id: string;
  label: string;
  fullName: string;
  phone: string;
  street: string;
  area: string;
  city: string;
  postalCode: string;
}

export interface QuizAnswers {
  skinFeel: SkinType;
  hydrationLevel: string;
  acneFrequency: string;
  sensitivity: string;
  primaryConcern: string;
  currentRoutine: string;
}

export interface SavedRoutine {
  id: string;
  title: string;
  skinType: SkinType | string;
  concerns: string[];
  morningSlugs: string[];
  nightSlugs: string[];
  haircareSlugs?: string[];
  createdAt: string;
}

export interface CustomerProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  isActive?: boolean;
  createdAt?: string;
  savedAddresses: SavedAddress[];
  savedRoutines: SavedRoutine[];
  wishlistIds: string[];
}

export interface OrderItem {
  productId: string;
  slug: string;
  name: string;
  volume: string;
  unitPricePkr: number;
  quantity: number;
  image: string;
}

export type OrderStatus =
  | 'Pending'
  | 'Confirmed'
  | 'Processing'
  | 'Shipped'
  | 'Out for Delivery'
  | 'Delivered'
  | 'Cancelled'
  | 'Returned';

export interface OrderStatusHistoryEntry {
  status: OrderStatus;
  note?: string;
  changedBy?: string;
  changedAt: string;
}

export interface OrderRecord {
  id: string;
  orderNumber: string;
  userId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  shippingAddress: {
    street: string;
    area: string;
    city: string;
    postalCode: string;
    notes?: string;
  };
  paymentMethod: 'cod' | 'whatsapp';
  items: OrderItem[];
  subtotalPkr: number;
  shippingPkr: number;
  discountPkr: number;
  taxPkr?: number;
  couponCode?: string;
  totalPkr: number;
  status: OrderStatus;
  internalNotes?: string;
  statusHistory?: OrderStatusHistoryEntry[];
  createdAt: string;
  updatedAt?: string;
}

export interface StoreConfig {
  brandName: string;
  logoUrl?: string;
  whatsappNumber: string;
  whatsappEnabled?: boolean;
  whatsappWelcomeMessage?: string;
  whatsappOrderTemplate?: string;
  whatsappSupportMessage?: string;
  shippingFeePkr: number;
  freeShippingThresholdPkr: number;
  taxPercent?: number;
  codEnabled?: boolean;
  returnPolicyDays?: number;
  contactEmail?: string;
  promoBannerText?: string;
  promoBannerActive?: boolean;
  brandColors?: {
    primary: string;
    secondary: string;
    accent: string;
  };
  socialLinks?: {
    instagram?: string;
    facebook?: string;
    tiktok?: string;
  };
  availableCoupons: { code: string; description: string }[];
}

export type AIAvatarState = 'idle' | 'listening' | 'thinking' | 'speaking';
export type AILanguagePref = 'auto' | 'english' | 'urdu' | 'roman_urdu';

export interface AIMemoryPreferences {
  consentGiven: boolean;
  skinType?: string;
  hairType?: string;
  concerns: string[];
  budgetMaxPkr?: number;
  preferredCategories: string[];
  lastRecommendedSlugs: string[];
}

export interface AIRoutineStep {
  stepNumber: number;
  stepRole: string;
  productSlug: string;
  usageInstruction: string;
  frequency: string;
}

export interface AIRoutinePlan {
  title: string;
  summary: string;
  safetyNote: string;
  morningSkincare: AIRoutineStep[];
  nightSkincare: AIRoutineStep[];
  weeklyHaircare: AIRoutineStep[];
  totalEstimatedPkr: number;
}

export interface AIImageAnalysisResult {
  mode: 'skin' | 'hair';
  visibleObservations: string[];
  identifiedConcerns: string[];
  suggestedIngredients: string[];
  recommendedProductSlugs: string[];
  routineGuidance: string[];
  cautionNotice: string;
}

export interface AIWhatsAppDraft {
  summaryText: string;
  whatsappUrl: string;
  totalPkr: number;
  requiresConfirmation: boolean;
}

export interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  imagePreviewUrl?: string;
  recommendedSlugs?: string[];
  routinePlan?: AIRoutinePlan;
  whatsappDraft?: AIWhatsAppDraft;
  analysisResult?: AIImageAnalysisResult;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// ADMIN DASHBOARD, RBAC, CMS, INVENTORY, COUPONS, SUPPORT & ANALYTICS TYPES
// ---------------------------------------------------------------------------

export type AdminRole = 'super_admin' | 'store_manager' | 'inventory_manager' | 'support_agent';

export type AdminSectionId =
  | 'dashboard'
  | 'products'
  | 'categories'
  | 'orders'
  | 'customers'
  | 'inventory'
  | 'coupons'
  | 'reviews'
  | 'ai'
  | 'studio3d'
  | 'content'
  | 'analytics'
  | 'support'
  | 'settings';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorEmail: string;
  actorRole: AdminRole;
  action: string;
  targetType: string;
  targetId?: string;
  details?: string;
  createdAt: string;
}

export interface CategoryRecord {
  id: string;
  slug: string;
  name: string;
  department: Department;
  description: string;
  imageUrl?: string;
  displayOrder: number;
  isActive: boolean;
  productCount?: number;
}

export interface StockHistoryEntry {
  id: string;
  productId: string;
  productName: string;
  sku?: string;
  delta: number;
  previousStock: number;
  newStock: number;
  reason: string;
  actorEmail: string;
  createdAt: string;
}

export type CouponType = 'percentage' | 'fixed' | 'free_shipping';
export type CouponScope = 'all' | 'category' | 'selected_products' | 'first_order' | 'seasonal';

export interface CouponRecord {
  id: string;
  code: string;
  description: string;
  discountType: CouponType;
  discountValue: number;
  minOrderAmountPkr: number;
  maxDiscountPkr?: number;
  scope: CouponScope;
  targetCategories: string[];
  targetProductIds: string[];
  startDate?: string;
  expiryDate?: string;
  usageLimit?: number;
  usedCount: number;
  isActive: boolean;
  showBanner: boolean;
  createdAt: string;
}

export interface ReviewModerationRecord extends ProductReview {
  productId: string;
  productSlug: string;
  productName: string;
  status: 'approved' | 'pending' | 'hidden';
}

export interface CustomerSummaryRecord extends CustomerProfile {
  orderCount: number;
  totalSpentPkr: number;
  lastOrderAt?: string;
  orders?: OrderRecord[];
}

export interface AIAgentConfig {
  agentKey: string;
  name: string;
  description: string;
  enabled: boolean;
  personalityTone: 'luxury_consultant' | 'clinical_educator' | 'warm_concierge' | 'concise_direct';
  customInstructions: string;
  supportedLanguages: ('english' | 'urdu' | 'roman_urdu')[];
  faqKnowledge: { id: string; question: string; answer: string }[];
  updatedAt: string;
}

export interface AIAnalyticsSummary {
  serverAiConfigured: boolean;
  activeModel: string;
  totalConversations: number;
  totalImageAnalyses: number;
  totalRoutineBuilds: number;
  recommendationClicks: number;
  aiAssistedAddToCart: number;
  aiAssistedOrders: number;
  failedResponses: number;
  mostAskedQuestions: { query: string; count: number }[];
  mostRecommendedProducts: { slug: string; name: string; count: number }[];
  recentErrors: { id: string; agentKey: string; message: string; createdAt: string }[];
}

export interface SupportMessage {
  id: string;
  senderRole: 'customer' | 'ai' | 'admin';
  senderName: string;
  text: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  subject: string;
  source: 'support_form' | 'ai_escalation' | 'whatsapp';
  status: 'open' | 'escalated' | 'resolved';
  priority: 'normal' | 'high';
  assignedAgentEmail?: string;
  messages: SupportMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface BlogArticleCMS {
  id: string;
  title: string;
  category: string;
  readTime: string;
  summary: string;
  image: string;
  relatedSlug: string;
}

export interface FAQEntryCMS {
  id: string;
  question: string;
  answer: string;
}

export interface WebsiteContentCMS {
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  heroPrimaryCta: string;
  heroSecondaryCta: string;
  heroImage: string;
  heroDefaultProductSlug: string;
  heroDefaultBackdrop: StudioBackdrop;
  promoBannerText: string;
  promoBannerEnabled: boolean;
  editorialTitle: string;
  editorialBody: string;
  aboutHeading: string;
  aboutStory: string;
  contactHeading: string;
  contactAddress: string;
  contactPhone: string;
  contactEmail: string;
  contactHours: string;
  shippingPolicyBody: string;
  returnPolicyBody: string;
  privacyPolicyBody: string;
  termsBody: string;
  faqs: FAQEntryCMS[];
  blogArticles: BlogArticleCMS[];
  updatedAt: string;
}

export interface AdminNotification {
  id: string;
  type: 'order' | 'low_stock' | 'review' | 'support' | 'ai_error' | 'system';
  title: string;
  message: string;
  linkSection?: AdminSectionId;
  isRead: boolean;
  createdAt: string;
}

export interface WhatsAppReferralRecord {
  id: string;
  source: string;
  customerPhone?: string;
  summary: string;
  createdAt: string;
}

export interface StoreSettingsFull extends StoreConfig {
  lowStockThreshold: number;
  notifyNewOrders: boolean;
  notifyLowStock: boolean;
  notifyAiErrors: boolean;
  aiEscalationKeywords: string[];
  aiAutoEscalateOnLowConfidence: boolean;
}

export interface AdminOverviewStats {
  totalOrders: number;
  totalRevenuePkr: number;
  totalProducts: number;
  totalCustomers: number;
  pendingOrdersCount: number;
  deliveredOrdersCount: number;
  revenueGrowthPercent: number;
  salesWindows: {
    dailyPkr: number;
    weeklyPkr: number;
    monthlyPkr: number;
    yearlyPkr: number;
  };
  lowStockProducts: Product[];
  recentOrders: OrderRecord[];
  topSellingProducts: { name: string; slug: string; unitsSold: number; revenuePkr: number }[];
  departmentSplit: { skincareRevenuePkr: number; haircareRevenuePkr: number };
  salesTrend: { label: string; revenuePkr: number; orders: number; skincarePkr: number; haircarePkr: number }[];
  categorySales: { category: string; revenuePkr: number; units: number }[];
  orderStatusBreakdown: { status: string; count: number }[];
  customerGrowth: { label: string; customers: number }[];
  recentActivity: { id: string; title: string; detail: string; createdAt: string; kind: string }[];
}

export interface AnalyticsReportData {
  range: '7d' | '30d' | '90d' | '365d' | 'all';
  totalRevenuePkr: number;
  totalOrders: number;
  averageOrderValuePkr: number;
  discountGivenPkr: number;
  cancellationRatePercent: number;
  aiConversionRatePercent: number;
  salesSeries: { label: string; revenuePkr: number; orders: number; discountPkr: number }[];
  categoryPerformance: { category: string; department: string; units: number; revenuePkr: number }[];
  couponPerformance: { code: string; redemptions: number; discountPkr: number; revenuePkr: number }[];
  inventoryHealth: {
    totalSkus: number;
    lowStockCount: number;
    outOfStockCount: number;
    stockValuationPkr: number;
  };
}

export type AppRoute =
  | { name: 'home' }
  | { name: 'skincare'; category?: string }
  | { name: 'haircare'; category?: string }
  | { name: 'product'; slug: string }
  | { name: 'atelier'; slug?: string }
  | { name: 'quiz' }
  | { name: 'ai-studio'; tab?: 'skin' | 'hair' | 'routine' }
  | { name: 'ingredients'; ingredientId?: string }
  | { name: 'checkout' }
  | { name: 'account' }
  | { name: 'admin' }
  | { name: 'policy'; section: 'shipping' | 'returns' | 'privacy' | 'terms' | 'faq' | 'about' | 'contact' | 'blog' };
