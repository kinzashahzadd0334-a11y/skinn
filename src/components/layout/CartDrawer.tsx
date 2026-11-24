import { MessageCircle, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { buildCartWhatsAppUrl, formatPkr } from '../../utils/commerce';
import { SafeImage } from '../common/SafeImage';

export function CartDrawer() {
  const {
    cart,
    cartCount,
    cartSubtotalPkr,
    isCartOpen,
    setCartOpen,
    updateCartQuantity,
    removeFromCart,
    navigate,
    storeConfig,
  } = useStore();

  if (!isCartOpen) return null;

  const remainingForFreeShipping = Math.max(0, storeConfig.freeShippingThresholdPkr - cartSubtotalPkr);
  const shippingPkr = cartSubtotalPkr === 0 ? 0 : remainingForFreeShipping === 0 ? 0 : storeConfig.shippingFeePkr;
  const estimatedTotal = cartSubtotalPkr + shippingPkr;
  const progressPct = Math.min(100, Math.round((cartSubtotalPkr / storeConfig.freeShippingThresholdPkr) * 100));

  const whatsappUrl = buildCartWhatsAppUrl({
    whatsappNumber: storeConfig.whatsappNumber,
    items: cart,
    subtotalPkr: cartSubtotalPkr,
    shippingPkr,
    discountPkr: 0,
    totalPkr: estimatedTotal,
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Shopping Bag">
      <div
        className="fixed inset-0 bg-[#232620]/45 transition-opacity"
        onClick={() => setCartOpen(false)}
        aria-hidden="true"
      />

      <aside className="relative z-10 w-full max-w-md bg-[#FAF6EE] h-full flex flex-col border-l border-[#232620]/10 shadow-2xl">
        <div className="px-6 py-5 border-b border-[#232620]/10 flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl font-semibold text-[#232620]">Your Ritual Bag</h2>
            <p className="text-xs text-[#5C6156] tabular-nums">{cartCount} item{cartCount === 1 ? '' : 's'} selected</p>
          </div>
          <button
            type="button"
            onClick={() => setCartOpen(false)}
            aria-label="Close bag"
            className="w-10 h-10 rounded-lg flex items-center justify-center text-[#232620] hover:bg-[#F1EAE0] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Free delivery meter */}
        <div className="px-6 py-3.5 bg-[#F1EAE0] border-b border-[#232620]/8">
          <p className="text-xs text-[#232620] font-medium mb-2">
            {remainingForFreeShipping === 0 && cartSubtotalPkr > 0
              ? 'Complimentary nationwide Pakistan shipping unlocked.'
              : `Add ${formatPkr(remainingForFreeShipping)} more for complimentary Pakistan delivery.`}
          </p>
          <div className="h-1.5 w-full bg-[#FDFBF7] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#4A5D3F] transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12">
              <ShoppingBag className="w-10 h-10 text-[#4A5D3F]/40 mb-3" strokeWidth={1.5} />
              <p className="font-display text-2xl text-[#232620]">Your bag is empty</p>
              <p className="text-sm text-[#5C6156] mt-1 max-w-xs">
                Explore our botanical skincare serums or take the Skin Type Quiz for a curated routine.
              </p>
              <div className="flex flex-wrap justify-center gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setCartOpen(false);
                    navigate({ name: 'skincare' });
                  }}
                  className="px-4 py-2.5 rounded-lg bg-[#4A5D3F] text-[#FDFBF7] text-xs font-medium hover:bg-[#3A4A31] transition-colors"
                >
                  Shop Skincare
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCartOpen(false);
                    navigate({ name: 'quiz' });
                  }}
                  className="px-4 py-2.5 rounded-lg border border-[#232620]/20 text-[#232620] text-xs font-medium hover:bg-[#F1EAE0] transition-colors"
                >
                  Take Skin Quiz
                </button>
              </div>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.productId}
                className="flex gap-4 p-3.5 rounded-xl bg-[#FDFBF7] border border-[#232620]/10"
              >
                <button
                  type="button"
                  onClick={() => {
                    setCartOpen(false);
                    navigate({ name: 'product', slug: item.slug });
                  }}
                  className="w-20 h-20 rounded-lg bg-[#F1EAE0] overflow-hidden shrink-0"
                >
                  <SafeImage src={item.image} alt={item.name} className="w-full h-full object-cover" />
                </button>

                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => {
                          setCartOpen(false);
                          navigate({ name: 'product', slug: item.slug });
                        }}
                        className="text-sm font-semibold text-[#232620] hover:text-[#4A5D3F] text-left truncate block w-full"
                      >
                        {item.name}
                      </button>
                      <p className="text-xs text-[#5C6156] mt-0.5">{item.volume}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.productId)}
                      aria-label={`Remove ${item.name}`}
                      className="p-1.5 text-[#5C6156] hover:text-[#232620]"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between mt-3">
                    <div className="inline-flex items-center border border-[#232620]/15 rounded-lg bg-[#FAF6EE]">
                      <button
                        type="button"
                        onClick={() => updateCartQuantity(item.productId, item.quantity - 1)}
                        aria-label={`Decrease quantity of ${item.name}`}
                        className="w-8 h-8 flex items-center justify-center text-[#232620] hover:bg-[#F1EAE0]"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-8 text-center text-xs font-mono tabular-nums">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateCartQuantity(item.productId, item.quantity + 1)}
                        aria-label={`Increase quantity of ${item.name}`}
                        className="w-8 h-8 flex items-center justify-center text-[#232620] hover:bg-[#F1EAE0]"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <span className="font-mono text-sm font-medium text-[#232620] tabular-nums">
                      {formatPkr(item.pricePkr * item.quantity)}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {cart.length > 0 && (
          <div className="p-6 border-t border-[#232620]/10 bg-[#FDFBF7] space-y-3">
            <div className="flex items-center justify-between text-sm text-[#5C6156]">
              <span>Subtotal</span>
              <span className="font-mono tabular-nums text-[#232620]">{formatPkr(cartSubtotalPkr)}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-[#5C6156]">
              <span>Nationwide Delivery</span>
              <span className="font-mono tabular-nums text-[#232620]">
                {shippingPkr === 0 ? 'Free' : formatPkr(shippingPkr)}
              </span>
            </div>
            <div className="flex items-center justify-between text-base font-semibold text-[#232620] pt-2 border-t border-[#232620]/10">
              <span>Estimated Total</span>
              <span className="font-mono tabular-nums">{formatPkr(estimatedTotal)}</span>
            </div>

            <div className="grid grid-cols-1 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setCartOpen(false);
                  navigate({ name: 'checkout' });
                }}
                className="w-full py-3 px-4 rounded-lg bg-[#4A5D3F] hover:bg-[#3A4A31] text-[#FDFBF7] text-sm font-medium transition-colors"
              >
                Checkout (Cash on Delivery)
              </button>

              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 px-4 rounded-lg border border-[#4A5D3F]/30 bg-[#FAF6EE] hover:bg-[#F1EAE0] text-[#4A5D3F] text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Quick Order via WhatsApp</span>
              </a>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
