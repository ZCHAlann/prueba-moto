import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, type DB } from '../../db/client';
import { validate } from '../../lib/validate';
import { requireSuperadmin } from '../../middlewares/requireSuperadmin';
import { NotFoundError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { companies, companyUsers } from '../../db/schema/platform';
import { hashPassword } from '../../services/auth.service';

const router = Router();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createCompanySchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'El slug solo puede contener letras minúsculas, números y guiones'),
  planId: z.string().min(1).default('free'),
  status: z
    .enum(['active', 'inactive', 'suspended', 'Prospecto', 'Activo', 'Inactivo', 'Suspendido'])
    .transform((val) => {
      const map: Record<string, 'active' | 'inactive' | 'suspended'> = {
        Prospecto: 'active',
        Activo: 'active',
        Inactivo: 'inactive',
        Suspendido: 'suspended',
      };
      return (map[val] ?? val) as 'active' | 'inactive' | 'suspended';
    })
    .default('active'),
  enabledModules: z.array(z.string()).default([]),
  primaryContact: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  startDate: z.string().optional(),
  industry: z.string().optional(),
  executive: z.string().optional(),
  notes: z.string().optional(),
  masterUser: z
    .object({
      name: z.string().min(1),
      email: z.string().email(),
      username: z.string().min(1),
      password: z.string().min(8),
      title: z.string().optional(),
    })
    .optional(),
});

const updateCompanySchema = createCompanySchema.partial();

// ─── Snapshot helper ──────────────────────────────────────────────────────────

async function buildPlatformSnapshot(database: DB) {
  const allCompanies = await database.select().from(companies).orderBy(companies.name);
  const allUsers = await database.select().from(companyUsers);

  return {
    companies: allCompanies.map(serializeCompany),
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

// ─── GET /platform/companies ──────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const rows = await db.select().from(companies).orderBy(companies.name);
    res.json({ data: rows.map(serializeCompany), total: rows.length });
  } catch (err) {
    next(err);
  }
});

// ─── POST /platform/companies ─────────────────────────────────────────────────

router.post('/', validate(createCompanySchema), async (req, res, next) => {
  try {
    const {
      masterUser,
      primaryContact,
      email,
      phone,
      startDate,
      industry,
      executive,
      notes,
      ...companyData
    } = req.body as z.infer<typeof createCompanySchema>;

    const [created] = await db.insert(companies).values(companyData).returning();

    if (masterUser) {
      const passwordHash = await hashPassword(masterUser.password);
      await db.insert(companyUsers).values({
        companyId: created.id,
        email: masterUser.email,
        username: masterUser.username,
        name: masterUser.name,
        passwordHash,
        role: 'owner_empresa',
        status: 'active',
        profileData: {
          modulePermissions: created.enabledModules,
          title: masterUser.title ?? '',
        },
      });
    }

    await logAudit(db, null, {
      entity: 'companies',
      entityId: toId('company', created.id),
      action: 'create',
      actorId: req.user!.sub,
      actorName: req.user!.name,
      description: `Empresa "${created.name}" creada.`,
    });

    res.status(201).json(await buildPlatformSnapshot(db));
  } catch (err) {
    next(err);
  }
});

// ─── PUT /platform/companies/:id ──────────────────────────────────────────────

router.put('/:id', validate(updateCompanySchema), async (req, res, next) => {
  try {
    const companyId = parseId('company', req.params.id);
    const {
      masterUser,
      primaryContact,
      email,
      phone,
      startDate,
      industry,
      executive,
      notes,
      ...companyData
    } = req.body as z.infer<typeof updateCompanySchema>;

    const existing = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    if (!existing.length) throw new NotFoundError('Empresa', req.params.id);

    const [updated] = await db
      .update(companies)
      .set({ ...companyData, updatedAt: new Date() })
      .where(eq(companies.id, companyId))
      .returning();

    await logAudit(db, null, {
      entity: 'companies',
      entityId: toId('company', updated.id),
      action: 'update',
      actorId: req.user!.sub,
      actorName: req.user!.name,
      description: `Empresa "${updated.name}" actualizada.`,
    });

    res.json(await buildPlatformSnapshot(db));
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /platform/companies/:id  [SA] ─────────────────────────────────────

router.delete('/:id', requireSuperadmin, async (req, res, next) => {
  try {
    const companyId = parseId('company', req.params.id);

    const existing = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    if (!existing.length) throw new NotFoundError('Empresa', req.params.id);

    await db.delete(companies).where(eq(companies.id, companyId));

    await logAudit(db, null, {
      entity: 'companies',
      entityId: toId('company', companyId),
      action: 'delete',
      actorId: req.user!.sub,
      actorName: req.user!.name,
      description: `Empresa "${existing[0].name}" eliminada.`,
    });

    res.json(await buildPlatformSnapshot(db));
  } catch (err) {
    next(err);
  }
});

// ─── Serializer ───────────────────────────────────────────────────────────────

function serializeCompany(c: typeof companies.$inferSelect) {
  return {
    id: toId('company', c.id),
    name: c.name,
    slug: c.slug,
    planId: c.planId,
    status: c.status,
    enabledModules: c.enabledModules,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export default router;