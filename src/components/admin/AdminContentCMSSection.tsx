import { useEffect, useState } from 'react';
import { Check, Plus, Trash2, Upload } from 'lucide-react';
import type { Product, StudioBackdrop, WebsiteContentCMS } from '../../types/store';
import { adminFetch, uploadAdminAsset } from './adminApi';

interface AdminContentCMSSectionProps {
  token: string;
  onStorefrontChanged: () => void;
  onToast: (msg: string) => void;
}

export function AdminContentCMSSection({
  token,
  onStorefrontChanged,
  onToast,
}: AdminContentCMSSectionProps) {
  const [cms, setCms] = useState<WebsiteContentCMS | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeTab, setActiveTab] = useState<'hero' | 'brand' | 'policies' | 'faqs' | 'blog'>('hero');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    Promise.all([
      adminFetch<{ content: WebsiteContentCMS }>('/api/admin/content', token),
      adminFetch<{ products: Product[] }>('/api/admin/products', token),
    ])
      .then(([cmsData, prodData]) => {
        setCms(cmsData.content);
        setProducts(prodData.products);
      })
      .catch((err) => onToast(err instanceof Error ? err.message : 'Failed to load CMS content.'));
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!cms) return;
    setSaving(true);
    try {
      const data = await adminFetch<{ content: WebsiteContentCMS }>('/api/admin/content', token, {
        method: 'PUT',
        body: JSON.stringify(cms),
      });
      setCms(data.content);
      onStorefrontChanged();
      onToast('Website content published to storefront.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not save CMS content.');
    } finally {
      setSaving(false);
    }
  };

  const handleHeroImageUpload = async (file?: File) => {
    if (!file || !cms) return;
    setUploading(true);
    try {
      const uploaded = await uploadAdminAsset(file, token);
      setCms({ ...cms, heroImage: uploaded.url });
      onToast('Editorial hero image uploaded.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  if (!cms) {
    return <div className="p-10 text-center text-xs text-[#5C6156]">Loading Website Content CMS…</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-[#232620]/10">
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'hero', label: 'Home Hero & Banners' },
            { id: 'brand', label: 'About & Contact' },
            { id: 'policies', label: 'Store Policies' },
            { id: 'faqs', label: `FAQs (${cms.faqs.length})` },
            { id: 'blog', label: `Beauty Journal (${cms.blogArticles.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-[#1C3B2B] text-[#FAF6EE]'
                  : 'bg-[#FAF6EE] text-[#232620] hover:bg-[#F1EAE0]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#1C3B2B] hover:bg-[#142C20] text-[#FAF6EE] text-xs font-semibold"
        >
          <Check className="w-3.5 h-3.5 text-[#C5A059]" />
          <span>{saving ? 'Publishing…' : 'Publish Changes'}</span>
        </button>
      </div>

      <div className="bg-white rounded-xl border border-[#232620]/10 p-6 space-y-5 text-xs">
        {activeTab === 'hero' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-[#FAF6EE] border border-[#232620]/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#232620]">Top Promotional Announcement Bar</span>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cms.promoBannerEnabled}
                    onChange={(e) => setCms({ ...cms, promoBannerEnabled: e.target.checked })}
                    className="accent-[#1C3B2B]"
                  />
                  <span>Show on storefront</span>
                </label>
              </div>
              <input
                type="text"
                value={cms.promoBannerText}
                onChange={(e) => setCms({ ...cms, promoBannerText: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium mb-1">Hero Eyebrow Tagline</label>
                <input
                  type="text"
                  value={cms.heroEyebrow}
                  onChange={(e) => setCms({ ...cms, heroEyebrow: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Hero Main Headline</label>
                <input
                  type="text"
                  value={cms.heroTitle}
                  onChange={(e) => setCms({ ...cms, heroTitle: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium mb-1">Hero Subtitle Paragraph</label>
              <textarea
                rows={2}
                value={cms.heroSubtitle}
                onChange={(e) => setCms({ ...cms, heroSubtitle: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block font-medium mb-1">Primary CTA Button</label>
                <input
                  type="text"
                  value={cms.heroPrimaryCta}
                  onChange={(e) => setCms({ ...cms, heroPrimaryCta: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Secondary CTA Button</label>
                <input
                  type="text"
                  value={cms.heroSecondaryCta}
                  onChange={(e) => setCms({ ...cms, heroSecondaryCta: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Default Hero 3D Product</label>
                <select
                  value={cms.heroDefaultProductSlug}
                  onChange={(e) => setCms({ ...cms, heroDefaultProductSlug: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.slug}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1">Hero 3D Backdrop</label>
                <select
                  value={cms.heroDefaultBackdrop}
                  onChange={(e) => setCms({ ...cms, heroDefaultBackdrop: e.target.value as StudioBackdrop })}
                  className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
                >
                  <option value="sage">Sage Studio</option>
                  <option value="blush">Silk Blush</option>
                  <option value="linen">Warm Linen</option>
                  <option value="obsidian">Dark Studio</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#232620]/10">
              <div>
                <label className="block font-medium mb-1">Editorial Spotlight Title</label>
                <input
                  type="text"
                  value={cms.editorialTitle}
                  onChange={(e) => setCms({ ...cms, editorialTitle: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
                />
                <label className="block font-medium mt-3 mb-1">Editorial Spotlight Body</label>
                <textarea
                  rows={2}
                  value={cms.editorialBody}
                  onChange={(e) => setCms({ ...cms, editorialBody: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
                />
              </div>
              <div className="space-y-2">
                <label className="block font-medium">Editorial Banner Image</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={cms.heroImage}
                    onChange={(e) => setCms({ ...cms, heroImage: e.target.value })}
                    className="flex-1 px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
                  />
                  <label className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-[#FAF6EE] border border-[#232620]/15 cursor-pointer hover:bg-[#F1EAE0]">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploading ? '…' : 'Upload'}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => handleHeroImageUpload(e.target.files?.[0])}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'brand' && (
          <div className="space-y-4">
            <div>
              <label className="block font-medium mb-1">About Us Heading</label>
              <input
                type="text"
                value={cms.aboutHeading}
                onChange={(e) => setCms({ ...cms, aboutHeading: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Brand Story</label>
              <textarea
                rows={4}
                value={cms.aboutStory}
                onChange={(e) => setCms({ ...cms, aboutStory: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#232620]/10">
              <div>
                <label className="block font-medium mb-1">Contact Heading</label>
                <input
                  type="text"
                  value={cms.contactHeading}
                  onChange={(e) => setCms({ ...cms, contactHeading: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Studio Address</label>
                <input
                  type="text"
                  value={cms.contactAddress}
                  onChange={(e) => setCms({ ...cms, contactAddress: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Support Phone</label>
                <input
                  type="text"
                  value={cms.contactPhone}
                  onChange={(e) => setCms({ ...cms, contactPhone: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Support Email</label>
                <input
                  type="email"
                  value={cms.contactEmail}
                  onChange={(e) => setCms({ ...cms, contactEmail: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'policies' && (
          <div className="space-y-4">
            <div>
              <label className="block font-medium mb-1">Pakistan Shipping Policy</label>
              <textarea
                rows={3}
                value={cms.shippingPolicyBody}
                onChange={(e) => setCms({ ...cms, shippingPolicyBody: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Returns &amp; Exchanges Policy</label>
              <textarea
                rows={3}
                value={cms.returnPolicyBody}
                onChange={(e) => setCms({ ...cms, returnPolicyBody: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Privacy Policy</label>
              <textarea
                rows={3}
                value={cms.privacyPolicyBody}
                onChange={(e) => setCms({ ...cms, privacyPolicyBody: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Terms &amp; Conditions</label>
              <textarea
                rows={3}
                value={cms.termsBody}
                onChange={(e) => setCms({ ...cms, termsBody: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
              />
            </div>
          </div>
        )}

        {activeTab === 'faqs' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-[#232620]">Storefront FAQs</span>
              <button
                type="button"
                onClick={() =>
                  setCms({
                    ...cms,
                    faqs: [
                      ...cms.faqs,
                      { id: `faq-${Date.now()}`, question: 'New Question', answer: 'Answer details...' },
                    ],
                  })
                }
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1C3B2B] text-[#FAF6EE]"
              >
                <Plus className="w-3.5 h-3.5" /> Add FAQ
              </button>
            </div>
            {cms.faqs.map((faq, idx) => (
              <div key={faq.id} className="p-3.5 rounded-xl bg-[#FAF6EE] border border-[#232620]/10 space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={faq.question}
                    onChange={(e) => {
                      const next = [...cms.faqs];
                      next[idx] = { ...faq, question: e.target.value };
                      setCms({ ...cms, faqs: next });
                    }}
                    className="flex-1 px-3 py-1.5 rounded-lg border border-[#232620]/15 bg-white font-semibold"
                  />
                  <button
                    type="button"
                    onClick={() => setCms({ ...cms, faqs: cms.faqs.filter((f) => f.id !== faq.id) })}
                    className="p-1.5 rounded-lg border border-rose-200 text-rose-700"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={faq.answer}
                  onChange={(e) => {
                    const next = [...cms.faqs];
                    next[idx] = { ...faq, answer: e.target.value };
                    setCms({ ...cms, faqs: next });
                  }}
                  className="w-full px-3 py-1.5 rounded-lg border border-[#232620]/15 bg-white"
                />
              </div>
            ))}
          </div>
        )}

        {activeTab === 'blog' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-[#232620]">Beauty Journal &amp; Tips Articles</span>
              <button
                type="button"
                onClick={() =>
                  setCms({
                    ...cms,
                    blogArticles: [
                      ...cms.blogArticles,
                      {
                        id: `art-${Date.now()}`,
                        title: 'New Botanical Ritual Guide',
                        category: 'Skincare Guide',
                        readTime: '3 min read',
                        summary: 'Practical seasonal layering tips for healthy barrier care.',
                        image: '/assets/aistudio/aurelia_hero_banner.png',
                        relatedSlug: products[0]?.slug || 'niacinamide-saffron-glow-serum',
                      },
                    ],
                  })
                }
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1C3B2B] text-[#FAF6EE]"
              >
                <Plus className="w-3.5 h-3.5" /> Add Article
              </button>
            </div>

            {cms.blogArticles.map((art, idx) => (
              <div key={art.id} className="p-4 rounded-xl bg-[#FAF6EE] border border-[#232620]/10 space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <input
                    type="text"
                    value={art.title}
                    onChange={(e) => {
                      const next = [...cms.blogArticles];
                      next[idx] = { ...art, title: e.target.value };
                      setCms({ ...cms, blogArticles: next });
                    }}
                    className="sm:col-span-2 px-3 py-1.5 rounded-lg border border-[#232620]/15 bg-white font-semibold"
                  />
                  <input
                    type="text"
                    value={art.category}
                    onChange={(e) => {
                      const next = [...cms.blogArticles];
                      next[idx] = { ...art, category: e.target.value };
                      setCms({ ...cms, blogArticles: next });
                    }}
                    className="px-3 py-1.5 rounded-lg border border-[#232620]/15 bg-white"
                  />
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={art.readTime}
                      onChange={(e) => {
                        const next = [...cms.blogArticles];
                        next[idx] = { ...art, readTime: e.target.value };
                        setCms({ ...cms, blogArticles: next });
                      }}
                      className="flex-1 px-2 py-1.5 rounded-lg border border-[#232620]/15 bg-white"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setCms({ ...cms, blogArticles: cms.blogArticles.filter((b) => b.id !== art.id) })
                      }
                      className="p-1.5 rounded-lg border border-rose-200 text-rose-700 bg-white"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <textarea
                  rows={2}
                  value={art.summary}
                  onChange={(e) => {
                    const next = [...cms.blogArticles];
                    next[idx] = { ...art, summary: e.target.value };
                    setCms({ ...cms, blogArticles: next });
                  }}
                  className="w-full px-3 py-1.5 rounded-lg border border-[#232620]/15 bg-white"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={art.image}
                    onChange={(e) => {
                      const next = [...cms.blogArticles];
                      next[idx] = { ...art, image: e.target.value };
                      setCms({ ...cms, blogArticles: next });
                    }}
                    placeholder="Image URL"
                    className="px-3 py-1.5 rounded-lg border border-[#232620]/15 bg-white"
                  />
                  <select
                    value={art.relatedSlug}
                    onChange={(e) => {
                      const next = [...cms.blogArticles];
                      next[idx] = { ...art, relatedSlug: e.target.value };
                      setCms({ ...cms, blogArticles: next });
                    }}
                    className="px-3 py-1.5 rounded-lg border border-[#232620]/15 bg-white"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.slug}>
                        Featured Formula: {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
