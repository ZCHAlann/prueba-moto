// routes/platform/ai-api-keys.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 — CRUD para gestión de API Keys de /api/ai/* desde el panel
// de superadmin de plataforma.
//
// NO es UI nueva: es el backend que el panel de plataforma consume vía
// `fetch('/platform/companies/:id/ai-api-keys', ...)`. Las pantallas de
// "API Keys" y "Generar key" las hace el panel de plataforma existente.
//
// Endpoints (todos bajo /platform/companies/:companyId/ai-api-keys):
//   GET    /                         → lista (con `withSecrets=false` por default)
//   POST   /                         → genera nueva key (devuelve `plainKey` UNA sola vez)
//   GET    /:keyId                   → detalle
//   POST   /:keyId/revoke            → revoca (active=false)
//   POST   /:keyId/reactivate        → reactiva una revocada
//   DELETE /:keyId                   → hard-delete (solo si active=false desde hace 30+ días)
//   GET    /:keyId/logs              → últimas N requests de esta key
// ─────────────────────────────────────────────────────────────────────

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { aiApiKeys, aiApiLogs } from '../../db/schema/platform';
import { companies } from '../../db/schema/platform';
import { generateApiKey } from '../../lib/ai-api-keys';
import { AppError, NotFoundError, ForbiddenError } from '../../lib/errors';
import { requireSuperadmin } from '../../middlewares/requireSuperadmin';
import { parseIdFlexible } from '../../lib/ids';

const router = Router({ mergeParams: true });

// Todas las rutas requieren superadmin
router.use(requireSuperadmin);

// ── Schemas ────────────────────────────────────────────────────────────

const createKeySchema = z.object({
  name: z.string().min(3).max(100),
  scopes: z.array(z.enum(['read', 'write'])).min(1).default(['read']),
  expiresAt: z.string().datetime().optional(), // ISO 8601
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  withSecrets: z.coerce.boolean().default(false), // false = nunca devolver hash
});

const logsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  statusCode: z.coerce.number().int().optional(),
});

// ── Helpers ────────────────────────────────────────────────────────────

function serializeKey(k: typeof aiApiKeys.$inferSelect, opts: { withSecrets: boolean }) {
  return {
    id: k.id,
    companyId: k.companyId,
    name: k.name,
    keyPrefix: k.keyPrefix,
    scopes: k.scopes,
    active: k.active,
    lastUsedAt: k.lastUsedAt,
    expiresAt: k.expiresAt,
    createdBy: k.createdBy,
    createdAt: k.createdAt,
    updatedAt: k.updatedAt,
    // NUNCA exponer el hash.
    // Solo el `plainKey` se devuelve UNA vez al crear.
    ...(opts.withSecrets ? {} : {}),
  };
}

// ── LIST ───────────────────────────────────────────────────────────────
router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params.id;
      // jul 2026 v9.9 — Usar `parseIdFlexible('any', ...)` en vez
      // de `Number(...)`. Acepta tanto `2` (legacy) como
      // `"company-2"` (formato que devuelve `toId('company', c.id)`
      // en companies.ts línea 81). El frontend recibe el id con
      // prefijo y lo manda tal cual al path, así que el backend
      // tiene que parsearlo.
      const companyId = parseIdFlexible('any', rawId);
      if (!Number.isInteger(companyId) || companyId <= 0) {
        console.warn('[platform/ai-api-keys] companyId inválido:', {
          rawId,
          type: typeof rawId,
          url: req.originalUrl,
          params: req.params,
        });
        throw new AppError(
          400,
          `companyId inválido (recibido: ${JSON.stringify(rawId)})`,
        );
      }
      const { page, pageSize, withSecrets } = listQuerySchema.parse(req.query);

      const [rows, countRow] = await Promise.all([
        db
          .select()
          .from(aiApiKeys)
          .where(eq(aiApiKeys.companyId, companyId))
          .orderBy(desc(aiApiKeys.createdAt))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        db
          .select({ value: db.$count(aiApiKeys) })
          .from(aiApiKeys)
          .where(eq(aiApiKeys.companyId, companyId)),
      ]);
      const total = countRow[0]?.value ?? 0;

      res.json({
        data: rows.map((r) => serializeKey(r, { withSecrets })),
        total,
        page,
        pageSize,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── DETAIL ─────────────────────────────────────────────────────────────
router.get(
  '/:keyId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const companyId = parseIdFlexible('any', req.params.id);
      const keyId = parseIdFlexible('any', req.params.keyId);
      if (!Number.isInteger(companyId) || companyId <= 0) {
        throw new AppError(400, 'companyId inválido');
      }
      if (!Number.isInteger(keyId) || keyId <= 0) {
        throw new AppError(400, 'keyId inválido');
      }

      const [row] = await db
        .select()
        .from(aiApiKeys)
        .where(
          and(
            eq(aiApiKeys.id, keyId),
            eq(aiApiKeys.companyId, companyId),
          ),
        )
        .limit(1);
      if (!row) throw new NotFoundError('API Key', String(keyId));

      res.json(serializeKey(row, { withSecrets: false }));
    } catch (err) {
      next(err);
    }
  },
);

