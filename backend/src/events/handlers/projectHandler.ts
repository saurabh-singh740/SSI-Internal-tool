/**
 * Background job handler for project post-creation work.
 *
 * Registered once at server startup. Handles:
 *   - Timesheet generation per engineer
 *   - Invite token creation + email sending
 *   - Bulk in-app notifications
 *
 * All operations run in parallel per engineer (Promise.allSettled).
 * Individual engineer failures are logged but never crash the handler.
 *
 * This module has zero knowledge of HTTP — it's pure business logic.
 * That makes it trivial to move to BullMQ when you add Redis.
 */
import crypto from 'crypto';

import {
  appEmitter,
  ProjectEngineersProcessPayload,
  ProjectEngineerAssignPayload,
} from '../emitter';
import User from '../../models/User';
import Timesheet from '../../models/Timesheet';
import EngineerInvite from '../../models/EngineerInvite';
import Notification from '../../models/Notification';
import { sendEngineerAssignmentEmail } from '../../services/emailService';
import { generateYearSheets } from '../../utils/timesheetGenerator';

// ── Shared per-engineer logic ─────────────────────────────────────────────────
// Used by BOTH 'project:engineers:process' and 'project:engineer:assign'
// so the logic stays in one place.
// Exported so the BullMQ worker can reuse it without duplicating business logic.

export async function processOneEngineer(opts: {
  projectId:            string;
  projectName:          string;
  clientName:           string;
  engineerId:           string;
  year:                 number;
  totalAuthorizedHours: number;
  resend:               boolean;
}): Promise<void> {
  const { projectId, projectName, clientName, engineerId, year, totalAuthorizedHours, resend } = opts;
  const baseUrl = process.env.APP_BASE_URL || 'http://localhost:5173';

  // 1. Fetch engineer — lean() because we only need name + email
  const engineer = await User.findById(engineerId).select('name email').lean();
  if (!engineer) {
    console.warn(`[ProjectHandler] Engineer ${engineerId} not found — skipping`);
    return;
  }

  // 2. Generate timesheet (idempotent — findOne before create)
  if (!resend) {
    const tsExists = await Timesheet.exists({ project: projectId, engineer: engineerId, year });
    if (!tsExists) {
      const months = generateYearSheets(year, totalAuthorizedHours);
      await Timesheet.create({ project: projectId, engineer: engineerId, year, months });
      console.log(`[ProjectHandler] Timesheet created — project: ${projectId}, engineer: ${engineerId}, year: ${year}`);
    }
  }

  // 3. Invite token (delete pending ones first — idempotent re-assignment)
  const token     = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

  await EngineerInvite.deleteMany({ project: projectId, engineer: engineerId, accepted: false });

  const invite = await EngineerInvite.create({
    project:       projectId,
    engineer:      engineerId,
    engineerEmail: engineer.email,
    token,
    expiresAt,
  });

  // 4. Send assignment email (SMTP — was blocking the HTTP request before)
  const timesheetUrl = `${baseUrl}/timesheet/${projectId}/${engineerId}`;
  const emailResult  = await sendEngineerAssignmentEmail({
    to:           engineer.email,
    engineerName: engineer.name,
    projectName,
    clientName,
    inviteToken:  token,
    timesheetUrl,
  });

  // Persist email delivery status — visible in admin invite management
  await EngineerInvite.updateOne(
    { _id: invite._id },
    {
      emailSent:   emailResult.success,
      emailSentAt: emailResult.success ? new Date() : undefined,
      emailError:  emailResult.error,
    }
  );

  const status = emailResult.success ? '✓ email sent' : `✗ email failed: ${emailResult.error}`;
  console.log(`[ProjectHandler] Engineer ${engineer.email} — ${status}`);
}

// ── Handler: project:engineers:process ───────────────────────────────────────
// Fired by createProject. Fans out across all assigned engineers in parallel.
// Exported so the BullMQ worker can call it directly.

export async function handleProjectCreated(payload: ProjectEngineersProcessPayload): Promise<void> {
  const { projectId, projectName, clientName, engineerIds, year, totalAuthorizedHours } = payload;

  if (!engineerIds.length) return;

  // Parallel fan-out — one failure doesn't block the others
  const results = await Promise.allSettled(
    engineerIds.map((engineerId) =>
      processOneEngineer({
        projectId, projectName, clientName,
        engineerId, year, totalAuthorizedHours,
        resend: false,
      })
    )
  );

  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length) {
    console.error(`[ProjectHandler] ${failed.length}/${engineerIds.length} engineer(s) failed processing`);
    failed.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`  - engineerId[${i}]:`, r.reason);
      }
    });
  }

  // Bulk notification insert (single write)
  const notifications = engineerIds.map((engineerId) => ({
    user:    engineerId,
    project: projectId,
    type:    'ENGINEER_ASSIGNED' as const,
    message: `You have been assigned to project "${projectName}"`,
  }));

  await Notification.insertMany(notifications, { ordered: false }).catch((err) => {
    console.error('[ProjectHandler] Notification batch insert failed:', err.message);
  });
}

// ── Handler: project:engineer:assign ─────────────────────────────────────────
// Fired by assignEngineer (standalone assignment outside project creation).

export async function handleEngineerAssign(payload: ProjectEngineerAssignPayload): Promise<void> {
  const { projectId, projectName, clientName, engineerId, year, totalAuthorizedHours, resend } = payload;

  await processOneEngineer({
    projectId, projectName, clientName,
    engineerId, year, totalAuthorizedHours,
    resend,
  });

  if (!resend) {
    await Notification.create({
      user:    engineerId,
      project: projectId,
      type:    'ENGINEER_ASSIGNED',
      message: `You have been assigned to project "${projectName}"`,
    }).catch((err) => {
      console.error('[ProjectHandler] Notification create failed:', err.message);
    });
  }
}

// ── Register all handlers ─────────────────────────────────────────────────────
// Called once from index.ts at startup. Wraps each handler in a top-level
// try/catch so an unhandled exception never crashes the process.

export function registerProjectHandlers(): void {
  appEmitter.on('project:engineers:process', async (payload) => {
    try {
      await handleProjectCreated(payload);
    } catch (err) {
      console.error('[ProjectHandler] Unhandled error in project:engineers:process:', err);
    }
  });

  appEmitter.on('project:engineer:assign', async (payload) => {
    try {
      await handleEngineerAssign(payload);
    } catch (err) {
      console.error('[ProjectHandler] Unhandled error in project:engineer:assign:', err);
    }
  });

  console.log('[ProjectHandler] Registered event handlers');
}
