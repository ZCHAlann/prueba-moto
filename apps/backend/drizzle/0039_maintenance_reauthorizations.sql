-- ============================================================================
-- 0039_maintenance_reauthorizations.sql
-- ============================================================================
-- Soporta el flujo "reautorización de mantenimiento atrasado" (jun 2026):
--
--   - Operador/conductor ASIGNADO a un mantenimiento Atrasado NO puede
--     editarlo, reprogramarlo, ni marcarlo "En proceso" por su cuenta.
--     Solo puede pedir que se lo reautoricen vía esta tabla.
--   - Admin/owner (con permiso independiente `mantenimiento.reautorizaciones.ver`)
--     ve la bandeja de solicitudes pendientes. Aprueba o rechaza (con nota).
--   - Al APROBAR una solicitud, el mantenimiento vuelve a 'Programado',
--     scheduledFor se ajusta (HOY si se eligió "abrir", o fecha custom si
--     se eligió "reprogramar"), y se registran eventos en
--     company_maintenance_events (kind='reauthorized' o 'reauth_denied').
--   - El rechazo deja el mantenimiento Atrasado como estaba y registra el
--     motivo en la misma tabla.
--
-- Cambios:
--   1. Enum `maintenance_reauthorization_status_enum` (Pendiente/Aprobada/Rechazada).
--   2. Crear tabla `company_maintenance_reauthorizations`.
--   3. Columna opcional `maintenance_reauthorization_id` en
--      company_maintenance_records (para FK la consume cuando se aprueba).
--   4. Índices para la bandeja.
--   5. Backfill de permisos en `company_roles` para los roles default.
--   6. Comentarios.
--
-- Idempotente: IF NOT EXISTS / DO blocks para re-ejecución segura.
-- ============================================================================

-- ── 1. Enum ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'maintenance_reauthorization_status_enum') THEN
    CREATE TYPE maintenance_reauthorization_status_enum AS ENUM (
      'Pendiente',
      'Aprobada',
      'Rechazada'
    );
  END IF;
END
$$;

-- ── 2. Tabla principal ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_maintenance_reauthorizations (
  id                      serial PRIMARY KEY,
  company_id              integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- Mantenimiento cuya reautorización se pide.
  maintenance_id          integer NOT NULL REFERENCES company_maintenance_records(id) ON DELETE CASCADE,
  -- Snapshot del estado del mantenimiento al momento del pedido, para
  -- mostrarlo en la bandeja sin tener que re-leer la tabla principal.
  maintenance_status      varchar(40) NOT NULL,
  maintenance_scheduled_for timestamp NOT NULL,
  -- Acción que el aprobador tomó (o deberá tomar):
  --   - 'open'        → abrir (status='Programado', scheduledFor=HOY).
  --   - 'reschedule'  → reprogramar (el admin elige nueva fecha al aprobar).
  action                  varchar(20) NOT NULL,
  -- Estado del workflow.
  status                  maintenance_reauthorization_status_enum NOT NULL DEFAULT 'Pendiente',
  -- Motivo obligatorio (es la justificación que el operador escribe al pedir).
  reason                  text NOT NULL,
  -- Snapshot de qué quería reprogramar (si action='reschedule'). NULL para open.
  proposed_scheduled_for  timestamp,
  -- Quién pidió.
  requested_by_user_id    integer REFERENCES company_users(id) ON DELETE SET NULL,
  requested_by_name       varchar(160),
  requested_by_role       varchar(60),
  -- Quién decidió.
  decided_by_user_id      integer REFERENCES company_users(id) ON DELETE SET NULL,
  decided_by_name         varchar(160),
  decision_notes          text,
  decided_at              timestamp,
  -- Si el campo 'action' original pidió reprogramar, acá guardamos la fecha
  -- que efectivamente eligió el admin al aprobar.
  applied_scheduled_for   timestamp,
  created_at              timestamp NOT NULL DEFAULT now(),
  updated_at              timestamp NOT NULL DEFAULT now()
);

