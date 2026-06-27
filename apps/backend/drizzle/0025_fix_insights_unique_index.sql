-- ─── 0025_fix_insights_unique_index.sql ───────────────────────────────
--
-- Arregla el UNIQUE INDEX de `company_stats_insights_cache` para que
-- matchee el ON CONFLICT del código Drizzle.
--
-- La migración 0016 original creó el índice con COALESCE(asset_id, 0)
-- y COALESCE(driver_id, 0) — útil para tratar NULL = "todos" como un
-- valor comparable. Pero el código normaliza NULL a `-1` ANTES de
-- insertar, y el ON CONFLICT que genera Drizzle usa las columnas
-- puras (sin COALESCE). Postgres entonces tira:
--
--   42P10: there is no unique or exclusion constraint matching
--          the ON CONFLICT specification
--
-- Solución: dropear el índice con COALESCE y crear uno nuevo con
-- las columnas directas. Como ahora SIEMPRE hay valor (-1 sentinel
-- para "sin filtro"), no necesitamos el COALESCE.

DROP INDEX IF EXISTS idx_company_stats_insights_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_stats_insights_unique
  ON company_stats_insights_cache(
    company_id, modulo, periodo, fecha_ref, fecha_hasta,
    asset_id, driver_id, input_hash
  );