// lib/ai/tools/mantenimientos.ts
//
// Tool: getMantenimientos
// Lista mantenimientos con filtros (rango de fecha, estado, tipo, vehículo).

import { z } from 'zod';
import { and, eq, gte, inArray, lte, desc, ilike, sql } from 'drizzle-orm';
import { db } from '../../../db/client';
import { companyMaintenanceRecords, companyAssets } from '../../../db/schema/operational';
import type { ToolDefinition, ToolResult } from './registry';
import { tolerantString, tolerantNumber, tolerantAssetId, tolerantDateString, enumOrList } from '../schema-helpers';

const argsSchema = z.object({
  desde:        tolerantDateString().optional(),
  hasta:        tolerantDateString().optional(),
  estado:       enumOrList(['Programado', 'En curso', 'PendienteAtencion', 'Completado', 'Cancelado', 'Correccion']).optional(),
  tipo:         enumOrList(['Correctivo', 'Programado', 'Lavada']).optional(),
  assetId:      tolerantAssetId(),
  placa:        tolerantString().optional(),
  // limit removido del schema público — ver nota en vehiculos.ts.
});

type Args = z.infer<typeof argsSchema>;

export const mantenimientosTool: ToolDefinition<Args> = {
  name:        'getMantenimientos',
  description:
    'Lista mantenimientos (servicios preventivos, correctivos, lavadas). Filtros: rango de fechas (desde/hasta YYYY-MM-DD), estado (Programado, En curso, Completado, Cancelado, Correccion, PendienteAtencion), tipo (Correctivo, Programado, Lavada), vehículo (por assetId numérico o placa parcial). Devuelve título, fecha, estado, costo y placa del vehículo.',
  category:    'mantenimientos',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  schema:      argsSchema,

  async execute(args, ctx): Promise<ToolResult> {
    const where = [eq(companyMaintenanceRecords.companyId, ctx.empresaId)];

    if (args.desde)  where.push(gte(companyMaintenanceRecords.scheduledFor, new Date(args.desde)));
    if (args.hasta)  where.push(lte(companyMaintenanceRecords.scheduledFor, new Date(`${args.hasta}T23:59:59`)));
    // enumOrList puede devolver un único valor o un array; manejamos ambos.
    if (args.estado) {
      Array.isArray(args.estado)
        ? where.push(inArray(companyMaintenanceRecords.status, args.estado))
        : where.push(eq(companyMaintenanceRecords.status, args.estado));
    }
    if (args.tipo) {
      Array.isArray(args.tipo)
        ? where.push(inArray(companyMaintenanceRecords.type, args.tipo))
        : where.push(eq(companyMaintenanceRecords.type, args.tipo));
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