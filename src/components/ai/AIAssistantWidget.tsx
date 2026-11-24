import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  BookmarkCheck,
  Camera,
  Check,
  Loader2,
  Maximize2,
  MessageCircle,
  Mic,
  MicOff,
  Minimize2,
  RotateCcw,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Square,
  Star,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore, type CartActionCommand } from '../../context/StoreContext';
import type {
  AIAvatarState,
  AIChatMessage,
  AIImageAnalysisResult,
  AILanguagePref,
  AIRoutinePlan,
  AIWhatsAppDraft,
  Product,
} from '../../types/store';
import { formatPkr, getDiscountPercent, getEffectivePrice } from '../../utils/commerce';
import {
  mapHttpStatusToErrorMessage,
  normalizeApiErrorMessage,
  prepareUploadImageDataUrl,
  safeParseJsonResponse,
} from '../../utils/api';
import { SafeImage } from '../common/SafeImage';
import { BeautyAvatar3D } from './BeautyAvatar3D';
import { listAIAgentsLocal, recordAIEventLocal } from '../../db/localDatabase';

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

const WELCOME_MESSAGE: AIChatMessage = {
  id: 'welcome-msg',
  role: 'assistant',
  text: 'Welcome to Aurelia Private Consultation. I am your 24/7 Skincare & Haircare Specialist—ready in English, Urdu, or Roman Urdu to analyze skin concerns, build tailored AM/PM rituals, or recommend formulas from our botanical collection.',
  createdAt: new Date().toISOString(),
};

function trackAiEvent(eventType: 'rec_click' | 'ai_add_to_cart', productSlug: string) {
  void recordAIEventLocal({
    eventType,
    agentKey: 'shopping_assistant',
    productSlug,
  }).catch(() => {});
}

