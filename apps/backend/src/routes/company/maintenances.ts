import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyMaintenances, companyAssets } from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { requireSupervisor } from '../../middlewares/requireSupervisor';
import { NotFoundError, AppError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';

const router = Router({ mergeParams: true });

// ─── Schemas ─────────────────────────────────────────────────────────────────

const MAINTENANCE_KINDS = ['Preventivo', 'Correctivo', 'Predictivo', 'Emergencia'] as const;
const MAINTENANCE_PRIORITIES = ['Normal', 'Alta', 'Emergente'] as const;
const MAINTENANCE_STATUSES = ['Pendiente', 'En proceso', 'Completado'] as const;

const createMaintenanceSchema = z.object({
  assetId: z.string().min(1, 'El activo es requerido'),  // "asset-N"
  title: z.string().min(1, 'El título es requerido'),
  kind: z.enum(MAINTENANCE_KINDS).optional(),
  priority: z.enum(MAINTENANCE_PRIORITIES).default('Normal'),
  status: z.enum(MAINTENANCE_STATUSES).default('Pendiente'),
  scheduledDate: z.string().optional().nullable(),  // "YYYY-MM-DD"
  dueDate: z.string().optional().nullable(),
  technician: z.string().optional().nullable(),
  cost: z.number().nonnegative().optional().nullable(),
  laborCost: z.number().nonnegative().optional().nullable(),
  partsCost: z.number().nonnegative().optional().nullable(),
  photoUrls: z.array(z.string()).default([]),
  notes: z.string().optional().nullable(),
});

const updateMaintenanceSchema = createMaintenanceSchema.partial();

const completeMaintenanceSchema = z.object({
  completedDate: z.string().optional(), // "YYYY-MM-DD", default hoy
  cost: z.number().nonnegative().optional().nullable(),
  technician: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  photoUrls: z.array(z.string()).optional(),
});

// ─── GET /company/:id/maintenances ────────────────────────────────────────────
// Query: ?status=Pendiente &kind=Preventivo &assetId=asset-1 &priority=Alta

router.get('/', requireModule('mantenimiento'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const { status, kind, assetId, priority } = req.query;

    let rows = await db
      .select()
      .from(companyMaintenances)
      .where(eq(companyMaintenances.companyId, companyId))
      .orderBy(companyMaintenances.createdAt);

    if (status && typeof status === 'string') {
      rows = rows.filter((m) => m.status === status);
    }
    if (kind && typeof kind === 'string') {
      rows = rows.filter((m) => m.kind === kind);
    }
    if (priority && typeof priority === 'string') {
      rows = rows.filter((m) => m.priority === priority);
    }
    if (assetId && typeof assetId === 'string') {
      const parsedAssetId = parseId('asset', assetId);
      rows = rows.filter((m) => m.assetId === parsedAssetId);
    }

    res.json({ data: rows.map(serializeMaintenance), total: rows.length });
  } catch (err) {
    next(err);
  }
});

// ─── GET /company/:id/maintenances/:maintId ───────────────────────────────────

