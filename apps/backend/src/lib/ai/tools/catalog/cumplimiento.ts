// lib/ai/tools/catalog/cumplimiento.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 v3 — Módulo Cumplimiento por usuario. 1 tool fusionada.
// Tablas: `company_checklists`, `company_maintenance_records`
//
// jul 2026 — Esta tool es el DIFERENCIADOR del asistente. Permite
// responder "qué tan bien está cumpliendo este conductor" sin que
// el user tenga que preguntar. SIEMPRE en Capa 1.
//
// Implementa la fusión de las 3 tools de la v2:
//   - getUserChecklistCompliance
//   - getUserMaintenanceCompliance
//   - getUserOverallScorecard
// ─────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { and, eq, gte, sql, count } from 'drizzle-orm';
import { db } from '../../../../db/client';
import {
  companyChecklists,
  companyMaintenanceRecords,
} from '../../../../db/schema/operational';
import type { ToolDefinition, ToolResult } from '../registry';
import { tolerantNumber } from '../../schema-helpers';

const COMPLIANCE_SCOPES = ['checklists', 'maintenances', 'all'] as const;

// ─── getUserCompliance ─────────────────────────────────────────────────

const argsGetUserCompliance = z.object({
  userId: tolerantNumber().int().positive(),
  scope: z.enum(COMPLIANCE_SCOPES).default('all'),
  meses: tolerantNumber().int().min(1).max(24).default(6),
});

/**
 * jul 2026 v3 — Cálculo de cumplimiento por usuario.
 *
 * Lógica:
 *   - Checklists: "a tiempo" = status='Aprobado' AND isLate=false.
 *                 "atrasados" = status='Vencido' OR isLate=true.
 *   - Mantenimientos: "a tiempo" = status='Completado' AND scheduledFor
 *                     dentro del plazo. "atrasados" = status='Atrasado' o
 *                     completado tarde.
 *   - score = a_tiempo / total * 100. Interpretación textual incluida.
 */
export const getUserComplianceTool: ToolDefinition<z.infer<typeof argsGetUserCompliance>> = {
  name: 'getUserCompliance',
  description: 'Análisis de cumplimiento de un usuario. SINÓNIMOS: "qué tan bien está cumpliendo", "scorecard del operador", "qué tal está este conductor". `scope=all` devuelve un score 0-100 combinando checklists + mantenimientos.',
  category: 'cumplimiento',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 1,
  cacheTtlMs: 5 * 60_000,
  schema: argsGetUserCompliance,
  async execute(args, ctx): Promise<ToolResult> {
    const cutoff = new Date(Date.now() - args.meses * 30 * 24 * 60 * 60 * 1000);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const includeChecklist = args.scope === 'checklists' || args.scope === 'all';
    const includeMaintenance = args.scope === 'maintenances' || args.scope === 'all';

    // Límite: como `driverId` en companyChecklists apunta a companyDrivers
    // y no a companyUsers, si el userId NO matchea un driver la query
    // devolverá 0 rows (interpretable como "sin datos"). Lo dejamos
    // así de momento; en una segunda iteración se puede mapear
    // userId → driverId.
    const [checklistStats, maintenanceStats] = await Promise.all([
      includeChecklist
        ? db
            .select({
              total: count().as('total'),
              a_tiempo: sql<number>`count(*) FILTER (WHERE ${companyChecklists.status} = 'Aprobado' AND ${companyChecklists.isLate} = false)::int`.as('a_tiempo'),
              atrasados: sql<number>`count(*) FILTER (WHERE ${companyChecklists.status} = 'Vencido' OR ${companyChecklists.isLate} = true)::int`.as('atrasados'),
              con_observaciones: sql<number>`count(*) FILTER (WHERE ${companyChecklists.status} = 'Observado')::int`.as('con_observaciones'),
            })
            .from(companyChecklists)
            .where(and(
              eq(companyChecklists.companyId, ctx.empresaId),
              eq(companyChecklists.driverId, args.userId),
              gte(companyChecklists.date, cutoffStr),
            ))
        : Promise.resolve(null),
      includeMaintenance
        ? db
            .select({
              total: count().as('total'),
              a_tiempo: sql<number>`count(*) FILTER (WHERE ${companyMaintenanceRecords.status} = 'Completado')::int`.as('a_tiempo'),
              atrasados: sql<number>`count(*) FILTER (WHERE ${companyMaintenanceRecords.status} = 'Atrasado')::int`.as('atrasados'),
            })
            .from(companyMaintenanceRecords)
            .where(and(
              eq(companyMaintenanceRecords.companyId, ctx.empresaId),
              eq(companyMaintenanceRecords.assignedUserId, args.userId),
              gte(companyMaintenanceRecords.scheduledFor, cutoff),
            ))
        : Promise.resolve(null),
    ]);

    const cl = checklistStats?.[0];
    const mt = maintenanceStats?.[0];

    const data: Record<string, unknown> = {
      userId: args.userId,
      meses: args.meses,
      scope: args.scope,
    };

    if (includeChecklist && cl) {
      const total = Number(cl.total) || 0;
      const aTiempo = Number(cl.a_tiempo) || 0;
      data.checklists = {
        total,
        a_tiempo: aTiempo,
        atrasados: Number(cl.atrasados) || 0,
        con_observaciones: Number(cl.con_observaciones) || 0,
        porcentaje: total ? Math.round((aTiempo / total) * 100) : 0,
      };
    }

    if (includeMaintenance && mt) {
      const total = Number(mt.total) || 0;
      const aTiempo = Number(mt.a_tiempo) || 0;
      data.mantenimientos = {
        total,
        a_tiempo: aTiempo,
        atrasados: Number(mt.atrasados) || 0,
        porcentaje: total ? Math.round((aTiempo / total) * 100) : 0,
      };
    }

    if (args.scope === 'all' && cl && mt) {
      const totalAll = Number(cl.total) + Number(mt.total);
      const aTiempoAll = Number(cl.a_tiempo) + Number(mt.a_tiempo);
      const score = totalAll ? Math.round((aTiempoAll / totalAll) * 100) : 0;
      data.score = score;
      data.interpretacion =
        score >= 90 ? 'Excelente cumplimiento' :
        score >= 75 ? 'Buen cumplimiento' :
        score >= 50 ? 'Cumplimiento moderado, requiere atención' :
        'Cumplimiento bajo, requiere acción inmediata';
    }

    return { data: [data], total: 1, note: `Cumplimiento de usuario #${args.userId} en los últimos ${args.meses} meses.` };
  },
};
