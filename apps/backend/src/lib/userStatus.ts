/**
 * Helper de estado efectivo de un usuario/conductor.
 *
 * Reglas:
 *  - `userStatus` y `driverStatus` son los estados manuales almacenados
 *    en BD. NO se tocan automáticamente.
 *  - `siteStatus` es el estado de la sede a la que pertenece el conductor.
 *    Si el conductor no tiene sede, se considera "OK" (no bloquea).
 *  - `effectivelyActive` = (userStatus === 'active')
 *                          && (driverStatus == null || driverStatus === 'Activo')
 *                          && (siteStatus   == null || siteStatus   === 'Activa')
 *
 * Si el usuario no es conductor (no hay fila en `company_drivers`),
 * solo aplican las reglas de `userStatus` y `siteStatus` propio (si lo
 * tuviere). Por ahora la tabla `company_users` no tiene `siteId` propio,
 * así que para usuarios no-conductores basta con `userStatus === 'active'`.
 *
 * Devuelve también el `inactiveReason` para que el frontend distinga
 * visualmente "inactivo manual" de "inactivo por sede".
 *
 * NOTA: este archivo es LÓGICA PURA. NO importa `db`. La versión con
 * acceso a BD vive en `userStatus.db.ts` para no contaminar los tests
 * unitarios con dependencias de Postgres.
 */

export type InactiveReason =
  | 'company_inactive'   // companies.status !== 'active'   (jul 2026 v6)
  | 'user_inactive'      // companyUsers.status !== 'active'
  | 'driver_inactive'    // companyDrivers.status !== 'Activo'
  | 'site_inactive'      // companySites.status !== 'Activa'
  | null;

// Literales de status. Aislados acá para que cualquier cambio futuro
// (por ejemplo, normalizar todo a inglés) sea de un solo punto.
export const USER_STATUS_ACTIVE = 'active';
export const DRIVER_STATUS_ACTIVE = 'Activo';
export const SITE_STATUS_ACTIVE = 'Activa';

export interface UserEffectivelyActiveInput {
  /** `companies.status` (inglés). jul 2026 v6. */
  companyStatus: string | null | undefined;
  /** `company_users.status` (inglés) */
  userStatus: string | null | undefined;
  /** `company_drivers.status` (español con tilde). `null` si el user no es conductor. */
  driverStatus: string | null | undefined;
  /** `company_sites.status` (español con tilde). `null` si el conductor no tiene sede. */
  siteStatus: string | null | undefined;
}

export interface UserEffectivelyActiveResult {
  effectivelyActive: boolean;
  inactiveReason: InactiveReason;
}

/**
 * Normaliza un valor de status a `string | null`.
 * - `null` / `undefined` / `''` (string vacío) → `null` = "ausente / sin valor"
 * - Cualquier otro string (incluido espacios) → se respeta tal cual
 *   para que un valor raro del tipo " Inactiva " (con espacios) sí
 *   dispare el bloqueo. Eso es defensa contra data sucia.
 */
function norm(v: string | null | undefined): string | null {
  if (v == null) return null;
  if (typeof v !== 'string') return null;
  if (v.length === 0) return null;
  return v;
}

export function isUserEffectivelyActive(
  input: UserEffectivelyActiveInput,
): UserEffectivelyActiveResult {
  const companyStatus = norm(input.companyStatus);
  const userStatus    = norm(input.userStatus);
  const driverStatus  = norm(input.driverStatus);
  const siteStatus    = norm(input.siteStatus);

  // 0) jul 2026 v6 — Empresa activa es la primera condición. Si la
  // empresa está inactiva / suspendida / en trial vencido, NINGÚN user
  // de esa empresa puede operar (login, API calls, todo).
  if (companyStatus !== null && companyStatus !== USER_STATUS_ACTIVE) {
    return { effectivelyActive: false, inactiveReason: 'company_inactive' };
  }

  // 1) Usuario activo (regla universal — aplica a TODOS)
  if (userStatus !== USER_STATUS_ACTIVE) {
    return { effectivelyActive: false, inactiveReason: 'user_inactive' };
  }

  // 2) Si es conductor, su driver.status debe ser 'Activo'
  if (driverStatus != null && driverStatus !== DRIVER_STATUS_ACTIVE) {
    return { effectivelyActive: false, inactiveReason: 'driver_inactive' };
  }

  // 3) Si tiene sede asignada, su site.status debe ser 'Activa'
  if (siteStatus != null && siteStatus !== SITE_STATUS_ACTIVE) {
    return { effectivelyActive: false, inactiveReason: 'site_inactive' };
  }

  return { effectivelyActive: true, inactiveReason: null };
}

/**
 * Mensaje legible para mostrar al usuario en login/401.
 * Prioriza el motivo "más cercano al usuario" — manual sobre cascada.
 */
export function getInactiveMessage(reason: InactiveReason): string {
  switch (reason) {
    case 'company_inactive':
      return 'Tu empresa está inactiva o suspendida. Contacta al administrador de la plataforma.';
    case 'user_inactive':
      return 'Tu cuenta está inactiva. Contacta a tu administrador.';
    case 'driver_inactive':
      return 'Tu cuenta de conductor está inactiva. Contacta a tu administrador.';
    case 'site_inactive':
      return 'La sede a la que perteneces está inactiva. Contacta a tu administrador.';
    case null:
    default:
      return 'Cuenta inactiva.';
  }
}

/**
 * Código de error estructurado para que el frontend pueda distinguir
 * los casos sin parsear strings.
 */
export function getInactiveCode(
  reason: InactiveReason,
): 'COMPANY_INACTIVE' | 'USER_INACTIVE' | 'DRIVER_INACTIVE' | 'SITE_INACTIVE' | null {
  switch (reason) {
    case 'company_inactive':
      return 'COMPANY_INACTIVE';
    case 'user_inactive':
      return 'USER_INACTIVE';
    case 'driver_inactive':
      return 'DRIVER_INACTIVE';
    case 'site_inactive':
      return 'SITE_INACTIVE';
    default:
      return null;
  }
}
