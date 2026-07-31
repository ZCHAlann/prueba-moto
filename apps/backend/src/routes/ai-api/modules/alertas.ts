// routes/ai-api/modules/alertas.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 — Endpoints de alertas para /api/ai/*.
// 3 endpoints: lista (existente), create (existente), cambiar estado.
// ─────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { db } from '../../../db/client';
import { companyAlerts, companyAssets } from '../../../db/schema/operational';
import { authAiApiKey, requireAiApiScope } from '../../../middlewares/auth-ai-key';
import {
  withAudit, requireCtx, parseBody, parseQuery,
  resolveAsset, parseEntityId,
} from '../shared';
import { NotFoundError } from '../../../lib/errors';

const router = Router();

// ── 1. GET /alertas (existente) ──────────────────────────────────────
const listQuery = z.object({
  severidad: z.enum(['Alta', 'Media', 'Baja']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

router.get(
  '/alertas',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const { severidad, limit } = parseQuery(listQuery, req.query);

    const conds = [
      eq(companyAlerts.companyId, companyId),
      or(
        eq(companyAlerts.status, 'Abierta'),
        eq(companyAlerts.status, 'En progreso'),
        isNull(companyAlerts.status),
      )!,
    ];
    if (severidad) conds.push(eq(companyAlerts.severity, severidad));

    const rows = await db
      .select({
        id: companyAlerts.id,
        title: companyAlerts.title,
        type: companyAlerts.type,
        severity: companyAlerts.severity,
        status: companyAlerts.status,
        dueDate: companyAlerts.dueDate,
        notes: companyAlerts.notes,
        assetId: companyAlerts.assetId,
        createdAt: companyAlerts.createdAt,
      })
      .from(companyAlerts)
      .where(and(...conds))
      .orderBy(desc(companyAlerts.createdAt))
      .limit(limit);

    const assetIds = Array.from(new Set(rows.map((r) => r.assetId).filter(Boolean) as number[]));
    const assetsMap = new Map<number, string>();
    if (assetIds.length > 0) {
      const assets = await db
        .select({ id: companyAssets.id, name: companyAssets.name })
        .from(companyAssets)
        .where(inArray(companyAssets.id, assetIds));
      for (const a of assets) assetsMap.set(a.id, a.name);
    }

    const alertas = rows.map((r) => ({
      id: `alert-${r.id}`,
      titulo: r.title,
      tipo: r.type,
      severidad: r.severidad,
      status: r.status,
      vehiculo: r.assetId ? assetsMap.get(r.assetId) ?? null : null,
      fechaVencimiento: r.dueDate,
      notas: r.notes,
      creada: r.createdAt,
    }));

    const criticas = alertas.filter((a) => a.severidad === 'Alta').length;

    res.json({
      total: alertas.length,
      alertas,
      resumenTexto: alertas.length === 0
        ? 'No hay alertas abiertas.'
        : `Hay ${alertas.length} alerta(s) abierta(s)${criticas > 0 ? `, ${criticas} crítica(s)` : ''}.`,
    });
  }),
);

// ── 2. POST /alertas/create (existente) ───────────────────────────────
const createSchema = z.object({
  titulo: z.string().min(3).max(160),
  severidad: z.enum(['Alta', 'Media', 'Baja']),
  vehiculo: z.string().min(1),
  tipo: z.string().max(80).default('Manual'),
  notas: z.string().max(1000).optional(),
  fechaVencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

router.post(
  '/alertas/create',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const body = parseBody(createSchema, req.body);
    const asset = await resolveAsset(companyId, body.vehiculo);

    const [created] = await db.insert(companyAlerts).values({
      companyId,
      assetId: asset.id,
      title: body.titulo,
      type: body.tipo,
      severity: body.severidad,
      status: 'Abierta',
      notes: body.notas ?? null,
      dueDate: body.fechaVencimiento ?? null,
    }).returning();

    res.status(201).json({
      id: `alert-${created.id}`,
      titulo: created.title,
      severidad: created.severidad,
      tipo: created.type,
      status: created.status,
      vehiculo: asset.name,
      fechaVencimiento: created.dueDate,
      resumenTexto: `Alerta "${created.title}" creada para ${asset.name} con severidad ${created.severidad}.`,
    });
  }),
);

// ── 3. PATCH /alertas/:id/estado ──────────────────────────────────────
const estadoSchema = z.object({
  estado: z.enum(['Abierta', 'En progreso', 'Resuelta', 'Cerrada']),
  resolucion: z.string().max(1000).optional(),
});

router.patch(
  '/alertas/:id/estado',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const idNum = parseEntityId(req.params.id, 'alert');
    const body = parseBody(estadoSchema, req.body);

    const [existing] = await db.select()
      .from(companyAlerts)
      .where(and(
        eq(companyAlerts.id, idNum),
        eq(companyAlerts.companyId, companyId),
      ))
      .limit(1);
    if (!existing) throw new NotFoundError('Alerta', String(req.params.id));

    const [updated] = await db.update(companyAlerts)
      .set({
        status: body.estado,
        notes: body.resolucion
          ? `${existing.notes ?? ''}\n[${body.estado}] ${body.resolucion}`.trim()
          : existing.notes,
        updatedAt: new Date(),
      })
      .where(eq(companyAlerts.id, idNum))
      .returning();

    res.json({
      id: `alert-${updated!.id}`,
      titulo: updated!.title,
      estadoAnterior: existing.status,
      estadoNuevo: updated!.status,
      resolucion: body.resolucion ?? null,
      resumenTexto: `Alerta "${updated!.title}" cambió de "${existing.status}" a "${updated!.status}".`,
    });
  }),
);

export default router;
