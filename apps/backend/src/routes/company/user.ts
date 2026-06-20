import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyUsers, companyRoles } from '../../db/schema/platform';
import { validate } from '../../lib/validate';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { NotFoundError, AppError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { hashPassword } from '../../services/auth.service';
import { validators } from '../../lib/validators';
import { syncDriverWithUser, onUserDelete } from '../../services/driver-sync.service';

const router = Router({ mergeParams: true });

// ─── Schemas ──────────────────────────────────────────────────────────────────

/**
 * Roles "de plataforma" — tienen acceso total sin necesidad de estar
 * en la tabla `company_roles`. Los admins de empresa eligen desde el
 * catálogo persistente (default + custom). Validamos que el `role`
 * enviado en create/update exista en el catálogo de la empresa, o sea
 * uno de los platform roles.
 */
const PLATFORM_ROLES = new Set([
  'owner_empresa',
  'admin_empresa',
  'superadmin',
]);

const modulePermissionsSchema = z.record(
  z.string(),
  z.record(z.string(), z.array(z.enum(["ver", "crear", "editar", "eliminar"])))
).default({});

const createCompanyUserSchema = z.object({
  email:             validators.email,
  username:          z.string().trim().min(3, 'El usuario debe tener al menos 3 caracteres').max(40)
                       .regex(/^[a-zA-Z0-9_.-]+$/, 'Solo letras, números, guion, guion bajo y punto'),
  password:          z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(128),
  role:              z.string().trim().min(1).max(60),
  status:            z.enum(['active', 'inactive']).default('active'),
  modulePermissions: modulePermissionsSchema,
  profileData:       z.record(z.string(), z.unknown()).default({}),
  photoUrl:          z.string().min(1).max(2_000_000).nullable().optional(),
});

const updateCompanyUserSchema = createCompanyUserSchema
  .omit({ password: true })
  .extend({ password: z.string().min(8).max(128).optional() })
  .partial();

/** Verifica que un `role` sea válido para la empresa: platform role o key en el catálogo. */
async function assertRoleValid(companyId: number, roleKey: string): Promise<void> {
  if (PLATFORM_ROLES.has(roleKey)) return;
  const [row] = await db
    .select({ id: companyRoles.id })
    .from(companyRoles)
    .where(and(eq(companyRoles.companyId, companyId), eq(companyRoles.key, roleKey)))
    .limit(1);
  if (!row) {
    throw new AppError(400, `El rol "${roleKey}" no existe en el catálogo de la empresa.`);
  }
}

const permissionsSchema = z.object({
  modulePermissions: modulePermissionsSchema,
});

// ─── Serializer ───────────────────────────────────────────────────────────────

/**
 * Normaliza `profileData` antes de persistirlo:
 *   - Si el frontend mandó `fullName` (un solo string con nombres y apellidos)
 *     y NO mandó `firstName`, lo partimos en firstName + lastName usando
 *     la convención: primer token = firstName, resto = lastName.
 *   - Esto resuelve el bug donde el módulo Conductores mostraba el driver
 *     con `firstName = username` y `lastName = "—"` porque el profileData
 *     solo traía `fullName`.
 *   - `documentNumber`, `phone`, `siteId`, `area`, `notes`, `site` se
 *     conservan tal cual.
 *
 *   Si el frontend ya manda `firstName` y `lastName` por separado, no se
 *   toca `fullName` (lo dejamos para referencia / mostrar en la tabla de
 *   Accesos).
 */
function normalizeProfileData(
  profileData: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!profileData || typeof profileData !== "object") return {};
  const out: Record<string, unknown> = { ...profileData };

  const hasFirst = typeof out.firstName === "string" && (out.firstName as string).trim().length > 0;
  const hasLast  = typeof out.lastName  === "string" && (out.lastName  as string).trim().length > 0;
  const fullRaw  = typeof out.fullName  === "string" ? (out.fullName as string).trim() : "";

  if (!hasFirst && !hasLast && fullRaw.length > 0) {
    // El frontend solo envió fullName. Partirlo.
    const tokens = fullRaw.split(/\s+/).filter(Boolean);
    if (tokens.length === 1) {
      out.firstName = tokens[0];
    } else {
      out.firstName = tokens[0];
      out.lastName  = tokens.slice(1).join(" ");
    }
  } else if (!hasFirst && hasLast && fullRaw.length > 0) {
    // Mandó lastName pero no firstName. Sacar firstName de fullName si el
    // prefijo de fullName coincide con algo distinto al lastName.
    const tokens = fullRaw.split(/\s+/).filter(Boolean);
    if (tokens.length >= 2) {
      out.firstName = tokens.slice(0, tokens.length - 1).join(" ");
    }
  }

  // Trim a todos los string para evitar espacios fantasma
  for (const k of Object.keys(out)) {
    if (typeof out[k] === "string") out[k] = (out[k] as string).trim();
  }

  return out;
}

