import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  BookmarkCheck,
  Camera,
  Check,
  CheckCircle2,
  HeartHandshake,
  Loader2,
  Moon,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from '../context/StoreContext';
import type {
  AIImageAnalysisResult,
  AIRoutinePlan,
  HairType,
  Product,
  SkinType,
} from '../types/store';
import { formatPkr, getDiscountPercent, getEffectivePrice } from '../utils/commerce';
import { prepareUploadImageDataUrl, safeParseJsonResponse } from '../utils/api';
import { SafeImage } from '../components/common/SafeImage';
import { BeautyAvatar3D } from '../components/ai/BeautyAvatar3D';
import { listAIAgentsLocal, recordAIEventLocal } from '../db/localDatabase';

const SKIN_TYPES: SkinType[] = [
  'Oily Skin',
  'Dry Skin',
  'Combination Skin',
  'Normal Skin',
  'Sensitive Skin',
  'Acne-Prone Skin',
];

const HAIR_TYPES: HairType[] = [
  'Dry Hair',
  'Oily Hair',
  'Normal Hair',
  'Curly Hair',
  'Straight Hair',
  'Wavy Hair',
  'Frizzy Hair',
  'Damaged Hair',
];

const ALL_CONCERNS = [
  'Acne & Breakouts',
  'Dark Spots & Pigmentation',
  'Dehydration & Dryness',
  'Redness & Sensitivity',
  'Hair Fall & Thinning',
  'Dandruff & Flaking',
  'Frizz & Split Ends',
  'Heat / Color Damage',
];

