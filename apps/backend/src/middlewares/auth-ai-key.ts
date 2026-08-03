// middlewares/auth-ai-key.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 — Autenticación para la API dedicada /api/ai/* (Custom GPT).
//
// DIFERENCIA con `authenticate.ts` (JWT de usuarios):
//   - authenticate.ts: usa cookie `aplismart_token` o Bearer de un JWT
//     firmado con JWT_SECRET. Valida un usuario humano de la empresa.
//   - auth-ai-key.ts: usa SOLO header `Authorization: Bearer aik_live_...`.
//     Valida una API Key de integración contra la tabla `ai_api_keys`.
//
// Reglas críticas:
//   1. El `companyId` para los queries sale del REGISTRO de la key,
//      NO de un parámetro del cliente. Así un cliente no puede
//      preguntar por datos de otra empresa.
//   2. Se valida `active=true` y `expiresAt` (si existe).
//   3. Se actualiza `lastUsedAt` fire-and-forget (no bloquea el response).
//   4. Si falla, devuelve 401 con un mensaje GENÉRICO (no leakea si la
//      key existe pero está revocada vs no existe).
//   5. La key en texto plano NUNCA se loggea. Usar `scrubApiKey()` de
//      lib/ai-api-keys.ts en cualquier log.
// ─────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { aiApiKeys } from '../db/schema/platform';
import { extractBearerToken, verifyApiKey } from '../lib/ai-api-keys';
import { UnauthorizedError } from '../lib/errors';

/**
 * Contexto inyectado en `req.aiContext` después de la validación.
 *
 *  - companyId: integer (NO string tipo "company-N") para que los
 *    queries internos lo usen directo sin parseId.
 *  - scopes: array de strings ('read' | 'write' por ahora).
 *  - keyId: id de la key (útil para logging y para invalidar cache).
 */
export interface AiApiContext {
  companyId: number;
  scopes: string[];
  keyId: number;
  keyName: string;       // para logs
  keyPrefix: string;     // para logs (NO la key completa)
  // jul 2026 v2.3 — modulo+operacion del request actual, seteados por
  // el router unificado. Sirve para que withAudit pueda formatear
  // errores didacticos incluso cuando un handler hace su propio
  // schema.parse(input) interno.
  modulo?: string;
  operacion?: string;
}

declare global {
  namespace Express {
    interface Request {
      aiContext?: AiApiContext;
    }
  }
}

/**
 * Middleware de auth para /api/ai/*. NO usa `authenticate` ni `requireModule`:
 * es un sistema completamente separado.
 */
export async function authAiApiKey(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // 1) Extraer Bearer
    const plainKey = extractBearerToken(req.headers.authorization);
    if (!plainKey) {
      throw new UnauthorizedError('Falta API Key en el header Authorization (formato: Bearer aik_live_...)');
    }

    // 2) Hash + lookup en DB
    //    Importante: NO hacemos verifyApiKey ANTES de buscar. Primero
    //    encontramos el registro por hash (con `eq`), después validamos
    //    con `verifyApiKey` para timing-safe comparison. Esto evita un
    //    round-trip cuando el hash no existe (caso más común en ataques).
    const { hashApiKey } = await import('../lib/ai-api-keys');
    const keyHash = hashApiKey(plainKey);

    const [record] = await db
      .select()
      .from(aiApiKeys)
      .where(eq(aiApiKeys.keyHash, keyHash))
      .limit(1);

    if (!record) {
      // Mensaje GENÉRICO: no leakear si la key existe pero está revocada.
      throw new UnauthorizedError('API Key inválida');
    }

    // 3) Verificación timing-safe (defense-in-depth, además del `where eq`)
    if (!verifyApiKey(plainKey, record.keyHash)) {
      // En la práctica no debería llegar acá porque `where eq(keyHash)`
      // ya filtró, pero si alguien rota el FIXED_SALT sin migrar hashes,
      // esto lo catchea.
      throw new UnauthorizedError('API Key inválida');
    }

    // 4) Validar `active` (key revocada = soft-delete, preserva auditoría)
    if (!record.active) {
      throw new UnauthorizedError('API Key inválida');
    }

    // 5) Validar `expiresAt`
    if (record.expiresAt && record.expiresAt < new Date()) {
      throw new UnauthorizedError('API Key expirada');
    }

    // 6) Inyectar contexto
    req.aiContext = {
      companyId: record.companyId,
      scopes: Array.isArray(record.scopes) ? record.scopes : ['read'],
      keyId: record.id,
      keyName: record.name,
      keyPrefix: record.keyPrefix,
    };

    // 7) Actualizar `lastUsedAt` fire-and-forget.
    //    NO await: no bloqueamos el response si la DB está lenta.
    //    NO .catch(): si falla, lo perdemos silenciosamente (es no-crítico,
    //    solo para debug de "esta key se usó por última vez hace X").
    void db
      .update(aiApiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(aiApiKeys.id, record.id))
      .execute()
      .catch((err) => {
        // Log mínimo para debug. NUNCA incluir `plainKey` acá.
        console.error('[auth-ai-key] No se pudo actualizar lastUsedAt:', {
          keyId: record.id,
          err: err?.message,
        });
      });

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware adicional que verifica que la key tenga el scope requerido.
 * Usar DESPUÉS de `authAiApiKey` en endpoints de write.
 *
 * @example
 *   router.post('/alertas', authAiApiKey, requireAiApiScope('write'), handler);
 */
export function requireAiApiScope(required: 'read' | 'write') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const ctx = req.aiContext;
    if (!ctx) {
      // Esto NO debería pasar si `authAiApiKey` corrió antes.
      return next(new UnauthorizedError('No autenticado (authAiApiKey no ejecutado)'));
    }
    if (!ctx.scopes.includes(required)) {
      return next(new UnauthorizedError(`La API Key no tiene scope '${required}' (scopes actuales: ${ctx.scopes.join(', ')})`));
    }
    next();
  };
}
