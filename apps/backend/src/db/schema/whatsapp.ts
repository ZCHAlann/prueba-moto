// db/schema/whatsapp.ts
// ─────────────────────────────────────────────────────────────────────────────
// Schema para notificaciones WhatsApp (jul 2026 v8.6).
//
// Tablas:
//   1. whatsapp_notifications_log: log de cada intento de envío.
//   2. company_whatsapp_settings: config por empresa (números destino,
//      plantillas con placeholders, enabled).
// ─────────────────────────────────────────────────────────────────────────────

import {
  pgTable, serial, bigserial, varchar, text, integer, boolean,
  timestamp, index, customType,
} from 'drizzle-orm/pg-core';
import { companies } from './platform';

// ── Drizzle no tiene tipo nativo para text[] en pg-core. ─────────────
// Definimos un custom type que mapea a TEXT[] en Postgres.
const textArray = customType<{ data: string[]; driverData: string }>({
  dataType() {
    return 'text[]';
  },
  toDriver(value: string[]): string {
    // pg driver serializa arrays como '{a,b,c}'. Para pg simple, esto
    // funciona si el driver de Drizzle lo wrappea; si no, mandamos
    // un cast explícito en la query.
    return `{${value.map(v => `"${v.replace(/"/g, '\\"')}"`).join(',')}}`;
  },
  fromDriver(value: unknown): string[] {
    if (Array.isArray(value)) return value as string[];
    if (typeof value === 'string') {
      // pg devuelve como '{a,b,c}'.
      return value.replace(/^\{|\}$/g, '').split(',').map(s => s.replace(/^"|"$/g, ''));
    }
    return [];
  },
});

// ── 1. Log de notificaciones (ya existía, lo dejo) ──────────────────

export const whatsappNotificationsLog = pgTable(
  'whatsapp_notifications_log',
  {
    id:           serial('id').primaryKey(),
    companyId:    integer('company_id').references(() => companies.id, { onDelete: 'set null' }),
    recipient:    varchar('recipient', { length: 32 }).notNull(),
    eventType:    varchar('event_type', { length: 64 }).notNull(),
    contextId:    varchar('context_id', { length: 64 }),
    messageText:  text('message_text').notNull(),
    ok:           boolean('ok').notNull(),
    error:        text('error'),
    statusCode:   integer('status_code'),
    createdAt:    timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    byCreatedAt: index('whatsapp_log_created_at_idx').on(t.createdAt),
    byEventType: index('whatsapp_log_event_type_idx').on(t.eventType),
    byContext:   index('whatsapp_log_context_idx').on(t.contextId),
  }),
);

export type WhatsappNotificationLog        = typeof whatsappNotificationsLog.$inferSelect;
export type WhatsappNotificationLogInsert = typeof whatsappNotificationsLog.$inferInsert;

// ── 2. Settings por empresa ─────────────────────────────────────────

export const companyWhatsappSettings = pgTable(
  'company_whatsapp_settings',
  {
    id:                 bigserial('id', { mode: 'number' }).primaryKey(),
    companyId:          integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    notifyNumbers:      textArray('notify_numbers').notNull().default([]),
    // Plantillas con placeholders tipo {{placa}}, {{tipo}}, etc.
    // NULL = usa el default global hardcodeado en el backend.
    templateScheduled:  text('template_scheduled'),
    templateCompleted:  text('template_completed'),
    enabled:            boolean('enabled').notNull().default(true),
    createdAt:          timestamp('created_at').notNull().defaultNow(),
    updatedAt:          timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    byCompany: index('company_whatsapp_settings_company_idx').on(t.companyId),
  }),
);

export type CompanyWhatsappSettings        = typeof companyWhatsappSettings.$inferSelect;
export type CompanyWhatsappSettingsInsert = typeof companyWhatsappSettings.$inferInsert;
