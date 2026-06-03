import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../db/client';
import { platformUsers, companyUsers, platformSettings } from '../db/schema';
import { eq } from 'drizzle-orm';
import { validate } from '../lib/validate';
import { hashPassword, verifyPassword, signToken } from '../services/auth.service';
import { UnauthorizedError, AppError } from '../lib/errors';
import { toId } from '../lib/ids';
import { authenticate, COOKIE_NAME, PermissionMap } from '../middlewares/authenticate';

const router = Router();

interface TokenPayload {
  sub:               string;
  email:             string;
  name:              string;
  role:              string;
  scope:             'operacion' | 'plataforma';
  companyId:         number | null;
  companyModules:    string[];
  modulePermissions: string[];
  permissions:       PermissionMap;
}

const loginSchema = z.object({
  login:    z.string().min(1, 'Email o username requerido'),
  password: z.string().min(1, 'Password requerido'),
  scope:    z.enum(['operacion', 'plataforma']),
});

const sessionSchema = z.object({
  email: z.string().email('Email inválido'),
  scope: z.enum(['operacion', 'plataforma']),
});

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure:   process.env.NODE_ENV === "production",
  path:     "/",
};

// ─── Helper: leer settings de plataforma ─────────────────────────────────────

async function getLoginSettings() {
  const [s] = await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.id, 1))
    .limit(1);
  return {
    maxLoginAttempts: s?.maxLoginAttempts ?? 5,
    lockoutMinutes:   s?.lockoutMinutes   ?? 30,
  };
}

// ─── Helper: aplicar lógica de lockout ───────────────────────────────────────

async function handleFailedLogin(
  table: typeof platformUsers | typeof companyUsers,
  userId: number,
  maxAttempts: number,
  lockoutMinutes: number,
) {
  const [current] = await db
    .select({ failedLoginAttempts: table.failedLoginAttempts })
    .from(table)
    .where(eq(table.id, userId))
    .limit(1);

  const attempts = (current?.failedLoginAttempts ?? 0) + 1;
  const patch: Record<string, unknown> = { failedLoginAttempts: attempts };

  if (attempts >= maxAttempts) {
    patch.lockedUntil           = new Date(Date.now() + lockoutMinutes * 60_000);
    patch.failedLoginAttempts   = 0;
  }

  await db.update(table).set(patch).where(eq(table.id, userId));
}

async function clearFailedLogin(
  table: typeof platformUsers | typeof companyUsers,
  userId: number,
) {
  await db
    .update(table)
    .set({ failedLoginAttempts: 0, lockedUntil: null })
    .where(eq(table.id, userId));
}

// ─── POST /auth/login ─────────────────────────────────────────────────────────

