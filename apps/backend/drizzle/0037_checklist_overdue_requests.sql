-- ============================================================================
-- 0037_checklist_overdue_requests.sql
-- ============================================================================
-- Soporta el flujo "fecha atrasada" en POST /checklists:
--
--   - admin_empresa / owner_empresa → crean el checklist directamente con
--     status 'Aprobado' (default), performed_by_role = 'admin'/'owner', y
--     is_overdue = true si la fecha es anterior a hoy.
--
--   - Operador / Conductor / otros con fecha anterior a hoy → en vez de
--     crear el checklist, crean una solicitud en
--     company_checklist_overdue_requests. Cuando un admin la aprueba,
--     el operador puede reintentar el POST enviando
--     overdueAuthorizationId y el checklist se crea con la fecha
--     atrasada, marcado is_overdue = true y vinculado a la solicitud.
--
-- Cambios:
--   1. Enum `checklist_overdue_status_enum` (Pendiente/Autorizada/Rechazada).
--   2. Extend `company_checklists` con:
--        - is_overdue           boolean (marca atrasado para admin/owner)
--        - performed_by_role    varchar(40)  (admin | owner | null)
--        - overdue_request_id   integer → company_checklist_overdue_requests(id)
--   3. Crear tabla `company_checklist_overdue_requests`.
--   4. Índices.
--
-- Idempotente: IF NOT EXISTS / DO blocks para re-ejecución segura.
-- ============================================================================

-- ── 1. Enum para el estado de la solicitud de fecha atrasada ────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'checklist_overdue_status_enum') THEN
    CREATE TYPE checklist_overdue_status_enum AS ENUM (
      'Pendiente',
      'Autorizada',
      'Rechazada'
    );
  END IF;
END
$$;

-- ── 2. Nueva tabla company_checklist_overdue_requests ──────────────────────
-- La creamos ANTES de tocar company_checklists porque la FK
-- company_checklists.overdue_request_id la referencia.
CREATE TABLE IF NOT EXISTS company_checklist_overdue_requests (
  id                     serial PRIMARY KEY,
  company_id             integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- Contexto del checklist que se quiere hacer atrasado.
  category_id            integer REFERENCES company_checklist_categories(id) ON DELETE SET NULL,
  asset_id               integer REFERENCES company_assets(id) ON DELETE SET NULL,
  target_kind            varchar(40),
  target_label           varchar(160),
  -- Fecha propuesta (anterior a hoy). String YYYY-MM-DD para no liarse
  -- con timezones — el ciclo se evalúa en fecha local del operador.
  proposed_date          varchar(10) NOT NULL,
  -- Snapshot de los items / summary / findings que pensaba reportar.
  -- Lo guardamos para que el admin apruebe con visibilidad completa
  -- sin tener que preguntarle al operador.
  proposed_items         jsonb,
  proposed_summary       text,
  proposed_findings      text,
  -- Motivo obligatorio.
  reason                 text NOT NULL,
  status                 checklist_overdue_status_enum NOT NULL DEFAULT 'Pendiente',
  -- Quién pidió.
  requested_by_user_id   integer REFERENCES company_users(id) ON DELETE SET NULL,
  requested_by_name      varchar(160),
  -- Quién decidió.
  decided_by_user_id     integer REFERENCES company_users(id) ON DELETE SET NULL,
  decided_by_name        varchar(160),
  decision_notes         text,
  decided_at             timestamp,
  -- Checklist que consumió esta autorización (cuando el operador re-POSTea).
  completed_checklist_id integer REFERENCES company_checklists(id) ON DELETE SET NULL,
  created_at             timestamp NOT NULL DEFAULT now(),
  updated_at             timestamp NOT NULL DEFAULT now()
);

