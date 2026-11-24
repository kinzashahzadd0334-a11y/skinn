import { useState } from 'react';
import { CheckCircle2, MessageCircle, ShieldCheck, Tag } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { SafeImage } from '../components/common/SafeImage';
import type { OrderRecord } from '../types/store';
import { buildCartWhatsAppUrl, formatPkr } from '../utils/commerce';
import {
  evaluateCouponLocal,
  getCustomerFromTokenLocal,
  placeOrderTransactionalLocal,
  recordWhatsAppReferralLocal,
} from '../db/localDatabase';

const PAKISTAN_CITIES = [
  'Lahore',
  'Karachi',
  'Islamabad',
  'Rawalpindi',
  'Faisalabad',
  'Multan',
  'Peshawar',
  'Quetta',
  'Sialkot',
  'Gujranwala',
  'Hyderabad',
  'Bahawalpur',
];

export function CheckoutView() {
  const {
    cart,
    cartSubtotalPkr,
    products,
    clearCart,
    storeConfig,
    customer,
    authToken,
    navigate,
    refreshProducts,
    refreshOrders,
    showToast,
  } = useStore();

  const defaultAddr = customer?.savedAddresses?.[0];
  const [customerName, setCustomerName] = useState(defaultAddr?.fullName || customer?.name || '');
  const [customerPhone, setCustomerPhone] = useState(defaultAddr?.phone || customer?.phone || '');
  const [customerEmail, setCustomerEmail] = useState(customer?.email || '');
  const [city, setCity] = useState(defaultAddr?.city || 'Lahore');
  const [area, setArea] = useState(defaultAddr?.area || '');
  const [street, setStreet] = useState(defaultAddr?.street || '');
  const [postalCode, setPostalCode] = useState(defaultAddr?.postalCode || '');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'whatsapp'>('cod');

  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discountPkr: number;
    freeShipping: boolean;
    message: string;
  } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<OrderRecord | null>(null);

  const discountPkr = appliedCoupon ? appliedCoupon.discountPkr : 0;
  const afterDiscount = Math.max(0, cartSubtotalPkr - discountPkr);
  const taxPkr = storeConfig.taxPercent ? Math.round((afterDiscount * storeConfig.taxPercent) / 100) : 0;
  const freeShipping =
    afterDiscount >= storeConfig.freeShippingThresholdPkr || Boolean(appliedCoupon?.freeShipping);
  const shippingPkr = cart.length === 0 ? 0 : freeShipping ? 0 : storeConfig.shippingFeePkr;
  const totalPkr = afterDiscount + taxPkr + shippingPkr;

  const handleApplyCoupon = async () => {
    setCouponError(null);
    if (!couponInput.trim()) return;
    try {
      const itemProductIds = cart.map((i) => i.productId);
      const itemCategories = cart
        .map((i) => products.find((p) => p.id === i.productId)?.category)
        .filter((c): c is string => Boolean(c));
      const data = await evaluateCouponLocal(couponInput.trim(), cartSubtotalPkr, {
        itemCategories,
        itemProductIds,
        userId: customer?.id,
      });
      if (!data.valid) {
        setAppliedCoupon(null);
        setCouponError(data.message || 'Invalid coupon code.');
        return;
      }
      setAppliedCoupon({
        code: data.code,
        discountPkr: data.discountPkr,
        freeShipping: data.freeShipping,
        message: data.message,
      });
      showToast(data.message);
    } catch {
      setCouponError('Unable to validate coupon right now.');
    }
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (cart.length === 0) return;

    setSubmitting(true);
    try {
      const authUser = authToken ? await getCustomerFromTokenLocal(authToken) : null;
      const order = await placeOrderTransactionalLocal({
        authUser,
        customerName,
        customerPhone,
        customerEmail,
        shippingAddress: { street, area, city, postalCode, notes },
        paymentMethod,
        couponCode: appliedCoupon?.code,
        items: cart.map((item) => ({ productId: item.productId, quantity: item.quantity })),
      });

      setConfirmedOrder(order);
      clearCart();
      await refreshProducts();
      await refreshOrders();
      showToast(`Order ${order.orderNumber} confirmed!`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Order failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmedOrder) {
    const waConfirmUrl = buildCartWhatsAppUrl({
      whatsappNumber: storeConfig.whatsappNumber,
      items: confirmedOrder.items.map((i) => ({
        productId: i.productId,
        slug: i.slug,
        name: i.name,
        volume: i.volume,
        pricePkr: i.unitPricePkr,
        image: i.image,
        quantity: i.quantity,
      })),
      subtotalPkr: confirmedOrder.subtotalPkr,
      shippingPkr: confirmedOrder.shippingPkr,
      discountPkr: confirmedOrder.discountPkr,
      totalPkr: confirmedOrder.totalPkr,
      couponCode: confirmedOrder.couponCode,
      customerName: confirmedOrder.customerName,
      phone: confirmedOrder.customerPhone,
      address: `${confirmedOrder.shippingAddress.street}, ${confirmedOrder.shippingAddress.area}, ${confirmedOrder.shippingAddress.city}`,
      orderNumber: confirmedOrder.orderNumber,
    });

    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-6">
        <div className="p-8 rounded-2xl bg-[#FDFBF7] border border-[#232620]/10 space-y-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-7 h-7 text-[#4A5D3F] shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-[#4A5D3F]">Order Confirmed · Preparing Shipment</p>
              <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[#232620]">
                Order #{confirmedOrder.orderNumber}
              </h1>
              <p className="text-sm text-[#5C6156] mt-1">
                Thank you, {confirmedOrder.customerName}. Your Cash on Delivery parcel will dispatch within 24 business hours to {confirmedOrder.shippingAddress.city}.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#FAF6EE] border border-[#232620]/10 space-y-2 text-xs">
            <p>
              <strong className="text-[#232620]">Delivery Address:</strong> {confirmedOrder.shippingAddress.street},{' '}
              {confirmedOrder.shippingAddress.area ? `${confirmedOrder.shippingAddress.area}, ` : ''}
              {confirmedOrder.shippingAddress.city} {confirmedOrder.shippingAddress.postalCode}
            </p>
            <p>
              <strong className="text-[#232620]">Contact Phone:</strong> {confirmedOrder.customerPhone}
            </p>
            <p>
              <strong className="text-[#232620]">Total Payable:</strong>{' '}
              <span className="font-mono font-semibold text-[#232620] tabular-nums">
                {formatPkr(confirmedOrder.totalPkr)}
              </span>{' '}
              ({confirmedOrder.paymentMethod === 'whatsapp' ? 'WhatsApp + COD' : 'Cash on Delivery'})
            </p>
          </div>

          <div className="space-y-2">
            {confirmedOrder.items.map((item) => (
              <div key={item.productId} className="flex items-center justify-between text-xs py-2 border-b border-[#232620]/8">
                <span>
                  {item.name} ({item.volume}) × {item.quantity}
                </span>
                <span className="font-mono tabular-nums">{formatPkr(item.unitPricePkr * item.quantity)}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <a
              href={waConfirmUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-[#4A5D3F] hover:bg-[#3A4A31] text-[#FDFBF7] text-xs font-medium"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Send Receipt to WhatsApp</span>
            </a>
            <button
              type="button"
              onClick={() => navigate({ name: 'home' })}
              className="px-5 py-3 rounded-lg border border-[#232620]/20 text-xs font-medium text-[#232620] hover:bg-[#F1EAE0]"
            >
              Continue Shopping
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center space-y-4">
        <h1 className="font-display text-3xl font-semibold text-[#232620]">Your bag is empty</h1>
        <p className="text-sm text-[#5C6156]">Add skincare or haircare formulas before proceeding to checkout.</p>
        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate({ name: 'skincare' })}
            className="px-5 py-2.5 rounded-lg bg-[#4A5D3F] text-[#FDFBF7] text-sm font-medium"
          >
            Shop Skincare
          </button>
          <button
            type="button"
            onClick={() => navigate({ name: 'haircare' })}
            className="px-5 py-2.5 rounded-lg border border-[#232620]/20 text-[#232620] text-sm font-medium"
          >
            Shop Haircare
          </button>
        </div>
      </div>
    );
  }

  const liveWhatsAppUrl = buildCartWhatsAppUrl({
    whatsappNumber: storeConfig.whatsappNumber,
    items: cart,
    subtotalPkr: cartSubtotalPkr,
    shippingPkr,
    discountPkr,
    totalPkr,
    couponCode: appliedCoupon?.code,
    customerName,
    phone: customerPhone,
    address: street ? `${street}, ${area ? `${area}, ` : ''}${city}` : city,
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="border-b border-[#232620]/10 pb-5">
        <p className="text-xs font-medium text-[#4A5D3F]">Pakistan Cash on Delivery &amp; WhatsApp Checkout</p>
        <h1 className="font-display text-4xl font-semibold text-[#232620] mt-1">Complete Your Order</h1>
      </div>

      <form onSubmit={handlePlaceOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left Shipping & Payment Form */}
        <div className="lg:col-span-7 space-y-6">
          <div className="p-6 rounded-2xl bg-[#FDFBF7] border border-[#232620]/10 space-y-4">
            <h2 className="font-display text-2xl font-semibold text-[#232620]">Delivery Details (Pakistan)</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#232620] mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Ayesha Khan"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#232620] mb-1">Mobile / WhatsApp Number *</label>
                <input
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="0300 1234567"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#232620] mb-1">Email (for order updates)</label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#232620] mb-1">City *</label>
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-sm"
                >
                  {PAKISTAN_CITIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value="Other Pakistan City">Other Pakistan City</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#232620] mb-1">Area / Sector / Town</label>
                <input
                  type="text"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  placeholder="DHA Phase 5 / F-7 / Clifton"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#232620] mb-1">Postal Code</label>
                <input
                  type="text"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="54000"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#232620] mb-1">Street Address / House # *</label>
              <input
                type="text"
                required
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="House 14, Street 6, Block B"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#232620] mb-1">Courier Notes (Optional)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Call on arrival / Gift note"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-sm"
              />
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-[#FDFBF7] border border-[#232620]/10 space-y-4">
            <h2 className="font-display text-2xl font-semibold text-[#232620]">Payment Method</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPaymentMethod('cod')}
                className={`p-4 rounded-xl border text-left transition-colors ${
                  paymentMethod === 'cod'
                    ? 'border-[#4A5D3F] bg-[#4A5D3F]/10'
                    : 'border-[#232620]/15 bg-[#FAF6EE]'
                }`}
              >
                <p className="text-sm font-semibold text-[#232620]">Cash on Delivery (COD)</p>
                <p className="text-xs text-[#5C6156] mt-1">Pay the courier in PKR upon parcel arrival.</p>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('whatsapp')}
                className={`p-4 rounded-xl border text-left transition-colors ${
                  paymentMethod === 'whatsapp'
                    ? 'border-[#4A5D3F] bg-[#4A5D3F]/10'
                    : 'border-[#232620]/15 bg-[#FAF6EE]'
                }`}
              >
                <p className="text-sm font-semibold text-[#232620]">Confirm via WhatsApp + COD</p>
                <p className="text-xs text-[#5C6156] mt-1">Record order &amp; open WhatsApp summary directly.</p>
              </button>
            </div>
          </div>
        </div>

        {/* Right Order Summary */}
        <aside className="lg:col-span-5 p-6 rounded-2xl bg-[#FDFBF7] border border-[#232620]/10 space-y-5 lg:sticky lg:top-24">
          <h2 className="font-display text-2xl font-semibold text-[#232620]">Order Summary</h2>

          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
            {cart.map((item) => (
              <div key={item.productId} className="flex items-center gap-3">
                <SafeImage
                  src={item.image}
                  alt={item.name}
                  className="w-12 h-12 rounded-lg object-cover bg-[#F1EAE0] shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[#232620] truncate">{item.name}</p>
                  <p className="text-[11px] text-[#5C6156]">
                    {item.volume} × {item.quantity}
                  </p>
                </div>
                <span className="font-mono text-xs tabular-nums text-[#232620]">
                  {formatPkr(item.pricePkr * item.quantity)}
                </span>
              </div>
            ))}
          </div>

          {/* Coupon Input */}
          <div className="pt-4 border-t border-[#232620]/10 space-y-2">
            <label htmlFor="coupon-input" className="text-xs font-medium text-[#232620] flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-[#4A5D3F]" />
              <span>Promo Code (try AURELIA10, GLOW500, FREESHIP)</span>
            </label>
            <div className="flex gap-2">
              <input
                id="coupon-input"
                type="text"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value)}
                placeholder="Enter code"
                className="flex-1 px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-xs uppercase"
              />
              <button
                type="button"
                onClick={handleApplyCoupon}
                className="px-4 py-2 rounded-lg bg-[#232620] text-[#FAF6EE] text-xs font-medium hover:bg-[#3B3F37]"
              >
                Apply
              </button>
            </div>
            {appliedCoupon && <p className="text-xs text-[#4A5D3F] font-medium">{appliedCoupon.message}</p>}
            {couponError && <p className="text-xs text-red-700">{couponError}</p>}
          </div>

          <div className="pt-4 border-t border-[#232620]/10 space-y-2 text-sm">
            <div className="flex justify-between text-[#5C6156]">
              <span>Subtotal</span>
              <span className="font-mono tabular-nums text-[#232620]">{formatPkr(cartSubtotalPkr)}</span>
            </div>
            {discountPkr > 0 && (
              <div className="flex justify-between text-[#4A5D3F]">
                <span>Promo Savings ({appliedCoupon?.code})</span>
                <span className="font-mono tabular-nums">-{formatPkr(discountPkr)}</span>
              </div>
            )}
            <div className="flex justify-between text-[#5C6156]">
              <span>Courier Shipping</span>
              <span className="font-mono tabular-nums text-[#232620]">
                {shippingPkr === 0 ? 'Free' : formatPkr(shippingPkr)}
              </span>
            </div>
            {taxPkr > 0 && (
              <div className="flex justify-between text-[#5C6156]">
                <span>Tax ({storeConfig.taxPercent}%)</span>
                <span className="font-mono tabular-nums text-[#232620]">{formatPkr(taxPkr)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-semibold text-[#232620] pt-2 border-t border-[#232620]/10">
              <span>Total Payable (PKR)</span>
              <span className="font-mono tabular-nums">{formatPkr(totalPkr)}</span>
            </div>
          </div>

          {submitError && (
            <p className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">{submitError}</p>
          )}

          <div className="space-y-2.5">
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 px-4 rounded-lg bg-[#4A5D3F] hover:bg-[#3A4A31] text-[#FDFBF7] text-sm font-medium transition-colors"
            >
              {submitting ? 'Confirming Order...' : `Place Order — ${formatPkr(totalPkr)}`}
            </button>

            {storeConfig.whatsappEnabled !== false && (
              <a
                href={liveWhatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  void recordWhatsAppReferralLocal(
                    'checkout_whatsapp',
                    `Cart WhatsApp Checkout (${cart.length} items, ${formatPkr(totalPkr)})`,
                    customerPhone || undefined,
                  ).catch(() => {});
                }}
                className="w-full py-2.5 px-4 rounded-lg border border-[#4A5D3F]/30 bg-[#FAF6EE] hover:bg-[#F1EAE0] text-[#4A5D3F] text-xs font-medium inline-flex items-center justify-center gap-2 transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Send Order Directly on WhatsApp</span>
              </a>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[#5C6156] pt-1">
            <ShieldCheck className="w-4 h-4 text-[#4A5D3F] shrink-0" />
            <span>Every parcel is sealed fresh and inspected prior to dispatch across Pakistan.</span>
          </div>
        </aside>
      </form>
    </div>
  );
}
