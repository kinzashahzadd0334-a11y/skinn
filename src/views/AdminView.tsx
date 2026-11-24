import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Bell,
  Bot,
  Box,
  ChevronRight,
  FileText,
  FolderTree,
  Headphones,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  Star,
  Tag,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useStore } from '../context/StoreContext';
import type {
  AdminNotification,
  AdminOverviewStats,
  AdminSectionId,
  CustomerSummaryRecord,
  OrderRecord,
  Product,
} from '../types/store';
import { formatPkr } from '../utils/commerce';
import {
  ADMIN_NAV_ITEMS,
  adminFetch,
  canAccessSection,
  formatShortDateTime,
  ROLE_LABELS,
} from '../components/admin/adminApi';
import { AdminLogin, type AdminSessionUser } from '../components/admin/AdminLogin';
import { validateStoredAdminSessionLocal } from '../db/localApiBridge';
import { getLocalDatabaseStatus } from '../db/localDatabase';
import { clearAdminSession, getAdminUiPrefs, saveAdminUiPrefs } from '../db/localPrefs';
import { AdminDashboardSection } from '../components/admin/AdminDashboardSection';
import { AdminProductsSection } from '../components/admin/AdminProductsSection';
import { AdminCategoriesSection } from '../components/admin/AdminCategoriesSection';
import { AdminOrdersSection } from '../components/admin/AdminOrdersSection';
import { AdminCustomersSection } from '../components/admin/AdminCustomersSection';
import { AdminInventorySection } from '../components/admin/AdminInventorySection';
import { AdminCouponsSection } from '../components/admin/AdminCouponsSection';
import { AdminReviewsSection } from '../components/admin/AdminReviewsSection';
import { AdminAIManagementSection } from '../components/admin/AdminAIManagementSection';
import { Admin3DStudioSection } from '../components/admin/Admin3DStudioSection';
import { AdminContentCMSSection } from '../components/admin/AdminContentCMSSection';
import { AdminAnalyticsReportsSection } from '../components/admin/AdminAnalyticsReportsSection';
import { AdminSupportSection } from '../components/admin/AdminSupportSection';
import { AdminSettingsSection } from '../components/admin/AdminSettingsSection';

const SECTION_ICONS: Record<AdminSectionId, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  products: Package,
  categories: FolderTree,
  orders: ShoppingBag,
  customers: Users,
  inventory: Warehouse,
  coupons: Tag,
  reviews: Star,
  ai: Bot,
  studio3d: Box,
  content: FileText,
  analytics: BarChart3,
  support: Headphones,
  settings: Settings,
};

const NAV_GROUPS: ('Operations' | 'Merchandising' | 'Intelligence & Experience' | 'System')[] = [
  'Operations',
  'Merchandising',
  'Intelligence & Experience',
  'System',
];