export function AIAssistantWidget() {
  const {
    route,
    products,
    storeConfig,
    cmsContent,
    orders,
    cart,
    customer,
    authToken,
    aiMemory,
    updateAiMemory,
    clearAiMemory,
    isAssistantOpen,
    setAssistantOpen,
    assistantQuickAction,
    addToCart,
    addMultipleToCart,
    applyCartActions,
    saveRoutine,
    navigate,
    showToast,
  } = useStore();

  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [language, setLanguage] = useState<AILanguagePref>('auto');
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(false);
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);

  const [messages, setMessages] = useState<AIChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [savedRoutineIds, setSavedRoutineIds] = useState<Record<string, boolean>>({});

  // Photo analyzer composer state inside chat
  const [photoPanelOpen, setPhotoPanelOpen] = useState(false);
  const [photoMode, setPhotoMode] = useState<'skin' | 'hair'>('skin');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoMimeType, setPhotoMimeType] = useState<string>('image/jpeg');
  const [photoConsent, setPhotoConsent] = useState(false);
  const [photoNotes, setPhotoNotes] = useState('');
  const [analyzingPhoto, setAnalyzingPhoto] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const photoAnalysisInFlightRef = useRef(false);
  const chatAbortRef = useRef<AbortController | null>(null);
  const photoAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }, [input, isAssistantOpen]);

  const avatarState: AIAvatarState = useMemo(() => {
    if (isListening) return 'listening';
    if (isStreaming || analyzingPhoto) return 'thinking';
    if (isSpeaking) return 'speaking';
    return 'idle';
  }, [isListening, isStreaming, analyzingPhoto, isSpeaking]);

  // Sidebar curated recommendations: latest AI-recommended products or top featured formulas
  const sidebarProducts = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const slugs = messages[i].recommendedSlugs;
      if (slugs && slugs.length > 0) {
        const matched = slugs
          .map((s) => products.find((p) => p.slug === s))
          .filter((p): p is Product => Boolean(p));
        if (matched.length > 0) return matched;
      }
    }
    return products.filter((p) => p.isBestSeller || p.isFeaturedHome).slice(0, 4);
  }, [messages, products]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, photoPanelOpen, isAssistantOpen]);

  useEffect(() => {
    return () => {
      chatAbortRef.current?.abort();
      photoAbortRef.current?.abort();
      recognitionRef.current?.stop();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  const speakText = useCallback(
    (text: string) => {
      if (!voiceOutputEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      const clean = text.replace(/[*_`#]/g, '').trim();
      if (!clean) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(clean.slice(0, 650));
      utterance.lang = language === 'urdu' ? 'ur-PK' : 'en-PK';
      utterance.rate = 1.02;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    },
    [voiceOutputEnabled, language],
  );

  const sendMessage = useCallback(
    async (textOverride?: string) => {
      const content = (textOverride ?? input).trim();
      if (!content || isStreaming) return;

      stopSpeaking();
      const userMsg: AIChatMessage = {
        id: `usr-${Date.now()}`,
        role: 'user',
        text: content,
        createdAt: new Date().toISOString(),
      };

      const assistantId = `ast-${Date.now() + 1}`;
      const assistantPlaceholder: AIChatMessage = {
        id: assistantId,
        role: 'assistant',
        text: '',
        createdAt: new Date().toISOString(),
      };

      const nextHistory = [...messages, userMsg];
      setMessages([...nextHistory, assistantPlaceholder]);
      if (!textOverride) setInput('');
      setIsStreaming(true);

      let accumulatedText = '';
      let hasRichPayload = false;
      let timedOut = false;

      chatAbortRef.current?.abort();
      const controller = new AbortController();
      chatAbortRef.current = controller;
      const timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 65_000);

      try {
        const agentConfigs = await listAIAgentsLocal().catch(() => []);
        void recordAIEventLocal({
          eventType: 'conversation',
          agentKey: 'beauty_expert',
          queryText: content,
        }).catch(() => {});

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream, application/json',
        };
        if (authToken) headers.Authorization = `Bearer ${authToken}`;

        const response = await fetch('/api/ai/chat', {
          method: 'POST',
          headers,
          signal: controller.signal,
          body: JSON.stringify({
            messages: nextHistory.map((m) => ({ role: m.role, text: m.text })),
            language,
            memory: aiMemory.consentGiven ? aiMemory : undefined,
            cart,
            catalogProducts: products,
            storeConfig,
            agentConfigs,
            cmsContent,
            orders,
          }),
        });

        const contentType = response.headers.get('content-type');

        if (!response.ok) {
          const rawErrBody = await response.text().catch(() => '');
          throw new Error(
            mapHttpStatusToErrorMessage(
              response.status,
              contentType,
              rawErrBody,
              'Could not reach AI Skincare Specialist.',
            ),
          );
        }

        if (contentType?.includes('text/html')) {
          throw new Error(
            'The AI chat endpoint returned an HTML page instead of a live AI stream. Please ensure the backend server handles /api/ai/chat in production.',
          );
        }

        if (contentType?.includes('application/json')) {
          const jsonPayload = await safeParseJsonResponse<{
            reply?: string;
            message?: string;
            recommendedSlugs?: string[];
            cartActions?: CartActionCommand[];
            routinePlan?: AIRoutinePlan;
            whatsappDraft?: AIWhatsAppDraft;
          }>(response, 'AI Skincare Specialist returned an invalid response.');

          const replyText = (jsonPayload.reply || jsonPayload.message || '').trim();
          if (jsonPayload.cartActions && jsonPayload.cartActions.length > 0) {
            applyCartActions(jsonPayload.cartActions);
            for (const ca of jsonPayload.cartActions) {
              if (ca.type === 'add') {
                void recordAIEventLocal({
                  eventType: 'ai_add_to_cart',
                  agentKey: 'shopping_assistant',
                  productSlug: ca.slug,
                }).catch(() => {});
              }
            }
          }
          if (jsonPayload.recommendedSlugs?.length) {
            for (const slug of jsonPayload.recommendedSlugs.slice(0, 6)) {
              void recordAIEventLocal({
                eventType: 'recommendation',
                agentKey: 'recommendation_agent',
                productSlug: slug,
              }).catch(() => {});
            }
          }
          if (jsonPayload.routinePlan) {
            void recordAIEventLocal({
              eventType: 'routine_build',
              agentKey: 'routine_builder',
            }).catch(() => {});
          }
          if (!replyText && !jsonPayload.routinePlan && !jsonPayload.whatsappDraft && !jsonPayload.recommendedSlugs?.length) {
            throw new Error('The AI Skincare Specialist returned an empty response. Please try again.');
          }

          accumulatedText =
            replyText || 'Here are your personalized Aurelia Botanica recommendations:';
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    text: accumulatedText,
                    recommendedSlugs: jsonPayload.recommendedSlugs,
                    routinePlan: jsonPayload.routinePlan,
                    whatsappDraft: jsonPayload.whatsappDraft,
                  }
                : m,
            ),
          );
          speakText(accumulatedText);
          return;
        }

        if (!response.body) {
          throw new Error('The AI chat response stream was empty. Please try again.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const processBlock = (rawBlock: string) => {
          const trimmed = rawBlock.trim();
          if (!trimmed) return;
          const lines = trimmed.split(/\r?\n/);
          let eventType = 'message';
          const dataLines: string[] = [];

          for (const line of lines) {
            if (!line || line.startsWith(':')) continue;
            if (line.startsWith('event:')) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              dataLines.push(line.slice(5).trim());
            }
          }

          const dataLine = dataLines.join('\n').trim();
          if (!dataLine) return;

          if (/^\s*</i.test(dataLine)) {
            throw new Error(
              'The AI chat stream received an unexpected HTML payload instead of SSE events.',
            );
          }

          let payload: {
            text?: string;
            message?: string;
            recommendedSlugs?: string[];
            cartActions?: CartActionCommand[];
            routinePlan?: AIRoutinePlan;
            whatsappDraft?: AIWhatsAppDraft;
          };
          try {
            payload = JSON.parse(dataLine);
          } catch {
            return;
          }

          if (eventType === 'error') {
            throw new Error(
              normalizeApiErrorMessage(payload.message, 'AI Skincare Specialist encountered an error.'),
            );
          }

          if (eventType === 'meta') {
            if (payload.cartActions && payload.cartActions.length > 0) {
              applyCartActions(payload.cartActions);
              for (const ca of payload.cartActions) {
                if (ca.type === 'add') {
                  void recordAIEventLocal({
                    eventType: 'ai_add_to_cart',
                    agentKey: 'shopping_assistant',
                    productSlug: ca.slug,
                  }).catch(() => {});
                }
              }
            }
            if (payload.recommendedSlugs?.length) {
              for (const slug of payload.recommendedSlugs.slice(0, 6)) {
                void recordAIEventLocal({
                  eventType: 'recommendation',
                  agentKey: 'recommendation_agent',
                  productSlug: slug,
                }).catch(() => {});
              }
            }
            if (payload.routinePlan) {
              void recordAIEventLocal({
                eventType: 'routine_build',
                agentKey: 'routine_builder',
              }).catch(() => {});
            }
            if (payload.recommendedSlugs?.length || payload.routinePlan || payload.whatsappDraft) {
              hasRichPayload = true;
            }
            if (aiMemory.consentGiven && payload.recommendedSlugs && payload.recommendedSlugs.length > 0) {
              updateAiMemory({ lastRecommendedSlugs: payload.recommendedSlugs.slice(0, 6) });
            }
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      recommendedSlugs: payload.recommendedSlugs,
                      routinePlan: payload.routinePlan,
                      whatsappDraft: payload.whatsappDraft,
                    }
                  : m,
              ),
            );
          }

          if (eventType === 'delta' && payload.text) {
            accumulatedText += payload.text;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, text: accumulatedText } : m)),
            );
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            buffer += decoder.decode();
            if (buffer.trim()) {
              processBlock(buffer);
            }
            break;
          }
          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split(/\r?\n\r?\n/);
          buffer = events.pop() || '';

          for (const rawBlock of events) {
            processBlock(rawBlock);
          }
        }

        if (!accumulatedText.trim() && !hasRichPayload) {
          throw new Error('The AI Skincare Specialist returned an empty response. Please try again.');
        }

        if (accumulatedText) {
          speakText(accumulatedText);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError' && !timedOut) {
          return;
        }
        const msg = timedOut
          ? 'The AI Skincare Specialist took too long to respond. Please try again.'
          : err instanceof Error
          ? err.message
          : 'Unable to connect to AI Skincare Specialist.';
        void recordAIEventLocal({
          eventType: 'error',
          agentKey: 'beauty_expert',
          errorMessage: msg,
        }).catch(() => {});
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  text: `Notice: ${msg}`,
                }
              : m,
          ),
        );
      } finally {
        window.clearTimeout(timeoutId);
        if (chatAbortRef.current === controller) {
          chatAbortRef.current = null;
        }
        setIsStreaming(false);
      }
    },
    [
      input,
      isStreaming,
      stopSpeaking,
      messages,
      authToken,
      language,
      aiMemory,
      cart,
      products,
      storeConfig,
      cmsContent,
      orders,
      applyCartActions,
      updateAiMemory,
      speakText,
    ],
  );

  // React to external quick actions
  useEffect(() => {
    if (!assistantQuickAction) return;
    setIsMinimized(false);
    if (assistantQuickAction.mode === 'skin' || assistantQuickAction.mode === 'hair') {
      setPhotoMode(assistantQuickAction.mode);
      setPhotoPanelOpen(true);
    } else if (assistantQuickAction.prompt) {
      sendMessage(assistantQuickAction.prompt);
    }
  }, [assistantQuickAction]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleVoiceInput = () => {
    const Win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Rec = Win.SpeechRecognition || Win.webkitSpeechRecognition;
    if (!Rec) {
      showToast('Voice microphone input is not supported in this browser.');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    stopSpeaking();
    const rec = new Rec();
    rec.lang = language === 'urdu' ? 'ur-PK' : 'en-PK';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (ev) => {
      const transcript = ev.results?.[0]?.[0]?.transcript || '';
      if (transcript.trim()) {
        setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      }
    };
    rec.onerror = () => {
      setIsListening(false);
      showToast('Could not capture voice audio. Check microphone permissions.');
    };
    rec.onend = () => {
      setIsListening(false);
    };
    recognitionRef.current = rec;
    setIsListening(true);
    rec.start();
  };

  const handlePhotoFileSelected = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please select a JPEG, PNG, or WebP image.');
      return;
    }
    try {
      const { dataUrl, mimeType } = await prepareUploadImageDataUrl(file);
      setPhotoPreview(dataUrl);
      setPhotoMimeType(mimeType);
      setPhotoPanelOpen(true);
    } catch {
      showToast('Could not read the selected image.');
    }
  };

  const clearSelectedPhoto = () => {
    setPhotoPreview(null);
    setPhotoConsent(false);
    setPhotoNotes('');
    if (uploadInputRef.current) uploadInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const handleRunPhotoAnalysis = async () => {
    if (!photoPreview || !photoConsent || analyzingPhoto || photoAnalysisInFlightRef.current) return;
    photoAnalysisInFlightRef.current = true;
    setAnalyzingPhoto(true);
    const userMsgId = `usr-photo-${Date.now()}`;
    const astMsgId = `ast-photo-${Date.now() + 1}`;
    const previewSnapshot = photoPreview;
    const modeLabel = photoMode === 'skin' ? 'Facial Skin Analysis' : 'Hair & Scalp Analysis';

    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        role: 'user',
        text: `Requested ${modeLabel}${photoNotes.trim() ? `: ${photoNotes.trim()}` : ''}`,
        imagePreviewUrl: previewSnapshot,
        createdAt: new Date().toISOString(),
      },
      {
        id: astMsgId,
        role: 'assistant',
        text: 'Reviewing your uploaded photograph for visible cosmetic traits…',
        createdAt: new Date().toISOString(),
      },
    ]);

    photoAbortRef.current?.abort();
    const controller = new AbortController();
    photoAbortRef.current = controller;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 60_000);

    try {
      const agents = await listAIAgentsLocal().catch(() => []);
      const agentConfig = agents.find((a) => a.agentKey === 'image_analyzer');
      const endpoint = photoMode === 'skin' ? '/api/skin-analysis' : '/api/ai/analyze-image';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          mode: photoMode,
          imageBase64: previewSnapshot,
          mimeType: photoMimeType,
          consentGiven: true,
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

      const summaryText = `Here is your cosmetic ${photoMode === 'skin' ? 'Skin' : 'Hair & Scalp'} assessment based on visible characteristics:`;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === astMsgId
            ? {
                ...m,
                text: summaryText,
                analysisResult: data.analysis,
                recommendedSlugs: data.analysis?.recommendedProductSlugs,
              }
            : m,
        ),
      );
      setPhotoPanelOpen(false);
      clearSelectedPhoto();
      speakText(`${summaryText} ${data.analysis.visibleObservations.join('. ')}`);
    } catch (err) {
      const errMsg = timedOut
        ? 'Photo analysis timed out. Please try again with a smaller or clearer image.'
        : err instanceof Error
        ? err.message
        : 'Unable to analyze photo right now.';
      void recordAIEventLocal({
        eventType: 'error',
        agentKey: 'image_analyzer',
        errorMessage: errMsg,
      }).catch(() => {});
      setMessages((prev) =>
        prev.map((m) =>
          m.id === astMsgId
            ? {
                ...m,
                text: `Photo Analysis Error: ${errMsg}`,
              }
            : m,
        ),
      );
    } finally {
      window.clearTimeout(timeoutId);
      if (photoAbortRef.current === controller) {
        photoAbortRef.current = null;
      }
      photoAnalysisInFlightRef.current = false;
      setAnalyzingPhoto(false);
    }
  };

  const handleSaveAiRoutine = async (msgId: string, plan: AIRoutinePlan) => {
    await saveRoutine({
      id: `ai-rtn-${Date.now()}`,
      title: plan.title,
      skinType: aiMemory.skinType || 'Personalized AI Profile',
      concerns: aiMemory.concerns,
      morningSlugs: plan.morningSkincare.map((s) => s.productSlug),
      nightSlugs: plan.nightSkincare.map((s) => s.productSlug),
      haircareSlugs: plan.weeklyHaircare.map((s) => s.productSlug),
      createdAt: new Date().toISOString(),
    });
    setSavedRoutineIds((prev) => ({ ...prev, [msgId]: true }));
  };

  const handleAddRoutineToCart = (plan: AIRoutinePlan) => {
    const slugs = Array.from(
      new Set([
        ...plan.morningSkincare.map((s) => s.productSlug),
        ...plan.nightSkincare.map((s) => s.productSlug),
        ...plan.weeklyHaircare.map((s) => s.productSlug),
      ]),
    );
    const items = slugs
      .map((slug) => products.find((p) => p.slug === slug))
      .filter((p): p is Product => Boolean(p));
    if (items.length > 0) addMultipleToCart(items, true);
  };

  const renderLuxuryProductCard = (product: Product) => {
    const effective = getEffectivePrice(product.pricePkr, product.discountPricePkr);
    const discount = getDiscountPercent(product.pricePkr, product.discountPricePkr) ?? 0;

    return (
      <motion.div
        key={product.id}
        whileHover={{ y: -2 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-full min-w-0 box-border rounded-xl bg-[#FFFFFF] border border-[#D6BD9B]/45 overflow-hidden flex flex-col justify-between shadow-xs hover:shadow-md transition-shadow"
      >
        <button
          type="button"
          onClick={() => {
            trackAiEvent('rec_click', product.slug);
            navigate({ name: 'product', slug: product.slug });
          }}
          className="text-left group block w-full"
        >
          <div className="relative aspect-[4/3] bg-[#F1E9DF] overflow-hidden">
            <SafeImage
              src={product.images[0]}
              alt={product.name}
              fallbackTitle={product.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            {discount > 0 && (
              <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-[#40332E] text-[#FFFFFF] text-[10px] font-medium tracking-wide tabular-nums">
                Save {discount}%
              </span>
            )}
          </div>

          <div className="p-3 space-y-1.5">
            <p className="text-[11px] text-[#40332E]/65 truncate">
              {product.category} <span aria-hidden="true">·</span> {product.volume}
            </p>
            <h4 className="text-xs font-semibold text-[#40332E] line-clamp-2 leading-snug group-hover:text-[#7D5852] transition-colors">
              {product.name}
            </h4>

            <p className="text-[11px] text-[#40332E]/75 line-clamp-1">
              For {product.suitableTypes.slice(0, 2).join(', ')}
            </p>

            {product.keyIngredients.length > 0 && (
              <p className="text-[10px] text-[#40332E]/60 truncate">
                Actives: {product.keyIngredients.slice(0, 2).join(' · ')}
              </p>
            )}

            <div className="flex items-baseline gap-1.5 pt-1">
              <span className="font-mono text-xs font-semibold text-[#40332E] tabular-nums">
                {formatPkr(effective)}
              </span>
              {discount > 0 && (
                <span className="font-mono text-[10px] text-[#40332E]/50 line-through tabular-nums">
                  {formatPkr(product.pricePkr)}
                </span>
              )}
            </div>
          </div>
        </button>

        <div className="px-3 pb-3 pt-1 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => {
              trackAiEvent('rec_click', product.slug);
              navigate({ name: 'product', slug: product.slug });
            }}
            className="py-2 px-2 rounded-lg border border-[#D6BD9B]/60 hover:bg-[#F1E9DF] text-[#40332E] text-[11px] font-medium inline-flex items-center justify-center gap-1 transition-colors"
          >
            <span>Details</span>
            <ArrowUpRight className="w-3 h-3" />
          </button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() => {
              trackAiEvent('ai_add_to_cart', product.slug);
              addToCart(product, 1, false);
            }}
            disabled={product.stock <= 0}
            className="py-2 px-2 rounded-lg bg-[#40332E] hover:bg-[#2F2521] disabled:opacity-45 text-[#FFFFFF] text-[11px] font-medium inline-flex items-center justify-center gap-1 transition-colors"
          >
            <ShoppingBag className="w-3 h-3" />
            <span>{product.stock > 0 ? 'Add' : 'Sold Out'}</span>
          </motion.button>
        </div>
      </motion.div>
    );
  };

  // Keep 3D Atelier dock uncluttered
  if (route.name === 'atelier') return null;

  return (
    <>
      {/* Hidden file & camera inputs */}
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => handlePhotoFileSelected(e.target.files?.[0])}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="user"
        className="hidden"
        onChange={(e) => handlePhotoFileSelected(e.target.files?.[0])}
      />

      {/* Floating Luxury AI Assistant Launcher */}
      {!isAssistantOpen && (
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.97 }}
          transition={{ duration: 0.2 }}
          onClick={() => {
            setIsMinimized(false);
            setAssistantOpen(true);
          }}
          aria-label="Open Aurelia AI Skincare Consultant"
          className="fixed bottom-4 right-4 z-40 group flex items-center gap-3 pl-2 pr-4 py-2 rounded-2xl bg-[#FAF7F2]/95 backdrop-blur-md text-[#40332E] shadow-xl border border-[#D6BD9B]/80 hover:border-[#40332E]/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#40332E]"
        >
          <span className="relative flex items-center justify-center w-11 h-11 shrink-0">
            <motion.span
              aria-hidden="true"
              animate={{ scale: [1, 1.12, 1], opacity: [0.45, 0.8, 0.45] }}
              transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#D6BD9B]/60 via-[#D8AAA5]/50 to-[#FAF7F2]"
            />
            <span className="relative w-10 h-10 rounded-full overflow-hidden bg-[#F1E9DF] border border-[#D6BD9B] shadow-xs">
              <BeautyAvatar3D state="idle" variant="circular" />
            </span>
          </span>

          <span className="flex flex-col items-start text-left">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-[#40332E] whitespace-nowrap">
              <Sparkles className="w-3.5 h-3.5 text-[#D8AAA5]" />
              <span>AI Skin Consultant</span>
            </span>
            <span className="hidden sm:block text-[10px] text-[#40332E]/65 whitespace-nowrap">
              Routines · Photo Scan · Advice
            </span>
          </span>
        </motion.button>
      )}

      {/* Expandable Luxury Glassmorphic Chat Window */}
      <AnimatePresence>
        {isAssistantOpen && (
          <motion.section
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            aria-label="Aurelia AI Skincare Consultant Chat"
            className={`fixed z-50 flex flex-col box-border bg-[#FAF7F2]/96 backdrop-blur-xl border border-[#D6BD9B]/60 shadow-2xl overflow-hidden overflow-x-hidden ${
              isMinimized
                ? 'bottom-3 right-3 sm:bottom-4 sm:right-4 w-[calc(100vw-1.5rem)] max-w-[370px] rounded-xl'
                : isMaximized
                ? 'inset-2 sm:inset-6 max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-3rem)] rounded-xl'
                : 'inset-0 w-full max-w-full h-[100dvh] max-h-[100dvh] sm:inset-auto sm:bottom-4 sm:right-4 sm:w-[460px] lg:w-[490px] sm:h-[700px] sm:max-h-[calc(100dvh-2rem)] sm:rounded-xl'
            }`}
          >
            {/* Luxury Header with Breathing 3D Avatar */}
            <header className="w-full max-w-full min-w-0 bg-gradient-to-r from-[#40332E] via-[#4D3D37] to-[#3A2E2A] text-[#FAF7F2] px-3 sm:px-4 py-3 flex items-center justify-between gap-2 sm:gap-3 shrink-0 border-b border-[#D6BD9B]/35">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                <div className="relative w-10 h-10 sm:w-12 sm:h-12 shrink-0 flex items-center justify-center">
                  <motion.div
                    aria-hidden="true"
                    animate={{
                      scale: avatarState === 'idle' ? [1, 1.07, 1] : [1, 1.13, 1],
                      opacity: avatarState === 'idle' ? [0.4, 0.7, 0.4] : [0.6, 0.95, 0.6],
                    }}
                    transition={{ duration: avatarState === 'idle' ? 3.2 : 1.6, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#D6BD9B]/55 to-[#D8AAA5]/55 blur-[1px]"
                  />
                  <div className="relative w-9 h-9 sm:w-11 sm:h-11 rounded-full overflow-hidden bg-[#F1E9DF] border border-[#D6BD9B] shadow-sm">
                    <BeautyAvatar3D state={avatarState} variant="circular" />
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-base sm:text-xl font-semibold leading-tight text-[#FFFFFF] truncate">
                    Aurelia Skin Specialist
                  </h2>
                  <p className="text-[10.5px] sm:text-[11px] text-[#D6BD9B] truncate">
                    {avatarState === 'listening'
                      ? 'Listening to your voice…'
                      : avatarState === 'thinking'
                      ? 'Preparing skincare consultation…'
                      : avatarState === 'speaking'
                      ? 'Speaking response…'
                      : 'Online · Personal Skincare & Haircare'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {isSpeaking && (
                  <button
                    type="button"
                    onClick={stopSpeaking}
                    title="Stop voice playback"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#D6BD9B] text-[#40332E] text-[11px] font-semibold"
                  >
                    <Square className="w-2.5 h-2.5 fill-current" />
                    Stop
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setVoiceOutputEnabled((v) => !v)}
                  title={voiceOutputEnabled ? 'Mute voice replies' : 'Enable voice replies'}
                  aria-label={voiceOutputEnabled ? 'Mute voice replies' : 'Enable voice replies'}
                  className={`p-2 rounded-lg transition-colors ${
                    voiceOutputEnabled ? 'bg-[#D6BD9B]/25 text-[#FFFFFF]' : 'text-[#FAF7F2]/75 hover:bg-white/10'
                  }`}
                >
                  {voiceOutputEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>

                <button
                  type="button"
                  onClick={() => setShowMemoryPanel((p) => !p)}
                  title="AI Memory & Privacy Preferences"
                  aria-label="AI Memory & Privacy Preferences"
                  className={`p-2 rounded-lg transition-colors ${
                    showMemoryPanel ? 'bg-[#D6BD9B]/25 text-[#FFFFFF]' : 'text-[#FAF7F2]/75 hover:bg-white/10'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsMinimized((m) => !m)}
                  aria-label={isMinimized ? 'Restore chat' : 'Minimize chat'}
                  className="p-2 rounded-lg text-[#FAF7F2]/75 hover:bg-white/10 transition-colors"
                >
                  <Minimize2 className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsMinimized(false);
                    setIsMaximized((m) => !m);
                  }}
                  aria-label={isMaximized ? 'Exit wide consultation view' : 'Expand wide consultation view'}
                  title={isMaximized ? 'Compact view' : 'Expand desktop consultation + product sidebar'}
                  className="hidden sm:inline-flex p-2 rounded-lg text-[#FAF7F2]/75 hover:bg-white/10 transition-colors"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    stopSpeaking();
                    setAssistantOpen(false);
                  }}
                  aria-label="Close AI Skin Specialist"
                  className="p-2 rounded-lg text-[#FAF7F2]/80 hover:bg-white/15 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </header>

            {!isMinimized && (
              <div className="flex-1 min-h-0 min-w-0 w-full max-w-full flex flex-col lg:flex-row overflow-hidden">
                {/* Main Consultation Column */}
                <div className="flex-1 min-w-0 min-h-0 w-full max-w-full flex flex-col">
                  {/* Language & Reset Strip */}
                  <div className="w-full max-w-full min-w-0 px-3 sm:px-4 py-2 bg-[#F1E9DF]/85 border-b border-[#D6BD9B]/35 flex flex-wrap items-center justify-between gap-2 text-[11px] shrink-0">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="text-[#40332E]/70 font-medium shrink-0">Language</span>
                      <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value as AILanguagePref)}
                        aria-label="Select AI conversation language"
                        className="min-w-0 max-w-[165px] sm:max-w-none bg-[#FFFFFF] border border-[#D6BD9B]/60 rounded-lg px-2 sm:px-2.5 py-1 text-[11px] font-medium text-[#40332E] focus:outline-2 focus:outline-[#40332E] truncate"
                      >
                        <option value="auto">Auto (EN / اردو / Roman)</option>
                        <option value="english">English</option>
                        <option value="roman_urdu">Roman Urdu</option>
                        <option value="urdu">اردو (Urdu)</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        chatAbortRef.current?.abort();
                        stopSpeaking();
                        setIsStreaming(false);
                        setMessages([WELCOME_MESSAGE]);
                      }}
                      className="inline-flex items-center gap-1 text-[#40332E]/75 hover:text-[#40332E] font-medium whitespace-nowrap shrink-0"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>New Session</span>
                    </button>
                  </div>

                  {/* Consent-Based AI Memory Drawer */}
                  <AnimatePresence>
                    {showMemoryPanel && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="px-4 py-3 bg-[#FFFFFF] border-b border-[#D6BD9B]/40 space-y-2.5 text-xs shrink-0 overflow-hidden"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[#40332E]">Skin Memory &amp; Privacy</span>
                          <button
                            type="button"
                            onClick={clearAiMemory}
                            className="text-[11px] text-rose-700 hover:underline font-medium"
                          >
                            Clear Saved Profile
                          </button>
                        </div>
                        <label className="flex items-start gap-2 cursor-pointer text-[11px] text-[#40332E]/75">
                          <input
                            type="checkbox"
                            checked={aiMemory.consentGiven}
                            onChange={(e) => updateAiMemory({ consentGiven: e.target.checked })}
                            className="mt-0.5 accent-[#40332E]"
                          />
                          <span>
                            Remember my skin type, hair texture, concerns, and PKR budget locally for tailored guidance.
                          </span>
                        </label>
                        {aiMemory.consentGiven && (
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <input
                              type="text"
                              value={aiMemory.skinType || ''}
                              onChange={(e) => updateAiMemory({ skinType: e.target.value })}
                              placeholder="Skin e.g. Combination"
                              className="px-2.5 py-1.5 rounded-lg bg-[#FAF7F2] border border-[#D6BD9B]/55 text-[11px] text-[#40332E]"
                            />
                            <input
                              type="text"
                              value={aiMemory.hairType || ''}
                              onChange={(e) => updateAiMemory({ hairType: e.target.value })}
                              placeholder="Hair e.g. Frizzy Hair"
                              className="px-2.5 py-1.5 rounded-lg bg-[#FAF7F2] border border-[#D6BD9B]/55 text-[11px] text-[#40332E]"
                            />
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Conversation Feed */}
                  <div className="flex-1 min-h-0 min-w-0 w-full max-w-full overflow-y-auto overflow-x-hidden px-3 sm:px-5 py-4 sm:py-5 space-y-4 bg-[#FAF7F2]">
                    {messages.map((msg) => (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.18 }}
                        className={`w-full max-w-full min-w-0 flex flex-col gap-2.5 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                      >
                        {msg.role === 'assistant' && (
                          <span className="text-[10px] font-medium tracking-wide text-[#40332E]/55 px-1">
                            Aurelia Specialist
                          </span>
                        )}

                        <div
                          className={`max-w-[88%] sm:max-w-[84%] min-w-0 rounded-xl px-3.5 sm:px-4 py-2.5 sm:py-3 text-[13px] leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${
                            msg.role === 'user'
                              ? 'bg-[#40332E] text-[#FFFFFF] rounded-br-xs shadow-xs'
                              : 'bg-[#FFFFFF] text-[#40332E] border border-[#D6BD9B]/45 rounded-bl-xs shadow-xs'
                          }`}
                        >
                          {msg.imagePreviewUrl && (
                            <img
                              src={msg.imagePreviewUrl}
                              alt="Uploaded customer preview"
                              className="w-44 max-w-full h-32 object-cover rounded-lg mb-2.5 border border-white/25"
                            />
                          )}
                          {msg.text || (
                            <span className="inline-flex items-center gap-1.5 py-1" aria-label="Specialist is typing">
                              <motion.span
                                animate={{ opacity: [0.35, 1, 0.35], y: [0, -2, 0] }}
                                transition={{ duration: 0.8, repeat: Infinity }}
                                className="w-1.5 h-1.5 rounded-full bg-[#D8AAA5]"
                              />
                              <motion.span
                                animate={{ opacity: [0.35, 1, 0.35], y: [0, -2, 0] }}
                                transition={{ duration: 0.8, delay: 0.16, repeat: Infinity }}
                                className="w-1.5 h-1.5 rounded-full bg-[#D6BD9B]"
                              />
                              <motion.span
                                animate={{ opacity: [0.35, 1, 0.35], y: [0, -2, 0] }}
                                transition={{ duration: 0.8, delay: 0.32, repeat: Infinity }}
                                className="w-1.5 h-1.5 rounded-full bg-[#40332E]"
                              />
                            </span>
                          )}
                        </div>

                        {/* Structured Photo Analysis Result Card */}
                        {msg.analysisResult && (
                          <div className="w-full rounded-xl bg-[#FFFFFF] border border-[#D6BD9B]/60 p-4 space-y-3 text-xs shadow-xs">
                            <div className="flex items-center justify-between border-b border-[#F1E9DF] pb-2">
                              <span className="font-display text-lg font-semibold text-[#40332E]">
                                {msg.analysisResult.mode === 'skin'
                                  ? 'Facial Skin Assessment'
                                  : 'Hair & Scalp Assessment'}
                              </span>
                              <span className="text-[11px] text-[#40332E]/60">Cosmetic Guidance</span>
                            </div>
                            <div>
                              <p className="font-semibold text-[#40332E] mb-1">Visible Observations</p>
                              <ul className="list-disc pl-4 space-y-1 text-[#40332E]/80">
                                {msg.analysisResult.visibleObservations.map((obs, idx) => (
                                  <li key={idx}>{obs}</li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <p className="font-semibold text-[#40332E] mb-1">Suggested Botanicals</p>
                              <p className="text-[#40332E]/85">
                                {msg.analysisResult.suggestedIngredients.join(' · ')}
                              </p>
                            </div>
                            <p className="text-[11px] text-[#40332E]/75 bg-[#F1E9DF] rounded-lg p-2.5 leading-relaxed">
                              {msg.analysisResult.cautionNotice}
                            </p>
                          </div>
                        )}

                        {/* In-Chat Product Recommendation Cards (responsive grid within parent container, zero horizontal overflow) */}
                        {msg.recommendedSlugs && msg.recommendedSlugs.length > 0 && (
                          <div className={`w-full max-w-full min-w-0 grid grid-cols-1 min-[440px]:grid-cols-2 gap-2.5 ${isMaximized ? 'lg:hidden' : ''}`}>
                            {msg.recommendedSlugs
                              .map((slug) => products.find((p) => p.slug === slug))
                              .filter((p): p is Product => Boolean(p))
                              .map((product) => renderLuxuryProductCard(product))}
                          </div>
                        )}

                        {/* Personalized AI Routine Card inside Chat */}
                        {msg.routinePlan && (
                          <div className="w-full rounded-xl bg-[#FFFFFF] border border-[#D6BD9B]/60 p-4 space-y-3 text-xs shadow-xs">
                            <div className="flex items-start justify-between gap-3 border-b border-[#F1E9DF] pb-3">
                              <div>
                                <p className="font-display text-xl font-semibold text-[#40332E]">
                                  {msg.routinePlan.title}
                                </p>
                                <p className="text-[11px] text-[#40332E]/70 mt-0.5">{msg.routinePlan.summary}</p>
                              </div>
                              <span className="font-mono text-xs font-semibold text-[#40332E] shrink-0 tabular-nums">
                                {formatPkr(msg.routinePlan.totalEstimatedPkr)}
                              </span>
                            </div>

                            {[
                              { label: 'Morning Skincare', steps: msg.routinePlan.morningSkincare },
                              { label: 'Night Skincare', steps: msg.routinePlan.nightSkincare },
                              { label: 'Weekly Haircare', steps: msg.routinePlan.weeklyHaircare },
                            ]
                              .filter((sec) => sec.steps.length > 0)
                              .map((sec) => (
                                <div key={sec.label} className="space-y-1.5">
                                  <p className="text-[11px] font-semibold text-[#40332E]">{sec.label}</p>
                                  <div className="space-y-1.5">
                                    {sec.steps.map((step) => {
                                      const prod = products.find((p) => p.slug === step.productSlug);
                                      return (
                                        <div
                                          key={`${sec.label}-${step.stepNumber}`}
                                          className="flex items-center gap-2.5 p-2 rounded-lg bg-[#FAF7F2] border border-[#D6BD9B]/35"
                                        >
                                          {prod && (
                                            <SafeImage
                                              src={prod.images[0]}
                                              alt={prod.name}
                                              className="w-10 h-10 rounded-md object-cover bg-[#F1E9DF] shrink-0"
                                            />
                                          )}
                                          <div className="min-w-0 flex-1">
                                            <p className="font-medium text-[#40332E] truncate">
                                              0{step.stepNumber}. {prod?.name || step.productSlug}
                                            </p>
                                            <p className="text-[10px] text-[#40332E]/65 truncate">
                                              {step.stepRole} <span aria-hidden="true">·</span> {step.frequency}
                                            </p>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}

                            <p className="text-[11px] text-[#40332E]/75 bg-[#F1E9DF] rounded-lg p-2.5">
                              {msg.routinePlan.safetyNote}
                            </p>

                            <div className="grid grid-cols-2 gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => msg.routinePlan && handleSaveAiRoutine(msg.id, msg.routinePlan)}
                                className="py-2 px-3 rounded-lg border border-[#D6BD9B] text-[#40332E] hover:bg-[#F1E9DF] text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                              >
                                {savedRoutineIds[msg.id] ? (
                                  <>
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Saved</span>
                                  </>
                                ) : (
                                  <>
                                    <BookmarkCheck className="w-3.5 h-3.5" />
                                    <span>Save Routine</span>
                                  </>
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => msg.routinePlan && handleAddRoutineToCart(msg.routinePlan)}
                                className="py-2 px-3 rounded-lg bg-[#40332E] hover:bg-[#2F2521] text-[#FFFFFF] text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                              >
                                <ShoppingBag className="w-3.5 h-3.5" />
                                <span>Add All to Cart</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* WhatsApp Order Confirmation Preview Card */}
                        {msg.whatsappDraft && (
                          <div className="w-full max-w-full min-w-0 rounded-xl bg-[#FFFFFF] border border-[#D6BD9B]/60 p-4 space-y-2.5 text-xs shadow-xs">
                            <p className="font-semibold text-[#40332E]">
                              WhatsApp Concierge Summary (Confirmation Required)
                            </p>
                            <pre className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-sans text-[11px] text-[#40332E]/80 bg-[#F1E9DF] p-3 rounded-lg">
                              {msg.whatsappDraft.summaryText}
                            </pre>
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                              <span className="font-mono font-semibold text-[#40332E] tabular-nums">
                                Total: {formatPkr(msg.whatsappDraft.totalPkr)}
                              </span>
                              <a
                                href={msg.whatsappDraft.whatsappUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#40332E] hover:bg-[#2F2521] text-[#FFFFFF] text-[11px] font-medium transition-colors"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                <span>Open WhatsApp</span>
                              </a>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Inline Photo Analyzer Drawer */}
                  <AnimatePresence>
                    {photoPanelOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="px-4 py-3 bg-[#F1E9DF] border-t border-[#D6BD9B]/45 space-y-2.5 shrink-0"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                            <button
                              type="button"
                              onClick={() => setPhotoMode('skin')}
                              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                                photoMode === 'skin'
                                  ? 'bg-[#40332E] text-[#FFFFFF]'
                                  : 'bg-[#FFFFFF] text-[#40332E]/75 hover:text-[#40332E]'
                              }`}
                            >
                              AI Skin Analyzer
                            </button>
                            <button
                              type="button"
                              onClick={() => setPhotoMode('hair')}
                              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                                photoMode === 'hair'
                                  ? 'bg-[#40332E] text-[#FFFFFF]'
                                  : 'bg-[#FFFFFF] text-[#40332E]/75 hover:text-[#40332E]'
                              }`}
                            >
                              AI Hair Analyzer
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              clearSelectedPhoto();
                              setPhotoPanelOpen(false);
                            }}
                            aria-label="Close photo analyzer panel"
                            className="p-1 text-[#40332E]/70 hover:text-[#40332E]"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {!photoPreview ? (
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => uploadInputRef.current?.click()}
                              className="py-2.5 px-3 rounded-lg bg-[#FFFFFF] border border-dashed border-[#D6BD9B] text-[#40332E] text-xs font-medium inline-flex items-center justify-center gap-1.5 hover:bg-[#FAF7F2]"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              <span>Upload Photo</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => cameraInputRef.current?.click()}
                              className="py-2.5 px-3 rounded-lg bg-[#FFFFFF] border border-dashed border-[#D6BD9B] text-[#40332E] text-xs font-medium inline-flex items-center justify-center gap-1.5 hover:bg-[#FAF7F2]"
                            >
                              <Camera className="w-3.5 h-3.5" />
                              <span>Take Photo</span>
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-start gap-3">
                              <img
                                src={photoPreview}
                                alt="Selected photo for analysis"
                                className="w-16 h-16 rounded-lg object-cover border border-[#D6BD9B] shrink-0"
                              />
                              <div className="flex-1 space-y-1.5">
                                <input
                                  type="text"
                                  value={photoNotes}
                                  onChange={(e) => setPhotoNotes(e.target.value)}
                                  placeholder={
                                    photoMode === 'skin'
                                      ? 'Optional note: e.g. T-zone shine or dullness'
                                      : 'Optional note: e.g. frizz, hair fall, dry scalp'
                                  }
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-[#FFFFFF] border border-[#D6BD9B]/55 text-[11px] text-[#40332E]"
                                />
                                <label className="flex items-start gap-1.5 text-[11px] text-[#40332E] cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={photoConsent}
                                    onChange={(e) => setPhotoConsent(e.target.checked)}
                                    className="mt-0.5 accent-[#40332E]"
                                  />
                                  <span>
                                    I consent to transient cosmetic analysis (photo is never stored).
                                  </span>
                                </label>
                              </div>
                              <button
                                type="button"
                                disabled={analyzingPhoto}
                                onClick={clearSelectedPhoto}
                                title="Delete uploaded photo"
                                aria-label="Delete uploaded photo"
                                className="p-1.5 rounded-lg text-rose-700 hover:bg-rose-50 disabled:opacity-45"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={handleRunPhotoAnalysis}
                              disabled={!photoConsent || analyzingPhoto}
                              aria-busy={analyzingPhoto}
                              className="w-full py-2.5 rounded-lg bg-[#40332E] hover:bg-[#2F2521] disabled:opacity-45 text-[#FFFFFF] text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors"
                            >
                              {analyzingPhoto ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                              <span>
                                {analyzingPhoto
                                  ? 'Analyzing Photograph…'
                                  : `Analyze ${photoMode === 'skin' ? 'Facial Skin' : 'Hair & Scalp'}`}
                              </span>
                            </button>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Quick Action Buttons (Responsive flex-wrap, zero forced horizontal scroll) */}
                  <div className="w-full max-w-full min-w-0 px-3 sm:px-4 pt-2.5 pb-2 bg-[#FAF7F2]/95 border-t border-[#D6BD9B]/35 flex flex-wrap items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => sendMessage('Show me your best-selling skincare and haircare formulas with prices.')}
                      className="h-8 px-2.5 sm:px-3 rounded-lg bg-[#FFFFFF] border border-[#D6BD9B]/60 hover:border-[#40332E] hover:bg-[#F1E9DF] text-[10.5px] sm:text-[11px] font-medium text-[#40332E] max-w-full truncate inline-flex items-center justify-center transition-colors"
                    >
                      Find Formulas
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAssistantOpen(false);
                        navigate({ name: 'quiz' });
                      }}
                      className="h-8 px-2.5 sm:px-3 rounded-lg bg-[#FFFFFF] border border-[#D6BD9B]/60 hover:border-[#40332E] hover:bg-[#F1E9DF] text-[10.5px] sm:text-[11px] font-medium text-[#40332E] max-w-full truncate inline-flex items-center justify-center transition-colors"
                    >
                      Skin Quiz
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPhotoMode('skin');
                        setPhotoPanelOpen(true);
                      }}
                      className="h-8 px-2.5 sm:px-3 rounded-lg bg-[#FFFFFF] border border-[#D6BD9B]/60 hover:border-[#40332E] hover:bg-[#F1E9DF] text-[10.5px] sm:text-[11px] font-medium text-[#40332E] max-w-full truncate inline-flex items-center justify-center transition-colors"
                    >
                      Skin Analysis
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPhotoMode('hair');
                        setPhotoPanelOpen(true);
                      }}
                      className="h-8 px-2.5 sm:px-3 rounded-lg bg-[#FFFFFF] border border-[#D6BD9B]/60 hover:border-[#40332E] hover:bg-[#F1E9DF] text-[10.5px] sm:text-[11px] font-medium text-[#40332E] max-w-full truncate inline-flex items-center justify-center transition-colors"
                    >
                      Hair Analysis
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        sendMessage(
                          'Build me a personalized Morning Skincare, Night Skincare, and Weekly Haircare routine with prices.',
                        )
                      }
                      className="h-8 px-2.5 sm:px-3 rounded-lg bg-[#FFFFFF] border border-[#D6BD9B]/60 hover:border-[#40332E] hover:bg-[#F1E9DF] text-[10.5px] sm:text-[11px] font-medium text-[#40332E] max-w-full truncate inline-flex items-center justify-center transition-colors"
                    >
                      Build Routine
                    </button>
                    <button
                      type="button"
                      onClick={() => sendMessage('Prepare a WhatsApp order summary for my current shopping bag.')}
                      className="h-8 px-2.5 sm:px-3 rounded-lg bg-[#FFFFFF] border border-[#D6BD9B]/60 hover:border-[#40332E] hover:bg-[#F1E9DF] text-[10.5px] sm:text-[11px] font-medium text-[#40332E] max-w-full truncate inline-flex items-center justify-center transition-colors"
                    >
                      WhatsApp Order
                    </button>
                  </div>

                  {/* Professional Luxury Chat Input Bar */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      sendMessage();
                    }}
                    className="w-full max-w-full min-w-0 px-3 sm:px-4 pb-3 pt-1.5 bg-[#FAF7F2] shrink-0 box-border"
                  >
                    <div className="w-full max-w-full min-w-0 box-border rounded-2xl bg-[#FFFFFF] border border-[#D6BD9B]/75 shadow-[0_4px_18px_-6px_rgba(64,51,46,0.12)] hover:border-[#40332E]/45 focus-within:border-[#40332E] focus-within:ring-2 focus-within:ring-[#D6BD9B]/45 transition-all">
                      <textarea
                        ref={textareaRef}
                        rows={1}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                          }
                        }}
                        placeholder={
                          customer
                            ? `Ask anything about skincare, ingredients, or your routine, ${customer.name.split(' ')[0]}...`
                            : 'Ask anything about skincare, ingredients, or your routine...'
                        }
                        aria-label="Message Aurelia AI Skincare Consultant"
                        className="w-full min-w-0 max-w-full block bg-transparent px-3.5 sm:px-4 pt-3 pb-1.5 text-[13px] leading-relaxed text-[#40332E] placeholder:text-[#40332E]/45 focus:outline-none resize-none max-h-28 overflow-y-auto break-words [overflow-wrap:anywhere]"
                      />

                      <div className="flex items-center justify-between gap-2 px-2.5 sm:px-3 pb-2.5 pt-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <button
                            type="button"
                            onClick={() => setPhotoPanelOpen((p) => !p)}
                            title="Upload photo for AI Skin or Hair Analysis"
                            aria-label="Upload photo for AI Skin or Hair Analysis"
                            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl border flex items-center justify-center shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-[#40332E] ${
                              photoPanelOpen
                                ? 'bg-[#F1E9DF] border-[#40332E]/40 text-[#40332E]'
                                : 'bg-[#FAF7F2] border-[#D6BD9B]/60 text-[#40332E]/85 hover:bg-[#F1E9DF] hover:text-[#40332E]'
                            }`}
                          >
                            <Upload className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setPhotoPanelOpen(true);
                              cameraInputRef.current?.click();
                            }}
                            title="Open camera for skin or hair photo"
                            aria-label="Open camera for skin or hair photo"
                            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl border border-[#D6BD9B]/60 bg-[#FAF7F2] flex items-center justify-center text-[#40332E]/85 hover:bg-[#F1E9DF] hover:text-[#40332E] shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-[#40332E]"
                          >
                            <Camera className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={handleToggleVoiceInput}
                            title={isListening ? 'Stop voice input' : 'Speak your question'}
                            aria-label={isListening ? 'Stop voice input' : 'Speak your question'}
                            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl border flex items-center justify-center shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-[#40332E] ${
                              isListening
                                ? 'bg-[#D8AAA5] border-[#40332E] text-[#40332E]'
                                : 'bg-[#FAF7F2] border-[#D6BD9B]/60 text-[#40332E]/85 hover:bg-[#F1E9DF] hover:text-[#40332E]'
                            }`}
                          >
                            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                          </button>
                        </div>

                        <motion.button
                          type="submit"
                          whileTap={{ scale: 0.95 }}
                          disabled={isStreaming || !input.trim()}
                          aria-label="Send message"
                          className="h-9 sm:h-10 px-3.5 sm:px-4 rounded-xl bg-[#40332E] hover:bg-[#2F2521] disabled:bg-[#40332E]/35 disabled:cursor-not-allowed text-[#FFFFFF] inline-flex items-center justify-center gap-1.5 text-xs font-medium shadow-xs shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#40332E]"
                        >
                          <Send className="w-3.5 h-3.5 shrink-0" />
                          <span className="hidden min-[360px]:inline">Send</span>
                        </motion.button>
                      </div>
                    </div>

                    <p className="pt-2 px-1 text-[10px] text-center text-[#40332E]/55 leading-snug">
                      Cosmetic formulation guidance <span aria-hidden="true">·</span> Privacy protected{' '}
                      <span aria-hidden="true">·</span> Transient photo processing
                    </p>
                  </form>
                </div>

                {/* Desktop Product Recommendation Sidebar (Expanded Consultation View) */}
                {isMaximized && (
                  <aside className="hidden lg:flex w-80 xl:w-96 flex-col border-l border-[#D6BD9B]/45 bg-[#F1E9DF]/70 shrink-0 overflow-hidden">
                    <div className="px-5 py-4 border-b border-[#D6BD9B]/35 bg-[#FAF7F2]">
                      <p className="text-[11px] font-medium text-[#40332E]/65">Curated Recommendations</p>
                      <h3 className="font-display text-xl font-semibold text-[#40332E]">
                        Suggested Botanical Formulas
                      </h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      {sidebarProducts.map((product) => renderLuxuryProductCard(product))}
                    </div>
                  </aside>
                )}
              </div>
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}
