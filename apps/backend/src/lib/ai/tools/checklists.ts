// lib/ai/tools/checklists.ts
//
// Tool: getChecklists
// Lista inspecciones de checklists con filtros:
//   - estado (Aprobado / Observado / Pendiente / Rechazado)
//   - vehiculo (assetId o placa)
//   - conductor (driverId)
//   - rango de fechas

import { z } from 'zod';
import { and, eq, gte, inArray, lte, desc, ilike, sql } from 'drizzle-orm';
import { db } from '../../../db/client';
import {
  companyChecklists,
  companyAssets,
  companyDrivers,
} from '../../../db/schema/operational';
import type { ToolDefinition, ToolResult } from './registry';
import { tolerantString, tolerantNumber, tolerantAssetId, tolerantBoolean, tolerantDateString, enumOrList } from '../schema-helpers';

const argsSchema = z.object({
  estado:    enumOrList(['Aprobado', 'Observado', 'Pendiente', 'Rechazado']).optional(),
  assetId:   tolerantAssetId(),
  placa:     tolerantString().optional(),
  driverId:  tolerantNumber().int().positive().optional(),
  desde:     tolerantDateString().optional(),
  hasta:     tolerantDateString().optional(),
  soloVencidos: tolerantBoolean().optional().default(false),
  // limit removido del schema público — ver nota en vehiculos.ts.
});

type Args = z.infer<typeof argsSchema>;

export const checklistsTool: ToolDefinition<Args> = {
  name:        'getChecklists',
  description:
    'Lista inspecciones de checklists. Filtros: estado (Aprobado/Observado/Pendiente/Rechazado), vehículo (assetId o placa parcial), conductor (driverId), rango de fechas (desde/hasta YYYY-MM-DD), soloVencidos (true para ver solo los pendientes vencidos). Devuelve fecha, estado, vehículo y conductor.',
  category:    'checklists',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  schema:      argsSchema,

  async execute(args, ctx): Promise<ToolResult> {
    const where = [eq(companyChecklists.companyId, ctx.empresaId)];

    if (args.estado) {
      Array.isArray(args.estado)
        ? where.push(inArray(companyChecklists.status, args.estado))
        : where.push(eq(companyChecklists.status, args.estado));
    }
    if (args.desde)    where.push(gte(companyChecklists.date, args.desde));
    if (args.hasta)    where.push(lte(companyChecklists.date, args.hasta));
    if (args.assetId)  where.push(eq(companyChecklists.assetId, args.assetId));
    if (args.driverId) where.push(eq(companyChecklists.driverId, args.driverId));

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
      const ids = matches.map((m) => m.id);
      where.push(ids.length === 1
        ? eq(companyChecklists.assetId, ids[0]!)
        : sql`${companyChecklists.assetId} = ANY(${ids})`);
    }

    if (args.soloVencidos) {
      const hoy = new Date().toISOString().slice(0, 10);
      where.push(lte(companyChecklists.date, hoy));
      // status 'Pendiente' u 'Observado' (no cerrados).
      where.push(sql`${companyChecklists.status} IN ('Pendiente','Observado')`);
    }

    const rows = await db
      .select({
        id:         companyChecklists.id,
        fecha:      companyChecklists.date,
        estado:     companyChecklists.status,
        targetKind: companyChecklists.targetKind,
        targetLbl:  companyChecklists.targetLabel,
        resumen:    companyChecklists.summary,
        placa:      companyAssets.plate,
        marca:      companyAssets.brand,
        modelo:     companyAssets.model,
        conductor:  sql<string>`CONCAT(${companyDrivers.firstName}, ' ', ${companyDrivers.lastName})`,
      })
      .from(companyChecklists)
      .leftJoin(companyAssets, eq(companyChecklists.assetId, companyAssets.id))
      .leftJoin(companyDrivers, eq(companyChecklists.driverId, companyDrivers.id))
      .where(and(...where))
      .orderBy(desc(companyChecklists.date))
      .limit(500);

    return {
      data: rows,
      total: rows.length,
      note: args.soloVencidos
        ? `Mostrando ${rows.length} checklist(s) vencido(s).`
        : `Mostrando ${rows.length} checklist(s).`,
    };
  },
};