import { useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Box,
  CheckCircle2,
  Clock,
  Headphones,
  Package,
  Plus,
  ShoppingBag,
  Tag,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { motion } from 'motion/react';
import type { AdminOverviewStats, AdminSectionId } from '../../types/store';
import { formatPkr } from '../../utils/commerce';
import { formatShortDateTime, getOrderStatusBadgeClass } from './adminApi';

interface AdminDashboardSectionProps {
  overview: AdminOverviewStats | null;
  loading: boolean;
  onNavigateSection: (section: AdminSectionId) => void;
}

const PIE_COLORS = ['#1C3B2B', '#4A5D3F', '#C5A059', '#7B8D72', '#B4695A', '#5C6156', '#2D5943', '#D4B068'];

export function AdminDashboardSection({
  overview,
  loading,
  onNavigateSection,
}: AdminDashboardSectionProps) {
  const [salesWindow, setSalesWindow] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly');

  if (loading && !overview) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div key={idx} className="h-28 rounded-xl bg-white border border-[#232620]/10 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="p-8 rounded-xl bg-white border border-[#232620]/10 text-center text-sm text-[#5C6156]">
        Unable to load dashboard metrics. Try refreshing above.
      </div>
    );
  }

  const windowValue =
    salesWindow === 'daily'
      ? overview.salesWindows.dailyPkr
      : salesWindow === 'weekly'
      ? overview.salesWindows.weeklyPkr
      : salesWindow === 'monthly'
      ? overview.salesWindows.monthlyPkr
      : overview.salesWindows.yearlyPkr;

  const kpiCards = [
    {
      label: 'Total Revenue',
      value: formatPkr(overview.totalRevenuePkr),
      sub: `${overview.revenueGrowthPercent >= 0 ? '+' : ''}${overview.revenueGrowthPercent}% vs prior 30d`,
      icon: TrendingUp,
      accent: 'text-[#1C3B2B] bg-[#1C3B2B]/8',
      section: 'analytics' as AdminSectionId,
    },
    {
      label: 'Total Orders',
      value: overview.totalOrders.toLocaleString('en-PK'),
      sub: `${overview.pendingOrdersCount} awaiting fulfillment`,
      icon: ShoppingBag,
      accent: 'text-[#4A5D3F] bg-[#4A5D3F]/10',
      section: 'orders' as AdminSectionId,
    },
    {
      label: 'Total Products',
      value: overview.totalProducts.toLocaleString('en-PK'),
      sub: 'Active catalog SKUs',
      icon: Package,
      accent: 'text-[#1C3B2B] bg-[#1C3B2B]/8',
      section: 'products' as AdminSectionId,
    },
    {
      label: 'Total Customers',
      value: overview.totalCustomers.toLocaleString('en-PK'),
      sub: 'Registered accounts',
      icon: Users,
      accent: 'text-[#4A5D3F] bg-[#4A5D3F]/10',
      section: 'customers' as AdminSectionId,
    },
    {
      label: 'Pending / Active',
      value: overview.pendingOrdersCount.toLocaleString('en-PK'),
      sub: 'Pending through Out for Delivery',
      icon: Clock,
      accent: 'text-amber-700 bg-amber-50',
      section: 'orders' as AdminSectionId,
    },
    {
      label: 'Delivered Orders',
      value: overview.deliveredOrdersCount.toLocaleString('en-PK'),
      sub: 'Successfully fulfilled COD',
      icon: CheckCircle2,
      accent: 'text-[#1C3B2B] bg-[#1C3B2B]/8',
      section: 'orders' as AdminSectionId,
    },
    {
      label: 'Low Stock Alerts',
      value: overview.lowStockProducts.length.toLocaleString('en-PK'),
      sub: overview.lowStockProducts.length > 0 ? 'Needs restock attention' : 'All stock healthy',
      icon: AlertTriangle,
      accent:
        overview.lowStockProducts.length > 0 ? 'text-rose-700 bg-rose-50' : 'text-[#4A5D3F] bg-[#4A5D3F]/10',
      section: 'inventory' as AdminSectionId,
    },
    {
      label: 'Department Split',
      value: formatPkr(overview.departmentSplit.skincareRevenuePkr),
      sub: `Haircare: ${formatPkr(overview.departmentSplit.haircareRevenuePkr)}`,
      icon: Box,
      accent: 'text-[#7A5D20] bg-[#C5A059]/15',
      section: 'analytics' as AdminSectionId,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Quick Actions Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-[#232620]/10 rounded-xl px-4 py-3">
        <div>
          <p className="text-xs font-semibold text-[#232620]">Store Operations Command</p>
          <p className="text-[11px] text-[#5C6156]">Real-time SQLite ledger across orders, inventory, 3D Atelier &amp; AI</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigateSection('products')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1C3B2B] hover:bg-[#142C20] text-[#FAF6EE] text-xs font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Product
          </button>
          <button
            type="button"
            onClick={() => onNavigateSection('coupons')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAF6EE] hover:bg-[#F1EAE0] border border-[#232620]/12 text-[#232620] text-xs font-medium"
          >
            <Tag className="w-3.5 h-3.5 text-[#4A5D3F]" />
            Create Coupon
          </button>
          <button
            type="button"
            onClick={() => onNavigateSection('studio3d')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAF6EE] hover:bg-[#F1EAE0] border border-[#232620]/12 text-[#232620] text-xs font-medium"
          >
            <Box className="w-3.5 h-3.5 text-[#C5A059]" />
            3D Studio
          </button>
          <button
            type="button"
            onClick={() => onNavigateSection('support')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAF6EE] hover:bg-[#F1EAE0] border border-[#232620]/12 text-[#232620] text-xs font-medium"
          >
            <Headphones className="w-3.5 h-3.5 text-[#4A5D3F]" />
            Support Inbox
          </button>
        </div>
      </div>

      {/* 8 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.button
              key={card.label}
              type="button"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.03 }}
              onClick={() => onNavigateSection(card.section)}
              className="text-left p-4 rounded-xl bg-white border border-[#232620]/10 hover:border-[#1C3B2B]/35 transition-colors flex flex-col justify-between gap-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#5C6156]">{card.label}</span>
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${card.accent}`}>
                  <Icon className="w-4 h-4" />
                </span>
              </div>
              <div>
                <p className="font-mono text-xl font-semibold text-[#232620] tabular-nums">{card.value}</p>
                <p className="text-[11px] text-[#5C6156] mt-0.5 truncate">{card.sub}</p>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Charts Row 1: Sales Trend + Order Status Pie */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-8 p-5 rounded-xl bg-white border border-[#232620]/10 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold text-[#232620]">Revenue &amp; Department Trend</h2>
              <p className="text-xs text-[#5C6156]">
                Selected window ({salesWindow}):{' '}
                <strong className="font-mono text-[#1C3B2B] tabular-nums">{formatPkr(windowValue)}</strong>
              </p>
            </div>
            <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-[#FAF6EE] border border-[#232620]/10">
              {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setSalesWindow(w)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                    salesWindow === w ? 'bg-[#1C3B2B] text-[#FAF6EE]' : 'text-[#5C6156] hover:text-[#232620]'
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={overview.salesTrend}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1C3B2B" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#1C3B2B" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E1D3" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#5C6156' }} />
                <YAxis tick={{ fontSize: 11, fill: '#5C6156' }} />
                <Tooltip
                  formatter={(val) => formatPkr(Number(val || 0))}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #E2D8C7', fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="revenuePkr" name="Total Revenue" stroke="#1C3B2B" strokeWidth={2} fill="url(#revGrad)" />
                <Area type="monotone" dataKey="skincarePkr" name="Skincare" stroke="#4A5D3F" strokeWidth={1.5} fill="none" />
                <Area type="monotone" dataKey="haircarePkr" name="Haircare" stroke="#C5A059" strokeWidth={1.5} fill="none" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="xl:col-span-4 p-5 rounded-xl bg-white border border-[#232620]/10 space-y-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-[#232620]">Order Status Split</h2>
            <p className="text-xs text-[#5C6156]">Live fulfillment lifecycle counts</p>
          </div>
          {overview.orderStatusBreakdown.length === 0 ? (
            <p className="text-xs text-[#5C6156] py-16 text-center">No orders recorded yet.</p>
          ) : (
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={overview.orderStatusBreakdown}
                    dataKey="count"
                    nameKey="status"
                    innerRadius={44}
                    outerRadius={76}
                    paddingAngle={2}
                  >
                    {overview.orderStatusBreakdown.map((entry, index) => (
                      <Cell key={entry.status} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            {overview.orderStatusBreakdown.map((entry, idx) => (
              <div key={entry.status} className="flex items-center justify-between px-2 py-1 rounded bg-[#FAF6EE]">
                <span className="flex items-center gap-1.5 truncate text-[#232620]">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                  />
                  {entry.status}
                </span>
                <span className="font-mono font-semibold tabular-nums">{entry.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Charts Row 2: Category Sales Bar + Customer Growth */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="p-5 rounded-xl bg-white border border-[#232620]/10 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl font-semibold text-[#232620]">Top Category Revenue</h2>
              <p className="text-xs text-[#5C6156]">Best-performing botanical categories</p>
            </div>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={overview.categorySales.slice(0, 6)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E1D3" />
                <XAxis dataKey="category" tick={{ fontSize: 10, fill: '#5C6156' }} />
                <YAxis tick={{ fontSize: 11, fill: '#5C6156' }} />
                <Tooltip
                  formatter={(val) => formatPkr(Number(val || 0))}
                  contentStyle={{ borderRadius: '8px', fontSize: '12px' }}
                />
                <Bar dataKey="revenuePkr" name="Revenue" fill="#4A5D3F" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-white border border-[#232620]/10 space-y-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-[#232620]">Customer Registration Growth</h2>
            <p className="text-xs text-[#5C6156]">Monthly customer account sign-ups</p>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={overview.customerGrowth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E1D3" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#5C6156' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#5C6156' }} />
                <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                <Bar dataKey="customers" name="New Customers" fill="#C5A059" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Operational Grids: Recent Orders, Low Stock, Top Products & Activity */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Recent Orders */}
        <div className="xl:col-span-7 p-5 rounded-xl bg-white border border-[#232620]/10 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold text-[#232620]">Recent Orders</h2>
            <button
              type="button"
              onClick={() => onNavigateSection('orders')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#1C3B2B] hover:underline"
            >
              Manage Orders <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {overview.recentOrders.length === 0 ? (
            <p className="text-xs text-[#5C6156] py-6">No customer orders placed yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#232620]/10 text-[#5C6156]">
                    <th className="py-2 pr-3 font-medium">Order</th>
                    <th className="py-2 pr-3 font-medium">Customer</th>
                    <th className="py-2 pr-3 font-medium">Total</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232620]/8">
                  {overview.recentOrders.slice(0, 6).map((ord) => (
                    <tr key={ord.id} className="hover:bg-[#FAF6EE]/60">
                      <td className="py-2.5 pr-3 font-mono font-semibold text-[#232620]">
                        {ord.orderNumber}
                      </td>
                      <td className="py-2.5 pr-3">
                        <p className="font-medium text-[#232620]">{ord.customerName}</p>
                        <p className="text-[11px] text-[#5C6156]">{ord.shippingAddress.city}</p>
                      </td>
                      <td className="py-2.5 pr-3 font-mono tabular-nums font-medium">
                        {formatPkr(ord.totalPkr)}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded border text-[11px] font-medium ${getOrderStatusBadgeClass(
                            ord.status,
                          )}`}
                        >
                          {ord.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Low Stock + Top Sellers + Activity */}
        <div className="xl:col-span-5 space-y-5">
          <div className="p-5 rounded-xl bg-white border border-[#232620]/10 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold text-[#232620]">Low Stock Alerts</h2>
              <button
                type="button"
                onClick={() => onNavigateSection('inventory')}
                className="text-xs font-semibold text-[#1C3B2B] hover:underline"
              >
                Adjust Stock
              </button>
            </div>
            {overview.lowStockProducts.length === 0 ? (
              <p className="text-xs text-[#4A5D3F]">All SKUs are comfortably stocked above threshold.</p>
            ) : (
              <div className="space-y-2">
                {overview.lowStockProducts.slice(0, 4).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-[#FAF6EE] border border-[#232620]/8"
                  >
                    <span className="font-medium text-[#232620] truncate pr-2">{p.name}</span>
                    <span className="font-mono font-semibold text-rose-700 tabular-nums shrink-0">
                      {p.stock} left
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-5 rounded-xl bg-white border border-[#232620]/10 space-y-3">
            <h2 className="font-display text-xl font-semibold text-[#232620]">Best-Selling Products</h2>
            {overview.topSellingProducts.length === 0 ? (
              <p className="text-xs text-[#5C6156]">Sales leaderboards populate as orders arrive.</p>
            ) : (
              <div className="space-y-2">
                {overview.topSellingProducts.slice(0, 4).map((item) => (
                  <div key={item.slug} className="flex items-center justify-between text-xs">
                    <span className="text-[#232620] font-medium truncate pr-2">{item.name}</span>
                    <span className="font-mono text-[#1C3B2B] tabular-nums shrink-0">
                      {item.unitsSold} sold · {formatPkr(item.revenuePkr)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-5 rounded-xl bg-white border border-[#232620]/10 space-y-3">
            <h2 className="font-display text-xl font-semibold text-[#232620]">Recent Activity</h2>
            <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
              {overview.recentActivity.slice(0, 6).map((act) => (
                <div key={act.id} className="text-xs border-l-2 border-[#C5A059] pl-2.5">
                  <p className="font-medium text-[#232620]">{act.title}</p>
                  <p className="text-[11px] text-[#5C6156]">
                    {act.detail} · {formatShortDateTime(act.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
