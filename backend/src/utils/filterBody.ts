/**
 * filterBody — strict allowlist-based field extraction.
 *
 * Strips ALL keys from an incoming request body that are not explicitly
 * listed in the allowlist. This is the primary defense against mass-assignment
 * attacks where an attacker injects internal fields (hoursUsed, role, __v, etc.)
 * into a POST/PUT payload.
 *
 * Usage:
 *   const safe = filterBody(req.body, ['name', 'email', 'phone'] as const);
 *   await User.create(safe);
 *
 * Works with `as const` arrays for TypeScript narrowing on the result type.
 *
 * Does NOT deep-merge nested objects — nested arrays (e.g. engineers[]) are
 * returned as-is. Apply nested validation separately if needed.
 */

type AllowedKeys = readonly string[];

/**
 * Returns a new object containing only the keys in `allowlist`.
 * Keys with undefined values are excluded (same as omitting them).
 */
export function filterBody<T extends AllowedKeys>(
  body: unknown,
  allowlist: T
): Record<T[number], unknown> {
  const result: Record<string, unknown> = {};

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return result as Record<T[number], unknown>;
  }

  const source = body as Record<string, unknown>;

  for (const key of allowlist) {
    if (key in source && source[key] !== undefined) {
      result[key] = source[key];
    }
  }

  return result as Record<T[number], unknown>;
}
