import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, Trash2, Save, X, ChevronDown, AlertCircle,
  FileText, Filter,
} from 'lucide-react';
import api from '../api/axios';
import Header from '../components/layout/Header';
import ConfirmModal from '../components/ui/ConfirmModal';
import type { Payment, PaymentStatus, Project } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);
}

function toDateInput(iso?: string) {
  if (!iso) return '';
  return iso.slice(0, 10);
}

const STATUS_BADGE: Record<PaymentStatus, string> = {
  pending:  'badge badge-yellow',
  received: 'badge badge-green',
  overdue:  'badge badge-red',
  partial:  'badge badge-blue',
};

const STATUS_OPTIONS: PaymentStatus[] = ['pending', 'received', 'overdue', 'partial'];

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

// ─── Blank row shape for new-payment form ─────────────────────────────────────

interface FormRow {
  projectId:      string;
  invoiceNumber:  string;
  invoiceMonth:   string;
  paymentDate:    string;
  grossAmount:    string;
  tdsAmount:      string;
  currency:       string;
  paidToAccount:  string;
  referenceUTR:   string;
  notes:          string;
  status:         PaymentStatus;
}

function emptyForm(): FormRow {
  const now = new Date();
  return {
    projectId:     '',
    invoiceNumber: '',
    invoiceMonth:  `${MONTHS[now.getMonth()]} ${now.getFullYear()}`,
    paymentDate:   toDateInput(now.toISOString()),
    grossAmount:   '',
    tdsAmount:     '0',
    currency:      'USD',
    paidToAccount: '',
    referenceUTR:  '',
    notes:         '',
    status:        'pending',
  };
}

// ─── Inline edit row ──────────────────────────────────────────────────────────

interface EditingState {
  id:   string;
  data: Partial<FormRow>;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PaymentLog() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [payments,  setPayments]  = useState<Payment[]>([]);
  const [projects,  setProjects]  = useState<Project[]>([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [saving,    setSaving]    = useState(false);

  // Filter state
  const [filterStatus,  setFilterStatus]  = useState(searchParams.get('status') ?? '');
  const [filterProject, setFilterProject] = useState('');

  // New payment form (shown as first row when adding)
  const [showForm,  setShowForm]  = useState(false);
  const [form,      setForm]      = useState<FormRow>(emptyForm());
  const [formError, setFormError] = useState('');

  // Inline editing
  const [editing,   setEditing]   = useState<EditingState | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null);

  const LIMIT = 25;

  // ── Load payments ───────────────────────────────────────────────────────────
  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page',  String(page));
      params.set('limit', String(LIMIT));
      if (filterStatus)  params.set('status',    filterStatus);
      if (filterProject) params.set('projectId', filterProject);

      const res = await api.get(`/payments?${params.toString()}`);
      setPayments(res.data.payments);
      setTotal(res.data.total);
    } catch {
      setError('Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus, filterProject]);

  useEffect(() => { void fetchPayments(); }, [fetchPayments]);

  // Load projects for dropdown
  useEffect(() => {
    api.get('/projects').then((r) => setProjects(r.data.projects)).catch(() => {});
  }, []);

  // Sync URL filter param
  useEffect(() => {
    const params: Record<string, string> = {};
    if (filterStatus) params.status = filterStatus;
    setSearchParams(params, { replace: true });
  }, [filterStatus, setSearchParams]);

  // ── Create new payment ──────────────────────────────────────────────────────
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!form.projectId) { setFormError('Project is required'); return; }
    if (!form.grossAmount || isNaN(Number(form.grossAmount))) {
      setFormError('Gross amount must be a number'); return;
    }
    setSaving(true);
    try {
      await api.post('/payments', {
        ...form,
        grossAmount: Number(form.grossAmount),
        tdsAmount:   Number(form.tdsAmount) || 0,
      });
      setShowForm(false);
      setForm(emptyForm());
      void fetchPayments();
    } catch (err: any) {
      setFormError(err.response?.data?.message ?? 'Failed to create payment');
    } finally {
      setSaving(false);
    }
  }

