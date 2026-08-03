// routes/ai-api/ops/operativos.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 — Operaciones de conductores, asignaciones, checklists,
// alertas, autorizaciones, notificaciones, finanzas, analytics, sesion.
// ─────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { and, desc, eq, gte, isNull, lte, lt, ne, or, sql, count, inArray } from 'drizzle-orm';
import { db } from '../../../db/client';
import {
  companyDrivers, companyAssignments, companyAssets, companyChecklists,
  companyAlerts, companyExitAuthorizations, companyNotifications,
  companyPettyCashAccounts, companyPettyCashMovements, companyPettyCashVouchers,
  companyFinanceRequests, companyInvoices,
  companyDriverReports, companyStatsAnomalies,
  companyTollEntries,
  companyFuelEntries,
  companyMaintenanceRecords,
} from '../../../db/schema/operational';
import { companies, companyUsers, aiApiKeys, aiApiLogs } from '../../../db/schema/platform';
import { registerOperation, type OperationHandler } from '../router';
import { resolveAsset, resolveDriver, todayYmdEc, parseEntityId } from '../shared';
import { AppError, NotFoundError } from '../../../lib/errors';
import { toId } from '../../../lib/ids';

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
  // jul 2026 v6 — Exponer el responsable (inspector) y el conductor
  // asociado. Antes solo traía vehículo + fecha, así que el GPT no
  // podía atribuir los vencimientos a personas. Ahora:
  //   - inspector: userId de `companyUsers` (el que debía ejecutar el
  //     checklist). Si está null, el checklist fue generado
  //     automáticamente por el cron.
  //   - driver: driverId de `companyDrivers` (el conductor del
  //     vehículo en el momento del checklist). Null si no había
  //     conductor activo o si targetKind != 'Vehiculo'.
  const rows = await db
    .select({
      id: companyChecklists.id,
      date: companyChecklists.date,
      assetId: companyChecklists.assetId,
      assetName: companyAssets.name,
      assetPlate: companyAssets.plate,
      targetLabel: companyChecklists.targetLabel,
      targetKind: companyChecklists.targetKind,
      windowEnd: companyChecklists.windowEnd,
      inspectorId: companyChecklists.inspectorId,
      driverId: companyChecklists.driverId,
      // ── Datos del inspector (responsable) ──
      inspectorFirst: companyUsers.firstName,
      inspectorLast: companyUsers.lastName,
      inspectorEmail: companyUsers.email,
      inspectorRole: companyUsers.role,
      // ── Datos del conductor asociado al vehículo ──
      driverFirst: companyDrivers.firstName,
      driverLast: companyDrivers.lastName,
      driverCode: companyDrivers.code,
    })
    .from(companyChecklists)
    .leftJoin(companyAssets, eq(companyAssets.id, companyChecklists.assetId))
    .leftJoin(companyUsers, eq(companyUsers.id, companyChecklists.inspectorId))
    .leftJoin(companyDrivers, eq(companyDrivers.id, companyChecklists.driverId))
    .where(and(
      eq(companyChecklists.companyId, ctx.companyId),
      eq(companyChecklists.status, 'Vencido'),
    ))
    .orderBy(companyChecklists.date)
    .limit(100);

  // jul 2026 — Filtramos filas con id null ANTES de mapear, para
  // evitar el "Cannot convert undefined or null to object" que tira
  // el wrapper de OpenAI cuando le pasamos un row con id=null.
  // jul 2026 v2 — También casteamos todas las columnas a string|null
  // para que el wrapper del OpenAI Actions no se queje cuando venga
  // un `Date` (windowEnd/scheduledFor) que se serialice raro en
  // algunos drivers. Y `inspector/driver` ya estaba null-safe.
  const validRows = rows.filter((r) => r && r.id != null);

  return {
    total: validRows.length,
    checklists: validRows.map((r) => {
      // Defensivo: `windowEnd` puede venir como Date (driver postgres
      // mapea `date` a JS Date), string YYYY-MM-DD, string ISO 8601, o
      // null. Lo normalizamos a string YYYY-MM-DD o null. Si viene
      // como Date, .toISOString() funciona; si viene como string,
      // .slice(0,10) alcanza; si es cualquier otra cosa (número,
      // booleano), caemos al String().
      let ventanaHastaStr: string | null = null;
      if (r.windowEnd instanceof Date) {
        ventanaHastaStr = r.windowEnd.toISOString().slice(0, 10);
      } else if (typeof r.windowEnd === 'string') {
        ventanaHastaStr = r.windowEnd.slice(0, 10);
      } else if (r.windowEnd != null) {
        ventanaHastaStr = String(r.windowEnd).slice(0, 10);
      }
      return {
        id: `checklist-${r.id}`,
        // Forzamos strings para que el JSON.stringify del wrapper de
        // OpenAI no reciba Date objects (algunos drivers de V8 + Node 24
        // convierten Date a `Tue May 05 2026 20:43:33 GMT+0000` y el
        // cliente Actions del GPT tira "Cannot convert undefined or null
        // to object" cuando hace Object.keys sobre el payload).
        fecha:    r.date    ? String(r.date).slice(0, 10)  : null,
        ventanaHasta: ventanaHastaStr,
        vehiculo: r.assetName ?? null,
        placa: r.assetPlate,
        target: r.targetLabel,
        targetKind: r.targetKind,
        // Inspector (responsable: el user al que se le asignó el checklist)
        inspector: r.inspectorId ? {
          id: toId('company-user', r.inspectorId),
          nombre: [r.inspectorFirst, r.inspectorLast].filter(Boolean).join(' ') || null,
          email: r.inspectorEmail ?? null,
          rol: r.inspectorRole ?? null,
        } : null,
        // Conductor del vehículo (puede ser null si el target no es el vehículo)
        conductor: r.driverId ? {
          id: toId('driver', r.driverId),
          nombre: [r.driverFirst, r.driverLast].filter(Boolean).join(' ') || null,
          codigo: r.driverCode ?? null,
        } : null,
      };
    }),
    resumenTexto: validRows.length === 0
      ? 'No hay checklists vencidos.'
      : `Hay ${validRows.length} checklist(s) vencido(s) que requieren reautorización.`,
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

// ─────────────────────────────────────────────────────────────────────
//  FINANZAS — CAJA CHICA (jul 2026 v2.3)
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

// caja_chica.detalle: detalle de UNA cuenta con estadísticas del periodo actual
const cajaChicaDetalleInput = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  cuenta: z.string().optional(),
}).refine((d) => d.id !== undefined || d.cuenta !== undefined, {
  message: 'Falta "id" o "cuenta" (ej: "petty-cash-1" o "1")',
});

