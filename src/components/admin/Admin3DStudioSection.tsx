import { useEffect, useMemo, useState } from 'react';
import { Box, Check, RotateCw, Upload } from 'lucide-react';
import type {
  ModelFinish,
  ModelSilhouette,
  Product,
  Product3DConfig,
  StudioBackdrop,
} from '../../types/store';
import { BotanicalScene3D, type CameraPreset } from '../three/BotanicalScene3D';
import { adminFetch, uploadAdminAsset } from './adminApi';

interface Admin3DStudioSectionProps {
  token: string;
  onStorefrontChanged: () => void;
  onToast: (msg: string) => void;
}

function buildDefaultConfig(p?: Product): Product3DConfig {
  if (p?.modelConfig) return { ...p.modelConfig };
  return {
    mode: 'procedural',
    silhouette: p?.modelSilhouette || 'dropper',
    finish: p?.defaultFinish || 'emerald',
    bottleColor: '#2B6E50',
    liquidColor: '#D6B15E',
    capColor: '#D9BC84',
    capMetalness: 0.88,
    capRoughness: 0.24,
    glassTransmission: 0.88,
    glassRoughness: 0.14,
    labelBgColor: '#F5EFE2',
    labelTextColor: '#1E3C2B',
    labelTitleOverride: '',
    lightIntensity: 1.0,
    backdrop: 'sage',
  };
}