  // ── Save inline edit ────────────────────────────────────────────────────────
  async function handleSaveEdit(paymentId: string) {
    if (!editing) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { ...editing.data };
      if (body.grossAmount) body.grossAmount = Number(body.grossAmount);
      if (body.tdsAmount)   body.tdsAmount   = Number(body.tdsAmount);
      await api.patch(`/payments/${paymentId}`, body);
      setEditing(null);
      void fetchPayments();
    } catch (err: any) {
      alert(err.response?.data?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/payments/${deleteTarget._id}`);
      setDeleteTarget(null);
      void fetchPayments();
    } catch {
      alert('Delete failed');
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────────
  const pages = Math.ceil(total / LIMIT);

  return (
    <div className="page-content">
      <Header
        title="Payment Log"
        subtitle={`${total} record${total !== 1 ? 's' : ''}`}
        actions={
          <button
            onClick={() => { setShowForm(true); setForm(emptyForm()); setFormError(''); }}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="h-4 w-4" /> Record Payment
          </button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mt-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-ink-400" />
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
            className="form-select text-sm py-1.5"
          >
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>
        <select
          value={filterProject}
          onChange={(e) => { setFilterProject(e.target.value); setPage(1); }}
          className="form-select text-sm py-1.5"
        >
          <option value="">All Projects</option>
          {projects.map(p => (
            <option key={p._id} value={p._id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 p-3 rounded-xl flex items-center gap-2 text-red-400 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)' }}>
          <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* New payment form */}
      {showForm && (
        <form onSubmit={handleCreate} className="mt-4 card">
          <div className="card-header flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink-100 flex items-center gap-2">
              <FileText className="h-4 w-4 text-brand-400" /> New Payment
            </h3>
            <button type="button" onClick={() => setShowForm(false)} className="btn-icon">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="card-body">
            {formError && (
              <p className="text-sm text-red-600 mb-3">{formError}</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="form-label">Project *</label>
                <select
                  required
                  value={form.projectId}
                  onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))}
                  className="form-select"
                >
                  <option value="">Select project…</option>
                  {projects.map(p => (
                    <option key={p._id} value={p._id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">Invoice Period *</label>
                <div className="flex gap-2">
                  <select
                    value={form.invoiceMonth.split(' ')[0]}
                    onChange={e => setForm(f => ({ ...f, invoiceMonth: `${e.target.value} ${f.invoiceMonth.split(' ')[1] ?? CURRENT_YEAR}` }))}
                    className="form-select"
                  >
                    {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <select
                    value={form.invoiceMonth.split(' ')[1] ?? CURRENT_YEAR}
                    onChange={e => setForm(f => ({ ...f, invoiceMonth: `${f.invoiceMonth.split(' ')[0]} ${e.target.value}` }))}
                    className="form-select w-28"
                  >
                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label">Invoice Number</label>
                <input
                  value={form.invoiceNumber}
                  onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))}
                  placeholder="INV-001"
                  className="form-input"
                />
              </div>

              <div>
                <label className="form-label">Payment / Due Date *</label>
                <input
                  type="date" required
                  value={form.paymentDate}
                  onChange={e => setForm(f => ({ ...f, paymentDate: e.target.value }))}
                  className="form-input"
                />
              </div>

              <div>
                <label className="form-label">Gross Amount *</label>
                <input
                  type="number" required min="0" step="0.01"
                  value={form.grossAmount}
                  onChange={e => setForm(f => ({ ...f, grossAmount: e.target.value }))}
                  placeholder="0.00"
                  className="form-input"
                />
              </div>

              <div>
                <label className="form-label">TDS Deducted</label>
                <input
                  type="number" min="0" step="0.01"
                  value={form.tdsAmount}
                  onChange={e => setForm(f => ({ ...f, tdsAmount: e.target.value }))}
                  placeholder="0.00"
                  className="form-input"
                />
              </div>

              <div>
                <label className="form-label">Currency</label>
                <select
                  value={form.currency}
                  onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                  className="form-select"
                >
                  {['USD','INR','EUR'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="form-label">Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value as PaymentStatus }))}
                  className="form-select"
                >
                  {STATUS_OPTIONS.map(s => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">Paid To Account</label>
                <input
                  value={form.paidToAccount}
                  onChange={e => setForm(f => ({ ...f, paidToAccount: e.target.value }))}
                  placeholder="Bank / Account name"
                  className="form-input"
                />
              </div>

              <div>
                <label className="form-label">Reference / UTR</label>
                <input
                  value={form.referenceUTR}
                  onChange={e => setForm(f => ({ ...f, referenceUTR: e.target.value }))}
                  placeholder="UTR / Transaction ID"
                  className="form-input"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="form-label">Notes</label>
                <input
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional notes"
                  className="form-input"
                />
              </div>
            </div>

            {/* Net preview */}
            {form.grossAmount && (
              <p className="mt-3 text-sm text-ink-300">
                Net payable:&nbsp;
                <strong>
                  {fmtCurrency(
                    Math.max(0, Number(form.grossAmount) - Number(form.tdsAmount || 0)),
                    form.currency
                  )}
                </strong>
              </p>
            )}

            <div className="flex gap-3 mt-5">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Saving…' : 'Save Payment'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="card mt-4">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-10 rounded" />)}
            </div>
          ) : payments.length === 0 ? (
            <div className="empty-state py-12">
              <FileText className="h-10 w-10 text-ink-500 mx-auto mb-3" />
              <p className="text-ink-300 font-medium">No payments found</p>
              <p className="text-ink-400 text-sm mt-1">
                {filterStatus || filterProject ? 'Try clearing the filters.' : 'Record the first payment to get started.'}
              </p>
            </div>
          ) : (
            <table className="data-table min-w-[900px]">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Period</th>
                  <th>Invoice #</th>
                  <th>Due / Paid Date</th>
                  <th className="text-right">Gross</th>
                  <th className="text-right">TDS</th>
                  <th className="text-right">Net Paid</th>
                  <th>Account</th>
                  <th>UTR / Ref</th>
                  <th>Status</th>
                  <th>Notes</th>
                  <th className="w-20">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const isEditing = editing?.id === p._id;
                  const project   = p.projectId as any;

                  return (
                    <tr key={p._id} className={isEditing ? 'bg-brand-600/10' : ''}>
                      {/* Project */}
                      <td className="font-medium text-ink-100 min-w-[130px]">
                        {project?.name ?? '—'}
                      </td>

                      {/* Invoice month */}
                      <td>
                        {isEditing ? (
                          <input
                            value={editing.data.invoiceMonth ?? p.invoiceMonth}
                            onChange={e => setEditing(prev => prev ? { ...prev, data: { ...prev.data, invoiceMonth: e.target.value } } : prev)}
                            className="form-input py-0.5 text-xs w-36"
                          />
                        ) : (
                          <span className="text-sm text-ink-200">{p.invoiceMonth}</span>
                        )}
                      </td>

                      {/* Invoice # */}
                      <td>
                        {isEditing ? (
                          <input
                            value={editing.data.invoiceNumber ?? p.invoiceNumber ?? ''}
                            onChange={e => setEditing(prev => prev ? { ...prev, data: { ...prev.data, invoiceNumber: e.target.value } } : prev)}
                            className="form-input py-0.5 text-xs w-24"
                          />
                        ) : (
                          <span className="text-xs text-ink-300">{p.invoiceNumber || '—'}</span>
                        )}
                      </td>

                      {/* Date */}
                      <td>
                        {isEditing ? (
                          <input
                            type="date"
                            value={editing.data.paymentDate ? toDateInput(editing.data.paymentDate) : toDateInput(p.paymentDate)}
                            onChange={e => setEditing(prev => prev ? { ...prev, data: { ...prev.data, paymentDate: e.target.value } } : prev)}
                            className="form-input py-0.5 text-xs w-36"
                          />
                        ) : (
                          <span className="text-sm text-ink-300">
                            {new Date(p.paymentDate).toLocaleDateString()}
                          </span>
                        )}
                      </td>

                      {/* Gross */}
                      <td className="text-right">
                        {isEditing ? (
                          <input
                            type="number" min="0" step="0.01"
                            value={editing.data.grossAmount ?? p.grossAmount}
                            onChange={e => setEditing(prev => prev ? { ...prev, data: { ...prev.data, grossAmount: e.target.value } } : prev)}
                            className="form-input py-0.5 text-xs text-right w-24"
                          />
                        ) : (
                          <span className="font-mono text-sm text-ink-100">
                            {fmtCurrency(p.grossAmount, p.currency)}
                          </span>
                        )}
                      </td>

                      {/* TDS */}
                      <td className="text-right">
                        {isEditing ? (
                          <input
                            type="number" min="0" step="0.01"
                            value={editing.data.tdsAmount ?? p.tdsAmount}
                            onChange={e => setEditing(prev => prev ? { ...prev, data: { ...prev.data, tdsAmount: e.target.value } } : prev)}
                            className="form-input py-0.5 text-xs text-right w-24"
                          />
                        ) : (
                          <span className="font-mono text-sm text-ink-400">
                            {p.tdsAmount > 0 ? fmtCurrency(p.tdsAmount, p.currency) : '—'}
                          </span>
                        )}
                      </td>

                      {/* Net */}
                      <td className="text-right">
                        <span className="font-mono text-sm font-semibold text-ink-100">
                          {fmtCurrency(p.netAmount, p.currency)}
                        </span>
                      </td>

                      {/* Account */}
                      <td>
                        {isEditing ? (
                          <input
                            value={editing.data.paidToAccount ?? p.paidToAccount ?? ''}
                            onChange={e => setEditing(prev => prev ? { ...prev, data: { ...prev.data, paidToAccount: e.target.value } } : prev)}
                            className="form-input py-0.5 text-xs w-28"
                          />
                        ) : (
                          <span className="text-xs text-ink-300 min-w-[80px]">
                            {p.paidToAccount || '—'}
                          </span>
                        )}
                      </td>

                      {/* UTR */}
                      <td>
                        {isEditing ? (
                          <input
                            value={editing.data.referenceUTR ?? p.referenceUTR ?? ''}
                            onChange={e => setEditing(prev => prev ? { ...prev, data: { ...prev.data, referenceUTR: e.target.value } } : prev)}
                            className="form-input py-0.5 text-xs w-28"
                          />
                        ) : (
                          <span className="text-xs font-mono text-ink-300 min-w-[80px]">
                            {p.referenceUTR || '—'}
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td>
                        {isEditing ? (
                          <select
                            value={editing.data.status ?? p.status}
                            onChange={e => setEditing(prev => prev ? { ...prev, data: { ...prev.data, status: e.target.value as PaymentStatus } } : prev)}
                            className="form-select py-0.5 text-xs"
                          >
                            {STATUS_OPTIONS.map(s => (
                              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={STATUS_BADGE[p.status] ?? 'badge badge-gray'}>
                            {p.status}
                          </span>
                        )}
                      </td>

                      {/* Notes */}
                      <td>
                        {isEditing ? (
                          <input
                            value={editing.data.notes ?? p.notes ?? ''}
                            onChange={e => setEditing(prev => prev ? { ...prev, data: { ...prev.data, notes: e.target.value } } : prev)}
                            className="form-input py-0.5 text-xs w-32"
                          />
                        ) : (
                          <span className="text-xs text-ink-400 min-w-[80px]" title={p.notes}>
                            {p.notes || '—'}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td>
                        <div className="flex items-center gap-1">
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => handleSaveEdit(p._id)}
                                disabled={saving}
                                className="btn-icon text-emerald-400 hover:bg-emerald-500/10"
                                title="Save"
                              >
                                <Save className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setEditing(null)}
                                className="btn-icon text-ink-400"
                                title="Cancel"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => setEditing({ id: p._id, data: {} })}
                                className="btn-icon text-brand-400 hover:bg-brand-500/10"
                                title="Edit"
                              >
                                <ChevronDown className="h-3.5 w-3.5 rotate-[-90deg]" />
                              </button>
                              <button
                                onClick={() => setDeleteTarget(p)}
                                className="btn-icon text-red-400 hover:bg-red-500/10"
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-xs text-ink-400">
              Page {page} of {pages} · {total} total
            </p>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="btn-secondary text-xs py-1 px-3 disabled:opacity-40"
              >
                Prev
              </button>
              <button
                disabled={page >= pages}
                onClick={() => setPage(p => p + 1)}
                className="btn-secondary text-xs py-1 px-3 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete modal */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Payment"
        description={`Delete payment for "${deleteTarget?.invoiceMonth}"? This action cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}