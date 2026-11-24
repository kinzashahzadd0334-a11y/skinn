import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Check,
  Heart,
  MessageCircle,
  Minus,
  Play,
  Plus,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Star,
  ZoomIn,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { ProductCard } from '../components/common/ProductCard';
import { SafeImage } from '../components/common/SafeImage';
import { BotanicalScene3D } from '../components/three/BotanicalScene3D';
import {
  buildSingleProductWhatsAppUrl,
  formatPkr,
  getDiscountPercent,
  getEffectivePrice,
} from '../utils/commerce';
import { useResolvedMediaUrl } from '../db/mediaResolver';
import { addCustomerReviewLocal } from '../db/localDatabase';

interface ProductDetailViewProps {
  slug: string;
}

export function ProductDetailView({ slug }: ProductDetailViewProps) {
  const {
    products,
    navigate,
    addToCart,
    wishlistIds,
    toggleWishlist,
    recordRecentlyViewed,
    storeConfig,
    refreshProducts,
    openAssistant,
    showToast,
  } = useStore();

  const product = useMemo(() => products.find((p) => p.slug === slug), [products, slug]);
  const [activeMedia, setActiveMedia] = useState<'image' | '3d' | 'video'>('image');
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [quantity, setQuantity] = useState(1);

  // Review form state
  const [reviewName, setReviewName] = useState('');
  const [reviewCity, setReviewCity] = useState('Lahore');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const resolvedVideoUrl = useResolvedMediaUrl(product?.videoUrl);

  useEffect(() => {
    setActiveImageIdx(0);
    setActiveMedia('image');
    setZoomed(false);
    setQuantity(1);
    if (slug) {
      recordRecentlyViewed(slug);
    }
  }, [slug, recordRecentlyViewed]);

  if (!product) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center space-y-4">
        <h1 className="font-display text-3xl font-semibold text-[#232620]">Formula not found</h1>
        <p className="text-sm text-[#5C6156]">The product you requested may have moved or is no longer listed.</p>
        <button
          type="button"
          onClick={() => navigate({ name: 'skincare' })}
          className="px-5 py-2.5 rounded-lg bg-[#4A5D3F] text-[#FDFBF7] text-sm font-medium"
        >
          Return to Shop
        </button>
      </div>
    );
  }

  const effectivePrice = getEffectivePrice(product.pricePkr, product.discountPricePkr);
  const discountPct = getDiscountPercent(product.pricePkr, product.discountPricePkr);
  const isWished = wishlistIds.includes(product.id);
  const reviews = product.reviews || [];

  const relatedProducts = products
    .filter((p) => p.id !== product.id && (p.department === product.department || p.category === product.category))
    .slice(0, 3);

  const whatsappUrl = buildSingleProductWhatsAppUrl({
    whatsappNumber: storeConfig.whatsappNumber,
    productName: product.name,
    volume: product.volume,
    quantity,
    unitPricePkr: effectivePrice,
  });

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewName.trim() || !reviewComment.trim()) {
      showToast('Please enter your name and review comment.');
      return;
    }
    setSubmittingReview(true);
    try {
      const created = await addCustomerReviewLocal(product.slug, {
        authorName: reviewName,
        city: reviewCity,
        rating: reviewRating,
        title: reviewTitle,
        comment: reviewComment,
      });
      if (!created) {
        throw new Error('Could not submit review.');
      }
      setReviewName('');
      setReviewTitle('');
      setReviewComment('');
      await refreshProducts();
      showToast('Thank you! Your review has been saved locally and published.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not publish review.');
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-16">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-[#5C6156]" aria-label="Breadcrumb">
        <button type="button" onClick={() => navigate({ name: 'home' })} className="hover:underline">
          Home
        </button>
        <span aria-hidden="true">/</span>
        <button
          type="button"
          onClick={() => navigate({ name: product.department })}
          className="hover:underline capitalize"
        >
          {product.department}
        </button>
        <span aria-hidden="true">/</span>
        <button
          type="button"
          onClick={() => navigate({ name: product.department, category: product.category })}
          className="hover:underline"
        >
          {product.category}
        </button>
        <span aria-hidden="true">/</span>
        <span className="text-[#232620] font-medium truncate">{product.name}</span>
      </nav>

      {/* Main Split Gallery + Contiguous Purchase Module */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left Gallery */}
        <div className="lg:col-span-6 space-y-4 lg:sticky lg:top-24">
          <div className="relative aspect-[4/3] rounded-2xl bg-[#BAC7B6] border border-[#232620]/10 overflow-hidden">
            {activeMedia === '3d' ? (
              <BotanicalScene3D
                silhouette={product.modelSilhouette}
                finish={product.defaultFinish}
                productLabel={product.name}
                volumeLabel={product.volume}
                modelConfig={product.modelConfig}
                backdrop={product.modelConfig?.backdrop || 'sage'}
                fallbackImage={product.images[0]}
                interactive
                autoRotate
              />
            ) : activeMedia === 'video' && product.videoUrl ? (
              resolvedVideoUrl ? (
                <video
                  src={resolvedVideoUrl}
                  controls
                  playsInline
                  className="w-full h-full object-cover bg-[#141712]"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#141712] text-[#FAF6EE]/80 text-xs">
                  Loading product video…
                </div>
              )
            ) : (
              <button
                type="button"
                onClick={() => setZoomed((z) => !z)}
                aria-label={zoomed ? 'Zoom out product photo' : 'Zoom in product photo'}
                className="w-full h-full block overflow-hidden"
              >
                <SafeImage
                  src={product.images[activeImageIdx] || product.images[0]}
                  alt={product.name}
                  className={`w-full h-full object-cover transition-transform duration-300 ${
                    zoomed ? 'scale-150 cursor-zoom-out' : 'scale-100 cursor-zoom-in'
                  }`}
                />
              </button>
            )}

            <div className="absolute top-3 right-3 flex items-center gap-2">
              {activeMedia === 'image' && (
                <button
                  type="button"
                  onClick={() => setZoomed((z) => !z)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAF6EE]/92 border border-[#232620]/15 text-xs font-medium text-[#232620]"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                  <span>{zoomed ? 'Reset Zoom' : 'Zoom'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveMedia((m) => (m === '3d' ? 'image' : '3d'))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#4A5D3F] text-[#FDFBF7] text-xs font-medium"
              >
                <Box className="w-3.5 h-3.5" />
                <span>{activeMedia === '3d' ? 'Photo View' : '3D Bottle'}</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 overflow-x-auto pb-1">
            {product.images.map((img, idx) => (
              <button
                key={`${img}-${idx}`}
                type="button"
                onClick={() => {
                  setActiveMedia('image');
                  setActiveImageIdx(idx);
                }}
                className={`w-20 h-16 rounded-lg overflow-hidden border shrink-0 transition-colors ${
                  activeMedia === 'image' && activeImageIdx === idx
                    ? 'border-[#4A5D3F] ring-2 ring-[#4A5D3F]/30'
                    : 'border-[#232620]/15'
                }`}
              >
                <SafeImage src={img} alt={`${product.name} view ${idx + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
            {product.videoUrl && (
              <button
                type="button"
                onClick={() => setActiveMedia('video')}
                className={`px-4 h-16 rounded-lg border text-xs font-medium shrink-0 flex items-center gap-1.5 ${
                  activeMedia === 'video'
                    ? 'border-[#4A5D3F] bg-[#4A5D3F]/10 text-[#4A5D3F]'
                    : 'border-[#232620]/15 bg-[#FDFBF7] text-[#232620]'
                }`}
              >
                <Play className="w-4 h-4" />
                <span>Product Video</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveMedia('3d')}
              className={`px-4 h-16 rounded-lg border text-xs font-medium shrink-0 flex items-center gap-1.5 ${
                activeMedia === '3d'
                  ? 'border-[#4A5D3F] bg-[#4A5D3F]/10 text-[#4A5D3F]'
                  : 'border-[#232620]/15 bg-[#FDFBF7] text-[#232620]'
              }`}
            >
              <Box className="w-4 h-4" />
              <span>3D Spin</span>
            </button>
          </div>
        </div>

        {/* Right Contiguous Purchase Module */}
        <div className="lg:col-span-6 space-y-6">
          <div className="space-y-2 border-b border-[#232620]/10 pb-5">
            <div className="flex items-center gap-2 text-xs text-[#4A5D3F] font-medium">
              <span>{product.brandLine}</span>
              <span aria-hidden="true">·</span>
              <span>{product.volume}</span>
              <span aria-hidden="true">·</span>
              <span>{product.routineTime}</span>
            </div>

            <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[#232620]">{product.name}</h1>
            <p className="text-sm text-[#5C6156]">{product.subtitle}</p>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-2xl font-semibold text-[#232620] tabular-nums">
                  {formatPkr(effectivePrice)}
                </span>
                {discountPct && (
                  <>
                    <span className="font-mono text-sm text-[#5C6156] line-through tabular-nums">
                      {formatPkr(product.pricePkr)}
                    </span>
                    <span className="text-xs font-medium text-[#4A5D3F]">Save {discountPct}%</span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-1.5 text-xs">
                <Star className="w-4 h-4 fill-[#C5A059] text-[#C5A059]" />
                <span className="font-semibold text-[#232620] tabular-nums">{product.rating.toFixed(1)}</span>
                <span className="text-[#5C6156] tabular-nums">({product.reviewCount} reviews)</span>
              </div>
            </div>
          </div>

          <p className="text-sm text-[#232620] leading-relaxed">{product.description}</p>

          <div className="space-y-2 text-xs text-[#5C6156]">
            <p>
              <strong className="text-[#232620]">Suitable For:</strong> {product.suitableTypes.join(' · ')}
            </p>
            <p>
              <strong className="text-[#232620]">Availability:</strong>{' '}
              {product.stock > 5 ? `In Stock (${product.stock} units ready)` : product.stock > 0 ? `Low Stock (${product.stock} remaining)` : 'Currently Out of Stock'}
            </p>
          </div>

          {/* Quantity + Primary Actions */}
          <div className="space-y-3 p-5 rounded-xl bg-[#FDFBF7] border border-[#232620]/10">
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center border border-[#232620]/15 rounded-lg bg-[#FAF6EE]">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  aria-label="Decrease quantity"
                  className="w-10 h-11 flex items-center justify-center text-[#232620] hover:bg-[#F1EAE0]"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-10 text-center font-mono text-sm tabular-nums">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(Math.max(1, product.stock), q + 1))}
                  aria-label="Increase quantity"
                  className="w-10 h-11 flex items-center justify-center text-[#232620] hover:bg-[#F1EAE0]"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                disabled={product.stock <= 0}
                onClick={() => addToCart(product, quantity, true)}
                className="flex-1 h-11 px-5 rounded-lg bg-[#4A5D3F] hover:bg-[#3A4A31] disabled:bg-[#5C6156]/40 text-[#FDFBF7] text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>{product.stock > 0 ? 'Add to Bag' : 'Out of Stock'}</span>
              </button>

              <button
                type="button"
                onClick={() => toggleWishlist(product.id)}
                aria-label={isWished ? 'Remove from wishlist' : 'Save to wishlist'}
                className="w-11 h-11 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] hover:bg-[#F1EAE0] flex items-center justify-center"
              >
                <Heart className={`w-4 h-4 ${isWished ? 'fill-[#4A5D3F] text-[#4A5D3F]' : 'text-[#232620]'}`} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={product.stock <= 0}
                onClick={() => {
                  addToCart(product, quantity, false);
                  navigate({ name: 'checkout' });
                }}
                className="h-11 px-4 rounded-lg border border-[#232620]/20 bg-[#FAF6EE] hover:bg-[#F1EAE0] text-sm font-medium text-[#232620] transition-colors"
              >
                Buy Now (COD Checkout)
              </button>

              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-11 px-4 rounded-lg border border-[#4A5D3F]/30 bg-[#FAF6EE] hover:bg-[#F1EAE0] text-sm font-medium text-[#4A5D3F] inline-flex items-center justify-center gap-2 transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Order via WhatsApp</span>
              </a>
            </div>

            <button
              type="button"
              onClick={() =>
                openAssistant({
                  mode: 'chat',
                  prompt: `Tell me whether "${product.name}" (${product.slug}) fits my skin/hair goals, how to layer it safely, and what pairs well with it.`,
                })
              }
              className="w-full h-10 px-4 rounded-lg bg-[#F1EAE0] hover:bg-[#E7DEC9] text-xs font-semibold text-[#232620] inline-flex items-center justify-center gap-2 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#4A5D3F]" />
              <span>Ask AI Beauty Expert About This Formula</span>
            </button>
          </div>

          {/* Benefits, Usage & Ingredients */}
          <div className="space-y-6 pt-2">
            <div>
              <h2 className="font-display text-2xl font-semibold text-[#232620] mb-2.5">Key Benefits</h2>
              <ul className="space-y-2">
                {product.benefits.map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-sm text-[#232620]">
                    <Check className="w-4 h-4 text-[#4A5D3F] shrink-0 mt-0.5" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-5 rounded-xl bg-[#F1EAE0]/75 border border-[#232620]/10 space-y-2">
              <h2 className="font-display text-xl font-semibold text-[#232620]">
                How to Use · {product.routineTime}
              </h2>
              <p className="text-sm text-[#232620] leading-relaxed">{product.howToUse}</p>
            </div>

            <div className="space-y-3">
              <h2 className="font-display text-2xl font-semibold text-[#232620]">Active Ingredient Spotlight</h2>
              <div className="space-y-2.5">
                {product.ingredientNotes.map((note) => (
                  <div key={note.name} className="p-3.5 rounded-lg bg-[#FDFBF7] border border-[#232620]/10">
                    <p className="text-xs font-semibold text-[#4A5D3F]">{note.name}</p>
                    <p className="text-xs text-[#5C6156] mt-0.5">{note.role}</p>
                  </div>
                ))}
              </div>
              <details className="p-4 rounded-lg bg-[#FDFBF7] border border-[#232620]/10 text-xs text-[#5C6156]">
                <summary className="font-semibold text-[#232620] cursor-pointer">Full INCI Ingredient List</summary>
                <p className="mt-2 leading-relaxed">{product.fullIngredientList}</p>
              </details>
            </div>

            <div className="p-4 rounded-lg bg-[#EFE2DC]/60 border border-[#232620]/10 flex items-start gap-3">
              <ShieldAlert className="w-4 h-4 text-[#4A5D3F] shrink-0 mt-0.5" />
              <div className="text-xs text-[#232620] space-y-1">
                <p className="font-semibold">Usage Precautions</p>
                <p className="text-[#5C6156]">{product.precautions}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Customer Reviews + Live Review Submission */}
      <section className="pt-10 border-t border-[#232620]/10 grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-7 space-y-5">
          <div>
            <p className="text-xs font-medium text-[#4A5D3F]">Customer Feedback</p>
            <h2 className="font-display text-3xl font-semibold text-[#232620] mt-1">
              Reviews ({reviews.length})
            </h2>
          </div>

          {reviews.length === 0 ? (
            <p className="text-sm text-[#5C6156] p-6 rounded-xl bg-[#FDFBF7] border border-[#232620]/10">
              Be the first to share your experience with {product.name}.
            </p>
          ) : (
            <div className="space-y-4">
              {reviews.map((rev) => (
                <article key={rev.id} className="p-5 rounded-xl bg-[#FDFBF7] border border-[#232620]/10 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 text-[#C5A059]">
                      {Array.from({ length: rev.rating }).map((_, idx) => (
                        <Star key={idx} className="w-3.5 h-3.5 fill-current" />
                      ))}
                    </div>
                    <span className="text-[11px] text-[#5C6156]">{rev.skinOrHairProfile}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-[#232620]">{rev.title}</h3>
                  <p className="text-xs text-[#5C6156] leading-relaxed">{rev.comment}</p>
                  <p className="text-[11px] text-[#5C6156] pt-1">
                    {rev.authorName} · {rev.city}
                    {rev.verifiedPurchase ? ' · Verified Buyer' : ''}
                  </p>
                  {rev.adminReply && (
                    <div className="mt-2 p-3 rounded-lg bg-[#F1EAE0] border-l-2 border-[#4A5D3F] text-xs text-[#232620]">
                      <span className="font-semibold text-[#4A5D3F]">Aurelia Botanica Care: </span>
                      <span>{rev.adminReply}</span>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>

        <form
          onSubmit={handleReviewSubmit}
          className="lg:col-span-5 p-6 rounded-2xl bg-[#FDFBF7] border border-[#232620]/10 space-y-4 self-start"
        >
          <h3 className="font-display text-2xl font-semibold text-[#232620]">Leave a Review</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#232620] mb-1">Your Name</label>
              <input
                type="text"
                required
                value={reviewName}
                onChange={(e) => setReviewName(e.target.value)}
                placeholder="e.g., Sana Malik"
                className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#232620] mb-1">City</label>
              <input
                type="text"
                value={reviewCity}
                onChange={(e) => setReviewCity(e.target.value)}
                placeholder="Lahore"
                className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#232620] mb-1">Rating</label>
              <select
                value={reviewRating}
                onChange={(e) => setReviewRating(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-sm"
              >
                <option value={5}>5 Stars — Exceptional</option>
                <option value={4}>4 Stars — Very Good</option>
                <option value={3}>3 Stars — Good</option>
                <option value={2}>2 Stars — Fair</option>
                <option value={1}>1 Star — Not for me</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#232620] mb-1">Headline</label>
              <input
                type="text"
                value={reviewTitle}
                onChange={(e) => setReviewTitle(e.target.value)}
                placeholder="Gentle & soothing"
                className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#232620] mb-1">Your Experience</label>
            <textarea
              required
              rows={3}
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder="Share how this formula worked for your skin or hair..."
              className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={submittingReview}
            className="w-full py-3 rounded-lg bg-[#4A5D3F] hover:bg-[#3A4A31] text-[#FDFBF7] text-sm font-medium transition-colors"
          >
            {submittingReview ? 'Publishing...' : 'Submit Review'}
          </button>
        </form>
      </section>

      {/* Related Products */}
      <section className="pt-8 border-t border-[#232620]/10 space-y-6">
        <h2 className="font-display text-3xl font-semibold text-[#232620]">Pair With Your Routine</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {relatedProducts.map((rel) => (
            <ProductCard key={rel.id} product={rel} />
          ))}
        </div>
      </section>
    </div>
  );
}
