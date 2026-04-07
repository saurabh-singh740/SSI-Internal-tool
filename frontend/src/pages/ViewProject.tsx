import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Pencil, Calendar, Users, Clock, DollarSign,
  Shield, FileText, Paperclip, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import api from '../api/axios';
import { Project, User } from '../types';
import Header from '../components/layout/Header';
import { useAuth } from '../context/AuthContext';
import { clsx } from 'clsx';

const fmt = (d?: string) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const fmtNum = (n: number) => n.toLocaleString();

const Badge = ({ value, colorMap }: { value: string; colorMap: Record<string, string> }) => (
  <span className={clsx('inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium', colorMap[value] || 'bg-white/10 text-ink-300')}>
    {value.replace(/_/g, ' ')}
  </span>
);

const InfoRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex justify-between py-2.5 last:border-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
    <span className="text-sm text-ink-400">{label}</span>
    <span className="text-sm font-medium text-ink-100 text-right max-w-xs">{value || '—'}</span>
  </div>
);

export default function ViewProject() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/projects/${id}`).then((res) => setProject(res.data.project)).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-8 text-center text-ink-400">Loading…</div>;
  if (!project) return <div className="p-8 text-center text-red-400">Project not found.</div>;

  const util = project.totalAuthorizedHours > 0
    ? Math.round((project.hoursUsed / project.totalAuthorizedHours) * 100)
    : 0;
  const remaining = project.totalAuthorizedHours - project.hoursUsed;

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-emerald-500/15 text-emerald-400', CLOSED: 'bg-white/10 text-ink-300', ON_HOLD: 'bg-amber-500/15 text-amber-400',
  };
  const phaseColors: Record<string, string> = {
    PLANNING: 'bg-blue-500/15 text-blue-400', EXECUTION: 'bg-purple-500/15 text-purple-400',
    DELIVERY: 'bg-emerald-500/15 text-emerald-400', MAINTENANCE: 'bg-orange-500/15 text-orange-400',
  };

  return (
    <div>
      <Header
        title={project.name}
        subtitle={project.code}
      />
      <div className="p-6 space-y-5">
        {/* Breadcrumb + Actions */}
        <div className="flex items-center justify-between">
          <Link to="/projects" className="flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink-200 transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to Projects
          </Link>
          <div className="flex items-center gap-2">
            <Badge value={project.status} colorMap={statusColors} />
            <Badge value={project.phase} colorMap={phaseColors} />
            {project.isNearLimit && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                <AlertTriangle className="h-3 w-3" /> Near Limit
              </span>
            )}
            {user?.role === 'ADMIN' && (
              <Link to={`/projects/${project._id}/edit`} className="btn-secondary text-xs py-1.5">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Link>
            )}
          </div>
        </div>

        {/* Metrics Bar */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Hours Used', value: `${fmtNum(project.hoursUsed)} h`, icon: Clock, color: 'text-blue-400 bg-blue-500/15' },
            { label: 'Remaining Hours', value: `${fmtNum(remaining)} h`, icon: CheckCircle2, color: 'text-emerald-400 bg-emerald-500/15' },
            { label: 'Total Authorized', value: `${fmtNum(project.totalAuthorizedHours)} h`, icon: FileText, color: 'text-purple-400 bg-purple-500/15' },
            { label: 'Utilization', value: `${util}%`, icon: AlertTriangle, color: util >= 90 ? 'text-red-400 bg-red-500/15' : 'text-amber-400 bg-amber-500/15' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-ink-400">{label}</p>
                <div className={clsx('p-1.5 rounded-lg', color)}><Icon className="h-3.5 w-3.5" /></div>
              </div>
              <p className="text-xl font-bold text-ink-100">{value}</p>
            </div>
          ))}
        </div>

        {/* Utilization bar */}
        <div className="card p-5">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium text-ink-200">Hour Utilization</span>
            <span className="text-ink-400">{project.hoursUsed} / {project.totalAuthorizedHours} hours ({util}%)</span>
          </div>
          <div className="h-3 bg-white/10 rounded-full overflow-hidden">
            <div
              className={clsx('h-3 rounded-full transition-all', util >= 90 ? 'bg-red-500' : util >= project.alertThreshold ? 'bg-amber-500' : 'bg-green-500')}
              style={{ width: `${Math.min(util, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-ink-400 mt-1">
            <span>0</span>
            <span className="text-amber-400">Alert at {project.alertThreshold}%</span>
            <span>{project.maxAllowedHours} max</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Basic Info */}
          <div className="card p-5">
            <h3 className="section-title flex items-center gap-2"><FileText className="h-4 w-4 text-ink-400" /> Project Info</h3>
            <InfoRow label="Project Name" value={project.name} />
            <InfoRow label="Code / SOW" value={<span className="font-mono">{project.code}</span>} />
            <InfoRow label="Type" value={project.type.replace('_', ' ')} />
            <InfoRow label="Category" value={project.category} />
            <InfoRow label="Description" value={project.description} />
          </div>

          {/* Client Info */}
          <div className="card p-5">
            <h3 className="section-title flex items-center gap-2"><Users className="h-4 w-4 text-ink-400" /> Client & Leadership</h3>
            <InfoRow label="Client Name" value={project.clientName} />
            <InfoRow label="Company" value={project.clientCompany} />
            <InfoRow label="Client Email" value={project.clientEmail} />
            <InfoRow label="Client Phone" value={project.clientPhone} />

          </div>

          {/* Timeline */}
          <div className="card p-5">
            <h3 className="section-title flex items-center gap-2"><Calendar className="h-4 w-4 text-ink-400" /> Timeline</h3>
            <InfoRow label="Start Date" value={fmt(project.startDate)} />
            <InfoRow label="End Date" value={fmt(project.endDate)} />
            <InfoRow label="Est. Completion" value={fmt(project.estimatedCompletionDate)} />
            <InfoRow label="Phase" value={project.phase} />
          </div>

          {/* Billing */}
          <div className="card p-5">
            <h3 className="section-title flex items-center gap-2"><DollarSign className="h-4 w-4 text-ink-400" /> Billing</h3>
            <InfoRow label="Contracted Hours" value={`${fmtNum(project.contractedHours)} h`} />
            <InfoRow label="Additional Hours" value={`${fmtNum(project.additionalApprovedHours)} h`} />
            <InfoRow label="Total Authorized" value={`${fmtNum(project.totalAuthorizedHours)} h`} />
            <InfoRow label="Hourly Rate" value={`${project.currency} ${project.hourlyRate}/hr`} />
            <InfoRow label="Billing Type" value={project.billingType.replace(/_/g, ' ')} />
            <InfoRow label="Billing Cycle" value={project.billingCycle.replace(/_/g, ' ')} />
          </div>

          {/* Payment */}
          <div className="card p-5">
            <h3 className="section-title flex items-center gap-2"><DollarSign className="h-4 w-4 text-ink-400" /> Payment</h3>
            <InfoRow label="Payment Terms" value={project.paymentTerms.replace('_', ' ')} />
            <InfoRow label="TDS %" value={`${project.tdsPercentage}%`} />
            <InfoRow label="Payment Mode" value={project.paymentMode.replace(/_/g, ' ')} />
            <InfoRow label="Billing Contact" value={project.billingContactEmail} />
          </div>

          {/* Access & Permissions */}
          <div className="card p-5">
            <h3 className="section-title flex items-center gap-2"><Shield className="h-4 w-4 text-ink-400" /> Access & Permissions</h3>
            <InfoRow label="Client Portal" value={project.clientAccessEnabled ? '✅ Enabled' : '❌ Disabled'} />
            <InfoRow label="View Summary" value={project.canViewSummary ? 'Yes' : 'No'} />
            <InfoRow label="View Timesheets" value={project.canViewTimesheets ? 'Yes' : 'No'} />
            <InfoRow label="View Payments" value={project.canViewPayments ? 'Yes' : 'No'} />
            <InfoRow label="Engineers Edit Timesheets" value={project.engineersCanEditTimesheets ? 'Yes' : 'No'} />
            <InfoRow label="Approval Required" value={project.timesheetApprovalRequired ? 'Yes' : 'No'} />
            <InfoRow label="Lock Period" value={`${project.timesheetLockPeriod} days`} />
          </div>
        </div>

        {/* Engineers */}
        {project.engineers?.length > 0 && (
          <div className="card p-5">
            <h3 className="section-title flex items-center gap-2"><Users className="h-4 w-4 text-ink-400" /> Assigned Engineers</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-ink-400 text-xs uppercase" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <th className="text-left py-2">Name</th>
                    <th className="text-left py-2">Email</th>
                    <th className="text-left py-2">Role</th>
                    <th className="text-right py-2">Allocation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {project.engineers.map((e, i) => {
                    const eng = e.engineer as User;
                    return (
                      <tr key={i}>
                        <td className="py-2.5 font-medium text-ink-100">{eng?.name ?? '—'}</td>
                        <td className="py-2.5 text-ink-400">{eng?.email ?? '—'}</td>
                        <td className="py-2.5">
                          <span className="px-2 py-0.5 bg-blue-500/15 text-blue-400 rounded-full text-xs">{e.role.replace(/_/g, ' ')}</span>
                        </td>
                        <td className="py-2.5 text-right font-semibold text-ink-200">{e.allocationPercentage}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Custom Fields */}
        {project.customFields?.length > 0 && (
          <div className="card p-5">
            <h3 className="section-title">Custom Fields</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {project.customFields.map((cf, i) => (
                <div key={i} className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <p className="text-xs text-ink-400 mb-0.5">{cf.name} <span className="text-ink-500">({cf.type})</span></p>
                  <p className="text-sm font-medium text-ink-100">{cf.value || '—'}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {project.notes && (
          <div className="card p-5">
            <h3 className="section-title flex items-center gap-2"><FileText className="h-4 w-4 text-gray-400" /> Notes</h3>
            <p className="text-sm text-ink-300 whitespace-pre-wrap">{project.notes}</p>
          </div>
        )}

        {/* Attachments */}
        {project.attachments?.length > 0 && (
          <div className="card p-5">
            <h3 className="section-title flex items-center gap-2"><Paperclip className="h-4 w-4 text-gray-400" /> Attachments</h3>
            <div className="space-y-2">
              {project.attachments.map((a, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div>
                    <p className="text-sm font-medium text-ink-100">{a.originalName}</p>
                    <p className="text-xs text-ink-400">{a.fileType} • {new Date(a.uploadedAt).toLocaleDateString()}</p>
                  </div>
                  <a href={a.url} target="_blank" rel="noreferrer" className="text-brand-400 text-xs hover:underline">Download</a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}