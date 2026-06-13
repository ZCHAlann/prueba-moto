// routes/company/workshops.ts
// CRUD de talleres donde se realizan los mantenimientos.
// Permisos: gestion.workshops.{ver,crear,editar,eliminar}.
// Vive en el módulo "gestion" (no en "maintenance"): es una tabla base
// compartida con otros módulos, no una sección del módulo de mantenimientos.

import { Router } from 'express';
import { z } from 'zod';
import { eq, and, ilike, or } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyWorkshops } from '../../db/schema/operational';
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

const createWorkshopSchema = z.object({
  name:         safeString({ min: 2, max: 120, fieldLabel: 'Nombre', allowEmpty: false }),
  address:      safeString({ max: 500, fieldLabel: 'Dirección', allowEmpty: true }).nullable().optional(),
  phone:        z.string().trim().max(40).nullable().optional(),
  contactName:  safeString({ max: 120, fieldLabel: 'Contacto', allowEmpty: true }).nullable().optional(),
  nit:          z.string().trim().max(40).nullable().optional(),
  notes:        validators.longTextOptional,
});

const updateWorkshopSchema = createWorkshopSchema.partial();

// ─── GET /company/:id/workshops ───────────────────────────────────────────────

router.get(
  '/',
  requireModule('gestion'), requirePermission('gestion', 'workshops', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const q = (req.query.q as string | undefined)?.trim();

      let query = db
        .select()
        .from(companyWorkshops)
        .where(eq(companyWorkshops.companyId, companyId))
        .orderBy(companyWorkshops.name)
        .$dynamic();

      if (q) {
        const needle = `%${q}%`;
        query = query.where(
          and(
            eq(companyWorkshops.companyId, companyId),
            or(
              ilike(companyWorkshops.name, needle),
              ilike(companyWorkshops.contactName, needle),
              ilike(companyWorkshops.nit, needle),
            )!,
          ),
        );
      }

      const rows = await query;
      res.json({ data: rows.map(serializeWorkshop), total: rows.length });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /company/:id/workshops/:workshopId ──────────────────────────────────

router.get(
  '/:workshopId',
  requireModule('gestion'), requirePermission('gestion', 'workshops', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const workshopId = parseId('workshop', req.params.workshopId);

      const [row] = await db
        .select()
        .from(companyWorkshops)
        .where(and(eq(companyWorkshops.id, workshopId), eq(companyWorkshops.companyId, companyId)))
        .limit(1);

      if (!row) throw new NotFoundError('Taller', req.params.workshopId);
      res.json(serializeWorkshop(row));
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /company/:id/workshops ─────────────────────────────────────────────

router.post(
  '/',
  requireModule('gestion'), requirePermission('gestion', 'workshops', 'crear'),
  requireAdmin,
  validate(createWorkshopSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const body = req.body as z.infer<typeof createWorkshopSchema>;

      const [created] = await db
        .insert(companyWorkshops)
        .values({ ...body, companyId })
        .returning();

      await logAudit(db, companyId, {
        entity: 'workshops',
        entityId: toId('workshop', created.id),
        action: 'create',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Taller "${created.name}" creado.`,
      });

      res.status(201).json(serializeWorkshop(created));
    } catch (err) {
      next(err);
    }
  },
);

// ─── PUT /company/:id/workshops/:workshopId ──────────────────────────────────

router.put(
  '/:workshopId',
  requireModule('gestion'), requirePermission('gestion', 'workshops', 'editar'),
  requireAdmin,
  validate(updateWorkshopSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const workshopId = parseId('workshop', req.params.workshopId);
      const body = req.body as z.infer<typeof updateWorkshopSchema>;

      const existing = await db
        .select()
        .from(companyWorkshops)
        .where(and(eq(companyWorkshops.id, workshopId), eq(companyWorkshops.companyId, companyId)))
        .limit(1);
      if (!existing.length) throw new NotFoundError('Taller', req.params.workshopId);

      const [updated] = await db
        .update(companyWorkshops)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(companyWorkshops.id, workshopId), eq(companyWorkshops.companyId, companyId)))
        .returning();

      await logAudit(db, companyId, {
        entity: 'workshops',
        entityId: toId('workshop', updated.id),
        action: 'update',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Taller "${updated.name}" actualizado.`,
      });

      res.json(serializeWorkshop(updated));
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /company/:id/workshops/:workshopId ───────────────────────────────

router.delete(
  '/:workshopId',
  requireModule('gestion'), requirePermission('gestion', 'workshops', 'eliminar'),
  requireAdmin,
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const workshopId = parseId('workshop', req.params.workshopId);

      const existing = await db
        .select()
        .from(companyWorkshops)
        .where(and(eq(companyWorkshops.id, workshopId), eq(companyWorkshops.companyId, companyId)))
        .limit(1);
      if (!existing.length) throw new NotFoundError('Taller', req.params.workshopId);

      await db
        .delete(companyWorkshops)
        .where(and(eq(companyWorkshops.id, workshopId), eq(companyWorkshops.companyId, companyId)));

      await logAudit(db, companyId, {
        entity: 'workshops',
        entityId: toId('workshop', workshopId),
        action: 'delete',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Taller "${existing[0].name}" eliminado.`,
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Serializer ──────────────────────────────────────────────────────────────

function serializeWorkshop(w: typeof companyWorkshops.$inferSelect) {
  return {
    id:          toId('workshop', w.id),
    companyId:   toId('company', w.companyId),
    name:        w.name,
    address:     w.address,
    phone:       w.phone,
    contactName: w.contactName,
    nit:         w.nit,
    notes:       w.notes,
    createdAt:   w.createdAt,
    updatedAt:   w.updatedAt,
  };
}

export default router;


