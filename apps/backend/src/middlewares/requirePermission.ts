import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../lib/errors';

const BYPASS_ROLES = ['superadmin', 'owner_empresa', 'admin_empresa'] as const;

/**
 * Compat shim: módulos que vivían como submódulo de otro y se migraron a
 * top-level. El shim consulta primero el path nuevo y, si no encuentra
 * la acción, intenta el path viejo.
 *
 *  - `lienzo.lienzo.*`  → fallback a `reportes.lienzo.*`  (jun 2026)
 *  - `accesos.usuarios` → fallback a `accesos.accesos.*` (jun 2026)
 *  - `accesos.roles`    → fallback a `accesos.accesos.*` (jun 2026)
 *  - `gestion.proveedores` → fallback a `gestion.suppliers` (jun 2026)
 *  - `gestion.talleres`    → fallback a `gestion.workshops` (jun 2026)
 *
 * Si en el futuro se migra otro módulo, agregar acá.
 */
const LEGACY_FALLBACK: Record<string, Record<string, string>> = {
  lienzo:  { lienzo:  "reportes.lienzo" },
  accesos: {
    usuarios: "accesos.accesos",
    roles:    "accesos.accesos",
  },
  gestion: {
    proveedores: "gestion.suppliers",
    talleres:    "gestion.workshops",
  },
};

function resolveModuleSub(
  module: string,
  submodule: string,
): Array<{ module: string; submodule: string }> {
  const primary = [{ module, submodule }];
  const fallback = LEGACY_FALLBACK[module]?.[submodule];
  if (fallback) {
    const [m2, s2] = fallback.split(".");
    if (m2 && s2) primary.push({ module: m2, submodule: s2 });
  }
  return primary;
}

/**
 * Middleware granular de permisos por submódulo.
 *
 * Uso: requirePermission('gestion', 'flotas', 'eliminar')
 *
 * - superadmin, owner_empresa y admin_empresa pasan siempre
 * - El resto necesita que su modulePermissions[module][submodule] incluya la acción
 * - Si el usuario no tiene modulePermissions (token antiguo), se deniega
 */
export const requirePermission = (
  module: string,
  submodule: string,
  // jul 2026 v5 — Aceptamos cualquier string. La validación real es
  // contra `user.modulePermissions[module][submodule]` (un array de
  // strings). Los actions legacy (ver/crear/editar/eliminar/aprobar/
  // reponer) más los nuevos (ver_solicitudes, ver_vales, …,
  // revisar_facturas, etc.) viven en module-tree.ts del frontend y
  // en user.ts del backend. Typear como string evita acoplar el
  // middleware a la lista.
  action: string,
) => (req: Request, _res: Response, next: NextFunction): void => {
  const user = req.user;

  if (!user) {
    throw new ForbiddenError('No autenticado');
  }

  if ((BYPASS_ROLES as readonly string[]).includes(user.role)) {
    return next();
  }

  const perms = (user.modulePermissions as unknown as Record<string, Record<string, string[]>>) ?? {};

  for (const { module: m, submodule: s } of resolveModuleSub(module, submodule)) {
    const actions = perms[m]?.[s] ?? [];
    if (actions.includes(action)) return next();
  }

  throw new ForbiddenError(
    `Sin permiso para '${action}' en '${module}/${submodule}'`,
  );
};

/**
 * Variante "any" de requirePermission: pasa si el usuario tiene la acción
 * solicitada en CUALQUIERA de los pares módulo/submódulo provistos.
 *
 * Uso:
 *   requirePermissionAny([
 *     { module: 'gestion',     submodule: 'workshops' },
 *     { module: 'mantenimiento', submodule: 'execution' },
 *   ], 'ver')
 */
export const requirePermissionAny = (
  entries: Array<{ module: string; submodule: string }>,
  action: string,
) => (req: Request, _res: Response, next: NextFunction): void => {
  const user = req.user;

  if (!user) {
    throw new ForbiddenError('No autenticado');
  }

  if ((BYPASS_ROLES as readonly string[]).includes(user.role)) {
    return next();
  }

  const perms = (user.modulePermissions as unknown as Record<string, Record<string, string[]>>) ?? {};

  // Expandimos cada entry con su fallback antes de iterar.
  const expanded: Array<{ module: string; submodule: string }> = [];
  for (const e of entries) {
    for (const r of resolveModuleSub(e.module, e.submodule)) expanded.push(r);
  }
  for (const { module: m, submodule: s } of expanded) {
    const actions = perms[m]?.[s] ?? [];
    if (actions.includes(action)) return next();
  }

  throw new ForbiddenError(
    `Sin permiso para '${action}' en los módulos requeridos.`,
  );
};