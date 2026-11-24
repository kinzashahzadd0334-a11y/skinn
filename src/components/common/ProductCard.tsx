import { Heart, ShoppingBag, Star } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import type { Product } from '../../types/store';
import { formatPkr, getDiscountPercent, getEffectivePrice } from '../../utils/commerce';
import { SafeImage } from './SafeImage';

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const { navigate, addToCart, wishlistIds, toggleWishlist } = useStore();
  const isWished = wishlistIds.includes(product.id);
  const effectivePrice = getEffectivePrice(product.pricePkr, product.discountPricePkr);
  const discountPct = getDiscountPercent(product.pricePkr, product.discountPricePkr);

  return (
    <article className="group flex flex-col bg-[#FDFBF7] border border-[#232620]/10 rounded-xl overflow-hidden transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative aspect-[4/3] bg-[#F1EAE0] overflow-hidden">
        <button
          type="button"
          onClick={() => navigate({ name: 'product', slug: product.slug })}
          className="block w-full h-full text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4A5D3F]"
          aria-label={`View ${product.name}`}
        >
          <SafeImage
            src={product.images[0]}
            alt={product.name}
            fallbackTitle={product.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        </button>

        <button
          type="button"
          onClick={() => toggleWishlist(product.id)}
          aria-label={isWished ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
          className="absolute top-3 right-3 w-10 h-10 rounded-full bg-[#FDFBF7]/90 border border-[#232620]/10 flex items-center justify-center text-[#232620] hover:bg-[#FAF6EE] transition-colors focus-visible:outline-2 focus-visible:outline-[#4A5D3F]"
        >
          <Heart
            className={`w-4 h-4 ${isWished ? 'fill-[#4A5D3F] text-[#4A5D3F]' : 'text-[#232620]'}`}
            strokeWidth={1.75}
          />
        </button>

        {discountPct ? (
          <span className="absolute bottom-3 left-3 bg-[#FDFBF7]/92 px-2.5 py-1 text-[11px] font-medium tracking-wide text-[#4A5D3F] border border-[#C5A059]/40">
            Save {discountPct}%
          </span>
        ) : product.isBestSeller ? (
          <span className="absolute bottom-3 left-3 bg-[#FDFBF7]/92 px-2.5 py-1 text-[11px] font-medium tracking-wide text-[#232620] border border-[#232620]/10">
            Best Seller
          </span>
        ) : product.isNewArrival ? (
          <span className="absolute bottom-3 left-3 bg-[#FDFBF7]/92 px-2.5 py-1 text-[11px] font-medium tracking-wide text-[#4A5D3F] border border-[#4A5D3F]/20">
            New Arrival
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-5 gap-2.5">
        <div className="flex items-center justify-between gap-2 text-xs text-[#5C6156]">
          <span className="truncate">{product.category}</span>
          <span className="shrink-0 font-mono tabular-nums">{product.volume}</span>
        </div>

        <button
          type="button"
          onClick={() => navigate({ name: 'product', slug: product.slug })}
          className="text-left focus-visible:outline-2 focus-visible:outline-[#4A5D3F]"
        >
          <h3 className="font-sans text-base font-semibold text-[#232620] leading-snug group-hover:text-[#4A5D3F] transition-colors">
            {product.name}
          </h3>
        </button>

        <p className="text-xs text-[#5C6156] line-clamp-2 leading-relaxed">{product.subtitle}</p>

        <div className="mt-auto pt-3 border-t border-[#232620]/8 flex items-center justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-sm font-medium text-[#232620] tabular-nums">
                {formatPkr(effectivePrice)}
              </span>
              {discountPct && (
                <span className="font-mono text-xs text-[#5C6156] line-through tabular-nums">
                  {formatPkr(product.pricePkr)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 mt-0.5 text-xs text-[#5C6156]">
              <Star className="w-3.5 h-3.5 fill-[#C5A059] text-[#C5A059]" />
              <span className="tabular-nums font-medium text-[#232620]">{product.rating.toFixed(1)}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{product.reviewCount} reviews</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => addToCart(product, 1, true)}
            disabled={product.stock <= 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-[#4A5D3F] hover:bg-[#3A4A31] disabled:bg-[#5C6156]/40 text-[#FDFBF7] text-xs font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4A5D3F]"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>{product.stock > 0 ? 'Add' : 'Sold Out'}</span>
          </button>
        </div>
      </div>
    </article>
  );
}
