import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../lib/errors';

export const requireModule = (module: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      throw new ForbiddenError('No autenticado');
    }

    // Superadmin pasa siempre
    if (user.role === 'superadmin') {
      return next();
    }

    // La empresa debe tener el módulo contratado
    if (!user.companyModules.includes(module)) {
      throw new ForbiddenError(`El módulo '${module}' no está habilitado para esta empresa.`);
    }

    // Owner y admin de empresa pasan sin verificar permisos individuales
    const adminRoles = ['owner_empresa', 'admin_empresa'];
    if (adminRoles.includes(user.role)) {
      return next();
    }

    // El usuario específico debe tener permiso al módulo
    if (!user.modulePermissions.includes(module)) {
      throw new ForbiddenError(`Tu perfil no tiene acceso al módulo '${module}'.`);
    }

    next();
  };
};