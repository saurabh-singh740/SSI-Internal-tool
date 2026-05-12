import { useState } from 'react';
import {
  Building2, Plus, Pencil, Trash2, Globe, Phone, Mail,
  CheckCircle, XCircle, X, Search, RefreshCw, Filter,
} from 'lucide-react';
import {
  usePartners, useCreatePartner, useUpdatePartner, useDeletePartner,
} from '../../hooks/presales/usePartners';
import { Partner, PartnerType } from '../../types';
import { useAuth } from '../../context/AuthContext';
import Header from '../../components/layout/Header';

// ── Type config ───────────────────────────────────────────────────────────────

const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  INTERNAL: 'Internal', RESELLER: 'Reseller', REFERRAL: 'Referral',
  TECHNOLOGY: 'Technology', IMPLEMENTATION: 'Implementation',
};

const TYPE_CFG: Record<PartnerType, { bg: string; text: string; border: string }> = {
  INTERNAL:       { bg: 'rgba(139,92,246,0.12)',  text: '#a78bfa', border: 'rgba(139,92,246,0.2)'  },
  RESELLER:       { bg: 'rgba(99,102,241,0.12)',  text: '#818cf8', border: 'rgba(99,102,241,0.2)'  },
  REFERRAL:       { bg: 'rgba(34,197,94,0.12)',   text: '#4ade80', border: 'rgba(34,197,94,0.2)'   },
  TECHNOLOGY:     { bg: 'rgba(249,115,22,0.12)',  text: '#fb923c', border: 'rgba(249,115,22,0.2)'  },
  IMPLEMENTATION: { bg: 'rgba(236,72,153,0.12)',  text: '#f472b6', border: 'rgba(236,72,153,0.2)'  },
};

function TypeBadge({ type }: { type: PartnerType }) {
  const c = TYPE_CFG[type] ?? TYPE_CFG.RESELLER;
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide leading-none"
          style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
      {PARTNER_TYPE_LABELS[type]}
    </span>
  );
}

// ── Partner form (used inside side drawer) ────────────────────────────────────

function emptyForm(): Partial<Partner> {
  return { name: '', type: 'RESELLER', contactName: '', contactEmail: '', contactPhone: '', website: '', country: '', notes: '', isActive: true };
}

