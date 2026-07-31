// routes/ai-api/ops/vehiculos.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 — Operaciones de vehículos registradas para el router.
// ─────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { and, desc, eq, isNull, or, sql, count } from 'drizzle-orm';
import { db } from '../../../db/client';
import {
  companyAssets, companyAlerts, companyMaintenanceRecords,
  companyFuelEntries, companyTollEntries, assetNotes,
  companyOdometerReadings,
} from '../../../db/schema/operational';
import {
  registerOperation, type OperationHandler,
} from '../router';
import {
  resolveAsset, parseEntityId,
} from '../shared';
import { AppError, NotFoundError } from '../../../lib/errors';

// ── LISTA ────────────────────────────────────────────────────────────
const listFiltros = z.object({
  estado: z.enum(['Operativo', 'En mantenimiento', 'Fuera de servicio']).optional(),
  busqueda: z.string().max(80).optional(),
});

const lista: OperationHandler = async (ctx, input) => {
  const filtros = listFiltros.parse(input);
  const conds = [eq(companyAssets.companyId, ctx.companyId)];
  if (filtros.estado) conds.push(eq(companyAssets.status, filtros.estado));
  if (filtros.busqueda) {
    const q = `%${filtros.busqueda}%`;
    conds.push(
      or(
        sql`${companyAssets.code} ILIKE ${q}`,
        sql`${companyAssets.name} ILIKE ${q}`,
        sql`${companyAssets.plate} ILIKE ${q}`,
      )!,
    );
  }
  const rows = await db.select({
    id: companyAssets.id, code: companyAssets.code, name: companyAssets.name,
    plate: companyAssets.plate, status: companyAssets.status,
    brand: companyAssets.brand, model: companyAssets.model, year: companyAssets.year,
  })
    .from(companyAssets)
    .where(and(...conds))
    .orderBy(companyAssets.name)
    .limit(200);

  return {
    total: rows.length,
    vehiculos: rows.map((r) => ({
      id: `vehicle-${r.id}`, nombre: r.name, codigo: r.code, placa: r.plate,
      estado: r.status, marca: r.brand, modelo: r.model, anio: r.year,
    })),
  };
};

// ── DETALLE ──────────────────────────────────────────────────────────
const detalleInput = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  vehiculo: z.string().optional(),
}).refine((d) => d.id !== undefined || d.vehiculo !== undefined, {
  message: 'Falta "id" o "vehiculo"',
});

