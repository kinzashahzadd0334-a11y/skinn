import { Type, type FunctionDeclaration } from '@google/genai';
import { INGREDIENT_LIBRARY } from '../../src/data/catalog';
import type {
  AIAgentConfig,
  AIMemoryPreferences,
  AIRoutinePlan,
  CartItem,
  CustomerProfile,
  OrderRecord,
  Product,
  StoreConfig,
  WebsiteContentCMS,
} from '../../src/types/store';

export const AI_MODULE_GUIDELINES = {
  beautyConsultant: `
MODULE 1 — BEAUTY CONSULTANT:
- Act as Aurelia Botanica's luxury personal beauty consultant available 24/7.
- Fluently understand and reply in English, Urdu script, or natural Roman Urdu matching the user's language preference (e.g. if the user writes "Meri skin oily hai aur mujhe acne ka issue hai", respond warmly in natural Roman Urdu / English mix).
- Ask helpful clarifying follow-up questions when needed (skin/hair type, budget, sensitivities).`,

  skincareExpert: `
MODULE 2 — SKINCARE EXPERT:
- Deep expertise in Oily Skin, Dry Skin, Combination Skin, Normal Skin, Sensitive Skin, and Acne-Prone Skin.
- Educate clearly on acne, blemishes, uneven tone, pigmentation, dryness, excess oil, hydration, sunscreen, and active ingredients.
- Explain WHY a product fits and HOW to use it (AM vs PM, patch testing, avoiding mixing strong acids with retinol on the same evening).
- NEVER claim to diagnose skin diseases or promise medical cures; advise consulting a licensed dermatologist for persistent or severe skin conditions.`,

  haircareExpert: `
MODULE 3 — HAIRCARE EXPERT:
- Deep expertise in Dry, Oily, Normal, Curly, Straight, Wavy, Frizzy, and Damaged hair, plus Hair Fall, Dandruff, Dry Scalp, Frizz, Split Ends, and Hair Damage.
- Recommend shampoos, conditioners, cold-pressed oils, leave-in tonics, repair masks, and serums based on hair type, scalp oiliness, and budget.
- Distinguish cosmetic hair & scalp care from medical alopecia or dermatological scalp conditions.`,

  productRecommendation: `
MODULE 4 — PRODUCT RECOMMENDATION ENGINE:
- STRICT GROUNDING RULE: ONLY recommend real products present in the live Aurelia Botanica catalog returned by tools or provided in catalog context.
- NEVER invent product names, prices, discounts, stock numbers, or certifications.
- Always check real stock availability and cite exact PKR prices and active discounts.`,

  shoppingAssistant: `
MODULE 5 — SHOPPING ASSISTANT & WHATSAPP CHECKOUT:
- Help customers search, compare products, check discounts, add/remove/update cart items, validate coupons (AURELIA10, GLOW500, FREESHIP), estimate totals, and prepare WhatsApp order summaries.
- Always ask for explicit customer confirmation before placing or dispatching a final order. Never claim an order is confirmed until the order endpoint confirms it.`,

  customerSupport: `
MODULE 6 — CUSTOMER SUPPORT AGENT:
- Answer questions using verified store policy:
  * Nationwide Pakistan courier delivery: 2-3 business days major cities (Lahore, Karachi, Islamabad, Rawalpindi), 3-5 business days nationwide.
  * Cash on Delivery available nationwide. Shipping fee PKR 250; complimentary delivery on orders PKR 5,000+ (or coupon FREESHIP).
  * Returns: 14-day return/exchange for unopened tamper-sealed items; 48-hour photo replacement for transit damage.
  * Order cancellation: Contact WhatsApp concierge prior to courier dispatch.
- For order tracking, ONLY call check_order_status when the user is signed in OR explicitly provides BOTH their Order Number and phone number. NEVER guess or expose another customer's personal data.
- If unable to resolve a complex issue, offer human WhatsApp concierge support.`,

  adminAssistant: `
MODULE 7 — ADMIN BUSINESS ASSISTANT:
- Assist the authorized Aurelia Botanica store administrator with real sales analytics, best sellers, low-stock alerts, order summaries, customer feedback themes, and coupon insights.
- Rely strictly on the verified store telemetry provided in context. Never modify products, prices, inventory, or orders automatically without explicit admin UI confirmation.`,
};

