import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../db/client';
import { platformUsers, companyUsers, platformSettings, companies } from '../db/schema';
import { eq } from 'drizzle-orm';
import { validate } from '../lib/validate';
import { hashPassword, verifyPassword, signToken } from '../services/auth.service';
import { UnauthorizedError, AppError } from '../lib/errors';
import { toId } from '../lib/ids';
import { authenticate, COOKIE_NAME, PermissionMap, ModulePermissionMap } from '../middlewares/authenticate';
import { getFinalPermissionsForUser } from './company/roles';
import { getUserEffectivelyActiveFromDb } from '../lib/userStatus.db';
import { getInactiveMessage, getInactiveCode } from '../lib/userStatus';

const router = Router();

interface TokenPayload {
  sub:               string;
  email:             string;
  name:              string;
  role:              string;
  scope:             'operacion' | 'plataforma';
  companyId:         number | null;
  companyModules:    string[];
  modulePermissions: ModulePermissionMap;
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

// ─── Helpers lockout ──────────────────────────────────────────────────────────

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
    patch.lockedUntil         = new Date(Date.now() + lockoutMinutes * 60_000);
    patch.failedLoginAttempts = 0;
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

      if (user.lockedUntil && user.lockedUntil > new Date()) {
        const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
        return res.status(423).json({
          message: `Cuenta bloqueada. Intenta en ${mins} minuto${mins !== 1 ? 's' : ''}.`,
        });
      }

      if (!(await verifyPassword(password, user.passwordHash))) {
        await handleFailedLogin(platformUsers, user.id, maxLoginAttempts, lockoutMinutes);
        throw new UnauthorizedError("Credenciales inválidas");
      }

      await clearFailedLogin(platformUsers, user.id);

