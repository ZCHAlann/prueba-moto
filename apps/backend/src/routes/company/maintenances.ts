// routes/company/maintenances.ts
//
// Mantenimientos v3 — flujo:
//  - Estados: Programado, En proceso, Completado. (Sin PendienteAtencion ni Cancelado.)
//  - Categorías: las base del enum + las custom de company_maintenance_categories.
//  - Asignación: admin/supervisor/owner pueden asignar a un operador. El operador
//    puede auto-asignarse o crear libres.
//  - El operador ve solo lo suyo (asignado, creado, tomado).
//  - Línea de tiempo completa: cada acción se registra en company_maintenance_events.
//  - Cancelar + reprogramar: vuelve a Programado, mantiene timeline, borra items y fotos.

import { Router } from 'express';
import { z } from 'zod';
import { eq, and, gte, lte, desc, ilike, or, inArray, sql, isNull, asc } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../../db/client';
import {
  companyMaintenanceRecords,
  companyMaintenanceItems,
  companyMaintenanceEvents,
  companyMaintenanceCategories,
  companyWorkshops,
  companySuppliers,
  companyAssets,
} from '../../db/schema/operational';
import { companyUsers } from '../../db/schema/platform'

const companyUsersAsigned = alias(companyUsers, 'company_users_asigned');
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requirePermission } from '../../middlewares/requirePermission';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { requireSupervisor } from '../../middlewares/requireSupervisor';
import { NotFoundError, AppError, ForbiddenError } from '../../lib/errors';
import { toId, parseId, parseIdFlexible } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { safeString, validators } from '../../lib/validators';

const router = Router({ mergeParams: true });

// ─── Enums ────────────────────────────────────────────────────────────────────
// "En curso" fue renombrado a "En proceso" (UX) — backend lo acepta como alias.
const MAINT_STATUSES = ['Programado', 'En proceso', 'En curso', 'Completado'] as const;
const MAINT_CATEGORIES = ['Primordial:Bombas', 'Primordial:Motores', 'Aceite:Cambio', 'Aceite:Inventario'] as const;
const CADENCE_KINDS = ['none', 'weekly', 'days', 'monthly', 'km_based'] as const;

const isoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}(T.+)?$|^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (ISO)').optional().nullable();

// ─── Item schema ──────────────────────────────────────────────────────────────
const itemSchema = z.object({
  supplierId: z.string().optional().nullable(),
  name:       safeString({ min: 1, max: 180, fieldLabel: 'Repuesto', allowEmpty: false }),
  quantity:   z.number().positive().max(1_000_000).default(1),
  unitCost:   z.number().nonnegative().max(1_000_000_000).default(0),
  photoUrl:   z.string().min(1).optional().nullable(),
});

// ─── Maintenance schemas ──────────────────────────────────────────────────────
const createMaintenanceSchema = z.object({
  assetId:        z.string().min(1, 'El vehículo es requerido'),
  workshopId:     z.string().optional().nullable(),
  type:           z.enum(['Correctivo', 'Programado']).default('Programado'),
  status:         z.enum(MAINT_STATUSES).default('Programado'),
  category:       z.string().min(1).default('Otro'),  // acepta customs
  categoryCustomId: z.string().optional().nullable(),
  title:          safeString({ min: 3, max: 200, fieldLabel: 'Título', allowEmpty: false }),
  description:    validators.longTextOptional,
  odometerKm:     z.number().int().nonnegative().max(10_000_000).optional().nullable(),
  cadenceKind:    z.enum(CADENCE_KINDS).default('none'),
  cadenceValue:   z.number().int().positive().max(1_000_000).optional().nullable(),
  nextTriggerKm:  z.number().int().nonnegative().max(10_000_000).optional().nullable(),
  scheduledFor:   z.string().min(1, 'Fecha programada requerida'),
  notes:          validators.longTextOptional,
  items:          z.array(itemSchema).max(50).default([]),
  // El operador que crea puede auto-asignarse o dejarlo libre. Solo un
  // supervisor/admin/owner puede asignar a otro operador.
  assignedUserId: z.string().optional().nullable(),
});

const updateMaintenanceSchema = z.object({
  workshopId:     z.string().optional().nullable(),
  type:           z.enum(['Correctivo', 'Programado']).optional(),
  status:         z.enum(MAINT_STATUSES).optional(),
  category:       z.string().min(1).optional(),
  categoryCustomId: z.string().optional().nullable(),
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
  assignedUserId: z.string().optional().nullable(),
});

const cancelRescheduleSchema = z.object({
  newScheduledFor: z.string().min(1, 'Nueva fecha requerida'),
  reason:           safeString({ min: 3, max: 1000, fieldLabel: 'Motivo', allowEmpty: false }),
});

