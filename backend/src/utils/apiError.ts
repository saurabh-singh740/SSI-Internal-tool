/**
 * Centralized API error utilities.
 *
 * safeError() – only includes error detail in development.
 * Never leak stack traces or internal details to production clients.
 */

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** Returns a partial response body that includes detail only in dev. */
export function safeError(error: unknown): Record<string, unknown> {
  if (process.env.NODE_ENV === 'production') return {};
  return { detail: error instanceof Error ? error.message : String(error) };
}
