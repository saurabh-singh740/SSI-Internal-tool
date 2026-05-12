import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, Trash2, Save, X, AlertCircle, FileText, Filter,
  RefreshCw, ChevronLeft, ChevronRight, Pencil,
} from 'lucide-react';
import api from '../api/axios';
import Header from '../components/layout/Header';
import ConfirmModal from '../components/ui/ConfirmModal';
import type { Payment, PaymentStatus, Project } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);
}

function toDateInput(iso?: string) {
  if (!iso) return '';
  return iso.slice(0, 10);
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
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide leading-none"
          style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
      {status}
    </span>
  );
}

const STATUS_OPTIONS: PaymentStatus[] = ['pending', 'received', 'overdue', 'partial'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

interface FormRow {
  projectId: string; invoiceNumber: string; invoiceMonth: string;
  paymentDate: string; grossAmount: string; tdsAmount: string;
  currency: string; paidToAccount: string; referenceUTR: string;
  notes: string; status: PaymentStatus;
}

function emptyForm(): FormRow {
  const now = new Date();
  return {
    projectId: '', invoiceNumber: '', invoiceMonth: `${MONTHS[now.getMonth()]} ${now.getFullYear()}`,
    paymentDate: toDateInput(now.toISOString()), grossAmount: '', tdsAmount: '0',
    currency: 'USD', paidToAccount: '', referenceUTR: '', notes: '', status: 'pending',
  };
}

interface EditingState { id: string; data: Partial<FormRow>; }

// ── New payment side drawer ───────────────────────────────────────────────────

function NewPaymentDrawer({
  open, onClose, projects, onSaved,
}: { open: boolean; onClose: () => void; projects: Project[]; onSaved: () => void }) {
  const [form, setForm] = useState<FormRow>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    if (open) { setForm(emptyForm()); setError(''); }
  }, [open]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.projectId) { setError('Project is required'); return; }
    if (!form.grossAmount || isNaN(Number(form.grossAmount))) { setError('Gross amount must be a number'); return; }
    setSaving(true);
    try {
      await api.post('/payments', { ...form, grossAmount: Number(form.grossAmount), tdsAmount: Number(form.tdsAmount) || 0 });
      onSaved(); onClose();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to create payment');
    } finally { setSaving(false); }
  };

  if (!open) return null;

  const fieldCls = 'w-full px-3 py-1.5 rounded-lg text-xs text-white placeholder-gray-700 outline-none';
  const fieldStyle = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' };
  const labelCls = 'block text-[9px] font-semibold text-gray-600 uppercase tracking-widest mb-1.5';

  const net = Math.max(0, Number(form.grossAmount) - Number(form.tdsAmount || 0));

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />
      <div
        className="fixed right-0 top-0 h-full z-50 flex flex-col overflow-hidden"
        style={{
          width: 'min(440px, 100vw)',
          background: 'rgba(7,6,24,0.97)',
          borderLeft: '1px solid rgba(255,255,255,0.09)',
          backdropFilter: 'blur(24px)',
        }}
      >
        <div className="px-5 py-4 flex-shrink-0 flex items-center justify-between"
             style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div>
            <p className="text-sm font-bold text-gray-100">Record Payment</p>
            <p className="text-[10px] text-gray-600 mt-0.5">Add a new payment entry</p>
          </div>
          <button onClick={onClose}
                  className="h-6 w-6 rounded flex items-center justify-center text-gray-500 hover:text-white"
                  style={{ background: 'rgba(255,255,255,0.06)' }}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <form onSubmit={handleCreate} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {error && (
            <div className="px-3 py-2 rounded-lg text-xs text-red-400"
                 style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)' }}>
              {error}
            </div>
          )}

          <div>
            <label className={labelCls}>Project *</label>
            <select required value={form.projectId}
                    onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))}
                    className={fieldCls} style={{ ...fieldStyle, color: form.projectId ? 'white' : '#4b5563' }}>
              <option value="" style={{ background: '#070618' }}>Select project…</option>
              {projects.map(p => <option key={p._id} value={p._id} style={{ background: '#070618' }}>{p.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Month *</label>
              <select value={form.invoiceMonth.split(' ')[0]}
                      onChange={e => setForm(f => ({ ...f, invoiceMonth: `${e.target.value} ${f.invoiceMonth.split(' ')[1] ?? CURRENT_YEAR}` }))}
                      className={fieldCls} style={{ ...fieldStyle, color: 'white' }}>
                {MONTHS.map(m => <option key={m} value={m} style={{ background: '#070618' }}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Year</label>
              <select value={form.invoiceMonth.split(' ')[1] ?? CURRENT_YEAR}
                      onChange={e => setForm(f => ({ ...f, invoiceMonth: `${f.invoiceMonth.split(' ')[0]} ${e.target.value}` }))}
                      className={fieldCls} style={{ ...fieldStyle, color: 'white' }}>
                {YEARS.map(y => <option key={y} value={y} style={{ background: '#070618' }}>{y}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Invoice #</label>
              <input className={fieldCls} style={fieldStyle}
                     value={form.invoiceNumber}
                     onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))}
                     placeholder="INV-001" />
            </div>
            <div>
              <label className={labelCls}>Payment Date *</label>
              <input type="date" required className={fieldCls} style={{ ...fieldStyle, colorScheme: 'dark' }}
                     value={form.paymentDate}
                     onChange={e => setForm(f => ({ ...f, paymentDate: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Gross Amount *</label>
              <input type="number" required min="0" step="0.01" className={fieldCls} style={fieldStyle}
                     value={form.grossAmount}
                     onChange={e => setForm(f => ({ ...f, grossAmount: e.target.value }))}
                     placeholder="0.00" />
            </div>
            <div>
              <label className={labelCls}>Currency</label>
              <select value={form.currency}
                      onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                      className={fieldCls} style={{ ...fieldStyle, color: 'white' }}>
                {['USD','INR','EUR'].map(c => <option key={c} value={c} style={{ background: '#070618' }}>{c}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>TDS Deducted</label>
            <input type="number" min="0" step="0.01" className={fieldCls} style={fieldStyle}
                   value={form.tdsAmount}
                   onChange={e => setForm(f => ({ ...f, tdsAmount: e.target.value }))}
                   placeholder="0.00" />
          </div>

          {form.grossAmount && (
            <div className="flex items-center justify-between px-3 py-2 rounded-lg"
                 style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}>
              <span className="text-[10px] text-gray-500">Net payable</span>
              <span className="text-sm font-bold text-indigo-300">{fmtCurrency(net, form.currency)}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Paid To Account</label>
              <input className={fieldCls} style={fieldStyle}
                     value={form.paidToAccount}
                     onChange={e => setForm(f => ({ ...f, paidToAccount: e.target.value }))}
                     placeholder="Bank / Account" />
            </div>
            <div>
              <label className={labelCls}>Reference / UTR</label>
              <input className={fieldCls} style={fieldStyle}
                     value={form.referenceUTR}
                     onChange={e => setForm(f => ({ ...f, referenceUTR: e.target.value }))}
                     placeholder="UTR / Txn ID" />
            </div>
          </div>

          <div>
            <label className={labelCls}>Status</label>
            <select value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value as PaymentStatus }))}
                    className={fieldCls} style={{ ...fieldStyle, color: 'white' }}>
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s} style={{ background: '#070618' }}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Notes</label>
            <input className={fieldCls} style={fieldStyle}
                   value={form.notes}
                   onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                   placeholder="Optional notes" />
          </div>
        </form>

        <div className="px-5 py-3 flex gap-2 flex-shrink-0"
             style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button type="button" onClick={onClose}
                  className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white transition-colors"
                  style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            Cancel
          </button>
          <button
            onClick={handleCreate as any}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)' }}
          >
            {saving ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Saving…</> : 'Save Payment'}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PaymentLog() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [payments,  setPayments]  = useState<Payment[]>([]);
  const [projects,  setProjects]  = useState<Project[]>([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [saving,    setSaving]    = useState(false);

  const [filterStatus,  setFilterStatus]  = useState(searchParams.get('status') ?? '');
  const [filterProject, setFilterProject] = useState('');
  const [showNewPayment, setShowNew]      = useState(false);
  const [editing,   setEditing]   = useState<EditingState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null);

  const LIMIT = 25;

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page)); params.set('limit', String(LIMIT));
      if (filterStatus)  params.set('status',    filterStatus);
      if (filterProject) params.set('projectId', filterProject);
      const res = await api.get(`/payments?${params.toString()}`);
      setPayments(res.data.payments);
      setTotal(res.data.total);
    } catch { setError('Failed to load payments'); }
    finally { setLoading(false); }
  }, [page, filterStatus, filterProject]);

  useEffect(() => { void fetchPayments(); }, [fetchPayments]);
  useEffect(() => { api.get('/projects').then(r => setProjects(r.data.projects)).catch(() => {}); }, []);
  useEffect(() => {
    const p: Record<string, string> = {};
    if (filterStatus) p.status = filterStatus;
    setSearchParams(p, { replace: true });
  }, [filterStatus, setSearchParams]);

  async function handleSaveEdit(paymentId: string) {
    if (!editing) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { ...editing.data };
      if (body.grossAmount) body.grossAmount = Number(body.grossAmount);
      if (body.tdsAmount)   body.tdsAmount   = Number(body.tdsAmount);
      await api.patch(`/payments/${paymentId}`, body);
      setEditing(null); void fetchPayments();
    } catch (err: any) { alert(err.response?.data?.message ?? 'Save failed'); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try { await api.delete(`/payments/${deleteTarget._id}`); setDeleteTarget(null); void fetchPayments(); }
    catch { alert('Delete failed'); }
  }

  const pages = Math.ceil(total / LIMIT);
  const hasFilter = !!(filterStatus || filterProject);

  const fieldCls  = 'px-2 py-0.5 rounded text-xs text-white outline-none w-full';
  const fieldStyle = { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' };

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#050816' }}>
      <Header
        title="Payment Log"
        subtitle={`${total} record${total !== 1 ? 's' : ''}`}
        actions={
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
            style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)' }}
          >
            <Plus className="h-3.5 w-3.5" /> Record Payment
          </button>
        }
      />

      <NewPaymentDrawer
        open={showNewPayment}
        onClose={() => setShowNew(false)}
        projects={projects}
        onSaved={fetchPayments}
      />

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Payment"
        description={`Delete payment for "${deleteTarget?.invoiceMonth}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* ── Sticky toolbar ────────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-30 px-4 py-2.5 flex flex-wrap items-center gap-2"
        style={{
          background: 'rgba(5,8,22,0.92)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <Filter className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" />

        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
                className="px-2.5 py-1.5 rounded-lg text-xs text-gray-300 outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}>
          <option value="" style={{ background: '#070618' }}>All Statuses</option>
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s} style={{ background: '#070618' }}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>

        <select value={filterProject} onChange={e => { setFilterProject(e.target.value); setPage(1); }}
                className="px-2.5 py-1.5 rounded-lg text-xs text-gray-300 outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}>
          <option value="" style={{ background: '#070618' }}>All Projects</option>
          {projects.map(p => <option key={p._id} value={p._id} style={{ background: '#070618' }}>{p.name}</option>)}
        </select>

        {hasFilter && (
          <button onClick={() => { setFilterStatus(''); setFilterProject(''); setPage(1); }}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors">
            <X className="h-3 w-3" /> Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-gray-700">{total} records</span>
          <button onClick={fetchPayments} className="text-gray-600 hover:text-gray-300 transition-colors">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Error ────────────────────────────────────────────────────────────── */}
      {error && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-lg flex items-center gap-2 text-red-400 text-xs"
             style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)' }}>
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" /> {error}
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────────────────────── */}
      <div className="px-4 pt-4">
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          {loading ? (
            <div className="p-4 space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
              ))}
            </div>
          ) : payments.length === 0 ? (
            <div className="py-16 text-center">
              <FileText className="h-8 w-8 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm font-medium">No payments found</p>
              <p className="text-gray-700 text-xs mt-1">
                {hasFilter ? 'Try clearing the filters.' : 'Record the first payment to get started.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" style={{ minWidth: '960px' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.015)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {['Project','Period','Invoice #','Date','Gross','TDS','Net','Account','UTR','Status','Notes',''].map(h => (
                      <th key={h} className={`px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest ${h === 'Gross' || h === 'TDS' || h === 'Net' ? 'text-right' : ''}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payments.map(p => {
                    const isEditing = editing?.id === p._id;
                    const project   = p.projectId as any;
                    return (
                      <tr
                        key={p._id}
                        className="group transition-colors"
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          background: isEditing ? 'rgba(99,102,241,0.06)' : 'transparent',
                          borderLeft: `2px solid ${isEditing ? '#6366f1' : 'transparent'}`,
                        }}
                        onMouseEnter={e => { if (!isEditing) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                        onMouseLeave={e => { if (!isEditing) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <td className="px-3 py-2.5 min-w-[120px]">
                          <span className="text-xs font-medium text-gray-200">{project?.name ?? '—'}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          {isEditing
                            ? <input value={editing.data.invoiceMonth ?? p.invoiceMonth}
                                     onChange={e => setEditing(prev => prev ? { ...prev, data: { ...prev.data, invoiceMonth: e.target.value } } : prev)}
                                     className={fieldCls} style={fieldStyle} />
                            : <span className="text-xs text-gray-400">{p.invoiceMonth}</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {isEditing
                            ? <input value={editing.data.invoiceNumber ?? p.invoiceNumber ?? ''}
                                     onChange={e => setEditing(prev => prev ? { ...prev, data: { ...prev.data, invoiceNumber: e.target.value } } : prev)}
                                     className={fieldCls} style={{ ...fieldStyle, width: '80px' }} />
                            : <code className="text-[10px] font-mono text-gray-600">{p.invoiceNumber || '—'}</code>}
                        </td>
                        <td className="px-3 py-2.5">
                          {isEditing
                            ? <input type="date" value={editing.data.paymentDate ? toDateInput(editing.data.paymentDate) : toDateInput(p.paymentDate)}
                                     onChange={e => setEditing(prev => prev ? { ...prev, data: { ...prev.data, paymentDate: e.target.value } } : prev)}
                                     className={fieldCls} style={{ ...fieldStyle, colorScheme: 'dark', width: '120px' }} />
                            : <span className="text-[11px] text-gray-500 tabular-nums">{new Date(p.paymentDate).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {isEditing
                            ? <input type="number" min="0" step="0.01" value={editing.data.grossAmount ?? p.grossAmount}
                                     onChange={e => setEditing(prev => prev ? { ...prev, data: { ...prev.data, grossAmount: e.target.value } } : prev)}
                                     className={`${fieldCls} text-right`} style={{ ...fieldStyle, width: '84px' }} />
                            : <span className="text-xs font-mono text-gray-300">{fmtCurrency(p.grossAmount, p.currency)}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {isEditing
                            ? <input type="number" min="0" step="0.01" value={editing.data.tdsAmount ?? p.tdsAmount}
                                     onChange={e => setEditing(prev => prev ? { ...prev, data: { ...prev.data, tdsAmount: e.target.value } } : prev)}
                                     className={`${fieldCls} text-right`} style={{ ...fieldStyle, width: '84px' }} />
                            : <span className="text-xs font-mono text-gray-600">{p.tdsAmount > 0 ? fmtCurrency(p.tdsAmount, p.currency) : '—'}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="text-xs font-mono font-semibold text-gray-100">{fmtCurrency(p.netAmount, p.currency)}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          {isEditing
                            ? <input value={editing.data.paidToAccount ?? p.paidToAccount ?? ''}
                                     onChange={e => setEditing(prev => prev ? { ...prev, data: { ...prev.data, paidToAccount: e.target.value } } : prev)}
                                     className={fieldCls} style={{ ...fieldStyle, width: '100px' }} />
                            : <span className="text-[10px] text-gray-600 truncate block max-w-[90px]">{p.paidToAccount || '—'}</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {isEditing
                            ? <input value={editing.data.referenceUTR ?? p.referenceUTR ?? ''}
                                     onChange={e => setEditing(prev => prev ? { ...prev, data: { ...prev.data, referenceUTR: e.target.value } } : prev)}
                                     className={fieldCls} style={{ ...fieldStyle, width: '100px' }} />
                            : <code className="text-[10px] font-mono text-gray-600 truncate block max-w-[90px]">{p.referenceUTR || '—'}</code>}
                        </td>
                        <td className="px-3 py-2.5">
                          {isEditing
                            ? <select value={editing.data.status ?? p.status}
                                      onChange={e => setEditing(prev => prev ? { ...prev, data: { ...prev.data, status: e.target.value as PaymentStatus } } : prev)}
                                      className={fieldCls} style={{ ...fieldStyle, color: 'white', width: '90px' }}>
                                {STATUS_OPTIONS.map(s => <option key={s} value={s} style={{ background: '#070618' }}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                              </select>
                            : <StatusBadge status={p.status} />}
                        </td>
                        <td className="px-3 py-2.5">
                          {isEditing
                            ? <input value={editing.data.notes ?? p.notes ?? ''}
                                     onChange={e => setEditing(prev => prev ? { ...prev, data: { ...prev.data, notes: e.target.value } } : prev)}
                                     className={fieldCls} style={{ ...fieldStyle, width: '100px' }} />
                            : <span className="text-[10px] text-gray-600 truncate block max-w-[90px]" title={p.notes}>{p.notes || '—'}</span>}
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-0.5">
                            {isEditing ? (
                              <>
                                <button onClick={() => handleSaveEdit(p._id)} disabled={saving}
                                        className="h-6 w-6 rounded flex items-center justify-center text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                                        title="Save">
                                  <Save className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => setEditing(null)}
                                        className="h-6 w-6 rounded flex items-center justify-center text-gray-500 hover:text-white transition-colors"
                                        title="Cancel">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </>
                            ) : (
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                                <button onClick={() => setEditing({ id: p._id, data: {} })}
                                        className="h-6 w-6 rounded flex items-center justify-center text-gray-500 hover:text-indigo-400 transition-colors"
                                        title="Edit">
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => setDeleteTarget(p)}
                                        className="h-6 w-6 rounded flex items-center justify-center text-gray-500 hover:text-red-400 transition-colors"
                                        title="Delete">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Pagination ────────────────────────────────────────────────── */}
          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-2.5"
                 style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="text-[10px] text-gray-700">
                Page {page} of {pages} · {total} total
              </span>
              <div className="flex items-center gap-1">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                        className="h-6 w-6 rounded flex items-center justify-center text-gray-500 hover:text-white disabled:opacity-30 transition-colors"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
                  const pg = Math.max(1, Math.min(page - 2, pages - 4)) + i;
                  return (
                    <button key={pg} onClick={() => setPage(pg)}
                            className="h-6 w-6 rounded flex items-center justify-center text-[10px] transition-colors"
                            style={{
                              background: pg === page ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.04)',
                              border: `1px solid ${pg === page ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.07)'}`,
                              color: pg === page ? '#818cf8' : '#6b7280',
                            }}>
                      {pg}
                    </button>
                  );
                })}
                <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}
                        className="h-6 w-6 rounded flex items-center justify-center text-gray-500 hover:text-white disabled:opacity-30 transition-colors"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
