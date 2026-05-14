import { useState, useMemo, useCallback } from 'react';
import {
  MessageSquare, Star, AlertCircle, CheckCircle, Clock,
  Download, ChevronRight, ChevronLeft, Search, X, Flag,
  TrendingUp, Trash2,
} from 'lucide-react';
import { toast } from 'react-toastify';
import Header from '../components/layout/Header';
import { Feedback, FeedbackStatus, FeedbackSentiment, FeedbackRatings } from '../types';
import {
  useFeedbackList, useFeedbackStats, useReviewFeedback,
  useDeleteFeedback, useBulkUpdateStatus, useToggleFollowUp,
  FeedbackListParams,
} from '../hooks/useFeedback';
import { useDebounce } from '../hooks/useDebounce';

// ── Tokens ────────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<FeedbackStatus, { bg: string; text: string; border: string; dot: string }> = {
  PENDING:  { bg: 'rgba(251,191,36,0.12)',  text: '#fbbf24', border: 'rgba(251,191,36,0.2)',  dot: '#fbbf24' },
  SUBMITTED:{ bg: 'rgba(99,102,241,0.12)',  text: '#818cf8', border: 'rgba(99,102,241,0.2)',  dot: '#818cf8' },
  REVIEWED: { bg: 'rgba(74,222,128,0.12)',  text: '#4ade80', border: 'rgba(74,222,128,0.2)',  dot: '#4ade80' },
  RESOLVED: { bg: 'rgba(156,163,175,0.12)', text: '#9ca3af', border: 'rgba(156,163,175,0.2)', dot: '#9ca3af' },
};

const SENTIMENT_CFG: Record<FeedbackSentiment, { text: string; dot: string }> = {
  POSITIVE: { text: '#4ade80', dot: '#4ade80' },
  NEUTRAL:  { text: '#fbbf24', dot: '#fbbf24' },
  NEGATIVE: { text: '#f87171', dot: '#f87171' },
};

const RATING_LABELS: (keyof FeedbackRatings)[] = [
  'communication', 'delivery', 'quality', 'support', 'professionalism', 'overall',
];

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Small components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: FeedbackStatus }) {
  const c = STATUS_CFG[status] ?? STATUS_CFG.PENDING;
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
          style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
      {status}
    </span>
  );
}

function SentimentBadge({ sentiment }: { sentiment: FeedbackSentiment }) {
  const c = SENTIMENT_CFG[sentiment] ?? SENTIMENT_CFG.NEUTRAL;
  const icon = sentiment === 'POSITIVE' ? '↑' : sentiment === 'NEGATIVE' ? '↓' : '→';
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
          style={{ background: `${c.dot}18`, color: c.text, border: `1px solid ${c.dot}30` }}>
      {icon} {sentiment}
    </span>
  );
}

function StarBar({ value }: { value: number }) {
  const pct   = ((value - 1) / 4) * 100;
  const color = value >= 4 ? '#4ade80' : value >= 3 ? '#fbbf24' : '#f87171';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-14 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[10px] tabular-nums font-mono w-6" style={{ color }}>{value.toFixed(1)}</span>
    </div>
  );
}

// ── NPS Gauge ─────────────────────────────────────────────────────────────────

function NPSGauge({ nps, promoters, detractors, total }: { nps: number; promoters: number; detractors: number; total: number }) {
  const clamped = Math.max(-100, Math.min(100, nps));
  const color   = clamped >= 50 ? '#4ade80' : clamped >= 0 ? '#fbbf24' : '#f87171';
  const label   = clamped >= 50 ? 'Excellent' : clamped >= 20 ? 'Good' : clamped >= 0 ? 'OK' : 'Needs Work';

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-3xl font-black tabular-nums" style={{ color }}>
        {clamped >= 0 ? '+' : ''}{Math.round(clamped)}
      </span>
      <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color }}>{label}</span>
      <span className="text-[9px] text-gray-700">NPS Score</span>
      {total > 0 && (
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[9px] text-green-500">▲ {promoters} promo</span>
          <span className="text-[9px] text-red-500">▼ {detractors} detrac</span>
        </div>
      )}
    </div>
  );
}

