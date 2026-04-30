/**
 * PaymentHistory — Customer-facing read-only view of payments for their projects.
 * Accessed at /payments/history.
 * Engineers are redirected away at route level.
 */
import { useEffect, useState } from 'react';
import { DollarSign, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import api from '../api/axios';
import Header from '../components/layout/Header';
import type { Payment, Project } from '../types';

function fmtCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

const STATUS_BADGE: Record<string, string> = {
  pending:  'badge badge-yellow',
  received: 'badge badge-green',
  overdue:  'badge badge-red',
  partial:  'badge badge-blue',
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending:  <Clock className="h-4 w-4 text-amber-500" />,
  received: <CheckCircle className="h-4 w-4 text-emerald-500" />,
  overdue:  <AlertCircle className="h-4 w-4 text-red-500" />,
  partial:  <DollarSign className="h-4 w-4 text-blue-500" />,
};

export default function PaymentHistory() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [selectedProject, setSelectedProject] = useState('');

  // Load projects this customer has access to (canViewPayments)
  useEffect(() => {
    api.get('/projects')
      .then(r => {
        const accessible = (r.data.projects as Project[]).filter(p => p.canViewPayments);
        setProjects(accessible);
        if (accessible.length > 0) setSelectedProject(accessible[0]._id);
      })
      .catch(() => setError('Failed to load projects'));
  }, []);

  // Load payments whenever selected project changes
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
    <div className="page-content">
      <Header title="Payment History" subtitle="View payment records for your projects" />

      {error && (
        <div className="mt-4 p-3 rounded-lg flex items-center gap-2 text-red-400 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)' }}>
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      {projects.length === 0 && !loading ? (
        <div className="empty-state mt-10">
          <DollarSign className="h-10 w-10 text-ink-500 mx-auto mb-3" />
          <p className="text-ink-300 font-medium">No payment access enabled</p>
          <p className="text-ink-400 text-sm mt-1">Contact your project manager to enable payment visibility.</p>
        </div>
      ) : (
        <>
          {/* Project selector */}
          {projects.length > 1 && (
            <div className="mt-4">
              <label className="form-label">Project</label>
              <select
                value={selectedProject}
                onChange={e => setSelectedProject(e.target.value)}
                className="form-select max-w-xs"
              >
                {projects.map(p => (
                  <option key={p._id} value={p._id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Summary cards */}
          {!loading && payments.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
              <div className="stat-card">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Total Received</p>
                    <p className="text-2xl font-bold mt-1 text-emerald-400">{fmtCurrency(totalReceived, currency)}</p>
                  </div>
                  <div className="bg-emerald-500/15 rounded-xl p-2.5">
                    <CheckCircle className="h-5 w-5 text-emerald-400" />
                  </div>
                </div>
              </div>
              <div className="stat-card">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Pending / Overdue</p>
                    <p className="text-2xl font-bold mt-1 text-amber-400">{fmtCurrency(totalPending, currency)}</p>
                  </div>
                  <div className="bg-amber-500/15 rounded-xl p-2.5">
                    <Clock className="h-5 w-5 text-amber-400" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Payment list */}
          <div className="card mt-6">
            {loading ? (
              <div className="p-6 space-y-3">
                {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-10 rounded" />)}
              </div>
            ) : payments.length === 0 ? (
              <div className="empty-state py-10">
                <DollarSign className="h-8 w-8 text-ink-500 mx-auto mb-2" />
                <p className="text-ink-400 text-sm">No payment records for this project</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Period</th>
                      <th>Invoice #</th>
                      <th>Date</th>
                      <th className="text-right">Gross</th>
                      <th className="text-right">TDS</th>
                      <th className="text-right">Net Paid</th>
                      <th>Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p._id}>
                        <td>
                          <div className="flex items-center gap-1.5">
                            {STATUS_ICON[p.status]}
                            <span className={STATUS_BADGE[p.status] ?? 'badge badge-gray'}>
                              {p.status}
                            </span>
                          </div>
                        </td>
                        <td className="font-medium text-ink-100">{p.invoiceMonth ?? 'N/A'}</td>
                        <td className="text-sm text-ink-400">{p.invoiceNumber || '—'}</td>
                        <td className="text-sm text-ink-300">
                          {new Date(p.paymentDate).toLocaleDateString()}
                        </td>
                        <td className="text-right font-mono text-sm text-ink-200">
                          {fmtCurrency(p.grossAmount, p.currency)}
                        </td>
                        <td className="text-right font-mono text-sm text-ink-400">
                          {p.tdsAmount > 0 ? fmtCurrency(p.tdsAmount, p.currency) : '—'}
                        </td>
                        <td className="text-right font-mono text-sm font-semibold text-ink-100">
                          {fmtCurrency(p.netAmount, p.currency)}
                        </td>
                        <td className="text-xs font-mono text-ink-400 min-w-[80px]">
                          {p.referenceUTR || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Totals row */}
                  <tfoot>
                    <tr className="font-semibold" style={{ background: 'rgba(255,255,255,0.05)', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                      <td colSpan={4} className="text-sm text-ink-200">Totals</td>
                      <td className="text-right font-mono text-sm text-ink-200">
                        {fmtCurrency(payments.reduce((s, p) => s + p.grossAmount, 0), currency)}
                      </td>
                      <td className="text-right font-mono text-sm text-ink-400">
                        {fmtCurrency(payments.reduce((s, p) => s + p.tdsAmount, 0), currency)}
                      </td>
                      <td className="text-right font-mono text-sm text-ink-100">
                        {fmtCurrency(payments.reduce((s, p) => s + p.netAmount, 0), currency)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}