const detalle: OperationHandler = async (ctx, input) => {
  const parsed = detalleInput.parse(input);
  let idNum: number;
  if (parsed.vehiculo) {
    idNum = (await resolveAsset(ctx.companyId, parsed.vehiculo)).id;
  } else {
    idNum = parseEntityId(parsed.id, 'vehicle');
  }

  const [asset] = await db.select().from(companyAssets)
    .where(and(eq(companyAssets.id, idNum), eq(companyAssets.companyId, ctx.companyId)))
    .limit(1);
  if (!asset) throw new NotFoundError('Vehículo', String(parsed.id ?? parsed.vehiculo));

  const [alertas, proxMaint, ultCarga] = await Promise.all([
    db.select({ id: companyAlerts.id, title: companyAlerts.title, severity: companyAlerts.severity, status: companyAlerts.status })
      .from(companyAlerts)
      .where(and(
        eq(companyAlerts.companyId, ctx.companyId),
        eq(companyAlerts.assetId, idNum),
        or(
          eq(companyAlerts.status, 'Abierta'),
          eq(companyAlerts.status, 'En progreso'),
          isNull(companyAlerts.status),
        )!,
      ))
      .orderBy(desc(companyAlerts.createdAt))
      .limit(10),
    db.select({ id: companyMaintenanceRecords.id, title: companyMaintenanceRecords.title,
                category: companyMaintenanceRecords.category, status: companyMaintenanceRecords.status,
                scheduledFor: companyMaintenanceRecords.scheduledFor })
      .from(companyMaintenanceRecords)
      .where(and(
        eq(companyMaintenanceRecords.companyId, ctx.companyId),
        eq(companyMaintenanceRecords.assetId, idNum),
        eq(companyMaintenanceRecords.status, 'Programado'),
      ))
      .orderBy(companyMaintenanceRecords.scheduledFor)
      .limit(1),
    db.select({ date: companyFuelEntries.date, gallons: companyFuelEntries.gallons,
                cost: companyFuelEntries.cost, odometer: companyFuelEntries.odometer })
      .from(companyFuelEntries)
      .where(and(
        eq(companyFuelEntries.companyId, ctx.companyId),
        eq(companyFuelEntries.assetId, idNum),
      ))
      .orderBy(desc(companyFuelEntries.date))
      .limit(1),
  ]);

  return {
    id: `vehicle-${asset.id}`,
    nombre: asset.name, codigo: asset.code, placa: asset.plate,
    estado: asset.status, marca: asset.brand, modelo: asset.model, anio: asset.year,
    color: asset.color,
    kmActual: ultCarga[0] ? Number(ultCarga[0].odometer ?? 0) : null,
    alertasActivas: alertas.map((a) => ({
      id: `alert-${a.id}`, titulo: a.title, severidad: a.severidad, status: a.status,
    })),
    proximoMantenimiento: proxMaint[0] ? {
      id: `maintenance-${proxMaint[0].id}`,
      titulo: proxMaint[0].title ?? proxMaint[0].category,
      categoria: proxMaint[0].category, fecha: proxMaint[0].scheduledFor,
    } : null,
    ultimaCargaCombustible: ultCarga[0] ? {
      fecha: ultCarga[0].date,
      galones: Number(ultCarga[0].gallons ?? 0),
      costo: Number(ultCarga[0].cost ?? 0),
      odometro: Number(ultCarga[0].odometer ?? 0),
    } : null,
  };
};

// ── CREAR ─────────────────────────────────────────────────────────────
const crearInput = z.object({
  nombre: z.string().min(2).max(160),
  codigo: z.string().min(1).max(40),
  placa: z.string().max(40).optional(),
  anio: z.string().max(10).optional(),
  marca: z.string().max(120).optional(),
  modelo: z.string().max(120).optional(),
  color: z.string().max(60).optional(),
  assetType: z.enum(['Vehiculo', 'Maquinaria', 'Equipo']).default('Vehiculo'),
  fuelType: z.enum(['Gasolina', 'Diesel', 'Electrico', 'Hibrido', 'Gas']).optional(),
  responsible: z.string().max(160).optional(),
});

const crear: OperationHandler = async (ctx, input) => {
  const body = crearInput.parse(input);

  const [existing] = await db.select({ id: companyAssets.id })
    .from(companyAssets)
    .where(and(
      eq(companyAssets.companyId, ctx.companyId),
      eq(companyAssets.code, body.codigo),
    ))
    .limit(1);
  if (existing) {
    throw new AppError(409, `Ya existe un vehículo con código "${body.codigo}"`);
  }

  const [created] = await db.insert(companyAssets).values({
    companyId: ctx.companyId,
    name: body.nombre,
    code: body.codigo,
    plate: body.placa ?? null,
    year: body.anio ?? null,
    brand: body.marca ?? null,
    model: body.modelo ?? null,
    color: body.color ?? null,
    assetType: body.assetType,
    fuelType: body.fuelType,
    responsible: body.responsible ?? null,
    status: 'Operativo',
    photoUrls: [],
  }).returning();

  return {
    id: `vehicle-${created.id}`,
    nombre: created.name,
    codigo: created.code,
    placa: created.plate,
    estado: created.status,
    resumenTexto: `Vehículo "${created.name}" creado en estado Operativo.`,
  };
};

