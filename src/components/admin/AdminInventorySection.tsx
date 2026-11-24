import { useEffect, useState } from 'react';
import { AlertTriangle, History, Sliders, X } from 'lucide-react';
import type { Product, StockHistoryEntry } from '../../types/store';
import { formatPkr, getEffectivePrice } from '../../utils/commerce';
import { adminFetch, formatShortDateTime } from './adminApi';

interface AdminInventorySectionProps {
  token: string;
  onStorefrontChanged: () => void;
  onToast: (msg: string) => void;
}

export function AdminInventorySection({
  token,
  onStorefrontChanged,
  onToast,
}: AdminInventorySectionProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [history, setHistory] = useState<StockHistoryEntry[]>([]);
  const [threshold, setThreshold] = useState(8);
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all');
  const [loading, setLoading] = useState(true);

  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null);
  const [newStock, setNewStock] = useState(0);
  const [reason, setReason] = useState('Supplier restock batch');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminFetch<{
        products: Product[];
        lowStockThreshold: number;
        history: StockHistoryEntry[];
      }>('/api/admin/inventory', token);
      setProducts(data.products);
      setThreshold(data.lowStockThreshold);
      setHistory(data.history);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to load inventory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveThreshold = async () => {
    try {
      const data = await adminFetch<{ lowStockThreshold: number }>('/api/admin/inventory/threshold', token, {
        method: 'PATCH',
        body: JSON.stringify({ lowStockThreshold: Number(threshold) }),
      });
      setThreshold(data.lowStockThreshold);
      onToast(`Low stock threshold set to ${data.lowStockThreshold} units.`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not update threshold.');
    }
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustTarget) return;
    setSaving(true);
    try {
      const data = await adminFetch<{ product: Product; history: StockHistoryEntry[] }>(
        '/api/admin/inventory/adjust',
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            productId: adjustTarget.id,
            newStock: Number(newStock),
            reason: reason.trim() || 'Manual inventory adjustment',
          }),
        },
      );
      setProducts((prev) => prev.map((p) => (p.id === data.product.id ? data.product : p)));
      setHistory(data.history);
      setAdjustTarget(null);
      onStorefrontChanged();
      onToast(`Stock for ${data.product.name} updated to ${data.product.stock} units.`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Adjustment failed.');
    } finally {
      setSaving(false);
    }
  };

  const filtered = products.filter((p) => {
    if (filter === 'out') return p.stock === 0;
    if (filter === 'low') return p.stock <= threshold;
    return true;
  });

  const lowCount = products.filter((p) => p.stock > 0 && p.stock <= threshold).length;
  const outCount = products.filter((p) => p.stock === 0).length;
  const totalValuation = products.reduce(
    (sum, p) => sum + getEffectivePrice(p.pricePkr, p.discountPricePkr) * p.stock,
    0,
  );

  return (
    <div className="space-y-6">
      {/* Top KPI + Threshold bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white border border-[#232620]/10">
          <p className="text-xs text-[#5C6156]">Total Units on Hand</p>
          <p className="font-mono text-2xl font-semibold text-[#232620] tabular-nums mt-1">
            {products.reduce((s, p) => s + p.stock, 0).toLocaleString('en-PK')}
          </p>
        </div>
        <div className="p-4 rounded-xl bg-white border border-[#232620]/10">
          <p className="text-xs text-[#5C6156]">Low / Out of Stock</p>
          <p className="font-mono text-2xl font-semibold text-amber-800 tabular-nums mt-1">
            {lowCount} / <span className="text-rose-700">{outCount}</span>
          </p>
        </div>
        <div className="p-4 rounded-xl bg-white border border-[#232620]/10">
          <p className="text-xs text-[#5C6156]">Inventory Retail Value</p>
          <p className="font-mono text-2xl font-semibold text-[#1C3B2B] tabular-nums mt-1">
            {formatPkr(totalValuation)}
          </p>
        </div>
        <div className="p-4 rounded-xl bg-white border border-[#232620]/10 space-y-1.5">
          <label className="text-xs font-medium text-[#232620] block">Low-Stock Alert Threshold</label>
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              max={500}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-20 px-2.5 py-1.5 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-xs font-mono"
            />
            <button
              type="button"
              onClick={handleSaveThreshold}
              className="px-3 py-1.5 rounded-lg bg-[#1C3B2B] text-[#FAF6EE] text-xs font-medium"
            >
              Update
            </button>
          </div>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { id: 'all', label: `All SKUs (${products.length})` },
          { id: 'low', label: `Low & Out (${products.filter((p) => p.stock <= threshold).length})` },
          { id: 'out', label: `Out of Stock (${outCount})` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id as typeof filter)}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors ${
              filter === tab.id
                ? 'bg-[#1C3B2B] text-[#FAF6EE]'
                : 'bg-white border border-[#232620]/10 text-[#232620] hover:bg-[#FAF6EE]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Stock Table */}
      <div className="bg-white rounded-xl border border-[#232620]/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-[#FAF6EE] border-b border-[#232620]/10 text-[#5C6156]">
                <th className="py-3 px-4 font-medium">SKU</th>
                <th className="py-3 px-4 font-medium">Product</th>
                <th className="py-3 px-4 font-medium">Category</th>
                <th className="py-3 px-4 font-medium">Stock Level</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium text-right">Adjust</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232620]/8">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-[#5C6156]">
                    Loading inventory…
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-[#FAF6EE]/50">
                    <td className="py-3 px-4 font-mono text-[11px] text-[#5C6156]">{p.sku || '—'}</td>
                    <td className="py-3 px-4 font-semibold text-[#232620]">{p.name}</td>
                    <td className="py-3 px-4 text-[#5C6156]">{p.category}</td>
                    <td className="py-3 px-4 font-mono font-semibold tabular-nums">{p.stock} units</td>
                    <td className="py-3 px-4">
                      {p.stock === 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-medium">
                          <AlertTriangle className="w-3 h-3" /> Out of Stock
                        </span>
                      ) : p.stock <= threshold ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-medium">
                          Low Stock
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded bg-[#1C3B2B]/10 text-[#1C3B2B] text-[11px] font-medium">
                          Healthy
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setAdjustTarget(p);
                          setNewStock(p.stock);
                          setReason('Supplier restock batch');
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#232620]/15 hover:bg-[#FAF6EE] font-medium"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span>Adjust</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock History Audit Ledger */}
      <div className="bg-white rounded-xl border border-[#232620]/10 overflow-hidden">
        <div className="px-5 py-3.5 bg-[#FAF6EE] border-b border-[#232620]/10 flex items-center gap-2">
          <History className="w-4 h-4 text-[#1C3B2B]" />
          <h2 className="font-display text-xl font-semibold text-[#232620]">Stock Change Audit Ledger</h2>
        </div>
        <div className="overflow-x-auto max-h-80">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#232620]/10 text-[#5C6156]">
                <th className="py-2.5 px-4 font-medium">Time</th>
                <th className="py-2.5 px-4 font-medium">Product</th>
                <th className="py-2.5 px-4 font-medium">Delta</th>
                <th className="py-2.5 px-4 font-medium">Before → After</th>
                <th className="py-2.5 px-4 font-medium">Reason</th>
                <th className="py-2.5 px-4 font-medium">Actor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232620]/8">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#5C6156]">
                    No inventory movements logged yet.
                  </td>
                </tr>
              ) : (
                history.map((h) => (
                  <tr key={h.id}>
                    <td className="py-2.5 px-4 text-[11px] text-[#5C6156] whitespace-nowrap">
                      {formatShortDateTime(h.createdAt)}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-[#232620]">{h.productName}</td>
                    <td
                      className={`py-2.5 px-4 font-mono font-semibold tabular-nums ${
                        h.delta >= 0 ? 'text-[#1C3B2B]' : 'text-rose-700'
                      }`}
                    >
                      {h.delta >= 0 ? `+${h.delta}` : h.delta}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-[#5C6156]">
                      {h.previousStock} → {h.newStock}
                    </td>
                    <td className="py-2.5 px-4 text-[#232620]">{h.reason}</td>
                    <td className="py-2.5 px-4 text-[11px] text-[#5C6156]">{h.actorEmail}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Adjust Modal */}
      {adjustTarget && (
        <div className="fixed inset-0 z-50 bg-[#232620]/50 flex items-center justify-center p-4">
          <div className="bg-[#FDFBF7] w-full max-w-md rounded-2xl border border-[#232620]/15 shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#232620]/10 flex items-center justify-between">
              <h3 className="font-display text-xl font-semibold text-[#232620]">Adjust Stock</h3>
              <button type="button" onClick={() => setAdjustTarget(null)} className="p-1 hover:bg-[#F1EAE0] rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAdjustSubmit} className="p-5 space-y-4 text-xs">
              <div className="p-3 rounded-lg bg-[#FAF6EE] border border-[#232620]/10">
                <p className="font-semibold text-[#232620]">{adjustTarget.name}</p>
                <p className="text-[#5C6156] mt-0.5">
                  Current Stock: <strong className="font-mono">{adjustTarget.stock}</strong> units
                </p>
              </div>
              <div>
                <label className="block font-medium text-[#232620] mb-1">New Stock Quantity *</label>
                <input
                  type="number"
                  required
                  min={0}
                  value={newStock}
                  onChange={(e) => setNewStock(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-[#232620] mb-1">Adjustment Reason *</label>
                <input
                  type="text"
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Restock batch, damaged units, physical audit..."
                  className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-[#232620]/10">
                <button type="button" onClick={() => setAdjustTarget(null)} className="px-4 py-2 rounded-lg border border-[#232620]/15">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-[#1C3B2B] text-[#FAF6EE] font-medium">
                  {saving ? 'Updating...' : 'Save Stock Level'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
