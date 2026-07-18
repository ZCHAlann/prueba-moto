import {
  pgTable,
  pgEnum,
  serial,
  bigserial,
  varchar,
  text,
  timestamp,
  unique,
  integer,
  jsonb,
  date,
  numeric,
  boolean,
  primaryKey,
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
// Catálogo de módulos (jul 2026)
// ─────────────────────────────────────────────
//
// La fuente de verdad de qué módulos y submódulos existen en el sistema
// pasa a ser la BD. El seed inicial se hace desde MODULE_TREE del
// frontend (lib/module-tree.ts) al arrancar el backend.
//
// `is_core = true` marca módulos que no se pueden deshabilitar
// (ej. dashboard) — la UI del superadmin los muestra como "incluidos"
// y el backend los auto-incluye al asignar módulos a una empresa.

export const platformModules = pgTable('platform_modules', {
  id:          varchar('id', { length: 60 }).primaryKey(),             // 'dashboard', 'gestion' ...
  label:       varchar('label', { length: 120 }).notNull(),
  description: text('description').notNull().default(''),
  icon:        varchar('icon', { length: 60 }),
  accent:      varchar('accent', { length: 30 }),
  sortOrder:   integer('sort_order').notNull().default(100),
  isCore:      boolean('is_core').notNull().default(false),
  isActive:    boolean('is_active').notNull().default(true),
  metadata:    jsonb('metadata').notNull().default({}),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
  updatedAt:   timestamp('updated_at').notNull().defaultNow(),
});

export const platformModuleSubmodules = pgTable('platform_module_submodules', {
  id:         varchar('id', { length: 80 }).primaryKey(),               // 'dashboard.kpis_flotas'
  moduleId:   varchar('module_id', { length: 60 }).notNull().references(() => platformModules.id, { onDelete: 'cascade' }),
  label:      varchar('label', { length: 160 }).notNull(),
  sortOrder:  integer('sort_order').notNull().default(100),
  isActive:   boolean('is_active').notNull().default(true),
  createdAt:  timestamp('created_at').notNull().defaultNow(),
});

export const platformPlanModules = pgTable('platform_plan_modules', {
  planId:    varchar('plan_id', { length: 40 }).notNull().references(() => platformPlans.id, { onDelete: 'cascade' }),
  moduleId:  varchar('module_id', { length: 60 }).notNull().references(() => platformModules.id, { onDelete: 'cascade' }),
  enabledAt: timestamp('enabled_at').notNull().defaultNow(),
}, (table) => [
  unique('platform_plan_modules_pk').on(table.planId, table.moduleId),
]);

export const companyEnabledModules = pgTable('company_enabled_modules', {
  companyId:   integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  moduleId:    varchar('module_id', { length: 60 }).notNull().references(() => platformModules.id, { onDelete: 'cascade' }),
  enabledAt:   timestamp('enabled_at').notNull().defaultNow(),
});

export const companyUserCounts = pgTable('company_user_counts', {
  companyId:   integer('company_id').primaryKey().references(() => companies.id, { onDelete: 'cascade' }),
  total:       integer('total').notNull().default(0),
  admins:      integer('admins').notNull().default(0),
  supervisors: integer('supervisors').notNull().default(0),
  operators:   integer('operators').notNull().default(0),
  drivers:     integer('drivers').notNull().default(0),
  updatedAt:   timestamp('updated_at').notNull().defaultNow(),
});

// Módulos habilitados por empresa con detalle de submódulos activos. La
// fuente de verdad de QUÉ módulos están habilitados es la tabla
// `company_enabled_modules` (sin detalle). Esta tabla es opcional y
// la llena la UI de Accesos → Empresa cuando el admin granular permisos
// ─── (removido jul 2026 v8) ──────────────────────────────────────────────────
// Antes existía `company_enabled_submodules` para control granular por
// empresa a nivel submódulo. Se eliminó porque ningún middleware la leía
// (la granularidad real vive en `company_users.module_permissions` per-user).
// Si en el futuro se necesita control per-empresa a nivel submódulo, se
// re-agrega junto con su middleware correspondiente.

// ─────────────────────────────────────────────
// Planes
// ─────────────────────────────────────────────

export const platformPlans = pgTable('platform_plans', {
  id: varchar('id', { length: 40 }).primaryKey(),         // 'free' | 'starter' | 'pro' | 'business' | 'enterprise'
  name: varchar('name', { length: 80 }).notNull(),
  tier: planTierEnum('tier').notNull(),
  monthlyPrice: numeric('monthly_price', { precision: 10, scale: 2 }).default('0'),
  annualPrice: numeric('annual_price', { precision: 10, scale: 2 }).default('0'),
  // Límite global (compat). null = ilimitado.
  maxUsers: integer('max_users'),
  maxAssets: integer('max_assets'),
  // Límites por rol (jul 2026). null = ilimitado.
  // admins      = admin_empresa + owner_empresa
  // supervisors = role = 'supervisor'
  // operators   = role = 'operador'
  // drivers     = role = 'conductor'
  maxAdmins:       integer('max_admins'),
  maxSupervisors:  integer('max_supervisors'),
  maxOperators:    integer('max_operators'),
  maxDrivers:      integer('max_drivers'),
  // Visible al usuario: descripción corta + bullets (JSON array de strings).
  description: text('description'),
  features:    jsonb('features').notNull().default([]),
  isPopular:   boolean('is_popular').notNull().default(false),
  sortOrder:   integer('sort_order').notNull().default(100),
  currency:    varchar('currency', { length: 10 }).notNull().default('USD'),
  // Columna legacy (migración 0041 la mantiene por compat). La fuente
  // de verdad pasó a ser `platform_plan_modules` (tabla puente).
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
  photoUrl: text('photo_url'),
  dni: varchar('dni', { length: 20 }),
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
    // jun 2026 — cédula/DNI del usuario. Migración 0040.
    // Si está seteado, es la fuente de verdad para PDFs / reportes
    // (más rápido de leer que profileData->>'documentNumber').
    dni: varchar('dni', { length: 20 }),
    username: varchar('username', { length: 80 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    role: varchar('role', { length: 40 }).notNull(),
    status: varchar('status', { length: 40 }).notNull().default('active'),
    profileData: jsonb('profile_data').notNull().default({}),
    modulePermissions: jsonb('module_permissions').notNull().default({}),
    failedLoginAttempts: integer('failed_login_attempts').default(0),
    lockedUntil:        timestamp('locked_until'),
    photoUrl: text('photo_url'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('company_users_company_id_email').on(table.companyId, table.email),
    unique('company_users_company_id_username').on(table.companyId, table.username),
  ]
);

// ─── Roles por empresa (catálogo persistente) ────────────────────────────────
//
// `company_users.role` sigue siendo un varchar con el `key` del rol.
// Esta tabla es la FUENTE de verdad de los permisos por defecto
// para cada `key` dentro de una empresa. Se siembra al crear la
// empresa con los 3 default (supervisor, operador, conductor) y
// los admins pueden crear / editar / borrar roles adicionales.
//
// `isSystem = true` marca los roles default. No se pueden borrar
// ni renombrar (sí se les puede ajustar permisos).
export const companyRoles = pgTable(
  'company_roles',
  {
    id: serial('id').primaryKey(),
    companyId: integer('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    /** Identificador estable referenciado por `company_users.role`. Único por empresa. */
    key: varchar('key', { length: 60 }).notNull(),
    /** Etiqueta visible en UI. */
    label: varchar('label', { length: 80 }).notNull(),
    description: text('description').notNull().default(''),
    /** Color de la paleta (esmeralda, rosa, púrpura, naranja, indigo). Default: esmeralda. */
    palette: varchar('palette', { length: 40 }).notNull().default('Esmeralda'),
    /**
     * Permissions map: { [moduleKey]: { [submoduleKey]: ActionKey[] } }
     * Mismo shape que `usePermissions().can()` espera en el frontend.
     */
    permissions: jsonb('permissions').notNull().default({}),
    /** true para los 3 default. No se pueden borrar. */
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('company_roles_company_id_key').on(table.companyId, table.key),
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

// ─────────────────────────────────────────────────────────────────────
// IA Multi-tenant (jul 2026 v6) — Migración 0043.
//
// `company_ai_settings`: configuración de IA por empresa. Si está vacía,
// la empresa usa la config global (process.env.GROQ_API_KEY, etc.).
//
// `company_ai_api_keys`: historial de fingerprints (sha256 de la key cruda)
// para rotación y revocación. NO guardamos la key cruda, solo el fingerprint.
// La key viva vive cifrada en company_ai_settings.api_key_encrypted.
//
// `company_ai_usage`: log diario por empresa/feature/model para billing
// y dashboards. Permite calcular MRR projected, costos USD, etc.
// ─────────────────────────────────────────────────────────────────────

export const companyAiSettings = pgTable('company_ai_settings', {
  companyId:        integer('company_id').primaryKey()
                      .references(() => companies.id, { onDelete: 'cascade' }),

  // jul 2026 v7 — multi-key por provider. La empresa SOLO puede cargar
  // su API key de cada provider. El modelo lo define ApliSmart, no la
  // empresa. Si una key es NULL, se usa la cascada global (env vars).
  groqApiKeyEncrypted:  text('groq_api_key_encrypted'),
  groqApiKeyLast4:      varchar('groq_api_key_last4', { length: 8 }),
  groqApiKeySetAt:      timestamp('groq_api_key_set_at'),
  geminiApiKeyEncrypted: text('gemini_api_key_encrypted'),
  geminiApiKeyLast4:     varchar('gemini_api_key_last4', { length: 8 }),
  geminiApiKeySetAt:     timestamp('gemini_api_key_set_at'),

  // Solo informacional, para mantener compat con código viejo.
  // NO afecta qué provider/modelo se usa.
  providerOverride:     varchar('provider_override', { length: 30 }).notNull().default('platform_default'),

  isEnabled:        boolean('is_enabled').notNull().default(true),

  // Rate limits custom por empresa (null = sin override)
  rpmLimit:         integer('rpm_limit'),
  tpmLimit:         integer('tpm_limit'),
  monthlyBudgetUsd: numeric('monthly_budget_usd', { precision: 10, scale: 2 }),

  // Toggles por feature
  useJarvis:        boolean('use_jarvis').notNull().default(true),
  useExitAnalysis:  boolean('use_exit_analysis').notNull().default(true),
  useAiInsights:    boolean('use_ai_insights').notNull().default(true),
  useTts:           boolean('use_tts').notNull().default(false),

  // Si el superadmin kill-switchó la empresa, queda en false aunque
  // la empresa quiera seguir. Se setea desde /platform/companies/:id/ai-disable.
  killedByPlatform: boolean('killed_by_platform').notNull().default(false),

  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
  updatedBy:        integer('updated_by')
                      .references(() => companyUsers.id, { onDelete: 'set null' }),
});

export const companyAiApiKeys = pgTable('company_ai_api_keys', {
  id:          serial('id').primaryKey(),
  companyId:   integer('company_id').notNull()
                  .references(() => companies.id, { onDelete: 'cascade' }),
  provider:    varchar('provider', { length: 30 }).notNull(),
  // sha256 de la key cruda (64 hex chars). Sirve para detectar reuso
  // y para revocar sin guardar la key.
  fingerprint: varchar('fingerprint', { length: 64 }).notNull(),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
  revokedAt:   timestamp('revoked_at'),
  revokedBy:   integer('revoked_by')
                  .references(() => companyUsers.id, { onDelete: 'set null' }),
}, (t) => ({
  uniqCompanyProviderFp: unique('company_ai_api_keys_company_provider_fp_uniq')
    .on(t.companyId, t.provider, t.fingerprint),
}));

export const companyAiUsage = pgTable('company_ai_usage', {
  id:          bigserial('id', { mode: 'number' }).primaryKey(),
  companyId:   integer('company_id').notNull()
                  .references(() => companies.id, { onDelete: 'cascade' }),
  provider:    varchar('provider', { length: 30 }).notNull(),
  model:       varchar('model',    { length: 120 }),
  // 'jarvis' | 'exit_analysis' | 'ai_insights' | 'tts' | 'other'
  feature:     varchar('feature',  { length: 40 }).notNull(),
  tokensIn:    integer('tokens_in').notNull().default(0),
  tokensOut:   integer('tokens_out').notNull().default(0),
  requests:    integer('requests').notNull().default(1),
  // Costo en USD con 6 decimales (suficiente para $0.000001/token).
  costUsd:     numeric('cost_usd', { precision: 10, scale: 6 }).default('0'),
  periodDay:   date('period_day').notNull().defaultNow(),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
});