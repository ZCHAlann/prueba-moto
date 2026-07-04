// lib/ai/tools/combustible.ts
//
// Tool: getCombustible
// Lista entradas de combustible con filtros (rango de fecha, vehículo).

import { z } from 'zod';
import { and, eq, gte, lte, desc, ilike, sql, sum } from 'drizzle-orm';
import { db } from '../../../db/client';
import { companyFuelEntries, companyAssets } from '../../../db/schema/operational';
import type { ToolDefinition, ToolResult } from './registry';
import { tolerantString, tolerantNumber, tolerantAssetId, tolerantDateString } from '../schema-helpers';

const argsSchema = z.object({
  desde:    tolerantDateString().optional(),
  hasta:    tolerantDateString().optional(),
  assetId:  tolerantAssetId(),
  placa:    tolerantString().optional(),
  // limit removido del schema público — ver nota en vehiculos.ts.
});

type Args = z.infer<typeof argsSchema>;

export const combustibleTool: ToolDefinition<Args> = {
  name:        'getCombustible',
  description:
    'Lista entradas de carga de combustible. Filtros: rango de fechas (desde/hasta YYYY-MM-DD), vehículo (por assetId numérico o placa parcial). Devuelve fecha, galones US, costo, odómetro, estación y placa.',
  category:    'combustible',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  schema:      argsSchema,

  async execute(args, ctx): Promise<ToolResult> {
    const where = [eq(companyFuelEntries.companyId, ctx.empresaId)];
    if (args.desde) where.push(gte(companyFuelEntries.date, args.desde));
    if (args.hasta) where.push(lte(companyFuelEntries.date, args.hasta));

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
      where.push(eq(companyFuelEntries.assetId, args.assetId));
    } else if (resolvedAssetIds && resolvedAssetIds.length === 1) {
      where.push(eq(companyFuelEntries.assetId, resolvedAssetIds[0]!));
    } else if (resolvedAssetIds && resolvedAssetIds.length > 1) {
      where.push(sql`${companyFuelEntries.assetId} = ANY(${resolvedAssetIds})`);
    }

    const rows = await db
      .select({
        id:        companyFuelEntries.id,
        fecha:     companyFuelEntries.date,
        galones:   companyFuelEntries.gallons,
        costo:     companyFuelEntries.cost,
        odometro:  companyFuelEntries.odometer,
        estacion:  companyFuelEntries.station,
        tipoComb:  companyFuelEntries.fuelType,
        placa:     companyAssets.plate,
        marca:     companyAssets.brand,
      })
      .from(companyFuelEntries)
      .leftJoin(companyAssets, eq(companyFuelEntries.assetId, companyAssets.id))
      .where(and(...where))
      .orderBy(desc(companyFuelEntries.date))
      .limit(500);

    return {
      data: rows,
      total: rows.length,
      note: `Mostrando ${rows.length} carga(s) de combustible.`,
    };
  },
};