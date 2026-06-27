import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../lib/errors';

/**
 * Restringe el acceso EXCLUSIVAMENTE a roles administrativos de empresa:
 *   - owner_empresa
 *   - admin_empresa
 *
 * NO deja pasar a supervisor (es un rol operativo), ni a superadmin
 * (es de plataforma, no de empresa). Esto sigue la Parte III sección 31
 * que define estos dos roles como los únicos permitidos para el asistente.
 */
export const requireAdminOwner = (req: Request, _res: Response, next: NextFunction) => {
  const user = req.user;
  if (!user) throw new ForbiddenError('No autenticado');

  const allowedRoles = ['owner_empresa', 'admin_empresa'];
  if (!allowedRoles.includes(user.role)) {
    throw new ForbiddenError(
      'Solo administradores de empresa pueden usar el asistente IA.',
    );
  }
  next();
};