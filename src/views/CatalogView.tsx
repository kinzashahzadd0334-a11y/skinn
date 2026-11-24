import { useEffect, useMemo, useState } from 'react';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import {
  HAIR_CONCERNS,
  HAIR_TYPES,
  HAIRCARE_CATEGORIES,
  SKIN_TYPES,
  SKINCARE_CATEGORIES,
} from '../data/catalog';
import { useStore } from '../context/StoreContext';
import { ProductCard } from '../components/common/ProductCard';
import type { Department } from '../types/store';
import { formatPkr, getEffectivePrice } from '../utils/commerce';

interface CatalogViewProps {
  department: Department;
  initialCategory?: string;
}

export function CatalogView({ department, initialCategory }: CatalogViewProps) {
  const { products, categories: liveCategories, navigate } = useStore();
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory || 'All');
  const [selectedType, setSelectedType] = useState<string>('All');
  const [selectedConcern, setSelectedConcern] = useState<string>('All');
  const [selectedIngredient, setSelectedIngredient] = useState<string>('All');
  const [maxPrice, setMaxPrice] = useState<number>(6000);
  const [minRating, setMinRating] = useState<number>(0);
  const [sortBy, setSortBy] = useState<'featured' | 'bestsellers' | 'new' | 'price-asc' | 'price-desc' | 'rating'>(
    'featured',
  );
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  useEffect(() => {
    setSelectedCategory(initialCategory || 'All');
    setSelectedType('All');
    setSelectedConcern('All');
    setSelectedIngredient('All');
  }, [department, initialCategory]);

  const deptProducts = useMemo(() => products.filter((p) => p.department === department), [products, department]);

  const categories = useMemo(() => {
    const dbCats = liveCategories
      .filter((c) => c.department === department && c.isActive)
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((c) => c.name);
    if (dbCats.length > 0) return dbCats;
    return department === 'skincare' ? SKINCARE_CATEGORIES : HAIRCARE_CATEGORIES;
  }, [liveCategories, department]);
  const typeOptions = department === 'skincare' ? SKIN_TYPES : HAIR_TYPES;

  const availableIngredients = useMemo(() => {
    const set = new Set<string>();
    deptProducts.forEach((p) => p.keyIngredients.forEach((ing) => set.add(ing)));
    return Array.from(set).sort();
  }, [deptProducts]);

  const filteredProducts = useMemo(() => {
    return deptProducts
      .filter((p) => {
        if (selectedCategory !== 'All' && p.category !== selectedCategory) return false;
        if (selectedType !== 'All' && !p.suitableTypes.includes(selectedType as never)) return false;
        if (selectedConcern !== 'All' && !p.concerns.includes(selectedConcern)) return false;
        if (selectedIngredient !== 'All' && !p.keyIngredients.includes(selectedIngredient)) return false;
        const effective = getEffectivePrice(p.pricePkr, p.discountPricePkr);
        if (effective > maxPrice) return false;
        if (p.rating < minRating) return false;
        return true;
      })
      .sort((a, b) => {
        const pa = getEffectivePrice(a.pricePkr, a.discountPricePkr);
        const pb = getEffectivePrice(b.pricePkr, b.discountPricePkr);
        if (sortBy === 'price-asc') return pa - pb;
        if (sortBy === 'price-desc') return pb - pa;
        if (sortBy === 'rating') return b.rating - a.rating;
        if (sortBy === 'bestsellers') return Number(Boolean(b.isBestSeller)) - Number(Boolean(a.isBestSeller));
        if (sortBy === 'new') return Number(Boolean(b.isNewArrival)) - Number(Boolean(a.isNewArrival));
        return Number(Boolean(b.isBestSeller)) - Number(Boolean(a.isBestSeller));
      });
  }, [deptProducts, selectedCategory, selectedType, selectedConcern, selectedIngredient, maxPrice, minRating, sortBy]);

  const resetFilters = () => {
    setSelectedCategory('All');
    setSelectedType('All');
    setSelectedConcern('All');
    setSelectedIngredient('All');
    setMaxPrice(10000);
    setMinRating(0);
    setSortBy('featured');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Department Header */}
      <div className="border-b border-[#232620]/10 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-2 max-w-2xl">
          <div className="flex items-center gap-2 text-xs text-[#4A5D3F] font-medium">
            <button type="button" onClick={() => navigate({ name: 'home' })} className="hover:underline">
              Home
            </button>
            <span aria-hidden="true">/</span>
            <span>{department === 'skincare' ? 'Skincare Shop' : 'Haircare Shop'}</span>
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold text-[#232620]">
            {department === 'skincare' ? 'Botanical Skincare Atelier' : 'Scalp & Strand Haircare'}
          </h1>
          <p className="text-sm sm:text-base text-[#5C6156]">
            {department === 'skincare'
              ? 'Ten targeted skincare categories formulated with niacinamide, multi-weight hyaluronic acid, ceramides, and gentle resurfacing acids.'
              : 'Ten hair and scalp care categories powered by cold-pressed rosemary oil, Moroccan argan, hydrolyzed keratin, and biotin.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileFiltersOpen((v) => !v)}
            className="lg:hidden inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[#232620]/20 bg-[#FDFBF7] text-xs font-medium text-[#232620]"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Filters</span>
          </button>

          <select
            aria-label="Sort products"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="px-3.5 py-2.5 rounded-lg border border-[#232620]/20 bg-[#FDFBF7] text-xs font-medium text-[#232620] focus:outline-2 focus:outline-[#4A5D3F]"
          >
            <option value="featured">Sort: Curated</option>
            <option value="bestsellers">Sort: Best Sellers</option>
            <option value="new">Sort: New Arrivals</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="rating">Highest Rated</option>
          </select>
        </div>
      </div>

      {/* Category Horizontal Segmented Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        <button
          type="button"
          onClick={() => setSelectedCategory('All')}
          className={`px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
            selectedCategory === 'All'
              ? 'bg-[#4A5D3F] text-[#FDFBF7]'
              : 'bg-[#F1EAE0] text-[#232620] hover:bg-[#E7DDD0]'
          }`}
        >
          All ({deptProducts.length})
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCategory(cat)}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
              selectedCategory === cat
                ? 'bg-[#4A5D3F] text-[#FDFBF7]'
                : 'bg-[#F1EAE0] text-[#232620] hover:bg-[#E7DDD0]'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Sidebar Filters */}
        <aside
          className={`lg:col-span-3 space-y-6 p-5 rounded-xl bg-[#FDFBF7] border border-[#232620]/10 ${
            mobileFiltersOpen ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold text-[#232620]">Refine Ritual</h2>
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#4A5D3F] hover:underline"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[#232620]">
              {department === 'skincare' ? 'Skin Type' : 'Hair Type'}
            </label>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setSelectedType('All')}
                className={`w-full text-left px-3 py-1.5 rounded-md text-xs transition-colors ${
                  selectedType === 'All' ? 'bg-[#4A5D3F]/12 text-[#4A5D3F] font-semibold' : 'text-[#5C6156] hover:bg-[#F1EAE0]'
                }`}
              >
                All {department === 'skincare' ? 'Skin' : 'Hair'} Types
              </button>
              {typeOptions.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSelectedType(type)}
                  className={`w-full text-left px-3 py-1.5 rounded-md text-xs transition-colors ${
                    selectedType === type ? 'bg-[#4A5D3F]/12 text-[#4A5D3F] font-semibold' : 'text-[#5C6156] hover:bg-[#F1EAE0]'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {department === 'haircare' && (
            <div className="space-y-2 pt-4 border-t border-[#232620]/10">
              <label className="block text-xs font-semibold text-[#232620]">Hair &amp; Scalp Concern</label>
              <select
                value={selectedConcern}
                onChange={(e) => setSelectedConcern(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-xs text-[#232620]"
              >
                <option value="All">All Concerns</option>
                {HAIR_CONCERNS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-2 pt-4 border-t border-[#232620]/10">
            <label htmlFor="ingredient-filter" className="block text-xs font-semibold text-[#232620]">
              Key Active Ingredient
            </label>
            <select
              id="ingredient-filter"
              value={selectedIngredient}
              onChange={(e) => setSelectedIngredient(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-xs text-[#232620]"
            >
              <option value="All">All Key Actives</option>
              {availableIngredients.map((ing) => (
                <option key={ing} value={ing}>
                  {ing}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2 pt-4 border-t border-[#232620]/10">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#232620]">Max Price</span>
              <span className="font-mono tabular-nums text-[#4A5D3F]">{formatPkr(maxPrice)}</span>
            </div>
            <input
              type="range"
              min={1500}
              max={10000}
              step={250}
              value={maxPrice}
              onChange={(e) => setMaxPrice(Number(e.target.value))}
              className="w-full accent-[#4A5D3F]"
            />
          </div>

          <div className="space-y-2 pt-4 border-t border-[#232620]/10">
            <label htmlFor="rating-filter" className="block text-xs font-semibold text-[#232620]">
              Minimum Customer Rating
            </label>
            <select
              id="rating-filter"
              value={minRating}
              onChange={(e) => setMinRating(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-xs text-[#232620]"
            >
              <option value={0}>All Ratings</option>
              <option value={4.5}>4.5 stars &amp; above</option>
              <option value={4.8}>4.8 stars &amp; above</option>
            </select>
          </div>

          {department === 'skincare' && (
            <div className="pt-4 border-t border-[#232620]/10 space-y-2">
              <p className="text-xs text-[#5C6156] leading-relaxed">
                Need help matching formulas to your skin balance?
              </p>
              <button
                type="button"
                onClick={() => navigate({ name: 'quiz' })}
                className="w-full py-2.5 px-3 rounded-lg bg-[#4A5D3F]/10 hover:bg-[#4A5D3F]/18 text-[#4A5D3F] text-xs font-semibold transition-colors"
              >
                Take 6-Step Skin Quiz
              </button>
            </div>
          )}
        </aside>

        {/* Product Grid */}
        <div className="lg:col-span-9 space-y-5">
          <div className="flex items-center justify-between text-xs text-[#5C6156]">
            <span className="tabular-nums">
              Showing {filteredProducts.length} of {deptProducts.length} formulations
            </span>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="p-12 rounded-2xl bg-[#FDFBF7] border border-[#232620]/10 text-center space-y-3">
              <p className="font-display text-2xl text-[#232620]">No formulas match these filters</p>
              <p className="text-sm text-[#5C6156]">
                Broaden your skin/hair type or price ceiling to explore our full apothecary lineup.
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="px-5 py-2.5 rounded-lg bg-[#4A5D3F] text-[#FDFBF7] text-xs font-medium hover:bg-[#3A4A31] transition-colors"
              >
                Reset All Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
