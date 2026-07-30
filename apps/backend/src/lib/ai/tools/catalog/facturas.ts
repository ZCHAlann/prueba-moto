// lib/ai/tools/catalog/facturas.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 v3 — Módulo Facturas. 3 tools de lectura + 1 create.
// Tabla: `company_invoices`
//
// jul 2026 — NO se exponen tools de update, delete, approve, sendToCorrection.
// El ciclo de revisión de facturas es 100% humano (admin/supervisor).
// Columnas reales:
//   id, companyId, sourceModule, sourceEntityId, sourceAttachmentKey, kind,
//   invoiceNumber, invoiceDate, amount, currency, supplierName, fileUrl,
//   fileMimeType, status, notes, legalNumber, clientTaxId, invoiceTypeId,
//   supplierId, items, subtotal, ivaPercent, ivaAmount, total, workshopName,
//   workerName, financeRequestId, createdAt, updatedAt
// ─────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { and, eq, gte, lte, desc } from 'drizzle-orm';
import { db } from '../../../../db/client';
import { companyInvoices, companyInvoiceTypes } from '../../../../db/schema/operational';
import type { ToolDefinition, ToolResult } from '../registry';
import { tolerantString, tolerantNumber, tolerantDateString } from '../../schema-helpers';
import { writeTool, buildWriteSummary } from '../write-wrapper';

const INVOICE_STATUSES = ['vigente', 'anulada', 'vencida'] as const;

// ─── 1. listInvoices ────────────────────────────────────────────────────

const argsListInvoices = z.object({
  status: z.enum(INVOICE_STATUSES).optional(),
  kind: tolerantString().optional(),
  supplierId: tolerantNumber().int().positive().optional(),
  desde: tolerantDateString().optional(),
  hasta: tolerantDateString().optional(),
  limit: tolerantNumber().int().min(1).max(500).optional().default(50),
});

export const listInvoicesTool: ToolDefinition<z.infer<typeof argsListInvoices>> = {
  name: 'listInvoices',
  description: 'Lista facturas con filtros. SINÓNIMOS: "las facturas", "comprobantes", "facturación".',
  category: 'finanzas',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 2,
  cacheTtlMs: 60_000,
  schema: argsListInvoices,
  async execute(args, ctx): Promise<ToolResult> {
    const where = [eq(companyInvoices.companyId, ctx.empresaId)];
    if (args.status) where.push(eq(companyInvoices.status, args.status as any));
    if (args.kind) where.push(eq(companyInvoices.kind, args.kind as any));
    if (args.supplierId) where.push(eq(companyInvoices.supplierId, args.supplierId));
    if (args.desde) where.push(gte(companyInvoices.invoiceDate, args.desde));
    if (args.hasta) where.push(lte(companyInvoices.invoiceDate, args.hasta));
    const rows = await db
      .select()
      .from(companyInvoices)
      .where(and(...where))
      .orderBy(desc(companyInvoices.invoiceDate))
      .limit(args.limit ?? 50);
    return { data: rows, total: rows.length, note: `${rows.length} factura(s).` };
  },
};

// ─── 2. getInvoiceById ─────────────────────────────────────────────────

const argsGetInvoiceById = z.object({
  invoiceId: tolerantNumber().int().positive(),
});

export const getInvoiceByIdTool: ToolDefinition<z.infer<typeof argsGetInvoiceById>> = {
  name: 'getInvoiceById',
  description: 'Detalle de UNA factura.',
  category: 'finanzas',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 2,
  cacheTtlMs: 60_000,
  schema: argsGetInvoiceById,
  async execute(args, ctx): Promise<ToolResult> {
    const [row] = await db
      .select()
      .from(companyInvoices)
      .where(and(eq(companyInvoices.id, args.invoiceId), eq(companyInvoices.companyId, ctx.empresaId)))
      .limit(1);
    if (!row) return { data: [], total: 0, note: 'Factura no encontrada.' };
    return { data: [row], total: 1, note: 'Factura encontrada.' };
  },
};

// ─── 3. getInvoiceFullContext ──────────────────────────────────────────

const argsGetInvoiceFullContext = z.object({
  invoiceId: tolerantNumber().int().positive(),
});

export const getInvoiceFullContextTool: ToolDefinition<z.infer<typeof argsGetInvoiceFullContext>> = {
  name: 'getInvoiceFullContext',
  description: 'Factura + tipo de comprobante. Contexto completo para entender la trazabilidad de un comprobante.',
  category: 'finanzas',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'read',
  layer: 2,
  cacheTtlMs: 60_000,
  schema: argsGetInvoiceFullContext,
  async execute(args, ctx): Promise<ToolResult> {
    const [invoice] = await db
      .select()
      .from(companyInvoices)
      .where(and(eq(companyInvoices.id, args.invoiceId), eq(companyInvoices.companyId, ctx.empresaId)))
      .limit(1);
    if (!invoice) return { data: [], total: 0, note: 'Factura no encontrada.' };

    const [tipo] = invoice.invoiceTypeId
      ? await db
          .select()
          .from(companyInvoiceTypes)
          .where(eq(companyInvoiceTypes.id, invoice.invoiceTypeId))
          .limit(1)
      : [null];

    return {
      data: [{ ...invoice, tipo: tipo ?? null }],
      total: 1,
      note: 'Contexto de la factura.',
    };
  },
};

// ─── 4. createInvoice ──────────────────────────────────────────────────

const argsCreateInvoice = z.object({
  invoiceNumber: tolerantString({ minLength: 1, maxLength: 60 }),
  invoiceDate: tolerantDateString(),
  supplierId: tolerantNumber().int().positive().optional(),
  supplierName: tolerantString({ maxLength: 160 }).optional(),
  kind: tolerantString({ maxLength: 40 }).optional(),
  amount: tolerantNumber().nonnegative().default(0),
  subtotal: tolerantNumber().nonnegative().default(0),
  ivaPercent: tolerantNumber().nonnegative().default(15),
  ivaAmount: tolerantNumber().nonnegative().default(0),
  total: tolerantNumber().nonnegative().default(0),
  notes: tolerantString({ maxLength: 2000 }).optional(),
});

export const createInvoiceTool: ToolDefinition<z.infer<typeof argsCreateInvoice>> = {
  name: 'createInvoice',
  description: 'Registrar una factura nueva. Riesgo medio: es un comprobante financiero. SIEMPRE requiere confirmación.',
  category: 'finanzas',
  rolesPermitidos: ['admin_empresa', 'owner_empresa'],
  kind: 'create',
  layer: 3,
  cacheable: false,
  schema: argsCreateInvoice,
  async execute(args, ctx): Promise<ToolResult> {
    const summary = buildWriteSummary('createInvoice', args as Record<string, unknown>);
    return writeTool('createInvoice', args as Record<string, unknown>, ctx, summary);
  },
};
