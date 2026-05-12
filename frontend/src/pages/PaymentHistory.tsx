/**
 * PaymentHistory — Customer-facing read-only view of payments for their projects.
 * Accessed at /payments/history.
 * Engineers are redirected away at route level.
 */
import { useEffect, useState } from 'react';
import { DollarSign, AlertCircle, CheckCircle, Clock, FolderKanban } from 'lucide-react';
import api from '../api/axios';
import Header from '../components/layout/Header';
import type { Payment, Project } from '../types';

function fmtCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

const STATUS_CFG = {
  pending:  { bg: 'rgba(251,191,36,0.12)',  text: '#fbbf24', border: 'rgba(251,191,36,0.2)'  },
  received: { bg: 'rgba(74,222,128,0.12)',  text: '#4ade80', border: 'rgba(74,222,128,0.2)'  },
  overdue:  { bg: 'rgba(239,68,68,0.12)',   text: '#f87171', border: 'rgba(239,68,68,0.2)'   },
  partial:  { bg: 'rgba(99,102,241,0.12)',  text: '#818cf8', border: 'rgba(99,102,241,0.2)'  },
} as const;

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CFG[status as keyof typeof STATUS_CFG] ?? STATUS_CFG.pending;
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
          style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
      {status}
    </span>
  );
}

