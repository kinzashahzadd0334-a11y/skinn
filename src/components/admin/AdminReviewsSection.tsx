import { useEffect, useState } from 'react';
import { CheckCircle2, EyeOff, MessageSquareReply, Star, Trash2 } from 'lucide-react';
import type { ReviewModerationRecord } from '../../types/store';
import { adminFetch, formatShortDate } from './adminApi';

interface AdminReviewsSectionProps {
  token: string;
  onStorefrontChanged: () => void;
  onToast: (msg: string) => void;
}

export function AdminReviewsSection({
  token,
  onStorefrontChanged,
  onToast,
}: AdminReviewsSectionProps) {
  const [reviews, setReviews] = useState<ReviewModerationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'pending' | 'hidden'>('all');
  const [ratingFilter, setRatingFilter] = useState<number>(0);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminFetch<{ reviews: ReviewModerationRecord[] }>('/api/admin/reviews', token);
      setReviews(data.reviews);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to load reviews.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleModerate = async (
    rev: ReviewModerationRecord,
    patch: { status?: 'approved' | 'pending' | 'hidden'; adminReply?: string },
  ) => {
    try {
      const data = await adminFetch<{ review: ReviewModerationRecord }>(
        `/api/admin/reviews/${rev.id}`,
        token,
        {
          method: 'PATCH',
          body: JSON.stringify(patch),
        },
      );
      setReviews((prev) => prev.map((r) => (r.id === rev.id ? data.review : r)));
      onStorefrontChanged();
      onToast('Review moderation updated & product rating recalculated.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not update review.');
    }
  };

  const handleDelete = async (rev: ReviewModerationRecord) => {
    try {
      await adminFetch(`/api/admin/reviews/${rev.id}`, token, { method: 'DELETE' });
      setReviews((prev) => prev.filter((r) => r.id !== rev.id));
      onStorefrontChanged();
      onToast('Review removed.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not delete review.');
    }
  };

  const filtered = reviews.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (ratingFilter > 0 && r.rating !== ratingFilter) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-[#232620]/10">
        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'approved', 'pending', 'hidden'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${
                statusFilter === st
                  ? 'bg-[#1C3B2B] text-[#FAF6EE]'
                  : 'bg-[#FAF6EE] text-[#232620] border border-[#232620]/10'
              }`}
            >
              {st} ({st === 'all' ? reviews.length : reviews.filter((r) => r.status === st).length})
            </button>
          ))}
        </div>

        <select
          value={ratingFilter}
          onChange={(e) => setRatingFilter(Number(e.target.value))}
          className="px-3 py-2 rounded-lg border border-[#232620]/15 bg-[#FAF6EE] text-xs"
        >
          <option value={0}>All Star Ratings</option>
          <option value={5}>5 Stars Only</option>
          <option value={4}>4 Stars Only</option>
          <option value={3}>3 Stars &amp; Below</option>
        </select>
      </div>

      {loading ? (
        <div className="p-10 text-center text-xs text-[#5C6156]">Loading reviews…</div>
      ) : filtered.length === 0 ? (
        <div className="p-10 rounded-xl bg-white border border-[#232620]/10 text-center text-xs text-[#5C6156]">
          No customer reviews match these filters.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((rev) => {
            const draft = replyDrafts[rev.id] ?? rev.adminReply ?? '';
            return (
              <article
                key={rev.id}
                className="p-5 rounded-xl bg-white border border-[#232620]/10 space-y-3 text-xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-0.5 text-[#C5A059]">
                        {Array.from({ length: rev.rating }).map((_, idx) => (
                          <Star key={idx} className="w-3.5 h-3.5 fill-current" />
                        ))}
                      </div>
                      <span className="font-semibold text-[#1C3B2B]">{rev.productName}</span>
                      <span
                        className={`px-2 py-0.5 rounded border text-[10px] uppercase font-medium ${
                          rev.status === 'approved'
                            ? 'bg-[#1C3B2B]/10 text-[#1C3B2B] border-[#1C3B2B]/25'
                            : rev.status === 'hidden'
                            ? 'bg-stone-100 text-stone-600 border-stone-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}
                      >
                        {rev.status}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-[#232620]">{rev.title}</h3>
                    <p className="text-[#5C6156] leading-relaxed">{rev.comment}</p>
                    <p className="text-[11px] text-[#5C6156]">
                      {rev.authorName} · {rev.city} · {formatShortDate(rev.createdAt)}
                      {rev.verifiedPurchase ? ' · Verified Buyer' : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {rev.status !== 'approved' && (
                      <button
                        type="button"
                        onClick={() => handleModerate(rev, { status: 'approved' })}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#1C3B2B] text-[#FAF6EE] font-medium"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Approve
                      </button>
                    )}
                    {rev.status !== 'hidden' && (
                      <button
                        type="button"
                        onClick={() => handleModerate(rev, { status: 'hidden' })}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#232620]/15 hover:bg-[#FAF6EE]"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                        Hide
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(rev)}
                      className="p-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#232620]/8 flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [rev.id]: e.target.value }))}
                    placeholder="Write an official Aurelia Botanica Care reply..."
                    className="flex-1 min-w-[220px] px-3 py-1.5 rounded-lg border border-[#232620]/15 bg-[#FAF6EE]"
                  />
                  <button
                    type="button"
                    onClick={() => handleModerate(rev, { adminReply: draft })}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#4A5D3F] text-white font-medium"
                  >
                    <MessageSquareReply className="w-3.5 h-3.5" />
                    Save Reply
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