// ─- ESTADO (PATCH) ───────────────────────────────────────────────────
const estadoInput = z.object({
  id: z.union([z.string(), z.number()]),
  estado: z.enum(['Operativo', 'En mantenimiento', 'Fuera de servicio']),
  motivo: z.string().max(500).optional(),
});

const estado: OperationHandler = async (ctx, input) => {
  const body = estadoInput.parse(input);
  const idNum = parseEntityId(body.id, 'vehicle');

  const [existing] = await db.select({ id: companyAssets.id, status: companyAssets.status })
    .from(companyAssets)
    .where(and(eq(companyAssets.id, idNum), eq(companyAssets.companyId, ctx.companyId)))
    .limit(1);
  if (!existing) throw new NotFoundError('Vehículo', String(body.id));

  const [updated] = await db.update(companyAssets)
    .set({ status: body.estado, updatedAt: new Date() })
    .where(eq(companyAssets.id, idNum))
    .returning({ id: companyAssets.id, name: companyAssets.name, status: companyAssets.status });

  if (body.estado === 'Operativo') {
    await db.update(companyAssets)
      .set({ statusBeforeMaintenance: null })
      .where(eq(companyAssets.id, idNum));
  }

  return {
    id: `vehicle-${updated!.id}`,
    nombre: updated!.name,
    estadoAnterior: existing.status,
    estadoNuevo: updated!.status,
    motivo: body.motivo ?? null,
    resumenTexto: `Vehículo "${updated!.name}" cambió de "${existing.status}" a "${updated!.status}".${body.motivo ? ` Motivo: ${body.motivo}.` : ''}`,
  };
};

// ── NOTA (POST) ──────────────────────────────────────────────────────
const notaInput = z.object({
  id: z.union([z.string(), z.number()]),
  texto: z.string().min(3).max(2000),
});

const nota: OperationHandler = async (ctx, input) => {
  const body = notaInput.parse(input);
  const idNum = parseEntityId(body.id, 'vehicle');

  const [asset] = await db.select({ id: companyAssets.id, name: companyAssets.name })
    .from(companyAssets)
    .where(and(eq(companyAssets.id, idNum), eq(companyAssets.companyId, ctx.companyId)))
    .limit(1);
  if (!asset) throw new NotFoundError('Vehículo', String(body.id));

  const [created] = await db.insert(assetNotes).values({
    companyId: ctx.companyId,
    assetId: idNum,
    authorName: 'AI Assistant',
    body: body.texto,
  }).returning();

  return {
    id: `note-${created.id}`,
    vehiculo: asset.name,
    texto: created.body,
    autor: created.authorName,
    fecha: created.createdAt,
    resumenTexto: `Nota agregada al vehículo "${asset.name}".`,
  };
};

// ── ODÓMETRO (POST) ──────────────────────────────────────────────────
const odometroInput = z.object({
  id: z.union([z.string(), z.number()]),
  km: z.coerce.number().int().min(0).max(9_999_999),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  source: z.enum(['manual', 'gps']).default('manual'),
});

const odometro: OperationHandler = async (ctx, input) => {
  const body = odometroInput.parse(input);
  const idNum = parseEntityId(body.id, 'vehicle');

  const [asset] = await db.select({ id: companyAssets.id, name: companyAssets.name })
    .from(companyAssets)
    .where(and(eq(companyAssets.id, idNum), eq(companyAssets.companyId, ctx.companyId)))
    .limit(1);
  if (!asset) throw new NotFoundError('Vehículo', String(body.id));

  const [created] = await db.insert(companyOdometerReadings).values({
    companyId: ctx.companyId,
    assetId: idNum,
    km: body.km,
    source: body.source,
    takenAt: body.fecha ? new Date(`${body.fecha}T12:00:00Z`) : new Date(),
  }).returning();

  return {
    id: `odometer-${created.id}`,
    vehiculo: asset.name,
    km: Number(created.km),
    fecha: created.takenAt,
    source: created.source,
    resumenTexto: `Odómetro de "${asset.name}" actualizado a ${body.km} km.`,
  };
};

