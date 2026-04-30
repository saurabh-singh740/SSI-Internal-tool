import { useState } from 'react';
import { X } from 'lucide-react';
import { DealLostReason } from '../../types';

const LOST_REASONS: { value: DealLostReason; label: string }[] = [
  { value: 'PRICE',       label: 'Price too high' },
  { value: 'COMPETITOR',  label: 'Chose a competitor' },
  { value: 'TIMELINE',    label: 'Timeline mismatch' },
  { value: 'NO_BUDGET',   label: 'No budget' },
  { value: 'NO_RESPONSE', label: 'No response' },
  { value: 'OTHER',       label: 'Other' },
];

interface LostReasonModalProps {
  open:     boolean;
  onSubmit: (reason: DealLostReason, note?: string) => void;
  onClose:  () => void;
}

export default function LostReasonModal({ open, onSubmit, onClose }: LostReasonModalProps) {
  const [reason, setReason] = useState<DealLostReason | ''>('');
  const [note,   setNote]   = useState('');

  if (!open) return null;

  const handleSubmit = () => {
    if (!reason) return;
    onSubmit(reason as DealLostReason, note || undefined);
    setReason('');
    setNote('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 z-10"
        style={{ background: 'rgba(13,15,35,0.98)', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-ink-100">Why was this deal lost?</h3>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-200 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2 mb-4">
          {LOST_REASONS.map(r => (
            <button
              key={r.value}
              onClick={() => setReason(r.value)}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-150"
              style={{
                background:  reason === r.value ? 'rgba(248,113,113,0.15)' : 'rgba(255,255,255,0.04)',
                border:      `1px solid ${reason === r.value ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.07)'}`,
                color:       reason === r.value ? '#f87171' : '#94a3b8',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>

        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Additional notes (optional)"
          rows={3}
          className="w-full mb-5 px-3 py-2 text-sm rounded-lg text-ink-200 resize-none"
          style={{
            background:  'rgba(255,255,255,0.04)',
            border:      '1px solid rgba(255,255,255,0.08)',
            outline:     'none',
          }}
        />

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg text-sm text-ink-400 transition-colors hover:text-ink-100"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!reason}
            className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-150 disabled:opacity-40"
            style={{ background: 'rgba(248,113,113,0.2)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)' }}
          >
            Mark Lost
          </button>
        </div>
      </div>
    </div>
  );
}
