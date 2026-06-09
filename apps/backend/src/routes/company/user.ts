import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyUsers } from '../../db/schema/platform';
import { validate } from '../../lib/validate';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { NotFoundError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { hashPassword } from '../../services/auth.service';
import { validators } from '../../lib/validators';

const router = Router({ mergeParams: true });

// ─── Schemas ──────────────────────────────────────────────────────────────────

const COMPANY_ROLES = [
  'owner_empresa',
  'admin_empresa',
  'supervisor',
  'operador',
  'conductor',
] as const;

const modulePermissionsSchema = z.record(
  z.string(),
  z.record(z.string(), z.array(z.enum(["ver", "crear", "editar", "eliminar"])))
).default({});

const createCompanyUserSchema = z.object({
  email:             validators.email,
  username:          z.string().trim().min(3, 'El usuario debe tener al menos 3 caracteres').max(40)
                       .regex(/^[a-zA-Z0-9_.-]+$/, 'Solo letras, números, guion, guion bajo y punto'),
  password:          z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(128),
  role:              z.enum(COMPANY_ROLES),
  status:            z.enum(['active', 'inactive']).default('active'),
  modulePermissions: modulePermissionsSchema,
  profileData:       z.record(z.string(), z.unknown()).default({}),
});

const updateCompanyUserSchema = createCompanyUserSchema
  .omit({ password: true })
  .extend({ password: z.string().min(8).max(128).optional() })
  .partial();

const permissionsSchema = z.object({
  modulePermissions: modulePermissionsSchema,
});

// ─── Serializer ───────────────────────────────────────────────────────────────

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

      const passwordHash = await hashPassword(body.password);

      const { modulePermissions, profileData, ...rest } = body;

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
          profileData:       profileData ?? {},
        })
        .returning();

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
        updateData.profileData = { ...currentProfile, ...profileData };
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