// ── COSTOS (GET) ─────────────────────────────────────────────────────
const costosInput = z.object({
  id: z.union([z.string(), z.number()]),
});

const costos: OperationHandler = async (ctx, input) => {
  const body = costosInput.parse(input);
  const idNum = parseEntityId(body.id, 'vehicle');

  const [asset] = await db.select({ id: companyAssets.id, name: companyAssets.name })
    .from(companyAssets)
    .where(and(eq(companyAssets.id, idNum), eq(companyAssets.companyId, ctx.companyId)))
    .limit(1);
  if (!asset) throw new NotFoundError('Vehículo', String(body.id));

  const [mant, fuel, toll] = await Promise.all([
    db.select({ totalCost: sql<string>`COALESCE(SUM(${companyMaintenanceRecords.totalCost}), 0)::text`, count: count() })
      .from(companyMaintenanceRecords)
      .where(and(
        eq(companyMaintenanceRecords.companyId, ctx.companyId),
        eq(companyMaintenanceRecords.assetId, idNum),
        eq(companyMaintenanceRecords.status, 'Completado'),
      )),
    db.select({ totalCost: sql<string>`COALESCE(SUM(${companyFuelEntries.cost}), 0)::text`, count: count() })
      .from(companyFuelEntries)
      .where(and(
        eq(companyFuelEntries.companyId, ctx.companyId),
        eq(companyFuelEntries.assetId, idNum),
      )),
    db.select({ totalCost: sql<string>`COALESCE(SUM(${companyTollEntries.amount}), 0)::text`, count: count() })
      .from(companyTollEntries)
      .where(and(
        eq(companyTollEntries.companyId, ctx.companyId),
        eq(companyTollEntries.assetId, idNum),
      )),
  ]);

  const m = mant[0] ?? { totalCost: '0', count: 0 };
  const f = fuel[0] ?? { totalCost: '0', count: 0 };
  const t = toll[0] ?? { totalCost: '0', count: 0 };
  const total = Number(m.totalCost) + Number(f.totalCost) + Number(t.totalCost);

  return {
    vehiculo: asset.name,
    mantenimiento: { total: Number(m.totalCost), registros: m.count },
    combustible:  { total: Number(f.totalCost), registros: f.count },
    peajes:       { total: Number(t.totalCost), registros: t.count },
    total,
    resumenTexto: `Costos totales de "${asset.name}": $${total.toFixed(2)} (mantenimiento $${Number(m.totalCost).toFixed(2)}, combustible $${Number(f.totalCost).toFixed(2)}, peajes $${Number(t.totalCost).toFixed(2)}).`,
  };
};

// ── UBICACIÓN (GET) ──────────────────────────────────────────────────
const ubicacionInput = z.object({
  id: z.union([z.string(), z.number()]),
});

const ubicacion: OperationHandler = async (ctx, input) => {
  const body = ubicacionInput.parse(input);
  const idNum = parseEntityId(body.id, 'vehicle');

  const [asset] = await db.select({
    id: companyAssets.id, name: companyAssets.name,
    lastLat: companyAssets.lastLat, lastLng: companyAssets.lastLng,
    lastGpsAt: companyAssets.lastGpsAt,
    engineOn: companyAssets.engineOn, locked: companyAssets.locked,
  })
    .from(companyAssets)
    .where(and(eq(companyAssets.id, idNum), eq(companyAssets.companyId, ctx.companyId)))
    .limit(1);
  if (!asset) throw new NotFoundError('Vehículo', String(body.id));

  if (asset.lastLat == null || asset.lastLng == null) {
    return {
      vehiculo: asset.name,
      tieneGps: false,
      mensaje: `${asset.name} no tiene ubicación GPS registrada.`,
    };
  }

  return {
    vehiculo: asset.name,
    tieneGps: true,
    latitud: asset.lastLat,
    longitud: asset.lastLng,
    ultimaActualizacion: asset.lastGpsAt,
    motorEncendido: asset.engineOn ?? false,
    bloqueado: asset.locked ?? false,
    resumenTexto: `${asset.name} está en lat ${asset.lastLat.toFixed(4)}, lng ${asset.lastLng.toFixed(4)} (última actualización: ${asset.lastGpsAt?.toISOString() ?? 'desconocida'}).`,
  };
};

