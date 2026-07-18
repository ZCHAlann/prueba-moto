// db/schema/agent.ts
// ─────────────────────────────────────────────────────────────────────
// Tablas del Asistente IA Transversal (Agent Core).
//
// Coherente con el documento de arquitectura secciones 1, 2, 5, 8, 9 y 11:
//   agentEvents:           cola de eventos normalizados que el Agent Core
//                          consume. Tabla "percibir" del ciclo.
//   agentAuditLog:         log inmutable de cada percibir/razonar/actuar.
//                          Tabla "registrar" del ciclo. Triggers la hacen
//                          inmutable (UPDATE/DELETE → EXCEPTION).
//   agentActionProposals:  flujo de confirmación humana para acciones de
//                          riesgo medio/alto. Tabla del "human-in-the-loop"
//                          (sección 5.1 del plan).
//
// Convenciones:
//   - agentId SIEMPRE viene del JWT en el backend, NUNCA del LLM ni del
//     payload del evento. Esto se enforce en el handler HTTP, no acá.
//   - payload es jsonb libre: el Agent Core lo interpreta según eventType.
//   - Los nombres de eventType siguen la convención
//     '<modulo>.<verbo_pasado>': ej. 'maintenance.completed',
//     'finance.voucher_reopened_correction', 'checklist.observation_reported'.
//     Ver catálogo: apps/frontend/src/components/ai-assistant/docs/
//                   fase0-catalogo-tools-cross-modulo-eventos.md (sección C).
// ─────────────────────────────────────────────────────────────────────

import {
  pgTable,
  bigserial,
  integer,
  text,
  varchar,
  smallint,
  jsonb,
  timestamp,
  uuid,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies, companyUsers } from './platform';
import { aiConversations, aiMessages } from './jarvis';

// ─── 1) Cola de eventos ────────────────────────────────────────────────

export const agentEvents = pgTable(
  'agent_events',
  {
    id:             bigserial('id', { mode: 'number' }).primaryKey(),
    agentId:        integer('agent_id').references(() => companies.id, { onDelete: 'cascade' }),
    // Texto libre (no enum) para no limitar fuentes. Valores comunes:
    //   'cron'   — disparado por un cron job (lib/cron/*)
    //   'chat'   — viene del chat interno (futuro módulo)
    //   'user'   — un humano (admin/operador) le pidió algo directo
    //   'tool'   — disparado por una tool al finalizar
    //   'db'     — disparado por un trigger de BD (futuro)
    //   'jarvis' — disparado por el chat con Jarvis
    //   'system' — evento de sistema (arranque, shutdown, etc.)
    source:         varchar('source', { length: 40 }).notNull(),
    // Tipo semántico. Ver doc arquitectura sección 4.1 y catálogo sección C.
    eventType:      varchar('event_type', { length: 120 }).notNull(),
    // 0 normal, >= 100 urgente. Default 0.
    priority:       smallint('priority').notNull().default(0),
    // Payload libre. El Agent Core lo interpreta según eventType.
    payload:        jsonb('payload').notNull().default({}),
    // Agrupa eventos relacionados. Se propaga al audit log y proposals.
    correlationId:  uuid('correlation_id'),
    // Cuántas veces fue reclamado por el Agent Core sin éxito.
    claimAttempts:  integer('claim_attempts').notNull().default(0),
    claimError:     text('claim_error'),
    createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt:    timestamp('processed_at', { withTimezone: true }),
    // Si está set, el claim vence y se libera.
    claimExpiresAt: timestamp('claim_expires_at', { withTimezone: true }),
  },
  (t) => [
    // Consumer scan: próximos eventos pendientes, prioridad desc + created_at asc.
    index('idx_agent_events_pending')
      .on(t.priority, t.createdAt)
      .where(sql`processed_at IS NULL`),
    // Lookup por empresa + rango de fechas.
    index('idx_agent_events_agent_created').on(t.agentId, t.createdAt),
    // Lookup por tipo.
    index('idx_agent_events_type').on(t.eventType, t.createdAt),
    // correlation_id.
    index('idx_agent_events_correlation')
      .on(t.correlationId)
      .where(sql`correlation_id IS NOT NULL`),
  ],
);

// ─── 2) Audit log inmutable ────────────────────────────────────────────

