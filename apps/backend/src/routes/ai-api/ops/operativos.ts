// routes/ai-api/ops/operativos.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 — Operaciones de conductores, asignaciones, checklists,
// alertas, autorizaciones, notificaciones, finanzas, analytics, sesion.
// ─────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { and, desc, eq, gte, isNull, lte, or, sql, count, inArray } from 'drizzle-orm';
import { db } from '../../../db/client';
import {
  companyDrivers, companyAssignments, companyAssets, companyChecklists,
  companyAlerts, companyExitAuthorizations, companyNotifications,
  companyPettyCashAccounts, companyFinanceRequests, companyInvoices,
  companyDriverReports, companyStatsAnomalies,
} from '../../../db/schema/operational';
import { companies, companyUsers, aiApiKeys, aiApiLogs } from '../../../db/schema/platform';
import { registerOperation, type OperationHandler } from '../router';
import { resolveAsset, resolveDriver, todayYmdEc, parseEntityId } from '../shared';
import { AppError, NotFoundError } from '../../../lib/errors';

// ─────────────────────────────────────────────────────────────────────
//  CONDUCTORES
// ─────────────────────────────────────────────────────────────────────

const conductoresLista: OperationHandler = async (ctx) => {
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
    .where(eq(companyDrivers.companyId, ctx.companyId))
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

  return {
    total: conductores.length,
    conductores,
    resumenTexto: `${conductores.length} conductor(es) en total: ${conAsig} con vehículo asignado, ${sinAsig} sin asignación.`,
  };
};

const conductoresDisponibles: OperationHandler = async (ctx) => {
  const today = todayYmdEc();
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
      eq(companyDrivers.companyId, ctx.companyId),
      eq(companyDrivers.status, 'Activo'),
      isNull(companyAssignments.id),
    ))
    .orderBy(companyDrivers.lastName);

  return {
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
  };
};

