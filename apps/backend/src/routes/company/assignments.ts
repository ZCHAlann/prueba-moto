import { Router } from 'express';
import { z } from 'zod';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyAssignments, companyAssets, companyDrivers } from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requireSupervisor } from '../../middlewares/requireSupervisor';
import { NotFoundError, AppError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { safeString, validators } from '../../lib/validators';

const router = Router({ mergeParams: true });

// ─── Schemas ─────────────────────────────────────────────────────────────────

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)').optional().nullable();

const createAssignmentSchema = z.object({
  assetId: z.string().min(1, 'El activo es requerido'),
  driverId: z.string().min(1, 'El conductor es requerido'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)'),
  endDate: dateString,
  notes: validators.longTextOptional,
  handoverUrl: z.string().max(2_000_000).optional().nullable(),
});

const updateAssignmentSchema = createAssignmentSchema.partial();

const handoverSchema = z.object({
  // IDs / refs
  assetId:   z.string().optional().nullable(),
  driverId:  z.string().optional().nullable(),
  // Datos del acta
  actaNumber: safeString({ max: 60, fieldLabel: 'Número de acta', allowEmpty: true }).nullable().optional(),
  actaDate:   dateString,
  actaTime:   z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Hora inválida (HH:MM)').optional().nullable(),
  actaPlace:  safeString({ max: 200, fieldLabel: 'Lugar', allowEmpty: true }).nullable().optional(),
  actaArea:   safeString({ max: 200, fieldLabel: 'Área', allowEmpty: true }).nullable().optional(),
  // Conductor
  driverName:  validators.nameOptional,
  driverDni:   validators.digits10Optional,
  driverPhone: validators.phoneOptional,
  driverRole:  safeString({ max: 120, fieldLabel: 'Cargo', allowEmpty: true }).nullable().optional(),
  // Vehículo
  vehiclePlate:    validators.plateOptional,
  vehicleBrand:    safeString({ max: 80, fieldLabel: 'Marca', allowEmpty: true }).nullable().optional(),
  vehicleModel:    safeString({ max: 80, fieldLabel: 'Modelo', allowEmpty: true }).nullable().optional(),
  vehicleColor:    safeString({ max: 40, fieldLabel: 'Color', allowEmpty: true }).nullable().optional(),
  vehicleYear:     z.union([z.string(), z.number()]).optional().nullable().transform((v) => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }),
  vehicleOdometer: z.union([z.string(), z.number()]).optional().nullable().transform((v) => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }),
  vehicleFuelLevel: z.string().max(40).optional().nullable(),
  vehicleCondition: safeString({ max: 500, fieldLabel: 'Condición', allowEmpty: true }).nullable().optional(),
  // Novedades y accesorios
  novedades:     z.record(z.string(), z.unknown()).default({}),
  novedadesText: validators.longTextOptional,
  accesorios:    z.record(z.string(), z.unknown()).default({}),
  accesoriosOtros: safeString({ max: 200, fieldLabel: 'Otros accesorios', allowEmpty: true }).nullable().optional(),
  // Fotos y firma
  vehiclePhotoUrls: z.array(z.string().max(2_000_000)).max(20).default([]),
  signatureUrl:     z.string().max(2_000_000).optional().nullable(),
  signatureDriverUrl: z.string().max(2_000_000).optional().nullable(),
  handoverUrl:      z.string().max(2_000_000).optional().nullable(),
  // Otros
  observations: validators.longTextOptional,
});

// ─── GET /company/:id/assignments ─────────────────────────────────────────────
// Query: ?status=Activa &assetId=asset-1 &driverId=driver-1

