-- Diagnóstico completo: TODOS los triggers, reglas y FKs en TODAS las
-- tablas que apuntan a companies.id. Buscamos:
--   - FKs con delete_action = 'n' (SET NULL) o 'a' (NO ACTION)
--   - Triggers en CUALQUIER tabla
--   - Rules en CUALQUIER tabla

-- 1) TODAS las FKs hacia companies.id
SELECT
  tc.table_schema,
  tc.table_name,
  tc.constraint_name,
  kcu.column_name,
  CASE c.confdeltype
    WHEN 'c' THEN 'CASCADE'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'd' THEN 'SET DEFAULT'
    ELSE c.confdeltype
  END AS delete_action,
  CASE c.confupdtype
    WHEN 'c' THEN 'CASCADE'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'd' THEN 'SET DEFAULT'
    ELSE c.confupdtype
  END AS update_action,
  pg_get_constraintdef(c.oid) AS definicion
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN pg_constraint c
  ON c.conname = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage ccu
    WHERE ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = 'public'
      AND ccu.table_name = 'companies'
  )
ORDER BY
  CASE c.confdeltype
    WHEN 'c' THEN 0
    WHEN 'r' THEN 1
    WHEN 'n' THEN 2
    WHEN 'a' THEN 3
    ELSE 4
  END,
  tc.table_name;

-- 2) TODOS los triggers en TODAS las tablas (no solo companies)
SELECT
  n.nspname AS schema,
  c.relname AS tabla,
  t.tgname  AS trigger_name,
  t.tgenabled AS enabled,
  pg_get_triggerdef(t.oid) AS definicion
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal
  AND n.nspname = 'public'
ORDER BY c.relname, t.tgname;
