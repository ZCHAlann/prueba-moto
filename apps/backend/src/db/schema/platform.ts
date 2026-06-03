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
  failedLoginAttempts: integer('failed_login_attempts').default(0),
  lockedUntil:        timestamp('locked_until'),
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
    failedLoginAttempts: integer('failed_login_attempts').default(0),
    lockedUntil:        timestamp('locked_until'),
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

export const platformSettings = pgTable('platform_settings', {
  id:                    integer('id').primaryKey().default(1),  // siempre 1 — singleton
  // General
  platformName:          varchar('platform_name', { length: 120 }).default('ApliSmart Motors'),
  platformUrl:           varchar('platform_url', { length: 255 }),
  supportEmail:          varchar('support_email', { length: 160 }),
  defaultTimezone:       varchar('default_timezone', { length: 80 }).default('America/Guayaquil'),
  defaultLanguage:       varchar('default_language', { length: 10 }).default('es'),
  // Seguridad
  passwordMinLength:     integer('password_min_length').default(8),
  passwordRequireUpper:  boolean('password_require_upper').default(true),
  passwordRequireNumber: boolean('password_require_number').default(true),
  passwordRequireSymbol: boolean('password_require_symbol').default(false),
  passwordExpiryDays:    integer('password_expiry_days').default(0),   // 0 = nunca
  sessionExpiryHours:    integer('session_expiry_hours').default(24),
  maxLoginAttempts:      integer('max_login_attempts').default(5),
  lockoutMinutes:        integer('lockout_minutes').default(30),
  // Notificaciones
  smtpHost:              varchar('smtp_host', { length: 255 }),
  smtpPort:              integer('smtp_port').default(587),
  smtpUser:              varchar('smtp_user', { length: 160 }),
  smtpPassword:          text('smtp_password'),                         // cifrado en app
  smtpFromAddress:       varchar('smtp_from_address', { length: 160 }),
  smtpFromName:          varchar('smtp_from_name', { length: 120 }),
  notifyOnNewCompany:    boolean('notify_on_new_company').default(true),
  notifyOnTrialExpiring: boolean('notify_on_trial_expiring').default(true),
  notifyOnLoginFailure:  boolean('notify_on_login_failure').default(false),
  // Defaults para nuevas empresas
  defaultTrialDays:      integer('default_trial_days').default(14),
  defaultMaxUsers:       integer('default_max_users').default(5),
  defaultMaxAssets:      integer('default_max_assets').default(20),
  updatedAt:             timestamp('updated_at').notNull().defaultNow(),
  updatedBy:             integer('updated_by').references(() => platformUsers.id, { onDelete: 'set null' }),
});

// ─────────────────────────────────────────────
// Facturación
// ─────────────────────────────────────────────

export const invoiceStatusEnum = pgEnum('invoice_status_enum', [
  'draft',
  'sent',
  'paid',
  'overdue',
  'cancelled',
]);

export const billingCycleEnum = pgEnum('billing_cycle_enum', [
  'monthly',
  'annual',
]);

export const platformInvoices = pgTable('platform_invoices', {
  id:            serial('id').primaryKey(),
  companyId:     integer('company_id').notNull()
                   .references(() => companies.id, { onDelete: 'cascade' }),
  planId:        varchar('plan_id', { length: 40 })
                   .references(() => platformPlans.id, { onDelete: 'set null' }),

  invoiceNumber: varchar('invoice_number', { length: 40 }).notNull().unique(),
  status:        invoiceStatusEnum('status').notNull().default('draft'),
  cycle:         billingCycleEnum('cycle').notNull().default('monthly'),

  amount:        numeric('amount', { precision: 12, scale: 2 }).notNull(),
  tax:           numeric('tax', { precision: 12, scale: 2 }).default('0'),
  total:         numeric('total', { precision: 12, scale: 2 }).notNull(),

  issuedAt:      date('issued_at').notNull(),
  dueAt:         date('due_at').notNull(),
  paidAt:        date('paid_at'),

  notes:         text('notes'),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
  updatedAt:     timestamp('updated_at').notNull().defaultNow(),
});

// ─────────────────────────────────────────────
// Soporte / Tickets
// ─────────────────────────────────────────────

export const ticketStatusEnum = pgEnum('ticket_status_enum', [
  'open',
  'in_progress', 
  'resolved',
  'closed',
]);

export const ticketPriorityEnum = pgEnum('ticket_priority_enum', [
  'low',
  'medium',
  'high',
  'critical',
]);

export const platformTickets = pgTable('platform_tickets', {
  id:           serial('id').primaryKey(),
  companyId:    integer('company_id').notNull()
                  .references(() => companies.id, { onDelete: 'cascade' }),
  createdBy:    integer('created_by')
                  .references(() => companyUsers.id, { onDelete: 'set null' }),
  assignedTo:   integer('assigned_to')
                  .references(() => platformUsers.id, { onDelete: 'set null' }),

  ticketNumber: varchar('ticket_number', { length: 40 }).notNull().unique(),
  title:        varchar('title', { length: 255 }).notNull(),
  description:  text('description').notNull(),
  status:       ticketStatusEnum('status').notNull().default('open'),
  priority:     ticketPriorityEnum('priority').notNull().default('medium'),
  category:     varchar('category', { length: 80 }),  // 'bug' | 'consulta' | 'facturación' | 'acceso' | 'otro'

  resolvedAt:   timestamp('resolved_at'),
  closedAt:     timestamp('closed_at'),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
  updatedAt:    timestamp('updated_at').notNull().defaultNow(),
});

export const platformTicketMessages = pgTable('platform_ticket_messages', {
  id:        serial('id').primaryKey(),
  ticketId:  integer('ticket_id').notNull()
               .references(() => platformTickets.id, { onDelete: 'cascade' }),

  // autor — uno de los dos será null
  authorPlatformUserId: integer('author_platform_user_id')
                          .references(() => platformUsers.id, { onDelete: 'set null' }),
  authorCompanyUserId:  integer('author_company_user_id')
                          .references(() => companyUsers.id, { onDelete: 'set null' }),

  authorName:  varchar('author_name', { length: 160 }),
  authorRole:  varchar('author_role', { length: 40 }),  // 'platform' | 'company'
  body:        text('body').notNull(),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
});