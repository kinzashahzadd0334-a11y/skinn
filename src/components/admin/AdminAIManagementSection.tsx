import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { AIAgentConfig, AIAnalyticsSummary } from '../../types/store';
import { adminFetch, formatShortDateTime } from './adminApi';

interface AdminAIManagementSectionProps {
  token: string;
  onToast: (msg: string) => void;
}

export function AdminAIManagementSection({ token, onToast }: AdminAIManagementSectionProps) {
  const [agents, setAgents] = useState<AIAgentConfig[]>([]);
  const [analytics, setAnalytics] = useState<AIAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Admin Business Assistant Q&A
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [asking, setAsking] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminFetch<{ agents: AIAgentConfig[]; analytics: AIAnalyticsSummary }>(
        '/api/admin/ai',
        token,
      );
      setAgents(data.agents);
      setAnalytics(data.analytics);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to load AI configuration.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveAgent = async (agent: AIAgentConfig) => {
    setSavingKey(agent.agentKey);
    try {
      const data = await adminFetch<{ agent: AIAgentConfig }>(
        `/api/admin/ai/agents/${agent.agentKey}`,
        token,
        {
          method: 'PATCH',
          body: JSON.stringify(agent),
        },
      );
      setAgents((prev) => prev.map((a) => (a.agentKey === agent.agentKey ? data.agent : a)));
      onToast(`${agent.name} settings saved.`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not update AI agent.');
    } finally {
      setSavingKey(null);
    }
  };

  const handleSyncCatalog = async () => {
    setSyncing(true);
    try {
      const data = await adminFetch<{ publishedCount: number; faqCount: number }>(
        '/api/admin/ai/sync-catalog',
        token,
        { method: 'POST' },
      );
      onToast(`Synced ${data.publishedCount} live SKUs & ${data.faqCount} FAQs to AI prompt grounding.`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  const handleAskBusinessAI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || asking) return;
    const prompt = question.trim();
    const nextHistory = [...history, { role: 'user' as const, text: prompt }];
    setHistory(nextHistory);
    setQuestion('');
    setAsking(true);
    try {
      const data = await adminFetch<{ reply: string }>('/api/admin/ai-assistant', token, {
        method: 'POST',
        body: JSON.stringify({ question: prompt, history }),
      });
      setHistory([...nextHistory, { role: 'assistant', text: data.reply }]);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'AI assistant error.');
    } finally {
      setAsking(false);
    }
  };

  const updateLocalAgent = (key: string, patch: Partial<AIAgentConfig>) => {
    setAgents((prev) => prev.map((a) => (a.agentKey === key ? { ...a, ...patch } : a)));
  };

  return (
    <div className="space-y-6">
      {/* Read-Only Server AI Status Banner (Zero API key inputs per security policy) */}
      <div className="bg-white rounded-xl border border-[#232620]/10 p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#1C3B2B] text-[#FAF6EE] flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-[#C5A059]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-xl font-semibold text-[#232620]">
                Server-Side Gemini AI Engine
              </h2>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
                  analytics?.serverAiConfigured
                    ? 'bg-[#1C3B2B]/10 text-[#1C3B2B]'
                    : 'bg-rose-50 text-rose-700'
                }`}
              >
                <CheckCircle2 className="w-3 h-3" />
                {analytics?.serverAiConfigured ? 'Connected (Server Environment)' : 'Key Not Detected'}
              </span>
            </div>
            <p className="text-xs text-[#5C6156] mt-0.5">
              Active Model: <span className="font-mono text-[#232620]">{analytics?.activeModel || 'gemini-4-hydrogen'}</span> ·
              Credentials are injected securely on the server via environment secrets.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSyncCatalog}
          disabled={syncing}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1C3B2B] hover:bg-[#142C20] text-[#FAF6EE] text-xs font-medium"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
          <span>{syncing ? 'Syncing Knowledge…' : 'Sync Live Product & FAQ Knowledge'}</span>
        </button>
      </div>

      {/* Live AI Telemetry Metrics */}
      {analytics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'AI Chats', value: analytics.totalConversations },
            { label: 'Photo Scans', value: analytics.totalImageAnalyses },
            { label: 'Routine Builds', value: analytics.totalRoutineBuilds },
            { label: 'Rec Clicks', value: analytics.recommendationClicks },
            { label: 'AI Bag Adds', value: analytics.aiAssistedAddToCart },
            { label: 'AI Orders', value: analytics.aiAssistedOrders },
            { label: 'AI Errors', value: analytics.failedResponses },
          ].map((stat) => (
            <div key={stat.label} className="p-3.5 rounded-xl bg-white border border-[#232620]/10">
              <p className="text-[11px] text-[#5C6156]">{stat.label}</p>
              <p className="font-mono text-xl font-semibold text-[#232620] tabular-nums mt-1">
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* AI Admin Business Assistant + Insights */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-7 bg-white rounded-xl border border-[#232620]/10 p-5 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-[#1C3B2B]" />
              <h3 className="font-display text-xl font-semibold text-[#232620]">
                AI Store Operations Assistant
              </h3>
            </div>
            <p className="text-xs text-[#5C6156]">
              Ask about sales trends, low-stock priorities, customer reviews, or AI conversions grounded in live SQLite numbers.
            </p>
          </div>

          <div className="h-56 overflow-y-auto p-3 rounded-xl bg-[#FAF6EE] border border-[#232620]/10 space-y-3 text-xs">
            {history.length === 0 ? (
              <div className="text-[#5C6156] space-y-2">
                <p>Try asking:</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Which products are lowest on stock right now?',
                    'Summarize skincare vs haircare revenue performance.',
                    'What should our next promotional campaign target?',
                  ].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setQuestion(q)}
                      className="px-2.5 py-1 rounded-md bg-white border border-[#232620]/12 hover:border-[#1C3B2B] text-[11px]"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              history.map((m, i) => (
                <div
                  key={i}
                  className={`p-2.5 rounded-lg whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-[#1C3B2B] text-[#FAF6EE] ml-8'
                      : 'bg-white border border-[#232620]/10 text-[#232620] mr-8'
                  }`}
                >
                  {m.text}
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleAskBusinessAI} className="flex gap-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask AI Business Assistant..."
              className="flex-1 px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-xs"
            />
            <button
              type="submit"
              disabled={asking}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1C3B2B] text-[#FAF6EE] text-xs font-medium"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{asking ? 'Analyzing…' : 'Ask'}</span>
            </button>
          </form>
        </div>

        <div className="xl:col-span-5 space-y-4">
          <div className="p-4 rounded-xl bg-white border border-[#232620]/10 space-y-2 text-xs">
            <h3 className="font-semibold text-[#232620]">Most Recommended Products by AI</h3>
            {!analytics || analytics.mostRecommendedProducts.length === 0 ? (
              <p className="text-[#5C6156]">No AI product recommendations recorded yet.</p>
            ) : (
              analytics.mostRecommendedProducts.map((item) => (
                <div key={item.slug} className="flex justify-between py-1 border-b border-[#232620]/8 last:border-0">
                  <span className="truncate pr-2">{item.name}</span>
                  <span className="font-mono font-semibold tabular-nums">{item.count}×</span>
                </div>
              ))
            )}
          </div>

          <div className="p-4 rounded-xl bg-white border border-[#232620]/10 space-y-2 text-xs">
            <h3 className="font-semibold text-[#232620]">Recent AI Errors Monitor</h3>
            {!analytics || analytics.recentErrors.length === 0 ? (
              <p className="text-[#4A5D3F]">Zero AI runtime errors logged.</p>
            ) : (
              analytics.recentErrors.slice(0, 4).map((err) => (
                <div key={err.id} className="p-2 rounded bg-rose-50 border border-rose-200 text-rose-800 text-[11px]">
                  <p className="font-semibold flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {err.agentKey} · {formatShortDateTime(err.createdAt)}
                  </p>
                  <p className="truncate">{err.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 8 AI Agents Configuration Cards */}
      <div className="space-y-4">
        <h3 className="font-display text-2xl font-semibold text-[#232620]">
          Customer &amp; Operations AI Agents ({agents.length})
        </h3>
        {loading ? (
          <div className="p-8 text-center text-xs text-[#5C6156]">Loading AI agents…</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {agents.map((agent) => (
              <div
                key={agent.agentKey}
                className="p-5 rounded-xl bg-white border border-[#232620]/10 space-y-4 text-xs"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-display text-lg font-semibold text-[#232620]">{agent.name}</h4>
                    <p className="text-[11px] text-[#5C6156]">{agent.description}</p>
                  </div>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={agent.enabled}
                      onChange={(e) => updateLocalAgent(agent.agentKey, { enabled: e.target.checked })}
                      className="accent-[#1C3B2B]"
                    />
                    <span className="font-semibold text-[#1C3B2B]">
                      {agent.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-[#232620] mb-1">Personality Tone</label>
                    <select
                      value={agent.personalityTone}
                      onChange={(e) =>
                        updateLocalAgent(agent.agentKey, {
                          personalityTone: e.target.value as AIAgentConfig['personalityTone'],
                        })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
                    >
                      <option value="luxury_consultant">Luxury Botanical Consultant</option>
                      <option value="clinical_educator">Clinical Educator</option>
                      <option value="warm_concierge">Warm Pakistan Concierge</option>
                      <option value="concise_direct">Concise &amp; Direct</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-[#232620] mb-1">Languages</label>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {(['english', 'urdu', 'roman_urdu'] as const).map((lang) => {
                        const checked = agent.supportedLanguages.includes(lang);
                        return (
                          <label key={lang} className="inline-flex items-center gap-1 cursor-pointer text-[11px]">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...agent.supportedLanguages, lang]
                                  : agent.supportedLanguages.filter((l) => l !== lang);
                                updateLocalAgent(agent.agentKey, {
                                  supportedLanguages: next.length > 0 ? next : ['english'],
                                });
                              }}
                              className="accent-[#1C3B2B]"
                            />
                            <span className="capitalize">{lang.replace('_', ' ')}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-[#232620] mb-1">Custom Prompt Instructions</label>
                  <textarea
                    rows={2}
                    value={agent.customInstructions}
                    onChange={(e) => updateLocalAgent(agent.agentKey, { customInstructions: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
                  />
                </div>

                {/* FAQ Knowledge Entries for this agent */}
                <div className="space-y-2 pt-1 border-t border-[#232620]/8">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[#232620]">Agent FAQ Knowledge ({agent.faqKnowledge.length})</span>
                    <button
                      type="button"
                      onClick={() =>
                        updateLocalAgent(agent.agentKey, {
                          faqKnowledge: [
                            ...agent.faqKnowledge,
                            { id: `faq-${Date.now()}`, question: 'New question', answer: 'Response guidance' },
                          ],
                        })
                      }
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1C3B2B] hover:underline"
                    >
                      <Plus className="w-3 h-3" /> Add FAQ Rule
                    </button>
                  </div>
                  {agent.faqKnowledge.map((faq, idx) => (
                    <div key={faq.id} className="grid grid-cols-12 gap-1.5 items-center">
                      <input
                        type="text"
                        value={faq.question}
                        onChange={(e) => {
                          const next = [...agent.faqKnowledge];
                          next[idx] = { ...faq, question: e.target.value };
                          updateLocalAgent(agent.agentKey, { faqKnowledge: next });
                        }}
                        className="col-span-5 px-2 py-1 rounded border border-[#232620]/12 bg-[#FAF6EE] text-[11px]"
                      />
                      <input
                        type="text"
                        value={faq.answer}
                        onChange={(e) => {
                          const next = [...agent.faqKnowledge];
                          next[idx] = { ...faq, answer: e.target.value };
                          updateLocalAgent(agent.agentKey, { faqKnowledge: next });
                        }}
                        className="col-span-6 px-2 py-1 rounded border border-[#232620]/12 bg-[#FAF6EE] text-[11px]"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateLocalAgent(agent.agentKey, {
                            faqKnowledge: agent.faqKnowledge.filter((f) => f.id !== faq.id),
                          })
                        }
                        className="col-span-1 text-rose-700 flex justify-center"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={savingKey === agent.agentKey}
                    onClick={() => handleSaveAgent(agent)}
                    className="px-4 py-1.5 rounded-lg bg-[#1C3B2B] hover:bg-[#142C20] text-[#FAF6EE] font-medium"
                  >
                    {savingKey === agent.agentKey ? 'Saving…' : 'Save Agent Config'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
