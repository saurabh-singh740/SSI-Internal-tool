import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Pencil, Calendar, Users, Clock, DollarSign,
  Shield, FileText, AlertTriangle, Plus, Trash2, Loader2,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import api from '../api/axios';
import { Project, User, EngineerRole } from '../types';
import Header from '../components/layout/Header';
import { useAuth } from '../context/AuthContext';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (d?: string) =>
  d ? new Date(d).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

// ── Visual config ──────────────────────────────────────────────────────────────

const STATUS_CFG = {
  ACTIVE:  { dot: '#4ade80', bg: 'rgba(74,222,128,0.12)',  text: '#4ade80',  border: 'rgba(74,222,128,0.2)'  },
  CLOSED:  { dot: '#6b7280', bg: 'rgba(107,114,128,0.12)', text: '#9ca3af',  border: 'rgba(107,114,128,0.2)' },
  ON_HOLD: { dot: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  text: '#fbbf24',  border: 'rgba(251,191,36,0.2)'  },
} as const;

const PHASE_CFG = {
  PLANNING:    { bg: 'rgba(96,165,250,0.12)',  text: '#60a5fa', border: 'rgba(96,165,250,0.2)'  },
  EXECUTION:   { bg: 'rgba(167,139,250,0.12)', text: '#a78bfa', border: 'rgba(167,139,250,0.2)' },
  DELIVERY:    { bg: 'rgba(74,222,128,0.12)',  text: '#4ade80', border: 'rgba(74,222,128,0.2)'  },
  MAINTENANCE: { bg: 'rgba(251,146,60,0.12)',  text: '#fb923c', border: 'rgba(251,146,60,0.2)'  },
} as const;

function SmallBadge({ value, cfg }: { value: string; cfg: { bg: string; text: string; border: string } }) {
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide leading-none"
          style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}>
      {value.replace(/_/g, ' ')}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span className="text-[10px] text-gray-600">{label}</span>
      <span className="text-[10px] text-gray-300 text-right max-w-[200px] truncate font-medium">{value || '—'}</span>
    </div>
  );
}

