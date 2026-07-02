-- ============================================================================
-- debug-auditoria-sidebar.sql
-- ============================================================================
-- Pegar este bloque en psql para ver, paso a paso, qué está pasando con
-- el módulo Auditoría en tu empresa.
-- ============================================================================

\echo '==[1] Módulos habilitados en la empresa del user=='
SELECT id, name, enabled_modules
  FROM companies
 WHERE id = 1;   -- ← ajustá al id de tu empresa
-- ¿La lista contiene 'auditoria'? Si no, el backfill no corrió.

\echo ''
\echo '==[2] Roles de la empresa: ¿supervisor tiene permiso?=='
SELECT key, permissions
  FROM company_roles
 WHERE company_id = 1
   AND key IN ('supervisor', 'operador', 'conductor', 'owner_empresa', 'admin_empresa');
-- ¿La columna permissions del supervisor tiene
--   "auditoria": { "auditoria": ["ver"] }
-- ? Si no, el backfill del rol no corrió.

\echo ''
\echo '==[3] Si los dos anteriores están OK pero el sidebar no muestra,=='
\echo '    el problema es el JWT cacheado. Forzá un nuevo login:=='
\echo '    DELETE FROM company_users WHERE id = <TU_USER_ID>;  (NO — eso borra el user)'
\echo '    La forma correcta es cerrar sesión y volver a entrar.=='
\echo '    En la próxima respuesta te muestro cómo decodificar el JWT actual.=='

\echo ''
\echo '==[4] Si el backfill no corrió, aplicá esto manualmente:=='
UPDATE companies
   SET enabled_modules = array_append(enabled_modules, 'auditoria')
 WHERE NOT ('auditoria' = ANY(enabled_modules));

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

\echo ''
\echo '==[5] Verificación post-backfill:=='
SELECT
  c.id  AS company_id,
  c.name,
  'auditoria' = ANY(c.enabled_modules) AS has_auditoria_in_company,
  (permissions #> '{auditoria,auditoria}' IS NOT NULL) AS supervisor_can_see
FROM companies c
LEFT JOIN company_roles r ON r.company_id = c.id AND r.key = 'supervisor'
WHERE c.id = 1;
