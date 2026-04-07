/**
 * auditLog — fire-and-forget audit record writer.
 *
 * Writes to the AuditLog collection AND console so entries are visible in
 * Render's log dashboard without needing a DB query.
 *
 * Design decisions:
 *   - Fire-and-forget: controllers do NOT await this. A failed audit write
 *     must never reject the primary operation (user deletion, role change).
 *   - Console log is the fallback if MongoDB write fails.
 *   - No sensitive values (passwords, tokens) should be passed in before/after.
 */
import AuditLog from '../models/AuditLog';
import mongoose from 'mongoose';

export interface AuditEntry {
  action:      string;
  actorId:     string;
  actorEmail:  string;
  targetType:  string;
  targetId:    string;
  targetLabel: string;
  before?:     Record<string, unknown>;
  after?:      Record<string, unknown>;
}

export function auditLog(entry: AuditEntry): void {
  // Structured console log — immediately visible in any log aggregator
  console.log(`[AUDIT] ${entry.action} | actor: ${entry.actorEmail} | target: ${entry.targetType}:${entry.targetLabel}`);

  // Async DB write — never awaited, never throws to caller
  AuditLog.create({
    ...entry,
    actorId: new mongoose.Types.ObjectId(entry.actorId),
  }).catch((err) => {
    // Log the failure but don't propagate — audit write failures must never
    // roll back the actual business operation.
    console.error('[AUDIT] DB write failed (operation was NOT rolled back):', err.message);
  });
}