type TabKey = 'overview' | 'billing' | 'access' | 'custom';

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ViewProject() {
  const { id }   = useParams<{ id: string }>();
  const { user } = useAuth();

  const [project, setProject]     = useState<Project | null>(null);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  const [allEngineers, setAllEngineers] = useState<User[]>([]);
  const [addRow, setAddRow] = useState({ engineerId: '', role: 'ENGINEER' as EngineerRole, allocationPercentage: 100 });
  const [adding, setAdding]       = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [engError, setEngError]   = useState('');
  const [engExpanded, setEngExpanded] = useState(true);

  const reloadProject = () => api.get(`/projects/${id}`).then(r => setProject(r.data.project));

  useEffect(() => {
    api.get(`/projects/${id}`).then(res => setProject(res.data.project)).finally(() => setLoading(false));
    api.get('/users/engineers').then(r => setAllEngineers(r.data.users ?? []));
  }, [id]);

  const handleAddEngineer = async () => {
    if (!addRow.engineerId) return;
    setAdding(true); setEngError('');
    try {
      await api.post(`/projects/${id}/engineers`, {
        engineerId: addRow.engineerId, role: addRow.role, allocationPercentage: addRow.allocationPercentage,
      });
      setAddRow({ engineerId: '', role: 'ENGINEER', allocationPercentage: 100 });
      await reloadProject();
    } catch (e: any) { setEngError(e?.response?.data?.message || 'Failed to add engineer'); }
    finally { setAdding(false); }
  };

  const handleRemoveEngineer = async (engineerId: string) => {
    setRemovingId(engineerId); setEngError('');
    try {
      await api.delete(`/projects/${id}/engineers/${engineerId}`);
      await reloadProject();
    } catch (e: any) { setEngError(e?.response?.data?.message || 'Failed to remove engineer'); }
    finally { setRemovingId(null); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3" style={{ color: '#4b5563' }}>
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading project…</span>
      </div>
    );
  }
  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <AlertTriangle className="h-8 w-8 text-red-400 mb-3" />
        <p className="text-sm text-red-400">Project not found</p>
        <Link to="/projects" className="mt-3 text-xs text-indigo-400 hover:text-indigo-200">← Back to Projects</Link>
      </div>
    );
  }

  const util = project.totalAuthorizedHours > 0
    ? Math.round((project.hoursUsed / project.totalAuthorizedHours) * 100) : 0;
  const remaining  = project.totalAuthorizedHours - project.hoursUsed;
  const barColor   = util >= 90 ? '#ef4444' : util >= (project.alertThreshold ?? 80) ? '#f59e0b' : '#4ade80';
  const statusCfg  = STATUS_CFG[project.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.ACTIVE;
  const phaseCfg   = PHASE_CFG[project.phase as keyof typeof PHASE_CFG]   ?? PHASE_CFG.PLANNING;

  const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: 'overview', label: 'Overview',  icon: FileText  },
    { key: 'billing',  label: 'Billing',   icon: DollarSign },
    { key: 'access',   label: 'Access',    icon: Shield     },
    ...(project.customFields?.length > 0 ? [{ key: 'custom' as TabKey, label: 'Custom', icon: FileText }] : []),
  ];

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#050816' }}>
      <Header
        title={project.name}
        subtitle={project.code}
        actions={
          <div className="flex items-center gap-2">
            <SmallBadge value={project.status} cfg={statusCfg} />
            <SmallBadge value={project.phase}  cfg={phaseCfg} />
            {project.isNearLimit && (
              <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
                    style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                <AlertTriangle className="h-2.5 w-2.5" /> Near Limit
              </span>
            )}
            {user?.role === 'ADMIN' && (
              <Link to={`/projects/${project._id}/edit`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)' }}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Link>
            )}
          </div>
        }
      />

      {/* ── Breadcrumb ───────────────────────────────────────────────────── */}
      <div className="px-4 pt-3">
        <Link to="/projects" className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-300 transition-colors w-fit">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Projects
        </Link>
      </div>

      {/* ── Metric pills ─────────────────────────────────────────────────── */}
      <div className="px-4 pt-3">
        <div className="rounded-xl px-4 py-3"
             style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex flex-wrap gap-3 mb-3">
            {[
              { label: 'Hours Used', value: `${project.hoursUsed.toLocaleString()}h`, icon: Clock, color: '#60a5fa' },
              { label: 'Remaining',  value: `${remaining.toLocaleString()}h`,          icon: Clock, color: remaining < 0 ? '#f87171' : '#4ade80' },
              { label: 'Authorized', value: `${project.totalAuthorizedHours.toLocaleString()}h`, icon: FileText, color: '#a78bfa' },
              { label: 'Engineers',  value: project.engineers?.length ?? 0,            icon: Users, color: '#fbbf24' },
              { label: 'Rate',       value: `${project.currency} ${project.hourlyRate}/hr`, icon: DollarSign, color: '#4ade80' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                   style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <Icon className="h-3 w-3 flex-shrink-0" style={{ color }} />
                <span className="text-sm font-bold text-white tabular-nums">{value}</span>
                <span className="text-[10px] text-gray-500">{label}</span>
              </div>
            ))}
          </div>

          {/* Utilization bar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] text-gray-700 uppercase tracking-widest">Utilization</span>
              <span className="text-[10px] font-mono tabular-nums" style={{ color: barColor }}>
                {project.hoursUsed} / {project.totalAuthorizedHours}h · {util}%
              </span>
            </div>
            <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }}>
              <div className="h-full rounded-full transition-all"
                   style={{ width: `${Math.min(util, 100)}%`, background: barColor }} />
            </div>
            <div className="flex justify-between text-[9px] text-gray-700 mt-1">
              <span>0</span>
              <span style={{ color: '#fbbf24' }}>Alert at {project.alertThreshold}%</span>
              <span>{project.maxAllowedHours} max</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Two-column layout ────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-8 grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Left: tabbed detail panel ──────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Tab nav */}
          <div
            className="flex gap-0 rounded-xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors"
                style={{
                  background: activeTab === key ? 'rgba(99,102,241,0.15)' : 'transparent',
                  color:      activeTab === key ? '#818cf8' : '#6b7280',
                  borderRight: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <Icon className="h-3 w-3" /> {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="rounded-xl overflow-hidden"
               style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="px-5 py-4">

              {activeTab === 'overview' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                  <div>
                    <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                      <FileText className="h-3 w-3" /> Project Info
                    </p>
                    <InfoRow label="Name"        value={project.name} />
                    <InfoRow label="Code / SOW"  value={<code className="font-mono">{project.code}</code>} />
                    <InfoRow label="Category"    value={project.category} />
                    <InfoRow label="Type"        value={project.type?.replace(/_/g, ' ')} />
                    <InfoRow label="Description" value={project.description} />
                  </div>
                  <div className="mt-4 sm:mt-0">
                    <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                      <Users className="h-3 w-3" /> Client & Partner
                    </p>
                    <InfoRow label="Client Name"  value={project.clientName} />
                    <InfoRow label="Company"      value={project.clientCompany} />
                    <InfoRow label="Email"        value={project.clientEmail} />
                    <InfoRow label="Phone"        value={project.clientPhone} />
                    {project.sourceType && <>
                      <InfoRow label="Source" value={project.sourceType.charAt(0) + project.sourceType.slice(1).toLowerCase()} />
                      {project.sourceName && <InfoRow label="Partner" value={project.sourceName} />}
                    </>}
                  </div>
                  <div className="sm:col-span-2 mt-4 pt-4"
                       style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                      <Calendar className="h-3 w-3" /> Timeline
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {[
                        { label: 'Start Date', value: fmt(project.startDate) },
                        { label: 'End Date',   value: fmt(project.endDate) },
                        { label: 'Est. Completion', value: fmt(project.estimatedCompletionDate) },
                        { label: 'Phase',      value: project.phase },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <p className="text-[9px] text-gray-600 mb-0.5">{label}</p>
                          <p className="text-xs font-medium text-gray-300">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'billing' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                  <div>
                    <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                      <DollarSign className="h-3 w-3" /> Billing
                    </p>
                    <InfoRow label="Contracted Hours"  value={`${project.contractedHours?.toLocaleString() ?? 0}h`} />
                    <InfoRow label="Additional Hours"  value={`${project.additionalApprovedHours?.toLocaleString() ?? 0}h`} />
                    <InfoRow label="Total Authorized"  value={`${project.totalAuthorizedHours?.toLocaleString() ?? 0}h`} />
                    <InfoRow label="Hourly Rate"       value={`${project.currency} ${project.hourlyRate}/hr`} />
                    <InfoRow label="Billing Type"      value={project.billingType?.replace(/_/g, ' ')} />
                    <InfoRow label="Billing Cycle"     value={project.billingCycle?.replace(/_/g, ' ')} />
                  </div>
                  <div>
                    <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                      <DollarSign className="h-3 w-3" /> Payment
                    </p>
                    <InfoRow label="Payment Terms"   value={project.paymentTerms?.replace('_', ' ')} />
                    <InfoRow label="TDS %"           value={`${project.tdsPercentage}%`} />
                    <InfoRow label="Payment Mode"    value={project.paymentMode?.replace(/_/g, ' ')} />
                    <InfoRow label="Billing Contact" value={project.billingContactEmail} />
                  </div>
                </div>
              )}

              {activeTab === 'access' && (
                <div>
                  <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <Shield className="h-3 w-3" /> Access & Permissions
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                    <div>
                      <InfoRow label="Client Portal"     value={project.clientAccessEnabled ? '✓ Enabled' : '✗ Disabled'} />
                      <InfoRow label="View Summary"      value={project.canViewSummary ? 'Yes' : 'No'} />
                      <InfoRow label="View Timesheets"   value={project.canViewTimesheets ? 'Yes' : 'No'} />
                      <InfoRow label="View Payments"     value={project.canViewPayments ? 'Yes' : 'No'} />
                    </div>
                    <div>
                      <InfoRow label="Engineers Edit"    value={project.engineersCanEditTimesheets ? 'Yes' : 'No'} />
                      <InfoRow label="Approval Required" value={project.timesheetApprovalRequired ? 'Yes' : 'No'} />
                      <InfoRow label="Lock Period"       value={`${project.timesheetLockPeriod} days`} />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'custom' && project.customFields?.length > 0 && (
                <div>
                  <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-widest mb-3">Custom Fields</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {project.customFields.map((cf, i) => (
                      <div key={i} className="px-3 py-2.5 rounded-lg"
                           style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <p className="text-[9px] text-gray-600 mb-0.5">{cf.name} <span className="text-gray-700">({cf.type})</span></p>
                        <p className="text-xs font-medium text-gray-200">{cf.value || '—'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* Notes */}
          {project.notes && (
            <div className="rounded-xl px-5 py-4"
                 style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-widest mb-2">Notes</p>
              <p className="text-xs text-gray-400 whitespace-pre-wrap leading-relaxed">{project.notes}</p>
            </div>
          )}
        </div>

        {/* ── Right sidebar ──────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Engineers panel */}
          <div className="rounded-xl overflow-hidden"
               style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <button
              onClick={() => setEngExpanded(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 transition-colors"
              style={{ borderBottom: engExpanded ? '1px solid rgba(255,255,255,0.06)' : 'none' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-indigo-400" />
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Engineers</span>
                <span className="text-[10px] text-gray-600">{project.engineers?.length ?? 0} assigned</span>
              </div>
              {engExpanded
                ? <ChevronUp className="h-3.5 w-3.5 text-gray-600" />
                : <ChevronDown className="h-3.5 w-3.5 text-gray-600" />
              }
            </button>

            {engExpanded && (
              <div className="px-4 py-3 space-y-2">
                {(project.engineers?.length ?? 0) === 0 ? (
                  <p className="text-[11px] text-gray-600 py-2">No engineers assigned yet.</p>
                ) : (
                  project.engineers.map((e, i) => {
                    const eng     = e.engineer as User;
                    const engId   = eng?._id ?? String(e.engineer);
                    const isRem   = removingId === engId;
                    return (
                      <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg group"
                           style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div className="h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                             style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)' }}>
                          {(eng?.name ?? '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-200 truncate">{eng?.name ?? '—'}</p>
                          <p className="text-[9px] text-gray-600">{e.role.replace(/_/g, ' ')} · {e.allocationPercentage}%</p>
                        </div>
                        {user?.role === 'ADMIN' && (
                          <button
                            onClick={() => handleRemoveEngineer(engId)}
                            disabled={isRem}
                            className="opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 rounded flex items-center justify-center text-gray-600 hover:text-red-400 disabled:opacity-40"
                          >
                            {isRem ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                          </button>
                        )}
                      </div>
                    );
                  })
                )}

                {user?.role === 'ADMIN' && (
                  <div className="pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    {engError && <p className="text-[10px] text-red-400 mb-2">{engError}</p>}
                    <div className="space-y-2">
                      <select
                        value={addRow.engineerId}
                        onChange={e => setAddRow(r => ({ ...r, engineerId: e.target.value }))}
                        className="w-full px-2.5 py-1.5 rounded-lg text-xs text-white outline-none"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
                      >
                        <option value="" style={{ background: '#070618' }}>Select engineer…</option>
                        {allEngineers
                          .filter(eng => !project.engineers.some(e => {
                            const a = typeof e.engineer === 'object' ? (e.engineer as User)._id : e.engineer;
                            return String(a) === String(eng._id);
                          }))
                          .map(eng => (
                            <option key={eng._id} value={eng._id} style={{ background: '#070618' }}>
                              {eng.name} ({eng.email})
                            </option>
                          ))}
                      </select>

                      <div className="flex gap-2">
                        <select
                          value={addRow.role}
                          onChange={e => setAddRow(r => ({ ...r, role: e.target.value as EngineerRole }))}
                          className="flex-1 px-2.5 py-1.5 rounded-lg text-xs text-white outline-none"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
                        >
                          <option value="LEAD_ENGINEER" style={{ background: '#070618' }}>Lead Engineer</option>
                          <option value="ENGINEER"      style={{ background: '#070618' }}>Engineer</option>
                          <option value="REVIEWER"      style={{ background: '#070618' }}>Reviewer</option>
                        </select>
                        <input
                          type="number" min={1} max={100} value={addRow.allocationPercentage}
                          onChange={e => setAddRow(r => ({ ...r, allocationPercentage: Number(e.target.value) }))}
                          placeholder="%" className="w-14 px-2.5 py-1.5 rounded-lg text-xs text-white outline-none text-center"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
                        />
                      </div>

                      <button
                        onClick={handleAddEngineer}
                        disabled={!addRow.engineerId || adding}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40 transition-all"
                        style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.25)' }}
                      >
                        {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                        {adding ? 'Adding…' : 'Add Engineer'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick links */}
          <div className="rounded-xl overflow-hidden"
               style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Quick Links</span>
            </div>
            <div className="px-4 py-3 space-y-1.5">
              {[
                { label: 'Timesheets',  to: `/timesheets/${project._id}` },
                { label: 'Payments',    to: `/payments?projectId=${project._id}` },
                ...(user?.role === 'ADMIN' ? [{ label: 'Edit Project', to: `/projects/${project._id}/edit` }] : []),
              ].map(({ label, to }) => (
                <Link
                  key={label}
                  to={to}
                  className="flex items-center justify-between px-3 py-2 rounded-lg text-xs text-gray-400 hover:text-gray-100 transition-colors"
                  style={{ background: 'rgba(255,255,255,0.03)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                >
                  {label}
                  <span className="text-gray-700">→</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Attachments (if any) */}
          {project.attachments?.length > 0 && (
            <div className="rounded-xl overflow-hidden"
                 style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Attachments</span>
              </div>
              <div className="px-4 py-3 space-y-2">
                {project.attachments.map((a, i) => (
                  <a key={i} href={a.url} target="_blank" rel="noreferrer"
                     className="flex items-center justify-between px-3 py-2 rounded-lg transition-colors"
                     style={{ background: 'rgba(255,255,255,0.03)' }}
                     onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                     onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-300 truncate">{a.originalName}</p>
                      <p className="text-[9px] text-gray-600">{a.fileType}</p>
                    </div>
                    <span className="text-[10px] text-indigo-400 flex-shrink-0 ml-2">Download</span>
                  </a>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
