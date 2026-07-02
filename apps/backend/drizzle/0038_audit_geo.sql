-- ============================================================================
-- 0038_audit_geo.sql
-- ============================================================================
-- Geolocalización de acciones auditables.
--
-- Filosofía: dos capas, una sola fuente de verdad.
--   1. Columnas dedicadas en `company_audit_entries` para que las
--      estadísticas (by-location, by-day, top anomalous actors) sean
--      queries SQL rápidas — no hay que filtrar dentro de jsonb.
--   2. Mismas columnas en `company_exit_authorizations` (Fase 2 — piloto)
--      para que el drawer del registro pueda mostrarlas sin ir a
--      `company_audit_entries`.
--
-- El `matchedGarageId` y `distanceToGarageM` se calculan en backend
-- (lib/geo.ts) cuando llega el evento; se persisten ya calculados
-- para no tener que re-correr haversine cada vez que pintamos el mapa.
--
-- `ipAddress` y `userAgent` son contexto HTTP — siempre se capturan
-- vía middleware, no del cliente.
--
-- Cambios:
--   1. ALTER `company_audit_entries` (lat/long/accuracy/matched garage/IP/UA).
--   2. ALTER `company_exit_authorizations` (request_geo fields + FK garage).
--   3. Backfill: `auditoria.auditoria: ["ver"]` al rol `supervisor` en
--      cada empresa (para que el sidebar muestre el módulo a supervisores
--      que no lo tenían por default).
--   4. Backfill: `"auditoria"` a `companies.enabledModules` (para que
--      aparezca en el sidebar de owners/admins de empresas existentes).
--   5. Índices para el dashboard de auditoría.
--
-- Idempotente: IF NOT EXISTS / DO blocks + UPDATEs con `WHERE NOT (...)`
-- para re-ejecución segura.
-- ============================================================================

-- ── 1. company_audit_entries ────────────────────────────────────────────────
DO $$
BEGIN
  -- Geolocalización
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'company_audit_entries' AND column_name = 'latitude') THEN
    ALTER TABLE company_audit_entries ADD COLUMN latitude double precision;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'company_audit_entries' AND column_name = 'longitude') THEN
    ALTER TABLE company_audit_entries ADD COLUMN longitude double precision;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'company_audit_entries' AND column_name = 'location_accuracy') THEN
    ALTER TABLE company_audit_entries ADD COLUMN location_accuracy double precision;
  END IF;

  -- Match contra garaje conocido (poblado por lib/geo.ts en backend).
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'company_audit_entries' AND column_name = 'matched_garage_id') THEN
    ALTER TABLE company_audit_entries ADD COLUMN matched_garage_id integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'company_audit_entries' AND column_name = 'distance_to_garage_m') THEN
    ALTER TABLE company_audit_entries ADD COLUMN distance_to_garage_m double precision;
  END IF;

  -- Contexto HTTP (capturado por middleware captureRequestContext).
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'company_audit_entries' AND column_name = 'ip_address') THEN
    ALTER TABLE company_audit_entries ADD COLUMN ip_address varchar(64);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'company_audit_entries' AND column_name = 'user_agent') THEN
    ALTER TABLE company_audit_entries ADD COLUMN user_agent text;
  END IF;
END
$$;

-- FK matched_garage_id → company_garages(id) (nullable, set null on delete).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'company_audit_entries_matched_garage_id_fkey'
       AND table_name = 'company_audit_entries'
  ) THEN
    ALTER TABLE company_audit_entries
      ADD CONSTRAINT company_audit_entries_matched_garage_id_fkey
      FOREIGN KEY (matched_garage_id)
      REFERENCES company_garages(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

-- ── 2. company_exit_authorizations (Fase 2 — piloto) ───────────────────────
-- Mismas columnas, prefijo `request_` para distinguir de posibles
-- campos de decisión futuros. Solo se llenan al CREAR la autorización
-- (el `lugar de la solicitud`).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'company_exit_authorizations' AND column_name = 'request_latitude') THEN
    ALTER TABLE company_exit_authorizations ADD COLUMN request_latitude double precision;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'company_exit_authorizations' AND column_name = 'request_longitude') THEN
    ALTER TABLE company_exit_authorizations ADD COLUMN request_longitude double precision;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'company_exit_authorizations' AND column_name = 'request_location_accuracy') THEN
    ALTER TABLE company_exit_authorizations ADD COLUMN request_location_accuracy double precision;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'company_exit_authorizations' AND column_name = 'request_garage_id') THEN
    ALTER TABLE company_exit_authorizations ADD COLUMN request_garage_id integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'company_exit_authorizations' AND column_name = 'request_distance_m') THEN
    ALTER TABLE company_exit_authorizations ADD COLUMN request_distance_m double precision;
  END IF;
