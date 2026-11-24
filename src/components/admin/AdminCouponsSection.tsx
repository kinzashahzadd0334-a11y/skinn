import { useEffect, useState } from 'react';
import { Edit3, Plus, Tag, Trash2, X } from 'lucide-react';
import type { CouponRecord, CouponScope, CouponType } from '../../types/store';
import { formatPkr } from '../../utils/commerce';
import { adminFetch, formatShortDate } from './adminApi';

interface AdminCouponsSectionProps {
  token: string;
  onStorefrontChanged: () => void;
  onToast: (msg: string) => void;
}

const EMPTY_COUPON = {
  id: '',
  code: '',
  description: '',
  discountType: 'percentage' as CouponType,
  discountValue: 10,
  minOrderAmountPkr: 0,
  maxDiscountPkr: '' as string | number,
  scope: 'all' as CouponScope,
  targetCategoriesText: '',
  startDate: '',
  expiryDate: '',
  usageLimit: '' as string | number,
  isActive: true,
  showBanner: true,
};

export function AdminCouponsSection({
  token,
  onStorefrontChanged,
  onToast,
}: AdminCouponsSectionProps) {
  const [coupons, setCoupons] = useState<CouponRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_COUPON);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminFetch<{ coupons: CouponRecord[] }>('/api/admin/coupons', token);
      setCoupons(data.coupons);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to load coupons.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => {
    setForm(EMPTY_COUPON);
    setModalOpen(true);
  };

  const openEdit = (c: CouponRecord) => {
    setForm({
      id: c.id,
      code: c.code,
      description: c.description,
      discountType: c.discountType,
      discountValue: c.discountValue,
      minOrderAmountPkr: c.minOrderAmountPkr,
      maxDiscountPkr: c.maxDiscountPkr ?? '',
      scope: c.scope,
      targetCategoriesText: (c.targetCategories || []).join(', '),
      startDate: c.startDate ? c.startDate.slice(0, 10) : '',
      expiryDate: c.expiryDate ? c.expiryDate.slice(0, 10) : '',
      usageLimit: c.usageLimit ?? '',
      isActive: c.isActive,
      showBanner: c.showBanner,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Partial<CouponRecord> = {
        code: form.code.trim().toUpperCase(),
        description: form.description.trim(),
        discountType: form.discountType,
        discountValue: form.discountType === 'free_shipping' ? 0 : Number(form.discountValue),
        minOrderAmountPkr: Number(form.minOrderAmountPkr) || 0,
        maxDiscountPkr:
          form.maxDiscountPkr === '' || Number(form.maxDiscountPkr) <= 0
            ? undefined
            : Number(form.maxDiscountPkr),
        scope: form.scope,
        targetCategories: form.targetCategoriesText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        startDate: form.startDate || undefined,
        expiryDate: form.expiryDate || undefined,
        usageLimit:
          form.usageLimit === '' || Number(form.usageLimit) <= 0 ? undefined : Number(form.usageLimit),
        isActive: form.isActive,
        showBanner: form.showBanner,
      };
      if (form.id) {
        await adminFetch(`/api/admin/coupons/${form.id}`, token, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        onToast('Coupon updated.');
      } else {
        await adminFetch('/api/admin/coupons', token, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        onToast('Coupon created.');
      }
      setModalOpen(false);
      await load();
      onStorefrontChanged();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not save coupon.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (c: CouponRecord) => {
    try {
      await adminFetch(`/api/admin/coupons/${c.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !c.isActive }),
      });
      await load();
      onStorefrontChanged();
      onToast(`Coupon ${c.code} ${!c.isActive ? 'enabled' : 'paused'}.`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not update coupon.');
    }
  };

  const handleDelete = async (c: CouponRecord) => {
    try {
      await adminFetch(`/api/admin/coupons/${c.id}`, token, { method: 'DELETE' });
      onToast(`Deleted coupon ${c.code}.`);
      await load();
      onStorefrontChanged();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not delete coupon.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-[#232620]/10">
        <div>
          <h2 className="font-display text-xl font-semibold text-[#232620]">Promotional Codes &amp; Campaigns</h2>
          <p className="text-xs text-[#5C6156]">Coupons validate directly at SQLite checkout against PKR thresholds &amp; scopes</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1C3B2B] hover:bg-[#142C20] text-[#FAF6EE] text-xs font-medium"
        >
          <Plus className="w-4 h-4" />
          <span>Create Coupon</span>
        </button>
      </div>

      <div className="bg-white rounded-xl border border-[#232620]/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-[#FAF6EE] border-b border-[#232620]/10 text-[#5C6156]">
                <th className="py-3 px-4 font-medium">Code</th>
                <th className="py-3 px-4 font-medium">Offer</th>
                <th className="py-3 px-4 font-medium">Scope &amp; Min Order</th>
                <th className="py-3 px-4 font-medium">Usage</th>
                <th className="py-3 px-4 font-medium">Expiry</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232620]/8">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[#5C6156]">
                    Loading coupons…
                  </td>
                </tr>
              ) : coupons.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[#5C6156]">
                    No coupons created yet.
                  </td>
                </tr>
              ) : (
                coupons.map((c) => (
                  <tr key={c.id} className="hover:bg-[#FAF6EE]/50">
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-[#1C3B2B] bg-[#FAF6EE] px-2.5 py-1 rounded border border-[#232620]/12">
                        <Tag className="w-3 h-3 text-[#C5A059]" />
                        {c.code}
                      </span>
                      <p className="text-[11px] text-[#5C6156] mt-1">{c.description}</p>
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-[#232620]">
                      {c.discountType === 'percentage'
                        ? `${c.discountValue}% OFF`
                        : c.discountType === 'fixed'
                        ? `${formatPkr(c.discountValue)} OFF`
                        : 'Free Shipping'}
                    </td>
                    <td className="py-3 px-4 text-[#5C6156]">
                      <p className="capitalize">{c.scope.replace('_', ' ')}</p>
                      <p className="font-mono text-[11px]">
                        Min: {c.minOrderAmountPkr > 0 ? formatPkr(c.minOrderAmountPkr) : 'None'}
                      </p>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums">
                      {c.usedCount}
                      {c.usageLimit ? ` / ${c.usageLimit}` : ' / ∞'}
                    </td>
                    <td className="py-3 px-4 text-[11px] text-[#5C6156]">
                      {c.expiryDate ? formatShortDate(c.expiryDate) : 'No expiry'}
                    </td>
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => handleToggle(c)}
                        className={`px-2 py-0.5 rounded border text-[11px] font-medium ${
                          c.isActive
                            ? 'bg-[#1C3B2B]/10 text-[#1C3B2B] border-[#1C3B2B]/25'
                            : 'bg-stone-100 text-stone-600 border-stone-200'
                        }`}
                      >
                        {c.isActive ? 'Active' : 'Paused'}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEdit(c)}
                        className="p-1.5 rounded border border-[#232620]/15 hover:bg-[#FAF6EE]"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c)}
                        className="p-1.5 rounded border border-rose-200 text-rose-700 hover:bg-rose-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-[#232620]/50 flex items-center justify-center p-4">
          <div className="bg-[#FDFBF7] w-full max-w-lg rounded-2xl border border-[#232620]/15 shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#232620]/10 flex items-center justify-between">
              <h3 className="font-display text-xl font-semibold text-[#232620]">
                {form.id ? `Edit Coupon ${form.code}` : 'Create Discount Coupon'}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1 hover:bg-[#F1EAE0] rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4 text-xs max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#232620] mb-1">Coupon Code *</label>
                  <input
                    type="text"
                    required
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    placeholder="EID20"
                    className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#232620] mb-1">Discount Type</label>
                  <select
                    value={form.discountType}
                    onChange={(e) => setForm({ ...form, discountType: e.target.value as CouponType })}
                    className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed PKR Amount</option>
                    <option value="free_shipping">Free Shipping</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#232620] mb-1">Public Description *</label>
                <input
                  type="text"
                  required
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="20% off festive skincare bundles"
                  className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-[#232620] mb-1">
                    {form.discountType === 'percentage' ? 'Percent (%)' : 'Value (PKR)'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    disabled={form.discountType === 'free_shipping'}
                    value={form.discountValue}
                    onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#232620] mb-1">Min Order (PKR)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.minOrderAmountPkr}
                    onChange={(e) => setForm({ ...form, minOrderAmountPkr: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#232620] mb-1">Max Cap (PKR)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.maxDiscountPkr}
                    onChange={(e) => setForm({ ...form, maxDiscountPkr: e.target.value })}
                    placeholder="Optional"
                    className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#232620] mb-1">Eligibility Scope</label>
                  <select
                    value={form.scope}
                    onChange={(e) => setForm({ ...form, scope: e.target.value as CouponScope })}
                    className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white"
                  >
                    <option value="all">All Products</option>
                    <option value="category">Specific Categories</option>
                    <option value="first_order">First-Time Order Only</option>
                    <option value="seasonal">Seasonal Offer</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-[#232620] mb-1">Usage Limit</label>
                  <input
                    type="number"
                    min={0}
                    value={form.usageLimit}
                    onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
                    placeholder="Unlimited"
                    className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white font-mono"
                  />
                </div>
              </div>

              {form.scope === 'category' && (
                <div>
                  <label className="block font-medium text-[#232620] mb-1">
                    Target Categories (comma separated)
                  </label>
                  <input
                    type="text"
                    value={form.targetCategoriesText}
                    onChange={(e) => setForm({ ...form, targetCategoriesText: e.target.value })}
                    placeholder="Serums, Hair Oils"
                    className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#232620] mb-1">Start Date</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#232620] mb-1">Expiry Date</label>
                  <input
                    type="date"
                    value={form.expiryDate}
                    onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-5 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    className="accent-[#1C3B2B]"
                  />
                  <span>Active immediately</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.showBanner}
                    onChange={(e) => setForm({ ...form, showBanner: e.target.checked })}
                    className="accent-[#1C3B2B]"
                  />
                  <span>Show in storefront promo hints</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#232620]/10">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg border border-[#232620]/15">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-[#1C3B2B] text-[#FAF6EE] font-medium">
                  {saving ? 'Saving...' : 'Save Coupon'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
