-- ─── 0011_unify_maintenance_module_key.sql ──────────────────────────────────
--
-- Unifica la clave del módulo de mantenimiento a 'mantenimiento' (español),
-- convención usada por el frontend en
-- `getDefaultPermissionsForRole` (apps/frontend/src/pages/Accesos/Usuarios/page.tsx).
--
-- Históricamente coexistían dos claves:
--   - 'maintenance'   (inglés, convención original del backend)
--   - 'mantenimiento' (español, convención del frontend)
--
-- Esta migración:
--   1. companies.enabled_modules: 'maintenance' → 'mantenimiento'.
--   2. company_users.module_permissions: renombra la clave top-level
--      y mergea los submódulos (dedup de acciones) si ya existía la nueva.
--   3. company_roles.permissions: idem.
--
-- Se aplica con SQL puro (sin Drizzle), consistente con 0010.

-- ─── 1. companies.enabled_modules ───────────────────────────────────────────
UPDATE companies
SET enabled_modules = array_replace(enabled_modules, 'maintenance', 'mantenimiento')
WHERE 'maintenance' = ANY(enabled_modules);

-- ─── Helper: merge de la clave 'maintenance' dentro de un jsonb ─────────────
-- Toma un jsonb que puede contener 'maintenance' y/o 'mantenimiento',
-- y devuelve un jsonb donde solo queda 'mantenimiento' con los submódulos
-- mergeados y dedupeados. Si no tiene 'maintenance', lo devuelve tal cual.
CREATE OR REPLACE FUNCTION pg_temp.merge_maintenance_key(p jsonb)
RETURNS jsonb AS $$
DECLARE
  maint      jsonb;
  mant       jsonb;
  result     jsonb;
  k          text;
  v_old      jsonb;
  v_new      jsonb;
  merged_v   jsonb;
BEGIN
  maint := p -> 'maintenance';
  IF maint IS NULL THEN
    RETURN p;
  END IF;

  mant := p -> 'mantenimiento';

  -- Empezar con el resto del jsonb sin ninguna de las dos claves
  result := p - 'maintenance' - 'mantenimiento';

  IF mant IS NULL THEN
    -- Caso simple: solo existía 'maintenance', renombrar
    result := result || jsonb_build_object('mantenimiento', maint);
    RETURN result;
  END IF;

  -- Ambas claves existen: mergear submódulos
  FOR k IN SELECT jsonb_object_keys(maint)
  LOOP
    v_old := maint -> k;
    v_new := COALESCE(mant -> k, '[]'::jsonb);

    -- Dedupear acciones combinando los dos arrays
    SELECT jsonb_agg(DISTINCT val)
      INTO merged_v
      FROM jsonb_array_elements_text(v_old || v_new) AS val;

    result := result || jsonb_build_object(k, COALESCE(merged_v, '[]'::jsonb));
  END LOOP;

  -- Submódulos que solo están bajo 'mantenimiento' (sin conflicto)
  FOR k IN SELECT jsonb_object_keys(mant)
  LOOP
    IF NOT (maint ? k) THEN
      result := result || jsonb_build_object(k, mant -> k);
    END IF;
  END LOOP;

  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ─── 2. company_users.module_permissions ────────────────────────────────────
UPDATE company_users
SET module_permissions = pg_temp.merge_maintenance_key(module_permissions)
WHERE jsonb_typeof(module_permissions) = 'object'
  AND module_permissions ? 'maintenance';

-- ─── 3. company_roles.permissions ───────────────────────────────────────────
UPDATE company_roles
SET permissions = pg_temp.merge_maintenance_key(permissions)
WHERE jsonb_typeof(permissions) = 'object'
  AND permissions ? 'maintenance';

-- ─── Limpieza del helper ────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS pg_temp.merge_maintenance_key(jsonb);
