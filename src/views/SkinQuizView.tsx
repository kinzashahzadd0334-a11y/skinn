import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookmarkCheck,
  Check,
  CheckCircle2,
  Moon,
  RotateCcw,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Sun,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from '../context/StoreContext';
import { SafeImage } from '../components/common/SafeImage';
import type { Product, QuizAnswers, SavedRoutine, SkinType } from '../types/store';
import { formatPkr, getDiscountPercent, getEffectivePrice } from '../utils/commerce';

const STEPS: {
  key: keyof QuizAnswers;
  question: string;
  helper: string;
  options: { label: string; value: string; note: string }[];
}[] = [
  {
    key: 'skinFeel',
    question: 'What best describes your skin type overall?',
    helper: 'Think about how your complexion behaves on an average morning without moisturizer.',
    options: [
      { label: 'Oily Skin', value: 'Oily Skin', note: 'Visible shine across forehead, nose, and cheeks' },
      { label: 'Dry Skin', value: 'Dry Skin', note: 'Feels tight, dull, or occasionally flaky after cleansing' },
      { label: 'Combination Skin', value: 'Combination Skin', note: 'Shiny T-zone with normal to dry cheeks' },
      { label: 'Normal Skin', value: 'Normal Skin', note: 'Balanced oil and hydration through the day' },
      { label: 'Sensitive Skin', value: 'Sensitive Skin', note: 'Flushes easily or stings with fragranced formulas' },
      { label: 'Acne-Prone Skin', value: 'Acne-Prone Skin', note: 'Frequently develops clogged pores or blemishes' },
    ],
  },
  {
    key: 'hydrationLevel',
    question: 'By midday, does your skin feel oily or dry?',
    helper: 'Both humid summers and indoor air-conditioning shift midday barrier moisture.',
    options: [
      { label: 'Noticeably oily all over', value: 'oily', note: 'Requires blotting paper by early afternoon' },
      { label: 'Shiny T-zone, comfortable cheeks', value: 'tzone', note: 'Classic mixed hydration balance' },
      { label: 'Tight or parched by afternoon', value: 'dry', note: 'Craves richer barrier moisture' },
      { label: 'Comfortable & even', value: 'balanced', note: 'Neither overly shiny nor tight' },
    ],
  },
  {
    key: 'acneFrequency',
    question: 'How often do you experience breakouts or clogged pores?',
    helper: 'Helps determine whether a gentle BHA or clarifying niacinamide step belongs at night.',
    options: [
      { label: 'Frequently (weekly blemishes)', value: 'frequent', note: 'Whiteheads, blackheads, or inflamed spots' },
      { label: 'Occasionally (hormonal or weather shifts)', value: 'occasional', note: 'A few spots around chin or nose' },
      { label: 'Rarely or never', value: 'rare', note: 'Breakouts are uncommon for me' },
    ],
  },
  {
    key: 'sensitivity',
    question: 'Is your skin sensitive or easily irritated?',
    helper: 'Determines acid strength and calming botanical buffers.',
    options: [
      { label: 'Yes, very reactive', value: 'high', note: 'Reddens or tingles with strong actives' },
      { label: 'Mildly sensitive', value: 'moderate', note: 'Tolerates gentle niacinamide & ceramides well' },
      { label: 'Resilient', value: 'low', note: 'Handles gentle AHAs and Vitamin C comfortably' },
    ],
  },
  {
    key: 'primaryConcern',
    question: 'What is your primary skincare goal right now?',
    helper: 'We will prioritize your active treatment serum around this concern.',
    options: [
      { label: 'Brightening & Dark Spots', value: 'Pigmentation', note: 'Uneven sun tone or post-blemish marks' },
      { label: 'Acne & Pore Clarity', value: 'Acne', note: 'Blackheads, excess sebum, and congested pores' },
      { label: 'Deep Hydration & Barrier Repair', value: 'Hydration', note: 'Dryness, tightness, or flaking' },
      { label: 'Smooth Texture & Balanced Glow', value: 'Texture', note: 'Dullness, rough patches, and fine lines' },
    ],
  },
  {
    key: 'currentRoutine',
    question: 'What does your current skincare routine look like?',
    helper: 'So we recommend a practical cadence you will enjoy keeping every day.',
    options: [
      { label: 'Minimal (Wash & occasional cream)', value: 'minimal', note: 'Looking for an effortless 3–4 step start' },
      { label: 'Consistent AM/PM with SPF', value: 'consistent', note: 'Ready to introduce targeted serums' },
      { label: 'Active-focused (Using acids or serums)', value: 'advanced', note: 'Looking to optimize layering & barrier support' },
    ],
  },
];