export function AIAnalyzerView({ initialTab = 'skin' }: { initialTab?: 'skin' | 'hair' | 'routine' }) {
  const {
    products,
    addToCart,
    addMultipleToCart,
    saveRoutine,
    openAssistant,
    updateAiMemory,
    aiMemory,
    navigate,
    showToast,
  } = useStore();
  const [activeTab, setActiveTab] = useState<'skin' | 'hair' | 'routine'>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Photo analyzer state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState('image/jpeg');
  const [consentGiven, setConsentGiven] = useState(false);
  const [selectedHairType, setSelectedHairType] = useState<string>('Frizzy Hair');
  const [selectedPhotoConcerns, setSelectedPhotoConcerns] = useState<string[]>([]);
  const [photoNotes, setPhotoNotes] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AIImageAnalysisResult | null>(null);

  // Routine builder state
  const [routineFocus, setRoutineFocus] = useState<'both' | 'skincare' | 'haircare'>('both');
  const [routineSkinType, setRoutineSkinType] = useState<SkinType>('Combination Skin');
  const [routineHairType, setRoutineHairType] = useState<HairType>('Frizzy Hair');
  const [routineConcerns, setRoutineConcerns] = useState<string[]>(['Dehydration & Dryness', 'Frizz & Split Ends']);
  const [budgetMaxPkr, setBudgetMaxPkr] = useState<number | ''>('');
  const [buildingRoutine, setBuildingRoutine] = useState(false);
  const [routineError, setRoutineError] = useState<string | null>(null);
  const [routinePlan, setRoutinePlan] = useState<AIRoutinePlan | null>(null);
  const [routineSaved, setRoutineSaved] = useState(false);
  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({});

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const analyzingInFlightRef = useRef(false);

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAnalysisError('Please choose a valid JPEG, PNG, or WebP photograph.');
      return;
    }
    setAnalysisError(null);
    setAnalysisResult(null);
    try {
      const { dataUrl, mimeType: mime } = await prepareUploadImageDataUrl(file);
      setPreviewUrl(dataUrl);
      setMimeType(mime);
    } catch {
      setAnalysisError('Could not read the selected image.');
    }
  };

  const deleteUploadedPhoto = () => {
    setPreviewUrl(null);
    setConsentGiven(false);
    setAnalysisResult(null);
    setAnalysisError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const handleAnalyzePhoto = async () => {
    if (analyzingInFlightRef.current || analyzing) return;
    if (!previewUrl) {
      setAnalysisError('Please upload or capture a clear photograph first.');
      return;
    }
    if (!consentGiven) {
      setAnalysisError('Please tick the permission checkbox before running AI cosmetic photo analysis.');
      return;
    }
    analyzingInFlightRef.current = true;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const agents = await listAIAgentsLocal().catch(() => []);
      const agentConfig = agents.find((a) => a.agentKey === 'image_analyzer');
      const mode = activeTab === 'hair' ? 'hair' : 'skin';
      const endpoint = mode === 'skin' ? '/api/skin-analysis' : '/api/ai/analyze-image';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          imageBase64: previewUrl,
          mimeType,
          consentGiven: true,
          hairType: mode === 'hair' ? selectedHairType : undefined,
          hairConcerns: selectedPhotoConcerns,
          notes: photoNotes,
          catalogProducts: products,
          agentConfig,
        }),
      });
      const data = await safeParseJsonResponse<{ analysis?: AIImageAnalysisResult; error?: string }>(
        response,
        'Skin analysis failed',
      );
      if (!data.analysis) {
        throw new Error('API returned an empty analysis payload.');
      }
      setAnalysisResult(data.analysis);
      void recordAIEventLocal({
        eventType: 'image_analysis',
        agentKey: 'image_analyzer',
      }).catch(() => {});
      for (const slug of data.analysis.recommendedProductSlugs || []) {
        void recordAIEventLocal({
          eventType: 'recommendation',
          agentKey: 'image_analyzer',
          productSlug: slug,
        }).catch(() => {});
      }
      if (aiMemory.consentGiven) {
        updateAiMemory({
          concerns: Array.from(new Set([...aiMemory.concerns, ...data.analysis.identifiedConcerns])).slice(0, 6),
          lastRecommendedSlugs: data.analysis.recommendedProductSlugs,
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unable to analyze photograph.';
      void recordAIEventLocal({
        eventType: 'error',
        agentKey: 'image_analyzer',
        errorMessage: errMsg,
      }).catch(() => {});
      setAnalysisError(errMsg);
    } finally {
      analyzingInFlightRef.current = false;
      setAnalyzing(false);
    }
  };

  const toggleConcern = (list: string[], setList: (next: string[]) => void, item: string) => {
    if (list.includes(item)) {
      setList(list.filter((c) => c !== item));
    } else if (list.length < 4) {
      setList([...list, item]);
    }
  };

  const handleBuildRoutine = async () => {
    setBuildingRoutine(true);
    setRoutineError(null);
    setRoutineSaved(false);
    setCheckedSteps({});
    try {
      const agents = await listAIAgentsLocal().catch(() => []);
      const agentConfig = agents.find((a) => a.agentKey === 'routine_builder');
      const response = await fetch('/api/ai/routine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          focus: routineFocus,
          skinType: routineFocus !== 'haircare' ? routineSkinType : undefined,
          hairType: routineFocus !== 'skincare' ? routineHairType : undefined,
          concerns: routineConcerns,
          budgetMaxPkr: budgetMaxPkr ? Number(budgetMaxPkr) : undefined,
          catalogProducts: products,
          agentConfig,
        }),
      });
      const data = await safeParseJsonResponse<{ routine?: AIRoutinePlan; error?: string }>(
        response,
        'Could not generate personalized routine.',
      );
      if (!data.routine) {
        throw new Error('API returned an empty routine plan.');
      }
      setRoutinePlan(data.routine);
      void recordAIEventLocal({
        eventType: 'routine_build',
        agentKey: 'routine_builder',
      }).catch(() => {});
      const routineSlugs = Array.from(
        new Set([
          ...data.routine.morningSkincare.map((s) => s.productSlug),
          ...data.routine.nightSkincare.map((s) => s.productSlug),
          ...data.routine.weeklyHaircare.map((s) => s.productSlug),
        ]),
      );
      for (const slug of routineSlugs) {
        void recordAIEventLocal({
          eventType: 'recommendation',
          agentKey: 'routine_builder',
          productSlug: slug,
        }).catch(() => {});
      }
      if (aiMemory.consentGiven) {
        updateAiMemory({
          skinType: routineFocus !== 'haircare' ? routineSkinType : aiMemory.skinType,
          hairType: routineFocus !== 'skincare' ? routineHairType : aiMemory.hairType,
          concerns: routineConcerns,
          budgetMaxPkr: budgetMaxPkr ? Number(budgetMaxPkr) : undefined,
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Routine generation failed.';
      void recordAIEventLocal({
        eventType: 'error',
        agentKey: 'routine_builder',
        errorMessage: errMsg,
      }).catch(() => {});
      setRoutineError(errMsg);
    } finally {
      setBuildingRoutine(false);
    }
  };

  const recommendedProducts = (analysisResult?.recommendedProductSlugs || [])
    .map((slug) => products.find((p) => p.slug === slug))
    .filter((p): p is Product => Boolean(p));

  const handleAddRoutineProducts = () => {
    if (!routinePlan) return;
    const slugs = Array.from(
      new Set([
        ...routinePlan.morningSkincare.map((s) => s.productSlug),
        ...routinePlan.nightSkincare.map((s) => s.productSlug),
        ...routinePlan.weeklyHaircare.map((s) => s.productSlug),
      ]),
    );
    const items = slugs
      .map((slug) => products.find((p) => p.slug === slug))
      .filter((p): p is Product => Boolean(p));
    if (items.length > 0) addMultipleToCart(items, true);
  };

  const totalRoutineSteps = routinePlan
    ? routinePlan.morningSkincare.length + routinePlan.nightSkincare.length + routinePlan.weeklyHaircare.length
    : 0;
  const checkedCount = Object.values(checkedSteps).filter(Boolean).length;
  const routineProgressPct = totalRoutineSteps > 0 ? Math.round((checkedCount / totalRoutineSteps) * 100) : 0;

  return (
    <div className="bg-[#FAF7F2] min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
        {/* Editorial Studio Header with Animated 3D Specialist */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
          className="relative rounded-2xl bg-gradient-to-br from-[#FFFFFF] via-[#FAF7F2] to-[#F1E9DF] border border-[#D6BD9B]/55 p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center overflow-hidden shadow-xs"
        >
          <div className="lg:col-span-8 space-y-4">
            <p className="text-xs font-medium text-[#40332E]/65">
              Aurelia Skin Atelier <span aria-hidden="true">·</span> Consent-First Cosmetic AI
            </p>
            <h1 className="font-display text-3xl sm:text-5xl font-semibold text-[#40332E] leading-tight">
              AI Skin, Hair &amp; Routine Studio
            </h1>
            <p className="text-sm sm:text-base text-[#40332E]/75 max-w-2xl leading-relaxed">
              Upload a photograph for visible cosmetic skin or haircare observations, or architect a complete Morning, Evening, and Weekly Wash-Day ritual matched to our botanical catalog.
            </p>

            {/* Segmented Mode Navigation */}
            <div className="inline-flex flex-wrap gap-1.5 p-1.5 rounded-xl bg-[#F1E9DF] border border-[#D6BD9B]/40">
              {[
                { id: 'skin', label: 'AI Skin Analyzer' },
                { id: 'hair', label: 'AI Hair Analyzer' },
                { id: 'routine', label: 'Routine Builder' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  disabled={analyzing || buildingRoutine}
                  onClick={() => {
                    setActiveTab(tab.id as 'skin' | 'hair' | 'routine');
                    setAnalysisResult(null);
                    setAnalysisError(null);
                  }}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap disabled:opacity-55 ${
                    activeTab === tab.id
                      ? 'bg-[#40332E] text-[#FFFFFF] shadow-xs'
                      : 'text-[#40332E]/75 hover:text-[#40332E]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-4 flex flex-col items-center">
            <div className="relative w-52 h-52 flex items-center justify-center">
              <motion.div
                aria-hidden="true"
                animate={{
                  scale: analyzing || buildingRoutine ? [1, 1.09, 1] : [1, 1.05, 1],
                  opacity: [0.45, 0.78, 0.45],
                }}
                transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute inset-1 rounded-full bg-gradient-to-tr from-[#D8AAA5]/45 via-[#D6BD9B]/45 to-[#FAF7F2]"
              />
              <div className="relative w-48 h-48 rounded-full bg-gradient-to-b from-[#FAF7F2] to-[#F1E9DF] border border-[#D6BD9B] overflow-hidden shadow-lg">
                <BeautyAvatar3D state={analyzing || buildingRoutine ? 'thinking' : 'idle'} variant="showcase" />
              </div>
            </div>
            <button
              type="button"
              onClick={() => openAssistant({ mode: 'chat' })}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#40332E] hover:underline"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#D8AAA5]" />
              <span>Open Live Consultation Chat →</span>
            </button>
          </div>
        </motion.section>

        {/* Skin or Hair Analyzer Workspace */}
        <AnimatePresence mode="wait">
          {(activeTab === 'skin' || activeTab === 'hair') && (
            <motion.section
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.22 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
            >
              {/* Left Input Card */}
              <div className="lg:col-span-5 rounded-2xl bg-[#FFFFFF] border border-[#D6BD9B]/50 p-6 space-y-5 shadow-xs">
                <div>
                  <h2 className="font-display text-2xl font-semibold text-[#40332E]">
                    {activeTab === 'skin' ? 'Facial Skin Photo Upload' : 'Hair & Scalp Photo Upload'}
                  </h2>
                  <p className="text-xs text-[#40332E]/70 mt-1 leading-relaxed">
                    {activeTab === 'skin'
                      ? 'Capture in natural daylight with minimal makeup for clearer visible surface assessment.'
                      : 'Capture mid-lengths, ends, or scalp parting in even natural light.'}
                  </p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => handleFileChange(e.target.files?.[0])}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="user"
                  className="hidden"
                  onChange={(e) => handleFileChange(e.target.files?.[0])}
                />

                {!previewUrl ? (
                  <div className="rounded-xl border border-dashed border-[#D6BD9B] bg-[#FAF7F2] p-6 text-center space-y-4">
                    <p className="text-xs text-[#40332E]/65">JPEG, PNG, or WebP up to 6 MB</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={() => fileInputRef.current?.click()}
                        className="py-2.5 px-4 rounded-lg bg-[#40332E] hover:bg-[#2F2521] text-[#FFFFFF] text-xs font-medium inline-flex items-center justify-center gap-2 transition-colors"
                      >
                        <Upload className="w-4 h-4" />
                        <span>Upload Photo</span>
                      </motion.button>
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={() => cameraInputRef.current?.click()}
                        className="py-2.5 px-4 rounded-lg border border-[#D6BD9B] bg-[#FFFFFF] hover:bg-[#F1E9DF] text-[#40332E] text-xs font-medium inline-flex items-center justify-center gap-2 transition-colors"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Take Photo</span>
                      </motion.button>
                    </div>
                  </div>
                ) : (
                  <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-[#F1E9DF] border border-[#D6BD9B]/50">
                    <img src={previewUrl} alt="Uploaded preview for analysis" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      disabled={analyzing}
                      onClick={deleteUploadedPhoto}
                      className="absolute top-3 right-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#40332E]/90 text-[#FFFFFF] text-xs font-medium hover:bg-rose-700 disabled:opacity-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  </div>
                )}

                {activeTab === 'hair' && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[#40332E]">Hair Texture</label>
                    <select
                      value={selectedHairType}
                      onChange={(e) => setSelectedHairType(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg bg-[#FAF7F2] border border-[#D6BD9B]/60 text-xs text-[#40332E]"
                    >
                      {HAIR_TYPES.map((ht) => (
                        <option key={ht} value={ht}>
                          {ht}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-[#40332E]">Focus Areas (Optional)</label>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_CONCERNS.filter((c) =>
                      activeTab === 'skin'
                        ? !c.includes('Hair') && !c.includes('Dandruff') && !c.includes('Frizz') && !c.includes('Damage')
                        : c.includes('Hair') || c.includes('Dandruff') || c.includes('Frizz') || c.includes('Damage'),
                    ).map((concern) => {
                      const selected = selectedPhotoConcerns.includes(concern);
                      return (
                        <button
                          key={concern}
                          type="button"
                          onClick={() => toggleConcern(selectedPhotoConcerns, setSelectedPhotoConcerns, concern)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                            selected
                              ? 'bg-[#40332E] border-[#40332E] text-[#FFFFFF]'
                              : 'bg-[#FAF7F2] border-[#D6BD9B]/55 text-[#40332E]/75 hover:border-[#40332E]/40'
                          }`}
                        >
                          {concern}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#40332E]">Consultation Notes (Optional)</label>
                  <input
                    type="text"
                    value={photoNotes}
                    onChange={(e) => setPhotoNotes(e.target.value)}
                    placeholder="e.g. Looking for lightweight humid-weather hydration"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#FAF7F2] border border-[#D6BD9B]/60 text-xs text-[#40332E]"
                  />
                </div>

                <label className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[#F1E9DF] text-xs text-[#40332E] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentGiven}
                    disabled={analyzing}
                    onChange={(e) => {
                      setConsentGiven(e.target.checked);
                      if (e.target.checked) setAnalysisError(null);
                    }}
                    className="mt-0.5 accent-[#40332E]"
                  />
                  <span className="leading-relaxed">
                    <strong>Permission &amp; Privacy:</strong> I consent to transient cosmetic AI assessment. Photographs are never stored after analysis.
                  </span>
                </label>

                {analysisError && (
                  <div
                    role="alert"
                    className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2"
                  >
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{analysisError}</span>
                  </div>
                )}

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={handleAnalyzePhoto}
                  disabled={!previewUrl || !consentGiven || analyzing}
                  aria-busy={analyzing}
                  className="w-full py-3 px-5 rounded-lg bg-[#40332E] hover:bg-[#2F2521] disabled:opacity-45 text-[#FFFFFF] text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
                >
                  {analyzing ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#D6BD9B]" />
                  ) : (
                    <Sparkles className="w-4 h-4 text-[#D6BD9B]" />
                  )}
                  <span>
                    {analyzing
                      ? 'Analyzing Photograph…'
                      : activeTab === 'skin'
                      ? 'Analyze Facial Skin'
                      : 'Analyze Hair & Scalp'}
                  </span>
                </motion.button>
              </div>

              {/* Right Pane: Loading Skeleton, Structured Report & Matched Cards */}
              <div className="lg:col-span-7 space-y-6">
                {analyzing ? (
                  <div
                    role="status"
                    aria-live="polite"
                    className="rounded-2xl bg-[#FFFFFF] border border-[#D6BD9B]/50 p-8 space-y-5"
                  >
                    <div className="flex items-center gap-2.5 text-xs font-semibold text-[#40332E]">
                      <Loader2 className="w-4 h-4 animate-spin text-[#D8AAA5]" />
                      <span>
                        Analyzing your {activeTab === 'skin' ? 'facial skin' : 'hair and scalp'} photograph…
                      </span>
                    </div>
                    <div className="space-y-4 animate-pulse">
                      <div className="h-8 w-64 rounded bg-[#F1E9DF]" />
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div className="h-28 rounded-xl bg-[#FAF7F2]" />
                        <div className="h-28 rounded-xl bg-[#FAF7F2]" />
                      </div>
                      <div className="h-20 rounded-xl bg-[#F1E9DF]/60" />
                    </div>
                  </div>
                ) : !analysisResult ? (
                  <div className="rounded-2xl bg-[#FFFFFF] border border-[#D6BD9B]/50 p-8 sm:p-10 space-y-5">
                    <div className="flex items-center gap-2 text-[#40332E]/70 text-xs font-semibold">
                      <HeartHandshake className="w-4 h-4 text-[#D8AAA5]" />
                      <span>Transparent Cosmetic Guidance</span>
                    </div>
                    <h3 className="font-display text-3xl font-semibold text-[#40332E]">
                      What your {activeTab === 'skin' ? 'Skin' : 'Hair & Scalp'} Report delivers
                    </h3>
                    <ul className="space-y-3 text-sm text-[#40332E]/80">
                      <li>01. Honest visual observations of visible surface balance, texture, or frizz.</li>
                      <li>02. Curated botanical actives matched cleanly to your goals.</li>
                      <li>03. Real catalog matches with exact PKR pricing, compatibility, and stock status.</li>
                      <li>04. Practical layering and patch-test precautions—never exaggerated medical claims.</li>
                    </ul>
                  </div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    <div className="rounded-2xl bg-[#FFFFFF] border border-[#D6BD9B]/60 p-6 sm:p-8 space-y-5 shadow-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F1E9DF] pb-4">
                        <div>
                          <p className="text-xs font-medium text-[#40332E]/65">Multimodal Cosmetic Assessment</p>
                          <h3 className="font-display text-3xl font-semibold text-[#40332E]">
                            {analysisResult.mode === 'skin' ? 'Skin Assessment Report' : 'Hair & Scalp Report'}
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={deleteUploadedPhoto}
                          className="text-xs font-medium text-[#40332E]/70 hover:text-rose-700"
                        >
                          Clear Photo &amp; Reset
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                        <div className="space-y-2.5">
                          <p className="font-semibold text-[#40332E]">Visible Observations</p>
                          <ul className="space-y-2 text-[#40332E]/80">
                            {analysisResult.visibleObservations.map((obs, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <CheckCircle2 className="w-4 h-4 text-[#D8AAA5] shrink-0 mt-0.5" />
                                <span>{obs}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <p className="font-semibold text-[#40332E] mb-1">Focus Areas</p>
                            <p className="text-[#40332E]/80 font-medium">
                              {analysisResult.identifiedConcerns.join(' · ')}
                            </p>
                          </div>
                          <div>
                            <p className="font-semibold text-[#40332E] mb-1">Recommended Actives</p>
                            <p className="text-[#40332E]/75">{analysisResult.suggestedIngredients.join(' · ')}</p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 text-xs border-t border-[#F1E9DF] pt-4">
                        <p className="font-semibold text-[#40332E]">Recommended Ritual Tips</p>
                        <ul className="list-disc pl-4 space-y-1 text-[#40332E]/80">
                          {analysisResult.routineGuidance.map((tip, i) => (
                            <li key={i}>{tip}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="p-3.5 rounded-xl bg-[#F1E9DF] text-xs text-[#40332E]/80">
                        {analysisResult.cautionNotice}
                      </div>
                    </div>

                    {recommendedProducts.length > 0 && (
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <h3 className="font-display text-2xl font-semibold text-[#40332E]">
                            Matched Botanical Formulas
                          </h3>
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.97 }}
                            onClick={() => addMultipleToCart(recommendedProducts, true)}
                            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#40332E] hover:bg-[#2F2521] text-[#FFFFFF] text-xs font-medium"
                          >
                            <ShoppingBag className="w-3.5 h-3.5" />
                            <span>Add All ({recommendedProducts.length}) to Bag</span>
                          </motion.button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {recommendedProducts.map((p) => {
                            const eff = getEffectivePrice(p.pricePkr, p.discountPricePkr);
                            const disc = getDiscountPercent(p.pricePkr, p.discountPricePkr);
                            return (
                              <motion.article
                                key={p.id}
                                whileHover={{ y: -2 }}
                                className="rounded-xl bg-[#FFFFFF] border border-[#D6BD9B]/45 overflow-hidden flex flex-col justify-between shadow-xs"
                              >
                                <div>
                                  <button
                                    type="button"
                                    onClick={() => navigate({ name: 'product', slug: p.slug })}
                                    className="relative aspect-[4/3] w-full bg-[#F1E9DF] overflow-hidden block group"
                                  >
                                    <SafeImage
                                      src={p.images[0]}
                                      alt={p.name}
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                    />
                                    {disc && (
                                      <span className="absolute top-3 left-3 px-2 py-0.5 rounded bg-[#40332E] text-[#FFFFFF] text-[10px] font-medium tabular-nums">
                                        Save {disc}%
                                      </span>
                                    )}
                                  </button>
                                  <div className="p-4 space-y-1.5">
                                    <p className="text-[11px] text-[#40332E]/60">
                                      {p.category} · {p.volume}
                                    </p>
                                    <h4 className="font-sans text-sm font-semibold text-[#40332E]">{p.name}</h4>
                                    <p className="text-xs text-[#40332E]/75">
                                      For {p.suitableTypes.slice(0, 2).join(', ')}
                                    </p>
                                    <p className="text-[11px] text-[#40332E]/65">
                                      Actives: {p.keyIngredients.slice(0, 3).join(' · ')}
                                    </p>
                                  </div>
                                </div>

                                <div className="px-4 pb-4 pt-2.5 border-t border-[#F1E9DF] space-y-2.5">
                                  <div className="flex items-baseline gap-2">
                                    <span className="font-mono text-sm font-semibold text-[#40332E] tabular-nums">
                                      {formatPkr(eff)}
                                    </span>
                                    {disc && (
                                      <span className="font-mono text-xs text-[#40332E]/45 line-through tabular-nums">
                                        {formatPkr(p.pricePkr)}
                                      </span>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <button
                                      type="button"
                                      onClick={() => navigate({ name: 'product', slug: p.slug })}
                                      className="py-2 px-3 rounded-lg border border-[#D6BD9B] hover:bg-[#F1E9DF] text-xs font-medium text-[#40332E] inline-flex items-center justify-center gap-1"
                                    >
                                      <span>View Details</span>
                                      <ArrowUpRight className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => addToCart(p, 1, true)}
                                      disabled={p.stock <= 0}
                                      className="py-2 px-3 rounded-lg bg-[#40332E] hover:bg-[#2F2521] disabled:opacity-45 text-[#FFFFFF] text-xs font-medium inline-flex items-center justify-center gap-1"
                                    >
                                      <ShoppingBag className="w-3.5 h-3.5" />
                                      <span>Add to Cart</span>
                                    </button>
                                  </div>
                                </div>
                              </motion.article>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            </motion.section>
          )}

          {/* Morning & Night Interactive Routine Builder */}
          {activeTab === 'routine' && (
            <motion.section
              key="routine"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.22 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
            >
              {/* Left Configuration Panel */}
              <div className="lg:col-span-4 rounded-2xl bg-[#FFFFFF] border border-[#D6BD9B]/50 p-6 space-y-5 shadow-xs">
                <div>
                  <h2 className="font-display text-2xl font-semibold text-[#40332E]">
                    Morning &amp; Night Routine Builder
                  </h2>
                  <p className="text-xs text-[#40332E]/70 mt-1">
                    Configure skin, hair, concerns, and PKR budget to assemble an ordered ritual.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-[#40332E]">Routine Focus</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'both', label: 'Skin + Hair' },
                      { id: 'skincare', label: 'Skincare' },
                      { id: 'haircare', label: 'Haircare' },
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setRoutineFocus(f.id as 'both' | 'skincare' | 'haircare')}
                        className={`py-2 px-2.5 rounded-lg text-xs font-medium border transition-colors ${
                          routineFocus === f.id
                            ? 'bg-[#40332E] border-[#40332E] text-[#FFFFFF]'
                            : 'bg-[#FAF7F2] border-[#D6BD9B]/60 text-[#40332E]'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {routineFocus !== 'haircare' && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[#40332E]">Skin Type</label>
                    <select
                      value={routineSkinType}
                      onChange={(e) => setRoutineSkinType(e.target.value as SkinType)}
                      className="w-full px-3.5 py-2.5 rounded-lg bg-[#FAF7F2] border border-[#D6BD9B]/60 text-xs text-[#40332E]"
                    >
                      {SKIN_TYPES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {routineFocus !== 'skincare' && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[#40332E]">Hair Texture</label>
                    <select
                      value={routineHairType}
                      onChange={(e) => setRoutineHairType(e.target.value as HairType)}
                      className="w-full px-3.5 py-2.5 rounded-lg bg-[#FAF7F2] border border-[#D6BD9B]/60 text-xs text-[#40332E]"
                    >
                      {HAIR_TYPES.map((ht) => (
                        <option key={ht} value={ht}>
                          {ht}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-[#40332E]">Concerns (Up to 4)</label>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_CONCERNS.map((c) => {
                      const active = routineConcerns.includes(c);
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => toggleConcern(routineConcerns, setRoutineConcerns, c)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                            active
                              ? 'bg-[#40332E] border-[#40332E] text-[#FFFFFF]'
                              : 'bg-[#FAF7F2] border-[#D6BD9B]/55 text-[#40332E]/75'
                          }`}
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#40332E]">Budget Ceiling (PKR)</label>
                  <select
                    value={budgetMaxPkr}
                    onChange={(e) => setBudgetMaxPkr(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#FAF7F2] border border-[#D6BD9B]/60 text-xs text-[#40332E]"
                  >
                    <option value="">Flexible Budget</option>
                    <option value="6500">Under PKR 6,500</option>
                    <option value="10000">Under PKR 10,000</option>
                    <option value="15000">Under PKR 15,000</option>
                  </select>
                </div>

                {routineError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                    {routineError}
                  </div>
                )}

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={handleBuildRoutine}
                  disabled={buildingRoutine}
                  className="w-full py-3 px-5 rounded-lg bg-[#40332E] hover:bg-[#2F2521] disabled:opacity-45 text-[#FFFFFF] text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <Sparkles className="w-4 h-4 text-[#D6BD9B]" />
                  <span>{buildingRoutine ? 'Building Personalized Plan…' : 'Generate Morning & Night Routine'}</span>
                </motion.button>
              </div>

              {/* Right Routine Result Workspace */}
              <div className="lg:col-span-8">
                {buildingRoutine ? (
                  <div className="rounded-2xl bg-[#FFFFFF] border border-[#D6BD9B]/50 p-8 space-y-5 animate-pulse">
                    <div className="h-6 w-56 rounded bg-[#F1E9DF]" />
                    <div className="space-y-3">
                      <div className="h-24 rounded-xl bg-[#FAF7F2]" />
                      <div className="h-24 rounded-xl bg-[#FAF7F2]" />
                      <div className="h-24 rounded-xl bg-[#FAF7F2]" />
                    </div>
                  </div>
                ) : !routinePlan ? (
                  <div className="rounded-2xl bg-[#FFFFFF] border border-[#D6BD9B]/50 p-8 sm:p-12 space-y-4">
                    <p className="text-xs font-medium text-[#40332E]/65">Ingredient-Safe Layering</p>
                    <h3 className="font-display text-3xl font-semibold text-[#40332E]">
                      Step-by-Step Morning, Evening &amp; Wash-Day Planner
                    </h3>
                    <p className="text-sm text-[#40332E]/75 leading-relaxed max-w-2xl">
                      Select your skin type, hair texture, and primary concerns on the left to generate an ordered ritual featuring product imagery, exact application sequence, frequency, and ingredient precautions.
                    </p>
                  </div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl bg-[#FFFFFF] border border-[#D6BD9B]/60 p-6 sm:p-8 space-y-6 shadow-xs"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#F1E9DF] pb-5">
                      <div>
                        <p className="text-xs font-medium text-[#40332E]/60">Personalized Ritual Plan</p>
                        <h3 className="font-display text-3xl font-semibold text-[#40332E] mt-0.5">
                          {routinePlan.title}
                        </h3>
                        <p className="text-xs text-[#40332E]/75 mt-1">{routinePlan.summary}</p>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-[11px] text-[#40332E]/60">Estimated Complete Regimen</p>
                        <p className="font-mono text-xl font-semibold text-[#40332E] tabular-nums">
                          {formatPkr(routinePlan.totalEstimatedPkr)}
                        </p>
                      </div>
                    </div>

                    {/* Interactive Ritual Progress Bar */}
                    <div className="p-4 rounded-xl bg-[#FAF7F2] border border-[#D6BD9B]/45 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[#40332E]">Ritual Step Walkthrough</span>
                        <span className="font-mono font-semibold text-[#40332E] tabular-nums">
                          {checkedCount}/{totalRoutineSteps} Reviewed ({routineProgressPct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-[#F1E9DF] overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${routineProgressPct}%` }}
                          transition={{ duration: 0.25 }}
                          className="h-full bg-gradient-to-r from-[#D8AAA5] to-[#40332E]"
                        />
                      </div>
                    </div>

                    {checkedCount === totalRoutineSteps && totalRoutineSteps > 0 && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="p-4 rounded-xl bg-[#F1E9DF] border border-[#D6BD9B] flex items-center gap-3 text-xs text-[#40332E]"
                      >
                        <CheckCircle2 className="w-5 h-5 text-[#40332E] shrink-0" />
                        <span>
                          <strong>Routine Ready:</strong> All {totalRoutineSteps} steps and precautions have been reviewed. Save this plan or add all products below.
                        </span>
                      </motion.div>
                    )}

                    {[
                      { key: 'am', title: 'Morning Skincare Ritual', icon: Sun, steps: routinePlan.morningSkincare },
                      { key: 'pm', title: 'Night Skincare Ritual', icon: Moon, steps: routinePlan.nightSkincare },
                      { key: 'hair', title: 'Weekly Haircare & Scalp Ritual', icon: Sparkles, steps: routinePlan.weeklyHaircare },
                    ]
                      .filter((sec) => sec.steps.length > 0)
                      .map((sec) => {
                        const SecIcon = sec.icon;
                        return (
                          <div key={sec.key} className="space-y-3">
                            <div className="flex items-center gap-2 text-[#40332E]">
                              <SecIcon className="w-4 h-4 text-[#D8AAA5]" />
                              <h4 className="font-display text-2xl font-semibold">{sec.title}</h4>
                            </div>

                            <div className="space-y-3">
                              {sec.steps.map((step) => {
                                const prod = products.find((p) => p.slug === step.productSlug);
                                const price = prod ? getEffectivePrice(prod.pricePkr, prod.discountPricePkr) : 0;
                                const stepId = `${sec.key}-${step.stepNumber}-${step.productSlug}`;
                                const done = Boolean(checkedSteps[stepId]);

                                return (
                                  <motion.div
                                    key={stepId}
                                    whileHover={{ y: -1 }}
                                    className={`p-4 rounded-xl border transition-colors ${
                                      done
                                        ? 'bg-[#F1E9DF]/80 border-[#40332E]/40'
                                        : 'bg-[#FAF7F2] border-[#D6BD9B]/45'
                                    }`}
                                  >
                                    <div className="flex flex-col sm:flex-row sm:items-start gap-3.5">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setCheckedSteps((prev) => ({ ...prev, [stepId]: !prev[stepId] }))
                                        }
                                        aria-label={`Toggle step ${step.stepNumber}`}
                                        className={`mt-1 w-6 h-6 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                                          done
                                            ? 'bg-[#40332E] border-[#40332E] text-[#FFFFFF]'
                                            : 'bg-[#FFFFFF] border-[#D6BD9B] text-transparent hover:border-[#40332E]'
                                        }`}
                                      >
                                        <Check className="w-3.5 h-3.5" />
                                      </button>

                                      {prod && (
                                        <SafeImage
                                          src={prod.images[0]}
                                          alt={prod.name}
                                          className="w-16 h-16 rounded-lg object-cover bg-[#F1E9DF] shrink-0"
                                        />
                                      )}

                                      <div className="min-w-0 flex-1 space-y-1">
                                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#40332E]/65">
                                          <span className="font-mono font-medium">
                                            Order 0{step.stepNumber} <span aria-hidden="true">·</span> {step.stepRole} <span aria-hidden="true">·</span> {step.frequency}
                                          </span>
                                          {prod && (
                                            <span className="font-mono font-semibold text-[#40332E] tabular-nums">
                                              {formatPkr(price)}
                                            </span>
                                          )}
                                        </div>

                                        <button
                                          type="button"
                                          onClick={() => prod && navigate({ name: 'product', slug: prod.slug })}
                                          className="text-sm font-semibold text-[#40332E] hover:underline text-left block"
                                        >
                                          {prod?.name || step.productSlug}
                                        </button>

                                        <p className="text-xs text-[#40332E]/80 leading-relaxed">
                                          {step.usageInstruction}
                                        </p>

                                        {prod?.precautions && (
                                          <p className="text-[11px] text-[#40332E]/65 flex items-start gap-1.5 pt-1">
                                            <ShieldAlert className="w-3.5 h-3.5 text-[#D8AAA5] shrink-0 mt-0.5" />
                                            <span>{prod.precautions}</span>
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </motion.div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}

                    <div className="p-4 rounded-xl bg-[#F1E9DF] text-xs text-[#40332E]/85 leading-relaxed">
                      <strong>Important Precautions &amp; Layering Note:</strong> {routinePlan.safetyNote}
                    </div>

                    <div className="flex flex-wrap gap-3 pt-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await saveRoutine({
                            id: `ai-studio-${Date.now()}`,
                            title: routinePlan.title,
                            skinType: routineSkinType,
                            concerns: routineConcerns,
                            morningSlugs: routinePlan.morningSkincare.map((s) => s.productSlug),
                            nightSlugs: routinePlan.nightSkincare.map((s) => s.productSlug),
                            haircareSlugs: routinePlan.weeklyHaircare.map((s) => s.productSlug),
                            createdAt: new Date().toISOString(),
                          });
                          setRoutineSaved(true);
                        }}
                        className={`px-4 py-2.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                          routineSaved
                            ? 'bg-[#40332E] border-[#40332E] text-[#FFFFFF]'
                            : 'border-[#D6BD9B] bg-[#FFFFFF] hover:bg-[#F1E9DF] text-[#40332E]'
                        }`}
                      >
                        {routineSaved ? <Check className="w-4 h-4" /> : <BookmarkCheck className="w-4 h-4" />}
                        <span>{routineSaved ? 'Routine Saved' : 'Save Routine'}</span>
                      </button>

                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={handleAddRoutineProducts}
                        className="px-5 py-2.5 rounded-lg bg-[#40332E] hover:bg-[#2F2521] text-[#FFFFFF] text-xs font-semibold inline-flex items-center gap-2 transition-colors"
                      >
                        <ShoppingBag className="w-4 h-4" />
                        <span>Add All Routine Items to Bag</span>
                      </motion.button>

                      <button
                        type="button"
                        onClick={() => {
                          showToast('Opening AI Skin Specialist with your routine…');
                          openAssistant({
                            mode: 'chat',
                            prompt: `I just generated the "${routinePlan.title}" routine. Can you clarify application timing and precautions?`,
                          });
                        }}
                        className="px-4 py-2.5 rounded-lg bg-[#FAF7F2] border border-[#D6BD9B] hover:bg-[#F1E9DF] text-[#40332E] text-xs font-medium"
                      >
                        Ask AI Specialist
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
