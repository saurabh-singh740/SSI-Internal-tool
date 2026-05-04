import { useState } from 'react';
import { toast } from 'react-toastify';
import { X, Plus, Trash2 } from 'lucide-react';
import { useCreateDeal } from '../../hooks/presales/useDeals';
import { usePartners }   from '../../hooks/presales/usePartners';
import { DealContact }   from '../../types';

const MAX_CONTACTS = 5;
const TODAY = new Date().toISOString().slice(0, 10);

interface CreateDealModalProps {
  open:    boolean;
  onClose: () => void;
}

const F_BASE: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border:     '1px solid rgba(255,255,255,0.08)',
  outline:    'none',
  color:      '#e2e8f0',
};

const F_ERR: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border:     '1px solid rgba(248,113,113,0.65)',
  outline:    'none',
  color:      '#e2e8f0',
};

const SECTION = 'mb-6';
const LABEL   = 'block text-xs font-medium text-ink-400 mb-1.5';
const INPUT   = 'w-full px-3 py-2 rounded-lg text-sm';
const SELECT  = 'w-full px-3 py-2 rounded-lg text-sm';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="text-xs font-semibold uppercase tracking-widest text-ink-500">{children}</span>
      <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
    </div>
  );
}

const emptyForm = () => ({
  title:            '',
  priority:         'MEDIUM',
  tags:             '',
  clientCompany:    '',
  clientDomain:     '',
  source:           '',
  referredBy:       '',
  estimatedValue:   '',
  currency:         'USD',
  estimatedHours:   '',
  proposedRate:     '',
  billingType:      '',
  expectedCloseDate: '',
  proposedStartDate: '',
  proposedEndDate:   '',
  winProbability:    '10',
  partnerId:         '',
});

type FormKey = keyof ReturnType<typeof emptyForm>;

function validate(form: ReturnType<typeof emptyForm>): Record<string, string> {
  const e: Record<string, string> = {};

  if (!form.title.trim())         e.title         = 'Required';
  if (!form.clientCompany.trim()) e.clientCompany = 'Required';
  if (!form.source)               e.source        = 'Required';
  if (!form.billingType)          e.billingType   = 'Required';
  if (!form.partnerId)            e.partnerId     = 'Required';

  if (!form.estimatedValue || parseFloat(form.estimatedValue) <= 0)
    e.estimatedValue = 'Required';
  if (!form.estimatedHours || parseFloat(form.estimatedHours) <= 0)
    e.estimatedHours = 'Required';
  if (!form.proposedRate || parseFloat(form.proposedRate) <= 0)
    e.proposedRate = 'Required';

  if (!form.expectedCloseDate)  e.expectedCloseDate = 'Required';
  if (!form.proposedStartDate)  e.proposedStartDate = 'Required';
  if (!form.proposedEndDate)    e.proposedEndDate   = 'Required';

  if (form.proposedStartDate && form.proposedStartDate < TODAY)
    e.proposedStartDate = 'Cannot be in the past';
  if (form.proposedEndDate && form.proposedStartDate && form.proposedEndDate < form.proposedStartDate)
    e.proposedEndDate = 'Cannot be before start date';

  return e;
}

