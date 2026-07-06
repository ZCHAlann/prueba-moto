import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../lib/errors';

/**
 * Igual que requireSupervisor pero también permite a roles operativos
 * (operador, conductor) crear/leer sus propias alertas.
 *
 * Usado SOLO en el módulo `alertas`. Otros módulos que necesitan
 * supervisor+ estricto deben seguir usando `requireSupervisor`.
 */
export const requireSupervisorOrOperator = (req: Request, res: Response, next: NextFunction) => {
  const user = req.user;
  if (!user) {
    throw new ForbiddenError('No autenticado');
  }

  const allowedRoles = [
    'owner_empresa',
    'admin_empresa',
    'supervisor',
    'superadmin',
    // Roles operativos pueden crear/leer sus propias alertas (los admins las
    // reciben vía notifyAdmins).
    'operador',
    'conductor',
  ];
  if (!allowedRoles.includes(user.role)) {
    throw new ForbiddenError('No tenés permiso para acceder a este módulo de alertas.');
  }

  next();
};
