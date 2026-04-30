import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, AlertTriangle, CheckCircle } from 'lucide-react';
import { Deal, ConversionOverrides, BillingType, Currency, ProjectType } from '../../types';
import { useConvertDeal } from '../../hooks/presales/useDeals';

interface ConvertModalProps {
  deal:    Deal;
  open:    boolean;
  onClose: () => void;
}

const INPUT_STYLE = {
  background: 'rgba(255,255,255,0.04)',
  border:     '1px solid rgba(255,255,255,0.08)',
  outline:    'none',
  color:      '#e2e8f0',
};

const SELECT_STYLE = { ...INPUT_STYLE };

export default function ConvertModal({ deal, open, onClose }: ConvertModalProps) {
  const navigate     = useNavigate();
  const convertDeal  = useConvertDeal();
  const [error, setError] = useState('');
  const [codeAdjusted, setCodeAdjusted] = useState('');

  // Pre-fill from deal fields
  const primaryContact = deal.contacts?.[0];
  const [form, setForm] = useState<ConversionOverrides>({
    name:            `${deal.clientCompany} — ${deal.title}`,
    code:            `PRJ-${deal.dealNumber.replace('DEAL-', '')}`,
    type:            'CLIENT_PROJECT',
    clientName:      primaryContact?.name    ?? '',
    clientCompany:   deal.clientCompany,
    clientEmail:     primaryContact?.email   ?? '',
    clientPhone:     primaryContact?.phone   ?? '',
    startDate:       deal.proposedStartDate  ?? '',
    endDate:         deal.proposedEndDate    ?? '',
    billingType:     (deal.billingType as BillingType) ?? 'TIME_AND_MATERIAL',
    hourlyRate:      deal.proposedRate       ?? 0,
    currency:        deal.currency           as Currency,
    contractedHours: deal.estimatedHours     ?? 0,
  });

  const set = (k: keyof ConversionOverrides, v: unknown) =>
    setForm(f => ({ ...f, [k]: v }));

  if (!open) return null;

  const missingRate  = !form.hourlyRate || form.hourlyRate === 0;
  const missingHours = !form.contractedHours || form.contractedHours === 0;

  const handleSubmit = async () => {
    setError('');
    try {
      const res = await convertDeal.mutateAsync({ dealId: deal._id, overrides: form });
      if (res.project?.code !== form.code) {
        setCodeAdjusted(res.project.code);
      }
      navigate(`/projects/${res.project._id}`);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Conversion failed';
      if (err?.response?.data?.projectId) {
        setError(`${msg}. Navigating to existing project…`);
        setTimeout(() => navigate(`/projects/${err.response.data.projectId}`), 1500);
      } else {
        setError(msg);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative w-full max-w-2xl rounded-2xl p-6 z-10 overflow-y-auto max-h-[92vh]"
        style={{ background: 'rgba(13,15,35,0.99)', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-semibold text-ink-100">Convert Deal to Project</h3>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-200 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-ink-500 mb-6">
          Review and adjust the fields below before creating the project.
        </p>

        {/* Warnings */}
        {(missingRate || missingHours) && (
          <div className="mb-5 p-3 rounded-xl flex items-start gap-2" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-300">
              {[missingRate && 'No hourly rate set', missingHours && 'No contracted hours set'].filter(Boolean).join(' · ')}. The project will be created with defaults — you can edit it afterwards.
            </p>
          </div>
        )}

        {error && (
          <div className="mb-5 px-3 py-2 rounded-lg text-sm text-red-400" style={{ background: 'rgba(248,113,113,0.1)' }}>
            {error}
          </div>
        )}

        {codeAdjusted && (
          <div className="mb-5 p-3 rounded-xl flex items-start gap-2" style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)' }}>
            <CheckCircle className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-300">Code auto-adjusted to <strong>{codeAdjusted}</strong> to avoid conflict.</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {/* Project name */}
          <div className="col-span-2">
            <label className="block text-xs font-medium text-ink-400 mb-1.5">Project Name</label>
            <input value={form.name ?? ''} onChange={e => set('name', e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm" style={INPUT_STYLE} />
          </div>

          {/* Code */}
          <div>
            <label className="block text-xs font-medium text-ink-400 mb-1.5">Project Code</label>
            <input value={form.code ?? ''} onChange={e => set('code', e.target.value.toUpperCase())}
              className="w-full px-3 py-2 rounded-lg text-sm font-mono" style={INPUT_STYLE} />
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-medium text-ink-400 mb-1.5">Project Type</label>
            <select value={form.type} onChange={e => set('type', e.target.value as ProjectType)}
              className="w-full px-3 py-2 rounded-lg text-sm" style={SELECT_STYLE}>
              <option value="CLIENT_PROJECT">Client Project</option>
              <option value="INTERNAL">Internal</option>
              <option value="SUPPORT">Support</option>
            </select>
          </div>

          {/* Client info */}
          <div>
            <label className="block text-xs font-medium text-ink-400 mb-1.5">Client Name</label>
            <input value={form.clientName ?? ''} onChange={e => set('clientName', e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm" style={INPUT_STYLE} />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-400 mb-1.5">Client Company</label>
            <input value={form.clientCompany ?? ''} onChange={e => set('clientCompany', e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm" style={INPUT_STYLE} />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-400 mb-1.5">Client Email</label>
            <input value={form.clientEmail ?? ''} onChange={e => set('clientEmail', e.target.value)}
              type="email" className="w-full px-3 py-2 rounded-lg text-sm" style={INPUT_STYLE} />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-400 mb-1.5">Client Phone</label>
            <input value={form.clientPhone ?? ''} onChange={e => set('clientPhone', e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm" style={INPUT_STYLE} />
          </div>

          {/* Dates */}
          <div>
            <label className="block text-xs font-medium text-ink-400 mb-1.5">Start Date</label>
            <input type="date" value={(form.startDate as string) ?? ''}
              onChange={e => set('startDate', e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm" style={INPUT_STYLE} />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-400 mb-1.5">End Date</label>
            <input type="date" value={(form.endDate as string) ?? ''}
              onChange={e => set('endDate', e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm" style={INPUT_STYLE} />
          </div>

          {/* Commercial */}
          <div>
            <label className="block text-xs font-medium text-ink-400 mb-1.5">Billing Type</label>
            <select value={form.billingType} onChange={e => set('billingType', e.target.value as BillingType)}
              className="w-full px-3 py-2 rounded-lg text-sm" style={SELECT_STYLE}>
              <option value="TIME_AND_MATERIAL">Time & Material</option>
              <option value="FIXED_PRICE">Fixed Price</option>
              <option value="MILESTONE">Milestone</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-400 mb-1.5">Currency</label>
            <select value={form.currency} onChange={e => set('currency', e.target.value as Currency)}
              className="w-full px-3 py-2 rounded-lg text-sm" style={SELECT_STYLE}>
              <option value="USD">USD</option>
              <option value="INR">INR</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-400 mb-1.5">Hourly Rate</label>
            <input type="number" value={form.hourlyRate ?? ''} onChange={e => set('hourlyRate', parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-lg text-sm" style={INPUT_STYLE} min="0" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-400 mb-1.5">Contracted Hours</label>
            <input type="number" value={form.contractedHours ?? ''} onChange={e => set('contractedHours', parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-lg text-sm" style={INPUT_STYLE} min="0" />
          </div>
        </div>

        <p className="text-xs text-ink-600 mt-4">
          Engineers can be assigned after the project is created.
        </p>

        {/* Footer */}
        <div className="flex gap-3 mt-6">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm text-ink-400 hover:text-ink-100 transition-all"
            style={{ background: 'rgba(255,255,255,0.05)' }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={convertDeal.isPending}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff' }}>
            {convertDeal.isPending ? 'Converting…' : '🎉 Convert to Project'}
          </button>
        </div>
      </div>
    </div>
  );
}
