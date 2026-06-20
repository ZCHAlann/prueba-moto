-- ─── 0015_company_stats_anomalies.sql ────────────────────────────────────────
--
-- Tabla para registrar anomalías detectadas matemáticamente en los
-- submódulos de Estadísticas (reportes > estadisticas).
--
-- Una anomalía se dispara cuando un valor del período actual difiere
-- significativamente de la media histórica 3-6 meses del mismo módulo.
-- Severidad: 'baja' (1.0-1.5σ), 'media' (1.5-2.0σ), 'alta' (> 2.0σ).
--
-- Esta tabla NO se usa para Fase 1 (MVP sin UI de anomalías),
-- pero la creamos ya para no tener que re-migrar después.
--
-- Shape de `metadata` (jsonb):
--   {
--     "periodo":        "month" | "quarter" | "year",
--     "fechaRef":       "2026-06",
--     "valor":          1234.56,
--     "mediaHistorica": 800.00,
--     "desviacion":     1.7,        // z-score
--     "direccion":      "up" | "down"
--   }

CREATE TABLE IF NOT EXISTS company_stats_anomalies (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  modulo          VARCHAR(40) NOT NULL,                 -- 'mantenimiento' | 'combustible' | 'flotas'
  tipo            VARCHAR(80) NOT NULL,                 -- ej. 'costo_mantenimiento', 'consumo_combustible'
  dimension       VARCHAR(40),                          -- ej. 'asset', 'driver', 'category' (agrupador)
  dimension_id    INTEGER,                              -- id del asset/driver/etc.
  dimension_label VARCHAR(200),                         -- nombre legible
  severidad       VARCHAR(10) NOT NULL,                 -- 'baja' | 'media' | 'alta'
  descripcion     TEXT NOT NULL,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  detectado_en    TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Índices para consultas por empresa+módulo+período.
CREATE INDEX IF NOT EXISTS idx_company_stats_anomalies_company_modulo
  ON company_stats_anomalies(company_id, modulo);

CREATE INDEX IF NOT EXISTS idx_company_stats_anomalies_company_modulo_fecha
  ON company_stats_anomalies(company_id, modulo, detectado_en DESC);

-- Solo guardamos anomalías "activas" (no resueltas) por módulo+agrupador.
-- El detector puede actualizar la existente o crear una nueva.
CREATE INDEX IF NOT EXISTS idx_company_stats_anomalies_unique_active
  ON company_stats_anomalies(company_id, modulo, tipo, dimension, dimension_id);