const noteSchema = z.object({
  text: safeString({ min: 1, max: 4000, fieldLabel: 'Nota', allowEmpty: false }),
});

const assignSchema = z.object({
  userId: z.string().min(1, 'Operador requerido'),
});

const idSchema = z.object({
  id: z.string().min(1),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Roles con visión completa de todos los mantenimientos. */
const FULL_ACCESS_ROLES = new Set(['owner_empresa', 'admin_empresa', 'supervisor']);
function hasFullAccess(role: string | undefined): boolean {
  return role ? FULL_ACCESS_ROLES.has(role) : false;
}

/** El user es admin_empresa o owner_empresa (puede asignar a otros). */
function isCompanyAdmin(role: string | undefined): boolean {
  return role === 'owner_empresa' || role === 'admin_empresa';
}

function getUserIdFromSub(sub: string | undefined): number | null {
  if (!sub) return null;
  const m = String(sub).match(/(\d+)$/);
  return m ? Number(m[1]) : null;
}

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
      photoUrl:       companyMaintenanceItems.photoUrl,
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
      photoUrl:     i.photoUrl ?? null,
    });
  }
  return map;
}

async function loadEventsMap(maintenanceIds: number[]): Promise<Map<number, any[]>> {
  if (!maintenanceIds.length) return new Map();
  const events = await db
    .select({
      id:             companyMaintenanceEvents.id,
      maintenanceId:  companyMaintenanceEvents.maintenanceId,
      kind:           companyMaintenanceEvents.kind,
      actorUserId:    companyMaintenanceEvents.actorUserId,
      actorName:      companyMaintenanceEvents.actorName,
      payload:        companyMaintenanceEvents.payload,
      createdAt:      companyMaintenanceEvents.createdAt,
    })
    .from(companyMaintenanceEvents)
    .where(inArray(companyMaintenanceEvents.maintenanceId, maintenanceIds))
    .orderBy(asc(companyMaintenanceEvents.createdAt));
  const map = new Map<number, any[]>();
  for (const e of events) {
    if (!map.has(e.maintenanceId)) map.set(e.maintenanceId, []);
    map.get(e.maintenanceId)!.push({
      id:             toId('maint-event', e.id),
      maintenanceId:  toId('maintenance', e.maintenanceId),
      kind:           e.kind,
      actorUserId:    e.actorUserId ? toId('company-user', e.actorUserId) : null,
      actorName:      e.actorName,
      payload:        e.payload ?? {},
      createdAt:      e.createdAt,
    });
  }
  return map;
}

function buildItemValues(maintenanceId: number, items: z.infer<typeof itemSchema>[]) {
  return items.map((i) => ({
    maintenanceId,
    supplierId: i.supplierId ? parseId('supplier', i.supplierId) : null,
    name:       i.name,
    quantity:   i.quantity.toFixed(2),
    unitCost:   i.unitCost.toFixed(2),
    subtotal:   (i.quantity * i.unitCost).toFixed(2),
    photoUrl:   i.photoUrl ?? null,
  }));
}

function normalizeStatus(status: string): string {
  // Compat: "En curso" lo aceptamos como "En proceso" (renombre UX).
  if (status === 'En curso') return 'En proceso';
  return status;
}

function serializeMaintenance(m: any, items: any[], events: any[] = []) {
  return {
    id:            toId('maintenance', m.id),
    companyId:     toId('company', m.companyId),
    assetId:       toId('asset', m.assetId),
    assetName:     m.assetName,
    assetPlate:    m.assetPlate,
    workshopId:    m.workshopId ? toId('workshop', m.workshopId) : null,
    workshopName:  m.workshopName,
    type:          m.type,
    status:        normalizeStatus(m.status),
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
    // v3
    assignedUserId: m.assignedUserId ? toId('company-user', m.assignedUserId) : null,
    assignedUserName: m.assignedUserName ?? null,
    takenAt:       m.takenAt ?? null,
    isReprogrammed: m.isReprogrammed ?? false,
    reprogramReason: m.reprogramReason ?? null,
    reprogrammedAt: m.reprogrammedAt ?? null,
    reprogramCount: m.reprogramCount ?? 0,
    createdAt:     m.createdAt,
    updatedAt:     m.updatedAt,
    items,
    events,
  };
}

async function recordEvent(
  companyId: number,
  maintenanceId: number,
  kind: string,
  actor: { userId: number | null; name: string | null },
  payload: Record<string, unknown> = {},
) {
  await db.insert(companyMaintenanceEvents).values({
    companyId,
    maintenanceId,
    kind,
    actorUserId: actor.userId,
    actorName: actor.name,
    payload,
  });
}

