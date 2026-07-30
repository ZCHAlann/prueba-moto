// lib/ai/tools/write-wrapper.ts
// ─────────────────────────────────────────────────────────────────────
// Wrapper unificado para tools de creación (kind='create').
//
// jul 2026 v3 — Aplica a TODAS las tools create_* del catálogo.
//
// El wrapper NO ejecuta la acción. Solo construye la propuesta con
// un summary legible. El frontend muestra el modal de confirmación
// y, solo si el user confirma, hace el fetch directo al endpoint
// del backend con su propio manejo de errores y UX.
//
// BENEFICIOS:
// 1. Centraliza la lógica de "qué poner en el summary" (consistencia
//    en los textos que ve el user).
// 2. Evita que el LLM invente que ya ejecutó algo (devuelve un mensaje
//    claro de "esperando confirmación").
// 3. El frontend tiene una sola interfaz de proposal que matchear
//    (proposal.tool, proposal.args, proposal.summary).
// 4. Compatible con el sistema viejo: si una tool quiere ejecutar
//    directo, no usa este wrapper, sigue con su fetch al backend.
// ─────────────────────────────────────────────────────────────────────

import type { ToolContext, ToolResult } from './registry';

export interface WriteProposal {
  tool: string;
  args: Record<string, unknown>;
  summary: string;
}

export interface WriteToolResultShape {
  data: unknown[];
  total: 0;
  note: string;
  proposal: WriteProposal;
}

/**
 * Helper para tools de creación. NO ejecuta. Solo construye la propuesta.
 *
 * @param toolName Nombre de la tool (ej: 'createMaintenance')
 * @param args Args validados por Zod
 * @param ctx Contexto (necesario para validar sesión y empresa)
 * @param summary Texto legible que verá el user en el modal
 */
export function writeTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
  summary: string,
): WriteToolResultShape {
  if (!ctx.cookieHeader || !ctx.baseUrl) {
    return {
      data: [],
      total: 0,
      note: 'No hay sesión activa. El usuario debe estar autenticado para crear registros.',
      proposal: { tool: toolName, args, summary: 'Sin sesión' },
    };
  }

  return {
    data: [],
    total: 0,
    note: `Acción propuesta: ${summary}. Esperando confirmación del usuario.`,
    proposal: { tool: toolName, args, summary },
  };
}

/**
 * Helper para construir un summary legible a partir de los args.
 * Usa convenciones:
 *   - "Crear [entidad] para [placa/assetId]"
 *   - "Registrar [entidad] de [monto]"
 *   - "Agendar [entidad] para [fecha]"
 *
 * Si el LLM ya proveyó un summary custom, se usa ese.
 */
export function buildWriteSummary(
  toolName: string,
  args: Record<string, unknown>,
  fallback?: string,
): string {
  if (fallback) return fallback;

  // Convención: el tool devuelve un summary si quiere uno custom.
  // Si no, armamos uno desde los args.
  const vehicleRef = args.plate || (args.assetId ? `vehículo #${args.assetId}` : null);
  const driverRef = args.driverId ? `conductor #${args.driverId}` : null;
  const dateRef = args.scheduledFor || args.fecha;
  const amountRef = args.costo || args.montoTotal || args.total;

  switch (toolName) {
    case 'createMaintenance':
      return `Agendar mantenimiento${vehicleRef ? ` para ${vehicleRef}` : ''}${dateRef ? ` el ${dateRef}` : ''}.`;
    case 'registerFuelEntry':
      return `Registrar carga de combustible${vehicleRef ? ` de ${vehicleRef}` : ''}${amountRef ? ` por $${amountRef}` : ''}.`;
    case 'registerToll':
      return `Registrar cruce de peaje${vehicleRef ? ` de ${vehicleRef}` : ''}${amountRef ? ` por $${amountRef}` : ''}.`;
    case 'createChecklist':
      return `Crear inspección${vehicleRef ? ` para ${vehicleRef}` : ''}${driverRef ? ` con ${driverRef}` : ''}.`;
    case 'createAlert':
      return `Crear alerta: ${args.title || '(sin título)'}${vehicleRef ? ` sobre ${vehicleRef}` : ''}.`;
    case 'createFinanceRequest':
      return `Crear solicitud de gasto${amountRef ? ` por $${amountRef}` : ''}.`;
    case 'createInvoice':
      return `Registrar factura${amountRef ? ` por $${amountRef}` : ''}.`;
    case 'addDriverReport':
      return `Agregar reporte: ${args.title || '(sin título)'}.`;
    case 'createVehicleNote':
      return `Agregar nota al vehículo${vehicleRef ? ` ${vehicleRef}` : ''}.`;
    default:
      return `Ejecutar ${toolName}.`;
  }
}
