import { useState } from 'react';
import { LogOut, Package, Search, User } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { ProductCard } from '../components/common/ProductCard';
import type { OrderRecord } from '../types/store';
import { buildOrderTrackingWhatsAppUrl, formatPkr } from '../utils/commerce';
import { listOrdersLocal } from '../db/localDatabase';

export function AccountView() {
  const {
    customer,
    login,
    register,
    logout,
    updateProfile,
    orders,
    wishlistIds,
    recentlyViewedSlugs,
    savedRoutines,
    products,
    navigate,
    storeConfig,
  } = useStore();

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  // Order tracker state (works for both guests & signed-in customers)
  const [trackOrderNum, setTrackOrderNum] = useState('');
  const [trackPhone, setTrackPhone] = useState('');
  const [trackedOrder, setTrackedOrder] = useState<OrderRecord | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);

  // Address form
  const [addrLabel, setAddrLabel] = useState('Home');
  const [addrStreet, setAddrStreet] = useState('');
  const [addrArea, setAddrArea] = useState('');
  const [addrCity, setAddrCity] = useState('Lahore');
  const [addrPostal, setAddrPostal] = useState('');

  const wishlistProducts = products.filter((p) => wishlistIds.includes(p.id));
  const recentProducts = recentlyViewedSlugs
    .map((slug) => products.find((p) => p.slug === slug))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthBusy(true);
    try {
      if (authMode === 'login') {
        await login(email, password);
      } else {
        await register(name, email, phone, password);
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleTrackLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setTrackError(null);
    setTrackedOrder(null);
    try {
      const refNum = trackOrderNum.trim().toUpperCase();
      const phoneDigits = trackPhone.trim().replace(/\D/g, '');
      const phoneTail = phoneDigits.slice(-7);
      const allOrders = await listOrdersLocal(500);
      const match = allOrders.find((o) => {
        if (o.orderNumber.toUpperCase() !== refNum) return false;
        const orderDigits = o.customerPhone.replace(/\D/g, '');
        return phoneTail ? orderDigits.endsWith(phoneTail) : orderDigits === phoneDigits;
      });
      if (!match) {
        setTrackError('No matching order found for that order number and phone number.');
        return;
      }
      setTrackedOrder(match);
    } catch {
      setTrackError('Unable to check order status right now.');
    }
  };

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer || !addrStreet.trim()) return;
    const next = [
      ...customer.savedAddresses,
      {
        id: `addr-${Date.now()}`,
        label: addrLabel,
        fullName: customer.name,
        phone: customer.phone,
        street: addrStreet,
        area: addrArea,
        city: addrCity,
        postalCode: addrPostal,
      },
    ];
    await updateProfile({ savedAddresses: next });
    setAddrStreet('');
    setAddrArea('');
    setAddrPostal('');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#232620]/10 pb-6">
        <div>
          <p className="text-xs font-medium text-[#4A5D3F]">Customer Sanctuary</p>
          <h1 className="font-display text-4xl font-semibold text-[#232620] mt-1">
            {customer ? `Welcome back, ${customer.name}` : 'Account & Order Tracking'}
          </h1>
        </div>
        {customer && (
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#232620]/20 text-xs font-medium text-[#232620] hover:bg-[#F1EAE0] self-start"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        )}
      </div>

      {!customer ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <form
            onSubmit={handleAuthSubmit}
            className="lg:col-span-6 p-6 sm:p-8 rounded-2xl bg-[#FDFBF7] border border-[#232620]/10 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-semibold text-[#232620]">
                {authMode === 'login' ? 'Sign In' : 'Create Account'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setAuthMode((m) => (m === 'login' ? 'register' : 'login'));
                  setAuthError(null);
                }}
                className="text-xs font-medium text-[#4A5D3F] hover:underline"
              >
                {authMode === 'login' ? 'Need an account? Sign Up' : 'Have an account? Sign In'}
              </button>
            </div>

            {authMode === 'register' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-[#232620] mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#232620] mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0300 1234567"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-sm"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-medium text-[#232620] mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#232620] mb-1">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-sm"
              />
            </div>

            {authError && <p className="text-xs text-red-700">{authError}</p>}

            <button
              type="submit"
              disabled={authBusy}
              className="w-full py-3 rounded-lg bg-[#4A5D3F] hover:bg-[#3A4A31] text-[#FDFBF7] text-sm font-medium transition-colors"
            >
              {authBusy ? 'Please wait...' : authMode === 'login' ? 'Sign In' : 'Create Customer Account'}
            </button>
          </form>

          {/* Guest Order Tracking */}
          <form
            onSubmit={handleTrackLookup}
            className="lg:col-span-6 p-6 sm:p-8 rounded-2xl bg-[#FDFBF7] border border-[#232620]/10 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-[#4A5D3F]" />
              <h2 className="font-display text-2xl font-semibold text-[#232620]">Track an Order</h2>
            </div>
            <p className="text-xs text-[#5C6156]">
              Placed a guest Cash on Delivery order? Enter your order reference (e.g., AB-1042) and phone number.
            </p>
            <div>
              <label className="block text-xs font-medium text-[#232620] mb-1">Order Number</label>
              <input
                type="text"
                required
                value={trackOrderNum}
                onChange={(e) => setTrackOrderNum(e.target.value)}
                placeholder="AB-1042"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-sm uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#232620] mb-1">Phone Number</label>
              <input
                type="tel"
                required
                value={trackPhone}
                onChange={(e) => setTrackPhone(e.target.value)}
                placeholder="0300 1234567"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-sm"
              />
            </div>
            <button
              type="submit"
              className="w-full py-3 rounded-lg bg-[#232620] text-[#FAF6EE] text-sm font-medium inline-flex items-center justify-center gap-2"
            >
              <Search className="w-4 h-4" />
              <span>Check Order Status</span>
            </button>

            {trackError && <p className="text-xs text-red-700">{trackError}</p>}
            {trackedOrder && (
              <div className="p-4 rounded-xl bg-[#FAF6EE] border border-[#232620]/10 space-y-1.5 text-xs">
                <p className="font-semibold text-[#232620]">
                  Order #{trackedOrder.orderNumber} — {trackedOrder.status}
                </p>
                <p className="text-[#5C6156]">
                  Total: {formatPkr(trackedOrder.totalPkr)} · {trackedOrder.shippingAddress.city}
                </p>
                <a
                  href={buildOrderTrackingWhatsAppUrl(storeConfig.whatsappNumber, trackedOrder)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#4A5D3F] font-medium hover:underline inline-block pt-1"
                >
                  Ask about this order on WhatsApp →
                </a>
              </div>
            )}
          </form>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 space-y-6">
            <div className="p-6 rounded-2xl bg-[#FDFBF7] border border-[#232620]/10 space-y-3">
              <div className="flex items-center gap-2 text-[#4A5D3F]">
                <User className="w-4 h-4" />
                <h2 className="font-display text-2xl font-semibold text-[#232620]">Profile</h2>
              </div>
              <p className="text-sm text-[#232620]">{customer.name}</p>
              <p className="text-xs text-[#5C6156]">{customer.email}</p>
              {customer.phone && <p className="text-xs text-[#5C6156]">{customer.phone}</p>}
            </div>

            <div className="p-6 rounded-2xl bg-[#FDFBF7] border border-[#232620]/10 space-y-4">
              <h2 className="font-display text-2xl font-semibold text-[#232620]">Saved Addresses</h2>
              {customer.savedAddresses.map((addr) => (
                <div key={addr.id} className="p-3 rounded-lg bg-[#FAF6EE] border border-[#232620]/10 text-xs">
                  <p className="font-semibold text-[#232620]">{addr.label}</p>
                  <p className="text-[#5C6156]">
                    {addr.street}, {addr.area ? `${addr.area}, ` : ''}
                    {addr.city} {addr.postalCode}
                  </p>
                </div>
              ))}

              <form onSubmit={handleSaveAddress} className="space-y-2.5 pt-2 border-t border-[#232620]/10">
                <p className="text-xs font-medium text-[#232620]">Add Delivery Address</p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={addrLabel}
                    onChange={(e) => setAddrLabel(e.target.value)}
                    placeholder="Home / Office"
                    className="px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-xs"
                  />
                  <input
                    type="text"
                    value={addrCity}
                    onChange={(e) => setAddrCity(e.target.value)}
                    placeholder="City"
                    className="px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-xs"
                  />
                </div>
                <input
                  type="text"
                  required
                  value={addrStreet}
                  onChange={(e) => setAddrStreet(e.target.value)}
                  placeholder="Street address"
                  className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-xs"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={addrArea}
                    onChange={(e) => setAddrArea(e.target.value)}
                    placeholder="Area / Sector"
                    className="px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-xs"
                  />
                  <input
                    type="text"
                    value={addrPostal}
                    onChange={(e) => setAddrPostal(e.target.value)}
                    placeholder="Postal Code"
                    className="px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-xs"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#4A5D3F] text-[#FDFBF7] text-xs font-medium"
                >
                  Save Address
                </button>
              </form>
            </div>
          </div>

          <div className="lg:col-span-7 space-y-6">
            <div className="p-6 rounded-2xl bg-[#FDFBF7] border border-[#232620]/10 space-y-4">
              <h2 className="font-display text-2xl font-semibold text-[#232620]">My Orders</h2>
              {orders.length === 0 ? (
                <p className="text-sm text-[#5C6156]">You have not placed an order under this account yet.</p>
              ) : (
                <div className="space-y-3">
                  {orders.map((ord) => (
                    <div key={ord.id} className="p-4 rounded-xl bg-[#FAF6EE] border border-[#232620]/10 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-semibold text-[#232620]">#{ord.orderNumber}</span>
                        <span className="text-xs font-medium text-[#4A5D3F]">{ord.status}</span>
                      </div>
                      <p className="text-xs text-[#5C6156]">
                        {ord.items.map((i) => `${i.name} ×${i.quantity}`).join(', ')}
                      </p>
                      <div className="flex items-center justify-between pt-1">
                        <span className="font-mono text-xs font-medium text-[#232620] tabular-nums">
                          {formatPkr(ord.totalPkr)}
                        </span>
                        <a
                          href={buildOrderTrackingWhatsAppUrl(storeConfig.whatsappNumber, ord)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[#4A5D3F] hover:underline"
                        >
                          WhatsApp Support →
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Saved Skin Routines */}
      {savedRoutines.length > 0 && (
        <section className="space-y-4 pt-6 border-t border-[#232620]/10">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-3xl font-semibold text-[#232620]">Saved Skincare Routines</h2>
            <button type="button" onClick={() => navigate({ name: 'quiz' })} className="text-xs text-[#4A5D3F] hover:underline">
              Retake Skin Quiz →
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {savedRoutines.map((rt) => (
              <div key={rt.id} className="p-5 rounded-xl bg-[#FDFBF7] border border-[#232620]/10 space-y-2">
                <p className="font-display text-2xl font-semibold text-[#232620]">{rt.title}</p>
                <p className="text-xs text-[#5C6156]">Focus: {rt.concerns.join(' · ')}</p>
                <p className="text-xs text-[#232620]">
                  Morning: {rt.morningSlugs.length} steps · Night: {rt.nightSlugs.length} steps
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Wishlist */}
      <section className="space-y-4 pt-6 border-t border-[#232620]/10">
        <h2 className="font-display text-3xl font-semibold text-[#232620]">Saved Wishlist ({wishlistProducts.length})</h2>
        {wishlistProducts.length === 0 ? (
          <p className="text-sm text-[#5C6156]">Tap the heart icon on any serum, cream, or hair elixir to save it here.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {wishlistProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>

      {/* Recently Viewed */}
      {recentProducts.length > 0 && (
        <section className="space-y-4 pt-6 border-t border-[#232620]/10">
          <h2 className="font-display text-3xl font-semibold text-[#232620]">Recently Viewed</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {recentProducts.slice(0, 3).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
