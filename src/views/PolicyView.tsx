import { useState } from 'react';
import { CheckCircle2, Mail, MapPin, Phone, Send } from 'lucide-react';
import { BEAUTY_TIPS } from '../data/catalog';
import { useStore } from '../context/StoreContext';
import { SafeImage } from '../components/common/SafeImage';
import { createSupportTicketLocal } from '../db/localDatabase';

interface PolicyViewProps {
  section: 'shipping' | 'returns' | 'privacy' | 'terms' | 'faq' | 'about' | 'contact' | 'blog';
}

export function PolicyView({ section }: PolicyViewProps) {
  const { navigate, storeConfig, cmsContent, customer, showToast } = useStore();
  const [supportName, setSupportName] = useState(customer?.name || '');
  const [supportEmail, setSupportEmail] = useState(customer?.email || '');
  const [supportPhone, setSupportPhone] = useState(customer?.phone || '');
  const [supportSubject, setSupportSubject] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [submittingTicket, setSubmittingTicket] = useState(false);
  const [submittedTicketNo, setSubmittedTicketNo] = useState<string | null>(null);

  const tabs: { id: PolicyViewProps['section']; label: string }[] = [
    { id: 'about', label: 'About Us' },
    { id: 'blog', label: 'Beauty Journal' },
    { id: 'contact', label: 'Contact & Support' },
    { id: 'shipping', label: 'Pakistan Shipping' },
    { id: 'returns', label: 'Returns & Exchanges' },
    { id: 'faq', label: 'FAQs' },
    { id: 'privacy', label: 'Privacy Policy' },
    { id: 'terms', label: 'Terms' },
  ];

  const handleSubmitSupport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportName.trim() || !supportSubject.trim() || !supportMessage.trim()) {
      showToast('Please enter your name, subject, and message.');
      return;
    }
    setSubmittingTicket(true);
    try {
      const ticket = await createSupportTicketLocal({
        customerName: supportName.trim(),
        customerEmail: supportEmail.trim() || undefined,
        customerPhone: supportPhone.trim() || undefined,
        subject: supportSubject.trim(),
        message: supportMessage.trim(),
      });
      setSubmittedTicketNo(ticket.ticketNumber);
      setSupportSubject('');
      setSupportMessage('');
      showToast(`Support ticket ${ticket.ticketNumber} submitted.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to send inquiry.');
    } finally {
      setSubmittingTicket(false);
    }
  };

  const blogArticles = cmsContent?.blogArticles?.length ? cmsContent.blogArticles : BEAUTY_TIPS;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-8">
      <div className="flex flex-wrap gap-2 border-b border-[#232620]/10 pb-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => navigate({ name: 'policy', section: t.id })}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
              section === t.id ? 'bg-[#4A5D3F] text-[#FDFBF7]' : 'bg-[#F1EAE0] text-[#232620] hover:bg-[#E7DDD0]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <article className="p-6 sm:p-8 rounded-2xl bg-[#FDFBF7] border border-[#232620]/10 space-y-5 text-sm text-[#232620] leading-relaxed">
        {section === 'about' && (
          <>
            <p className="text-xs font-medium text-[#4A5D3F] uppercase tracking-wider">Our Botanical Studio</p>
            <h1 className="font-display text-3xl sm:text-4xl font-semibold">
              {cmsContent?.aboutHeading || 'Crafted in Small Batches for Pakistani Skin & Hair'}
            </h1>
            <p className="text-[#5C6156] whitespace-pre-line">
              {cmsContent?.aboutStory ||
                'Aurelia Botanica unites cold-pressed botanical extracts with dermatologist-trusted cosmetic actives—calibrated specifically for Pakistan heat, UV index, and seasonal humidity.'}
            </p>
          </>
        )}

        {section === 'blog' && (
          <>
            <p className="text-xs font-medium text-[#4A5D3F] uppercase tracking-wider">Aurelia Journal</p>
            <h1 className="font-display text-3xl sm:text-4xl font-semibold">Botanical Care &amp; Layering Guides</h1>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
              {blogArticles.map((article) => (
                <div
                  key={article.id}
                  className="rounded-xl border border-[#232620]/10 bg-[#FAF6EE] overflow-hidden flex flex-col"
                >
                  <div className="aspect-[16/10] bg-[#F1EAE0]">
                    <SafeImage src={article.image} alt={article.title} className="w-full h-full object-cover" />
                  </div>
                  <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                    <div>
                      <p className="text-[11px] text-[#4A5D3F] font-medium">
                        {article.category} · {article.readTime}
                      </p>
                      <h2 className="font-display text-xl font-semibold text-[#232620] mt-1">{article.title}</h2>
                      <p className="text-xs text-[#5C6156] mt-1.5">{article.summary}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate({ name: 'product', slug: article.relatedSlug })}
                      className="text-xs font-semibold text-[#4A5D3F] hover:underline text-left"
                    >
                      View Recommended Formula →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {section === 'contact' && (
          <div className="space-y-6">
            <div>
              <p className="text-xs font-medium text-[#4A5D3F] uppercase tracking-wider">Concierge Desk</p>
              <h1 className="font-display text-3xl sm:text-4xl font-semibold mt-1">
                {cmsContent?.contactHeading || 'Speak With Our Beauty & Order Team'}
              </h1>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-[#FAF6EE] border border-[#232620]/10 space-y-1">
                <MapPin className="w-4 h-4 text-[#4A5D3F]" />
                <p className="font-semibold text-[#232620]">Studio Dispatch</p>
                <p className="text-[#5C6156]">{cmsContent?.contactAddress || 'Gulberg III, Lahore, Pakistan'}</p>
              </div>
              <div className="p-4 rounded-xl bg-[#FAF6EE] border border-[#232620]/10 space-y-1">
                <Phone className="w-4 h-4 text-[#4A5D3F]" />
                <p className="font-semibold text-[#232620]">Phone &amp; WhatsApp</p>
                <p className="text-[#5C6156]">{cmsContent?.contactPhone || '+92 300 1234567'}</p>
                <p className="text-[11px] text-[#5C6156]">{cmsContent?.contactHours || 'Mon–Sat · 10:00 AM – 8:00 PM'}</p>
              </div>
              <div className="p-4 rounded-xl bg-[#FAF6EE] border border-[#232620]/10 space-y-1">
                <Mail className="w-4 h-4 text-[#4A5D3F]" />
                <p className="font-semibold text-[#232620]">Email Care</p>
                <p className="text-[#5C6156]">{cmsContent?.contactEmail || storeConfig.contactEmail || 'care@aureliabotanica.pk'}</p>
              </div>
            </div>

            {submittedTicketNo ? (
              <div className="p-5 rounded-xl bg-[#4A5D3F]/10 border border-[#4A5D3F]/30 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-[#4A5D3F] shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <p className="font-semibold text-[#232620]">
                    Inquiry received — Ticket #{submittedTicketNo}
                  </p>
                  <p className="text-[#5C6156]">
                    Our customer care team has logged your request in our live support inbox and will follow up promptly.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSubmittedTicketNo(null)}
                    className="text-[#4A5D3F] font-semibold hover:underline pt-1"
                  >
                    Send another message
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmitSupport} className="space-y-4 pt-2 border-t border-[#232620]/10">
                <h2 className="font-display text-2xl font-semibold text-[#232620]">Submit a Support Inquiry</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#232620] mb-1">Full Name *</label>
                    <input
                      type="text"
                      required
                      value={supportName}
                      onChange={(e) => setSupportName(e.target.value)}
                      placeholder="Ayesha Khan"
                      className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#232620] mb-1">Email</label>
                    <input
                      type="email"
                      value={supportEmail}
                      onChange={(e) => setSupportEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#232620] mb-1">Phone / WhatsApp</label>
                    <input
                      type="tel"
                      value={supportPhone}
                      onChange={(e) => setSupportPhone(e.target.value)}
                      placeholder="0300 1234567"
                      className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#232620] mb-1">Subject *</label>
                  <input
                    type="text"
                    required
                    value={supportSubject}
                    onChange={(e) => setSupportSubject(e.target.value)}
                    placeholder="Order inquiry, routine question, or damaged transit exchange"
                    className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#232620] mb-1">Message *</label>
                  <textarea
                    required
                    rows={4}
                    value={supportMessage}
                    onChange={(e) => setSupportMessage(e.target.value)}
                    placeholder="How can our care specialists help?"
                    className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-xs"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submittingTicket}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#4A5D3F] hover:bg-[#3A4A31] text-[#FDFBF7] text-xs font-semibold transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submittingTicket ? 'Submitting...' : 'Submit Support Request'}</span>
                </button>
              </form>
            )}
          </div>
        )}

        {section === 'shipping' && (
          <>
            <h1 className="font-display text-3xl font-semibold">Nationwide Pakistan Courier Delivery</h1>
            <p className="text-[#5C6156] whitespace-pre-line">
              {cmsContent?.shippingPolicyBody ||
                'Orders placed before 3:00 PM PKT dispatch the same business day from our temperature-controlled studio in Lahore.'}
            </p>
            <ul className="list-disc pl-5 space-y-2 text-[#5C6156]">
              <li>Major cities (Lahore, Karachi, Islamabad, Rawalpindi): 2–3 business days.</li>
              <li>Nationwide towns &amp; regional hubs: 3–5 business days.</li>
              <li>
                Standard Cash on Delivery fee: PKR {storeConfig.shippingFeePkr}. Complimentary delivery on orders{' '}
                PKR {storeConfig.freeShippingThresholdPkr.toLocaleString('en-PK')} and above.
              </li>
            </ul>
          </>
        )}

        {section === 'returns' && (
          <>
            <h1 className="font-display text-3xl font-semibold">
              {storeConfig.returnPolicyDays || 14}-Day Seal &amp; Transit Guarantee
            </h1>
            <p className="text-[#5C6156] whitespace-pre-line">
              {cmsContent?.returnPolicyBody ||
                'Because cosmetic formulas require strict hygiene integrity, unopened bottles with intact tamper seals may be exchanged or refunded within 14 days of delivery. If a glass vessel arrives damaged in courier transit, share a photograph via WhatsApp within 48 hours of receipt for an immediate complimentary replacement.'}
            </p>
          </>
        )}

        {section === 'faq' && (
          <>
            <h1 className="font-display text-3xl font-semibold">Frequently Asked Questions</h1>
            <div className="space-y-4">
              {(cmsContent?.faqs && cmsContent.faqs.length > 0
                ? cmsContent.faqs
                : [
                    {
                      id: '1',
                      question: 'Are Aurelia Botanica products suitable for sensitive skin?',
                      answer:
                        'All cleansers and ceramide moisturizers are formulated without harsh sulfates or added synthetic dyes. We recommend patch-testing active acids and essential-oil blends on your inner forearm before first facial or scalp use.',
                    },
                    {
                      id: '2',
                      question: 'How do I order via WhatsApp?',
                      answer:
                        'Click “Order via WhatsApp” on any product page or inside your shopping bag—your selected items, PKR totals, and address pre-fill automatically in a WhatsApp message.',
                    },
                    {
                      id: '3',
                      question: 'Do your formulas diagnose or treat medical skin conditions?',
                      answer:
                        'No. Our products and Skin Quiz provide general cosmetic skincare and haircare guidance and are not a substitute for professional dermatological care.',
                    },
                  ]
              ).map((faq) => (
                <div key={faq.id} className="p-4 rounded-xl bg-[#FAF6EE] border border-[#232620]/10">
                  <h2 className="font-semibold text-[#232620]">{faq.question}</h2>
                  <p className="text-[#5C6156] mt-1">{faq.answer}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {section === 'privacy' && (
          <>
            <h1 className="font-display text-3xl font-semibold">Privacy Policy</h1>
            <p className="text-[#5C6156] whitespace-pre-line">
              {cmsContent?.privacyPolicyBody ||
                'We collect only the customer details necessary to fulfill Cash on Delivery parcels, remember saved skin quiz routines, and confirm orders via WhatsApp when requested. We never sell customer phone numbers or addresses to third parties.'}
            </p>
          </>
        )}

        {section === 'terms' && (
          <>
            <h1 className="font-display text-3xl font-semibold">Terms &amp; Conditions</h1>
            <p className="text-[#5C6156] whitespace-pre-line">
              {cmsContent?.termsBody ||
                'All prices are listed in Pakistani Rupees (PKR). Promotional codes apply at checkout subject to order eligibility thresholds.'}
            </p>
          </>
        )}
      </article>
    </div>
  );
}
