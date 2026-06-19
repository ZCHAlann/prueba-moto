-- ─── 0013_normalize_mantenimiento_permissions.sql ─────────────────────────
--
-- Corrige registros de `company_users.module_permissions` y
-- `company_roles.permissions` que tienen los submódulos de mantenimiento
-- al top-level del jsonb (sin anidamiento bajo la clave "mantenimiento").
--
-- Ejemplo de lo que está MAL:
--   {"agenda": ["ver"], "execution": [...], "records": [...], "otro_modulo": {...}}
--
-- Lo que QUEREMOS:
--   {"mantenimiento": {"agenda": ["ver"], "execution": [...], "records": [...]}, "otro_modulo": {...}}
--
-- Esta migración detecta los keys conocidos de los submódulos de mantenimiento
-- ("agenda", "execution", "records", "notifications") al top-level del jsonb
-- y los mueve bajo "mantenimiento". Si "mantenimiento" ya existe, mergea los
-- submódulos con dedupe de acciones.
--
-- Idempotente: si no hay registros mal, no hace nada.

DO $$
DECLARE
  r record;
  raw jsonb;
  fixed jsonb;
  top_mods jsonb;
  mant_subs jsonb;
  has_maint boolean;
  has_loose boolean;
  moved boolean;
  new_perms jsonb;
  v text;
BEGIN
  FOR r IN SELECT id, module_permissions AS p FROM company_users
  LOOP
    raw := r.p;
    IF raw IS NULL OR jsonb_typeof(raw) <> 'object' THEN CONTINUE; END IF;

    -- ¿Hay keys sueltos que son submódulos de mantenimiento?
    has_loose := (raw ? 'agenda') OR (raw ? 'execution') OR (raw ? 'records') OR (raw ? 'notifications');
    has_maint := raw ? 'mantenimiento';

    IF NOT has_loose THEN CONTINUE; END IF;

    -- Construir el objeto "mantenimiento" con los keys sueltos
    mant_subs := '{}'::jsonb;
    FOR v IN SELECT unnest(ARRAY['agenda','execution','records','notifications'])
    LOOP
      IF raw ? v THEN
        mant_subs := mant_subs || jsonb_build_object(v, raw -> v);
      END IF;
    END LOOP;

    -- Si ya existía "mantenimiento", mergear (los del registro actual mandan)
    IF has_maint AND jsonb_typeof(raw -> 'mantenimiento') = 'object' THEN
      mant_subs := (raw -> 'mantenimiento') || mant_subs;
    END IF;

    -- Construir el nuevo jsonb: top-level sin los keys sueltos + mantenimiento mergeado
    new_perms := raw - 'agenda' - 'execution' - 'records' - 'notifications';
    new_perms := new_perms || jsonb_build_object('mantenimiento', mant_subs);

    UPDATE company_users
    SET module_permissions = new_perms
    WHERE id = r.id;
  END LOOP;

  FOR r IN SELECT id, permissions AS p FROM company_roles
  LOOP
    raw := r.p;
    IF raw IS NULL OR jsonb_typeof(raw) <> 'object' THEN CONTINUE; END IF;

    has_loose := (raw ? 'agenda') OR (raw ? 'execution') OR (raw ? 'records') OR (raw ? 'notifications');
    has_maint := raw ? 'mantenimiento';

    IF NOT has_loose THEN CONTINUE; END IF;

    mant_subs := '{}'::jsonb;
    FOR v IN SELECT unnest(ARRAY['agenda','execution','records','notifications'])
    LOOP
      IF raw ? v THEN
        mant_subs := mant_subs || jsonb_build_object(v, raw -> v);
      END IF;
    END LOOP;

    IF has_maint AND jsonb_typeof(raw -> 'mantenimiento') = 'object' THEN
      mant_subs := (raw -> 'mantenimiento') || mant_subs;
    END IF;

    new_perms := raw - 'agenda' - 'execution' - 'records' - 'notifications';
    new_perms := new_perms || jsonb_build_object('mantenimiento', mant_subs);

    UPDATE company_roles
    SET permissions = new_perms
    WHERE id = r.id;
  END LOOP;
END $$;
