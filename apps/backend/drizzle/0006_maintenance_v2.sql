-- 0006_maintenance_v2.sql
-- 2026-06-13
-- Rediseño del módulo de mantenimientos:
--   * Crea 7 tablas nuevas: company_workshops, company_suppliers,
--     company_odometer_readings, company_maintenance_records,
--     company_maintenance_items, company_notifications, company_device_tokens.
--   * Crea 6 enums nuevos: maintenance_type, maintenance_status, maintenance_category,
--     maintenance_cadence, notification_kind, device_platform.
--   * Borra la tabla legacy company_maintenances (vacía, confirmada por el usuario).
--   * Incluye los cambios de la 0004 y 0005 (que ya están aplicadas en
--     local/VPS) consolidados en este script idempotente para que pueda
--     correr en limpio sin importar el orden.
--
-- IDÉMPOTENTE: todos los CREATE usan IF NOT EXISTS o DO blocks con EXCEPTION,
-- y los ALTER usan ADD COLUMN IF NOT EXISTS. Se puede correr N veces sin
-- romper nada.

-- ════════════════════════════════════════════════════════════════════════════
--  1) ENUMS (todos idempotentes)
-- ════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE "maintenance_type_enum" AS ENUM ('Preventivo', 'Correctivo', 'Programado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "maintenance_status_enum" AS ENUM (
    'Programado', 'En curso', 'PendienteAtencion', 'Completado', 'Cancelado'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "maintenance_category_enum" AS ENUM (
    'Primordial:Bombas', 'Primordial:Motores', 'Aceite:Cambio', 'Aceite:Inventario', 'Otro'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "maintenance_cadence_enum" AS ENUM (
    'none', 'weekly', 'days', 'monthly', 'km_based'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "notification_kind_enum" AS ENUM (
    'maintenance_due',
    'maintenance_scheduled',
    'maintenance_completed',
    'maintenance_overshoot_km',
    'workshop_assigned',
    'supplier_invoice',
    'system'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "device_platform_enum" AS ENUM ('android', 'ios', 'web');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Enums de checklist (incluidos por si 0005 no se aplicó en limpio; la 0005
-- ya los crea, así que el DO block los ignora si ya existen).
DO $$ BEGIN
  CREATE TYPE "checklist_cadence_kind_enum" AS ENUM ('none', 'weekly', 'days');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "checklist_scope_kind_enum" AS ENUM ('pick', 'site_assets', 'asset_type');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  2) TABLAS NUEVAS (todas IF NOT EXISTS)
-- ════════════════════════════════════════════════════════════════════════════

-- ── Talleres ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_workshops (
  id            serial PRIMARY KEY,
  company_id    integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          varchar(120) NOT NULL,
  address       text,
  phone         varchar(40),
  contact_name  varchar(120),
  nit           varchar(40),
  notes         text,
  created_at    timestamp NOT NULL DEFAULT NOW(),
  updated_at    timestamp NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS company_workshops_company_idx
  ON company_workshops(company_id);

-- ── Proveedores ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_suppliers (
  id            serial PRIMARY KEY,
  company_id    integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          varchar(120) NOT NULL,
  contact_name  varchar(120),
  phone         varchar(40),
  email         varchar(180),
  nit           varchar(40),
  notes         text,
  created_at    timestamp NOT NULL DEFAULT NOW(),
  updated_at    timestamp NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS company_suppliers_company_idx
  ON company_suppliers(company_id);

-- ── Lecturas de odómetro ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_odometer_readings (
  id            serial PRIMARY KEY,
  company_id    integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_id      integer NOT NULL REFERENCES company_assets(id) ON DELETE CASCADE,
  km            integer NOT NULL,
  taken_at      timestamp NOT NULL DEFAULT NOW(),
  source        varchar(20) NOT NULL DEFAULT 'manual',
  notes         text,
  created_by    integer REFERENCES company_users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS company_odometer_asset_idx
  ON company_odometer_readings(asset_id, taken_at DESC);
CREATE INDEX IF NOT EXISTS company_odometer_company_idx
  ON company_odometer_readings(company_id);

-- ── Mantenimientos (reemplaza company_maintenances) ──────────────────────────
CREATE TABLE IF NOT EXISTS company_maintenance_records (
  id                serial PRIMARY KEY,
  company_id        integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_id          integer NOT NULL REFERENCES company_assets(id) ON DELETE CASCADE,
  workshop_id       integer REFERENCES company_workshops(id) ON DELETE SET NULL,
  type              maintenance_type_enum NOT NULL DEFAULT 'Programado',
  status            maintenance_status_enum NOT NULL DEFAULT 'Programado',
  category          maintenance_category_enum NOT NULL DEFAULT 'Otro',
  title             varchar(200),
  description       text,
  odometer_km       integer,
  cadence_kind      maintenance_cadence_enum NOT NULL DEFAULT 'none',
  cadence_value     integer,
  next_trigger_km   integer,
  parent_id         integer,  -- self-FK declarada al final para evitar orden
  scheduled_for     timestamp NOT NULL,
  executed_at       timestamp,
  completed_at      timestamp,
  notes             text,
  total_cost        numeric(12, 2) NOT NULL DEFAULT 0,
  created_by        integer REFERENCES company_users(id) ON DELETE SET NULL,
  completed_by      integer REFERENCES company_users(id) ON DELETE SET NULL,
  created_at        timestamp NOT NULL DEFAULT NOW(),
  updated_at        timestamp NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS company_maint_records_company_idx
  ON company_maintenance_records(company_id);
CREATE INDEX IF NOT EXISTS company_maint_records_asset_idx
  ON company_maintenance_records(asset_id);
CREATE INDEX IF NOT EXISTS company_maint_records_status_idx
  ON company_maintenance_records(status, scheduled_for);
CREATE INDEX IF NOT EXISTS company_maint_records_workshop_idx
  ON company_maintenance_records(workshop_id);
CREATE INDEX IF NOT EXISTS company_maint_records_km_trigger_idx
  ON company_maintenance_records(asset_id, cadence_kind, next_trigger_km)
  WHERE cadence_kind = 'km_based';

-- Self-FK de parent_id (deferrable para no chocar con el orden de CREATE)
DO $$ BEGIN
  ALTER TABLE company_maintenance_records
    ADD CONSTRAINT company_maint_records_parent_fk
    FOREIGN KEY (parent_id) REFERENCES company_maintenance_records(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Items / repuestos por mantenimiento ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_maintenance_items (
  id                serial PRIMARY KEY,
  maintenance_id    integer NOT NULL REFERENCES company_maintenance_records(id) ON DELETE CASCADE,
  supplier_id       integer REFERENCES company_suppliers(id) ON DELETE SET NULL,
  name              varchar(180) NOT NULL,
  quantity          numeric(10, 2) NOT NULL DEFAULT 1,
  unit_cost         numeric(12, 2) NOT NULL DEFAULT 0,
  subtotal          numeric(12, 2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS company_maint_items_maint_idx
  ON company_maintenance_items(maintenance_id);
CREATE INDEX IF NOT EXISTS company_maint_items_supplier_idx
  ON company_maintenance_items(supplier_id);

-- ── Notificaciones in-app ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_notifications (
  id            serial PRIMARY KEY,
  company_id    integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id       integer NOT NULL REFERENCES company_users(id) ON DELETE CASCADE,
  kind          notification_kind_enum NOT NULL,
  title         varchar(200) NOT NULL,
  body          text,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at       timestamp,
  created_at    timestamp NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS company_notif_user_unread_idx
  ON company_notifications(user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS company_notif_company_idx
  ON company_notifications(company_id, created_at DESC);

-- ── Tokens de dispositivo (FCM / Web Push) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS company_device_tokens (
  id            serial PRIMARY KEY,
  user_id       integer NOT NULL REFERENCES company_users(id) ON DELETE CASCADE,
  company_id    integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  token         text NOT NULL UNIQUE,
  platform      device_platform_enum NOT NULL,
  last_seen_at  timestamp NOT NULL DEFAULT NOW(),
  created_at    timestamp NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS company_device_user_idx
  ON company_device_tokens(user_id);

-- ════════════════════════════════════════════════════════════════════════════
--  3) BORRAR TABLA LEGACY (vacía, confirmada por el usuario)
-- ════════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS company_maintenances CASCADE;

-- ════════════════════════════════════════════════════════════════════════════
--  4) CONSOLIDAR CAMBIOS DE LA 0004 Y 0005 (idempotentes)
--     Si ya están aplicadas, no hacen nada.
-- ════════════════════════════════════════════════════════════════════════════

-- 0004: company_fuel_entries.photo_url
ALTER TABLE company_fuel_entries
  ADD COLUMN IF NOT EXISTS photo_url text;

-- 0005: company_checklist_categories nuevos campos
ALTER TABLE company_checklist_categories
  ADD COLUMN IF NOT EXISTS target_roles     text[]         NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS target_user_ids  text[]         NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cadence_kind     "checklist_cadence_kind_enum" NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS cadence_days     integer,
  ADD COLUMN IF NOT EXISTS window_days      integer        NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS scope_kind       "checklist_scope_kind_enum" NOT NULL DEFAULT 'pick',
  ADD COLUMN IF NOT EXISTS scope_asset_type varchar(40),
  ADD COLUMN IF NOT EXISTS scope_site_id    integer;

DO $$ BEGIN
  ALTER TABLE company_checklist_categories
    ADD CONSTRAINT company_checklist_categories_scope_site_fk
    FOREIGN KEY (scope_site_id) REFERENCES company_sites(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 0003: company_drivers.user_id (FK + UNIQUE)
DO $$ BEGIN
  ALTER TABLE company_drivers
    ADD CONSTRAINT company_drivers_user_id_company_users_id_fk
    FOREIGN KEY (user_id) REFERENCES company_users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE company_drivers
    ADD CONSTRAINT company_drivers_company_id_user_id UNIQUE (company_id, user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════════════════════════════════════════════════════════════════
--  5) COMENTARIOS
-- ════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE company_maintenance_records IS
  'Registro unificado de mantenimientos. Reemplaza company_maintenances (0006).';
COMMENT ON COLUMN company_maintenance_records.cadence_kind IS
  'none=sin ciclo, weekly=lun-dom, days=cada N días, monthly=cada 30d, km_based=umbral por km.';
COMMENT ON COLUMN company_maintenance_records.next_trigger_km IS
  'Cache: km en el cual el mantenimiento km_based debe pasar a PendienteAtencion.';
COMMENT ON COLUMN company_maintenance_records.parent_id IS
  'Si fue reagendado, apunta al mantenimiento original del cual se clonó.';
COMMENT ON TABLE company_notifications IS
  'Notificaciones in-app (campanita). Multi-canal: in-app siempre, FCM push si hay token.';
COMMENT ON TABLE company_device_tokens IS
  'Tokens de dispositivo para FCM (APK) y Web Push. Un usuario puede tener N tokens.';
