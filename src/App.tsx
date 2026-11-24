import { StoreProvider, useStore } from './context/StoreContext';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { CartDrawer } from './components/layout/CartDrawer';
import { SearchModal } from './components/layout/SearchModal';
import { FloatingWhatsApp } from './components/layout/FloatingWhatsApp';
import { AIAssistantWidget } from './components/ai/AIAssistantWidget';
import { HomeView } from './views/HomeView';
import { CatalogView } from './views/CatalogView';
import { ProductDetailView } from './views/ProductDetailView';
import { Atelier3DView } from './views/Atelier3DView';
import { SkinQuizView } from './views/SkinQuizView';
import { IngredientLibraryView } from './views/IngredientLibraryView';
import { CheckoutView } from './views/CheckoutView';
import { AccountView } from './views/AccountView';
import { PolicyView } from './views/PolicyView';
import { AIAnalyzerView } from './views/AIAnalyzerView';
import { AdminView } from './views/AdminView';

function StorefrontShell() {
  const { route, toastMessage } = useStore();

  const renderView = () => {
    switch (route.name) {
      case 'home':
        return <HomeView />;
      case 'skincare':
        return <CatalogView department="skincare" initialCategory={route.category} />;
      case 'haircare':
        return <CatalogView department="haircare" initialCategory={route.category} />;
      case 'product':
        return <ProductDetailView slug={route.slug} />;
      case 'atelier':
        return <Atelier3DView initialSlug={route.slug} />;
      case 'quiz':
        return <SkinQuizView />;
      case 'ai-studio':
        return <AIAnalyzerView initialTab={route.tab} />;
      case 'ingredients':
        return <IngredientLibraryView initialIngredientId={route.ingredientId} />;
      case 'checkout':
        return <CheckoutView />;
      case 'account':
        return <AccountView />;
      case 'admin':
        return <AdminView />;
      case 'policy':
        return <PolicyView section={route.section} />;
    }
  };

  const isAdminRoute = route.name === 'admin';

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip flex flex-col bg-[#FAF6EE] text-[#232620] box-border">
      {!isAdminRoute && <Header />}
      <main className="flex-1 w-full min-w-0">{renderView()}</main>
      {!isAdminRoute && route.name !== 'atelier' && <Footer />}
      {!isAdminRoute && <CartDrawer />}
      {!isAdminRoute && <SearchModal />}
      {!isAdminRoute && <FloatingWhatsApp />}
      {!isAdminRoute && <AIAssistantWidget />}

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-lg bg-[#232620] text-[#FAF6EE] text-xs font-medium shadow-xl border border-[#C5A059]/40 no-print"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <StorefrontShell />
    </StoreProvider>
  );
}
