import { Router } from 'express';
import { z } from 'zod';
import { eq, and, ilike, or } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyAssets } from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { NotFoundError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';

const router = Router({ mergeParams: true });

// ─── Schemas ─────────────────────────────────────────────────────────────────

const ASSET_TYPES = ['Vehiculo', 'Maquinaria', 'Motor', 'Planta electrica'] as const;
const ASSET_STATUSES = ['Operativo', 'En mantenimiento', 'Fuera de servicio'] as const;

const createAssetSchema = z.object({
  code: z.string().min(1, 'El código es requerido'),
  name: z.string().min(1, 'El nombre es requerido'),
  assetType: z.enum(ASSET_TYPES).optional(),
  category: z.string().optional(),
  status: z.enum(ASSET_STATUSES).default('Operativo'),
  siteId: z.string().optional().nullable(), // "site-N" | null
  garageId: z.string().optional().nullable(),
  responsible: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  serial: z.string().optional(),
  plate: z.string().optional(),
  year: z.string().optional(),
  color: z.string().optional(),
  maxLoad: z.string().optional(),
  fuelType: z.string().optional(),
  oilType: z.string().optional(),
  oilCapacity: z.string().optional(),
  location: z.string().optional(),
  availability: z.string().optional(),
  observations: z.string().optional(),
  photoUrls: z.array(z.string()).default([]),
});

const updateAssetSchema = createAssetSchema.partial();

// ─── GET /company/:id/assets ──────────────────────────────────────────────────
// Query: ?status=Operativo &siteId=site-1 &search=placa

router.get('/', requireModule('flotas'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const { status, siteId, search, assetType } = req.query;

    const conditions = [eq(companyAssets.companyId, companyId)];

    if (status && typeof status === 'string') {
      conditions.push(eq(companyAssets.status, status as typeof ASSET_STATUSES[number]));
    }

    if (assetType && typeof assetType === 'string') {
      conditions.push(eq(companyAssets.assetType, assetType as typeof ASSET_TYPES[number]));
    }

    if (siteId && typeof siteId === 'string') {
      const parsedSiteId = parseId('site', siteId);
      conditions.push(eq(companyAssets.siteId, parsedSiteId));
    }

    let rows = await db
      .select()
      .from(companyAssets)
      .where(and(...conditions))
      .orderBy(companyAssets.name);

    // Filtro de búsqueda en memoria (placa, nombre, código)
    if (search && typeof search === 'string') {
      const q = search.toLowerCase();
      rows = rows.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.code.toLowerCase().includes(q) ||
          a.plate?.toLowerCase().includes(q)
      );
    }

    res.json({ data: rows.map(serializeAsset), total: rows.length });
  } catch (err) {
    next(err);
  }
});

// ─── GET /company/:id/assets/:assetId ────────────────────────────────────────

router.get('/:assetId', requireModule('flotas'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const assetId = parseId('asset', req.params.assetId);

    const rows = await db
      .select()
      .from(companyAssets)
      .where(and(eq(companyAssets.id, assetId), eq(companyAssets.companyId, companyId)))
      .limit(1);

    if (!rows.length) throw new NotFoundError('Activo', req.params.assetId);

    res.json(serializeAsset(rows[0]));
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/assets ─────────────────────────────────────────────────

router.post(
  '/',
  requireModule('flotas'),
  requireAdmin,
  validate(createAssetSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const body = req.body as z.infer<typeof createAssetSchema>;

      // Convertir siteId de string prefijado a número
      const siteId = body.siteId ? parseId('site', body.siteId) : null;
      const garageId = body.garageId ? parseId('garage', body.garageId) : null;

      const [created] = await db
        .insert(companyAssets)
        .values({ ...body, companyId, siteId: siteId ?? undefined, garageId: garageId ?? undefined })
        .returning();

      await logAudit(db, companyId, {
        entity: 'assets',
        entityId: toId('asset', created.id),
        action: 'create',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Activo "${created.name}"${created.plate ? ` (${created.plate})` : ''} creado.`,
      });

      res.status(201).json(serializeAsset(created));
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /company/:id/assets/:assetId ────────────────────────────────────────

router.put(
  '/:assetId',
  requireModule('flotas'),
  requireAdmin,
  validate(updateAssetSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const assetId = parseId('asset', req.params.assetId);
      const body = req.body as z.infer<typeof updateAssetSchema>;

      const existing = await db
        .select()
        .from(companyAssets)
        .where(and(eq(companyAssets.id, assetId), eq(companyAssets.companyId, companyId)))
        .limit(1);

      if (!existing.length) throw new NotFoundError('Activo', req.params.assetId);

      // Resolver siteId si viene
      const updateData: Record<string, unknown> = { ...body, updatedAt: new Date() };
      if (body.siteId !== undefined) {
        updateData.siteId = body.siteId ? parseId('site', body.siteId) : null;
      }

      if (body.garageId !== undefined) {
        updateData.garageId = body.garageId ? parseId('garage', body.garageId) : null;
      }

      const [updated] = await db
        .update(companyAssets)
        .set(updateData)
        .where(and(eq(companyAssets.id, assetId), eq(companyAssets.companyId, companyId)))
        .returning();

      await logAudit(db, companyId, {
        entity: 'assets',
        entityId: toId('asset', updated.id),
        action: 'update',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Activo "${updated.name}" actualizado.`,
      });

      res.json(serializeAsset(updated));
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /company/:id/assets/:assetId ─────────────────────────────────────

router.delete(
  '/:assetId',
  requireModule('flotas'),
  requireAdmin,
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const assetId = parseId('asset', req.params.assetId);

      const existing = await db
        .select()
        .from(companyAssets)
        .where(and(eq(companyAssets.id, assetId), eq(companyAssets.companyId, companyId)))
        .limit(1);

      if (!existing.length) throw new NotFoundError('Activo', req.params.assetId);

      await db
        .delete(companyAssets)
        .where(and(eq(companyAssets.id, assetId), eq(companyAssets.companyId, companyId)));

      await logAudit(db, companyId, {
        entity: 'assets',
        entityId: toId('asset', assetId),
        action: 'delete',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Activo "${existing[0].name}" eliminado.`,
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Serializer ───────────────────────────────────────────────────────────────

function serializeAsset(a: typeof companyAssets.$inferSelect) {
  return {
    id: toId('asset', a.id),
    companyId: toId('company', a.companyId),
    siteId: a.siteId ? toId('site', a.siteId) : null,
    code: a.code,
    name: a.name,
    assetType: a.assetType,
    category: a.category,
    status: a.status,
    responsible: a.responsible,
    brand: a.brand,
    model: a.model,
    serial: a.serial,
    plate: a.plate,
    year: a.year,
    color: a.color,
    maxLoad: a.maxLoad,
    fuelType: a.fuelType,
    oilType: a.oilType,
    oilCapacity: a.oilCapacity,
    location: a.location,
    availability: a.availability,
    observations: a.observations,
    photoUrls: a.photoUrls ?? [],
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    garageId: a.garageId ? toId('garage', a.garageId) : null,
  };
}

export default router;