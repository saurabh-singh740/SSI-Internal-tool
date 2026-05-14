import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Send, CheckCircle, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useSubmitFeedback } from '../hooks/useFeedback';
import { Project } from '../types';

// ── Constants ─────────────────────────────────────────────────────────────────

const RATING_FIELDS = [
  { key: 'communication',   label: 'Communication',   desc: 'Clarity and responsiveness' },
  { key: 'delivery',        label: 'Delivery',         desc: 'Meeting deadlines and milestones' },
  { key: 'quality',         label: 'Quality',          desc: 'Quality of work and deliverables' },
  { key: 'support',         label: 'Support',          desc: 'Availability and helpfulness' },
  { key: 'professionalism', label: 'Professionalism', desc: 'Conduct and professionalism' },
  { key: 'overall',         label: 'Overall',          desc: 'Overall satisfaction' },
] as const;

type RatingKey = (typeof RATING_FIELDS)[number]['key'];

const PREDEFINED_TAGS = [
  'On Time', 'Clear Communication', 'Great Quality', 'Exceeded Expectations',
  'Needs Improvement', 'Good Support', 'Technical Excellence', 'Process Issues',
  'Budget Concerns', 'Responsive Team',
];

function buildPeriods(): string[] {
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  });
}

// ── Star picker ───────────────────────────────────────────────────────────────

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  const active = hovered || value;
  const labels = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];
  const color  = active >= 4 ? '#fbbf24' : active >= 3 ? '#fb923c' : active >= 1 ? '#f87171' : '#374151';

  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button"
          onMouseEnter={() => setHovered(n)} onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(n)}
          className="transition-transform hover:scale-110 active:scale-95">
          <Star className="h-6 w-6 transition-colors"
            style={{ color: n <= active ? color : '#374151', fill: n <= active ? color : 'transparent' }} />
        </button>
      ))}
      {active > 0 && (
        <span className="text-xs ml-1" style={{ color }}>{labels[active]}</span>
      )}
    </div>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-1 mt-2">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="h-1 flex-1 rounded-full transition-all"
          style={{ background: i < step ? '#6366f1' : 'rgba(255,255,255,0.08)' }} />
      ))}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function FeedbackForm() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [step, setStep] = useState(1); // 1=Details, 2=Ratings, 3=Comments
  const [submitted,   setSubmitted]   = useState(false);
  const [dupError,    setDupError]    = useState<{ feedbackNumber: string; _id: string } | null>(null);

  const [projectId,         setProjectId]         = useState('');
  const [projectLabel,      setProjectLabel]      = useState('');
  const [projectSearch,     setProjectSearch]     = useState('');
  const [projectResults,    setProjectResults]    = useState<{ _id: string; name: string; code: string }[]>([]);
  const [projDropOpen,      setProjDropOpen]      = useState(false);
  const [projSearchLoading, setProjSearchLoading] = useState(false);
  const [projectEngineers,  setProjectEngineers]  = useState<{ _id: string; name?: string; email?: string }[]>([]);
  const [engineerId,        setEngineerId]        = useState('');
  const [period,            setPeriod]            = useState(buildPeriods()[0]);
  const [isAnonymous,  setIsAnonymous]  = useState(false);
  const [comment,      setComment]      = useState('');
  const [suggestion,   setSuggestion]   = useState('');
  const [tags,         setTags]         = useState<string[]>([]);
  const [ratings, setRatings] = useState<Record<RatingKey, number>>({
    communication: 0, delivery: 0, quality: 0,
    support: 0, professionalism: 0, overall: 0,
  });

  const submitMut = useSubmitFeedback();
  const periods   = buildPeriods();

  // Debounced project search — queries /projects?search=...&limit=15 server-side
  useEffect(() => {
    if (!projDropOpen) return;
    const timer = setTimeout(() => {
      setProjSearchLoading(true);
      const q = new URLSearchParams({ limit: '15' });
      if (projectSearch.trim()) q.set('search', projectSearch.trim());
      api.get(`/projects?${q}`)
        .then(r => {
          const all: Project[] = r.data.projects || r.data || [];
          const visible = user?.role === 'ENGINEER'
            ? all.filter(p => p.engineers?.some((e: any) => String(e.engineer?._id ?? e.engineer) === user?._id))
            : all.filter(p => p.status !== 'CLOSED');
          setProjectResults(visible.map(p => ({ _id: p._id, name: p.name, code: p.code })));
        })
        .catch(() => {})
        .finally(() => setProjSearchLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [projectSearch, projDropOpen, user]);

  // Fetch populated engineer list when a project is selected
  useEffect(() => {
    if (!projectId) { setProjectEngineers([]); return; }
    api.get(`/projects/${projectId}`)
      .then(r => {
        const proj: Project = r.data.project;
        setProjectEngineers(
          (proj?.engineers || []).map((e: any) => ({
            _id:   String(e.engineer?._id ?? e.engineer),
            name:  e.engineer?.name,
            email: e.engineer?.email,
          }))
        );
      })
      .catch(() => setProjectEngineers([]));
  }, [projectId]);

  const allRated = Object.values(ratings).every(v => v > 0);

  const toggleTag = (t: string) =>
    setTags(ts => ts.includes(t) ? ts.filter(x => x !== t) : [...ts, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) { toast.error('Select a project'); return; }
    if (!allRated)  { toast.error('Rate all categories'); return; }
    setDupError(null);

    try {
      await submitMut.mutateAsync({ projectId, engineerId: engineerId || undefined, period, ratings, comment, suggestion, tags, isAnonymous });
      setSubmitted(true);
    } catch (err: any) {
      if (err.response?.status === 409 && err.response?.data?.existing) {
        setDupError(err.response.data.existing);
      } else {
        toast.error(err.response?.data?.message || 'Failed to submit feedback');
      }
    }
  };

  // ── Success screen ─────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center px-4" style={{ background: '#050816' }}>
        <div className="max-w-sm w-full text-center">
          <div className="flex items-center justify-center mb-4">
            <div className="h-14 w-14 rounded-full flex items-center justify-center"
                 style={{ background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.2)' }}>
              <CheckCircle className="h-7 w-7 text-green-400" />
            </div>
          </div>
          <h2 className="text-lg font-semibold text-gray-200 mb-2">Feedback submitted!</h2>
          <p className="text-sm text-gray-500 mb-6">Thank you. Our team will review your response shortly.</p>
          <button onClick={() => navigate('/feedback/my')}
            className="w-full py-2.5 text-sm font-semibold rounded-xl"
            style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8' }}>
            View My Feedback
          </button>
        </div>
      </div>
    );
  }

  // ── Duplicate screen ───────────────────────────────────────────────────────
  if (dupError) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center px-4" style={{ background: '#050816' }}>
        <div className="max-w-sm w-full text-center">
          <div className="flex items-center justify-center mb-4">
            <div className="h-14 w-14 rounded-full flex items-center justify-center"
                 style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.2)' }}>
              <Star className="h-7 w-7 text-amber-400" />
            </div>
          </div>
          <h2 className="text-lg font-semibold text-gray-200 mb-2">Already submitted</h2>
          <p className="text-sm text-gray-500 mb-1">You already submitted feedback for this project and period.</p>
          <code className="text-xs text-indigo-400">{dupError.feedbackNumber}</code>
          <div className="flex flex-col gap-2 mt-6">
            <button onClick={() => navigate('/feedback/my')}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-xl"
              style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8' }}>
              <Eye className="h-4 w-4" /> View My Submissions
            </button>
            <button onClick={() => setDupError(null)}
              className="w-full py-2 text-xs text-gray-600 hover:text-gray-400">
              Change project / period
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#050816' }}>

      {/* Header */}
      <div className="px-4 pt-4 pb-0">
        <div className="rounded-xl px-4 py-3"
             style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300">
              <ChevronLeft className="h-3.5 w-3.5" /> Back
            </button>
            <div className="w-px h-4" style={{ background: 'rgba(255,255,255,0.1)' }} />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Star className="h-3.5 w-3.5 text-indigo-400" />
                <span className="text-sm font-semibold text-gray-200">Submit Feedback</span>
                <span className="text-[10px] text-gray-600 ml-auto">Step {step} of 3</span>
              </div>
              <StepBar step={step} total={3} />
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="px-4 pt-4 pb-8 max-w-xl space-y-4">

        {/* ── Step 1: Details ─────────────────────────────────────────── */}
        {step === 1 && (
          <div className="rounded-xl px-4 py-4 space-y-4"
               style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-[9px] font-semibold text-gray-700 uppercase tracking-widest">Step 1 — Details</p>

            <div className="relative">
              <label className="text-[10px] text-gray-500 mb-1 block">Project</label>
              <div className="relative">
                <input
                  type="text"
                  value={projDropOpen ? projectSearch : projectLabel}
                  onChange={e => { setProjectSearch(e.target.value); setProjDropOpen(true); }}
                  onFocus={() => { setProjDropOpen(true); setProjectSearch(''); }}
                  onBlur={() => setTimeout(() => setProjDropOpen(false), 160)}
                  placeholder="Search projects…"
                  className="w-full text-xs text-gray-200 rounded-lg px-2.5 py-2"
                  style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${projectId ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)'}` }}
                />
                {projSearchLoading && (
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border border-indigo-400 border-t-transparent animate-spin" />
                )}
              </div>
              {projDropOpen && projectResults.length > 0 && (
                <div className="absolute z-30 top-full left-0 right-0 mt-1 rounded-lg overflow-hidden max-h-44 overflow-y-auto shadow-xl"
                     style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {projectResults.map(p => (
                    <button key={p._id} type="button"
                      onMouseDown={() => {
                        setProjectId(p._id);
                        setProjectLabel(`${p.name}${p.code ? ` (${p.code})` : ''}`);
                        setProjectSearch('');
                        setProjDropOpen(false);
                        setEngineerId('');
                      }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-white/5 flex items-center gap-2">
                      <span className="text-gray-200">{p.name}</span>
                      {p.code && <span className="text-gray-600 text-[10px]">{p.code}</span>}
                    </button>
                  ))}
                </div>
              )}
              {projDropOpen && !projSearchLoading && projectResults.length === 0 && projectSearch.trim() && (
                <div className="absolute z-30 top-full left-0 right-0 mt-1 rounded-lg px-3 py-2 text-xs text-gray-600"
                     style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}>
                  No projects found
                </div>
              )}
            </div>

            {/* Engineer — only for CUSTOMER/ADMIN selecting within project team */}
            {user?.role !== 'ENGINEER' && projectEngineers.length > 0 && (
              <div>
                <label className="text-[10px] text-gray-500 mb-1 block">Engineer (optional)</label>
                <select value={engineerId} onChange={e => setEngineerId(e.target.value)}
                  className="w-full text-xs text-gray-200 rounded-lg px-2.5 py-2 appearance-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <option value="" style={{ background: '#080c1f' }}>No specific engineer</option>
                  {projectEngineers.map(e => (
                    <option key={e._id} value={e._id} style={{ background: '#080c1f' }}>
                      {e.name ?? e.email ?? e._id}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-[10px] text-gray-500 mb-1 block">Period</label>
              <select value={period} onChange={e => setPeriod(e.target.value)}
                required
                className="w-full text-xs text-gray-200 rounded-lg px-2.5 py-2 appearance-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                {periods.map(p => (
                  <option key={p} value={p} style={{ background: '#080c1f' }}>{p}</option>
                ))}
              </select>
            </div>

            {/* Anonymous toggle */}
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setIsAnonymous(a => !a)}
                className="relative w-8 h-4 rounded-full transition-colors flex-shrink-0 cursor-pointer"
                style={{ background: isAnonymous ? '#6366f1' : 'rgba(255,255,255,0.1)' }}
              >
                <div className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all"
                     style={{ left: isAnonymous ? '18px' : '2px' }} />
              </div>
              <div>
                <p className="text-xs text-gray-300">Submit anonymously</p>
                <p className="text-[10px] text-gray-600">Your name won't be shown to engineers</p>
              </div>
            </label>

            <button type="button" disabled={!projectId}
              onClick={() => setStep(2)}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-xl disabled:opacity-40"
              style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8' }}>
              Next — Ratings <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ── Step 2: Ratings ─────────────────────────────────────────── */}
        {step === 2 && (
          <div className="rounded-xl px-4 py-4 space-y-4"
               style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-[9px] font-semibold text-gray-700 uppercase tracking-widest">Step 2 — Ratings</p>

            {RATING_FIELDS.map(({ key, label, desc }) => (
              <div key={key} className="pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div>
                    <p className="text-xs font-medium text-gray-300">{label}</p>
                    <p className="text-[10px] text-gray-600">{desc}</p>
                  </div>
                </div>
                <StarPicker value={ratings[key]} onChange={v => setRatings(r => ({ ...r, [key]: v }))} />
              </div>
            ))}

            <div className="flex gap-2">
              <button type="button" onClick={() => setStep(1)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-gray-500 hover:text-gray-300 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </button>
              <button type="button" disabled={!allRated} onClick={() => setStep(3)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-xl disabled:opacity-40"
                style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8' }}>
                Next — Comments <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Comments & Tags ──────────────────────────────────── */}
        {step === 3 && (
          <>
            <div className="rounded-xl px-4 py-4 space-y-4"
                 style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[9px] font-semibold text-gray-700 uppercase tracking-widest">Step 3 — Comments</p>

              <div>
                <label className="text-[10px] text-gray-500 mb-1 block">Comment</label>
                <textarea value={comment} onChange={e => setComment(e.target.value)}
                  rows={3} placeholder="Share your experience…"
                  className="w-full text-xs text-gray-300 rounded-lg px-2.5 py-2 resize-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
              </div>

              <div>
                <label className="text-[10px] text-gray-500 mb-1 block">Suggestions for Improvement</label>
                <textarea value={suggestion} onChange={e => setSuggestion(e.target.value)}
                  rows={2} placeholder="How could we do better?"
                  className="w-full text-xs text-gray-300 rounded-lg px-2.5 py-2 resize-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
              </div>

              <div>
                <label className="text-[10px] text-gray-500 mb-2 block">Tags (optional)</label>
                <div className="flex flex-wrap gap-1.5">
                  {PREDEFINED_TAGS.map(t => {
                    const active = tags.includes(t);
                    return (
                      <button key={t} type="button" onClick={() => toggleTag(t)}
                        className="text-[10px] px-2.5 py-1 rounded-full transition-all"
                        style={{
                          background: active ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                          border:     active ? '1px solid rgba(99,102,241,0.35)' : '1px solid rgba(255,255,255,0.08)',
                          color:      active ? '#818cf8' : '#6b7280',
                        }}>
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button type="button" onClick={() => setStep(2)}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs text-gray-500 hover:text-gray-300 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </button>
              <button type="submit" disabled={submitMut.isPending}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-xl disabled:opacity-40"
                style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.35)', color: '#818cf8' }}>
                <Send className="h-4 w-4" />
                {submitMut.isPending ? 'Submitting…' : 'Submit Feedback'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