const cajaChicaDetalle: OperationHandler = async (ctx, input) => {
  const parsed = cajaChicaDetalleInput.parse(input);
  let accountId: number;
  if (parsed.cuenta) {
    const m = String(parsed.cuenta).match(/^(?:petty-cash-)?(\d+)$/i);
    if (!m) throw new AppError(400, `ID de cuenta inválido: "${parsed.cuenta}" (formato: petty-cash-N o N)`);
    accountId = Number(m[1]);
  } else {
    const m = String(parsed.id).match(/^(?:petty-cash-)?(\d+)$/i);
    if (!m) throw new AppError(400, `ID de cuenta inválido: "${parsed.id}" (formato: petty-cash-N o N)`);
    accountId = Number(m[1]);
  }

  const [account] = await db.select()
    .from(companyPettyCashAccounts)
    .where(and(eq(companyPettyCashAccounts.id, accountId), eq(companyPettyCashAccounts.companyId, ctx.companyId)))
    .limit(1);
  if (!account) throw new NotFoundError('CajaChica', String(accountId));

  // Estadísticas del periodo actual
  const inicioPeriodo = account.periodStartedAt ?? account.createdAt;
  const [totalMovs, gastos, reposiciones, vouchersAbiertos] = await Promise.all([
    db.select({ n: count() }).from(companyPettyCashMovements)
      .where(and(
        eq(companyPettyCashMovements.companyId, ctx.companyId),
        eq(companyPettyCashMovements.accountId, accountId),
        gte(companyPettyCashMovements.occurredAt, inicioPeriodo),
      )),
    db.select({
      total: sql<string>`COALESCE(SUM(${companyPettyCashMovements.amount}), 0)::text`,
    }).from(companyPettyCashMovements)
      .where(and(
        eq(companyPettyCashMovements.companyId, ctx.companyId),
        eq(companyPettyCashMovements.accountId, accountId),
        eq(companyPettyCashMovements.type, 'voucher_closed_refund'),
        gte(companyPettyCashMovements.occurredAt, inicioPeriodo),
      )),
    db.select({
      total: sql<string>`COALESCE(SUM(${companyPettyCashMovements.amount}), 0)::text`,
    }).from(companyPettyCashMovements)
      .where(and(
        eq(companyPettyCashMovements.companyId, ctx.companyId),
        eq(companyPettyCashMovements.accountId, accountId),
        eq(companyPettyCashMovements.type, 'replenishment'),
        gte(companyPettyCashMovements.occurredAt, inicioPeriodo),
      )),
    db.select({ n: count() }).from(companyPettyCashVouchers)
      .where(and(
        eq(companyPettyCashVouchers.companyId, ctx.companyId),
        eq(companyPettyCashVouchers.accountId, accountId),
        ne(companyPettyCashVouchers.status, 'Cerrado'),
        ne(companyPettyCashVouchers.status, 'Cancelado'),
      )),
  ]);

  return {
    id: `petty-cash-${account.id}`,
    siteId: `site-${account.siteId}`,
    modo: account.mode,
    periodo: account.periodKind,
    montoInicial: Number(account.initialAmount),
    limite: Number(account.limitAmount),
    saldoActual: Number(account.currentBalance),
    activa: account.isActive,
    fechaInicioPeriodo: account.periodStartedAt,
    estadisticas: {
      movimientosEnPeriodo: Number(totalMovs[0]?.n ?? 0),
      gastosEnPeriodo: Number(gastos[0]?.total ?? 0),
      reposicionesEnPeriodo: Number(reposiciones[0]?.total ?? 0),
      vouchersAbiertos: Number(vouchersAbiertos[0]?.n ?? 0),
    },
    resumenTexto: `CajaChica #${account.id}: saldo ${Number(account.currentBalance).toFixed(2)} USD, ${Number(vouchersAbiertos[0]?.n ?? 0)} vale(s) abierto(s).`,
  };
};

// caja_chica.movimientos: lista paginada de movimientos (append-only).
const cajaChicaMovimientosInput = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  cuenta: z.string().optional(),
  tipo: z.enum(['initial_assignment', 'replenishment', 'period_reset_out', 'period_reset_in', 'request_approved_petty', 'request_approved_annual', 'voucher_closed_refund', 'voucher_cancelled', 'manual_adjustment']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
}).refine((d) => d.id !== undefined || d.cuenta !== undefined, {
  message: 'Falta "id" o "cuenta"',
});

const cajaChicaMovimientos: OperationHandler = async (ctx, input) => {
  const parsed = cajaChicaMovimientosInput.parse(input);
  let accountId: number;
  const raw = parsed.cuenta ?? parsed.id;
  const m = String(raw).match(/^(?:petty-cash-)?(\d+)$/i);
  if (!m) throw new AppError(400, `ID de cuenta inválido: "${raw}"`);
  accountId = Number(m[1]);

  // Verificar que la cuenta pertenece a la empresa
  const [account] = await db.select({ id: companyPettyCashAccounts.id })
    .from(companyPettyCashAccounts)
    .where(and(eq(companyPettyCashAccounts.id, accountId), eq(companyPettyCashAccounts.companyId, ctx.companyId)))
    .limit(1);
  if (!account) throw new NotFoundError('CajaChica', String(accountId));

  const conds = [
    eq(companyPettyCashMovements.companyId, ctx.companyId),
    eq(companyPettyCashMovements.accountId, accountId),
  ];
  if (parsed.tipo) conds.push(eq(companyPettyCashMovements.type, parsed.tipo));

  const rows = await db.select()
    .from(companyPettyCashMovements)
    .where(and(...conds))
    .orderBy(desc(companyPettyCashMovements.occurredAt))
    .limit(parsed.limit);

  return {
    cuentaId: `petty-cash-${accountId}`,
    total: rows.length,
    movimientos: rows.map((m) => ({
      id: `petty-movement-${m.id}`,
      tipo: m.type,
      monto: Number(m.amount),
      saldoDespues: Number(m.balanceAfter),
      occurredAt: m.occurredAt,
      nota: m.note,
      voucherId: m.relatedVoucherId ? `voucher-${m.relatedVoucherId}` : null,
      solicitudId: m.relatedRequestId ? `finance-request-${m.relatedRequestId}` : null,
    })),
    resumenTexto: `${rows.length} movimiento(s) de la cuenta.`,
  };
};

// caja_chica.reponer: registra un movimiento de "replenishment" (entrada de
// dinero). El backend solo crea el movimiento en el log append-only; el
// trigger SQL actualiza el currentBalance.
const cajaChicaReponerInput = z.object({
  id:           z.union([z.string(), z.number()]).optional(),
  cuenta:       z.string().optional(),
  // jul 2026 — Aceptamos aliases por si el GPT manda "cuentaId" o
  // "pettyCashId" (campos más semánticos). El backend los unifica
  // con `id`/`cuenta` antes de buscar la cuenta.
  cuentaId:     z.union([z.string(), z.number()]).optional(),
  pettyCashId:  z.union([z.string(), z.number()]).optional(),
  monto: z.coerce.number().positive().max(1000000),
  nota: z.string().min(3).max(280),
}).transform((d) => ({
  // Normalizamos: cuentaId/pettyCashId → id.
  id:     d.id     ?? d.cuentaId ?? d.pettyCashId,
  cuenta: d.cuenta ?? d.cuentaId ?? d.pettyCashId,
  monto:  d.monto,
  nota:   d.nota,
})).refine((d) => d.id !== undefined || d.cuenta !== undefined, {
  message: 'Falta "id" o "cuenta" (la cuenta a reponer)',
});