router.post("/login", validate(loginSchema), async (req, res, next) => {
  try {
    const { login, password, scope } = req.body;
    const { maxLoginAttempts, lockoutMinutes } = await getLoginSettings();

    let tokenPayload: TokenPayload;
    let userOut: Record<string, unknown>;

    if (scope === "plataforma") {
      const user = await db.query.platformUsers.findFirst({
        where: (f, { or, eq }) => or(eq(f.email, login), eq(f.username, login)),
      });
      if (!user) throw new UnauthorizedError("Credenciales inválidas");

      // ── Verificar bloqueo ─────────────────────────────────────────────────
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
        return res.status(423).json({
          message: `Cuenta bloqueada. Intenta en ${mins} minuto${mins !== 1 ? 's' : ''}.`,
        });
      }

      // ── Verificar contraseña ──────────────────────────────────────────────
      if (!(await verifyPassword(password, user.passwordHash))) {
        await handleFailedLogin(platformUsers, user.id, maxLoginAttempts, lockoutMinutes);
        throw new UnauthorizedError("Credenciales inválidas");
      }

      // ── Login exitoso ─────────────────────────────────────────────────────
      await clearFailedLogin(platformUsers, user.id);

      tokenPayload = {
        sub:               toId("platform-user", user.id.toString()),
        email:             user.email,
        name:              user.username,
        role:              user.role,
        scope:             "plataforma",
        companyId:         null,
        companyModules:    [],
        modulePermissions: [],
        permissions:       {},
      };
      userOut = {
        id:                tokenPayload.sub,
        email:             user.email,
        name:              user.username,
        role:              user.role,
        scope:             "plataforma",
        companyId:         null,
        modulePermissions: [],
        permissions:       {},
      };

    } else {
      const user = await db.query.companyUsers.findFirst({
        where: (f, { or, eq }) => or(eq(f.email, login), eq(f.username, login)),
        with: { company: true },
      });
      if (!user) throw new UnauthorizedError("Credenciales inválidas");

      // ── Verificar bloqueo ─────────────────────────────────────────────────
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
        return res.status(423).json({
          message: `Cuenta bloqueada. Intenta en ${mins} minuto${mins !== 1 ? 's' : ''}.`,
        });
      }

      // ── Verificar contraseña ──────────────────────────────────────────────
      if (!(await verifyPassword(password, user.passwordHash))) {
        await handleFailedLogin(companyUsers, user.id, maxLoginAttempts, lockoutMinutes);
        throw new UnauthorizedError("Credenciales inválidas");
      }

      // ── Login exitoso ─────────────────────────────────────────────────────
      await clearFailedLogin(companyUsers, user.id);

      const profileData       = user.profileData as Record<string, unknown>;
      const modulePermissions = (profileData?.modulePermissions as string[]) ?? [];
      const permissions       = (profileData?.permissions as PermissionMap) ?? {};
      const companyModules    = user.company?.enabledModules ?? [];

      tokenPayload = {
        sub:               toId("company-user", user.id.toString()),
        email:             user.email,
        name:              user.username,
        role:              user.role,
        scope:             "operacion",
        companyId:         Number(user.companyId),
        companyModules,
        modulePermissions,
        permissions,
      };
      userOut = {
        id:                tokenPayload.sub,
        email:             user.email,
        name:              user.username,
        role:              user.role,
        scope:             "operacion",
        companyId:         Number(user.companyId),
        modulePermissions,
        permissions,
      };
    }

    const token  = await signToken(tokenPayload);
    const maxAge = req.body.remember ? 60 * 60 * 24 * 7 : undefined;

    res.cookie(COOKIE_NAME, token, { ...COOKIE_OPTS, maxAge });
    return res.json(userOut);
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/session ───────────────────────────────────────────────────────

router.post('/session', validate(sessionSchema), async (req, res, next) => {
  try {
    const { email, scope } = req.body;

    if (scope === 'plataforma') {
      const user = await db.query.platformUsers.findFirst({
        where: eq(platformUsers.email, email),
      });
      if (!user) throw new UnauthorizedError('Usuario no encontrado');

      const token = await signToken({
        sub:               toId('platform-user', user.id.toString()),
        email:             user.email,
        name:              user.username,
        role:              user.role,
        scope:             'plataforma',
        companyId:         null,
        companyModules:    [],
        modulePermissions: [],
      });

      return res.json({
        token,
        user: {
          id:       toId('platform-user', user.id.toString()),
          email:    user.email,
          username: user.username,
          role:     user.role,
          scope:    'plataforma',
        },
      });

    } else {
      const user = await db.query.companyUsers.findFirst({
        where: eq(companyUsers.email, email),
        with:  { company: true },
      });
      if (!user) throw new UnauthorizedError('Usuario no encontrado');

      const profileData       = user.profileData as Record<string, unknown>;
      const modulePermissions = (profileData?.modulePermissions as string[]) ?? [];
      const permissions       = (profileData?.permissions as PermissionMap) ?? {};
      const companyModules    = user.company?.enabledModules ?? [];

      const token = await signToken({
        sub:               toId('company-user', user.id.toString()),
        email:             user.email,
        name:              user.username,
        role:              user.role,
        scope:             'operacion',
        companyId:         Number(user.companyId),
        companyModules,
        modulePermissions,
        permissions,
      });

      return res.json({
        token,
        user: {
          id:        toId('company-user', user.id.toString()),
          email:     user.email,
          username:  user.username,
          role:      user.role,
          scope:     'operacion',
          companyId: Number(user.companyId),
        },
      });
    }
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/refresh ───────────────────────────────────────────────────────

router.post('/refresh', authenticate, async (req, res, next) => {
  try {
    const user = req.user!;

    const token = await signToken({
      sub:               user.sub,
      email:             user.email,
      name:              user.name,
      role:              user.role,
      scope:             user.scope,
      companyId:         user.companyId,
      companyModules:    user.companyModules,
      modulePermissions: user.modulePermissions,
      permissions:       user.permissions ?? {},
    });

    return res.json({ token });
  } catch (err) {
    next(err);
  }
});

// ─── GET /auth/session ────────────────────────────────────────────────────────

router.get("/session", authenticate, (req, res) => {
  const user = req.user!;
  return res.json({
    id:                user.sub,
    email:             user.email,
    name:              user.name,
    role:              user.role,
    scope:             user.scope,
    companyId:         user.companyId ? String(user.companyId) : null,
    modulePermissions: user.modulePermissions ?? [],
    permissions:       user.permissions ?? {},
  });
});

// ─── POST /auth/logout ────────────────────────────────────────────────────────

router.post("/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  return res.json({ ok: true });
});

export default router;