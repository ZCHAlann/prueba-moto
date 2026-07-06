-- ============================================================================
-- 0040_notifications_extended.sql
-- ============================================================================
-- Amplía el sistema de notificaciones in-app para cubrir TODOS los módulos
-- del sistema, no solo mantenimiento.
--
-- Cambios:
--   1. Enum `notification_kind_enum` — añade 20+ kinds nuevos para cubrir:
--        - Accesos/Usuarios (created/updated/deleted/inactive)
--        - Accesos/Roles (created/updated/deleted)
--        - Gestión genérico (entity_created/updated/deleted)
--        - Checklists (created/overdue/reauth_requested/reauth_decided)
--        - Mantenimientos (created/assigned/free_pool/taken/status_changed)
--        - Alertas de conductor (alert_created)
--        - Anomalías IA (anomaly_detected)
--        - Sistema (system)
--   2. Índices de performance:
--        - (company_id, user_id, read_at) — para /unread-count y bandeja
--        - (company_id, kind, created_at DESC) — para filtros por tipo
--   3. Comentarios de tabla.
--
-- Idempotente: IF NOT EXISTS en ALTER TYPE / CREATE INDEX.
-- ============================================================================

-- ── 1. Ampliar enum notification_kind_enum ───────────────────────────────────
--
-- ALTER TYPE ... ADD VALUE puede ejecutarse dentro de transacción en
-- Postgres 12+. Neon usa Postgres 16, así que es seguro.
--
-- IMPORTANTE: NO renombramos valores existentes para mantener compatibilidad
-- hacia atrás. Solo añadimos.

ALTER TYPE notification_kind_enum ADD VALUE IF NOT EXISTS 'user_created';
ALTER TYPE notification_kind_enum ADD VALUE IF NOT EXISTS 'user_updated';
ALTER TYPE notification_kind_enum ADD VALUE IF NOT EXISTS 'user_deleted';
ALTER TYPE notification_kind_enum ADD VALUE IF NOT EXISTS 'user_inactive';

ALTER TYPE notification_kind_enum ADD VALUE IF NOT EXISTS 'role_created';
ALTER TYPE notification_kind_enum ADD VALUE IF NOT EXISTS 'role_updated';
ALTER TYPE notification_kind_enum ADD VALUE IF NOT EXISTS 'role_deleted';

-- Genérico para gestión: talleres, proveedores, vehículos, conductores,
-- peajes, combustibles, seguros, etc.
ALTER TYPE notification_kind_enum ADD VALUE IF NOT EXISTS 'entity_created';
ALTER TYPE notification_kind_enum ADD VALUE IF NOT EXISTS 'entity_updated';
ALTER TYPE notification_kind_enum ADD VALUE IF NOT EXISTS 'entity_deleted';

-- Mantenimientos
ALTER TYPE notification_kind_enum ADD VALUE IF NOT EXISTS 'maintenance_created';
ALTER TYPE notification_kind_enum ADD VALUE IF NOT EXISTS 'maintenance_assigned';
ALTER TYPE notification_kind_enum ADD VALUE IF NOT EXISTS 'maintenance_taken';
ALTER TYPE notification_kind_enum ADD VALUE IF NOT EXISTS 'maintenance_free_pool';
ALTER TYPE notification_kind_enum ADD VALUE IF NOT EXISTS 'maintenance_status_changed';
ALTER TYPE notification_kind_enum ADD VALUE IF NOT EXISTS 'maintenance_reauth_requested';
ALTER TYPE notification_kind_enum ADD VALUE IF NOT EXISTS 'maintenance_reauth_decided';

-- ── Checklists ──────────────────────────────────────────────
ALTER TYPE notification_kind_enum ADD VALUE IF NOT EXISTS 'checklist_overdue';
ALTER TYPE notification_kind_enum ADD VALUE IF NOT EXISTS 'checklist_reauth_requested';
ALTER TYPE notification_kind_enum ADD VALUE IF NOT EXISTS 'checklist_reauth_decided';

-- Alertas operativas (conductor crea → admins_empresa)
ALTER TYPE notification_kind_enum ADD VALUE IF NOT EXISTS 'alert_created';
ALTER TYPE notification_kind_enum ADD VALUE IF NOT EXISTS 'alert_updated';
ALTER TYPE notification_kind_enum ADD VALUE IF NOT EXISTS 'alert_closed';

-- Anomalías IA (picos de consumo, etc.)
ALTER TYPE notification_kind_enum ADD VALUE IF NOT EXISTS 'anomaly_detected';

-- ── 2. Índices ───────────────────────────────────────────────────────────────

-- Bandeja: filtrar por (company, user, leídas) — usado por:
--   - GET /notifications/unread-count (filas sin readAt)
--   - GET /notifications (lista filtrada por user)
CREATE INDEX IF NOT EXISTS idx_company_notifications_user_read
  ON company_notifications (company_id, user_id, read_at);

-- Filtros por tipo dentro de la empresa:
--   - GET /notifications?kind=maintenance_due (futuro)
--   - Badge filtrado por tipo en UI
CREATE INDEX IF NOT EXISTS idx_company_notifications_kind_created
  ON company_notifications (company_id, kind, created_at DESC);

-- Filtro "scope=all" para admins: traer TODAS las notificaciones de la
-- empresa (para la campanita del admin que ve todo). El índice compuesto
-- (company_id, created_at DESC) ya cubre esto en buena medida.
CREATE INDEX IF NOT EXISTS idx_company_notifications_company_created
  ON company_notifications (company_id, created_at DESC);

-- ── 3. Comentarios ──────────────────────────────────────────────────────────

COMMENT ON COLUMN company_notifications.kind IS
  'Tipo de notificación. Ver enum notification_kind_enum. Cada kind define su audiencia esperada en notification-service.ts.';

COMMENT ON COLUMN company_notifications.payload IS
  'Datos contextuales (JSON). Convención: incluir SIEMPRE la FK al recurso (ej. maintenanceId, userId) y un reason/short text para el toast.';

-- ── 4. Backfill del catálogo de permisos por defecto ─────────────────────────
--
-- El módulo "notificaciones" en el menú de la izquierda usa el permiso
-- granular `mantenimiento.notifications.ver`. Esto YA EXISTE desde antes.
-- No requiere backfill.
-- ============================================================================