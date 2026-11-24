import { useEffect, useMemo, useState } from 'react';
import {
  Edit3,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  CategoryRecord,
  Department,
  ModelFinish,
  ModelSilhouette,
  Product,
  ProductVariant,
} from '../../types/store';
import { formatPkr } from '../../utils/commerce';
import { SafeImage } from '../common/SafeImage';
import { adminFetch, uploadAdminAsset } from './adminApi';

interface AdminProductsSectionProps {
  token: string;
  onStorefrontChanged: () => void;
  onToast: (msg: string) => void;
}

const EMPTY_FORM = {
  id: '',
  name: '',
  sku: '',
  subtitle: '',
  department: 'skincare' as Department,
  category: 'Serums',
  pricePkr: 2800,
  discountPricePkr: '' as string | number,
  stock: 25,
  volume: '30 ml',
  routineTime: 'Morning & Night' as Product['routineTime'],
  status: 'published' as 'published' | 'draft' | 'archived',
  isBestSeller: false,
  isNewArrival: true,
  isTrending: false,
  isFeaturedHome: false,
  suitableTypesText: 'All Skin Types',
  concernsText: 'Glow, Hydration',
  keyIngredientsText: 'Niacinamide 10%, Hyaluronic Acid',
  fullIngredientList: 'Aqua, Niacinamide, Glycerin, Botanical Extracts',
  description: '',
  benefitsText: 'Brightens dull tone\nSupports healthy barrier',
  howToUse: 'Apply 2–3 drops to clean, damp skin morning and evening.',
  precautions: 'For external cosmetic use only. Patch test prior to use.',
  images: ['/assets/aistudio/aurelia_glow_serum.png'],
  videoUrl: '',
  variants: [] as ProductVariant[],
  modelSilhouette: 'dropper' as ModelSilhouette,
  defaultFinish: 'emerald' as ModelFinish,
};