// ── CREATE (genera key nueva) ──────────────────────────────────────────
//
// ⚠️ Este es el ÚNICO endpoint que devuelve el `plainKey` en la response.
// El frontend debe mostrarlo UNA vez al usuario (modal con botón
// "Copiar al portapapeles") y nunca volver a pedirlo.
router.post(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const companyId = parseIdFlexible('any', req.params.id);
      if (!Number.isInteger(companyId) || companyId <= 0) {
        throw new AppError(400, 'companyId inválido');
      }
      const body = createKeySchema.parse(req.body);

      // Validar que la empresa existe.
      const [company] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);
      if (!company) throw new NotFoundError('Empresa', String(companyId));

      const { plainKey, keyHash, keyPrefix } = generateApiKey();
      const superadminId = req.user?.sub ? Number(String(req.user.sub).replace(/\D/g, '')) : null;

      const [created] = await db
        .insert(aiApiKeys)
        .values({
          companyId,
          name: body.name,
          keyHash,
          keyPrefix,
          scopes: body.scopes,
          active: true,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          createdBy: superadminId,
        })
        .returning();

      // Log de auditoría de plataforma.
      void db
        .select()
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1)
        .then(() => {
          console.log('[platform/ai-api-keys] KEY CREADA:', {
            keyId: created.id,
            keyPrefix,
            companyId,
            scopes: body.scopes,
            createdBy: superadminId,
            ts: new Date().toISOString(),
          });
        });

      // Devolvemos `plainKey` SOLO acá. El frontend debe mostrarlo una vez.
      // jul 2026 v9.10 — El frontend espera la forma
      // `{ plainKey, key: { id, name, ... }, warning }` (ver type
      // `PlatformAiApiKeyCreateResponse` en usePlatformAiApiKeys.ts).
      // Antes el backend devolvía los campos del key FLAT mezclados
      // con `plainKey` y `warning`, lo que rompía `data.key.name` en
      // el AiApiKeysSection.tsx:579.
      res.status(201).json({
        key: serializeKey(created, { withSecrets: false }),
        // ↓↓↓ ESTE campo es la única vez que se muestra ↓↓↓
        plainKey,
        // ↑↑↑ NUNCA más se devuelve ↑↑↑
        warning: 'Guarda este key ahora. No se puede recuperar después.',
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── REVOKE ─────────────────────────────────────────────────────────────
// Pone active=false. La fila se preserva para auditoría pero el middleware
// de auth rechaza cualquier request con esta key.
router.post(
  '/:keyId/revoke',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const companyId = parseIdFlexible('any', req.params.id);
      const keyId = parseIdFlexible('any', req.params.keyId);
      if (!Number.isInteger(companyId) || companyId <= 0) {
        throw new AppError(400, 'companyId inválido');
      }
      if (!Number.isInteger(keyId) || keyId <= 0) {
        throw new AppError(400, 'keyId inválido');
      }

      const [existing] = await db
        .select()
        .from(aiApiKeys)
        .where(
          and(
            eq(aiApiKeys.id, keyId),
            eq(aiApiKeys.companyId, companyId),
          ),
        )
        .limit(1);
      if (!existing) throw new NotFoundError('API Key', String(keyId));
      if (!existing.active) {
        throw new AppError(409, 'La key ya está revocada');
      }

      const [updated] = await db
        .update(aiApiKeys)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(aiApiKeys.id, keyId))
        .returning();

      console.log('[platform/ai-api-keys] KEY REVOCADA:', {
        keyId,
        keyPrefix: existing.keyPrefix,
        companyId,
        ts: new Date().toISOString(),
      });

      res.json(serializeKey(updated, { withSecrets: false }));
    } catch (err) {
      next(err);
    }
  },
);

