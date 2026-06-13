-- migrations/0007_normalize_modules_and_permissions.sql
-- 2026-06-13
-- Normaliza los módulos y permisos de las empresas para que coincidan con
-- el module-tree actual. Idempotente: solo modifica lo que está mal.
--
-- Aplica a TODAS las empresas (companies) y a TODOS los usuarios (company_users).
--
-- ANTES de correr, hacé backup:
--   pg_dump $DATABASE_URL -Fc -f backup_0007_$(date +%Y%m%d).dump

BEGIN;

-- ─── 1) Normalizar company_modules ────────────────────────────────────────────
-- Quita duplicados (mantenimiento vs maintenance), mantiene el español.
-- Saca entradas que ya no existen en el module-tree.

UPDATE companies
SET modules = (
  SELECT array_agg(DISTINCT m ORDER BY m)
  FROM unnest(modules) AS m
  WHERE m IN (
    'ac', 'dashboard', 'gestion', 'motores', 'generadores',
    'mantenimiento', 'checklist', 'alertas', 'reportes',
    'combustible', 'geolocalizacion', 'accesos', 'autorizaciones'
  )
)
WHERE modules IS NOT NULL
  AND (
    'maintenance' = ANY(modules)   -- el viejo, en inglés
    OR 'seguros'     = ANY(modules) -- ya no se usa como key
    OR 'configuracion' = ANY(modules)
    OR 'inventario'  = ANY(modules)
    OR 'flotas'      = ANY(modules)
  );

-- ─── 2) Normalizar module_permissions de cada usuario ───────────────────────
-- Para cada usuario:
--   - Borra los submódulos viejos de 'mantenimiento': ordenes, oil, inventario.
--   - Agrega los submódulos nuevos de 'mantenimiento' con [].
--   - Agrega 'gestion.proveedores' si no está.

UPDATE company_users cu
SET module_permissions = (
  -- Tomamos el JSONB actual y le aplicamos las correcciones
  (
    SELECT jsonb_object_agg(mod_key, mod_value)
    FROM (
      SELECT
        key AS mod_key,
        CASE
          -- ═══ MANTENIMIENTO: borrar submódulos viejos, agregar nuevos ═══
          WHEN key = 'mantenimiento' THEN
            jsonb_build_object(
              'agenda',    COALESCE(mod->'agenda',    '[]'::jsonb),
              'execution', COALESCE(mod->'execution', '[]'::jsonb),
              'records',   COALESCE(mod->'records',   '[]'::jsonb),
              'workshops',  COALESCE(mod->'workshops',  '[]'::jsonb),
              'suppliers',  COALESCE(mod->'suppliers',  '[]'::jsonb)
            )
          -- ═══ GESTION: asegurar que tenga 'proveedores' y limpiar ═══
          WHEN key = 'gestion' THEN
            mod || jsonb_build_object('proveedores', COALESCE(mod->'proveedores', '[]'::jsonb))
          -- Resto: dejar como está
          ELSE mod
        END AS mod_value
      FROM jsonb_each(cu.module_permissions) AS t(key, mod)
    ) AS cleaned
  )
)
WHERE cu.module_permissions IS NOT NULL
  AND (
    -- Solo si tiene 'mantenimiento' con submódulos viejos
    (cu.module_permissions->'mantenimiento' ? 'ordenes')
    OR (cu.module_permissions->'mantenimiento' ? 'oil')
    OR (cu.module_permissions->'mantenimiento' ? 'inventario')
    -- O si le falta 'gestion.proveedores'
    OR NOT (cu.module_permissions->'gestion' ? 'proveedores')
  );

-- ─── 3) Para usuarios con módulo 'mantenimiento' activado, asegurar ───────────
-- que tengan al menos los submódulos básicos visibles (con [] si no tienen).

UPDATE company_users cu
SET module_permissions = jsonb_set(
  cu.module_permissions,
  '{mantenimiento}',
  jsonb_build_object(
    'agenda',    COALESCE(cu.module_permissions->'mantenimiento'->'agenda',    '[]'::jsonb),
    'execution', COALESCE(cu.module_permissions->'mantenimiento'->'execution', '[]'::jsonb),
    'records',   COALESCE(cu.module_permissions->'mantenimiento'->'records',   '[]'::jsonb)
  ),
  false
)
WHERE 'mantenimiento' = ANY(
  (SELECT modules FROM companies WHERE id = cu.company_id)
)
AND (
  NOT (cu.module_permissions ? 'mantenimiento')
  OR cu.module_permissions->'mantenimiento' = 'null'::jsonb
);

COMMIT;

-- ─── Verificación (opcional, solo SELECT) ────────────────────────────────────
-- SELECT id, name, modules FROM companies WHERE id = 1;
-- SELECT id, username, module_permissions->'mantenimiento' AS mant
-- FROM company_users WHERE company_id = 1 LIMIT 5;
