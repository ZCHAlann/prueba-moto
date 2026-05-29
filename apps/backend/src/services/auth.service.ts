import { hash, compare } from 'bcryptjs';
import { sign, verify } from 'jsonwebtoken';
import { JwtPayload } from '../middlewares/authenticate';

const SALT_ROUNDS = 10;

export const hashPassword = async (password: string): Promise<string> => {
  return hash(password, SALT_ROUNDS);
};

export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return compare(password, hash);
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
}

export const signToken = (payload: SignTokenParams): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET no definida');
  }

  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

  return sign(
    {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      scope: payload.scope,
      companyId: payload.companyId,
      companyModules: payload.companyModules,
      modulePermissions: payload.modulePermissions,
    },
    secret,
    { expiresIn },
  );
};

export const verifyToken = (token: string): JwtPayload => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET no definida');
  }

  return verify(token, secret) as JwtPayload;
};