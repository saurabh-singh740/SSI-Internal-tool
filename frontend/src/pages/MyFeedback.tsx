import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquare, Star, ChevronRight, ChevronLeft, Plus, X, Flag, Inbox,
} from 'lucide-react';
import Header from '../components/layout/Header';
import { Feedback, FeedbackStatus, FeedbackSentiment, FeedbackRatings } from '../types';
import { useMyFeedback, useReceivedFeedback } from '../hooks/useFeedback';
import { useAuth } from '../context/AuthContext';

// ── Tokens ────────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<FeedbackStatus, { bg: string; text: string; border: string; dot: string }> = {
  PENDING:  { bg: 'rgba(251,191,36,0.12)',  text: '#fbbf24', border: 'rgba(251,191,36,0.2)',  dot: '#fbbf24' },
  SUBMITTED:{ bg: 'rgba(99,102,241,0.12)',  text: '#818cf8', border: 'rgba(99,102,241,0.2)',  dot: '#818cf8' },
  REVIEWED: { bg: 'rgba(74,222,128,0.12)',  text: '#4ade80', border: 'rgba(74,222,128,0.2)',  dot: '#4ade80' },
  RESOLVED: { bg: 'rgba(156,163,175,0.12)', text: '#9ca3af', border: 'rgba(156,163,175,0.2)', dot: '#9ca3af' },
};

const RATING_LABELS: (keyof FeedbackRatings)[] = [
  'communication', 'delivery', 'quality', 'support', 'professionalism', 'overall',
];

function StatusBadge({ status }: { status: FeedbackStatus }) {
  const c = STATUS_CFG[status] ?? STATUS_CFG.PENDING;
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
          style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
      {status}
    </span>
  );
}

function StarBar({ value }: { value: number }) {
  const pct   = ((value - 1) / 4) * 100;
  const color = value >= 4 ? '#4ade80' : value >= 3 ? '#fbbf24' : '#f87171';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[10px] tabular-nums font-mono" style={{ color }}>{value.toFixed(1)}</span>
    </div>
  );
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────

