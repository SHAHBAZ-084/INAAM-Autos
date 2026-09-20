import { Router } from 'express';
import path from 'path';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { logger } from '../../lib/logger';
import { asyncHandler, validateBody } from '../../utils/helpers';
import { openLogsFolder } from '../backup/backup.service';
import { reconcileProductStockToMovements, runHealthCheck } from './health.service';

export const healthRouter = Router();

healthRouter.use(requireAuth);

healthRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    res.json(await runHealthCheck());
  }),
);

healthRouter.post(
  '/health/reconcile-stock',
  validateBody(z.object({ productId: z.number().int().positive() })),
  asyncHandler(async (req, res) => {
    res.json(await reconcileProductStockToMovements(req.body.productId));
  }),
);

healthRouter.get(
  '/logs-path',
  asyncHandler(async (_req, res) => {
    res.json({ path: path.resolve(openLogsFolder()) });
  }),
);

healthRouter.post(
  '/client-log',
  validateBody(
    z.object({
      message: z.string().min(1).max(2000),
      stack: z.string().max(8000).optional(),
      componentStack: z.string().max(8000).optional(),
      route: z.string().max(500).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { message, stack, componentStack, route } = req.body as {
      message: string;
      stack?: string;
      componentStack?: string;
      route?: string;
    };
    logger.error('UI client error', {
      message,
      stack: stack?.slice(0, 4000),
      componentStack: componentStack?.slice(0, 4000),
      route,
    });
    res.json({ ok: true });
  }),
);
