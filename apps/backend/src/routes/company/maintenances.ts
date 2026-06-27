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
//
// v3.2: se agrega recalcMaintenanceTotal() en POST / (creación con items
// precargados) y en PUT /:id (edición de items y/o laborCost). Antes solo
// se llamaba desde POST /:id/items, lo que dejaba totalCost desactualizado
// cuando los repuestos se agregaban/editaban desde el modal de edición en
// vez del quick-add del drawer.

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
  companyMaintenanceCarwashExtras,
  companyMaintenanceCarwashPhotos,
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
const MAINT_TYPES = ['Correctivo', 'Programado', 'Lavada'] as const;

// Schema individual para un adjunto. La URL la emite el endpoint de
// upload genérico; el frontend la manda de vuelta para guardarla.
const attachmentSchema = z.object({
  url:        z.string().min(1).max(2_000_000),
  label:      z.string().min(1).max(60).default('Adjunto'),
  uploadedAt: z.string().datetime().optional(),
});

const createMaintenanceSchema = z.object({
  assetId:        z.string().min(1, 'El vehículo es requerido'),
  workshopId:     z.string().optional().nullable(),
  type:           z.enum(MAINT_TYPES).default('Programado'),
  status:         z.enum(MAINT_STATUSES).default('Programado'),
  category:       z.string().min(1).default('Otro'),  // acepta customs
  categoryCustomId: z.string().optional().nullable(),
  title:          safeString({ min: 3, max: 200, fieldLabel: 'Título', allowEmpty: false }),
  description:    validators.longTextOptional,
  odometerKm:     z.number().int().nonnegative().max(10_000_000).optional().nullable(),
  // v3.1: mano de obra (separada de los items)
  laborCost:      z.number().nonnegative().max(1_000_000_000).default(0),
  // IVA: porcentaje aplicado (default 15 para Ecuador)
  ivaPercent:     z.number().nonnegative().max(100).default(15),
  cadenceKind:    z.enum(CADENCE_KINDS).default('none'),
  cadenceValue:   z.number().int().positive().max(1_000_000).optional().nullable(),
  nextTriggerKm:  z.number().int().nonnegative().max(10_000_000).optional().nullable(),
  scheduledFor:   z.string().min(1, 'Fecha programada requerida'),
  notes:          validators.longTextOptional,
  items:          z.array(itemSchema).max(50).default([]),
  // v3.1: campos de lavada (se usan solo cuando type='Lavada')
  carwashLocation: z.string().max(200).optional().nullable(),
  carwashProvider: z.string().max(200).optional().nullable(),
  carwashNotes:    validators.longTextOptional,
  // Costo explícito del servicio (lo que pagó el admin en el modal).
  carwashTotal:    z.number().nonnegative().max(1_000_000_000).optional().nullable(),
  // Adjuntos (facturas, fotos de evidencia) — máximo 30 para evitar
  // payloads enormes.
  attachments:     z.array(attachmentSchema).max(30).optional(),
  // El operador que crea puede auto-asignarse o dejarlo libre. Solo un
  // supervisor/admin/owner puede asignar a otro operador.
  assignedUserId: z.string().optional().nullable(),
});

const updateMaintenanceSchema = z.object({
  workshopId:     z.string().optional().nullable(),
  type:           z.enum(MAINT_TYPES).optional(),
  status:         z.enum(MAINT_STATUSES).optional(),
  category:       z.string().min(1).optional(),
  categoryCustomId: z.string().optional().nullable(),
  title:          safeString({ min: 3, max: 200, fieldLabel: 'Título', allowEmpty: false }).optional(),
  description:    validators.longTextOptional,
  odometerKm:     z.number().int().nonnegative().max(10_000_000).optional().nullable(),
  // v3.1: mano de obra
  laborCost:      z.number().nonnegative().max(1_000_000_000).optional(),
  // IVA: porcentaje aplicado
  ivaPercent:     z.number().nonnegative().max(100).optional(),
  cadenceKind:    z.enum(CADENCE_KINDS).optional(),
  cadenceValue:   z.number().int().positive().max(1_000_000).optional().nullable(),
  nextTriggerKm:  z.number().int().nonnegative().max(10_000_000).optional().nullable(),
  scheduledFor:   z.string().optional(),
  notes:          validators.longTextOptional,
  items:          z.array(itemSchema).max(50).optional(),
  // v3.1: campos de lavada
  carwashLocation: z.string().max(200).optional().nullable(),
  carwashProvider: z.string().max(200).optional().nullable(),
  carwashNotes:    validators.longTextOptional,
  // Costo explícito del servicio.
  carwashTotal:    z.number().nonnegative().max(1_000_000_000).optional().nullable(),
  // Adjuntos (facturas, fotos de evidencia)
  attachments:     z.array(attachmentSchema).max(30).optional(),
  assignedUserId: z.string().optional().nullable(),
});

const cancelRescheduleSchema = z.object({
  newScheduledFor: z.string().min(1, 'Nueva fecha requerida'),
  reason:           safeString({ min: 3, max: 1000, fieldLabel: 'Motivo', allowEmpty: false }),
});

const requestCorrectionSchema = z.object({
  reason: safeString({ min: 3, max: 1000, fieldLabel: 'Motivo', allowEmpty: false }),
  newScheduledFor: z.string().optional().nullable(), // si no viene, se corrige "hoy"
});

const noteSchema = z.object({
  text: safeString({ min: 1, max: 4000, fieldLabel: 'Nota', allowEmpty: false }),
});

const assignSchema = z.object({
  userId: z.string().min(1, 'Operador requerido'),
});

