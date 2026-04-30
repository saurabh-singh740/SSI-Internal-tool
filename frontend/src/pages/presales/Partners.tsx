import { useState } from 'react';
import {
  Building2, Plus, Pencil, Trash2, Globe, Phone, Mail, CheckCircle, XCircle,
} from 'lucide-react';
import {
  usePartners, useCreatePartner, useUpdatePartner, useDeletePartner,
} from '../../hooks/presales/usePartners';
import { Partner, PartnerType } from '../../types';
import { useAuth } from '../../context/AuthContext';

const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  INTERNAL:       'Internal',
  RESELLER:       'Reseller',
  REFERRAL:       'Referral',
  TECHNOLOGY:     'Technology',
  IMPLEMENTATION: 'Implementation',
};

const TYPE_COLORS: Record<PartnerType, { bg: string; text: string }> = {
  INTERNAL:       { bg: 'rgba(139,92,246,0.15)',  text: '#a78bfa' },
  RESELLER:       { bg: 'rgba(59,130,246,0.15)',   text: '#60a5fa' },
  REFERRAL:       { bg: 'rgba(34,197,94,0.15)',    text: '#4ade80' },
  TECHNOLOGY:     { bg: 'rgba(249,115,22,0.15)',   text: '#fb923c' },
  IMPLEMENTATION: { bg: 'rgba(236,72,153,0.15)',   text: '#f472b6' },
};

const emptyForm = (): Partial<Partner> => ({
  name: '', type: 'RESELLER', contactName: '', contactEmail: '',
  contactPhone: '', website: '', country: '', notes: '', isActive: true,
});

// ── Input style helpers ───────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-500 outline-none transition-all';
const inputStyle = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
};

// ── Modal ─────────────────────────────────────────────────────────────────────

