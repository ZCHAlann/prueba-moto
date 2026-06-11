-- 0003_driver_user_unique_and_cascade.sql
--
-- Refuerza la relación 1-a-1 entre company_users y company_drivers.
--   1) Borra duplicados company_users↔drivers (sólo si hay 2+ filas
--      con el mismo (company_id, user_id)). Conserva el de menor id.
--   2) NULLs los user_id duplicados residuales.
--   3) Cambia el FK user_id a ON DELETE CASCADE (antes era set null).
--   4) Crea UNIQUE(company_id, user_id).

-- 1) Deduplicar conservando el de menor id por (company_id, user_id)
DELETE FROM company_drivers d
USING company_drivers d2
WHERE d.company_id = d2.company_id
  AND d.user_id   IS NOT NULL
  AND d.user_id   = d2.user_id
  AND d.id > d2.id;

-- 2) Limpiar NULL user_id huérfanos que no aporten (ya era set null antes,
--    por seguridad)
UPDATE company_drivers SET user_id = NULL WHERE user_id IS NULL;

-- 3) FK CASCADE
ALTER TABLE company_drivers
  DROP CONSTRAINT IF EXISTS company_drivers_user_id_company_users_id_fk;

ALTER TABLE company_drivers
  ADD CONSTRAINT company_drivers_user_id_company_users_id_fk
  FOREIGN KEY (user_id) REFERENCES company_users(id) ON DELETE CASCADE;

-- 4) UNIQUE(company_id, user_id)
ALTER TABLE company_drivers
  ADD CONSTRAINT company_drivers_company_id_user_id_key
  UNIQUE (company_id, user_id);