const updateDatesSchema = z.object({
  executedAt:  z.string().datetime().optional().nullable(),
  completedAt: z.string().datetime().optional().nullable(),
}).refine(
  (b) => b.executedAt !== undefined || b.completedAt !== undefined,
  { message: 'Debe enviar al menos executedAt o completedAt.' },
);

const carwashExtraSchema = z.object({
  name:     safeString({ min: 1, max: 180, fieldLabel: 'Nombre', allowEmpty: false }),
  quantity: z.number().positive().max(1_000_000).default(1),
  unitCost: z.number().nonnegative().max(1_000_000_000).default(0),
  photoUrl: z.string().min(1).optional().nullable(),
});

const carwashPhotoSchema = z.object({
  photoUrl: z.string().min(1, 'URL de foto requerida'),
  caption:   z.string().max(200).optional().nullable(),
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

/**
 * Recalcula el `totalCost` de un mantenimiento a partir de:
 *   - laborCost (mano de obra) del registro principal
 *   - suma de (quantity * unitCost) de cada item (repuesto)
 *   - suma de (quantity * unitCost) de cada carwash_extra
 *
 * Persiste el resultado en `company_maintenance_records.totalCost` para
 * que la lista de la tabla lo muestre sin tener que hacer un JOIN extra.
 * No tira error si el mantenimiento no existe — retorna silenciosamente.
 *
 * IMPORTANTE: se debe llamar SIEMPRE que cambien items, carwash extras,
 * o laborCost — no solo desde POST /:id/items. Antes solo se llamaba ahí,
 * lo que dejaba totalCost desactualizado al crear un mantenimiento con
 * items precargados (POST /) o al editar items/laborCost desde el modal
 * de edición (PUT /:id).
 */
async function recalcMaintenanceTotal(maintenanceId: number): Promise<number> {
  const [m] = await db
    .select({
      id: companyMaintenanceRecords.id,
      type: companyMaintenanceRecords.type,
      laborCost: companyMaintenanceRecords.laborCost,
      carwashTotal: companyMaintenanceRecords.carwashTotal,
    })
    .from(companyMaintenanceRecords)
    .where(eq(companyMaintenanceRecords.id, maintenanceId))
    .limit(1);
  if (!m) return 0;

  const [extrasSum] = await db
    .select({ s: sql<number>`COALESCE(SUM(${companyMaintenanceCarwashExtras.quantity} * ${companyMaintenanceCarwashExtras.unitCost}), 0)` })
    .from(companyMaintenanceCarwashExtras)
    .where(eq(companyMaintenanceCarwashExtras.maintenanceId, maintenanceId));

  const extras = Number(extrasSum?.s ?? 0);

  let total: number;
  if (m.type === 'Lavada') {
    // En lavada el Total = costo del servicio (carwashTotal) + adicionales.
    // No hay laborCost ni items en este tipo.
    total = Number(m.carwashTotal ?? 0) + extras;
  } else {
    const [itemsSum] = await db
      .select({ s: sql<number>`COALESCE(SUM(${companyMaintenanceItems.quantity} * ${companyMaintenanceItems.unitCost}), 0)` })
      .from(companyMaintenanceItems)
      .where(eq(companyMaintenanceItems.maintenanceId, maintenanceId));
    const labor = m.laborCost != null ? Number(m.laborCost) : 0;
    const items = Number(itemsSum?.s ?? 0);
    total = labor + items;
  }

  await db
    .update(companyMaintenanceRecords)
    .set({ totalCost: String(total) })
    .where(eq(companyMaintenanceRecords.id, maintenanceId));

  return total;
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
    // v3.1: mano de obra
    laborCost:     m.laborCost != null ? Number(m.laborCost) : 0,
    ivaPercent:    m.ivaPercent != null ? Number(m.ivaPercent) : 15,
    cadenceKind:   m.cadenceKind,
    cadenceValue:  m.cadenceValue,
    nextTriggerKm: m.nextTriggerKm,
    scheduledFor:  m.scheduledFor,
    executedAt:    m.executedAt,
    completedAt:   m.completedAt,
    notes:         m.notes,
    totalCost:     Number(m.totalCost),
    // v3.1: campos de lavada
    carwashLocation: m.carwashLocation ?? null,
    carwashProvider: m.carwashProvider ?? null,
    carwashNotes:    m.carwashNotes ?? null,
    carwashTotal:    Number(m.carwashTotal ?? 0),
    // Adjuntos subidos durante la ejecución. El default del schema
    // garantiza que siempre sea un array.
    attachments:     (m as any).attachments ?? [],
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
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'ver'),
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
      //  - operador → ve lo suyo (assigned_user_id = me OR created_by = me)
      //    + lo que está LIBRE (assigned_user_id IS NULL) para poder tomarlo.
      //  - ?scope=mine fuerza la vista estricta "solo lo mío", sin los libres,
      //    tanto para operador como para full access.
      if (scope === 'mine') {
        if (meId == null) {
          return res.json({ data: [], total: 0 });
        }
        where.push(
          or(
            eq(companyMaintenanceRecords.assignedUserId, meId),
            eq(companyMaintenanceRecords.createdBy, meId),
          )!,
        );
      } else if (!isFull) {
        if (meId == null) {
          return res.json({ data: [], total: 0 });
        }
        where.push(
          or(
            eq(companyMaintenanceRecords.assignedUserId, meId),
            eq(companyMaintenanceRecords.createdBy, meId),
            isNull(companyMaintenanceRecords.assignedUserId),
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
                // La búsqueda libre también matchea por placa y por
                // nombre del vehículo, así un solo input cubre todo.
                ilike(companyAssets.plate,                  `%${q}%`),
                ilike(companyAssets.name,                   `%${q}%`),
              )!,
            ),
          )
        : baseQuery;

      const rows = await finalQuery;
      const ids  = rows.map((r) => (r.m as any).id);
      const [itemsMap, eventsMap] = await Promise.all([loadItemsMap(ids), loadEventsMap(ids)]);

      res.json({
        data: rows.map((r) => {
          // Merge de la fila + los joins (assetPlate, assetName, workshopName,
          // assignedUserName) para que `serializeMaintenance` los encuentre
          // en `m.xxx` como espera.
          const merged = { ...r.m, ...r };
          return serializeMaintenance(merged, itemsMap.get((r.m as any).id) ?? [], eventsMap.get((r.m as any).id) ?? []);
        }),
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
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'agenda', 'ver'),
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
      // Igual que en GET / : el operador ve lo suyo + lo libre (sin asignar)
      // para poder tomarlo desde la agenda también.
      if (!isFull && meId != null) {
        whereParts.push(
          or(
            eq(companyMaintenanceRecords.assignedUserId, meId),
            eq(companyMaintenanceRecords.createdBy, meId),
            isNull(companyMaintenanceRecords.assignedUserId),
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
        data: rows.map((r) => serializeMaintenance({ ...r.m, ...r }, itemsMap.get((r.m as any).id) ?? [], eventsMap.get((r.m as any).id) ?? [])),
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
  requireModule('mantenimiento'),
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

// ─── GET /cost-breakdown ───────────────────────────────────────────────────────
// IMPORTANTE: esta ruta está ANTES de /:id. Si se pone después, Express
// matchea "cost-breakdown" como id numérico y devuelve 404.
//
// Devuelve el desglose por mantenimiento: mano de obra (taller) +
// repuestos agrupados por proveedor.
//
// Query params opcionales:
//   from, to       → rango de fechas (default: últimos 12 meses)
//   workshopId     → filtra por taller
//   supplierId     → filtra por proveedor (solo repuestos de ese proveedor)
//   assetId        → filtra por vehículo
//
// Devuelve:
//   {
//     rango: { desde, hasta },
//     filtros: { workshopId, supplierId, assetId },
//     totals: { manoObra, repuestos, total },
//     byWorkshop: [{ workshopId, workshopName, total, count }],
//     bySupplier: [{ supplierId, supplierName, total, itemsCount }],
//     mantenances: [{ id, title, ... }]
//   }
router.get(
  "/cost-breakdown",
  requireModule("mantenimiento"),
  requirePermission("mantenimiento", "records", "ver"),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const from = (req.query.from as string | undefined)
        ? new Date(req.query.from as string)
        : (() => { const d = new Date(); d.setMonth(d.getMonth() - 12); return d; })();
      const to = (req.query.to as string | undefined)
        ? new Date(req.query.to as string)
        : new Date();
      const workshopId = req.query.workshopId ? Number(req.query.workshopId) : null;
      const supplierId = req.query.supplierId ? Number(req.query.supplierId) : null;
      const assetId    = req.query.assetId    ? Number(req.query.assetId)    : null;

      // 1) Traer los mantenimientos del rango
      const whereMant: any[] = [
        eq(companyMaintenanceRecords.companyId, companyId),
        gte(companyMaintenanceRecords.createdAt, from),
        lte(companyMaintenanceRecords.createdAt, to),
      ];
      if (assetId)    whereMant.push(eq(companyMaintenanceRecords.assetId, assetId));
      if (workshopId) whereMant.push(eq(companyMaintenanceRecords.workshopId, workshopId));

      const mantenances = await db
        .select({
          id:             companyMaintenanceRecords.id,
          title:          companyMaintenanceRecords.title,
          assetId:        companyMaintenanceRecords.assetId,
          workshopId:     companyMaintenanceRecords.workshopId,
          status:         companyMaintenanceRecords.status,
          totalCost:      companyMaintenanceRecords.totalCost,
          laborCost:      companyMaintenanceRecords.laborCost,
          scheduledFor:   companyMaintenanceRecords.scheduledFor,
          completedAt:    companyMaintenanceRecords.completedAt,
        })
        .from(companyMaintenanceRecords)
        .where(and(...whereMant))
        .orderBy(desc(companyMaintenanceRecords.scheduledFor));

      // 2) Traer los items de esos mantenimientos (con supplier)
      const mantenimientoIds = mantenances.map((m) => m.id);
      let items: Array<{
        id: number; mantenimientoId: number; supplierId: number | null;
        name: string; quantity: string; unitCost: string; subtotal: string;
      }> = [];
      if (mantenimientoIds.length) {
        const whereItems: any[] = [inArray(companyMaintenanceItems.maintenanceId, mantenimientoIds)];
        if (supplierId) whereItems.push(eq(companyMaintenanceItems.supplierId, supplierId));
        items = await db
          .select({
            id:             companyMaintenanceItems.id,
            mantenimientoId: companyMaintenanceItems.maintenanceId,
            supplierId:     companyMaintenanceItems.supplierId,
            name:           companyMaintenanceItems.name,
            quantity:       companyMaintenanceItems.quantity,
            unitCost:       companyMaintenanceItems.unitCost,
            subtotal:       companyMaintenanceItems.subtotal,
          })
          .from(companyMaintenanceItems)
          .where(and(...whereItems));
      }

      // 3) Traer talleres y proveedores (para mapear id → nombre)
      const [workshops, suppliers, assetRows] = await Promise.all([
        db.select().from(companyWorkshops).where(eq(companyWorkshops.companyId, companyId)),
        db.select().from(companySuppliers).where(eq(companySuppliers.companyId, companyId)),
        mantenances.length
          ? db
              .select({ id: companyAssets.id, name: companyAssets.name, plate: companyAssets.plate })
              .from(companyAssets)
              .where(and(
                eq(companyAssets.companyId, companyId),
                inArray(companyAssets.id, mantenances.map((m) => m.assetId).filter((id): id is number => id != null)),
              ))
          : Promise.resolve([] as Array<{ id: number; name: string; plate: string | null }>),
      ]);

      const workshopMap  = new Map(workshops.map((w)  => [w.id,  { name: w.name,  nit: w.nit  }]));
      const supplierMap  = new Map(suppliers.map((s)  => [s.id,  { name: s.name,  nit: s.nit  }]));
      const assetMap     = new Map(assetRows.map((a)   => [a.id,  { name: a.name,  plate: a.plate }]));

      // 4) Por mantenimiento: agrupar items por supplier
      const itemsByMant = new Map<number, typeof items>();
      for (const it of items) {
        if (!itemsByMant.has(it.mantenimientoId)) itemsByMant.set(it.mantenimientoId, []);
        itemsByMant.get(it.mantenimientoId)!.push(it);
      }

      // 5) Construir la respuesta
      const mantenancesOut = mantenances.map((m) => {
        const myItems = itemsByMant.get(m.id) ?? [];
        const repuestos = myItems.reduce((acc, it) => acc + Number(it.subtotal ?? 0), 0);
        const labor     = Number(m.laborCost ?? 0);
        const total     = Number(m.totalCost ?? 0);
        return {
          id:             m.id,
          title:          m.title ?? "—",
          assetPlate:     assetMap.get(m.assetId)?.plate || assetMap.get(m.assetId)?.name || "—",
          assetName:      assetMap.get(m.assetId)?.name ?? null,
          scheduledDate:  m.scheduledFor,
          completedAt:    m.completedAt,
          status:         m.status,
          workshop:       m.workshopId ? {
            id:    m.workshopId,
            name:  workshopMap.get(m.workshopId)?.name ?? "—",
            nit:   workshopMap.get(m.workshopId)?.nit  ?? null,
          } : null,
          manoObra:       round2(labor),
          repuestos:      round2(repuestos),
          total:          round2(total),
          repuestosPorProveedor: supplierId
            ? null
            : (() => {
                const map: Record<number, { supplierId: number; supplierName: string; total: number; count: number }> = {};
                for (const it of myItems) {
                  if (!it.supplierId) continue;
                  if (!map[it.supplierId]) {
                    map[it.supplierId] = {
                      supplierId: it.supplierId,
                      supplierName: supplierMap.get(it.supplierId)?.name ?? "Sin proveedor",
                      total: 0,
                      count: 0,
                    };
                  }
                  map[it.supplierId].total += Number(it.subtotal ?? 0);
                  map[it.supplierId].count += 1;
                }
                return Object.values(map).map((r) => ({
                  supplierId:   r.supplierId,
                  supplierName: r.supplierName,
                  total:        round2(r.total),
                  itemsCount:   r.count,
                }));
              })(),
        };
      });

      // 6) Totales por taller y por proveedor
      const byWorkshop: Record<number, { workshopId: number; workshopName: string; total: number; count: number }> = {};
      for (const m of mantenances) {
        if (!m.workshopId) continue;
        if (!byWorkshop[m.workshopId]) {
          byWorkshop[m.workshopId] = {
            workshopId:   m.workshopId,
            workshopName: workshopMap.get(m.workshopId)?.name ?? "—",
            total:        0,
            count:        0,
          };
        }
        byWorkshop[m.workshopId].total += Number(m.totalCost ?? 0);
        byWorkshop[m.workshopId].count += 1;
      }

      const bySupplier: Record<number, { supplierId: number; supplierName: string; total: number; itemsCount: number }> = {};
      for (const it of items) {
        if (!it.supplierId) continue;
        if (!bySupplier[it.supplierId]) {
          bySupplier[it.supplierId] = {
            supplierId:   it.supplierId,
            supplierName: supplierMap.get(it.supplierId)?.name ?? "Sin proveedor",
            total:        0,
            itemsCount:   0,
          };
        }
        bySupplier[it.supplierId].total += Number(it.subtotal ?? 0);
        bySupplier[it.supplierId].itemsCount += 1;
      }

      const totals = {
        manoObra:  round2(mantenances.reduce((a, m) => a + Number(m.laborCost ?? 0), 0)),
        repuestos: round2(items.reduce((a, it) => a + Number(it.subtotal ?? 0), 0)),
        total:     round2(mantenances.reduce((a, m) => a + Number(m.totalCost ?? 0), 0)),
      };

      return res.json({
        rango:        { desde: from.toISOString().slice(0, 10), hasta: to.toISOString().slice(0, 10) },
        filtros:      { workshopId, supplierId, assetId },
        totals,
        byWorkshop:   Object.values(byWorkshop).sort((a, b) => b.total - a.total),
        bySupplier:   Object.values(bySupplier).sort((a, b) => b.total - a.total),
        mantenances:  mantenancesOut,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /:id ──────────────────────────────────────────────────────────────────
router.get(
  '/:id',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'ver'),
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

      const m = { ...(row.m as any), ...row } as any;
      // Control de visibilidad: si no es full access, puede ver el suyo
      // (asignado o creado por él) o cualquiera que esté LIBRE (sin
      // asignar) para poder tomarlo. Si no es nada de eso → 404.
      if (!isFull) {
        const isMine = meId != null && (m.assignedUserId === meId || m.createdBy === meId);
        const isFree = m.assignedUserId == null;
        if (!isMine && !isFree) {
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
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'crear'),
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

      // Asignación y status: las reglas del módulo.
      //
      //   * Correctivo y Lavada NO son programados — siempre arrancan
      //     en 'En proceso' (urgencia: el operador ya está trabajando).
      //   * Programado arranca en 'Programado'.
      //   * Si el que crea NO tiene full access (operador):
      //       - Si manda assignedUserId y es a sí mismo → ok.
      //       - Si manda assignedUserId a otro → 403.
      //       - Si no manda nada y crea Correctivo o Lavada → se
      //         auto-asigna a sí mismo (es lo lógico, está haciéndolo
      //         él mismo).
      //       - Si no manda nada y crea Programado → queda libre
      //         (null), el supervisor lo asigna después.
      //   * Si tiene full access (admin/owner/supervisor):
      //       - Puede asignar a cualquiera (validando que pertenezca a
      //         la empresa) o dejarlo libre.
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
        // Auto-asignación por defecto.
        // Operador que crea Correctivo o Lavada se auto-asigna
        // (es lo lógico: lo está haciendo él).
        const isUrgente = body.type === 'Correctivo' || body.type === 'Lavada';
        if (!isFull && isUrgente && meId != null) {
          assignedUserId = meId;
        }
        // Programado por defecto: queda libre (null).
      }

      // Status automático: Correctivo y Lavada → 'En proceso'.
      // Si el cliente mandó status explícito y NO es urgente, lo
      // respetamos (e.g. crear un Programado como Completado directo).
      const isUrgente = body.type === 'Correctivo' || body.type === 'Lavada';
      const finalStatus = isUrgente
        ? 'En proceso'
        : normalizeStatus(body.status ?? 'Programado');

      const [created] = await db
        .insert(companyMaintenanceRecords)
        .values({
          companyId,
          assetId,
          workshopId,
          type:           body.type,
          status:         finalStatus,
          category:       body.category ?? 'Otro',
          title:          body.title,
          description:    body.description ?? null,
          odometerKm:     body.odometerKm ?? null,
          // v3.1: mano de obra
          laborCost:      String(body.laborCost ?? 0),
          ivaPercent:     String(body.ivaPercent ?? 15),
          cadenceKind:    body.cadenceKind,
          cadenceValue:   body.cadenceValue ?? null,
          nextTriggerKm:  body.nextTriggerKm ?? null,
          scheduledFor:   new Date(body.scheduledFor),
          executedAt:     isUrgente ? new Date() : null,
          notes:          body.notes ?? null,
          // Total: para lavada, lo que costó el servicio. Para Programado/Correctivo
          // se calcula luego con la suma de mano de obra + repuestos.
          totalCost:      body.type === 'Lavada' ? String(body.carwashTotal ?? 0) : '0',
          // v3.1: campos de lavada
          carwashLocation: body.type === 'Lavada' ? (body.carwashLocation ?? null) : null,
          carwashProvider: body.type === 'Lavada' ? (body.carwashProvider ?? null) : null,
          carwashNotes:    body.type === 'Lavada' ? (body.carwashNotes ?? null) : null,
          carwashTotal:    body.type === 'Lavada' ? (body.carwashTotal ?? 0)         : 0,
          // Adjuntos — default [] (la columna ya tiene default '[]'::jsonb,
          // pero si el body no los manda, mandamos [] explícito).
          attachments:     body.attachments ?? [],
          createdBy:      meId,
          assignedUserId,
        })
        .returning();

      // Insertar items si vinieron (solo aplican a Programado/Correctivo,
      // no a Lavada).
      if (body.type !== 'Lavada' && body.items?.length) {
        await db.insert(companyMaintenanceItems).values(buildItemValues(created.id, body.items));
      }
      // Recalcular totalCost ahora que ya están insertados los items
      // (y laborCost, que ya viene seteado en el insert de arriba).
      // Sin esto, un mantenimiento creado con items precargados quedaba
      // con totalCost = '0' hasta que alguien tocara /items manualmente.
      await recalcMaintenanceTotal(created.id);

      // Línea de tiempo: created
      await recordEvent(companyId, created.id, 'created', {
        userId: meId,
        name:   req.user!.name ?? null,
      }, { title: body.title, type: body.type, status: finalStatus });
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

      res.status(201).json(serializeMaintenance({ ...full!.m, ...full! }, itemsMap.get(created.id) ?? [], eventsMap.get(created.id) ?? []));
    } catch (err) {
      next(err);
    }
  },
);

// ─── PUT /:id ──────────────────────────────────────────────────────────────────
router.put(
  '/:id',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'editar'),
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
      // v3.1: mano de obra
      if (body.laborCost !== undefined) updateData.laborCost = String(body.laborCost);
      if (body.ivaPercent !== undefined) updateData.ivaPercent = String(body.ivaPercent);
      if (body.cadenceKind !== undefined) updateData.cadenceKind = body.cadenceKind;
      if (body.cadenceValue !== undefined) updateData.cadenceValue = body.cadenceValue;
      if (body.nextTriggerKm !== undefined) updateData.nextTriggerKm = body.nextTriggerKm;
      if (body.scheduledFor !== undefined) updateData.scheduledFor = new Date(body.scheduledFor);
      if (body.notes !== undefined) updateData.notes = body.notes;
      if (body.carwashLocation !== undefined) updateData.carwashLocation = body.carwashLocation ?? null;
      if (body.carwashProvider !== undefined) updateData.carwashProvider = body.carwashProvider ?? null;
      if (body.carwashNotes !== undefined) updateData.carwashNotes = body.carwashNotes ?? null;
      if (body.carwashTotal !== undefined) {
        updateData.carwashTotal = body.carwashTotal ?? 0;
      }
      // Adjuntos: si vienen en el body, los reemplazo completamente. El
      // frontend los maneja como array — agregar/eliminar = mutar el
      // array local y reenviarlo entero en el PUT.
      if (body.attachments !== undefined) updateData.attachments = body.attachments;
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

      // Recalcular totalCost: cubre tanto el reemplazo de items como un
      // cambio de laborCost (laborCost ya se persistió arriba en el
      // update de updateData). Antes este endpoint nunca tocaba
      // totalCost, así que editar repuestos desde el modal dejaba el
      // total desactualizado hasta que alguien usara el quick-add del
      // drawer (que sí lo recalculaba).
      await recalcMaintenanceTotal(id);

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
      res.json(serializeMaintenance({ ...full!.m, ...full! }, itemsMap.get(id) ?? [], eventsMap.get(id) ?? []));
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /categories ────────────────────────────────────────────────────────
// Solo admin/owner pueden crear.
router.post(
  '/categories',
  requireModule('mantenimiento'),
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
// Operador (o admin/supervisor) "toma" un mantenimiento Programado/Corrección
// disponible o ya propio: lo asocia al usuario, pero NO cambia el estado.
// El mantenimiento sigue en Programado (o Correccion) hasta que el usuario
// decida iniciarlo explícitamente con /:id/start. Si ya está asignado a
// otro, devuelve 409.
router.post(
  '/:id/take',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'crear'),
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
      if (existing.status !== 'Programado' && existing.status !== 'En curso' && existing.status !== 'En proceso' && existing.status !== 'Correccion') {
        throw new ForbiddenError(`No se puede tomar un mantenimiento en estado "${existing.status}".`);
      }
      if (existing.assignedUserId && existing.assignedUserId !== meId) {
        throw new AppError(409, 'Este mantenimiento ya está asignado a otro operador.');
      }

      // Si ya es suyo, "tomar" es un no-op (no duplicamos el evento).
      if (existing.assignedUserId === meId) {
        return res.json({
          ok: true,
          id: toId('maintenance', existing.id),
          status: normalizeStatus(existing.status),
          assignedUserId: toId('company-user', meId),
        });
      }

      const [updated] = await db
        .update(companyMaintenanceRecords)
        .set({
          assignedUserId: meId,
          takenAt:        new Date(),
          updatedAt:      new Date(),
        })
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .returning();

      await recordEvent(companyId, id, 'taken', { userId: meId, name: req.user!.name ?? null });
      res.json({
        ok: true,
        id: toId('maintenance', updated.id),
        status: normalizeStatus(updated.status),
        assignedUserId: toId('company-user', meId),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/start ──────────────────────────────────────────────────────────
// Pasa un mantenimiento Programado/Corrección, ya asignado al usuario (o
// full access), a "En proceso". Separado de /take: tomar ya no implica
// arrancar — el operador puede tomarlo con anticipación y arrancarlo el
// día que corresponda.
router.post(
  '/:id/start',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'crear'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const meId   = getUserIdFromSub(req.user!.sub);
      const meRole = req.user!.role;
      const isFull = hasFullAccess(meRole);
      if (meId == null) throw new ForbiddenError('Sesión sin userId.');

      const [existing] = await db
        .select()
        .from(companyMaintenanceRecords)
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .limit(1);
      if (!existing) throw new NotFoundError('Mantenimiento', req.params.id);
      if (existing.status !== 'Programado' && existing.status !== 'En curso' && existing.status !== 'Correccion') {
        throw new ForbiddenError(`No se puede iniciar un mantenimiento en estado "${normalizeStatus(existing.status)}".`);
      }
      // Solo el dueño (asignado o creador) o full access puede iniciar.
      const isMine = existing.assignedUserId === meId || existing.createdBy === meId;
      if (!isFull && !isMine) {
        throw new ForbiddenError('Este mantenimiento está asignado a otro operador.');
      }
      // Si por alguna razón sigue libre (no debería pasar con la UI
      // actual, que exige "tomar" antes de "iniciar"), lo asignamos al
      // que lo inicia para no dejar un "En proceso" sin dueño.
      const assignedUserId = existing.assignedUserId ?? meId;

      const [updated] = await db
        .update(companyMaintenanceRecords)
        .set({
          assignedUserId,
          takenAt:        existing.takenAt ?? new Date(),
          executedAt:     new Date(),
          status:         'En proceso',
          updatedAt:      new Date(),
        })
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .returning();

      await recordEvent(companyId, id, 'started', { userId: meId, name: req.user!.name ?? null });
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

// ─── PATCH /:id/dates ─────────────────────────────────────────────────────────
// Edita las fechas de ejecución y/o finalización de un mantenimiento ya
// existente. Pensado para corregir registros históricos que se cargan hoy
// pero ocurrieron en el pasado
router.patch(
  '/:id/dates',
  requireModule('mantenimiento'),
  requireAdmin,
  validate(updateDatesSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const meRole = req.user!.role;

      if (meRole !== 'owner_empresa' && meRole !== 'admin_empresa' && meRole !== 'operador') {
        throw new ForbiddenError('Solo administradores, propietarios u operadores pueden editar estas fechas.');
      }

      const body = req.body as z.infer<typeof updateDatesSchema>;

      const [existing] = await db
        .select({ id: companyMaintenanceRecords.id })
        .from(companyMaintenanceRecords)
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .limit(1);
      if (!existing) throw new NotFoundError('Mantenimiento', req.params.id);

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (body.executedAt !== undefined) {
        updateData.executedAt = body.executedAt ? new Date(body.executedAt) : null;
      }
      if (body.completedAt !== undefined) {
        updateData.completedAt = body.completedAt ? new Date(body.completedAt) : null;
      }

      const [updated] = await db
        .update(companyMaintenanceRecords)
        .set(updateData)
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .returning();

      res.json({
        ok: true,
        id: toId('maintenance', updated.id),
        executedAt: updated.executedAt,
        completedAt: updated.completedAt,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/finalize ───────────────────────────────────────────────────────
router.post(
  '/:id/finalize',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'editar'),
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
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'editar'),
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

      // 3) Recalcular totalCost: como se borraron los items, el total
      // debe volver a ser solo laborCost (+ extras de lavada si los hubiera).
      await recalcMaintenanceTotal(id);

      // 4) Registrar evento en línea de tiempo (con la foto del antes/después)
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

// ─── POST /:id/request-correction ────────────────────────────────────────────
// Solo owner/admin/supervisor pueden reabrir un Completado para corrección.
// Si mandan newScheduledFor, se reagenda (como reprogramar); si no, queda
// para corregir el mismo día, directo en 'Correccion'.
router.post(
  '/:id/request-correction',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'editar'),
  validate(requestCorrectionSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const body = req.body as z.infer<typeof requestCorrectionSchema>;
      const meId   = getUserIdFromSub(req.user!.sub);
      const meRole = req.user!.role;

      if (meRole !== 'owner_empresa' && meRole !== 'admin_empresa' && meRole !== 'supervisor') {
        throw new ForbiddenError('Solo administradores o supervisores pueden marcar una corrección.');
      }

      const [existing] = await db
        .select()
        .from(companyMaintenanceRecords)
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .limit(1);
      if (!existing) throw new NotFoundError('Mantenimiento', req.params.id);
      if (existing.status !== 'Completado') {
        throw new ForbiddenError('Solo se puede solicitar corrección sobre un mantenimiento completado.');
      }

      const updateData: Record<string, unknown> = {
        status:                'Correccion',
        correctionReason:      body.reason,
        correctionRequestedAt: new Date(),
        completedAt:           null,
        completedBy:           null,
        updatedAt:             new Date(),
      };
      if (body.newScheduledFor) {
        updateData.scheduledFor = new Date(body.newScheduledFor);
      }

      const [updated] = await db
        .update(companyMaintenanceRecords)
        .set(updateData)
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .returning();

      await recordEvent(companyId, id, 'correction_requested', {
        userId: meId,
        name:   req.user!.name ?? null,
      }, {
        reason: body.reason,
        newScheduledFor: body.newScheduledFor ?? null,
        rescheduled: !!body.newScheduledFor,
      });

      res.json({
        ok: true,
        id: toId('maintenance', updated.id),
        status: 'Correccion',
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/notes ──────────────────────────────────────────────────────────
router.post(
  '/:id/notes',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'editar'),
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
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'editar'),
  validate(z.object({ items: z.array(itemSchema).max(50) })),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const meId = getUserIdFromSub(req.user!.sub);
      const body = req.body as { items: z.infer<typeof itemSchema>[] };

      await db.insert(companyMaintenanceItems).values(buildItemValues(id, body.items));
      // Recalcular totalCost = laborCost + items + extras. Esto deja
      // la tabla de mantenimientos con el monto actualizado al instante
      // (sin tener que re-cargar la lista manualmente).
      const total = await recalcMaintenanceTotal(id);

      await recordEvent(companyId, id, 'item_added', {
        userId: meId,
        name:   req.user!.name ?? null,
      }, { count: body.items.length, totalAdded: total });

      res.json({ ok: true, totalCost: total });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/carwash-extras ─────────────────────────────────────────────────
// Solo aplica a mantenimientos type='Lavada'. Inserta adicionales y suma
// al totalCost.
router.post(
  '/:id/carwash-extras',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'editar'),
  validate(z.object({ extras: z.array(carwashExtraSchema).max(50) })),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const meId = getUserIdFromSub(req.user!.sub);
      const body = req.body as { extras: z.infer<typeof carwashExtraSchema>[] };

      // Validar que el mantenimiento existe y es de esta empresa
      const [m] = await db
        .select({ id: companyMaintenanceRecords.id, type: companyMaintenanceRecords.type })
        .from(companyMaintenanceRecords)
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .limit(1);
      if (!m) throw new NotFoundError('Mantenimiento', req.params.id);
      if (m.type !== 'Lavada') {
        throw new ForbiddenError('Los adicionales de lavada solo aplican a mantenimientos de tipo Lavada.');
      }

      const inserted = await db.insert(companyMaintenanceCarwashExtras).values(
        body.extras.map((e) => ({
          maintenanceId: id,
          name:     e.name,
          quantity: String(e.quantity),
          unitCost: String(e.unitCost),
          subtotal: (e.quantity * e.unitCost).toFixed(2),
          photoUrl: e.photoUrl ?? null,
        }))
      ).returning();

      // Recalcular totalCost desde cero (labor + items + extras), en vez
      // de incrementar el valor existente con SQL. Esto es más robusto:
      // si el totalCost ya estaba desactualizado por algún motivo, este
      // recálculo lo corrige en el mismo paso en vez de sumarle al
      // número viejo y perpetuar el error.
      const newTotal = await recalcMaintenanceTotal(id);
      const addedTotal = body.extras.reduce((acc, i) => acc + i.quantity * i.unitCost, 0);

      await recordEvent(companyId, id, 'item_added', {
        userId: meId,
        name:   req.user!.name ?? null,
      }, { count: body.extras.length, totalAdded: addedTotal, kind: 'carwash_extra' });

      res.status(201).json({
        data: inserted.map((e) => ({
          id: e.id,
          maintenanceId: toId('maintenance', e.maintenanceId),
          name: e.name,
          quantity: Number(e.quantity),
          unitCost: Number(e.unitCost),
          subtotal: Number(e.subtotal),
          photoUrl: e.photoUrl,
          createdAt: e.createdAt,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /:id/carwash-extras ──────────────────────────────────────────────────
router.get(
  '/:id/carwash-extras',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const rows = await db
        .select()
        .from(companyMaintenanceCarwashExtras)
        .where(eq(companyMaintenanceCarwashExtras.maintenanceId, id))
        .orderBy(companyMaintenanceCarwashExtras.createdAt);
      // Validar que el mantenimiento pertenece a la empresa
      const [m] = await db
        .select({ companyId: companyMaintenanceRecords.companyId })
        .from(companyMaintenanceRecords)
        .where(eq(companyMaintenanceRecords.id, id))
        .limit(1);
      if (!m || m.companyId !== companyId) {
        throw new NotFoundError('Mantenimiento', req.params.id);
      }
      res.json({
        data: rows.map((e) => ({
          id: e.id,
          maintenanceId: toId('maintenance', e.maintenanceId),
          name: e.name,
          quantity: Number(e.quantity),
          unitCost: Number(e.unitCost),
          subtotal: Number(e.subtotal),
          photoUrl: e.photoUrl,
          createdAt: e.createdAt,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /:id/carwash-photos ─────────────────────────────────────────────────
router.post(
  '/:id/carwash-photos',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'editar'),
  validate(z.object({ photos: z.array(carwashPhotoSchema).max(20) })),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const meId = getUserIdFromSub(req.user!.sub);
      const body = req.body as { photos: z.infer<typeof carwashPhotoSchema>[] };

      const [m] = await db
        .select({ id: companyMaintenanceRecords.id, type: companyMaintenanceRecords.type, companyId: companyMaintenanceRecords.companyId })
        .from(companyMaintenanceRecords)
        .where(eq(companyMaintenanceRecords.id, id))
        .limit(1);
      if (!m || m.companyId !== companyId) throw new NotFoundError('Mantenimiento', req.params.id);
      if (m.type !== 'Lavada') {
        throw new ForbiddenError('Las fotos de lavada solo aplican a mantenimientos de tipo Lavada.');
      }

      const inserted = await db.insert(companyMaintenanceCarwashPhotos).values(
        body.photos.map((p) => ({
          maintenanceId:  id,
          photoUrl:       p.photoUrl,
          caption:        p.caption ?? null,
          uploadedBy:     meId,
          uploadedByName: req.user!.name ?? null,
        }))
      ).returning();

      await recordEvent(companyId, id, 'photo_uploaded', {
        userId: meId,
        name:   req.user!.name ?? null,
      }, { count: body.photos.length, kind: 'carwash_photo' });

      res.status(201).json({
        data: inserted.map((p) => ({
          id: p.id,
          maintenanceId: toId('maintenance', p.maintenanceId),
          photoUrl: p.photoUrl,
          caption: p.caption,
          uploadedBy: p.uploadedBy ? toId('company-user', p.uploadedBy) : null,
          uploadedByName: p.uploadedByName,
          createdAt: p.createdAt,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /:id/carwash-photos ──────────────────────────────────────────────────
router.get(
  '/:id/carwash-photos',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const [m] = await db
        .select({ companyId: companyMaintenanceRecords.companyId })
        .from(companyMaintenanceRecords)
        .where(eq(companyMaintenanceRecords.id, id))
        .limit(1);
      if (!m || m.companyId !== companyId) throw new NotFoundError('Mantenimiento', req.params.id);
      const rows = await db
        .select()
        .from(companyMaintenanceCarwashPhotos)
        .where(eq(companyMaintenanceCarwashPhotos.maintenanceId, id))
        .orderBy(companyMaintenanceCarwashPhotos.createdAt);
      res.json({
        data: rows.map((p) => ({
          id: p.id,
          maintenanceId: toId('maintenance', p.maintenanceId),
          photoUrl: p.photoUrl,
          caption: p.caption,
          uploadedBy: p.uploadedBy ? toId('company-user', p.uploadedBy) : null,
          uploadedByName: p.uploadedByName,
          createdAt: p.createdAt,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /categories/:catId ───────────────────────────────────────────────
router.delete(
  '/categories/:catId',
  requireModule('mantenimiento'),
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
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'execution', 'editar'),
  async (req, res, next) => {
    req.url = req.url.replace('/complete', '/finalize');
    return router.handle(req, res, next);
  },
);

// ─── DELETE /:id ──────────────────────────────────────────────────────────────
router.delete(
  '/:id',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'records', 'eliminar'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const id = parseId('maintenance', req.params.id);
      const meId   = getUserIdFromSub(req.user!.sub);
      const meRole = req.user!.role;

      // Solo admin_empresa y owner_empresa pueden eliminar mantenimientos.
      if (meRole !== 'owner_empresa' && meRole !== 'admin_empresa') {
        throw new ForbiddenError('Solo administradores pueden eliminar mantenimientos.');
      }

      const [existing] = await db
        .select()
        .from(companyMaintenanceRecords)
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)))
        .limit(1);
      if (!existing) throw new NotFoundError('Mantenimiento', req.params.id);
      // Los administradores (owner_empresa / admin_empresa) pueden
      // eliminar mantenimientos en cualquier estado, incluidos los
      // completados. El check de rol admin ya se hizo arriba.

      await db.delete(companyMaintenanceItems).where(eq(companyMaintenanceItems.maintenanceId, id));
      await db.delete(companyMaintenanceCarwashExtras).where(eq(companyMaintenanceCarwashExtras.maintenanceId, id));
      await db.delete(companyMaintenanceCarwashPhotos).where(eq(companyMaintenanceCarwashPhotos.maintenanceId, id));
      await db.delete(companyMaintenanceEvents).where(eq(companyMaintenanceEvents.maintenanceId, id));
      await db
        .delete(companyMaintenanceRecords)
        .where(and(eq(companyMaintenanceRecords.id, id), eq(companyMaintenanceRecords.companyId, companyId)));

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

function round2(n: number): number { return Math.round(n * 100) / 100; }

export default router;