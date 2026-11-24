import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, RotateCw, ShoppingBag } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { BotanicalScene3D, type CameraPreset, type StudioBackdrop } from '../components/three/BotanicalScene3D';
import type { ModelFinish } from '../types/store';
import { formatPkr, getEffectivePrice } from '../utils/commerce';

interface Atelier3DViewProps {
  initialSlug?: string;
}

function resolveStudioFinish(finish?: ModelFinish, silhouette?: string): ModelFinish {
  if (finish === 'emerald' || finish === 'ivory' || finish === 'aqua') return finish;
  if (finish === 'amber') return silhouette === 'jar' ? 'ivory' : 'emerald';
  if (finish === 'olive') return silhouette === 'dropper' ? 'emerald' : 'ivory';
  if (finish === 'champagne') return silhouette === 'pump' ? 'aqua' : 'ivory';
  return silhouette === 'jar' ? 'ivory' : silhouette === 'pump' ? 'aqua' : 'emerald';
}

export function Atelier3DView({ initialSlug }: Atelier3DViewProps) {
  const { products, addToCart, navigate } = useStore();
  const showcaseProducts = useMemo(() => {
    const prioritySlugs = [
      'niacinamide-saffron-glow-serum',
      'olive-ceramide-velvet-cream',
      'botanical-calm-gel-cleanser',
      'cold-pressed-rosemary-amla-scalp-oil',
    ];
    const prioritized = products.filter((p) => prioritySlugs.includes(p.slug));
    const rest = products.filter((p) => !prioritySlugs.includes(p.slug));
    return [...prioritized, ...rest];
  }, [products]);

  const [selectedSlug, setSelectedSlug] = useState(initialSlug || 'niacinamide-saffron-glow-serum');
  const activeProduct = useMemo(
    () => products.find((p) => p.slug === selectedSlug) || showcaseProducts[0] || products[0],
    [products, showcaseProducts, selectedSlug],
  );

  const [finish, setFinish] = useState<ModelFinish>(() =>
    resolveStudioFinish(activeProduct?.defaultFinish, activeProduct?.modelSilhouette),
  );
  const [exploded, setExploded] = useState(0);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('hero');
  const [autoRotate, setAutoRotate] = useState(true);
  const [backdrop, setBackdrop] = useState<StudioBackdrop>(activeProduct?.modelConfig?.backdrop || 'obsidian');
  const [dockCollapsed, setDockCollapsed] = useState(false);

  useEffect(() => {
    if (activeProduct) {
      setFinish(resolveStudioFinish(activeProduct.defaultFinish, activeProduct.modelSilhouette));
      if (activeProduct.modelConfig?.backdrop) {
        setBackdrop(activeProduct.modelConfig.backdrop);
      }
    }
  }, [activeProduct]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'h' && document.activeElement?.tagName !== 'INPUT') {
        setDockCollapsed((c) => !c);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!activeProduct) return null;

  const effectivePrice = getEffectivePrice(activeProduct.pricePkr, activeProduct.discountPricePkr);

  return (
    <div className="relative w-full h-[calc(100vh-4rem)] min-h-[580px] bg-[#141712] overflow-hidden">
      {/* Unobstructed Studio 3D Viewport */}
      <BotanicalScene3D
        silhouette={activeProduct.modelSilhouette}
        finish={finish}
        productLabel={activeProduct.name}
        volumeLabel={activeProduct.volume}
        modelConfig={
          activeProduct.modelConfig
            ? { ...activeProduct.modelConfig, finish, backdrop }
            : undefined
        }
        explodedAmount={exploded}
        cameraPreset={cameraPreset}
        autoRotate={autoRotate}
        interactive
        theme="dark"
        backdrop={backdrop}
        fallbackImage={activeProduct.images[0]}
      />

      {/* Minimal Top-Left Specification Overlay (Dark Obsidian without backdrop-filter over WebGL) */}
      <div className="absolute top-5 left-5 right-5 sm:right-auto z-10 max-w-md bg-[#1C2019]/95 border border-[#C5A059]/25 rounded-xl p-4 shadow-lg">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium tracking-wide text-[#C5A059]">
              3D Botanical Atelier · {activeProduct.category}
            </p>
            <h1 className="font-display text-2xl font-semibold text-[#FAF6EE] tracking-wide">
              {activeProduct.name}
            </h1>
          </div>
          <span className="font-mono text-sm font-medium text-[#FAF6EE] tabular-nums shrink-0">
            {formatPkr(effectivePrice)}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-3">
          <button
            type="button"
            onClick={() => addToCart(activeProduct, 1, true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#C5A059] hover:bg-[#D4B068] text-[#141712] text-xs font-semibold transition-colors"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Add to Bag</span>
          </button>
          <button
            type="button"
            onClick={() => navigate({ name: 'product', slug: activeProduct.slug })}
            className="text-xs font-medium text-[#FAF6EE]/85 hover:text-[#C5A059] hover:underline transition-colors"
          >
            Full Formula Details →
          </button>
        </div>
      </div>

      {/* Collapsible Bottom Control Dock (Zero Mid-Viewport Occlusion) */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 w-[min(940px,94vw)] flex flex-col items-center">
        <button
          type="button"
          onClick={() => setDockCollapsed((v) => !v)}
          className="mb-1.5 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-t-lg bg-[#1C2019]/95 border border-[#C5A059]/25 text-xs font-medium text-[#FAF6EE] hover:bg-[#262B22] transition-colors"
        >
          {dockCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span>{dockCollapsed ? 'Show 3D Controls (H)' : 'Hide Controls (H)'}</span>
        </button>

        {!dockCollapsed && (
          <div className="w-full bg-[#1C2019]/96 border border-[#C5A059]/25 rounded-2xl p-4 shadow-2xl space-y-3 text-[#FAF6EE]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Vessel Product Switcher */}
              <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 sm:pb-0">
                {showcaseProducts.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedSlug(item.slug)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                      activeProduct.slug === item.slug
                        ? 'bg-[#C5A059] text-[#141712] font-semibold'
                        : 'bg-[#282D24] text-[#FAF6EE]/85 hover:bg-[#33392E]'
                    }`}
                  >
                    {item.name.split(' ').slice(0, 2).join(' ')}
                  </button>
                ))}
              </div>

              {/* Glass / Cap Finishes */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-[#FAF6EE]/70">Finish:</span>
                {(
                  [
                    { id: 'emerald', label: 'Emerald Glass', hex: '#2B6E50' },
                    { id: 'ivory', label: 'Frosted Ivory', hex: '#EDE7DA' },
                    { id: 'aqua', label: 'Aqua Botanical', hex: '#9FD3C5' },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFinish(f.id)}
                    aria-label={`${f.label} finish`}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs transition-colors ${
                      finish === f.id
                        ? 'border-[#C5A059] bg-[#C5A059]/18 text-[#FAF6EE] font-medium'
                        : 'border-white/15 bg-[#262B22] text-[#FAF6EE]/75 hover:text-[#FAF6EE]'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full border border-white/30" style={{ backgroundColor: f.hex }} />
                    <span>{f.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
              {/* Studio Background Swatches */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-medium text-[#FAF6EE]/70 mr-1">Backdrop:</span>
                {(
                  [
                    { id: 'obsidian', label: 'Obsidian', hex: '#1B2018' },
                    { id: 'sage', label: 'Botanical Sage', hex: '#BAC7B6' },
                    { id: 'blush', label: 'Silk Blush', hex: '#DEC4BB' },
                    { id: 'linen', label: 'Warm Linen', hex: '#DDD2C0' },
                  ] as const
                ).map((bg) => (
                  <button
                    key={bg.id}
                    type="button"
                    onClick={() => setBackdrop(bg.id)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs transition-colors ${
                      backdrop === bg.id
                        ? 'border-[#C5A059] bg-[#C5A059]/18 text-[#FAF6EE] font-medium'
                        : 'border-white/15 bg-[#262B22] text-[#FAF6EE]/75 hover:text-[#FAF6EE]'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full border border-white/30" style={{ backgroundColor: bg.hex }} />
                    <span>{bg.label}</span>
                  </button>
                ))}
              </div>
              {/* Exploded Layer Slider */}
              <div className="flex items-center gap-3 flex-1 min-w-[210px]">
                <label htmlFor="exploded-slider" className="text-xs font-medium text-[#FAF6EE]/90 whitespace-nowrap">
                  Explode Layers
                </label>
                <input
                  id="exploded-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={exploded}
                  onChange={(e) => setExploded(Number(e.target.value))}
                  className="w-full accent-[#C5A059]"
                />
                <span className="font-mono text-xs tabular-nums text-[#C5A059] w-10 text-right">
                  {Math.round(exploded * 100)}%
                </span>
              </div>

              {/* Camera Presets & Spin Toggle */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {(['hero', 'detail', 'top', 'profile'] as CameraPreset[]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setCameraPreset(preset)}
                    className={`px-2.5 py-1.5 rounded-md text-xs capitalize transition-colors ${
                      cameraPreset === preset
                        ? 'bg-[#FAF6EE] text-[#141712] font-medium'
                        : 'bg-[#282D24] text-[#FAF6EE]/80 hover:bg-[#33392E]'
                    }`}
                  >
                    {preset}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setAutoRotate((r) => !r)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    autoRotate
                      ? 'bg-[#C5A059]/20 text-[#C5A059] font-medium border border-[#C5A059]/40'
                      : 'bg-[#282D24] text-[#FAF6EE]/70'
                  }`}
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>{autoRotate ? 'Spin On' : 'Spin Off'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
