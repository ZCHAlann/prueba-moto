import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../db/client';
import { platformUsers, companyUsers } from '../db/schema';
import { eq } from 'drizzle-orm';
import { validate } from '../lib/validate';
import { hashPassword, verifyPassword, signToken } from '../services/auth.service';
import { UnauthorizedError, AppError } from '../lib/errors';
import { toId } from '../lib/ids';
import { authenticate, COOKIE_NAME, PermissionMap } from '../middlewares/authenticate';

const router = Router();

// Schemas

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
  login: z.string().min(1, 'Email o username requerido'),
  password: z.string().min(1, 'Password requerido'),
  scope: z.enum(['operacion', 'plataforma']),
});

const sessionSchema = z.object({
  email: z.string().email('Email inválido'),
  scope: z.enum(['operacion', 'plataforma']),
});


const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

// POST /auth/login — ahora setea cookie httpOnly
router.post("/login", validate(loginSchema), async (req, res, next) => {
  try {
    const { login, password, scope } = req.body;
    let tokenPayload: TokenPayload;
    let userOut: Record<string, unknown>;

    if (scope === "plataforma") {
      const user = await db.query.platformUsers.findFirst({
        where: (f, { or, eq }) => or(eq(f.email, login), eq(f.username, login)),
      });
      if (!user) throw new UnauthorizedError("Credenciales inválidas");
      if (!(await verifyPassword(password, user.passwordHash)))
        throw new UnauthorizedError("Credenciales inválidas");

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
      if (!(await verifyPassword(password, user.passwordHash)))
        throw new UnauthorizedError("Credenciales inválidas");

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

    const token  = signToken(tokenPayload);
    const maxAge = req.body.remember ? 60 * 60 * 24 * 7 : undefined;

    res.cookie(COOKIE_NAME, token, { ...COOKIE_OPTS, maxAge });
    return res.json(userOut);
  } catch (err) {
    next(err);
  }
});

// POST /auth/session — para SSR (sin validar password, solo email)
router.post(
  '/session',
  validate(sessionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, scope } = req.body;

      if (scope === 'plataforma') {
        const user = await db.query.platformUsers.findFirst({
          where: eq(platformUsers.email, email),
        });

        if (!user) {
          throw new UnauthorizedError('Usuario no encontrado');
        }

        const token = signToken({
          sub: toId('platform-user', user.id.toString()),
          email: user.email,
          name: user.username,
          role: user.role,
          scope: 'plataforma',
          companyId: null,
          companyModules: [],
          modulePermissions: [],
        });

        return res.json({
          token,
          user: {
            id: toId('platform-user', user.id.toString()),
            email: user.email,
            username: user.username,
            role: user.role,
            scope: 'plataforma',
          },
        });
      } else {
        const user = await db.query.companyUsers.findFirst({
          where: eq(companyUsers.email, email),
          with: {
            company: true,
          },
        });

        if (!user) {
          throw new UnauthorizedError('Usuario no encontrado');
        }

        const profileData       = user.profileData as Record<string, unknown>;
        const modulePermissions = (profileData?.modulePermissions as string[]) || [];
        const permissions       = (profileData?.permissions as PermissionMap) ?? {};  
        const companyModules    = user.company?.enabledModules || [];

        const token = signToken({
          sub:               toId('company-user', user.id.toString()),
          email:             user.email,
          name:              user.username,
          role:              user.role,
          scope:             'operacion',
          companyId:         Number(user.companyId),
          companyModules,
          modulePermissions,
          permissions,       // ← nuevo
        });

        return res.json({
          token,
          user: {
            id: toId('company-user', user.id.toString()),
            email: user.email,
            username: user.username,
            role: user.role,
            scope: 'operacion',
            companyId: Number(user.companyId),
          },
        });
      }
    } catch (error) {
      next(error);
    }
  },
);


// POST /auth/refresh
router.post(
  '/refresh',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) {
        throw new UnauthorizedError('No autenticado');
      }

      // Re-sign el token (prolonga la expiración)
      const token = signToken({
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
    } catch (error) {
      next(error);
    }
  },
);

// GET /auth/session — restaurar sesión desde la cookie
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

// POST /auth/logout — limpiar cookie
router.post("/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  return res.json({ ok: true });
});

export default router;