import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Database,
  Download,
  FileJson,
  HardDrive,
  MessageCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Shield,
  Trash2,
  Upload,
  UserCheck,
} from 'lucide-react';
import type {
  AdminRole,
  AdminUser,
  AuditLogEntry,
  StoreSettingsFull,
  WhatsAppReferralRecord,
} from '../../types/store';
import {
  exportDatabaseBackupJson,
  getDatabaseDashboardMetrics,
  importDatabaseBackup,
  resetLocalDatabase,
  validateAndPreviewBackupJson,
  type BackupValidationPreview,
  type DatabaseDashboardMetrics,
} from '../../db/localDatabase';
import { adminFetch, formatShortDateTime, ROLE_LABELS, uploadAdminAsset } from './adminApi';
import type { AdminSessionUser } from './AdminLogin';

function formatStorageBytes(bytes: number | null): string {
  if (bytes === null || bytes < 0) return 'Unavailable';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

interface AdminSettingsSectionProps {
  token: string;
  currentAdmin: AdminSessionUser;
  onProfileUpdated: (admin: AdminSessionUser) => void;
  onStorefrontChanged: () => void;
  onToast: (msg: string) => void;
}

export function AdminSettingsSection({
  token,
  currentAdmin,
  onProfileUpdated,
  onStorefrontChanged,
  onToast,
}: AdminSettingsSectionProps) {
  const canManageStore = currentAdmin.role === 'super_admin' || currentAdmin.role === 'store_manager';
  const isSuperAdmin = currentAdmin.role === 'super_admin';

  const [tab, setTab] = useState<'store' | 'whatsapp' | 'data' | 'team' | 'profile'>(
    canManageStore ? 'store' : 'profile',
  );
  const [settings, setSettings] = useState<StoreSettingsFull | null>(null);
  const [waReferrals, setWaReferrals] = useState<WhatsAppReferralRecord[]>([]);
  const [teamUsers, setTeamUsers] = useState<AdminUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [saving, setSaving] = useState(false);

  // Data Management / Backup / Restore / Reset state
  const [dbMetrics, setDbMetrics] = useState<DatabaseDashboardMetrics | null>(null);
  const [exportingBackup, setExportingBackup] = useState(false);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<BackupValidationPreview | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [confirmReplaceChecked, setConfirmReplaceChecked] = useState(false);
  const [importingBackup, setImportingBackup] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resettingDb, setResettingDb] = useState(false);

  // New team user form
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<AdminRole>('store_manager');
  const [newPassword, setNewPassword] = useState('');

  // Own profile form
  const [ownName, setOwnName] = useState(currentAdmin.name);
  const [ownPassword, setOwnPassword] = useState('');

  const loadDbMetrics = async () => {
    const metrics = await getDatabaseDashboardMetrics();
    setDbMetrics(metrics);
  };

  const loadAll = async () => {
    try {
      const sData = await adminFetch<{ settings: StoreSettingsFull }>('/api/admin/settings', token);
      setSettings(sData.settings);

      if (canManageStore || currentAdmin.role === 'support_agent') {
        const waData = await adminFetch<{ referrals: WhatsAppReferralRecord[] }>('/api/admin/whatsapp', token);
        setWaReferrals(waData.referrals);
      }

      if (isSuperAdmin) {
        const tData = await adminFetch<{ users: AdminUser[]; auditLogs: AuditLogEntry[] }>(
          '/api/admin/team',
          token,
        );
        setTeamUsers(tData.users);
        setAuditLogs(tData.auditLogs);
      }

      await loadDbMetrics();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not load settings.');
    }
  };

  useEffect(() => {
    loadAll();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExportBackup = async () => {
    setExportingBackup(true);
    try {
      const { json, fileName } = await exportDatabaseBackupJson({ recordBackupTimestamp: true });
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      await loadDbMetrics();
      onToast(`Exported full JSON database backup (${fileName}).`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to export JSON backup.');
    } finally {
      setExportingBackup(false);
    }
  };

  const handleSelectBackupFile = async (file: File | undefined) => {
    if (!file) return;
    setImportFileName(file.name);
    setConfirmReplaceChecked(false);
    try {
      const text = await file.text();
      const preview = await validateAndPreviewBackupJson(text);
      setImportPreview(preview);
      if (!preview.valid) {
        onToast('Backup validation failed. Review the error details before importing.');
      }
    } catch (err) {
      setImportPreview({
        valid: false,
        errors: [err instanceof Error ? err.message : 'Could not read backup JSON file.'],
        warnings: [],
      });
    }
  };

  const handleExecuteImport = async () => {
    if (!importPreview?.valid || !importPreview.preview?.parsed) return;
    if (importMode === 'replace' && !confirmReplaceChecked) {
      onToast('Please confirm that Replace Mode will overwrite all current local data.');
      return;
    }
    setImportingBackup(true);
    try {
      const result = await importDatabaseBackup(importPreview.preview.parsed, importMode);
      setImportPreview(null);
      setImportFileName(null);
      setConfirmReplaceChecked(false);
      await loadAll();
      onStorefrontChanged();
      onToast(
        `Backup restored (${result.mode} mode): ${result.restoredProducts} products and ${result.restoredMedia} media files loaded.`,
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'JSON backup import failed.');
    } finally {
      setImportingBackup(false);
    }
  };

  const handleResetDatabase = async () => {
    setResettingDb(true);
    try {
      await resetLocalDatabase({ preserveAdminUsers: true });
      setResetConfirmOpen(false);
      setImportPreview(null);
      setImportFileName(null);
      await loadAll();
      onStorefrontChanged();
      onToast('Local IndexedDB database reset to Aurelia Botanica defaults.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to reset local database.');
    } finally {
      setResettingDb(false);
    }
  };

  const handleSaveStoreSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const data = await adminFetch<{ settings: StoreSettingsFull }>('/api/admin/settings', token, {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      setSettings(data.settings);
      onStorefrontChanged();
      onToast('Store configuration saved.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      await adminFetch('/api/admin/whatsapp', token, {
        method: 'PUT',
        body: JSON.stringify({
          whatsappNumber: settings.whatsappNumber,
          whatsappEnabled: settings.whatsappEnabled,
          whatsappWelcomeMessage: settings.whatsappWelcomeMessage,
          whatsappOrderTemplate: settings.whatsappOrderTemplate,
          whatsappSupportMessage: settings.whatsappSupportMessage,
        }),
      });
      onStorefrontChanged();
      onToast('WhatsApp concierge settings saved.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not save WhatsApp settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAdminUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminFetch('/api/admin/team', token, {
        method: 'POST',
        body: JSON.stringify({
          name: newName.trim(),
          email: newEmail.trim(),
          role: newRole,
          password: newPassword,
        }),
      });
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      onToast('Team administrator created.');
      await loadAll();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not create team member.');
    }
  };

  const handleUpdateTeamMember = async (
    id: string,
    patch: { role?: AdminRole; isActive?: boolean },
  ) => {
    try {
      await adminFetch(`/api/admin/team/${id}`, token, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      await loadAll();
      onToast('Administrator permissions updated.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Update failed.');
    }
  };

  const handleDeleteTeamMember = async (id: string) => {
    try {
      await adminFetch(`/api/admin/team/${id}`, token, { method: 'DELETE' });
      await loadAll();
      onToast('Team administrator removed.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not delete member.');
    }
  };

  const handleSaveOwnProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = await adminFetch<{ admin: AdminSessionUser }>('/api/admin/profile', token, {
        method: 'PATCH',
        body: JSON.stringify({
          name: ownName.trim(),
          password: ownPassword.trim() ? ownPassword : undefined,
        }),
      });
      onProfileUpdated(data.admin);
      setOwnPassword('');
      onToast('Your administrator profile has been updated.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not update profile.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 bg-white p-3 rounded-xl border border-[#232620]/10">
        {canManageStore && (
          <button
            type="button"
            onClick={() => setTab('store')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium ${
              tab === 'store' ? 'bg-[#1C3B2B] text-[#FAF6EE]' : 'bg-[#FAF6EE] text-[#232620]'
            }`}
          >
            General Store Settings
          </button>
        )}
        {canManageStore && (
          <button
            type="button"
            onClick={() => setTab('whatsapp')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium ${
              tab === 'whatsapp' ? 'bg-[#1C3B2B] text-[#FAF6EE]' : 'bg-[#FAF6EE] text-[#232620]'
            }`}
          >
            WhatsApp Concierge
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setTab('data');
            void loadDbMetrics();
          }}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium ${
            tab === 'data' ? 'bg-[#1C3B2B] text-[#FAF6EE]' : 'bg-[#FAF6EE] text-[#232620]'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          Data Management &amp; Backup
        </button>
        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => setTab('team')}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium ${
              tab === 'team' ? 'bg-[#1C3B2B] text-[#FAF6EE]' : 'bg-[#FAF6EE] text-[#232620]'
            }`}
          >
            Admin Team, Roles &amp; Audit Logs
          </button>
        )}
        <button
          type="button"
          onClick={() => setTab('profile')}
          className={`px-3.5 py-2 rounded-lg text-xs font-medium ${
            tab === 'profile' ? 'bg-[#1C3B2B] text-[#FAF6EE]' : 'bg-[#FAF6EE] text-[#232620]'
          }`}
        >
          My Profile
        </button>
      </div>

      {tab === 'store' && settings && (
        <form
          onSubmit={handleSaveStoreSettings}
          className="bg-white rounded-xl border border-[#232620]/10 p-6 space-y-5 text-xs"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-medium mb-1">Store Brand Name</label>
              <input
                type="text"
                value={settings.brandName}
                onChange={(e) => setSettings({ ...settings, brandName: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Contact Email</label>
              <input
                type="email"
                value={settings.contactEmail || ''}
                onChange={(e) => setSettings({ ...settings, contactEmail: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Brand Logo URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={settings.logoUrl || ''}
                  onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })}
                  className="flex-1 px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
                />
                <label className="inline-flex items-center px-2.5 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const res = await uploadAdminAsset(f, token);
                      setSettings({ ...settings, logoUrl: res.url });
                      onToast('Logo uploaded.');
                    }}
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <label className="block font-medium mb-1">Shipping Fee (PKR)</label>
              <input
                type="number"
                value={settings.shippingFeePkr}
                onChange={(e) => setSettings({ ...settings, shippingFeePkr: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] font-mono"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Free Shipping (PKR)</label>
              <input
                type="number"
                value={settings.freeShippingThresholdPkr}
                onChange={(e) =>
                  setSettings({ ...settings, freeShippingThresholdPkr: Number(e.target.value) })
                }
                className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] font-mono"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Tax (%)</label>
              <input
                type="number"
                min={0}
                max={30}
                step={0.5}
                value={settings.taxPercent ?? 0}
                onChange={(e) => setSettings({ ...settings, taxPercent: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] font-mono"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Return Window (Days)</label>
              <input
                type="number"
                min={1}
                value={settings.returnPolicyDays ?? 14}
                onChange={(e) => setSettings({ ...settings, returnPolicyDays: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] font-mono"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Low Stock Threshold</label>
              <input
                type="number"
                min={0}
                value={settings.lowStockThreshold}
                onChange={(e) => setSettings({ ...settings, lowStockThreshold: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] font-mono"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-5 pt-2 border-t border-[#232620]/10">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.codEnabled ?? true}
                onChange={(e) => setSettings({ ...settings, codEnabled: e.target.checked })}
                className="accent-[#1C3B2B]"
              />
              <span>Cash on Delivery (COD) Enabled</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.notifyNewOrders}
                onChange={(e) => setSettings({ ...settings, notifyNewOrders: e.target.checked })}
                className="accent-[#1C3B2B]"
              />
              <span>Notify on New Orders</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.notifyLowStock}
                onChange={(e) => setSettings({ ...settings, notifyLowStock: e.target.checked })}
                className="accent-[#1C3B2B]"
              />
              <span>Notify on Low Stock</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.notifyAiErrors}
                onChange={(e) => setSettings({ ...settings, notifyAiErrors: e.target.checked })}
                className="accent-[#1C3B2B]"
              />
              <span>Notify on AI Escalations/Errors</span>
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-[#1C3B2B] text-[#FAF6EE] font-medium"
            >
              <Check className="w-3.5 h-3.5 text-[#C5A059]" />
              <span>{saving ? 'Saving…' : 'Save Store Settings'}</span>
            </button>
          </div>
        </form>
      )}

      {tab === 'whatsapp' && settings && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <form
            onSubmit={handleSaveWhatsApp}
            className="lg:col-span-7 bg-white rounded-xl border border-[#232620]/10 p-6 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-[#1C3B2B]" />
                <h3 className="font-display text-xl font-semibold">WhatsApp Business Configuration</h3>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.whatsappEnabled !== false}
                  onChange={(e) => setSettings({ ...settings, whatsappEnabled: e.target.checked })}
                  className="accent-[#1C3B2B]"
                />
                <span>Enable Storefront WhatsApp</span>
              </label>
            </div>

            <div>
              <label className="block font-medium mb-1">Business WhatsApp Number (International digits, e.g. 923001234567)</label>
              <input
                type="text"
                value={settings.whatsappNumber}
                onChange={(e) => setSettings({ ...settings, whatsappNumber: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] font-mono"
              />
            </div>

            <div>
              <label className="block font-medium mb-1">Welcome / Routine Consultation Message</label>
              <textarea
                rows={2}
                value={settings.whatsappWelcomeMessage || ''}
                onChange={(e) => setSettings({ ...settings, whatsappWelcomeMessage: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
              />
            </div>

            <div>
              <label className="block font-medium mb-1">Floating Support Message</label>
              <textarea
                rows={2}
                value={settings.whatsappSupportMessage || ''}
                onChange={(e) => setSettings({ ...settings, whatsappSupportMessage: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-lg bg-[#1C3B2B] text-[#FAF6EE] font-medium"
            >
              {saving ? 'Saving…' : 'Save WhatsApp Config'}
            </button>
          </form>

          <div className="lg:col-span-5 bg-white rounded-xl border border-[#232620]/10 p-5 space-y-3 text-xs">
            <h3 className="font-display text-xl font-semibold">WhatsApp Referral Log</h3>
            {waReferrals.length === 0 ? (
              <p className="text-[#5C6156]">No customer WhatsApp concierge clicks logged yet.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {waReferrals.map((r) => (
                  <div key={r.id} className="p-2.5 rounded-lg bg-[#FAF6EE] border border-[#232620]/8">
                    <p className="font-medium text-[#232620]">{r.summary}</p>
                    <p className="text-[11px] text-[#5C6156]">
                      {r.source} · {formatShortDateTime(r.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'data' && (
        <div className="space-y-6 text-xs">
          {/* Local Database Status & Metrics Dashboard */}
          <div className="bg-white rounded-xl border border-[#232620]/10 p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-[#1C3B2B] text-[#FAF6EE] flex items-center justify-center">
                  <HardDrive className="w-4 h-4 text-[#C5A059]" />
                </div>
                <div>
                  <h3 className="font-display text-xl font-semibold text-[#232620]">
                    Browser Local Database (IndexedDB + Chrome Local Storage)
                  </h3>
                  <p className="text-[11px] text-[#5C6156]">
                    {dbMetrics
                      ? `${dbMetrics.dbName} (v${dbMetrics.dbVersion}) · Persistent across reloads & browser restarts`
                      : 'Loading database telemetry…'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {dbMetrics && (
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-semibold ${
                      dbMetrics.dbStatus === 'ready'
                        ? 'bg-[#1C3B2B]/10 text-[#1C3B2B] border-[#1C3B2B]/25'
                        : 'bg-rose-50 text-rose-800 border-rose-200'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        dbMetrics.dbStatus === 'ready' ? 'bg-emerald-600' : 'bg-rose-600'
                      }`}
                    />
                    {dbMetrics.dbStatus === 'ready' ? 'Database Healthy' : 'Database Error'}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void loadDbMetrics()}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] hover:bg-[#F1EAE0] text-[11px] font-medium"
                >
                  <RefreshCw className="w-3 h-3" />
                  Refresh Stats
                </button>
              </div>
            </div>

            {dbMetrics?.dbError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800">
                {dbErrorMessage(dbMetrics.dbError)}
              </div>
            )}

            {dbMetrics && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                  {[
                    { label: 'Products', value: dbMetrics.totalProducts },
                    { label: 'Categories', value: dbMetrics.totalCategories },
                    { label: 'Orders', value: dbMetrics.totalOrders },
                    { label: 'Customers', value: dbMetrics.totalCustomers },
                    { label: 'Coupons', value: dbMetrics.totalCoupons },
                    { label: 'Reviews', value: dbMetrics.totalReviews },
                    { label: 'Media Blobs', value: dbMetrics.totalMediaBlobs },
                  ].map((item) => (
                    <div key={item.label} className="p-3 rounded-lg bg-[#FAF6EE] border border-[#232620]/8">
                      <p className="text-[11px] text-[#5C6156]">{item.label}</p>
                      <p className="font-mono text-lg font-semibold text-[#1C3B2B] tabular-nums mt-0.5">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-[#232620]/10">
                  <div className="p-3 rounded-lg bg-[#FAF6EE]/70">
                    <p className="text-[11px] text-[#5C6156]">Browser Storage Usage</p>
                    <p className="font-mono font-semibold text-[#232620] mt-0.5 tabular-nums">
                      {formatStorageBytes(dbMetrics.estimatedUsageBytes)}
                      {dbMetrics.estimatedQuotaBytes
                        ? ` / ${formatStorageBytes(dbMetrics.estimatedQuotaBytes)}`
                        : ''}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-[#FAF6EE]/70">
                    <p className="text-[11px] text-[#5C6156]">Last JSON Backup Exported</p>
                    <p className="font-medium text-[#232620] mt-0.5">
                      {dbMetrics.lastBackupAt ? formatShortDateTime(dbMetrics.lastBackupAt) : 'Not exported yet'}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-[#FAF6EE]/70">
                    <p className="text-[11px] text-[#5C6156]">Last Restore / Reset</p>
                    <p className="font-medium text-[#232620] mt-0.5">
                      {dbMetrics.lastRestoreAt
                        ? `Restored ${formatShortDateTime(dbMetrics.lastRestoreAt)}`
                        : dbMetrics.lastResetAt
                        ? `Reset ${formatShortDateTime(dbMetrics.lastResetAt)}`
                        : 'No restore or reset recorded'}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Export / Import / Reset Controls */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Export & Reset */}
            <div className="lg:col-span-5 space-y-5">
              <div className="bg-white rounded-xl border border-[#232620]/10 p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-[#1C3B2B]" />
                  <h4 className="font-display text-lg font-semibold text-[#232620]">
                    Export JSON Backup
                  </h4>
                </div>
                <p className="text-[#5C6156] leading-relaxed">
                  Download a complete structured snapshot of all products, categories, inventory, orders, customers, coupons, reviews, AI agents, CMS content, settings, and uploaded media blobs.
                </p>
                <button
                  type="button"
                  disabled={exportingBackup}
                  onClick={handleExportBackup}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#1C3B2B] hover:bg-[#142C20] disabled:opacity-60 text-[#FAF6EE] font-medium"
                >
                  <FileJson className="w-4 h-4 text-[#C5A059]" />
                  <span>{exportingBackup ? 'Preparing JSON Backup…' : 'Download Full JSON Backup'}</span>
                </button>
              </div>

              {canManageStore && (
                <div className="bg-white rounded-xl border border-rose-200/80 p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-rose-700" />
                    <h4 className="font-display text-lg font-semibold text-[#232620]">
                      Reset Local Database
                    </h4>
                  </div>
                  <p className="text-[#5C6156] leading-relaxed">
                    Restore Aurelia Botanica catalog, categories, coupons, CMS, and store settings to factory defaults. Your administrator login stays active.
                  </p>

                  {!resetConfirmOpen ? (
                    <button
                      type="button"
                      onClick={() => setResetConfirmOpen(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 font-medium"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Reset Database to Defaults…</span>
                    </button>
                  ) : (
                    <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 space-y-3">
                      <p className="text-rose-900 font-semibold">
                        Confirm Factory Reset? All unsaved local products, orders, and uploaded media will be cleared.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={resettingDb}
                          onClick={handleResetDatabase}
                          className="px-3.5 py-2 rounded-lg bg-rose-700 hover:bg-rose-800 disabled:opacity-60 text-white font-medium"
                        >
                          {resettingDb ? 'Resetting…' : 'Confirm Factory Reset'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setResetConfirmOpen(false)}
                          className="px-3.5 py-2 rounded-lg border border-[#232620]/15 bg-white text-[#232620] font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Import & Preview */}
            <div className="lg:col-span-7 bg-white rounded-xl border border-[#232620]/10 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-[#1C3B2B]" />
                <h4 className="font-display text-lg font-semibold text-[#232620]">
                  Import &amp; Restore JSON Backup
                </h4>
              </div>
              <p className="text-[#5C6156] leading-relaxed">
                Select an Aurelia Botanica <code className="font-mono">.json</code> backup file. Every file is validated and previewed before any local records are modified.
              </p>

              {canManageStore ? (
                <>
                  <label className="flex flex-col items-center justify-center p-5 rounded-xl border-2 border-dashed border-[#232620]/20 bg-[#FAF6EE]/70 hover:bg-[#FAF6EE] cursor-pointer transition-colors text-center">
                    <FileJson className="w-6 h-6 text-[#4A5D3F] mb-1.5" />
                    <span className="font-medium text-[#232620]">
                      {importFileName ? `Selected: ${importFileName}` : 'Choose a .json backup file to validate'}
                    </span>
                    <span className="text-[11px] text-[#5C6156] mt-0.5">
                      Validates schemaVersion, required stores, unique IDs/slugs, and media payloads
                    </span>
                    <input
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={(e) => {
                        void handleSelectBackupFile(e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                  </label>

                  {importPreview && !importPreview.valid && (
                    <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 space-y-2">
                      <p className="font-semibold text-rose-900 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" />
                        Invalid Backup File — Existing Data Untouched
                      </p>
                      <ul className="list-disc pl-5 space-y-1 text-rose-800">
                        {importPreview.errors.map((errMsg, idx) => (
                          <li key={idx}>{errMsg}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {importPreview?.valid && importPreview.preview && (
                    <div className="p-4 rounded-xl bg-[#FAF6EE] border border-[#1C3B2B]/20 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-[#1C3B2B]">
                            Backup Validated ({importPreview.preview.app} · Schema v{importPreview.preview.schemaVersion})
                          </p>
                          <p className="text-[11px] text-[#5C6156]">
                            Exported: {formatShortDateTime(importPreview.preview.exportedAt)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setImportPreview(null);
                            setImportFileName(null);
                            setConfirmReplaceChecked(false);
                          }}
                          className="text-[11px] text-[#5C6156] hover:text-[#232620] underline"
                        >
                          Clear File
                        </button>
                      </div>

                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                        {[
                          { label: 'Products', value: importPreview.preview.counts.products },
                          { label: 'Categories', value: importPreview.preview.counts.categories },
                          { label: 'Orders', value: importPreview.preview.counts.orders },
                          { label: 'Customers', value: importPreview.preview.counts.customers },
                          { label: 'Media Assets', value: importPreview.preview.counts.mediaAssets },
                        ].map((stat) => (
                          <div key={stat.label} className="p-2 rounded-lg bg-white border border-[#232620]/10">
                            <p className="text-[10px] text-[#5C6156]">{stat.label}</p>
                            <p className="font-mono font-semibold text-[#232620] tabular-nums">{stat.value}</p>
                          </div>
                        ))}
                      </div>

                      {importPreview.warnings.length > 0 && (
                        <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 space-y-1">
                          {importPreview.warnings.map((w, i) => (
                            <p key={i}>{w}</p>
                          ))}
                        </div>
                      )}

                      <div className="space-y-2 pt-2 border-t border-[#232620]/10">
                        <p className="font-semibold text-[#232620]">Select Restore Strategy</p>
                        <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border border-[#232620]/10 cursor-pointer">
                          <input
                            type="radio"
                            name="importMode"
                            checked={importMode === 'merge'}
                            onChange={() => {
                              setImportMode('merge');
                              setConfirmReplaceChecked(false);
                            }}
                            className="mt-0.5 accent-[#1C3B2B]"
                          />
                          <div>
                            <p className="font-semibold text-[#232620]">Merge with Existing Data</p>
                            <p className="text-[11px] text-[#5C6156]">
                              Keeps existing records and cleanly merges matching products, categories, coupons, customers, and orders.
                            </p>
                          </div>
                        </label>
                        <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border border-[#232620]/10 cursor-pointer">
                          <input
                            type="radio"
                            name="importMode"
                            checked={importMode === 'replace'}
                            onChange={() => setImportMode('replace')}
                            className="mt-0.5 accent-[#1C3B2B]"
                          />
                          <div>
                            <p className="font-semibold text-[#232620]">Replace All Local Data</p>
                            <p className="text-[11px] text-[#5C6156]">
                              Atomically clears current local database stores and restores the exact snapshot from this backup.
                            </p>
                          </div>
                        </label>
                      </div>

                      {importMode === 'replace' && (
                        <label className="flex items-center gap-2 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={confirmReplaceChecked}
                            onChange={(e) => setConfirmReplaceChecked(e.target.checked)}
                            className="accent-rose-700"
                          />
                          <span className="font-medium">
                            I understand Replace Mode overwrites all current local IndexedDB records.
                          </span>
                        </label>
                      )}

                      <button
                        type="button"
                        disabled={importingBackup || (importMode === 'replace' && !confirmReplaceChecked)}
                        onClick={handleExecuteImport}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#1C3B2B] hover:bg-[#142C20] disabled:opacity-50 text-[#FAF6EE] font-medium"
                      >
                        <Check className="w-4 h-4 text-[#C5A059]" />
                        <span>
                          {importingBackup
                            ? 'Applying Backup Transaction…'
                            : importMode === 'replace'
                            ? 'Confirm & Replace All Data'
                            : 'Merge Backup Into Local Database'}
                        </span>
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p className="p-3 rounded-lg bg-[#FAF6EE] text-[#5C6156]">
                  Only Super Admins or Store Managers can import or replace database backups.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'team' && isSuperAdmin && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <form
              onSubmit={handleCreateAdminUser}
              className="lg:col-span-5 bg-white rounded-xl border border-[#232620]/10 p-5 space-y-3 text-xs"
            >
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#1C3B2B]" />
                <h3 className="font-display text-xl font-semibold">Add Team Member</h3>
              </div>
              <div>
                <label className="block font-medium mb-1">Name *</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Email *</label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium mb-1">Role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as AdminRole)}
                    className="w-full px-2.5 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
                  >
                    <option value="super_admin">Super Admin</option>
                    <option value="store_manager">Store Manager</option>
                    <option value="inventory_manager">Inventory Manager</option>
                    <option value="support_agent">Customer Support</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Password (8+ chars)</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1C3B2B] text-[#FAF6EE] font-medium"
              >
                <Plus className="w-3.5 h-3.5" />
                Provision Admin User
              </button>
            </form>

            <div className="lg:col-span-7 bg-white rounded-xl border border-[#232620]/10 p-5 space-y-3 text-xs">
              <h3 className="font-display text-xl font-semibold">Team Directory ({teamUsers.length})</h3>
              <div className="divide-y divide-[#232620]/8">
                {teamUsers.map((u) => (
                  <div key={u.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-[#232620]">{u.name}</p>
                      <p className="text-[11px] text-[#5C6156]">{u.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={u.role}
                        onChange={(e) => handleUpdateTeamMember(u.id, { role: e.target.value as AdminRole })}
                        className="px-2 py-1 rounded border border-[#232620]/15 bg-[#FAF6EE] text-[11px]"
                      >
                        <option value="super_admin">Super Admin</option>
                        <option value="store_manager">Store Manager</option>
                        <option value="inventory_manager">Inventory Manager</option>
                        <option value="support_agent">Customer Support</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleUpdateTeamMember(u.id, { isActive: !u.isActive })}
                        className={`px-2 py-1 rounded border text-[11px] ${
                          u.isActive
                            ? 'bg-[#1C3B2B]/10 text-[#1C3B2B] border-[#1C3B2B]/25'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {u.isActive ? 'Active' : 'Disabled'}
                      </button>
                      {u.id !== currentAdmin.id && (
                        <button
                          type="button"
                          onClick={() => handleDeleteTeamMember(u.id)}
                          className="p-1.5 rounded border border-rose-200 text-rose-700"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-[#232620]/10 overflow-hidden text-xs">
            <div className="px-5 py-3 bg-[#FAF6EE] border-b border-[#232620]/10 font-semibold">
              Security &amp; Operations Audit Trail
            </div>
            <div className="max-h-72 overflow-y-auto overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#232620]/10 text-[#5C6156]">
                    <th className="py-2 px-4 font-medium">Time</th>
                    <th className="py-2 px-4 font-medium">Actor</th>
                    <th className="py-2 px-4 font-medium">Role</th>
                    <th className="py-2 px-4 font-medium">Action</th>
                    <th className="py-2 px-4 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232620]/8">
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2 px-4 text-[11px] text-[#5C6156] whitespace-nowrap">
                        {formatShortDateTime(log.createdAt)}
                      </td>
                      <td className="py-2 px-4 font-medium">{log.actorEmail}</td>
                      <td className="py-2 px-4 text-[11px]">{ROLE_LABELS[log.actorRole]}</td>
                      <td className="py-2 px-4 font-mono text-[11px] text-[#1C3B2B]">{log.action}</td>
                      <td className="py-2 px-4 text-[#5C6156]">{log.details || log.targetId || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'profile' && (
        <form
          onSubmit={handleSaveOwnProfile}
          className="max-w-md bg-white rounded-xl border border-[#232620]/10 p-6 space-y-4 text-xs"
        >
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-[#1C3B2B]" />
            <h3 className="font-display text-xl font-semibold">My Administrator Profile</h3>
          </div>
          <p className="text-[#5C6156]">
            Signed in as <strong className="text-[#232620]">{currentAdmin.email}</strong> (
            {ROLE_LABELS[currentAdmin.role]})
          </p>
          <div>
            <label className="block font-medium mb-1">Display Name</label>
            <input
              type="text"
              value={ownName}
              onChange={(e) => setOwnName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">New Password (leave blank to keep current)</label>
            <input
              type="password"
              minLength={8}
              value={ownPassword}
              onChange={(e) => setOwnPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
            />
          </div>
          <button type="submit" className="px-4 py-2 rounded-lg bg-[#1C3B2B] text-[#FAF6EE] font-medium">
            Update Profile
          </button>
        </form>
      )}
    </div>
  );
}

function dbErrorMessage(err: string): string {
  return err.trim() || 'IndexedDB reported an unexpected storage error.';
}
