// lib/agent-event-bus.ts
// ─────────────────────────────────────────────────────────────────────
// Bus de eventos del Asistente IA Transversal.
//
// Coherente con el doc arquitectura sección 2 y 11. Tabla: agent_events
// (ver migración 0062_agent_event_bus_and_audit_log.sql).
//
// Modelo:
//   - emit(): cualquier módulo (cron, route handler, trigger, chat)
//     registra un evento normalizado en la cola.
//   - claimNext(): el Agent Core (o un worker) toma el próximo evento
//     pendiente de forma atómica. FOR UPDATE SKIP LOCKED garantiza
//     que dos workers no procesen el mismo evento.
//   - markProcessed() / markFailed(): cierra el ciclo de vida.
//
// El bus NO ejecuta el "razonar" — eso es responsabilidad del Agent Core
// (lib/agent-core.ts). El bus es solo almacenamiento + ownership.
//
// Reglas de oro:
//   1. agentId SIEMPRE se inyecta en el caller (nunca del LLM, nunca del
//      payload del evento). Para eventos cross-empresa: pasar null.
//   2. El payload es jsonb libre: este archivo no valida la forma. El
//      Agent Core lo interpreta según eventType.
//   3. eventType sigue la convención '<modulo>.<verbo_pasado>' (ver
//      doc de catálogo sección C).
// ─────────────────────────────────────────────────────────────────────

import { and, asc, eq, isNull, lt, or, sql, desc } from 'drizzle-orm';
import { db } from '../db/client';
import { agentEvents } from '../db/schema/agent';

// ─── Types ────────────────────────────────────────────────────────────

export type AgentEventSource =
  | 'cron' | 'chat' | 'user' | 'tool' | 'db' | 'jarvis' | 'system' | 'webhook';

export interface EmitEventInput {
  /** Empresa dueña. NULL = evento cross-empresa. */
  agentId: number | null;
  source:  AgentEventSource;
  /** Ej: 'maintenance.completed', 'finance.voucher_reopened_correction'. */
  eventType: string;
  /** 0 normal, >=100 urgente. Default 0. */
  priority?: number;
  /** Payload libre. */
  payload?: Record<string, unknown>;
  /** Para agrupar eventos relacionados end-to-end. */
  correlationId?: string;
}

export interface AgentEventRow {
  id:             number;
  agentId:        number | null;
  source:         string;
  eventType:      string;
  priority:       number;
  payload:        Record<string, unknown>;
  correlationId:  string | null;
  claimAttempts:  number;
  claimError:     string | null;
  createdAt:      Date;
  processedAt:    Date | null;
  claimExpiresAt: Date | null;
}

export interface ClaimOptions {
  /** Cuántos eventos tomar de una vez (default 1, max 50). */
  batchSize?: number;
  /** Cuánto tiempo se reserva el lock antes de que venza (default 60s). */
  lockTtlMs?: number;
  /** Si se pasa, solo se toman eventos de esta empresa. */
  agentId?: number | null;
  /** Filtro por source (ej. 'cron' para un worker que solo procesa crons). */
  source?:  AgentEventSource;
  /** Filtro por eventType (match exacto, útil para tests). */
  eventType?: string;
}

// ─── emit ─────────────────────────────────────────────────────────────

/**
 * Inserta un evento en la cola. Devuelve el id generado.
 * Si el bus está saturado, el INSERT puede fallar por timeout de PG
 * (caller decide si reintenta con backoff).
 */
export async function emitEvent(input: EmitEventInput): Promise<number> {
  const [row] = await db
    .insert(agentEvents)
    .values({
      agentId:       input.agentId,
      source:        input.source,
      eventType:     input.eventType,
      priority:      input.priority ?? 0,
      payload:       input.payload ?? {},
      correlationId: input.correlationId ?? null,
    })
    .returning({ id: agentEvents.id });
  if (!row) {
    throw new Error('emitEvent: INSERT no devolvió id (inesperado)');
  }
  return row.id;
}

/** Variante bulk: emite varios eventos en una sola transacción. */
export async function emitEvents(inputs: EmitEventInput[]): Promise<number[]> {
  if (inputs.length === 0) return [];
  return await db.transaction(async (tx) => {
    const rows = await tx
      .insert(agentEvents)
      .values(
        inputs.map((i) => ({
          agentId:       i.agentId,
          source:        i.source,
          eventType:     i.eventType,
          priority:      i.priority ?? 0,
          payload:       i.payload ?? {},
          correlationId: i.correlationId ?? null,
        })),
      )
      .returning({ id: agentEvents.id });
    return rows.map((r) => r.id);
  });
}

