import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, ChevronRight, Edit2, Check, X,
  Plus, Trash2, GitBranch, ExternalLink, MessageSquare,
  Clock, Paperclip, Upload, Download, FileText, Image,
  Users, Save, Lock, AlertTriangle,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { format } from 'date-fns';
import { useDeal, useDealActivities, useChangeDealStage, useAddNote, useUpdateSOW, useUpdateDeal, useDeleteDeal } from '../../hooks/presales/useDeals';
import { useAttachments, useUploadAttachment, useDeleteAttachment } from '../../hooks/presales/useAttachments';
import { useEngineers, useSaveResourcePlan, useLiveTimesheetPreview, ResourcePlanEntryInput } from '../../hooks/presales/useResourcePlan';
import { STAGE_ORDER, STAGE_CONFIG, formatDealValue } from '../../components/presales/StageConfig';
import ConvertModal from '../../components/presales/ConvertModal';
import LostReasonModal from '../../components/presales/LostReasonModal';
import { DealStage, DealLostReason, SOWSection, User, DealActivity, AttachmentCategory, EngineerRole } from '../../types';
import { useAuth } from '../../context/AuthContext';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<DealStage, DealStage[]> = {
  LEAD:        ['QUALIFIED', 'LOST'],
  QUALIFIED:   ['PROPOSAL',  'LOST'],
  PROPOSAL:    ['NEGOTIATION', 'LOST'],
  NEGOTIATION: ['WON', 'LOST'],
  WON:         [],
  LOST:        [],
};

function userName(u: User | string | undefined): string {
  if (!u) return '?';
  if (typeof u === 'object') return u.name;
  return '…';
}

function activityLabel(a: DealActivity): string {
  switch (a.type) {
    case 'STAGE_CHANGED':
      return `moved deal from ${a.meta.fromStage} → ${a.meta.toStage}`;
    case 'NOTE_ADDED':
      return `added a note`;
    case 'SOW_UPDATED':
      return `updated the SOW`;
    case 'CONVERTED':
      return `converted deal to a project`;
    case 'FIELD_CHANGED':
      return a.meta.note ?? `updated ${a.meta.fieldName ?? 'a field'}`;
    default:
      return a.type;
  }
}

