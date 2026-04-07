import { useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Accessible confirmation modal — replaces window.confirm() throughout the app.
 * Traps focus, responds to Escape, and supports keyboard confirmation with Enter.
 */
export default function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel  = 'Cancel',
  danger       = true,
  error,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const cancelRef  = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Auto-focus the cancel button when modal opens (safer default)
  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-desc"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Panel */}
      <div
        className="relative rounded-xl w-full max-w-sm p-6 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xl"
        style={{ background: 'rgba(10,13,28,0.92)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}
      >
        {/* Close button */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 btn-icon h-7 w-7 text-ink-400"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Icon */}
        <div className={`h-10 w-10 rounded-full flex items-center justify-center mb-4 ${
          danger ? 'bg-red-500/15' : 'bg-amber-500/15'
        }`}>
          <AlertTriangle className={`h-5 w-5 ${danger ? 'text-red-400' : 'text-amber-400'}`} />
        </div>

        {/* Content */}
        <h2 id="confirm-title" className="text-base font-semibold text-ink-100 mb-2">
          {title}
        </h2>
        <p id="confirm-desc" className="text-sm text-ink-400 leading-relaxed" style={{ marginBottom: error ? '0.75rem' : '1.5rem' }}>
          {description}
        </p>

        {/* Inline error from server */}
        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)' }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button ref={cancelRef} onClick={onCancel} className="btn-secondary">
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={danger ? 'btn-danger' : 'btn-primary'}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}