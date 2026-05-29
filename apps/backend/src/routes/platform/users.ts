import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, type DB } from '../../db/client';
import { platformUsers, companyUsers, companies } from '../../db/schema/platform';
import { validate } from '../../lib/validate';
import { requireSuperadmin } from '../../middlewares/requireSuperadmin';
import { NotFoundError, AppError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { hashPassword } from '../../services/auth.service';

const router = Router();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const PLATFORM_ROLES = ['superadmin', 'admin_saas', 'comercial', 'soporte'] as const;
const COMPANY_ROLES = [
  'owner_empresa',
  'admin_empresa',
  'supervisor',
  'operador',
  'conductor',
] as const;

const createPlatformUserSchema = z.object({
  type: z.literal('platform'),
  email: z.string().email(),
  username: z.string().min(3),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  role: z.enum(PLATFORM_ROLES),
  status: z.enum(['active', 'inactive']).default('active'),
});

const createCompanyUserSchema = z.object({
  type: z.literal('company'),
  companyId: z.string(),
  email: z.string().email(),
  username: z.string().min(3),
  password: z.string().min(8),
  role: z.enum(COMPANY_ROLES),
  status: z.enum(['active', 'inactive']).default('active'),
  modulePermissions: z.array(z.string()).default([]),
  profileData: z.record(z.unknown()).default({}),
});

const createUserSchema = z.discriminatedUnion('type', [
  createPlatformUserSchema,
  createCompanyUserSchema,
]);

const updatePlatformUserSchema = createPlatformUserSchema
  .omit({ type: true, password: true })
  .extend({ password: z.string().min(8).optional() })
  .partial();

const updateCompanyUserSchema = createCompanyUserSchema
  .omit({ type: true, password: true })
  .extend({ password: z.string().min(8).optional() })
  .partial();

// ─── Snapshot helper ──────────────────────────────────────────────────────────

async function buildPlatformSnapshot(database: DB) {
  const allCompanies = await database.select().from(companies).orderBy(companies.name);
  const allUsers = await database.select().from(companyUsers);

  return {
    companies: allCompanies.map((c) => ({
      id: toId('company', c.id),
      name: c.name,
      slug: c.slug,
      planId: c.planId,
      status: c.status,
      enabledModules: c.enabledModules,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    globalUsers: allUsers.map((u) => ({
      id: toId('company-user', u.id),
      name: u.name,
      email: u.email,
      username: u.username,
      role: u.role,
      companyId: u.companyId ? toId('company', u.companyId) : null,
      status: u.status,
      title: (u.profileData as Record<string, unknown>)?.title ?? '',
      password: undefined,
    })),
  };
}

// ─── GET /platform/users ──────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const { type } = req.query;

    if (type === 'platform') {
      const rows = await db.select().from(platformUsers).orderBy(platformUsers.email);
      return res.json({ data: rows.map(serializePlatformUser), total: rows.length });
    }

    if (type === 'company') {
      const rows = await db
        .select({ user: companyUsers, companyName: companies.name, companySlug: companies.slug })
        .from(companyUsers)
        .leftJoin(companies, eq(companyUsers.companyId, companies.id))
        .orderBy(companyUsers.email);

      return res.json({
        data: rows.map(({ user, companyName, companySlug }) =>
          serializeCompanyUser(user, companyName, companySlug)
        ),
        total: rows.length,
      });
    }

    // Sin filtro: ambos agrupados
    const [pUsers, cUsers] = await Promise.all([
      db.select().from(platformUsers).orderBy(platformUsers.email),
      db
        .select({ user: companyUsers, companyName: companies.name, companySlug: companies.slug })
        .from(companyUsers)
        .leftJoin(companies, eq(companyUsers.companyId, companies.id))
        .orderBy(companyUsers.email),
    ]);

    res.json({
      platformUsers: pUsers.map(serializePlatformUser),
      companyUsers: cUsers.map(({ user, companyName, companySlug }) =>
        serializeCompanyUser(user, companyName, companySlug)
      ),
      total: pUsers.length + cUsers.length,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /platform/users ─────────────────────────────────────────────────────

router.post('/', validate(createUserSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof createUserSchema>;
    const passwordHash = await hashPassword(body.password!);

    if (body.type === 'platform') {
      const [created] = await db
        .insert(platformUsers)
        .values({
          email: body.email,
          username: body.username,
          passwordHash,
          role: body.role,
          status: body.status,
        })
        .returning();

      await logAudit(db, null, {
        entity: 'platform_users',
        entityId: toId('platform-user', created.id),
        action: 'create',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Usuario de plataforma "${created.email}" creado.`,
      });

      return res.status(201).json(await buildPlatformSnapshot(db));
    }

    // type === 'company'
    const companyId = parseId('company', body.companyId);

    const co = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!co.length) throw new NotFoundError('Empresa', body.companyId);

    const { modulePermissions, profileData, ...rest } = body;
    const [created] = await db
      .insert(companyUsers)
      .values({
        companyId,
        email: rest.email,
        username: rest.username,
        passwordHash,
        role: rest.role,
        status: rest.status,
        profileData: { ...profileData, modulePermissions },
      })
      .returning();

    await logAudit(db, companyId, {
      entity: 'company_users',
      entityId: toId('company-user', created.id),
      action: 'create',
      actorId: req.user!.sub,
      actorName: req.user!.name,
      description: `Usuario de empresa "${created.email}" creado.`,
    });

    return res.status(201).json(await buildPlatformSnapshot(db));
  } catch (err) {
    next(err);
  }
});

// ─── PUT /platform/users/:id ──────────────────────────────────────────────────

router.put('/:id', async (req, res, next) => {
  try {
    const rawId = req.params.id;

    if (rawId.startsWith('platform-user-')) {
      const userId = parseId('platform-user', rawId);
      const parsed = updatePlatformUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validación fallida', details: parsed.error.flatten() });
      }

      const existing = await db
        .select()
        .from(platformUsers)
        .where(eq(platformUsers.id, userId))
        .limit(1);
      if (!existing.length) throw new NotFoundError('Usuario', rawId);

      const { password, ...rest } = parsed.data;
      const updateData: Record<string, unknown> = { ...rest, updatedAt: new Date() };
      if (password) updateData.passwordHash = await hashPassword(password);

      const [updated] = await db
        .update(platformUsers)
        .set(updateData)
        .where(eq(platformUsers.id, userId))
        .returning();

      await logAudit(db, null, {
        entity: 'platform_users',
        entityId: toId('platform-user', updated.id),
        action: 'update',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Usuario de plataforma "${updated.email}" actualizado.`,
      });

      return res.json(await buildPlatformSnapshot(db));
    }

    if (rawId.startsWith('company-user-')) {
      const userId = parseId('company-user', rawId);
      const parsed = updateCompanyUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validación fallida', details: parsed.error.flatten() });
      }

      const existing = await db
        .select({ user: companyUsers, companyName: companies.name, companySlug: companies.slug })
        .from(companyUsers)
        .leftJoin(companies, eq(companyUsers.companyId, companies.id))
        .where(eq(companyUsers.id, userId))
        .limit(1);
      if (!existing.length) throw new NotFoundError('Usuario', rawId);

      const { password, modulePermissions, profileData, companyId: _cid, ...rest } = parsed.data;
      const updateData: Record<string, unknown> = { ...rest, updatedAt: new Date() };
      if (password) updateData.passwordHash = await hashPassword(password);

      if (modulePermissions !== undefined || profileData !== undefined) {
        const currentProfile = (existing[0].user.profileData as Record<string, unknown>) ?? {};
        updateData.profileData = {
          ...currentProfile,
          ...(profileData ?? {}),
          ...(modulePermissions !== undefined ? { modulePermissions } : {}),
        };
      }

      const [updated] = await db
        .update(companyUsers)
        .set(updateData)
        .where(eq(companyUsers.id, userId))
        .returning();

      await logAudit(db, updated.companyId, {
        entity: 'company_users',
        entityId: toId('company-user', updated.id),
        action: 'update',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Usuario de empresa "${updated.email}" actualizado.`,
      });

      return res.json(await buildPlatformSnapshot(db));
    }

    throw new AppError(400, `ID de usuario inválido: ${rawId}`);
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /platform/users/:id  [SA] ────────────────────────────────────────

router.delete('/:id', requireSuperadmin, async (req, res, next) => {
  try {
    const rawId = req.params.id;

    if (rawId.startsWith('platform-user-')) {
      const userId = parseId('platform-user', rawId);
      const existing = await db
        .select()
        .from(platformUsers)
        .where(eq(platformUsers.id, userId))
        .limit(1);
      if (!existing.length) throw new NotFoundError('Usuario', rawId);

      await db.delete(platformUsers).where(eq(platformUsers.id, userId));

      await logAudit(db, null, {
        entity: 'platform_users',
        entityId: toId('platform-user', userId),
        action: 'delete',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Usuario de plataforma "${existing[0].email}" eliminado.`,
      });

      return res.json(await buildPlatformSnapshot(db));
    }

    if (rawId.startsWith('company-user-')) {
      const userId = parseId('company-user', rawId);
      const existing = await db
        .select()
        .from(companyUsers)
        .where(eq(companyUsers.id, userId))
        .limit(1);
      if (!existing.length) throw new NotFoundError('Usuario', rawId);

      await db.delete(companyUsers).where(eq(companyUsers.id, userId));

      await logAudit(db, existing[0].companyId, {
        entity: 'company_users',
        entityId: toId('company-user', userId),
        action: 'delete',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Usuario de empresa "${existing[0].email}" eliminado.`,
      });

      return res.json(await buildPlatformSnapshot(db));
    }

    throw new AppError(400, `ID de usuario inválido: ${rawId}`);
  } catch (err) {
    next(err);
  }
});

// ─── Serializers ──────────────────────────────────────────────────────────────

function serializePlatformUser(u: typeof platformUsers.$inferSelect) {
  return {
    id: toId('platform-user', u.id),
    type: 'platform',
    email: u.email,
    username: u.username,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

function serializeCompanyUser(
  u: typeof companyUsers.$inferSelect,
  companyName: string | null | undefined,
  companySlug: string | null | undefined
) {
  const profile = (u.profileData as Record<string, unknown>) ?? {};
  return {
    id: toId('company-user', u.id),
    type: 'company',
    companyId: toId('company', u.companyId),
    companyName: companyName ?? null,
    companySlug: companySlug ?? null,
    email: u.email,
    username: u.username,
    role: u.role,
    status: u.status,
    modulePermissions: (profile.modulePermissions as string[]) ?? [],
    profileData: profile,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

export default router;