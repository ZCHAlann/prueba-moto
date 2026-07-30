// lib/ai/tools/catalog/index.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 v3 — Catálogo consolidado de tools del asistente Jarvis.
//
// Esta carpeta contiene las tools de los módulos NUEVOS que no
// estaban implementadas antes (o que se redujeron/mergearon en la v3).
// Las tools de los módulos ya existentes (vehículos, mantenimiento,
// combustible, peajes, checklists, conductores) viven en sus
// archivos originales en `tools/` y se importan directamente.
//
// El `registry.ts` combina ambos: tools viejas (compat) + tools
// nuevas (v3). Cuando todo esté validado, se migran las viejas
// al shape nuevo en una segunda pasada.
// ─────────────────────────────────────────────────────────────────────

import type { ToolDefinition } from '../registry';

// ─── Módulos nuevos del catálogo v3 ────────────────────────────────────

// Alertas (3 lectura + 1 create)
import {
  listAlertsTool,
  getAlertByIdTool,
  getAlertTrendsTool,
  createAlertTool,
} from './alertas';

// Caja Chica (5 lectura + 1 create)
import {
  getPettyCashAccountTool,
  listPettyCashMovementsTool,
  listFinanceRequestsTool,
  getFinanceRequestByIdTool,
  getAccountBalanceHistoryTool,
  createFinanceRequestTool,
} from './caja-chica';

// Cumplimiento (1 tool con scope)
import { getUserComplianceTool } from './cumplimiento';

// Auditoría (3 lectura)
import {
  listAuditEntriesTool,
  getAuditByEntityIdTool,
  getAuditByUserIdTool,
} from './auditoria';

// Stats / Análisis financiero (4 lectura)
import {
  getSpendingSummaryTool,
  getSpendingAnomaliesTool,
  getInsightsTool,
  getStatsReportTool,
} from './stats';

// Facturas (3 lectura + 1 create)
import {
  listInvoicesTool,
  getInvoiceByIdTool,
  getInvoiceFullContextTool,
  createInvoiceTool,
} from './facturas';

// Re-exports para uso desde otros módulos.
export {
  listAlertsTool,
  getAlertByIdTool,
  getAlertTrendsTool,
  createAlertTool,
  getPettyCashAccountTool,
  listPettyCashMovementsTool,
  listFinanceRequestsTool,
  getFinanceRequestByIdTool,
  getAccountBalanceHistoryTool,
  createFinanceRequestTool,
  getUserComplianceTool,
  listAuditEntriesTool,
  getAuditByEntityIdTool,
  getAuditByUserIdTool,
  getSpendingSummaryTool,
  getSpendingAnomaliesTool,
  getInsightsTool,
  getStatsReportTool,
  listInvoicesTool,
  getInvoiceByIdTool,
  getInvoiceFullContextTool,
  createInvoiceTool,
};

// ─── Array consolidado de tools del catálogo v3 ───────────────────────
//
// Para referencia/debug. El TOOL_REGISTRY real se compone en
// registry.ts combinando este array + las tools viejas.

export const CATALOG_V3_TOOLS: ToolDefinition[] = [
  // Alertas
  listAlertsTool,
  getAlertByIdTool,
  getAlertTrendsTool,
  createAlertTool,
  // Caja Chica
  getPettyCashAccountTool,
  listPettyCashMovementsTool,
  listFinanceRequestsTool,
  getFinanceRequestByIdTool,
  getAccountBalanceHistoryTool,
  createFinanceRequestTool,
  // Cumplimiento
  getUserComplianceTool,
  // Auditoría
  listAuditEntriesTool,
  getAuditByEntityIdTool,
  getAuditByUserIdTool,
  // Stats
  getSpendingSummaryTool,
  getSpendingAnomaliesTool,
  getInsightsTool,
  getStatsReportTool,
  // Facturas
  listInvoicesTool,
  getInvoiceByIdTool,
  getInvoiceFullContextTool,
  createInvoiceTool,
];

/** Conteo por capa, útil para debug/stats. */
export function countByLayer(tools: ToolDefinition[]): Record<1 | 2 | 3, number> {
  const counts: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
  for (const t of tools) {
    const layer = t.layer ?? 2;
    counts[layer]++;
  }
  return counts;
}

/** Conteo por kind (read vs create), útil para debug. */
export function countByKind(tools: ToolDefinition[]): { read: number; create: number } {
  const counts = { read: 0, create: 0 };
  for (const t of tools) {
    const kind = t.kind ?? 'read';
    counts[kind]++;
  }
  return counts;
}