export function Admin3DStudioSection({
  token,
  onStorefrontChanged,
  onToast,
}: Admin3DStudioSectionProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [config, setConfig] = useState<Product3DConfig>(() => buildDefaultConfig());
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('hero');
  const [autoRotate, setAutoRotate] = useState(true);
  const [uploadingGlb, setUploadingGlb] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminFetch<{ products: Product[] }>('/api/admin/products', token)
      .then((data) => {
        setProducts(data.products);
        if (data.products.length > 0) {
          const first = data.products[0];
          setSelectedProductId(first.id);
          setConfig(buildDefaultConfig(first));
        }
      })
      .catch((err) => onToast(err instanceof Error ? err.message : 'Failed to load catalog for 3D Studio.'));
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || products[0],
    [products, selectedProductId],
  );

  const handleSelectProduct = (id: string) => {
    setSelectedProductId(id);
    const p = products.find((item) => item.id === id);
    if (p) setConfig(buildDefaultConfig(p));
  };

  const handleGlbUpload = async (file?: File) => {
    if (!file) return;
    setUploadingGlb(true);
    try {
      const uploaded = await uploadAdminAsset(file, token);
      setConfig((prev) => ({ ...prev, mode: 'glb', glbUrl: uploaded.url }));
      onToast(`3D file uploaded (${uploaded.url}). Previewing in real time!`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : '3D model upload failed.');
    } finally {
      setUploadingGlb(false);
    }
  };

  const handleSaveToProduct = async () => {
    if (!activeProduct) return;
    setSaving(true);
    try {
      const data = await adminFetch<{ product: Product }>(
        `/api/admin/products/${activeProduct.id}/3d-config`,
        token,
        {
          method: 'PATCH',
          body: JSON.stringify(config),
        },
      );
      setProducts((prev) => prev.map((p) => (p.id === data.product.id ? data.product : p)));
      onStorefrontChanged();
      onToast(`3D configuration saved and assigned to ${activeProduct.name}.`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not save 3D configuration.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left Interactive 3D Preview Stage */}
      <div className="xl:col-span-7 bg-white rounded-2xl border border-[#232620]/10 overflow-hidden">
        <div className="px-5 py-3.5 bg-[#FAF6EE] border-b border-[#232620]/10 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Box className="w-4 h-4 text-[#1C3B2B]" />
            <span className="text-xs font-semibold text-[#232620]">
              Live Studio Viewport · {activeProduct?.name || 'Select Product'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {(['hero', 'detail', 'top', 'profile'] as CameraPreset[]).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setCameraPreset(preset)}
                className={`px-2.5 py-1 rounded text-[11px] capitalize ${
                  cameraPreset === preset
                    ? 'bg-[#1C3B2B] text-[#FAF6EE]'
                    : 'bg-white border border-[#232620]/15 text-[#232620]'
                }`}
              >
                {preset}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setAutoRotate((r) => !r)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] border ${
                autoRotate
                  ? 'border-[#C5A059] bg-[#C5A059]/15 text-[#7A5D20]'
                  : 'border-[#232620]/15 bg-white text-[#5C6156]'
              }`}
            >
              <RotateCw className="w-3 h-3" />
              {autoRotate ? 'Spin' : 'Static'}
            </button>
          </div>
        </div>

        <div className="h-[460px] w-full relative">
          {activeProduct && (
            <BotanicalScene3D
              silhouette={config.silhouette || activeProduct.modelSilhouette}
              finish={config.finish || activeProduct.defaultFinish}
              productLabel={config.labelTitleOverride || activeProduct.name}
              volumeLabel={activeProduct.volume}
              modelConfig={config}
              cameraPreset={cameraPreset}
              autoRotate={autoRotate}
              interactive
              backdrop={config.backdrop || 'sage'}
              fallbackImage={activeProduct.images[0]}
            />
          )}
        </div>
      </div>

      {/* Right Material, Lighting, GLB Upload & Product Assignment Controls */}
      <div className="xl:col-span-5 bg-white rounded-2xl border border-[#232620]/10 p-5 space-y-5 text-xs">
        <div>
          <label className="block font-semibold text-[#232620] mb-1.5">Assign 3D Scene to Product</label>
          <select
            value={selectedProductId}
            onChange={(e) => handleSelectProduct(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] font-medium"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.department})
              </option>
            ))}
          </select>
        </div>

        {/* Render Mode: Procedural Vessel vs Custom GLB/GLTF */}
        <div className="p-3.5 rounded-xl bg-[#FAF6EE] border border-[#232620]/10 space-y-3">
          <span className="font-semibold text-[#232620] block">3D Asset Source</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setConfig((prev) => ({ ...prev, mode: 'procedural' }))}
              className={`py-2 px-3 rounded-lg border font-medium ${
                config.mode === 'procedural'
                  ? 'bg-[#1C3B2B] text-[#FAF6EE] border-[#1C3B2B]'
                  : 'bg-white text-[#232620] border-[#232620]/15'
              }`}
            >
              Procedural Vessel
            </button>
            <button
              type="button"
              onClick={() => setConfig((prev) => ({ ...prev, mode: 'glb' }))}
              className={`py-2 px-3 rounded-lg border font-medium ${
                config.mode === 'glb'
                  ? 'bg-[#1C3B2B] text-[#FAF6EE] border-[#1C3B2B]'
                  : 'bg-white text-[#232620] border-[#232620]/15'
              }`}
            >
              Custom GLB / GLTF
            </button>
          </div>

          {config.mode === 'glb' && (
            <div className="space-y-2 pt-1">
              <label className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-white border border-dashed border-[#1C3B2B]/40 cursor-pointer hover:bg-[#F1EAE0]">
                <Upload className="w-3.5 h-3.5 text-[#1C3B2B]" />
                <span>{uploadingGlb ? 'Uploading .glb / .gltf...' : 'Upload .GLB or .GLTF 3D File'}</span>
                <input
                  type="file"
                  accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
                  className="hidden"
                  onChange={(e) => handleGlbUpload(e.target.files?.[0])}
                />
              </label>
              <input
                type="text"
                value={config.glbUrl || ''}
                onChange={(e) => setConfig((prev) => ({ ...prev, glbUrl: e.target.value }))}
                placeholder="Or paste /uploads/... .glb URL"
                className="w-full px-3 py-1.5 rounded-lg border border-[#232620]/15 bg-white font-mono text-[11px]"
              />
            </div>
          )}
        </div>

        {/* Vessel Geometry & Theme Presets */}
        {config.mode === 'procedural' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-[#232620] mb-1">Vessel Silhouette</label>
                <select
                  value={config.silhouette || 'dropper'}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, silhouette: e.target.value as ModelSilhouette }))
                  }
                  className="w-full px-2.5 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
                >
                  <option value="dropper">Glass Dropper Serum</option>
                  <option value="jar">Frosted Cream Jar</option>
                  <option value="pump">Botanical Cleanser Pump</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-[#232620] mb-1">Finish Preset</label>
                <select
                  value={config.finish || 'emerald'}
                  onChange={(e) => setConfig((prev) => ({ ...prev, finish: e.target.value as ModelFinish }))}
                  className="w-full px-2.5 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
                >
                  <option value="emerald">Frosted Emerald</option>
                  <option value="ivory">Warm Ivory</option>
                  <option value="aqua">Aqua Botanical</option>
                </select>
              </div>
            </div>

            {/* Color Swatches */}
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium mb-1">Bottle Glass</label>
                <input
                  type="color"
                  value={config.bottleColor || '#2B6E50'}
                  onChange={(e) => setConfig((prev) => ({ ...prev, bottleColor: e.target.value }))}
                  className="w-full h-8 rounded border border-[#232620]/15 cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1">Liquid / Cream</label>
                <input
                  type="color"
                  value={config.liquidColor || '#D6B15E'}
                  onChange={(e) => setConfig((prev) => ({ ...prev, liquidColor: e.target.value }))}
                  className="w-full h-8 rounded border border-[#232620]/15 cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium mb-1">Metallic Cap</label>
                <input
                  type="color"
                  value={config.capColor || '#D9BC84'}
                  onChange={(e) => setConfig((prev) => ({ ...prev, capColor: e.target.value }))}
                  className="w-full h-8 rounded border border-[#232620]/15 cursor-pointer"
                />
              </div>
            </div>

            {/* Label Customization */}
            <div className="grid grid-cols-12 gap-2.5 items-end">
              <div className="col-span-6">
                <label className="block text-[11px] font-medium mb-1">Label Title Override</label>
                <input
                  type="text"
                  value={config.labelTitleOverride || ''}
                  onChange={(e) => setConfig((prev) => ({ ...prev, labelTitleOverride: e.target.value }))}
                  placeholder={activeProduct?.name || 'Custom label text'}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
                />
              </div>
              <div className="col-span-3">
                <label className="block text-[11px] font-medium mb-1">Label Bg</label>
                <input
                  type="color"
                  value={config.labelBgColor || '#F5EFE2'}
                  onChange={(e) => setConfig((prev) => ({ ...prev, labelBgColor: e.target.value }))}
                  className="w-full h-8 rounded border border-[#232620]/15 cursor-pointer"
                />
              </div>
              <div className="col-span-3">
                <label className="block text-[11px] font-medium mb-1">Label Ink</label>
                <input
                  type="color"
                  value={config.labelTextColor || '#1E3C2B'}
                  onChange={(e) => setConfig((prev) => ({ ...prev, labelTextColor: e.target.value }))}
                  className="w-full h-8 rounded border border-[#232620]/15 cursor-pointer"
                />
              </div>
            </div>

            {/* PBR Sliders */}
            <div className="space-y-2.5">
              <div>
                <div className="flex justify-between text-[11px]">
                  <span>Glass Transmission</span>
                  <span className="font-mono">{(config.glassTransmission ?? 0.88).toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={0.98}
                  step={0.02}
                  value={config.glassTransmission ?? 0.88}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, glassTransmission: Number(e.target.value) }))
                  }
                  className="w-full accent-[#1C3B2B]"
                />
              </div>
              <div>
                <div className="flex justify-between text-[11px]">
                  <span>Glass Frost / Roughness</span>
                  <span className="font-mono">{(config.glassRoughness ?? 0.14).toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0.02}
                  max={0.65}
                  step={0.02}
                  value={config.glassRoughness ?? 0.14}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, glassRoughness: Number(e.target.value) }))
                  }
                  className="w-full accent-[#1C3B2B]"
                />
              </div>
              <div>
                <div className="flex justify-between text-[11px]">
                  <span>Cap Metalness</span>
                  <span className="font-mono">{(config.capMetalness ?? 0.88).toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={config.capMetalness ?? 0.88}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, capMetalness: Number(e.target.value) }))
                  }
                  className="w-full accent-[#1C3B2B]"
                />
              </div>
            </div>
          </div>
        )}

        {/* Studio Lighting & Cyclorama Backdrop */}
        <div className="space-y-3 pt-2 border-t border-[#232620]/10">
          <div>
            <div className="flex justify-between text-[11px]">
              <span>Studio Light Intensity</span>
              <span className="font-mono">{(config.lightIntensity ?? 1.0).toFixed(2)}×</span>
            </div>
            <input
              type="range"
              min={0.6}
              max={1.6}
              step={0.05}
              value={config.lightIntensity ?? 1.0}
              onChange={(e) => setConfig((prev) => ({ ...prev, lightIntensity: Number(e.target.value) }))}
              className="w-full accent-[#1C3B2B]"
            />
          </div>

          <div>
            <label className="block font-medium text-[#232620] mb-1.5">Default Product Studio Backdrop</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { id: 'sage', label: 'Sage' },
                  { id: 'blush', label: 'Blush' },
                  { id: 'linen', label: 'Linen' },
                  { id: 'obsidian', label: 'Dark' },
                ] as { id: StudioBackdrop; label: string }[]
              ).map((bg) => (
                <button
                  key={bg.id}
                  type="button"
                  onClick={() => setConfig((prev) => ({ ...prev, backdrop: bg.id }))}
                  className={`py-1.5 rounded-lg border text-[11px] font-medium ${
                    (config.backdrop || 'sage') === bg.id
                      ? 'bg-[#1C3B2B] text-[#FAF6EE] border-[#1C3B2B]'
                      : 'bg-[#FAF6EE] text-[#232620] border-[#232620]/15'
                  }`}
                >
                  {bg.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={saving || !activeProduct}
          onClick={handleSaveToProduct}
          className="w-full py-3 px-4 rounded-xl bg-[#1C3B2B] hover:bg-[#142C20] text-[#FAF6EE] text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
        >
          <Check className="w-4 h-4 text-[#C5A059]" />
          <span>{saving ? 'Saving 3D Scene...' : 'Save & Assign 3D Model to Product'}</span>
        </button>
      </div>
    </div>
  );
}
