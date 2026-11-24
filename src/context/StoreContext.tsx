import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { INITIAL_PRODUCTS } from '../data/catalog';
import type {
  AIMemoryPreferences,
  AppRoute,
  CartItem,
  CategoryRecord,
  CustomerProfile,
  OrderRecord,
  Product,
  SavedAddress,
  SavedRoutine,
  StoreConfig,
  WebsiteContentCMS,
} from '../types/store';
import { getEffectivePrice } from '../utils/commerce';
import {
  getCmsContentLocal,
  getCustomerFromTokenLocal,
  getLocalDatabaseStatus,
  getPublicStoreConfigLocal,
  listCategoriesLocal,
  listOrdersLocal,
  listProductsLocal,
  loginCustomerLocal,
  registerCustomerLocal,
  sanitizeCustomer,
  updateCustomerProfileLocal,
} from '../db/localDatabase';
import { getLightweightStorePrefs } from '../db/localPrefs';

export interface AssistantQuickAction {
  mode?: 'chat' | 'skin' | 'hair' | 'routine' | 'whatsapp';
  prompt?: string;
  nonce: number;
}

export interface CartActionCommand {
  type: 'add' | 'remove' | 'update';
  slug: string;
  quantity?: number;
}

interface StoreContextValue {
  route: AppRoute;
  navigate: (next: AppRoute) => void;
  products: Product[];
  loadingProducts: boolean;
  refreshProducts: () => Promise<void>;
  categories: CategoryRecord[];
  refreshCategories: () => Promise<void>;
  storeConfig: StoreConfig;
  refreshStoreConfig: () => Promise<void>;
  cmsContent: WebsiteContentCMS | null;
  refreshCmsContent: () => Promise<void>;
  cart: CartItem[];
  cartCount: number;
  cartSubtotalPkr: number;
  isCartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  isSearchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  addToCart: (product: Product, quantity?: number, openDrawer?: boolean) => void;
  addMultipleToCart: (items: Product[], openDrawer?: boolean) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  applyCartActions: (actions: CartActionCommand[]) => void;
  wishlistIds: string[];
  toggleWishlist: (productId: string) => void;
  recentlyViewedSlugs: string[];
  recordRecentlyViewed: (slug: string) => void;
  savedRoutines: SavedRoutine[];
  saveRoutine: (routine: SavedRoutine) => Promise<void>;
  authToken: string | null;
  customer: CustomerProfile | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, phone: string, password: string) => Promise<void>;
  logout: () => void;
  updateProfile: (patch: { name?: string; phone?: string; savedAddresses?: SavedAddress[] }) => Promise<void>;
  orders: OrderRecord[];
  refreshOrders: () => Promise<void>;
  aiMemory: AIMemoryPreferences;
  updateAiMemory: (patch: Partial<AIMemoryPreferences>) => void;
  clearAiMemory: () => void;
  isAssistantOpen: boolean;
  setAssistantOpen: (open: boolean) => void;
  assistantQuickAction: AssistantQuickAction | null;
  openAssistant: (options?: { mode?: 'chat' | 'skin' | 'hair' | 'routine' | 'whatsapp'; prompt?: string }) => void;
  toastMessage: string | null;
  showToast: (msg: string) => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

const LS_CART = 'aurelia_cart_v1';
const LS_WISHLIST = 'aurelia_wishlist_v1';
const LS_RECENT = 'aurelia_recent_v1';
const LS_ROUTINES = 'aurelia_routines_v1';
const LS_TOKEN = 'aurelia_auth_token_v1';
const LS_AI_MEMORY = 'aurelia_ai_memory_v1';

const DEFAULT_AI_MEMORY: AIMemoryPreferences = {
  consentGiven: false,
  skinType: undefined,
  hairType: undefined,
  concerns: [],
  budgetMaxPkr: undefined,
  preferredCategories: [],
  lastRecommendedSlugs: [],
};

