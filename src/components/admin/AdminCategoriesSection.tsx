import { useEffect, useState } from 'react';
import { Edit3, Plus, Trash2, X } from 'lucide-react';
import type { CategoryRecord, Department } from '../../types/store';
import { adminFetch } from './adminApi';

interface AdminCategoriesSectionProps {
  token: string;
  onStorefrontChanged: () => void;
  onToast: (msg: string) => void;
}

const EMPTY_CAT = {
  id: '',
  name: '',
  department: 'skincare' as Department,
  description: '',
  displayOrder: 1,
  isActive: true,
};

export function AdminCategoriesSection({
  token,
  onStorefrontChanged,
  onToast,
}: AdminCategoriesSectionProps) {
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_CAT);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminFetch<{ categories: CategoryRecord[] }>('/api/admin/categories', token);
      setCategories(data.categories);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to load categories.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        department: form.department,
        description: form.description.trim(),
        displayOrder: Number(form.displayOrder),
        isActive: form.isActive,
      };
      if (form.id) {
        await adminFetch(`/api/admin/categories/${form.id}`, token, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        onToast('Category updated.');
      } else {
        await adminFetch('/api/admin/categories', token, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        onToast('Category created.');
      }
      setModalOpen(false);
      await load();
      onStorefrontChanged();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not save category.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (cat: CategoryRecord) => {
    try {
      await adminFetch(`/api/admin/categories/${cat.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !cat.isActive }),
      });
      await load();
      onStorefrontChanged();
      onToast(`${cat.name} ${!cat.isActive ? 'activated' : 'hidden'}.`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not update category.');
    }
  };

  const handleDelete = async (cat: CategoryRecord) => {
    try {
      await adminFetch(`/api/admin/categories/${cat.id}`, token, { method: 'DELETE' });
      onToast(`Removed category ${cat.name}.`);
      await load();
      onStorefrontChanged();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not delete category.');
    }
  };

  const skincareCats = categories.filter((c) => c.department === 'skincare');
  const haircareCats = categories.filter((c) => c.department === 'haircare');

  const renderGroup = (title: string, dept: Department, items: CategoryRecord[]) => (
    <div className="bg-white rounded-xl border border-[#232620]/10 overflow-hidden">
      <div className="px-5 py-3.5 bg-[#FAF6EE] border-b border-[#232620]/10 flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold text-[#232620]">{title}</h2>
          <p className="text-[11px] text-[#5C6156]">{items.length} categories configured</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setForm({ ...EMPTY_CAT, department: dept, displayOrder: items.length + 1 });
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1C3B2B] text-[#FAF6EE] text-xs font-medium"
        >
          <Plus className="w-3.5 h-3.5" />
          Add {dept === 'skincare' ? 'Skincare' : 'Haircare'} Category
        </button>
      </div>

      <div className="divide-y divide-[#232620]/8">
        {loading ? (
          <p className="p-6 text-xs text-[#5C6156]">Loading categories…</p>
        ) : (
          items.map((cat) => (
            <div key={cat.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs hover:bg-[#FAF6EE]/50">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-[#5C6156]">#{cat.displayOrder}</span>
                  <span className="font-semibold text-[#232620]">{cat.name}</span>
                  <span className="px-2 py-0.5 rounded bg-[#FAF6EE] border border-[#232620]/10 text-[11px] font-mono tabular-nums">
                    {cat.productCount ?? 0} SKUs
                  </span>
                </div>
                {cat.description && <p className="text-[11px] text-[#5C6156] mt-0.5 truncate">{cat.description}</p>}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleActive(cat)}
                  className={`px-2.5 py-1 rounded border text-[11px] font-medium ${
                    cat.isActive
                      ? 'bg-[#1C3B2B]/10 text-[#1C3B2B] border-[#1C3B2B]/25'
                      : 'bg-stone-100 text-stone-600 border-stone-200'
                  }`}
                >
                  {cat.isActive ? 'Visible' : 'Hidden'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForm({
                      id: cat.id,
                      name: cat.name,
                      department: cat.department,
                      description: cat.description || '',
                      displayOrder: cat.displayOrder,
                      isActive: cat.isActive,
                    });
                    setModalOpen(true);
                  }}
                  className="p-1.5 rounded border border-[#232620]/15 hover:bg-[#FAF6EE]"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(cat)}
                  className="p-1.5 rounded border border-rose-200 text-rose-700 hover:bg-rose-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {renderGroup('Skincare Categories', 'skincare', skincareCats)}
      {renderGroup('Haircare Categories', 'haircare', haircareCats)}

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-[#232620]/50 flex items-center justify-center p-4">
          <div className="bg-[#FDFBF7] w-full max-w-md rounded-2xl border border-[#232620]/15 shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#232620]/10 flex items-center justify-between">
              <h3 className="font-display text-xl font-semibold text-[#232620]">
                {form.id ? 'Edit Category' : 'Add Category'}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1 hover:bg-[#F1EAE0] rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-[#232620] mb-1">Category Name *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#232620] mb-1">Department</label>
                  <select
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value as Department })}
                    className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white"
                  >
                    <option value="skincare">Skincare</option>
                    <option value="haircare">Haircare</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-[#232620] mb-1">Display Order</label>
                  <input
                    type="number"
                    min={1}
                    value={form.displayOrder}
                    onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-[#232620] mb-1">Description</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="accent-[#1C3B2B]"
                />
                <span>Visible on customer storefront</span>
              </label>
              <div className="flex justify-end gap-2 pt-2 border-t border-[#232620]/10">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg border border-[#232620]/15">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-[#1C3B2B] text-[#FAF6EE] font-medium">
                  {saving ? 'Saving...' : 'Save Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
