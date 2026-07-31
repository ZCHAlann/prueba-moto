// routes/ai-api/modules/asignaciones.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 — Endpoints de asignaciones vehículo-conductor para /api/ai/*.
// 3 endpoints: lista, create, finalizar.
// ─────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../../db/client';
import {
  companyAssignments, companyAssets, companyDrivers,
} from '../../../db/schema/operational';
import { authAiApiKey, requireAiApiScope } from '../../../middlewares/auth-ai-key';
import {
  withAudit, requireCtx, parseBody, parseQuery,
  resolveAsset, resolveDriver, todayYmdEc, parseEntityId,
} from '../shared';
import { AppError, NotFoundError } from '../../../lib/errors';

const router = Router();

// ── 1. GET /asignaciones ────────────────────────────────────────────
const listQuery = z.object({
  estado: z.enum(['Activa', 'Finalizada']).optional(),
  vehiculo: z.string().max(120).optional(),
  conductor: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

router.get(
  '/asignaciones',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const { estado, vehiculo, conductor, limit } = parseQuery(listQuery, req.query);

    const conds = [eq(companyAssignments.companyId, companyId)];
    if (estado) conds.push(eq(companyAssignments.status, estado));
    if (vehiculo) {
      const a = await resolveAsset(companyId, vehiculo);
      conds.push(eq(companyAssignments.assetId, a.id));
    }
    if (conductor) {
      const d = await resolveDriver(companyId, conductor);
      conds.push(eq(companyAssignments.driverId, d.id));
    }

    const rows = await db
      .select({
        id: companyAssignments.id,
        assetId: companyAssignments.assetId,
        assetName: companyAssets.name,
        assetPlate: companyAssets.plate,
        driverId: companyAssignments.driverId,
        driverFirstName: companyDrivers.firstName,
        driverLastName: companyDrivers.lastName,
        startDate: companyAssignments.startDate,
        endDate: companyAssignments.endDate,
        status: companyAssignments.status,
        notes: companyAssignments.notes,
      })
      .from(companyAssignments)
      .leftJoin(companyAssets, eq(companyAssets.id, companyAssignments.assetId))
      .leftJoin(companyDrivers, eq(companyDrivers.id, companyAssignments.driverId))
      .where(and(...conds))
      .orderBy(desc(companyAssignments.startDate))
      .limit(limit);

    res.json({
      total: rows.length,
      asignaciones: rows.map((r) => ({
        id: `assignment-${r.id}`,
        vehiculo: r.assetName,
        vehiculoPlaca: r.assetPlate,
        conductor: r.driverFirstName ? `${r.driverFirstName} ${r.driverLastName}`.trim() : null,
        fechaInicio: r.startDate,
        fechaFin: r.endDate,
        estado: r.status,
        notas: r.notes,
      })),
    });
  }),
);

// ── 2. POST /asignaciones/create ──────────────────────────────────────
const createSchema = z.object({
  vehiculo: z.string().min(1),
  conductor: z.string().min(1),
  fechaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notas: z.string().max(1000).optional(),
});

router.post(
  '/asignaciones/create',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const body = parseBody(createSchema, req.body);
    const asset = await resolveAsset(companyId, body.vehiculo);
    const driver = await resolveDriver(companyId, body.conductor);

    // Si el vehículo ya tiene asignación activa, finalizarla.
    await db.update(companyAssignments)
      .set({ endDate: todayYmdEc(), status: 'Finalizada' })
      .where(and(
        eq(companyAssignments.assetId, asset.id),
        eq(companyAssignments.status, 'Activa'),
      ));

    // Si el conductor ya tiene asignación activa, finalizarla.
    await db.update(companyAssignments)
      .set({ endDate: todayYmdEc(), status: 'Finalizada' })
      .where(and(
        eq(companyAssignments.driverId, driver.id),
        eq(companyAssignments.status, 'Activa'),
      ));

    const [created] = await db.insert(companyAssignments).values({
      companyId,
      assetId: asset.id,
      driverId: driver.id,
      startDate: body.fechaInicio ?? todayYmdEc(),
      status: 'Activa',
      notes: body.notas ?? null,
    }).returning();

    res.status(201).json({
      id: `assignment-${created.id}`,
      vehiculo: asset.name,
      conductor: driver.name,
      fechaInicio: created.startDate,
      estado: created.status,
      resumenTexto: `Asignación creada: ${asset.name} → ${driver.name} desde ${created.startDate}.`,
    });
  }),
);

// ── 3. POST /asignaciones/:id/finalizar ───────────────────────────────
const finalizarSchema = z.object({
  motivo: z.string().max(500).optional(),
  fechaFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

router.post(
  '/asignaciones/:id/finalizar',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const idNum = parseEntityId(req.params.id, 'assignment');
    const body = parseBody(finalizarSchema, req.body ?? {});

    const [existing] = await db.select()
      .from(companyAssignments)
      .where(and(
        eq(companyAssignments.id, idNum),
        eq(companyAssignments.companyId, companyId),
      ))
      .limit(1);
    if (!existing) throw new NotFoundError('Asignación', String(req.params.id));
    if (existing.status === 'Finalizada') {
      throw new AppError(409, 'La asignación ya está finalizada');
    }

    const [updated] = await db.update(companyAssignments)
      .set({
        endDate: body.fechaFin ?? todayYmdEc(),
        status: 'Finalizada',
        notes: body.motivo
          ? `${existing.notes ?? ''}\n[FIN] ${body.motivo}`.trim()
          : existing.notes,
        updatedAt: new Date(),
      })
      .where(eq(companyAssignments.id, idNum))
      .returning();

    res.json({
      id: `assignment-${updated!.id}`,
      estado: updated!.status,
      fechaFin: updated!.endDate,
      motivo: body.motivo ?? null,
      resumenTexto: `Asignación finalizada${body.motivo ? `: ${body.motivo}` : ''}.`,
    });
  }),
);

export default router;