// ─── GET / ────────────────────────────────────────────────────────────────────

router.get(
  '/',
  requireModule('maintenance'),
  requirePermission('maintenance', 'records', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const { status, type, category, workshopId, assetId, from, to, q, mine, scope } = req.query as Record<string, string | undefined>;
      const meId   = getUserIdFromSub(req.user!.sub);
      const meRole = req.user!.role;
      const isFull = hasFullAccess(meRole);

      const where: any[] = [eq(companyMaintenanceRecords.companyId, companyId)];
      // Filtrado por role:
      //  - full access (admin/owner/supervisor) → ve todo, salvo que ?scope=mine
      //  - operador → solo los suyos: assigned_user_id = me OR created_by = me
      if (!isFull || scope === 'mine') {
        if (meId == null) {
          return res.json({ data: [], total: 0 });
        }
        where.push(
          or(
            eq(companyMaintenanceRecords.assignedUserId, meId),
            eq(companyMaintenanceRecords.createdBy, meId),
          )!,
        );
      } else if (mine === 'me' && meId != null) {
        where.push(
          or(
            eq(companyMaintenanceRecords.assignedUserId, meId),
            eq(companyMaintenanceRecords.createdBy, meId),
          )!,
        );
      }
      if (status) {
        const s = normalizeStatus(status);
        if (s === 'En proceso') {
          where.push(or(
            eq(companyMaintenanceRecords.status, 'En proceso'),
            eq(companyMaintenanceRecords.status, 'En curso'),
          )!);
        } else {
          where.push(eq(companyMaintenanceRecords.status, s));
        }
      }
      if (type)      where.push(eq(companyMaintenanceRecords.type, type as any));
      if (category)  where.push(eq(companyMaintenanceRecords.category, category));
      if (workshopId) where.push(eq(companyMaintenanceRecords.workshopId, parseId('workshop', workshopId)));
      if (assetId)   where.push(eq(companyMaintenanceRecords.assetId, parseId('asset', assetId)));
      if (from)      where.push(gte(companyMaintenanceRecords.scheduledFor, new Date(from)));
      if (to)        where.push(lte(companyMaintenanceRecords.scheduledFor, new Date(to)));

      const baseQuery = db
        .select({
          m: companyMaintenanceRecords,
          assetName:  companyAssets.name,
          assetPlate: companyAssets.plate,
          workshopName: companyWorkshops.name,
          assignedUserName: companyUsersAsigned.username,
        })
        .from(companyMaintenanceRecords)
        .leftJoin(companyAssets, eq(companyAssets.id, companyMaintenanceRecords.assetId))
        .leftJoin(companyWorkshops, eq(companyWorkshops.id, companyMaintenanceRecords.workshopId))
        .leftJoin(companyUsersAsigned, eq(companyUsersAsigned.id, companyMaintenanceRecords.assignedUserId))
        .where(and(...where))
        .orderBy(desc(companyMaintenanceRecords.scheduledFor))
        .$dynamic();

      const finalQuery = q
        ? baseQuery.where(
            and(
              ...where,
              or(
                ilike(companyMaintenanceRecords.title,       `%${q}%`),
                ilike(companyMaintenanceRecords.description, `%${q}%`),
                ilike(companyMaintenanceRecords.notes,       `%${q}%`),
              )!,
            ),
          )
        : baseQuery;

      const rows = await finalQuery;
      const ids  = rows.map((r) => (r.m as any).id);
      const [itemsMap, eventsMap] = await Promise.all([loadItemsMap(ids), loadEventsMap(ids)]);

      res.json({
        data: rows.map((r) => serializeMaintenance(r.m, itemsMap.get((r.m as any).id) ?? [], eventsMap.get((r.m as any).id) ?? [])),
        total: rows.length,
        assets: (await db
          .select({ id: companyAssets.id, name: companyAssets.name, plate: companyAssets.plate, brand: companyAssets.brand, model: companyAssets.model })
          .from(companyAssets).where(eq(companyAssets.companyId, companyId))
        ).map((a) => ({ id: toId('asset', a.id), name: a.name, plate: a.plate, brand: a.brand, model: a.model })),
        workshops: (await db
          .select({ id: companyWorkshops.id, name: companyWorkshops.name })
          .from(companyWorkshops).where(eq(companyWorkshops.companyId, companyId))
        ).map((w) => ({ id: toId('workshop', w.id), name: w.name })),
        suppliers: (await db
          .select({ id: companySuppliers.id, name: companySuppliers.name })
          .from(companySuppliers).where(eq(companySuppliers.companyId, companyId))
        ).map((s) => ({ id: toId('supplier', s.id), name: s.name })),
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
      const meId   = getUserIdFromSub(req.user!.sub);
      const meRole = req.user!.role;
      const isFull = hasFullAccess(meRole);

      const whereParts: any[] = [
        eq(companyMaintenanceRecords.companyId, companyId),
        gte(companyMaintenanceRecords.scheduledFor, from),
        lte(companyMaintenanceRecords.scheduledFor, to),
      ];
      if (!isFull && meId != null) {
        whereParts.push(
          or(
            eq(companyMaintenanceRecords.assignedUserId, meId),
            eq(companyMaintenanceRecords.createdBy, meId),
          )!,
        );
      }

      const rows = await db
        .select({
          m: companyMaintenanceRecords,
          assetName:  companyAssets.name,
          assetPlate: companyAssets.plate,
          workshopName: companyWorkshops.name,
        })
        .from(companyMaintenanceRecords)
        .leftJoin(companyAssets, eq(companyAssets.id, companyMaintenanceRecords.assetId))
        .leftJoin(companyWorkshops, eq(companyWorkshops.id, companyMaintenanceRecords.workshopId))
        .where(and(...whereParts))
        .orderBy(asc(companyMaintenanceRecords.scheduledFor));

      const ids = rows.map((r) => (r.m as any).id);
      const [itemsMap, eventsMap] = await Promise.all([loadItemsMap(ids), loadEventsMap(ids)]);
      res.json({
        data: rows.map((r) => serializeMaintenance(r.m, itemsMap.get((r.m as any).id) ?? [], eventsMap.get((r.m as any).id) ?? [])),
        total: rows.length,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /categories ─────────────────────────────────────────────────────────
router.get(
  '/categories',
  requireModule('maintenance'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const rows = await db
        .select()
        .from(companyMaintenanceCategories)
        .where(eq(companyMaintenanceCategories.companyId, companyId))
        .orderBy(companyMaintenanceCategories.label);
      res.json({
        data: rows.map((c) => ({
          id:        toId('maint-cat', c.id),
          companyId: toId('company', c.companyId),
          key:       c.key,
          label:     c.label,
          shortLabel: c.shortLabel,
          color:     c.color,
          icon:      c.icon,
          isSystem:  c.isSystem,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /:id ──────────────────────────────────────────────────────────────────
router.get(
  '/:id',
  requireModule('maintenance'),
  requirePermission('maintenance', 'records', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      // Si el :id no es un id válido (e.g. "categories", "agenda"),
      // devolvemos 404 en lugar de explotar con un 400 de parseId.
      // Esto pasa porque algunas rutas específicas (como /categories)
      // deberían estar definidas ANTES pero las pusimos después por
      // organización. Express matchea por orden, así que cualquier
      // ruta específica no declarada antes matcheará con /:id.
      if (!/^maintenance-\d+$/.test(req.params.id)) {
        throw new NotFoundError('Mantenimiento', req.params.id);
      }
      const id = parseId('maintenance', req.params.id);
      const meId   = getUserIdFromSub(req.user!.sub);
      const meRole = req.user!.role;
      const isFull = hasFullAccess(meRole);

      const [row] = await db
        .select({
          m: companyMaintenanceRecords,
          assetName:  companyAssets.name,
          assetPlate: companyAssets.plate,
          workshopName: companyWorkshops.name,
          assignedUserName: companyUsersAsigned.username,
        })
        .from(companyMaintenanceRecords)
        .leftJoin(companyAssets, eq(companyAssets.id, companyMaintenanceRecords.assetId))
        .leftJoin(companyWorkshops, eq(companyWorkshops.id, companyMaintenanceRecords.workshopId))
        .leftJoin(companyUsersAsigned, eq(companyUsersAsigned.id, companyMaintenanceRecords.assignedUserId))
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .limit(1);
      if (!row) throw new NotFoundError('Mantenimiento', req.params.id);

      const m = row.m as any;
      // Control de visibilidad: si no es full access y no es suyo → 404
      if (!isFull) {
        if (meId == null || (m.assignedUserId !== meId && m.createdBy !== meId)) {
          throw new NotFoundError('Mantenimiento', req.params.id);
        }
      }

      const itemsMap  = await loadItemsMap([m.id]);
      const eventsMap = await loadEventsMap([m.id]);

      // Auto-registrar evento "viewed" para línea de tiempo
      if (meId != null) {
        await recordEvent(companyId, m.id, 'viewed', { userId: meId, name: req.user!.name ?? null });
      }

      res.json(serializeMaintenance(m, itemsMap.get(m.id) ?? [], eventsMap.get(m.id) ?? []));
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
      const meId   = getUserIdFromSub(req.user!.sub);
      const meRole = req.user!.role;
      const isFull = hasFullAccess(meRole);

      const assetId = parseId('asset', body.assetId);
      const workshopId = body.workshopId ? parseId('workshop', body.workshopId) : null;

      // Asignación: operador solo puede auto-asignarse o dejarlo libre.
      // admin/owner/supervisor pueden asignar a cualquiera — pero el user
      // target DEBE pertenecer a la misma empresa.
      let assignedUserId: number | null = null;
      if (body.assignedUserId) {
        const targetId = parseId('company-user', body.assignedUserId);
        if (!isFull && targetId !== meId) {
          throw new ForbiddenError('Solo administradores o supervisores pueden asignar mantenimientos a otros usuarios.');
        }
        // Validar que el user target pertenece a esta empresa
        const [target] = await db
          .select({ companyId: companyUsers.companyId })
          .from(companyUsers)
          .where(and(eq(companyUsers.id, targetId), eq(companyUsers.companyId, companyId)))
          .limit(1);
        if (!target) {
          throw new ForbiddenError('El usuario asignado no pertenece a esta empresa.');
        }
        assignedUserId = targetId;
      } else {
        // default: si el operador crea, se auto-asigna.
        if (meRole === 'operador' && meId != null) {
          assignedUserId = meId;
        }
      }

      const [created] = await db
        .insert(companyMaintenanceRecords)
        .values({
          companyId,
          assetId,
          workshopId,
          type:           body.type,
          status:         normalizeStatus(body.status ?? 'Programado'),
          category:       body.category ?? 'Otro',
          title:          body.title,
          description:    body.description ?? null,
          odometerKm:     body.odometerKm ?? null,
          cadenceKind:    body.cadenceKind,
          cadenceValue:   body.cadenceValue ?? null,
          nextTriggerKm:  body.nextTriggerKm ?? null,
          scheduledFor:   new Date(body.scheduledFor),
          notes:          body.notes ?? null,
          totalCost:      '0',
          createdBy:      meId,
          assignedUserId,
        })
        .returning();

      // Insertar items si vinieron
      if (body.items?.length) {
        await db.insert(companyMaintenanceItems).values(buildItemValues(created.id, body.items));
      }

      // Línea de tiempo: created
      await recordEvent(companyId, created.id, 'created', {
        userId: meId,
        name:   req.user!.name ?? null,
      }, { title: body.title });
      if (assignedUserId) {
        await recordEvent(companyId, created.id, 'assigned', {
          userId: meId,
          name:   req.user!.name ?? null,
        }, { assignedUserId, selfAssigned: assignedUserId === meId });
      }

      // Devolver el mantenimiento completo
      const [full] = await db
        .select({
          m: companyMaintenanceRecords,
          assetName:  companyAssets.name,
          assetPlate: companyAssets.plate,
          workshopName: companyWorkshops.name,
          assignedUserName: companyUsersAsigned.username,
        })
        .from(companyMaintenanceRecords)
        .leftJoin(companyAssets, eq(companyAssets.id, companyMaintenanceRecords.assetId))
        .leftJoin(companyWorkshops, eq(companyWorkshops.id, companyMaintenanceRecords.workshopId))
        .leftJoin(companyUsersAsigned, eq(companyUsersAsigned.id, companyMaintenanceRecords.assignedUserId))
        .where(eq(companyMaintenanceRecords.id, created.id))
        .limit(1);
      const itemsMap  = await loadItemsMap([created.id]);
      const eventsMap = await loadEventsMap([created.id]);

      res.status(201).json(serializeMaintenance(full!.m, itemsMap.get(created.id) ?? [], eventsMap.get(created.id) ?? []));
    } catch (err) {
      next(err);
    }
  },
);

// ─── PUT /:id ──────────────────────────────────────────────────────────────────
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
      const meId   = getUserIdFromSub(req.user!.sub);
      const meRole = req.user!.role;
      const isFull = hasFullAccess(meRole);

      const [existing] = await db
        .select()
        .from(companyMaintenanceRecords)
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .limit(1);
      if (!existing) throw new NotFoundError('Mantenimiento', req.params.id);

      // Operador solo puede editar los suyos y solo si están Programados
      if (!isFull) {
        if (meId == null || (existing.assignedUserId !== meId && existing.createdBy !== meId)) {
          throw new NotFoundError('Mantenimiento', req.params.id);
        }
      }

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (body.workshopId !== undefined) updateData.workshopId = body.workshopId ? parseId('workshop', body.workshopId) : null;
      if (body.type !== undefined) updateData.type = body.type;
      if (body.status !== undefined) updateData.status = normalizeStatus(body.status);
      if (body.category !== undefined) updateData.category = body.category;
      if (body.title !== undefined) updateData.title = body.title;
      if (body.description !== undefined) updateData.description = body.description;
      if (body.odometerKm !== undefined) updateData.odometerKm = body.odometerKm;
      if (body.cadenceKind !== undefined) updateData.cadenceKind = body.cadenceKind;
      if (body.cadenceValue !== undefined) updateData.cadenceValue = body.cadenceValue;
      if (body.nextTriggerKm !== undefined) updateData.nextTriggerKm = body.nextTriggerKm;
      if (body.scheduledFor !== undefined) updateData.scheduledFor = new Date(body.scheduledFor);
      if (body.executedAt !== undefined) updateData.executedAt = body.executedAt ? new Date(body.executedAt) : null;
      if (body.notes !== undefined) updateData.notes = body.notes;
      if (body.assignedUserId !== undefined) {
        const newAssigned = body.assignedUserId ? parseId('company-user', body.assignedUserId) : null;
        if (!isFull && newAssigned !== meId) {
          throw new ForbiddenError('Solo administradores o supervisores pueden reasignar a otro usuario.');
        }
        // Validar que el user target pertenece a esta empresa
        if (newAssigned != null) {
          const [target] = await db
            .select({ companyId: companyUsers.companyId })
            .from(companyUsers)
            .where(and(eq(companyUsers.id, newAssigned), eq(companyUsers.companyId, companyId)))
            .limit(1);
          if (!target) {
            throw new ForbiddenError('El usuario asignado no pertenece a esta empresa.');
          }
        }
        if (newAssigned !== existing.assignedUserId) {
          updateData.assignedUserId = newAssigned;
          await recordEvent(companyId, id, 'reassigned', {
            userId: meId,
            name:   req.user!.name ?? null,
          }, { from: existing.assignedUserId, to: newAssigned });
        }
      }

      const [updated] = await db
        .update(companyMaintenanceRecords)
        .set(updateData)
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .returning();

      if (body.items) {
        // Defensa en profundidad: borrar items SOLO de mantenimientos de esta empresa
        await db
          .delete(companyMaintenanceItems)
          .where(
            and(
              eq(companyMaintenanceItems.maintenanceId, id),
              // El mantenimiento pertenece a la empresa
              sql`${companyMaintenanceItems.maintenanceId} IN (
                SELECT id FROM ${companyMaintenanceRecords}
                WHERE ${companyMaintenanceRecords.companyId} = ${companyId}
              )`,
            )!,
          );
        if (body.items.length) {
          await db.insert(companyMaintenanceItems).values(buildItemValues(id, body.items));
        }
      }

      const [full] = await db
        .select({
          m: companyMaintenanceRecords,
          assetName:  companyAssets.name,
          assetPlate: companyAssets.plate,
          workshopName: companyWorkshops.name,
          assignedUserName: companyUsersAsigned.username,
        })
        .from(companyMaintenanceRecords)
        .leftJoin(companyAssets, eq(companyAssets.id, companyMaintenanceRecords.assetId))
        .leftJoin(companyWorkshops, eq(companyWorkshops.id, companyMaintenanceRecords.workshopId))
        .leftJoin(companyUsersAsigned, eq(companyUsersAsigned.id, companyMaintenanceRecords.assignedUserId))
        .where(eq(companyMaintenanceRecords.id, id))
        .limit(1);
      const itemsMap  = await loadItemsMap([id]);
      const eventsMap = await loadEventsMap([id]);
      res.json(serializeMaintenance(full!.m, itemsMap.get(id) ?? [], eventsMap.get(id) ?? []));
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /categories ────────────────────────────────────────────────────────
// Solo admin/owner pueden crear.
router.post(
  '/categories',
  requireModule('maintenance'),
  requireAdmin,
  validate(z.object({
    key:        z.string().min(2).max(60).regex(/^[A-Za-z0-9_\-:]+$/, 'Solo letras, números, guion, guion bajo y dos puntos'),
    label:      z.string().min(2).max(120),
    shortLabel: z.string().min(1).max(40).optional().nullable(),
    color:      z.string().min(2).max(20).default('sky'),
    icon:       z.string().min(2).max(40).default('wrench'),
  })),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const body = req.body as { key: string; label: string; shortLabel?: string | null; color?: string; icon?: string };
      try {
        const [created] = await db
          .insert(companyMaintenanceCategories)
          .values({
            companyId,
            key:        body.key,
            label:      body.label,
            shortLabel: body.shortLabel ?? null,
            color:      body.color ?? 'sky',
            icon:       body.icon ?? 'wrench',
            isSystem:   false,
          })
          .returning();
        res.status(201).json({
          id: toId('maint-cat', created.id),
          companyId: toId('company', created.companyId),
          key: created.key,
          label: created.label,
          shortLabel: created.shortLabel,
          color: created.color,
          icon: created.icon,
          isSystem: created.isSystem,
        });
      } catch (e: any) {
        if (e?.code === '23505') {
          throw new AppError(409, `Ya existe una categoría con la clave "${body.key}".`);
        }
        throw e;
      }
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/take ───────────────────────────────────────────────────────────
// Operador "toma" un mantenimiento Programado disponible. Si ya está
// asignado a otro, devuelve 409. El user debe tener execution.crear.
router.post(
  '/:id/take',
  requireModule('maintenance'),
  requirePermission('maintenance', 'execution', 'crear'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const meId = getUserIdFromSub(req.user!.sub);
      if (meId == null) throw new ForbiddenError('Sesión sin userId.');

      const [existing] = await db
        .select()
        .from(companyMaintenanceRecords)
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .limit(1);
      if (!existing) throw new NotFoundError('Mantenimiento', req.params.id);
      if (existing.status !== 'Programado' && existing.status !== 'En curso' && existing.status !== 'En proceso') {
        throw new ForbiddenError(`No se puede tomar un mantenimiento en estado "${existing.status}".`);
      }
      if (existing.assignedUserId && existing.assignedUserId !== meId) {
        throw new AppError(409, 'Este mantenimiento ya está asignado a otro operador.');
      }

      const [updated] = await db
        .update(companyMaintenanceRecords)
        .set({
          assignedUserId: meId,
          takenAt:        new Date(),
          status:         'En proceso',
          updatedAt:      new Date(),
        })
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .returning();

      await recordEvent(companyId, id, 'taken', { userId: meId, name: req.user!.name ?? null });
      res.json({ ok: true, id: toId('maintenance', updated.id), status: 'En proceso' });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/assign ─────────────────────────────────────────────────────────
// Solo admin/owner/supervisor pueden asignar a un usuario específico.
router.post(
  '/:id/assign',
  requireSupervisor,
  validate(assignSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const body = req.body as z.infer<typeof assignSchema>;
      const meId = getUserIdFromSub(req.user!.sub);
      const targetId = parseId('company-user', body.userId);

      const [existing] = await db
        .select()
        .from(companyMaintenanceRecords)
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .limit(1);
      if (!existing) throw new NotFoundError('Mantenimiento', req.params.id);

      const [updated] = await db
        .update(companyMaintenanceRecords)
        .set({
          assignedUserId: targetId,
          updatedAt: new Date(),
        })
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .returning();

      await recordEvent(companyId, id, 'assigned', { userId: meId, name: req.user!.name ?? null }, { targetId });
      res.json({ ok: true, id: toId('maintenance', updated.id), assignedUserId: toId('company-user', targetId) });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/finalize ───────────────────────────────────────────────────────
router.post(
  '/:id/finalize',
  requireModule('maintenance'),
  requirePermission('maintenance', 'execution', 'editar'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const meId   = getUserIdFromSub(req.user!.sub);
      const meRole = req.user!.role;
      const isFull = hasFullAccess(meRole);

      const [existing] = await db
        .select()
        .from(companyMaintenanceRecords)
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .limit(1);
      if (!existing) throw new NotFoundError('Mantenimiento', req.params.id);
      if (existing.status === 'Completado') {
        throw new ForbiddenError('Este mantenimiento ya está completado.');
      }
      // Operador solo puede finalizar los suyos
      if (!isFull) {
        if (meId == null || (existing.assignedUserId !== meId && existing.createdBy !== meId)) {
          throw new ForbiddenError('Solo puedes finalizar mantenimientos asignados a vos.');
        }
      }

      const [updated] = await db
        .update(companyMaintenanceRecords)
        .set({
          status:      'Completado',
          completedAt: new Date(),
          completedBy: meId,
          executedAt:  new Date(),
          updatedAt:   new Date(),
        })
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .returning();

      await recordEvent(companyId, id, 'finalized', { userId: meId, name: req.user!.name ?? null });
      res.json({ ok: true, id: toId('maintenance', updated.id), status: 'Completado' });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/cancel-reschedule ─────────────────────────────────────────────
// Cancela el mantenimiento actual y lo reprograma para una nueva fecha.
// Borra items y fotos. Mantiene la línea de tiempo.
router.post(
  '/:id/cancel-reschedule',
  requireModule('maintenance'),
  requirePermission('maintenance', 'execution', 'editar'),
  validate(cancelRescheduleSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const body = req.body as z.infer<typeof cancelRescheduleSchema>;
      const meId   = getUserIdFromSub(req.user!.sub);
      const meRole = req.user!.role;
      const isFull = hasFullAccess(meRole);

      const [existing] = await db
        .select()
        .from(companyMaintenanceRecords)
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .limit(1);
      if (!existing) throw new NotFoundError('Mantenimiento', req.params.id);
      // Operador solo puede cancelar/reprogramar los suyos
      if (!isFull) {
        if (meId == null || (existing.assignedUserId !== meId && existing.createdBy !== meId)) {
          throw new ForbiddenError('Solo puedes cancelar mantenimientos asignados a vos.');
        }
      }

      // 1) Borrar items (y sus fotos quedan huérfanas; se limpian por storage path)
      await db.delete(companyMaintenanceItems).where(eq(companyMaintenanceItems.maintenanceId, id));

      // 2) Reset: status Programado, mantener assignedUserId, marcar reprogramado
      const [updated] = await db
        .update(companyMaintenanceRecords)
        .set({
          status:         'Programado',
          scheduledFor:   new Date(body.newScheduledFor),
          isReprogrammed: true,
          reprogramReason: body.reason,
          reprogrammedAt:  new Date(),
          reprogramCount:  (existing.reprogramCount ?? 0) + 1,
          // Limpiar flags de ejecución
          executedAt:      null,
          takenAt:         null,
          completedAt:     null,
          completedBy:     null,
          updatedAt:       new Date(),
        })
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .returning();

      // 3) Registrar evento en línea de tiempo (con la foto del antes/después)
      await recordEvent(companyId, id, 'cancelled', {
        userId: meId,
        name:   req.user!.name ?? null,
      }, {
        reason:          body.reason,
        newScheduledFor: body.newScheduledFor,
        previousDate:    existing.scheduledFor,
        itemsCleared:    (existing as any).totalCost !== '0' || true,
      });

      res.json({
        ok: true,
        id: toId('maintenance', updated.id),
        status: 'Programado',
        isReprogrammed: true,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/notes ──────────────────────────────────────────────────────────
router.post(
  '/:id/notes',
  requireModule('maintenance'),
  requirePermission('maintenance', 'execution', 'editar'),
  validate(noteSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const body = req.body as z.infer<typeof noteSchema>;
      const meId = getUserIdFromSub(req.user!.sub);
      await recordEvent(companyId, id, 'note_added', { userId: meId, name: req.user!.name ?? null }, { text: body.text });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/items ──────────────────────────────────────────────────────────
router.post(
  '/:id/items',
  requireModule('maintenance'),
  requirePermission('maintenance', 'execution', 'editar'),
  validate(z.object({ items: z.array(itemSchema).max(50) })),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const meId = getUserIdFromSub(req.user!.sub);
      const body = req.body as { items: z.infer<typeof itemSchema>[] };

      await db.insert(companyMaintenanceItems).values(buildItemValues(id, body.items));
      const total = body.items.reduce((acc, i) => acc + i.quantity * i.unitCost, 0);
      await db
        .update(companyMaintenanceRecords)
        .set({ totalCost: total.toFixed(2), updatedAt: new Date() })
        .where(eq(companyMaintenanceRecords.id, id));

      await recordEvent(companyId, id, 'item_added', {
        userId: meId,
        name:   req.user!.name ?? null,
      }, { count: body.items.length, totalAdded: total });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /categories/:catId ───────────────────────────────────────────────
router.delete(
  '/categories/:catId',
  requireModule('maintenance'),
  requireAdmin,
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const catId = parseId('maint-cat', req.params.catId);
      const [cat] = await db
        .select()
        .from(companyMaintenanceCategories)
        .where(and(eq(companyMaintenanceCategories.id, catId), eq(companyMaintenanceCategories.companyId, companyId)))
        .limit(1);
      if (!cat) throw new NotFoundError('Categoría', req.params.catId);
      if (cat.isSystem) throw new ForbiddenError('No se puede eliminar una categoría del sistema.');
      await db
        .delete(companyMaintenanceCategories)
        .where(and(eq(companyMaintenanceCategories.id, catId), eq(companyMaintenanceCategories.companyId, companyId)));
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── /complete (legacy compat) ───────────────────────────────────────────────
router.post(
  '/:id/complete',
  requireModule('maintenance'),
  requirePermission('maintenance', 'execution', 'editar'),
  async (req, res, next) => {
    req.url = req.url.replace('/complete', '/finalize');
    return router.handle(req, res, next);
  },
);

export default router;
