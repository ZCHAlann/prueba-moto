// routes/ai-api/modules/conductores.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 — Endpoints de conductores para /api/ai/*.
// 4 endpoints: 1 existente (lista) + 3 nuevos (create, disponibles, reporte).
// ─────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import { z } from 'zod';
import { and, eq, isNull, lte, or, gte, desc } from 'drizzle-orm';
import { db } from '../../../db/client';
import {
  companyDrivers, companyAssignments, companyAssets,
  companyDriverReports,
} from '../../../db/schema/operational';
import { authAiApiKey, requireAiApiScope } from '../../../middlewares/auth-ai-key';
import {
  withAudit, requireCtx, parseBody,
  resolveDriver, todayYmdEc, parseEntityId,
} from '../shared';
import { AppError, NotFoundError } from '../../../lib/errors';

const router = Router();

// ── 1. GET /conductores (existente) ──────────────────────────────────
router.get(
  '/conductores',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const today = todayYmdEc();

    const rows = await db
      .select({
        id: companyDrivers.id,
        code: companyDrivers.code,
        firstName: companyDrivers.firstName,
        lastName: companyDrivers.lastName,
        dni: companyDrivers.dni,
        licenseNumber: companyDrivers.licenseNumber,
        licenseExpiry: companyDrivers.licenseExpiry,
        status: companyDrivers.status,
        phone: companyDrivers.phone,
        vehicleId: companyAssignments.assetId,
        vehicleName: companyAssets.name,
        vehiclePlate: companyAssets.plate,
      })
      .from(companyDrivers)
      .leftJoin(
        companyAssignments,
        and(
          eq(companyAssignments.driverId, companyDrivers.id),
          eq(companyAssignments.status, 'Activa'),
          lte(companyAssignments.startDate, today),
          or(
            isNull(companyAssignments.endDate),
            gte(companyAssignments.endDate, today),
          )!,
        ),
      )
      .leftJoin(companyAssets, eq(companyAssets.id, companyAssignments.assetId))
      .where(eq(companyDrivers.companyId, companyId))
      .orderBy(companyDrivers.lastName);

    const conductores = rows.map((r) => ({
      id: `driver-${r.id}`,
      nombre: `${r.firstName} ${r.lastName}`.trim(),
      codigo: r.code,
      dni: r.dni,
      licencia: r.licenseNumber,
      licenciaVencimiento: r.licenseExpiry,
      estado: r.status,
      telefono: r.phone,
      vehiculoAsignado: r.vehicleId
        ? { id: `vehicle-${r.vehicleId}`, nombre: r.vehicleName, placa: r.vehiclePlate }
        : null,
    }));

    const conAsig = conductores.filter((c) => c.vehiculoAsignado !== null).length;
    const sinAsig = conductores.length - conAsig;

    res.json({
      total: conductores.length,
      conductores,
      resumenTexto: `${conductores.length} conductor(es) en total: ${conAsig} con vehículo asignado, ${sinAsig} sin asignación.`,
    });
  }),
);

// ── 2. POST /conductores/create ──────────────────────────────────────
const createSchema = z.object({
  nombre: z.string().min(2).max(80),
  apellido: z.string().min(2).max(80),
  codigo: z.string().max(40).optional(),
  dni: z.string().max(20).optional(),
  telefono: z.string().max(40).optional(),
  email: z.string().email().optional(),
  licencia: z.string().max(80).optional(),
  tipoLicencia: z.string().max(40).optional(),
  vencimientoLicencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

router.post(
  '/conductores/create',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const body = parseBody(createSchema, req.body);

    const [created] = await db.insert(companyDrivers).values({
      companyId,
      firstName: body.nombre,
      lastName: body.apellido,
      code: body.codigo ?? `D-${Date.now().toString().slice(-6)}`,
      dni: body.dni ?? null,
      phone: body.telefono ?? null,
      email: body.email ?? null,
      licenseNumber: body.licencia ?? null,
      licenseType: body.tipoLicencia ?? null,
      licenseExpiry: body.vencimientoLicencia ?? null,
      status: 'Activo',
    }).returning();

    res.status(201).json({
      id: `driver-${created.id}`,
      nombre: `${created.firstName} ${created.lastName}`.trim(),
      codigo: created.code,
      dni: created.dni,
      estado: created.status,
      resumenTexto: `Conductor "${created.firstName} ${created.lastName}" creado en estado Activo.`,
    });
  }),
);

// ── 3. GET /conductores/disponibles ──────────────────────────────────
router.get(
  '/conductores/disponibles',
  authAiApiKey,
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const today = todayYmdEc();

    // Disponibles = status='Activo' SIN asignación activa.
    const rows = await db
      .select({
        id: companyDrivers.id,
        code: companyDrivers.code,
        firstName: companyDrivers.firstName,
        lastName: companyDrivers.lastName,
        dni: companyDrivers.dni,
        licenseExpiry: companyDrivers.licenseExpiry,
        phone: companyDrivers.phone,
        hasAssignment: companyAssignments.id,
      })
      .from(companyDrivers)
      .leftJoin(
        companyAssignments,
        and(
          eq(companyAssignments.driverId, companyDrivers.id),
          eq(companyAssignments.status, 'Activa'),
          lte(companyAssignments.startDate, today),
          or(
            isNull(companyAssignments.endDate),
            gte(companyAssignments.endDate, today),
          )!,
        ),
      )
      .where(and(
        eq(companyDrivers.companyId, companyId),
        eq(companyDrivers.status, 'Activo'),
        isNull(companyAssignments.id),
      ))
      .orderBy(companyDrivers.lastName);

    res.json({
      total: rows.length,
      conductores: rows.map((r) => ({
        id: `driver-${r.id}`,
        nombre: `${r.firstName} ${r.lastName}`.trim(),
        codigo: r.code,
        dni: r.dni,
        licenciaVencimiento: r.licenseExpiry,
        telefono: r.phone,
      })),
      resumenTexto: `${rows.length} conductor(es) disponible(s) sin asignación activa.`,
    });
  }),
);

// ── 4. POST /conductores/:id/reporte ──────────────────────────────────
const reporteSchema = z.object({
  tipoCombustible: z.string().max(20).optional(),
  nivelAceite: z.string().max(20).optional(),
  fallasVehiculo: z.string().max(2000).optional(),
  notas: z.string().max(2000).optional(),
});

router.post(
  '/conductores/:id/reporte',
  authAiApiKey,
  requireAiApiScope('write'),
  withAudit(async (req, res) => {
    const { companyId } = requireCtx(req);
    const idNum = parseEntityId(req.params.id, 'driver');
    const body = parseBody(reporteSchema, req.body);

    const driver = await resolveDriver(companyId, String(idNum));

    const [created] = await db.insert(companyDriverReports).values({
      companyId,
      driverId: idNum,
      driverName: driver.name,
      fuelLevel: body.tipoCombustible ?? null,
      oilLevel: body.nivelAceite ?? null,
      vehicleFaults: body.fallasVehiculo ?? null,
      fileUrls: [],
    }).returning();

    res.status(201).json({
      id: `driver-report-${created.id}`,
      conductor: driver.name,
      fecha: created.createdAt,
      resumenTexto: `Reporte del conductor "${driver.name}" registrado.${body.fallasVehiculo ? ' Hay fallas reportadas.' : ''}`,
    });
  }),
);

export default router;
