// lib/ai/tools/asignaciones.ts
//
// Tool: getAsignaciones
// Lista asignaciones (conductor ↔ vehículo) con filtros:
//   - estado (Activa / Finalizada / Inactiva)
//   - conductor (driverId)
//   - vehículo (assetId o placa)

import { z } from 'zod';
import { and, eq, gte, inArray, lte, desc, ilike, sql } from 'drizzle-orm';
import { db } from '../../../db/client';
import {
  companyAssignments,
  companyAssets,
  companyDrivers,
} from '../../../db/schema/operational';
import type { ToolDefinition, ToolResult } from './registry';
import { tolerantString, tolerantNumber, tolerantAssetId, tolerantDateString, enumOrList } from '../schema-helpers';

const argsSchema = z.object({
  estado:      enumOrList(['Activa', 'Finalizada', 'Inactiva']).optional(),
  driverId:    tolerantNumber().int().positive().optional(),
  assetId:     tolerantAssetId(),
  placa:       tolerantString().optional(),
  desde:       tolerantDateString().optional(),
  hasta:       tolerantDateString().optional(),
  // limit removido del schema público — ver nota en vehiculos.ts.
});

type Args = z.infer<typeof argsSchema>;

export const asignacionesTool: ToolDefinition<Args> = {
  name:        'getAsignaciones',
  description:
    'Lista asignaciones (vínculo Conductor ↔ Vehículo) con filtros: estado (Activa/Finalizada/Inactiva), conductor (driverId), vehículo (assetId o placa), rango de fechas de inicio (desde/hasta). Devuelve fecha de inicio, fin, estado, conductor y vehículo.',
  category:    'asignaciones',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  schema:      argsSchema,

  async execute(args, ctx): Promise<ToolResult> {
    const where = [eq(companyAssignments.companyId, ctx.empresaId)];
    if (args.estado) {
      Array.isArray(args.estado)
        ? where.push(inArray(companyAssignments.status, args.estado))
        : where.push(eq(companyAssignments.status, args.estado));
    }
    if (args.driverId) where.push(eq(companyAssignments.driverId, args.driverId));
    if (args.assetId) where.push(eq(companyAssignments.assetId, args.assetId));
    if (args.desde) where.push(gte(companyAssignments.startDate, args.desde));
    if (args.hasta) where.push(lte(companyAssignments.startDate, args.hasta));

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
        ? eq(companyAssignments.assetId, ids[0]!)
        : sql`${companyAssignments.assetId} = ANY(${ids})`);
    }

    const rows = await db
      .select({
        id:         companyAssignments.id,
        inicio:     companyAssignments.startDate,
        fin:        companyAssignments.endDate,
        estado:     companyAssignments.status,
        acta:       companyAssignments.actaNumber,
        kmEntrega:  companyAssignments.vehicleOdometer,
        placa:      companyAssets.plate,
        marca:      companyAssets.brand,
        modelo:     companyAssets.model,
        conductor:  sql<string>`CONCAT(${companyDrivers.firstName}, ' ', ${companyDrivers.lastName})`,
      })
      .from(companyAssignments)
      .leftJoin(companyAssets, eq(companyAssignments.assetId, companyAssets.id))
      .leftJoin(companyDrivers, eq(companyAssignments.driverId, companyDrivers.id))
      .where(and(...where))
      .orderBy(desc(companyAssignments.startDate))
      .limit(500);

    return {
      data: rows,
      total: rows.length,
      note: `Mostrando ${rows.length} asignación(es).`,
    };
  },
};