export function AdminProductsSection({
  token,
  onStorefrontChanged,
  onToast,
}: AdminProductsSectionProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState<'all' | Department>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft' | 'archived'>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [prodData, catData] = await Promise.all([
        adminFetch<{ products: Product[] }>('/api/admin/products', token),
        adminFetch<{ categories: CategoryRecord[] }>('/api/admin/categories', token),
      ]);
      setProducts(prodData.products);
      setCategories(catData.categories);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to load products.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (deptFilter !== 'all' && p.department !== deptFilter) return false;
      if (statusFilter !== 'all' && (p.status || 'published') !== statusFilter) return false;
      if (q) {
        const hay = `${p.name} ${p.sku || ''} ${p.category} ${p.slug}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [products, search, deptFilter, statusFilter]);

  const openCreateModal = () => {
    const firstCat = categories.find((c) => c.department === 'skincare')?.name || 'Serums';
    setForm({ ...EMPTY_FORM, category: firstCat });
    setModalOpen(true);
  };

  const openEditModal = (p: Product) => {
    setForm({
      id: p.id,
      name: p.name,
      sku: p.sku || '',
      subtitle: p.subtitle,
      department: p.department,
      category: p.category,
      pricePkr: p.pricePkr,
      discountPricePkr: p.discountPricePkr ?? '',
      stock: p.stock,
      volume: p.volume,
      routineTime: p.routineTime,
      status: p.status || 'published',
      isBestSeller: Boolean(p.isBestSeller),
      isNewArrival: Boolean(p.isNewArrival),
      isTrending: Boolean(p.isTrending),
      isFeaturedHome: Boolean(p.isFeaturedHome),
      suitableTypesText: p.suitableTypes.join(', '),
      concernsText: p.concerns.join(', '),
      keyIngredientsText: p.keyIngredients.join(', '),
      fullIngredientList: p.fullIngredientList,
      description: p.description,
      benefitsText: p.benefits.join('\n'),
      howToUse: p.howToUse,
      precautions: p.precautions,
      images: p.images.length > 0 ? p.images : ['/assets/aistudio/aurelia_glow_serum.png'],
      videoUrl: p.videoUrl || '',
      variants: p.variants || [],
      modelSilhouette: p.modelSilhouette,
      defaultFinish: p.defaultFinish,
    });
    setModalOpen(true);
  };

  const handleUploadImage = async (file?: File) => {
    if (!file) return;
    setUploadingMedia(true);
    try {
      const uploaded = await uploadAdminAsset(file, token);
      setForm((prev) => ({ ...prev, images: [...prev.images, uploaded.url] }));
      onToast('Product image uploaded.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Image upload failed.');
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleUploadVideo = async (file?: File) => {
    if (!file) return;
    setUploadingMedia(true);
    try {
      const uploaded = await uploadAdminAsset(file, token);
      setForm((prev) => ({ ...prev, videoUrl: uploaded.url }));
      onToast('Product video uploaded.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Video upload failed.');
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const splitCsv = (v: string) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      const benefits = form.benefitsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const payload: Partial<Product> = {
        name: form.name.trim(),
        sku: form.sku.trim() || undefined,
        subtitle: form.subtitle.trim() || 'Botanical Formulation',
        department: form.department,
        category: form.category,
        pricePkr: Number(form.pricePkr),
        discountPricePkr:
          form.discountPricePkr === '' || Number(form.discountPricePkr) <= 0
            ? undefined
            : Number(form.discountPricePkr),
        stock: Number(form.stock),
        volume: form.volume.trim() || '50 ml',
        routineTime: form.routineTime,
        status: form.status,
        isBestSeller: form.isBestSeller,
        isNewArrival: form.isNewArrival,
        isTrending: form.isTrending,
        isFeaturedHome: form.isFeaturedHome,
        suitableTypes: splitCsv(form.suitableTypesText),
        concerns: splitCsv(form.concernsText),
        keyIngredients: splitCsv(form.keyIngredientsText),
        fullIngredientList: form.fullIngredientList.trim(),
        description: form.description.trim() || form.subtitle.trim(),
        benefits: benefits.length > 0 ? benefits : ['Supports healthy botanical balance'],
        howToUse: form.howToUse.trim(),
        precautions: form.precautions.trim(),
        images: form.images.length > 0 ? form.images : ['/assets/aistudio/aurelia_glow_serum.png'],
        videoUrl: form.videoUrl.trim() || undefined,
        variants: form.variants,
        modelSilhouette: form.modelSilhouette,
        defaultFinish: form.defaultFinish,
      };

      if (form.id) {
        await adminFetch(`/api/admin/products/${form.id}`, token, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        onToast('Product updated.');
      } else {
        await adminFetch('/api/admin/products', token, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        onToast('New product created.');
      }
      setModalOpen(false);
      await loadData();
      onStorefrontChanged();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not save product.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await adminFetch(`/api/admin/products/${confirmDelete.id}`, token, { method: 'DELETE' });
      onToast(`Deleted "${confirmDelete.name}".`);
      setConfirmDelete(null);
      await loadData();
      onStorefrontChanged();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not delete product.');
    }
  };

  const departmentCategories = categories.filter((c) => c.department === form.department);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-[#232620]/10">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search className="w-4 h-4 text-[#5C6156] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, SKU, category..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-xs"
            />
          </div>
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value as 'all' | Department)}
            className="px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-xs"
          >
            <option value="all">All Departments</option>
            <option value="skincare">Skincare</option>
            <option value="haircare">Haircare</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-xs"
          >
            <option value="all">All Statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1C3B2B] hover:bg-[#142C20] text-[#FAF6EE] text-xs font-medium"
        >
          <Plus className="w-4 h-4" />
          <span>Add Product</span>
        </button>
      </div>

      <div className="bg-white rounded-xl border border-[#232620]/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-[#FAF6EE] border-b border-[#232620]/10 text-[#5C6156]">
                <th className="py-3 px-4 font-medium">Product</th>
                <th className="py-3 px-4 font-medium">SKU / Dept</th>
                <th className="py-3 px-4 font-medium">Category</th>
                <th className="py-3 px-4 font-medium">Price</th>
                <th className="py-3 px-4 font-medium">Stock</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232620]/8">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[#5C6156]">
                    Loading products…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[#5C6156]">
                    No products match your filter.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-[#FAF6EE]/50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <SafeImage
                          src={p.images[0]}
                          alt={p.name}
                          className="w-10 h-10 rounded-lg object-cover bg-[#F1EAE0] shrink-0"
                        />
                        <div>
                          <p className="font-semibold text-[#232620]">{p.name}</p>
                          <p className="text-[11px] text-[#5C6156]">{p.volume}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-mono text-[11px] text-[#232620]">{p.sku || '—'}</p>
                      <p className="capitalize text-[11px] text-[#5C6156]">{p.department}</p>
                    </td>
                    <td className="py-3 px-4 text-[#232620]">{p.category}</td>
                    <td className="py-3 px-4 font-mono tabular-nums">
                      {p.discountPricePkr ? (
                        <div>
                          <span className="font-semibold text-[#1C3B2B]">{formatPkr(p.discountPricePkr)}</span>
                          <span className="block text-[10px] line-through text-[#5C6156]">
                            {formatPkr(p.pricePkr)}
                          </span>
                        </div>
                      ) : (
                        <span className="font-semibold text-[#232620]">{formatPkr(p.pricePkr)}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums">
                      <span
                        className={`px-2 py-0.5 rounded font-semibold ${
                          p.stock === 0
                            ? 'bg-rose-50 text-rose-700'
                            : p.stock <= 10
                            ? 'bg-amber-50 text-amber-800'
                            : 'bg-[#1C3B2B]/10 text-[#1C3B2B]'
                        }`}
                      >
                        {p.stock}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded border text-[11px] capitalize ${
                          (p.status || 'published') === 'published'
                            ? 'bg-[#1C3B2B]/10 text-[#1C3B2B] border-[#1C3B2B]/25'
                            : (p.status || 'published') === 'draft'
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-stone-100 text-stone-700 border-stone-200'
                        }`}
                      >
                        {p.status || 'published'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEditModal(p)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[#232620]/15 hover:bg-[#FAF6EE] text-[#232620]"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(p)}
                        aria-label={`Delete ${p.name}`}
                        className="inline-flex items-center p-1.5 rounded-md border border-rose-200 text-rose-700 hover:bg-rose-50"
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

      {/* Add / Edit Product Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-[#232620]/50 flex items-center justify-center p-4">
          <div className="bg-[#FDFBF7] w-full max-w-3xl max-h-[90vh] rounded-2xl border border-[#232620]/15 shadow-2xl flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-[#232620]/10 flex items-center justify-between">
              <h2 className="font-display text-2xl font-semibold text-[#232620]">
                {form.id ? 'Edit Product' : 'Add New Product'}
              </h2>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-[#F1EAE0]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-6 overflow-y-auto space-y-5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-medium text-[#232620] mb-1">Product Name *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#232620] mb-1">SKU</label>
                  <input
                    type="text"
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    placeholder="AB-SK-015"
                    className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-[#232620] mb-1">Department</label>
                  <select
                    value={form.department}
                    onChange={(e) => {
                      const dept = e.target.value as Department;
                      const defaultCat =
                        categories.find((c) => c.department === dept)?.name ||
                        (dept === 'skincare' ? 'Serums' : 'Hair Oils');
                      setForm({ ...form, department: dept, category: defaultCat });
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white"
                  >
                    <option value="skincare">Skincare</option>
                    <option value="haircare">Haircare</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-[#232620] mb-1">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white"
                  >
                    {departmentCategories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                    {!departmentCategories.some((c) => c.name === form.category) && (
                      <option value={form.category}>{form.category}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-[#232620] mb-1">Publish Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })}
                    className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white"
                  >
                    <option value="published">Published (Live)</option>
                    <option value="draft">Draft (Hidden)</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-medium text-[#232620] mb-1">Regular Price (PKR) *</label>
                  <input
                    type="number"
                    required
                    min={100}
                    value={form.pricePkr}
                    onChange={(e) => setForm({ ...form, pricePkr: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#232620] mb-1">Sale Price (PKR)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.discountPricePkr}
                    onChange={(e) => setForm({ ...form, discountPricePkr: e.target.value })}
                    placeholder="Optional"
                    className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#232620] mb-1">Stock Qty</label>
                  <input
                    type="number"
                    min={0}
                    value={form.stock}
                    onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#232620] mb-1">Volume / Size</label>
                  <input
                    type="text"
                    value={form.volume}
                    onChange={(e) => setForm({ ...form, volume: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#232620] mb-1">Subtitle / Short Tagline</label>
                <input
                  type="text"
                  value={form.subtitle}
                  onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white"
                />
              </div>

              <div>
                <label className="block font-medium text-[#232620] mb-1">Full Product Description</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#232620] mb-1">Suitable Skin / Hair Types (comma separated)</label>
                  <input
                    type="text"
                    value={form.suitableTypesText}
                    onChange={(e) => setForm({ ...form, suitableTypesText: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#232620] mb-1">Key Ingredients (comma separated)</label>
                  <input
                    type="text"
                    value={form.keyIngredientsText}
                    onChange={(e) => setForm({ ...form, keyIngredientsText: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#232620] mb-1">How to Use</label>
                  <input
                    type="text"
                    value={form.howToUse}
                    onChange={(e) => setForm({ ...form, howToUse: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#232620] mb-1">Benefits (one per line)</label>
                  <textarea
                    rows={2}
                    value={form.benefitsText}
                    onChange={(e) => setForm({ ...form, benefitsText: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white"
                  />
                </div>
              </div>

              {/* Images & Video Upload */}
              <div className="p-4 rounded-xl bg-[#FAF6EE] border border-[#232620]/10 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-[#232620]">Product Gallery &amp; Video</span>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#232620]/15 hover:bg-[#F1EAE0] cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{uploadingMedia ? 'Uploading...' : 'Upload Image'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => handleUploadImage(e.target.files?.[0])}
                      />
                    </label>
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#232620]/15 hover:bg-[#F1EAE0] cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload MP4 Video</span>
                      <input
                        type="file"
                        accept="video/mp4,video/webm"
                        className="hidden"
                        onChange={(e) => handleUploadVideo(e.target.files?.[0])}
                      />
                    </label>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {form.images.map((img, i) => (
                    <div key={`${img}-${i}`} className="relative w-16 h-16 rounded-lg overflow-hidden border border-[#232620]/15">
                      <SafeImage src={img} alt="Gallery" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, images: form.images.filter((_, idx) => idx !== i) })}
                        className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center text-[10px]"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newImageUrl}
                    onChange={(e) => setNewImageUrl(e.target.value)}
                    placeholder="Or paste image URL..."
                    className="flex-1 px-3 py-1.5 rounded-lg border border-[#232620]/15 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newImageUrl.trim()) return;
                      setForm({ ...form, images: [...form.images, newImageUrl.trim()] });
                      setNewImageUrl('');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#4A5D3F] text-white"
                  >
                    Add URL
                  </button>
                </div>

                <div>
                  <label className="block font-medium text-[#232620] mb-1">Optional Product Video URL</label>
                  <input
                    type="text"
                    value={form.videoUrl}
                    onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
                    placeholder="/uploads/... or MP4 link"
                    className="w-full px-3 py-1.5 rounded-lg border border-[#232620]/15 bg-white"
                  />
                </div>
              </div>

              {/* Variants + Flags + 3D Defaults */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-xl bg-[#FAF6EE] border border-[#232620]/10 space-y-2">
                  <span className="font-semibold text-[#232620] block">Merchandising Highlights</span>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: 'isBestSeller', label: 'Best Seller' },
                      { key: 'isNewArrival', label: 'New Arrival' },
                      { key: 'isTrending', label: 'Trending Now' },
                      { key: 'isFeaturedHome', label: 'Featured on Home' },
                    ].map((flag) => (
                      <label key={flag.key} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(form[flag.key as keyof typeof form])}
                          onChange={(e) => setForm({ ...form, [flag.key]: e.target.checked })}
                          className="accent-[#1C3B2B]"
                        />
                        <span>{flag.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#FAF6EE] border border-[#232620]/10 space-y-2">
                  <span className="font-semibold text-[#232620] block">Default 3D Vessel Silhouette</span>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={form.modelSilhouette}
                      onChange={(e) => setForm({ ...form, modelSilhouette: e.target.value as ModelSilhouette })}
                      className="px-2.5 py-1.5 rounded-lg border border-[#232620]/15 bg-white"
                    >
                      <option value="dropper">Serum Dropper</option>
                      <option value="jar">Ceramide Jar</option>
                      <option value="pump">Botanical Pump</option>
                    </select>
                    <select
                      value={form.defaultFinish}
                      onChange={(e) => setForm({ ...form, defaultFinish: e.target.value as ModelFinish })}
                      className="px-2.5 py-1.5 rounded-lg border border-[#232620]/15 bg-white"
                    >
                      <option value="emerald">Emerald Glass</option>
                      <option value="ivory">Frosted Ivory</option>
                      <option value="aqua">Aqua Botanical</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#232620]/10">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-[#232620]/15 hover:bg-[#F1EAE0]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-[#1C3B2B] hover:bg-[#142C20] text-[#FAF6EE] font-medium"
                >
                  {saving ? 'Saving...' : form.id ? 'Save Changes' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-[#232620]/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 border border-[#232620]/15 space-y-4">
            <h3 className="font-display text-xl font-semibold text-[#232620]">Delete Product?</h3>
            <p className="text-xs text-[#5C6156]">
              Remove <strong>{confirmDelete.name}</strong> from the store database? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="px-3.5 py-2 rounded-lg border border-[#232620]/15"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="px-3.5 py-2 rounded-lg bg-rose-700 text-white font-medium"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
