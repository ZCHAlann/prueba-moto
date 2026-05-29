import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../lib/errors';

declare global {
  namespace Express {
    interface Request {
      companyId?: number;
    }
  }
}

export const requireCompany = (req: Request, res: Response, next: NextFunction) => {
  const user = req.user;
  if (!user) {
    throw new ForbiddenError('No autenticado');
  }

  const companyIdParam = parseInt(req.params.id, 10);
  if (isNaN(companyIdParam)) {
    throw new ForbiddenError('ID de empresa inválido');
  }

  // Superadmin accede a cualquier empresa
  if (user.role === 'superadmin') {
    req.companyId = companyIdParam;
    return next();
  }

  // Otros usuarios solo ven su propia empresa
  if (user.companyId !== companyIdParam) {
    throw new ForbiddenError('No tienes acceso a esta empresa');
  }

  req.companyId = companyIdParam;
  next();
};