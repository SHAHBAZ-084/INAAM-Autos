import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/helpers';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code ?? undefined });
    return;
  }

  const isDbBusyError =
    (typeof (err as { code?: string })?.code === 'string' &&
      ['P2028', 'P2034'].includes((err as { code: string }).code)) ||
    (err instanceof Error && /database is locked|SQLITE_BUSY/i.test(err.message));

  if (isDbBusyError) {
    console.error('DB busy/timeout:', err);
    res.status(503).json({ error: 'The database is busy, please try again in a moment.' });
    return;
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
