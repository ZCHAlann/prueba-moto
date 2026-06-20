-- Backfill: para cada driver vinculado a un user, copiar firstName/lastName/phone
-- desde company_users.profileData. La fila vacía que dejó el bug del sync se va
-- a llenar.
--
-- Caso especial: el form de Accesos/Usuarios a veces solo manda `fullName`
-- (un solo string con nombres+apellidos). En ese caso partimos `fullName`
-- en firstName (primer token) + lastName (resto) para no quedarnos sin
-- el nombre del conductor.
--
-- Después de correr este script, la app ya puede hacer la sincronización
-- por sí sola (syncDriverWithUser + el JOIN en GET /drivers).

UPDATE company_drivers d
SET
  -- Si hay firstName en profile, usarlo. Si no, partir fullName.
  firstName = COALESCE(
    NULLIF(TRIM(COALESCE(u.profileData->>'firstName', '')), ''),
    CASE
      WHEN COALESCE(TRIM(u.profileData->>'fullName'), '') <> ''
        AND COALESCE(TRIM(u.profileData->>'firstName'), '') = ''
        AND COALESCE(TRIM(u.profileData->>'lastName'), '') = ''
      THEN SPLIT_PART(TRIM(u.profileData->>'fullName'), ' ', 1)
      ELSE NULL
    END,
    d.firstName
  ),
  lastName  = COALESCE(
    NULLIF(TRIM(COALESCE(u.profileData->>'lastName', '')), ''),
    CASE
      WHEN COALESCE(TRIM(u.profileData->>'fullName'), '') <> ''
        AND COALESCE(TRIM(u.profileData->>'firstName'), '') = ''
        AND COALESCE(TRIM(u.profileData->>'lastName'), '') = ''
      THEN SUBSTRING(
             TRIM(u.profileData->>'fullName')
             FROM POSITION(' ' IN TRIM(u.profileData->>'fullName')) + 1
           )
      ELSE NULL
    END,
    d.lastName
  ),
  phone     = COALESCE(NULLIF(TRIM(COALESCE(u.profileData->>'phone', '')), ''), d.phone),
  email     = COALESCE(u.email, d.email),
  photoUrl  = COALESCE(u.photoUrl, d.photoUrl),
  siteId    = CASE
               WHEN (u.profileData->>'siteId') ~ '^[0-9]+$'
                 THEN (u.profileData->>'siteId')::int
               ELSE d.siteId
             END,
  updatedAt = NOW()
FROM company_users u
WHERE d.user_id = u.id
  AND d.company_id = u.company_id
  AND d.user_id IS NOT NULL;

-- Además, normalizar el profileData de los users que tengan `fullName` pero
-- no `firstName`/`lastName` — así el endpoint ya devuelve los datos partidos
-- y futuras ediciones parten del lugar correcto.
UPDATE company_users
SET profile_data = jsonb_set(
                     jsonb_set(
                       profile_data,
                       '{firstName}',
                       to_jsonb(SPLIT_PART(TRIM(profile_data->>'fullName'), ' ', 1))
                     ),
                     '{lastName}',
                     to_jsonb(
                       CASE
                         WHEN POSITION(' ' IN TRIM(profile_data->>'fullName')) > 0
                         THEN SUBSTRING(
                                TRIM(profile_data->>'fullName')
                                FROM POSITION(' ' IN TRIM(profile_data->>'fullName')) + 1
                              )
                         ELSE ''
                       END
                     )
                   )
WHERE COALESCE(TRIM(profile_data->>'fullName'), '') <> ''
  AND COALESCE(TRIM(profile_data->>'firstName'), '') = ''
  AND COALESCE(TRIM(profile_data->>'lastName'),  '') = '';
