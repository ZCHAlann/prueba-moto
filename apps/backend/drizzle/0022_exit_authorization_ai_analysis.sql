-- ============================================================================
-- 0022_exit_authorization_ai_analysis.sql
-- ============================================================================
-- Tabla de análisis IA de autorizaciones de salida + enums + columna de
-- status en la tabla principal.
--
-- Idempotente: usa IF NOT EXISTS / DO $$ para poder re-ejecutar sin error.
-- ============================================================================

-- ─── Enums ───────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'exit_auth_ai_analysis_status') THEN
    CREATE TYPE exit_auth_ai_analysis_status AS ENUM (
      'pendiente',
      'en_proceso',
      'aprobado_ia',
      'requiere_correccion',
      'requiere_revision_humana'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'exit_auth_item_type') THEN
    CREATE TYPE exit_auth_item_type AS ENUM (
      'refrigerante',
      'frenos',
      'tablero_luces',
      'bateria',
      'bayoneta_aceite'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'exit_auth_nivel') THEN
    CREATE TYPE exit_auth_nivel AS ENUM ('ok', 'bajo', 'critico', 'no_visible');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'exit_auth_estado') THEN
    CREATE TYPE exit_auth_estado AS ENUM ('bueno', 'degradado', 'contaminado', 'no_visible');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'exit_auth_color_aceite') THEN
    CREATE TYPE exit_auth_color_aceite AS ENUM ('miel', 'oscuro', 'negro', 'no_visible');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'exit_auth_confianza') THEN
    CREATE TYPE exit_auth_confianza AS ENUM ('alta', 'media', 'baja');
  END IF;
END $$;

-- ─── Columnas nuevas en company_exit_authorizations ────────────────────────

ALTER TABLE company_exit_authorizations
  ADD COLUMN IF NOT EXISTS ai_analysis_status        exit_auth_ai_analysis_status NOT NULL DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS ai_analysis_decision_at  timestamp;

-- ─── Tabla de análisis ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS exit_authorization_analyses (
  id                     serial PRIMARY KEY,
  exit_authorization_id  integer NOT NULL REFERENCES company_exit_authorizations(id) ON DELETE CASCADE,
  company_id             integer NOT NULL,
  item_type              exit_auth_item_type    NOT NULL,
  nivel                  exit_auth_nivel,
  estado                 exit_auth_estado,
  color_aceite           exit_auth_color_aceite,
  confianza              exit_auth_confianza    NOT NULL,
  puede_salir            boolean                NOT NULL,
  observaciones          text                   NOT NULL,
  accion_recomendada     text                   NOT NULL,
  razonamiento           text                   NOT NULL,
  gemini_model           varchar(100)           NOT NULL,
  latency_ms             integer                NOT NULL,
  input_tokens           integer,
  output_tokens          integer,
  total_tokens           integer,
  photo_url              text,
  created_at             timestamp              NOT NULL DEFAULT now()
);

-- ─── Índices ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_exit_analyzes_auth
  ON exit_authorization_analyses(exit_authorization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_exit_analyzes_company_item
  ON exit_authorization_analyses(company_id, item_type);

CREATE INDEX IF NOT EXISTS idx_exit_analyzes_failed
  ON exit_authorization_analyses(exit_authorization_id)
  WHERE puede_salir = false;

CREATE INDEX IF NOT EXISTS idx_exit_auth_status
  ON company_exit_authorizations(ai_analysis_status);

-- ─── ANALYZE ────────────────────────────────────────────────────────────────
ANALYZE;
