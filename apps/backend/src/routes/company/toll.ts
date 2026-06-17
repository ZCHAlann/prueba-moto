// routes/company/toll.ts
//
// Endpoints CRUD de peajes. Espejo de `fuel.ts` con los campos propios
// de peajes (tollName, amount, paymentMethod, route, axes).

import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyTollEntries, companyAssets, companyDrivers } from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { NotFoundError } from '../../lib/errors';
import { toId, parseId, parseIdFlexible } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { safeString, validators } from '../../lib/validators';

const router = Router({ mergeParams: true });

// ─── Schemas ─────────────────────────────────────────────────────────────────

const TOLL_CATEGORIES = ['Urbano', 'Nacional', 'Departamental', 'Municipal', 'Privado'] as const;
const PAYMENT_METHODS = ['Efectivo', 'Tarjeta', 'Transferencia', 'Tag', 'Pase', 'Otro'] as const;

const createTollSchema = z.object({
  assetId:       z.string().min(1, 'El activo es requerido'),
  driverId:      z.string().optional().nullable(),
  date:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)'),
  tollName:      safeString({ min: 2, max: 200, fieldLabel: 'Nombre del peaje', allowEmpty: false }),
  category:      z.enum(TOLL_CATEGORIES).optional().nullable(),
  amount:        z.number().nonnegative('El monto no puede ser negativo').max(1_000_000_000),
  paymentMethod: z.enum(PAYMENT_METHODS).optional().nullable(),
  route:         safeString({ max: 200, fieldLabel: 'Ruta', allowEmpty: true }).nullable().optional(),
  odometer:      z.number().nonnegative().max(100_000_000).optional().nullable(),
  axes:          z.number().int().min(1).max(12).optional().nullable(),
  notes:         validators.longTextOptional,
  photoUrl:      z.string().min(1).max(2_000_000).nullable().optional(),
});

const updateTollSchema = createTollSchema.partial();

// ─── GET /company/:id/toll ────────────────────────────────────────────────────
// Query: ?assetId=asset-1 &driverId=driver-1 &from=YYYY-MM-DD &to=YYYY-MM-DD

