import type { AdminRole, AdminSectionId, OrderStatus } from '../../types/store';
import { dispatchAdminLocalApi } from '../../db/localApiBridge';
import { generateCsvReportLocal, saveUploadedMediaBlob } from '../../db/localDatabase';

export interface AdminNavItem {
  id: AdminSectionId;
  label: string;
  group: 'Operations' | 'Merchandising' | 'Intelligence & Experience' | 'System';
  allowedRoles: AdminRole[];
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    group: 'Operations',
    allowedRoles: ['super_admin', 'store_manager', 'inventory_manager', 'support_agent'],
  },
  {
    id: 'orders',
    label: 'Orders',
    group: 'Operations',
    allowedRoles: ['super_admin', 'store_manager', 'support_agent'],
  },
  {
    id: 'customers',
    label: 'Customers',
    group: 'Operations',
    allowedRoles: ['super_admin', 'store_manager', 'support_agent'],
  },
  {
    id: 'support',
    label: 'Customer Support',
    group: 'Operations',
    allowedRoles: ['super_admin', 'store_manager', 'support_agent'],
  },
  {
    id: 'products',
    label: 'Products',
    group: 'Merchandising',
    allowedRoles: ['super_admin', 'store_manager', 'inventory_manager'],
  },
  {
    id: 'categories',
    label: 'Categories',
    group: 'Merchandising',
    allowedRoles: ['super_admin', 'store_manager', 'inventory_manager'],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    group: 'Merchandising',
    allowedRoles: ['super_admin', 'store_manager', 'inventory_manager'],
  },
  {
    id: 'coupons',
    label: 'Discounts & Coupons',
    group: 'Merchandising',
    allowedRoles: ['super_admin', 'store_manager'],
  },
  {
    id: 'reviews',
    label: 'Reviews',
    group: 'Merchandising',
    allowedRoles: ['super_admin', 'store_manager', 'support_agent'],
  },
  {
    id: 'ai',
    label: 'AI Management',
    group: 'Intelligence & Experience',
    allowedRoles: ['super_admin', 'store_manager', 'support_agent'],
  },
  {
    id: 'studio3d',
    label: '3D Product Studio',
    group: 'Intelligence & Experience',
    allowedRoles: ['super_admin', 'store_manager', 'inventory_manager'],
  },
  {
    id: 'content',
    label: 'Website Content',
    group: 'Intelligence & Experience',
    allowedRoles: ['super_admin', 'store_manager'],
  },
  {
    id: 'analytics',
    label: 'Analytics & Reports',
    group: 'Intelligence & Experience',
    allowedRoles: ['super_admin', 'store_manager', 'inventory_manager', 'support_agent'],
  },
  {
    id: 'settings',
    label: 'Settings',
    group: 'System',
    allowedRoles: ['super_admin', 'store_manager', 'inventory_manager', 'support_agent'],
  },
];

export const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Super Admin',
  store_manager: 'Store Manager',
  inventory_manager: 'Inventory Manager',
  support_agent: 'Customer Support',
};

export function canAccessSection(role: AdminRole, section: AdminSectionId): boolean {
  const found = ADMIN_NAV_ITEMS.find((item) => item.id === section);
  return found ? found.allowedRoles.includes(role) : false;
}

export async function adminFetch<T>(
  url: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  return dispatchAdminLocalApi<T>(url, token, options);
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

const ALLOWED_UPLOAD_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.mp4', '.webm', '.glb', '.gltf'];
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function uploadAdminAsset(
  file: File,
  _token: string,
): Promise<{ url: string; mimeType: string; sizeBytes: number }> {
  if (!file) {
    throw new Error('No file selected.');
  }
  const lower = file.name.toLowerCase();
  const hasAllowedExt = ALLOWED_UPLOAD_EXTENSIONS.some((ext) => lower.endsWith(ext));
  const isAllowedMime =
    file.type.startsWith('image/') ||
    file.type.startsWith('video/') ||
    file.type === 'model/gltf-binary' ||
    file.type === 'model/gltf+json';
  if (!hasAllowedExt && !isAllowedMime) {
    throw new Error('Unsupported file format. Allowed: PNG, JPG, WEBP, MP4, WEBM, GLB, GLTF.');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('File exceeds the 25 MB local storage limit.');
  }
  const mimeType =
    file.type ||
    (lower.endsWith('.glb')
      ? 'model/gltf-binary'
      : lower.endsWith('.gltf')
      ? 'model/gltf+json'
      : 'application/octet-stream');

  return saveUploadedMediaBlob({
    fileName: file.name,
    mimeType,
    blob: file,
  });
}

export async function downloadLocalCsvReport(kind: 'orders' | 'inventory'): Promise<void> {
  const csv = await generateCsvReportLocal(kind);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aurelia-${kind}-report.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function getOrderStatusBadgeClass(status: OrderStatus): string {
  switch (status) {
    case 'Delivered':
      return 'bg-[#1C3B2B]/12 text-[#1C3B2B] border-[#1C3B2B]/25';
    case 'Shipped':
    case 'Out for Delivery':
      return 'bg-[#C5A059]/18 text-[#7A5D20] border-[#C5A059]/35';
    case 'Confirmed':
    case 'Processing':
      return 'bg-[#4A5D3F]/14 text-[#3A4A31] border-[#4A5D3F]/25';
    case 'Cancelled':
    case 'Returned':
      return 'bg-rose-50 text-rose-800 border-rose-200';
    case 'Pending':
    default:
      return 'bg-amber-50 text-amber-800 border-amber-200';
  }
}

export function formatShortDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatShortDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-PK', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
