-- ─── 0029_ai_conversations.sql ──────────────────────────────────────────────
--
-- Tablas para el Asistente IA (Jarvis). Ver Parte III sección 32
-- (Auditoría) y Parte IV sección 50 (Conversation Manager).
--
-- ai_conversations: una fila por sesión de chat.
-- ai_messages:      todos los mensajes (user + assistant) con tokens
--                   y duración persistidos.
--
-- El empresa_id SIEMPRE viene del JWT del usuario autenticado
-- (validado en el endpoint). El prompt del usuario jamás llega a
-- estas tablas sin pasar por el backend que verifica permisos.

CREATE TABLE IF NOT EXISTS ai_conversations (
  id                  SERIAL PRIMARY KEY,
  empresa_id          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id             INTEGER NOT NULL REFERENCES company_users(id) ON DELETE CASCADE,
  title               VARCHAR(160) NOT NULL DEFAULT '',
  total_tokens_in     INTEGER NOT NULL DEFAULT 0,
  total_tokens_out    INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_conv_empresa_user
  ON ai_conversations(empresa_id, user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_messages (
  id                SERIAL PRIMARY KEY,
  conversation_id   INTEGER NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role              VARCHAR(20) NOT NULL,
  content           TEXT NOT NULL,
  model             VARCHAR(80),
  tokens_in         INTEGER,
  tokens_out        INTEGER,
  latency_ms        INTEGER,
  error             VARCHAR(200),
  created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_msg_conv_created
  ON ai_messages(conversation_id, created_at);

-- ai_tool_calls: cada invocación de herramienta dentro de una conversación.
-- Permite saber qué tools usó Jarvis para responder cada pregunta.
CREATE TABLE IF NOT EXISTS ai_tool_calls (
  id              SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  message_id      INTEGER REFERENCES ai_messages(id) ON DELETE SET NULL,
  tool            VARCHAR(80) NOT NULL,
  arguments       TEXT NOT NULL DEFAULT '{}',
  result_summary  TEXT,
  result_count    INTEGER,
  latency_ms      INTEGER,
  error           VARCHAR(200),
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_tool_conv
  ON ai_tool_calls(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_tool_name
  ON ai_tool_calls(tool, created_at DESC);