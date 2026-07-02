// middlewares/captureRequestContext.ts
// ─────────────────────────────────────────────────────────────────────────────
// Captura contexto HTTP (IP + User-Agent) en cada request autenticado
// y lo deja en `req.context` para que `logAudit()` lo use.
//
// No captura lat/lng/accuracy — eso viene del cliente (no se puede
// derivar del request) y se pasa explícitamente en `logAudit(params)`.
// ─────────────────────────────────────────────────────────────────────────────

import type { Request, Response, NextFunction } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    context?: {
      ipAddress?: string;
      userAgent?: string;
    };
  }
}

/**
 * Extrae la IP del request respetando cabeceras de proxy.
 * Prioridad: X-Forwarded-For (tomamos la primera, que es el cliente
 * original) → req.ip → req.socket.remoteAddress.
 */
function getClientIp(req: Request): string | undefined {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0]?.trim() || undefined;
  }
  if (Array.isArray(xff) && xff.length > 0) {
    return xff[0]?.trim() || undefined;
  }
  return req.ip || req.socket.remoteAddress || undefined;
}

export function captureRequestContext(req: Request, _res: Response, next: NextFunction) {
  // El User-Agent puede ser largo; lo truncamos a 1024 chars para no
  // abusar de la columna text. En la práctica los UA reales son
  // <300 chars.
  const rawUa = req.headers['user-agent'];
  const ua = Array.isArray(rawUa) ? rawUa[0] : rawUa;
  const userAgent = typeof ua === 'string' ? ua.slice(0, 1024) : undefined;

  req.context = {
    ipAddress: getClientIp(req),
    userAgent,
  };
  next();
}
