import { useMemo, useState } from 'react';
import { ArrowRight, Box, Camera, Mic, ShieldCheck, Sparkles, Star, Truck, RefreshCcw } from 'lucide-react';
import { motion } from 'motion/react';
import { BEAUTY_TIPS, INGREDIENT_LIBRARY, INITIAL_REVIEWS, STORE_IMAGES } from '../data/catalog';
import { useStore } from '../context/StoreContext';
import { ProductCard } from '../components/common/ProductCard';
import { SafeImage } from '../components/common/SafeImage';
import { BotanicalScene3D, type StudioBackdrop } from '../components/three/BotanicalScene3D';
import { BeautyAvatar3D } from '../components/ai/BeautyAvatar3D';

export function HomeView() {
  const { products, navigate, openAssistant, cmsContent, storeConfig } = useStore();
  const [collectionTab, setCollectionTab] = useState<'bestsellers' | 'new' | 'trending'>('bestsellers');
  const [selectedHeroSlug, setSelectedHeroSlug] = useState<string>('niacinamide-saffron-glow-serum');
  const [heroBackdropOverride, setHeroBackdropOverride] = useState<StudioBackdrop | null>(null);

  const heroProducts = useMemo(() => {
    const slugs = [
      cmsContent?.heroDefaultProductSlug || 'niacinamide-saffron-glow-serum',
      'olive-ceramide-velvet-cream',
      'botanical-calm-gel-cleanser',
    ];
    const resolved = slugs
      .map((slug) => products.find((p) => p.slug === slug))
      .filter((p): p is (typeof products)[number] => Boolean(p));
    if (resolved.length > 0) return resolved;
    return products.slice(0, 3);
  }, [products, cmsContent?.heroDefaultProductSlug]);

  const activeHeroProduct = useMemo(() => {
    return (
      products.find((p) => p.slug === selectedHeroSlug) ||
      products.find((p) => p.slug === cmsContent?.heroDefaultProductSlug) ||
      heroProducts[0]
    );
  }, [products, selectedHeroSlug, cmsContent?.heroDefaultProductSlug, heroProducts]);

  const heroBackdrop: StudioBackdrop =
    heroBackdropOverride ||
    activeHeroProduct?.modelConfig?.backdrop ||
    cmsContent?.heroDefaultBackdrop ||
    'sage';

  const featuredProducts = useMemo(() => {
    if (collectionTab === 'new') {
      return products.filter((p) => p.isNewArrival).slice(0, 6);
    }
    if (collectionTab === 'trending') {
      return products.filter((p) => p.isTrending).slice(0, 6);
    }
    const homeFeatured = products.filter((p) => p.isFeaturedHome || p.isBestSeller);
    return (homeFeatured.length > 0 ? homeFeatured : products).slice(0, 6);
  }, [products, collectionTab]);

  const highlightedReviews = useMemo(() => {
    const liveApproved = products.flatMap((p) =>
      (p.reviews || [])
        .filter((r) => !r.status || r.status === 'approved')
        .map((rev) => ({
          ...rev,
          productName: p.name,
          slug: p.slug,
        })),
    );
    if (liveApproved.length > 0) return liveApproved;
    return Object.entries(INITIAL_REVIEWS).flatMap(([slug, list]) =>
      list.map((rev) => ({
        ...rev,
        productName: products.find((p) => p.slug === slug)?.name || 'Aurelia Formula',
        slug,
      })),
    );
  }, [products]);

  const blogArticles = cmsContent?.blogArticles?.length ? cmsContent.blogArticles : BEAUTY_TIPS;

  return (
    <div className="space-y-20 pb-8">
      {(cmsContent?.promoBannerEnabled ?? storeConfig.promoBannerActive) &&
        (cmsContent?.promoBannerText || storeConfig.promoBannerText) && (
          <div className="bg-[#1C3B2B] text-[#FAF6EE] text-center py-2 px-4 text-xs font-medium tracking-wide">
            {cmsContent?.promoBannerText || storeConfig.promoBannerText}
          </div>
        )}

      {/* 1. Cinematic Split Hero with Interactive 3D Centerpiece */}
      <section className="relative overflow-hidden border-b border-[#232620]/10 bg-gradient-to-b from-[#FAF6EE] via-[#FAF6EE] to-[#F1EAE0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-6 min-w-0 flex flex-col justify-center space-y-6"
          >
            <div className="flex items-center gap-2 text-xs font-medium text-[#4A5D3F]">
              <span>{cmsContent?.heroEyebrow || 'Botanical Skincare & Haircare · Crafted for Pakistan Climates'}</span>
            </div>

            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-semibold text-[#232620] leading-[1.06] tracking-tight">
              {cmsContent?.heroTitle || 'Quiet Luxury Rituals for Skin & Scalp'}
            </h1>

            <p className="text-base sm:text-lg text-[#5C6156] max-w-xl leading-relaxed">
              {cmsContent?.heroSubtitle ||
                'Cold-pressed botanical oils, barrier-loving ceramides, and clinical-grade actives in small batches—paired with 3D vessel inspection, an AI Beauty Consultant, and effortless WhatsApp or Cash on Delivery checkout.'}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => navigate({ name: 'skincare' })}
                className="px-6 py-3 rounded-lg bg-[#4A5D3F] hover:bg-[#3A4A31] text-[#FDFBF7] text-sm font-medium whitespace-nowrap transition-colors"
              >
                {cmsContent?.heroPrimaryCta || 'Shop Skincare'}
              </button>
              <button
                type="button"
                onClick={() => navigate({ name: 'haircare' })}
                className="px-6 py-3 rounded-lg bg-[#FDFBF7] hover:bg-[#F1EAE0] border border-[#232620]/20 text-[#232620] text-sm font-medium whitespace-nowrap transition-colors"
              >
                {cmsContent?.heroSecondaryCta || 'Shop Haircare'}
              </button>
              <button
                type="button"
                onClick={() => openAssistant({ mode: 'chat' })}
                className="inline-flex items-center gap-2 px-4 py-3 text-sm font-medium text-[#4A5D3F] hover:text-[#232620] whitespace-nowrap transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                <span>Ask AI Beauty Expert</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="pt-6 border-t border-[#232620]/10 grid grid-cols-3 gap-2 sm:gap-4 max-w-lg">
              <div className="min-w-0">
                <p className="font-mono text-sm sm:text-lg font-medium text-[#232620] tabular-nums truncate">{products.length}</p>
                <p className="text-[11px] sm:text-xs text-[#5C6156]">Targeted Formulas</p>
              </div>
              <div className="min-w-0">
                <p className="font-mono text-sm sm:text-lg font-medium text-[#232620] tabular-nums truncate">
                  PKR {storeConfig.freeShippingThresholdPkr.toLocaleString('en-PK')}+
                </p>
                <p className="text-[11px] sm:text-xs text-[#5C6156]">Free Courier</p>
              </div>
              <div className="min-w-0">
                <p className="font-mono text-sm sm:text-lg font-medium text-[#232620] tabular-nums truncate">24/7 AI</p>
                <p className="text-[11px] sm:text-xs text-[#5C6156]">Beauty Consultant</p>
              </div>
            </div>
          </motion.div>

          <div className="lg:col-span-6 min-w-0 flex flex-col gap-4">
            <div className="relative h-[380px] sm:h-[440px] lg:h-full min-h-[400px] rounded-2xl bg-[#BAC7B6] border border-[#232620]/10 overflow-hidden">
              <BotanicalScene3D
                silhouette={activeHeroProduct?.modelSilhouette || 'dropper'}
                finish={activeHeroProduct?.defaultFinish || 'emerald'}
                productLabel={activeHeroProduct?.name || 'Niacinamide Saffron Serum'}
                volumeLabel={activeHeroProduct?.volume || '30 ml'}
                modelConfig={activeHeroProduct?.modelConfig}
                backdrop={heroBackdrop}
                fallbackImage={activeHeroProduct?.images?.[0] || cmsContent?.heroImage || STORE_IMAGES.hero}
                autoRotate
                interactive
              />

              <div className="absolute top-4 left-4 right-4 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
                <div className="pointer-events-auto inline-flex items-center gap-2.5 bg-[#FAF6EE]/95 px-3 py-1.5 rounded-lg border border-[#232620]/10">
                  <span className="text-xs font-medium text-[#232620]">
                    Interactive 3D · Drag to Orbit
                  </span>
                  <span className="h-3 w-px bg-[#232620]/15" aria-hidden="true" />
                  <div className="inline-flex items-center gap-1" role="group" aria-label="3D Studio Background">
                    {(
                      [
                        { id: 'sage', label: 'Sage Studio', hex: '#B9C7B4' },
                        { id: 'blush', label: 'Silk Blush', hex: '#DEC4BB' },
                        { id: 'linen', label: 'Warm Linen', hex: '#DDD2C0' },
                        { id: 'obsidian', label: 'Dark Studio', hex: '#1E231B' },
                      ] as const
                    ).map((bg) => (
                      <button
                        key={bg.id}
                        type="button"
                        onClick={() => setHeroBackdropOverride(bg.id)}
                        title={bg.label}
                        aria-label={`Set 3D background to ${bg.label}`}
                        aria-pressed={heroBackdrop === bg.id}
                        className={`w-3.5 h-3.5 rounded-full border transition-transform ${
                          heroBackdrop === bg.id
                            ? 'border-[#232620] ring-1 ring-[#C5A059] scale-110'
                            : 'border-[#232620]/25 hover:scale-105'
                        }`}
                        style={{ backgroundColor: bg.hex }}
                      />
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate({ name: 'atelier', slug: activeHeroProduct?.slug })}
                  className="pointer-events-auto inline-flex items-center gap-1.5 bg-[#FAF6EE]/95 hover:bg-[#FDFBF7] px-3 py-1.5 rounded-lg border border-[#232620]/15 text-xs font-medium text-[#4A5D3F] transition-colors"
                >
                  <Box className="w-3.5 h-3.5" />
                  <span>Open 3D Atelier</span>
                </button>
              </div>

              <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-2 bg-[#FAF6EE]/92 p-2.5 rounded-xl border border-[#232620]/10">
                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  {heroProducts.map((hp) => (
                    <button
                      key={hp.id}
                      type="button"
                      onClick={() => setSelectedHeroSlug(hp.slug)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        activeHeroProduct?.slug === hp.slug
                          ? 'bg-[#4A5D3F] text-[#FDFBF7]'
                          : 'text-[#5C6156] hover:bg-[#F1EAE0]'
                      }`}
                    >
                      {hp.name.split(' ').slice(0, 2).join(' ')}
                    </button>
                  ))}
                </div>

                {activeHeroProduct && (
                  <button
                    type="button"
                    onClick={() => navigate({ name: 'product', slug: activeHeroProduct.slug })}
                    className="text-xs font-medium text-[#4A5D3F] hover:underline px-2 whitespace-nowrap"
                  >
                    Inspect Formula →
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 1B. AI Beauty Expert Spotlight & Quick-Launch Studio Cards */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="rounded-2xl bg-gradient-to-r from-[#FAF7F2] via-[#F1E9DF] to-[#F7ECEA] border border-[#D6BD9B]/55 p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-3 flex flex-col items-center">
            <div className="relative w-44 h-44 flex items-center justify-center">
              <div
                aria-hidden="true"
                className="absolute inset-1 rounded-full bg-gradient-to-tr from-[#D8AAA5]/45 via-[#D6BD9B]/45 to-[#FAF7F2] blur-[2px]"
              />
              <div className="relative w-40 h-40 rounded-full bg-gradient-to-b from-[#FAF7F2] to-[#F1E9DF] border border-[#D6BD9B] shadow-lg overflow-hidden">
                <BeautyAvatar3D state="idle" variant="showcase" />
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 min-w-0 space-y-3">
            <div className="flex items-center gap-2 text-xs font-medium text-[#40332E]/70">
              <span>Aurelia Personal AI Consultant</span>
              <span aria-hidden="true">·</span>
              <span>English · اردو · Roman Urdu</span>
            </div>
            <h2 className="font-display text-3xl font-semibold text-[#40332E]">
              Your Personal Beauty Assistant
            </h2>
            <p className="text-sm text-[#40332E]/75 leading-relaxed">
              Ask in text or voice about acne, pigmentation, hair fall, or frizz. Upload a facial or scalp photo with consent for cosmetic observations, compare catalog items, or prepare a WhatsApp order.
            </p>
            <div className="flex flex-wrap gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => openAssistant({ mode: 'chat' })}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#40332E] hover:bg-[#2F2521] text-[#FFFFFF] text-xs font-semibold transition-colors"
              >
                <Sparkles className="w-4 h-4 text-[#D6BD9B]" />
                Ask AI Skin Consultant
              </button>
              <button
                type="button"
                onClick={() => openAssistant({ mode: 'skin' })}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#FFFFFF] border border-[#D6BD9B]/70 hover:bg-[#F1E9DF] text-[#40332E] text-xs font-medium transition-colors"
              >
                <Camera className="w-3.5 h-3.5 text-[#40332E]" />
                Quick Photo Scan
              </button>
              <button
                type="button"
                onClick={() => openAssistant({ mode: 'chat', prompt: 'Meri skin oily hai aur mujhe acne ka issue hai. Mujhe best formulas suggest karein.' })}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#FFFFFF] border border-[#D6BD9B]/70 hover:bg-[#F1E9DF] text-[#40332E] text-xs font-medium transition-colors"
              >
                <Mic className="w-3.5 h-3.5 text-[#40332E]" />
                Try Roman Urdu
              </button>
            </div>
          </div>

          <div className="lg:col-span-4 grid grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 rounded-xl bg-[#FDFBF7]/90 border border-[#232620]/10 space-y-1">
              <ShieldCheck className="w-4 h-4 text-[#4A5D3F]" />
              <p className="font-semibold text-[#232620]">Transparent Actives</p>
              <p className="text-[11px] text-[#5C6156]">Full INCI &amp; safety guides</p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#FDFBF7]/90 border border-[#232620]/10 space-y-1">
              <Truck className="w-4 h-4 text-[#4A5D3F]" />
              <p className="font-semibold text-[#232620]">Cash on Delivery</p>
              <p className="text-[11px] text-[#5C6156]">Nationwide Pakistan courier</p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#FDFBF7]/90 border border-[#232620]/10 space-y-1">
              <RefreshCcw className="w-4 h-4 text-[#4A5D3F]" />
              <p className="font-semibold text-[#232620]">Easy Return Policy</p>
              <p className="text-[11px] text-[#5C6156]">14-day unopened exchanges</p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#FDFBF7]/90 border border-[#232620]/10 space-y-1">
              <Sparkles className="w-4 h-4 text-[#C5A059]" />
              <p className="font-semibold text-[#232620]">24/7 AI Guidance</p>
              <p className="text-[11px] text-[#5C6156]">Instant skincare &amp; hair advice</p>
            </div>
          </div>
        </div>

        {/* 3 Visual Quick-Launch Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="rounded-2xl bg-[#EFE2DC]/55 border border-[#232620]/10 p-6 flex items-center justify-between gap-4">
            <div className="space-y-2">
              <h3 className="font-display text-2xl font-semibold text-[#232620]">Skin Type Quiz</h3>
              <p className="text-xs text-[#5C6156]">Know your skin profile in 6 steps</p>
              <button
                type="button"
                onClick={() => navigate({ name: 'quiz' })}
                className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#FDFBF7] border border-[#232620]/15 hover:border-[#4A5D3F] text-xs font-semibold text-[#232620]"
              >
                Take Quiz <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0 border border-[#232620]/10">
              <SafeImage src={STORE_IMAGES.cleanser} alt="Skin Type Quiz" className="w-full h-full object-cover" />
            </div>
          </div>

          <div className="rounded-2xl bg-[#E7ECE2] border border-[#232620]/10 p-6 flex items-center justify-between gap-4">
            <div className="space-y-2">
              <h3 className="font-display text-2xl font-semibold text-[#232620]">AI Skin &amp; Hair Analyzer</h3>
              <p className="text-xs text-[#5C6156]">Get your cosmetic visual report</p>
              <button
                type="button"
                onClick={() => navigate({ name: 'ai-studio', tab: 'skin' })}
                className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#FDFBF7] border border-[#232620]/15 hover:border-[#4A5D3F] text-xs font-semibold text-[#232620]"
              >
                Upload Photo <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0 border border-[#232620]/10">
              <SafeImage src={STORE_IMAGES.serum} alt="AI Photo Analyzer" className="w-full h-full object-cover" />
            </div>
          </div>

          <div className="rounded-2xl bg-[#F1EAE0] border border-[#232620]/10 p-6 flex items-center justify-between gap-4">
            <div className="space-y-2">
              <h3 className="font-display text-2xl font-semibold text-[#232620]">Build My Routine</h3>
              <p className="text-xs text-[#5C6156]">Morning, Night &amp; Haircare steps</p>
              <button
                type="button"
                onClick={() => navigate({ name: 'ai-studio', tab: 'routine' })}
                className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#FDFBF7] border border-[#232620]/15 hover:border-[#4A5D3F] text-xs font-semibold text-[#232620]"
              >
                Start Now <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0 border border-[#232620]/10">
              <SafeImage src={STORE_IMAGES.haircare} alt="Build My Routine" className="w-full h-full object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* 2. Featured Collection Grid with Interactive Segmented Tabs */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#232620]/10 pb-5">
          <div>
            <p className="text-xs font-medium text-[#4A5D3F]">Curated Apothecary Edit</p>
            <h2 className="font-display text-3xl sm:text-4xl font-semibold text-[#232620] mt-1">
              Signature Botanical Formulations
            </h2>
          </div>

          <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-[#F1EAE0] rounded-lg self-start max-w-full">
            <button
              type="button"
              onClick={() => setCollectionTab('bestsellers')}
              className={`px-3.5 py-2 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                collectionTab === 'bestsellers'
                  ? 'bg-[#FDFBF7] text-[#232620] shadow-xs'
                  : 'text-[#5C6156] hover:text-[#232620]'
              }`}
            >
              Best Sellers
            </button>
            <button
              type="button"
              onClick={() => setCollectionTab('new')}
              className={`px-3.5 py-2 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                collectionTab === 'new'
                  ? 'bg-[#FDFBF7] text-[#232620] shadow-xs'
                  : 'text-[#5C6156] hover:text-[#232620]'
              }`}
            >
              New Arrivals
            </button>
            <button
              type="button"
              onClick={() => setCollectionTab('trending')}
              className={`px-3.5 py-2 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                collectionTab === 'trending'
                  ? 'bg-[#FDFBF7] text-[#232620] shadow-xs'
                  : 'text-[#5C6156] hover:text-[#232620]'
              }`}
            >
              Trending Now
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {featuredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <button
            type="button"
            onClick={() => navigate({ name: 'skincare' })}
            className="px-5 py-2.5 rounded-lg border border-[#232620]/20 bg-[#FDFBF7] hover:bg-[#F1EAE0] text-sm font-medium text-[#232620] transition-colors"
          >
            Browse All Skincare ({products.filter((p) => p.department === 'skincare').length})
          </button>
          <button
            type="button"
            onClick={() => navigate({ name: 'haircare' })}
            className="px-5 py-2.5 rounded-lg border border-[#232620]/20 bg-[#FDFBF7] hover:bg-[#F1EAE0] text-sm font-medium text-[#232620] transition-colors"
          >
            Browse All Haircare ({products.filter((p) => p.department === 'haircare').length})
          </button>
        </div>
      </section>

      {/* 3. Two-Department Editorial Spotlight & Smart Skin Quiz */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-7 relative rounded-2xl overflow-hidden bg-[#F1EAE0] border border-[#232620]/10 min-h-[340px]">
            <SafeImage
              src={cmsContent?.heroImage || STORE_IMAGES.hero}
              alt="Aurelia Botanica amber glass skincare and haircare ritual"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#232620]/80 via-[#232620]/30 to-transparent flex flex-col justify-end p-8 text-[#FAF6EE]">
              <p className="text-xs font-medium text-[#C5A059]">Dual-Ritual Philosophy</p>
              <h2 className="font-display text-3xl sm:text-4xl font-semibold mt-1">
                {cmsContent?.editorialTitle || 'From Barrier Serums to Rosemary Scalp Elixirs'}
              </h2>
              <p className="text-sm text-[#FAF6EE]/85 mt-2 max-w-lg">
                {cmsContent?.editorialBody ||
                  'Every bottle is formulated without harsh sulfates or heavy silicones—calibrated for Pakistan’s sun, urban dust, and seasonal humidity shifts.'}
              </p>
              <div className="flex flex-wrap gap-3 mt-5">
                <button
                  type="button"
                  onClick={() => navigate({ name: 'haircare' })}
                  className="px-4 py-2.5 rounded-lg bg-[#FAF6EE] text-[#232620] text-xs font-semibold hover:bg-[#F1EAE0] transition-colors"
                >
                  Explore Haircare Rituals
                </button>
                <button
                  type="button"
                  onClick={() => navigate({ name: 'ingredients' })}
                  className="px-4 py-2.5 rounded-lg border border-white/40 text-white text-xs font-medium hover:bg-white/10 transition-colors"
                >
                  Read Ingredient Library
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 rounded-2xl bg-[#EFE2DC]/65 border border-[#232620]/10 p-8 flex flex-col justify-between">
            <div className="space-y-4">
              <p className="text-xs font-medium text-[#4A5D3F]">Personalized Regimen</p>
              <h2 className="font-display text-3xl font-semibold text-[#232620]">
                Unsure where to begin? Take our 6-step Skin Quiz.
              </h2>
              <p className="text-sm text-[#5C6156] leading-relaxed">
                Answer six focused questions about oil balance, breakouts, sensitivity, and texture to generate a morning and evening routine mapped directly to our botanical catalog.
              </p>
              <ul className="space-y-2 text-xs text-[#232620] pt-2">
                <li>01. Identify your primary skin profile and reactivity</li>
                <li>02. Receive tailored Morning &amp; Night layering order</li>
                <li>03. Save your routine or add every step in one click</li>
              </ul>
            </div>

            <div className="pt-6">
              <button
                type="button"
                onClick={() => navigate({ name: 'quiz' })}
                className="w-full py-3.5 px-5 rounded-lg bg-[#4A5D3F] hover:bg-[#3A4A31] text-[#FDFBF7] text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
              >
                <span>Start Smart Skin Quiz</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Featured Botanical Ingredients Strip */}
      <section className="bg-[#F1EAE0] border-y border-[#232620]/10 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-[#4A5D3F]">Ingredient Transparency</p>
              <h2 className="font-display text-3xl font-semibold text-[#232620] mt-1">
                Active Botanicals Explained Simply
              </h2>
            </div>
            <button
              type="button"
              onClick={() => navigate({ name: 'ingredients' })}
              className="text-sm font-medium text-[#4A5D3F] hover:underline self-start sm:self-auto"
            >
              Explore all {INGREDIENT_LIBRARY.length} ingredients →
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {INGREDIENT_LIBRARY.slice(0, 4).map((ing) => (
              <button
                key={ing.id}
                type="button"
                onClick={() => navigate({ name: 'ingredients', ingredientId: ing.id })}
                className="text-left p-5 rounded-xl bg-[#FDFBF7] border border-[#232620]/10 hover:border-[#4A5D3F]/40 transition-colors flex flex-col justify-between gap-3"
              >
                <div>
                  <p className="text-xs text-[#5C6156]">{ing.categoryLabel}</p>
                  <h3 className="font-display text-2xl font-semibold text-[#232620] mt-1">{ing.name}</h3>
                  <p className="text-xs text-[#5C6156] mt-2 leading-relaxed line-clamp-3">{ing.summary}</p>
                </div>
                <span className="text-xs font-medium text-[#4A5D3F]">View safety &amp; formulas →</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Verified Customer Reviews & Editorial Beauty Tips */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-14">
        <div className="space-y-6">
          <div>
            <p className="text-xs font-medium text-[#4A5D3F]">Community Notes</p>
            <h2 className="font-display text-3xl font-semibold text-[#232620] mt-1">
              Real Experiences Across Pakistan
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {highlightedReviews.slice(0, 4).map((rev) => (
              <div
                key={rev.id}
                className="p-5 rounded-xl bg-[#FDFBF7] border border-[#232620]/10 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center gap-0.5 text-[#C5A059]" aria-label={`${rev.rating} out of 5 stars`}>
                    {Array.from({ length: rev.rating }).map((_, idx) => (
                      <Star key={idx} className="w-3.5 h-3.5 fill-current" />
                    ))}
                  </div>
                  <p className="text-sm font-semibold text-[#232620]">{rev.title}</p>
                  <p className="text-xs text-[#5C6156] leading-relaxed">“{rev.comment}”</p>
                </div>

                <div className="pt-3 border-t border-[#232620]/8">
                  <p className="text-xs font-medium text-[#232620]">
                    {rev.authorName} · {rev.city}
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate({ name: 'product', slug: rev.slug })}
                    className="text-[11px] text-[#4A5D3F] hover:underline mt-0.5 text-left"
                  >
                    {rev.productName}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <p className="text-xs font-medium text-[#4A5D3F]">Aurelia Journal</p>
            <h2 className="font-display text-3xl font-semibold text-[#232620] mt-1">
              Seasonal Care &amp; Layering Guides
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {blogArticles.map((tip) => (
              <article
                key={tip.id}
                className="rounded-xl bg-[#FDFBF7] border border-[#232620]/10 overflow-hidden flex flex-col"
              >
                <div className="aspect-[4/3] bg-[#F1EAE0]">
                  <SafeImage src={tip.image} alt={tip.title} className="w-full h-full object-cover" />
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-[#5C6156]">
                      <span>{tip.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>{tip.readTime}</span>
                    </div>
                    <h3 className="font-display text-2xl font-semibold text-[#232620] mt-1">{tip.title}</h3>
                    <p className="text-xs text-[#5C6156] mt-2 leading-relaxed">{tip.summary}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate({ name: 'product', slug: tip.relatedSlug })}
                    className="text-xs font-medium text-[#4A5D3F] hover:underline text-left"
                  >
                    Explore featured formula →
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
