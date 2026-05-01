import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Deal, DealStage } from '../../types';
import { StageConfig, formatDealValue } from './StageConfig';
import DealCard from './DealCard';

const PAGE_SIZE = 50;

// ── Sortable card wrapper ─────────────────────────────────────────────────────

function SortableDealCard({ deal, onClick }: { deal: Deal; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deal._id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform:   CSS.Transform.toString(transform),
        transition,
        opacity:     isDragging ? 0.35 : 1,
        touchAction: 'none',
      }}
      {...attributes}
      {...listeners}
    >
      <DealCard deal={deal} onClick={onClick} />
    </div>
  );
}

// ── Column ────────────────────────────────────────────────────────────────────

interface KanbanColumnProps {
  stage:       DealStage;
  config:      StageConfig;
  deals:       Deal[];
  onCardClick: (deal: Deal) => void;
}

export default function KanbanColumn({ stage, config, deals, onCardClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const [showAll, setShowAll] = useState(false);

  const visibleDeals = showAll || deals.length <= PAGE_SIZE ? deals : deals.slice(0, PAGE_SIZE);
  const hiddenCount  = deals.length - visibleDeals.length;

  const totalValue = deals.reduce((s, d) => s + d.estimatedValue, 0);
  const currency   = deals[0]?.currency ?? 'USD';

  return (
    <div className="flex flex-col flex-1 min-w-[160px] min-h-0">
      {/* ── Column header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-1 pb-2.5 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="h-2 w-2 rounded-full flex-shrink-0"
            style={{ background: config.dot }}
          />
          <span className="text-xs font-semibold text-ink-200 truncate">{config.label}</span>
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
            style={{ background: config.bg, color: config.color }}
          >
            {deals.length}
          </span>
        </div>
        {deals.length > 0 && (
          <span className="text-[10px] text-ink-500 ml-1 flex-shrink-0">
            {formatDealValue(totalValue, currency)}
          </span>
        )}
      </div>

      {/* ── Drop zone ──────────────────────────────────────────────────────── */}
      <div
        ref={setNodeRef}
        className="flex-1 min-h-[120px] rounded-xl p-2 flex flex-col gap-2 overflow-y-auto no-scrollbar transition-colors duration-150"
        style={{
          background: isOver ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.02)',
          border:     `1px solid ${isOver ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.05)'}`,
        }}
      >
        <SortableContext items={deals.map(d => d._id)} strategy={verticalListSortingStrategy}>
          {visibleDeals.map(deal => (
            <SortableDealCard key={deal._id} deal={deal} onClick={() => onCardClick(deal)} />
          ))}
        </SortableContext>

        {hiddenCount > 0 && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full text-[11px] text-ink-500 hover:text-ink-300 py-1.5 transition-colors"
          >
            +{hiddenCount} more
          </button>
        )}

        {deals.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-[11px] text-ink-700">Drop here</span>
          </div>
        )}
      </div>
    </div>
  );
}
