import { MessageCircle } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { recordWhatsAppReferralLocal } from '../../db/localDatabase';

export function FloatingWhatsApp() {
  const { storeConfig, route, isAssistantOpen } = useStore();

  // Keep 3D Atelier and open AI Chat uncluttered, and respect admin WhatsApp toggle
  if (route.name === 'atelier' || isAssistantOpen || storeConfig.whatsappEnabled === false) return null;

  const message =
    storeConfig.whatsappSupportMessage ||
    'Hello Aurelia Botanica! I would like help placing an order or choosing products.';
  const url = `https://wa.me/${storeConfig.whatsappNumber}?text=${encodeURIComponent(message)}`;

  const handleTrackClick = () => {
    void recordWhatsAppReferralLocal(
      'floating_whatsapp',
      'Customer opened Floating WhatsApp Concierge',
    ).catch(() => {});
  };

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleTrackClick}
      aria-label="Order or chat with Aurelia Botanica on WhatsApp"
      className="hidden sm:inline-flex fixed bottom-4 left-4 z-30 items-center gap-2 px-4 py-2.5 rounded-full bg-[#FDFBF7] hover:bg-[#F1EAE0] text-[#232620] text-xs font-medium shadow-lg border border-[#232620]/15 transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4A5D3F]"
    >
      <MessageCircle className="w-4 h-4 text-[#4A5D3F] shrink-0" />
      <span className="whitespace-nowrap">WhatsApp Concierge</span>
    </a>
  );
}
