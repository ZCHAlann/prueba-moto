import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client';
import { companySites } from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { NotFoundError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { safeString, validators } from '../../lib/validators';

const router = Router({ mergeParams: true });

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createSiteSchema = z.object({
  code: z.string().trim().min(1, 'El código es requerido').max(40),
  name: safeString({ min: 2, max: 120, fieldLabel: 'Nombre', allowEmpty: false }),
  city: safeString({ min: 2, max: 100, fieldLabel: 'Ciudad', allowEmpty: false }),
  address: safeString({ min: 5, max: 250, fieldLabel: 'Dirección', allowEmpty: false }),
  contact: validators.phone,
  status: z.enum(['Activa', 'Inactiva']).default('Activa'),
  notes: validators.longTextOptional,
});

const updateSiteSchema = createSiteSchema.partial();

// ─── GET /company/:id/sites ───────────────────────────────────────────────────

router.get('/', requireModule('gestion', 'sedes'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;

    const rows = await db
      .select()
      .from(companySites)
      .where(eq(companySites.companyId, companyId))
      .orderBy(companySites.name);

    res.json({ data: rows.map(serializeSite), total: rows.length });
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/sites ──────────────────────────────────────────────────

router.post(
  '/',
  requireModule('gestion', 'sedes'),
  requireAdmin,
  validate(createSiteSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const body = req.body as z.infer<typeof createSiteSchema>;

      const [created] = await db
        .insert(companySites)
        .values({ ...body, companyId })
        .returning();

      await logAudit(db, companyId, {
        entity: 'sites',
        entityId: toId('site', created.id),
        action: 'create',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Sede "${created.name}" creada.`,
      });

      res.status(201).json(serializeSite(created));
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /company/:id/sites/:siteId ──────────────────────────────────────────

router.put(
  '/:siteId',
  requireModule('gestion', 'sedes'),
  requireAdmin,
  validate(updateSiteSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const siteId = parseId('site', req.params.siteId);
      const body = req.body as z.infer<typeof updateSiteSchema>;

      const existing = await db
        .select()
        .from(companySites)
        .where(and(eq(companySites.id, siteId), eq(companySites.companyId, companyId)))
        .limit(1);

      if (!existing.length) throw new NotFoundError('Sede', req.params.siteId);

      const [updated] = await db
        .update(companySites)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(companySites.id, siteId), eq(companySites.companyId, companyId)))
        .returning();

      await logAudit(db, companyId, {
        entity: 'sites',
        entityId: toId('site', updated.id),
        action: 'update',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Sede "${updated.name}" actualizada.`,
      });

      res.json(serializeSite(updated));
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /company/:id/sites/:siteId ───────────────────────────────────────

router.delete(
  '/:siteId',
  requireModule('gestion', 'sedes'),
  requireAdmin,
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const siteId = parseId('site', req.params.siteId);

      const existing = await db
        .select()
        .from(companySites)
        .where(and(eq(companySites.id, siteId), eq(companySites.companyId, companyId)))
        .limit(1);

      if (!existing.length) throw new NotFoundError('Sede', req.params.siteId);

      await db
        .delete(companySites)
        .where(and(eq(companySites.id, siteId), eq(companySites.companyId, companyId)));

      await logAudit(db, companyId, {
        entity: 'sites',
        entityId: toId('site', siteId),
        action: 'delete',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Sede "${existing[0].name}" eliminada.`,
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Serializer ───────────────────────────────────────────────────────────────

function serializeSite(s: typeof companySites.$inferSelect) {
  return {
    id: toId('site', s.id),
    companyId: toId('company', s.companyId),
    code: s.code,
    name: s.name,
    city: s.city,
    address: s.address,
    contact: s.contact,
    status: s.status,
    notes: s.notes,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}
export default router;