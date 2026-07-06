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
import { parsePageParams, buildPageResponse } from '../../lib/pagination';
import { notifyEntityCrud } from '../../lib/notify-entity';

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
    const { page, pageSize, offset } = parsePageParams(req.query as Record<string, unknown>);

    const conditions = [eq(companyAssets.companyId, companyId)];

    if (status && typeof status === 'string') {
      conditions.push(eq(companyAssets.status, status as typeof ASSET_STATUSES[number]));
    }
    if (assetType && typeof assetType === 'string') {
      conditions.push(eq(companyAssets.assetType, assetType as typeof ASSET_TYPES[number]));
    }
    if (siteId && typeof siteId === 'string') {
      try {
        const parsedSiteId = parseId('site', siteId);
        conditions.push(eq(companyAssets.siteId, parsedSiteId));
      } catch {
        conditions.push(eq(companyAssets.id, -1));
      }
    }
    if (search && typeof search === 'string' && search.trim().length > 0) {
      const q = `%${search.trim().toLowerCase()}%`;
      conditions.push(sql`(
        lower(${companyAssets.name}) like ${q}
        or lower(${companyAssets.code}) like ${q}
        or lower(coalesce(${companyAssets.plate}, '')) like ${q}
      )`);
    }
    const where = and(...conditions);

    const [rows, countRow] = await Promise.all([
      db.select().from(companyAssets).where(where)
        .orderBy(companyAssets.name).limit(pageSize).offset(offset),
      db.select({ value: sql<number>`cast(count(*) as int)` }).from(companyAssets).where(where),
    ]);

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

    const total = countRow?.[0]?.value ?? 0;
    res.json(buildPageResponse(
      rows.map((a) => serializeAsset(a, driverMap.get(a.id))),
      total, page, pageSize,
    ));
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

    // ── Enrichment: cargar asignación activa (incluye el acta completa) ───────
    const [assignmentRow] = await db
      .select({
        assignment: companyAssignments,
        driverFirst: companyDrivers.firstName,
        driverLast:  companyDrivers.lastName,
        driverPhone: companyDrivers.phone,
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

    const a = assignmentRow;
    const currentDriver = a?.assignment?.driverId
    ? {
        id:        toId('driver', a.assignment.driverId),
        name:      [a.driverFirst, a.driverLast].filter(Boolean).join(' ').trim(),
        firstName: a.driverFirst ?? '',
        lastName:  a.driverLast  ?? '',
        phone:     a.driverPhone ?? null,
      }
    : null;

    // El "acta" es la asignación activa en sí: lleva número/fecha/lugar de
    // entrega, odómetro, combustible, condición, fotos, firmas, etc.
    // Se devuelve null cuando el vehículo no tiene asignación activa.
    const currentAssignment = a?.assignment
      ? serializeAssignment(a.assignment, { firstName: a.driverFirst, lastName: a.driverLast, phone: a.driverPhone })
      : null;

    res.json(serializeAsset(rows[0], currentDriver, currentAssignment));
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

      try {
        await notifyEntityCrud({
          companyId, actorSub: req.user!.sub, actorName: req.user!.name,
          crudKind: 'entity_created', entityKey: created.type ?? 'Activo',
          entityId: created.id, entityLabel: `${created.name}${created.plate ? ` (${created.plate})` : ''}`,
        });
      } catch (err) {
        console.warn('[assets] notify falló (no crítico):', (err as Error).message);
      }

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

      try {
        await notifyEntityCrud({
          companyId, actorSub: req.user!.sub, actorName: req.user!.name,
          crudKind: 'entity_updated', entityKey: updated.type ?? 'Activo',
          entityId: updated.id, entityLabel: `${updated.name}${updated.plate ? ` (${updated.plate})` : ''}`,
        });
      } catch (err) {
        console.warn('[assets] notify falló (no crítico):', (err as Error).message);
      }

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

      try {
        await notifyEntityCrud({
          companyId, actorSub: req.user!.sub, actorName: req.user!.name,
          crudKind: 'entity_updated', entityKey: updated.type ?? 'Activo',
          entityId: updated.id, entityLabel: `${updated.name}${updated.plate ? ` (${updated.plate})` : ''}`,
          extra: {
            newStatus,
            previousStatus: current.status,
          },
        });
      } catch (err) {
        console.warn('[assets] notify toggle falló (no crítico):', (err as Error).message);
      }

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

      try {
        await notifyEntityCrud({
          companyId, actorSub: req.user!.sub, actorName: req.user!.name,
          crudKind: 'entity_deleted', entityKey: existing[0].type ?? 'Activo',
          entityId: existing[0].id, entityLabel: `${existing[0].name}${existing[0].plate ? ` (${existing[0].plate})` : ''}`,
        });
      } catch (err) {
        console.warn('[assets] notify falló (no crítico):', (err as Error).message);
      }

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Serializer ───────────────────────────────────────────────────────────────

function serializeAsset(
  a: typeof companyAssets.$inferSelect,
  currentDriver?: { id: string; firstName: string; lastName: string; phone: string | null } | null,
  currentAssignment?: ReturnType<typeof serializeAssignment> | null,
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
    // ── Enrichment: acta de asignación activa (null si no tiene) ───────────
    currentAssignment: currentAssignment ?? null,
  };
}

/**
 * Serializa una asignación (el "acta" tal como la diligencia el admin
 * al momento de entrega). Lo usa el endpoint de detalle de vehículo y
 * de conductor para devolver, en el mismo response, los datos de la
 * entrega/recepción: número de acta, fecha, hora, lugar, área, condición
 * del vehículo, fotos, firmas, novedades, etc.
 *
 * Mantenemos la forma de la respuesta estable y autoexplicativa: el
 * frontend no necesita un endpoint adicional para pintar el acta.
 */
function serializeAssignment(
  asg: typeof companyAssignments.$inferSelect,
  driver?: { firstName: string | null; lastName: string | null; phone: string | null } | null,
) {
  return {
    id:               toId('assignment', asg.id),
    status:           asg.status,
    startDate:        asg.startDate,
    endDate:          asg.endDate,
    notes:            asg.notes,
    // Datos del acta
    actaNumber:       asg.actaNumber,
    actaDate:         asg.actaDate,
    actaTime:         asg.actaTime,
    actaPlace:        asg.actaPlace,
    actaArea:         asg.actaArea,
    handoverUrl:      asg.handoverUrl,
    // Datos del vehículo al momento de la entrega
    vehicleOdometer:  asg.vehicleOdometer,
    vehicleFuelLevel: asg.vehicleFuelLevel,
    vehicleCondition: asg.vehicleCondition,
    vehiclePhotoUrls: asg.vehiclePhotoUrls ?? [],
    // Firmas digitalizadas (URLs)
    signatureLogUrl:  asg.signatureLogUrl,
    signatureRespUrl: asg.signatureRespUrl,
    // Datos del conductor congelados al momento de la entrega
    driverDni:        asg.driverDni,
    driverPhone:      asg.driverPhone,
    driverRole:       asg.driverRole,
    driverSnapshot:   driver ? {
      firstName: driver.firstName ?? null,
      lastName:  driver.lastName  ?? null,
      phone:     driver.phone     ?? null,
    } : null,
    // Novedades / accesorios
    novedades:        asg.novedades       ?? {},
    accesorios:       asg.accesorios      ?? {},
    novedadesText:    asg.novedadesText,
    createdAt:        asg.createdAt,
    updatedAt:        asg.updatedAt,
  };
}

export default router;