import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../lib/errors';

export const requireSuperadmin = (req: Request, res: Response, next: NextFunction) => {
  const user = req.user;
  if (!user) {
    throw new ForbiddenError('No autenticado');
  }

  if (user.role !== 'superadmin') {
    throw new ForbiddenError('Solo superadmin puede acceder aquí');
  }

  next();
};