export function SkinQuizView() {
  const { products, addToCart, addMultipleToCart, navigate, saveRoutine, openAssistant } = useStore();
  const [stepIdx, setStepIdx] = useState(0);
  const [answers, setAnswers] = useState<Partial<QuizAnswers>>({});
  const [completed, setCompleted] = useState(false);
  const [savedFlag, setSavedFlag] = useState(false);
  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({});

  const currentStep = STEPS[stepIdx];

  const handleSelect = (value: string) => {
    const updated = { ...answers, [currentStep.key]: value };
    setAnswers(updated);
    setSavedFlag(false);
    setCheckedSteps({});
    window.setTimeout(() => {
      if (stepIdx < STEPS.length - 1) {
        setStepIdx((i) => i + 1);
      } else {
        setCompleted(true);
      }
    }, 180);
  };

  const result = useMemo(() => {
    if (!completed) return null;
    const determinedSkinType = (answers.skinFeel || 'Combination Skin') as SkinType;
    const findBySlug = (slug: string) => products.find((p) => p.slug === slug);

    const cleanser = findBySlug('botanical-calm-gel-cleanser');
    const sunscreen = findBySlug('mineral-silk-shield-spf50');

    let amSerum = findBySlug('niacinamide-saffron-glow-serum');
    if (answers.primaryConcern === 'Pigmentation' && answers.sensitivity !== 'high') {
      amSerum = findBySlug('vitamin-c-licorice-brightening-elixir') || amSerum;
    }

    const moisturizer =
      determinedSkinType === 'Oily Skin' && answers.hydrationLevel === 'oily'
        ? findBySlug('caffeine-peptide-eye-serum') || findBySlug('olive-ceramide-velvet-cream')
        : findBySlug('olive-ceramide-velvet-cream');

    let pmTreatment: Product | undefined;
    if (answers.acneFrequency === 'frequent' || answers.primaryConcern === 'Acne') {
      pmTreatment = findBySlug('salicylic-tea-tree-blemish-serum');
    } else if (answers.primaryConcern === 'Texture' && answers.sensitivity !== 'high') {
      pmTreatment = findBySlug('mandelic-aha-resurfacing-drops');
    } else if (answers.sensitivity === 'high') {
      pmTreatment = findBySlug('niacinamide-saffron-glow-serum');
    } else {
      pmTreatment = findBySlug('rosewater-glycolic-clarifying-toner');
    }

    const morningProducts = [cleanser, amSerum, moisturizer, sunscreen].filter((p): p is Product => Boolean(p));
    const nightProducts = [cleanser, pmTreatment, findBySlug('olive-ceramide-velvet-cream')].filter(
      (p): p is Product => Boolean(p),
    );

    const uniqueBundle = Array.from(new Map([...morningProducts, ...nightProducts].map((p) => [p.id, p])).values());
    const bundleTotal = uniqueBundle.reduce((sum, p) => sum + getEffectivePrice(p.pricePkr, p.discountPricePkr), 0);

    const concerns: string[] = [];
    if (answers.primaryConcern) concerns.push(answers.primaryConcern);
    if (answers.acneFrequency === 'frequent') concerns.push('Breakouts & Pores');
    if (answers.sensitivity === 'high') concerns.push('Barrier Sensitivity');
    if (answers.hydrationLevel === 'dry') concerns.push('Dehydration');
    if (concerns.length === 0) concerns.push('Daily Balance & Radiance');

    return {
      skinType: determinedSkinType,
      concerns,
      morningProducts,
      nightProducts,
      uniqueBundle,
      bundleTotal,
      sensitivityNote:
        answers.sensitivity === 'high'
          ? 'Reactive Barrier — Gentle buffer layering selected'
          : answers.sensitivity === 'moderate'
          ? 'Balanced Tolerance — Mild active concentration'
          : 'Resilient — Full botanical active cadence',
    };
  }, [completed, answers, products]);

  const handleSaveRoutine = async () => {
    if (!result) return;
    const routine: SavedRoutine = {
      id: `rtn-${Date.now()}`,
      title: `${result.skinType} Botanical Ritual`,
      skinType: result.skinType,
      concerns: result.concerns,
      morningSlugs: result.morningProducts.map((p) => p.slug),
      nightSlugs: result.nightProducts.map((p) => p.slug),
      createdAt: new Date().toISOString(),
    };
    await saveRoutine(routine);
    setSavedFlag(true);
  };

  const resetQuiz = () => {
    setStepIdx(0);
    setAnswers({});
    setCompleted(false);
    setSavedFlag(false);
    setCheckedSteps({});
  };

  const toggleStep = (key: string) => {
    setCheckedSteps((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (completed && result) {
    const totalRoutineSteps = result.morningProducts.length + result.nightProducts.length;
    const checkedCount =
      result.morningProducts.filter((p) => checkedSteps[`am-${p.id}`]).length +
      result.nightProducts.filter((p) => checkedSteps[`pm-${p.id}`]).length;
    const checklistPercent = totalRoutineSteps > 0 ? Math.round((checkedCount / totalRoutineSteps) * 100) : 0;

    return (
      <div className="bg-[#FAF7F2] min-h-screen">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12"
        >
          {/* Skin Profile Editorial Summary */}
          <section className="rounded-2xl bg-gradient-to-br from-[#FFFFFF] via-[#FAF7F2] to-[#F1E9DF] border border-[#D6BD9B]/55 p-6 sm:p-10 space-y-6 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-2">
                <p className="text-xs font-medium text-[#40332E]/65">
                  Consultation Profile <span aria-hidden="true">·</span> {result.sensitivityNote}
                </p>
                <h1 className="font-display text-4xl sm:text-5xl font-semibold text-[#40332E]">
                  {result.skinType}
                </h1>
                <p className="text-sm text-[#40332E]/75">
                  Primary Focus: <span className="font-medium text-[#40332E]">{result.concerns.join(' · ')}</span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSaveRoutine}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border text-xs font-semibold transition-colors ${
                    savedFlag
                      ? 'bg-[#40332E] border-[#40332E] text-[#FFFFFF]'
                      : 'border-[#D6BD9B] bg-[#FFFFFF] hover:bg-[#F1E9DF] text-[#40332E]'
                  }`}
                >
                  {savedFlag ? <Check className="w-4 h-4" /> : <BookmarkCheck className="w-4 h-4" />}
                  <span>{savedFlag ? 'Saved to Account' : 'Save Routine'}</span>
                </motion.button>

                <button
                  type="button"
                  onClick={() =>
                    openAssistant({
                      mode: 'chat',
                      prompt: `My quiz result is ${result.skinType} focusing on ${result.concerns.join(', ')}. How should I layer my routine?`,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-[#D6BD9B] bg-[#FFFFFF] hover:bg-[#F1E9DF] text-xs font-medium text-[#40332E] transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#D8AAA5]" />
                  <span>Ask AI Specialist</span>
                </button>

                <button
                  type="button"
                  onClick={resetQuiz}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-medium text-[#40332E]/70 hover:text-[#40332E]"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Retake Quiz</span>
                </button>
              </div>
            </div>

            <div className="pt-5 border-t border-[#D6BD9B]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs text-[#40332E]/65">Complete {result.uniqueBundle.length}-Piece AM &amp; PM Regimen</p>
                <p className="font-mono text-xl font-semibold text-[#40332E] tabular-nums">
                  {formatPkr(result.bundleTotal)}
                </p>
              </div>
              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={() => addMultipleToCart(result.uniqueBundle, true)}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[#40332E] hover:bg-[#2F2521] text-[#FFFFFF] text-xs font-semibold transition-colors"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Add Complete Routine to Bag</span>
              </motion.button>
            </div>
          </section>

          {/* Interactive Morning & Night Routine Progress Tracker */}
          <section className="space-y-6">
            <div className="rounded-xl bg-[#FFFFFF] border border-[#D6BD9B]/45 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-semibold text-[#40332E]">
                  Your Morning &amp; Evening Ritual Sequence
                </h2>
                <p className="text-xs text-[#40332E]/70 mt-0.5">
                  Tick off each formulation step as you review your application cadence and precautions.
                </p>
              </div>
              <div className="w-full sm:w-64 space-y-1.5 shrink-0">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[#40332E]">Ritual Checklist</span>
                  <span className="font-mono font-semibold text-[#40332E] tabular-nums">
                    {checkedCount}/{totalRoutineSteps} ({checklistPercent}%)
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-[#F1E9DF] overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${checklistPercent}%` }}
                    transition={{ duration: 0.25 }}
                    className="h-full bg-gradient-to-r from-[#D8AAA5] to-[#40332E]"
                  />
                </div>
              </div>
            </div>

            <AnimatePresence>
              {checkedCount === totalRoutineSteps && totalRoutineSteps > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="p-4 rounded-xl bg-[#F1E9DF] border border-[#D6BD9B] flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 text-xs text-[#40332E]">
                    <CheckCircle2 className="w-5 h-5 text-[#40332E] shrink-0" />
                    <span>
                      <strong>Ritual Complete:</strong> Every morning and evening step has been reviewed and verified for your skin type.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => addMultipleToCart(result.uniqueBundle, true)}
                    className="px-4 py-2 rounded-lg bg-[#40332E] text-[#FFFFFF] text-xs font-semibold"
                  >
                    Shop Full Set
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {[
                {
                  prefix: 'am',
                  title: 'Morning Protection Ritual',
                  cadence: 'Daily · AM',
                  icon: Sun,
                  items: result.morningProducts,
                },
                {
                  prefix: 'pm',
                  title: 'Evening Repair Ritual',
                  cadence: 'Daily · PM',
                  icon: Moon,
                  items: result.nightProducts,
                },
              ].map((col) => {
                const Icon = col.icon;
                return (
                  <div
                    key={col.prefix}
                    className="rounded-2xl bg-[#FFFFFF] border border-[#D6BD9B]/45 p-6 space-y-5"
                  >
                    <div className="flex items-center justify-between border-b border-[#F1E9DF] pb-3.5">
                      <div className="flex items-center gap-2.5 text-[#40332E]">
                        <Icon className="w-5 h-5 text-[#D8AAA5]" />
                        <h3 className="font-display text-2xl font-semibold">{col.title}</h3>
                      </div>
                      <span className="text-xs text-[#40332E]/60">{col.cadence}</span>
                    </div>

                    <div className="space-y-3.5">
                      {col.items.map((product, idx) => {
                        const stepKey = `${col.prefix}-${product.id}`;
                        const done = Boolean(checkedSteps[stepKey]);
                        return (
                          <motion.div
                            key={stepKey}
                            whileHover={{ y: -1 }}
                            className={`p-4 rounded-xl border transition-colors ${
                              done
                                ? 'bg-[#F1E9DF]/85 border-[#40332E]/40'
                                : 'bg-[#FAF7F2] border-[#D6BD9B]/45'
                            }`}
                          >
                            <div className="flex items-start gap-3.5">
                              <button
                                type="button"
                                onClick={() => toggleStep(stepKey)}
                                aria-label={`Mark ${product.name} step reviewed`}
                                className={`mt-1 w-6 h-6 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                                  done
                                    ? 'bg-[#40332E] border-[#40332E] text-[#FFFFFF]'
                                    : 'bg-[#FFFFFF] border-[#D6BD9B] text-transparent hover:border-[#40332E]'
                                }`}
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>

                              <SafeImage
                                src={product.images[0]}
                                alt={product.name}
                                className="w-16 h-16 rounded-lg object-cover bg-[#F1E9DF] shrink-0"
                              />

                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex items-center justify-between gap-2 text-[11px] text-[#40332E]/65">
                                  <span className="font-mono font-medium">Step 0{idx + 1} · {product.category}</span>
                                  <span className="font-mono font-semibold text-[#40332E] tabular-nums">
                                    {formatPkr(getEffectivePrice(product.pricePkr, product.discountPricePkr))}
                                  </span>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => navigate({ name: 'product', slug: product.slug })}
                                  className="text-sm font-semibold text-[#40332E] hover:underline text-left block"
                                >
                                  {product.name}
                                </button>

                                <p className="text-xs text-[#40332E]/75 leading-relaxed">{product.howToUse}</p>

                                {product.precautions && (
                                  <p className="text-[11px] text-[#40332E]/65 flex items-start gap-1.5 pt-1">
                                    <ShieldAlert className="w-3.5 h-3.5 text-[#D8AAA5] shrink-0 mt-0.5" />
                                    <span>{product.precautions}</span>
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
            </div>
          </section>

          {/* Recommended Catalog Products Grid */}
          <section className="space-y-6">
            <div>
              <p className="text-xs font-medium text-[#40332E]/65">Matched Formulations</p>
              <h2 className="font-display text-3xl font-semibold text-[#40332E]">
                Recommended Products for {result.skinType}
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {result.uniqueBundle.map((product) => {
                const effective = getEffectivePrice(product.pricePkr, product.discountPricePkr);
                const discountPct = getDiscountPercent(product.pricePkr, product.discountPricePkr);
                return (
                  <motion.article
                    key={product.id}
                    whileHover={{ y: -3 }}
                    transition={{ duration: 0.18 }}
                    className="rounded-xl bg-[#FFFFFF] border border-[#D6BD9B]/45 overflow-hidden flex flex-col justify-between shadow-xs hover:shadow-md transition-shadow"
                  >
                    <div>
                      <button
                        type="button"
                        onClick={() => navigate({ name: 'product', slug: product.slug })}
                        className="relative aspect-[4/3] w-full bg-[#F1E9DF] overflow-hidden block group"
                      >
                        <SafeImage
                          src={product.images[0]}
                          alt={product.name}
                          fallbackTitle={product.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        {discountPct && (
                          <span className="absolute top-3 left-3 px-2.5 py-1 rounded bg-[#40332E] text-[#FFFFFF] text-[11px] font-medium tabular-nums">
                            Save {discountPct}%
                          </span>
                        )}
                      </button>

                      <div className="p-5 space-y-2">
                        <div className="flex items-center justify-between text-xs text-[#40332E]/60">
                          <span>{product.category}</span>
                          <span className="font-mono tabular-nums">{product.volume}</span>
                        </div>
                        <h3 className="font-sans text-base font-semibold text-[#40332E] leading-snug">
                          {product.name}
                        </h3>
                        <p className="text-xs text-[#40332E]/75">
                          Suitable for {product.suitableTypes.slice(0, 2).join(', ')}
                        </p>
                        <p className="text-xs text-[#40332E]/65">
                          Key Actives: {product.keyIngredients.slice(0, 3).join(' · ')}
                        </p>
                      </div>
                    </div>

                    <div className="px-5 pb-5 pt-3 border-t border-[#F1E9DF] space-y-3">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-base font-semibold text-[#40332E] tabular-nums">
                          {formatPkr(effective)}
                        </span>
                        {discountPct && (
                          <span className="font-mono text-xs text-[#40332E]/45 line-through tabular-nums">
                            {formatPkr(product.pricePkr)}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => navigate({ name: 'product', slug: product.slug })}
                          className="py-2.5 px-3 rounded-lg border border-[#D6BD9B] hover:bg-[#F1E9DF] text-xs font-medium text-[#40332E] inline-flex items-center justify-center gap-1 transition-colors"
                        >
                          <span>View Details</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.96 }}
                          onClick={() => addToCart(product, 1, true)}
                          disabled={product.stock <= 0}
                          className="py-2.5 px-3 rounded-lg bg-[#40332E] hover:bg-[#2F2521] disabled:opacity-45 text-[#FFFFFF] text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <ShoppingBag className="w-3.5 h-3.5" />
                          <span>{product.stock > 0 ? 'Add to Bag' : 'Sold Out'}</span>
                        </motion.button>
                      </div>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          </section>
        </motion.div>
      </div>
    );
  }

  const progress = Math.round(((stepIdx + 1) / STEPS.length) * 100);

  return (
    <div className="relative bg-[#FAF7F2] min-h-[calc(100vh-5rem)] overflow-hidden py-12 px-4 sm:px-6 lg:px-8">
      {/* Subtle Ambient Warm Gradients */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[680px] h-[340px] rounded-full bg-gradient-to-r from-[#D8AAA5]/20 via-[#D6BD9B]/20 to-[#F1E9DF]/40 blur-3xl"
      />

      <div className="relative max-w-3xl mx-auto space-y-8">
        {/* Progress Header */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-[#40332E]/70">
            <span className="font-medium text-[#40332E]">Skin Consultation Questionnaire</span>
            <span className="font-mono tabular-nums font-medium">
              Step 0{stepIdx + 1} / 0{STEPS.length}
            </span>
          </div>

          <div className="h-1.5 w-full bg-[#F1E9DF] rounded-full overflow-hidden">
            <motion.div
              initial={false}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="h-full bg-gradient-to-r from-[#D8AAA5] via-[#D6BD9B] to-[#40332E]"
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            {STEPS.map((st, idx) => {
              const answered = Boolean(answers[st.key]);
              const isCurrent = idx === stepIdx;
              return (
                <button
                  key={st.key}
                  type="button"
                  disabled={!answered && idx > stepIdx}
                  onClick={() => setStepIdx(idx)}
                  aria-label={`Jump to question ${idx + 1}`}
                  className={`flex-1 h-1 rounded-full transition-colors ${
                    isCurrent
                      ? 'bg-[#40332E]'
                      : answered
                      ? 'bg-[#D6BD9B] hover:bg-[#40332E]/60'
                      : 'bg-[#F1E9DF]'
                  }`}
                />
              );
            })}
          </div>
        </div>

        {/* Question Frame */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep.key}
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -14 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="p-6 sm:p-10 rounded-2xl bg-[#FFFFFF] border border-[#D6BD9B]/55 shadow-sm space-y-7"
          >
            <div className="space-y-2.5">
              <p className="text-xs font-medium text-[#40332E]/60">
                Question 0{stepIdx + 1}
              </p>
              <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[#40332E] leading-tight">
                {currentStep.question}
              </h1>
              <p className="text-sm text-[#40332E]/70 leading-relaxed">{currentStep.helper}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {currentStep.options.map((opt) => {
                const active = answers[currentStep.key] === opt.value;
                return (
                  <motion.button
                    key={opt.value}
                    type="button"
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.985 }}
                    onClick={() => handleSelect(opt.value)}
                    className={`group relative p-4 rounded-xl border text-left transition-all ${
                      active
                        ? 'border-[#40332E] bg-[#F1E9DF] shadow-xs'
                        : 'border-[#D6BD9B]/55 bg-[#FAF7F2] hover:border-[#40332E]/50 hover:bg-[#FFFFFF]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-[#40332E]">{opt.label}</p>
                      <span
                        className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                          active
                            ? 'bg-[#40332E] border-[#40332E] text-[#FFFFFF]'
                            : 'border-[#D6BD9B] bg-[#FFFFFF] text-transparent'
                        }`}
                      >
                        <Check className="w-3 h-3" />
                      </span>
                    </div>
                    <p className="text-xs text-[#40332E]/70 mt-1.5 leading-relaxed">{opt.note}</p>
                  </motion.button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-5 border-t border-[#F1E9DF]">
              <button
                type="button"
                disabled={stepIdx === 0}
                onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-medium text-[#40332E]/70 hover:text-[#40332E] disabled:opacity-35 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>

              {answers[currentStep.key] && (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    if (stepIdx < STEPS.length - 1) setStepIdx((i) => i + 1);
                    else setCompleted(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-[#40332E] hover:bg-[#2F2521] text-[#FFFFFF] text-xs font-semibold transition-colors"
                >
                  <span>{stepIdx === STEPS.length - 1 ? 'Reveal Routine' : 'Next Question'}</span>
                  <ArrowRight className="w-4 h-4" />
                </motion.button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
