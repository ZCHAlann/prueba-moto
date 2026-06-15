// routes/company/suppliers.ts
// CRUD de proveedores de repuestos/insumos.
// Permisos: maintenance.suppliers.{ver,crear,editar,eliminar}.

import { Router } from 'express';
import { z } from 'zod';
import { eq, and, ilike, or } from 'drizzle-orm';
import { db } from '../../db/client';
import { companySuppliers } from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requirePermission } from '../../middlewares/requirePermission';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { NotFoundError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { safeString, validators } from '../../lib/validators';

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
  requireModule('gestion'), requirePermission('gestion', 'suppliers', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const q = (req.query.q as string | undefined)?.trim();

      let query = db
        .select()
        .from(companySuppliers)
        .where(eq(companySuppliers.companyId, companyId))
        .orderBy(companySuppliers.name)
        .$dynamic();

      if (q) {
        const needle = `%${q}%`;
        query = query.where(
          and(
            eq(companySuppliers.companyId, companyId),
            or(
              ilike(companySuppliers.name, needle),
              ilike(companySuppliers.contactName, needle),
              ilike(companySuppliers.nit, needle),
            )!,
          ),
        );
      }

      const rows = await query;
      res.json({ data: rows.map(serializeSupplier), total: rows.length });
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


