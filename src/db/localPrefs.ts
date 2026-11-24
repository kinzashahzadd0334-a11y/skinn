import type { AdminRole, AdminSectionId, StoreConfig, StoreSettingsFull } from '../types/store';

export const LS_ADMIN_SESSION = 'aurelia_admin_session_v1';
export const LS_ADMIN_UI_PREFS = 'aurelia_admin_ui_prefs_v1';
export const LS_BACKUP_META = 'aurelia_backup_meta_v1';
export const LS_STORE_PREFS = 'aurelia_store_prefs_v1';

export interface StoredAdminSession {
  token: string;
  admin: {
    id: string;
    name: string;
    email: string;
    role: AdminRole;
  };
  savedAt: string;
}

export interface AdminUiPrefs {
  sidebarCollapsed: boolean;
  activeSection: AdminSectionId;
}

export interface BackupMetaPrefs {
  lastBackupAt: string | null;
  lastBackupFileName?: string;
  lastRestoreAt?: string;
  lastResetAt?: string;
}

export interface LightweightStorePrefs {
  brandName: string;
  currency: 'PKR';
  shippingFeePkr: number;
  freeShippingThresholdPkr: number;
  taxPercent: number;
  lowStockThreshold: number;
  codEnabled: boolean;
  promoBannerText: string;
  promoBannerActive: boolean;
  whatsappNumber: string;
  whatsappEnabled: boolean;
  updatedAt: string;
}

function hasLocalStorage(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export function safeReadLocalPref<T>(key: string, fallback: T): T {
  if (!hasLocalStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function safeWriteLocalPref<T>(key: string, value: T): boolean {
  if (!hasLocalStorage()) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn(`[localPrefs] Failed writing localStorage key "${key}":`, err);
    return false;
  }
}

export function safeRemoveLocalPref(key: string): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage removal errors
  }
}

export function getSavedAdminSession(): StoredAdminSession | null {
  const session = safeReadLocalPref<StoredAdminSession | null>(LS_ADMIN_SESSION, null);
  if (!session || !session.token || !session.admin?.id || !session.admin?.role) {
    return null;
  }
  return session;
}

export function saveAdminSession(session: StoredAdminSession): void {
  safeWriteLocalPref(LS_ADMIN_SESSION, session);
}

export function clearAdminSession(): void {
  safeRemoveLocalPref(LS_ADMIN_SESSION);
}

export function getAdminUiPrefs(): AdminUiPrefs {
  return safeReadLocalPref<AdminUiPrefs>(LS_ADMIN_UI_PREFS, {
    sidebarCollapsed: false,
    activeSection: 'dashboard',
  });
}

export function saveAdminUiPrefs(patch: Partial<AdminUiPrefs>): AdminUiPrefs {
  const next = { ...getAdminUiPrefs(), ...patch };
  safeWriteLocalPref(LS_ADMIN_UI_PREFS, next);
  return next;
}

export function getBackupMetaPrefs(): BackupMetaPrefs {
  return safeReadLocalPref<BackupMetaPrefs>(LS_BACKUP_META, {
    lastBackupAt: null,
  });
}

export function saveBackupMetaPrefs(patch: Partial<BackupMetaPrefs>): BackupMetaPrefs {
  const next = { ...getBackupMetaPrefs(), ...patch };
  safeWriteLocalPref(LS_BACKUP_META, next);
  return next;
}

export function syncLightweightStorePrefs(settings: StoreSettingsFull | StoreConfig): void {
  const full = settings as Partial<StoreSettingsFull>;
  const payload: LightweightStorePrefs = {
    brandName: settings.brandName || 'Aurelia Botanica',
    currency: 'PKR',
    shippingFeePkr: settings.shippingFeePkr ?? 250,
    freeShippingThresholdPkr: settings.freeShippingThresholdPkr ?? 5000,
    taxPercent: settings.taxPercent ?? 0,
    lowStockThreshold: full.lowStockThreshold ?? 10,
    codEnabled: settings.codEnabled ?? true,
    promoBannerText: settings.promoBannerText || '',
    promoBannerActive: settings.promoBannerActive ?? true,
    whatsappNumber: settings.whatsappNumber || '923001234567',
    whatsappEnabled: settings.whatsappEnabled ?? true,
    updatedAt: new Date().toISOString(),
  };
  safeWriteLocalPref(LS_STORE_PREFS, payload);
}

export function getLightweightStorePrefs(): LightweightStorePrefs | null {
  return safeReadLocalPref<LightweightStorePrefs | null>(LS_STORE_PREFS, null);
}
