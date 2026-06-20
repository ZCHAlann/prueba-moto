-- ============================================================================
-- Migración 0021: Índices de performance
-- ============================================================================
-- Este script agrega los índices que faltan para acelerar las queries
-- más pesadas del sistema:
--   - Listados y stats por empresa + fecha
--   - Joins por FKs usadas como lookup (asset_id, driver_id, user_id)
--   - Filtros de status y order by recientes
--   - Búsquedas parciales (text search) y ordenamiento por nombre
--
-- Idempotente: usa IF NOT EXISTS para que se pueda correr varias veces
-- sin romper.
--
-- Recomendación: correr en horario de bajo tráfico. En tablas grandes
-- (combustible, mantenimientos, asignaciones) el CREATE INDEX sin
-- CONCURRENTELY toma lock de escritura. Si tu BD tiene mucha carga
-- durante el deploy, considera correr con CONCURRENTELY (PG ≥ 9.2).
-- ============================================================================

-- ─── company_fuel_entries ───────────────────────────────────────────────────
-- Esta tabla no tenía NINGÚN índice propio. Las stats de combustible
-- hacían WHERE company_id + date range + (asset_id|driver_id) y filtraban
-- en memoria → lentísimo con >5k filas.
CREATE INDEX IF NOT EXISTS idx_fuel_entries_company_date
  ON company_fuel_entries(company_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_fuel_entries_company_asset_date
  ON company_fuel_entries(company_id, asset_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_fuel_entries_company_driver_date
  ON company_fuel_entries(company_id, driver_id, date DESC)
  WHERE driver_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fuel_entries_fuel_type
  ON company_fuel_entries(company_id, fuel_type, date DESC)
  WHERE fuel_type IS NOT NULL;

-- ─── company_maintenance_records ────────────────────────────────────────────
-- Ya hay algunos índices (0006). Faltan combinaciones críticas:
--   - (company_id, asset_id, scheduled_for DESC) para el drawer de vehículo
--   - (company_id, status, scheduled_for) para los listados con filtro status
--   - (company_id, type, created_at DESC) para stats de lavada
--   - (company_id, assigned_user_id) para "mis mantenimientos"
CREATE INDEX IF NOT EXISTS idx_maint_company_asset_sched
  ON company_maintenance_records(company_id, asset_id, scheduled_for DESC);

CREATE INDEX IF NOT EXISTS idx_maint_company_status_sched
  ON company_maintenance_records(company_id, status, scheduled_for DESC);

CREATE INDEX IF NOT EXISTS idx_maint_company_type_created
  ON company_maintenance_records(company_id, type, created_at DESC);

-- Solo los asignados a un usuario: agiliza la pantalla "Mis mantenimientos"
-- (típicamente un subconjunto pequeño de todas las OTs de la empresa).
CREATE INDEX IF NOT EXISTS idx_maint_company_assigned_sched
  ON company_maintenance_records(company_id, assigned_user_id, scheduled_for DESC)
  WHERE assigned_user_id IS NOT NULL;

-- Para los listados de alertas de vencimiento de licencia (los que el
-- admin ve en el dashboard) y para el badge "vencidas/próximas a vencer".
CREATE INDEX IF NOT EXISTS idx_maint_company_carwash_expiry
  ON company_maintenance_records(company_id, carwash_provider, scheduled_for DESC)
  WHERE type = 'Lavada';

-- ─── company_assignments ────────────────────────────────────────────────────
-- La query más frecuente es: company_id + status='Activa' + order by created_at DESC
-- para encontrar el conductor actual de cada vehículo. El índice actual
-- cubre la primera parte pero no la combinación completa.
CREATE INDEX IF NOT EXISTS idx_assignments_company_status_created
  ON company_assignments(company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assignments_company_asset_status
  ON company_assignments(company_id, asset_id, status);

CREATE INDEX IF NOT EXISTS idx_assignments_company_driver_status
  ON company_assignments(company_id, driver_id, status);

-- Para la consulta de "última asignación cerrada" del conductor (cuando
-- ya no está activo pero queremos mostrar el historial reciente en el
-- drawer).
CREATE INDEX IF NOT EXISTS idx_assignments_company_driver_created
  ON company_assignments(company_id, driver_id, created_at DESC);

-- ─── company_assets ────────────────────────────────────────────────────────
-- El listado y los filtros siempre arrancan por company_id. El order by
-- típico es por name (alfabético) o por id DESC (más recientes).
CREATE INDEX IF NOT EXISTS idx_assets_company_name
  ON company_assets(company_id, name);

CREATE INDEX IF NOT EXISTS idx_assets_company_status
  ON company_assets(company_id, status);

CREATE INDEX IF NOT EXISTS idx_assets_company_site
  ON company_assets(company_id, site_id)
  WHERE site_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assets_company_type
  ON company_assets(company_id, asset_type);

-- Búsqueda por placa (la pantalla de flotas y la asignación usan LIKE %plate%).
-- PG puede usar trigram si la extensión pg_trgm está habilitada; el índice
-- btree ayuda con búsquedas exactas / prefijo.
CREATE INDEX IF NOT EXISTS idx_assets_company_plate
  ON company_assets(company_id, plate)
  WHERE plate IS NOT NULL;

-- ─── company_drivers ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_drivers_company_lastname
  ON company_drivers(company_id, last_name);

CREATE INDEX IF NOT EXISTS idx_drivers_company_status
  ON company_drivers(company_id, status);

CREATE INDEX IF NOT EXISTS idx_drivers_company_site
  ON company_drivers(company_id, site_id)
  WHERE site_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_drivers_company_user
  ON company_drivers(company_id, user_id)
  WHERE user_id IS NOT NULL;

-- Búsqueda rápida por cédula (campo clave para录入 rápida de un nuevo conductor).
CREATE INDEX IF NOT EXISTS idx_drivers_company_dni
  ON company_drivers(company_id, driver_dni)
  WHERE driver_dni IS NOT NULL;

-- ─── company_odometer_readings ─────────────────────────────────────────────
-- Stats y drawer consultan "último odómetro del vehículo". Ya hay un
-- índice por asset_id, agregamos el compuesto para company + asset + fecha.
CREATE INDEX IF NOT EXISTS idx_odometer_company_asset_taken
  ON company_odometer_readings(company_id, asset_id, taken_at DESC);

-- ─── company_oil_changes ───────────────────────────────────────────────────
-- Stats filtran por rango de fechas; el lookup actual es por asset.
CREATE INDEX IF NOT EXISTS idx_oil_changes_company_asset_date
  ON company_oil_changes(company_id, asset_id, date DESC);

-- ─── company_toll_entries ───────────────────────────────────────────────────
-- Listado ordenado por fecha desc, filtrado por empresa.
CREATE INDEX IF NOT EXISTS idx_toll_company_date
  ON company_toll_entries(company_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_toll_company_asset_date
  ON company_toll_entries(company_id, asset_id, date DESC);

-- ─── company_checklists ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_checklists_company_date
  ON company_checklists(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_checklists_company_asset_date
  ON company_checklists(company_id, asset_id, created_at DESC);

-- ─── company_alerts ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_alerts_company_created
  ON company_alerts(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_company_unread
  ON company_alerts(company_id, read_at)
  WHERE read_at IS NULL;

-- ─── company_notifications ─────────────────────────────────────────────────
-- El endpoint de unread-count y el listado del badge hacen
-- WHERE user_id + read_at IS NULL.
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON company_notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;

-- ─── company_audit_log ─────────────────────────────────────────────────────
-- Búsquedas por entidad + rango de fechas (el panel de auditoría).
CREATE INDEX IF NOT EXISTS idx_audit_company_entity_created
  ON company_audit_log(company_id, entity, entity_id, created_at DESC);

-- ─── company_user_sessions ─────────────────────────────────────────────────
-- Si existe, agiliza la invalidación de sesión al cambiar permisos.
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active
  ON company_user_sessions(user_id, revoked_at)
  WHERE revoked_at IS NULL;

-- ─── company_driver_reports ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_driver_reports_driver_created
  ON company_driver_reports(driver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_driver_reports_company_created
  ON company_driver_reports(company_id, created_at DESC);

-- ─── company_exit_authorizations ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_exit_auth_company_status_created
  ON company_exit_authorizations(company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_exit_auth_company_asset_status
  ON company_exit_authorizations(company_id, asset_id, status);

CREATE INDEX IF NOT EXISTS idx_exit_auth_company_driver_status
  ON company_exit_authorizations(company_id, driver_id, status);

-- ─── companies ─────────────────────────────────────────────────────────────
-- El lookup por slug es frecuente (subdominio → tenant).
CREATE INDEX IF NOT EXISTS idx_companies_slug
  ON companies(slug);

-- ─── ANALYZE: refrescar estadísticas ────────────────────────────────────────
-- Después de crear índices, refrescar las stats del planner para que
-- Postgres elija el plan óptimo de inmediato.
ANALYZE;

-- ============================================================================
-- FIN 0021
-- ============================================================================