router.get('/', requireModule('gestion', 'asignaciones'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const { status, assetId, driverId } = req.query;

    let rows = await db
      .select()
      .from(companyAssignments)
      .where(eq(companyAssignments.companyId, companyId))
      .orderBy(companyAssignments.createdAt);

    if (status && typeof status === 'string') {
      rows = rows.filter((a) => a.status === status);
    }

    if (assetId && typeof assetId === 'string') {
      const parsedAssetId = parseId('asset', assetId);
      rows = rows.filter((a) => a.assetId === parsedAssetId);
    }

    if (driverId && typeof driverId === 'string') {
      const parsedDriverId = parseId('driver', driverId);
      rows = rows.filter((a) => a.driverId === parsedDriverId);
    }

    // ── Enrichment: cargar nombres de activo y conductor ────────────────────
    const [assetsRows, driversRows] = await Promise.all([
      db.select({ id: companyAssets.id, name: companyAssets.name, plate: companyAssets.plate, brand: companyAssets.brand })
        .from(companyAssets)
        .where(eq(companyAssets.companyId, companyId)),
      db.select({ id: companyDrivers.id, firstName: companyDrivers.firstName, lastName: companyDrivers.lastName, code: companyDrivers.code })
        .from(companyDrivers)
        .where(eq(companyDrivers.companyId, companyId)),
    ]);

    const assetMap  = new Map(assetsRows.map(a  => [a.id, { name: a.name, plate: a.plate, brand: a.brand }]));
    const driverMap = new Map(driversRows.map(d => [d.id, { firstName: d.firstName, lastName: d.lastName, code: d.code }]));

    res.json({
      data: rows.map((a) => serializeAssignment(a, assetMap.get(a.assetId), driverMap.get(a.driverId))),
      total: rows.length,
      assets: assetsRows,
      drivers: driversRows,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/assignments ────────────────────────────────────────────

router.post(
  '/',
  requireModule('gestion', 'asignaciones'),
  requireSupervisor,
  validate(createAssignmentSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const body = req.body as z.infer<typeof createAssignmentSchema>;

      const assetId = parseId('asset', body.assetId);
      const driverId = parseId('driver', body.driverId);

      // Verificar que el activo pertenece a esta empresa
      const asset = await db
        .select()
        .from(companyAssets)
        .where(and(eq(companyAssets.id, assetId), eq(companyAssets.companyId, companyId)))
        .limit(1);
      if (!asset.length) throw new NotFoundError('Activo', body.assetId);

      // Verificar que el conductor pertenece a esta empresa
      const driver = await db
        .select()
        .from(companyDrivers)
        .where(and(eq(companyDrivers.id, driverId), eq(companyDrivers.companyId, companyId)))
        .limit(1);
      if (!driver.length) throw new NotFoundError('Conductor', body.driverId);

      // Verificar que el activo no tiene una asignación activa
      const activeAssignment = await db
        .select()
        .from(companyAssignments)
        .where(
          and(
            eq(companyAssignments.assetId, assetId),
            eq(companyAssignments.status, 'Activa')
          )
        )
        .limit(1);

      if (activeAssignment.length) {
        throw new AppError(409, `El activo "${asset[0].name}" ya tiene una asignación activa.`);
      }

      const [created] = await db
        .insert(companyAssignments)
        .values({
          companyId,
          assetId,
          driverId,
          startDate: body.startDate,
          endDate: body.endDate ?? undefined,
          notes: body.notes ?? undefined,
          handoverUrl: body.handoverUrl ?? undefined,
          status: 'Activa',
        })
        .returning();

      await logAudit(db, companyId, {
        entity: 'assignments',
        entityId: toId('assignment', created.id),
        action: 'create',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Asignación creada: "${asset[0].name}" → "${driver[0].firstName} ${driver[0].lastName}".`,
      });

      res.status(201).json(serializeAssignment(created, { name: asset[0].name, plate: asset[0].plate ?? '', brand: asset[0].brand ?? '' }, { firstName: driver[0].firstName, lastName: driver[0].lastName, code: driver[0].code }));
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /company/:id/assignments/:assignId ───────────────────────────────────

router.put(
  '/:assignId',
  requireModule('gestion', 'asignaciones'),
  requireSupervisor,
  validate(updateAssignmentSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const assignId = parseId('assignment', req.params.assignId);
      const body = req.body as z.infer<typeof updateAssignmentSchema>;

      const existing = await db
        .select()
        .from(companyAssignments)
        .where(
          and(
            eq(companyAssignments.id, assignId),
            eq(companyAssignments.companyId, companyId)
          )
        )
        .limit(1);

      if (!existing.length) throw new NotFoundError('Asignación', req.params.assignId);

      const updateData: Record<string, unknown> = { ...body, updatedAt: new Date() };

      // Resolver IDs si vienen
      if (body.assetId !== undefined) updateData.assetId = parseId('asset', body.assetId!);
      if (body.driverId !== undefined) updateData.driverId = parseId('driver', body.driverId!);

      const [updated] = await db
        .update(companyAssignments)
        .set(updateData)
        .where(
          and(
            eq(companyAssignments.id, assignId),
            eq(companyAssignments.companyId, companyId)
          )
        )
        .returning();

      await logAudit(db, companyId, {
        entity: 'assignments',
        entityId: toId('assignment', updated.id),
        action: 'update',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Asignación "${toId('assignment', updated.id)}" actualizada.`,
      });

      // ── Enrichment: recargar info de asset y driver para la respuesta ──────
      const [assetInfo] = await db.select({ name: companyAssets.name, plate: companyAssets.plate, brand: companyAssets.brand })
        .from(companyAssets).where(eq(companyAssets.id, updated.assetId)).limit(1);
      const [driverInfo] = await db.select({ firstName: companyDrivers.firstName, lastName: companyDrivers.lastName, code: companyDrivers.code })
        .from(companyDrivers).where(eq(companyDrivers.id, updated.driverId)).limit(1);

      res.json(serializeAssignment(updated, assetInfo ?? null, driverInfo ?? null));
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /company/:id/assignments/:assignId/finalize ─────────────────────────

router.post(
  '/:assignId/finalize',
  requireModule('gestion', 'asignaciones'),
  requireSupervisor,
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const assignId = parseId('assignment', req.params.assignId);

      const existing = await db
        .select()
        .from(companyAssignments)
        .where(
          and(
            eq(companyAssignments.id, assignId),
            eq(companyAssignments.companyId, companyId)
          )
        )
        .limit(1);

      if (!existing.length) throw new NotFoundError('Asignación', req.params.assignId);

      if (existing[0].status === 'Finalizada') {
        throw new AppError(409, 'La asignación ya está finalizada.');
      }

      const today = new Date().toISOString().split('T')[0];

      const [updated] = await db
        .update(companyAssignments)
        .set({
          status: 'Finalizada',
          endDate: existing[0].endDate ?? today,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(companyAssignments.id, assignId),
            eq(companyAssignments.companyId, companyId)
          )
        )
        .returning();

      await logAudit(db, companyId, {
        entity: 'assignments',
        entityId: toId('assignment', updated.id),
        action: 'finalize',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Asignación "${toId('assignment', updated.id)}" finalizada.`,
      });

      // ── Enrichment ────────────────────────────────────────────────────────────
      const [assetInfo] = await db.select({ name: companyAssets.name, plate: companyAssets.plate, brand: companyAssets.brand })
        .from(companyAssets).where(eq(companyAssets.id, updated.assetId)).limit(1);
      const [driverInfo] = await db.select({ firstName: companyDrivers.firstName, lastName: companyDrivers.lastName, code: companyDrivers.code })
        .from(companyDrivers).where(eq(companyDrivers.id, updated.driverId)).limit(1);

      res.json(serializeAssignment(updated, assetInfo ?? null, driverInfo ?? null));
    } catch (err) {
      next(err);
    }
  }
);

// ─── Serializer ───────────────────────────────────────────────────────────────

function serializeAssignment(
  a: typeof companyAssignments.$inferSelect,
  assetInfo?: { name: string; plate: string; brand: string } | null,
  driverInfo?: { firstName: string; lastName: string; code: string } | null,
) {
  return {
    id: toId('assignment', a.id),
    companyId: toId('company', a.companyId),
    assetId: toId('asset', a.assetId),
    driverId: toId('driver', a.driverId),
    startDate: a.startDate,
    endDate: a.endDate,
    status: a.status,
    notes: a.notes,
    handoverUrl: a.handoverUrl,
    // ── Enrichment: nombres para display sin hooks externos ──────────────────
    assetName:  assetInfo?.name  ?? null,
    assetPlate: assetInfo?.plate ?? null,
    assetBrand: assetInfo?.brand ?? null,
    driverName: driverInfo ? `${driverInfo.firstName} ${driverInfo.lastName}`.trim() : null,
    driverCode: driverInfo?.code ?? null,
    // ── Acta ──────────────────────────────────
    actaNumber:       a.actaNumber,
    actaDate:         a.actaDate,
    actaTime:         a.actaTime,
    actaPlace:        a.actaPlace,
    actaArea:         a.actaArea,
    driverDni:        a.driverDni,
    driverPhone:      a.driverPhone,
    driverRole:       a.driverRole,
    vehicleOdometer:  a.vehicleOdometer,
    vehicleFuelLevel: a.vehicleFuelLevel,
    vehicleCondition: a.vehicleCondition,
    novedades:        a.novedades,
    accesorios:       a.accesorios,
    novedadesText:    a.novedadesText,
    signatureLogUrl:  a.signatureLogUrl,
    signatureRespUrl: a.signatureRespUrl,
    vehiclePhotoUrls: a.vehiclePhotoUrls ?? [],
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

// ─── PUT /company/:id/assignments/:assignId/handover ──────────────────────────

// (handoverSchema declarado arriba con validación estricta)

router.put(
  '/:assignId/handover',
  requireModule('gestion', 'asignaciones'),
  requireSupervisor,
  validate(handoverSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const assignId = parseId('assignment', req.params.assignId);
      const body = req.body as z.infer<typeof handoverSchema>;

      const existing = await db
        .select()
        .from(companyAssignments)
        .where(and(
          eq(companyAssignments.id, assignId),
          eq(companyAssignments.companyId, companyId)
        ))
        .limit(1);

      if (!existing.length) throw new NotFoundError('Asignación', req.params.assignId);

      const [updated] = await db
        .update(companyAssignments)
        .set({ ...body, updatedAt: new Date() })
        .where(and(
          eq(companyAssignments.id, assignId),
          eq(companyAssignments.companyId, companyId)
        ))
        .returning();

      await logAudit(db, companyId, {
        entity: 'assignments',
        entityId: toId('assignment', updated.id),
        action: 'handover',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Acta de entrega registrada para asignación "${toId('assignment', updated.id)}".`,
      });

      // ── Enrichment ────────────────────────────────────────────────────────────
      const [assetInfo] = await db.select({ name: companyAssets.name, plate: companyAssets.plate, brand: companyAssets.brand })
        .from(companyAssets).where(eq(companyAssets.id, updated.assetId)).limit(1);
      const [driverInfo] = await db.select({ firstName: companyDrivers.firstName, lastName: companyDrivers.lastName, code: companyDrivers.code })
        .from(companyDrivers).where(eq(companyDrivers.id, updated.driverId)).limit(1);

      res.json(serializeAssignment(updated, assetInfo ?? null, driverInfo ?? null));
    } catch (err) {
      next(err);
    }
  }
);

export default router;