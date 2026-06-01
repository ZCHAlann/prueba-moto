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
import type { PermissionMap } from '../../middlewares/authenticate';

const router = Router({ mergeParams: true });

// ─── Schemas ──────────────────────────────────────────────────────────────────

const COMPANY_ROLES = [
  'owner_empresa',
  'admin_empresa',
  'supervisor',
  'operador',
  'conductor',
] as const;

const createCompanyUserSchema = z.object({
  email:             z.string().email('El correo es inválido'),
  username:          z.string().min(3, 'El usuario debe tener al menos 3 caracteres'),
  password:          z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  role:              z.enum(COMPANY_ROLES),
  status:            z.enum(['active', 'inactive']).default('active'),
  modulePermissions: z.array(z.string()).default([]),
  permissions:       z.record(z.string(), z.record(z.string(), z.array(z.string()))).default({}),  // ← nuevo
  profileData:       z.record(z.string(), z.unknown()).default({}),
});

const updateCompanyUserSchema = createCompanyUserSchema
  .omit({ password: true })
  .extend({ password: z.string().min(8).optional() })
  .partial();

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
    modulePermissions: (profile.modulePermissions as string[]) ?? [],
    permissions:       (profile.permissions as PermissionMap) ?? {},   // ← nuevo
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
          eq(companyUsers.id, companyId),
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

      const { modulePermissions, permissions, profileData, ...rest } = body;

      const [created] = await db
        .insert(companyUsers)
        .values({
          companyId,
          email:        rest.email,
          username:     rest.username,
          passwordHash,
          role:         rest.role,
          status:       rest.status,
          profileData:  { ...profileData, modulePermissions, permissions }, 
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

      const { password, modulePermissions, permissions, profileData, ...rest } = body;

      const updateData: Partial<typeof companyUsers.$inferInsert> & Record<string, unknown> = {
        ...rest,
        updatedAt: new Date(),
      };

      if (password) {
        updateData.passwordHash = await hashPassword(password);
      }

      if (modulePermissions !== undefined || profileData !== undefined || permissions !== undefined) {
        const currentProfile = (existing[0].profileData as Record<string, unknown>) ?? {};
        updateData.profileData = {
          ...currentProfile,
          ...(profileData ?? {}),
          ...(modulePermissions !== undefined ? { modulePermissions } : {}),
          ...(permissions !== undefined ? { permissions } : {}),   // ← nuevo
        };
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