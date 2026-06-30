-- ============================================================================
-- 0034_checklist_reauth.sql
-- ============================================================================
-- Agrega soporte para reautorización de checklists vencidos.
--
-- Cambios:
--   1. Enum checklist_reauth_status_enum.
--   2. Nueva tabla company_checklist_reauth_requests.
--   3. Extender company_checklists con columnas de ciclo + FK a la tabla nueva.
--   4. Índices.
--
-- Idempotente: usa IF NOT EXISTS / DO blocks. Pensado para re-ejecución segura
-- si el script se cortó a la mitad en una corrida anterior (ej. transacción
-- abortada por timeout). Cada paso tiene su propio IF NOT EXISTS.
--
-- ORDEN CRÍTICO:
--   1. Crear la tabla NUEVA primero (porque la FK de company_checklists la
--      referencia).
--   2. Después agregar columnas a company_checklists.
--   3. Después agregar la FK que referencia la tabla nueva.
--   4. Después índices.
-- ============================================================================

-- ── 1. Enum para el estado de la solicitud ────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'checklist_reauth_status_enum') THEN
    CREATE TYPE checklist_reauth_status_enum AS ENUM (
      'Pendiente',
      'Autorizada',
      'Rechazada'
    );
  END IF;
END
$$;

-- ── 2. Nueva tabla company_checklist_reauth_requests ─────────────────────
-- La creamos ANTES de tocar company_checklists porque:
--   - Esta tabla tiene FKs hacia company_checklists (que ya existe).
--   - La FK nueva en company_checklists referencia ESTA tabla.
CREATE TABLE IF NOT EXISTS company_checklist_reauth_requests (
  id                     serial PRIMARY KEY,
  company_id             integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category_id            integer NOT NULL REFERENCES company_checklist_categories(id) ON DELETE CASCADE,
  asset_id               integer REFERENCES company_assets(id) ON DELETE SET NULL,
  cycle_start            timestamp NOT NULL,
  cycle_end              timestamp NOT NULL,
  window_end             timestamp NOT NULL,
  missed_checklist_id    integer REFERENCES company_checklists(id) ON DELETE SET NULL,
  status                 checklist_reauth_status_enum NOT NULL DEFAULT 'Pendiente',
  requested_by_user_id   integer REFERENCES company_users(id) ON DELETE SET NULL,
  requested_by_name      varchar(160),
  reason                 text NOT NULL,
  decided_by_user_id     integer REFERENCES company_users(id) ON DELETE SET NULL,
  decided_by_name        varchar(160),
  decision_notes         text,
  decided_at             timestamp,
  completed_checklist_id integer REFERENCES company_checklists(id) ON DELETE SET NULL,
  created_at             timestamp NOT NULL DEFAULT now(),
  updated_at             timestamp NOT NULL DEFAULT now()
);

-- ── 3. Extender company_checklists ────────────────────────────────────────
ALTER TABLE company_checklists
  ADD COLUMN IF NOT EXISTS cycle_start      timestamp,
  ADD COLUMN IF NOT EXISTS cycle_end        timestamp,
  ADD COLUMN IF NOT EXISTS window_end       timestamp,
  ADD COLUMN IF NOT EXISTS is_late          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reauth_request_id integer;

-- FK de reauth_request_id → company_checklist_reauth_requests(id).
-- Ahora SÍ podemos agregarla porque la tabla nueva ya existe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'company_checklists_reauth_request_id_fkey'
       AND table_name = 'company_checklists'
  ) THEN
    ALTER TABLE company_checklists
      ADD CONSTRAINT company_checklists_reauth_request_id_fkey
      FOREIGN KEY (reauth_request_id)
      REFERENCES company_checklist_reauth_requests(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

-- ── 4. Índices ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_company_checklists_status_vencido
  ON company_checklists(company_id, status)
  WHERE status = 'Vencido';

CREATE INDEX IF NOT EXISTS idx_company_checklists_cycle
  ON company_checklists(company_id, category_id, cycle_start, cycle_end)
  WHERE cycle_start IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_checklist_reauth_company_status
  ON company_checklist_reauth_requests(company_id, status);

CREATE INDEX IF NOT EXISTS idx_checklist_reauth_requested_by
  ON company_checklist_reauth_requests(company_id, requested_by_user_id, status);

CREATE INDEX IF NOT EXISTS idx_checklist_reauth_missed
  ON company_checklist_reauth_requests(missed_checklist_id)
  WHERE missed_checklist_id IS NOT NULL;

ANALYZE;