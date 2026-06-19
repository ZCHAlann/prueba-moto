import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../lib/errors';

export const requireModule = (module: string, submodule?: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      throw new ForbiddenError('No autenticado');
    }

    if (user.role === 'superadmin') return next();

    if (!user.companyModules.includes(module)) {
      throw new ForbiddenError(`El módulo '${module}' no está habilitado para esta empresa.`);
    }

    const adminRoles = ['owner_empresa', 'admin_empresa'];
    if (adminRoles.includes(user.role)) return next();

    // modulePermissions es un objeto: { ac: { lista_ac: ["ver", "crear"] }, ... }
    const perms = user.modulePermissions;

    // Verificar que sea un objeto válido
    if (!perms || typeof perms !== 'object' || Array.isArray(perms)) {
      throw new ForbiddenError(`Tu perfil no tiene acceso al módulo '${module}'.`);
    }

    const modulePerms = perms[module];

    // El módulo no existe en sus permisos
    if (!modulePerms || typeof modulePerms !== 'object') {
      throw new ForbiddenError(`Tu perfil no tiene acceso al módulo '${module}'.`);
    }

    // Si se especifica submodulo, verificar que tenga al menos "ver"
    if (submodule) {
      const subPerms: string[] = modulePerms[submodule] ?? [];
      if (!subPerms.includes('ver')) {
        throw new ForbiddenError(`Tu perfil no tiene acceso a '${module}/${submodule}'.`);
      }
      return next();
    }

    // Sin submodulo: basta con que el módulo tenga algún submodulo con permisos
    const hasAnyAccess = Object.values(modulePerms).some(
      (actions) => Array.isArray(actions) && actions.length > 0
    );

    if (!hasAnyAccess) {
      throw new ForbiddenError(`Tu perfil no tiene acceso al módulo '${module}'.`);
    }

    next();
  };
};

/**
 * Variante de `requireModule` que acepta uno de varios módulos como válido.
 * Útil cuando un endpoint sirve a varios módulos (ej: el listado de activos
 * lo usan tanto `gestion.flotas` como `mantenimiento.execution` para
 * elegir vehículo en el form de mantenimiento).
 *
 * Si el usuario es admin_empresa/owner_empresa/superadmin, pasa siempre.
 * Si no, requiere que tenga al menos un módulo con submódulo "ver" en
 * CUALQUIERA de los `modules` especificados.
 *
 * Uso:
 *   requireModuleAny(['gestion:flotas', 'mantenimiento:execution'])
 *   // → pasa si el user tiene ver en gestion.flotas O en mantenimiento.execution
 */
export const requireModuleAny = (
  entries: Array<{ module: string; submodule?: string }>,
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      throw new ForbiddenError('No autenticado');
    }

    if (user.role === 'superadmin') return next();

    const adminRoles = ['owner_empresa', 'admin_empresa'];
    if (adminRoles.includes(user.role)) return next();

    const perms = user.modulePermissions as Record<string, Record<string, string[]>> | undefined;
    if (!perms || typeof perms !== 'object' || Array.isArray(perms)) {
      throw new ForbiddenError('Tu perfil no tiene acceso a este recurso.');
    }

    for (const { module, submodule } of entries) {
      if (!user.companyModules.includes(module)) continue;

      const modulePerms = perms[module];
      if (!modulePerms || typeof modulePerms !== 'object') continue;

      if (submodule) {
        const subPerms: string[] = (modulePerms as Record<string, string[]>)[submodule] ?? [];
        if (subPerms.includes('ver')) return next();
      } else {
        const hasAny = Object.values(modulePerms).some(
          (actions) => Array.isArray(actions) && actions.length > 0,
        );
        if (hasAny) return next();
      }
    }

    throw new ForbiddenError('Tu perfil no tiene acceso a este recurso.');
  };
};