-- ── 3. Columna opcional en la tabla principal ─────────────────────────────────
-- Guarda un puntero a la solicitud aprobada que reabrió este mantenimiento
-- (para reportes / auditoría).
ALTER TABLE company_maintenance_records
  ADD COLUMN IF NOT EXISTS last_reauthorization_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'company_maintenance_records_last_reauth_fkey'
       AND table_name = 'company_maintenance_records'
  ) THEN
    ALTER TABLE company_maintenance_records
      ADD CONSTRAINT company_maintenance_records_last_reauth_fkey
      FOREIGN KEY (last_reauthorization_id)
      REFERENCES company_maintenance_reauthorizations(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

-- ── 4. Índices ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_maint_reauth_company_status
  ON company_maintenance_reauthorizations(company_id, status);

CREATE INDEX IF NOT EXISTS idx_maint_reauth_pending
  ON company_maintenance_reauthorizations(company_id, created_at DESC)
  WHERE status = 'Pendiente';

CREATE INDEX IF NOT EXISTS idx_maint_reauth_requested_by
  ON company_maintenance_reauthorizations(company_id, requested_by_user_id, status);

CREATE INDEX IF NOT EXISTS idx_maint_reauth_maintenance
  ON company_maintenance_reauthorizations(company_id, maintenance_id);

-- ── 5. Backfill de permisos en roles default ─────────────────────────────────
-- Para que operadores y conductores puedan PEDIR una reautorización,
-- y para que admins/supervisors puedan APROBAR, agregamos dos permisos:
--   - 'mantenimiento.reautorizaciones.ver'    → ver solicitudes propias/bandeja
--   - 'mantenimiento.reautorizaciones.editar' → aprobar/rechazar (admin)
--
-- El sub-módulo es NO pre-existente (es nuevo de jun 2026), así que las
-- plantillas de `company_roles` aún no tienen la key. Usamos jsonb_set con
-- create_if_missing=true para todos los roles default que aún no la tengan.
--
-- Los roles de admin/owner/superadmin NO los tocamos: tienen bypass en
-- requirePermission (chequea el rol antes que los granulares).

UPDATE company_roles
   SET permissions = jsonb_set(
         permissions,
         '{mantenimiento,reautorizaciones}',
         jsonb_build_array('ver'),
         true
       ),
       updated_at = now()
 WHERE key IN ('operador', 'conductor')
   AND NOT (permissions #> '{mantenimiento,reautorizaciones}' IS NOT NULL);

-- Permiso de aprobar/rechazar (editar) — default para supervisor y para
-- admin_empresa/owner_empresa del catálogo por defecto de las empresas.
-- admin/owner tienen bypass, pero igual lo dejamos sembrado para que se
-- vea explícito en el editor de permisos del módulo "Roles".
UPDATE company_roles
   SET permissions = jsonb_set(
         permissions,
         '{mantenimiento,reautorizaciones}',
         jsonb_build_array('ver', 'editar'),
         true
       ),
       updated_at = now()
 WHERE key IN ('supervisor')
   AND NOT (permissions #> '{mantenimiento,reautorizaciones}' IS NOT NULL);

ANALYZE;

-- ── 6. Comentarios ───────────────────────────────────────────────────────────
COMMENT ON TABLE company_maintenance_reauthorizations IS
  'Solicitudes de reautorización para mantenimientos Programados que están Atrasados. El operador/conductor asignado NO puede editar ni reprogramar el mantenimiento directamente — debe pedir la reautorización acá. Un admin_empresa/owner_empresa (o supervisor con permiso mantenimiento.reautorizaciones.editar) la aprueba (acción open/reschedule) o la rechaza con nota.';

COMMENT ON COLUMN company_maintenance_reauthorizations.action IS
  'Acción que el operador pidió al solicitar: ''open'' (reabrir el mantenimiento, scheduledFor=HOY) o ''reschedule'' (reagendar a una fecha que el admin elige al aprobar).';

COMMENT ON COLUMN company_maintenance_reauthorizations.proposed_scheduled_for IS
  'Fecha propuesta por el operador cuando action=''reschedule''. Para ''open'' queda NULL — el sistema fuerza scheduledFor=HOY al aprobar.';

COMMENT ON COLUMN company_maintenance_reauthorizations.applied_scheduled_for IS
  'Fecha que el admin eligió efectivamente al aprobar (solo si action=''reschedule''). Para ''open'' queda NULL.';

COMMENT ON COLUMN company_maintenance_records.last_reauthorization_id IS
  'Última solicitud de reautorización aprobada que reabrió este mantenimiento. Permite trazabilidad rápida desde la fila del mantenimiento hasta la auditoría.';
