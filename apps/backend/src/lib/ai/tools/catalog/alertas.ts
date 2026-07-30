// lib/ai/tools/catalog/alertas.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 v3 — Módulo Alertas. 3 tools de lectura + 1 create.
// Tabla: `company_alerts`
//
// MIGRACIÓN: herramientas re-implementadas desde el catálogo v3
// (`fase1-catalogo-reducido-jarvis-v3.md`). Columnas reales de la
// tabla `company_alerts`:
//   id, companyId, assetId, title, type, severity, status, dueDate,
//   notes, reminderIntervalMinutes, lastRemindedAt, nextReminderAt,
//   createdAt, updatedAt
// ─────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { and, eq, gte, lte, desc, sql, count } from 'drizzle-orm';
import { db } from '../../../../db/client';
import { companyAlerts } from '../../../../db/schema/operational';
import type { ToolDefinition, ToolResult } from '../registry';
import { tolerantString, tolerantNumber, tolerantDateString, tolerantBoolean } from '../../schema-helpers';
import { writeTool, buildWriteSummary } from '../write-wrapper';

const ALERT_SEVERITIES = ['baja', 'media', 'alta', 'critica'] as const;
const ALERT_TYPES = ['mantenimiento', 'combustible', 'conductor', 'vehiculo', 'seguridad', 'otro'] as const;
const ALERT_STATUSES = ['Abierta', 'Cerrada', 'Vencida'] as const;

// ─── 1. listAlerts ──────────────────────────────────────────────────────

const argsListAlerts = z.object({
  status: z.enum(ALERT_STATUSES).optional(),
  severity: z.enum(ALERT_SEVERITIES).optional(),
  assetId: tolerantNumber().int().positive().optional(),
  type: z.enum(ALERT_TYPES).optional(),
  activas: tolerantBoolean().optional(),
  desde: tolerantDateString().optional(),
  hasta: tolerantDateString().optional(),
  limit: tolerantNumber().int().min(1).max(500).optional().default(50),
});

export const listAlertsTool: ToolDefinition<z.infer<typeof argsListAlerts>> = {
  name: 'listAlerts',
  description: 'Lista alertas con filtros. SINÓNIMOS: "las alertas", "alertas activas", "los avisos". Devuelve hasta `limit` alertas ordenadas por fecha descendente.',
  category: 'alertas',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 1,
  cacheTtlMs: 60_000,
  schema: argsListAlerts,
  async execute(args, ctx): Promise<ToolResult> {
    const where = [eq(companyAlerts.companyId, ctx.empresaId)];
    if (args.status) where.push(eq(companyAlerts.status, args.status));
    if (args.severity) where.push(eq(companyAlerts.severity, args.severity));
    if (args.assetId) where.push(eq(companyAlerts.assetId, args.assetId));
    if (args.type) where.push(eq(companyAlerts.type, args.type));
    if (args.activas) where.push(eq(companyAlerts.status, 'Abierta'));
    if (args.desde) where.push(gte(companyAlerts.createdAt, new Date(args.desde)));
    if (args.hasta) where.push(lte(companyAlerts.createdAt, new Date(args.hasta + ' 23:59:59')));

    const rows = await db
      .select({
        id: companyAlerts.id,
        title: companyAlerts.title,
        type: companyAlerts.type,
        severity: companyAlerts.severity,
        status: companyAlerts.status,
        notes: companyAlerts.notes,
        assetId: companyAlerts.assetId,
        dueDate: companyAlerts.dueDate,
        createdAt: companyAlerts.createdAt,
      })
      .from(companyAlerts)
      .where(and(...where))
      .orderBy(desc(companyAlerts.createdAt))
      .limit(args.limit ?? 50);

    return { data: rows, total: rows.length, note: `Mostrando ${rows.length} alerta(s).` };
  },
};

// ─── 2. getAlertById ────────────────────────────────────────────────────

const argsGetAlertById = z.object({
  alertId: tolerantNumber().int().positive(),
});

export const getAlertByIdTool: ToolDefinition<z.infer<typeof argsGetAlertById>> = {
  name: 'getAlertById',
  description: 'Detalle de UNA alerta específica por su ID.',
  category: 'alertas',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 2,
  cacheTtlMs: 60_000,
  schema: argsGetAlertById,
  async execute(args, ctx): Promise<ToolResult> {
    const [row] = await db
      .select()
      .from(companyAlerts)
      .where(and(eq(companyAlerts.id, args.alertId), eq(companyAlerts.companyId, ctx.empresaId)))
      .limit(1);
    if (!row) return { data: [], total: 0, note: 'Alerta no encontrada.' };
    return { data: [row], total: 1, note: 'Alerta encontrada.' };
  },
};

// ─── 3. getAlertTrends ──────────────────────────────────────────────────

const argsGetAlertTrends = z.object({
  by: z.enum(['by_severity', 'by_type', 'by_day', 'all']).default('all'),
  desde: tolerantDateString().optional(),
  hasta: tolerantDateString().optional(),
});

export const getAlertTrendsTool: ToolDefinition<z.infer<typeof argsGetAlertTrends>> = {
  name: 'getAlertTrends',
  description: 'Tendencias de alertas por dimensión. SINÓNIMOS: "cómo vienen las alertas", "resumen de alertas".',
  category: 'alertas',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 2,
  cacheTtlMs: 5 * 60_000,
  schema: argsGetAlertTrends,
  async execute(args, ctx): Promise<ToolResult> {
    const where = [eq(companyAlerts.companyId, ctx.empresaId)];
    if (args.desde) where.push(gte(companyAlerts.createdAt, new Date(args.desde)));
    if (args.hasta) where.push(lte(companyAlerts.createdAt, new Date(args.hasta + ' 23:59:59')));

    // Agrupamos según `by` (SQL inline porque Drizzle requiere
    // tipado fuerte en groupBy)
    const groupCol =
      args.by === 'by_severity' ? companyAlerts.severity :
      args.by === 'by_type'     ? companyAlerts.type :
      args.by === 'by_day'      ? sql`date_trunc('day', ${companyAlerts.createdAt})` :
                                  companyAlerts.severity;

    const rows = await db
      .select({
        dimension: groupCol,
        total: count().as('total'),
      })
      .from(companyAlerts)
      .where(and(...where))
      .groupBy(groupCol);

    return { data: rows as any[], total: rows.length, note: `Tendencias de alertas agrupadas por ${args.by}.` };
  },
};

// ─── 4. createAlert ─────────────────────────────────────────────────────

const argsCreateAlert = z.object({
  title: tolerantString({ minLength: 3, maxLength: 160 }),
  type: z.enum(ALERT_TYPES).default('otro'),
  severity: z.enum(ALERT_SEVERITIES).default('media'),
  notes: tolerantString({ maxLength: 2000 }).optional(),
  assetId: tolerantNumber().int().positive().optional(),
  dueDate: tolerantDateString().optional(),
});

export const createAlertTool: ToolDefinition<z.infer<typeof argsCreateAlert>> = {
  name: 'createAlert',
  description: 'Crear una alerta operativa. Riesgo medio: notifica a personas. SIEMPRE requiere confirmación del usuario.',
  category: 'alertas',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'create',
  layer: 3,
  cacheable: false,
  schema: argsCreateAlert,
  async execute(args, ctx): Promise<ToolResult> {
    const summary = buildWriteSummary('createAlert', args as Record<string, unknown>);
    return writeTool('createAlert', args as Record<string, unknown>, ctx, summary);
  },
};
