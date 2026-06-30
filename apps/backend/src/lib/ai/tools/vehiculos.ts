// lib/ai/tools/vehiculos.ts
//
// Tool: getVehiculos
// Lista los vehículos de la empresa con filtros opcionales.

import { z } from 'zod';
import { and, eq, ilike, inArray } from 'drizzle-orm';
import { db } from '../../../db/client';
import { companyAssets } from '../../../db/schema/operational';
import type { ToolDefinition, ToolResult } from './registry';
import { tolerantString, enumOrList } from '../schema-helpers';

// Nota: el campo `limit` se removió del schema público porque el LLM
// (llama-3.1-8b-instant) tiende a generar `limit: 0` que Groq rechaza
// con 400. El backend usa siempre 500 (suficiente para listas de flota).
const argsSchema = z.object({
  estado:  enumOrList(['Disponible', 'En uso', 'Fuera de servicio', 'En mantenimiento']).optional(),
  placa:   tolerantString().optional(),
  marca:   tolerantString().optional(),
});

type Args = z.infer<typeof argsSchema>;

export const vehiculosTool: ToolDefinition<Args> = {
  name:        'getVehiculos',
  description:
    'Lista los vehículos de la empresa. Filtros opcionales: estado (Operativo / En mantenimiento / Fuera de servicio / Disponible / No disponible), placa (búsqueda parcial), marca. Devuelve placa, marca, modelo, año, estado y odómetro.',
  category:    'vehiculos',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  schema:      argsSchema,

  async execute(args, ctx): Promise<ToolResult> {
    const where = [eq(companyAssets.companyId, ctx.empresaId)];

    if (args.estado) {
      Array.isArray(args.estado)
        ? where.push(inArray(companyAssets.status, args.estado))
        : where.push(eq(companyAssets.status, args.estado));
    }
    if (args.placa) where.push(ilike(companyAssets.plate, `%${args.placa}%`));
    if (args.marca) where.push(ilike(companyAssets.brand, `%${args.marca}%`));

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
      })
      .from(companyAssets)
      .where(and(...where))
      .orderBy(companyAssets.plate)
      .limit(500);

    return {
      data: rows,
      total: rows.length,
      note: `Mostrando ${rows.length} vehículo(s).`,
    };
  },
};