import { useState } from 'react';
import { Menu, Search, ShoppingBag, User, X } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import type { AppRoute } from '../../types/store';

export function Header() {
  const { route, navigate, cartCount, setCartOpen, setSearchOpen, customer } = useStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems: { label: string; target: AppRoute; match: AppRoute['name'] }[] = [
    { label: 'Skincare', target: { name: 'skincare' }, match: 'skincare' },
    { label: 'Haircare', target: { name: 'haircare' }, match: 'haircare' },
    { label: '3D Atelier', target: { name: 'atelier' }, match: 'atelier' },
    { label: 'AI Studio', target: { name: 'ai-studio', tab: 'skin' }, match: 'ai-studio' },
    { label: 'Skin Quiz', target: { name: 'quiz' }, match: 'quiz' },
    { label: 'Ingredients', target: { name: 'ingredients' }, match: 'ingredients' },
  ];

  const handleNav = (target: AppRoute) => {
    setMobileOpen(false);
    navigate(target);
  };

  return (
    <header className="sticky top-0 z-40 w-full max-w-full bg-[#FAF6EE]/95 border-b border-[#232620]/10">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4 lg:gap-8 min-w-0">
        {/* Zone 1: Single text element Brand wordmark */}
        <button
          type="button"
          onClick={() => handleNav({ name: 'home' })}
          className="font-display text-lg sm:text-xl lg:text-2xl font-semibold tracking-tight text-[#232620] whitespace-nowrap min-w-0 truncate focus-visible:outline-2 focus-visible:outline-[#4A5D3F]"
        >
          Aurelia Botanica
        </button>

        {/* Zone 2: 5 concise single-line text nav links */}
        <nav className="hidden lg:flex items-center gap-7" aria-label="Primary">
          {navItems.map((item) => {
            const active = route.name === item.match;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => handleNav(item.target)}
                className={`text-sm font-medium whitespace-nowrap shrink-0 py-1 border-b transition-colors focus-visible:outline-2 focus-visible:outline-[#4A5D3F] ${
                  active
                    ? 'text-[#4A5D3F] border-[#4A5D3F]'
                    : 'text-[#5C6156] border-transparent hover:text-[#232620] hover:border-[#C5A059]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Search, Account & Primary Bag action */}
        <div className="flex items-center gap-1 sm:gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search products and ingredients"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-[#232620] hover:bg-[#F1EAE0] transition-colors focus-visible:outline-2 focus-visible:outline-[#4A5D3F]"
          >
            <Search className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => handleNav({ name: 'account' })}
            aria-label={customer ? `Account (${customer.name})` : 'Sign in or track order'}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-[#232620] hover:bg-[#F1EAE0] whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-[#4A5D3F]"
          >
            <User className="w-4 h-4" />
            <span>{customer ? customer.name.split(' ')[0] : 'Account'}</span>
          </button>

          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg bg-[#4A5D3F] hover:bg-[#3A4A31] text-[#FDFBF7] text-xs font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4A5D3F]"
          >
            <ShoppingBag className="w-4 h-4 shrink-0" />
            <span className="tabular-nums">Bag ({cartCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="lg:hidden w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-[#232620] hover:bg-[#F1EAE0] transition-colors"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile slide-down drawer */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-[#232620]/10 bg-[#FAF6EE] px-4 py-4 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => handleNav(item.target)}
              className={`w-full text-left px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                route.name === item.match
                  ? 'bg-[#4A5D3F]/10 text-[#4A5D3F]'
                  : 'text-[#232620] hover:bg-[#F1EAE0]'
              }`}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => handleNav({ name: 'account' })}
            className="w-full text-left px-3 py-3 rounded-lg text-sm font-medium text-[#232620] hover:bg-[#F1EAE0]"
          >
            {customer ? `Account (${customer.name})` : 'Account & Order Tracking'}
          </button>
        </div>
      )}
    </header>
  );
}