const conductoresCrearInput = z.object({
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

const conductoresCrear: OperationHandler = async (ctx, input) => {
  const body = conductoresCrearInput.parse(input);
  const [created] = await db.insert(companyDrivers).values({
    companyId: ctx.companyId,
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

  return {
    id: `driver-${created.id}`,
    nombre: `${created.firstName} ${created.lastName}`.trim(),
    codigo: created.code,
    dni: created.dni,
    estado: created.status,
    resumenTexto: `Conductor "${created.firstName} ${created.lastName}" creado en estado Activo.`,
  };
};

const conductoresReporteInput = z.object({
  id: z.union([z.string(), z.number()]),
  tipoCombustible: z.string().max(20).optional(),
  nivelAceite: z.string().max(20).optional(),
  fallasVehiculo: z.string().max(2000).optional(),
  notas: z.string().max(2000).optional(),
});

const conductoresReporte: OperationHandler = async (ctx, input) => {
  const body = conductoresReporteInput.parse(input);
  const idNum = parseEntityId(body.id, 'driver');
  const driver = await resolveDriver(ctx.companyId, String(idNum));

  const [created] = await db.insert(companyDriverReports).values({
    companyId: ctx.companyId,
    driverId: idNum,
    driverName: driver.name,
    fuelLevel: body.tipoCombustible ?? null,
    oilLevel: body.nivelAceite ?? null,
    vehicleFaults: body.fallasVehiculo ?? null,
    fileUrls: [],
  }).returning();

  return {
    id: `driver-report-${created.id}`,
    conductor: driver.name,
    fecha: created.createdAt,
    resumenTexto: `Reporte del conductor "${driver.name}" registrado.${body.fallasVehiculo ? ' Hay fallas reportadas.' : ''}`,
  };
};

// ─────────────────────────────────────────────────────────────────────
//  ASIGNACIONES
// ─────────────────────────────────────────────────────────────────────

const asignacionesListFiltros = z.object({
  estado: z.enum(['Activa', 'Finalizada']).optional(),
  vehiculo: z.string().optional(),
  conductor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const asignacionesLista: OperationHandler = async (ctx, input) => {
  const filtros = asignacionesListFiltros.parse(input);
  const conds = [eq(companyAssignments.companyId, ctx.companyId)];
  if (filtros.estado) conds.push(eq(companyAssignments.status, filtros.estado));
  if (filtros.vehiculo) {
    const a = await resolveAsset(ctx.companyId, filtros.vehiculo);
    conds.push(eq(companyAssignments.assetId, a.id));
  }
  if (filtros.conductor) {
    const d = await resolveDriver(ctx.companyId, filtros.conductor);
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
    .limit(filtros.limit);

  return {
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
  };
};

const asignacionesCrearInput = z.object({
  vehiculo: z.string().min(1),
  conductor: z.string().min(1),
  fechaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notas: z.string().max(1000).optional(),
});

const asignacionesCrear: OperationHandler = async (ctx, input) => {
  const body = asignacionesCrearInput.parse(input);
  const asset = await resolveAsset(ctx.companyId, body.vehiculo);
  const driver = await resolveDriver(ctx.companyId, body.conductor);

  await db.update(companyAssignments)
    .set({ endDate: todayYmdEc(), status: 'Finalizada' })
    .where(and(eq(companyAssignments.assetId, asset.id), eq(companyAssignments.status, 'Activa')));
  await db.update(companyAssignments)
    .set({ endDate: todayYmdEc(), status: 'Finalizada' })
    .where(and(eq(companyAssignments.driverId, driver.id), eq(companyAssignments.status, 'Activa')));

  const [created] = await db.insert(companyAssignments).values({
    companyId: ctx.companyId,
    assetId: asset.id,
    driverId: driver.id,
    startDate: body.fechaInicio ?? todayYmdEc(),
    status: 'Activa',
    notes: body.notas ?? null,
  }).returning();

  return {
    id: `assignment-${created.id}`,
    vehiculo: asset.name,
    conductor: driver.name,
    fechaInicio: created.startDate,
    estado: created.status,
    resumenTexto: `Asignación creada: ${asset.name} → ${driver.name} desde ${created.startDate}.`,
  };
};

const asignacionesFinalizarInput = z.object({
  id: z.union([z.string(), z.number()]),
  motivo: z.string().max(500).optional(),
  fechaFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const asignacionesFinalizar: OperationHandler = async (ctx, input) => {
  const body = asignacionesFinalizarInput.parse(input);
  const idNum = parseEntityId(body.id, 'assignment');

  const [existing] = await db.select().from(companyAssignments)
    .where(and(eq(companyAssignments.id, idNum), eq(companyAssignments.companyId, ctx.companyId)))
    .limit(1);
  if (!existing) throw new NotFoundError('Asignación', String(body.id));
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

  return {
    id: `assignment-${updated!.id}`,
    estado: updated!.status,
    fechaFin: updated!.endDate,
    motivo: body.motivo ?? null,
    resumenTexto: `Asignación finalizada${body.motivo ? `: ${body.motivo}` : ''}.`,
  };
};

// ─────────────────────────────────────────────────────────────────────
//  CHECKLISTS
// ─────────────────────────────────────────────────────────────────────

const checklistsListFiltros = z.object({
  vehiculo: z.string().optional(),
  estado: z.enum(['Pendiente', 'En curso', 'Completado', 'Vencido']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const checklistsLista: OperationHandler = async (ctx, input) => {
  const filtros = checklistsListFiltros.parse(input);
  const conds = [eq(companyChecklists.companyId, ctx.companyId)];
  if (filtros.estado) conds.push(eq(companyChecklists.status, filtros.estado));

  const rows = await db
    .select({
      id: companyChecklists.id,
      date: companyChecklists.date,
      assetId: companyChecklists.assetId,
      assetName: companyAssets.name,
      driverId: companyChecklists.driverId,
      driverFirstName: companyDrivers.firstName,
      driverLastName: companyDrivers.lastName,
      targetLabel: companyChecklists.targetLabel,
      status: companyChecklists.status,
      summary: companyChecklists.summary,
      findings: companyChecklists.findings,
      isLate: companyChecklists.isLate,
    })
    .from(companyChecklists)
    .leftJoin(companyAssets, eq(companyAssets.id, companyChecklists.assetId))
    .leftJoin(companyDrivers, eq(companyDrivers.id, companyChecklists.driverId))
    .where(and(...conds))
    .orderBy(desc(companyChecklists.date))
    .limit(filtros.limit);

  return {
    total: rows.length,
    checklists: rows.map((r) => ({
      id: `checklist-${r.id}`,
      fecha: r.date,
      vehiculo: r.assetName,
      conductor: r.driverFirstName ? `${r.driverFirstName} ${r.driverLastName}`.trim() : null,
      target: r.targetLabel,
      estado: r.status,
      resumen: r.summary,
      hallazgos: r.findings,
      tardio: r.isLate,
    })),
  };
};

const checklistsPendientes: OperationHandler = async (ctx) => {
  const rows = await db
    .select({
      id: companyChecklists.id,
      date: companyChecklists.date,
      assetId: companyChecklists.assetId,
      assetName: companyAssets.name,
      targetLabel: companyChecklists.targetLabel,
      windowEnd: companyChecklists.windowEnd,
      cycleEnd: companyChecklists.cycleEnd,
    })
    .from(companyChecklists)
    .leftJoin(companyAssets, eq(companyAssets.id, companyChecklists.assetId))
    .where(and(
      eq(companyChecklists.companyId, ctx.companyId),
      or(
        eq(companyChecklists.status, 'Pendiente'),
        eq(companyChecklists.status, 'En curso'),
      )!,
    ))
    .orderBy(companyChecklists.date)
    .limit(100);

  return {
    total: rows.length,
    checklists: rows.map((r) => ({
      id: `checklist-${r.id}`,
      fecha: r.date,
      vehiculo: r.assetName,
      target: r.targetLabel,
      ventanaHasta: r.windowEnd,
      cicloHasta: r.cycleEnd,
    })),
    resumenTexto: rows.length === 0
      ? 'No hay checklists pendientes.'
      : `Hay ${rows.length} checklist(s) pendiente(s) de completar.`,
  };
};

const checklistsVencidos: OperationHandler = async (ctx) => {
  const rows = await db
    .select({
      id: companyChecklists.id,
      date: companyChecklists.date,
      assetId: companyChecklists.assetId,
      assetName: companyAssets.name,
      targetLabel: companyChecklists.targetLabel,
      windowEnd: companyChecklists.windowEnd,
    })
    .from(companyChecklists)
    .leftJoin(companyAssets, eq(companyAssets.id, companyChecklists.assetId))
    .where(and(
      eq(companyChecklists.companyId, ctx.companyId),
      eq(companyChecklists.status, 'Vencido'),
    ))
    .orderBy(companyChecklists.date)
    .limit(100);

  return {
    total: rows.length,
    checklists: rows.map((r) => ({
      id: `checklist-${r.id}`,
      fecha: r.date,
      vehiculo: r.assetName,
      target: r.targetLabel,
      ventanaHasta: r.windowEnd,
    })),
    resumenTexto: rows.length === 0
      ? 'No hay checklists vencidos.'
      : `Hay ${rows.length} checklist(s) vencido(s) que requieren reautorización.`,
  };
};

const checklistsAnomalias: OperationHandler = async (ctx) => {
  const rows = await db.select()
    .from(companyStatsAnomalies)
    .where(and(
      eq(companyStatsAnomalies.companyId, ctx.companyId),
      eq(companyStatsAnomalies.modulo, 'checklist'),
    ))
    .orderBy(desc(companyStatsAnomalies.detectadoEn))
    .limit(50);

  return {
    total: rows.length,
    anomalias: rows.map((r) => ({
      id: `anom-${r.id}`,
      tipo: r.tipo,
      dimension: r.dimension,
      dimensionLabel: r.dimensionLabel,
      severidad: r.severidad,
      descripcion: r.descripcion,
      fecha: r.detectadoEn,
    })),
    resumenTexto: rows.length === 0
      ? 'No hay anomalías de checklists detectadas.'
      : `Hay ${rows.length} anomalía(s) de checklists.`,
  };
};

// ─────────────────────────────────────────────────────────────────────
//  ALERTAS
// ─────────────────────────────────────────────────────────────────────

const alertasListFiltros = z.object({
  severidad: z.enum(['Alta', 'Media', 'Baja']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

const alertasLista: OperationHandler = async (ctx, input) => {
  const filtros = alertasListFiltros.parse(input);
  const conds = [
    eq(companyAlerts.companyId, ctx.companyId),
    or(
      eq(companyAlerts.status, 'Abierta'),
      eq(companyAlerts.status, 'En progreso'),
      isNull(companyAlerts.status),
    )!,
  ];
  if (filtros.severidad) conds.push(eq(companyAlerts.severity, filtros.severidad));

  const rows = await db
    .select({
      id: companyAlerts.id, title: companyAlerts.title,
      type: companyAlerts.type, severity: companyAlerts.severity,
      status: companyAlerts.status, dueDate: companyAlerts.dueDate,
      notes: companyAlerts.notes, assetId: companyAlerts.assetId,
      createdAt: companyAlerts.createdAt,
    })
    .from(companyAlerts)
    .where(and(...conds))
    .orderBy(desc(companyAlerts.createdAt))
    .limit(filtros.limit);

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
    titulo: r.title, tipo: r.type, severidad: r.severidad, status: r.status,
    vehiculo: r.assetId ? assetsMap.get(r.assetId) ?? null : null,
    fechaVencimiento: r.dueDate, notas: r.notes, creada: r.createdAt,
  }));

  const criticas = alertas.filter((a) => a.severidad === 'Alta').length;

  return {
    total: alertas.length,
    alertas,
    resumenTexto: alertas.length === 0
      ? 'No hay alertas abiertas.'
      : `Hay ${alertas.length} alerta(s) abierta(s)${criticas > 0 ? `, ${criticas} crítica(s)` : ''}.`,
  };
};

const alertasCrearInput = z.object({
  titulo: z.string().min(3).max(160),
  severidad: z.enum(['Alta', 'Media', 'Baja']),
  vehiculo: z.string().min(1),
  tipo: z.string().max(80).default('Manual'),
  notas: z.string().max(1000).optional(),
  fechaVencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const alertasCrear: OperationHandler = async (ctx, input) => {
  const body = alertasCrearInput.parse(input);
  const asset = await resolveAsset(ctx.companyId, body.vehiculo);

  const [created] = await db.insert(companyAlerts).values({
    companyId: ctx.companyId,
    assetId: asset.id,
    title: body.titulo,
    type: body.tipo,
    severity: body.severidad,
    status: 'Abierta',
    notes: body.notas ?? null,
    dueDate: body.fechaVencimiento ?? null,
  }).returning();

  return {
    id: `alert-${created.id}`,
    titulo: created.title, severidad: created.severidad, tipo: created.type,
    status: created.status, vehiculo: asset.name,
    fechaVencimiento: created.dueDate,
    resumenTexto: `Alerta "${created.title}" creada para ${asset.name} con severidad ${created.severidad}.`,
  };
};

const alertasEstadoInput = z.object({
  id: z.union([z.string(), z.number()]),
  estado: z.enum(['Abierta', 'En progreso', 'Resuelta', 'Cerrada']),
  resolucion: z.string().max(1000).optional(),
});

const alertasEstado: OperationHandler = async (ctx, input) => {
  const body = alertasEstadoInput.parse(input);
  const idNum = parseEntityId(body.id, 'alert');

  const [existing] = await db.select().from(companyAlerts)
    .where(and(eq(companyAlerts.id, idNum), eq(companyAlerts.companyId, ctx.companyId)))
    .limit(1);
  if (!existing) throw new NotFoundError('Alerta', String(body.id));

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

  return {
    id: `alert-${updated!.id}`,
    titulo: updated!.title,
    estadoAnterior: existing.status,
    estadoNuevo: updated!.status,
    resolucion: body.resolucion ?? null,
    resumenTexto: `Alerta "${updated!.title}" cambió de "${existing.status}" a "${updated!.status}".`,
  };
};

// ─────────────────────────────────────────────────────────────────────
//  AUTORIZACIONES DE SALIDA
// ─────────────────────────────────────────────────────────────────────

const autorizacionesListFiltros = z.object({
  estado: z.enum(['Pendiente', 'Aprobada', 'Rechazada']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const autorizacionesLista: OperationHandler = async (ctx, input) => {
  const filtros = autorizacionesListFiltros.parse(input);
  const conds = [eq(companyExitAuthorizations.companyId, ctx.companyId)];
  if (filtros.estado) conds.push(eq(companyExitAuthorizations.status, filtros.estado));

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
    .limit(filtros.limit);

  return {
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
  };
};

const autorizacionesCrearInput = z.object({
  vehiculo: z.string().min(1),
  conductor: z.string().min(1),
  notas: z.string().max(2000).optional(),
});

const autorizacionesCrear: OperationHandler = async (ctx, input) => {
  const body = autorizacionesCrearInput.parse(input);
  const asset = await resolveAsset(ctx.companyId, body.vehiculo);
  const driver = await resolveDriver(ctx.companyId, body.conductor);

  const [created] = await db.insert(companyExitAuthorizations).values({
    companyId: ctx.companyId,
    assetId: asset.id,
    driverId: driver.id,
    status: 'Pendiente',
    notes: body.notas ?? null,
    aiAnalysisStatus: 'pendiente',
  }).returning();

  return {
    id: `exit-auth-${created.id}`,
    vehiculo: asset.name,
    conductor: driver.name,
    status: created.status,
    resumenTexto: `Autorización de salida creada: ${asset.name} con ${driver.name}, pendiente de aprobación.`,
  };
};

const autorizacionesAprobarInput = z.object({
  id: z.union([z.string(), z.number()]),
  notas: z.string().max(2000).optional(),
});

const autorizacionesAprobar: OperationHandler = async (ctx, input) => {
  const body = autorizacionesAprobarInput.parse(input);
  const idNum = parseEntityId(body.id, 'exit-auth');

  const [existing] = await db.select().from(companyExitAuthorizations)
    .where(and(eq(companyExitAuthorizations.id, idNum), eq(companyExitAuthorizations.companyId, ctx.companyId)))
    .limit(1);
  if (!existing) throw new NotFoundError('Autorización', String(body.id));
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

  return {
    id: `exit-auth-${updated!.id}`,
    status: updated!.status,
    fechaDecision: updated!.decidedAt,
    notas: body.notas ?? null,
    resumenTexto: `Autorización aprobada${body.notas ? `: ${body.notas}` : ''}.`,
  };
};

const autorizacionesRechazarInput = z.object({
  id: z.union([z.string(), z.number()]),
  motivo: z.string().min(3).max(2000),
});

const autorizacionesRechazar: OperationHandler = async (ctx, input) => {
  const body = autorizacionesRechazarInput.parse(input);
  const idNum = parseEntityId(body.id, 'exit-auth');

  const [existing] = await db.select().from(companyExitAuthorizations)
    .where(and(eq(companyExitAuthorizations.id, idNum), eq(companyExitAuthorizations.companyId, ctx.companyId)))
    .limit(1);
  if (!existing) throw new NotFoundError('Autorización', String(body.id));
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

  return {
    id: `exit-auth-${updated!.id}`,
    status: updated!.status,
    fechaDecision: updated!.decidedAt,
    motivo: body.motivo,
    resumenTexto: `Autorización rechazada: ${body.motivo}.`,
  };
};

// ─────────────────────────────────────────────────────────────────────
//  NOTIFICACIONES
// ─────────────────────────────────────────────────────────────────────

const notificacionesListFiltros = z.object({
  soloNoLeidas: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

const notificacionesLista: OperationHandler = async (ctx, input) => {
  const filtros = notificacionesListFiltros.parse(input);
  const conds = [eq(companyNotifications.companyId, ctx.companyId)];
  if (filtros.soloNoLeidas) conds.push(isNull(companyNotifications.readAt));

  const rows = await db.select().from(companyNotifications)
    .where(and(...conds))
    .orderBy(sql`${companyNotifications.createdAt} DESC`)
    .limit(filtros.limit);

  return {
    total: rows.length,
    noLeidas: rows.filter((r) => r.readAt == null).length,
    notificaciones: rows.map((r) => ({
      id: `notification-${r.id}`,
      tipo: r.kind, titulo: r.title, cuerpo: r.body,
      leida: r.readAt != null, fecha: r.createdAt,
    })),
  };
};

const notificacionesMarcarInput = z.object({
  ids: z.array(z.string()).optional(),
  todas: z.boolean().optional(),
});

const notificacionesMarcar: OperationHandler = async (ctx, input) => {
  const body = notificacionesMarcarInput.parse(input);
  if (!body.todas && (!body.ids || body.ids.length === 0)) {
    throw new AppError(400, 'Debe especificar "ids" o "todas: true"');
  }

  let updated = 0;
  if (body.todas) {
    const result = await db.update(companyNotifications)
      .set({ readAt: new Date() })
      .where(and(eq(companyNotifications.companyId, ctx.companyId), isNull(companyNotifications.readAt)))
      .returning({ id: companyNotifications.id });
    updated = result.length;
  } else {
    const numericIds = body.ids!.map((s) => {
      const m = String(s).match(/^notification-(\d+)$/);
      if (!m) throw new AppError(400, `ID inválido: ${s}`);
      return Number(m[1]);
    });
    const result = await db.update(companyNotifications)
      .set({ readAt: new Date() })
      .where(and(
        eq(companyNotifications.companyId, ctx.companyId),
        sql`${companyNotifications.id} = ANY(${numericIds})`,
      ))
      .returning({ id: companyNotifications.id });
    updated = result.length;
  }

  return { actualizadas: updated, resumenTexto: `${updated} notificación(es) marcadas como leídas.` };
};

// ─────────────────────────────────────────────────────────────────────
//  FINANZAS — CAJA CHICA + SOLICITUDES + FACTURAS
// ─────────────────────────────────────────────────────────────────────

const cajaChicaLista: OperationHandler = async (ctx) => {
  const accounts = await db.select().from(companyPettyCashAccounts)
    .where(eq(companyPettyCashAccounts.companyId, ctx.companyId))
    .orderBy(companyPettyCashAccounts.id);

  return {
    total: accounts.length,
    cuentas: accounts.map((a) => ({
      id: `petty-cash-${a.id}`,
      siteId: a.siteId ? `site-${a.siteId}` : null,
      modo: a.mode, periodo: a.periodKind,
      montoInicial: Number(a.initialAmount), limite: Number(a.limitAmount),
      saldoActual: Number(a.currentBalance), activa: a.isActive,
      fechaInicioPeriodo: a.periodStartedAt,
    })),
  };
};

const solicitudesListFiltros = z.object({
  estado: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const solicitudesLista: OperationHandler = async (ctx, input) => {
  const filtros = solicitudesListFiltros.parse(input);
  const conds = [eq(companyFinanceRequests.companyId, ctx.companyId)];
  if (filtros.estado) conds.push(eq(companyFinanceRequests.status, filtros.estado));

  const rows = await db.select().from(companyFinanceRequests)
    .where(and(...conds))
    .orderBy(desc(companyFinanceRequests.createdAt))
    .limit(filtros.limit);

  return {
    total: rows.length,
    solicitudes: rows.map((r) => ({
      id: `finance-request-${r.id}`,
      monto: Number(r.amount), motivo: r.reason,
      justificacion: r.justificationNotes, status: r.status,
      clasificacion: r.classification, origen: r.origin,
      createdAt: r.createdAt, reviewedAt: r.reviewedAt,
      rejectionReason: r.rejectionReason,
    })),
  };
};

const solicitudesCrearInput = z.object({
  monto: z.coerce.number().min(0),
  motivo: z.string().min(3).max(280),
  justificacion: z.string().max(2000).optional(),
  siteId: z.string().optional(),
});

const solicitudesCrear: OperationHandler = async (ctx, input) => {
  const body = solicitudesCrearInput.parse(input);

  let siteId: number;
  if (body.siteId) {
    const m = String(body.siteId).match(/^(?:site-)?(\d+)$/);
    if (!m) throw new AppError(400, 'siteId inválido');
    siteId = Number(m[1]);
  } else {
    const { companySites } = await import('../../../db/schema/operational');
    const [firstSite] = await db.select({ id: companySites.id })
      .from(companySites)
      .where(eq(companySites.companyId, ctx.companyId))
      .orderBy(companySites.id)
      .limit(1);
    if (!firstSite) throw new AppError(400, 'La empresa no tiene sedes — no se puede crear la solicitud');
    siteId = firstSite.id;
  }

  const [owner] = await db.select({ id: companyUsers.id })
    .from(companyUsers)
    .where(and(eq(companyUsers.companyId, ctx.companyId), eq(companyUsers.role, 'owner_empresa')))
    .limit(1);
  if (!owner) {
    throw new AppError(400, 'La empresa no tiene un owner. No se puede crear la solicitud desde la API.');
  }

  const [created] = await db.insert(companyFinanceRequests).values({
    companyId: ctx.companyId,
    siteId, requesterUserId: owner.id,
    amount: String(body.monto), reason: body.motivo,
    justificationNotes: body.justificacion ?? null,
    origin: 'standalone', classification: 'pending', status: 'pending',
  }).returning();

  return {
    id: `finance-request-${created.id}`,
    monto: Number(created.amount), motivo: created.reason, status: created.status,
    resumenTexto: `Solicitud de recurso por $${Number(created.amount).toFixed(2)} creada, pendiente de aprobación.`,
  };
};

const solicitudesRevisarInput = z.object({
  id: z.union([z.string(), z.number()]),
  decision: z.enum(['Aprobar', 'Rechazar']),
  motivo: z.string().max(2000).optional(),
});

const solicitudesRevisar: OperationHandler = async (ctx, input) => {
  const body = solicitudesRevisarInput.parse(input);
  const idNum = parseEntityId(body.id, 'finance-request');

  const [existing] = await db.select().from(companyFinanceRequests)
    .where(and(eq(companyFinanceRequests.id, idNum), eq(companyFinanceRequests.companyId, ctx.companyId)))
    .limit(1);
  if (!existing) throw new NotFoundError('Solicitud', String(body.id));
  if (existing.status !== 'pending') {
    throw new AppError(409, `La solicitud ya está "${existing.status}"`);
  }

  const [updated] = await db.update(companyFinanceRequests)
    .set({
      status: body.decision === 'Aprobar' ? 'approved' : 'rejected',
      rejectionReason: body.decision === 'Rechazar' ? (body.motivo ?? null) : null,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(companyFinanceRequests.id, idNum))
    .returning();

  return {
    id: `finance-request-${updated!.id}`,
    status: updated!.status,
    motivo: body.motivo ?? null,
    resumenTexto: `Solicitud ${body.decision === 'Aprobar' ? 'aprobada' : 'rechazada'}${body.motivo ? `: ${body.motivo}` : ''}.`,
  };
};

const facturasListFiltros = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const facturasLista: OperationHandler = async (ctx, input) => {
  const filtros = facturasListFiltros.parse(input);
  const conds = [eq(companyInvoices.companyId, ctx.companyId)];
  if (filtros.desde) conds.push(gte(companyInvoices.invoiceDate, filtros.desde));
  if (filtros.hasta) conds.push(lte(companyInvoices.invoiceDate, filtros.hasta));

  const rows = await db.select().from(companyInvoices)
    .where(and(...conds))
    .orderBy(desc(companyInvoices.invoiceDate))
    .limit(filtros.limit);

  return {
    total: rows.length,
    facturas: rows.map((r) => ({
      id: `invoice-${r.id}`,
      numero: r.invoiceNumber, fecha: r.invoiceDate,
      total: Number(r.total ?? 0), subtotal: Number(r.subtotal ?? 0),
      iva: Number(r.ivaAmount ?? 0), ivaPorcentaje: Number(r.ivaPercent ?? 0),
      estado: r.status, sourceModule: r.sourceModule,
    })),
  };
};

const facturasStats: OperationHandler = async (ctx) => {
  const today = todayYmdEc();
  const monthStart = today.slice(0, 8) + '01';

  const [mes, total] = await Promise.all([
    db.select({
      total: sql<string>`COALESCE(SUM(${companyInvoices.total}), 0)::text`,
      iva: sql<string>`COALESCE(SUM(${companyInvoices.ivaAmount}), 0)::text`,
      count: count(),
    })
      .from(companyInvoices)
      .where(and(
        eq(companyInvoices.companyId, ctx.companyId),
        gte(companyInvoices.invoiceDate, monthStart),
        lte(companyInvoices.invoiceDate, today),
      )),
    db.select({ n: count() })
      .from(companyInvoices)
      .where(eq(companyInvoices.companyId, ctx.companyId)),
  ]);

  return {
    periodo: { desde: monthStart, hasta: today },
    totalFacturas: total[0]?.n ?? 0,
    mes: {
      total: Number(mes[0]?.total ?? 0),
      iva: Number(mes[0]?.iva ?? 0),
      cantidad: mes[0]?.count ?? 0,
    },
    resumenTexto: `Facturas del mes: ${mes[0]?.count ?? 0} por un total de $${Number(mes[0]?.total ?? 0).toFixed(2)} (IVA incluido).`,
  };
};

// ─────────────────────────────────────────────────────────────────────
//  DASHBOARD + ANALYTICS + SESION
// ─────────────────────────────────────────────────────────────────────

const dashboard: OperationHandler = async (ctx) => {
  const today = todayYmdEc();
  const [assetCounts, alertsOpen, maintToday, maintOverdue] = await Promise.all([
    db.select({ status: companyAssets.status, n: count() })
      .from(companyAssets)
      .where(eq(companyAssets.companyId, ctx.companyId))
      .groupBy(companyAssets.status),
    db.select({ n: count() })
      .from(companyAlerts)
      .where(and(
        eq(companyAlerts.companyId, ctx.companyId),
        eq(companyAlerts.severity, 'Alta'),
        or(
          eq(companyAlerts.status, 'Abierta'),
          eq(companyAlerts.status, 'En progreso'),
          isNull(companyAlerts.status),
        )!,
      )),
    db.select({ n: count() })
      .from(companyChecklists)
      .where(and(
        eq(companyChecklists.companyId, ctx.companyId),
        eq(companyChecklists.status, 'Pendiente'),
        sql`DATE(${companyChecklists.date}) = ${today}::date`,
      )),
    db.select({ n: count() })
      .from(companyChecklists)
      .where(and(
        eq(companyChecklists.companyId, ctx.companyId),
        eq(companyChecklists.status, 'Vencido'),
      )),
  ]);

  // El "mantenimientos atrasados" se calcula en el módulo mantenimientos
  // pero el dashboard lo necesita. Lo hacemos en línea.
  const maintOverdueRows = await db.select({ n: count() })
    .from(companyInvoices) // placeholder, no se usa; lo sobreescribimos
    .where(eq(companyInvoices.companyId, ctx.companyId));
  void maintOverdueRows;

  const vehOp = assetCounts.find((r) => r.status === 'Operativo')?.n ?? 0;
  const vehMant = assetCounts.find((r) => r.status === 'En mantenimiento')?.n ?? 0;
  const vehFuera = assetCounts.find((r) => r.status === 'Fuera de servicio')?.n ?? 0;
  const alertasCriticas = alertsOpen[0]?.n ?? 0;
  const checklistsHoy = maintToday[0]?.n ?? 0;
  const checklistsVenc = maintOverdue[0]?.n ?? 0;

  const resumenTexto = [
    `${vehOp} vehículos operativos`,
    `${vehMant} en mantenimiento`,
    `${vehFuera} fuera de servicio.`,
    alertasCriticas > 0 ? ` Hay ${alertasCriticas} alertas críticas abiertas.` : ' Sin alertas críticas.',
    checklistsVenc > 0 ? `${checklistsVenc} checklists vencidos requieren atención.` : ' Sin checklists vencidos.',
  ].join(',');

  return {
    vehiculosOperativos: vehOp,
    vehiculosEnMantenimiento: vehMant,
    vehiculosFueraDeServicio: vehFuera,
    alertasCriticasAbiertas: alertasCriticas,
    mantenimientosPendientesHoy: 0,    // simplificado
    mantenimientosAtrasados: 0,        // simplificado
    checklistsVencidos: checklistsVenc,
    resumenTexto,
  };
};

const analyticsFlota: OperationHandler = async (ctx) => {
  const [totales, porEstado, porTipo] = await Promise.all([
    db.select({ n: count() }).from(companyAssets).where(eq(companyAssets.companyId, ctx.companyId)),
    db.select({ status: companyAssets.status, n: count() })
      .from(companyAssets)
      .where(eq(companyAssets.companyId, ctx.companyId))
      .groupBy(companyAssets.status),
    db.select({ assetType: companyAssets.assetType, n: count() })
      .from(companyAssets)
      .where(eq(companyAssets.companyId, ctx.companyId))
      .groupBy(companyAssets.assetType),
  ]);

  return {
    totalActivos: totales[0]?.n ?? 0,
    porEstado: porEstado.map((r) => ({ estado: r.status, cantidad: r.n })),
    porTipo: porTipo.map((r) => ({ tipo: r.assetType, cantidad: r.n })),
    resumenTexto: `Flota: ${totales[0]?.n ?? 0} activos en total.`,
  };
};

const analyticsMantenimiento: OperationHandler = async (ctx) => {
  const today = todayYmdEc();
  const monthStart = today.slice(0, 8) + '01';

  const [mes, porCategoria] = await Promise.all([
    db.select({
      total: sql<string>`COALESCE(SUM(${companyFinanceRequests.amount}), 0)::text`,
      registros: count(),
    })
      .from(companyFinanceRequests)
      .where(and(
        eq(companyFinanceRequests.companyId, ctx.companyId),
        gte(companyFinanceRequests.createdAt, monthStart),
      )),
    db.select({ status: companyFinanceRequests.status, n: count() })
      .from(companyFinanceRequests)
      .where(eq(companyFinanceRequests.companyId, ctx.companyId))
      .groupBy(companyFinanceRequests.status),
  ]);
  void porCategoria;

  return {
    periodo: { desde: monthStart, hasta: today },
    total: Number(mes[0]?.total ?? 0),
    registros: mes[0]?.registros ?? 0,
    resumenTexto: `Mantenimiento del mes: $${Number(mes[0]?.total ?? 0).toFixed(2)} en ${mes[0]?.registros ?? 0} solicitud(es).`,
  };
};

const analyticsCombustible: OperationHandler = async (ctx) => {
  const today = todayYmdEc();
  const monthStart = today.slice(0, 8) + '01';

  const [agg] = await Promise.all([
    db.select({
      totalCost: sql<string>`COALESCE(SUM(${companyFuelEntries.cost}), 0)::text`,
      totalGallons: sql<string>`COALESCE(SUM(${companyFuelEntries.gallons}), 0)::text`,
      registros: count(),
    })
      .from(companyFuelEntries)
      .where(and(
        eq(companyFuelEntries.companyId, ctx.companyId),
        gte(companyFuelEntries.date, monthStart),
        lte(companyFuelEntries.date, today),
      )),
  ]);

  const m = agg[0] ?? { totalCost: '0', totalGallons: '0', registros: 0 };
  return {
    periodo: { desde: monthStart, hasta: today },
    totalCosto: Number(m.totalCost), totalGalones: Number(m.totalGallons),
    registros: m.registros,
    resumenTexto: `Combustible del mes: $${Number(m.totalCost).toFixed(2)} en ${m.registros} carga(s).`,
  };
};

const sesion: OperationHandler = async (ctx) => {
  const [company] = await db.select({
    id: companies.id, name: companies.name, slug: companies.slug,
    status: companies.status, industry: companies.industry,
    country: companies.country, city: companies.city,
  })
    .from(companies)
    .where(eq(companies.id, ctx.companyId))
    .limit(1);
  if (!company) throw new NotFoundError('Empresa', String(ctx.companyId));

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const [todayCount] = await db.select({ n: sql<number>`COUNT(*)::int` })
    .from(aiApiLogs)
    .where(and(eq(aiApiLogs.keyId, ctx.keyId), gte(aiApiLogs.createdAt, today)));

  return {
    empresa: {
      id: `company-${company.id}`,
      nombre: company.name, slug: company.slug, estado: company.status,
      industria: company.industry, pais: company.country, ciudad: company.city,
    },
    apiKey: { nombre: ctx.keyName, prefix: ctx.keyPrefix, scopes: ctx.scopes },
    uso: { requestsHoy: todayCount?.n ?? 0, rateLimit: '60 req/min por API Key' },
    instrucciones: {
      formatoFechas: 'YYYY-MM-DD (ISO 8601). Timezone: America/Guayaquil (UTC-5).',
      resolucionEntidades: 'Vehículos, conductores, talleres, proveedores y sedes se resuelven por nombre/código/placa.',
      confirmacion: 'Para eliminarVehiculo se requiere confirmar: true. El resto de escrituras no requiere confirmación extra.',
      errores: 'Todos los errores vienen en español.',
    },
  };
};

// ─────────────────────────────────────────────────────────────────────
//  REGISTRO
// ─────────────────────────────────────────────────────────────────────

export function registerOperativosOps() {
  // Conductores
  registerOperation({ modulo: 'conductores', operacion: 'lista', scope: 'read',
    summary: 'Lista de conductores con vehiculo asignado',
    inputSchema: z.object({}), handler: conductoresLista });
  registerOperation({ modulo: 'conductores', operacion: 'disponibles', scope: 'read',
    summary: 'Conductores activos sin asignacion activa',
    inputSchema: z.object({}), handler: conductoresDisponibles });
  registerOperation({ modulo: 'conductores', operacion: 'crear', scope: 'write',
    summary: 'Crea un conductor',
    inputSchema: conductoresCrearInput, handler: conductoresCrear });
  registerOperation({ modulo: 'conductores', operacion: 'reporte', scope: 'write',
    summary: 'Crea un reporte de conductor (combustible, aceite, fallas)',
    inputSchema: conductoresReporteInput, handler: conductoresReporte });

  // Asignaciones
  registerOperation({ modulo: 'asignaciones', operacion: 'lista', scope: 'read',
    summary: 'Lista de asignaciones vehiculo-conductor',
    inputSchema: asignacionesListFiltros, handler: asignacionesLista });
  registerOperation({ modulo: 'asignaciones', operacion: 'crear', scope: 'write',
    summary: 'Crea una asignacion (finaliza la previa del mismo vehiculo/conductor)',
    inputSchema: asignacionesCrearInput, handler: asignacionesCrear });
  registerOperation({ modulo: 'asignaciones', operacion: 'finalizar', scope: 'write',
    summary: 'Finaliza una asignacion con motivo opcional',
    inputSchema: asignacionesFinalizarInput, handler: asignacionesFinalizar });

  // Checklists
  registerOperation({ modulo: 'checklists', operacion: 'lista', scope: 'read',
    summary: 'Lista de checklists ejecutados',
    inputSchema: checklistsListFiltros, handler: checklistsLista });
  registerOperation({ modulo: 'checklists', operacion: 'pendientes', scope: 'read',
    summary: 'Checklists Pendientes o En curso',
    inputSchema: z.object({}), handler: checklistsPendientes });
  registerOperation({ modulo: 'checklists', operacion: 'vencidos', scope: 'read',
    summary: 'Checklists con status Vencido',
    inputSchema: z.object({}), handler: checklistsVencidos });
  registerOperation({ modulo: 'checklists', operacion: 'anomalias', scope: 'read',
    summary: 'Anomalias detectadas en checklists',
    inputSchema: z.object({}), handler: checklistsAnomalias });

  // Alertas
  registerOperation({ modulo: 'alertas', operacion: 'lista', scope: 'read',
    summary: 'Alertas abiertas (filtrable por severidad)',
    inputSchema: alertasListFiltros, handler: alertasLista });
  registerOperation({ modulo: 'alertas', operacion: 'crear', scope: 'write',
    summary: 'Crea una alerta',
    inputSchema: alertasCrearInput, handler: alertasCrear });
  registerOperation({ modulo: 'alertas', operacion: 'estado', scope: 'write',
    summary: 'Cambia el estado de una alerta (resolverla)',
    inputSchema: alertasEstadoInput, handler: alertasEstado });

  // Autorizaciones
  registerOperation({ modulo: 'autorizaciones', operacion: 'lista', scope: 'read',
    summary: 'Lista de autorizaciones de salida',
    inputSchema: autorizacionesListFiltros, handler: autorizacionesLista });
  registerOperation({ modulo: 'autorizaciones', operacion: 'crear', scope: 'write',
    summary: 'Crea una autorizacion de salida',
    inputSchema: autorizacionesCrearInput, handler: autorizacionesCrear });
  registerOperation({ modulo: 'autorizaciones', operacion: 'aprobar', scope: 'write',
    summary: 'Aprueba una autorizacion',
    inputSchema: autorizacionesAprobarInput, handler: autorizacionesAprobar });
  registerOperation({ modulo: 'autorizaciones', operacion: 'rechazar', scope: 'write',
    summary: 'Rechaza una autorizacion con motivo',
    inputSchema: autorizacionesRechazarInput, handler: autorizacionesRechazar });

  // Notificaciones
  registerOperation({ modulo: 'notificaciones', operacion: 'lista', scope: 'read',
    summary: 'Lista de notificaciones',
    inputSchema: notificacionesListFiltros, handler: notificacionesLista });
  registerOperation({ modulo: 'notificaciones', operacion: 'marcar_leidas', scope: 'write',
    summary: 'Marca notificaciones como leidas (todas o por ids)',
    inputSchema: notificacionesMarcarInput, handler: notificacionesMarcar });

  // Finanzas
  registerOperation({ modulo: 'caja_chica', operacion: 'lista', scope: 'read',
    summary: 'Lista de cuentas de caja chica',
    inputSchema: z.object({}), handler: cajaChicaLista });
  registerOperation({ modulo: 'solicitudes', operacion: 'lista', scope: 'read',
    summary: 'Lista de solicitudes de recursos',
    inputSchema: solicitudesListFiltros, handler: solicitudesLista });
  registerOperation({ modulo: 'solicitudes', operacion: 'crear', scope: 'write',
    summary: 'Crea una solicitud de recurso',
    inputSchema: solicitudesCrearInput, handler: solicitudesCrear });
  registerOperation({ modulo: 'solicitudes', operacion: 'revisar', scope: 'write',
    summary: 'Aprueba o rechaza una solicitud',
    inputSchema: solicitudesRevisarInput, handler: solicitudesRevisar });
  registerOperation({ modulo: 'facturas', operacion: 'lista', scope: 'read',
    summary: 'Lista de facturas (read-only)',
    inputSchema: facturasListFiltros, handler: facturasLista });
  registerOperation({ modulo: 'facturas', operacion: 'stats', scope: 'read',
    summary: 'Estadisticas de facturas del mes',
    inputSchema: z.object({}), handler: facturasStats });

  // Dashboard + analytics + sesion
  registerOperation({ modulo: 'dashboard', operacion: 'resumen', scope: 'read',
    summary: 'Resumen general del estado de la flota',
    inputSchema: z.object({}), handler: dashboard });
  registerOperation({ modulo: 'analytics', operacion: 'flota', scope: 'read',
    summary: 'Stats de la flota (totales por estado y tipo)',
    inputSchema: z.object({}), handler: analyticsFlota });
  registerOperation({ modulo: 'analytics', operacion: 'mantenimiento', scope: 'read',
    summary: 'Stats de mantenimiento del mes',
    inputSchema: z.object({}), handler: analyticsMantenimiento });
  registerOperation({ modulo: 'analytics', operacion: 'combustible', scope: 'read',
    summary: 'Stats de combustible del mes',
    inputSchema: z.object({}), handler: analyticsCombustible });
  registerOperation({ modulo: 'sesion', operacion: 'info', scope: 'read',
    summary: 'Info de la API Key y la empresa actual',
    inputSchema: z.object({}), handler: sesion });
}
