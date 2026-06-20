import { Router } from 'express';
import { z } from 'zod';
import { eq, and, ilike, or, desc, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyAssets, companyAssignments, companyDrivers } from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule, requireModuleAny } from '../../middlewares/requireModule';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { NotFoundError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { validators, safeString } from '../../lib/validators';

const router = Router({ mergeParams: true });

// ─── Schemas ─────────────────────────────────────────────────────────────────

const ASSET_TYPES = ['Vehiculo', 'Maquinaria', 'Motor', 'Planta electrica'] as const;
const ASSET_STATUSES = ['Operativo', 'En mantenimiento', 'Fuera de servicio'] as const;

const createAssetSchema = z.object({
  code: z.string().trim().min(1, 'El código es requerido').max(40),
  name: safeString({ min: 2, max: 120, fieldLabel: 'Nombre', allowEmpty: false }),
  assetType: z.enum(ASSET_TYPES).optional(),
  category: safeString({ max: 80, fieldLabel: 'Categoría', allowEmpty: true }).nullable().optional(),
  status: z.enum(ASSET_STATUSES).default('Operativo'),
  siteId: z.string().optional().nullable(),
  garageId: z.string().optional().nullable(),
  responsible: z.string().optional(),
  brand: safeString({ max: 80, fieldLabel: 'Marca', allowEmpty: true }).nullable().optional(),
  model: safeString({ max: 80, fieldLabel: 'Modelo', allowEmpty: true }).nullable().optional(),
  serial: safeString({ max: 60, fieldLabel: 'Serie', allowEmpty: true }).nullable().optional(),
  plate: validators.plateOptional,
  year: z.union([z.string(), z.number()]).optional().transform((v) => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }),
  color: safeString({ max: 40, fieldLabel: 'Color', allowEmpty: true }).nullable().optional(),
  maxLoad: z.string().optional(),
  fuelType: z.enum(['Diesel', 'Gasolina', 'Electrico', 'Hibrido']).optional().nullable(),
  oilType: safeString({ max: 60, fieldLabel: 'Aceite', allowEmpty: true }).nullable().optional(),
  oilCapacity: z.string().optional(),
  location: safeString({ max: 200, fieldLabel: 'Ubicación', allowEmpty: true }).nullable().optional(),
  availability: z.string().optional(),
  observations: validators.longTextOptional,
  photoUrls: z.array(z.string().max(2_000_000)).max(20).default([]),
});

const updateAssetSchema = createAssetSchema.partial();

// ─── GET /company/:id/assets ──────────────────────────────────────────────────
// Query: ?status=Operativo &siteId=site-1 &search=placa

// El listado de activos sirve tanto al módulo "gestion" (Flotas) como a
// "mantenimiento" (el form de mantenimiento necesita elegir vehículo).
router.get('/', requireModuleAny([
  { module: 'gestion', submodule: 'flotas' },
  { module: 'mantenimiento', submodule: 'execution' },
]), async (req, res, next) => {
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

    // ── Enrichment: cargar conductor actual via asignación activa ──────────────
    const activeAssignments = await db
      .select({
        assetId:    companyAssignments.assetId,
        driverId:   companyAssignments.driverId,
        driverName: companyDrivers.firstName,
      })
      .from(companyAssignments)
      .leftJoin(companyDrivers, eq(companyAssignments.driverId, companyDrivers.id))
      .where(and(
        eq(companyAssignments.companyId, companyId),
        eq(companyAssignments.status, 'Activa')
      ))
      .orderBy(desc(companyAssignments.createdAt));

    // Quedarse con la asignación más reciente por assetId
    const driverMap = new Map<number, { id: string; firstName: string; lastName: string; phone: string | null }>();
    for (const a of activeAssignments) {
      if (a.assetId && !driverMap.has(a.assetId)) {
        driverMap.set(a.assetId, {
          id:        toId('driver', a.driverId),
          name:      a.driverName ?? '',
          firstName: a.driverName ?? '',
          lastName:  '',
          phone:     null,
        });
      }
    }

    res.json({
      data: rows.map((a) => serializeAsset(a, driverMap.get(a.id))),
      total: rows.length,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /company/:id/assets/:assetId ────────────────────────────────────────

router.get('/:assetId', requireModule('gestion', 'flotas'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const assetId = parseId('asset', req.params.assetId);

    const rows = await db
      .select()
      .from(companyAssets)
      .where(and(eq(companyAssets.id, assetId), eq(companyAssets.companyId, companyId)))
      .limit(1);

    if (!rows.length) throw new NotFoundError('Activo', req.params.assetId);

    // ── Enrichment: cargar conductor actual via asignación activa ──────────────
    const [assignment] = await db
      .select({
        driverId:   companyAssignments.driverId,
        driverName: companyDrivers.firstName,
      })
      .from(companyAssignments)
      .leftJoin(companyDrivers, eq(companyAssignments.driverId, companyDrivers.id))
      .where(and(
        eq(companyAssignments.assetId, assetId),
        eq(companyAssignments.companyId, companyId),
        eq(companyAssignments.status, 'Activa')
      ))
      .orderBy(desc(companyAssignments.createdAt))
      .limit(1);

    const currentDriver = assignment?.driverId
    ? {
        id:        toId('driver', assignment.driverId),
        name:      assignment.driverName ?? '',
        firstName: assignment.driverName ?? '',
        lastName:  '',
        phone:     null,
      }
    : null;
    res.json(serializeAsset(rows[0], currentDriver));
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/assets ─────────────────────────────────────────────────

router.post(
  '/',
  requireModule('gestion', 'flotas'),
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
  requireModule('gestion', 'flotas'),
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

// ─── PATCH /company/:id/assets/:assetId/toggle ────────────────────────────────

router.patch(
  '/:assetId/toggle',
  requireModule('gestion', 'flotas'),
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

      const current = existing[0];
      // Toggle between "Operativo" and "Fuera de servicio"
      const newStatus = current.status === 'Operativo' ? 'Fuera de servicio' : 'Operativo';

      const [updated] = await db
        .update(companyAssets)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(and(eq(companyAssets.id, assetId), eq(companyAssets.companyId, companyId)))
        .returning();

      await logAudit(db, companyId, {
        entity: 'assets',
        entityId: toId('asset', updated.id),
        action: newStatus === 'Operativo' ? 'activate' : 'deactivate',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Activo "${updated.name}" ${newStatus === 'Operativo' ? 'activado' : 'desactivado'}.`,
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
  requireModule('gestion', 'flotas'),
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

function serializeAsset(
  a: typeof companyAssets.$inferSelect,
  currentDriver?: { id: string; firstName: string; lastName: string; phone: string | null } | null
) {
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
    // ── Enrichment: conductor asignado actualmente ──────────────────────────
    currentDriver: currentDriver ?? null,
  };
}

export default router;