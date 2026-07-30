// lib/ai/tools/vehiculos.ts
//
// MÓDULO FLOTA (vehiculos) — Tools del catálogo consolidado.
// Patrón: cada tool es lectura pura (no escribe). Usa Drizzle ORM con
// el empresaId inyectado del JWT (nunca del LLM).
//
// Tools implementadas (jul 2026 v8.5 — v2 catálogo completo):
//   - getVehiculos          (existente)
//   - getVehicleById
//   - listVehiclesBySite
//   - listVehiclesByGarage
//   - listVehiclesByType
//   - listVehiclesByFuelType
//   - getVehicleOdometerHistory
//   - getVehicleLatestOdometer
//   - getVehicleNotes
//   - getVehicleRoutes
//   - listVehicleStatusHistory
//   - listVehiclesNeedingOilChange
//   - getVehicleFullProfile
//   - getMostExpensiveVehicles
//   - listVehiclesWithoutRecentChecklist
//   - listVehiclesWithoutRecentMaintenance
//   - getFleetUtilization
//   - getFleetAgeDistribution
//   - getVehicleTCO
//   - getVehicleScorecard
//   - listVehiclesWithExpiringInsurance
//   - getVehicleSpendBreakdown

import { z } from 'zod';
import { and, eq, ilike, inArray, sql, desc, asc, gte, lte, isNotNull, isNull } from 'drizzle-orm';
import { db } from '../../../db/client';
import {
  companyAssets,
  companySites,
  companyGarages,
  companyOdometerReadings,
  companyAssignments,
  companyMaintenanceRecords,
  companyFuelEntries,
  companyTollEntries,
  companyInsurancePolicies,
  assetNotes,
  assetRoutes,
  companyAuditEntries,
  companyChecklists,
  companyOilChanges,
} from '../../../db/schema/operational';
import type { ToolDefinition, ToolResult } from './registry';
import { tolerantString, tolerantAssetId, tolerantNumber, tolerantDateString, enumOrList } from '../schema-helpers';

// ─── ENUMs y sinónimos (compartidos por varias tools) ────────────────

const ASSET_STATUS = ['Operativo', 'En mantenimiento', 'Fuera de servicio'] as const;
type AssetStatus = (typeof ASSET_STATUS)[number];

const STATUS_SYNONYMS: Record<string, AssetStatus> = {
  'disponible':  'Operativo',
  'disponibles': 'Operativo',
  'libre':       'Operativo',
  'libres':      'Operativo',
  'en uso':      'Operativo',
  'ocupado':     'Operativo',
  'ocupados':    'Operativo',
  'fuera':       'Fuera de servicio',
  'fuera de servicio': 'Fuera de servicio',
  'fuera de servicios': 'Fuera de servicio',
  'fuera de uso': 'Fuera de servicio',
  'no disponible': 'Fuera de servicio',
  'no disponibles': 'Fuera de servicio',
  'en mantenimiento': 'En mantenimiento',
  'mantenimiento':  'En mantenimiento',
  'taller':        'En mantenimiento',
  'operativo':     'Operativo',
  'operativos':    'Operativo',
  'activo':        'Operativo',
  'activos':       'Operativo',
};

function normalizeEstado(raw: string): AssetStatus | null {
  const k = raw.trim().toLowerCase();
  if ((ASSET_STATUS as readonly string[]).map(s => s.toLowerCase()).includes(k)) {
    return raw as AssetStatus;
  }
  return STATUS_SYNONYMS[k] ?? null;
}

const ASSET_TYPES = ['Vehiculo', 'Motor', 'Maquinaria', 'Planta electrica'] as const;
const FUEL_TYPES = ['Diesel', 'Gasolina', 'Electrico', 'Hibrido'] as const;

// ──────────────────────────────────────────────────────────────────────
// 1. getVehiculos (existente — base para todas las demás)
// ──────────────────────────────────────────────────────────────────────

const argsGetVehiculos = z.object({
  estado:  z.string().optional(),
  placa:   tolerantString().optional(),
  marca:   tolerantString().optional(),
  assetType: z.enum(ASSET_TYPES).optional(),
  fuelType:  z.enum(FUEL_TYPES).optional(),
});

export const vehiculosTool: ToolDefinition<z.infer<typeof argsGetVehiculos>> = {
  name:        'getVehiculos',
  description:
    'Lista los vehículos de la empresa. Filtros opcionales: estado (Operativo / En mantenimiento / Fuera de servicio), placa (búsqueda parcial), marca, assetType, fuelType. Devuelve hasta 500 vehículos con placa, marca, modelo, año, estado y tipo.',
  category:    'vehiculos',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 1,
  cacheTtlMs: 60000,
  schema:      argsGetVehiculos,

  async execute(args, ctx): Promise<ToolResult> {
    const where = [eq(companyAssets.companyId, ctx.empresaId)];

    if (args.estado) {
      const rawList: string[] = Array.isArray(args.estado)
        ? args.estado as string[]
        : typeof args.estado === 'string'
          ? (args.estado.includes(',') ? args.estado.split(',') : [args.estado])
          : [];
      const normalized = rawList.map(normalizeEstado).filter((v): v is AssetStatus => v !== null);
      if (normalized.length > 0) {
        const unique = Array.from(new Set(normalized));
        where.push(
          unique.length === 1
            ? eq(companyAssets.status, unique[0]!)
            : inArray(companyAssets.status, unique),
        );
      }
    }
    if (args.placa)    where.push(ilike(companyAssets.plate, `%${args.placa}%`));
    if (args.marca)    where.push(ilike(companyAssets.brand, `%${args.marca}%`));
    if (args.assetType) where.push(eq(companyAssets.assetType, args.assetType));
    if (args.fuelType)  where.push(eq(companyAssets.fuelType, args.fuelType));

    const rows = await db
      .select({
        id:        companyAssets.id,
        placa:     companyAssets.plate,
        nombre:    companyAssets.name,
        marca:     companyAssets.brand,
        modelo:    companyAssets.model,
        año:       companyAssets.year,
        estado:    companyAssets.status,
        tipo:      companyAssets.assetType,
        combustible: companyAssets.fuelType,
      })
      .from(companyAssets)
      .where(and(...where))
      .orderBy(companyAssets.plate)
      .limit(500);

    return { data: rows, total: rows.length, note: `Mostrando ${rows.length} vehículo(s).` };
  },
};

