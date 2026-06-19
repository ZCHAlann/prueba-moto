import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../lib/errors';

const BYPASS_ROLES = ['superadmin', 'owner_empresa', 'admin_empresa'] as const;

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
  action: "ver" | "crear" | "editar" | "eliminar",
) => (req: Request, _res: Response, next: NextFunction): void => {
  const user = req.user;

  if (!user) {
    throw new ForbiddenError('No autenticado');
  }

  if ((BYPASS_ROLES as readonly string[]).includes(user.role)) {
    return next();
  }

  const perms = (user.modulePermissions as unknown as Record<string, Record<string, string[]>>) ?? {};
  const actions = perms[module]?.[submodule] ?? [];

  if (!actions.includes(action)) {
    throw new ForbiddenError(
      `Sin permiso para '${action}' en '${module}/${submodule}'`,
    );
  }

  next();
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
  action: "ver" | "crear" | "editar" | "eliminar",
) => (req: Request, _res: Response, next: NextFunction): void => {
  const user = req.user;

  if (!user) {
    throw new ForbiddenError('No autenticado');
  }

  if ((BYPASS_ROLES as readonly string[]).includes(user.role)) {
    return next();
  }

  const perms = (user.modulePermissions as unknown as Record<string, Record<string, string[]>>) ?? {};
  for (const { module, submodule } of entries) {
    const actions = perms[module]?.[submodule] ?? [];
    if (actions.includes(action)) return next();
  }

  throw new ForbiddenError(
    `Sin permiso para '${action}' en los módulos requeridos.`,
  );
};