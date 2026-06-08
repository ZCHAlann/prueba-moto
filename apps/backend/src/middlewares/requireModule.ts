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