// ── ELIMINAR (soft-delete) ───────────────────────────────────────────
const eliminarInput = z.object({
  id: z.union([z.string(), z.number()]),
  confirmar: z.literal(true),
});

const eliminar: OperationHandler = async (ctx, input) => {
  const body = eliminarInput.parse(input);
  const idNum = parseEntityId(body.id, 'vehicle');

  const [asset] = await db.select({ id: companyAssets.id, name: companyAssets.name })
    .from(companyAssets)
    .where(and(eq(companyAssets.id, idNum), eq(companyAssets.companyId, ctx.companyId)))
    .limit(1);
  if (!asset) throw new NotFoundError('Vehículo', String(body.id));

  await db.update(companyAssets)
    .set({
      status: 'Fuera de servicio',
      notes: `[BAJA por AI] ${new Date().toISOString()} — confirmado por API Key`,
      updatedAt: new Date(),
    })
    .where(eq(companyAssets.id, idNum));

  return {
    id: `vehicle-${idNum}`,
    nombre: asset.name,
    mensaje: `Vehículo "${asset.name}" marcado como Fuera de servicio. Esta acción es reversible cambiando el estado manualmente.`,
    resumenTexto: `Vehículo "${asset.name}" dado de baja (soft-delete).`,
  };
};

// ── REGISTRO ──────────────────────────────────────────────────────────
export function registerVehiculosOps() {
  registerOperation({
    modulo: 'vehiculos', operacion: 'lista', scope: 'read',
    summary: 'Lista de vehiculos (filtrable por estado y busqueda)',
    inputSchema: listFiltros, handler: lista,
  });
  registerOperation({
    modulo: 'vehiculos', operacion: 'detalle', scope: 'read',
    summary: 'Detalle completo de un vehiculo (alertas, mantenimiento, combustible)',
    inputSchema: detalleInput, handler: detalle,
  });
  registerOperation({
    modulo: 'vehiculos', operacion: 'crear', scope: 'write',
    summary: 'Crea un vehiculo',
    inputSchema: crearInput, handler: crear,
  });
  registerOperation({
    modulo: 'vehiculos', operacion: 'estado', scope: 'write',
    summary: 'Cambia el estado de un vehiculo (Operativo / En mantenimiento / Fuera de servicio)',
    inputSchema: estadoInput, handler: estado,
  });
  registerOperation({
    modulo: 'vehiculos', operacion: 'nota', scope: 'write',
    summary: 'Agrega una nota libre al vehiculo',
    inputSchema: notaInput, handler: nota,
  });
  registerOperation({
    modulo: 'vehiculos', operacion: 'odometro', scope: 'write',
    summary: 'Registra una lectura de odometro',
    inputSchema: odometroInput, handler: odometro,
  });
  registerOperation({
    modulo: 'vehiculos', operacion: 'costos', scope: 'read',
    summary: 'Costos totales del vehiculo (mantenimiento + combustible + peajes)',
    inputSchema: costosInput, handler: costos,
  });
  registerOperation({
    modulo: 'vehiculos', operacion: 'ubicacion', scope: 'read',
    summary: 'Ultima posicion GPS del vehiculo',
    inputSchema: ubicacionInput, handler: ubicacion,
  });
  registerOperation({
    modulo: 'vehiculos', operacion: 'eliminar', scope: 'write',
    summary: 'Soft-delete del vehiculo (marca Fuera de servicio). REQUIERE confirmar=true',
    inputSchema: eliminarInput, handler: eliminar,
  });
}