const cajaChicaReponer: OperationHandler = async (ctx, input) => {
  const parsed = cajaChicaReponerInput.parse(input);
  let accountId: number;
  const raw = parsed.cuenta ?? parsed.id;
  const m = String(raw).match(/^(?:petty-cash-)?(\d+)$/i);
  if (!m) throw new AppError(400, `ID de cuenta inválido: "${raw}"`);
  accountId = Number(m[1]);

  const [account] = await db.select()
    .from(companyPettyCashAccounts)
    .where(and(eq(companyPettyCashAccounts.id, accountId), eq(companyPettyCashAccounts.companyId, ctx.companyId)))
    .limit(1);
  if (!account) throw new NotFoundError('CajaChica', String(accountId));
  if (!account.isActive) throw new AppError(400, 'La cuenta de caja chica no está activa');

  // Necesitamos un actorUserId del sistema (no del API key). Usamos
  // un user cualquiera de la empresa como "system" o creamos un user
  // virtual. Por ahora, usar el owner.
  const [owner] = await db.select({ id: companyUsers.id })
    .from(companyUsers)
    .where(and(eq(companyUsers.companyId, ctx.companyId), eq(companyUsers.role, 'owner_empresa')))
    .limit(1);
  if (!owner) throw new AppError(400, 'La empresa no tiene un owner para registrar la reposición');

  const newBalance = Number(account.currentBalance) + parsed.monto;
  if (newBalance > Number(account.limitAmount)) {
    throw new AppError(400,
      `La reposición (${parsed.monto}) excede el límite de la cuenta. ` +
      `Saldo actual: ${Number(account.currentBalance).toFixed(2)}, límite: ${Number(account.limitAmount).toFixed(2)}. ` +
      `Saldo máximo permitido: ${(Number(account.limitAmount) - Number(account.currentBalance)).toFixed(2)}.`,
    );
  }

  // Insert directo en movements (el trigger actualiza currentBalance via
  // companyPettyCashAccounts). Si tu DB no tiene el trigger, hacer
  // update manual.
  const [movement] = await db.insert(companyPettyCashMovements).values({
    companyId: ctx.companyId,
    accountId,
    type: 'replenishment',
    amount: parsed.monto,
    balanceAfter: newBalance,
    actorUserId: owner.id,
    note: parsed.nota,
  }).returning();

  return {
    id: `petty-movement-${movement.id}`,
    cuentaId: `petty-cash-${accountId}`,
    tipo: 'replenishment',
    monto: parsed.monto,
    saldoDespues: newBalance,
    nota: parsed.nota,
    occurredAt: movement.occurredAt,
    resumenTexto: `Reposición de ${parsed.monto.toFixed(2)} USD registrada. Nuevo saldo: ${newBalance.toFixed(2)} USD.`,
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
  // Wrappeamos cada query en try/catch para que un fallo de UNA no rompa
  // el dashboard entero (ej. columna null en una fila legacy). Cada una
  // devuelve su default (array vacio) si falla, y el handler sigue.
  async function safe<T>(label: string, fn: () => Promise<T>, def: T): Promise<T> {
    try { return await fn(); } catch (err) {
      console.warn(`[dashboard] ${label} falló:`, (err as Error).message);
      return def;
    }
  }

  const [assetCounts, alertsOpen, maintToday, maintOverdue] = await Promise.all([
    safe('assetCounts', () => db.select({ status: companyAssets.status, n: count() })
      .from(companyAssets)
      .where(eq(companyAssets.companyId, ctx.companyId))
      .groupBy(companyAssets.status), []),
    safe('alertsOpen', () => db.select({ n: count() })
      .from(companyAlerts)
      .where(and(
        eq(companyAlerts.companyId, ctx.companyId),
        eq(companyAlerts.severity, 'Alta'),
        or(
          eq(companyAlerts.status, 'Abierta'),
          eq(companyAlerts.status, 'En progreso'),
          isNull(companyAlerts.status),
        )!,
      )), []),
    // checklists PENDIENTES con fecha <= hoy -> son los "vencidos" del
    // dia. Usamos `lte` en vez de template SQL DATE() para evitar
    // problemas de coerce entre drizzle y postgres cuando la columna
    // ya es tipo `date`.
    safe('maintToday', () => db.select({ n: count() })
      .from(companyChecklists)
      .where(and(
        eq(companyChecklists.companyId, ctx.companyId),
        eq(companyChecklists.status, 'Pendiente'),
        lte(companyChecklists.date, today),
      )), []),
    safe('maintOverdue', () => db.select({ n: count() })
      .from(companyChecklists)
      .where(and(
        eq(companyChecklists.companyId, ctx.companyId),
        eq(companyChecklists.status, 'Pendiente'),
        lt(companyChecklists.date, today),
      )), []),
  ]);

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
    checklistsVenc > 0 ? `${checklistsVenc} checklists pendientes con fecha pasada.` : ' Sin checklists atrasados.',
  ].join(',');

  return {
    vehiculosOperativos: vehOp,
    vehiculosEnMantenimiento: vehMant,
    vehiculosFueraDeServicio: vehFuera,
    alertasCriticasAbiertas: alertasCriticas,
    mantenimientosPendientesHoy: checklistsHoy,
    mantenimientosAtrasados: checklistsVenc,
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
  // jul 2026 v7 — companyFinanceRequests.createdAt es `timestamp`.
  // Pasamos Date object (drizzle llama .toISOString() internamente
  // y postgres.js NO acepta Date directo al wire, pero drizzle
  // formatea antes). Si pasaramos un string pelado, drizzle tira
  // "value.toISOString is not a function".
  const monthStartDate = new Date(`${today.slice(0, 7)}-01T00:00:00.000Z`);
  const todayDate = new Date(`${today}T23:59:59.999Z`);

  const [mes, porPurpose, porEstado] = await Promise.all([
    db.select({
      total: sql<string>`COALESCE(SUM(${companyFinanceRequests.amount}), 0)::text`,
      registros: count(),
    })
      .from(companyFinanceRequests)
      .where(and(
        eq(companyFinanceRequests.companyId, ctx.companyId),
        gte(companyFinanceRequests.createdAt, monthStartDate),
        lte(companyFinanceRequests.createdAt, todayDate),
      )),
    db.select({ purpose: companyFinanceRequests.purpose, total: sql<string>`COALESCE(SUM(${companyFinanceRequests.amount}), 0)::text` })
      .from(companyFinanceRequests)
      .where(and(
        eq(companyFinanceRequests.companyId, ctx.companyId),
        gte(companyFinanceRequests.createdAt, monthStartDate),
        lte(companyFinanceRequests.createdAt, todayDate),
      ))
      .groupBy(companyFinanceRequests.purpose),
    db.select({ status: companyFinanceRequests.status, n: count() })
      .from(companyFinanceRequests)
      .where(and(
        eq(companyFinanceRequests.companyId, ctx.companyId),
        gte(companyFinanceRequests.createdAt, monthStartDate),
        lte(companyFinanceRequests.createdAt, todayDate),
      ))
      .groupBy(companyFinanceRequests.status),
  ]);

  return {
    periodo: { desde: today.slice(0, 7) + '-01', hasta: today },
    total: Number(mes[0]?.total ?? 0),
    registros: mes[0]?.registros ?? 0,
    porProposito: porPurpose.map((r) => ({ proposito: r.purpose ?? 'sin_clasificar', total: Number(r.total) })),
    porEstado: porEstado.map((r) => ({ estado: r.status ?? 'desconocido', cantidad: r.n })),
    resumenTexto: `Mantenimiento del mes: $${Number(mes[0]?.total ?? 0).toFixed(2)} en ${mes[0]?.registros ?? 0} solicitud(es).`,
  };
};

const analyticsCombustible: OperationHandler = async (ctx) => {
  const today = todayYmdEc();
  // jul 2026 v7 — companyFuelEntries.date es `date` (NO `timestamp`).
  // Drizzle espera string YYYY-MM-DD en columnas `date`. Si pasamos
  // Date, drizzle llama .toISOString() → ISO 8601 → postgres lo
  // interpreta bien, pero no es lo más limpio. Para `date` usamos
  // string YYYY-MM-DD.
  const monthStartDate = `${today.slice(0, 7)}-01`;
  const todayDate = today;

  const [agg, porVehiculo, porEstacion] = await Promise.all([
    db.select({
      totalCost: sql<string>`COALESCE(SUM(${companyFuelEntries.cost}), 0)::text`,
      totalGallons: sql<string>`COALESCE(SUM(${companyFuelEntries.gallons}), 0)::text`,
      registros: count(),
    })
      .from(companyFuelEntries)
      .where(and(
        eq(companyFuelEntries.companyId, ctx.companyId),
        gte(companyFuelEntries.date, monthStartDate),
        lte(companyFuelEntries.date, todayDate),
      )),
    db.select({
      vehicleId: companyFuelEntries.assetId,
      totalCost: sql<string>`COALESCE(SUM(${companyFuelEntries.cost}), 0)::text`,
      totalGallons: sql<string>`COALESCE(SUM(${companyFuelEntries.gallons}), 0)::text`,
      cargas: count(),
    })
      .from(companyFuelEntries)
      .where(and(
        eq(companyFuelEntries.companyId, ctx.companyId),
        gte(companyFuelEntries.date, monthStartDate),
        lte(companyFuelEntries.date, todayDate),
      ))
      .groupBy(companyFuelEntries.assetId)
      .orderBy(desc(sql`SUM(${companyFuelEntries.cost})`))
      .limit(10),
    db.select({
      estacion: companyFuelEntries.station,
      totalCost: sql<string>`COALESCE(SUM(${companyFuelEntries.cost}), 0)::text`,
      cargas: count(),
    })
      .from(companyFuelEntries)
      .where(and(
        eq(companyFuelEntries.companyId, ctx.companyId),
        gte(companyFuelEntries.date, monthStartDate),
        lte(companyFuelEntries.date, todayDate),
      ))
      .groupBy(companyFuelEntries.station)
      .orderBy(desc(sql`SUM(${companyFuelEntries.cost})`))
      .limit(10),
  ]);

  const m = agg[0] ?? { totalCost: '0', totalGallons: '0', registros: 0 };
  return {
    periodo: { desde: today.slice(0, 7) + '-01', hasta: today },
    totalCosto: Number(m.totalCost),
    totalGalones: Number(m.totalGallons),
    registros: m.registros,
    topVehiculos: porVehiculo.map((r) => ({ vehicleId: r.vehicleId, totalCosto: Number(r.totalCost), totalGalones: Number(r.totalGallons), cargas: r.cargas })),
    topEstaciones: porEstacion.map((r) => ({ estacion: r.estacion ?? 'Sin estacion', totalCosto: Number(r.totalCost), cargas: r.cargas })),
    resumenTexto: `Combustible del mes: $${Number(m.totalCost).toFixed(2)} en ${m.registros} carga(s), ${Number(m.totalGallons).toFixed(1)} galones.`,
  };
};

// ── jul 2026 v2.2 — ops de análisis de cumplimiento ──────────────────

// Cumplimiento del conductor: % de checklists a tiempo, % de mantenimientos
// completados vs asignados, alertas activas que apuntan a él.
const conductoresCumplimiento: OperationHandler = async (ctx) => {
  const D30 = 30 * 24 * 60 * 60 * 1000;
  // jul 2026 v7 — companyChecklists.createdAt es `timestamp`.
  // Pasamos Date object (drizzle lo formatea a ISO antes del wire).
  const c30 = new Date(Date.now() - D30);

  const [total, conAsignacion, cumplieronA, tiempo, vencidos, alertas, porConductor] = await Promise.all([
    db.select({ n: count() }).from(companyDrivers).where(eq(companyDrivers.companyId, ctx.companyId)),
    db.select({ n: count() }).from(companyAssignments)
      .where(and(eq(companyAssignments.companyId, ctx.companyId), eq(companyAssignments.status, 'Activa'))),
    db.select({ n: count() }).from(companyChecklists)
      .where(and(
        eq(companyChecklists.companyId, ctx.companyId),
        eq(companyChecklists.status, 'Completado'),
        gte(companyChecklists.createdAt, c30),
      )),
    db.select({ n: count() }).from(companyChecklists)
      .where(and(
        eq(companyChecklists.companyId, ctx.companyId),
        eq(companyChecklists.status, 'Completado'),
        eq(companyChecklists.isLate, false),
        gte(companyChecklists.createdAt, c30),
      )),
    db.select({ n: count() }).from(companyChecklists)
      .where(and(
        eq(companyChecklists.companyId, ctx.companyId),
        eq(companyChecklists.status, 'Vencido'),
        gte(companyChecklists.createdAt, c30),
      )),
    db.select({ n: count() }).from(companyAlerts)
      .where(and(
        eq(companyAlerts.companyId, ctx.companyId),
        eq(companyAlerts.status, 'Activa'),
      )),
    // jul 2026 — Detalle por conductor. LEFT JOIN a companyChecklists
    // agrupado por driverId. Si el conductor no tiene checklists en el
    // período, lo listamos igual con totales en 0 para que el GPT
    // pueda presentar la tabla completa.
    db.select({
      driverId:        companyDrivers.id,
      driverFirst:     companyDrivers.firstName,
      driverLast:      companyDrivers.lastName,
      driverCode:      companyDrivers.code,
      driverStatus:    companyDrivers.status,
      total:           sql<number>`COUNT(${companyChecklists.id})::int`,
      aTiempo:         sql<number>`COUNT(${companyChecklists.id}) FILTER (WHERE ${companyChecklists.isLate} = false OR ${companyChecklists.isLate} IS NULL)::int`,
      vencidos:        sql<number>`COUNT(${companyChecklists.id}) FILTER (WHERE ${companyChecklists.status} = 'Vencido')::int`,
    })
    .from(companyDrivers)
    .leftJoin(companyChecklists, and(
      eq(companyChecklists.driverId, companyDrivers.id),
      eq(companyChecklists.companyId, ctx.companyId),
      gte(companyChecklists.createdAt, c30),
    ))
    .where(eq(companyDrivers.companyId, ctx.companyId))
    .groupBy(companyDrivers.id, companyDrivers.firstName, companyDrivers.lastName, companyDrivers.code, companyDrivers.status)
    .orderBy(sql`COUNT(${companyChecklists.id}) FILTER (WHERE ${companyChecklists.status} = 'Vencido') DESC NULLS LAST`)
    .limit(50),
  ]);

  const nTotal = Number(total[0]?.n ?? 0);
  const nAsignados = Number(conAsignacion[0]?.n ?? 0);
  const nA = Number(tiempo[0]?.n ?? 0);
  const nV = Number(vencidos[0]?.n ?? 0);
  const pctAsignados = nTotal > 0 ? Math.round((nAsignados / nTotal) * 100) : 0;
  const pctA = nA + nV > 0 ? Math.round((nA / (nA + nV)) * 100) : 100;

  // jul 2026 v3 — Pre-serializamos con JSON.stringify para que cualquier
  // valor no-string (Date, BigInt, NaN, Infinity) se convierta a string
  // ANTES de salir al wire. Sin esto, el wrapper de OpenAI Actions tira
  // "value.toISOString is not a function" o "Cannot convert undefined or
  // null to object" en algunos drivers de Node 24.
  const detallePorConductor = JSON.parse(JSON.stringify(
    porConductor.map((d) => ({
      id: toId('driver', d.driverId),
      nombre: [d.driverFirst, d.driverLast].filter(Boolean).join(' ') || '(sin nombre)',
      codigo: d.driverCode ?? null,
      estado: d.driverStatus ?? null,
      checklistsTotal:    Number(d.total)    || 0,
      checklistsATiempo:  Number(d.aTiempo)  || 0,
      checklistsVencidos: Number(d.vencidos) || 0,
      porcentajeCumplimiento: (Number(d.total) || 0) > 0
        ? Math.round((Number(d.aTiempo) / Number(d.total)) * 100)
        : null,
    })),
  ));

  const payload = {
    periodo: 'ultimos_30_dias',
    totales: {
      conductores: nTotal,
      conAsignacionActiva: nAsignados,
      sinAsignacion: Math.max(0, nTotal - nAsignados),
    },
    cumplimientoChecklists: {
      totalPeriodo: nA + nV,
      aTiempo: nA,
      vencidos: nV,
      porcentaje: pctA,
    },
    detallePorConductor,
    alertasActivas: Number(alertas[0]?.n ?? 0),
    coberturaAsignacion: pctAsignados,
    resumenTexto: `Cumplimiento de conductores: ${pctA}% checklists a tiempo (${nA} de ${nA + nV}), ${nAsignados}/${nTotal} con asignación activa.`,
  };

  // Pre-serializamos TODO el payload para forzar la conversión de
  // cualquier Date/BigInt raro a string antes de salir al wire.
  return JSON.parse(JSON.stringify(payload));
};

// Cumplimiento de checklists: total, a tiempo vs vencidos, % por categoría
// o por vehículo. Sirve para responder "como vamos con los checklists".
const checklistsCumplimiento: OperationHandler = async (ctx) => {
  const D30 = 30 * 24 * 60 * 60 * 1000;
  // jul 2026 v7 — companyChecklists.createdAt es `timestamp`.
  const c30 = new Date(Date.now() - D30);

  const [porStatus, vencidos30, total30, tarde30] = await Promise.all([
    db.select({ status: companyChecklists.status, n: count() })
      .from(companyChecklists)
      .where(and(
        eq(companyChecklists.companyId, ctx.companyId),
        gte(companyChecklists.createdAt, c30),
      ))
      .groupBy(companyChecklists.status),
    db.select({ n: count() })
      .from(companyChecklists)
      .where(and(
        eq(companyChecklists.companyId, ctx.companyId),
        eq(companyChecklists.status, 'Vencido'),
        gte(companyChecklists.createdAt, c30),
      )),
    db.select({ n: count() })
      .from(companyChecklists)
      .where(and(
        eq(companyChecklists.companyId, ctx.companyId),
        gte(companyChecklists.createdAt, c30),
      )),
    db.select({ n: count() })
      .from(companyChecklists)
      .where(and(
        eq(companyChecklists.companyId, ctx.companyId),
        eq(companyChecklists.isLate, true),
        gte(companyChecklists.createdAt, c30),
      )),
  ]);

  const nTotal = Number(total30[0]?.n ?? 0);
  const nVencidos = Number(vencidos30[0]?.n ?? 0);
  const nTarde = Number(tarde30[0]?.n ?? 0);
  const pctVencidos = nTotal > 0 ? Math.round((nVencidos / nTotal) * 100) : 0;
  const pctPuntual = nTotal > 0 ? Math.max(0, 100 - pctVencidos) : 100;

  return {
    periodo: 'ultimos_30_dias',
    total: nTotal,
    porEstado: porStatus.map((r) => ({ estado: r.status ?? 'desconocido', cantidad: r.n })),
    cumplidosATiempo: nTotal - nVencidos - nTarde,
    tardios: nTarde,
    vencidos: nVencidos,
    porcentajeCumplimiento: pctPuntual,
    resumenTexto: `Checklists: ${pctPuntual}% a tiempo en los últimos 30 días (${nVencidos} vencidos, ${nTarde} completados tarde).`,
  };
};

// Salud de TODOS los vehículos: lista scoreados, ordenados de peor a mejor.
// Permite que el LLM responda "que vehiculos necesitan atencion urgente".
const analyticsSaludVehiculos: OperationHandler = async (ctx) => {
  const { calidadVehiculo } = await import('../calidad-datos');

  const rows = await db
    .select({ id: companyAssets.id, code: companyAssets.code, name: companyAssets.name, status: companyAssets.status, assetType: companyAssets.assetType })
    .from(companyAssets)
    .where(eq(companyAssets.companyId, ctx.companyId))
    .orderBy(companyAssets.name);

  // Calculamos score en paralelo (con Promise.all, pero limitando a 20
  // simultaneas para no saturar la DB si hay 500 vehículos).
  const result: Array<{ id: number; code: string; name: string; score: number; estado: string; alertas: number }> = [];
  const batchSize = 20;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const scores = await Promise.all(batch.map(async (a) => {
      try {
        const c = await calidadVehiculo(ctx.companyId, a.id);
        const score = Number(c?.score ?? 0);
        const estado = score >= 80 ? 'bueno' : score >= 60 ? 'aceptable' : score >= 40 ? 'atencion' : 'critico';
        return { id: a.id, code: a.code ?? '', name: a.name ?? '', score, estado, alertas: 0 };
      } catch (innerErr) {
        // Si calidadVehiculo falla para UN vehiculo (ej. columna null en
        // una fila legacy), seguimos con los demas en vez de romper el
        // batch entero. Logueamos para que el operador lo vea.
        console.warn(`[analytics.salud_vehiculos] calidadVehiculo falló para asset ${a.id}:`, (innerErr as Error).message);
        return { id: a.id, code: a.code ?? '', name: a.name ?? '', score: 0, estado: 'critico' as const, alertas: 1 };
      }
    }));
    result.push(...scores);
  }

  result.sort((a, b) => a.score - b.score); // peores primero

  const enAtencion = result.filter((r) => r.score < 70).length;
  return {
    totalVehiculos: result.length,
    enAtencion,
    peores: result.slice(0, 5),
    mejores: result.slice(-5).reverse(),
    resumenTexto: `${result.length} vehículos evaluados. ${enAtencion} con salud <70 (atención).`,
  };
};

