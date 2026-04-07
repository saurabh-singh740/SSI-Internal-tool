import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/apiError';

/**
 * Global Express error handler — must be the LAST middleware registered in index.ts.
 *
 * Catches:
 *  - AppError (operational errors thrown intentionally)
 *  - Mongoose validation/cast errors
 *  - JWT errors
 *  - Any other unhandled Error
 */
export function globalErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  console.error('[GlobalError]', err);

  // Operational errors thrown by our code
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }

  // Mongoose duplicate key (e.g. unique email)
  if ((err as any).code === 11000) {
    const field = Object.keys((err as any).keyValue ?? {})[0] ?? 'field';
    res.status(409).json({ message: `Duplicate value for ${field}` });
    return;
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values((err as any).errors ?? {})
      .map((e: any) => e.message)
      .join(', ');
    res.status(400).json({ message: messages || 'Validation error' });
    return;
  }

  // Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    res.status(400).json({ message: 'Invalid ID format' });
    return;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({ message: 'Invalid token' });
    return;
  }
  if (err.name === 'TokenExpiredError') {
    res.status(401).json({ message: 'Token expired' });
    return;
  }

  // Unknown / unexpected errors — never leak internals in production
  const isProd = process.env.NODE_ENV === 'production';
  res.status(500).json({
    message: 'Internal server error',
    ...(isProd ? {} : { detail: err.message, stack: err.stack }),
  });
}