// ── Distribution bars ─────────────────────────────────────────────────────────

function DistributionBars({ distribution, total }: { distribution: { _id: number; count: number }[]; total: number }) {
  const map: Record<number, number> = {};
  for (const d of distribution) map[d._id] = d.count;
  return (
    <div className="space-y-1.5">
      {[5, 4, 3, 2, 1].map(star => {
        const count = map[star] ?? 0;
        const pct   = total > 0 ? (count / total) * 100 : 0;
        const color = star >= 4 ? '#4ade80' : star === 3 ? '#fbbf24' : '#f87171';
        return (
          <div key={star} className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 w-8 flex-shrink-0">
              <Star className="h-2.5 w-2.5" style={{ color, fill: color }} />
              <span className="text-[9px] text-gray-600">{star}</span>
            </div>
            <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
            </div>
            <span className="text-[9px] text-gray-700 w-8 tabular-nums text-right">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Trend bars ────────────────────────────────────────────────────────────────

function TrendBars({ trend }: { trend: { _id: { year: number; month: number }; count: number; avgOverall: number }[] }) {
  if (!trend.length) return <p className="text-xs text-gray-700 py-4 text-center">No data yet</p>;
  const max = Math.max(...trend.map(t => t.count), 1);
  return (
    <div className="flex items-end gap-1.5 h-14">
      {trend.map((t, i) => {
        const h     = Math.max(4, Math.round((t.count / max) * 48));
        const color = t.avgOverall >= 4 ? 'rgba(74,222,128,0.6)' : t.avgOverall >= 3 ? 'rgba(251,191,36,0.6)' : 'rgba(248,113,113,0.6)';
        return (
          <div key={i} className="flex flex-col items-center gap-0.5 flex-1">
            <span className="text-[8px] text-gray-700 tabular-nums">{t.count}</span>
            <div className="w-full rounded-sm" style={{ height: h, background: color }} title={`${MONTH_NAMES[t._id.month - 1]}: ${t.count} (avg ${t.avgOverall.toFixed(1)})`} />
            <span className="text-[8px] text-gray-700">{MONTH_NAMES[t._id.month - 1]}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Drawer ────────────────────────────────────────────────────────────────────

function FeedbackDrawer({ fb, onClose, onReview, onDelete, onToggleFollowUp, busy }: {
  fb:               Feedback;
  onClose:          () => void;
  onReview:         (v: { id: string; reviewNote?: string; status?: string }) => void;
  onDelete:         (id: string) => void;
  onToggleFollowUp: (id: string) => void;
  busy:             boolean;
}) {
  const [reviewNote, setReviewNote] = useState(fb.reviewNote ?? '');
  const [status,     setStatus]     = useState<string>(fb.status);

  const proj        = typeof fb.project    === 'object' ? fb.project    : null;
  const reviewedBy  = typeof fb.reviewedBy === 'object' ? fb.reviewedBy : null;
  const displayName = fb.isAnonymous ? 'Anonymous' : fb.submitterName;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex flex-col w-full max-w-md"
         style={{ background: '#080c1f', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
           style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <MessageSquare className="h-4 w-4 text-indigo-400 flex-shrink-0" />
            <span className="text-sm font-semibold text-gray-200">{fb.feedbackNumber}</span>
            <StatusBadge   status={fb.status} />
            <SentimentBadge sentiment={fb.sentiment} />
            {fb.followUpRequired && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                ⚑ Follow-up
              </span>
            )}
            {fb.isAnonymous && (
              <span className="text-[9px] text-gray-600 px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                Anon
              </span>
            )}
          </div>
          <p className="text-[10px] text-gray-600 mt-0.5">{fb.period}</p>
        </div>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-300 ml-3 flex-shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

        {/* Meta */}
        <div className="rounded-lg px-3 py-2.5 space-y-1.5"
             style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <MetaRow label="Project"   value={(proj as any)?.name ?? '—'} />
          <MetaRow label="Submitter" value={displayName} />
          {!fb.isAnonymous && <MetaRow label="Email" value={fb.submitterEmail} />}
          {reviewedBy && <MetaRow label="Reviewed by" value={(reviewedBy as any).name ?? (reviewedBy as any).email} />}
          {fb.resolvedAt && <MetaRow label="Resolved" value={new Date(fb.resolvedAt).toLocaleDateString()} />}
        </div>

        {/* Ratings */}
        <div>
          <p className="text-[9px] font-semibold text-gray-700 uppercase tracking-widest mb-2">Ratings</p>
          <div className="grid grid-cols-2 gap-2">
            {RATING_LABELS.map(k => (
              <div key={k} className="flex items-center justify-between gap-1 px-2 py-1.5 rounded-lg"
                   style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span className="text-[10px] text-gray-500 capitalize">{k}</span>
                <StarBar value={fb.ratings[k]} />
              </div>
            ))}
          </div>
        </div>

        {/* Tags */}
        {fb.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {fb.tags.map(t => (
              <span key={t} className="text-[10px] px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: '#818cf8' }}>
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Comment */}
        {fb.comment && (
          <InfoBlock label="Comment" text={fb.comment} />
        )}

        {/* Suggestion */}
        {fb.suggestion && (
          <InfoBlock label="Suggestion" text={fb.suggestion} />
        )}

        {/* Follow-up toggle */}
        <button
          disabled={busy}
          onClick={() => onToggleFollowUp(fb._id)}
          className="w-full flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg transition-colors disabled:opacity-50"
          style={{
            background: fb.followUpRequired ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)',
            border:     fb.followUpRequired ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(255,255,255,0.07)',
            color:      fb.followUpRequired ? '#f87171' : '#6b7280',
          }}
        >
          <Flag className="h-3.5 w-3.5" />
          {fb.followUpRequired ? 'Clear Follow-up Flag' : 'Flag for Follow-up'}
        </button>

        {/* Review form */}
        <div className="rounded-lg px-3 py-3 space-y-3"
             style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)' }}>
          <p className="text-[9px] font-semibold text-indigo-400 uppercase tracking-widest">Review</p>

          <div>
            <label className="text-[10px] text-gray-500 mb-1 block">Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="w-full text-xs text-gray-200 rounded-lg px-2.5 py-1.5 appearance-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              {(['SUBMITTED','REVIEWED','RESOLVED'] as FeedbackStatus[]).map(s => (
                <option key={s} value={s} style={{ background: '#080c1f' }}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] text-gray-500 mb-1 block">Internal Note</label>
            <textarea
              value={reviewNote}
              onChange={e => setReviewNote(e.target.value)}
              rows={3}
              placeholder="Add a review note…"
              className="w-full text-xs text-gray-300 rounded-lg px-2.5 py-1.5 resize-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
            />
          </div>

          <button
            disabled={busy}
            onClick={() => onReview({ id: fb._id, reviewNote: reviewNote || undefined, status })}
            className="w-full text-xs font-semibold py-2 rounded-lg transition-colors disabled:opacity-50"
            style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8' }}
          >
            {busy ? 'Saving…' : 'Save Review'}
          </button>
        </div>

        {/* Delete */}
        <button
          disabled={busy}
          onClick={() => onDelete(fb._id)}
          className="w-full flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg transition-colors disabled:opacity-50"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete Feedback
        </button>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[10px] text-gray-600 flex-shrink-0">{label}</span>
      <span className="text-[10px] text-gray-300 truncate max-w-[200px]">{value}</span>
    </div>
  );
}

function InfoBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-lg px-3 py-2.5"
         style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="text-[9px] font-semibold text-gray-700 uppercase tracking-widest mb-1.5">{label}</p>
      <p className="text-xs text-gray-400 leading-relaxed">{text}</p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FeedbackPage() {
  const [searchRaw,    setSearchRaw]    = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sentFilter,   setSentFilter]   = useState('');
  const [followFilter, setFollowFilter] = useState(false);
  const [fromDate,     setFromDate]     = useState('');
  const [toDate,       setToDate]       = useState('');
  const [cursor,       setCursor]       = useState<string | undefined>(undefined);
  const [history,      setHistory]      = useState<(string | undefined)[]>([undefined]);
  const [activePage,   setActivePage]   = useState(0);
  const [drawerFb,     setDrawerFb]     = useState<Feedback | null>(null);
  const [selected,     setSelected]     = useState<Set<string>>(new Set());
  const [bulkStatus,   setBulkStatus]   = useState('REVIEWED');

  const search = useDebounce(searchRaw, 300);

  const queryParams = useMemo<FeedbackListParams>(() => ({
    search:           search || undefined,
    status:           statusFilter || undefined,
    sentiment:        sentFilter   || undefined,
    followUpRequired: followFilter || undefined,
    from:             fromDate     || undefined,
    to:               toDate       || undefined,
    cursor,
    limit: 25,
  }), [search, statusFilter, sentFilter, followFilter, fromDate, toDate, cursor]);

  const { data: listData,  isLoading: listLoading  } = useFeedbackList(queryParams);
  const { data: statsData, isLoading: statsLoading } = useFeedbackStats();

  const reviewMut     = useReviewFeedback();
  const deleteMut     = useDeleteFeedback();
  const bulkMut       = useBulkUpdateStatus();
  const followUpMut   = useToggleFollowUp();

  const stats = statsData?.stats;
  const items = listData?.items ?? [];

  const resetPaging = useCallback(() => {
    setCursor(undefined);
    setHistory([undefined]);
    setActivePage(0);
    setSelected(new Set());
  }, []);

  const goNext = () => {
    if (!listData?.nextCursor) return;
    setHistory(h => [...h, listData.nextCursor ?? undefined]);
    setActivePage(p => p + 1);
    setCursor(listData.nextCursor ?? undefined);
    setSelected(new Set());
  };
  const goPrev = () => {
    if (activePage <= 0) return;
    const prev = history[activePage - 1];
    setActivePage(p => p - 1);
    setCursor(prev);
    setSelected(new Set());
  };

  const handleReview = async (vars: { id: string; reviewNote?: string; status?: string }) => {
    try {
      await reviewMut.mutateAsync(vars);
      setDrawerFb(null);
      toast.success('Review saved');
    } catch (e: any) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this feedback permanently?')) return;
    try {
      await deleteMut.mutateAsync(id);
      setDrawerFb(null);
      toast.success('Deleted');
    } catch (e: any) { toast.error(e.response?.data?.message || 'Delete failed'); }
  };

  const handleToggleFollowUp = async (id: string) => {
    try {
      await followUpMut.mutateAsync(id);
      toast.success('Follow-up flag updated');
      setDrawerFb(null);
    } catch { toast.error('Failed to update flag'); }
  };

  const handleBulk = async () => {
    if (!selected.size) return;
    try {
      const result = await bulkMut.mutateAsync({ ids: Array.from(selected), status: bulkStatus });
      toast.success(`Updated ${result.modified} items to ${bulkStatus}`);
      setSelected(new Set());
    } catch (e: any) { toast.error(e.response?.data?.message || 'Bulk update failed'); }
  };

  const toggleSelect = (id: string) =>
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () =>
    setSelected(s => s.size === items.length ? new Set() : new Set(items.map(i => i._id)));

  const nps      = stats?.nps;
  const byStatus = stats?.byStatus ?? {};

  // Pill helper
  const pill = (label: string, count: number | undefined, color: string, active: boolean, onClick: () => void) => (
    <button key={label} onClick={() => { onClick(); resetPaging(); }}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all"
      style={{ background: active ? `${color}22` : 'rgba(255,255,255,0.04)', border: `1px solid ${active ? color + '55' : 'rgba(255,255,255,0.07)'}` }}>
      {statsLoading
        ? <span className="h-4 w-5 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.1)' }} />
        : <span className="text-sm font-bold text-white tabular-nums">{count ?? 0}</span>}
      <span className="text-[10px] text-gray-500">{label}</span>
    </button>
  );

  return (
    <div className="flex flex-col min-h-screen pb-20" style={{ background: '#050816' }}>
      <Header title="Feedback" subtitle="Customer & team satisfaction analytics" />

      <div className="px-4 pt-4 space-y-4">

        {/* ── Top stats row ────────────────────────────────────────────── */}
        <div className="rounded-xl px-4 py-3"
             style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-3.5 w-3.5 text-indigo-400" />
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Overview</span>
            {!statsLoading && stats?.followUpCount ? (
              <span className="ml-auto flex items-center gap-1 text-[10px] px-2 py-0.5 rounded"
                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                <Flag className="h-3 w-3" /> {stats.followUpCount} need follow-up
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {pill('All',       stats?.total,          '#6366f1', !statusFilter, () => setStatusFilter(''))}
            {pill('Pending',   byStatus.PENDING,       '#fbbf24', statusFilter==='PENDING',   () => setStatusFilter('PENDING'))}
            {pill('Submitted', byStatus.SUBMITTED,     '#818cf8', statusFilter==='SUBMITTED', () => setStatusFilter('SUBMITTED'))}
            {pill('Reviewed',  byStatus.REVIEWED,      '#4ade80', statusFilter==='REVIEWED',  () => setStatusFilter('REVIEWED'))}
            {pill('Resolved',  byStatus.RESOLVED,      '#9ca3af', statusFilter==='RESOLVED',  () => setStatusFilter('RESOLVED'))}

            <button
              onClick={() => { window.location.href = `/api/feedback/export${statusFilter ? '?status=' + statusFilter : ''}`; }}
              className="ml-auto flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#6b7280' }}
            >
              <Download className="h-3 w-3" /> Export
            </button>
          </div>
        </div>

        {/* ── Analytics row ────────────────────────────────────────────── */}
        {!statsLoading && stats && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">

            {/* NPS */}
            <div className="rounded-xl px-4 py-4 flex flex-col items-center justify-center"
                 style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <NPSGauge nps={nps?.nps ?? 0} promoters={nps?.promoters ?? 0} detractors={nps?.detractors ?? 0} total={nps?.total ?? 0} />
            </div>

            {/* Trend */}
            <div className="rounded-xl px-4 py-3"
                 style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[9px] font-semibold text-gray-700 uppercase tracking-widest mb-3">6-Month Trend</p>
              <TrendBars trend={stats.trend} />
            </div>

            {/* Distribution */}
            <div className="rounded-xl px-4 py-3"
                 style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[9px] font-semibold text-gray-700 uppercase tracking-widest mb-2">Rating Distribution</p>
              <DistributionBars distribution={stats.distribution} total={stats.total} />
            </div>

            {/* Avg ratings */}
            <div className="rounded-xl px-4 py-3"
                 style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[9px] font-semibold text-gray-700 uppercase tracking-widest mb-2">Avg Ratings</p>
              <div className="space-y-1.5">
                {RATING_LABELS.map(k => {
                  const key = `avg${k.charAt(0).toUpperCase()}${k.slice(1)}`;
                  const val = (stats.avgRatings[key] as number) ?? 0;
                  return (
                    <div key={k} className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-600 w-24 capitalize">{k}</span>
                      <StarBar value={val} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Top projects strip */}
        {!statsLoading && stats?.topProjects?.length ? (
          <div className="rounded-xl px-4 py-3"
               style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-[9px] font-semibold text-gray-700 uppercase tracking-widest mb-2">Top Projects by Feedback</p>
            <div className="flex flex-wrap gap-2">
              {stats.topProjects.map(p => {
                const color = p.avgOverall >= 4 ? '#4ade80' : p.avgOverall >= 3 ? '#fbbf24' : '#f87171';
                return (
                  <div key={p._id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                       style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span className="text-xs text-gray-300">{p.projectName}</span>
                    <span className="text-[10px] text-gray-600">{p.count} reviews</span>
                    <span className="text-[10px] font-mono tabular-nums" style={{ color }}>★ {p.avgOverall.toFixed(1)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* ── Filter toolbar ───────────────────────────────────────────── */}
        <div className="rounded-xl overflow-hidden"
             style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>

          <div className="flex items-center gap-2 px-4 py-2.5 flex-wrap"
               style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <MessageSquare className="h-3.5 w-3.5 text-indigo-400 flex-shrink-0" />
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Feedback</span>
            {!listLoading && <span className="text-[10px] text-gray-700">{items.length} shown</span>}

            <div className="ml-auto flex items-center gap-2 flex-wrap">
              {/* Sentiment */}
              <select
                value={sentFilter}
                onChange={e => { setSentFilter(e.target.value); resetPaging(); }}
                className="text-xs text-gray-400 rounded-lg px-2.5 py-1.5 appearance-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <option value="" style={{ background: '#080c1f' }}>All Sentiment</option>
                <option value="POSITIVE" style={{ background: '#080c1f' }}>Positive</option>
                <option value="NEUTRAL"  style={{ background: '#080c1f' }}>Neutral</option>
                <option value="NEGATIVE" style={{ background: '#080c1f' }}>Negative</option>
              </select>

              {/* Follow-up toggle */}
              <button
                onClick={() => { setFollowFilter(f => !f); resetPaging(); }}
                className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg transition-all"
                style={{
                  background: followFilter ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.04)',
                  border:     followFilter ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(255,255,255,0.07)',
                  color:      followFilter ? '#f87171' : '#6b7280',
                }}
              >
                <Flag className="h-3 w-3" /> Follow-up
              </button>

              {/* Date from */}
              <input type="date" value={fromDate}
                onChange={e => { setFromDate(e.target.value); resetPaging(); }}
                className="text-xs text-gray-500 rounded-lg px-2.5 py-1.5"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
              />
              <span className="text-[10px] text-gray-700">–</span>
              <input type="date" value={toDate}
                onChange={e => { setToDate(e.target.value); resetPaging(); }}
                className="text-xs text-gray-500 rounded-lg px-2.5 py-1.5"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
              />

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-700" />
                <input
                  type="text"
                  value={searchRaw}
                  onChange={e => { setSearchRaw(e.target.value); resetPaging(); }}
                  placeholder="Search…"
                  className="pl-6 pr-3 py-1 text-xs text-gray-300 rounded-lg w-36"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                />
              </div>
            </div>
          </div>

          {/* Table */}
          {listLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-9 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center">
              <MessageSquare className="h-8 w-8 text-gray-700 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No feedback found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.015)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <th className="px-3 py-2 w-8">
                      <input type="checkbox"
                        checked={selected.size === items.length && items.length > 0}
                        onChange={toggleAll}
                        className="accent-indigo-500 cursor-pointer"
                      />
                    </th>
                    <th className="px-4 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest">Ref</th>
                    <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest hidden sm:table-cell">Project</th>
                    <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest hidden md:table-cell">Submitter</th>
                    <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest w-20">Period</th>
                    <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest w-20">Status</th>
                    <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest hidden sm:table-cell w-20">Sentiment</th>
                    <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest w-16">Rating</th>
                    <th className="px-2 py-2 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {items.map(fb => {
                    const proj  = typeof fb.project === 'object' ? fb.project : null;
                    const color = fb.ratings.overall >= 4 ? '#4ade80' : fb.ratings.overall >= 3 ? '#fbbf24' : '#f87171';
                    const isSelected = selected.has(fb._id);
                    return (
                      <tr
                        key={fb._id}
                        className="group transition-colors cursor-pointer"
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          background:   isSelected ? 'rgba(99,102,241,0.06)' : 'transparent',
                        }}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = isSelected ? 'rgba(99,102,241,0.06)' : 'transparent'; }}
                      >
                        <td className="px-3 py-2.5" onClick={e => { e.stopPropagation(); toggleSelect(fb._id); }}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(fb._id)}
                            className="accent-indigo-500 cursor-pointer" />
                        </td>
                        <td className="px-4 py-2.5" onClick={() => setDrawerFb(fb)}>
                          <div className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: STATUS_CFG[fb.status]?.dot ?? '#6b7280' }} />
                            <code className="text-[10px] font-mono text-gray-400">{fb.feedbackNumber}</code>
                            {fb.followUpRequired && <Flag className="h-3 w-3 text-red-500 flex-shrink-0" />}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 hidden sm:table-cell" onClick={() => setDrawerFb(fb)}>
                          <span className="text-xs text-gray-400 truncate block max-w-[120px]">{(proj as any)?.name ?? '—'}</span>
                        </td>
                        <td className="px-3 py-2.5 hidden md:table-cell" onClick={() => setDrawerFb(fb)}>
                          <span className="text-xs text-gray-500 truncate block max-w-[110px]">
                            {fb.isAnonymous ? 'Anonymous' : fb.submitterName}
                          </span>
                        </td>
                        <td className="px-3 py-2.5" onClick={() => setDrawerFb(fb)}>
                          <span className="text-[10px] text-gray-600">{fb.period}</span>
                        </td>
                        <td className="px-3 py-2.5" onClick={() => setDrawerFb(fb)}>
                          <StatusBadge status={fb.status} />
                        </td>
                        <td className="px-3 py-2.5 hidden sm:table-cell" onClick={() => setDrawerFb(fb)}>
                          <SentimentBadge sentiment={fb.sentiment} />
                        </td>
                        <td className="px-3 py-2.5" onClick={() => setDrawerFb(fb)}>
                          <div className="flex items-center gap-1">
                            <Star className="h-3 w-3 flex-shrink-0" style={{ color }} />
                            <span className="text-xs font-mono tabular-nums" style={{ color }}>{fb.ratings.overall.toFixed(1)}</span>
                          </div>
                        </td>
                        <td className="px-2 py-2.5">
                          <ChevronRight className="h-3.5 w-3.5 text-gray-700 group-hover:text-indigo-400 transition-colors" onClick={() => setDrawerFb(fb)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {(activePage > 0 || listData?.hasMore) && (
            <div className="flex items-center justify-between px-4 py-2.5"
                 style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <button disabled={activePage <= 0} onClick={goPrev}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 disabled:opacity-30">
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </button>
              <span className="text-[10px] text-gray-700">Page {activePage + 1}</span>
              <button disabled={!listData?.hasMore} onClick={goNext}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 disabled:opacity-30">
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Bulk action bar ─────────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 px-4 py-3 flex items-center gap-3"
             style={{ background: 'rgba(8,12,31,0.95)', borderTop: '1px solid rgba(99,102,241,0.25)', backdropFilter: 'blur(12px)' }}>
          <span className="text-xs text-indigo-400 font-semibold">{selected.size} selected</span>
          <select
            value={bulkStatus}
            onChange={e => setBulkStatus(e.target.value)}
            className="text-xs text-gray-200 rounded-lg px-2.5 py-1.5 appearance-none"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            {(['SUBMITTED','REVIEWED','RESOLVED'] as FeedbackStatus[]).map(s => (
              <option key={s} value={s} style={{ background: '#080c1f' }}>{s}</option>
            ))}
          </select>
          <button
            disabled={bulkMut.isPending}
            onClick={handleBulk}
            className="flex items-center gap-1.5 text-xs font-semibold px-4 py-1.5 rounded-lg disabled:opacity-50"
            style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.35)', color: '#818cf8' }}
          >
            <CheckCircle className="h-3.5 w-3.5" />
            {bulkMut.isPending ? 'Updating…' : 'Apply'}
          </button>
          <button onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-gray-600 hover:text-gray-400">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Drawer ──────────────────────────────────────────────────────── */}
      {drawerFb && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setDrawerFb(null)} />
          <FeedbackDrawer
            fb={drawerFb}
            onClose={() => setDrawerFb(null)}
            onReview={handleReview}
            onDelete={handleDelete}
            onToggleFollowUp={handleToggleFollowUp}
            busy={reviewMut.isPending || deleteMut.isPending || followUpMut.isPending}
          />
        </>
      )}
    </div>
  );
}
