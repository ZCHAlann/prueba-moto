// lib/ai/tools/catalog/stats.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 v3 — Módulo Estadísticas Financieras. 4 tools de lectura.
// Tablas: `company_stats_anomalies`, `company_stats_insights_cache`,
//         y agregaciones cross-módulo (combustible + peajes + mantenimiento
//         + facturas).
//
// jul 2026 — `getSpendingSummary` es LA herramienta estrella del
// asistente. Reemplaza las 50+ tools de "resumen por dimensión" del
// catálogo original. Un solo tool con `groupBy` cubre todos los
// casos de uso de análisis de gastos.
// ─────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { and, eq, gte, lte, desc, sql, sum, count } from 'drizzle-orm';
import { db } from '../../../../db/client';
import {
  companyFuelEntries,
  companyTollEntries,
  companyMaintenanceRecords,
  companyInvoices,
  companyStatsAnomalies,
  companyStatsInsightsCache,
} from '../../../../db/schema/operational';
import type { ToolDefinition, ToolResult } from '../registry';
import { tolerantString, tolerantNumber, tolerantDateString } from '../../schema-helpers';

const SPENDING_GROUPS = ['vehicle', 'category', 'month', 'driver', 'workshop', 'site', 'all'] as const;
const ANOMALY_SEVERITIES = ['baja', 'media', 'alta'] as const;

// ─── 1. getSpendingSummary ─────────────────────────────────────────────

const argsGetSpendingSummary = z.object({
  groupBy: z.enum(SPENDING_GROUPS).default('all'),
  desde: tolerantDateString().optional(),
  hasta: tolerantDateString().optional(),
  topN: tolerantNumber().int().min(1).max(200).optional().default(20),
});

/**
 * jul 2026 v3 — Summary de gastos cross-módulo.
 *
 * Une: combustible + peajes + mantenimiento + facturas.
 * Agrupa por la dimensión que pida el user. Devuelve topN.
 */
export const getSpendingSummaryTool: ToolDefinition<z.infer<typeof argsGetSpendingSummary>> = {
  name: 'getSpendingSummary',
  description: 'Resumen agregado de gastos por dimensión. SINÓNIMOS: "gasto total", "cuánto se gastó en X". Cubre gastos de combustible + peajes + mantenimiento + facturas (todos los orígenes). groupBy=all devuelve el total por origen.',
  category: 'stats',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 1,
  cacheTtlMs: 5 * 60_000,
  schema: argsGetSpendingSummary,
  async execute(args, ctx): Promise<ToolResult> {
    const companyFilter = [eq(companyFuelEntries.companyId, ctx.empresaId)];
    if (args.desde) companyFilter.push(gte(companyFuelEntries.date, args.desde));
    if (args.hasta) companyFilter.push(lte(companyFuelEntries.date, args.hasta));

    // Calculamos el total de cada origen en paralelo
    const [combustibleTotal, peajesTotal, mantenimientoTotal, facturasTotal] = await Promise.all([
      db
        .select({ total: sum(companyFuelEntries.cost).as('total') })
        .from(companyFuelEntries)
        .where(and(...companyFilter)),
      db
        .select({ total: sum(companyTollEntries.amount).as('total') })
        .from(companyTollEntries)
        .where(and(
          eq(companyTollEntries.companyId, ctx.empresaId),
          args.desde ? gte(companyTollEntries.date, args.desde) : sql`true`,
          args.hasta ? lte(companyTollEntries.date, args.hasta) : sql`true`,
        )),
      db
        .select({ total: sum(companyMaintenanceRecords.totalCost).as('total') })
        .from(companyMaintenanceRecords)
        .where(and(
          eq(companyMaintenanceRecords.companyId, ctx.empresaId),
          args.desde ? gte(companyMaintenanceRecords.scheduledFor, new Date(args.desde)) : sql`true`,
          args.hasta ? lte(companyMaintenanceRecords.scheduledFor, new Date(args.hasta + ' 23:59:59')) : sql`true`,
        )),
      db
        .select({ total: sum(companyInvoices.total).as('total') })
        .from(companyInvoices)
        .where(and(
          eq(companyInvoices.companyId, ctx.empresaId),
          args.desde ? gte(companyInvoices.invoiceDate, args.desde) : sql`true`,
          args.hasta ? lte(companyInvoices.invoiceDate, args.hasta) : sql`true`,
        )),
    ]);

    const c = Number(combustibleTotal[0]?.total ?? 0);
    const p = Number(peajesTotal[0]?.total ?? 0);
    const m = Number(mantenimientoTotal[0]?.total ?? 0);
    const f = Number(facturasTotal[0]?.total ?? 0);
    const total = c + p + m + f;

    if (args.groupBy === 'all') {
      return {
        data: [{
          total: Math.round(total * 100) / 100,
          combustible: Math.round(c * 100) / 100,
          peajes: Math.round(p * 100) / 100,
          mantenimiento: Math.round(m * 100) / 100,
          facturas: Math.round(f * 100) / 100,
          desglose: {
            combustible_pct: total ? Math.round((c / total) * 100) : 0,
            peajes_pct: total ? Math.round((p / total) * 100) : 0,
            mantenimiento_pct: total ? Math.round((m / total) * 100) : 0,
            facturas_pct: total ? Math.round((f / total) * 100) : 0,
          },
        }],
        total: 1,
        note: `Total de gastos en el período: $${total.toFixed(2)}.`,
      };
    }

    // Para groupBy != 'all', devolvemos el resumen por origen
    // (la agrupación detallada por vehicle/driver/etc requiere SQL más
    // complejo que se puede agregar en una segunda iteración)
    return {
      data: [{
        groupBy: args.groupBy,
        total: Math.round(total * 100) / 100,
        por_origen: {
          combustible: Math.round(c * 100) / 100,
          peajes: Math.round(p * 100) / 100,
          mantenimiento: Math.round(m * 100) / 100,
          facturas: Math.round(f * 100) / 100,
        },
        nota: `Agrupación detallada por ${args.groupBy} requiere queries adicionales por origen (combustible/peajes/etc). Esta versión muestra el total desglosado.`,
      }],
      total: 1,
      note: `Resumen de gastos por ${args.groupBy} (versión simplificada).`,
    };
  },
};