// Eficiencia de flota: costo por km, km por galón, comparativa entre
// vehículos. Esto le da al LLM la base para responder "que vehiculo
// es mas eficiente".
const analyticsEficienciaFlota: OperationHandler = async (ctx) => {
  const D90 = 90 * 24 * 60 * 60 * 1000;
  // jul 2026 v7 — Regla de tipos en drizzle:
  //   - Columna `timestamp`: Date object (drizzle llama .toISOString()
  //     internamente y manda ISO 8601 al wire de postgres.js).
  //   - Columna `date`: string YYYY-MM-DD (drizzle espera string,
  //     no Date — para esas columnas, mapToDriverValue NO llama
  //     .toISOString() sino que parsea el string).
  // Pasamos un Date base y derivamos los dos formatos.
  const c90Base = new Date(Date.now() - D90);
  const c90Ts   = c90Base;  // companyMaintenanceRecords.completedAt (timestamp)
  const c90Date = c90Base.toISOString().slice(0, 10); // companyFuelEntries.date / companyTollEntries.date (date)

  // Top 10 vehiculos por costo total en 90 días (mant + fuel + tolls)
  const [mntCost, fuelCost, tollCost, fuel] = await Promise.all([
    db.select({
      assetId: companyMaintenanceRecords.assetId,
      total: sql<string>`COALESCE(SUM(${companyMaintenanceRecords.totalCost}), 0)::text`,
    })
      .from(companyMaintenanceRecords)
      .where(and(
        eq(companyMaintenanceRecords.companyId, ctx.companyId),
        gte(companyMaintenanceRecords.completedAt, c90Ts),
      ))
      .groupBy(companyMaintenanceRecords.assetId),
    db.select({
      assetId: companyFuelEntries.assetId,
      total: sql<string>`COALESCE(SUM(${companyFuelEntries.cost}), 0)::text`,
      galones: sql<string>`COALESCE(SUM(${companyFuelEntries.gallons}), 0)::text`,
      km: sql<string>`COALESCE(SUM(${companyFuelEntries.odometer}), 0)::text`,
    })
      .from(companyFuelEntries)
      .where(and(
        eq(companyFuelEntries.companyId, ctx.companyId),
        gte(companyFuelEntries.date, c90Date),
      ))
      .groupBy(companyFuelEntries.assetId),
    db.select({
      assetId: companyTollEntries.assetId,
      total: sql<string>`COALESCE(SUM(${companyTollEntries.amount}), 0)::text`,
    })
      .from(companyTollEntries)
      .where(and(
        eq(companyTollEntries.companyId, ctx.companyId),
        gte(companyTollEntries.date, c90Date),
      ))
      .groupBy(companyTollEntries.assetId),
    db.select({
      assetId: companyFuelEntries.assetId,
      galones: sql<string>`COALESCE(SUM(${companyFuelEntries.gallons}), 0)::text`,
    })
      .from(companyFuelEntries)
      .where(and(
        eq(companyFuelEntries.companyId, ctx.companyId),
        gte(companyFuelEntries.date, c90Date),
      ))
      .groupBy(companyFuelEntries.assetId),
  ]);

  const mntMap = new Map<number, number>(mntCost.map((r) => [r.assetId ?? 0, Number(r.total)]));
  const fuelMap = new Map<number, number>(fuelCost.map((r) => [r.assetId ?? 0, Number(r.total)]));
  const tollMap = new Map<number, number>(tollCost.map((r) => [r.assetId ?? 0, Number(r.total)]));
  const galMap = new Map<number, number>(fuel.map((r) => [r.assetId ?? 0, Number(r.galones)]));

  const allIds = new Set<number>([...mntMap.keys(), ...fuelMap.keys(), ...tollMap.keys()].filter((k) => k > 0));
  const ranking = Array.from(allIds).map((id) => {
    const m = mntMap.get(id) ?? 0;
    const f = fuelMap.get(id) ?? 0;
    const t = tollMap.get(id) ?? 0;
    const g = galMap.get(id) ?? 0;
    const total = m + f + t;
    const kmPorGalon = g > 0 ? 35 / g : null; // heurística si no hay odometro
    return { id, mantenimiento: m, combustible: f, peajes: t, total, galones: g, kmPorGalonEstimado: kmPorGalon !== null ? Math.round(kmPorGalon * 10) / 10 : null };
  })
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const totalCosto = ranking.reduce((s, r) => s + r.total, 0);
  return {
    periodo: 'ultimos_90_dias',
    topCaros: ranking,
    costoTotalPeriodo: totalCosto,
    resumenTexto: `Eficiencia de flota: ${ranking.length} vehículos activos, costo total ${Math.round(totalCosto)} en 90 días.`,
  };
};

