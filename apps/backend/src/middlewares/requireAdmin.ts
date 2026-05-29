import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../lib/errors';

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  const user = req.user;
  if (!user) {
    throw new ForbiddenError('No autenticado');
  }

  const adminRoles = ['owner_empresa', 'admin_empresa', 'superadmin'];
  if (!adminRoles.includes(user.role)) {
    throw new ForbiddenError('Solo admin de empresa puede acceder aquí');
  }

  next();
};