      tokenPayload = {
        sub:               toId("platform-user", user.id.toString()),
        email:             user.email,
        name:              user.username,
        role:              user.role,
        scope:             "plataforma",
        companyId:         null,
        companyModules:    [],
        modulePermissions: {},
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
        // Incluir foto en la respuesta del login para que AuthContext la tenga de inmediato
        photoUrl:          user.photoUrl ?? null,
      };

    } else {
      const user = await db.query.companyUsers.findFirst({
        where: (f, { or, eq }) => or(eq(f.email, login), eq(f.username, login)),
        with: { company: true },
      });
      if (!user) throw new UnauthorizedError("Credenciales inválidas");

      if (user.lockedUntil && user.lockedUntil > new Date()) {
        const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
        return res.status(423).json({
          message: `Cuenta bloqueada. Intenta en ${mins} minuto${mins !== 1 ? 's' : ''}.`,
        });
      }

      if (!(await verifyPassword(password, user.passwordHash))) {
        await handleFailedLogin(companyUsers, user.id, maxLoginAttempts, lockoutMinutes);
        throw new UnauthorizedError("Credenciales inválidas");
      }

      await clearFailedLogin(companyUsers, user.id);

      // ── Chequeo de estado efectivo (Fase 2.2) ───────────────────────────────
      // Si el usuario (y su driver/sede si aplica) está efectivamente
      // inactivo, bloqueamos el login con un mensaje claro y un código
      // estructurado que el frontend puede usar para distinguir los casos.
      const status = await getUserEffectivelyActiveFromDb(
        user.id,
        Number(user.companyId),
      );
      if (status && !status.effectivelyActive) {
        return res.status(403).json({
          code:    getInactiveCode(status.inactiveReason),
          message: getInactiveMessage(status.inactiveReason),
        });
      }

      const isAdminRole    = ["owner_empresa", "admin_empresa"].includes(user.role);
      const companyModules = user.company?.enabledModules ?? [];
      const permissions    = {} as PermissionMap;
      // Owners / admins tienen acceso total (no necesitan lookup).
      // Para el resto, los permisos del JWT vienen de la tabla
      // `company_roles` (catálogo por empresa) mergeados con el
      // override per-user que vive en `company_users.modulePermissions`.
      const modulePermissions: ModulePermissionMap = isAdminRole
        ? {}
        : await getFinalPermissionsForUser(
            Number(user.companyId),
            user.role,
            (user.modulePermissions as ModulePermissionMap) ?? {},
          );

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
        companyModules,
        modulePermissions,
        permissions,
        // Incluir foto en la respuesta del login para que AuthContext la tenga de inmediato
        photoUrl:          user.photoUrl ?? null,
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

// ─── POST /auth/session ────────────────────────────────────────────────────────
// (sin cambios relevantes — este endpoint no se usa para el flujo principal)

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
        modulePermissions: {},
      });

      return res.json({
        token,
        user: {
          id:       toId('platform-user', user.id.toString()),
          email:    user.email,
          username: user.username,
          role:     user.role,
          scope:    'plataforma',
          photoUrl: user.photoUrl ?? null,
        },
      });

    } else {
      const user = await db.query.companyUsers.findFirst({
        where: eq(companyUsers.email, email),
        with:  { company: true },
      });
      if (!user) throw new UnauthorizedError('Usuario no encontrado');

      // ── Chequeo de estado efectivo (Fase 2.2) ───────────────────────────────
      // El endpoint /auth/session emite un token nuevo sin password, así
      // que acá también bloqueamos si el usuario/driver/sede quedó
      // inactivo desde la última sesión. Mismo formato que /login.
      const status = await getUserEffectivelyActiveFromDb(
        user.id,
        Number(user.companyId),
      );
      if (status && !status.effectivelyActive) {
        return res.status(403).json({
          code:    getInactiveCode(status.inactiveReason),
          message: getInactiveMessage(status.inactiveReason),
        });
      }

      const isAdminRole    = ["owner_empresa", "admin_empresa"].includes(user.role);
      const companyModules = user.company?.enabledModules ?? [];
      const permissions    = {} as PermissionMap;
      const modulePermissions: ModulePermissionMap = isAdminRole
        ? {}
        : await getFinalPermissionsForUser(
            Number(user.companyId),
            user.role,
            (user.modulePermissions as ModulePermissionMap) ?? {},
          );

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
          photoUrl:  user.photoUrl ?? null,
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
// Lee la foto fresca de DB en cada arranque de app — así no hay que
// regenerar el JWT cuando el usuario cambia su foto.

router.get("/session", authenticate, async (req, res, next) => {
  try {
    const user = req.user!;
    let companyName = "";
    let photoUrl: string | null = null;
    // Permisos frescos de BD — el JWT puede tener una versión vieja si
    // un admin cambió los permisos. Sin recargar, leemos siempre la
    // fuente de verdad (catálogo de roles + override per-user).
    let modulePermissions: ModulePermissionMap = user.modulePermissions ?? {};
    let dbUpdatedAt: Date | null = null;

    if (user.companyId) {
      const companyUserId = Number(user.sub.replace('company-user-', ''));

      // Leer empresa, foto y override per-user en una sola query
      const [row] = await db
        .select({
          companyName:        companies.name,
          photoUrl:           companyUsers.photoUrl,
          // Importante: leer el role y modulePermissions actuales de BD
          // para que cambios recientes se reflejen sin re-login.
          dbRole:             companyUsers.role,
          dbModulePermissions: companyUsers.modulePermissions,
          dbUpdatedAt:         companyUsers.updatedAt,
        })
        .from(companyUsers)
        .leftJoin(companies, eq(companyUsers.companyId, companies.id))
        .where(eq(companyUsers.id, companyUserId))
        .limit(1);

      companyName = row?.companyName ?? "";
      photoUrl    = row?.photoUrl    ?? null;
      dbUpdatedAt = row?.dbUpdatedAt ?? null;

      // Recalcular permisos desde BD (catálogo rol + override)
      const isAdminRole = ["owner_empresa", "admin_empresa"].includes(row?.dbRole ?? "");
      if (!isAdminRole) {
        modulePermissions = await getFinalPermissionsForUser(
          Number(user.companyId),
          row?.dbRole ?? "",
          (row?.dbModulePermissions as ModulePermissionMap) ?? {},
        );
      } else {
        // Admins tienen acceso total — pero igual devolvemos un objeto
        // vacío para que el frontend haga un fallback uniforme. La
        // lógica de admin-bypass vive en el código del cliente.
        modulePermissions = {};
      }

    } else {
      // Usuario de plataforma — leer foto de platform_users
      const [row] = await db
        .select({ photoUrl: platformUsers.photoUrl })
        .from(platformUsers)
        .where(eq(platformUsers.id, Number(user.sub.replace('platform-user-', ''))))
        .limit(1);

      photoUrl = row?.photoUrl ?? null;
      modulePermissions = {};
    }

    return res.json({
      id:                user.sub,
      email:             user.email,
      name:              user.name,
      role:              user.role,
      scope:             user.scope,
      companyId:         user.companyId ? String(user.companyId) : null,
      companyName,
      companyModules:    user.companyModules    ?? [],
      modulePermissions,
      permissions:       user.permissions       ?? {},
      photoUrl,
      // Timestamp de la última modificación del usuario. Sirve al
      // frontend para invalidar la sesión si quedó desincronizada
      // con BD (cambio de rol, de permisos, etc.).
      permissionsUpdatedAt: dbUpdatedAt?.toISOString() ?? null,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/logout ────────────────────────────────────────────────────────

router.post("/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  return res.json({ ok: true });
});

export default router;