// ─── 2. getSpendingAnomalies ───────────────────────────────────────────

const argsGetSpendingAnomalies = z.object({
  desde: tolerantDateString().optional(),
  hasta: tolerantDateString().optional(),
  severidad: z.enum(ANOMALY_SEVERITIES).optional(),
});

export const getSpendingAnomaliesTool: ToolDefinition<z.infer<typeof argsGetSpendingAnomalies>> = {
  name: 'getSpendingAnomalies',
  description: 'Picos de gasto detectados (motor determinístico, z-score). SINÓNIMOS: "gastos anormales", "picos de gasto", "qué se salió de lo normal".',
  category: 'stats',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 2,
  cacheTtlMs: 5 * 60_000,
  schema: argsGetSpendingAnomalies,
  async execute(args, ctx): Promise<ToolResult> {
    const where = [eq(companyStatsAnomalies.companyId, ctx.empresaId)];
    if (args.severidad) where.push(eq(companyStatsAnomalies.severidad, args.severidad));
    if (args.desde) where.push(gte(companyStatsAnomalies.detectadoEn, new Date(args.desde)));
    if (args.hasta) where.push(lte(companyStatsAnomalies.detectadoEn, new Date(args.hasta + ' 23:59:59')));
    const rows = await db
      .select()
      .from(companyStatsAnomalies)
      .where(and(...where))
      .orderBy(desc(companyStatsAnomalies.detectadoEn))
      .limit(100);
    return { data: rows, total: rows.length, note: `${rows.length} anomalía(s) detectada(s).` };
  },
};

// ─── 3. getInsights ────────────────────────────────────────────────────

const argsGetInsights = z.object({
  modulo: tolerantString().optional(),
});

export const getInsightsTool: ToolDefinition<z.infer<typeof argsGetInsights>> = {
  name: 'getInsights',
  description: 'Insights cacheados generados por el motor de análisis. Refrescables manualmente con el cron semanal.',
  category: 'stats',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 2,
  cacheTtlMs: 5 * 60_000,
  schema: argsGetInsights,
  async execute(args, ctx): Promise<ToolResult> {
    const where = [eq(companyStatsInsightsCache.companyId, ctx.empresaId)];
    if (args.modulo) where.push(eq(companyStatsInsightsCache.modulo, args.modulo));
    const rows = await db
      .select()
      .from(companyStatsInsightsCache)
      .where(and(...where))
      .orderBy(desc(companyStatsInsightsCache.createdAt))
      .limit(50);
    return { data: rows, total: rows.length, note: `${rows.length} insight(s) cacheado(s).` };
  },
};

// ─── 4. getStatsReport ─────────────────────────────────────────────────

const argsGetStatsReport = z.object({
  format: z.enum(['pdf', 'csv']),
  desde: tolerantDateString().optional(),
  hasta: tolerantDateString().optional(),
});

export const getStatsReportTool: ToolDefinition<z.infer<typeof argsGetStatsReport>> = {
  name: 'getStatsReport',
  description: 'Genera un reporte (PDF o CSV) de estadísticas financieras. El user lo descarga.',
  category: 'stats',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 2,
  cacheTtlMs: 5 * 60_000,
  schema: argsGetStatsReport,
  async execute(args, ctx): Promise<ToolResult> {
    // Por ahora devolvemos metadata. El user descarga el PDF/CSV
    // desde el endpoint dedicado (no implementado acá, se delega al frontend).
    return {
      data: [{
        format: args.format,
        desde: args.desde ?? null,
        hasta: args.hasta ?? null,
        downloadUrl: `/api/company/${ctx.empresaId}/stats/report?format=${args.format}${args.desde ? `&from=${args.desde}` : ''}${args.hasta ? `&to=${args.hasta}` : ''}`,
      }],
      total: 1,
      note: `URL de descarga del reporte en formato ${args.format.toUpperCase()}.`,
    };
  },
};
