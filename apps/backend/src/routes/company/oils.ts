import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyOilTypes } from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { requireSupervisor } from '../../middlewares/requireSupervisor';
import { NotFoundError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';

const router = Router({ mergeParams: true });

const createOilSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  brand: z.string().optional().nullable(),
  viscosity: z.string().optional().nullable(),
  application: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  stock: z.number().nonnegative().optional().nullable(),
  minStock: z.number().nonnegative().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const updateOilSchema = createOilSchema.partial();

// GET /company/:id/oils
router.get('/', requireModule('inventario'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const rows = await db
      .select()
      .from(companyOilTypes)
      .where(eq(companyOilTypes.companyId, companyId))
      .orderBy(companyOilTypes.name);

    res.json({ data: rows.map(serialize), total: rows.length });
  } catch (err) {
    next(err);
  }
});

// POST /company/:id/oils
router.post('/', requireModule('inventario'), requireSupervisor, validate(createOilSchema), async (req, res, next) => {
  console.log('user:', req.user);
  console.log('companyId:', req.companyId);
    try {
      const companyId = req.companyId!;
      const body = req.body as z.infer<typeof createOilSchema>;

      const [created] = await db
        .insert(companyOilTypes)
        .values({ ...body, companyId })
        .returning();

      await logAudit(db, companyId, {
        entity: 'oil_types',
        entityId: toId('oil', created.id),
        action: 'create',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Aceite "${created.name}" creado.`,
      });

      res.status(201).json(serialize(created));
    } catch (err) {
      next(err);
    }
  }
);

// PUT /company/:id/oils/:oilId
router.put(
  '/:oilId',
  requireModule('inventario'),
  requireSupervisor,
  validate(updateOilSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const oilId = parseId('oil', req.params.oilId);
      const body = req.body as z.infer<typeof updateOilSchema>;

      const existing = await db
        .select()
        .from(companyOilTypes)
        .where(and(eq(companyOilTypes.id, oilId), eq(companyOilTypes.companyId, companyId)))
        .limit(1);

      if (!existing.length) throw new NotFoundError('Aceite', req.params.oilId);

      const [updated] = await db
        .update(companyOilTypes)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(companyOilTypes.id, oilId), eq(companyOilTypes.companyId, companyId)))
        .returning();

      await logAudit(db, companyId, {
        entity: 'oil_types',
        entityId: toId('oil', updated.id),
        action: 'update',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Aceite "${updated.name}" actualizado.`,
      });

      res.json(serialize(updated));
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /company/:id/oils/:oilId
router.delete(
  '/:oilId',
  requireModule('inventario'),
  requireAdmin,
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const oilId = parseId('oil', req.params.oilId);

      const existing = await db
        .select()
        .from(companyOilTypes)
        .where(and(eq(companyOilTypes.id, oilId), eq(companyOilTypes.companyId, companyId)))
        .limit(1);

      if (!existing.length) throw new NotFoundError('Aceite', req.params.oilId);

      await db
        .delete(companyOilTypes)
        .where(and(eq(companyOilTypes.id, oilId), eq(companyOilTypes.companyId, companyId)));

      await logAudit(db, companyId, {
        entity: 'oil_types',
        entityId: toId('oil', oilId),
        action: 'delete',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Aceite "${existing[0].name}" eliminado.`,
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

function serialize(o: typeof companyOilTypes.$inferSelect) {
  return {
    id: toId('oil', o.id),
    companyId: toId('company', o.companyId),
    name: o.name,
    brand: o.brand,
    viscosity: o.viscosity,
    application: o.application,
    unit: o.unit ?? 'gal',
    stock: o.stock ?? 0,
    minStock: o.minStock ?? 0,
    notes: o.notes,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

export default router;