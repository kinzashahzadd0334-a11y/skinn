import { useEffect, useState } from 'react';
import { Eye, MessageCircle, Printer, Search, X } from 'lucide-react';
import type { OrderRecord, OrderStatus } from '../../types/store';
import { formatPkr } from '../../utils/commerce';
import { adminFetch, formatShortDateTime, getOrderStatusBadgeClass } from './adminApi';

interface AdminOrdersSectionProps {
  token: string;
  onStorefrontChanged: () => void;
  onToast: (msg: string) => void;
}

const ORDER_STATUSES: OrderStatus[] = [
  'Pending',
  'Confirmed',
  'Processing',
  'Shipped',
  'Out for Delivery',
  'Delivered',
  'Cancelled',
  'Returned',
];

export function AdminOrdersSection({
  token,
  onStorefrontChanged,
  onToast,
}: AdminOrdersSectionProps) {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'cod' | 'whatsapp'>('all');

  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const [statusNote, setStatusNote] = useState('');
  const [internalNotesDraft, setInternalNotesDraft] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      if (paymentFilter !== 'all') qs.set('paymentMethod', paymentFilter);
      if (search.trim()) qs.set('q', search.trim());
      const data = await adminFetch<{ orders: OrderRecord[] }>(`/api/admin/orders?${qs.toString()}`, token);
      setOrders(data.orders);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to load orders.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [token, statusFilter, paymentFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const openDetails = (order: OrderRecord) => {
    setSelectedOrder(order);
    setInternalNotesDraft(order.internalNotes || '');
    setStatusNote('');
  };

  const handleStatusChange = async (orderId: string, nextStatus: OrderStatus) => {
    setUpdatingStatus(true);
    try {
      const data = await adminFetch<{ order: OrderRecord }>(`/api/admin/orders/${orderId}/status`, token, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus, note: statusNote.trim() || undefined }),
      });
      setOrders((prev) => prev.map((o) => (o.id === orderId ? data.order : o)));
      if (selectedOrder?.id === orderId) setSelectedOrder(data.order);
      setStatusNote('');
      onStorefrontChanged();
      onToast(`Order ${data.order.orderNumber} updated to ${nextStatus}.`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Status update failed.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedOrder) return;
    try {
      const data = await adminFetch<{ order: OrderRecord }>(
        `/api/admin/orders/${selectedOrder.id}/notes`,
        token,
        {
          method: 'PATCH',
          body: JSON.stringify({ internalNotes: internalNotesDraft }),
        },
      );
      setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? data.order : o)));
      setSelectedOrder(data.order);
      onToast('Internal notes saved.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not save notes.');
    }
  };

  const filteredLocal = orders.filter((o) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return `${o.orderNumber} ${o.customerName} ${o.customerPhone} ${o.shippingAddress.city}`
      .toLowerCase()
      .includes(q);
  });

  const cleanWaPhone = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('0')) return `92${digits.slice(1)}`;
    return digits;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-[#232620]/10 no-print">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search className="w-4 h-4 text-[#5C6156] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search order #, customer, phone, city..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-xs"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | OrderStatus)}
            className="px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-xs"
          >
            <option value="all">All Order Statuses</option>
            {ORDER_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value as 'all' | 'cod' | 'whatsapp')}
            className="px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-xs"
          >
            <option value="all">All Payment Methods</option>
            <option value="cod">Cash on Delivery</option>
            <option value="whatsapp">WhatsApp + COD</option>
          </select>
        </div>
        <span className="text-xs text-[#5C6156] font-mono tabular-nums">{filteredLocal.length} orders</span>
      </div>

      <div className="bg-white rounded-xl border border-[#232620]/10 overflow-hidden no-print">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-[#FAF6EE] border-b border-[#232620]/10 text-[#5C6156]">
                <th className="py-3 px-4 font-medium">Order ID</th>
                <th className="py-3 px-4 font-medium">Customer</th>
                <th className="py-3 px-4 font-medium">Items</th>
                <th className="py-3 px-4 font-medium">Total (PKR)</th>
                <th className="py-3 px-4 font-medium">Payment</th>
                <th className="py-3 px-4 font-medium">Date</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232620]/8">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[#5C6156]">
                    Loading orders…
                  </td>
                </tr>
              ) : filteredLocal.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[#5C6156]">
                    No orders match your filter.
                  </td>
                </tr>
              ) : (
                filteredLocal.map((order) => (
                  <tr key={order.id} className="hover:bg-[#FAF6EE]/50">
                    <td className="py-3 px-4 font-mono font-semibold text-[#232620]">{order.orderNumber}</td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-[#232620]">{order.customerName}</p>
                      <p className="text-[11px] text-[#5C6156]">
                        {order.customerPhone} · {order.shippingAddress.city}
                      </p>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums">
                      {order.items.reduce((s, i) => s + i.quantity, 0)} items
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold tabular-nums">
                      {formatPkr(order.totalPkr)}
                    </td>
                    <td className="py-3 px-4 uppercase text-[11px] text-[#5C6156]">
                      {order.paymentMethod === 'whatsapp' ? 'WhatsApp' : 'COD'}
                    </td>
                    <td className="py-3 px-4 text-[11px] text-[#5C6156] whitespace-nowrap">
                      {formatShortDateTime(order.createdAt)}
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={order.status}
                        disabled={updatingStatus}
                        onChange={(e) => handleStatusChange(order.id, e.target.value as OrderStatus)}
                        className={`px-2 py-1 rounded border text-[11px] font-medium ${getOrderStatusBadgeClass(
                          order.status,
                        )}`}
                      >
                        {ORDER_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => openDetails(order)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[#232620]/15 hover:bg-[#FAF6EE]"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order Details Slide-Over Drawer (also serves as printable invoice when open) */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-[#232620]/50 flex justify-end">
          <div className="bg-[#FDFBF7] w-full max-w-xl h-full overflow-y-auto p-6 space-y-6 border-l border-[#232620]/15 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-[#232620]/10 pb-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#C5A059]">
                  Aurelia Botanica Invoice &amp; Dispatch
                </p>
                <h2 className="font-display text-2xl font-semibold text-[#232620]">
                  Order #{selectedOrder.orderNumber}
                </h2>
                <p className="text-xs text-[#5C6156]">Placed {formatShortDateTime(selectedOrder.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2 no-print">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#232620]/15 bg-white hover:bg-[#FAF6EE] text-xs font-medium"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Invoice
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="p-1.5 rounded-lg hover:bg-[#F1EAE0]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Customer & Address */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 rounded-xl bg-white border border-[#232620]/10 space-y-1">
                <p className="font-semibold text-[#232620]">Customer Details</p>
                <p>{selectedOrder.customerName}</p>
                <p className="font-mono text-[#5C6156]">{selectedOrder.customerPhone}</p>
                {selectedOrder.customerEmail && <p className="text-[#5C6156]">{selectedOrder.customerEmail}</p>}
                <a
                  href={`https://wa.me/${cleanWaPhone(selectedOrder.customerPhone)}?text=${encodeURIComponent(
                    `Assalam-o-Alaikum ${selectedOrder.customerName}, regarding your Aurelia Botanica order #${selectedOrder.orderNumber} (${selectedOrder.status}).`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="no-print inline-flex items-center gap-1 pt-1 text-[#1C3B2B] font-semibold hover:underline"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  WhatsApp Customer
                </a>
              </div>
              <div className="p-3.5 rounded-xl bg-white border border-[#232620]/10 space-y-1">
                <p className="font-semibold text-[#232620]">Shipping Address</p>
                <p>{selectedOrder.shippingAddress.street}</p>
                <p className="text-[#5C6156]">
                  {selectedOrder.shippingAddress.area ? `${selectedOrder.shippingAddress.area}, ` : ''}
                  {selectedOrder.shippingAddress.city} {selectedOrder.shippingAddress.postalCode}
                </p>
                {selectedOrder.shippingAddress.notes && (
                  <p className="text-[11px] text-[#4A5D3F]">Note: {selectedOrder.shippingAddress.notes}</p>
                )}
              </div>
            </div>

            {/* Items & Totals */}
            <div className="p-4 rounded-xl bg-white border border-[#232620]/10 space-y-3 text-xs">
              <p className="font-semibold text-[#232620]">Line Items</p>
              <div className="divide-y divide-[#232620]/8">
                {selectedOrder.items.map((item) => (
                  <div key={item.productId} className="py-2 flex items-center justify-between gap-2">
                    <span>
                      {item.name} ({item.volume}) × <strong className="font-mono">{item.quantity}</strong>
                    </span>
                    <span className="font-mono tabular-nums font-medium">
                      {formatPkr(item.unitPricePkr * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="pt-2 border-t border-[#232620]/10 space-y-1 text-[#5C6156]">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums">{formatPkr(selectedOrder.subtotalPkr)}</span>
                </div>
                {selectedOrder.discountPkr > 0 && (
                  <div className="flex justify-between text-[#1C3B2B]">
                    <span>Discount ({selectedOrder.couponCode})</span>
                    <span className="font-mono tabular-nums">-{formatPkr(selectedOrder.discountPkr)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Shipping</span>
                  <span className="font-mono tabular-nums">{formatPkr(selectedOrder.shippingPkr)}</span>
                </div>
                {(selectedOrder.taxPkr || 0) > 0 && (
                  <div className="flex justify-between">
                    <span>Tax</span>
                    <span className="font-mono tabular-nums">{formatPkr(selectedOrder.taxPkr || 0)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-sm text-[#232620] pt-1 border-t border-[#232620]/10">
                  <span>Total Payable</span>
                  <span className="font-mono tabular-nums">{formatPkr(selectedOrder.totalPkr)}</span>
                </div>
              </div>
            </div>

            {/* Status Update + History */}
            <div className="p-4 rounded-xl bg-white border border-[#232620]/10 space-y-3 text-xs no-print">
              <p className="font-semibold text-[#232620]">Update Order Status</p>
              <p className="text-[11px] text-[#5C6156]">
                Setting status to Cancelled or Returned automatically restores unit quantities into SQLite stock.
              </p>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  placeholder="Optional tracking / transition note..."
                  className="flex-1 px-3 py-1.5 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
                />
                <select
                  value={selectedOrder.status}
                  onChange={(e) => handleStatusChange(selectedOrder.id, e.target.value as OrderStatus)}
                  className="px-3 py-1.5 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] font-medium"
                >
                  {ORDER_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedOrder.statusHistory && selectedOrder.statusHistory.length > 0 && (
              <div className="p-4 rounded-xl bg-white border border-[#232620]/10 space-y-2 text-xs">
                <p className="font-semibold text-[#232620]">Status History</p>
                <div className="space-y-1.5">
                  {selectedOrder.statusHistory.map((h, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px]">
                      <span>
                        <strong className="text-[#1C3B2B]">{h.status}</strong>
                        {h.note ? ` — ${h.note}` : ''}
                      </span>
                      <span className="text-[#5C6156]">
                        {h.changedBy ? `${h.changedBy} · ` : ''}
                        {formatShortDateTime(h.changedAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Internal Notes */}
            <div className="p-4 rounded-xl bg-white border border-[#232620]/10 space-y-2 text-xs no-print">
              <p className="font-semibold text-[#232620]">Internal Admin Notes</p>
              <textarea
                rows={2}
                value={internalNotesDraft}
                onChange={(e) => setInternalNotesDraft(e.target.value)}
                placeholder="Courier tracking ID, verification call notes..."
                className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
              />
              <button
                type="button"
                onClick={handleSaveNotes}
                className="px-3.5 py-1.5 rounded-lg bg-[#1C3B2B] text-[#FAF6EE] font-medium"
              >
                Save Notes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
