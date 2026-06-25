-- ============================================================================
-- 0024_exit_corrections_snapshot.sql
-- ============================================================================
-- Agrega columnas a company_exit_authorizations y a
-- exit_authorization_analyses para soportar el flujo de
-- "devolver al conductor con correcciones".
-- ============================================================================

-- ── company_exit_authorizations ────────────────────────────────────────────
ALTER TABLE company_exit_authorizations
  ADD COLUMN IF NOT EXISTS corrections_snapshot       jsonb,
  ADD COLUMN IF NOT EXISTS corrections_sent_at        timestamp,
  ADD COLUMN IF NOT EXISTS corrections_resubmitted_at timestamp,
  ADD COLUMN IF NOT EXISTS corrections_round          integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_exit_auth_pending_corrections
  ON company_exit_authorizations(company_id, corrections_sent_at)
  WHERE corrections_sent_at IS NOT NULL
    AND corrections_resubmitted_at IS NULL
    AND status = 'Pendiente';

-- ── exit_authorization_analyses ─────────────────────────────────────────────
-- aiGuidance: instrucción específica que la IA devuelve para que el
-- conductor sepa qué mejorar. Vacía cuando el ítem aprueba.
ALTER TABLE exit_authorization_analyses
  ADD COLUMN IF NOT EXISTS ai_guidance text NOT NULL DEFAULT '';

ANALYZE;
