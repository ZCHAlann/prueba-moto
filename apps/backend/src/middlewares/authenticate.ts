import { Request, Response, NextFunction } from 'express';
import { verify } from 'jsonwebtoken';
import { UnauthorizedError } from '../lib/errors';

export const COOKIE_NAME = "aplismart_token";

// Tipo compartido con el frontend — estructura anidada de permisos
export type ActionKey    = "ver" | "crear" | "editar" | "eliminar";
export type PermissionMap = Record<string, Record<string, ActionKey[]>>;

export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  role: string;
  scope: 'operacion' | 'plataforma';
  companyId: number | null;
  companyModules: string[];
  modulePermissions: string[];  
  permissions: PermissionMap; 
  iat: number;
  exp: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  try {
    const token =
      req.cookies?.[COOKIE_NAME] ??
      req.headers.authorization?.replace("Bearer ", "");

    if (!token) throw new UnauthorizedError('Token no proporcionado');

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET no definida');

    req.user = verify(token, secret) as JwtPayload;
    next();
  } catch (error: any) {
    if (error instanceof UnauthorizedError) throw error;
    throw new UnauthorizedError(`Token inválido: ${error.message}`);
  }
};