export const SHOPPING_TOOLS: FunctionDeclaration[] = [
  {
    name: 'search_catalog',
    description:
      'Search and filter real skincare and haircare products from the Aurelia Botanica database by department, query, skin/hair type, concern, ingredient, or max price in PKR.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        department: { type: Type.STRING, description: 'Optional: skincare or haircare' },
        query: { type: Type.STRING, description: 'Keyword like serum, shampoo, acne, niacinamide, frizz' },
        suitableType: { type: Type.STRING, description: 'E.g. Oily Skin, Dry Skin, Curly Hair, Frizzy Hair' },
        maxPricePkr: { type: Type.NUMBER, description: 'Maximum price budget in PKR' },
        onlyInStock: { type: Type.BOOLEAN, description: 'Filter to items with stock > 0' },
      },
    },
  },
  {
    name: 'compare_products',
    description: 'Compare 2 or 3 real catalog products side-by-side by slug.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        slugs: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Array of product slugs to compare',
        },
      },
      required: ['slugs'],
    },
  },
  {
    name: 'add_to_cart',
    description: 'Add a real product to the customer shopping bag by slug and quantity.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        slug: { type: Type.STRING, description: 'Exact product slug from catalog' },
        quantity: { type: Type.NUMBER, description: 'Quantity to add (default 1)' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'remove_from_cart',
    description: 'Remove a product from the customer shopping bag by slug.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        slug: { type: Type.STRING, description: 'Exact product slug to remove' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'update_cart_quantity',
    description: 'Update quantity of a product already in the customer shopping bag.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        slug: { type: Type.STRING, description: 'Exact product slug' },
        quantity: { type: Type.NUMBER, description: 'New quantity (0 removes item)' },
      },
      required: ['slug', 'quantity'],
    },
  },
  {
    name: 'validate_coupon',
    description: 'Check whether a promo code is valid for the current cart subtotal and compute PKR discount.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        code: { type: Type.STRING, description: 'Promo code e.g. AURELIA10, GLOW500, FREESHIP' },
      },
      required: ['code'],
    },
  },
  {
    name: 'check_order_status',
    description:
      'Look up order status. Works for authenticated user orders or when both orderNumber and customerPhone are explicitly provided by the user.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        orderNumber: { type: Type.STRING, description: 'Order reference such as AB-1042' },
        customerPhone: { type: Type.STRING, description: 'Customer phone number matching the order' },
      },
    },
  },
  {
    name: 'prepare_whatsapp_order',
    description:
      'Prepare a pre-filled WhatsApp order summary for customer review before opening WhatsApp. Never claims the order is already confirmed.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        customerName: { type: Type.STRING, description: 'Customer name if provided' },
        address: { type: Type.STRING, description: 'Delivery address in Pakistan if provided' },
        couponCode: { type: Type.STRING, description: 'Optional coupon code' },
      },
    },
  },
  {
    name: 'build_personalized_routine',
    description:
      'Generate a structured Morning Skincare, Night Skincare, and/or Weekly Haircare routine card using exact catalog product slugs.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: 'Routine title' },
        summary: { type: Type.STRING, description: 'Short explanation of why this routine works' },
        safetyNote: { type: Type.STRING, description: 'Safety & layering precaution note' },
        morningSlugs: { type: Type.ARRAY, items: { type: Type.STRING } },
        nightSlugs: { type: Type.ARRAY, items: { type: Type.STRING } },
        haircareSlugs: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['title', 'summary', 'safetyNote'],
    },
  },
];