router.get('/', requireModule('peajes', 'peajes'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const { assetId, driverId, from, to } = req.query;

    let rows = await db
      .select()
      .from(companyTollEntries)
      .where(eq(companyTollEntries.companyId, companyId))
      .orderBy(companyTollEntries.date);

    if (assetId && typeof assetId === 'string') {
      const parsedAssetId = parseIdFlexible('asset', assetId);
      rows = rows.filter((t) => t.assetId === parsedAssetId);
    }

    if (driverId && typeof driverId === 'string') {
      const parsedDriverId = parseIdFlexible('driver', driverId);
      rows = rows.filter((t) => t.driverId === parsedDriverId);
    }

    if (from && typeof from === 'string') {
      rows = rows.filter((t) => t.date >= from);
    }
    if (to && typeof to === 'string') {
      rows = rows.filter((t) => t.date <= to);
    }

    // ── Enrichment: assets (igual que fuel, para el dropdown del modal) ──
    const assetsRows = await db
      .select({ id: companyAssets.id, plate: companyAssets.plate, brand: companyAssets.brand, model: companyAssets.model })
      .from(companyAssets)
      .where(eq(companyAssets.companyId, companyId));

    const assetMap = new Map(assetsRows.map(a => [a.id, { plate: a.plate, brand: a.brand, model: a.model }]));

    res.json({
      data: rows.map(t => serializeToll(t, assetMap.get(t.assetId))),
      total: rows.length,
      assets: assetsRows.map(a => ({
        id: toId('asset', a.id),
        plate: a.plate,
        brand: a.brand,
        model: a.model,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /company/:id/toll/:tollId ────────────────────────────────────────────

router.get('/:tollId', requireModule('peajes', 'peajes'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const tollId = parseId('toll', req.params.tollId);

    const rows = await db
      .select()
      .from(companyTollEntries)
      .where(and(eq(companyTollEntries.id, tollId), eq(companyTollEntries.companyId, companyId)))
      .limit(1);

    if (!rows.length) throw new NotFoundError('Registro de peaje', req.params.tollId);

    const [assetInfo] = await db
      .select({ plate: companyAssets.plate, brand: companyAssets.brand, model: companyAssets.model })
      .from(companyAssets)
      .where(eq(companyAssets.id, rows[0].assetId))
      .limit(1);

    res.json(serializeToll(rows[0], assetInfo ?? null));
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/toll ───────────────────────────────────────────────────

router.post(
  '/',
  requireModule('peajes', 'peajes'),
  validate(createTollSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const body = req.body as z.infer<typeof createTollSchema>;

      const assetId = parseIdFlexible('asset', body.assetId);
      const driverId = body.driverId ? parseIdFlexible('driver', body.driverId) : null;

      const [asset] = await db
        .select()
        .from(companyAssets)
        .where(and(eq(companyAssets.id, assetId), eq(companyAssets.companyId, companyId)))
        .limit(1);
      if (!asset) throw new NotFoundError('Activo', body.assetId);

      if (driverId) {
        const [driver] = await db
          .select()
          .from(companyDrivers)
          .where(and(eq(companyDrivers.id, driverId), eq(companyDrivers.companyId, companyId)))
          .limit(1);
        if (!driver) throw new NotFoundError('Conductor', body.driverId!);
      }

      const [created] = await db
        .insert(companyTollEntries)
        .values({
          companyId,
          assetId,
          driverId: driverId ?? null,
          date:          body.date,
          tollName:      body.tollName,
          category:      body.category ?? null,
          amount:        String(body.amount),
          paymentMethod: body.paymentMethod ?? null,
          route:         body.route ?? null,
          odometer:      body.odometer !== undefined && body.odometer !== null ? String(body.odometer) : null,
          axes:          body.axes ?? null,
          notes:         body.notes ?? null,
          photoUrl:      body.photoUrl ?? null,
        })
        .returning();

      await logAudit(db, companyId, {
        entity: 'toll',
        entityId: toId('toll', created.id),
        action: 'create',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Peaje "${body.tollName}" registrado por ${body.amount} para "${asset.plate}".`,
      });

      res.status(201).json(serializeToll(created, { plate: asset.plate, brand: asset.brand, model: asset.model }));
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /company/:id/toll/:tollId ────────────────────────────────────────────

router.put(
  '/:tollId',
  requireModule('peajes', 'peajes'),
  requireAdmin,
  validate(updateTollSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const tollId = parseId('toll', req.params.tollId);
      const body = req.body as z.infer<typeof updateTollSchema>;

      const [existing] = await db
        .select()
        .from(companyTollEntries)
        .where(and(eq(companyTollEntries.id, tollId), eq(companyTollEntries.companyId, companyId)))
        .limit(1);

      if (!existing) throw new NotFoundError('Registro de peaje', req.params.tollId);

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (body.assetId !== undefined) updateData.assetId = parseIdFlexible('asset', body.assetId!);
      if (body.driverId !== undefined) updateData.driverId = body.driverId ? parseIdFlexible('driver', body.driverId) : null;
      if (body.date          !== undefined) updateData.date = body.date;
      if (body.tollName      !== undefined) updateData.tollName = body.tollName;
      if (body.category      !== undefined) updateData.category = body.category;
      if (body.amount        !== undefined) updateData.amount = String(body.amount);
      if (body.paymentMethod !== undefined) updateData.paymentMethod = body.paymentMethod;
      if (body.route         !== undefined) updateData.route = body.route;
      if (body.odometer      !== undefined) updateData.odometer = body.odometer !== null ? String(body.odometer) : null;
      if (body.axes          !== undefined) updateData.axes = body.axes;
      if (body.notes         !== undefined) updateData.notes = body.notes;
      if (body.photoUrl      !== undefined) updateData.photoUrl = body.photoUrl;

      const [updated] = await db
        .update(companyTollEntries)
        .set(updateData)
        .where(and(eq(companyTollEntries.id, tollId), eq(companyTollEntries.companyId, companyId)))
        .returning();

      await logAudit(db, companyId, {
        entity: 'toll',
        entityId: toId('toll', updated.id),
        action: 'update',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Registro de peaje "${toId('toll', updated.id)}" actualizado.`,
      });

      const [assetInfo] = await db
        .select({ plate: companyAssets.plate, brand: companyAssets.brand, model: companyAssets.model })
        .from(companyAssets)
        .where(eq(companyAssets.id, updated.assetId))
        .limit(1);

      res.json(serializeToll(updated, assetInfo ?? null));
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /company/:id/toll/:tollId ─────────────────────────────────────────

router.delete(
  '/:tollId',
  requireModule('peajes', 'peajes'),
  requireAdmin,
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const tollId = parseId('toll', req.params.tollId);

      const [existing] = await db
        .select()
        .from(companyTollEntries)
        .where(and(eq(companyTollEntries.id, tollId), eq(companyTollEntries.companyId, companyId)))
        .limit(1);

      if (!existing) throw new NotFoundError('Registro de peaje', req.params.tollId);

      await db
        .delete(companyTollEntries)
        .where(and(eq(companyTollEntries.id, tollId), eq(companyTollEntries.companyId, companyId)));

      await logAudit(db, companyId, {
        entity: 'toll',
        entityId: toId('toll', tollId),
        action: 'delete',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Registro de peaje eliminado.`,
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Serializer ───────────────────────────────────────────────────────────────

function serializeToll(
  t: typeof companyTollEntries.$inferSelect,
  assetInfo?: { plate: string | null; brand: string | null; model: string | null } | null
) {
  return {
    id:            toId('toll', t.id),
    companyId:     toId('company', t.companyId),
    assetId:       toId('asset', t.assetId),
    driverId:      t.driverId ? toId('driver', t.driverId) : null,
    date:          t.date,
    tollName:      t.tollName,
    category:      t.category,
    amount:        Number(t.amount),
    paymentMethod: t.paymentMethod,
    route:         t.route,
    odometer:      t.odometer !== null ? Number(t.odometer) : null,
    axes:          t.axes,
    notes:         t.notes,
    photoUrl:      t.photoUrl,
    // Enrichment: datos del activo para display sin hooks externos
    assetPlate: assetInfo?.plate ?? null,
    assetBrand: assetInfo?.brand ?? null,
    assetModel: assetInfo?.model ?? null,
    createdAt:   t.createdAt,
    updatedAt:   t.updatedAt,
  };
}

export default router;
