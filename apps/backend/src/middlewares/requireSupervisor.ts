import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../lib/errors';

export const requireSupervisor = (req: Request, res: Response, next: NextFunction) => {
  const user = req.user;
  if (!user) {
    throw new ForbiddenError('No autenticado');
  }

  const allowedRoles = ['owner_empresa', 'admin_empresa', 'supervisor', 'superadmin'];
  if (!allowedRoles.includes(user.role)) {
    throw new ForbiddenError('Solo supervisor o superior puede acceder aquí');
  }

  next();
};