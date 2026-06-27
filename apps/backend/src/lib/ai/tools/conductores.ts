// lib/ai/tools/conductores.ts
//
// Tool: getConductores
// Lista conductores con filtros:
//   - estado (Activo/Inactivo)
//   - búsqueda libre por nombre / código / cédula

import { z } from 'zod';
import { and, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '../../../db/client';
import { companyDrivers, companyAssets } from '../../../db/schema/operational';
import type { ToolDefinition, ToolResult } from './registry';
import { tolerantString, tolerantBoolean } from '../schema-helpers';

const argsSchema = z.object({
  estado:    z.enum(['Activo', 'Inactivo']).optional(),
  q:         tolerantString().optional(),
  conAsignacion: tolerantBoolean().optional().default(false),
  // limit removido del schema público — ver nota en vehiculos.ts.
});

type Args = z.infer<typeof argsSchema>;

export const conductoresTool: ToolDefinition<Args> = {
  name:        'getConductores',
  description:
    'Lista conductores con filtros: estado (Activo/Inactivo), búsqueda libre por nombre/código/cédula, conAsignacion (true para incluir el vehículo asignado actualmente). Devuelve nombre, código, cédula, teléfono y (opcional) vehículo asignado.',
  category:    'conductores',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  schema:      argsSchema,

  async execute(args, ctx): Promise<ToolResult> {
    const where = [eq(companyDrivers.companyId, ctx.empresaId)];
    if (args.estado) where.push(eq(companyDrivers.status, args.estado));
    if (args.q) {
      where.push(or(
        ilike(companyDrivers.firstName, `%${args.q}%`),
        ilike(companyDrivers.lastName,  `%${args.q}%`),
        ilike(companyDrivers.code,      `%${args.q}%`),
        ilike(companyDrivers.licenseNumber, `%${args.q}%`),
      )!);
    }

    const rows = await db
      .select({
        id:           companyDrivers.id,
        codigo:       companyDrivers.code,
        nombre:       companyDrivers.firstName,
        apellido:     companyDrivers.lastName,
        cedula:       companyDrivers.licenseNumber,
        telefono:     companyDrivers.phone,
        email:        companyDrivers.email,
        estado:       companyDrivers.status,
        licVenc:      companyDrivers.licenseExpiry,
      })
      .from(companyDrivers)
      .where(and(...where))
      .orderBy(companyDrivers.lastName)
      .limit(500);

    // Si pidió conAsignacion, hacemos un LEFT JOIN a la asignación activa de cada uno.
    if (args.conAsignacion && rows.length > 0) {
      const driverIds = rows.map((r) => r.id);
      const asigs = await db
        .select({
          driverId: companyDrivers.id,
          placa:    companyAssets.plate,
          marca:    companyAssets.brand,
          modelo:   companyAssets.model,
        })
        .from(companyDrivers)
        .leftJoin(companyAssets, eq(companyAssets.id, sql`(
          SELECT asset_id FROM company_assignments
          WHERE driver_id = ${companyDrivers.id}
            AND status = 'Activa'
          LIMIT 1
        )`))
        .where(and(
          eq(companyDrivers.companyId, ctx.empresaId),
          sql`${companyDrivers.id} = ANY(${driverIds})`,
        ));
      const mapAsig = new Map(asigs.map((a) => [a.driverId, a]));
      const enriched = rows.map((r) => ({
        ...r,
        vehiculoAsignado: mapAsig.get(r.id) ?? null,
      }));
      return {
        data: enriched,
        total: enriched.length,
        note: `Mostrando ${enriched.length} conductor(es) con asignación actual.`,
      };
    }

    return {
      data: rows,
      total: rows.length,
      note: `Mostrando ${rows.length} conductor(es).`,
    };
  },
};