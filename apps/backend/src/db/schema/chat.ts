// db/schema/chat.ts
// ─────────────────────────────────────────────────────────────────────────────
// Tablas del chat interno entre personas (jul 2026 v8).
//
// Espejo del SQL en `drizzle/0063_chat_interno.sql`. Coherente con el
// spec v2: Ai Assitant/aplismart-chat-interno-spec-v2.md.
//
// Decisiones:
//   * BIGSERIAL + public_id UUID (lo mejor de los dos mundos, como
//     decidimos en la sesión de revisión).
//   * empresaId NOT NULL en conversaciones: per-tenant estricto.
//   * Mensajes son inmutables (sin editado_en / borrado_en).
//   * mensajes_leidos es per-user (no per-device).
// ─────────────────────────────────────────────────────────────────────────────

import {
  pgTable,
  bigserial,
  bigint,
  integer,
  varchar,
  text,
  timestamp,
  uuid,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies, companyUsers } from './platform';

// ─── conversaciones ─────────────────────────────────────────────────────────
export const conversaciones = pgTable(
  'conversaciones',
  {
    id:            bigserial('id', { mode: 'number' }).primaryKey(),
    publicId:      uuid('public_id').notNull().unique().defaultRandom(),
    empresaId:     integer('empresa_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    tipo:          varchar('tipo', { length: 20 }).notNull(),
    nombre:        varchar('nombre', { length: 120 }),
    avatarUrl:     text('avatar_url'),
    creadoPor:     integer('creado_por').notNull().references(() => companyUsers.id),
    creadoEn:      timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_conv_empresa').on(t.empresaId),
    index('idx_conv_actualizado').on(t.empresaId, t.actualizadoEn),
  ],
);

// ─── participantes ──────────────────────────────────────────────────────────
export const participantes = pgTable(
  'participantes',
  {
    conversacionId: bigint('conversacion_id', { mode: 'number' }).notNull().references(() => conversaciones.id, { onDelete: 'cascade' }),
    usuarioId:      integer('usuario_id').notNull().references(() => companyUsers.id, { onDelete: 'cascade' }),
    // Snapshot del rol al unirse. NO se sincroniza si después le cambian
    // el rol al user. Es histórico. VARCHAR(40) sin CHECK porque los
    // roles del sistema son KEYS de company_roles (no enum fijo), y
    // cada empresa puede crear roles custom.
    rol:            varchar('rol', { length: 40 }).notNull(),
    joinedAt:       timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt:     timestamp('last_seen_at', { withTimezone: true }),
    silenciadoHasta: timestamp('silenciado_hasta', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.conversacionId, t.usuarioId] }),
    index('idx_part_usuario').on(t.usuarioId),
  ],
);

// ─── mensajes (append-only) ─────────────────────────────────────────────────
export const mensajes = pgTable(
  'mensajes',
  {
    id:                bigserial('id', { mode: 'number' }).primaryKey(),
    publicId:          uuid('public_id').notNull().unique().defaultRandom(),
    conversacionId:    bigint('conversacion_id', { mode: 'number' }).notNull().references(() => conversaciones.id, { onDelete: 'cascade' }),
    remitenteId:       integer('remitente_id').notNull().references(() => companyUsers.id),
    contenido:         text('contenido'),
    tipo:              varchar('tipo', { length: 20 }).notNull().default('texto'),
    adjuntoUrl:        text('adjunto_url'),
    adjuntoMimeType:   text('adjunto_mime_type'),
    adjuntoSizeBytes:  integer('adjunto_size_bytes'),
    // UUID generado por el cliente al crear el placeholder optimista.
    // Se persiste para que el matching placeholder ↔ real sea estricto
    // (sin fallback por contenido, que causaba duplicación cuando el
    // user enviaba el mismo texto dos veces). UNIQUE (remitente_id,
    // client_msg_id) garantiza idempotencia server-side en retries.
    clientMsgId:       text('client_msg_id'),
    creadoEn:          timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_msg_conv_created').on(t.conversacionId, t.creadoEn),
    index('idx_msg_remitente').on(t.remitenteId),
  ],
);

// ─── mensajes_leidos (per-user) ────────────────────────────────────────────
export const mensajesLeidos = pgTable(
  'mensajes_leidos',
  {
    mensajeId:  bigint('mensaje_id', { mode: 'number' }).notNull().references(() => mensajes.id, { onDelete: 'cascade' }),
    usuarioId:  integer('usuario_id').notNull().references(() => companyUsers.id, { onDelete: 'cascade' }),
    leidoEn:    timestamp('leido_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.mensajeId, t.usuarioId] }),
    index('idx_leidos_usuario').on(t.usuarioId),
  ],
);

// ─── mensaje_reacciones (jul 2026 v8.1) ────────────────────────────────────
// Un user puede tener 1 reacción por emoji por mensaje. UNIQUE
// (mensaje_id, usuario_id, emoji). El frontend decide qué emojis
// permitimos (no hay CHECK porque la lista es abierta).
export const mensajeReacciones = pgTable(
  'mensaje_reacciones',
  {
    id:         bigserial('id', { mode: 'number' }).primaryKey(),
    mensajeId:  bigint('mensaje_id', { mode: 'number' }).notNull().references(() => mensajes.id, { onDelete: 'cascade' }),
    usuarioId:  integer('usuario_id').notNull().references(() => companyUsers.id, { onDelete: 'cascade' }),
    emoji:      varchar('emoji', { length: 16 }).notNull(),
    creadoEn:   timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_reacciones_mensaje').on(t.mensajeId),
    index('idx_reacciones_usuario').on(t.usuarioId),
  ],
);

// ─── Tipos inferidos ───────────────────────────────────────────────────────
export type Conversacion        = typeof conversaciones.$inferSelect;
export type ConversacionInsert   = typeof conversaciones.$inferInsert;
export type Participante        = typeof participantes.$inferSelect;
export type Mensaje             = typeof mensajes.$inferSelect;
export type MensajeLeido        = typeof mensajesLeidos.$inferSelect;
export type MensajeReaccion     = typeof mensajeReacciones.$inferSelect;