// ──────────────────────────────────────────────────────────────────────
// 2. getVehicleById — detalle completo de un vehículo
// ──────────────────────────────────────────────────────────────────────

const argsGetVehicleById = z.object({
  assetId: tolerantAssetId(),
});

export const getVehicleByIdTool: ToolDefinition<z.infer<typeof argsGetVehicleById>> = {
  name:        'getVehicleById',
  description: 'Devuelve el detalle completo de UN vehículo: marca, modelo, año, estado, tipo, combustible, sede, garaje, código interno.',
  category:    'vehiculos',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 2,
  cacheTtlMs: 60000,
  schema:      argsGetVehicleById,

  async execute(args, ctx): Promise<ToolResult> {
    if (!args.assetId) return { data: [], total: 0, note: 'Falta assetId.' };
    const rows = await db
      .select({
        id:          companyAssets.id,
        codigo:      companyAssets.code,
        placa:       companyAssets.plate,
        nombre:      companyAssets.name,
        marca:       companyAssets.brand,
        modelo:      companyAssets.model,
        año:         companyAssets.year,
        estado:      companyAssets.status,
        tipo:        companyAssets.assetType,
        combustible: companyAssets.fuelType,
        categoria:   companyAssets.category,
        siteId:      companyAssets.siteId,
        garageId:    companyAssets.garageId,
      })
      .from(companyAssets)
      .where(and(eq(companyAssets.id, args.assetId), eq(companyAssets.companyId, ctx.empresaId)))
      .limit(1);
    return { data: rows, total: rows.length, note: rows.length ? 'Vehículo encontrado.' : 'No se encontró ese vehículo.' };
  },
};

// ──────────────────────────────────────────────────────────────────────
// 3. listVehiclesBySite
// ──────────────────────────────────────────────────────────────────────

const argsListVehiclesBySite = z.object({
  siteId: tolerantNumber().int().positive(),
});

export const listVehiclesBySiteTool: ToolDefinition<z.infer<typeof argsListVehiclesBySite>> = {
  name:        'listVehiclesBySite',
  description: 'Lista los vehículos de una sede específica.',
  category:    'vehiculos',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  schema:      argsListVehiclesBySite,
  async execute(args, ctx): Promise<ToolResult> {
    const rows = await db
      .select({ id: companyAssets.id, placa: companyAssets.plate, marca: companyAssets.brand, modelo: companyAssets.model, estado: companyAssets.status })
      .from(companyAssets)
      .where(and(eq(companyAssets.companyId, ctx.empresaId), eq(companyAssets.siteId, args.siteId)))
      .orderBy(companyAssets.plate);
    return { data: rows, total: rows.length };
  },
};

// ──────────────────────────────────────────────────────────────────────
// 4. listVehiclesByGarage
// ──────────────────────────────────────────────────────────────────────

const argsListVehiclesByGarage = z.object({
  garageId: tolerantNumber().int().positive(),
});

export const listVehiclesByGarageTool: ToolDefinition<z.infer<typeof argsListVehiclesByGarage>> = {
  name:        'listVehiclesByGarage',
  description: 'Lista los vehículos resguardados en un garaje específico.',
  category:    'vehiculos',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  schema:      argsListVehiclesByGarage,
  async execute(args, ctx): Promise<ToolResult> {
    const rows = await db
      .select({ id: companyAssets.id, placa: companyAssets.plate, marca: companyAssets.brand, modelo: companyAssets.model, estado: companyAssets.status })
      .from(companyAssets)
      .where(and(eq(companyAssets.companyId, ctx.empresaId), eq(companyAssets.garageId, args.garageId)))
      .orderBy(companyAssets.plate);
    return { data: rows, total: rows.length };
  },
};

// ──────────────────────────────────────────────────────────────────────
// 5. listVehiclesByType
// ──────────────────────────────────────────────────────────────────────

const argsListVehiclesByType = z.object({
  assetType: z.enum(ASSET_TYPES),
});

export const listVehiclesByTypeTool: ToolDefinition<z.infer<typeof argsListVehiclesByType>> = {
  name:        'listVehiclesByType',
  description: 'Lista vehículos filtrando por tipo (Vehiculo, Motor, Maquinaria, Planta electrica, Otro).',
  category:    'vehiculos',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  schema:      argsListVehiclesByType,
  async execute(args, ctx): Promise<ToolResult> {
    const rows = await db
      .select({ id: companyAssets.id, placa: companyAssets.plate, marca: companyAssets.brand, modelo: companyAssets.model, estado: companyAssets.status, tipo: companyAssets.assetType })
      .from(companyAssets)
      .where(and(eq(companyAssets.companyId, ctx.empresaId), eq(companyAssets.assetType, args.assetType)))
      .orderBy(companyAssets.plate);
    return { data: rows, total: rows.length };
  },
};

// ──────────────────────────────────────────────────────────────────────
// 6. listVehiclesByFuelType
// ──────────────────────────────────────────────────────────────────────

const argsListVehiclesByFuelType = z.object({
  fuelType: z.enum(FUEL_TYPES),
});

export const listVehiclesByFuelTypeTool: ToolDefinition<z.infer<typeof argsListVehiclesByFuelType>> = {
  name:        'listVehiclesByFuelType',
  description: 'Lista vehículos por tipo de combustible (Diesel, Gasolina, Electrico, Hibrido).',
  category:    'vehiculos',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  schema:      argsListVehiclesByFuelType,
  async execute(args, ctx): Promise<ToolResult> {
    const rows = await db
      .select({ id: companyAssets.id, placa: companyAssets.plate, marca: companyAssets.brand, modelo: companyAssets.model, estado: companyAssets.status, combustible: companyAssets.fuelType })
      .from(companyAssets)
      .where(and(eq(companyAssets.companyId, ctx.empresaId), eq(companyAssets.fuelType, args.fuelType)))
      .orderBy(companyAssets.plate);
    return { data: rows, total: rows.length };
  },
};