// ─── claimNext (FOR UPDATE SKIP LOCKED) ───────────────────────────────

/**
 * Toma el próximo evento pendiente y lo marca como "en proceso"
 * (claim_expires_at = now() + lockTtl). Devuelve null si no hay nada.
 *
 * Concurrencia: usa `FOR UPDATE SKIP LOCKED` dentro de una transacción
 * para que múltiples workers puedan llamar claimNext en paralelo sin
 * pisarse. Cada worker recibe un evento distinto.
 *
 * Si un worker muere sin llamar markProcessed, el evento se libera
 * automáticamente cuando vence claim_expires_at (otro worker lo retoma).
 */
export async function claimNext(opts: ClaimOptions = {}): Promise<AgentEventRow | null> {
  const batchSize = Math.min(Math.max(opts.batchSize ?? 1, 1), 50);
  const lockTtlMs = Math.max(opts.lockTtlMs ?? 60_000, 1_000);

  // Primero, liberar locks vencidos (eventos que un worker anterior no
  // terminó de procesar). Subimos el contador de intentos por si el
  // evento sigue fallando.
  await releaseStaleLocks();

  return await db.transaction(async (tx) => {
    // Filtros dinámicos.
    const conditions = [isNull(agentEvents.processedAt)];
    if (opts.agentId !== undefined) {
      if (opts.agentId === null) {
        conditions.push(sql`${agentEvents.agentId} IS NULL`);
      } else {
        conditions.push(eq(agentEvents.agentId, opts.agentId));
      }
    }
    if (opts.source)   conditions.push(eq(agentEvents.source, opts.source));
    if (opts.eventType) conditions.push(eq(agentEvents.eventType, opts.eventType));

    // Tomar el/los próximos. Prioridad desc + created_at asc.
    const rows = await tx
      .select()
      .from(agentEvents)
      .where(and(...conditions))
      .orderBy(desc(agentEvents.priority), asc(agentEvents.createdAt))
      .limit(1)
      .for('update', { skipLocked: true });

    if (rows.length === 0) return null;
    const event = rows[0]!;

    // Marcar como reclamado (lock con TTL).
    const expiresAt = new Date(Date.now() + lockTtlMs);
    const [updated] = await tx
      .update(agentEvents)
      .set({
        claimExpiresAt: expiresAt,
        claimAttempts: event.claimAttempts + 1,
      })
      .where(eq(agentEvents.id, event.id))
      .returning();

    if (!updated) return null;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { batchSize: _bs, ...rest } = opts; // (silenciar unused si se quiere)
    return toAgentEventRow(updated);
  });
}

/**
 * Variante batch: toma varios eventos de una vez. Útil cuando se quiere
 * procesar por lotes (ej. CRON que dispara muchos a la vez).
 */
export async function claimNextBatch(opts: ClaimOptions = {}): Promise<AgentEventRow[]> {
  const batchSize = Math.min(Math.max(opts.batchSize ?? 10, 1), 50);
  const lockTtlMs = Math.max(opts.lockTtlMs ?? 60_000, 1_000);

  await releaseStaleLocks();

  return await db.transaction(async (tx) => {
    const conditions = [isNull(agentEvents.processedAt)];
    if (opts.agentId !== undefined) {
      if (opts.agentId === null) {
        conditions.push(sql`${agentEvents.agentId} IS NULL`);
      } else {
        conditions.push(eq(agentEvents.agentId, opts.agentId));
      }
    }
    if (opts.source)   conditions.push(eq(agentEvents.source, opts.source));
    if (opts.eventType) conditions.push(eq(agentEvents.eventType, opts.eventType));

    const rows = await tx
      .select()
      .from(agentEvents)
      .where(and(...conditions))
      .orderBy(desc(agentEvents.priority), asc(agentEvents.createdAt))
      .limit(batchSize)
      .for('update', { skipLocked: true });

    if (rows.length === 0) return [];

    const expiresAt = new Date(Date.now() + lockTtlMs);
    const ids = rows.map((r) => r.id);
    // Update en batch.
    await tx
      .update(agentEvents)
      .set({
        claimExpiresAt: expiresAt,
        // Drizzle no expone un SQL `+=` portable; usamos raw increment.
      })
      .where(sql`${agentEvents.id} = ANY(${ids})`);

    // Incrementar claim_attempts uno por uno (son pocas filas, no importa).
    for (const id of ids) {
      await tx
        .update(agentEvents)
        .set({ claimAttempts: sql`${agentEvents.claimAttempts} + 1` })
        .where(eq(agentEvents.id, id));
    }

    // Releer con los nuevos valores.
    const updated = await tx
      .select()
      .from(agentEvents)
      .where(sql`${agentEvents.id} = ANY(${ids})`);

    return updated.map(toAgentEventRow);
  });
}

