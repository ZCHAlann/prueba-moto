// routes/company/suppliers.ts
// CRUD de proveedores de repuestos/insumos.
// Permisos: maintenance.suppliers.{ver,crear,editar,eliminar}.

import { Router } from 'express';
import { z } from 'zod';
import { eq, and, ilike, or, desc, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { companySuppliers } from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule, requireModuleAny } from '../../middlewares/requireModule';
import { requirePermission, requirePermissionAny } from '../../middlewares/requirePermission';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { NotFoundError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { safeString, validators } from '../../lib/validators';
import { parsePageParams, buildPageResponse } from '../../lib/pagination';
import { notifyEntityCrud } from '../../lib/notify-entity';

const router = Router({ mergeParams: true });

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createSupplierSchema = z.object({
  name:         safeString({ min: 2, max: 120, fieldLabel: 'Nombre', allowEmpty: false }),
  contactName:  safeString({ max: 120, fieldLabel: 'Contacto', allowEmpty: true }).nullable().optional(),
  phone:        z.string().trim().max(40).nullable().optional(),
  email:        z.string().trim().email('Email inválido').max(180).nullable().optional(),
  nit:          z.string().trim().max(40).nullable().optional(),
  notes:        validators.longTextOptional,
  address:      safeString({ max: 500, fieldLabel: 'Dirección', allowEmpty: true }).nullable().optional(),
  latitude:     validators.latitude.optional().nullable(),
  longitude:    validators.longitude.optional().nullable(),
});

const updateSupplierSchema = createSupplierSchema.partial();

// ─── GET /company/:id/suppliers ───────────────────────────────────────────────

router.get(
  '/',
  // El listado de proveedores sirve tanto a "gestion" como al form de
  // mantenimiento (repuestos / proveedores de insumos).
  requireModuleAny([
    { module: 'gestion' },
    { module: 'mantenimiento', submodule: 'execution' },
  ]),
  requirePermissionAny([
    { module: 'gestion',     submodule: 'suppliers' },
    { module: 'mantenimiento', submodule: 'execution' },
  ], 'ver'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const q = (req.query.q as string | undefined)?.trim();
      const { page, pageSize, offset } = parsePageParams(req.query as Record<string, unknown>);

      const conds = [eq(companySuppliers.companyId, companyId)];
      if (q && q.length > 0) {
        const needle = `%${q}%`;
        conds.push(or(
          ilike(companySuppliers.name, needle),
          ilike(companySuppliers.contactName, needle),
          ilike(companySuppliers.nit, needle),
        )!);
      }
      const where = and(...conds);

      const [rows, countRow] = await Promise.all([
        db.select().from(companySuppliers).where(where)
          .orderBy(desc(companySuppliers.name)).limit(pageSize).offset(offset),
        db.select({ value: sql<number>`cast(count(*) as int)` }).from(companySuppliers).where(where),
      ]);

      const total = countRow?.[0]?.value ?? 0;
      res.json(buildPageResponse(rows.map(serializeSupplier), total, page, pageSize));
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /company/:id/suppliers/:supplierId ──────────────────────────────────

router.get(
  '/:supplierId',
  requireModule('gestion'), requirePermission('gestion', 'suppliers', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const supplierId = parseId('supplier', req.params.supplierId);

      const [row] = await db
        .select()
        .from(companySuppliers)
        .where(and(eq(companySuppliers.id, supplierId), eq(companySuppliers.companyId, companyId)))
        .limit(1);

      if (!row) throw new NotFoundError('Proveedor', req.params.supplierId);
      res.json(serializeSupplier(row));
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /company/:id/suppliers ─────────────────────────────────────────────

router.post(
  '/',
  requireModule('gestion'), requirePermission('gestion', 'suppliers', 'crear'),
  requireAdmin,
  validate(createSupplierSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const body = req.body as z.infer<typeof createSupplierSchema>;

      const [created] = await db
        .insert(companySuppliers)
        .values({ ...body, companyId })
        .returning();

      await logAudit(db, companyId, {
        entity: 'suppliers',
        entityId: toId('supplier', created.id),
        action: 'create',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Proveedor "${created.name}" creado.`,
      });

      try {
        await notifyEntityCrud({
          companyId, actorSub: req.user!.sub, actorName: req.user!.name,
          crudKind: 'entity_created', entityKey: 'Proveedor',
          entityId: created.id, entityLabel: created.name,
        });
      } catch (err) {
        console.warn('[suppliers] notify falló (no crítico):', (err as Error).message);
      }

      res.status(201).json(serializeSupplier(created));
    } catch (err) {
      next(err);
    }
  },
);

// ─── PUT /company/:id/suppliers/:supplierId ──────────────────────────────────

router.put(
  '/:supplierId',
  requireModule('gestion'), requirePermission('gestion', 'suppliers', 'editar'),
  requireAdmin,
  validate(updateSupplierSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const supplierId = parseId('supplier', req.params.supplierId);
      const body = req.body as z.infer<typeof updateSupplierSchema>;

      const existing = await db
        .select()
        .from(companySuppliers)
        .where(and(eq(companySuppliers.id, supplierId), eq(companySuppliers.companyId, companyId)))
        .limit(1);
      if (!existing.length) throw new NotFoundError('Proveedor', req.params.supplierId);

      const [updated] = await db
        .update(companySuppliers)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(companySuppliers.id, supplierId), eq(companySuppliers.companyId, companyId)))
        .returning();

      await logAudit(db, companyId, {
        entity: 'suppliers',
        entityId: toId('supplier', updated.id),
        action: 'update',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Proveedor "${updated.name}" actualizado.`,
      });

      try {
        await notifyEntityCrud({
          companyId, actorSub: req.user!.sub, actorName: req.user!.name,
          crudKind: 'entity_updated', entityKey: 'Proveedor',
          entityId: updated.id, entityLabel: updated.name,
        });
      } catch (err) {
        console.warn('[suppliers] notify falló (no crítico):', (err as Error).message);
      }

      res.json(serializeSupplier(updated));
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /company/:id/suppliers/:supplierId ───────────────────────────────

router.delete(
  '/:supplierId',
  requireModule('gestion'), requirePermission('gestion', 'suppliers', 'eliminar'),
  requireAdmin,
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const supplierId = parseId('supplier', req.params.supplierId);

      const existing = await db
        .select()
        .from(companySuppliers)
        .where(and(eq(companySuppliers.id, supplierId), eq(companySuppliers.companyId, companyId)))
        .limit(1);
      if (!existing.length) throw new NotFoundError('Proveedor', req.params.supplierId);

      await db
        .delete(companySuppliers)
        .where(and(eq(companySuppliers.id, supplierId), eq(companySuppliers.companyId, companyId)));

      await logAudit(db, companyId, {
        entity: 'suppliers',
        entityId: toId('supplier', supplierId),
        action: 'delete',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Proveedor "${existing[0].name}" eliminado.`,
      });

      try {
        await notifyEntityCrud({
          companyId, actorSub: req.user!.sub, actorName: req.user!.name,
          crudKind: 'entity_deleted', entityKey: 'Proveedor',
          entityId: existing[0].id, entityLabel: existing[0].name,
        });
      } catch (err) {
        console.warn('[suppliers] notify falló (no crítico):', (err as Error).message);
      }

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Serializer ──────────────────────────────────────────────────────────────

function serializeSupplier(s: typeof companySuppliers.$inferSelect) {
  return {
    id:          toId('supplier', s.id),
    companyId:   toId('company', s.companyId),
    name:        s.name,
    contactName: s.contactName,
    phone:       s.phone,
    email:       s.email,
    nit:         s.nit,
    notes:       s.notes,
    address:     s.address,
    latitude:    s.latitude,
    longitude:   s.longitude,
    createdAt:   s.createdAt,
    updatedAt:   s.updatedAt,
  };
}

export default router;


