-- 0005_checklist_periodicity.sql
-- 2026-06-13
-- Agrega soporte a company_checklist_categories para:
--   * Asignación por rol y por usuario (target_roles, target_user_ids)
--   * Periodicidad y ventana (cadence_kind, cadence_days, window_days)
--   * Alcance del activo (scope_kind, scope_asset_type, scope_site_id)
--
-- Backward-compatible: todos los defaults preservan el comportamiento legacy
-- (sin periodicidad, sin alcance, sin asignación -> visible para todos).

-- Enums nuevos
DO $$ BEGIN
  CREATE TYPE "checklist_cadence_kind_enum" AS ENUM ('none', 'weekly', 'days');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "checklist_scope_kind_enum" AS ENUM ('pick', 'site_assets', 'asset_type');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Columnas nuevas (todas con defaults seguros)
ALTER TABLE company_checklist_categories
  ADD COLUMN IF NOT EXISTS target_roles     text[]         NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS target_user_ids  text[]         NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cadence_kind     "checklist_cadence_kind_enum" NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS cadence_days     integer,
  ADD COLUMN IF NOT EXISTS window_days      integer        NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS scope_kind       "checklist_scope_kind_enum" NOT NULL DEFAULT 'pick',
  ADD COLUMN IF NOT EXISTS scope_asset_type varchar(40),
  ADD COLUMN IF NOT EXISTS scope_site_id    integer;

-- FK opcional: scope_site_id -> company_sites.id
DO $$ BEGIN
  ALTER TABLE company_checklist_categories
    ADD CONSTRAINT company_checklist_categories_scope_site_fk
    FOREIGN KEY (scope_site_id) REFERENCES company_sites(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Comentario documentando
COMMENT ON COLUMN company_checklist_categories.cadence_kind IS
  'none = sin ciclo (legacy). weekly = lunes-domingo. days = cada N días corridos desde createdAt.';
COMMENT ON COLUMN company_checklist_categories.window_days IS
  'Margen desde el inicio del ciclo para hacer el checklist. Vencido -> no se puede hacer.';
COMMENT ON COLUMN company_checklist_categories.scope_kind IS
  'pick = usuario elige activo. site_assets = todos los Vehiculo de la sede. asset_type = todos los del tipo.';
