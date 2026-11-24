import { MessageCircle } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { recordWhatsAppReferralLocal } from '../../db/localDatabase';

export function Footer() {
  const { navigate, storeConfig } = useStore();
  const waDirect = `https://wa.me/${storeConfig.whatsappNumber}?text=${encodeURIComponent(
    storeConfig.whatsappWelcomeMessage ||
      'Hello Aurelia Botanica! I would like guidance choosing a skincare or haircare routine.',
  )}`;

  const logWaReferral = () => {
    void recordWhatsAppReferralLocal(
      'footer_concierge',
      'Footer WhatsApp Concierge click',
    ).catch(() => {});
  };

  return (
    <footer className="bg-[#232620] text-[#FAF6EE] border-t border-[#C5A059]/20 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid grid-cols-1 md:grid-cols-4 gap-10">
        <div className="md:col-span-1 space-y-3">
          <p className="font-display text-2xl font-semibold text-[#FAF6EE]">{storeConfig.brandName}</p>
          <p className="text-xs text-[#FAF6EE]/75 leading-relaxed">
            Small-batch botanical skincare and haircare formulated with transparent actives, shipped nationwide across Pakistan with Cash on Delivery and WhatsApp support.
          </p>
          <p className="text-xs text-[#C5A059] pt-1">
            Free delivery above PKR {storeConfig.freeShippingThresholdPkr.toLocaleString('en-PK')} · Promo: AURELIA10
          </p>
        </div>

        <div>
          <h3 className="text-xs font-semibold tracking-wider text-[#C5A059] uppercase mb-3">Collections</h3>
          <ul className="space-y-2 text-sm text-[#FAF6EE]/80">
            <li>
              <button type="button" onClick={() => navigate({ name: 'skincare' })} className="hover:text-white">
                Skincare Shop
              </button>
            </li>
            <li>
              <button type="button" onClick={() => navigate({ name: 'haircare' })} className="hover:text-white">
                Haircare Shop
              </button>
            </li>
            <li>
              <button type="button" onClick={() => navigate({ name: 'atelier' })} className="hover:text-white">
                3D Product Atelier
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => navigate({ name: 'ai-studio', tab: 'skin' })}
                className="hover:text-white"
              >
                AI Skin &amp; Hair Studio
              </button>
            </li>
            <li>
              <button type="button" onClick={() => navigate({ name: 'quiz' })} className="hover:text-white">
                Skin Type Quiz
              </button>
            </li>
            <li>
              <button type="button" onClick={() => navigate({ name: 'ingredients' })} className="hover:text-white">
                Ingredient Library
              </button>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-semibold tracking-wider text-[#C5A059] uppercase mb-3">Brand &amp; Care</h3>
          <ul className="space-y-2 text-sm text-[#FAF6EE]/80">
            <li>
              <button
                type="button"
                onClick={() => navigate({ name: 'policy', section: 'about' })}
                className="hover:text-white"
              >
                About Aurelia Botanica
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => navigate({ name: 'policy', section: 'blog' })}
                className="hover:text-white"
              >
                Beauty Journal &amp; Guides
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => navigate({ name: 'policy', section: 'contact' })}
                className="hover:text-white"
              >
                Contact &amp; Support
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => navigate({ name: 'policy', section: 'shipping' })}
                className="hover:text-white"
              >
                Pakistan Shipping Policy
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => navigate({ name: 'policy', section: 'returns' })}
                className="hover:text-white"
              >
                Returns &amp; Exchanges
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => navigate({ name: 'policy', section: 'faq' })}
                className="hover:text-white"
              >
                Frequently Asked Questions
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => navigate({ name: 'account' })}
                className="hover:text-white"
              >
                Track Order / Account
              </button>
            </li>
          </ul>
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-semibold tracking-wider text-[#C5A059] uppercase">Concierge &amp; Legal</h3>
          <p className="text-xs text-[#FAF6EE]/75 leading-relaxed">
            Cosmetic skincare and haircare formulas are designed for daily topical wellness and do not replace licensed dermatological diagnosis.
          </p>
          {storeConfig.whatsappEnabled !== false && (
            <a
              href={waDirect}
              target="_blank"
              rel="noopener noreferrer"
              onClick={logWaReferral}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#4A5D3F] hover:bg-[#3A4A31] text-white text-xs font-medium transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Chat on WhatsApp</span>
            </a>
          )}
          <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-[#FAF6EE]/60">
            <button
              type="button"
              onClick={() => navigate({ name: 'policy', section: 'privacy' })}
              className="hover:text-white"
            >
              Privacy Policy
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => navigate({ name: 'policy', section: 'terms' })}
              className="hover:text-white"
            >
              Terms
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => navigate({ name: 'admin' })}
              className="hover:text-white"
            >
              Admin Portal
            </button>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#FAF6EE]/60">
          <span>© {new Date().getFullYear()} {storeConfig.brandName} Pakistan. All rights reserved.</span>
          <span>Cash on Delivery · Nationwide Courier · Authentic Batch Formulations</span>
        </div>
      </div>
    </footer>
  );
}