// ── REACTIVATE ────────────────────────────────────────────────────────
// Útil para "uy, la revocé por error" o para una key que se revocó
// preventivamente y se decide rehabilitar.
router.post(
  '/:keyId/reactivate',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const companyId = parseIdFlexible('any', req.params.id);
      const keyId = parseIdFlexible('any', req.params.keyId);
      if (!Number.isInteger(companyId) || companyId <= 0) {
        throw new AppError(400, 'companyId inválido');
      }
      if (!Number.isInteger(keyId) || keyId <= 0) {
        throw new AppError(400, 'keyId inválido');
      }

      const [existing] = await db
        .select()
        .from(aiApiKeys)
        .where(
          and(
            eq(aiApiKeys.id, keyId),
            eq(aiApiKeys.companyId, companyId),
          ),
        )
        .limit(1);
      if (!existing) throw new NotFoundError('API Key', String(keyId));
      if (existing.active) {
        throw new AppError(409, 'La key ya está activa');
      }
      if (existing.expiresAt && existing.expiresAt < new Date()) {
        throw new AppError(409, 'La key está vencida — crear una nueva');
      }

      const [updated] = await db
        .update(aiApiKeys)
        .set({ active: true, updatedAt: new Date() })
        .where(eq(aiApiKeys.id, keyId))
        .returning();

      console.log('[platform/ai-api-keys] KEY REACTIVADA:', {
        keyId,
        keyPrefix: existing.keyPrefix,
        companyId,
        ts: new Date().toISOString(),
      });

      res.json(serializeKey(updated, { withSecrets: false }));
    } catch (err) {
      next(err);
    }
  },
);

// ── HARD DELETE (solo si revocada hace 30+ días) ──────────────────────
// Para limpiar la DB. El log de auditoría (`ai_api_logs`) sobrevive.
router.delete(
  '/:keyId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const companyId = parseIdFlexible('any', req.params.id);
      const keyId = parseIdFlexible('any', req.params.keyId);
      if (!Number.isInteger(companyId) || companyId <= 0) {
        throw new AppError(400, 'companyId inválido');
      }
      if (!Number.isInteger(keyId) || keyId <= 0) {
        throw new AppError(400, 'keyId inválido');
      }

      const [existing] = await db
        .select()
        .from(aiApiKeys)
        .where(
          and(
            eq(aiApiKeys.id, keyId),
            eq(aiApiKeys.companyId, companyId),
          ),
        )
        .limit(1);
      if (!existing) throw new NotFoundError('API Key', String(keyId));

      // Solo se puede borrar si está revocada y updatedAt > 30 días.
      if (existing.active) {
        throw new ForbiddenError('Revocá la key antes de borrarla (POST /:keyId/revoke)');
      }
      const daysSinceRevoked =
        (Date.now() - new Date(existing.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceRevoked < 30) {
        throw new AppError(
          409,
          `Solo se puede borrar una key revocada hace 30+ días (actual: ${daysSinceRevoked.toFixed(1)} días)`,
        );
      }

      await db.delete(aiApiKeys).where(eq(aiApiKeys.id, keyId));

      console.log('[platform/ai-api-keys] KEY HARD-DELETED:', {
        keyId,
        keyPrefix: existing.keyPrefix,
        companyId,
        ts: new Date().toISOString(),
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ── LOGS (auditoría de uso de una key) ────────────────────────────────
router.get(
  '/:keyId/logs',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const companyId = parseIdFlexible('any', req.params.id);
      const keyId = parseIdFlexible('any', req.params.keyId);
      if (!Number.isInteger(companyId) || companyId <= 0) {
        throw new AppError(400, 'companyId inválido');
      }
      if (!Number.isInteger(keyId) || keyId <= 0) {
        throw new AppError(400, 'keyId inválido');
      }
      const { limit, statusCode } = logsQuerySchema.parse(req.query);

      // Verificar que la key pertenece a la empresa (defense-in-depth).
      const [key] = await db
        .select({ id: aiApiKeys.id })
        .from(aiApiKeys)
        .where(
          and(
            eq(aiApiKeys.id, keyId),
            eq(aiApiKeys.companyId, companyId),
          ),
        )
        .limit(1);
      if (!key) throw new NotFoundError('API Key', String(keyId));

      const conds = [eq(aiApiLogs.keyId, keyId)];
      if (typeof statusCode === 'number') {
        conds.push(eq(aiApiLogs.statusCode, statusCode));
      }

      const rows = await db
        .select()
        .from(aiApiLogs)
        .where(and(...conds))
        .orderBy(desc(aiApiLogs.createdAt))
        .limit(limit);

      res.json({
        data: rows.map((r) => ({
          id: r.id,
          endpoint: r.endpoint,
          method: r.method,
          statusCode: r.statusCode,
          durationMs: r.durationMs,
          errorMessage: r.errorMessage,
          ip: r.ip,
          userAgent: r.userAgent,
          createdAt: r.createdAt,
        })),
        total: rows.length,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
