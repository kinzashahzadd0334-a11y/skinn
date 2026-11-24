import { useEffect, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AnalyticsReportData, CategoryRecord } from '../../types/store';
import { formatPkr } from '../../utils/commerce';
import { adminFetch, downloadLocalCsvReport } from './adminApi';

interface AdminAnalyticsReportsSectionProps {
  token: string;
  onToast: (msg: string) => void;
}

export function AdminAnalyticsReportsSection({ token, onToast }: AdminAnalyticsReportsSectionProps) {
  const [range, setRange] = useState<'7d' | '30d' | '90d' | '365d' | 'all'>('30d');
  const [department, setDepartment] = useState<'all' | 'skincare' | 'haircare'>('all');
  const [category, setCategory] = useState('all');
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [report, setReport] = useState<AnalyticsReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminFetch<{ categories: CategoryRecord[] }>('/api/admin/categories', token)
      .then((d) => setCategories(d.categories))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ range, department, category });
    adminFetch<{ report: AnalyticsReportData }>(`/api/admin/reports?${qs.toString()}`, token)
      .then((d) => setReport(d.report))
      .catch((err) => onToast(err instanceof Error ? err.message : 'Failed to build report.'))
      .finally(() => setLoading(false));
  }, [token, range, department, category]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownloadCsv = async (kind: 'orders' | 'inventory') => {
    try {
      await downloadLocalCsvReport(kind);
      onToast(`Downloaded aurelia-${kind}-report.csv`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not download CSV.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Filter & Export Bar */}
      <div className="bg-white p-4 rounded-xl border border-[#232620]/10 flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as typeof range)}
            className="px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-xs font-medium"
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
            <option value="365d">Last 12 Months</option>
            <option value="all">All Time</option>
          </select>

          <select
            value={department}
            onChange={(e) => {
              setDepartment(e.target.value as typeof department);
              setCategory('all');
            }}
            className="px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-xs font-medium"
          >
            <option value="all">All Departments</option>
            <option value="skincare">Skincare Only</option>
            <option value="haircare">Haircare Only</option>
          </select>

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-xs font-medium"
          >
            <option value="all">All Categories</option>
            {categories
              .filter((c) => department === 'all' || c.department === department)
              .map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleDownloadCsv('orders')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] hover:bg-[#F1EAE0] text-xs font-medium"
          >
            <Download className="w-3.5 h-3.5" />
            Export Orders CSV
          </button>
          <button
            type="button"
            onClick={() => handleDownloadCsv('inventory')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] hover:bg-[#F1EAE0] text-xs font-medium"
          >
            <Download className="w-3.5 h-3.5" />
            Export Inventory CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1C3B2B] text-[#FAF6EE] text-xs font-medium"
          >
            <Printer className="w-3.5 h-3.5" />
            Print / Save PDF
          </button>
        </div>
      </div>

      {loading || !report ? (
        <div className="p-12 text-center text-xs text-[#5C6156]">Generating live analytics report…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            {[
              { label: 'Net Revenue', value: formatPkr(report.totalRevenuePkr) },
              { label: 'Orders', value: String(report.totalOrders) },
              { label: 'Avg Order Value', value: formatPkr(report.averageOrderValuePkr) },
              { label: 'Promo Discounts', value: formatPkr(report.discountGivenPkr) },
              { label: 'Cancel / Return %', value: `${report.cancellationRatePercent}%` },
              { label: 'AI Conversion %', value: `${report.aiConversionRatePercent}%` },
            ].map((kpi) => (
              <div key={kpi.label} className="p-4 rounded-xl bg-white border border-[#232620]/10">
                <p className="text-[11px] text-[#5C6156]">{kpi.label}</p>
                <p className="font-mono text-lg font-semibold text-[#232620] tabular-nums mt-1">
                  {kpi.value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="p-5 rounded-xl bg-white border border-[#232620]/10 space-y-3">
              <h3 className="font-display text-xl font-semibold text-[#232620]">Revenue &amp; Discount Series</h3>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={report.salesSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8E1D3" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#5C6156' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#5C6156' }} />
                    <Tooltip formatter={(val) => formatPkr(Number(val || 0))} />
                    <Line type="monotone" dataKey="revenuePkr" name="Revenue" stroke="#1C3B2B" strokeWidth={2} />
                    <Line type="monotone" dataKey="discountPkr" name="Discounts" stroke="#C5A059" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="p-5 rounded-xl bg-white border border-[#232620]/10 space-y-3">
              <h3 className="font-display text-xl font-semibold text-[#232620]">Category Sales Breakdown</h3>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={report.categoryPerformance.slice(0, 8)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8E1D3" />
                    <XAxis dataKey="category" tick={{ fontSize: 10, fill: '#5C6156' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#5C6156' }} />
                    <Tooltip formatter={(val) => formatPkr(Number(val || 0))} />
                    <Bar dataKey="revenuePkr" name="Revenue" fill="#4A5D3F" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="p-5 rounded-xl bg-white border border-[#232620]/10 space-y-3 text-xs">
              <h3 className="font-display text-xl font-semibold text-[#232620]">Coupon Campaign Performance</h3>
              {report.couponPerformance.length === 0 ? (
                <p className="text-[#5C6156]">No coupon redemptions in this date window.</p>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[#232620]/10 text-[#5C6156]">
                      <th className="py-2 font-medium">Code</th>
                      <th className="py-2 font-medium">Redemptions</th>
                      <th className="py-2 font-medium">Discount Given</th>
                      <th className="py-2 font-medium">Attributed Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#232620]/8">
                    {report.couponPerformance.map((c) => (
                      <tr key={c.code}>
                        <td className="py-2 font-mono font-semibold">{c.code}</td>
                        <td className="py-2 font-mono tabular-nums">{c.redemptions}</td>
                        <td className="py-2 font-mono tabular-nums">{formatPkr(c.discountPkr)}</td>
                        <td className="py-2 font-mono tabular-nums text-[#1C3B2B] font-semibold">
                          {formatPkr(c.revenuePkr)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="p-5 rounded-xl bg-white border border-[#232620]/10 space-y-3 text-xs">
              <h3 className="font-display text-xl font-semibold text-[#232620]">Inventory Health Snapshot</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-[#FAF6EE]">
                  <p className="text-[#5C6156]">Active SKUs</p>
                  <p className="font-mono text-lg font-semibold tabular-nums">{report.inventoryHealth.totalSkus}</p>
                </div>
                <div className="p-3 rounded-lg bg-[#FAF6EE]">
                  <p className="text-[#5C6156]">Stock Valuation</p>
                  <p className="font-mono text-lg font-semibold text-[#1C3B2B] tabular-nums">
                    {formatPkr(report.inventoryHealth.stockValuationPkr)}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-amber-50">
                  <p className="text-amber-800">Low Stock SKUs</p>
                  <p className="font-mono text-lg font-semibold text-amber-900 tabular-nums">
                    {report.inventoryHealth.lowStockCount}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-rose-50">
                  <p className="text-rose-800">Out of Stock SKUs</p>
                  <p className="font-mono text-lg font-semibold text-rose-900 tabular-nums">
                    {report.inventoryHealth.outOfStockCount}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