export default function PaymentHistory() {
  const [payments,         setPayments]        = useState<Payment[]>([]);
  const [projects,         setProjects]        = useState<Project[]>([]);
  const [loading,          setLoading]         = useState(true);
  const [error,            setError]           = useState('');
  const [selectedProject, setSelectedProject] = useState('');

  useEffect(() => {
    api.get('/projects')
      .then(r => {
        const accessible = (r.data.projects as Project[]).filter(p => p.canViewPayments);
        setProjects(accessible);
        if (accessible.length > 0) setSelectedProject(accessible[0]._id);
      })
      .catch(() => setError('Failed to load projects'));
  }, []);

  useEffect(() => {
    if (!selectedProject) { setLoading(false); return; }
    setLoading(true);
    api.get(`/payments/project/${selectedProject}`)
      .then(r => setPayments(r.data.payments))
      .catch(() => setError('Failed to load payment history'))
      .finally(() => setLoading(false));
  }, [selectedProject]);

  const totalReceived = payments.filter(p => p.status === 'received').reduce((s, p) => s + p.netAmount, 0);
  const totalPending  = payments.filter(p => p.status !== 'received').reduce((s, p) => s + p.grossAmount, 0);
  const currency      = payments[0]?.currency ?? 'USD';

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#050816' }}>
      <Header title="Payment History" subtitle="View payment records for your projects" />

      <div className="px-4 pt-4 space-y-4">

        {error && (
          <div className="rounded-lg p-3 flex items-center gap-2 text-red-400 text-sm"
               style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)' }}>
            <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
          </div>
        )}

        {projects.length === 0 && !loading ? (
          <div className="rounded-xl py-20 text-center"
               style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <FolderKanban className="h-8 w-8 text-gray-700 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-400">No payment access enabled</p>
            <p className="text-xs text-gray-600 mt-1">Contact your project manager to enable payment visibility.</p>
          </div>
        ) : (
          <>
            {/* Project selector + stat pills */}
            <div className="rounded-xl px-4 py-3"
                 style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {projects.length > 1 && (
                <div className="mb-3 flex items-center gap-3">
                  <span className="text-[10px] text-gray-600 uppercase tracking-widest font-semibold">Project</span>
                  <select
                    value={selectedProject}
                    onChange={e => setSelectedProject(e.target.value)}
                    className="text-xs text-gray-300 rounded-lg px-2 py-1 outline-none"
                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
                  >
                    {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                  </select>
                </div>
              )}
              {!loading && payments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                       style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)' }}>
                    <CheckCircle className="h-3.5 w-3.5" style={{ color: '#4ade80' }} />
                    <span className="text-sm font-bold text-white tabular-nums">{fmtCurrency(totalReceived, currency)}</span>
                    <span className="text-[10px] text-gray-500">Received</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                       style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)' }}>
                    <Clock className="h-3.5 w-3.5" style={{ color: '#fbbf24' }} />
                    <span className="text-sm font-bold text-white tabular-nums">{fmtCurrency(totalPending, currency)}</span>
                    <span className="text-[10px] text-gray-500">Pending / Overdue</span>
                  </div>
                </div>
              )}
            </div>

            {/* Payment table */}
            <div className="rounded-xl overflow-hidden"
                 style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-3.5 w-3.5 text-gray-400" />
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Payment Records</span>
                  {!loading && <span className="text-[10px] text-gray-700">{payments.length} records</span>}
                </div>
              </div>

              {loading ? (
                <div className="p-4 space-y-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-10 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
                  ))}
                </div>
              ) : payments.length === 0 ? (
                <div className="py-10 text-center">
                  <DollarSign className="h-7 w-7 text-gray-700 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No payment records for this project</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px]">
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.015)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <th className="px-4 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest">Status</th>
                        <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest">Period</th>
                        <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest hidden sm:table-cell">Invoice #</th>
                        <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest hidden md:table-cell">Date</th>
                        <th className="px-3 py-2 text-right text-[9px] font-semibold text-gray-700 uppercase tracking-widest">Gross</th>
                        <th className="px-3 py-2 text-right text-[9px] font-semibold text-gray-700 uppercase tracking-widest hidden sm:table-cell">TDS</th>
                        <th className="px-3 py-2 text-right text-[9px] font-semibold text-gray-700 uppercase tracking-widest">Net Paid</th>
                        <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest hidden lg:table-cell">Ref</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <td className="px-4 py-2.5"><StatusBadge status={p.status} /></td>
                          <td className="px-3 py-2.5">
                            <span className="text-xs font-medium text-gray-200">{p.invoiceMonth ?? 'N/A'}</span>
                          </td>
                          <td className="px-3 py-2.5 hidden sm:table-cell">
                            <code className="text-[10px] font-mono text-gray-600">{p.invoiceNumber || '—'}</code>
                          </td>
                          <td className="px-3 py-2.5 hidden md:table-cell">
                            <span className="text-[11px] text-gray-500 tabular-nums">
                              {new Date(p.paymentDate).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <span className="text-xs font-mono text-gray-300">{fmtCurrency(p.grossAmount, p.currency)}</span>
                          </td>
                          <td className="px-3 py-2.5 text-right hidden sm:table-cell">
                            <span className="text-xs font-mono text-gray-500">{p.tdsAmount > 0 ? fmtCurrency(p.tdsAmount, p.currency) : '—'}</span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <span className="text-xs font-mono font-semibold text-gray-100">{fmtCurrency(p.netAmount, p.currency)}</span>
                          </td>
                          <td className="px-3 py-2.5 hidden lg:table-cell">
                            <code className="text-[10px] font-mono text-gray-600">{p.referenceUTR || '—'}</code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: 'rgba(255,255,255,0.03)', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                        <td className="px-4 py-2 text-xs font-semibold text-gray-400">Totals</td>
                        <td className="px-3 py-2" />
                        <td className="px-3 py-2 hidden sm:table-cell" />
                        <td className="px-3 py-2 hidden md:table-cell" />
                        <td className="px-3 py-2 text-right font-mono text-xs text-gray-300">
                          {fmtCurrency(payments.reduce((s, p) => s + p.grossAmount, 0), currency)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-gray-500 hidden sm:table-cell">
                          {fmtCurrency(payments.reduce((s, p) => s + p.tdsAmount, 0), currency)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-gray-100">
                          {fmtCurrency(payments.reduce((s, p) => s + p.netAmount, 0), currency)}
                        </td>
                        <td className="hidden lg:table-cell" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
