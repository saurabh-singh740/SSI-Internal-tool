/**
 * DealService — all Pre-Sales business logic.
 *
 * Controllers call into this service; the service never touches HTTP.
 * Stage transitions are validated here against the allowed-transition map
 * so the rule lives in one place and is testable in isolation.
 */
import { FilterQuery } from 'mongoose';
import Deal, { IDeal, DealStage } from '../../../models/Deal';
import DealActivity from '../../../models/DealActivity';
import { appEmitter } from '../../../events/emitter';

// ── Stage transition rules ────────────────────────────────────────────────────

const STAGE_TRANSITIONS: Record<DealStage, DealStage[]> = {
  LEAD:        ['QUALIFIED', 'LOST'],
  QUALIFIED:   ['PROPOSAL',  'LOST'],
  PROPOSAL:    ['NEGOTIATION', 'LOST'],
  NEGOTIATION: ['WON', 'LOST'],
  WON:         [],
  LOST:        [],
};

// Auto win-probability per stage
const STAGE_PROBABILITY: Record<DealStage, number> = {
  LEAD:        10,
  QUALIFIED:   25,
  PROPOSAL:    50,
  NEGOTIATION: 75,
  WON:         100,
  LOST:        0,
};

export function canTransition(from: DealStage, to: DealStage): boolean {
  return STAGE_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── Filter type ───────────────────────────────────────────────────────────────

export interface DealFilter {
  stage?:     DealStage;
  ownerId?:   string;
  search?:    string;
  tag?:       string;
  archived?:  boolean;
  partnerId?: string;
}

export interface StageTransitionMeta {
  lostReason?: string;
  lostNote?:   string;
  note?:       string;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class DealService {

  // ── List / pipeline ─────────────────────────────────────────────────────────

  async getDeals(userId: string, role: string, filter: DealFilter = {}) {
    const query: FilterQuery<IDeal> = {
      isArchived: filter.archived ?? false,
    };

    // Non-admin users only see deals they own or are on the team for
    if (role !== 'ADMIN') {
      query.$or = [{ owner: userId }, { team: userId }];
    }

    if (filter.stage)     query.stage     = filter.stage;
    if (filter.ownerId)   query.owner     = filter.ownerId;
    if (filter.tag)       query.tags      = filter.tag;
    if (filter.partnerId) query.partnerId = filter.partnerId;

    if (filter.search) {
      const safe = filter.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 100);
      query.$or = [
        { title:         { $regex: safe, $options: 'i' } },
        { clientCompany: { $regex: safe, $options: 'i' } },
        { dealNumber:    { $regex: safe, $options: 'i' } },
      ];
    }

    return Deal.find(query)
      .populate('owner', 'name email')
      .populate('team',  'name email')
      .populate('convertedProjectId', 'name code')
      .sort({ createdAt: -1 })
      .lean();
  }

  // Returns deals grouped by stage — used by the Kanban board
  async getPipeline(userId: string, role: string, filter: Omit<DealFilter, 'stage'> = {}) {
    const deals = await this.getDeals(userId, role, { ...filter, archived: false });

    const grouped: Record<DealStage, IDeal[]> = {
      LEAD:        [],
      QUALIFIED:   [],
      PROPOSAL:    [],
      NEGOTIATION: [],
      WON:         [],
      LOST:        [],
    };

    for (const deal of deals as unknown as IDeal[]) {
      grouped[deal.stage].push(deal);
    }

    return grouped;
  }

  // ── Single deal ─────────────────────────────────────────────────────────────

  async getDealById(dealId: string) {
    return Deal.findById(dealId)
      .populate('owner',                    'name email')
      .populate('team',                     'name email')
      .populate('createdBy',                'name email')
      .populate('convertedProjectId',       'name code status')
      .populate('convertedBy',              'name email')
      .populate('partnerId',                'name type isDefault')
      .populate('resourcePlan.engineer',    'name email role')
      .lean();
  }

  // ── Create ──────────────────────────────────────────────────────────────────

  async createDeal(data: Partial<IDeal>, actorId: string) {
    if (data.contacts && data.contacts.length > 5) {
      throw Object.assign(new Error('Maximum 5 contacts allowed per deal'), { statusCode: 400 });
    }
    if (data.proposedStartDate) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (new Date(data.proposedStartDate) < today) {
        throw Object.assign(new Error('Proposed start date cannot be in the past'), { statusCode: 400 });
      }
    }
    const deal = await Deal.create({ ...data, createdBy: actorId, owner: data.owner ?? actorId });

    await DealActivity.create({
      dealId: deal._id,
      type:   'FIELD_CHANGED',
      actor:  actorId,
      meta:   { note: 'Deal created' },
    });

    return deal;
  }

  // ── Update ──────────────────────────────────────────────────────────────────

  async updateDeal(dealId: string, data: Partial<IDeal>, actorId: string) {
    if (data.contacts !== undefined && data.contacts.length > 5) {
      throw Object.assign(new Error('Maximum 5 contacts allowed per deal'), { statusCode: 400 });
    }
    const deal = await Deal.findById(dealId);
    if (!deal) throw Object.assign(new Error('Deal not found'), { statusCode: 404 });
    if (deal.stage === 'LOST') {
      throw Object.assign(new Error('Cannot modify a lost deal'), { statusCode: 400 });
    }

    // Track value changes for the activity log
    const changed: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];
    const trackFields = ['title', 'estimatedValue', 'proposedRate', 'estimatedHours'] as const;
    for (const field of trackFields) {
      if (data[field] !== undefined && data[field] !== (deal as any)[field]) {
        changed.push({ field, oldValue: (deal as any)[field], newValue: data[field] });
      }
    }

    Object.assign(deal, data);
    await deal.save();

    if (changed.length) {
      await DealActivity.insertMany(
        changed.map(c => ({
          dealId: deal._id,
          type:   'FIELD_CHANGED',
          actor:  actorId,
          meta:   { fieldName: c.field, oldValue: c.oldValue, newValue: c.newValue },
        })),
        { ordered: false }
      );
    }

    return deal;
  }

  // ── Stage transition ────────────────────────────────────────────────────────

  async changeStage(
    dealId: string,
    toStage: DealStage,
    actorId: string,
    meta: StageTransitionMeta = {}
  ) {
    const deal = await Deal.findById(dealId);
    if (!deal) throw Object.assign(new Error('Deal not found'), { statusCode: 404 });

    if (!canTransition(deal.stage, toStage)) {
      throw Object.assign(
        new Error(`Cannot transition from ${deal.stage} to ${toStage}`),
        { statusCode: 400 }
      );
    }

    if (toStage === 'LOST' && !meta.lostReason) {
      throw Object.assign(new Error('lostReason is required when marking a deal as LOST'), { statusCode: 400 });
    }

    const fromStage = deal.stage;
    deal.stage          = toStage;
    deal.winProbability = STAGE_PROBABILITY[toStage];

    if (toStage === 'LOST') {
      deal.lostReason = meta.lostReason as any;
      deal.lostNote   = meta.lostNote;
    }

    await deal.save();

    await DealActivity.create({
      dealId: deal._id,
      type:   'STAGE_CHANGED',
      actor:  actorId,
      meta:   { fromStage, toStage, note: meta.note },
    });

    appEmitter.emit('deal:stage:changed', {
      dealId:    deal._id.toString(),
      dealTitle: deal.title,
      fromStage,
      toStage,
      actorId,
      ownerId:   deal.owner.toString(),
      teamIds:   deal.team.map(t => t.toString()),
    });

    return deal;
  }

  // ── Add note ────────────────────────────────────────────────────────────────

  async addNote(dealId: string, note: string, actorId: string) {
    const deal = await Deal.findById(dealId);
    if (!deal) throw Object.assign(new Error('Deal not found'), { statusCode: 404 });

    await DealActivity.create({
      dealId: deal._id,
      type:   'NOTE_ADDED',
      actor:  actorId,
      meta:   { note },
    });

    return { ok: true };
  }

  // ── Update SOW ──────────────────────────────────────────────────────────────

  async updateSOW(dealId: string, sowSections: IDeal['sowSections'], actorId: string) {
    const existing = await Deal.findById(dealId);
    if (!existing) throw Object.assign(new Error('Deal not found'), { statusCode: 404 });
    if (existing.stage === 'LOST') {
      throw Object.assign(new Error('Cannot modify a lost deal'), { statusCode: 400 });
    }
    const deal = await Deal.findByIdAndUpdate(
      dealId,
      { sowSections },
      { new: true, runValidators: true }
    );
    if (!deal) throw Object.assign(new Error('Deal not found'), { statusCode: 404 });

    await DealActivity.create({
      dealId: deal._id,
      type:   'SOW_UPDATED',
      actor:  actorId,
      meta:   { note: `SOW updated — ${sowSections.length} section(s)` },
    });

    return deal;
  }

  // ── Activities ──────────────────────────────────────────────────────────────

  async getActivities(dealId: string, limit = 20, cursor?: string) {
    const filter: FilterQuery<any> = { dealId };
    if (cursor) filter.createdAt = { $lt: new Date(cursor) };

    const activities = await DealActivity.find(filter)
      .populate('actor', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = activities.length > limit;
    return {
      activities: activities.slice(0, limit),
      nextCursor: hasMore ? (activities[limit - 1] as any).createdAt.toISOString() : null,
    };
  }

  // ── Archive / Delete ────────────────────────────────────────────────────────

  async archiveDeal(dealId: string) {
    return Deal.findByIdAndUpdate(dealId, { isArchived: true }, { new: true });
  }

  async deleteDeal(dealId: string) {
    const deal = await Deal.findById(dealId);
    if (!deal) throw Object.assign(new Error('Deal not found'), { statusCode: 404 });
    if (deal.convertedProjectId) {
      throw Object.assign(
        new Error('Cannot delete a converted deal. Archive it instead.'),
        { statusCode: 400 }
      );
    }
    await DealActivity.deleteMany({ dealId });
    await deal.deleteOne();
    return { ok: true };
  }
}

export const dealService = new DealService();