END
$$;

-- FK request_garage_id → company_garages(id).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'company_exit_authorizations_request_garage_id_fkey'
       AND table_name = 'company_exit_authorizations'
  ) THEN
    ALTER TABLE company_exit_authorizations
      ADD CONSTRAINT company_exit_authorizations_request_garage_id_fkey
      FOREIGN KEY (request_garage_id)
      REFERENCES company_garages(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

-- ── 3. Backfill de permisos para roles existentes ───────────────────────────
-- Empresas ya creadas antes de este cambio tienen sus `company_roles`
-- seeded con `auditoria.auditoria` AUSENTE. Sin el permiso, el
-- `filterOperationalNavigation` filtra la sección Auditoría del
-- sidebar para supervisores (los admins/owners siguen pasando por
-- bypass + por `companies.enabledModules`).
--
-- Solución: agregar `auditoria.auditoria: ["ver"]` al jsonb de
-- permisos del rol `supervisor` que aún no lo tenga. Idempotente.

UPDATE company_roles
   SET permissions = jsonb_set(
         permissions,
         '{auditoria,auditoria}',
         '["ver"]'::jsonb,
         true
       ),
       updated_at = now()
 WHERE key = 'supervisor'
   AND NOT (permissions #> '{auditoria,auditoria}' IS NOT NULL);

-- ── 4. Backfill de enabledModules para empresas existentes ──────────────────
-- Para que el módulo aparezca en el sidebar de los admins/owners, el
-- módulo tiene que estar en `companies.enabledModules` (jsonb array).
-- Empresas nuevas lo reciben por default si el superadmin lo agrega;
-- las existentes hay que backfill-earlas.

UPDATE companies
   SET enabled_modules = array_append(enabled_modules, 'auditoria')
 WHERE NOT ('auditoria' = ANY(enabled_modules));

-- ── 5. Índices para el dashboard de auditoría (Fase 3) ─────────────────────
-- Búsqueda por fecha + tiene coordenadas → render del mapa.
CREATE INDEX IF NOT EXISTS idx_company_audit_geo
  ON company_audit_entries(company_id, created_at DESC)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Top anomalous actors + stats rápidas por garage.
CREATE INDEX IF NOT EXISTS idx_company_audit_garage
  ON company_audit_entries(company_id, matched_garage_id, created_at DESC)
  WHERE matched_garage_id IS NOT NULL;

-- Búsqueda por rango de fecha (la página de auditoría con filtro de fecha).
CREATE INDEX IF NOT EXISTS idx_company_audit_created
  ON company_audit_entries(company_id, created_at DESC);

ANALYZE;

-- ── Comentarios ─────────────────────────────────────────────────────────────
COMMENT ON COLUMN company_audit_entries.latitude IS
  'Latitud del dispositivo al momento de la acción. NULL = sin GPS (permiso denegado, sin señal, o no se pidió).';
COMMENT ON COLUMN company_audit_entries.longitude IS
  'Longitud del dispositivo al momento de la acción. Ver latitude.';
COMMENT ON COLUMN company_audit_entries.location_accuracy IS
  'Precisión reportada por navigator.geolocation (metros). Útil para saber si la medición es confiable.';
COMMENT ON COLUMN company_audit_entries.matched_garage_id IS
  'Garaje más cercano al punto lat/long. Calculado en backend con haversine + lib/geo.ts. NULL si no hay garajes configurados para la empresa.';
COMMENT ON COLUMN company_audit_entries.distance_to_garage_m IS
  'Distancia en metros al matched_garage_id. Para alertas se compara con company_settings.geo_tolerance_m (default 150m).';
COMMENT ON COLUMN company_audit_entries.ip_address IS
  'IP de origen del request (cabecera X-Forwarded-For si hay proxy). Capturado por middleware captureRequestContext.';
COMMENT ON COLUMN company_audit_entries.user_agent IS
  'User-Agent del navegador/dispositivo. Útil para distinguir conductor-app vs. supervisor-web.';

COMMENT ON COLUMN company_exit_authorizations.request_latitude IS
  'Latitud al momento de crear la solicitud. Replica del audit pero en la tabla operativa para que el drawer específico la muestre sin ir al log.';
COMMENT ON COLUMN company_exit_authorizations.request_garage_id IS
  'Garaje más cercano al punto. NULL si el conductor está fuera de cobertura o no se pudo calcular.';
COMMENT ON COLUMN company_exit_authorizations.request_distance_m IS
  'Distancia en metros al garaje esperado. Útil para detectar solicitudes sospechosas (conductor pide salida desde lejos de cualquier garaje).';