// ──────────────────────────────────────────────────────────────────────
// 7. getVehicleOdometerHistory
// ──────────────────────────────────────────────────────────────────────

const argsGetVehicleOdometerHistory = z.object({
  assetId: tolerantAssetId(),
  desde:   tolerantDateString().optional(),
  hasta:   tolerantDateString().optional(),
});

export const getVehicleOdometerHistoryTool: ToolDefinition<z.infer<typeof argsGetVehicleOdometerHistory>> = {
  name:        'getVehicleOdometerHistory',
  description: 'Historial de lecturas de odómetro de un vehículo en un rango opcional.',
  category:    'vehiculos',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 2,
  cacheTtlMs: 60000,
  schema:      argsGetVehicleOdometerHistory,
  async execute(args, ctx): Promise<ToolResult> {
    if (!args.assetId) return { data: [], total: 0, note: 'Falta assetId.' };
    const where = [eq(companyOdometerReadings.companyId, ctx.empresaId), eq(companyOdometerReadings.assetId, args.assetId)];
    if (args.desde) where.push(gte(companyOdometerReadings.takenAt, new Date(args.desde)));
    if (args.hasta) where.push(lte(companyOdometerReadings.takenAt, new Date(args.hasta + ' 23:59:59')));
    const rows = await db
      .select()
      .from(companyOdometerReadings)
      .where(and(...where))
      .orderBy(desc(companyOdometerReadings.takenAt))
      .limit(500);
    return { data: rows, total: rows.length };
  },
};

// ──────────────────────────────────────────────────────────────────────
// 8. getVehicleLatestOdometer
// ──────────────────────────────────────────────────────────────────────

const argsGetVehicleLatestOdometer = z.object({
  assetId: tolerantAssetId(),
});

export const getVehicleLatestOdometerTool: ToolDefinition<z.infer<typeof argsGetVehicleLatestOdometer>> = {
  name:        'getVehicleLatestOdometer',
  description: 'Devuelve la última lectura de odómetro de un vehículo específico.',
  category:    'vehiculos',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  schema:      argsGetVehicleLatestOdometer,
  async execute(args, ctx): Promise<ToolResult> {
    if (!args.assetId) return { data: [], total: 0, note: 'Falta assetId.' };
    const rows = await db
      .select()
      .from(companyOdometerReadings)
      .where(and(eq(companyOdometerReadings.companyId, ctx.empresaId), eq(companyOdometerReadings.assetId, args.assetId)))
      .orderBy(desc(companyOdometerReadings.takenAt))
      .limit(1);
    return { data: rows, total: rows.length, note: rows.length ? 'Última lectura.' : 'Sin lecturas para ese vehículo.' };
  },
};

// ──────────────────────────────────────────────────────────────────────
// 9. getVehicleNotes
// ──────────────────────────────────────────────────────────────────────

const argsGetVehicleNotes = z.object({
  assetId: tolerantAssetId(),
  desde:   tolerantDateString().optional(),
  hasta:   tolerantDateString().optional(),
});

export const getVehicleNotesTool: ToolDefinition<z.infer<typeof argsGetVehicleNotes>> = {
  name:        'getVehicleNotes',
  description: 'Lista las notas libres asociadas a un vehículo.',
  category:    'vehiculos',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 2,
  cacheTtlMs: 60000,
  schema:      argsGetVehicleNotes,
  async execute(args, ctx): Promise<ToolResult> {
    if (!args.assetId) return { data: [], total: 0, note: 'Falta assetId.' };
    const where = [eq(assetNotes.companyId, ctx.empresaId), eq(assetNotes.assetId, args.assetId)];
    if (args.desde) where.push(gte(assetNotes.createdAt, new Date(args.desde)));
    if (args.hasta) where.push(lte(assetNotes.createdAt, new Date(args.hasta + ' 23:59:59')));
    const rows = await db
      .select()
      .from(assetNotes)
      .where(and(...where))
      .orderBy(desc(assetNotes.createdAt))
      .limit(200);
    return { data: rows, total: rows.length };
  },
};

// ──────────────────────────────────────────────────────────────────────
// 10. getVehicleRoutes
// ──────────────────────────────────────────────────────────────────────

const argsGetVehicleRoutes = z.object({
  assetId: tolerantAssetId(),
  desde:   tolerantDateString().optional(),
  hasta:   tolerantDateString().optional(),
});

export const getVehicleRoutesTool: ToolDefinition<z.infer<typeof argsGetVehicleRoutes>> = {
  name:        'getVehicleRoutes',
  description: 'Lista las rutas registradas para un vehículo en un rango opcional.',
  category:    'vehiculos',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  schema:      argsGetVehicleRoutes,
  async execute(args, ctx): Promise<ToolResult> {
    if (!args.assetId) return { data: [], total: 0, note: 'Falta assetId.' };
    const where = [eq(assetRoutes.companyId, ctx.empresaId), eq(assetRoutes.assetId, args.assetId)];
    if (args.desde) where.push(gte(assetRoutes.createdAt, new Date(args.desde)));
    if (args.hasta) where.push(lte(assetRoutes.createdAt, new Date(args.hasta + ' 23:59:59')));
    const rows = await db
      .select()
      .from(assetRoutes)
      .where(and(...where))
      .orderBy(desc(assetRoutes.createdAt))
      .limit(200);
    return { data: rows, total: rows.length };
  },
};

// ──────────────────────────────────────────────────────────────────────
// 11. listVehicleStatusHistory (audit log filtrado)
// ──────────────────────────────────────────────────────────────────────

const argsListVehicleStatusHistory = z.object({
  assetId: tolerantAssetId(),
  desde:   tolerantDateString().optional(),
  hasta:   tolerantDateString().optional(),
});