export default function CreateDealModal({ open, onClose }: CreateDealModalProps) {
  const createDeal              = useCreateDeal();
  const { data: partners = [] } = usePartners({ isActive: true });

  const [form,        setForm]        = useState(emptyForm());
  const [contacts,    setContacts]    = useState<DealContact[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  if (!open) return null;

  const set = (k: FormKey, v: string) => {
    setForm(f => ({ ...f, [k]: v }));
    setFieldErrors(e => { const n = { ...e }; delete n[k]; return n; });
  };

  // Returns style with red border if field has an error
  const fs = (field: string): React.CSSProperties =>
    fieldErrors[field] ? F_ERR : F_BASE;

  // Label with optional required star and red dot on error
  function Lbl({ field, children, req }: { field: string; children: React.ReactNode; req?: boolean }) {
    const err = fieldErrors[field];
    return (
      <label className={LABEL}>
        {children}
        {req && <span className="text-red-400 ml-0.5">*</span>}
        {err && (
          <span
            className="inline-block ml-1.5 h-2 w-2 rounded-full align-middle flex-shrink-0"
            style={{ background: '#ef4444', boxShadow: '0 0 4px #ef4444' }}
            title={err}
          />
        )}
      </label>
    );
  }

  const addContact = () => {
    if (contacts.length >= MAX_CONTACTS) {
      toast.error(`Maximum ${MAX_CONTACTS} contacts allowed per deal.`);
      return;
    }
    setContacts(cs => [...cs, { name: '', email: '', phone: '', role: '' }]);
  };
  const removeContact = (i: number) => setContacts(cs => cs.filter((_, idx) => idx !== i));
  const updateContact = (i: number, field: keyof DealContact, value: string) =>
    setContacts(cs => cs.map((c, idx) => idx === i ? { ...c, [field]: value } : c));

  const reset = () => { setForm(emptyForm()); setContacts([]); setFieldErrors({}); };

  const handleSubmit = async () => {
    const errs = validate(form);
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      toast.error('Please fill in all required fields (marked with red dot).');
      return;
    }
    try {
      await createDeal.mutateAsync({
        title:         form.title.trim(),
        priority:      form.priority as any,
        tags:          form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        clientCompany: form.clientCompany.trim(),
        clientDomain:  form.clientDomain.trim()  || undefined,
        source:        form.source     || undefined,
        referredBy:    form.referredBy.trim() || undefined,
        estimatedValue: parseFloat(form.estimatedValue) || 0,
        currency:       form.currency as any,
        estimatedHours: form.estimatedHours ? parseFloat(form.estimatedHours) : undefined,
        proposedRate:   form.proposedRate   ? parseFloat(form.proposedRate)   : undefined,
        billingType:    form.billingType    || undefined,
        expectedCloseDate: form.expectedCloseDate || undefined,
        proposedStartDate: form.proposedStartDate || undefined,
        proposedEndDate:   form.proposedEndDate   || undefined,
        winProbability: parseInt(form.winProbability) || 10,
        contacts:  contacts.filter(c => c.name.trim()),
        partnerId: form.partnerId || undefined,
      } as any);
      reset();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to create deal. Please try again.');
    }
  };

  const probVal = parseInt(form.winProbability) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      <div
        className="relative w-full max-w-2xl rounded-2xl z-10 flex flex-col"
        style={{
          background: 'rgba(10,12,28,0.99)',
          border:     '1px solid rgba(255,255,255,0.1)',
          maxHeight:  '92vh',
        }}
      >
        {/* ── Sticky header ───────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div>
            <h3 className="text-base font-semibold text-ink-100">New Deal</h3>
            <p className="text-xs text-ink-500 mt-0.5">Fill in the details to add a deal to the pipeline</p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-ink-500 hover:text-ink-200 transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Scrollable body ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ── 1. Basic Info ─────────────────────────────────────────────── */}
          <div className={SECTION}>
            <SectionTitle>Basic Info</SectionTitle>

            <div className="space-y-3">
              {/* Title */}
              <div>
                <Lbl field="title" req>Deal Title</Lbl>
                <input
                  value={form.title}
                  onChange={e => set('title', e.target.value)}
                  placeholder="e.g. E-commerce Platform for Acme Corp"
                  className={INPUT}
                  style={fs('title')}
                />
              </div>

              {/* Priority + Win Probability */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Priority</label>
                  <select value={form.priority} onChange={e => set('priority', e.target.value)}
                    className={SELECT} style={F_BASE}>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Win Probability — <span className="text-brand-400">{probVal}%</span></label>
                  <input
                    type="range" min="0" max="100" step="5"
                    value={form.winProbability}
                    onChange={e => set('winProbability', e.target.value)}
                    className="w-full mt-2 accent-indigo-500"
                  />
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className={LABEL}>Tags <span className="text-ink-600">(comma-separated)</span></label>
                <input
                  value={form.tags}
                  onChange={e => set('tags', e.target.value)}
                  placeholder="e.g. enterprise, fintech, high-value"
                  className={INPUT}
                  style={F_BASE}
                />
              </div>
            </div>
          </div>

          {/* ── 2. Client ─────────────────────────────────────────────────── */}
          <div className={SECTION}>
            <SectionTitle>Client</SectionTitle>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Lbl field="clientCompany" req>Company Name</Lbl>
                  <input
                    value={form.clientCompany}
                    onChange={e => set('clientCompany', e.target.value)}
                    placeholder="Acme Corp"
                    className={INPUT}
                    style={fs('clientCompany')}
                  />
                </div>
                <div>
                  <label className={LABEL}>Company Domain</label>
                  <input
                    value={form.clientDomain}
                    onChange={e => set('clientDomain', e.target.value)}
                    placeholder="acmecorp.com"
                    className={INPUT}
                    style={F_BASE}
                  />
                </div>
              </div>

              {/* Contacts */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={LABEL + ' mb-0'}>Contacts</label>
                  <button
                    onClick={addContact}
                    className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 transition-colors"
                  >
                    <Plus className="h-3 w-3" /> Add contact
                  </button>
                </div>

                {contacts.length === 0 && (
                  <p className="text-xs text-ink-600 italic">No contacts yet — click "Add contact" above</p>
                )}

                <div className="space-y-2">
                  {contacts.map((c, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-xl space-y-2"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-ink-400">Contact {i + 1}</span>
                        <button onClick={() => removeContact(i)} className="text-ink-600 hover:text-red-400 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input value={c.name} onChange={e => updateContact(i, 'name', e.target.value)}
                          placeholder="Full name *" className="px-2.5 py-1.5 rounded-lg text-xs" style={F_BASE} />
                        <input value={c.role ?? ''} onChange={e => updateContact(i, 'role', e.target.value)}
                          placeholder="Title / Role" className="px-2.5 py-1.5 rounded-lg text-xs" style={F_BASE} />
                        <input type="email" value={c.email ?? ''} onChange={e => updateContact(i, 'email', e.target.value)}
                          placeholder="Email" className="px-2.5 py-1.5 rounded-lg text-xs" style={F_BASE} />
                        <input value={c.phone ?? ''} onChange={e => updateContact(i, 'phone', e.target.value)}
                          placeholder="Phone" className="px-2.5 py-1.5 rounded-lg text-xs" style={F_BASE} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── 3. Source ─────────────────────────────────────────────────── */}
          <div className={SECTION}>
            <SectionTitle>Source</SectionTitle>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Lbl field="source" req>Lead Source</Lbl>
                <select value={form.source} onChange={e => set('source', e.target.value)}
                  className={SELECT} style={fs('source')}>
                  <option value="">— Select —</option>
                  <option value="INBOUND">Inbound</option>
                  <option value="OUTBOUND">Outbound</option>
                  <option value="REFERRAL">Referral</option>
                  <option value="PARTNER">Partner</option>
                  <option value="EXISTING_CLIENT">Existing Client</option>
                </select>
              </div>
              <div>
                <label className={LABEL}>Referred By</label>
                <input
                  value={form.referredBy}
                  onChange={e => set('referredBy', e.target.value)}
                  placeholder="Name or company"
                  className={INPUT}
                  style={F_BASE}
                  disabled={form.source !== 'REFERRAL'}
                />
              </div>
              <div className="col-span-2">
                <Lbl field="partnerId" req>Partner</Lbl>
                <select value={form.partnerId} onChange={e => set('partnerId', e.target.value)}
                  className={SELECT} style={fs('partnerId')}>
                  <option value="">— Select partner —</option>
                  {partners.map(p => (
                    <option key={p._id} value={p._id}>
                      {p.name}{p.isDefault ? ' (Default)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* ── 4. Commercial ─────────────────────────────────────────────── */}
          <div className={SECTION}>
            <SectionTitle>Commercial</SectionTitle>

            <div className="space-y-3">
              {/* Value + Currency */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Lbl field="estimatedValue" req>Estimated Deal Value</Lbl>
                  <input
                    type="number"
                    value={form.estimatedValue}
                    onChange={e => set('estimatedValue', e.target.value)}
                    placeholder="0"
                    min="0"
                    className={INPUT}
                    style={fs('estimatedValue')}
                  />
                </div>
                <div>
                  <label className={LABEL}>Currency</label>
                  <select value={form.currency} onChange={e => set('currency', e.target.value)}
                    className={SELECT} style={F_BASE}>
                    <option value="USD">USD ($)</option>
                    <option value="INR">INR (₹)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
              </div>

              {/* Hours + Rate + Billing */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Lbl field="estimatedHours" req>Estimated Hours</Lbl>
                  <input
                    type="number"
                    value={form.estimatedHours}
                    onChange={e => set('estimatedHours', e.target.value)}
                    placeholder="e.g. 500"
                    min="0"
                    className={INPUT}
                    style={fs('estimatedHours')}
                  />
                </div>
                <div>
                  <Lbl field="proposedRate" req>Proposed Rate /hr</Lbl>
                  <input
                    type="number"
                    value={form.proposedRate}
                    onChange={e => set('proposedRate', e.target.value)}
                    placeholder="e.g. 75"
                    min="0"
                    className={INPUT}
                    style={fs('proposedRate')}
                  />
                </div>
                <div>
                  <Lbl field="billingType" req>Billing Type</Lbl>
                  <select value={form.billingType} onChange={e => set('billingType', e.target.value)}
                    className={SELECT} style={fs('billingType')}>
                    <option value="">— Select —</option>
                    <option value="TIME_AND_MATERIAL">Time &amp; Material</option>
                    <option value="FIXED_PRICE">Fixed Price</option>
                    <option value="MILESTONE">Milestone</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* ── 5. Timeline ───────────────────────────────────────────────── */}
          <div className={SECTION}>
            <SectionTitle>Timeline</SectionTitle>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Lbl field="expectedCloseDate" req>Expected Close</Lbl>
                <input type="date" value={form.expectedCloseDate}
                  onChange={e => set('expectedCloseDate', e.target.value)}
                  className={INPUT} style={fs('expectedCloseDate')} />
              </div>
              <div>
                <Lbl field="proposedStartDate" req>Proposed Start</Lbl>
                <input type="date" value={form.proposedStartDate}
                  min={TODAY}
                  onChange={e => set('proposedStartDate', e.target.value)}
                  className={INPUT} style={fs('proposedStartDate')} />
                {fieldErrors.proposedStartDate && fieldErrors.proposedStartDate !== 'Required' && (
                  <p className="text-xs text-red-400 mt-1">{fieldErrors.proposedStartDate}</p>
                )}
              </div>
              <div>
                <Lbl field="proposedEndDate" req>Proposed End</Lbl>
                <input type="date" value={form.proposedEndDate}
                  min={form.proposedStartDate || TODAY}
                  onChange={e => set('proposedEndDate', e.target.value)}
                  className={INPUT} style={fs('proposedEndDate')} />
                {fieldErrors.proposedEndDate && fieldErrors.proposedEndDate !== 'Required' && (
                  <p className="text-xs text-red-400 mt-1">{fieldErrors.proposedEndDate}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Sticky footer ────────────────────────────────────────────────── */}
        <div
          className="flex gap-3 px-6 py-4 flex-shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
        >
          <button
            onClick={() => { reset(); onClose(); }}
            className="flex-1 py-2.5 rounded-xl text-sm text-ink-400 hover:text-ink-100 transition-all"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={createDeal.isPending}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)', color: '#fff' }}
          >
            {createDeal.isPending ? 'Creating…' : 'Create Deal'}
          </button>
        </div>
      </div>
    </div>
  );
}
