// lib/agent-audit.ts
// ─────────────────────────────────────────────────────────────────────
// Audit log transversal del Asistente IA.
//
// Coherente con el doc arquitectura sección 9. Tabla: agent_audit_log
// (ver migración 0062). Inmutable: trigger BEFORE UPDATE OR DELETE
// levanta EXCEPTION (mismo patrón que fn_petty_cash_movements_immutable
// y fn_invoice_review_events_immutable).
//
// Cada etapa del ciclo percibir→razonar→actuar→registrar del Agent Core
// se registra con `recordAudit()`. La función nunca tira — si el INSERT
// falla, loguea y sigue (no queremos que un error de auditoría bloquee
// el flujo principal del agente).
// ─────────────────────────────────────────────────────────────────────

import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { agentAuditLog } from '../db/schema/agent';

// ─── Types ────────────────────────────────────────────────────────────

export type AuditStage =
  | 'perceived'   // acabamos de recibir un evento del bus
  | 'reasoned'    // el LLM devolvió un plan/intención
  | 'acted'       // ejecutamos una tool o acción
  | 'confirmed'   // un humano aprobó una action proposal
  | 'rejected'    // un humano rechazó una action proposal
  | 'failed'      // falló algo (razonar, actuar, etc.)
  | 'system';     // entrada administrativa (arranque, shutdown, etc.)

export type RiskLevel = 'low' | 'medium' | 'high';

export interface RecordAuditInput {
  agentId?:        number | null;
  stage:           AuditStage;
  eventId?:        number | null;
  conversationId?: number | null;
  messageId?:      number | null;
  actorUserId?:    number | null;
  toolName?:       string;
  toolParams?:     Record<string, unknown>;
  toolResult?:     Record<string, unknown>;
  reasoning?:      string;
  riskLevel?:      RiskLevel;
  proposalId?:     string | null;
  correlationId?:  string | null;
  error?:          string;
  latencyMs?:      number;
}

// ─── recordAudit ──────────────────────────────────────────────────────

/**
 * Inserta una entrada en el audit log. NUNCA tira — un error de
 * auditoría no debe bloquear el flujo principal del agente. Si el
 * INSERT falla, loguea en stderr y sigue.
 *
 * Devuelve el id insertado, o null si falló.
 */
export async function recordAudit(input: RecordAuditInput): Promise<number | null> {
  try {
    const [row] = await db
      .insert(agentAuditLog)
      .values({
        agentId:        input.agentId ?? null,
        stage:          input.stage,
        eventId:        input.eventId ?? null,
        conversationId: input.conversationId ?? null,
        messageId:      input.messageId ?? null,
        actorUserId:    input.actorUserId ?? null,
        toolName:       input.toolName ?? null,
        toolParams:     input.toolParams ?? null,
        toolResult:     input.toolResult ?? null,
        reasoning:      input.reasoning ?? null,
        riskLevel:      input.riskLevel ?? null,
        proposalId:     input.proposalId ?? null,
        correlationId:  input.correlationId ?? null,
        error:          input.error ?? null,
        latencyMs:      input.latencyMs ?? null,
      })
      .returning({ id: agentAuditLog.id });
    return row?.id ?? null;
  } catch (err) {
    // Loguear pero NO propagar — auditoría es side-effect.
    console.error('[agent-audit] recordAudit falló:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Variante "timer": arranca un timer, devuelve una función que al
 * llamarla graba el audit con latencyMs ya calculado.
 *
 *   const finish = startAuditTimer({ stage: 'reasoned', ... });
 *   // ... hacer trabajo ...
 *   await finish({ reasoning: '...', toolResult: {...} });
 */
export function startAuditTimer(
  base: Omit<RecordAuditInput, 'latencyMs'>,
): (overrides?: Partial<RecordAuditInput>) => Promise<number | null> {
  const t0 = Date.now();
  return async (overrides: Partial<RecordAuditInput> = {}) => {
    return recordAudit({
      ...base,
      ...overrides,
      latencyMs: Date.now() - t0,
    });
  };
}

// ─── Consultas para el endpoint admin/agent/audit ────────────────────

export interface ListAuditOptions {
  agentId?:       number | null;
  eventId?:       number;
  conversationId?: number;
  toolName?:      string;
  stage?:         AuditStage;
  actorUserId?:   number;
  from?:          Date;
  to?:            Date;
  /** Filtra por correlationId (trazar un caso de uso end-to-end). */
  correlationId?: string;
  limit?:         number;
  offset?:        number;
}

export async function listAudit(opts: ListAuditOptions = {}) {
  const limit  = Math.min(Math.max(opts.limit  ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);

  const conditions = [];
  if (opts.agentId !== undefined) {
    if (opts.agentId === null) conditions.push(sql`${agentAuditLog.agentId} IS NULL`);
    else                       conditions.push(eq(agentAuditLog.agentId, opts.agentId));
  }
  if (opts.eventId)        conditions.push(eq(agentAuditLog.eventId, opts.eventId));
  if (opts.conversationId) conditions.push(eq(agentAuditLog.conversationId, opts.conversationId));
  if (opts.toolName)       conditions.push(eq(agentAuditLog.toolName, opts.toolName));
  if (opts.stage)          conditions.push(eq(agentAuditLog.stage, opts.stage));
  if (opts.actorUserId)    conditions.push(eq(agentAuditLog.actorUserId, opts.actorUserId));
  if (opts.correlationId)  conditions.push(eq(agentAuditLog.correlationId, opts.correlationId));
  if (opts.from)           conditions.push(gte(agentAuditLog.createdAt, opts.from));
  if (opts.to)             conditions.push(lte(agentAuditLog.createdAt, opts.to));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, totalRows] = await Promise.all([
    db.select().from(agentAuditLog).where(where as any)
      .orderBy(desc(agentAuditLog.createdAt))
      .limit(limit).offset(offset),
    db.select({ count: sql<number>`COUNT(*)` }).from(agentAuditLog).where(where as any),
  ]);

  return { rows, total: Number(totalRows[0]?.count ?? 0) };
}

/**
 * Trae toda la cadena de un correlationId (ordenada por createdAt).
 * Útil para debug: "qué pasó con el caso de uso X".
 */
export async function traceCorrelation(correlationId: string, agentId?: number) {
  const conditions = [eq(agentAuditLog.correlationId, correlationId)];
  if (agentId !== undefined) {
    if (agentId === null) conditions.push(sql`${agentAuditLog.agentId} IS NULL`);
    else                  conditions.push(eq(agentAuditLog.agentId, agentId));
  }
  return db
    .select()
    .from(agentAuditLog)
    .where(and(...conditions))
    .orderBy(agentAuditLog.createdAt);
}
