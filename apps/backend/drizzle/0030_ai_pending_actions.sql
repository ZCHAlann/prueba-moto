-- ─── 0030_ai_pending_actions.sql ───────────────────────────────────────
--
-- Tabla para acciones de ESCRITURA que Jarvis PROPONE pero NO EJECUTA.
-- El flujo es:
--   1. Usuario pide algo de escritura ("marca el mantenimiento X como completado").
--   2. LLM llama tool → backend propone (INSERT en ai_pending_actions) →
--      devuelve al LLM un texto tipo "esperando confirmación del usuario".
--   3. Frontend muestra modal con el summary + botones Confirmar/Cancelar.
--   4. Si confirma → frontend hace POST al endpoint existente
--      (ej. POST /maintenances/:id/finalize). backend marca
--      ai_pending_actions.status = 'executed'.
--   5. Si cancela → frontend hace DELETE de la acción.
--
-- Esto evita que el LLM ejecute acciones destructivas sin intervención
-- humana, manteniendo la UI como único punto de ejecución real.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE ai_pending_actions (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      INTEGER      NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id         INTEGER      NOT NULL REFERENCES company_users(id) ON DELETE CASCADE,
  conversation_id VARCHAR(64)  REFERENCES ai_conversations(id) ON DELETE SET NULL,
  message_id      VARCHAR(64)  REFERENCES ai_messages(id) ON DELETE SET NULL,

  -- Tipo de acción que se propone. ej: 'finalize_maintenance',
  -- 'create_checklist', 'add_fuel_record'.
  action_type     VARCHAR(80)  NOT NULL,

  -- Endpoint HTTP que el frontend debe llamar para ejecutar.
  -- Ej: { method: 'POST', path: '/api/company/1/maintenances/123/finalize' }
  http_method     VARCHAR(10)  NOT NULL,
  http_path       VARCHAR(300) NOT NULL,
  http_body       JSONB        NOT NULL DEFAULT '{}'::jsonb,

  -- Resumen legible para mostrar al usuario en el modal de confirmación.
  -- Ej: "Finalizar mantenimiento #1234 (Aceite de motor)".
  summary         TEXT         NOT NULL,

  -- Estado: pending → executed / cancelled / expired.
  status          VARCHAR(20)  NOT NULL DEFAULT 'pending',

  created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMP,

  -- TTL automático: si nadie confirma en 30 min, expira.
  expires_at      TIMESTAMP    NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes')
);

CREATE INDEX idx_ai_pending_actions_empresa_user
  ON ai_pending_actions (empresa_id, user_id, status);
CREATE INDEX idx_ai_pending_actions_expiry
  ON ai_pending_actions (expires_at)
  WHERE status = 'pending';
CREATE INDEX idx_ai_pending_actions_conversation
  ON ai_pending_actions (conversation_id)
  WHERE conversation_id IS NOT NULL;