const PRIORITY_BADGE: Record<string, { color: string; bg: string }> = {
  LOW:      { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
  MEDIUM:   { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)'  },
  HIGH:     { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)'  },
  CRITICAL: { color: '#f87171', bg: 'rgba(248,113,113,0.1)' },
};

const INPUT_STYLE = {
  background: 'rgba(255,255,255,0.04)',
  border:     '1px solid rgba(255,255,255,0.08)',
  outline:    'none',
  color:      '#e2e8f0',
};

// ── Deal Detail Page ──────────────────────────────────────────────────────────

export default function DealDetail() {
  const { id }     = useParams<{ id: string }>();
  const navigate   = useNavigate();
  const { user }   = useAuth();

  const { data: deal, isLoading }      = useDeal(id!);
  const { data: activitiesData }       = useDealActivities(id!);
  const changeStage   = useChangeDealStage();
  const addNote       = useAddNote(id!);
  const updateSOW     = useUpdateSOW(id!);
  const updateDeal    = useUpdateDeal(id!);
  const deleteDeal    = useDeleteDeal();

  const [showConvert,   setShowConvert]   = useState(false);
  const [showLost,      setShowLost]      = useState(false);
  const [pendingStage,  setPendingStage]  = useState<DealStage | null>(null);
  const [note,          setNote]          = useState('');
  const [activeTab,     setActiveTab]     = useState<'overview' | 'sow' | 'activity' | 'attachments' | 'resourcePlan'>('overview');

  // Attachments
  const { data: attachments = [] }  = useAttachments(id!);
  const uploadMutation              = useUploadAttachment(id!);
  const deleteAttachment            = useDeleteAttachment(id!);
  const [uploadCategory, setUploadCategory] = useState<AttachmentCategory>('OTHER');
  const fileInputRef                = useRef<HTMLInputElement>(null);

  // Resource Plan
  const { data: engineers = [] }         = useEngineers();
  const saveResourcePlan                  = useSaveResourcePlan(id!);
  const [planRows, setPlanRows]           = useState<ResourcePlanEntryInput[]>([]);
  const { preview: livePreview, loading: previewLoading } = useLiveTimesheetPreview(planRows);

  // Initialise plan rows from deal once loaded
  useEffect(() => {
    if (deal?.resourcePlan?.length) {
      setPlanRows(
        deal.resourcePlan.map(e => ({
          engineer:             typeof e.engineer === 'object' ? (e.engineer as User)._id : e.engineer as string,
          role:                 e.role,
          allocationPercentage: e.allocationPercentage,
          startDate:            e.startDate ?? '',
          endDate:              e.endDate   ?? '',
          totalAuthorizedHours: e.totalAuthorizedHours,
        }))
      );
    }
  }, [deal?._id]);

  const addPlanRow = () =>
    setPlanRows(r => [...r, { engineer: '', role: 'ENGINEER', allocationPercentage: 100, startDate: deal?.proposedStartDate ?? '', endDate: deal?.proposedEndDate ?? '' }]);

  const removePlanRow = (i: number) =>
    setPlanRows(r => r.filter((_, idx) => idx !== i));

  const updatePlanRow = (i: number, patch: Partial<ResourcePlanEntryInput>) =>
    setPlanRows(r => r.map((row, idx) => idx === i ? { ...row, ...patch } : row));

  // SOW editing state
  const [editingSow,  setEditingSow]  = useState(false);
  const [sowDraft,    setSowDraft]    = useState<SOWSection[]>([]);

  if (isLoading || !deal) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 rounded-xl animate-pulse" style={{ background: 'rgba(99,102,241,0.3)' }} />
      </div>
    );
  }

  const stageCfg     = STAGE_CONFIG[deal.stage];
  const isConverted  = !!deal.convertedProjectId;
  const convertedProject = typeof deal.convertedProjectId === 'object' ? deal.convertedProjectId : null;
  const nextStages   = ALLOWED_TRANSITIONS[deal.stage] ?? [];
  const canConvert   = deal.stage === 'WON' && !isConverted && user?.role === 'ADMIN';
  const isLost       = deal.stage === 'LOST';

  const handleDeleteDeal = async () => {
    if (!window.confirm(`Permanently delete "${deal.title}"? This cannot be undone.`)) return;
    try {
      await deleteDeal.mutateAsync(deal._id);
      toast.success('Deal deleted.');
      navigate('/presales');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to delete deal.');
    }
  };

  // ── Stage transition ────────────────────────────────────────────────────────

  const handleStageClick = (stage: DealStage) => {
    if (stage === 'LOST') {
      setPendingStage('LOST');
      setShowLost(true);
    } else {
      changeStage.mutate({ dealId: deal._id, stage });
    }
  };

  const handleLostSubmit = (reason: DealLostReason, lostNote?: string) => {
    setShowLost(false);
    changeStage.mutate({ dealId: deal._id, stage: 'LOST', lostReason: reason, lostNote });
    setPendingStage(null);
  };

  // ── Note submit ─────────────────────────────────────────────────────────────

  const handleNoteSubmit = () => {
    if (!note.trim()) return;
    addNote.mutate(note.trim(), { onSuccess: () => setNote('') });
  };

  // ── SOW ─────────────────────────────────────────────────────────────────────

  const startEditSow = () => {
    setSowDraft(deal.sowSections?.length ? [...deal.sowSections] : [{ title: 'Scope', content: '', order: 0 }]);
    setEditingSow(true);
  };

  const addSowSection = () =>
    setSowDraft(d => [...d, { title: '', content: '', order: d.length }]);

  const removeSowSection = (i: number) =>
    setSowDraft(d => d.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, order: idx })));

  const saveSow = () => {
    updateSOW.mutate(sowDraft, { onSuccess: () => setEditingSow(false) });
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto px-6 py-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-ink-500 mb-6">
        <button onClick={() => navigate('/presales')} className="flex items-center gap-1 hover:text-ink-200 transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" />
          Pipeline
        </button>
        <ChevronRight className="h-3 w-3" />
        <span className="text-ink-300 truncate max-w-xs">{deal.title}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap mb-2">
            <span className="text-xs font-mono text-ink-500">{deal.dealNumber}</span>
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{ background: stageCfg.bg, color: stageCfg.color }}
            >
              {stageCfg.label}
            </span>
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: PRIORITY_BADGE[deal.priority]?.bg, color: PRIORITY_BADGE[deal.priority]?.color }}
            >
              {deal.priority}
            </span>
            {isConverted && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399' }}>
                Converted
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-ink-100 leading-tight">{deal.title}</h1>
          <p className="text-sm text-ink-400 mt-1">{deal.clientCompany}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {canConvert && (
            <button
              onClick={() => setShowConvert(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150"
              style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.25)' }}
            >
              <GitBranch className="h-3.5 w-3.5" />
              Convert to Project
            </button>
          )}
          {isConverted && convertedProject && (
            <Link
              to={`/projects/${typeof convertedProject === 'object' ? convertedProject._id : convertedProject}`}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150"
              style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399' }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {typeof convertedProject === 'object' ? convertedProject.code : 'View Project'}
            </Link>
          )}
          {isLost && user?.role === 'ADMIN' && (
            <button
              onClick={handleDeleteDeal}
              disabled={deleteDeal.isPending}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150 disabled:opacity-50"
              style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171', border: '1px solid rgba(248,113,113,0.25)' }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deleteDeal.isPending ? 'Deleting…' : 'Delete Deal'}
            </button>
          )}
        </div>
      </div>

      {/* LOST banner */}
      {isLost && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl mb-5"
          style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)' }}
        >
          <Lock className="h-4 w-4 text-red-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-400">Deal Closed — Read Only</p>
            <p className="text-xs text-ink-500 mt-0.5">This deal was marked as lost. No further changes can be made. Admins can delete it permanently.</p>
          </div>
          {deal.lostReason && (
            <span className="text-xs font-medium px-2 py-1 rounded-lg flex-shrink-0"
              style={{ background: 'rgba(248,113,113,0.15)', color: '#fca5a5' }}>
              {deal.lostReason.replace(/_/g, ' ')}
            </span>
          )}
        </div>
      )}

      {/* Stage pipeline breadcrumb */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1">
        {STAGE_ORDER.filter(s => s !== 'LOST').map((stage, i) => {
          const cfg      = STAGE_CONFIG[stage];
          const isCurrent = deal.stage === stage;
          const isPast    = STAGE_ORDER.indexOf(deal.stage) > i && deal.stage !== 'LOST';
          const isNext    = !isLost && nextStages.includes(stage) && stage !== 'LOST';
          return (
            <div key={stage} className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => isNext ? handleStageClick(stage) : undefined}
                disabled={!isNext || changeStage.isPending}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
                style={{
                  background: isCurrent ? cfg.bg : isPast ? 'rgba(255,255,255,0.04)' : 'transparent',
                  color:       isCurrent ? cfg.color : isPast ? '#64748b' : isNext ? '#94a3b8' : '#475569',
                  border:      `1px solid ${isCurrent ? cfg.color + '40' : 'rgba(255,255,255,0.05)'}`,
                  cursor:      isNext ? 'pointer' : 'default',
                  opacity:     isLost ? 0.5 : 1,
                }}
              >
                {isPast && <Check className="h-3 w-3" />}
                {cfg.label}
              </button>
              {i < STAGE_ORDER.filter(s => s !== 'LOST').length - 1 && (
                <ChevronRight className="h-3 w-3 text-ink-700" />
              )}
            </div>
          );
        })}
        {/* Lost button — only shown when deal is active */}
        {!isLost && nextStages.includes('LOST') && (
          <button
            onClick={() => handleStageClick('LOST')}
            disabled={changeStage.isPending}
            className="ml-2 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
            style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' }}
          >
            <X className="h-3 w-3" />
            Mark Lost
          </button>
        )}
      </div>

      {/* Value / hours summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Est. Value',    value: formatDealValue(deal.estimatedValue, deal.currency) },
          { label: 'Win Prob.',     value: `${deal.winProbability}%` },
          { label: 'Est. Hours',    value: deal.estimatedHours ? `${deal.estimatedHours}h` : '—' },
          { label: 'Rate',          value: deal.proposedRate   ? `${deal.currency === 'INR' ? '₹' : '$'}${deal.proposedRate}/h` : '—' },
        ].map(item => (
          <div key={item.label} className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-xs text-ink-500 mb-1">{item.label}</p>
            <p className="text-sm font-semibold text-ink-100">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 overflow-x-auto no-scrollbar" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        {([
          { id: 'overview',      label: 'Overview' },
          { id: 'sow',           label: 'SOW' },
          { id: 'resourcePlan',  label: 'Resource Plan' },
          { id: 'attachments',   label: 'Files' },
          { id: 'activity',      label: 'Activity' },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-4 py-2.5 text-sm font-medium transition-all duration-150 flex items-center gap-1.5 flex-shrink-0"
            style={{
              color:       activeTab === tab.id ? '#a5b4fc' : '#64748b',
              borderBottom: activeTab === tab.id ? '2px solid #6366f1' : '2px solid transparent',
            }}
          >
            {tab.id === 'attachments'
              ? <><Paperclip className="w-3.5 h-3.5" />{tab.label}{attachments.length > 0 && ` (${attachments.length})`}</>
              : tab.id === 'resourcePlan'
              ? <><Users className="w-3.5 h-3.5" />{tab.label}{planRows.length > 0 && ` (${planRows.length})`}</>
              : tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Overview */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Client contacts */}
          <div>
            <h3 className="text-sm font-semibold text-ink-300 mb-3">Contacts</h3>
            {deal.contacts?.length ? (
              <div className="space-y-2">
                {deal.contacts.map((c, i) => (
                  <div key={i} className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-sm font-medium text-ink-100">{c.name}</p>
                    {c.role  && <p className="text-xs text-ink-500">{c.role}</p>}
                    {c.email && <p className="text-xs text-ink-400 mt-1">{c.email}</p>}
                    {c.phone && <p className="text-xs text-ink-400">{c.phone}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-600">No contacts added</p>
            )}
          </div>

          {/* Timeline + meta */}
          <div>
            <h3 className="text-sm font-semibold text-ink-300 mb-3">Timeline</h3>
            <div className="space-y-2">
              {[
                { label: 'Expected Close', value: deal.expectedCloseDate },
                { label: 'Proposed Start', value: deal.proposedStartDate },
                { label: 'Proposed End',   value: deal.proposedEndDate   },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span className="text-xs text-ink-500">{label}</span>
                  <span className="text-xs text-ink-200">
                    {value ? format(new Date(value), 'dd MMM yyyy') : '—'}
                  </span>
                </div>
              ))}
              <div className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span className="text-xs text-ink-500">Source</span>
                <span className="text-xs text-ink-200">{deal.source ?? '—'}</span>
              </div>
              <div className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span className="text-xs text-ink-500">Partner</span>
                <span className="text-xs text-ink-200">
                  {deal.partnerId && typeof deal.partnerId === 'object'
                    ? (deal.partnerId as any).name
                    : deal.partnerId
                    ? String(deal.partnerId)
                    : '—'}
                </span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-xs text-ink-500">Owner</span>
                <span className="text-xs text-ink-200">{userName(deal.owner)}</span>
              </div>
            </div>

            {/* Lost reason */}
            {deal.stage === 'LOST' && deal.lostReason && (
              <div className="mt-4 p-3 rounded-xl" style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>
                <p className="text-xs font-semibold text-red-400 mb-1">Lost reason</p>
                <p className="text-xs text-ink-300">{deal.lostReason.replace('_', ' ')}</p>
                {deal.lostNote && <p className="text-xs text-ink-500 mt-1">{deal.lostNote}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: SOW */}
      {activeTab === 'sow' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-ink-300">Statement of Work</h3>
            {!isLost && !editingSow && (
              <button
                onClick={startEditSow}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-ink-400 hover:text-ink-100 transition-all"
                style={{ background: 'rgba(255,255,255,0.05)' }}
              >
                <Edit2 className="h-3 w-3" /> Edit SOW
              </button>
            )}
            {!isLost && editingSow && (
              <div className="flex gap-2">
                <button onClick={() => setEditingSow(false)} className="px-3 py-1.5 rounded-lg text-xs text-ink-400 hover:text-ink-100 transition-all" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  Cancel
                </button>
                <button onClick={saveSow} disabled={updateSOW.isPending}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 transition-all"
                  style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}>
                  {updateSOW.isPending ? 'Saving…' : 'Save SOW'}
                </button>
              </div>
            )}
          </div>

          {!editingSow ? (
            deal.sowSections?.length ? (
              <div className="space-y-4">
                {deal.sowSections.sort((a, b) => a.order - b.order).map((s, i) => (
                  <div key={i} className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <h4 className="text-sm font-semibold text-ink-200 mb-2">{s.title}</h4>
                    <p className="text-sm text-ink-400 whitespace-pre-wrap leading-relaxed">{s.content || <em className="text-ink-600">No content</em>}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-sm text-ink-500 mb-3">No SOW sections yet</p>
                {!isLost && (
                  <button onClick={startEditSow} className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
                    + Add SOW
                  </button>
                )}
              </div>
            )
          ) : (
            <div className="space-y-4">
              {sowDraft.map((s, i) => (
                <div key={i} className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      value={s.title}
                      onChange={e => setSowDraft(d => d.map((sec, idx) => idx === i ? { ...sec, title: e.target.value } : sec))}
                      placeholder="Section title"
                      className="flex-1 px-2.5 py-1.5 rounded-lg text-sm font-medium"
                      style={INPUT_STYLE}
                    />
                    <button onClick={() => removeSowSection(i)} className="text-ink-600 hover:text-red-400 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <textarea
                    value={s.content}
                    onChange={e => setSowDraft(d => d.map((sec, idx) => idx === i ? { ...sec, content: e.target.value } : sec))}
                    placeholder="Section content…"
                    rows={4}
                    className="w-full px-2.5 py-2 rounded-lg text-sm resize-none"
                    style={INPUT_STYLE}
                  />
                </div>
              ))}
              <button
                onClick={addSowSection}
                className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Add section
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab: Attachments */}
      {activeTab === 'attachments' && (
        <div>
          {/* Upload bar — hidden when deal is lost */}
          {!isLost && (
            <div className="flex items-center gap-3 mb-5 p-4 rounded-xl"
                 style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <select
                value={uploadCategory}
                onChange={e => setUploadCategory(e.target.value as AttachmentCategory)}
                className="px-2 py-1.5 rounded-lg text-xs text-ink-300"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <option value="OTHER">Other</option>
                <option value="SOW">SOW</option>
                <option value="PROPOSAL">Proposal</option>
                <option value="CONTRACT">Contract</option>
                <option value="CLIENT_DOCUMENT">Client Document</option>
              </select>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadMutation.isPending}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                style={{ background: 'rgba(99,102,241,0.8)' }}
              >
                <Upload className="w-3.5 h-3.5" />
                {uploadMutation.isPending ? 'Uploading…' : 'Upload File'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.txt"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  uploadMutation.mutate({ file, category: uploadCategory });
                  e.target.value = '';
                }}
              />
              <span className="text-xs text-ink-600 ml-auto">PDF, DOCX, XLSX, JPEG, PNG — max 20 MB</span>
            </div>
          )}

          {/* List */}
          {attachments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-ink-600">
              <Paperclip className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">No files uploaded yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {attachments.map(att => {
                const isImage = att.mimeType.startsWith('image/');
                const sizeMb  = (att.sizeBytes / 1024 / 1024).toFixed(2);
                const uploader = typeof att.uploadedBy === 'object'
                  ? (att.uploadedBy as User).name
                  : '—';
                return (
                  <div
                    key={att._id}
                    className="flex items-center gap-3 p-3 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    <div className="w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0"
                         style={{ background: 'rgba(99,102,241,0.15)' }}>
                      {isImage
                        ? <Image   className="w-4 h-4 text-indigo-400" />
                        : <FileText className="w-4 h-4 text-indigo-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-ink-200 truncate">{att.originalName}</p>
                      <p className="text-xs text-ink-500">
                        {att.category} · {sizeMb} MB · {uploader} · {format(new Date(att.createdAt), 'dd MMM yyyy')}
                      </p>
                    </div>
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 rounded-lg text-ink-500 hover:text-ink-200 hover:bg-white/5 transition-colors"
                      title="Download"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    {!isLost && (
                      <button
                        onClick={() => {
                          if (confirm(`Delete ${att.originalName}?`)) {
                            deleteAttachment.mutate(att._id);
                          }
                        }}
                        className="p-1.5 rounded-lg text-ink-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: Resource Plan */}
      {activeTab === 'resourcePlan' && (
        <div>
          {/* Header row */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-ink-300">Resource Plan</h3>
              <p className="text-xs text-ink-600 mt-0.5">
                {isLost
                  ? <span className="text-red-400/70 flex items-center gap-1"><Lock className="h-3 w-3" /> Read only — deal is closed</span>
                  : <>Projection updates automatically as you edit{previewLoading && <span className="ml-2 text-indigo-400 animate-pulse">· calculating…</span>}</>
                }
              </p>
            </div>
            {!isLost && (
              <div className="flex gap-2">
                <button
                  onClick={addPlanRow}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-ink-300 hover:text-ink-100 transition-all"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <Plus className="h-3 w-3" /> Add Engineer
                </button>
                <button
                  onClick={() => saveResourcePlan.mutate(planRows.filter(r => r.engineer))}
                  disabled={saveResourcePlan.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 transition-all"
                  style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}
                >
                  <Save className="h-3 w-3" />
                  {saveResourcePlan.isPending ? 'Saving…' : 'Save Plan'}
                </button>
              </div>
            )}
          </div>

          {/* Assignment rows */}
          {planRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-ink-600"
                 style={{ border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px' }}>
              <Users className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm mb-2">No engineers assigned yet</p>
              {!isLost && (
                <button onClick={addPlanRow} className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
                  + Add first engineer
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2 mb-6">
              {/* Column headers */}
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-2 px-3">
                {['Engineer', 'Role', 'Alloc %', 'Start', 'End', ''].map(h => (
                  <span key={h} className="text-[10px] font-semibold text-ink-600 uppercase tracking-wide">{h}</span>
                ))}
              </div>

              {planRows.map((row, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-2 items-center p-3 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  {/* Engineer dropdown */}
                  <select
                    value={row.engineer}
                    onChange={e => updatePlanRow(i, { engineer: e.target.value })}
                    disabled={isLost}
                    className="w-full px-2 py-1.5 rounded-lg text-xs text-ink-200 disabled:opacity-60"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    <option value="">Select engineer…</option>
                    {engineers.map(eng => (
                      <option key={eng._id} value={eng._id}>{eng.name}</option>
                    ))}
                  </select>

                  {/* Role */}
                  <select
                    value={row.role}
                    onChange={e => updatePlanRow(i, { role: e.target.value as EngineerRole })}
                    disabled={isLost}
                    className="w-full px-2 py-1.5 rounded-lg text-xs text-ink-200 disabled:opacity-60"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    <option value="LEAD_ENGINEER">Lead</option>
                    <option value="ENGINEER">Engineer</option>
                    <option value="REVIEWER">Reviewer</option>
                  </select>

                  {/* Allocation % */}
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={row.allocationPercentage}
                    onChange={e => updatePlanRow(i, { allocationPercentage: Number(e.target.value) })}
                    disabled={isLost}
                    className="w-full px-2 py-1.5 rounded-lg text-xs text-ink-200 disabled:opacity-60"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                  />

                  {/* Start date */}
                  <input
                    type="date"
                    value={row.startDate?.slice(0, 10) ?? ''}
                    onChange={e => updatePlanRow(i, { startDate: e.target.value })}
                    disabled={isLost}
                    className="w-full px-2 py-1.5 rounded-lg text-xs text-ink-200 disabled:opacity-60"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', colorScheme: 'dark' }}
                  />

                  {/* End date */}
                  <input
                    type="date"
                    value={row.endDate?.slice(0, 10) ?? ''}
                    onChange={e => updatePlanRow(i, { endDate: e.target.value })}
                    disabled={isLost}
                    className="w-full px-2 py-1.5 rounded-lg text-xs text-ink-200 disabled:opacity-60"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', colorScheme: 'dark' }}
                  />

                  {/* Remove — hidden when deal is lost */}
                  {!isLost ? (
                    <button onClick={() => removePlanRow(i)} className="text-ink-600 hover:text-red-400 transition-colors p-1">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <div className="p-1" />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Live projection — auto-updates 400 ms after any row change */}
          {livePreview && livePreview.projections.length > 0 && (
            <div className="mt-6">
              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: 'Total Projected Hours', value: `${livePreview.totalHours}h` },
                  { label: 'Duration',               value: `${livePreview.totalMonths} month${livePreview.totalMonths !== 1 ? 's' : ''}` },
                  { label: 'Engineers',              value: `${livePreview.engineerCount}` },
                ].map(s => (
                  <div key={s.label} className="p-3 rounded-xl text-center"
                       style={{ background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.15)' }}>
                    <p className="text-xs text-ink-500 mb-1">{s.label}</p>
                    <p className="text-base font-bold text-emerald-400">{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Per-engineer month grid */}
              {(() => {
                const projections = livePreview.projections;
                const monthKeys = Array.from(
                  new Set(projections.flatMap(p => p.months.map(m => `${m.year}-${String(m.month).padStart(2, '0')}`)))
                ).sort();

                const engineerName = (eid: string) =>
                  engineers.find(e => e._id === eid)?.name ?? eid;

                return (
                  <div className="overflow-x-auto no-scrollbar rounded-xl"
                       style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                          <th className="text-left px-3 py-2 text-ink-500 font-semibold sticky left-0"
                              style={{ background: 'rgba(15,15,20,0.95)', minWidth: '140px' }}>
                            Engineer
                          </th>
                          {monthKeys.map(key => {
                            const [y, m] = key.split('-');
                            return (
                              <th key={key} className="px-2 py-2 text-ink-500 font-semibold text-center whitespace-nowrap">
                                {format(new Date(Number(y), Number(m) - 1, 1), 'MMM yy')}
                              </th>
                            );
                          })}
                          <th className="px-3 py-2 text-ink-400 font-bold text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projections.map(proj => {
                          const monthMap = new Map(
                            proj.months.map(m => [`${m.year}-${String(m.month).padStart(2, '0')}`, m.expectedHours])
                          );
                          return (
                            <tr key={proj.engineerId} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                              <td className="px-3 py-2 font-medium text-ink-200 sticky left-0"
                                  style={{ background: 'rgba(15,15,20,0.95)' }}>
                                {engineerName(proj.engineerId)}
                              </td>
                              {monthKeys.map(key => {
                                const hrs = monthMap.get(key);
                                return (
                                  <td key={key} className="px-2 py-2 text-center"
                                      style={{ color: hrs ? '#a5b4fc' : '#334155' }}>
                                    {hrs != null ? `${hrs}h` : '—'}
                                  </td>
                                );
                              })}
                              <td className="px-3 py-2 text-right font-bold text-emerald-400">
                                {proj.totalExpectedHours}h
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Tab: Activity */}
      {activeTab === 'activity' && (
        <div>
          {/* Add note */}
          <div className="mb-5">
            <div className="flex gap-2">
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Add a note…"
                rows={2}
                className="flex-1 px-3 py-2 rounded-xl text-sm resize-none"
                style={INPUT_STYLE}
              />
              <button
                onClick={handleNoteSubmit}
                disabled={!note.trim() || addNote.isPending}
                className="px-4 rounded-xl text-sm font-medium disabled:opacity-40 transition-all flex items-center gap-1.5"
                style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}
              >
                <MessageSquare className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Activity list */}
          <div className="space-y-1">
            {activitiesData?.activities?.length ? (
              activitiesData.activities.map(a => (
                <div key={a._id} className="flex items-start gap-3 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div
                    className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 mt-0.5"
                    style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)' }}
                  >
                    {userName(a.actor).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-ink-300">
                      <span className="font-semibold text-ink-100">{userName(a.actor)}</span>{' '}
                      {activityLabel(a)}
                    </p>
                    {a.meta.note && a.type === 'NOTE_ADDED' && (
                      <p className="text-xs text-ink-400 mt-1 italic">"{a.meta.note}"</p>
                    )}
                    <p className="text-[10px] text-ink-600 mt-0.5 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(a.createdAt), 'MMM d, yyyy · HH:mm')}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-ink-600 text-center py-8">No activity yet</p>
            )}
          </div>
        </div>
      )}

      {/* Convert modal */}
      <ConvertModal
        deal={deal}
        open={showConvert}
        onClose={() => setShowConvert(false)}
      />

      {/* Lost reason modal */}
      <LostReasonModal
        open={showLost}
        onSubmit={handleLostSubmit}
        onClose={() => { setShowLost(false); setPendingStage(null); }}
      />
    </div>
  );
}
