import { useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { INGREDIENT_LIBRARY, STORE_IMAGES } from '../data/catalog';
import { useStore } from '../context/StoreContext';
import { ProductCard } from '../components/common/ProductCard';
import { SafeImage } from '../components/common/SafeImage';

interface IngredientLibraryViewProps {
  initialIngredientId?: string;
}

export function IngredientLibraryView({ initialIngredientId }: IngredientLibraryViewProps) {
  const { products } = useStore();
  const [filterDept, setFilterDept] = useState<'All' | 'Skincare' | 'Haircare'>('All');
  const [selectedId, setSelectedId] = useState<string>(initialIngredientId || INGREDIENT_LIBRARY[0].id);

  const filteredList = useMemo(() => {
    if (filterDept === 'All') return INGREDIENT_LIBRARY;
    return INGREDIENT_LIBRARY.filter((ing) => ing.department.includes(filterDept));
  }, [filterDept]);

  const activeIngredient = useMemo(
    () => INGREDIENT_LIBRARY.find((ing) => ing.id === selectedId) || filteredList[0] || INGREDIENT_LIBRARY[0],
    [selectedId, filteredList],
  );

  const relatedProducts = useMemo(
    () => products.filter((p) => activeIngredient.featuredProductSlugs.includes(p.slug)),
    [products, activeIngredient],
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center border-b border-[#232620]/10 pb-8">
        <div className="lg:col-span-7 space-y-3">
          <p className="text-xs font-medium text-[#4A5D3F]">Cosmetic Ingredient Education</p>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold text-[#232620]">
            The Aurelia Botanical Glossary
          </h1>
          <p className="text-sm sm:text-base text-[#5C6156] max-w-2xl leading-relaxed">
            Every active ingredient in our apothecary is documented with its cosmetic purpose, ideal skin or hair profile, and practical safety precautions—so you choose formulas with clarity.
          </p>
        </div>
        <div className="lg:col-span-5 aspect-[4/3] rounded-2xl overflow-hidden bg-[#F1EAE0] border border-[#232620]/10">
          <SafeImage
            src={STORE_IMAGES.ingredients}
            alt="Botanical oils and active ingredients in studio laboratory"
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        {(['All', 'Skincare', 'Haircare'] as const).map((dept) => (
          <button
            key={dept}
            type="button"
            onClick={() => setFilterDept(dept)}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
              filterDept === dept ? 'bg-[#4A5D3F] text-[#FDFBF7]' : 'bg-[#F1EAE0] text-[#232620] hover:bg-[#E7DDD0]'
            }`}
          >
            {dept} Actives
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-4 space-y-2">
          {filteredList.map((ing) => (
            <button
              key={ing.id}
              type="button"
              onClick={() => setSelectedId(ing.id)}
              className={`w-full text-left p-4 rounded-xl border transition-colors ${
                activeIngredient.id === ing.id
                  ? 'bg-[#4A5D3F] text-[#FDFBF7] border-[#4A5D3F]'
                  : 'bg-[#FDFBF7] text-[#232620] border-[#232620]/10 hover:bg-[#F1EAE0]'
              }`}
            >
              <p className="text-sm font-semibold">{ing.name}</p>
              <p
                className={`text-xs mt-0.5 ${
                  activeIngredient.id === ing.id ? 'text-[#FAF6EE]/80' : 'text-[#5C6156]'
                }`}
              >
                {ing.categoryLabel} · {ing.department}
              </p>
            </button>
          ))}
        </div>

        <div className="lg:col-span-8 space-y-8">
          <article className="p-6 sm:p-8 rounded-2xl bg-[#FDFBF7] border border-[#232620]/10 space-y-6">
            <div className="space-y-2 border-b border-[#232620]/10 pb-5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#4A5D3F] font-medium">
                <span>{activeIngredient.categoryLabel}</span>
                <span aria-hidden="true">·</span>
                <span>{activeIngredient.origin}</span>
              </div>
              <h2 className="font-display text-3xl sm:text-4xl font-semibold text-[#232620]">
                {activeIngredient.name}
              </h2>
              <p className="text-sm text-[#5C6156] leading-relaxed">{activeIngredient.summary}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#4A5D3F]">Cosmetic Purpose</h3>
                <p className="text-sm text-[#232620] leading-relaxed">{activeIngredient.cosmeticPurpose}</p>
              </div>
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#4A5D3F]">Suitable Profiles</h3>
                <p className="text-sm text-[#232620] leading-relaxed">{activeIngredient.suitableFor.join(' · ')}</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#EFE2DC]/60 border border-[#232620]/10 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-[#4A5D3F] shrink-0 mt-0.5" />
              <div className="text-xs text-[#232620] space-y-1">
                <p className="font-semibold">Usage Precautions &amp; Educational Note</p>
                <p className="text-[#5C6156] leading-relaxed">{activeIngredient.precautions}</p>
              </div>
            </div>
          </article>

          <div className="space-y-4">
            <h3 className="font-display text-2xl font-semibold text-[#232620]">
              Formulas Featuring {activeIngredient.name}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {relatedProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