export const listVehicleStatusHistoryTool: ToolDefinition<z.infer<typeof argsListVehicleStatusHistory>> = {
  name:        'listVehicleStatusHistory',
  description: 'Lista los cambios de estado de un vehículo (extraído del audit log).',
  category:    'vehiculos',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 2,
  cacheTtlMs: 60000,
  schema:      argsListVehicleStatusHistory,
  async execute(args, ctx): Promise<ToolResult> {
    if (!args.assetId) return { data: [], total: 0, note: 'Falta assetId.' };
    const where = [
      eq(companyAuditEntries.companyId, ctx.empresaId),
      eq(companyAuditEntries.entity, 'asset'),
      eq(companyAuditEntries.entityId, String(args.assetId)),
      sql`${companyAuditEntries.action} LIKE 'asset.status%'`,
    ];
    if (args.desde) where.push(gte(companyAuditEntries.createdAt, new Date(args.desde)));
    if (args.hasta) where.push(lte(companyAuditEntries.createdAt, new Date(args.hasta + ' 23:59:59')));
    const rows = await db
      .select()
      .from(companyAuditEntries)
      .where(and(...where))
      .orderBy(desc(companyAuditEntries.createdAt))
      .limit(200);
    return { data: rows, total: rows.length };
  },
};

// ──────────────────────────────────────────────────────────────────────
// 12. getFleetUtilization
// ──────────────────────────────────────────────────────────────────────

const argsGetFleetUtilization = z.object({
  siteId: tolerantNumber().int().positive().optional(),
});

export const getFleetUtilizationTool: ToolDefinition<z.infer<typeof argsGetFleetUtilization>> = {
  name:        'getFleetUtilization',
  description: 'Porcentaje de la flota operativa vs en mantenimiento vs fuera de servicio. Opcional filtrar por sede.',
  category:    'vehiculos',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 2,
  cacheTtlMs: 300000,
  schema:      argsGetFleetUtilization,
  async execute(args, ctx): Promise<ToolResult> {
    const where = [eq(companyAssets.companyId, ctx.empresaId)];
    if (args.siteId) where.push(eq(companyAssets.siteId, args.siteId));
    const rows = await db
      .select({ status: companyAssets.status, count: sql<number>`count(*)::int` })
      .from(companyAssets)
      .where(and(...where))
      .groupBy(companyAssets.status);
    const total = rows.reduce((acc, r) => acc + r.count, 0);
    const enriched = rows.map(r => ({
      estado: r.status,
      cantidad: r.count,
      porcentaje: total > 0 ? Math.round((r.count / total) * 1000) / 10 : 0,
    }));
    return { data: enriched, total: total, note: `Total: ${total} vehículos.` };
  },
};

// ──────────────────────────────────────────────────────────────────────
// 13. getVehicleFullProfile (perfil 360)
// ──────────────────────────────────────────────────────────────────────

const argsGetVehicleFullProfile = z.object({
  assetId: tolerantAssetId(),
});

export const getVehicleFullProfileTool: ToolDefinition<z.infer<typeof argsGetVehicleFullProfile>> = {
  name:        'getVehicleFullProfile',
  description: 'Perfil 360° de un vehículo: estado, odómetro, último mantenimiento, gasto del mes, asignación actual.',
  category:    'vehiculos',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 1,
  cacheTtlMs: 60000,
  schema:      argsGetVehicleFullProfile,
  async execute(args, ctx): Promise<ToolResult> {
    if (!args.assetId) return { data: [], total: 0, note: 'Falta assetId.' };
    // Datos del vehículo
    const veh = await db
      .select()
      .from(companyAssets)
      .where(and(eq(companyAssets.companyId, ctx.empresaId), eq(companyAssets.id, args.assetId)))
      .limit(1);
    if (veh.length === 0) return { data: [], total: 0, note: 'Vehículo no encontrado.' };
    // Última lectura de odómetro
    const lastOdo = await db
      .select()
      .from(companyOdometerReadings)
      .where(and(eq(companyOdometerReadings.companyId, ctx.empresaId), eq(companyOdometerReadings.assetId, args.assetId)))
      .orderBy(desc(companyOdometerReadings.takenAt))
      .limit(1);
    // Asignación activa
    const assignment = await db
      .select()
      .from(companyAssignments)
      .where(and(
        eq(companyAssignments.companyId, ctx.empresaId),
        eq(companyAssignments.assetId, args.assetId),
        eq(companyAssignments.status, 'activa'),
      ))
      .limit(1);
    // Último mantenimiento completado
    const lastMtto = await db
      .select()
      .from(companyMaintenanceRecords)
      .where(and(
        eq(companyMaintenanceRecords.companyId, ctx.empresaId),
        eq(companyMaintenanceRecords.assetId, args.assetId),
        eq(companyMaintenanceRecords.status, 'Completado'),
      ))
      .orderBy(desc(companyMaintenanceRecords.completedAt))
      .limit(1);
    return {
      data: [{
        vehiculo: veh[0],
        odometro_actual: lastOdo[0]?.km ?? null,
        fecha_ultima_lectura: lastOdo[0]?.takenAt ?? null,
        asignacion_activa: assignment[0] ?? null,
        ultimo_mantenimiento: lastMtto[0] ?? null,
      }],
      total: 1,
    };
  },
};

// ──────────────────────────────────────────────────────────────────────
// 14. getVehicleSpendBreakdown (costo por categoría en un rango)
// ──────────────────────────────────────────────────────────────────────

const argsGetVehicleSpendBreakdown = z.object({
  // jul 2026 v8.6 — assetId ahora es OPCIONAL. Si viene, devuelve
  // el desglose de ESE vehículo. Si NO viene, devuelve el agregado
  // de TODA la empresa (sumando todos los vehículos). Esto le da
  // al LLM una sola tool para dos preguntas comunes:
  //   "cuánto gastó el ABC-123 este mes"     → con assetId
  //   "cuánto gastamos en total este mes"    → sin assetId
  assetId: tolerantAssetId().optional(),
  desde:   tolerantDateString().optional(),
  hasta:   tolerantDateString().optional(),
});

