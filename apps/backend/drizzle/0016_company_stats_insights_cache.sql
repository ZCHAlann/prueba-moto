-- ─── 0016_company_stats_insights_cache.sql ──────────────────────────
--
-- Tabla para cachear el análisis IA de Estadísticas.
--
-- Una fila por (company, modulo, periodo, fechaRef, assetId, driverId).
-- El cache se invalida automáticamente por TTL (`expires_at`) o
-- manualmente cuando el usuario click "Regenerar".
--
-- `payload` guarda el JSON agregado que se envió a la IA (para
-- reproducibilidad). `response` guarda la respuesta cruda.
-- `resumen_ejecutivo`, `puntos_clave`, `recomendaciones`, `alertas` son
-- campos estructurados extraídos de la respuesta para fácil render.

CREATE TABLE IF NOT EXISTS company_stats_insights_cache (
  id                SERIAL PRIMARY KEY,
  company_id        INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  modulo            VARCHAR(40) NOT NULL,                -- 'mantenimiento' | 'combustible' | ...
  periodo           VARCHAR(20) NOT NULL,                -- 'month' | 'quarter' | 'year'
  fecha_ref         DATE NOT NULL,                       -- fecha desde
  fecha_hasta       DATE NOT NULL,                       -- fecha hasta
  asset_id          INTEGER,                             -- NULL = todos
  driver_id         INTEGER,                             -- NULL = todos
  provider          VARCHAR(40) NOT NULL,                -- 'groq-llama-3.3-70b' etc.
  model             VARCHAR(80) NOT NULL,

  -- Input y output del modelo
  payload           JSONB NOT NULL,                      -- JSON agregado enviado
  response_raw      TEXT NOT NULL,                       -- texto crudo del modelo
  resumen_ejecutivo TEXT,                                -- 1-3 oraciones
  puntos_clave      JSONB NOT NULL DEFAULT '[]'::jsonb,   -- array<string>
  recomendaciones   JSONB NOT NULL DEFAULT '[]'::jsonb,   -- array<{titulo, accion, prioridad}>
  alertas           JSONB NOT NULL DEFAULT '[]'::jsonb,   -- array<{titulo, detalle, severidad}>

  -- Tokens y métricas
  input_tokens      INTEGER,
  output_tokens     INTEGER,
  total_tokens      INTEGER,
  latency_ms        INTEGER,

  -- Vigencia
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMP NOT NULL,                  -- created + TTL

  -- Hash determinístico del input → evita re-generar si nada cambió
  input_hash        VARCHAR(64) NOT NULL
);

-- Búsqueda por hash (mismo input = misma respuesta cacheada)
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_stats_insights_unique
  ON company_stats_insights_cache(company_id, modulo, periodo, fecha_ref, fecha_hasta, COALESCE(asset_id, 0), COALESCE(driver_id, 0), input_hash);

-- Listar por empresa+módulo
CREATE INDEX IF NOT EXISTS idx_company_stats_insights_company_modulo
  ON company_stats_insights_cache(company_id, modulo, created_at DESC);

-- Limpieza de expirados
CREATE INDEX IF NOT EXISTS idx_company_stats_insights_expires
  ON company_stats_insights_cache(expires_at);
