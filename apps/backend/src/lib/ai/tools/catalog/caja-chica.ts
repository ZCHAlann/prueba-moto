// lib/ai/tools/catalog/caja-chica.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 v3 — Módulo Caja Chica. 5 tools de lectura + 1 create.
// Tablas: `company_petty_cash_accounts`, `company_petty_cash_movements`,
//         `company_finance_requests`
//
// Columnas reales:
//   - accounts: id, companyId, siteId, mode, currentBalance, isActive, etc.
//   - movements: id, accountId, type (enum 11 valores), amount, occurredAt, etc.
//   - finance_requests: id, companyId, requesterUserId, approverUserId,
//     amount, reason, status (enum pending|approved|rejected|cancelled), etc.
// ─────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { and, eq, gte, lte, desc, sql } from 'drizzle-orm';
import { db } from '../../../../db/client';
import {
  companyPettyCashAccounts,
  companyPettyCashMovements,
  companyFinanceRequests,
} from '../../../../db/schema/operational';
import type { ToolDefinition, ToolResult } from '../registry';
import { tolerantString, tolerantNumber, tolerantDateString } from '../../schema-helpers';
import { writeTool, buildWriteSummary } from '../write-wrapper';

// jul 2026 v3 — Enums REALES de la DB (no inferidos del catálogo).
// Los usamos como `z.string().optional()` en el schema para que el LLM
// pueda mandar sinónimos coloquiales, y normalizamos abajo en `execute`.
const FINANCE_REQUEST_STATES = ['pending', 'approved', 'rejected', 'cancelled'] as const;

// ─── 1. getPettyCashAccount ────────────────────────────────────────────

const argsGetPettyCashAccount = z.object({
  accountId: tolerantNumber().int().positive().optional(),
  soloActivas: tolerantString().optional(),
});

export const getPettyCashAccountTool: ToolDefinition<z.infer<typeof argsGetPettyCashAccount>> = {
  name: 'getPettyCashAccount',
  description: 'Estado de la(s) cuenta(s) de caja chica. SINÓNIMOS: "saldo de caja chica", "cuánto hay en caja", "estado de cuenta". Si se omite accountId devuelve todas las cuentas de la empresa.',
  category: 'finanzas',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 2,
  cacheTtlMs: 60_000,
  schema: argsGetPettyCashAccount,
  async execute(args, ctx): Promise<ToolResult> {
    const where = [eq(companyPettyCashAccounts.companyId, ctx.empresaId)];
    if (args.accountId) where.push(eq(companyPettyCashAccounts.id, args.accountId));
    const rows = await db
      .select()
      .from(companyPettyCashAccounts)
      .where(and(...where))
      .orderBy(companyPettyCashAccounts.id);
    return { data: rows, total: rows.length, note: `${rows.length} cuenta(s) encontrada(s).` };
  },
};

// ─── 2. listPettyCashMovements ──────────────────────────────────────────

const argsListPettyCashMovements = z.object({
  accountId: tolerantNumber().int().positive().optional(),
  desde: tolerantDateString().optional(),
  hasta: tolerantDateString().optional(),
  limit: tolerantNumber().int().min(1).max(500).optional().default(100),
});

export const listPettyCashMovementsTool: ToolDefinition<z.infer<typeof argsListPettyCashMovements>> = {
  name: 'listPettyCashMovements',
  description: 'Movimientos de una cuenta de caja chica (ingresos, egresos).',
  category: 'finanzas',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 2,
  cacheTtlMs: 60_000,
  schema: argsListPettyCashMovements,
  async execute(args, ctx): Promise<ToolResult> {
    const where = [eq(companyPettyCashMovements.companyId, ctx.empresaId)];
    if (args.accountId) where.push(eq(companyPettyCashMovements.accountId, args.accountId));
    if (args.desde) where.push(gte(companyPettyCashMovements.occurredAt, new Date(args.desde)));
    if (args.hasta) where.push(lte(companyPettyCashMovements.occurredAt, new Date(args.hasta + ' 23:59:59')));
    const rows = await db
      .select()
      .from(companyPettyCashMovements)
      .where(and(...where))
      .orderBy(desc(companyPettyCashMovements.occurredAt))
      .limit(args.limit ?? 100);
    return { data: rows, total: rows.length, note: `${rows.length} movimiento(s).` };
  },
};

// ─── 3. listFinanceRequests ────────────────────────────────────────────

const argsListFinanceRequests = z.object({
  status: z.enum(FINANCE_REQUEST_STATES).optional(),
  solicitanteId: tolerantNumber().int().positive().optional(),
  desde: tolerantDateString().optional(),
  hasta: tolerantDateString().optional(),
  limit: tolerantNumber().int().min(1).max(500).optional().default(100),
});

