// lib/ai/tools/mantenimientos.ts
//
// Tool: getMantenimientos
// Lista mantenimientos con filtros (rango de fecha, estado, tipo, vehículo).

import { z } from 'zod';
import { and, eq, gte, inArray, lte, desc, ilike, sql } from 'drizzle-orm';
import { db } from '../../../db/client';
import { companyMaintenanceRecords, companyAssets } from '../../../db/schema/operational';
import type { ToolDefinition, ToolResult } from './registry';
import { tolerantString, tolerantNumber, tolerantAssetId, tolerantDateString } from '../schema-helpers';

// jul 2026 — sincronizado con `maintenanceStatusEnum` en
// db/schema/operational.ts (incluye 'Atrasado').
const MANTENIMIENTO_ESTADOS = [
  'Programado',
  'En curso',
  'PendienteAtencion',
  'Completado',
  'Cancelado',
  'Correccion',
  'Atrasado',
] as const;
type MantEstado = (typeof MANTENIMIENTO_ESTADOS)[number];

const MANTENIMIENTO_TIPOS = ['Correctivo', 'Programado', 'Lavada'] as const;
type MantTipo = (typeof MANTENIMIENTO_TIPOS)[number];

// `estado` y `tipo` se modelan como `z.string().optional()` (no enum) para
// que el LLM pueda mandar sinónimos coloquiales sin que zod rompa la
// validación. La normalización a los valores del ENUM real se hace abajo
// en `execute` (con fallback silencioso si llega un valor desconocido).
const argsSchema = z.object({
  desde:        tolerantDateString().optional(),
  hasta:        tolerantDateString().optional(),
  estado:       z.union([z.string(), z.array(z.string())]).optional(),
  tipo:         z.union([z.string(), z.array(z.string())]).optional(),
  assetId:      tolerantAssetId(),
  placa:        tolerantString().optional(),
  // limit removido del schema público — ver nota en vehiculos.ts.
});

type Args = z.infer<typeof argsSchema>;

/** Convierte un string suelto a MantEstado | null. Sinónimos coloquiales
 *  se aceptan silenciosamente. Si no matchea, devuelve null. */
function normalizeEstado(raw: string): MantEstado | null {
  const k = raw.trim().toLowerCase();
  for (const e of MANTENIMIENTO_ESTADOS) {
    if (e.toLowerCase() === k) return e;
  }
  // Sinónimos
  const map: Record<string, MantEstado> = {
    'pendiente':     'PendienteAtencion',
    'pendientes':    'PendienteAtencion',
    'en curso':      'En curso',
    'en proceso':    'En curso',
    'en ejecucion':  'En curso',
    'en ejecución':  'En curso',
    'ejecucion':     'En curso',
    'ejecución':     'En curso',
    'finalizado':    'Completado',
    'finalizados':   'Completado',
    'hecho':         'Completado',
    'hechos':        'Completado',
    'terminado':     'Completado',
    'terminados':    'Completado',
    'completo':      'Completado',
    'completos':     'Completado',
    'vencido':       'Atrasado',
    'vencidos':      'Atrasado',
    'atrasado':      'Atrasado',
    'atrasados':     'Atrasado',
    'atrasada':      'Atrasado',
    'atrasadas':     'Atrasado',
    'taller':        'En curso',
    'reparacion':    'En curso',
    'reparación':    'En curso',
  };
  return map[k] ?? null;
}

function normalizeTipo(raw: string): MantTipo | null {
  const k = raw.trim().toLowerCase();
  for (const t of MANTENIMIENTO_TIPOS) {
    if (t.toLowerCase() === k) return t;
  }
  const map: Record<string, MantTipo> = {
    'correctivo':  'Correctivo',
    'correctiva':  'Correctivo',
    'reparacion':  'Correctivo',
    'reparación':  'Correctivo',
    'arreglo':     'Correctivo',
    'preventivo':  'Programado',
    'preventiva':  'Programado',
    'programada':  'Programado',
    'programados': 'Programado',
    'lavado':      'Lavada',
    'lavados':     'Lavada',
    'limpieza':    'Lavada',
    'wash':        'Lavada',
  };
  return map[k] ?? null;
}

function toList<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

