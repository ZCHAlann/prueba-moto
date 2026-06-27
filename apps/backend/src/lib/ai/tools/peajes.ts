// lib/ai/tools/peajes.ts
//
// Tool: getPeajes
// Lista registros de peajes con filtros:
//   - rango de fechas
//   - vehículo (assetId o placa)
//   - ruta o nombre del peaje

import { z } from 'zod';
import { and, eq, gte, lte, desc, ilike, sql, sum } from 'drizzle-orm';
import { db } from '../../../db/client';
import {
  companyTollEntries,
  companyAssets,
  companyDrivers,
} from '../../../db/schema/operational';
import type { ToolDefinition, ToolResult } from './registry';
import { tolerantString, tolerantNumber, tolerantDateString } from '../schema-helpers';

const argsSchema = z.object({
  desde:     tolerantDateString().optional(),
  hasta:     tolerantDateString().optional(),
  assetId:   tolerantNumber().int().positive().optional(),
  placa:     tolerantString().optional(),
  ruta:      tolerantString().optional(),
  // limit removido del schema público — ver nota en vehiculos.ts.
});

type Args = z.infer<typeof argsSchema>;

export const peajesTool: ToolDefinition<Args> = {
  name:        'getPeajes',
  description:
    'Lista registros de peajes con filtros: rango de fechas (desde/hasta YYYY-MM-DD), vehículo (assetId o placa), ruta (texto parcial). Devuelve fecha, nombre del peaje, ruta, costo y vehículo. Incluye el total gastado.',
  category:    'peajes',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  schema:      argsSchema,

  async execute(args, ctx): Promise<ToolResult> {
    const where = [eq(companyTollEntries.companyId, ctx.empresaId)];
    if (args.desde) where.push(gte(companyTollEntries.date, args.desde));
    if (args.hasta) where.push(lte(companyTollEntries.date, args.hasta));
    if (args.assetId) where.push(eq(companyTollEntries.assetId, args.assetId));
    if (args.ruta)   where.push(ilike(companyTollEntries.route, `%${args.ruta}%`));

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
        return { data: [], total: 0, totalGastado: '0', note: `No se encontraron vehículos con placa que contenga "${args.placa}".` };
      }
      const ids = matches.map((m) => m.id);
      where.push(ids.length === 1
        ? eq(companyTollEntries.assetId, ids[0]!)
        : sql`${companyTollEntries.assetId} = ANY(${ids})`);
    }

    const rows = await db
      .select({
        id:           companyTollEntries.id,
        fecha:        companyTollEntries.date,
        nombrePeaje:  companyTollEntries.tollName,
        categoria:    companyTollEntries.category,
        ruta:         companyTollEntries.route,
        costo:        companyTollEntries.amount,
        metodoPago:   companyTollEntries.paymentMethod,
        ejes:         companyTollEntries.axes,
        placa:        companyAssets.plate,
        marca:        companyAssets.brand,
        modelo:       companyAssets.model,
        conductor:    sql<string>`CONCAT(${companyDrivers.firstName}, ' ', ${companyDrivers.lastName})`,
      })
      .from(companyTollEntries)
      .leftJoin(companyAssets, eq(companyTollEntries.assetId, companyAssets.id))
      .leftJoin(companyDrivers, eq(companyTollEntries.driverId, companyDrivers.id))
      .where(and(...where))
      .orderBy(desc(companyTollEntries.date))
      .limit(500);

    const [{ totalG } = { totalG: '0' }] = await db
      .select({ totalG: sum(companyTollEntries.amount).as('totalG') })
      .from(companyTollEntries)
      .where(and(...where));

    return {
      data: rows,
      total: rows.length,
      totalGastado: String(totalG ?? 0),
      note: `Mostrando ${rows.length} cruce(s) de peaje. Total gastado: ${totalG ?? 0}.`,
    };
  },
};