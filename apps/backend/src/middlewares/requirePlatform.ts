import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../lib/errors';

const PLATFORM_ROLES = ['superadmin', 'admin_saas', 'comercial', 'soporte'];

export const requirePlatform = (req: Request, res: Response, next: NextFunction) => {
  const user = req.user;
  if (!user) {
    throw new ForbiddenError('No autenticado');
  }

  if (user.scope !== 'plataforma') {
    throw new ForbiddenError('Este endpoint es solo para usuarios de plataforma');
  }

  if (!PLATFORM_ROLES.includes(user.role)) {
    throw new ForbiddenError(`Role '${user.role}' no tiene acceso a plataforma`);
  }

  next();
};