export const listFinanceRequestsTool: ToolDefinition<z.infer<typeof argsListFinanceRequests>> = {
  name: 'listFinanceRequests',
  description: 'Solicitudes de gasto de la empresa. SINÓNIMOS: "las solicitudes", "los requests", "gastos pendientes de aprobar".',
  category: 'finanzas',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 2,
  cacheTtlMs: 60_000,
  schema: argsListFinanceRequests,
  async execute(args, ctx): Promise<ToolResult> {
    const where = [eq(companyFinanceRequests.companyId, ctx.empresaId)];
    if (args.status) where.push(eq(companyFinanceRequests.status, args.status));
    if (args.solicitanteId) where.push(eq(companyFinanceRequests.requesterUserId, args.solicitanteId));
    if (args.desde) where.push(gte(companyFinanceRequests.createdAt, new Date(args.desde)));
    if (args.hasta) where.push(lte(companyFinanceRequests.createdAt, new Date(args.hasta + ' 23:59:59')));
    const rows = await db
      .select()
      .from(companyFinanceRequests)
      .where(and(...where))
      .orderBy(desc(companyFinanceRequests.createdAt))
      .limit(args.limit ?? 100);
    return { data: rows, total: rows.length, note: `${rows.length} solicitud(es).` };
  },
};

// ─── 4. getFinanceRequestById ──────────────────────────────────────────

const argsGetFinanceRequestById = z.object({
  requestId: tolerantNumber().int().positive(),
});

export const getFinanceRequestByIdTool: ToolDefinition<z.infer<typeof argsGetFinanceRequestById>> = {
  name: 'getFinanceRequestById',
  description: 'Detalle de UNA solicitud de gasto.',
  category: 'finanzas',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 2,
  cacheTtlMs: 60_000,
  schema: argsGetFinanceRequestById,
  async execute(args, ctx): Promise<ToolResult> {
    const [row] = await db
      .select()
      .from(companyFinanceRequests)
      .where(and(eq(companyFinanceRequests.id, args.requestId), eq(companyFinanceRequests.companyId, ctx.empresaId)))
      .limit(1);
    if (!row) return { data: [], total: 0, note: 'Solicitud no encontrada.' };
    return { data: [row], total: 1, note: 'Solicitud encontrada.' };
  },
};

// ─── 5. getAccountBalanceHistory ──────────────────────────────────────

const argsGetAccountBalanceHistory = z.object({
  accountId: tolerantNumber().int().positive(),
  desde: tolerantDateString().optional(),
  hasta: tolerantDateString().optional(),
});

export const getAccountBalanceHistoryTool: ToolDefinition<z.infer<typeof argsGetAccountBalanceHistory>> = {
  name: 'getAccountBalanceHistory',
  description: 'Histórico de movimientos de una cuenta de caja chica. Útil para ver cómo evolucionó el saldo.',
  category: 'finanzas',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 2,
  cacheTtlMs: 5 * 60_000,
  schema: argsGetAccountBalanceHistory,
  async execute(args, ctx): Promise<ToolResult> {
    const where = [
      eq(companyPettyCashMovements.companyId, ctx.empresaId),
      eq(companyPettyCashMovements.accountId, args.accountId),
    ];
    if (args.desde) where.push(gte(companyPettyCashMovements.occurredAt, new Date(args.desde)));
    if (args.hasta) where.push(lte(companyPettyCashMovements.occurredAt, new Date(args.hasta + ' 23:59:59')));
    const rows = await db
      .select({
        id: companyPettyCashMovements.id,
        occurredAt: companyPettyCashMovements.occurredAt,
        type: companyPettyCashMovements.type,
        amount: companyPettyCashMovements.amount,
        balanceAfter: companyPettyCashMovements.balanceAfter,
        note: companyPettyCashMovements.note,
      })
      .from(companyPettyCashMovements)
      .where(and(...where))
      .orderBy(companyPettyCashMovements.occurredAt);
    return { data: rows, total: rows.length, note: `Histórico de ${rows.length} movimiento(s).` };
  },
};

// ─── 6. createFinanceRequest ───────────────────────────────────────────

const argsCreateFinanceRequest = z.object({
  siteId: tolerantNumber().int().positive(),
  amount: tolerantNumber().positive(),
  reason: tolerantString({ minLength: 10, maxLength: 280 }),
  justificationNotes: tolerantString({ maxLength: 2000 }).optional(),
});

export const createFinanceRequestTool: ToolDefinition<z.infer<typeof argsCreateFinanceRequest>> = {
  name: 'createFinanceRequest',
  description: 'Crear una solicitud de gasto (que después un admin aprueba). Riesgo medio: genera compromiso financiero. SIEMPRE requiere confirmación.',
  category: 'finanzas',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'create',
  layer: 3,
  cacheable: false,
  schema: argsCreateFinanceRequest,
  async execute(args, ctx): Promise<ToolResult> {
    const summary = buildWriteSummary('createFinanceRequest', args as Record<string, unknown>);
    return writeTool('createFinanceRequest', args as Record<string, unknown>, ctx, summary);
  },
};
