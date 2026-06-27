// db/schema/jarvis.ts
// ─────────────────────────────────────────────────────────────────────
// Tablas del Asistente IA (Jarvis).
//
// Coherente con Parte III sección 32 (Auditoría):
//
//   ai_conversations: una fila por sesión de chat.
//   ai_messages:      todos los mensajes (user + assistant) de cada
//                     conversación, con tokens y duración.
//
// El empresa_id SIEMPRE viene del JWT, no del prompt ni de inputs
// del usuario. Esto se enforcea en el endpoint, NO aquí en schema.
// ─────────────────────────────────────────────────────────────────────

import {
  pgTable,
  serial,
  integer,
  timestamp,
  varchar,
  index,
  text,
  jsonb,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies, companyUsers } from './platform';

export const aiConversations = pgTable(
  'ai_conversations',
  {
    id:          serial('id').primaryKey(),
    empresaId:   integer('empresa_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    userId:      integer('user_id').notNull().references(() => companyUsers.id, { onDelete: 'cascade' }),
    title:       varchar('title', { length: 160 }).notNull().default(''),
    /** Conteo acumulado de tokens del usuario en la conversación. */
    totalTokensIn:  integer('total_tokens_in').notNull().default(0),
    totalTokensOut: integer('total_tokens_out').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('idx_ai_conv_empresa_user').on(t.empresaId, t.userId, t.updatedAt),
  ],
);

export const aiMessages = pgTable(
  'ai_messages',
  {
    id:              serial('id').primaryKey(),
    conversationId:  integer('conversation_id').notNull().references(() => aiConversations.id, { onDelete: 'cascade' }),
    role:            varchar('role', { length: 20 }).notNull(), // 'user' | 'assistant' | 'tool' | 'system'
    content:         text('content').notNull(),
    /** Modelo usado (e.g. 'llama-3.3-70b-versatile'). */
    model:           varchar('model', { length: 80 }),
    tokensIn:        integer('tokens_in'),
    tokensOut:       integer('tokens_out'),
    latencyMs:       integer('latency_ms'),
    /** Si hubo error (timeout, 5xx, modelo caído, etc.) se persiste acá. */
    error:           varchar('error', { length: 200 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('idx_ai_msg_conv_created').on(t.conversationId, t.createdAt),
  ],
);

/**
 * Cada invocación de tool dentro de una conversación.
 * Permite auditar qué herramientas usó Jarvis para responder cada pregunta
 * (Parte III sección 32 + Parte IV sección 50).
 */
export const aiToolCalls = pgTable(
  'ai_tool_calls',
  {
    id:             serial('id').primaryKey(),
    conversationId: integer('conversation_id').notNull().references(() => aiConversations.id, { onDelete: 'cascade' }),
    /** Mensaje del assistant que disparó la tool call. */
    messageId:      integer('message_id').references(() => aiMessages.id, { onDelete: 'set null' }),
    tool:           varchar('tool', { length: 80 }).notNull(),
    /** Argumentos crudos que el modelo pidió para la tool (JSON string). */
    arguments:      text('arguments').notNull().default('{}'),
    /** Resumen textual del resultado (primeras 500 chars o conteo). */
    resultSummary:  text('result_summary'),
    /** Cantidad de filas devueltas, útil para ranking de uso. */
    resultCount:    integer('result_count'),
    latencyMs:      integer('latency_ms'),
    error:          varchar('error', { length: 200 }),
    createdAt:      timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('idx_ai_tool_conv').on(t.conversationId, t.createdAt),
    index('idx_ai_tool_name').on(t.tool, t.createdAt),
  ],
);

/**
 * Acciones de ESCRITURA que Jarvis PROPONE pero NO EJECUTA.
 *
 * El LLM devuelve el "plan" (qué endpoint HTTP llamar y con qué body).
 * El backend persiste acá. El frontend lee esto, muestra un modal
 * "Confirmar / Cancelar", y al confirmar llama al endpoint real.
 *
 * Es la barrera contra acciones destructivas automáticas — el LLM no
 * puede tocar la DB directamente, solo proponer.
 */
export const aiPendingActions = pgTable(
  'ai_pending_actions',
  {
    id:             uuid('id').primaryKey().defaultRandom(),
    empresaId:      integer('empresa_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    userId:         integer('user_id').notNull().references(() => companyUsers.id, { onDelete: 'cascade' }),
    conversationId: integer('conversation_id').references(() => aiConversations.id, { onDelete: 'set null' }),
    messageId:      integer('message_id').references(() => aiMessages.id, { onDelete: 'set null' }),

    /** Tipo semántico: 'finalize_maintenance', 'create_checklist', etc. */
    actionType:     varchar('action_type', { length: 80 }).notNull(),
    httpMethod:     varchar('http_method', { length: 10 }).notNull(),
    httpPath:       varchar('http_path', { length: 300 }).notNull(),
    httpBody:       jsonb('http_body').notNull(),

    /** Texto legible que verá el usuario en el modal de confirmación. */
    summary:        text('summary').notNull(),

    /** pending | executed | cancelled | expired */
    status:         varchar('status', { length: 20 }).notNull().default('pending'),

    createdAt:  timestamp('created_at').notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at'),
    expiresAt:  timestamp('expires_at').notNull(),
  },
  (t) => [
    index('idx_ai_pending_empresa_user').on(t.empresaId, t.userId, t.status),
  ],
);