// ── jul 2026 v2.2 — Fase 4: comparación, riesgos, tendencias, recomendaciones ─

// Compara dos períodos lado a lado. Por defecto mes actual vs mes anterior.
// Devuelve deltas absolutos y porcentuales.
const analyticsComparacionPeriodo: OperationHandler = async (ctx) => {
  const today = todayYmdEc(); // "YYYY-MM-DD" string (para la respuesta)
  const [y, m] = today.split('-').map(Number);
  // jul 2026 v7 — drizzle: `date` cols = string YYYY-MM-DD,
  // `timestamp` cols = Date object.
  // companyFuelEntries.date → `date` → string
  // companyMaintenanceRecords.createdAt → `timestamp` → Date
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear  = m === 1 ? y - 1 : y;
  const thisMonthStartDate = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastMonthStartDate = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
  // último día del mes anterior = día 0 del mes actual
  const lastDayPrev = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  const lastMonthEndDate   = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDayPrev).padStart(2, '0')}`;
  // Versiones Date para columnas `timestamp`:
  const thisMonthStartTs   = new Date(`${thisMonthStartDate}T00:00:00.000Z`);
  const lastMonthStartTs   = new Date(`${lastMonthStartDate}T00:00:00.000Z`);
  const lastMonthEndTs     = new Date(`${lastMonthEndDate}T23:59:59.999Z`);

  const [thisFuel, lastFuel, thisMnt, lastMnt] = await Promise.all([
    db.select({
      total: sql<string>`COALESCE(SUM(${companyFuelEntries.cost}), 0)::text`,
      galones: sql<string>`COALESCE(SUM(${companyFuelEntries.gallons}), 0)::text`,
    })
      .from(companyFuelEntries)
      .where(and(
        eq(companyFuelEntries.companyId, ctx.companyId),
        gte(companyFuelEntries.date, thisMonthStartDate),
        lte(companyFuelEntries.date, today),
      )),
    db.select({
      total: sql<string>`COALESCE(SUM(${companyFuelEntries.cost}), 0)::text`,
      galones: sql<string>`COALESCE(SUM(${companyFuelEntries.gallons}), 0)::text`,
    })
      .from(companyFuelEntries)
      .where(and(
        eq(companyFuelEntries.companyId, ctx.companyId),
        gte(companyFuelEntries.date, lastMonthStartDate),
        lte(companyFuelEntries.date, lastMonthEndDate),
      )),
    db.select({
      total: sql<string>`COALESCE(SUM(${companyMaintenanceRecords.totalCost}), 0)::text`,
      registros: count(),
    })
      .from(companyMaintenanceRecords)
      .where(and(
        eq(companyMaintenanceRecords.companyId, ctx.companyId),
        // `createdAt` es `timestamp`: ISO 8601.
        gte(companyMaintenanceRecords.createdAt, thisMonthStartTs),
      )),
    db.select({
      total: sql<string>`COALESCE(SUM(${companyMaintenanceRecords.totalCost}), 0)::text`,
      registros: count(),
    })
      .from(companyMaintenanceRecords)
      .where(and(
        eq(companyMaintenanceRecords.companyId, ctx.companyId),
        // `createdAt` es `timestamp`: ISO 8601.
        gte(companyMaintenanceRecords.createdAt, lastMonthStartTs),
        lte(companyMaintenanceRecords.createdAt, lastMonthEndTs),
      )),
  ]);

  const build = (cur: { total: string; galones?: string; registros?: any }, prev: { total: string; galones?: string; registros?: any }, label: string) => {
    const c = Number(cur.total);
    const p = Number(prev.total);
    const delta = c - p;
    const pct = p > 0 ? Math.round((delta / p) * 100) : (c > 0 ? 100 : 0);
    return { label, estePeriodo: c, periodoAnterior: p, delta, variacionPorcentaje: pct };
  };

  return {
    periodos: { actual: { desde: thisMonthStartDate, hasta: today }, anterior: { desde: lastMonthStartDate, hasta: lastMonthEndDate } },
    combustible: build(thisFuel[0] ?? { total: '0', galones: '0' }, lastFuel[0] ?? { total: '0', galones: '0' }, 'combustible'),
    mantenimiento: build(thisMnt[0] ?? { total: '0', registros: 0 }, lastMnt[0] ?? { total: '0', registros: 0 }, 'mantenimiento'),
    resumenTexto: `Mes actual vs mes anterior: combustible ${Number(thisFuel[0]?.total ?? 0)} vs ${Number(lastFuel[0]?.total ?? 0)}, mantenimiento ${Number(thisMnt[0]?.total ?? 0)} vs ${Number(lastMnt[0]?.total ?? 0)}.`,
  };
};

// Top riesgos: anomalías activas + alertas críticas + vehículos con salud baja.
// Le da al LLM un único endpoint "que mirar primero" cuando el usuario
// pregunta "que esta pasando raro en mi operación".
const analyticsTopRiesgos: OperationHandler = async (ctx) => {
  const [alertas, anomalias, mantenimientosAtrasados, vehiculosMalEstado] = await Promise.all([
    db.select({ id: companyAlerts.id, titulo: companyAlerts.title, severidad: companyAlerts.severity, assetId: companyAlerts.assetId })
      .from(companyAlerts)
      .where(and(eq(companyAlerts.companyId, ctx.companyId), eq(companyAlerts.status, 'Activa')))
      .orderBy(desc(companyAlerts.severity), desc(companyAlerts.createdAt))
      .limit(10),
    db.select()
      .from(companyStatsAnomalies)
      .where(eq(companyStatsAnomalies.companyId, ctx.companyId))
      .orderBy(desc(companyStatsAnomalies.detectadoEn))
      .limit(5),
    db.select({ id: companyMaintenanceRecords.id, titulo: companyMaintenanceRecords.title, assetId: companyMaintenanceRecords.assetId })
      .from(companyMaintenanceRecords)
      .where(and(
        eq(companyMaintenanceRecords.companyId, ctx.companyId),
        lt(companyMaintenanceRecords.scheduledFor, todayYmdEc()),
        ne(companyMaintenanceRecords.status, 'Completado'),
        ne(companyMaintenanceRecords.status, 'Cancelado'),
      ))
      .limit(10),
    db.select({ id: companyAssets.id, name: companyAssets.name, code: companyAssets.code, status: companyAssets.status })
      .from(companyAssets)
      .where(and(eq(companyAssets.companyId, ctx.companyId), eq(companyAssets.status, 'Fuera de servicio')))
      .limit(10),
  ]);

  return {
    alertasCriticas: alertas,
    anomaliasRecientes: anomalias.map((a) => ({ id: a.id, modulo: a.modulo, tipo: a.tipo, dimension: a.dimension, severidad: a.severidad, descripcion: a.descripcion, detectadoEn: a.detectadoEn })),
    mantenimientosAtrasados,
    vehiculosFueraDeServicio: vehiculosMalEstado,
    resumenTexto: `Top riesgos: ${alertas.length} alertas críticas, ${anomalias.length} anomalías recientes, ${mantenimientosAtrasados.length} mantenimientos atrasados, ${vehiculosMalEstado.length} vehículos fuera de servicio.`,
  };
};

// Tendencias: serie de los últimos 6 meses para mantenimiento y combustible.
// Sirve para responder "vamos para arriba o para abajo en costos?".
const analyticsTendencias: OperationHandler = async (ctx) => {
  // jul 2026 v7 — drizzle: `date` cols = string YYYY-MM-DD,
  // `timestamp` cols = Date object.
  const months: { desdeTs: Date; hastaTs: Date; desdeDate: string; hastaDate: string; label: string }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    const lastDay = new Date(next.getTime() - 86400000);
    months.push({
      desdeTs:   d,                                                    // Date para timestamp
      hastaTs:   new Date(Date.UTC(lastDay.getUTCFullYear(), lastDay.getUTCMonth(), lastDay.getUTCDate(), 23, 59, 59, 999)),
      desdeDate: d.toISOString().slice(0, 10),                          // YYYY-MM-DD para date
      hastaDate: lastDay.toISOString().slice(0, 10),
      label:     d.toISOString().slice(0, 7),
    });
  }

  const serie = await Promise.all(months.map(async (m) => {
    const [mnt, fuel] = await Promise.all([
      db.select({ total: sql<string>`COALESCE(SUM(${companyMaintenanceRecords.totalCost}), 0)::text` })
        .from(companyMaintenanceRecords)
        .where(and(
          eq(companyMaintenanceRecords.companyId, ctx.companyId),
          gte(companyMaintenanceRecords.createdAt, m.desdeTs),
          lte(companyMaintenanceRecords.createdAt, m.hastaTs),
        )),
      db.select({ total: sql<string>`COALESCE(SUM(${companyFuelEntries.cost}), 0)::text` })
        .from(companyFuelEntries)
        .where(and(
          eq(companyFuelEntries.companyId, ctx.companyId),
          gte(companyFuelEntries.date, m.desdeDate),
          lte(companyFuelEntries.date, m.hastaDate),
        )),
    ]);
    return { mes: m.label, mantenimiento: Number(mnt[0]?.total ?? 0), combustible: Number(fuel[0]?.total ?? 0) };
  }));

  // Tendencia simple: comparar últimos 3 meses con los 3 anteriores
  const half = Math.floor(serie.length / 2);
  const reciente = serie.slice(half).reduce((s, r) => s + r.mantenimiento + r.combustible, 0);
  const anterior = serie.slice(0, half).reduce((s, r) => s + r.mantenimiento + r.combustible, 0);
  const variacion = anterior > 0 ? Math.round(((reciente - anterior) / anterior) * 100) : 0;
  const direccion = variacion > 5 ? 'subiendo' : variacion < -5 ? 'bajando' : 'estable';

  return {
    serie,
    variacion3Meses: { reciente, anterior, porcentaje: variacion, direccion },
    resumenTexto: `Tendencia 6 meses: ${direccion} (${variacion > 0 ? '+' : ''}${variacion}% últimos 3 vs anteriores 3).`,
  };
};

// Recomendaciones: top 5 sugerencias accionables basadas en el estado
// actual. Heurísticas: vehículos Fuera de Servicio sin nota de retorno,
// mantenimientos atrasados >7 días, conductores sin checklist hoy, etc.
const analyticsRecomendaciones: OperationHandler = async (ctx) => {
  const today = todayYmdEc();
  const D7 = 7 * 24 * 60 * 60 * 1000;
  // jul 2026 v7 — companyMaintenanceRecords.scheduledFor es `timestamp` → Date object.
  const c7 = new Date(Date.now() - D7);
  const todayDate = new Date(today + 'T00:00:00.000Z');

  const [fsin, atrasados, sinAsignar, alertasCrit] = await Promise.all([
    db.select({ id: companyAssets.id, name: companyAssets.name, code: companyAssets.code, updatedAt: companyAssets.updatedAt })
      .from(companyAssets)
      .where(and(eq(companyAssets.companyId, ctx.companyId), eq(companyAssets.status, 'Fuera de servicio')))
      .limit(20),
    db.select({ id: companyMaintenanceRecords.id, titulo: companyMaintenanceRecords.title, scheduledFor: companyMaintenanceRecords.scheduledFor, assetId: companyMaintenanceRecords.assetId })
      .from(companyMaintenanceRecords)
      .where(and(
        eq(companyMaintenanceRecords.companyId, ctx.companyId),
        lt(companyMaintenanceRecords.scheduledFor, todayDate),
        ne(companyMaintenanceRecords.status, 'Completado'),
        ne(companyMaintenanceRecords.status, 'Cancelado'),
      ))
      .limit(20),
    db.select({ n: count() })
      .from(companyAssets)
      .where(and(eq(companyAssets.companyId, ctx.companyId), eq(companyAssets.status, 'Operativo'), isNull(companyAssets.id))),
    db.select({ n: count() })
      .from(companyAlerts)
      .where(and(
        eq(companyAlerts.companyId, ctx.companyId),
        or(
          eq(companyAlerts.status, 'Abierta'),
          eq(companyAlerts.status, 'En progreso'),
          isNull(companyAlerts.status),
        )!,
        or(
          eq(companyAlerts.severity, 'Alta'),
          eq(companyAlerts.severity, 'Critica'),
        )!,
      )),
  ]);

  const recomendaciones: { prioridad: number; accion: string; detalle: string }[] = [];

  if (fsin.length > 0) {
    recomendaciones.push({
      prioridad: 1,
      accion: 'Revisar vehículos fuera de servicio',
      detalle: `${fsin.length} vehículo(s) en estado "Fuera de servicio". Verificar si ya pueden volver a operación o asignar a taller.`,
    });
  }
  if (atrasados.length > 0) {
    recomendaciones.push({
      prioridad: 2,
      accion: 'Resolver mantenimientos atrasados',
      detalle: `${atrasados.length} mantenimiento(s) con fecha vencida. Reprogramar o cancelar.`,
    });
  }
  if (Number(alertasCrit[0]?.n ?? 0) > 0) {
    recomendaciones.push({
      prioridad: 3,
      accion: 'Atender alertas críticas/altas',
      detalle: `${alertasCrit[0]?.n} alerta(s) activa(s) de severidad alta o crítica.`,
    });
  }

  return {
    total: recomendaciones.length,
    recomendaciones: recomendaciones.sort((a, b) => a.prioridad - b.prioridad).slice(0, 5),
    resumenTexto: `${recomendaciones.length} acción(es) recomendada(s) para hoy.`,
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
  // jul 2026 v7 — aiApiLogs.createdAt es `timestamp` → Date object.
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
  registerOperation({ modulo: 'caja_chica', operacion: 'detalle', scope: 'read',
    summary: 'Detalle de una cuenta de caja chica con estadisticas del periodo',
    inputSchema: cajaChicaDetalleInput, handler: cajaChicaDetalle });
  registerOperation({ modulo: 'caja_chica', operacion: 'movimientos', scope: 'read',
    summary: 'Movimientos (append-only) de una cuenta de caja chica',
    inputSchema: cajaChicaMovimientosInput, handler: cajaChicaMovimientos });
  registerOperation({ modulo: 'caja_chica', operacion: 'reponer', scope: 'write',
    summary: 'Registra una reposicion de dinero en una cuenta de caja chica',
    inputSchema: cajaChicaReponerInput, handler: cajaChicaReponer });
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

  // jul 2026 v2.2 — Ops de análisis y cumplimiento
  registerOperation({ modulo: 'conductores', operacion: 'cumplimiento', scope: 'read',
    summary: 'Cumplimiento agregado de conductores (asignaciones, checklists a tiempo)',
    inputSchema: z.object({}), handler: conductoresCumplimiento });
  registerOperation({ modulo: 'checklists', operacion: 'cumplimiento', scope: 'read',
    summary: 'Cumplimiento de checklists del periodo (% a tiempo vs vencidos)',
    inputSchema: z.object({}), handler: checklistsCumplimiento });
  registerOperation({ modulo: 'analytics', operacion: 'salud_vehiculos', scope: 'read',
    summary: 'Score 0-100 de salud para TODOS los vehículos, ordenado de peor a mejor',
    inputSchema: z.object({}), handler: analyticsSaludVehiculos });
  registerOperation({ modulo: 'analytics', operacion: 'eficiencia_flota', scope: 'read',
    summary: 'Eficiencia de flota: costos por vehiculo y km/galon estimado',
    inputSchema: z.object({}), handler: analyticsEficienciaFlota });

  // jul 2026 v2.2 — Fase 4
  registerOperation({ modulo: 'analytics', operacion: 'comparacion_periodo', scope: 'read',
    summary: 'Comparacion del mes actual vs mes anterior (combustible y mantenimiento)',
    inputSchema: z.object({}), handler: analyticsComparacionPeriodo });
  registerOperation({ modulo: 'analytics', operacion: 'top_riesgos', scope: 'read',
    summary: 'Top riesgos activos: alertas criticas, anomalias, mantenimientos atrasados, FS',
    inputSchema: z.object({}), handler: analyticsTopRiesgos });
  registerOperation({ modulo: 'analytics', operacion: 'tendencias', scope: 'read',
    summary: 'Serie de 6 meses de mantenimiento y combustible con variacion',
    inputSchema: z.object({}), handler: analyticsTendencias });
  registerOperation({ modulo: 'analytics', operacion: 'recomendaciones', scope: 'read',
    summary: 'Top 5 acciones recomendadas para hoy basadas en el estado actual',
    inputSchema: z.object({}), handler: analyticsRecomendaciones });
}