function PartnerModal({ initial, onClose }: { initial?: Partner; onClose: () => void }) {
  const [form, setForm]    = useState<Partial<Partner>>(initial ?? emptyForm());
  const createMutation     = useCreatePartner();
  const updateMutation     = useUpdatePartner();
  const isPending          = createMutation.isPending || updateMutation.isPending;

  function set(k: keyof Partner, v: unknown) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name?.trim()) return;
    if (initial) await updateMutation.mutateAsync({ id: initial._id, ...form });
    else         await createMutation.mutateAsync(form);
    onClose();
  }

  const error =
    (createMutation.error as any)?.response?.data?.message ||
    (updateMutation.error as any)?.response?.data?.message;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
           style={{ background: '#0f0a1e', border: '1px solid rgba(255,255,255,0.1)' }}>

        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between"
             style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <h2 className="text-base font-semibold text-white">
            {initial ? 'Edit Partner' : 'Add Partner'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">×</button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[65vh]">
          {error && (
            <div className="text-sm text-red-400 px-3 py-2 rounded-lg"
                 style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Partner Name *</label>
              <input className={inputCls} style={inputStyle}
                value={form.name ?? ''} onChange={e => set('name', e.target.value)}
                placeholder="Acme Corp" required />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Type</label>
              <select className={inputCls} style={{ ...inputStyle, color: 'white' }}
                value={form.type ?? 'RESELLER'} onChange={e => set('type', e.target.value as PartnerType)}
                disabled={initial?.isDefault}>
                {(Object.keys(PARTNER_TYPE_LABELS) as PartnerType[]).map(t => (
                  <option key={t} value={t} style={{ background: '#0f0a1e' }}>{PARTNER_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Country</label>
              <input className={inputCls} style={inputStyle}
                value={form.country ?? ''} onChange={e => set('country', e.target.value)}
                placeholder="United States" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Contact Name</label>
              <input className={inputCls} style={inputStyle}
                value={form.contactName ?? ''} onChange={e => set('contactName', e.target.value)}
                placeholder="John Doe" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Contact Email</label>
              <input type="email" className={inputCls} style={inputStyle}
                value={form.contactEmail ?? ''} onChange={e => set('contactEmail', e.target.value)}
                placeholder="john@acme.com" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Contact Phone</label>
              <input className={inputCls} style={inputStyle}
                value={form.contactPhone ?? ''} onChange={e => set('contactPhone', e.target.value)}
                placeholder="+1 555 000 0000" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Website</label>
              <input className={inputCls} style={inputStyle}
                value={form.website ?? ''} onChange={e => set('website', e.target.value)}
                placeholder="https://acme.com" />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Notes</label>
              <textarea rows={3} className={`${inputCls} resize-none`} style={inputStyle}
                value={form.notes ?? ''} onChange={e => set('notes', e.target.value)}
                placeholder="Any additional notes…" />
            </div>

            {initial && !initial.isDefault && (
              <div className="col-span-2 flex items-center gap-2">
                <input type="checkbox" id="isActive"
                  checked={form.isActive ?? true}
                  onChange={e => set('isActive', e.target.checked)}
                  className="w-4 h-4 rounded" />
                <label htmlFor="isActive" className="text-sm text-slate-300">Active</label>
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 flex justify-end gap-3"
             style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg text-slate-400 hover:text-white transition-colors"
            style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
            Cancel
          </button>
          <button onClick={handleSubmit as any} disabled={isPending}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-all"
            style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)' }}>
            {isPending ? 'Saving…' : initial ? 'Save Changes' : 'Add Partner'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Partner card ──────────────────────────────────────────────────────────────

function PartnerCard({ partner, onEdit, onDelete, canManage }: {
  partner: Partner; onEdit: () => void; onDelete: () => void; canManage: boolean;
}) {
  const tc = TYPE_COLORS[partner.type];
  return (
    <div className={`rounded-xl p-5 transition-all ${!partner.isActive ? 'opacity-50' : ''}`}
         style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>

      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
               style={{ background: 'rgba(99,102,241,0.15)' }}>
            <Building2 className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm leading-tight">{partner.name}</h3>
            {partner.isDefault && (
              <span className="text-xs font-medium" style={{ color: '#a78bfa' }}>Default (SSI)</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                style={{ background: tc.bg, color: tc.text }}>
            {PARTNER_TYPE_LABELS[partner.type]}
          </span>
          {partner.isActive
            ? <CheckCircle className="w-4 h-4 text-emerald-400" />
            : <XCircle    className="w-4 h-4 text-slate-500" />
          }
        </div>
      </div>

      <div className="space-y-1.5 text-xs text-slate-400">
        {partner.contactName  && <p className="truncate text-slate-300">{partner.contactName}</p>}
        {partner.contactEmail && (
          <a href={`mailto:${partner.contactEmail}`}
             className="flex items-center gap-1.5 hover:text-indigo-400 truncate transition-colors">
            <Mail className="w-3 h-3 flex-shrink-0" />{partner.contactEmail}
          </a>
        )}
        {partner.contactPhone && (
          <p className="flex items-center gap-1.5">
            <Phone className="w-3 h-3 flex-shrink-0" />{partner.contactPhone}
          </p>
        )}
        {partner.website && (
          <a href={partner.website} target="_blank" rel="noreferrer"
             className="flex items-center gap-1.5 hover:text-indigo-400 truncate transition-colors">
            <Globe className="w-3 h-3 flex-shrink-0" />{partner.website.replace(/^https?:\/\//, '')}
          </a>
        )}
        {partner.country && <p>{partner.country}</p>}
      </div>

      {canManage && (
        <div className="flex gap-2 mt-4 pt-3"
             style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button onClick={onEdit}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-400 px-2 py-1 rounded transition-colors">
            <Pencil className="w-3 h-3" /> Edit
          </button>
          {!partner.isDefault && (
            <button onClick={onDelete}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-400 px-2 py-1 rounded transition-colors">
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Partners() {
  const { user }  = useAuth();
  const isAdmin   = user?.role === 'ADMIN';

  const [showAll, setShowAll]     = useState(true);
  const [modal, setModal]         = useState<'create' | Partner | null>(null);
  const [deleteTarget, setDelete] = useState<Partner | null>(null);

  const { data: partners = [], isLoading } = usePartners(showAll ? undefined : { isActive: true });
  const deleteMutation = useDeletePartner();

  async function confirmDelete() {
    if (!deleteTarget) return;
    await deleteMutation.mutateAsync(deleteTarget._id);
    setDelete(null);
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg,#050816 0%,#0f0a1e 100%)' }}>

      {/* Header */}
      <div className="px-6 py-5 flex items-center justify-between"
           style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-400" /> Partners
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {partners.length} partner{partners.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
            <input type="checkbox" checked={!showAll} onChange={e => setShowAll(!e.target.checked)}
              className="rounded" />
            Active only
          </label>
          {isAdmin && (
            <button onClick={() => setModal('create')}
              className="flex items-center gap-2 text-white text-sm px-4 py-2 rounded-lg font-medium transition-all"
              style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)' }}>
              <Plus className="w-4 h-4" /> Add Partner
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-slate-500">Loading partners…</div>
        ) : partners.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-500">
            <Building2 className="w-10 h-10 mb-2 opacity-30" />
            <p>No partners found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {partners.map(p => (
              <PartnerCard key={p._id} partner={p} canManage={isAdmin}
                onEdit={() => setModal(p)} onDelete={() => setDelete(p)} />
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      {modal && (
        <PartnerModal initial={modal === 'create' ? undefined : modal} onClose={() => setModal(null)} />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="rounded-2xl shadow-2xl p-6 w-full max-w-sm"
               style={{ background: '#0f0a1e', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h3 className="text-base font-semibold text-white mb-2">Delete Partner</h3>
            <p className="text-sm text-slate-400 mb-5">
              Are you sure you want to delete <strong className="text-white">{deleteTarget.name}</strong>? This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDelete(null)}
                className="px-4 py-2 text-sm rounded-lg text-slate-400 hover:text-white transition-colors"
                style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                Cancel
              </button>
              <button onClick={confirmDelete} disabled={deleteMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
                style={{ background: 'rgba(239,68,68,0.8)' }}>
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