// ─── markProcessed / markFailed ───────────────────────────────────────

/**
 * Marca un evento como procesado exitosamente. Idempotente: si ya está
 * procesado, no hace nada.
 */
export async function markProcessed(eventId: number): Promise<void> {
  await db
    .update(agentEvents)
    .set({
      processedAt:   new Date(),
      claimExpiresAt: null,
    })
    .where(and(eq(agentEvents.id, eventId), isNull(agentEvents.processedAt)));
}

/**
 * Marca un evento como fallido. NO lo marca como processed — el Agent
 * Core decide si reintentarlo o dejarlo colgado.
 *
 * - error: mensaje corto (max 500 chars).
 * - requeue: si true, libera el lock (claim_expires_at=null) para que
 *   otro worker lo reintente. Default false.
 */
export async function markFailed(
  eventId: number,
  error: string,
  opts: { requeue?: boolean } = {},
): Promise<void> {
  const trimmed = String(error).slice(0, 500);
  await db
    .update(agentEvents)
    .set({
      claimError:     trimmed,
      claimExpiresAt: opts.requeue ? null : new Date(Date.now() + 5 * 60_000),
    })
    .where(eq(agentEvents.id, eventId));
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Libera locks vencidos. Un lock se considera vencido si su
 * claim_expires_at es < now() y el evento sigue sin procesar.
 *
 * Devuelve cuántos locks liberó (útil para logs/métricas).
 */
export async function releaseStaleLocks(): Promise<number> {
  const result = await db
    .update(agentEvents)
    .set({ claimExpiresAt: null })
    .where(
      and(
        isNull(agentEvents.processedAt),
        lt(agentEvents.claimExpiresAt, new Date()),
      ),
    )
    .returning({ id: agentEvents.id });
  return result.length;
}

// ─── Consultas para el endpoint admin/agent/events ───────────────────

export interface ListEventsOptions {
  agentId?: number | null;
  eventType?: string;
  source?:   AgentEventSource;
  /** Filtra por estado: 'pending' | 'processed' | 'failed' (con error). */
  status?:   'pending' | 'processed' | 'failed' | 'all';
  /** default 50, max 200. */
  limit?:    number;
  /** Para paginación. */
  offset?:   number;
}

export async function listEvents(opts: ListEventsOptions = {}): Promise<{ rows: AgentEventRow[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);

  const conditions = [];
  if (opts.agentId !== undefined) {
    if (opts.agentId === null) conditions.push(sql`${agentEvents.agentId} IS NULL`);
    else                       conditions.push(eq(agentEvents.agentId, opts.agentId));
  }
  if (opts.eventType) conditions.push(eq(agentEvents.eventType, opts.eventType));
  if (opts.source)    conditions.push(eq(agentEvents.source, opts.source));
  if (opts.status === 'pending')   conditions.push(isNull(agentEvents.processedAt));
  if (opts.status === 'processed') conditions.push(sql`${agentEvents.processedAt} IS NOT NULL`);
  if (opts.status === 'failed')    conditions.push(sql`${agentEvents.claimError} IS NOT NULL`);

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, totalRows] = await Promise.all([
    db.select().from(agentEvents).where(where as any)
      .orderBy(desc(agentEvents.createdAt))
      .limit(limit).offset(offset),
    db.select({ count: sql<number>`COUNT(*)` }).from(agentEvents).where(where as any),
  ]);

  return {
    rows: rows.map(toAgentEventRow),
    total: Number(totalRows[0]?.count ?? 0),
  };
}

// ─── Conversor a tipo de retorno ──────────────────────────────────────

type RawEvent = typeof agentEvents.$inferSelect;

function toAgentEventRow(r: RawEvent): AgentEventRow {
  return {
    id:             r.id,
    agentId:        r.agentId,
    source:         r.source,
    eventType:      r.eventType,
    priority:       r.priority,
    payload:        (r.payload ?? {}) as Record<string, unknown>,
    correlationId:  r.correlationId,
    claimAttempts:  r.claimAttempts,
    claimError:     r.claimError,
    createdAt:      r.createdAt,
    processedAt:    r.processedAt,
    claimExpiresAt: r.claimExpiresAt,
  };
}