function serializeUser(u: typeof companyUsers.$inferSelect) {
  const profile = (u.profileData as Record<string, unknown>) ?? {};
  return {
    id:                toId('company-user', u.id),
    companyId:         toId('company', u.companyId),
    email:             u.email,
    username:          u.username,
    role:              u.role,
    status:            u.status,
    modulePermissions: (u.modulePermissions as Record<string, Record<string, string[]>>) ?? {},
    permissions:       {},  // deprecado, siempre vacío
    profileData:       profile,
    createdAt:         u.createdAt,
    updatedAt:         u.updatedAt,
    // Lo expone el frontend para sincronizar invalidación de sesión tras
    // cambios de permisos/rol.
    permissionsUpdatedAt: u.updatedAt?.toISOString() ?? null,
  };
}

// ─── GET /company/:id/users ───────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const companyId = req.companyId!;

    const rows = await db
      .select()
      .from(companyUsers)
      .where(eq(companyUsers.companyId, companyId))
      .orderBy(companyUsers.createdAt);

    res.json({ data: rows.map(serializeUser), total: rows.length });
  } catch (err) {
    next(err);
  }
});

// ─── GET /company/:id/users/:userId ──────────────────────────────────────────

router.get('/:userId', async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const userId    = parseId('company-user', req.params.userId);

    const rows = await db
      .select()
      .from(companyUsers)
      .where(
        and(
          eq(companyUsers.id, userId),
          eq(companyUsers.companyId, companyId),
        )
      )
      .limit(1);

    if (!rows.length) throw new NotFoundError('Usuario', req.params.userId);

    res.json(serializeUser(rows[0]));
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/users ──────────────────────────────────────────────────

router.post(
  '/',
  requireAdmin,
  validate(createCompanyUserSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const body      = req.body as z.infer<typeof createCompanyUserSchema>;

      await assertRoleValid(companyId, body.role);

      const passwordHash = await hashPassword(body.password);

      const { modulePermissions, profileData, photoUrl, ...rest } = body;

      const normalizedProfile = normalizeProfileData(profileData);

      const [created] = await db
        .insert(companyUsers)
        .values({
          companyId,
          email:             rest.email,
          username:          rest.username,
          passwordHash,
          role:              rest.role,
          status:            rest.status,
          modulePermissions: modulePermissions ?? {},
          profileData:       normalizedProfile,
          photoUrl:          photoUrl ?? null,
        })
        .returning();

      // 1-a-1: si el rol es conductor, crear/asegurar su fila en drivers.
      await syncDriverWithUser({
        companyId,
        userId:  created.id,
        role:    created.role,
      });

      await logAudit(db, companyId, {
        entity:      'company_users',
        entityId:    toId('company-user', created.id),
        action:      'create',
        actorId:     req.user!.sub,
        actorName:   req.user!.name,
        description: `Usuario "${created.email}" creado en la empresa.`,
      });

      res.status(201).json(serializeUser(created));
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /company/:id/users/:userId ──────────────────────────────────────────

router.put(
  '/:userId',
  requireAdmin,
  validate(updateCompanyUserSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const userId    = parseId('company-user', req.params.userId as string);
      const body      = req.body as z.infer<typeof updateCompanyUserSchema>;

      const existing = await db
        .select()
        .from(companyUsers)
        .where(
          and(
            eq(companyUsers.id, userId),
            eq(companyUsers.companyId, companyId),
          )
        )
        .limit(1);

    if (!existing.length) throw new NotFoundError('Usuario', req.params.userId as string);

    if (body.role !== undefined) {
      await assertRoleValid(companyId, body.role);
    }

    const { password, modulePermissions, profileData, ...rest } = body;

      const updateData: Partial<typeof companyUsers.$inferInsert> & Record<string, unknown> = {
        ...rest,
        updatedAt: new Date(),
      };

      if (password) {
        updateData.passwordHash = await hashPassword(password);
      }

      if (modulePermissions !== undefined) {
        updateData.modulePermissions = modulePermissions;
      }

      if (profileData !== undefined) {
        const currentProfile = (existing[0].profileData as Record<string, unknown>) ?? {};
        const merged = { ...currentProfile, ...profileData };
        updateData.profileData = normalizeProfileData(merged);
      }

      const [updated] = await db
        .update(companyUsers)
        .set(updateData)
        .where(
          and(
            eq(companyUsers.id, userId),
            eq(companyUsers.companyId, companyId),
          )
        )
        .returning();

      // 1-a-1: sincronizar driver si cambió rol, username, photoUrl o profileData
      // (profileData trae firstName/lastName/phone/siteId que se copian al driver).
      if (
        body.role        !== undefined ||
        body.username    !== undefined ||
        body.profileData !== undefined ||
        body.photoUrl    !== undefined
      ) {
        await syncDriverWithUser({
          companyId,
          userId:  updated.id,
          role:    updated.role,
        });
      }

      await logAudit(db, companyId, {
        entity:      'company_users',
        entityId:    toId('company-user', updated.id),
        action:      'update',
        actorId:     req.user!.sub,
        actorName:   req.user!.name,
        description: `Usuario "${updated.email}" actualizado.`,
      });

      res.json(serializeUser(updated));
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /company/:id/users/:userId/permissions ───────────────────────────────

router.put(
  '/:userId/permissions',
  requireAdmin,
  validate(permissionsSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const userId    = parseId('company-user', req.params.userId);
      const { modulePermissions } = req.body as z.infer<typeof permissionsSchema>;

      const existing = await db
        .select()
        .from(companyUsers)
        .where(
          and(
            eq(companyUsers.id, userId),
            eq(companyUsers.companyId, companyId),
          )
        )
        .limit(1);

      if (!existing.length) throw new NotFoundError('Usuario', req.params.userId);

      const [updated] = await db
        .update(companyUsers)
        .set({ modulePermissions, updatedAt: new Date() })
        .where(
          and(
            eq(companyUsers.id, userId),
            eq(companyUsers.companyId, companyId),
          )
        )
        .returning();

      await logAudit(db, companyId, {
        entity:      'company_users',
        entityId:    toId('company-user', updated.id),
        action:      'update',
        actorId:     req.user!.sub,
        actorName:   req.user!.name,
        description: `Permisos de "${updated.email}" actualizados.`,
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /company/:id/users/:userId ───────────────────────────────────────

router.delete(
  '/:userId',
  requireAdmin,
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const userId    = parseId('company-user', req.params.userId as string);

      const existing = await db
        .select()
        .from(companyUsers)
        .where(
          and(
            eq(companyUsers.id, userId),
            eq(companyUsers.companyId, companyId),
          )
        )
        .limit(1);

      if (!existing.length) throw new NotFoundError('Usuario', req.params.userId as string);

      await db
        .delete(companyUsers)
        .where(
          and(
            eq(companyUsers.id, userId),
            eq(companyUsers.companyId, companyId),
          )
        );

      // FK CASCADE borra la fila de drivers automáticamente; onUserDelete
      // es no-op pero se llama por simetría.
      await onUserDelete({ companyId, userId });

      await logAudit(db, companyId, {
        entity:      'company_users',
        entityId:    toId('company-user', userId),
        action:      'delete',
        actorId:     req.user!.sub,
        actorName:   req.user!.name,
        description: `Usuario "${existing[0].email}" eliminado de la empresa.`,
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;