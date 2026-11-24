import { useEffect, useState } from 'react';
import { Eye, Mail, MessageCircle, Search, X } from 'lucide-react';
import type { CustomerSummaryRecord } from '../../types/store';
import { formatPkr } from '../../utils/commerce';
import { adminFetch, formatShortDate } from './adminApi';

interface AdminCustomersSectionProps {
  token: string;
  onToast: (msg: string) => void;
}

export function AdminCustomersSection({ token, onToast }: AdminCustomersSectionProps) {
  const [customers, setCustomers] = useState<CustomerSummaryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CustomerSummaryRecord | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminFetch<{ customers: CustomerSummaryRecord[] }>('/api/admin/customers', token);
      setCustomers(data.customers);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to load customers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleActive = async (cust: CustomerSummaryRecord) => {
    try {
      const next = cust.isActive === false;
      const data = await adminFetch<{ customer: CustomerSummaryRecord }>(
        `/api/admin/customers/${cust.id}/status`,
        token,
        {
          method: 'PATCH',
          body: JSON.stringify({ isActive: next }),
        },
      );
      if (data.customer) {
        setCustomers((prev) => prev.map((c) => (c.id === cust.id ? data.customer : c)));
        if (selected?.id === cust.id) setSelected(data.customer);
      }
      onToast(`Customer account ${next ? 'activated' : 'suspended'}.`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Action not permitted or failed.');
    }
  };

  const filtered = customers.filter((c) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return `${c.name} ${c.email} ${c.phone}`.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-[#232620]/10">
        <div className="relative min-w-[240px] flex-1 max-w-sm">
          <Search className="w-4 h-4 text-[#5C6156] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer name, email, phone..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-xs"
          />
        </div>
        <span className="text-xs font-mono text-[#5C6156] tabular-nums">{filtered.length} customers</span>
      </div>

      <div className="bg-white rounded-xl border border-[#232620]/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-[#FAF6EE] border-b border-[#232620]/10 text-[#5C6156]">
                <th className="py-3 px-4 font-medium">Customer</th>
                <th className="py-3 px-4 font-medium">Phone</th>
                <th className="py-3 px-4 font-medium">Orders</th>
                <th className="py-3 px-4 font-medium">Total Spent</th>
                <th className="py-3 px-4 font-medium">Joined</th>
                <th className="py-3 px-4 font-medium">Account</th>
                <th className="py-3 px-4 font-medium text-right">Profile</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232620]/8">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[#5C6156]">
                    Loading customer directory…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[#5C6156]">
                    No registered customers found.
                  </td>
                </tr>
              ) : (
                filtered.map((cust) => {
                  const active = cust.isActive !== false;
                  return (
                    <tr key={cust.id} className="hover:bg-[#FAF6EE]/50">
                      <td className="py-3 px-4">
                        <p className="font-semibold text-[#232620]">{cust.name}</p>
                        <p className="text-[11px] text-[#5C6156]">{cust.email}</p>
                      </td>
                      <td className="py-3 px-4 font-mono text-[#232620]">{cust.phone || '—'}</td>
                      <td className="py-3 px-4 font-mono tabular-nums">{cust.orderCount}</td>
                      <td className="py-3 px-4 font-mono font-semibold tabular-nums text-[#1C3B2B]">
                        {formatPkr(cust.totalSpentPkr)}
                      </td>
                      <td className="py-3 px-4 text-[11px] text-[#5C6156]">{formatShortDate(cust.createdAt)}</td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(cust)}
                          className={`px-2 py-0.5 rounded border text-[11px] font-medium ${
                            active
                              ? 'bg-[#1C3B2B]/10 text-[#1C3B2B] border-[#1C3B2B]/25'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {active ? 'Active' : 'Suspended'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setSelected(cust)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[#232620]/15 hover:bg-[#FAF6EE]"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 bg-[#232620]/50 flex justify-end">
          <div className="bg-[#FDFBF7] w-full max-w-lg h-full overflow-y-auto p-6 space-y-5 border-l border-[#232620]/15 shadow-2xl text-xs">
            <div className="flex items-start justify-between border-b border-[#232620]/10 pb-4">
              <div>
                <h2 className="font-display text-2xl font-semibold text-[#232620]">{selected.name}</h2>
                <p className="text-[#5C6156]">{selected.email} · {selected.phone || 'No phone'}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-[#F1EAE0]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-white border border-[#232620]/10">
                <p className="text-[#5C6156]">Orders</p>
                <p className="font-mono text-lg font-semibold text-[#232620] tabular-nums">{selected.orderCount}</p>
              </div>
              <div className="p-3 rounded-xl bg-white border border-[#232620]/10">
                <p className="text-[#5C6156]">Lifetime Spend</p>
                <p className="font-mono text-lg font-semibold text-[#1C3B2B] tabular-nums">
                  {formatPkr(selected.totalSpentPkr)}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-white border border-[#232620]/10">
                <p className="text-[#5C6156]">Routines / Wish</p>
                <p className="font-mono text-lg font-semibold text-[#232620] tabular-nums">
                  {selected.savedRoutines.length} / {selected.wishlistIds.length}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <a
                href={`mailto:${selected.email}`}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-[#232620]/15 hover:bg-[#FAF6EE]"
              >
                <Mail className="w-3.5 h-3.5 text-[#1C3B2B]" />
                <span>Email Customer</span>
              </a>
              {selected.phone && (
                <a
                  href={`https://wa.me/${selected.phone.replace(/\D/g, '').replace(/^0/, '92')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1C3B2B] text-[#FAF6EE]"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>WhatsApp Customer</span>
                </a>
              )}
            </div>

            <div className="p-4 rounded-xl bg-white border border-[#232620]/10 space-y-2">
              <p className="font-semibold text-[#232620]">Saved Addresses ({selected.savedAddresses.length})</p>
              {selected.savedAddresses.length === 0 ? (
                <p className="text-[#5C6156]">No saved addresses.</p>
              ) : (
                selected.savedAddresses.map((addr) => (
                  <div key={addr.id} className="p-2.5 rounded-lg bg-[#FAF6EE] text-[11px]">
                    <p className="font-semibold">{addr.label} · {addr.fullName}</p>
                    <p className="text-[#5C6156]">{addr.street}, {addr.area}, {addr.city}</p>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 rounded-xl bg-white border border-[#232620]/10 space-y-2">
              <p className="font-semibold text-[#232620]">Order History</p>
              {!selected.orders || selected.orders.length === 0 ? (
                <p className="text-[#5C6156]">No orders associated with this account yet.</p>
              ) : (
                <div className="space-y-2">
                  {selected.orders.map((ord) => (
                    <div key={ord.id} className="p-2.5 rounded-lg bg-[#FAF6EE] flex items-center justify-between">
                      <div>
                        <p className="font-mono font-semibold text-[#232620]">{ord.orderNumber}</p>
                        <p className="text-[11px] text-[#5C6156]">{formatShortDate(ord.createdAt)} · {ord.status}</p>
                      </div>
                      <span className="font-mono font-semibold tabular-nums">{formatPkr(ord.totalPkr)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
