import { hash, compare } from 'bcryptjs';
import { sign, verify, type SignOptions } from 'jsonwebtoken';
import { JwtPayload, PermissionMap } from '../middlewares/authenticate';
import { db } from '../db/client';
import { platformSettings } from '../db/schema/platform';
import { eq } from 'drizzle-orm';

const SALT_ROUNDS = 10;

export const hashPassword = async (password: string): Promise<string> => {
  return hash(password, SALT_ROUNDS);
};

export const verifyPassword = async (password: string, hashed: string): Promise<boolean> => {
  return compare(password, hashed);
};

// ─── Cache ligero para no hacer query en cada request ────────────────────────
let _settingsCache: { sessionExpiryHours: number } | null = null;
let _settingsCacheAt = 0;
const CACHE_TTL_MS = 60_000; // 1 minuto

export async function getAuthSettings() {
  const now = Date.now();
  if (_settingsCache && now - _settingsCacheAt < CACHE_TTL_MS) {
    return _settingsCache;
  }
  const [row] = await db
    .select({ sessionExpiryHours: platformSettings.sessionExpiryHours })
    .from(platformSettings)
    .where(eq(platformSettings.id, 1))
    .limit(1);

  _settingsCache = { sessionExpiryHours: row?.sessionExpiryHours ?? 24 };
  _settingsCacheAt = now;
  return _settingsCache;
}

// Llámalo cuando settings cambie para forzar re-lectura
export function invalidateSettingsCache() {
  _settingsCache = null;
}

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

export const signToken = async (payload: SignTokenParams): Promise<string> => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET no definida');

  // Leer sessionExpiryHours de DB (con cache)
  const { sessionExpiryHours } = await getAuthSettings();

  const options: SignOptions = {
    expiresIn: `${sessionExpiryHours}h`,
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