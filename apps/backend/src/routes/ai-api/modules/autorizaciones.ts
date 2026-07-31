// routes/ai-api/modules/autorizaciones.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 — Endpoints de autorizaciones de salida para /api/ai/*.
// 4 endpoints: lista, create, aprobar, rechazar.
// ─────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../../db/client';
import { companyExitAuthorizations } from '../../../db/schema/operational';
import { authAiApiKey, requireAiApiScope } from '../../../middlewares/auth-ai-key';
import {
  withAudit, requireCtx, parseBody, parseQuery,
  resolveAsset, resolveDriver, parseEntityId,
} from '../shared';
import { AppError, NotFoundError } from '../../../lib/errors';

const router = Router();

// ── 1. GET /autorizaciones ───────────────────────────────────────────
const listQuery = z.object({
  estado: z.enum(['Pendiente', 'Aprobada', 'Rechazada']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

router.get(
  '/autorizaciones',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const { estado, limit } = parseQuery(listQuery, req.query);

    const conds = [eq(companyExitAuthorizations.companyId, companyId)];
    if (estado) conds.push(eq(companyExitAuthorizations.status, estado));

    const rows = await db
      .select({
        id: companyExitAuthorizations.id,
        assetId: companyExitAuthorizations.assetId,
        driverId: companyExitAuthorizations.driverId,
        status: companyExitAuthorizations.status,
        requestedAt: companyExitAuthorizations.requestedAt,
        decidedAt: companyExitAuthorizations.decidedAt,
        notes: companyExitAuthorizations.notes,
        decisionNotes: companyExitAuthorizations.decisionNotes,
      })
      .from(companyExitAuthorizations)
      .where(and(...conds))
      .orderBy(desc(companyExitAuthorizations.requestedAt))
      .limit(limit);

    res.json({
      total: rows.length,
      autorizaciones: rows.map((r) => ({
        id: `exit-auth-${r.id}`,
        vehiculoId: `vehicle-${r.assetId}`,
        conductorId: `driver-${r.driverId}`,
        status: r.status,
        fechaSolicitud: r.requestedAt,
        fechaDecision: r.decidedAt,
        notas: r.notes,
        decision: r.decisionNotes,
      })),
    });
  }),
);

// ── 2. POST /autorizaciones/create ──────────────────────────────────
const createSchema = z.object({
  vehiculo: z.string().min(1),
  conductor: z.string().min(1),
  notas: z.string().max(2000).optional(),
});

router.post(
  '/autorizaciones/create',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const body = parseBody(createSchema, req.body);
    const asset = await resolveAsset(companyId, body.vehiculo);
    const driver = await resolveDriver(companyId, body.conductor);

    const [created] = await db.insert(companyExitAuthorizations).values({
      companyId,
      assetId: asset.id,
      driverId: driver.id,
      status: 'Pendiente',
      notes: body.notas ?? null,
      aiAnalysisStatus: 'pendiente',
    }).returning();

    res.status(201).json({
      id: `exit-auth-${created.id}`,
      vehiculo: asset.name,
      conductor: driver.name,
      status: created.status,
      resumenTexto: `Autorización de salida creada: ${asset.name} con ${driver.name}, pendiente de aprobación.`,
    });
  }),
);

// ── 3. POST /autorizaciones/:id/aprobar ──────────────────────────────
const aprobarSchema = z.object({
  notas: z.string().max(2000).optional(),
});

router.post(
  '/autorizaciones/:id/aprobar',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const idNum = parseEntityId(req.params.id, 'exit-auth');
    const body = parseBody(aprobarSchema, req.body ?? {});

    const [existing] = await db.select()
      .from(companyExitAuthorizations)
      .where(and(
        eq(companyExitAuthorizations.id, idNum),
        eq(companyExitAuthorizations.companyId, companyId),
      ))
      .limit(1);
    if (!existing) throw new NotFoundError('Autorización', String(req.params.id));
    if (existing.status !== 'Pendiente') {
      throw new AppError(409, `La autorización ya está "${existing.status}"`);
    }

    const [updated] = await db.update(companyExitAuthorizations)
      .set({
        status: 'Aprobada',
        decidedAt: new Date(),
        decisionNotes: body.notas ?? null,
        updatedAt: new Date(),
      })
      .where(eq(companyExitAuthorizations.id, idNum))
      .returning();

    res.json({
      id: `exit-auth-${updated!.id}`,
      status: updated!.status,
      fechaDecision: updated!.decidedAt,
      notas: body.notas ?? null,
      resumenTexto: `Autorización aprobada${body.notas ? `: ${body.notas}` : ''}.`,
    });
  }),
);

// ── 4. POST /autorizaciones/:id/rechazar ─────────────────────────────
const rechazarSchema = z.object({
  motivo: z.string().min(3).max(2000),
});

router.post(
  '/autorizaciones/:id/rechazar',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const idNum = parseEntityId(req.params.id, 'exit-auth');
    const body = parseBody(rechazarSchema, req.body);

    const [existing] = await db.select()
      .from(companyExitAuthorizations)
      .where(and(
        eq(companyExitAuthorizations.id, idNum),
        eq(companyExitAuthorizations.companyId, companyId),
      ))
      .limit(1);
    if (!existing) throw new NotFoundError('Autorización', String(req.params.id));
    if (existing.status !== 'Pendiente') {
      throw new AppError(409, `La autorización ya está "${existing.status}"`);
    }

    const [updated] = await db.update(companyExitAuthorizations)
      .set({
        status: 'Rechazada',
        decidedAt: new Date(),
        decisionNotes: body.motivo,
        updatedAt: new Date(),
      })
      .where(eq(companyExitAuthorizations.id, idNum))
      .returning();

    res.json({
      id: `exit-auth-${updated!.id}`,
      status: updated!.status,
      fechaDecision: updated!.decidedAt,
      motivo: body.motivo,
      resumenTexto: `Autorización rechazada: ${body.motivo}.`,
    });
  }),
);

export default router;