router.get('/:maintId', requireModule('mantenimiento'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const maintId = parseId('maintenance', req.params.maintId);

    const rows = await db
      .select()
      .from(companyMaintenances)
      .where(
        and(
          eq(companyMaintenances.id, maintId),
          eq(companyMaintenances.companyId, companyId)
        )
      )
      .limit(1);

    if (!rows.length) throw new NotFoundError('Mantenimiento', req.params.maintId);

    res.json(serializeMaintenance(rows[0]));
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/maintenances ───────────────────────────────────────────

router.post(
  '/',
  requireModule('mantenimiento'),
  requireSupervisor,
  validate(createMaintenanceSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const body = req.body as z.infer<typeof createMaintenanceSchema>;

      const assetId = parseId('asset', body.assetId);

      // Verificar que el activo pertenece a esta empresa
      const asset = await db
        .select()
        .from(companyAssets)
        .where(and(eq(companyAssets.id, assetId), eq(companyAssets.companyId, companyId)))
        .limit(1);
      if (!asset.length) throw new NotFoundError('Activo', body.assetId);

      const [created] = await db
        .insert(companyMaintenances)
        .values({ ...body, companyId, assetId })
        .returning();

      await logAudit(db, companyId, {
        entity: 'maintenances',
        entityId: toId('maintenance', created.id),
        action: 'create',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Mantenimiento "${created.title}" creado para "${asset[0].name}".`,
        metadata: {
          maintenanceTitle: created.title,
          kind: created.kind,
          priority: created.priority,
          status: created.status,
          assetId: toId('asset', asset[0].id),
          assetName: asset[0].name,
          assetCode: asset[0].code,
          scheduledDate: created.scheduledDate,
          dueDate: created.dueDate,
          technician: created.technician,
        },
      });

      res.status(201).json(serializeMaintenance(created));
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /company/:id/maintenances/:maintId ───────────────────────────────────

router.put(
  '/:maintId',
  requireModule('mantenimiento'),
  requireSupervisor,
  validate(updateMaintenanceSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const maintId = parseId('maintenance', req.params.maintId);
      const body = req.body as z.infer<typeof updateMaintenanceSchema>;

      const existing = await db
        .select()
        .from(companyMaintenances)
        .where(
          and(
            eq(companyMaintenances.id, maintId),
            eq(companyMaintenances.companyId, companyId)
          )
        )
        .limit(1);

      if (!existing.length) throw new NotFoundError('Mantenimiento', req.params.maintId);

      const updateData: Record<string, unknown> = { ...body, updatedAt: new Date() };
      if (body.assetId !== undefined) updateData.assetId = parseId('asset', body.assetId!);

      const [updated] = await db
        .update(companyMaintenances)
        .set(updateData)
        .where(
          and(
            eq(companyMaintenances.id, maintId),
            eq(companyMaintenances.companyId, companyId)
          )
        )
        .returning();

      const updatedAsset = await db
        .select()
        .from(companyAssets)
        .where(eq(companyAssets.id, updated.assetId))
        .limit(1)

      await logAudit(db, companyId, {
        entity: 'maintenances',
        entityId: toId('maintenance', updated.id),
        action: 'update',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Mantenimiento "${updated.title}" actualizado.`,
        metadata: {
          maintenanceTitle: updated.title,
          kind: updated.kind,
          priority: updated.priority,
          status: updated.status,
          assetId: toId('asset', updatedAsset[0]?.id),
          assetName: updatedAsset[0]?.name,
          assetCode: updatedAsset[0]?.code,
          scheduledDate: updated.scheduledDate,
          dueDate: updated.dueDate,
          technician: updated.technician,
          notes: updated.notes,
        },
      });

      res.json(serializeMaintenance(updated));
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /company/:id/maintenances/:maintId ────────────────────────────────

router.delete(
  '/:maintId',
  requireModule('mantenimiento'),
  requireAdmin,
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const maintId = parseId('maintenance', req.params.maintId);

      const existing = await db
        .select()
        .from(companyMaintenances)
        .where(
          and(
            eq(companyMaintenances.id, maintId),
            eq(companyMaintenances.companyId, companyId)
          )
        )
        .limit(1);

      if (!existing.length) throw new NotFoundError('Mantenimiento', req.params.maintId);

      await db
        .delete(companyMaintenances)
        .where(
          and(
            eq(companyMaintenances.id, maintId),
            eq(companyMaintenances.companyId, companyId)
          )
        );

      await logAudit(db, companyId, {
        entity: 'maintenances',
        entityId: toId('maintenance', maintId),
        action: 'delete',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Mantenimiento "${existing[0].title}" eliminado.`,
        metadata: {
          maintenanceTitle: existing[0].title,
          kind: existing[0].kind,
          priority: existing[0].priority,
        },
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /company/:id/maintenances/:maintId/complete ────────────────────────

router.post(
  '/:maintId/complete',
  requireModule('mantenimiento'),
  requireSupervisor,
  validate(completeMaintenanceSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const maintId = parseId('maintenance', req.params.maintId);
      const body = req.body as z.infer<typeof completeMaintenanceSchema>;

      const existing = await db
        .select()
        .from(companyMaintenances)
        .where(
          and(
            eq(companyMaintenances.id, maintId),
            eq(companyMaintenances.companyId, companyId)
          )
        )
        .limit(1);

      if (!existing.length) throw new NotFoundError('Mantenimiento', req.params.maintId);

      if (existing[0].status === 'Completado') {
        throw new AppError(409, 'El mantenimiento ya está completado.');
      }

      const today = new Date().toISOString().split('T')[0];

      const [updated] = await db
        .update(companyMaintenances)
        .set({
          status: 'Completado',
          completedDate: body.completedDate ?? today,
          ...(body.cost !== undefined && { cost: String(body.cost) }),
          ...(body.technician !== undefined && { technician: body.technician }),
          ...(body.notes !== undefined && { notes: body.notes }),
          ...(body.photoUrls !== undefined && { photoUrls: body.photoUrls }),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(companyMaintenances.id, maintId),
            eq(companyMaintenances.companyId, companyId)
          )
        )
        .returning();

      await logAudit(db, companyId, {
        entity: 'maintenances',
        entityId: toId('maintenance', updated.id),
        action: 'complete',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Mantenimiento "${updated.title}" marcado como completado.`,
        metadata: {
          maintenanceTitle: updated.title,
          completedDate: updated.completedDate,
          technician: updated.technician,
          cost: updated.cost,
          notes: updated.notes,
        },
      });
      res.json(serializeMaintenance(updated));
    } catch (err) {
      next(err);
    }
  }
);

// ─── Serializer ───────────────────────────────────────────────────────────────

function serializeMaintenance(m: typeof companyMaintenances.$inferSelect) {
  return {
    id: toId('maintenance', m.id),
    companyId: toId('company', m.companyId),
    assetId: toId('asset', m.assetId),
    title: m.title,
    kind: m.kind,
    priority: m.priority,
    status: m.status,
    scheduledDate: m.scheduledDate,
    dueDate: m.dueDate,
    completedDate: m.completedDate,
    technician: m.technician,
    cost: m.cost ? Number(m.cost) : null,
    laborCost: m.laborCost ? Number(m.laborCost) : null,
    partsCost: m.partsCost ? Number(m.partsCost) : null,
    photoUrls: m.photoUrls ?? [],
    notes: m.notes,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

export default router;