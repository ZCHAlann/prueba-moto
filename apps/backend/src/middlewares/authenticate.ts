import { Request, Response, NextFunction } from 'express';
import { verify } from 'jsonwebtoken';
import { UnauthorizedError } from '../lib/errors';

export const COOKIE_NAME = "aplismart_token";

export type CrudAction = "create" | "read" | "update" | "delete";
/**
 * Shape real de los permisos por usuario en el JWT:
 *   { [moduleKey]: { [submoduleKey]: ActionKey[] } }
 * Coincide con el shape que consume `usePermissions().can()` en el
 * frontend y con lo que vive en `company_roles.permissions` /
 * `company_users.module_permissions` (jsonb) en la DB.
 */
export type ModulePermissionMap = Record<string, Record<string, string[]>>;
export type PermissionMap = Record<string, unknown>;

export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  role: string;
  scope: 'operacion' | 'plataforma';
  companyId: number | null;
  companyModules: string[];
  modulePermissions: ModulePermissionMap;  // ← cambió de string[]
  permissions: PermissionMap;
  // jun 2026 — DNI del usuario. Se setea al firmar el token (login / refresh
  // / session) leyendo la columna `dni` de `company_users` o `platform_users`.
  // El frontend lo usa para autorrellenar la firma del responsable en
  // el acta PDF de asignaciones.
  dni?: string | null;
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