export const getVehicleSpendBreakdownTool: ToolDefinition<z.infer<typeof argsGetVehicleSpendBreakdown>> = {
  name:        'getVehicleSpendBreakdown',
  description: 'Desglose de gasto por categoría (combustible / mantenimiento / peajes). Si pasás assetId, devuelve el desglose de ESE vehículo en el rango. Si NO pasás assetId, devuelve el agregado de TODA la empresa en el rango (útil para "cuánto gastamos este mes").',
  category:    'vehiculos',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 2,
  cacheTtlMs: 300000,
  schema:      argsGetVehicleSpendBreakdown,
  async execute(args, ctx): Promise<ToolResult> {
    const dateFilterFuel = args.desde && args.hasta
      ? and(gte(companyFuelEntries.date, args.desde), lte(companyFuelEntries.date, args.hasta))
      : undefined;
    const dateFilterMtto = args.desde && args.hasta
      ? and(gte(companyMaintenanceRecords.completedAt, new Date(args.desde)), lte(companyMaintenanceRecords.completedAt, new Date(args.hasta + ' 23:59:59')))
      : undefined;
    const dateFilterToll = args.desde && args.hasta
      ? and(gte(companyTollEntries.date, args.desde), lte(companyTollEntries.date, args.hasta))
      : undefined;

    // jul 2026 v8.6 — Si viene assetId, filtramos por ese vehículo.
    // Si NO viene, sumamos TODA la empresa (sin WHERE de assetId).
    const assetFilter = args.assetId
      ? (table: any) => eq(table.assetId, args.assetId!)
      : (_table: any) => undefined;

    const whereCombustible = and(
      eq(companyFuelEntries.companyId, ctx.empresaId),
      assetFilter(companyFuelEntries),
      dateFilterFuel,
    );
    const whereMantenimiento = and(
      eq(companyMaintenanceRecords.companyId, ctx.empresaId),
      assetFilter(companyMaintenanceRecords),
      eq(companyMaintenanceRecords.status, 'Completado'),
      dateFilterMtto,
    );
    const wherePeajes = and(
      eq(companyTollEntries.companyId, ctx.empresaId),
      assetFilter(companyTollEntries),
      dateFilterToll,
    );

    const [combustible, mantenimiento, peajes] = await Promise.all([
      db.select({ total: sql<number>`COALESCE(SUM(cost), 0)::float` })
        .from(companyFuelEntries)
        .where(whereCombustible),
      db.select({ total: sql<number>`COALESCE(SUM(total_cost), 0)::float` })
        .from(companyMaintenanceRecords)
        .where(whereMantenimiento),
      db.select({ total: sql<number>`COALESCE(SUM(amount), 0)::float` })
        .from(companyTollEntries)
        .where(wherePeajes),
    ]);
    const totalGeneral =
      (combustible[0]?.total ?? 0) +
      (mantenimiento[0]?.total ?? 0) +
      (peajes[0]?.total ?? 0);
    return {
      data: [
        { categoria: 'combustible',  total: combustible[0]?.total ?? 0 },
        { categoria: 'mantenimiento', total: mantenimiento[0]?.total ?? 0 },
        { categoria: 'peajes',      total: peajes[0]?.total ?? 0 },
      ],
      total: 3,
      // jul 2026 v8.6 — `note` se muestra al LLM. Lo uso para aclarar
      // el scope (empresa vs vehículo) y dar el total general.
      note: args.assetId
        ? `Desglose del vehículo ${args.assetId}. Total: $${totalGeneral.toFixed(2)}.`
        : `Desglose de TODA la empresa. Total: $${totalGeneral.toFixed(2)}.`,
    };
  },
};

// ──────────────────────────────────────────────────────────────────────
// 15. listVehiclesWithoutRecentChecklist
// ──────────────────────────────────────────────────────────────────────

const argsListVehiclesWithoutRecentChecklist = z.object({
  dias:     tolerantNumber().int().min(1).max(365).default(30),
  siteId:   tolerantNumber().int().positive().optional(),
});

export const listVehiclesWithoutRecentChecklistTool: ToolDefinition<z.infer<typeof argsListVehiclesWithoutRecentChecklist>> = {
  name:        'listVehiclesWithoutRecentChecklist',
  description: 'Lista vehículos sin inspección reciente (más de N días).',
  category:    'vehiculos',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 2,
  cacheTtlMs: 300000,
  schema:      argsListVehiclesWithoutRecentChecklist,
  async execute(args, ctx): Promise<ToolResult> {
    const cutoff = new Date(Date.now() - args.dias * 24 * 60 * 60 * 1000);
    const where = [eq(companyAssets.companyId, ctx.empresaId), eq(companyAssets.status, 'Operativo')];
    if (args.siteId) where.push(eq(companyAssets.siteId, args.siteId));
    const rows = await db
      .select({
        id: companyAssets.id,
        placa: companyAssets.plate,
        marca: companyAssets.brand,
        modelo: companyAssets.model,
        ultimo_checklist: sql<Date>`(SELECT MAX(${companyChecklists.date}) FROM ${companyChecklists} WHERE ${companyChecklists.assetId} = ${companyAssets.id})`,
      })
      .from(companyAssets)
      .where(and(...where))
      .having(sql`(SELECT MAX(${companyChecklists.date}) FROM ${companyChecklists} WHERE ${companyChecklists.assetId} = ${companyAssets.id}) < ${cutoff} OR (SELECT MAX(${companyChecklists.date}) FROM ${companyChecklists} WHERE ${companyChecklists.assetId} = ${companyAssets.id}) IS NULL`)
      .orderBy(companyAssets.plate)
      .limit(200);
    return { data: rows, total: rows.length, note: `Vehículos sin checklist en los últimos ${args.dias} días.` };
  },
};

// ──────────────────────────────────────────────────────────────────────
// 16. listVehiclesWithoutRecentMaintenance
// ──────────────────────────────────────────────────────────────────────

