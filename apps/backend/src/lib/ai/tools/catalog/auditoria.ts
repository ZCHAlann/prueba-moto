// lib/ai/tools/catalog/auditoria.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 v3 — Módulo Auditoría. 3 tools de lectura.
// Tabla: `company_audit_entries`
//
// jul 2026 — NO se exponen tools de escritura. El audit log se
// genera automáticamente desde el backend en cada mutación.
// ─────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { and, eq, gte, lte, desc } from 'drizzle-orm';
import { db } from '../../../../db/client';
import { companyAuditEntries } from '../../../../db/schema/operational';
import type { ToolDefinition, ToolResult } from '../registry';
import { tolerantString, tolerantNumber, tolerantDateString } from '../../schema-helpers';

// ─── 1. listAuditEntries ───────────────────────────────────────────────

const argsListAuditEntries = z.object({
  userId: tolerantNumber().int().positive().optional(),
  entity: tolerantString().optional(),
  action: tolerantString().optional(),
  desde: tolerantDateString().optional(),
  hasta: tolerantDateString().optional(),
  limit: tolerantNumber().int().min(1).max(500).optional().default(100),
});

export const listAuditEntriesTool: ToolDefinition<z.infer<typeof argsListAuditEntries>> = {
  name: 'listAuditEntries',
  description: 'Audit log con filtros. SINÓNIMOS: "qué hizo el usuario X", "historial de cambios". Devuelve entradas de la tabla de auditoría ordenadas por fecha descendente.',
  category: 'auditoria',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 2,
  cacheTtlMs: 60_000,
  schema: argsListAuditEntries,
  async execute(args, ctx): Promise<ToolResult> {
    const where = [eq(companyAuditEntries.companyId, ctx.empresaId)];
    if (args.userId) where.push(eq(companyAuditEntries.actorId, args.userId));
    if (args.entity) where.push(eq(companyAuditEntries.entity, args.entity));
    if (args.action) where.push(eq(companyAuditEntries.action, args.action));
    if (args.desde) where.push(gte(companyAuditEntries.createdAt, new Date(args.desde)));
    if (args.hasta) where.push(lte(companyAuditEntries.createdAt, new Date(args.hasta + ' 23:59:59')));
    const rows = await db
      .select()
      .from(companyAuditEntries)
      .where(and(...where))
      .orderBy(desc(companyAuditEntries.createdAt))
      .limit(args.limit ?? 100);
    return { data: rows, total: rows.length, note: `${rows.length} entrada(s) de auditoría.` };
  },
};

// ─── 2. getAuditByEntityId ────────────────────────────────────────────

const argsGetAuditByEntityId = z.object({
  entity: tolerantString({ minLength: 1, maxLength: 80 }),
  entityId: tolerantString({ minLength: 1, maxLength: 80 }),
  desde: tolerantDateString().optional(),
  hasta: tolerantDateString().optional(),
});

export const getAuditByEntityIdTool: ToolDefinition<z.infer<typeof argsGetAuditByEntityId>> = {
  name: 'getAuditByEntityId',
  description: 'Historial de cambios de UNA entidad específica (ej: un vehículo, un mantenimiento). Útil para entender la vida completa de un registro.',
  category: 'auditoria',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 2,
  cacheTtlMs: 5 * 60_000,
  schema: argsGetAuditByEntityId,
  async execute(args, ctx): Promise<ToolResult> {
    const where = [
      eq(companyAuditEntries.companyId, ctx.empresaId),
      eq(companyAuditEntries.entity, args.entity),
      eq(companyAuditEntries.entityId, args.entityId),
    ];
    if (args.desde) where.push(gte(companyAuditEntries.createdAt, new Date(args.desde)));
    if (args.hasta) where.push(lte(companyAuditEntries.createdAt, new Date(args.hasta + ' 23:59:59')));
    const rows = await db
      .select()
      .from(companyAuditEntries)
      .where(and(...where))
      .orderBy(desc(companyAuditEntries.createdAt));
    return { data: rows, total: rows.length, note: `${rows.length} cambio(s) sobre ${args.entity}#${args.entityId}.` };
  },
};

// ─── 3. getAuditByUserId ──────────────────────────────────────────────

const argsGetAuditByUserId = z.object({
  userId: tolerantNumber().int().positive(),
  desde: tolerantDateString().optional(),
  hasta: tolerantDateString().optional(),
  limit: tolerantNumber().int().min(1).max(500).optional().default(100),
});

export const getAuditByUserIdTool: ToolDefinition<z.infer<typeof argsGetAuditByUserId>> = {
  name: 'getAuditByUserId',
  description: 'Qué hizo un usuario específico en el sistema. SINÓNIMOS: "los pasos que dio un usuario", "actividad del usuario".',
  category: 'auditoria',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 2,
  cacheTtlMs: 5 * 60_000,
  schema: argsGetAuditByUserId,
  async execute(args, ctx): Promise<ToolResult> {
    const where = [
      eq(companyAuditEntries.companyId, ctx.empresaId),
      eq(companyAuditEntries.actorId, args.userId),
    ];
    if (args.desde) where.push(gte(companyAuditEntries.createdAt, new Date(args.desde)));
    if (args.hasta) where.push(lte(companyAuditEntries.createdAt, new Date(args.hasta + ' 23:59:59')));
    const rows = await db
      .select()
      .from(companyAuditEntries)
      .where(and(...where))
      .orderBy(desc(companyAuditEntries.createdAt))
      .limit(args.limit ?? 100);
    return { data: rows, total: rows.length, note: `${rows.length} acción(es) del usuario #${args.userId}.` };
  },
};
