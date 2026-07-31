// routes/ai-api/modules/notificaciones.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 — Endpoints de notificaciones para /api/ai/*.
// 2 endpoints: lista, marcar como leídas.
// ─────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { z } from 'zod';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../../db/client';
import { companyNotifications } from '../../../db/schema/operational';
import { authAiApiKey, requireAiApiScope } from '../../../middlewares/auth-ai-key';
import {
  withAudit, requireCtx, parseQuery,
} from '../shared';
import { AppError } from '../../../lib/errors';

const router = Router();

// ── 1. GET /notificaciones ───────────────────────────────────────────
const listQuery = z.object({
  soloNoLeidas: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

router.get(
  '/notificaciones',
  authAiApiKey,
  withAudit(async (req, res) => {
    // Las notificaciones son POR USUARIO, no por empresa. Como el AI Key
    // es por empresa, no hay un usuario concreto. Devolvemos las
    // notificaciones "globales" de la empresa (las de los admins/owners
    // son visibles para todos los que tengan acceso al módulo).
    // Si se necesita por usuario, hay que usar la API principal.
    const { companyId } = requireCtx(req);
    const { soloNoLeidas, limit } = parseQuery(listQuery, req.query);

    const conds = [eq(companyNotifications.companyId, companyId)];
    if (soloNoLeidas) conds.push(isNull(companyNotifications.readAt));

    const rows = await db.select()
      .from(companyNotifications)
      .where(and(...conds))
      .orderBy(sql`${companyNotifications.createdAt} DESC`)
      .limit(limit);

    res.json({
      total: rows.length,
      noLeidas: rows.filter((r) => r.readAt == null).length,
      notificaciones: rows.map((r) => ({
        id: `notification-${r.id}`,
        tipo: r.kind,
        titulo: r.title,
        cuerpo: r.body,
        leida: r.readAt != null,
        fecha: r.createdAt,
      })),
    });
  }),
);

// ── 2. PATCH /notificaciones/marcar-leidas ───────────────────────────
const marcarSchema = z.object({
  ids: z.array(z.string()).optional(),   // ['notification-1', 'notification-2']
  todas: z.boolean().optional(),
});

router.patch(
  '/notificaciones/marcar-leidas',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const body = marcarSchema.parse(req.body ?? {});

    if (!body.todas && (!body.ids || body.ids.length === 0)) {
      throw new AppError(400, 'Debe especificar "ids" o "todas: true"');
    }

    let updated = 0;
    if (body.todas) {
      const result = await db.update(companyNotifications)
        .set({ readAt: new Date() })
        .where(and(
          eq(companyNotifications.companyId, companyId),
          isNull(companyNotifications.readAt),
        ))
        .returning({ id: companyNotifications.id });
      updated = result.length;
    } else {
      // Parsear "notification-N" a N.
      const numericIds = body.ids!.map((s) => {
        const m = String(s).match(/^notification-(\d+)$/);
        if (!m) throw new AppError(400, `ID inválido: ${s}`);
        return Number(m[1]);
      });
      const result = await db.update(companyNotifications)
        .set({ readAt: new Date() })
        .where(and(
          eq(companyNotifications.companyId, companyId),
          sql`${companyNotifications.id} = ANY(${numericIds})`,
        ))
        .returning({ id: companyNotifications.id });
      updated = result.length;
    }

    res.json({
      actualizadas: updated,
      resumenTexto: `${updated} notificación(es) marcadas como leídas.`,
    });
  }),
);

export default router;
