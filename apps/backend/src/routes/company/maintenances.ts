// routes/company/maintenances.ts
import { Router } from 'express';
import { z } from 'zod';
import { eq, and, gte, lte, desc, ilike, or, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  companyMaintenanceRecords,
  companyMaintenanceItems,
  companyWorkshops,
  companySuppliers,
  companyAssets,
  companyUsers,
} from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requirePermission } from '../../middlewares/requirePermission';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { requireSupervisor } from '../../middlewares/requireSupervisor';
import { NotFoundError, AppError } from '../../lib/errors';
import { toId, parseId, parseIdFlexible } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { safeString, validators } from '../../lib/validators';
import { rescheduleCompletedMaintenance } from '../../lib/maintenance-rescheduler';
import { notify, notifyAdmins } from '../../lib/notification-service';

const router = Router({ mergeParams: true });

// ─── Enums ────────────────────────────────────────────────────────────────────

const MAINT_TYPES      = ['Preventivo', 'Correctivo', 'Programado'] as const;
const MAINT_STATUSES   = ['Programado', 'En curso', 'PendienteAtencion', 'Completado', 'Cancelado'] as const;
const MAINT_CATEGORIES = ['Primordial:Bombas', 'Primordial:Motores', 'Aceite:Cambio', 'Aceite:Inventario', 'Otro'] as const;
const CADENCE_KINDS    = ['none', 'weekly', 'days', 'monthly', 'km_based'] as const;

const isoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}(T.+)?$|^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (ISO)').optional().nullable();

// ─── Item schema ──────────────────────────────────────────────────────────────
// FIX: photoUrl agregado — sin esto Zod lo stripea antes de llegar al handler.

const itemSchema = z.object({
  supplierId: z.string().optional().nullable(),
  name:       safeString({ min: 1, max: 180, fieldLabel: 'Repuesto', allowEmpty: false }),
  quantity:   z.number().positive().max(1_000_000).default(1),
  unitCost:   z.number().nonnegative().max(1_000_000_000).default(0),
  photoUrl:   z.string().min(1).optional().nullable(),   // rutas relativas /uploads/… no pasan z.string().url()
});

// ─── Maintenance schemas ──────────────────────────────────────────────────────

const createMaintenanceSchema = z.object({
  assetId:        z.string().min(1, 'El vehículo es requerido'),
  workshopId:     z.string().optional().nullable(),
  type:           z.enum(MAINT_TYPES).default('Programado'),
  status:         z.enum(MAINT_STATUSES).default('Programado'),
  category:       z.enum(MAINT_CATEGORIES).default('Otro'),
  title:          safeString({ min: 3, max: 200, fieldLabel: 'Título', allowEmpty: false }),
  description:    validators.longTextOptional,
  odometerKm:     z.number().int().nonnegative().max(10_000_000).optional().nullable(),
  cadenceKind:    z.enum(CADENCE_KINDS).default('none'),
  cadenceValue:   z.number().int().positive().max(1_000_000).optional().nullable(),
  nextTriggerKm:  z.number().int().nonnegative().max(10_000_000).optional().nullable(),
  scheduledFor:   z.string().min(1, 'Fecha programada requerida'),
  notes:          validators.longTextOptional,
  items:          z.array(itemSchema).max(50).default([]),
});

const updateMaintenanceSchema = z.object({
  workshopId:     z.string().optional().nullable(),
  type:           z.enum(MAINT_TYPES).optional(),
  status:         z.enum(MAINT_STATUSES).optional(),
  category:       z.enum(MAINT_CATEGORIES).optional(),
  title:          safeString({ min: 3, max: 200, fieldLabel: 'Título', allowEmpty: false }).optional(),
  description:    validators.longTextOptional,
  odometerKm:     z.number().int().nonnegative().max(10_000_000).optional().nullable(),
  cadenceKind:    z.enum(CADENCE_KINDS).optional(),
  cadenceValue:   z.number().int().positive().max(1_000_000).optional().nullable(),
  nextTriggerKm:  z.number().int().nonnegative().max(10_000_000).optional().nullable(),
  scheduledFor:   z.string().optional(),
  executedAt:     z.string().optional().nullable(),
  notes:          validators.longTextOptional,
  items:          z.array(itemSchema).max(50).optional(),
});

