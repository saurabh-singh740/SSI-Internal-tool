/**
 * diffUtil — field-level change tracking + sensitive-data sanitization.
 *
 * Two responsibilities:
 *  1. computeDiff(): extract only the fields that changed between two snapshots.
 *  2. sanitize():    recursively strip passwords, tokens, and secrets before
 *                    writing them to the audit log.
 *
 * Usage:
 *   const { oldValues, newValues, hasChanges } = computeDiff(before, after, TRACKED_FIELDS);
 *   if (hasChanges) auditLogger({ ..., oldValues, newValues });
 */

// ── Sensitive-field detection ─────────────────────────────────────────────────
// Keys matched case-insensitively.  Add new patterns here — all callers benefit.

const SENSITIVE_PATTERNS: RegExp[] = [
  /^password$/i,
  /^token$/i,
  /^secret$/i,
  /^apikey$/i,
  /^api_key$/i,
  /^authorization$/i,
  /^jwt$/i,
  /^hash$/i,
  /^salt$/i,
  /^credential/i,
  /^private/i,
  /^accesskey/i,
  /^access_key/i,
];

function isSensitive(key: string): boolean {
  return SENSITIVE_PATTERNS.some(p => p.test(key));
}

/**
 * Recursively strip sensitive fields from any value.
 * Safe to call on null / undefined / primitives.
 */
export function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || value === undefined) return value;
  if (typeof value !== 'object')                          return value;
  if (value instanceof Date)                              return value;

  if (Array.isArray(value)) {
    return value.map(item => sanitize(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    result[k] = isSensitive(k) ? '[REDACTED]' : sanitize(v, depth + 1);
  }
  return result;
}

// ── Diff result ───────────────────────────────────────────────────────────────

export interface DiffResult {
  oldValues:  Record<string, unknown>;
  newValues:  Record<string, unknown>;
  hasChanges: boolean;
}

/**
 * computeDiff — extract only changed fields between two plain-object snapshots.
 *
 * @param before   Object snapshot before the mutation
 * @param after    Object snapshot after the mutation
 * @param pick     Optional allowlist of field names to compare.
 *                 When omitted, all top-level keys in both objects are compared.
 *
 * Comparison is done with JSON.stringify so nested objects and arrays are
 * compared by value, not by reference.
 *
 * Sensitive keys are automatically sanitized in the returned values.
 */
export function computeDiff(
  before: Record<string, unknown>,
  after:  Record<string, unknown>,
  pick?:  readonly string[],
): DiffResult {
  const keys = pick
    ? [...pick]
    : [...new Set([...Object.keys(before), ...Object.keys(after)])];

  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  for (const key of keys) {
    // Ignore internal Mongoose fields
    if (key === '__v' || key === '_id') continue;

    const oldVal = before[key];
    const newVal = after[key];

    // Deep equality via serialization — handles nested objects, arrays, Dates
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      oldValues[key] = sanitize(oldVal);
      newValues[key] = sanitize(newVal);
    }
  }

  return {
    oldValues,
    newValues,
    hasChanges: Object.keys(oldValues).length > 0,
  };
}

/**
 * stripSensitive — convenience wrapper for sanitizing a full object
 * before passing it to auditLogger as oldValues / newValues.
 */
export function stripSensitive(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  return sanitize(obj) as Record<string, unknown>;
}

/**
 * pickFields — extract only the listed keys from an object.
 * Useful for storing a compact snapshot of specific fields.
 */
export function pickFields(
  obj: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const f of fields) {
    if (obj[f] !== undefined) result[f] = obj[f];
  }
  return result;
}
