import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext, DragOverlay, closestCenter,
  DragStartEvent, DragEndEvent,
  MouseSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { Plus, RefreshCw, TrendingUp, Building2, X } from 'lucide-react';
import Header from '../../components/layout/Header';
import KanbanColumn from '../../components/presales/KanbanColumn';
import DealCard from '../../components/presales/DealCard';
import LostReasonModal from '../../components/presales/LostReasonModal';
import { STAGE_ORDER, STAGE_CONFIG, formatDealValue } from '../../components/presales/StageConfig';
import { usePipeline, useChangeDealStage } from '../../hooks/presales/useDeals';
import { usePartners } from '../../hooks/presales/usePartners';
import { Deal, DealStage, DealLostReason, PipelineData, Partner } from '../../types';
import CreateDealModal from '../../components/presales/CreateDealModal';

// ── Constants ─────────────────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<DealStage, DealStage[]> = {
  LEAD:        ['QUALIFIED', 'LOST'],
  QUALIFIED:   ['PROPOSAL',  'LOST'],
  PROPOSAL:    ['NEGOTIATION', 'LOST'],
  NEGOTIATION: ['WON', 'LOST'],
  WON:         [],
  LOST:        ['LEAD'],
};

function canMove(from: DealStage, to: DealStage) {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

function findDeal(pipeline: PipelineData, id: string): Deal | undefined {
  for (const stage of STAGE_ORDER) {
    const found = pipeline[stage]?.find(d => d._id === id);
    if (found) return found;
  }
}

// ── Partner filter bar ────────────────────────────────────────────────────────

function PartnerFilterBar({
  partners,
  selected,
  onSelect,
}: {
  partners: Partner[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  if (partners.length === 0) return null;

  return (
    <div className="px-6 pb-3">
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-xl overflow-x-auto no-scrollbar"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Label */}
        <div className="flex items-center gap-1.5 flex-shrink-0 pr-2"
             style={{ borderRight: '1px solid rgba(255,255,255,0.08)' }}>
          <Building2 className="h-3 w-3 text-ink-500" />
          <span className="text-[11px] text-ink-500 font-medium whitespace-nowrap">Partner</span>
        </div>

        {/* All pill */}
        <button
          onClick={() => onSelect('')}
          className="flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-medium transition-all duration-150"
          style={
            selected === ''
              ? { background: 'rgba(99,102,241,0.25)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.4)' }
              : { background: 'rgba(255,255,255,0.04)', color: '#64748b', border: '1px solid rgba(255,255,255,0.06)' }
          }
        >
          All
        </button>

        {/* Partner pills */}
        {partners.map(p => {
          const active = selected === p._id;
          return (
            <button
              key={p._id}
              onClick={() => onSelect(active ? '' : p._id)}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-all duration-150"
              style={
                active
                  ? { background: 'rgba(99,102,241,0.25)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.4)' }
                  : { background: 'rgba(255,255,255,0.04)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.06)' }
              }
            >
              {p.isDefault && (
                <span
                  className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                  style={{ background: active ? '#818cf8' : '#475569' }}
                />
              )}
              {p.name}
              {active && <X className="h-2.5 w-2.5 ml-0.5 opacity-70" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Pipeline page ─────────────────────────────────────────────────────────────

export default function Pipeline() {
  const navigate = useNavigate();

  const [partnerFilter, setPartnerFilter] = useState('');
  const [showCreate,    setShowCreate]    = useState(false);

  const { data: pipeline, isLoading, refetch, isRefetching } = usePipeline(
    partnerFilter ? { partnerId: partnerFilter } : undefined
  );
  const changeStage             = useChangeDealStage();
  const { data: partners = [] } = usePartners({ isActive: true });

  const [activeDeal,    setActiveDeal]    = useState<Deal | null>(null);
  const [pendingMove,   setPendingMove]   = useState<{ dealId: string; toStage: DealStage } | null>(null);
  const [showLostModal, setShowLostModal] = useState(false);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } })
  );

  const handleDragStart = useCallback((e: DragStartEvent) => {
    if (!pipeline) return;
    setActiveDeal(findDeal(pipeline, String(e.active.id)) ?? null);
  }, [pipeline]);

  const handleDragEnd = useCallback(async (e: DragEndEvent) => {
    setActiveDeal(null);
    if (!pipeline || !e.over) return;
    const toStage = String(e.over.id) as DealStage;
    const deal    = findDeal(pipeline, String(e.active.id));
    if (!deal || deal.stage === toStage || !canMove(deal.stage, toStage)) return;
    if (toStage === 'LOST') {
      setPendingMove({ dealId: deal._id, toStage: 'LOST' });
      setShowLostModal(true);
      return;
    }
    await changeStage.mutateAsync({ dealId: deal._id, stage: toStage });
  }, [pipeline, changeStage]);

  const handleLostSubmit = useCallback(async (reason: DealLostReason, note?: string) => {
    if (!pendingMove) return;
    setShowLostModal(false);
    await changeStage.mutateAsync({ dealId: pendingMove.dealId, stage: 'LOST', lostReason: reason, lostNote: note });
    setPendingMove(null);
  }, [pendingMove, changeStage]);

  // ── Stats ──────────────────────────────────────────────────────────────────

  const totalDeals = pipeline ? STAGE_ORDER.reduce((s, st) => s + (pipeline[st]?.length ?? 0), 0) : 0;

  const pipelineByCurrency: Record<string, number> = {};
  const wonByCurrency: Record<string, number> = {};
  if (pipeline) {
    for (const stage of STAGE_ORDER.filter(s => s !== 'WON' && s !== 'LOST')) {
      for (const d of pipeline[stage] ?? []) {
        const c = d.currency ?? 'USD';
        pipelineByCurrency[c] = (pipelineByCurrency[c] ?? 0) + d.estimatedValue;
      }
    }
    for (const d of pipeline['WON'] ?? []) {
      const c = d.currency ?? 'USD';
      wonByCurrency[c] = (wonByCurrency[c] ?? 0) + d.estimatedValue;
    }
  }
  const pipelineStr = Object.entries(pipelineByCurrency).filter(([, v]) => v > 0).map(([c, v]) => formatDealValue(v, c)).join(' · ');
  const wonStr      = Object.entries(wonByCurrency).filter(([, v]) => v > 0).map(([c, v]) => formatDealValue(v, c)).join(' · ');

  const activePartnerName = partners.find(p => p._id === partnerFilter)?.name;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Pre-Sales Pipeline"
        subtitle={
          isLoading
            ? undefined
            : activePartnerName
              ? `${totalDeals} deal${totalDeals !== 1 ? 's' : ''} · ${activePartnerName}`
              : `${totalDeals} deal${totalDeals !== 1 ? 's' : ''}`
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              disabled={isRefetching}
              className="p-1.5 rounded-lg text-ink-400 hover:text-ink-100 transition-all"
              style={{ background: 'rgba(255,255,255,0.05)' }}
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> New Deal
            </button>
          </div>
        }
      />

      {/* ── Partner filter bar ──────────────────────────────────────────────── */}
      <PartnerFilterBar
        partners={partners}
        selected={partnerFilter}
        onSelect={setPartnerFilter}
      />

      {/* ── Stats strip ────────────────────────────────────────────────────── */}
      {pipeline && (
        <div className="px-6 pb-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {STAGE_ORDER.map(stage => {
            const count = pipeline[stage]?.length ?? 0;
            const cfg   = STAGE_CONFIG[stage];
            return (
              <div
                key={stage}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
              >
                <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: cfg.dot }} />
                <span className="text-xs text-ink-500">{cfg.label}</span>
                <span className="text-xs font-bold tabular-nums" style={{ color: cfg.color }}>{count}</span>
              </div>
            );
          })}

          <div className="ml-auto flex items-center gap-4 flex-shrink-0 pl-4">
            {pipelineStr && (
              <div className="text-xs text-ink-500">
                Pipeline: <span className="font-semibold text-ink-300">{pipelineStr}</span>
              </div>
            )}
            {wonStr && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                <TrendingUp className="h-3.5 w-3.5" />
                <span className="font-semibold">Won: {wonStr}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Kanban board ───────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 px-6 pb-6 overflow-x-auto no-scrollbar">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="h-8 w-8 rounded-xl animate-pulse" style={{ background: 'rgba(99,102,241,0.3)' }} />
          </div>
        ) : pipeline ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-3 h-full" style={{ minWidth: 'max(100%, 1100px)' }}>
              {STAGE_ORDER.map(stage => (
                <KanbanColumn
                  key={stage}
                  stage={stage}
                  config={STAGE_CONFIG[stage]}
                  deals={pipeline[stage] ?? []}
                  onCardClick={deal => navigate(`/presales/${deal._id}`)}
                />
              ))}
            </div>

            <DragOverlay dropAnimation={null}>
              {activeDeal && <DealCard deal={activeDeal} isOverlay />}
            </DragOverlay>
          </DndContext>
        ) : null}
      </div>

      <LostReasonModal
        open={showLostModal}
        onSubmit={handleLostSubmit}
        onClose={() => { setShowLostModal(false); setPendingMove(null); }}
      />
      <CreateDealModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