export function AdminView() {
  const {
    navigate,
    refreshProducts,
    refreshCategories,
    refreshStoreConfig,
    refreshCmsContent,
    showToast,
  } = useStore();

  const initialUiPrefs = useMemo(() => getAdminUiPrefs(), []);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [currentAdmin, setCurrentAdmin] = useState<AdminSessionUser | null>(null);
  const [restoringSession, setRestoringSession] = useState(true);

  const [activeSection, setActiveSection] = useState<AdminSectionId>(initialUiPrefs.activeSection);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialUiPrefs.sidebarCollapsed);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [overview, setOverview] = useState<AdminOverviewStats | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [dbErrorBanner, setDbErrorBanner] = useState<string | null>(null);

  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);

  const [globalQuery, setGlobalQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<{
    products: Product[];
    orders: OrderRecord[];
    customers: CustomerSummaryRecord[];
  } | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    validateStoredAdminSessionLocal()
      .then((restored) => {
        if (!active) return;
        if (restored) {
          setAdminToken(restored.token);
          setCurrentAdmin(restored.admin);
          setActiveSection((prev) =>
            canAccessSection(restored.admin.role, prev) ? prev : 'dashboard',
          );
        }
        const statusInfo = getLocalDatabaseStatus();
        if (statusInfo.status === 'error' && statusInfo.error) {
          setDbErrorBanner(statusInfo.error);
        }
      })
      .catch((err) => {
        if (active) {
          setDbErrorBanner(err instanceof Error ? err.message : 'Local database verification failed.');
        }
      })
      .finally(() => {
        if (active) setRestoringSession(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSignOut = useCallback(() => {
    clearAdminSession();
    setAdminToken(null);
    setCurrentAdmin(null);
    setOverview(null);
    setNotifications([]);
    setSearchResults(null);
    setGlobalQuery('');
    setActiveSection('dashboard');
    saveAdminUiPrefs({ activeSection: 'dashboard' });
    showToast('Signed out of Admin Portal.');
  }, [showToast]);

  const loadShellTelemetry = useCallback(async () => {
    if (!adminToken) return;
    setLoadingOverview(true);
    try {
      const [ovRes, notifRes] = await Promise.all([
        adminFetch<{ overview: AdminOverviewStats }>('/api/admin/overview', adminToken),
        adminFetch<{ notifications: AdminNotification[] }>('/api/admin/notifications', adminToken),
      ]);
      setOverview(ovRes.overview);
      setNotifications(notifRes.notifications);
      const statusInfo = getLocalDatabaseStatus();
      setDbErrorBanner(statusInfo.status === 'error' ? statusInfo.error : null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load admin telemetry.';
      if (message.toLowerCase().includes('401') || message.toLowerCase().includes('unauthorized')) {
        handleSignOut();
      } else {
        setDbErrorBanner(message);
        showToast(message);
      }
    } finally {
      setLoadingOverview(false);
    }
  }, [adminToken, handleSignOut, showToast]);

  useEffect(() => {
    if (adminToken) {
      loadShellTelemetry();
    }
  }, [adminToken, loadShellTelemetry]);

  // Close popovers on outside click
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (notifRef.current && !notifRef.current.contains(target)) {
        setNotifOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(target)) {
        setSearchResults(null);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  // Debounced global search
  useEffect(() => {
    if (!adminToken) return;
    const trimmed = globalQuery.trim();
    if (trimmed.length < 2) {
      setSearchResults(null);
      return;
    }
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await adminFetch<{
          products: Product[];
          orders: OrderRecord[];
          customers: CustomerSummaryRecord[];
        }>(`/api/admin/search?q=${encodeURIComponent(trimmed)}`, adminToken);
        setSearchResults(res);
      } catch {
        // Ignore transient search failures
      } finally {
        setSearching(false);
      }
    }, 240);
    return () => window.clearTimeout(timer);
  }, [globalQuery, adminToken]);

  const handleStorefrontChanged = useCallback(() => {
    refreshProducts();
    refreshCategories();
    refreshStoreConfig();
    refreshCmsContent();
    loadShellTelemetry();
  }, [refreshProducts, refreshCategories, refreshStoreConfig, refreshCmsContent, loadShellTelemetry]);

  const handleMarkNotificationsRead = async (id?: string) => {
    if (!adminToken) return;
    try {
      const res = await adminFetch<{ notifications: AdminNotification[] }>(
        '/api/admin/notifications/read',
        adminToken,
        {
          method: 'PATCH',
          body: JSON.stringify(id ? { id } : {}),
        },
      );
      setNotifications(res.notifications);
    } catch {
      // Ignore transient error
    }
  };

  const navigateSection = (section: AdminSectionId) => {
    if (!currentAdmin) return;
    if (!canAccessSection(currentAdmin.role, section)) {
      showToast('Your administrator role does not have access to this module.');
      return;
    }
    setActiveSection(section);
    saveAdminUiPrefs({ activeSection: section });
    setMobileMenuOpen(false);
    setNotifOpen(false);
    setSearchResults(null);
  };

  const accessibleNavItems = useMemo(() => {
    if (!currentAdmin) return [];
    return ADMIN_NAV_ITEMS.filter((item) => canAccessSection(currentAdmin.role, item.id));
  }, [currentAdmin]);

  const activeNavItem = useMemo(
    () => ADMIN_NAV_ITEMS.find((item) => item.id === activeSection) || ADMIN_NAV_ITEMS[0],
    [activeSection],
  );

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications],
  );

  if (restoringSession) {
    return (
      <div className="min-h-screen bg-[#FAF6EE] flex items-center justify-center text-xs text-[#5C6156]">
        Restoring local Admin Workspace…
      </div>
    );
  }

  if (!adminToken || !currentAdmin) {
    return (
      <AdminLogin
        onAuthenticated={(token, admin) => {
          setAdminToken(token);
          setCurrentAdmin(admin);
          const targetSection = canAccessSection(admin.role, activeSection) ? activeSection : 'dashboard';
          setActiveSection(targetSection);
          saveAdminUiPrefs({ activeSection: targetSection });
          showToast(`Welcome back, ${admin.name}.`);
        }}
        onBackToStorefront={() => navigate({ name: 'home' })}
      />
    );
  }

  const renderSidebarBody = (isMobile = false) => (
    <div className="flex flex-col h-full bg-[#1C3B2B] text-[#FAF6EE]">
      {/* Brand Lockup */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-white/10 shrink-0">
        <button
          type="button"
          onClick={() => navigateSection('dashboard')}
          className="flex items-center gap-2.5 text-left min-w-0"
        >
          <span className="w-9 h-9 rounded-lg bg-[#C5A059] text-[#1C3B2B] flex items-center justify-center shrink-0 font-display font-bold text-lg">
            A
          </span>
          {(!sidebarCollapsed || isMobile) && (
            <div className="min-w-0">
              <p className="font-display text-base font-semibold leading-tight text-[#FAF6EE] truncate">
                Aurelia Botanica
              </p>
              <p className="text-[10px] uppercase tracking-widest text-[#C5A059] truncate">
                Admin Suite
              </p>
            </div>
          )}
        </button>

        {isMobile ? (
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation menu"
            className="p-1.5 rounded-lg text-[#FAF6EE]/80 hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() =>
              setSidebarCollapsed((c) => {
                const next = !c;
                saveAdminUiPrefs({ sidebarCollapsed: next });
                return next;
              })
            }
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 rounded-lg text-[#FAF6EE]/70 hover:text-[#FAF6EE] hover:bg-white/10 hidden lg:inline-flex"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV_GROUPS.map((group) => {
          const items = accessibleNavItems.filter((item) => item.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} className="space-y-1">
              {(!sidebarCollapsed || isMobile) && (
                <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-widest text-[#FAF6EE]/45">
                  {group}
                </p>
              )}
              {items.map((item) => {
                const Icon = SECTION_ICONS[item.id];
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigateSection(item.id)}
                    title={sidebarCollapsed && !isMobile ? item.label : undefined}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-[#C5A059] text-[#1C3B2B] font-semibold shadow-sm'
                        : 'text-[#FAF6EE]/80 hover:bg-white/10 hover:text-white'
                    } ${sidebarCollapsed && !isMobile ? 'justify-center px-0' : ''}`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {(!sidebarCollapsed || isMobile) && (
                      <span className="truncate flex-1 text-left">{item.label}</span>
                    )}
                    {(!sidebarCollapsed || isMobile) && item.id === 'orders' && overview?.pendingOrdersCount ? (
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md tabular-nums ${
                          isActive ? 'bg-[#1C3B2B]/15 text-[#1C3B2B]' : 'bg-white/15 text-[#FAF6EE]'
                        }`}
                      >
                        {overview.pendingOrdersCount}
                      </span>
                    ) : null}
                    {(!sidebarCollapsed || isMobile) &&
                    item.id === 'inventory' &&
                    overview?.lowStockProducts.length ? (
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md tabular-nums ${
                          isActive ? 'bg-[#1C3B2B]/15 text-[#1C3B2B]' : 'bg-amber-400/20 text-amber-200'
                        }`}
                      >
                        {overview.lowStockProducts.length}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Bottom Return to Storefront */}
      <div className="p-3 border-t border-white/10 space-y-2 shrink-0">
        <button
          type="button"
          onClick={() => navigate({ name: 'home' })}
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/15 text-[#FAF6EE] transition-colors ${
            sidebarCollapsed && !isMobile ? 'justify-center px-0' : ''
          }`}
          title="Return to Storefront"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          {(!sidebarCollapsed || isMobile) && <span>Return to Storefront</span>}
        </button>
      </div>
    </div>
  );

  const totalSearchHits =
    (searchResults?.products.length || 0) +
    (searchResults?.orders.length || 0) +
    (searchResults?.customers.length || 0);

  return (
    <div className="min-h-screen bg-[#FAF6EE] text-[#232620] flex">
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 sticky top-0 h-screen transition-all duration-200 no-print ${
          sidebarCollapsed ? 'w-[76px]' : 'w-64'
        }`}
      >
        {renderSidebarBody(false)}
      </aside>

      {/* Mobile Drawer Sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-[#1C3B2B]/50 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-10 w-72 max-w-[85vw] h-full shadow-2xl">
            {renderSidebarBody(true)}
          </div>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Sticky Top Bar */}
        <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-md border-b border-[#232620]/10 px-4 sm:px-6 flex items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open admin menu"
              className="lg:hidden p-2 rounded-lg border border-[#232620]/15 hover:bg-[#FAF6EE] text-[#232620]"
            >
              <Menu className="w-4 h-4" />
            </button>

            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs min-w-0">
              <button
                type="button"
                onClick={() => navigateSection('dashboard')}
                className="text-[#5C6156] hover:text-[#1C3B2B] font-medium hidden sm:inline"
              >
                Admin
              </button>
              <ChevronRight className="w-3.5 h-3.5 text-[#5C6156] hidden sm:inline shrink-0" />
              <span className="font-semibold text-[#1C3B2B] truncate">{activeNavItem.label}</span>
            </nav>
          </div>

          {/* Right Controls: Search, Notifications, Refresh, Profile */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Global Search */}
            <div ref={searchRef} className="relative hidden md:block w-64 lg:w-80">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#5C6156] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={globalQuery}
                  onChange={(e) => setGlobalQuery(e.target.value)}
                  placeholder="Search products, orders, customers…"
                  className="w-full pl-8 pr-8 py-2 rounded-lg bg-[#FAF6EE] border border-[#232620]/15 text-xs focus:outline-none focus:border-[#1C3B2B]"
                />
                {globalQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setGlobalQuery('');
                      setSearchResults(null);
                    }}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#5C6156] hover:text-[#232620]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {searchResults && (
                <div className="absolute right-0 mt-2 w-96 rounded-xl bg-white border border-[#232620]/15 shadow-xl p-3 space-y-3 z-50 max-h-[70vh] overflow-y-auto">
                  {searching && (
                    <p className="text-[11px] text-[#5C6156]">Searching Aurelia database…</p>
                  )}
                  {!searching && totalSearchHits === 0 && (
                    <p className="text-xs text-[#5C6156] py-2 text-center">
                      No matching products, orders, or customers for "{globalQuery}".
                    </p>
                  )}

                  {searchResults.products.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#5C6156] px-1">
                        Products
                      </p>
                      {searchResults.products.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => navigateSection('products')}
                          className="w-full flex items-center justify-between text-left px-2.5 py-2 rounded-lg hover:bg-[#FAF6EE] text-xs"
                        >
                          <span className="font-medium text-[#232620] truncate pr-2">{p.name}</span>
                          <span className="font-mono text-[#1C3B2B] shrink-0 tabular-nums">
                            {formatPkr(p.pricePkr)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {searchResults.orders.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#5C6156] px-1">
                        Orders
                      </p>
                      {searchResults.orders.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => navigateSection('orders')}
                          className="w-full flex items-center justify-between text-left px-2.5 py-2 rounded-lg hover:bg-[#FAF6EE] text-xs"
                        >
                          <span className="truncate pr-2">
                            <span className="font-mono font-semibold text-[#1C3B2B]">{o.orderNumber}</span>{' '}
                            · {o.customerName}
                          </span>
                          <span className="font-mono text-[#5C6156] shrink-0 tabular-nums">
                            {formatPkr(o.totalPkr)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {searchResults.customers.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#5C6156] px-1">
                        Customers
                      </p>
                      {searchResults.customers.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => navigateSection('customers')}
                          className="w-full flex items-center justify-between text-left px-2.5 py-2 rounded-lg hover:bg-[#FAF6EE] text-xs"
                        >
                          <span className="font-medium text-[#232620] truncate pr-2">{c.name}</span>
                          <span className="text-[11px] text-[#5C6156] truncate">{c.email}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Refresh */}
            <button
              type="button"
              onClick={loadShellTelemetry}
              disabled={loadingOverview}
              aria-label="Refresh dashboard data"
              className="p-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] hover:bg-[#F1EAE0] text-[#232620]"
            >
              <RefreshCw className={`w-4 h-4 ${loadingOverview ? 'animate-spin' : ''}`} />
            </button>

            {/* Notification Center */}
            <div ref={notifRef} className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((o) => !o)}
                aria-label="Notification center"
                className="relative p-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] hover:bg-[#F1EAE0] text-[#232620]"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#C5A059] text-[#1C3B2B] text-[10px] font-mono font-bold flex items-center justify-center tabular-nums">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-white border border-[#232620]/15 shadow-xl overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-[#232620]/10 flex items-center justify-between bg-[#FAF6EE]">
                    <span className="text-xs font-semibold text-[#1C3B2B] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#C5A059]" />
                      Notifications ({unreadCount} unread)
                    </span>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={() => handleMarkNotificationsRead()}
                        className="text-[11px] font-medium text-[#4A5D3F] hover:underline"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-[#232620]/10">
                    {notifications.length === 0 ? (
                      <p className="p-6 text-center text-xs text-[#5C6156]">
                        All clear — no store notifications yet.
                      </p>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            if (!n.isRead) handleMarkNotificationsRead(n.id);
                            if (n.linkSection && canAccessSection(currentAdmin.role, n.linkSection)) {
                              navigateSection(n.linkSection);
                            } else {
                              setNotifOpen(false);
                            }
                          }}
                          className={`w-full text-left px-4 py-3 hover:bg-[#FAF6EE] transition-colors ${
                            !n.isRead ? 'bg-[#1C3B2B]/[0.03]' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-semibold text-[#232620]">{n.title}</p>
                            {!n.isRead && (
                              <span className="w-2 h-2 rounded-full bg-[#C5A059] shrink-0 mt-1" />
                            )}
                          </div>
                          <p className="text-[11px] text-[#5C6156] mt-0.5 leading-relaxed">
                            {n.message}
                          </p>
                          <p className="text-[10px] text-[#5C6156]/80 mt-1">
                            {formatShortDateTime(n.createdAt)}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Admin Profile & Sign Out */}
            <div className="flex items-center gap-2 pl-2 border-l border-[#232620]/10">
              <div className="hidden sm:block text-right">
                <p className="text-xs font-semibold text-[#232620] leading-tight">
                  {currentAdmin.name}
                </p>
                <p className="text-[10px] font-medium text-[#4A5D3F]">
                  {ROLE_LABELS[currentAdmin.role]}
                </p>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                title="Sign Out"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1C3B2B] hover:bg-[#142B1F] text-[#FAF6EE] text-xs font-medium transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </header>

        {/* Main Workspace */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto space-y-4">
          {dbErrorBanner && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">Local Storage / IndexedDB Alert</p>
                <p className="text-rose-800 mt-0.5">{dbErrorBanner}</p>
              </div>
              <button
                type="button"
                onClick={() => setDbErrorBanner(null)}
                className="px-2.5 py-1 rounded border border-rose-300 text-[11px] font-medium hover:bg-rose-100"
              >
                Dismiss
              </button>
            </div>
          )}
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {activeSection === 'dashboard' && (
              <AdminDashboardSection
                overview={overview}
                loading={loadingOverview}
                onNavigateSection={navigateSection}
              />
            )}

            {activeSection === 'products' && (
              <AdminProductsSection
                token={adminToken}
                onStorefrontChanged={handleStorefrontChanged}
                onToast={showToast}
              />
            )}

            {activeSection === 'categories' && (
              <AdminCategoriesSection
                token={adminToken}
                onStorefrontChanged={handleStorefrontChanged}
                onToast={showToast}
              />
            )}

            {activeSection === 'orders' && (
              <AdminOrdersSection
                token={adminToken}
                onStorefrontChanged={handleStorefrontChanged}
                onToast={showToast}
              />
            )}

            {activeSection === 'customers' && (
              <AdminCustomersSection token={adminToken} onToast={showToast} />
            )}

            {activeSection === 'inventory' && (
              <AdminInventorySection
                token={adminToken}
                onStorefrontChanged={handleStorefrontChanged}
                onToast={showToast}
              />
            )}

            {activeSection === 'coupons' && (
              <AdminCouponsSection
                token={adminToken}
                onStorefrontChanged={handleStorefrontChanged}
                onToast={showToast}
              />
            )}

            {activeSection === 'reviews' && (
              <AdminReviewsSection
                token={adminToken}
                onStorefrontChanged={handleStorefrontChanged}
                onToast={showToast}
              />
            )}

            {activeSection === 'ai' && (
              <AdminAIManagementSection token={adminToken} onToast={showToast} />
            )}

            {activeSection === 'studio3d' && (
              <Admin3DStudioSection
                token={adminToken}
                onStorefrontChanged={handleStorefrontChanged}
                onToast={showToast}
              />
            )}

            {activeSection === 'content' && (
              <AdminContentCMSSection
                token={adminToken}
                onStorefrontChanged={handleStorefrontChanged}
                onToast={showToast}
              />
            )}

            {activeSection === 'analytics' && (
              <AdminAnalyticsReportsSection token={adminToken} onToast={showToast} />
            )}

            {activeSection === 'support' && (
              <AdminSupportSection token={adminToken} onToast={showToast} />
            )}

            {activeSection === 'settings' && (
              <AdminSettingsSection
                token={adminToken}
                currentAdmin={currentAdmin}
                onProfileUpdated={(updated) => setCurrentAdmin(updated)}
                onStorefrontChanged={handleStorefrontChanged}
                onToast={showToast}
              />
            )}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