function PartnerForm({
  initial, onClose,
}: { initial?: Partner; onClose: () => void }) {
  const [form, setForm] = useState<Partial<Partner>>(initial ?? emptyForm());
  const createMutation  = useCreatePartner();
  const updateMutation  = useUpdatePartner();
  const isPending       = createMutation.isPending || updateMutation.isPending;
  const error =
    (createMutation.error as any)?.response?.data?.message ||
    (updateMutation.error as any)?.response?.data?.message;

  function set(k: keyof Partner, v: unknown) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name?.trim()) return;
    if (initial) await updateMutation.mutateAsync({ id: initial._id, ...form });
    else         await createMutation.mutateAsync(form);
    onClose();
  }

  const fieldCls = 'w-full px-3 py-1.5 rounded-lg text-xs text-white placeholder-gray-700 outline-none';
  const fieldStyle = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' };
  const labelCls = 'block text-[9px] font-semibold text-gray-600 uppercase tracking-widest mb-1.5';

  return (
    <>
      <div className="px-5 py-4 flex-shrink-0 flex items-center justify-between"
           style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div>
          <p className="text-sm font-bold text-gray-100">{initial ? 'Edit Partner' : 'Add Partner'}</p>
          <p className="text-[10px] text-gray-600 mt-0.5">{initial ? `Editing ${initial.name}` : 'Create a new partner record'}</p>
        </div>
        <button onClick={onClose}
                className="h-6 w-6 rounded flex items-center justify-center text-gray-500 hover:text-white"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {error && (
          <div className="px-3 py-2 rounded-lg text-xs text-red-400"
               style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)' }}>
            {error}
          </div>
        )}

        <div>
          <label className={labelCls}>Partner Name *</label>
          <input className={fieldCls} style={fieldStyle}
                 value={form.name ?? ''} onChange={e => set('name', e.target.value)}
                 placeholder="Acme Corp" required />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Type</label>
            <select className={fieldCls} style={{ ...fieldStyle, color: 'white' }}
                    value={form.type ?? 'RESELLER'} onChange={e => set('type', e.target.value as PartnerType)}
                    disabled={initial?.isDefault}>
              {(Object.keys(PARTNER_TYPE_LABELS) as PartnerType[]).map(t => (
                <option key={t} value={t} style={{ background: '#070618' }}>{PARTNER_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Country</label>
            <input className={fieldCls} style={fieldStyle}
                   value={form.country ?? ''} onChange={e => set('country', e.target.value)}
                   placeholder="United States" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Contact Name</label>
            <input className={fieldCls} style={fieldStyle}
                   value={form.contactName ?? ''} onChange={e => set('contactName', e.target.value)}
                   placeholder="John Doe" />
          </div>
          <div>
            <label className={labelCls}>Contact Email</label>
            <input type="email" className={fieldCls} style={fieldStyle}
                   value={form.contactEmail ?? ''} onChange={e => set('contactEmail', e.target.value)}
                   placeholder="john@acme.com" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Phone</label>
            <input className={fieldCls} style={fieldStyle}
                   value={form.contactPhone ?? ''} onChange={e => set('contactPhone', e.target.value)}
                   placeholder="+1 555 000 0000" />
          </div>
          <div>
            <label className={labelCls}>Website</label>
            <input className={fieldCls} style={fieldStyle}
                   value={form.website ?? ''} onChange={e => set('website', e.target.value)}
                   placeholder="https://acme.com" />
          </div>
        </div>

        <div>
          <label className={labelCls}>Notes</label>
          <textarea rows={3} className={`${fieldCls} resize-none`} style={fieldStyle}
                    value={form.notes ?? ''} onChange={e => set('notes', e.target.value)}
                    placeholder="Any additional notes…" />
        </div>

        {initial && !initial.isDefault && (
          <div className="flex items-center gap-2">
            <input type="checkbox" id="isActive"
                   checked={form.isActive ?? true}
                   onChange={e => set('isActive', e.target.checked)}
                   className="w-3.5 h-3.5 rounded" />
            <label htmlFor="isActive" className="text-xs text-gray-400">Active partner</label>
          </div>
        )}
      </form>

      <div className="px-5 py-3 flex gap-2 flex-shrink-0"
           style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <button type="button" onClick={onClose}
                className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white transition-colors"
                style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
          Cancel
        </button>
        <button onClick={handleSubmit as any} disabled={isPending}
                className="flex-1 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)' }}>
          {isPending ? 'Saving…' : initial ? 'Save Changes' : 'Add Partner'}
        </button>
      </div>
    </>
  );
}

// ── Delete confirm ────────────────────────────────────────────────────────────

function DeleteConfirm({
  partner, onClose,
}: { partner: Partner; onClose: () => void }) {
  const deleteMutation = useDeletePartner();

  return (
    <>
      <div className="px-5 py-4 flex-shrink-0 flex items-center justify-between"
           style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <p className="text-sm font-bold text-gray-100">Delete Partner</p>
        <button onClick={onClose}
                className="h-6 w-6 rounded flex items-center justify-center text-gray-500 hover:text-white"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex-1 px-5 py-6">
        <div className="rounded-xl p-4 mb-4"
             style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
          <p className="text-sm text-red-400 font-medium mb-1">This action cannot be undone</p>
          <p className="text-xs text-gray-400">
            Deleting <strong className="text-white">{partner.name}</strong> will permanently remove the partner record and may affect existing deals.
          </p>
        </div>
      </div>
      <div className="px-5 py-3 flex gap-2 flex-shrink-0"
           style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <button onClick={onClose}
                className="flex-1 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white transition-colors"
                style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
          Cancel
        </button>
        <button
          onClick={async () => { await deleteMutation.mutateAsync(partner._id); onClose(); }}
          disabled={deleteMutation.isPending}
          className="flex-1 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50"
          style={{ background: 'rgba(239,68,68,0.7)' }}
        >
          {deleteMutation.isPending ? 'Deleting…' : 'Delete Partner'}
        </button>
      </div>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type DrawerState =
  | { mode: 'create' }
  | { mode: 'edit'; partner: Partner }
  | { mode: 'delete'; partner: Partner }
  | null;

export default function Partners() {
  const { user }   = useAuth();
  const isAdmin    = user?.role === 'ADMIN';

  const [search,    setSearch]    = useState('');
  const [showAll,   setShowAll]   = useState(true);
  const [typeFilter, setTypeFilter] = useState<PartnerType | ''>('');
  const [drawer,    setDrawer]    = useState<DrawerState>(null);

  const { data: partners = [], isLoading, refetch } = usePartners(showAll ? undefined : { isActive: true });

  const filtered = partners.filter(p => {
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.contactEmail?.toLowerCase().includes(search.toLowerCase());
    const matchType = !typeFilter || p.type === typeFilter;
    return matchSearch && matchType;
  });

  const typeCount = (t: PartnerType) => partners.filter(p => p.type === t).length;
  const activeCount = partners.filter(p => p.isActive).length;

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#050816' }}>
      <Header
        title="Partners"
        subtitle={`${partners.length} partner${partners.length !== 1 ? 's' : ''}`}
        actions={
          isAdmin && (
            <button
              onClick={() => setDrawer({ mode: 'create' })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
              style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)' }}
            >
              <Plus className="h-3.5 w-3.5" /> Add Partner
            </button>
          )
        }
      />

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-30 px-4 py-2.5 flex flex-wrap items-center gap-2"
        style={{
          background: 'rgba(5,8,22,0.92)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <div className="relative flex-1 min-w-[140px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-600 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search partners…"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs text-white placeholder-gray-700 outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Filter className="h-3 w-3 text-gray-600" />
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as PartnerType | '')}
            className="px-2.5 py-1.5 rounded-lg text-xs text-gray-300 outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
          >
            <option value="">All Types</option>
            {(Object.keys(PARTNER_TYPE_LABELS) as PartnerType[]).map(t => (
              <option key={t} value={t} style={{ background: '#070618' }}>{PARTNER_TYPE_LABELS[t]} ({typeCount(t)})</option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
          <input type="checkbox" checked={!showAll} onChange={e => setShowAll(!e.target.checked)}
                 className="w-3.5 h-3.5 rounded" />
          Active only
        </label>

        {(search || typeFilter) && (
          <button onClick={() => { setSearch(''); setTypeFilter(''); }}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors">
            <X className="h-3 w-3" /> Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-gray-700">{activeCount} active · {filtered.length} shown</span>
          <button onClick={() => refetch()} className="text-gray-600 hover:text-gray-300 transition-colors">
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Main content with side drawer ──────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 relative">
        <div
          className="flex-1 min-w-0 px-4 pt-4 transition-all duration-200"
          style={{ marginRight: drawer ? 'min(400px, 100vw)' : 0 }}
        >
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            {isLoading ? (
              <div className="p-4 space-y-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <Building2 className="h-8 w-8 text-gray-700 mx-auto mb-3" />
                <p className="text-gray-500 text-sm font-medium">
                  {partners.length === 0 ? 'No partners yet' : 'No partners match the filter'}
                </p>
                {isAdmin && partners.length === 0 && (
                  <button onClick={() => setDrawer({ mode: 'create' })}
                          className="inline-flex items-center gap-1 mt-3 text-xs text-indigo-400 hover:text-indigo-200">
                    <Plus className="h-3 w-3" /> Add first partner
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.015)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <th className="px-4 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest">Partner</th>
                      <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest w-24">Type</th>
                      <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest hidden sm:table-cell">Contact</th>
                      <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest hidden md:table-cell">Website</th>
                      <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest w-12 text-center">Active</th>
                      {isAdmin && <th className="px-2 py-2 w-16" />}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(p => (
                      <tr
                        key={p._id}
                        className="group transition-colors"
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          opacity: p.isActive ? 1 : 0.5,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0"
                                 style={{ background: 'rgba(99,102,241,0.15)' }}>
                              <Building2 className="h-4 w-4 text-indigo-400" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-200 truncate">{p.name}</p>
                              {p.isDefault && (
                                <span className="text-[9px] font-medium" style={{ color: '#a78bfa' }}>Default (SSI)</span>
                              )}
                              {p.country && (
                                <span className="text-[9px] text-gray-600">{p.country}</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3"><TypeBadge type={p.type} /></td>
                        <td className="px-3 py-3 hidden sm:table-cell">
                          <div className="space-y-1">
                            {p.contactName && (
                              <p className="text-xs text-gray-300 truncate max-w-[140px]">{p.contactName}</p>
                            )}
                            {p.contactEmail && (
                              <a href={`mailto:${p.contactEmail}`}
                                 className="flex items-center gap-1 text-[10px] text-gray-600 hover:text-indigo-400 transition-colors truncate max-w-[140px]">
                                <Mail className="h-3 w-3 flex-shrink-0" />{p.contactEmail}
                              </a>
                            )}
                            {p.contactPhone && (
                              <p className="flex items-center gap-1 text-[10px] text-gray-600">
                                <Phone className="h-3 w-3 flex-shrink-0" />{p.contactPhone}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 hidden md:table-cell">
                          {p.website ? (
                            <a href={p.website} target="_blank" rel="noreferrer"
                               className="flex items-center gap-1 text-[10px] text-gray-600 hover:text-indigo-400 transition-colors truncate max-w-[120px]">
                              <Globe className="h-3 w-3 flex-shrink-0" />
                              {p.website.replace(/^https?:\/\//, '')}
                            </a>
                          ) : (
                            <span className="text-[10px] text-gray-700">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {p.isActive
                            ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400 mx-auto" />
                            : <XCircle    className="h-3.5 w-3.5 text-gray-600 mx-auto" />
                          }
                        </td>
                        {isAdmin && (
                          <td className="px-2 py-3">
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => setDrawer({ mode: 'edit', partner: p })}
                                className="h-6 w-6 rounded flex items-center justify-center text-gray-500 hover:text-indigo-400 transition-colors"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              {!p.isDefault && (
                                <button
                                  onClick={() => setDrawer({ mode: 'delete', partner: p })}
                                  className="h-6 w-6 rounded flex items-center justify-center text-gray-500 hover:text-red-400 transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── Side drawer ──────────────────────────────────────────────────────── */}
        {drawer && (
          <div
            className="fixed right-0 top-0 bottom-0 z-50 flex flex-col overflow-hidden"
            style={{
              width: 'min(400px, 100vw)',
              background: 'rgba(7,6,24,0.97)',
              borderLeft: '1px solid rgba(255,255,255,0.09)',
              backdropFilter: 'blur(24px)',
            }}
          >
            {drawer.mode === 'create'  && <PartnerForm onClose={() => setDrawer(null)} />}
            {drawer.mode === 'edit'    && <PartnerForm initial={drawer.partner} onClose={() => setDrawer(null)} />}
            {drawer.mode === 'delete'  && <DeleteConfirm partner={drawer.partner} onClose={() => setDrawer(null)} />}
          </div>
        )}
      </div>
    </div>
  );
}
