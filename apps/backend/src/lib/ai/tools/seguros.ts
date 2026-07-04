// lib/ai/tools/seguros.ts
//
// Tool: getSeguros
// Lista pólizas de seguro de la empresa. Filtra por:
//   - estado (Vigente, Vencida, etc.)
//   - porVencer (true → solo las que vencen en los próximos N días)
//   - vehículo (assetId o placa)
//   - rango de fechas de inicio/fin

import { z } from 'zod';
import { and, eq, gte, inArray, lte, desc, ilike, sql } from 'drizzle-orm';
import { db } from '../../../db/client';
import { companyInsurancePolicies, companyAssets } from '../../../db/schema/operational';
import type { ToolDefinition, ToolResult } from './registry';
import { tolerantString, tolerantNumber, tolerantAssetId, tolerantBoolean, tolerantDateString, enumOrList } from '../schema-helpers';

const argsSchema = z.object({
  estado:       enumOrList(['Vigente', 'Vencida', 'Renovada', 'Cancelada']).optional(),
  porVencer:    tolerantBoolean().optional().default(false),
  dias:         tolerantNumber().int().positive().max(365).optional().default(30),
  assetId:      tolerantAssetId(),
  placa:        tolerantString().optional(),
  desde:        tolerantDateString().optional(),
  hasta:        tolerantDateString().optional(),
  // limit removido del schema público — ver nota en vehiculos.ts.
});

type Args = z.infer<typeof argsSchema>;

export const segurosTool: ToolDefinition<Args> = {
  name:        'getSeguros',
  description:
    'Lista pólizas de seguro de la empresa. Filtros: estado, porVencer (true para ver solo las próximas a vencer en N días), vehículo (assetId o placa), rango de fechas de inicio/fin. Devuelve aseguradora, número de póliza, cobertura, fechas y placa del vehículo.',
  category:    'seguros',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  schema:      argsSchema,

  async execute(args, ctx): Promise<ToolResult> {
    const where = [eq(companyInsurancePolicies.companyId, ctx.empresaId)];

    if (args.estado) {
      Array.isArray(args.estado)
        ? where.push(inArray(companyInsurancePolicies.status, args.estado))
        : where.push(eq(companyInsurancePolicies.status, args.estado));
    }
    if (args.desde)  where.push(gte(companyInsurancePolicies.endDate, args.desde));
    if (args.hasta)  where.push(lte(companyInsurancePolicies.startDate, args.hasta));
    if (args.assetId) where.push(eq(companyInsurancePolicies.assetId, args.assetId));

    // Placa → resolver assetIds.
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
    if (!args.assetId && resolvedAssetIds && resolvedAssetIds.length === 1) {
      where.push(eq(companyInsurancePolicies.assetId, resolvedAssetIds[0]!));
    } else if (!args.assetId && resolvedAssetIds && resolvedAssetIds.length > 1) {
      where.push(sql`${companyInsurancePolicies.assetId} = ANY(${resolvedAssetIds})`);
    }

    // Por vencer: endDate BETWEEN hoy y hoy+N días, status='Vigente'.
    if (args.porVencer) {
      const hoy = new Date().toISOString().slice(0, 10);
      const limite = new Date(Date.now() + (args.dias ?? 60) * 86_400_000).toISOString().slice(0, 10);
      where.push(gte(companyInsurancePolicies.endDate, hoy));
      where.push(lte(companyInsurancePolicies.endDate, limite));
    }

    const rows = await db
      .select({
        id:            companyInsurancePolicies.id,
        aseguradora:   companyInsurancePolicies.insurer,
        numPoliza:     companyInsurancePolicies.policyNumber,
        cobertura:     companyInsurancePolicies.coverage,
        inicio:        companyInsurancePolicies.startDate,
        fin:           companyInsurancePolicies.endDate,
        estado:        companyInsurancePolicies.status,
        notas:         companyInsurancePolicies.notes,
        placa:         companyAssets.plate,
        marca:         companyAssets.brand,
        modelo:        companyAssets.model,
      })
      .from(companyInsurancePolicies)
      .leftJoin(companyAssets, eq(companyInsurancePolicies.assetId, companyAssets.id))
      .where(and(...where))
      .orderBy(companyInsurancePolicies.endDate)
      .limit(500);

    return {
      data: rows,
      total: rows.length,
      note: args.porVencer
        ? `Mostrando ${rows.length} póliza(s) que vencen en los próximos ${args.dias ?? 60} día(s).`
        : `Mostrando ${rows.length} póliza(s).`,
    };
  },
};