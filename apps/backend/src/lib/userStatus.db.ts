/**
 * Wrappers con acceso a BD para el helper de estado efectivo.
 *
 * Separa la lógica pura (`userStatus.ts`) del I/O a Postgres para que
 * los tests unitarios no necesiten DATABASE_URL. La función pura
 * `isUserEffectivelyActive` se importa desde `userStatus.ts` — este
 * archivo solo agrega: query a BD + cache en memoria.
 */

import { db } from '../db/client';
import { companyDrivers, companySites } from '../db/schema/operational';
import { companies, companyUsers } from '../db/schema/platform';
import { and, eq } from 'drizzle-orm';
import {
  isUserEffectivelyActive,
  type InactiveReason,
} from './userStatus';

export interface UserEffectivelyActiveFromDb {
  userId:    number;
  companyId: number;
  companyStatus: string;
  userStatus:   string;
  driverStatus: string | null;
  siteStatus:   string | null;
  effectivelyActive: boolean;
  inactiveReason: InactiveReason;
}

export async function getUserEffectivelyActiveFromDb(
  userId: number,
  companyId: number,
): Promise<UserEffectivelyActiveFromDb | null> {
  // LEFT JOIN drivers con el WHERE sobre userId+companyId para limitar
  // a un único driver (en la práctica solo hay uno por user, pero por
  // defensa limit(1)). Incluimos `companies` para chequear el status
  // de la empresa (jul 2026 v6): si la empresa está inactiva /
  // suspendida, NINGÚN user puede operar.
  const rows = await db
    .select({
      userId:      companyUsers.id,
      companyId:   companyUsers.companyId,
      companyStatus: companies.status,
      userStatus:  companyUsers.status,
      driverStatus: companyDrivers.status,
      siteStatus:   companySites.status,
    })
    .from(companyUsers)
    .leftJoin(
      companies,
      eq(companies.id, companyUsers.companyId),
    )
    .leftJoin(
      companyDrivers,
      and(
        eq(companyDrivers.userId, companyUsers.id),
        eq(companyDrivers.companyId, companyUsers.companyId),
      ),
    )
    .leftJoin(
      companySites,
      eq(companySites.id, companyDrivers.siteId),
    )
    .where(and(
      eq(companyUsers.id, userId),
      eq(companyUsers.companyId, companyId),
    ))
    .limit(1);

  if (rows.length === 0) return null;
  const row = rows[0]!;

  const result = isUserEffectivelyActive({
    companyStatus: row.companyStatus,
    userStatus:   row.userStatus,
    driverStatus: row.driverStatus,
    siteStatus:   row.siteStatus,
  });

  return {
    userId:    row.userId,
    companyId: row.companyId,
    companyStatus: row.companyStatus,
    userStatus:   row.userStatus,
    driverStatus: row.driverStatus,
    siteStatus:   row.siteStatus,
    effectivelyActive: result.effectivelyActive,
    inactiveReason:    result.inactiveReason,
  };
}

// ─── Cache en memoria para que el middleware no pegue a BD en cada request ───
//
// Mismo patrón que `getAuthSettings()` en services/auth.service.ts.
// TTL corto (60s) para que un cambio de status se propague rápido pero
// sin saturar la BD en高峰期. Se invalida explícitamente cuando se cambia
// el status de un usuario/conductor/sede.

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  data: UserEffectivelyActiveFromDb;
  expiresAt: number;
}

const _cache = new Map<string, CacheEntry>();

function cacheKey(userId: number, companyId: number): string {
  return `${companyId}:${userId}`;
}

export async function getUserEffectivelyActiveCached(
  userId: number,
  companyId: number,
): Promise<UserEffectivelyActiveFromDb | null> {
  const key = cacheKey(userId, companyId);
  const now = Date.now();
  const hit = _cache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.data;
  }

  const fresh = await getUserEffectivelyActiveFromDb(userId, companyId);
  if (fresh) {
    _cache.set(key, { data: fresh, expiresAt: now + CACHE_TTL_MS });
  } else {
    _cache.delete(key);
  }
  return fresh;
}

/**
 * Invalidar el cache de un usuario. Llamar cuando:
 *  - se actualiza company_users.status
 *  - se actualiza company_drivers.status
 *  - se actualiza company_sites.status (afecta a todos los drivers
 *    de esa sede)
 */
export function invalidateUserStatusCache(
  userId: number,
  companyId: number,
): void {
  _cache.delete(cacheKey(userId, companyId));
}

/**
 * Invalidar masivamente por sede. Llamar cuando se cambia el status
 * de una sede (afecta a todos sus conductores).
 */
export function invalidateSiteStatusCache(_siteId: number): void {
  // En la implementación actual el cache es key por (user, company) y
  // no guarda el siteId, así que lo más simple y correcto es invalidar
  // TODO el cache. Es un Set chico (usuarios únicos activos) y la próxima
  // request lo regenera. Si el Set crece a >500 entradas en producción,
  // conviene cambiar a un Map<siteId, Set<userKey>> y borrar selectivo.
  _cache.clear();
}

/**
 * jul 2026 v6 — Invalidar el cache de TODOS los usuarios de una empresa.
 * Llamar cuando se cambia el `status` de la empresa (active → inactive /
 * suspended / trial), para que el middleware empiece a bloquear las
 * requests de esos usuarios en el próximo request, sin esperar al TTL
 * de 60s. Recorre el Map y borra todas las entradas con ese companyId.
 */
export function invalidateCompanyStatusCache(companyId: number): void {
  for (const [key, _entry] of _cache) {
    const [keyCompanyId] = key.split(':');
    if (keyCompanyId === String(companyId)) {
      _cache.delete(key);
    }
  }
}
