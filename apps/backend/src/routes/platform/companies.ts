import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, type DB } from '../../db/client';
import { validate } from '../../lib/validate';
import { requireSuperadmin } from '../../middlewares/requireSuperadmin';
import { NotFoundError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { companies, companyUsers, platformPlans } from '../../db/schema/platform';
import { hashPassword } from '../../services/auth.service';

const router = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createCompanySchema = z.object({
  name:            z.string().min(1),
  slug:            z.string().min(1).regex(/^[a-z0-9-]+$/),
  planId:          z.string().default('free'),
  status:          z.enum(['active', 'inactive', 'suspended', 'trial']).default('active'),
  enabledModules:  z.array(z.string()).default([]),
  // Info comercial
  industry:        z.string().optional(),
  country:         z.string().optional(),
  city:            z.string().optional(),
  contactName:     z.string().optional(),
  contactEmail:    z.string().email().optional().or(z.literal('')),
  contactPhone:    z.string().optional(),
  website:         z.string().optional(),
  notes:           z.string().optional(),
  // Fechas
  trialEndsAt:     z.string().datetime().optional(),
  contractStartAt: z.string().optional(),
  contractEndAt:   z.string().optional(),
  // Usuario master opcional
  masterUser: z.object({
    email:    z.string().email(),
    username: z.string().min(3),
    password: z.string().min(8),
    role:     z.string().default('owner_empresa'),
    title:    z.string().optional(),
  }).optional(),
});

const updateCompanySchema = createCompanySchema.omit({ masterUser: true }).partial();

// ─── Serializer ───────────────────────────────────────────────────────────────

function serializeCompany(c: typeof companies.$inferSelect) {
  return {
    id:              toId('company', c.id),
    name:            c.name,
    slug:            c.slug,
    planId:          c.planId,
    status:          c.status,
    enabledModules:  c.enabledModules,
    industry:        c.industry,
    country:         c.country,
    city:            c.city,
    contactName:     c.contactName,
    contactEmail:    c.contactEmail,
    contactPhone:    c.contactPhone,
    website:         c.website,
    notes:           c.notes,
    trialEndsAt:     c.trialEndsAt,
    contractStartAt: c.contractStartAt,
    contractEndAt:   c.contractEndAt,
    createdAt:       c.createdAt,
    updatedAt:       c.updatedAt,
  };
}

// ─── GET /platform/companies ──────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(companies)
      .orderBy(companies.name);
    res.json({ data: rows.map(serializeCompany), total: rows.length });
  } catch (err) {
    next(err);
  }
});

// ─── GET /platform/companies/:id ─────────────────────────────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const companyId = parseId('company', req.params.id);
    const [row] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    if (!row) throw new NotFoundError('Empresa', req.params.id);
    res.json(serializeCompany(row));
  } catch (err) {
    next(err);
  }
});

// ─── POST /platform/companies ─────────────────────────────────────────────────

router.post('/', validate(createCompanySchema), async (req, res, next) => {
  try {
    const { masterUser, ...companyData } = req.body as z.infer<typeof createCompanySchema>;

    const [created] = await db
      .insert(companies)
      .values(companyData)
      .returning();

    if (masterUser) {
      const passwordHash = await hashPassword(masterUser.password);
      await db.insert(companyUsers).values({
        companyId:    created.id,
        email:        masterUser.email,
        username:     masterUser.username,
        passwordHash,
        role:         masterUser.role,
        status:       'active',
        profileData:  {
          modulePermissions: created.enabledModules,
          title: masterUser.title ?? '',
        },
      });
    }

    await logAudit(db, null, {
      entity:      'companies',
      entityId:    toId('company', created.id),
      action:      'create',
      actorId:     req.user!.sub,
      actorName:   req.user!.name,
      description: `Empresa "${created.name}" creada.`,
    });

    res.status(201).json(serializeCompany(created));
  } catch (err) {
    next(err);
  }
});

// ─── PUT /platform/companies/:id ─────────────────────────────────────────────

router.put('/:id', validate(updateCompanySchema), async (req, res, next) => {
  try {
    const companyId = parseId('company', req.params.id);

    const [existing] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    if (!existing) throw new NotFoundError('Empresa', req.params.id);

    const [updated] = await db
      .update(companies)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(companies.id, companyId))
      .returning();

    await logAudit(db, null, {
      entity:      'companies',
      entityId:    toId('company', updated.id),
      action:      'update',
      actorId:     req.user!.sub,
      actorName:   req.user!.name,
      description: `Empresa "${updated.name}" actualizada.`,
    });

    res.json(serializeCompany(updated));
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /platform/companies/:id  [SA] ────────────────────────────────────

router.delete('/:id', requireSuperadmin, async (req, res, next) => {
  try {
    const companyId = parseId('company', req.params.id);

    const [existing] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    if (!existing) throw new NotFoundError('Empresa', req.params.id);

    await db.delete(companies).where(eq(companies.id, companyId));

    await logAudit(db, null, {
      entity:      'companies',
      entityId:    toId('company', companyId),
      action:      'delete',
      actorId:     req.user!.sub,
      actorName:   req.user!.name,
      description: `Empresa "${existing.name}" eliminada.`,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;