const DEFAULT_CONFIG: StoreConfig = {
  brandName: 'Aurelia Botanica',
  whatsappNumber: '923001234567',
  whatsappEnabled: true,
  shippingFeePkr: 250,
  freeShippingThresholdPkr: 5000,
  availableCoupons: [
    { code: 'AURELIA10', description: '10% off your entire skincare & haircare bag' },
    { code: 'GLOW500', description: 'PKR 500 off orders PKR 3,500 or more' },
    { code: 'FREESHIP', description: 'Complimentary nationwide Pakistan delivery' },
  ],
};

function parseRouteFromHash(): AppRoute {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (!hash) return { name: 'home' };
  const [segment, ...rest] = hash.split('/');
  const param = rest.join('/') ? decodeURIComponent(rest.join('/')) : undefined;
  switch (segment) {
    case 'skincare':
      return { name: 'skincare', category: param };
    case 'haircare':
      return { name: 'haircare', category: param };
    case 'product':
      return param ? { name: 'product', slug: param } : { name: 'skincare' };
    case 'atelier':
      return { name: 'atelier', slug: param };
    case 'quiz':
      return { name: 'quiz' };
    case 'ai-studio':
      if (param === 'hair' || param === 'routine' || param === 'skin') {
        return { name: 'ai-studio', tab: param };
      }
      return { name: 'ai-studio', tab: 'skin' };
    case 'ingredients':
      return { name: 'ingredients', ingredientId: param };
    case 'checkout':
      return { name: 'checkout' };
    case 'account':
      return { name: 'account' };
    case 'admin':
      return { name: 'admin' };
    case 'policy':
      if (
        param === 'returns' ||
        param === 'privacy' ||
        param === 'terms' ||
        param === 'faq' ||
        param === 'about' ||
        param === 'contact' ||
        param === 'blog'
      ) {
        return { name: 'policy', section: param };
      }
      return { name: 'policy', section: 'shipping' };
    default:
      return { name: 'home' };
  }
}

function serializeRouteToHash(route: AppRoute): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'skincare':
      return route.category ? `#/skincare/${encodeURIComponent(route.category)}` : '#/skincare';
    case 'haircare':
      return route.category ? `#/haircare/${encodeURIComponent(route.category)}` : '#/haircare';
    case 'product':
      return `#/product/${encodeURIComponent(route.slug)}`;
    case 'atelier':
      return route.slug ? `#/atelier/${encodeURIComponent(route.slug)}` : '#/atelier';
    case 'quiz':
      return '#/quiz';
    case 'ai-studio':
      return route.tab ? `#/ai-studio/${route.tab}` : '#/ai-studio/skin';
    case 'ingredients':
      return route.ingredientId ? `#/ingredients/${encodeURIComponent(route.ingredientId)}` : '#/ingredients';
    case 'checkout':
      return '#/checkout';
    case 'account':
      return '#/account';
    case 'admin':
      return '#/admin';
    case 'policy':
      return `#/policy/${route.section}`;
  }
}

function readLocalJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [route, setRoute] = useState<AppRoute>(() => parseRouteFromHash());
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [loadingProducts, setLoadingProducts] = useState<boolean>(true);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [storeConfig, setStoreConfig] = useState<StoreConfig>(() => {
    const cached = getLightweightStorePrefs();
    if (!cached) return DEFAULT_CONFIG;
    return {
      ...DEFAULT_CONFIG,
      brandName: cached.brandName || DEFAULT_CONFIG.brandName,
      whatsappNumber: cached.whatsappNumber || DEFAULT_CONFIG.whatsappNumber,
      whatsappEnabled: cached.whatsappEnabled ?? true,
      shippingFeePkr: cached.shippingFeePkr ?? DEFAULT_CONFIG.shippingFeePkr,
      freeShippingThresholdPkr: cached.freeShippingThresholdPkr ?? DEFAULT_CONFIG.freeShippingThresholdPkr,
      taxPercent: cached.taxPercent ?? 0,
      codEnabled: cached.codEnabled ?? true,
      promoBannerText: cached.promoBannerText ?? DEFAULT_CONFIG.promoBannerText,
      promoBannerActive: cached.promoBannerActive ?? true,
    };
  });
  const [cmsContent, setCmsContent] = useState<WebsiteContentCMS | null>(null);
  const [cart, setCart] = useState<CartItem[]>(() => readLocalJson<CartItem[]>(LS_CART, []));
  const [wishlistIds, setWishlistIds] = useState<string[]>(() => readLocalJson<string[]>(LS_WISHLIST, []));
  const [recentlyViewedSlugs, setRecentlyViewedSlugs] = useState<string[]>(() => readLocalJson<string[]>(LS_RECENT, []));
  const [savedRoutines, setSavedRoutines] = useState<SavedRoutine[]>(() =>
    readLocalJson<SavedRoutine[]>(LS_ROUTINES, []),
  );
  const [aiMemory, setAiMemory] = useState<AIMemoryPreferences>(() =>
    readLocalJson<AIMemoryPreferences>(LS_AI_MEMORY, DEFAULT_AI_MEMORY),
  );
  const [authToken, setAuthToken] = useState<string | null>(() => localStorage.getItem(LS_TOKEN));
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [isCartOpen, setCartOpen] = useState(false);
  const [isSearchOpen, setSearchOpen] = useState(false);
  const [isAssistantOpen, setAssistantOpen] = useState(false);
  const [assistantQuickAction, setAssistantQuickAction] = useState<AssistantQuickAction | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const navigate = useCallback((next: AppRoute) => {
    const hash = serializeRouteToHash(next);
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
    setRoute(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onHashChange = () => setRoute(parseRouteFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Persist cart, wishlist, recently viewed, routines, AI memory locally
  useEffect(() => {
    localStorage.setItem(LS_CART, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem(LS_WISHLIST, JSON.stringify(wishlistIds));
  }, [wishlistIds]);

  useEffect(() => {
    localStorage.setItem(LS_RECENT, JSON.stringify(recentlyViewedSlugs));
  }, [recentlyViewedSlugs]);

  useEffect(() => {
    localStorage.setItem(LS_ROUTINES, JSON.stringify(savedRoutines));
  }, [savedRoutines]);

  useEffect(() => {
    localStorage.setItem(LS_AI_MEMORY, JSON.stringify(aiMemory));
  }, [aiMemory]);

  const updateAiMemory = useCallback((patch: Partial<AIMemoryPreferences>) => {
    setAiMemory((prev) => ({ ...prev, ...patch }));
  }, []);

  const clearAiMemory = useCallback(() => {
    setAiMemory(DEFAULT_AI_MEMORY);
    localStorage.removeItem(LS_AI_MEMORY);
    showToast('AI beauty memory cleared.');
  }, [showToast]);

  const openAssistant = useCallback(
    (options?: { mode?: 'chat' | 'skin' | 'hair' | 'routine' | 'whatsapp'; prompt?: string }) => {
      setAssistantOpen(true);
      if (options?.mode || options?.prompt) {
        setAssistantQuickAction({
          mode: options.mode,
          prompt: options.prompt,
          nonce: Date.now(),
        });
      }
    },
    [],
  );

  const refreshProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const localProducts = await listProductsLocal({ includeUnpublished: false, includeReviews: true });
      setProducts(localProducts);
    } catch (err) {
      const status = getLocalDatabaseStatus();
      showToast(err instanceof Error ? err.message : status.error || 'Could not load local catalog.');
    } finally {
      setLoadingProducts(false);
    }
  }, [showToast]);

  const refreshOrders = useCallback(async () => {
    if (!authToken) {
      setOrders([]);
      return;
    }
    try {
      const cust = await getCustomerFromTokenLocal(authToken);
      if (!cust) {
        setOrders([]);
        return;
      }
      const allOrders = await listOrdersLocal(500);
      setOrders(allOrders.filter((o) => o.userId === cust.id));
    } catch {
      // Ignore transient errors
    }
  }, [authToken]);

  const refreshStoreConfig = useCallback(async () => {
    try {
      const cfg = await getPublicStoreConfigLocal();
      if (cfg) setStoreConfig(cfg);
    } catch {
      // Keep cached lightweight store prefs cleanly
    }
  }, []);

  const refreshCmsContent = useCallback(async () => {
    try {
      const [content, allCats] = await Promise.all([getCmsContentLocal(), listCategoriesLocal(false)]);
      setCmsContent(content);
      setCategories(allCats.filter((c) => c.isActive));
    } catch {
      // Ignore transient errors
    }
  }, []);

  const refreshCategories = useCallback(async () => {
    await refreshCmsContent();
  }, [refreshCmsContent]);

  useEffect(() => {
    refreshProducts();
    refreshStoreConfig();
    refreshCmsContent();
  }, [refreshProducts, refreshStoreConfig, refreshCmsContent]);

  useEffect(() => {
    if (!authToken) {
      setCustomer(null);
      setOrders([]);
      return;
    }
    getCustomerFromTokenLocal(authToken)
      .then((found) => {
        if (!found) {
          localStorage.removeItem(LS_TOKEN);
          setAuthToken(null);
          setCustomer(null);
          return;
        }
        const safeUser = sanitizeCustomer(found);
        setCustomer(safeUser);
        if (safeUser.wishlistIds?.length) {
          setWishlistIds((prev) => Array.from(new Set([...prev, ...safeUser.wishlistIds])));
        }
        if (safeUser.savedRoutines?.length) {
          setSavedRoutines((prev) => {
            const byId = new Map<string, SavedRoutine>();
            [...safeUser.savedRoutines, ...prev].forEach((rt) => byId.set(rt.id, rt));
            return Array.from(byId.values());
          });
        }
        void refreshOrders();
      })
      .catch(() => {});
  }, [authToken, refreshOrders]);

  // Dynamic SEO & Schema.org Product structured data per view
  useEffect(() => {
    let title = 'Aurelia Botanica — Luxury Botanical Skincare & Haircare';
    let description =
      'Explore Aurelia Botanica luxury skincare and haircare with AI Beauty Expert, interactive 3D inspection, personalized routines, and PKR WhatsApp checkout.';
    let structuredData: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'Store',
      name: 'Aurelia Botanica',
      description,
      priceRange: 'PKR 2,150 - PKR 3,950',
      address: { '@type': 'PostalAddress', addressCountry: 'PK' },
    };

    if (route.name === 'skincare') {
      title = route.category
        ? `${route.category} — Aurelia Botanica Skincare`
        : 'Skincare Collection — Aurelia Botanica';
      description =
        'Targeted botanical cleansers, niacinamide serums, ceramide creams, and zero-white-cast sunscreens crafted for Pakistani climates.';
    } else if (route.name === 'haircare') {
      title = route.category
        ? `${route.category} — Aurelia Botanica Haircare`
        : 'Haircare Collection — Aurelia Botanica';
      description =
        'Cold-pressed rosemary scalp oils, keratin repair masks, biotin growth tonics, and sulfate-free haircare rituals.';
    } else if (route.name === 'atelier') {
      title = '3D Product Atelier — Aurelia Botanica';
      description = 'Inspect Aurelia Botanica amber glass droppers, frosted olive jars, and botanical formulas in interactive 3D.';
    } else if (route.name === 'quiz') {
      title = 'Smart Skin Type Quiz — Aurelia Botanica';
      description = 'Discover your personalized morning and night botanical skincare routine in six thoughtful steps.';
    } else if (route.name === 'ai-studio') {
      title = 'AI Skin, Hair & Routine Studio — Aurelia Botanica';
      description =
        'Consent-based AI facial skin analyzer, hair & scalp photo analyzer, and personalized Morning/Night botanical routine generator.';
    } else if (route.name === 'admin') {
      title = 'Admin Operations & AI Insights — Aurelia Botanica';
      description = 'Manage Aurelia Botanica inventory, orders, and review AI business analytics.';
    } else if (route.name === 'ingredients') {
      title = 'Botanical Ingredient Library — Aurelia Botanica';
      description = 'Transparent cosmetic education on Niacinamide, Hyaluronic Acid, Rosemary Oil, Ceramides, Retinol, and more.';
    } else if (route.name === 'product') {
      const p = products.find((item) => item.slug === route.slug);
      if (p) {
        title = `${p.name} — Aurelia Botanica`;
        description = `${p.subtitle}. ${p.description}`;
        structuredData = {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: p.name,
          description: p.description,
          brand: { '@type': 'Brand', name: 'Aurelia Botanica' },
          offers: {
            '@type': 'Offer',
            priceCurrency: 'PKR',
            price: String(getEffectivePrice(p.pricePkr, p.discountPricePkr)),
            availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          },
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: String(p.rating),
            reviewCount: String(p.reviewCount),
          },
        };
      }
    }

    document.title = title;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', description);
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', title);
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', description);
    const jsonLd = document.getElementById('aurelia-jsonld');
    if (jsonLd) jsonLd.textContent = JSON.stringify(structuredData);
  }, [route, products]);

  const addToCart = useCallback(
    (product: Product, quantity = 1, openDrawer = true) => {
      if (product.stock <= 0) {
        showToast(`${product.name} is currently out of stock.`);
        return;
      }
      const unitPrice = getEffectivePrice(product.pricePkr, product.discountPricePkr);
      setCart((prev) => {
        const existing = prev.find((i) => i.productId === product.id);
        if (existing) {
          return prev.map((i) =>
            i.productId === product.id ? { ...i, quantity: Math.min(product.stock, i.quantity + quantity) } : i,
          );
        }
        return [
          ...prev,
          {
            productId: product.id,
            slug: product.slug,
            name: product.name,
            volume: product.volume,
            pricePkr: unitPrice,
            image: product.images[0],
            quantity: Math.min(product.stock, quantity),
          },
        ];
      });
      showToast(`Added ${product.name} to your bag.`);
      if (openDrawer) setCartOpen(true);
    },
    [showToast],
  );

  const addMultipleToCart = useCallback(
    (items: Product[], openDrawer = true) => {
      const available = items.filter((p) => p.stock > 0);
      if (available.length === 0) return;
      setCart((prev) => {
        let next = [...prev];
        for (const product of available) {
          const unitPrice = getEffectivePrice(product.pricePkr, product.discountPricePkr);
          const existing = next.find((i) => i.productId === product.id);
          if (existing) {
            next = next.map((i) =>
              i.productId === product.id ? { ...i, quantity: Math.min(product.stock, i.quantity + 1) } : i,
            );
          } else {
            next.push({
              productId: product.id,
              slug: product.slug,
              name: product.name,
              volume: product.volume,
              pricePkr: unitPrice,
              image: product.images[0],
              quantity: 1,
            });
          }
        }
        return next;
      });
      showToast(`Added ${available.length} routine essentials to your bag.`);
      if (openDrawer) setCartOpen(true);
    },
    [showToast],
  );

  const updateCartQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((i) => i.productId !== productId));
      return;
    }
    setCart((prev) => prev.map((i) => (i.productId === productId ? { ...i, quantity } : i)));
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const applyCartActions = useCallback(
    (actions: CartActionCommand[]) => {
      if (!Array.isArray(actions) || actions.length === 0) return;
      setCart((prev) => {
        let next = [...prev];
        for (const action of actions) {
          const product = products.find((p) => p.slug === action.slug);
          if (!product) continue;
          if (action.type === 'remove') {
            next = next.filter((i) => i.productId !== product.id);
          } else if (action.type === 'update') {
            const qty = Math.max(0, Math.min(product.stock, action.quantity ?? 1));
            if (qty <= 0) {
              next = next.filter((i) => i.productId !== product.id);
            } else {
              const existing = next.find((i) => i.productId === product.id);
              if (existing) {
                next = next.map((i) => (i.productId === product.id ? { ...i, quantity: qty } : i));
              }
            }
          } else if (action.type === 'add' && product.stock > 0) {
            const qty = Math.max(1, action.quantity ?? 1);
            const unitPrice = getEffectivePrice(product.pricePkr, product.discountPricePkr);
            const existing = next.find((i) => i.productId === product.id);
            if (existing) {
              next = next.map((i) =>
                i.productId === product.id ? { ...i, quantity: Math.min(product.stock, i.quantity + qty) } : i,
              );
            } else {
              next.push({
                productId: product.id,
                slug: product.slug,
                name: product.name,
                volume: product.volume,
                pricePkr: unitPrice,
                image: product.images[0],
                quantity: Math.min(product.stock, qty),
              });
            }
          }
        }
        return next;
      });
      showToast('Shopping bag updated by AI Beauty Expert.');
    },
    [products, showToast],
  );

  const toggleWishlist = useCallback(
    (productId: string) => {
      setWishlistIds((prev) => {
        const exists = prev.includes(productId);
        const next = exists ? prev.filter((id) => id !== productId) : [productId, ...prev];
        showToast(exists ? 'Removed from wishlist.' : 'Saved to wishlist.');
        if (authToken) {
          void getCustomerFromTokenLocal(authToken).then((cust) => {
            if (cust) {
              return updateCustomerProfileLocal(cust.id, { wishlistIds: next });
            }
            return null;
          });
        }
        return next;
      });
    },
    [authToken, showToast],
  );

  const recordRecentlyViewed = useCallback((slug: string) => {
    setRecentlyViewedSlugs((prev) => [slug, ...prev.filter((s) => s !== slug)].slice(0, 8));
  }, []);

  const saveRoutine = useCallback(
    async (routine: SavedRoutine) => {
      setSavedRoutines((prev) => {
        const updatedList = [routine, ...prev.filter((r) => r.id !== routine.id)].slice(0, 10);
        if (authToken) {
          void getCustomerFromTokenLocal(authToken).then(async (cust) => {
            if (!cust) return;
            const merged = [routine, ...cust.savedRoutines.filter((r) => r.id !== routine.id)].slice(0, 10);
            const saved = await updateCustomerProfileLocal(cust.id, { savedRoutines: merged });
            if (saved) setCustomer(sanitizeCustomer(saved));
          });
        }
        return updatedList;
      });
      showToast('Personalized routine saved.');
    },
    [authToken, showToast],
  );

  const login = useCallback(async (email: string, password: string) => {
    const data = await loginCustomerLocal(email, password);
    localStorage.setItem(LS_TOKEN, data.token);
    setAuthToken(data.token);
    setCustomer(data.user);
  }, []);

  const register = useCallback(async (name: string, email: string, phone: string, password: string) => {
    const data = await registerCustomerLocal({ name, email, phone, password });
    localStorage.setItem(LS_TOKEN, data.token);
    setAuthToken(data.token);
    setCustomer(data.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(LS_TOKEN);
    setAuthToken(null);
    setCustomer(null);
    setOrders([]);
    showToast('Signed out.');
  }, [showToast]);

  const updateProfile = useCallback(
    async (patch: { name?: string; phone?: string; savedAddresses?: SavedAddress[] }) => {
      if (!authToken) return;
      const cust = await getCustomerFromTokenLocal(authToken);
      if (!cust) {
        throw new Error('Customer session expired. Please sign in again.');
      }
      const updated = await updateCustomerProfileLocal(cust.id, patch);
      if (!updated) {
        throw new Error('Could not update profile.');
      }
      setCustomer(sanitizeCustomer(updated));
      showToast('Profile updated.');
    },
    [authToken, showToast],
  );

  const cartCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);
  const cartSubtotalPkr = useMemo(() => cart.reduce((sum, item) => sum + item.pricePkr * item.quantity, 0), [cart]);

  const value: StoreContextValue = {
    route,
    navigate,
    products,
    loadingProducts,
    refreshProducts,
    categories,
    refreshCategories,
    storeConfig,
    refreshStoreConfig,
    cmsContent,
    refreshCmsContent,
    cart,
    cartCount,
    cartSubtotalPkr,
    isCartOpen,
    setCartOpen,
    isSearchOpen,
    setSearchOpen,
    addToCart,
    addMultipleToCart,
    updateCartQuantity,
    removeFromCart,
    clearCart,
    applyCartActions,
    wishlistIds,
    toggleWishlist,
    recentlyViewedSlugs,
    recordRecentlyViewed,
    savedRoutines,
    saveRoutine,
    authToken,
    customer,
    login,
    register,
    logout,
    updateProfile,
    orders,
    refreshOrders,
    aiMemory,
    updateAiMemory,
    clearAiMemory,
    isAssistantOpen,
    setAssistantOpen,
    assistantQuickAction,
    openAssistant,
    toastMessage,
    showToast,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
