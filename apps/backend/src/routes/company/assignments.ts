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

const router = Router({ mergeParams: true });

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createAssignmentSchema = z.object({
  assetId: z.string().min(1, 'El activo es requerido'),        // "asset-N"
  driverId: z.string().min(1, 'El conductor es requerido'),    // "driver-N"
  startDate: z.string().min(1, 'La fecha de inicio es requerida'), // "YYYY-MM-DD"
  endDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  handoverUrl: z.string().optional().nullable(),
});

const updateAssignmentSchema = createAssignmentSchema.partial();

// ─── GET /company/:id/assignments ─────────────────────────────────────────────
// Query: ?status=Activa &assetId=asset-1 &driverId=driver-1

router.get('/', requireModule('asignaciones'), async (req, res, next) => {
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

    res.json({ data: rows.map(serializeAssignment), total: rows.length });
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/assignments ────────────────────────────────────────────

router.post(
  '/',
  requireModule('asignaciones'),
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

      res.status(201).json(serializeAssignment(created));
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /company/:id/assignments/:assignId ───────────────────────────────────

router.put(
  '/:assignId',
  requireModule('asignaciones'),
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

      res.json(serializeAssignment(updated));
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /company/:id/assignments/:assignId/finalize ─────────────────────────

router.post(
  '/:assignId/finalize',
  requireModule('asignaciones'),
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

      res.json(serializeAssignment(updated));
    } catch (err) {
      next(err);
    }
  }
);

// ─── Serializer ───────────────────────────────────────────────────────────────

function serializeAssignment(a: typeof companyAssignments.$inferSelect) {
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
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

export default router;