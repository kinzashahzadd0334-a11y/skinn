import { useMemo, useState } from 'react';
import { ArrowRight, Search, X } from 'lucide-react';
import { INGREDIENT_LIBRARY } from '../../data/catalog';
import { useStore } from '../../context/StoreContext';
import { formatPkr, getEffectivePrice } from '../../utils/commerce';
import { SafeImage } from '../common/SafeImage';

export function SearchModal() {
  const { isSearchOpen, setSearchOpen, products, navigate } = useStore();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return {
        products: products.filter((p) => p.isBestSeller).slice(0, 4),
        ingredients: INGREDIENT_LIBRARY.slice(0, 4),
      };
    }
    return {
      products: products
        .filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q) ||
            p.subtitle.toLowerCase().includes(q) ||
            p.keyIngredients.some((ing) => ing.toLowerCase().includes(q)) ||
            p.suitableTypes.some((t) => t.toLowerCase().includes(q)),
        )
        .slice(0, 6),
      ingredients: INGREDIENT_LIBRARY.filter(
        (ing) => ing.name.toLowerCase().includes(q) || ing.cosmeticPurpose.toLowerCase().includes(q),
      ).slice(0, 4),
    };
  }, [products, query]);

  if (!isSearchOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4" role="dialog" aria-modal="true" aria-label="Search Aurelia Botanica">
      <div
        className="fixed inset-0 bg-[#232620]/45"
        onClick={() => setSearchOpen(false)}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-2xl bg-[#FAF6EE] rounded-2xl border border-[#232620]/15 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#232620]/10 bg-[#FDFBF7]">
          <Search className="w-5 h-5 text-[#4A5D3F] shrink-0" />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search serums, rosemary oil, acne care, niacinamide..."
            className="w-full bg-transparent text-sm text-[#232620] placeholder:text-[#5C6156] focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setSearchOpen(false)}
            aria-label="Close search"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-[#5C6156] hover:bg-[#F1EAE0]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5 space-y-6">
          <div>
            <p className="text-xs font-medium text-[#5C6156] mb-3">
              {query.trim() ? `Matching Formulas (${results.products.length})` : 'Popular Botanical Formulas'}
            </p>
            {results.products.length === 0 ? (
              <p className="text-sm text-[#5C6156] py-4">No formulas matched “{query}”.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {results.products.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => {
                      setSearchOpen(false);
                      navigate({ name: 'product', slug: product.slug });
                    }}
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-[#FDFBF7] border border-[#232620]/10 hover:border-[#4A5D3F]/40 text-left transition-colors"
                  >
                    <SafeImage
                      src={product.images[0]}
                      alt={product.name}
                      className="w-14 h-14 rounded-lg object-cover bg-[#F1EAE0] shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#232620] truncate">{product.name}</p>
                      <p className="text-xs text-[#5C6156] truncate">{product.category}</p>
                      <p className="font-mono text-xs text-[#4A5D3F] tabular-nums mt-0.5">
                        {formatPkr(getEffectivePrice(product.pricePkr, product.discountPricePkr))}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {results.ingredients.length > 0 && (
            <div className="pt-4 border-t border-[#232620]/10">
              <p className="text-xs font-medium text-[#5C6156] mb-3">Ingredient Library</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {results.ingredients.map((ing) => (
                  <button
                    key={ing.id}
                    type="button"
                    onClick={() => {
                      setSearchOpen(false);
                      navigate({ name: 'ingredients', ingredientId: ing.id });
                    }}
                    className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-[#F1EAE0]/70 hover:bg-[#F1EAE0] text-left transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#232620] truncate">{ing.name}</p>
                      <p className="text-xs text-[#5C6156] truncate">{ing.categoryLabel}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[#4A5D3F] shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