const argsListVehiclesWithoutRecentMaintenance = z.object({
  dias:   tolerantNumber().int().min(1).max(365).default(60),
  siteId: tolerantNumber().int().positive().optional(),
});

export const listVehiclesWithoutRecentMaintenanceTool: ToolDefinition<z.infer<typeof argsListVehiclesWithoutRecentMaintenance>> = {
  name:        'listVehiclesWithoutRecentMaintenance',
  description: 'Lista vehículos sin mantenimiento reciente (más de N días).',
  category:    'vehiculos',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 2,
  cacheTtlMs: 300000,
  schema:      argsListVehiclesWithoutRecentMaintenance,
  async execute(args, ctx): Promise<ToolResult> {
    const cutoff = new Date(Date.now() - args.dias * 24 * 60 * 60 * 1000);
    const where = [eq(companyAssets.companyId, ctx.empresaId), eq(companyAssets.status, 'Operativo')];
    if (args.siteId) where.push(eq(companyAssets.siteId, args.siteId));
    const rows = await db
      .select({
        id: companyAssets.id,
        placa: companyAssets.plate,
        marca: companyAssets.brand,
        modelo: companyAssets.model,
        ultimo_mtto: sql<Date>`(SELECT MAX(${companyMaintenanceRecords.completedAt}) FROM ${companyMaintenanceRecords} WHERE ${companyMaintenanceRecords.assetId} = ${companyAssets.id} AND ${companyMaintenanceRecords.status} = 'Completado')`,
      })
      .from(companyAssets)
      .where(and(...where))
      .having(sql`(SELECT MAX(${companyMaintenanceRecords.completedAt}) FROM ${companyMaintenanceRecords} WHERE ${companyMaintenanceRecords.assetId} = ${companyAssets.id} AND ${companyMaintenanceRecords.status} = 'Completado') < ${cutoff} OR (SELECT MAX(${companyMaintenanceRecords.completedAt}) FROM ${companyMaintenanceRecords} WHERE ${companyMaintenanceRecords.assetId} = ${companyAssets.id} AND ${companyMaintenanceRecords.status} = 'Completado') IS NULL`)
      .orderBy(companyAssets.plate)
      .limit(200);
    return { data: rows, total: rows.length, note: `Vehículos sin mantenimiento en los últimos ${args.dias} días.` };
  },
};

// ──────────────────────────────────────────────────────────────────────
// 17. getMostExpensiveVehicles (top N por costo operativo)
// ──────────────────────────────────────────────────────────────────────

const argsGetMostExpensiveVehicles = z.object({
  desde:   tolerantDateString().optional(),
  hasta:   tolerantDateString().optional(),
  topN:    tolerantNumber().int().min(1).max(50).default(5),
});

export const getMostExpensiveVehiclesTool: ToolDefinition<z.infer<typeof argsGetMostExpensiveVehicles>> = {
  name:        'getMostExpensiveVehicles',
  description: 'Top N vehículos con mayor costo operativo (combustible + mantenimiento + peajes) en un rango.',
  category:    'vehiculos',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 2,
  cacheTtlMs: 300000,
  schema:      argsGetMostExpensiveVehicles,
  async execute(args, ctx): Promise<ToolResult> {
    const fuelCond  = [eq(companyFuelEntries.companyId, ctx.empresaId)];
    const mttoCond  = [eq(companyMaintenanceRecords.companyId, ctx.empresaId), eq(companyMaintenanceRecords.status, 'Completado')];
    const tollCond  = [eq(companyTollEntries.companyId, ctx.empresaId)];
    if (args.desde && args.hasta) {
      fuelCond.push(gte(companyFuelEntries.date, args.desde), lte(companyFuelEntries.date, args.hasta));
      mttoCond.push(gte(companyMaintenanceRecords.completedAt, new Date(args.desde)), lte(companyMaintenanceRecords.completedAt, new Date(args.hasta + ' 23:59:59')));
      tollCond.push(gte(companyTollEntries.date, args.desde), lte(companyTollEntries.date, args.hasta));
    }
    const [comb, mtto, toll] = await Promise.all([
      db.select({ assetId: companyFuelEntries.assetId, t: sql<number>`COALESCE(SUM(cost), 0)::float` }).from(companyFuelEntries).where(and(...fuelCond)).groupBy(companyFuelEntries.assetId),
      db.select({ assetId: companyMaintenanceRecords.assetId, t: sql<number>`COALESCE(SUM(total_cost), 0)::float` }).from(companyMaintenanceRecords).where(and(...mttoCond)).groupBy(companyMaintenanceRecords.assetId),
      db.select({ assetId: companyTollEntries.assetId, t: sql<number>`COALESCE(SUM(amount), 0)::float` }).from(companyTollEntries).where(and(...tollCond)).groupBy(companyTollEntries.assetId),
    ]);
    const totals = new Map<number, number>();
    for (const r of [...comb, ...mtto, ...toll]) {
      totals.set(r.assetId, (totals.get(r.assetId) ?? 0) + Number(r.t));
    }
    const top = Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, args.topN);
    if (top.length === 0) return { data: [], total: 0, note: 'Sin gastos en el rango.' };
    const ids = top.map(([id]) => id);
    const vehs = await db
      .select({ id: companyAssets.id, placa: companyAssets.plate, marca: companyAssets.brand, modelo: companyAssets.model })
      .from(companyAssets)
      .where(inArray(companyAssets.id, ids));
    const vmap = new Map(vehs.map(v => [v.id, v]));
    return {
      data: top.map(([id, t]) => ({ vehiculo: vmap.get(id) ?? { id }, total: Math.round(t * 100) / 100 })),
      total: top.length,
      note: `Top ${top.length} vehículos con mayor costo operativo.`,
    };
  },
};

// ──────────────────────────────────────────────────────────────────────
// 18. listVehiclesWithExpiringInsurance
// ──────────────────────────────────────────────────────────────────────

const argsListVehiclesWithExpiringInsurance = z.object({
  dias: tolerantNumber().int().min(1).max(365).default(60),
});