-- ── 3. Extender company_checklists ──────────────────────────────────────────
-- IMPORTANTE: agregar `overdue_request_id` ANTES de crear la FK (sino
-- Postgres explota con "column referenced in foreign key does not exist").
-- El original (jun 2026) tenía este bug y fallaba en DBs vírgenes.
ALTER TABLE company_checklists
  ADD COLUMN IF NOT EXISTS is_overdue             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS performed_by_role      varchar(40),
  ADD COLUMN IF NOT EXISTS overdue_request_id     integer;

-- FK de overdue_request_id → company_checklist_overdue_requests(id).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'company_checklists_overdue_request_id_fkey'
       AND table_name = 'company_checklists'
  ) THEN
    ALTER TABLE company_checklists
      ADD CONSTRAINT company_checklists_overdue_request_id_fkey
      FOREIGN KEY (overdue_request_id)
      REFERENCES company_checklist_overdue_requests(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

-- ── 4. Índices ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_company_checklists_overdue
  ON company_checklists(company_id, is_overdue)
  WHERE is_overdue = true;

CREATE INDEX IF NOT EXISTS idx_company_checklists_performed_by_role
  ON company_checklists(company_id, performed_by_role)
  WHERE performed_by_role IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_checklist_overdue_requests_company_status
  ON company_checklist_overdue_requests(company_id, status);

CREATE INDEX IF NOT EXISTS idx_checklist_overdue_requests_requested_by
  ON company_checklist_overdue_requests(company_id, requested_by_user_id, status);

CREATE INDEX IF NOT EXISTS idx_checklist_overdue_requests_pending
  ON company_checklist_overdue_requests(company_id, created_at DESC)
  WHERE status = 'Pendiente';

-- ── 5. Backfill de permisos para roles existentes ───────────────────────────
-- Empresas ya creadas antes de este cambio tienen sus `company_roles`
-- seeded con `checklist.overdue` AUSENTE. Sin el permiso, el middleware
-- `requirePermission('checklist', 'overdue', 'ver')` rechaza a operadores
-- y conductores (los admins/owners siguen pasando por el bypass de
-- `superadmin|owner_empresa|admin_empresa`).
--
-- Solución: agregar `checklist.overdue: ["ver"]` al jsonb de permisos
-- de los roles `operador` y `conductor` que aún no lo tengan. Idempotente
-- gracias al `WHERE NOT (... #> '{checklist,overdue}' IS NOT NULL)`.

UPDATE company_roles
   SET permissions = jsonb_set(
         permissions,
         '{checklist,overdue}',
         '["ver"]'::jsonb,
         true
       ),
       updated_at = now()
 WHERE key IN ('operador', 'conductor')
   AND NOT (permissions #> '{checklist,overdue}' IS NOT NULL);

ANALYZE;

-- ── Comentarios para herramientas externas ───────────────────────────────────
COMMENT ON COLUMN company_checklists.is_overdue IS
  'true cuando el checklist fue creado con una fecha ANTERIOR a hoy (fecha atrasada). Solo se setea si el usuario que creó el checklist tiene permiso de auto-aprobación (admin_empresa / owner_empresa) o si creó el checklist consumiendo una solicitud de autorización de fecha atrasada aprobada.';

COMMENT ON COLUMN company_checklists.performed_by_role IS
  'Rol del usuario que creó el checklist cuando tiene poder de auto-aprobación: ''admin_empresa'' o ''owner_empresa''. NULL para operadores/conductores que normalmente necesitan autorización.';

COMMENT ON COLUMN company_checklists.overdue_request_id IS
  'Si este checklist se creó consumiendo una solicitud de autorización de fecha atrasada, apunta a esa solicitud en company_checklist_overdue_requests.';

COMMENT ON TABLE company_checklist_overdue_requests IS
  'Solicitudes de autorización que hace un operador/conductor cuando quiere crear un checklist con fecha anterior a hoy. Cuando un admin_empresa/owner_empresa la aprueba, el operador puede reintentar el POST con overdueAuthorizationId y el checklist se crea marcado is_overdue=true.';
