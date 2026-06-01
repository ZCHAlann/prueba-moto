import { hash, compare } from 'bcryptjs';
import { sign, verify, type SignOptions } from 'jsonwebtoken';
import { JwtPayload, PermissionMap } from '../middlewares/authenticate';

const SALT_ROUNDS = 10;

export const hashPassword = async (password: string): Promise<string> => {
  return hash(password, SALT_ROUNDS);
};

export const verifyPassword = async (password: string, hashed: string): Promise<boolean> => {
  return compare(password, hashed);
};

interface SignTokenParams {
  sub: string;
  email: string;
  name: string;
  role: string;
  scope: 'operacion' | 'plataforma';
  companyId: number | null;
  companyModules: string[];
  modulePermissions: string[];
  permissions?: PermissionMap;
}

export const signToken = (payload: SignTokenParams): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET no definida');

  const options: SignOptions = {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as SignOptions['expiresIn'],
  };

  const tokenPayload = {
    sub:               payload.sub,
    email:             payload.email,
    name:              payload.name,
    role:              payload.role,
    scope:             payload.scope,
    companyId:         payload.companyId,
    companyModules:    payload.companyModules,
    modulePermissions: payload.modulePermissions,
    permissions:       payload.permissions ?? {},
  };

  return sign(tokenPayload, secret, options);
};

export const verifyToken = (token: string): JwtPayload => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET no definida');
  return verify(token, secret) as JwtPayload;
};