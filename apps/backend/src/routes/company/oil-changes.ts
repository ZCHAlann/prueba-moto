import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyOilChanges, companyOilTypes, companyAssets } from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { requireSupervisor } from '../../middlewares/requireSupervisor';
import { NotFoundError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';

const router = Router({ mergeParams: true });

const createOilChangeSchema = z.object({
  assetId: z.string().min(1, 'El activo es requerido'),
  oilTypeId: z.string().min(1, 'El tipo de aceite es requerido'),
  date: z.string().min(1, 'La fecha es requerida'),
  reading: z.number().nonnegative(),
  nextReading: z.number().nonnegative(),
  quantity: z.number().positive(),
  technician: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// GET /company/:id/oil-changes
router.get('/', requireModule('inventario'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;

    const rows = await db
      .select({
        change: companyOilChanges,
        asset: companyAssets,
        oilType: companyOilTypes,
      })
      .from(companyOilChanges)
      .innerJoin(companyAssets, eq(companyOilChanges.assetId, companyAssets.id))
      .innerJoin(companyOilTypes, eq(companyOilChanges.oilTypeId, companyOilTypes.id))
      .where(eq(companyOilChanges.companyId, companyId))
      .orderBy(companyOilChanges.createdAt);

    res.json({ data: rows.map(serializeWithJoins), total: rows.length });
  } catch (err) {
    next(err);
  }
});

// POST /company/:id/oil-changes
router.post(
  '/',
  requireModule('inventario'),
  requireSupervisor,
  validate(createOilChangeSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const body = req.body as z.infer<typeof createOilChangeSchema>;

      const assetId = parseId('asset', body.assetId);
      const oilTypeId = parseId('oil', body.oilTypeId);

      // Verificar que el activo pertenece a esta empresa
      const asset = await db
        .select()
        .from(companyAssets)
        .where(and(eq(companyAssets.id, assetId), eq(companyAssets.companyId, companyId)))
        .limit(1);
      if (!asset.length) throw new NotFoundError('Activo', body.assetId);

      // Verificar que el tipo de aceite pertenece a esta empresa
      const oilType = await db
        .select()
        .from(companyOilTypes)
        .where(and(eq(companyOilTypes.id, oilTypeId), eq(companyOilTypes.companyId, companyId)))
        .limit(1);
      if (!oilType.length) throw new NotFoundError('Tipo de aceite', body.oilTypeId);

      const [created] = await db
        .insert(companyOilChanges)
        .values({ ...body, companyId, assetId, oilTypeId })
        .returning();

      // Descontar stock del aceite
      await db
        .update(companyOilTypes)
        .set({
          stock: Math.max(0, (oilType[0].stock ?? 0) - body.quantity),
          updatedAt: new Date(),
        })
        .where(eq(companyOilTypes.id, oilTypeId));

      await logAudit(db, companyId, {
        entity: 'oil_changes',
        entityId: toId('oil-change', created.id),
        action: 'create',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Cambio de aceite registrado para "${asset[0].name}" con "${oilType[0].name}".`,
      });

      // Devolver con joins para que el frontend tenga toda la info
      const full = await db
        .select({
          change: companyOilChanges,
          asset: companyAssets,
          oilType: companyOilTypes,
        })
        .from(companyOilChanges)
        .innerJoin(companyAssets, eq(companyOilChanges.assetId, companyAssets.id))
        .innerJoin(companyOilTypes, eq(companyOilChanges.oilTypeId, companyOilTypes.id))
        .where(eq(companyOilChanges.id, created.id))
        .limit(1);

      res.status(201).json(serializeWithJoins(full[0]));
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /company/:id/oil-changes/:changeId
router.delete(
  '/:changeId',
  requireModule('inventario'),
  requireAdmin,
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const changeId = parseId('oil-change', req.params.changeId);

      const existing = await db
        .select()
        .from(companyOilChanges)
        .where(and(eq(companyOilChanges.id, changeId), eq(companyOilChanges.companyId, companyId)))
        .limit(1);

      if (!existing.length) throw new NotFoundError('Cambio de aceite', req.params.changeId);

      await db
        .delete(companyOilChanges)
        .where(and(eq(companyOilChanges.id, changeId), eq(companyOilChanges.companyId, companyId)));

      await logAudit(db, companyId, {
        entity: 'oil_changes',
        entityId: toId('oil-change', changeId),
        action: 'delete',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Cambio de aceite eliminado.`,
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

function serializeWithJoins(row: {
  change: typeof companyOilChanges.$inferSelect;
  asset: typeof companyAssets.$inferSelect;
  oilType: typeof companyOilTypes.$inferSelect;
}) {
  const { change, asset, oilType } = row;
  return {
    id: toId('oil-change', change.id),
    companyId: toId('company', change.companyId),
    assetId: toId('asset', change.assetId),
    assetCode: asset.code,
    assetName: asset.name,
    oilTypeId: toId('oil', change.oilTypeId),
    oilName: oilType.name,
    date: change.date,
    reading: change.reading,
    nextReading: change.nextReading,
    quantity: change.quantity,
    technician: change.technician,
    notes: change.notes,
    createdAt: change.createdAt,
  };
}

export default router;