function DetailDrawer({ fb, isReceived = false, onClose }: { fb: Feedback; isReceived?: boolean; onClose: () => void }) {
  const proj       = typeof fb.project    === 'object' ? fb.project    : null;
  const reviewedBy = typeof fb.reviewedBy === 'object' ? fb.reviewedBy : null;
  const sentiment  = fb.sentiment as FeedbackSentiment;
  const sentColor  = sentiment === 'POSITIVE' ? '#4ade80' : sentiment === 'NEGATIVE' ? '#f87171' : '#fbbf24';

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex flex-col w-full max-w-md"
         style={{ background: '#080c1f', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>

      <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
           style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <MessageSquare className="h-4 w-4 text-indigo-400" />
            <span className="text-sm font-semibold text-gray-200">{fb.feedbackNumber}</span>
            <StatusBadge status={fb.status} />
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                  style={{ background: `${sentColor}18`, color: sentColor, border: `1px solid ${sentColor}30` }}>
              {sentiment}
            </span>
            {fb.followUpRequired && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                ⚑ Follow-up
              </span>
            )}
          </div>
          <p className="text-[10px] text-gray-600 mt-0.5">
            {fb.period} · {(proj as any)?.name ?? '—'}
          </p>
        </div>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-300 ml-3">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

        {/* Submitter info (for received tab) */}
        {isReceived && (
          <div className="rounded-lg px-3 py-2.5"
               style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-[9px] font-semibold text-gray-700 uppercase tracking-widest mb-1.5">From</p>
            <p className="text-xs text-gray-300">{fb.submitterName}</p>
          </div>
        )}

        {/* Ratings */}
        <div>
          <p className="text-[9px] font-semibold text-gray-700 uppercase tracking-widest mb-2">Ratings</p>
          <div className="space-y-2">
            {RATING_LABELS.map(k => (
              <div key={k} className="flex items-center gap-3">
                <span className="text-[10px] text-gray-600 w-28 capitalize">{k}</span>
                <StarBar value={fb.ratings[k]} />
              </div>
            ))}
          </div>
        </div>

        {/* Tags */}
        {fb.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {fb.tags.map(t => (
              <span key={t} className="text-[10px] px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: '#818cf8' }}>
                {t}
              </span>
            ))}
          </div>
        )}

        {fb.comment && (
          <div className="rounded-lg px-3 py-2.5"
               style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-[9px] font-semibold text-gray-700 uppercase tracking-widest mb-1.5">Comment</p>
            <p className="text-xs text-gray-400 leading-relaxed">{fb.comment}</p>
          </div>
        )}

        {fb.suggestion && (
          <div className="rounded-lg px-3 py-2.5"
               style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-[9px] font-semibold text-gray-700 uppercase tracking-widest mb-1.5">Suggestion</p>
            <p className="text-xs text-gray-400 leading-relaxed">{fb.suggestion}</p>
          </div>
        )}

        {/* Team response (for submitted tab) */}
        {!isReceived && fb.reviewNote && (
          <div className="rounded-lg px-3 py-2.5"
               style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)' }}>
            <p className="text-[9px] font-semibold text-indigo-400 uppercase tracking-widest mb-1.5">Team Response</p>
            <p className="text-xs text-gray-300 leading-relaxed">{fb.reviewNote}</p>
            {reviewedBy && (
              <p className="text-[10px] text-gray-600 mt-1">
                — {(reviewedBy as any).name ?? (reviewedBy as any).email}
              </p>
            )}
          </div>
        )}

        {fb.resolvedAt && (
          <p className="text-[10px] text-gray-600 text-center">
            Resolved on {new Date(fb.resolvedAt).toLocaleDateString()}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Pagination helpers ─────────────────────────────────────────────────────────

function usePagination() {
  const [cursor,     setCursor]     = useState<string | undefined>(undefined);
  const [history,    setHistory]    = useState<(string | undefined)[]>([undefined]);
  const [activePage, setActivePage] = useState(0);

  const goNext = (nextCursor: string | null) => {
    if (!nextCursor) return;
    setHistory(h => [...h, nextCursor]);
    setActivePage(p => p + 1);
    setCursor(nextCursor);
  };
  const goPrev = () => {
    if (activePage <= 0) return;
    const prev = history[activePage - 1];
    setActivePage(p => p - 1);
    setCursor(prev);
  };

  return { cursor, activePage, goNext, goPrev };
}

// ── Feedback list panel ───────────────────────────────────────────────────────

function FeedbackList({
  items, hasMore, nextCursor, activePage, onNext, onPrev, onSelect, isReceived = false,
}: {
  items:       Feedback[];
  hasMore:     boolean;
  nextCursor:  string | null;
  activePage:  number;
  onNext:      () => void;
  onPrev:      () => void;
  onSelect:    (fb: Feedback) => void;
  isReceived?: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="py-16 text-center">
        <MessageSquare className="h-8 w-8 text-gray-700 mx-auto mb-3" />
        <p className="text-sm text-gray-500">
          {isReceived ? 'No feedback received yet' : 'No feedback submitted yet'}
        </p>
      </div>
    );
  }

  return (
    <>
      <div>
        {items.map(fb => {
          const proj  = typeof fb.project === 'object' ? fb.project : null;
          const color = fb.ratings.overall >= 4 ? '#4ade80' : fb.ratings.overall >= 3 ? '#fbbf24' : '#f87171';
          const cfg   = STATUS_CFG[fb.status] ?? STATUS_CFG.PENDING;
          return (
            <button key={fb._id} onClick={() => onSelect(fb)}
              className="w-full text-left group flex items-center gap-3 px-4 py-3 transition-colors"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: cfg.dot }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <code className="text-[10px] font-mono text-gray-500">{fb.feedbackNumber}</code>
                  <StatusBadge status={fb.status} />
                  {fb.followUpRequired && <Flag className="h-3 w-3 text-red-500 flex-shrink-0" />}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-300 truncate">
                    {(proj as any)?.name ?? 'Unknown project'}
                  </span>
                  <span className="text-[10px] text-gray-600 flex-shrink-0">{fb.period}</span>
                  {isReceived && (
                    <span className="text-[10px] text-gray-600 flex-shrink-0">from {fb.submitterName}</span>
                  )}
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
                <Star className="h-3 w-3" style={{ color }} />
                <span className="text-xs font-mono tabular-nums" style={{ color }}>{fb.ratings.overall.toFixed(1)}</span>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-700 group-hover:text-indigo-400 flex-shrink-0" />
            </button>
          );
        })}
      </div>
      {(activePage > 0 || hasMore) && (
        <div className="flex items-center justify-between px-4 py-2.5"
             style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <button disabled={activePage <= 0} onClick={onPrev}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 disabled:opacity-30">
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </button>
          <span className="text-[10px] text-gray-700">Page {activePage + 1}</span>
          <button disabled={!hasMore} onClick={onNext}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 disabled:opacity-30">
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MyFeedback() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const isEngineer = user?.role === 'ENGINEER';
  const [activeTab, setActiveTab] = useState<'submitted' | 'received'>('submitted');
  const [drawerFb,  setDrawerFb]  = useState<Feedback | null>(null);

  const myPag  = usePagination();
  const rcvPag = usePagination();

  const { data: myData,  isLoading: myLoading  } = useMyFeedback(myPag.cursor);
  const { data: rcvData, isLoading: rcvLoading } = useReceivedFeedback(rcvPag.cursor);

  const myItems  = myData?.items   ?? [];
  const rcvItems = rcvData?.items  ?? [];
  const summary  = myData?.summary;

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#050816' }}>
      <Header
        title="My Feedback"
        subtitle={isEngineer ? 'Your submissions and received feedback' : 'Your submitted feedback history'}
        actions={
          <button onClick={() => navigate('/feedback/submit')}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8' }}>
            <Plus className="h-3.5 w-3.5" /> New
          </button>
        }
      />

      <div className="px-4 pt-4 space-y-4">

        {/* Summary pills */}
        {summary && (
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Total Submitted', value: summary.total,                  color: '#6366f1' },
              { label: 'Avg Rating',      value: summary.avgOverall?.toFixed(1), color: summary.avgOverall >= 4 ? '#4ade80' : summary.avgOverall >= 3 ? '#fbbf24' : '#f87171' },
              { label: 'Awaiting Review', value: summary.pending,                color: '#818cf8' },
              { label: 'Resolved',        value: summary.resolved,               color: '#9ca3af' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                   style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <span className="text-sm font-bold tabular-nums" style={{ color }}>{value}</span>
                <span className="text-[10px] text-gray-500">{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Tabs (engineer only) */}
        {isEngineer && (
          <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            {([
              { key: 'submitted', label: 'Submitted',         icon: MessageSquare },
              { key: 'received',  label: 'Received Feedback', icon: Inbox },
            ] as const).map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors"
                style={{
                  borderColor: activeTab === key ? '#6366f1' : 'transparent',
                  color:       activeTab === key ? '#818cf8' : '#6b7280',
                }}>
                <Icon className="h-3.5 w-3.5" /> {label}
                {key === 'received' && rcvItems.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                        style={{ background: 'rgba(99,102,241,0.2)', color: '#818cf8' }}>
                    {rcvItems.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* List panel */}
        <div className="rounded-xl overflow-hidden"
             style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>

          <div className="flex items-center gap-2 px-4 py-2.5"
               style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {activeTab === 'submitted'
              ? <MessageSquare className="h-3.5 w-3.5 text-indigo-400" />
              : <Inbox className="h-3.5 w-3.5 text-indigo-400" />}
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              {activeTab === 'submitted' ? 'Submissions' : 'Received'}
            </span>
          </div>

          {activeTab === 'submitted' && (
            myLoading
              ? <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-14 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />)}</div>
              : <FeedbackList
                  items={myItems} hasMore={myData?.hasMore ?? false}
                  nextCursor={myData?.nextCursor ?? null}
                  activePage={myPag.activePage}
                  onNext={() => myPag.goNext(myData?.nextCursor ?? null)}
                  onPrev={myPag.goPrev}
                  onSelect={fb => setDrawerFb(fb)}
                />
          )}

          {activeTab === 'received' && (
            rcvLoading
              ? <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-14 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />)}</div>
              : <FeedbackList
                  items={rcvItems} hasMore={rcvData?.hasMore ?? false}
                  nextCursor={rcvData?.nextCursor ?? null}
                  activePage={rcvPag.activePage}
                  onNext={() => rcvPag.goNext(rcvData?.nextCursor ?? null)}
                  onPrev={rcvPag.goPrev}
                  onSelect={fb => setDrawerFb(fb)}
                  isReceived
                />
          )}
        </div>
      </div>

      {/* Drawer */}
      {drawerFb && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setDrawerFb(null)} />
          <DetailDrawer fb={drawerFb} isReceived={activeTab === 'received'} onClose={() => setDrawerFb(null)} />
        </>
      )}
    </div>
  );
}