export function buildCatalogSummaryForPrompt(products: Product[]): string {
  return products
    .map((p) => {
      const effective = p.discountPricePkr && p.discountPricePkr < p.pricePkr ? p.discountPricePkr : p.pricePkr;
      return `- [${p.slug}] ${p.name} (${p.department} / ${p.category}) | Price: PKR ${effective}${
        p.discountPricePkr ? ` (was PKR ${p.pricePkr})` : ''
      } | Vol: ${p.volume} | Stock: ${p.stock} | Rating: ${p.rating} | For: ${p.suitableTypes.join(', ')} | Concerns: ${p.concerns.join(', ')} | Actives: ${p.keyIngredients.join(', ')} | Time: ${p.routineTime}`;
    })
    .join('\n');
}

export function buildConsultantSystemInstruction(params: {
  language: string;
  products: Product[];
  cart: CartItem[];
  memory?: AIMemoryPreferences;
  customer?: CustomerProfile | null;
  storeConfig: StoreConfig;
  agentConfigs?: AIAgentConfig[];
  cmsContent?: WebsiteContentCMS;
}): string {
  const catalogLines = buildCatalogSummaryForPrompt(params.products);
  const ingredientLines = INGREDIENT_LIBRARY.map(
    (i) => `- ${i.name}: ${i.cosmeticPurpose} (Suitable: ${i.suitableFor.join(', ')})`,
  ).join('\n');

  const cartLines =
    params.cart.length > 0
      ? params.cart.map((c) => `- ${c.name} (${c.slug}) x${c.quantity} @ PKR ${c.pricePkr}`).join('\n')
      : 'Cart is currently empty.';

  const mem = params.memory?.consentGiven
    ? `Saved Customer Preferences (with consent): Skin=${params.memory.skinType || 'Unknown'}, Hair=${
        params.memory.hairType || 'Unknown'
      }, Concerns=${params.memory.concerns.join(', ') || 'None'}, Budget=${
        params.memory.budgetMaxPkr ? `PKR ${params.memory.budgetMaxPkr}` : 'Flexible'
      }`
    : 'No persistent beauty preferences saved.';

  const agentNotes = (params.agentConfigs || [])
    .filter((a) => a.enabled && a.customInstructions.trim())
    .map((a) => `- ${a.name} (${a.personalityTone.replace('_', ' ')}): ${a.customInstructions.trim()}`)
    .join('\n');

  const customFaqs = [
    ...(params.agentConfigs || []).flatMap((a) => a.faqKnowledge || []),
    ...(params.cmsContent?.faqs || []),
  ]
    .slice(0, 12)
    .map((f) => `Q: ${f.question}\nA: ${f.answer}`)
    .join('\n');

  return [
    `You are **Aurelia**, the AI Beauty Expert for **${params.storeConfig.brandName || 'Aurelia Botanica'}** (luxury botanical skincare & haircare brand in Pakistan).`,
    AI_MODULE_GUIDELINES.beautyConsultant,
    AI_MODULE_GUIDELINES.skincareExpert,
    AI_MODULE_GUIDELINES.haircareExpert,
    AI_MODULE_GUIDELINES.productRecommendation,
    AI_MODULE_GUIDELINES.shoppingAssistant,
    AI_MODULE_GUIDELINES.customerSupport,
    agentNotes ? `ADMIN CONFIGURED AGENT INSTRUCTIONS:\n${agentNotes}` : null,
    customFaqs ? `STORE FAQ KNOWLEDGE BASE:\n${customFaqs}` : null,
    `Language Preference Setting: ${params.language}. (If "auto", reply in the exact language/script the user used: English, Urdu, or Roman Urdu).`,
    `Active Coupons: ${params.storeConfig.availableCoupons.map((c) => `${c.code} (${c.description})`).join(' | ')}`,
    `Shipping Policy: Standard PKR ${params.storeConfig.shippingFeePkr}; FREE above PKR ${params.storeConfig.freeShippingThresholdPkr}.`,
    `Current Customer: ${params.customer ? `${params.customer.name} (Signed in)` : 'Guest visitor'}`,
    mem,
    'Current Shopping Bag:',
    cartLines,
    'LIVE CATALOG DATABASE (ONLY recommend slugs from this exact list):',
    catalogLines,
    'BOTANICAL INGREDIENT REFERENCE:',
    ingredientLines,
    'RESPONSE RULES: Keep replies concise, warm, well-structured, and practical. Whenever recommending products, call `search_catalog` or cite exact slugs so the UI renders interactive product cards for the user. Never invent products or prices. Always include a gentle non-medical disclaimer when advising on acne, pigmentation, hair fall, or scalp issues.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export interface ToolExecutionContext {
  products: Product[];
  cart: CartItem[];
  orders: OrderRecord[];
  customer: CustomerProfile | null;
  storeConfig: StoreConfig;
  evaluateCoupon: (code: string, subtotalPkr: number) => {
    valid: boolean;
    code: string;
    discountPkr: number;
    freeShipping: boolean;
    message: string;
  };
}

export interface ToolSideEffects {
  recommendedSlugs: string[];
  cartActions: { type: 'add' | 'remove' | 'update'; slug: string; quantity?: number }[];
  routinePlan?: AIRoutinePlan;
  whatsappDraft?: {
    summaryText: string;
    whatsappUrl: string;
    totalPkr: number;
    requiresConfirmation: boolean;
  };
}

export function executeShoppingTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
  effects: ToolSideEffects,
): Record<string, unknown> {
  const effectivePrice = (p: Product) =>
    p.discountPricePkr && p.discountPricePkr < p.pricePkr ? p.discountPricePkr : p.pricePkr;

  if (name === 'search_catalog') {
    const dept = typeof args.department === 'string' ? args.department.toLowerCase() : '';
    const q = typeof args.query === 'string' ? args.query.toLowerCase() : '';
    const suit = typeof args.suitableType === 'string' ? args.suitableType.toLowerCase() : '';
    const maxPrice = typeof args.maxPricePkr === 'number' ? args.maxPricePkr : Infinity;
    const onlyInStock = args.onlyInStock !== false;

    const matched = ctx.products
      .filter((p) => {
        if (dept && p.department !== dept) return false;
        if (onlyInStock && p.stock <= 0) return false;
        if (effectivePrice(p) > maxPrice) return false;
        if (suit && !p.suitableTypes.some((t) => t.toLowerCase().includes(suit))) return false;
        if (q) {
          const hay = [
            p.name,
            p.subtitle,
            p.category,
            p.description,
            ...p.concerns,
            ...p.keyIngredients,
            ...p.suitableTypes,
          ]
            .join(' ')
            .toLowerCase();
          const terms = q.split(/\s+/).filter(Boolean);
          if (!terms.some((t) => hay.includes(t))) return false;
        }
        return true;
      })
      .slice(0, 6);

    matched.forEach((p) => {
      if (!effects.recommendedSlugs.includes(p.slug)) effects.recommendedSlugs.push(p.slug);
    });

    return {
      count: matched.length,
      products: matched.map((p) => ({
        slug: p.slug,
        name: p.name,
        category: p.category,
        pricePkr: effectivePrice(p),
        originalPricePkr: p.pricePkr,
        stock: p.stock,
        rating: p.rating,
        suitableTypes: p.suitableTypes,
        keyIngredients: p.keyIngredients,
        howToUse: p.howToUse,
      })),
    };
  }

  if (name === 'compare_products') {
    const slugs = Array.isArray(args.slugs) ? args.slugs.map(String) : [];
    const found = ctx.products.filter((p) => slugs.includes(p.slug));
    found.forEach((p) => {
      if (!effects.recommendedSlugs.includes(p.slug)) effects.recommendedSlugs.push(p.slug);
    });
    return {
      compared: found.map((p) => ({
        slug: p.slug,
        name: p.name,
        pricePkr: effectivePrice(p),
        volume: p.volume,
        stock: p.stock,
        suitableTypes: p.suitableTypes,
        keyIngredients: p.keyIngredients,
        routineTime: p.routineTime,
        benefits: p.benefits,
      })),
    };
  }

  if (name === 'add_to_cart') {
    const slug = String(args.slug || '');
    const qty = Math.max(1, Math.min(10, Number(args.quantity) || 1));
    const product = ctx.products.find((p) => p.slug === slug);
    if (!product) return { success: false, error: 'Product not found in catalog.' };
    if (product.stock < qty) return { success: false, error: `Only ${product.stock} units in stock.` };

    effects.cartActions.push({ type: 'add', slug: product.slug, quantity: qty });
    if (!effects.recommendedSlugs.includes(product.slug)) effects.recommendedSlugs.push(product.slug);

    return {
      success: true,
      added: { name: product.name, slug: product.slug, quantity: qty, unitPricePkr: effectivePrice(product) },
    };
  }

  if (name === 'remove_from_cart') {
    const slug = String(args.slug || '');
    const product = ctx.products.find((p) => p.slug === slug);
    if (!product) return { success: false, error: 'Product not found.' };
    effects.cartActions.push({ type: 'remove', slug });
    return { success: true, removed: product.name };
  }

  if (name === 'update_cart_quantity') {
    const slug = String(args.slug || '');
    const quantity = Math.max(0, Math.min(10, Number(args.quantity) || 0));
    const product = ctx.products.find((p) => p.slug === slug);
    if (!product) return { success: false, error: 'Product not found.' };
    effects.cartActions.push({ type: 'update', slug, quantity });
    return { success: true, product: product.name, quantity };
  }

  if (name === 'validate_coupon') {
    const subtotal = ctx.cart.reduce((sum, i) => sum + i.pricePkr * i.quantity, 0);
    return ctx.evaluateCoupon(String(args.code || ''), subtotal);
  }

  if (name === 'check_order_status') {
    const orderNum = typeof args.orderNumber === 'string' ? args.orderNumber.trim().toUpperCase() : '';
    const phone = typeof args.customerPhone === 'string' ? args.customerPhone.replace(/\D/g, '') : '';

    if (orderNum && phone) {
      const match = ctx.orders.find(
        (o) =>
          o.orderNumber.toUpperCase() === orderNum &&
          o.customerPhone.replace(/\D/g, '').endsWith(phone.slice(-7)),
      );
      if (!match) {
        return { found: false, message: 'No order matched that Order Number and Phone.' };
      }
      return {
        found: true,
        orderNumber: match.orderNumber,
        status: match.status,
        city: match.shippingAddress.city,
        totalPkr: match.totalPkr,
        itemsCount: match.items.length,
      };
    }

    if (ctx.customer) {
      const own = ctx.orders.filter(
        (o) =>
          (o as OrderRecord & { userId?: string }).userId === ctx.customer?.id ||
          (o.customerEmail && o.customerEmail.toLowerCase() === ctx.customer?.email.toLowerCase()),
      );
      return {
        found: own.length > 0,
        orders: own.slice(0, 5).map((o) => ({
          orderNumber: o.orderNumber,
          status: o.status,
          totalPkr: o.totalPkr,
          createdAt: o.createdAt,
        })),
      };
    }

    return {
      found: false,
      requiresVerification: true,
      message: 'Please provide both your Order Number (e.g. AB-1042) and phone number so I can verify your order privately.',
    };
  }

  if (name === 'prepare_whatsapp_order') {
    if (ctx.cart.length === 0) {
      return {
        prepared: false,
        message: 'Your shopping bag is currently empty. Add at least one item before preparing a WhatsApp order.',
      };
    }
    const subtotal = ctx.cart.reduce((sum, i) => sum + i.pricePkr * i.quantity, 0);
    const coupon = typeof args.couponCode === 'string' ? ctx.evaluateCoupon(args.couponCode, subtotal) : null;
    const discountPkr = coupon?.valid ? coupon.discountPkr : 0;
    const afterDiscount = Math.max(0, subtotal - discountPkr);
    const freeShip =
      afterDiscount >= ctx.storeConfig.freeShippingThresholdPkr || Boolean(coupon?.valid && coupon.freeShipping);
    const shippingPkr = freeShip ? 0 : ctx.storeConfig.shippingFeePkr;
    const totalPkr = afterDiscount + shippingPkr;

    const itemLines = ctx.cart.map(
      (i, idx) => `${idx + 1}. ${i.name} (${i.volume}) x${i.quantity} — PKR ${(i.pricePkr * i.quantity).toLocaleString('en-PK')}`,
    );
    const lines = [
      'Hello! I want to order from Aurelia Botanica:',
      '',
      ...itemLines,
      '',
      `Subtotal: PKR ${subtotal.toLocaleString('en-PK')}`,
      discountPkr > 0 ? `Discount (${coupon?.code}): -PKR ${discountPkr.toLocaleString('en-PK')}` : null,
      `Shipping: ${shippingPkr === 0 ? 'FREE' : `PKR ${shippingPkr.toLocaleString('en-PK')}`}`,
      `Total Payable: PKR ${totalPkr.toLocaleString('en-PK')}`,
      args.customerName ? `Name: ${String(args.customerName)}` : null,
      `Delivery Address: ${typeof args.address === 'string' && args.address ? args.address : 'To be confirmed'}`,
    ].filter((l) => l !== null);

    const summaryText = lines.join('\n');
    const whatsappUrl = `https://wa.me/${ctx.storeConfig.whatsappNumber}?text=${encodeURIComponent(summaryText)}`;
    effects.whatsappDraft = {
      summaryText,
      whatsappUrl,
      totalPkr,
      requiresConfirmation: true,
    };

    return {
      prepared: true,
      totalPkr,
      requiresConfirmation: true,
      note: 'WhatsApp draft generated for customer review. Remind customer to confirm before sending.',
    };
  }

  if (name === 'build_personalized_routine') {
    const mapSlugs = (slugs: unknown, fallbackRole: string, defaultFreq: string) => {
      if (!Array.isArray(slugs)) return [];
      return slugs
        .map((s, idx) => {
          const prod = ctx.products.find((p) => p.slug === String(s));
          if (!prod) return null;
          if (!effects.recommendedSlugs.includes(prod.slug)) effects.recommendedSlugs.push(prod.slug);
          return {
            stepNumber: idx + 1,
            stepRole: prod.category || fallbackRole,
            productSlug: prod.slug,
            usageInstruction: prod.howToUse,
            frequency: defaultFreq,
          };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x));
    };

    const morningSkincare = mapSlugs(args.morningSlugs, 'Morning Step', 'Daily AM');
    const nightSkincare = mapSlugs(args.nightSlugs, 'Night Step', 'Daily PM');
    const weeklyHaircare = mapSlugs(args.haircareSlugs, 'Haircare Step', '2–3x Weekly');

    const uniqueSlugs = Array.from(
      new Set([...morningSkincare, ...nightSkincare, ...weeklyHaircare].map((s) => s.productSlug)),
    );
    const totalEstimatedPkr = uniqueSlugs.reduce((sum, slug) => {
      const p = ctx.products.find((item) => item.slug === slug);
      return sum + (p ? effectivePrice(p) : 0);
    }, 0);

    effects.routinePlan = {
      title: String(args.title || 'Personalized Aurelia Botanica Ritual'),
      summary: String(args.summary || 'Tailored botanical layering plan.'),
      safetyNote: String(
        args.safetyNote || 'Patch test new actives first and apply broad-spectrum SPF 50 every morning.',
      ),
      morningSkincare,
      nightSkincare,
      weeklyHaircare,
      totalEstimatedPkr,
    };

    return {
      built: true,
      title: effects.routinePlan.title,
      totalEstimatedPkr,
      stepsCount: morningSkincare.length + nightSkincare.length + weeklyHaircare.length,
    };
  }

  return { error: `Unknown tool: ${name}` };
}
