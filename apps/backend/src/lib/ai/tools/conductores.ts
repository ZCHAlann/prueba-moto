// lib/ai/tools/conductores.ts
//
// Tool: getConductores
// Lista conductores con filtros:
//   - estado (Activo/Inactivo)
//   - búsqueda libre por nombre / código / cédula

import { z } from 'zod';
import { and, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '../../../db/client';
import { companyDrivers, companyAssets, companyAssignments } from '../../../db/schema/operational';
import type { ToolDefinition, ToolResult } from './registry';
import { tolerantString, tolerantBoolean, enumOrList } from '../schema-helpers';

const argsSchema = z.object({
  estado:    enumOrList(['Activo', 'Inactivo']).optional(),
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
  kind: 'read',
  layer: 1,
  cacheTtlMs: 60000,
  schema:      argsSchema,

  async execute(args, ctx): Promise<ToolResult> {
    const where = [eq(companyDrivers.companyId, ctx.empresaId)];
    if (args.estado) {
      Array.isArray(args.estado)
        ? where.push(inArray(companyDrivers.status, args.estado))
        : where.push(eq(companyDrivers.status, args.estado));
    }
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
      // jul 2026 v3 — Bug fix: la query anterior usaba una subquery
      // escalar dentro de la cláusula `ON` del LEFT JOIN, que
      // PostgreSQL NO soporta con esa sintaxis (la query decía
      // "left join ... on ... = (SELECT ...)"). Rompía con error
      // "Failed query" en runtime para todas las llamadas a
      // getConductores({conAsignacion: true}).
      //
      // Solución: hacer 2 queries separados. (a) Traer los IDs de
      // asignación activa por driver. (b) Traer los assets de esos
      // IDs. (c) Joinear en memoria. Funciona, es O(N) y no
      // necesita un join SQL complejo.
      const asigRows = await db
        .select({
          driverId: companyAssignments.driverId,
          assetId:  companyAssignments.assetId,
        })
        .from(companyAssignments)
        .where(and(
          eq(companyAssignments.status, 'Activa'),
          // jul 2026 v3 — Bug fix: `sql`...ANY(${driverIds})` expande
          // cada elemento del array como un placeholder separado,
          // y `= ANY((1, 2, 3))` con 3 escalares NO es SQL válido
          // (debería ser `= ANY(ARRAY[1, 2, 3])` o usar `inArray`).
          // Usamos `inArray` que sí lo formatea correctamente como
          // `= ANY($1::int[])` con un solo parámetro array.
          inArray(companyAssignments.driverId, driverIds),
        ));
      const assetIds = Array.from(new Set(asigRows.map((a) => a.assetId).filter((x): x is number => !!x)));
      let assetsMap = new Map<number, { plate: string | null; brand: string | null; model: string | null }>();
      if (assetIds.length > 0) {
        const assets = await db
          .select({
            id:    companyAssets.id,
            plate: companyAssets.plate,
            brand: companyAssets.brand,
            model: companyAssets.model,
          })
          .from(companyAssets)
          .where(inArray(companyAssets.id, assetIds));
        assetsMap = new Map(assets.map((a) => [a.id, { plate: a.plate, brand: a.brand, model: a.model }]));
      }
      const mapAsig = new Map<number, { placa: string; marca: string; modelo: string }>();
      for (const a of asigRows) {
        if (!a.assetId) continue;
        const asset = assetsMap.get(a.assetId);
        if (asset) {
          mapAsig.set(a.driverId, {
            placa:  asset.plate  ?? '',
            marca:  asset.brand  ?? '',
            modelo: asset.model  ?? '',
          });
        }
      }
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