const completeSchema = z.object({
  completedAt: z.string().optional(),
  odometerKm:  z.number().int().nonnegative().max(10_000_000).optional().nullable(),
  notes:       validators.longTextOptional,
  items:       z.array(itemSchema).max(50).optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loadItemsMap(maintenanceIds: number[]): Promise<Map<number, any[]>> {
  if (!maintenanceIds.length) return new Map();
  const items = await db
    .select({
      id:             companyMaintenanceItems.id,
      maintenanceId:  companyMaintenanceItems.maintenanceId,
      supplierId:     companyMaintenanceItems.supplierId,
      supplierName:   companySuppliers.name,
      name:           companyMaintenanceItems.name,
      quantity:       companyMaintenanceItems.quantity,
      unitCost:       companyMaintenanceItems.unitCost,
      subtotal:       companyMaintenanceItems.subtotal,
      photoUrl:       companyMaintenanceItems.photoUrl,   // ← FIX: incluir en SELECT
    })
    .from(companyMaintenanceItems)
    .leftJoin(companySuppliers, eq(companySuppliers.id, companyMaintenanceItems.supplierId))
    .where(inArray(companyMaintenanceItems.maintenanceId, maintenanceIds));

  const map = new Map<number, any[]>();
  for (const i of items) {
    if (!map.has(i.maintenanceId)) map.set(i.maintenanceId, []);
    map.get(i.maintenanceId)!.push({
      id:           toId('maintenance-item', i.id),
      maintenanceId: toId('maintenance', i.maintenanceId),
      supplierId:   i.supplierId ? toId('supplier', i.supplierId) : null,
      supplierName: i.supplierName,
      name:         i.name,
      quantity:     Number(i.quantity),
      unitCost:     Number(i.unitCost),
      subtotal:     Number(i.subtotal),
      photoUrl:     i.photoUrl ?? null,                  // ← FIX: exponer en respuesta
    });
  }
  return map;
}

// Helper para construir los values de insert/upsert de items (evita duplicar código).
// FIX: incluye photoUrl en todos los inserts.
function buildItemValues(maintenanceId: number, items: z.infer<typeof itemSchema>[]) {
  return items.map((i) => ({
    maintenanceId,
    supplierId: i.supplierId ? parseId('supplier', i.supplierId) : null,
    name:       i.name,
    quantity:   i.quantity.toFixed(2),
    unitCost:   i.unitCost.toFixed(2),
    subtotal:   (i.quantity * i.unitCost).toFixed(2),
    photoUrl:   i.photoUrl ?? null,                      // ← FIX: persistir
  }));
}

function serializeMaintenance(m: any, items: any[]) {
  return {
    id:            toId('maintenance', m.id),
    companyId:     toId('company', m.companyId),
    assetId:       toId('asset', m.assetId),
    assetName:     m.assetName,
    assetPlate:    m.assetPlate,
    workshopId:    m.workshopId ? toId('workshop', m.workshopId) : null,
    workshopName:  m.workshopName,
    type:          m.type,
    status:        m.status,
    category:      m.category,
    title:         m.title,
    description:   m.description,
    odometerKm:    m.odometerKm,
    cadenceKind:   m.cadenceKind,
    cadenceValue:  m.cadenceValue,
    nextTriggerKm: m.nextTriggerKm,
    scheduledFor:  m.scheduledFor,
    executedAt:    m.executedAt,
    completedAt:   m.completedAt,
    notes:         m.notes,
    totalCost:     Number(m.totalCost),
    parentId:      m.parentId ? toId('maintenance', m.parentId) : null,
    createdBy:     m.createdBy ? toId('company-user', m.createdBy) : null,
    completedBy:   m.completedBy ? toId('company-user', m.completedBy) : null,
    createdAt:     m.createdAt,
    updatedAt:     m.updatedAt,
    items,
  };
}

// ─── GET / ────────────────────────────────────────────────────────────────────

router.get(
  '/',
  requireModule('maintenance'),
  requirePermission('maintenance', 'records', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const { status, type, category, workshopId, assetId, from, to, q } = req.query as Record<string, string | undefined>;

      const where: any[] = [eq(companyMaintenanceRecords.companyId, companyId)];
      if (status)     where.push(eq(companyMaintenanceRecords.status, status as any));
      if (type)       where.push(eq(companyMaintenanceRecords.type, type as any));
      if (category)   where.push(eq(companyMaintenanceRecords.category, category as any));
      if (workshopId) where.push(eq(companyMaintenanceRecords.workshopId, parseId('workshop', workshopId)));
      if (assetId)    where.push(eq(companyMaintenanceRecords.assetId, parseId('asset', assetId)));
      if (from)       where.push(gte(companyMaintenanceRecords.scheduledFor, new Date(from)));
      if (to)         where.push(lte(companyMaintenanceRecords.scheduledFor, new Date(to)));

      let query = db
        .select({
          m: companyMaintenanceRecords,
          assetName:    companyAssets.name,
          assetPlate:   companyAssets.plate,
          workshopName: companyWorkshops.name,
        })
        .from(companyMaintenanceRecords)
        .leftJoin(companyAssets, eq(companyAssets.id, companyMaintenanceRecords.assetId))
        .leftJoin(companyWorkshops, eq(companyWorkshops.id, companyMaintenanceRecords.workshopId))
        .where(and(...where))
        .orderBy(desc(companyMaintenanceRecords.scheduledFor))
        .$dynamic();

      if (q) {
        const needle = `%${q}%`;
        query = query.where(and(...where, or(
          ilike(companyMaintenanceRecords.title, needle),
          ilike(companyMaintenanceRecords.description, needle),
        )!));
      }

      const rows = await query;
      const itemsMap = await loadItemsMap(rows.map((r) => r.m.id));
      const [assetsRows, workshopsRows, suppliersRows] = await Promise.all([
        db.select({ id: companyAssets.id, name: companyAssets.name, plate: companyAssets.plate, brand: companyAssets.brand, model: companyAssets.model })
          .from(companyAssets).where(eq(companyAssets.companyId, companyId)),
        db.select({ id: companyWorkshops.id, name: companyWorkshops.name })
          .from(companyWorkshops).where(eq(companyWorkshops.companyId, companyId)),
        db.select({ id: companySuppliers.id, name: companySuppliers.name })
          .from(companySuppliers).where(eq(companySuppliers.companyId, companyId)),
      ]);
      res.json({
        data: rows.map((r) => serializeMaintenance(r.m, itemsMap.get(r.m.id) ?? [])),
        total: rows.length,
        assets: assetsRows,
        workshops: workshopsRows,
        suppliers: suppliersRows,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /agenda ──────────────────────────────────────────────────────────────

router.get(
  '/agenda',
  requireModule('maintenance'),
  requirePermission('maintenance', 'agenda', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const from = (req.query.from as string) ? new Date(req.query.from as string) : new Date();
      const to   = (req.query.to   as string) ? new Date(req.query.to   as string) : (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d; })();

      const rows = await db
        .select({
          m: companyMaintenanceRecords,
          assetName:    companyAssets.name,
          assetPlate:   companyAssets.plate,
          workshopName: companyWorkshops.name,
        })
        .from(companyMaintenanceRecords)
        .leftJoin(companyAssets, eq(companyAssets.id, companyMaintenanceRecords.assetId))
        .leftJoin(companyWorkshops, eq(companyWorkshops.id, companyMaintenanceRecords.workshopId))
        .where(and(
          eq(companyMaintenanceRecords.companyId, companyId),
          gte(companyMaintenanceRecords.scheduledFor, from),
          lte(companyMaintenanceRecords.scheduledFor, to),
        ))
        .orderBy(companyMaintenanceRecords.scheduledFor);

      const itemsMap = await loadItemsMap(rows.map((r) => r.m.id));
      const [assetsRows, workshopsRows, suppliersRows] = await Promise.all([
        db.select({ id: companyAssets.id, name: companyAssets.name, plate: companyAssets.plate, brand: companyAssets.brand, model: companyAssets.model })
          .from(companyAssets).where(eq(companyAssets.companyId, companyId)),
        db.select({ id: companyWorkshops.id, name: companyWorkshops.name })
          .from(companyWorkshops).where(eq(companyWorkshops.companyId, companyId)),
        db.select({ id: companySuppliers.id, name: companySuppliers.name })
          .from(companySuppliers).where(eq(companySuppliers.companyId, companyId)),
      ]);
      res.json({
        data: rows.map((r) => serializeMaintenance(r.m, itemsMap.get(r.m.id) ?? [])),
        total: rows.length,
        assets: assetsRows,
        workshops: workshopsRows,
        suppliers: suppliersRows,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /:id ─────────────────────────────────────────────────────────────────

router.get(
  '/:id',
  requireModule('maintenance'),
  requirePermission('maintenance', 'records', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);

      const [row] = await db
        .select({
          m: companyMaintenanceRecords,
          assetName:    companyAssets.name,
          assetPlate:   companyAssets.plate,
          workshopName: companyWorkshops.name,
        })
        .from(companyMaintenanceRecords)
        .leftJoin(companyAssets, eq(companyAssets.id, companyMaintenanceRecords.assetId))
        .leftJoin(companyWorkshops, eq(companyWorkshops.id, companyMaintenanceRecords.workshopId))
        .where(and(
          eq(companyMaintenanceRecords.id, id),
          eq(companyMaintenanceRecords.companyId, companyId),
        ))
        .limit(1);
      if (!row) throw new NotFoundError('Mantenimiento', req.params.id);

      const itemsMap = await loadItemsMap([id]);
      res.json(serializeMaintenance(row.m, itemsMap.get(id) ?? []));
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /:id/items ───────────────────────────────────────────────────────────

router.get(
  '/:id/items',
  requireModule('maintenance'),
  requirePermission('maintenance', 'records', 'ver'),
  async (req, res, next) => {
    try {
      const id = parseId('maintenance', req.params.id);
      const itemsMap = await loadItemsMap([id]);
      res.json({ data: itemsMap.get(id) ?? [], total: (itemsMap.get(id) ?? []).length });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST / ───────────────────────────────────────────────────────────────────

router.post(
  '/',
  requireModule('maintenance'),
  requirePermission('maintenance', 'execution', 'crear'),
  validate(createMaintenanceSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const body = req.body as z.infer<typeof createMaintenanceSchema>;
      const userId = parseId('company-user', req.user!.sub);

      const assetId = parseId('asset', body.assetId);
      const [asset] = await db.select({ id: companyAssets.id }).from(companyAssets)
        .where(and(eq(companyAssets.id, assetId), eq(companyAssets.companyId, companyId))).limit(1);
      if (!asset) throw new NotFoundError('Activo', body.assetId);

      const total = (body.items ?? []).reduce((acc, i) => acc + (i.quantity * i.unitCost), 0);

      const [created] = await db
        .insert(companyMaintenanceRecords)
        .values({
          companyId,
          assetId,
          workshopId:    body.workshopId ? parseId('workshop', body.workshopId) : null,
          type:          body.type,
          status:        body.status,
          category:      body.category,
          title:         body.title,
          description:   body.description ?? null,
          odometerKm:    body.odometerKm ?? null,
          cadenceKind:   body.cadenceKind,
          cadenceValue:  body.cadenceValue ?? null,
          nextTriggerKm: body.nextTriggerKm ?? null,
          scheduledFor:  new Date(body.scheduledFor),
          notes:         body.notes ?? null,
          totalCost:     total.toFixed(2),
          createdBy:     userId,
        })
        .returning();

      if (body.items?.length) {
        // FIX: usa buildItemValues → incluye photoUrl
        await db.insert(companyMaintenanceItems).values(buildItemValues(created.id, body.items));
      }

      await logAudit(db, companyId, {
        entity: 'mantenimiento',
        entityId: toId('maintenance', created.id),
        action: 'create',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Mantenimiento "${created.title}" creado.`,
      });

      if (body.workshopId) {
        try {
          await notifyAdmins(companyId, {
            kind:    'workshop_assigned',
            title:   `Mantenimiento asignado a taller`,
            body:    body.title,
            payload: { maintenanceId: created.id, workshopId: body.workshopId, assetId },
          });
        } catch (notifErr) {
          console.warn('notifyAdmins falló (no crítico):', notifErr);
        }
      }

      const itemsMap = await loadItemsMap([created.id]);
      res.status(201).json(serializeMaintenance(created, itemsMap.get(created.id) ?? []));
    } catch (err) {
      next(err);
    }
  },
);

// ─── PUT /:id ─────────────────────────────────────────────────────────────────

router.put(
  '/:id',
  requireModule('maintenance'),
  requirePermission('maintenance', 'execution', 'editar'),
  validate(updateMaintenanceSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const body = req.body as z.infer<typeof updateMaintenanceSchema>;

      const existing = await db
        .select()
        .from(companyMaintenanceRecords)
        .where(and(
          eq(companyMaintenanceRecords.id, id),
          eq(companyMaintenanceRecords.companyId, companyId),
        ))
        .limit(1);
      if (!existing.length) throw new NotFoundError('Mantenimiento', req.params.id);

      const update: any = { updatedAt: new Date() };
      if (body.workshopId    !== undefined) update.workshopId    = body.workshopId ? parseId('workshop', body.workshopId) : null;
      if (body.type          !== undefined) update.type          = body.type;
      if (body.status        !== undefined) update.status        = body.status;
      if (body.category      !== undefined) update.category      = body.category;
      if (body.title         !== undefined) update.title         = body.title;
      if (body.description   !== undefined) update.description   = body.description;
      if (body.odometerKm    !== undefined) update.odometerKm    = body.odometerKm;
      if (body.cadenceKind   !== undefined) update.cadenceKind   = body.cadenceKind;
      if (body.cadenceValue  !== undefined) update.cadenceValue  = body.cadenceValue;
      if (body.nextTriggerKm !== undefined) update.nextTriggerKm = body.nextTriggerKm;
      if (body.scheduledFor  !== undefined) update.scheduledFor  = new Date(body.scheduledFor);
      if (body.executedAt    !== undefined) update.executedAt    = body.executedAt ? new Date(body.executedAt) : null;
      if (body.notes         !== undefined) update.notes         = body.notes;

      if (body.items) {
        const total = body.items.reduce((acc, i) => acc + (i.quantity * i.unitCost), 0);
        update.totalCost = total.toFixed(2);
        await db.delete(companyMaintenanceItems).where(eq(companyMaintenanceItems.maintenanceId, id));
        if (body.items.length) {
          // FIX: usa buildItemValues → incluye photoUrl
          await db.insert(companyMaintenanceItems).values(buildItemValues(id, body.items));
        }
      }

      const [updated] = await db
        .update(companyMaintenanceRecords)
        .set(update)
        .where(eq(companyMaintenanceRecords.id, id))
        .returning();

      await logAudit(db, companyId, {
        entity: 'mantenimiento',
        entityId: toId('maintenance', updated.id),
        action: 'update',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Mantenimiento "${updated.title}" actualizado.`,
      });

      const itemsMap = await loadItemsMap([id]);
      res.json(serializeMaintenance(updated, itemsMap.get(id) ?? []));
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/complete ───────────────────────────────────────────────────────

router.post(
  '/:id/complete',
  requireModule('maintenance'),
  requirePermission('maintenance', 'execution', 'editar'),
  requireSupervisor,
  validate(completeSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const body = req.body as z.infer<typeof completeSchema>;
      const userId = parseId('company-user', req.user!.sub);

      const [existing] = await db
        .select()
        .from(companyMaintenanceRecords)
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .limit(1);
      if (!existing) throw new NotFoundError('Mantenimiento', req.params.id);
      if (existing.status === 'Completado') throw new AppError(409, 'El mantenimiento ya está completado');
      if (existing.status === 'Cancelado')  throw new AppError(409, 'El mantenimiento está cancelado');

      const completedAt = body.completedAt ? new Date(body.completedAt) : new Date();
      const executedAt  = existing.executedAt ?? completedAt;

      if (body.items) {
        const total = body.items.reduce((acc, i) => acc + (i.quantity * i.unitCost), 0);
        await db.delete(companyMaintenanceItems).where(eq(companyMaintenanceItems.maintenanceId, id));
        if (body.items.length) {
          // FIX: usa buildItemValues → incluye photoUrl
          await db.insert(companyMaintenanceItems).values(buildItemValues(id, body.items));
        }
        await db.update(companyMaintenanceRecords)
          .set({ totalCost: total.toFixed(2) })
          .where(eq(companyMaintenanceRecords.id, id));
      }

      const [updated] = await db
        .update(companyMaintenanceRecords)
        .set({
          status:      'Completado',
          completedAt,
          completedBy: userId,
          executedAt,
          odometerKm:  body.odometerKm ?? existing.odometerKm,
          notes:       body.notes ?? existing.notes,
          updatedAt:   new Date(),
        })
        .where(eq(companyMaintenanceRecords.id, id))
        .returning();

      await logAudit(db, companyId, {
        entity: 'mantenimiento',
        entityId: toId('maintenance', updated.id),
        action: 'complete',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Mantenimiento "${updated.title}" marcado como completado.`,
      });

      try {
        await notifyAdmins(companyId, {
          kind:  'maintenance_completed',
          title: `Mantenimiento completado: ${updated.title ?? updated.category}`,
          body:  body.notes ?? undefined,
          payload: { maintenanceId: updated.id, assetId: updated.assetId, totalCost: Number(updated.totalCost) },
        });
      } catch (notifErr) {
        console.warn('notifyAdmins falló (no crítico):', notifErr);
      }

      const newId = await rescheduleCompletedMaintenance({
        completedId: id,
        companyId,
        executedAt,
        odometerKm: body.odometerKm ?? null,
      });

      const itemsMap = await loadItemsMap([id]);
      res.json({
        ...serializeMaintenance(updated, itemsMap.get(id) ?? []),
        rescheduledId: newId ? toId('maintenance', newId) : null,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/cancel ─────────────────────────────────────────────────────────

router.post(
  '/:id/cancel',
  requireModule('maintenance'),
  requirePermission('maintenance', 'execution', 'editar'),
  requireSupervisor,
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);

      const existing = await db
        .select()
        .from(companyMaintenanceRecords)
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .limit(1);
      if (!existing.length) throw new NotFoundError('Mantenimiento', req.params.id);
      if (existing[0].status === 'Completado') throw new AppError(409, 'No se puede cancelar un mantenimiento completado');

      const [updated] = await db
        .update(companyMaintenanceRecords)
        .set({ status: 'Cancelado', updatedAt: new Date() })
        .where(eq(companyMaintenanceRecords.id, id))
        .returning();

      await logAudit(db, companyId, {
        entity: 'mantenimiento',
        entityId: toId('maintenance', updated.id),
        action: 'cancel',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Mantenimiento "${updated.title}" cancelado.`,
      });

      res.json(serializeMaintenance(updated, []));
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

router.delete(
  '/:id',
  requireModule('maintenance'),
  requirePermission('maintenance', 'records', 'eliminar'),
  requireAdmin,
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);

      const existing = await db
        .select()
        .from(companyMaintenanceRecords)
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .limit(1);
      if (!existing.length) throw new NotFoundError('Mantenimiento', req.params.id);

      await db.delete(companyMaintenanceRecords).where(eq(companyMaintenanceRecords.id, id));

      await logAudit(db, companyId, {
        entity: 'mantenimiento',
        entityId: toId('maintenance', id),
        action: 'delete',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Mantenimiento "${existing[0].title}" eliminado.`,
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;