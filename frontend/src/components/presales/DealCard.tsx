import { Deal, User } from '../../types';
import { clsx } from 'clsx';
import { Calendar, Clock } from 'lucide-react';
import { STAGE_CONFIG, PRIORITY_COLOR, formatDealValue, daysUntil } from './StageConfig';

interface DealCardProps {
  deal:       Deal;
  isOverlay?: boolean;
  onClick?:   () => void;
}

function ownerName(o: Deal['owner']): string {
  if (typeof o === 'object' && o !== null) return (o as User).name;
  return '?';
}

function ownerInitial(o: Deal['owner']): string {
  return ownerName(o).charAt(0).toUpperCase();
}

export default function DealCard({ deal, isOverlay, onClick }: DealCardProps) {
  const stageCfg  = STAGE_CONFIG[deal.stage];
  const days      = daysUntil(deal.expectedCloseDate);
  const isOverdue = days !== null && days < 0;
  const isNear    = days !== null && days >= 0 && days <= 7;

  return (
    <div
      onClick={onClick}
      className={clsx(
        'w-full text-left rounded-xl p-3 cursor-pointer select-none',
        'border transition-all duration-150',
        isOverlay
          ? 'rotate-1 scale-105 shadow-2xl opacity-95'
          : 'hover:border-white/15 hover:bg-white/[0.03]',
      )}
      style={{
        background:  'rgba(255,255,255,0.04)',
        borderColor: 'rgba(255,255,255,0.07)',
      }}
    >
      {/* Deal number + priority dot */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-mono text-ink-600 tracking-wide truncate">{deal.dealNumber}</span>
        <span
          className="h-1.5 w-1.5 rounded-full flex-shrink-0 ml-1"
          style={{ background: PRIORITY_COLOR[deal.priority] }}
          title={deal.priority}
        />
      </div>

      {/* Title */}
      <p className="text-[13px] font-semibold text-ink-100 leading-snug line-clamp-2 mb-1">
        {deal.title}
      </p>

      {/* Company */}
      <p className="text-[11px] text-ink-500 truncate mb-2.5">{deal.clientCompany}</p>

      {/* Value + win probability */}
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[13px] font-bold" style={{ color: stageCfg.color }}>
          {formatDealValue(deal.estimatedValue, deal.currency)}
        </span>
        <span
          className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
          style={{ background: stageCfg.bg, color: stageCfg.color }}
        >
          {deal.winProbability}%
        </span>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        {deal.expectedCloseDate ? (
          <div className={clsx(
            'flex items-center gap-1 text-[10px]',
            isOverdue ? 'text-red-400' : isNear ? 'text-yellow-400' : 'text-ink-600'
          )}>
            {isOverdue ? <Clock className="h-2.5 w-2.5" /> : <Calendar className="h-2.5 w-2.5" />}
            <span>
              {isOverdue
                ? `${Math.abs(days!)}d over`
                : days === 0
                ? 'Today'
                : `${days}d left`}
            </span>
          </div>
        ) : <span />}

        <div
          className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)' }}
          title={ownerName(deal.owner)}
        >
          {ownerInitial(deal.owner)}
        </div>
      </div>
    </div>
  );
}
