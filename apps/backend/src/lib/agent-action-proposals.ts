// lib/agent-action-proposals.ts
// ─────────────────────────────────────────────────────────────────────
// Flujo "human-in-the-loop" para acciones de riesgo medio/alto.
// Coherente con el doc arquitectura sección 5.1.
//
// Tabla: agent_action_proposals (migración 0062).
//
// Ciclo de vida:
//   pending → approved → (la tool/http call se ejecuta)
//   pending → rejected
//   pending → expired (CRON o Agent Core la marca al pasar expires_at)
//   pending → cancelled (la misma propuesta decide cancelarse)
//
// La propuesta guarda el httpMethod/httpPath/httpBody que el Agent Core
// ya preparó, así el frontend solo tiene que confirmar y disparar.
// ─────────────────────────────────────────────────────────────────────

import { and, desc, eq, sql, lt } from 'drizzle-orm';
import { db } from '../db/client';
import { agentActionProposals } from '../db/schema/agent';
import { recordAudit } from './agent-audit';
import type { RiskLevel } from './agent-audit';

// ─── Types ────────────────────────────────────────────────────────────

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';

export interface ProposeActionInput {
  agentId:        number;
  eventId?:       number | null;
  conversationId?: number | null;
  messageId?:     number | null;
  /** Namespace = mismo que las tools del registry. */
  actionType:     string;
  /** Endpoint HTTP pre-armado por el Agent Core (opcional). */
  httpMethod?:    string;
  httpPath?:      string;
  httpBody?:      Record<string, unknown>;
  /** Texto legible que verá el admin en el modal. */
  summary:        string;
  /** Default 'medium'. */
  riskLevel?:     RiskLevel;
  /** Default 24h. */
  expiresInMs?:   number;
  correlationId?: string;
}

export interface ResolveActionInput {
  proposalId:      string;
  resolvedBy:      number;
  approved:        boolean;
  /** Si approve=true, el resultado de ejecutar la acción. */
  result?:         Record<string, unknown>;
  /** Si approve=false, motivo de rechazo. */
  rejectionReason?: string;
}

// ─── proposeAction ───────────────────────────────────────────────────

/**
 * Crea una nueva proposal en estado 'pending'. El Agent Core debe llamar
 * esto cuando detecta que una acción amerita confirmación humana.
 *
 * Importante: el Agent Core también debe llamar recordAudit({stage:'perceived'})
 * ANTES de proponer, así queda trazado el razonamiento que llevó a la propuesta.
 */
export async function proposeAction(input: ProposeActionInput): Promise<string> {
  const expiresInMs = input.expiresInMs ?? 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + expiresInMs);

  const [row] = await db
    .insert(agentActionProposals)
    .values({
      agentId:        input.agentId,
      eventId:        input.eventId ?? null,
      conversationId: input.conversationId ?? null,
      messageId:      input.messageId ?? null,
      actionType:     input.actionType,
      httpMethod:     input.httpMethod ?? null,
      httpPath:       input.httpPath ?? null,
      httpBody:       input.httpBody ?? null,
      summary:        input.summary,
      riskLevel:      input.riskLevel ?? 'medium',
      status:         'pending',
      expiresAt,
      correlationId:  input.correlationId ?? null,
    })
    .returning({ id: agentActionProposals.id });

  if (!row) throw new Error('proposeAction: INSERT no devolvió id');

  // Audit log: registramos que se propuso (sin esperar al confirm).
  await recordAudit({
    agentId:       input.agentId,
    eventId:       input.eventId ?? null,
    conversationId: input.conversationId ?? null,
    messageId:     input.messageId ?? null,
    stage:         'perceived',
    toolName:      input.actionType,
    toolParams:    input.httpBody,
    reasoning:     input.summary,
    riskLevel:     input.riskLevel ?? 'medium',
    proposalId:    row.id,
    correlationId: input.correlationId,
  });

  return row.id;
}

// ─── resolveAction ───────────────────────────────────────────────────

/**
 * Aprueba o rechaza una proposal.
 *   - approved=true  → status='approved', guarda result
 *   - approved=false → status='rejected', guarda rejectionReason
 *
 * El caller (frontend después de ejecutar la HTTP call, o un endpoint
 * interno del Agent Core) es responsable de:
 *   1. Si approved=true, EJECUTAR la http call (con el httpMethod/httpPath/httpBody
 *      guardados en la proposal).
 *   2. Pasar el resultado en `result`.
 *
 * Esta función NO ejecuta la HTTP call. Solo actualiza el estado.
 */
