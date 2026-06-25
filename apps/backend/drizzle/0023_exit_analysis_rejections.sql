-- ============================================================================
-- 0023_exit_analysis_rejections.sql
-- ============================================================================
-- Agrega soporte para que el supervisor marque un ítem como "mal tomado" /
-- "rechazado manualmente" y el conductor lo rehaga individualmente.
--
-- Una autorización puede pasar por varios ciclos:
--   1. Conductor sube 5 fotos → IA analiza → 2 ítems fallan
--   2. Supervisor revisa y puede:
--      a) Aprobar manualmente un ítem que la IA marcó como fallido
--         → crea fila en rejections con action='override_approve'
--      b) Marcar como "mal tomada" y pedir reenvío
--         → crea fila en rejections con action='request_recapture'
--      c) Confirmar el fallo de la IA
--         → crea fila en rejections con action='confirm_fail'
--   3. Conductor sube solo la foto del ítem marcado → IA re-analiza solo ese
-- ============================================================================

CREATE TABLE IF NOT EXISTS exit_analysis_rejections (
  id                     serial PRIMARY KEY,
  exit_authorization_id  integer NOT NULL REFERENCES company_exit_authorizations(id) ON DELETE CASCADE,
  company_id             integer NOT NULL,
  item_type              exit_auth_item_type NOT NULL,
  -- Acción del supervisor:
  --   'request_recapture'  → marcar la foto como mal y pedir al conductor que la rehaga
  --   'override_approve'   → aprobar manualmente aunque la IA haya dicho que no
  --   'confirm_fail'       → confirmar el fallo de la IA
  action                 varchar(40) NOT NULL,
  -- Quién y cuándo
  decided_by_user_id     integer,
  decided_by_name        varchar(160),
  decided_at             timestamp NOT NULL DEFAULT now(),
  -- Razón obligatoria si action = 'request_recapture' o 'override_approve'
  reason                 text NOT NULL,
  -- Si quedó como referencia histórica
  superseded_at          timestamp,
  created_at             timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exit_rejections_auth_item
  ON exit_analysis_rejections(exit_authorization_id, item_type, decided_at DESC);

CREATE INDEX IF NOT EXISTS idx_exit_rejections_active
  ON exit_analysis_rejections(exit_authorization_id, item_type)
  WHERE superseded_at IS NULL;

ANALYZE;
