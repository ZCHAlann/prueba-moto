import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyFuelEntries, companyAssets, companyDrivers } from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { requireSupervisor } from '../../middlewares/requireSupervisor';
import { NotFoundError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';

const router = Router({ mergeParams: true });

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createFuelSchema = z.object({
  assetId: z.string().min(1, 'El activo es requerido'),
  driverId: z.string().optional().nullable(),
  date: z.string().min(1, 'La fecha es requerida'),
  liters: z.number().positive('Los litros deben ser mayores a 0'),
  cost: z.number().nonnegative().optional().nullable(),
  odometer: z.number().nonnegative().optional().nullable(),
  station: z.string().optional().nullable(),
  fuelType: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const updateFuelSchema = createFuelSchema.partial();

// ─── GET /company/:id/fuel ────────────────────────────────────────────────────
// Query: ?assetId=asset-1 &driverId=driver-1 &from=2024-01-01 &to=2024-12-31

router.get('/', requireModule('combustible'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const { assetId, driverId, from, to } = req.query;

    let rows = await db
      .select()
      .from(companyFuelEntries)
      .where(eq(companyFuelEntries.companyId, companyId))
      .orderBy(companyFuelEntries.date);

    if (assetId && typeof assetId === 'string') {
      const parsedAssetId = parseId('asset', assetId);
      rows = rows.filter((f) => f.assetId === parsedAssetId);
    }

    if (driverId && typeof driverId === 'string') {
      const parsedDriverId = parseId('driver', driverId);
      rows = rows.filter((f) => f.driverId === parsedDriverId);
    }

    if (from && typeof from === 'string') {
      rows = rows.filter((f) => f.date >= from);
    }

    if (to && typeof to === 'string') {
      rows = rows.filter((f) => f.date <= to);
    }

    // ── Enrichment: cargar nombres de activos ─────────────────────────────────
    const assetsRows = await db
      .select({ id: companyAssets.id, plate: companyAssets.plate, brand: companyAssets.brand, model: companyAssets.model })
      .from(companyAssets)
      .where(eq(companyAssets.companyId, companyId));

    const assetMap = new Map(assetsRows.map(a => [a.id, { plate: a.plate, brand: a.brand, model: a.model }]));

    res.json({
      data: rows.map(f => serializeFuel(f, assetMap.get(f.assetId))),
      total: rows.length,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /company/:id/fuel/:fuelId ────────────────────────────────────────────

router.get('/:fuelId', requireModule('combustible'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const fuelId = parseId('fuel', req.params.fuelId);

    const rows = await db
      .select()
      .from(companyFuelEntries)
      .where(and(eq(companyFuelEntries.id, fuelId), eq(companyFuelEntries.companyId, companyId)))
      .limit(1);

    if (!rows.length) throw new NotFoundError('Registro de combustible', req.params.fuelId);

    // ── Enrichment ────────────────────────────────────────────────────────────
    const [assetInfo] = await db
      .select({ plate: companyAssets.plate, brand: companyAssets.brand, model: companyAssets.model })
      .from(companyAssets)
      .where(eq(companyAssets.id, rows[0].assetId))
      .limit(1);

    res.json(serializeFuel(rows[0], assetInfo ?? null));
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/fuel ───────────────────────────────────────────────────

router.post(
  '/',
  requireModule('combustible'),
  requireSupervisor,
  validate(createFuelSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const body = req.body as z.infer<typeof createFuelSchema>;

      const assetId = parseId('asset', body.assetId);
      const driverId = body.driverId ? parseId('driver', body.driverId) : null;

      // Verificar que el activo pertenece a esta empresa
      const asset = await db
        .select()
        .from(companyAssets)
        .where(and(eq(companyAssets.id, assetId), eq(companyAssets.companyId, companyId)))
        .limit(1);
      if (!asset.length) throw new NotFoundError('Activo', body.assetId);

      // Verificar conductor si viene
      if (driverId) {
        const driver = await db
          .select()
          .from(companyDrivers)
          .where(and(eq(companyDrivers.id, driverId), eq(companyDrivers.companyId, companyId)))
          .limit(1);
        if (!driver.length) throw new NotFoundError('Conductor', body.driverId!);
      }

      const [created] = await db
        .insert(companyFuelEntries)
        .values({
          ...body,
          companyId,
          assetId,
          driverId: driverId ?? undefined,
          liters: String(body.liters),
          cost: body.cost !== undefined && body.cost !== null ? String(body.cost) : undefined,
          odometer: body.odometer !== undefined && body.odometer !== null ? String(body.odometer) : undefined,
        })
        .returning();

      await logAudit(db, companyId, {
        entity: 'fuel',
        entityId: toId('fuel', created.id),
        action: 'create',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Carga de combustible registrada: ${body.liters}L para "${asset[0].name}".`,
      });

      res.status(201).json(serializeFuel(created, { plate: asset[0].plate, brand: asset[0].brand, model: asset[0].model }));
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /company/:id/fuel/:fuelId ────────────────────────────────────────────

router.put(
  '/:fuelId',
  requireModule('combustible'),
  requireAdmin,
  validate(updateFuelSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const fuelId = parseId('fuel', req.params.fuelId);
      const body = req.body as z.infer<typeof updateFuelSchema>;

      const existing = await db
        .select()
        .from(companyFuelEntries)
        .where(and(eq(companyFuelEntries.id, fuelId), eq(companyFuelEntries.companyId, companyId)))
        .limit(1);

      if (!existing.length) throw new NotFoundError('Registro de combustible', req.params.fuelId);

      const updateData: Record<string, unknown> = { ...body, updatedAt: new Date() };
      if (body.assetId !== undefined) updateData.assetId = parseId('asset', body.assetId!);
      if (body.driverId !== undefined) updateData.driverId = body.driverId ? parseId('driver', body.driverId) : null;
      if (body.liters !== undefined) updateData.liters = String(body.liters);
      if (body.cost !== undefined) updateData.cost = body.cost !== null ? String(body.cost) : null;
      if (body.odometer !== undefined) updateData.odometer = body.odometer !== null ? String(body.odometer) : null;

      const [updated] = await db
        .update(companyFuelEntries)
        .set(updateData)
        .where(and(eq(companyFuelEntries.id, fuelId), eq(companyFuelEntries.companyId, companyId)))
        .returning();

      await logAudit(db, companyId, {
        entity: 'fuel',
        entityId: toId('fuel', updated.id),
        action: 'update',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Registro de combustible "${toId('fuel', updated.id)}" actualizado.`,
      });

      // ── Enrichment ────────────────────────────────────────────────────────────
      const [assetInfo] = await db
        .select({ plate: companyAssets.plate, brand: companyAssets.brand, model: companyAssets.model })
        .from(companyAssets)
        .where(eq(companyAssets.id, updated.assetId))
        .limit(1);

      res.json(serializeFuel(updated, assetInfo ?? null));
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /company/:id/fuel/:fuelId ─────────────────────────────────────────

router.delete(
  '/:fuelId',
  requireModule('combustible'),
  requireAdmin,
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const fuelId = parseId('fuel', req.params.fuelId);

      const existing = await db
        .select()
        .from(companyFuelEntries)
        .where(and(eq(companyFuelEntries.id, fuelId), eq(companyFuelEntries.companyId, companyId)))
        .limit(1);

      if (!existing.length) throw new NotFoundError('Registro de combustible', req.params.fuelId);

      await db
        .delete(companyFuelEntries)
        .where(and(eq(companyFuelEntries.id, fuelId), eq(companyFuelEntries.companyId, companyId)));

      await logAudit(db, companyId, {
        entity: 'fuel',
        entityId: toId('fuel', fuelId),
        action: 'delete',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Registro de combustible eliminado.`,
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Serializer ───────────────────────────────────────────────────────────────

function serializeFuel(
  f: typeof companyFuelEntries.$inferSelect,
  assetInfo?: { plate: string | null; brand: string | null; model: string | null } | null
) {
  return {
    id: toId('fuel', f.id),
    companyId: toId('company', f.companyId),
    assetId: toId('asset', f.assetId),
    driverId: f.driverId ? toId('driver', f.driverId) : null,
    date: f.date,
    liters: Number(f.liters),
    cost: f.cost !== null ? Number(f.cost) : null,
    odometer: f.odometer !== null ? Number(f.odometer) : null,
    station: f.station,
    fuelType: f.fuelType,
    notes: f.notes,
    // ── Enrichment: datos del activo para display sin hooks externos ─────────
    assetPlate: assetInfo?.plate ?? null,
    assetBrand: assetInfo?.brand ?? null,
    assetModel: assetInfo?.model ?? null,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}

export default router;