export async function resolveAction(input: ResolveActionInput): Promise<{
  status: ProposalStatus;
  proposal: typeof agentActionProposals.$inferSelect;
}> {
  return await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(agentActionProposals)
      .where(eq(agentActionProposals.id, input.proposalId))
      .for('update');

    if (!existing) {
      throw new Error(`resolveAction: proposal ${input.proposalId} no existe`);
    }
    if (existing.status !== 'pending') {
      throw new Error(
        `resolveAction: proposal ${input.proposalId} ya está en estado '${existing.status}', no se puede resolver de nuevo`,
      );
    }

    const newStatus: ProposalStatus = input.approved ? 'approved' : 'rejected';
    const [updated] = await tx
      .update(agentActionProposals)
      .set({
        status:           newStatus,
        resolvedBy:       input.resolvedBy,
        resolvedAt:       new Date(),
        result:           input.approved ? (input.result ?? null) : null,
        rejectionReason:  input.approved ? null : (input.rejectionReason ?? 'Sin motivo'),
      })
      .where(eq(agentActionProposals.id, input.proposalId))
      .returning();

    if (!updated) throw new Error('resolveAction: UPDATE no devolvió fila');

    // Audit log: registrar la decisión.
    await recordAudit({
      agentId:       updated.agentId,
      eventId:       updated.eventId,
      conversationId: updated.conversationId,
      messageId:     updated.messageId,
      stage:         input.approved ? 'confirmed' : 'rejected',
      actorUserId:   input.resolvedBy,
      toolName:      updated.actionType,
      toolResult:    input.approved ? input.result : undefined,
      reasoning:     input.approved
        ? `Acción aprobada por usuario ${input.resolvedBy}`
        : `Acción rechazada: ${input.rejectionReason ?? 'sin motivo'}`,
      riskLevel:     updated.riskLevel as RiskLevel,
      proposalId:    updated.id,
      correlationId: updated.correlationId,
    });

    return { status: newStatus, proposal: updated };
  });
}

/**
 * Cancela una proposal (típicamente porque el evento que la disparó ya
 * no es relevante, o el Agent Core decide abortar).
 */
export async function cancelProposal(proposalId: string, reason?: string): Promise<void> {
  const [updated] = await db
    .update(agentActionProposals)
    .set({
      status:          'cancelled',
      resolvedAt:      new Date(),
      rejectionReason: reason ?? 'Cancelada por el sistema',
    })
    .where(and(
      eq(agentActionProposals.id, proposalId),
      eq(agentActionProposals.status, 'pending'),
    ))
    .returning();

  if (updated) {
    await recordAudit({
      agentId:      updated.agentId,
      stage:        'rejected',
      toolName:     updated.actionType,
      reasoning:    `Proposal cancelada: ${reason ?? 'sin motivo'}`,
      riskLevel:    updated.riskLevel as RiskLevel,
      proposalId:   updated.id,
      correlationId: updated.correlationId,
    });
  }
}

// ─── expireOldProposals ──────────────────────────────────────────────

/**
 * Marca como 'expired' todas las proposals pendientes que vencieron.
 * Llamar desde un CRON diario o al inicio de processEvent del Agent Core.
 */
export async function expireOldProposals(): Promise<number> {
  const result = await db
    .update(agentActionProposals)
    .set({
      status:     'expired',
      resolvedAt: new Date(),
    })
    .where(and(
      eq(agentActionProposals.status, 'pending'),
      lt(agentActionProposals.expiresAt, new Date()),
    ))
    .returning({ id: agentActionProposals.id });
  return result.length;
}

// ─── Consultas ───────────────────────────────────────────────────────

export interface ListProposalsOptions {
  agentId?:     number;
  status?:      ProposalStatus | 'all';
  actionType?:  string;
  limit?:       number;
  offset?:      number;
}

export async function listProposals(opts: ListProposalsOptions = {}) {
  const limit  = Math.min(Math.max(opts.limit  ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);

  const conditions = [];
  if (opts.agentId)    conditions.push(eq(agentActionProposals.agentId, opts.agentId));
  if (opts.actionType) conditions.push(eq(agentActionProposals.actionType, opts.actionType));
  if (opts.status && opts.status !== 'all') {
    conditions.push(eq(agentActionProposals.status, opts.status));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, totalRows] = await Promise.all([
    db.select().from(agentActionProposals).where(where as any)
      .orderBy(desc(agentActionProposals.createdAt))
      .limit(limit).offset(offset),
    db.select({ count: sql<number>`COUNT(*)` }).from(agentActionProposals).where(where as any),
  ]);

  return { rows, total: Number(totalRows[0]?.count ?? 0) };
}

export async function getProposalById(id: string) {
  const [row] = await db
    .select()
    .from(agentActionProposals)
    .where(eq(agentActionProposals.id, id))
    .limit(1);
  return row ?? null;
}
