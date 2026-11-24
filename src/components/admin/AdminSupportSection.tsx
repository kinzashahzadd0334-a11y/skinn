import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, MessageSquare, Send } from 'lucide-react';
import type { SupportTicket } from '../../types/store';
import { adminFetch, formatShortDateTime } from './adminApi';

interface AdminSupportSectionProps {
  token: string;
  onToast: (msg: string) => void;
}

export function AdminSupportSection({ token, onToast }: AdminSupportSectionProps) {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [escalationKeywords, setEscalationKeywords] = useState<string[]>([]);
  const [filter, setFilter] = useState<'all' | 'open' | 'escalated' | 'resolved'>('all');
  const [selectedId, setSelectedId] = useState<string>('');
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminFetch<{
        tickets: SupportTicket[];
        escalationRules?: { keywords: string[] };
      }>('/api/admin/support', token);
      setTickets(data.tickets);
      setEscalationKeywords(data.escalationRules?.keywords || []);
      if (!selectedId && data.tickets.length > 0) {
        setSelectedId(data.tickets[0].id);
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to load support inbox.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = tickets.filter((t) => (filter === 'all' ? true : t.status === filter));
  const selected = tickets.find((t) => t.id === selectedId) || filtered[0] || null;

  const handlePatchTicket = async (
    id: string,
    patch: { status?: SupportTicket['status']; replyText?: string; priority?: SupportTicket['priority'] },
  ) => {
    setSending(true);
    try {
      const data = await adminFetch<{ ticket: SupportTicket }>(`/api/admin/support/${id}`, token, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setTickets((prev) => prev.map((t) => (t.id === id ? data.ticket : t)));
      if (patch.replyText) setReplyText('');
      onToast(`Ticket ${data.ticket.ticketNumber} updated.`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not update ticket.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white p-4 rounded-xl border border-[#232620]/10 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'open', 'escalated', 'resolved'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${
                filter === st
                  ? 'bg-[#1C3B2B] text-[#FAF6EE]'
                  : 'bg-[#FAF6EE] text-[#232620] border border-[#232620]/10'
              }`}
            >
              {st} ({st === 'all' ? tickets.length : tickets.filter((t) => t.status === st).length})
            </button>
          ))}
        </div>

        <div className="text-[11px] text-[#5C6156]">
          AI Auto-Escalation Triggers:{' '}
          <span className="font-mono text-[#232620]">{escalationKeywords.join(', ') || 'Configured'}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Ticket List */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-[#232620]/10 overflow-hidden divide-y divide-[#232620]/8 max-h-[560px] overflow-y-auto">
          {loading ? (
            <p className="p-6 text-xs text-[#5C6156]">Loading tickets…</p>
          ) : filtered.length === 0 ? (
            <p className="p-8 text-center text-xs text-[#5C6156]">No support tickets in this view.</p>
          ) : (
            filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedId(t.id)}
                className={`w-full text-left p-4 space-y-1.5 transition-colors ${
                  selected?.id === t.id ? 'bg-[#FAF6EE]' : 'hover:bg-[#FAF6EE]/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-mono font-semibold text-[#1C3B2B]">{t.ticketNumber}</span>
                  <span
                    className={`px-2 py-0.5 rounded border uppercase font-medium ${
                      t.status === 'escalated'
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : t.status === 'resolved'
                        ? 'bg-[#1C3B2B]/10 text-[#1C3B2B] border-[#1C3B2B]/20'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    {t.status}
                  </span>
                </div>
                <p className="text-xs font-semibold text-[#232620] line-clamp-1">{t.subject}</p>
                <p className="text-[11px] text-[#5C6156]">
                  {t.customerName} · {t.source === 'ai_escalation' ? 'AI Escalated' : 'Contact Form'} ·{' '}
                  {formatShortDateTime(t.updatedAt)}
                </p>
              </button>
            ))
          )}
        </div>

        {/* Thread & Reply Composer */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-[#232620]/10 p-5 space-y-4">
          {!selected ? (
            <div className="py-16 text-center text-xs text-[#5C6156]">
              <MessageSquare className="w-6 h-6 mx-auto mb-2 text-[#5C6156]/60" />
              Select a customer ticket or AI escalation to respond.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#232620]/10 pb-3">
                <div>
                  <p className="font-mono text-[11px] text-[#C5A059] font-semibold">
                    {selected.ticketNumber} · {selected.source.replace('_', ' ')}
                  </p>
                  <h3 className="font-display text-2xl font-semibold text-[#232620]">{selected.subject}</h3>
                  <p className="text-xs text-[#5C6156]">
                    {selected.customerName}
                    {selected.customerEmail ? ` · ${selected.customerEmail}` : ''}
                    {selected.customerPhone ? ` · ${selected.customerPhone}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  {selected.status !== 'resolved' ? (
                    <button
                      type="button"
                      onClick={() => handlePatchTicket(selected.id, { status: 'resolved' })}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1C3B2B] text-[#FAF6EE] font-medium"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Mark Resolved
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handlePatchTicket(selected.id, { status: 'open' })}
                      className="px-3 py-1.5 rounded-lg border border-[#232620]/15"
                    >
                      Reopen Ticket
                    </button>
                  )}
                  {selected.status !== 'escalated' && (
                    <button
                      type="button"
                      onClick={() =>
                        handlePatchTicket(selected.id, { status: 'escalated', priority: 'high' })
                      }
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Escalate
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-2.5 max-h-72 overflow-y-auto p-3 rounded-xl bg-[#FAF6EE] border border-[#232620]/10 text-xs">
                {selected.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`p-3 rounded-lg border ${
                      m.senderRole === 'admin'
                        ? 'bg-[#1C3B2B] text-[#FAF6EE] border-[#1C3B2B] ml-6'
                        : 'bg-white text-[#232620] border-[#232620]/10 mr-6'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] opacity-80 mb-1">
                      <span className="font-semibold">{m.senderName}</span>
                      <span>{formatShortDateTime(m.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                  </div>
                ))}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!replyText.trim()) return;
                  handlePatchTicket(selected.id, { replyText: replyText.trim() });
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Write agent reply to customer ticket..."
                  className="flex-1 px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-xs"
                />
                <button
                  type="submit"
                  disabled={sending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1C3B2B] text-[#FAF6EE] text-xs font-medium"
                >
                  <Send className="w-3.5 h-3.5" />
                  Send Reply
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
