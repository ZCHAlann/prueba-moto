import {
  pgTable,
  pgEnum,
  serial,
  varchar,
  text,
  timestamp,
  unique,
  integer,
  jsonb,
  date,
  numeric,
  boolean,
} from 'drizzle-orm/pg-core';

// ─────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────

export const companyStatusEnum = pgEnum('company_status_enum', [
  'active',
  'inactive',
  'suspended',
  'trial',
]);

export const leadStatusEnum = pgEnum('lead_status_enum', [
  'nuevo',
  'contactado',
  'demo_agendada',
  'propuesta_enviada',
  'ganado',
  'perdido',
]);

export const planTierEnum = pgEnum('plan_tier_enum', [
  'free',
  'starter',
  'pro',
  'enterprise',
]);

// ─────────────────────────────────────────────
// Planes
// ─────────────────────────────────────────────

export const platformPlans = pgTable('platform_plans', {
  id: varchar('id', { length: 40 }).primaryKey(),         // 'free' | 'starter' | 'pro' | 'enterprise'
  name: varchar('name', { length: 80 }).notNull(),
  tier: planTierEnum('tier').notNull(),
  monthlyPrice: numeric('monthly_price', { precision: 10, scale: 2 }).default('0'),
  annualPrice: numeric('annual_price', { precision: 10, scale: 2 }).default('0'),
  maxUsers: integer('max_users'),                          // null = ilimitado
  maxAssets: integer('max_assets'),
  allowedModules: text('allowed_modules').array().notNull().default([]),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// Empresas
// ─────────────────────────────────────────────

export const companies = pgTable('companies', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 160 }).notNull(),
  slug: varchar('slug', { length: 80 }).notNull().unique(),

  // Plan y estado
  planId: varchar('plan_id', { length: 40 }).notNull().default('free')
    .references(() => platformPlans.id),
  status: companyStatusEnum('status').notNull().default('active'),
  enabledModules: text('enabled_modules').array().notNull().default([]),

  // Info comercial / geográfica
  industry: varchar('industry', { length: 80 }),           // transporte, logística, construcción...
  country: varchar('country', { length: 80 }),
  city: varchar('city', { length: 80 }),
  contactName: varchar('contact_name', { length: 160 }),
  contactEmail: varchar('contact_email', { length: 160 }),
  contactPhone: varchar('contact_phone', { length: 40 }),
  website: varchar('website', { length: 255 }),
  notes: text('notes'),

  // Fechas clave
  trialEndsAt: timestamp('trial_ends_at'),
  contractStartAt: date('contract_start_at'),
  contractEndAt: date('contract_end_at'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// Usuarios de plataforma
// ─────────────────────────────────────────────

export const platformUsers = pgTable('platform_users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 160 }).notNull().unique(),
  username: varchar('username', { length: 80 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 40 }).notNull(),
  status: varchar('status', { length: 40 }).notNull().default('active'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// Usuarios de empresa
// ─────────────────────────────────────────────

export const companyUsers = pgTable(
  'company_users',
  {
    id: serial('id').primaryKey(),
    companyId: integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 160 }).notNull(),
    username: varchar('username', { length: 80 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    role: varchar('role', { length: 40 }).notNull(),
    status: varchar('status', { length: 40 }).notNull().default('active'),
    profileData: jsonb('profile_data').notNull().default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('company_users_company_id_email').on(table.companyId, table.email),
    unique('company_users_company_id_username').on(table.companyId, table.username),
  ]
);

// ─────────────────────────────────────────────
// Leads (CRM comercial)
// ─────────────────────────────────────────────

export const platformLeads = pgTable('platform_leads', {
  id: serial('id').primaryKey(),
  companyName: varchar('company_name', { length: 160 }).notNull(),
  contactName: varchar('contact_name', { length: 160 }),
  contactEmail: varchar('contact_email', { length: 160 }),
  contactPhone: varchar('contact_phone', { length: 40 }),
  industry: varchar('industry', { length: 80 }),
  country: varchar('country', { length: 80 }),
  city: varchar('city', { length: 80 }),
  status: leadStatusEnum('status').notNull().default('nuevo'),
  source: varchar('source', { length: 80 }),               // web, referido, demo, cold...
  assignedTo: integer('assigned_to').references(() => platformUsers.id, { onDelete: 'set null' }),
  estimatedValue: numeric('estimated_value', { precision: 12, scale: 2 }),
  notes: text('notes'),
  convertedToCompanyId: integer('converted_to_company_id')
    .references(() => companies.id, { onDelete: 'set null' }),
  convertedAt: timestamp('converted_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// Auditoría de plataforma
// ─────────────────────────────────────────────

export const platformAuditEntries = pgTable('platform_audit_entries', {
  id: serial('id').primaryKey(),
  actorId: integer('actor_id').references(() => platformUsers.id, { onDelete: 'set null' }),
  actorEmail: varchar('actor_email', { length: 160 }),
  action: varchar('action', { length: 80 }).notNull(),     // 'company.created', 'plan.changed'...
  entity: varchar('entity', { length: 80 }),               // 'company' | 'lead' | 'plan' | 'user'
  entityId: varchar('entity_id', { length: 80 }),
  description: text('description'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});