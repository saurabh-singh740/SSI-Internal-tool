/**
 * Background event handler for Pre-Sales (Deal) lifecycle events.
 *
 * Registered once at startup alongside registerProjectHandlers().
 * Handles in-app notifications and email triggers for stage changes
 * and deal-to-project conversions.
 *
 * Zero knowledge of HTTP — pure business logic, identical shape to
 * projectHandler.ts so migration to BullMQ follows the same upgrade path.
 */
import {
  appEmitter,
  DealStageChangedPayload,
  DealConvertedPayload,
} from '../emitter';
import Notification from '../../models/Notification';

// Only notify team on these stages — not on every minor transition
const NOTIFY_STAGES = new Set(['PROPOSAL', 'NEGOTIATION', 'WON', 'LOST']);

// ── Handler: deal:stage:changed ───────────────────────────────────────────────

async function handleStageChanged(payload: DealStageChangedPayload): Promise<void> {
  const { dealId, dealTitle, toStage, ownerId, teamIds } = payload;

  if (!NOTIFY_STAGES.has(toStage)) return;

  const recipients = [...new Set([ownerId, ...teamIds])];
  if (!recipients.length) return;

  const stageLabel: Record<string, string> = {
    PROPOSAL:    'Proposal',
    NEGOTIATION: 'Negotiation',
    WON:         'Won 🎉',
    LOST:        'Lost',
  };

  await Notification.insertMany(
    recipients.map(userId => ({
      user:    userId,
      type:    'DEAL_STAGE_CHANGED',
      message: `Deal "${dealTitle}" moved to ${stageLabel[toStage] ?? toStage}`,
      meta:    { dealId, toStage },
    })),
    { ordered: false }
  ).catch(err => {
    console.error('[DealHandler] Notification insert failed:', err.message);
  });
}

// ── Handler: deal:converted ───────────────────────────────────────────────────

async function handleDealConverted(payload: DealConvertedPayload): Promise<void> {
  const { dealId, dealTitle, projectId, ownerId } = payload;

  await Notification.create({
    user:    ownerId,
    type:    'DEAL_CONVERTED',
    message: `Deal "${dealTitle}" has been converted to a project`,
    meta:    { dealId, projectId },
  }).catch(err => {
    console.error('[DealHandler] Conversion notification failed:', err.message);
  });
}

// ── Register all handlers ─────────────────────────────────────────────────────

export function registerDealHandlers(): void {
  appEmitter.on('deal:stage:changed', async (payload) => {
    try {
      await handleStageChanged(payload);
    } catch (err) {
      console.error('[DealHandler] Unhandled error in deal:stage:changed:', err);
    }
  });

  appEmitter.on('deal:converted', async (payload) => {
    try {
      await handleDealConverted(payload);
    } catch (err) {
      console.error('[DealHandler] Unhandled error in deal:converted:', err);
    }
  });

  console.log('[DealHandler] Registered event handlers');
}
