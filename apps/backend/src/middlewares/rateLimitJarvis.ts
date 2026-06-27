// middlewares/rateLimitJarvis.ts
// ─────────────────────────────────────────────────────────────────────
// Middleware de rate-limit específico para endpoints de Jarvis.
// Aplica por userId (del JWT), no por IP, para que varios usuarios
// detrás de un mismo proxy no se bloqueen entre sí.
//
// Si supera el límite, devuelve 429 con headers estándar.
// ─────────────────────────────────────────────────────────────────────

import type { Request, Response, NextFunction } from 'express';
import { checkRateLimit } from '../lib/ai/rate-limit';
import { AppError } from '../lib/errors';

export function rateLimitJarvis(req: Request, _res: Response, next: NextFunction): void {
  // Solo aplicamos a usuarios autenticados. Si no hay user.sub,
  // dejamos pasar (el requireAuth previo fallaría igual).
  const sub = req.user?.sub;
  if (!sub) {
    next();
    return;
  }
  const result = checkRateLimit(`jarvis:${sub}`);
  // Headers estándar (útiles para clientes que quieran feedback).
  _res.setHeader('X-RateLimit-Limit',     String(result.limit));
  _res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  _res.setHeader('X-RateLimit-Reset',     String(Math.ceil(result.resetMs / 1000)));
  if (!result.allowed) {
    next(new AppError(429, 'Demasiadas solicitudes. Intenta en un minuto.'));
    return;
  }
  next();
}