export const listVehiclesWithExpiringInsuranceTool: ToolDefinition<z.infer<typeof argsListVehiclesWithExpiringInsurance>> = {
  name:        'listVehiclesWithExpiringInsurance',
  description: 'Lista vehículos cuya póliza de seguro vence en los próximos N días.',
  category:    'vehiculos',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  schema:      argsListVehiclesWithExpiringInsurance,
  async execute(args, ctx): Promise<ToolResult> {
    const cutoff = new Date(Date.now() + args.dias * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        vehiculoId: companyAssets.id,
        placa: companyAssets.plate,
        marca: companyAssets.brand,
        modelo: companyAssets.model,
        polizaId: companyInsurancePolicies.id,
        aseguradora: companyInsurancePolicies.insurerName,
        vencimiento: companyInsurancePolicies.expirationDate,
      })
      .from(companyInsurancePolicies)
      .innerJoin(companyAssets, eq(companyAssets.id, companyInsurancePolicies.assetId))
      .where(and(
        eq(companyInsurancePolicies.companyId, ctx.empresaId),
        lte(companyInsurancePolicies.expirationDate, cutoff),
        gte(companyInsurancePolicies.expirationDate, new Date()),
      ))
      .orderBy(asc(companyInsurancePolicies.expirationDate))
      .limit(200);
    return { data: rows, total: rows.length, note: `Seguros por vencer en los próximos ${args.dias} días.` };
  },
};

// ──────────────────────────────────────────────────────────────────────
// 19. getFleetAgeDistribution
// ──────────────────────────────────────────────────────────────────────

const argsGetFleetAgeDistribution = z.object({
  siteId: tolerantNumber().int().positive().optional(),
});

export const getFleetAgeDistributionTool: ToolDefinition<z.infer<typeof argsGetFleetAgeDistribution>> = {
  name:        'getFleetAgeDistribution',
  description: 'Distribución de edad de la flota (año actual - año del activo).',
  category:    'vehiculos',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 2,
  cacheTtlMs: 300000,
  schema:      argsGetFleetAgeDistribution,
  async execute(args, ctx): Promise<ToolResult> {
    const where = [eq(companyAssets.companyId, ctx.empresaId), isNotNull(companyAssets.year)];
    if (args.siteId) where.push(eq(companyAssets.siteId, args.siteId));
    const rows = await db
      .select({ year: companyAssets.year })
      .from(companyAssets)
      .where(and(...where));
    const currentYear = new Date().getFullYear();
    const buckets: Record<string, number> = { '0-2 años': 0, '3-5 años': 0, '6-10 años': 0, '11+ años': 0 };
    for (const r of rows) {
      const age = currentYear - Number(r.year);
      if (age <= 2) buckets['0-2 años']++;
      else if (age <= 5) buckets['3-5 años']++;
      else if (age <= 10) buckets['6-10 años']++;
      else buckets['11+ años']++;
    }
    return {
      data: Object.entries(buckets).map(([bucket, count]) => ({ bucket, count })),
      total: rows.length,
      note: `Edad promedio: ${rows.length > 0 ? Math.round(rows.reduce((acc, r) => acc + (currentYear - Number(r.year)), 0) / rows.length * 10) / 10 : 0} años.`,
    };
  },
};

// ──────────────────────────────────────────────────────────────────────
// 20. getVehicleTCO (Total Cost of Ownership por km)
// ──────────────────────────────────────────────────────────────────────

const argsGetVehicleTCO = z.object({
  assetId: tolerantAssetId(),
  desde:   tolerantDateString().optional(),
  hasta:   tolerantDateString().optional(),
});

export const getVehicleTCOTool: ToolDefinition<z.infer<typeof argsGetVehicleTCO>> = {
  name:        'getVehicleTCO',
  description: 'TCO (Total Cost of Ownership) por vehículo: combustible + mantenimiento + peajes / km / mes en un rango.',
  category:    'vehiculos',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 2,
  cacheTtlMs: 300000,
  schema:      argsGetVehicleTCO,
  async execute(args, ctx): Promise<ToolResult> {
    if (!args.assetId) return { data: [], total: 0, note: 'Falta assetId.' };
    const fuelCond  = [eq(companyFuelEntries.companyId, ctx.empresaId), eq(companyFuelEntries.assetId, args.assetId)];
    const mttoCond  = [eq(companyMaintenanceRecords.companyId, ctx.empresaId), eq(companyMaintenanceRecords.assetId, args.assetId), eq(companyMaintenanceRecords.status, 'Completado')];
    const tollCond  = [eq(companyTollEntries.companyId, ctx.empresaId), eq(companyTollEntries.assetId, args.assetId)];
    if (args.desde && args.hasta) {
      fuelCond.push(gte(companyFuelEntries.date, args.desde), lte(companyFuelEntries.date, args.hasta));
      mttoCond.push(gte(companyMaintenanceRecords.completedAt, new Date(args.desde)), lte(companyMaintenanceRecords.completedAt, new Date(args.hasta + ' 23:59:59')));
      tollCond.push(gte(companyTollEntries.date, args.desde), lte(companyTollEntries.date, args.hasta));
    }
    const [comb, mtto, toll, odo] = await Promise.all([
      db.select({ t: sql<number>`COALESCE(SUM(cost), 0)::float` }).from(companyFuelEntries).where(and(...fuelCond)),
      db.select({ t: sql<number>`COALESCE(SUM(total_cost), 0)::float` }).from(companyMaintenanceRecords).where(and(...mttoCond)),
      db.select({ t: sql<number>`COALESCE(SUM(amount), 0)::float` }).from(companyTollEntries).where(and(...tollCond)),
      db.select({ km: sql<number>`COALESCE(MAX(km), 0)::float` }).from(companyOdometerReadings).where(and(eq(companyOdometerReadings.companyId, ctx.empresaId), eq(companyOdometerReadings.assetId, args.assetId))),
    ]);
    const total = Number(comb[0]?.t ?? 0) + Number(mtto[0]?.t ?? 0) + Number(toll[0]?.t ?? 0);
    const km = Number(odo[0]?.km ?? 0);
    return {
      data: [{
        combustible: Number(comb[0]?.t ?? 0),
        mantenimiento: Number(mtto[0]?.t ?? 0),
        peajes: Number(toll[0]?.t ?? 0),
        total: Math.round(total * 100) / 100,
        km_actual: km,
        costo_por_km: km > 0 ? Math.round((total / km) * 100) / 100 : null,
      }],
      total: 1,
    };
  },
};