export const mantenimientosTool: ToolDefinition<Args> = {
  name:        'getMantenimientos',
  description:
    'Lista mantenimientos (servicios preventivos, correctivos, lavadas). Filtros: rango de fechas (desde/hasta YYYY-MM-DD), estado (Programado, En curso, Completado, Cancelado, Correccion, PendienteAtencion, Atrasado), tipo (Correctivo, Programado, Lavada), vehículo (por assetId numérico o placa parcial). Devuelve título, fecha, estado, costo y placa del vehículo.',
  category:    'mantenimientos',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  schema:      argsSchema,

  async execute(args, ctx): Promise<ToolResult> {
    const where = [eq(companyMaintenanceRecords.companyId, ctx.empresaId)];

    if (args.desde)  where.push(gte(companyMaintenanceRecords.scheduledFor, new Date(args.desde)));
    if (args.hasta)  where.push(lte(companyMaintenanceRecords.scheduledFor, new Date(`${args.hasta}T23:59:59`)));

    // Normalizamos estado y tipo. Si el LLM mandó un valor irreconocible,
    // lo ignoramos (no rompe la query con PG).
    const estadosNorm = toList(args.estado)
      .map(normalizeEstado)
      .filter((v): v is MantEstado => v !== null);
    if (estadosNorm.length > 0) {
      const unique = Array.from(new Set(estadosNorm));
      where.push(
        unique.length === 1
          ? eq(companyMaintenanceRecords.status, unique[0]!)
          : inArray(companyMaintenanceRecords.status, unique),
      );
    }
    const tiposNorm = toList(args.tipo)
      .map(normalizeTipo)
      .filter((v): v is MantTipo => v !== null);
    if (tiposNorm.length > 0) {
      const unique = Array.from(new Set(tiposNorm));
      where.push(
        unique.length === 1
          ? eq(companyMaintenanceRecords.type, unique[0]!)
          : inArray(companyMaintenanceRecords.type, unique),
      );
    }

    // Si pasaron `placa`, resolvemos a un assetId (o varios) en una sola query.
    let resolvedAssetIds: number[] | null = null;
    if (args.placa && !args.assetId) {
      const matches = await db
        .select({ id: companyAssets.id })
        .from(companyAssets)
        .where(and(
          eq(companyAssets.companyId, ctx.empresaId),
          ilike(companyAssets.plate, `%${args.placa}%`),
        ))
        .limit(20);
      if (!matches.length) {
        return { data: [], total: 0, note: `No se encontraron vehículos con placa que contenga "${args.placa}".` };
      }
      resolvedAssetIds = matches.map((m) => m.id);
    }
    if (args.assetId) {
      where.push(eq(companyMaintenanceRecords.assetId, args.assetId));
    } else if (resolvedAssetIds && resolvedAssetIds.length === 1) {
      where.push(eq(companyMaintenanceRecords.assetId, resolvedAssetIds[0]!));
    } else if (resolvedAssetIds && resolvedAssetIds.length > 1) {
      where.push(sql`${companyMaintenanceRecords.assetId} = ANY(${resolvedAssetIds})`);
    }

    const rows = await db
      .select({
        id:           companyMaintenanceRecords.id,
        titulo:       companyMaintenanceRecords.title,
        tipo:         companyMaintenanceRecords.type,
        estado:       companyMaintenanceRecords.status,
        categoria:    companyMaintenanceRecords.category,
        fechaProg:    companyMaintenanceRecords.scheduledFor,
        fechaEjec:    companyMaintenanceRecords.executedAt,
        fechaFin:     companyMaintenanceRecords.completedAt,
        costo:        companyMaintenanceRecords.totalCost,
        odometro:     companyMaintenanceRecords.odometerKm,
        notas:        companyMaintenanceRecords.notes,
        assetId:      companyMaintenanceRecords.assetId,
        placa:        companyAssets.plate,
        marca:        companyAssets.brand,
        modelo:       companyAssets.model,
      })
      .from(companyMaintenanceRecords)
      .leftJoin(companyAssets, eq(companyMaintenanceRecords.assetId, companyAssets.id))
      .where(and(...where))
      .orderBy(desc(companyMaintenanceRecords.scheduledFor))
      .limit(500);

    return {
      data: rows,
      total: rows.length,
      note: `Mostrando ${rows.length} mantenimiento(s).`,
    };
  },
};