export const agentAuditLog = pgTable(
  'agent_audit_log',
  {
    id:              bigserial('id', { mode: 'number' }).primaryKey(),
    agentId:         integer('agent_id').references(() => companies.id, { onDelete: 'cascade' }),
    // Etapa del ciclo: 'perceived' | 'reasoned' | 'acted' | 'confirmed' |
    // 'rejected' | 'failed' | 'system'.
    stage:           varchar('stage', { length: 20 }).notNull(),
    // Evento que disparó esta entrada (si aplica).
    eventId:         integer('event_id').references(
      () => agentEvents.id, { onDelete: 'set null' }
    ),
    conversationId:  integer('conversation_id').references(() => aiConversations.id, { onDelete: 'set null' }),
    messageId:       integer('message_id').references(() => aiMessages.id, { onDelete: 'set null' }),
    // Usuario que autorizó (NULL = acción autónoma).
    actorUserId:     integer('actor_user_id').references(() => companyUsers.id, { onDelete: 'set null' }),
    // Tool ejecutada (NULL si no fue una tool).
    toolName:        varchar('tool_name', { length: 80 }),
    toolParams:      jsonb('tool_params'),
    toolResult:      jsonb('tool_result'),
    // Texto que el agente usó para razonar.
    reasoning:       text('reasoning'),
    // 'low' | 'medium' | 'high'. Coincide con agentActionProposals.
    riskLevel:       varchar('risk_level', { length: 10 }),
    // Referencia lógica a agentActionProposals (no FK dura).
    proposalId:      uuid('proposal_id'),
    correlationId:   uuid('correlation_id'),
    // Error message si stage = 'failed'.
    error:           text('error'),
    // Latencia en ms.
    latencyMs:       integer('latency_ms'),
    createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_agent_audit_agent_created').on(t.agentId, t.createdAt),
    index('idx_agent_audit_event').on(t.eventId).where(sql`event_id IS NOT NULL`),
    index('idx_agent_audit_tool').on(t.toolName, t.createdAt).where(sql`tool_name IS NOT NULL`),
    index('idx_agent_audit_correlation').on(t.correlationId).where(sql`correlation_id IS NOT NULL`),
    index('idx_agent_audit_actor').on(t.actorUserId).where(sql`actor_user_id IS NOT NULL`),
  ],
);

// ─── 3) Action proposals (human-in-the-loop) ───────────────────────────

export const agentActionProposals = pgTable(
  'agent_action_proposals',
  {
    id:              uuid('id').primaryKey().defaultRandom(),
    agentId:         integer('agent_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    eventId:         integer('event_id').references(
      () => agentEvents.id, { onDelete: 'set null' }
    ),
    conversationId:  integer('conversation_id').references(() => aiConversations.id, { onDelete: 'set null' }),
    messageId:       integer('message_id').references(() => aiMessages.id, { onDelete: 'set null' }),
    // 'schedule_maintenance' | 'send_email' | 'flag_vehicle_out_of_service' | etc.
    // Namespace = mismo que las tools del registry.
    actionType:      varchar('action_type', { length: 80 }).notNull(),
    // Si el Agent Core ya conoce el endpoint HTTP, lo pre-llena para que
    // el frontend solo tenga que confirmar y disparar.
    httpMethod:      varchar('http_method', { length: 10 }),
    httpPath:        varchar('http_path', { length: 300 }),
    httpBody:        jsonb('http_body'),
    // Texto legible que verá el admin en el modal de confirmación.
    summary:         text('summary').notNull(),
    // 'low' | 'medium' | 'high'. Default 'medium'.
    riskLevel:       varchar('risk_level', { length: 10 }).notNull().default('medium'),
    // 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled'.
    status:          varchar('status', { length: 20 }).notNull().default('pending'),
    resolvedBy:      integer('resolved_by').references(() => companyUsers.id, { onDelete: 'set null' }),
    resolvedAt:      timestamp('resolved_at', { withTimezone: true }),
    // Lo que devolvió el endpoint HTTP al ejecutar (NULL si pending).
    result:          jsonb('result'),
    rejectionReason: text('rejection_reason'),
    correlationId:   uuid('correlation_id'),
    // Default 24h. El Agent Core o un CRON la marca como 'expired' si vence.
    expiresAt:       timestamp('expires_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_agent_proposals_agent_status').on(t.agentId, t.status, t.createdAt),
    index('idx_agent_proposals_expires').on(t.expiresAt).where(sql`status = 'pending'`),
    index('idx_agent_proposals_correlation').on(t.correlationId).where(sql`correlation_id IS NOT NULL`),
  ],
);