// ──────────────────────────────────────────────────────────────────────
// 21. getVehicleScorecard (scorecard de salud)
// ──────────────────────────────────────────────────────────────────────

const argsGetVehicleScorecard = z.object({
  assetId: tolerantAssetId(),
  meses:   tolerantNumber().int().min(1).max(24).default(6),
});

export const getVehicleScorecardTool: ToolDefinition<z.infer<typeof argsGetVehicleScorecard>> = {
  name:        'getVehicleScorecard',
  description: 'Scorecard de salud: incidentes, mantenimientos atrasados, observaciones en checklists.',
  category:    'vehiculos',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 2,
  cacheTtlMs: 300000,
  schema:      argsGetVehicleScorecard,
  async execute(args, ctx): Promise<ToolResult> {
    if (!args.assetId) return { data: [], total: 0, note: 'Falta assetId.' };
    const cutoff = new Date(Date.now() - args.meses * 30 * 24 * 60 * 60 * 1000);
    const [mttoCount, mttoTotal, observaciones] = await Promise.all([
      db.select({ c: sql<number>`count(*)::int` }).from(companyMaintenanceRecords)
        .where(and(
          eq(companyMaintenanceRecords.companyId, ctx.empresaId),
          eq(companyMaintenanceRecords.assetId, args.assetId),
          gte(companyMaintenanceRecords.completedAt, cutoff),
        )),
      db.select({ t: sql<number>`COALESCE(SUM(total_cost), 0)::float` }).from(companyMaintenanceRecords)
        .where(and(
          eq(companyMaintenanceRecords.companyId, ctx.empresaId),
          eq(companyMaintenanceRecords.assetId, args.assetId),
          eq(companyMaintenanceRecords.status, 'Completado'),
          gte(companyMaintenanceRecords.completedAt, cutoff),
        )),
      db.select({ c: sql<number>`count(*)::int` }).from(companyChecklists)
        .where(and(
          eq(companyChecklists.companyId, ctx.empresaId),
          eq(companyChecklists.assetId, args.assetId),
          gte(companyChecklists.date, cutoff.toISOString().slice(0, 10)),
          eq(companyChecklists.status, 'observado'),
        )),
    ]);
    return {
      data: [{
        mantenimientos_ult_meses: mttoCount[0]?.c ?? 0,
        costo_mtto_ult_meses: Math.round(Number(mttoTotal[0]?.t ?? 0) * 100) / 100,
        observaciones_checklist: observaciones[0]?.c ?? 0,
        score: Math.max(0, 100 - ((observaciones[0]?.c ?? 0) * 10)),
      }],
      total: 1,
      note: `Scorecard últimos ${args.meses} meses.`,
    };
  },
};

// ──────────────────────────────────────────────────────────────────────
// 22. listVehiclesNeedingOilChange (placeholder, depende de company_oil_changes)
// ──────────────────────────────────────────────────────────────────────

const argsListVehiclesNeedingOilChange = z.object({
  diasUmbral: tolerantNumber().int().min(30).max(365).default(180),
});

export const listVehiclesNeedingOilChangeTool: ToolDefinition<z.infer<typeof argsListVehiclesNeedingOilChange>> = {
  name:        'listVehiclesNeedingOilChange',
  description: 'Lista vehículos cuyo próximo cambio de aceite está vencido o cerca de vencer.',
  category:    'vehiculos',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 2,
  cacheTtlMs: 300000,
  schema:      argsListVehiclesNeedingOilChange,
  async execute(args, ctx): Promise<ToolResult> {
    const cutoff = new Date(Date.now() + args.diasUmbral * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        vehiculoId: companyAssets.id,
        placa: companyAssets.plate,
        marca: companyAssets.brand,
        modelo: companyAssets.model,
        ultimoCambio: companyOilChanges.date,
        proximoCambio: companyOilChanges.nextDueDate,
      })
      .from(companyOilChanges)
      .innerJoin(companyAssets, eq(companyAssets.id, companyOilChanges.assetId))
      .where(and(
        eq(companyOilChanges.companyId, ctx.empresaId),
        lte(companyOilChanges.nextDueDate, cutoff),
      ))
      .orderBy(asc(companyOilChanges.nextDueDate))
      .limit(200);
    return { data: rows, total: rows.length, note: `Cambios de aceite próximos a vencer (${args.diasUmbral} días).` };
  },
};

// ──────────────────────────────────────────────────────────────────────
// Catálogo de tools del módulo Flota (exportadas)
// ──────────────────────────────────────────────────────────────────────

export const VEHICULOS_TOOLS: ToolDefinition[] = [
  vehiculosTool,
  getVehicleByIdTool,
  listVehiclesBySiteTool,
  listVehiclesByGarageTool,
  listVehiclesByTypeTool,
  listVehiclesByFuelTypeTool,
  getVehicleOdometerHistoryTool,
  getVehicleLatestOdometerTool,
  getVehicleNotesTool,
  getVehicleRoutesTool,
  listVehicleStatusHistoryTool,
  getFleetUtilizationTool,
  getVehicleFullProfileTool,
  getVehicleSpendBreakdownTool,
  listVehiclesWithoutRecentChecklistTool,
  listVehiclesWithoutRecentMaintenanceTool,
  getMostExpensiveVehiclesTool,
  listVehiclesWithExpiringInsuranceTool,
  getFleetAgeDistributionTool,
  getVehicleTCOTool,
  getVehicleScorecardTool,
  listVehiclesNeedingOilChangeTool,
];
