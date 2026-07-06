import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyGarages } from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { NotFoundError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { safeString, validators } from '../../lib/validators';
import { parsePageParams, buildPageResponse } from '../../lib/pagination';
import { notifyEntityCrud } from '../../lib/notify-entity';

const router = Router({ mergeParams: true });

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createGarageSchema = z.object({
  code: z.string().trim().min(1, 'El código es requerido').max(40),
  name: safeString({ min: 2, max: 120, fieldLabel: 'Nombre', allowEmpty: false }),
  location: safeString({ max: 250, fieldLabel: 'Ubicación', allowEmpty: true }).nullable().optional(),
  capacity: z.number().int().min(0).max(10_000).optional().nullable(),
  supervisor: z.string().optional().nullable(),
  status: z.enum(['Activo', 'Inactivo']).default('Activo'),
  notes: validators.longTextOptional,
  latitude: validators.latitude.optional().nullable(),
  longitude: validators.longitude.optional().nullable(),
});

const updateGarageSchema = createGarageSchema.partial();

// ─── GET /company/:id/garages ─────────────────────────────────────────────────

router.get('/', requireModule('gestion', 'garages'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const { page, pageSize, offset } = parsePageParams(req.query as Record<string, unknown>);

    const where = eq(companyGarages.companyId, companyId);

    const [rows, countRow] = await Promise.all([
      db.select().from(companyGarages).where(where)
        .orderBy(desc(companyGarages.name)).limit(pageSize).offset(offset),
      db.select({ value: sql<number>`cast(count(*) as int)` }).from(companyGarages).where(where),
    ]);

    const total = countRow?.[0]?.value ?? 0;
    res.json(buildPageResponse(rows.map(serializeGarage), total, page, pageSize));
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/garages ────────────────────────────────────────────────

router.post(
  '/',
  requireModule('gestion', 'garages'),
  requireAdmin,
  validate(createGarageSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const body = req.body as z.infer<typeof createGarageSchema>;

      const [created] = await db
        .insert(companyGarages)
        .values({ ...body, companyId })
        .returning();

      await logAudit(db, companyId, {
        entity: 'garages',
        entityId: toId('garage', created.id),
        action: 'create',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Garaje "${created.name}" creado.`,
      });

      try {
        await notifyEntityCrud({
          companyId, actorSub: req.user!.sub, actorName: req.user!.name,
          crudKind: 'entity_created', entityKey: 'Garaje',
          entityId: created.id, entityLabel: created.name,
        });
      } catch (err) {
        console.warn('[garages] notify falló (no crítico):', (err as Error).message);
      }

      res.status(201).json(serializeGarage(created));
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /company/:id/garages/:garageId ───────────────────────────────────────

router.put(
  '/:garageId',
  requireModule('gestion', 'garages'),
  requireAdmin,
  validate(updateGarageSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const garageId = parseId('garage', req.params.garageId);
      const body = req.body as z.infer<typeof updateGarageSchema>;

      const existing = await db
        .select()
        .from(companyGarages)
        .where(and(eq(companyGarages.id, garageId), eq(companyGarages.companyId, companyId)))
        .limit(1);

      if (!existing.length) throw new NotFoundError('Garaje', req.params.garageId);

      const [updated] = await db
        .update(companyGarages)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(companyGarages.id, garageId), eq(companyGarages.companyId, companyId)))
        .returning();

      await logAudit(db, companyId, {
        entity: 'garages',
        entityId: toId('garage', updated.id),
        action: 'update',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Garaje "${updated.name}" actualizado.`,
      });

      try {
        await notifyEntityCrud({
          companyId, actorSub: req.user!.sub, actorName: req.user!.name,
          crudKind: 'entity_updated', entityKey: 'Garaje',
          entityId: updated.id, entityLabel: updated.name,
        });
      } catch (err) {
        console.warn('[garages] notify falló (no crítico):', (err as Error).message);
      }

      res.json(serializeGarage(updated));
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /company/:id/garages/:garageId ────────────────────────────────────

router.delete('/:garageId', requireModule('gestion', 'garages'), requireAdmin, async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const garageId = parseId('garage', req.params.garageId);

    const existing = await db
      .select()
      .from(companyGarages)
      .where(and(eq(companyGarages.id, garageId), eq(companyGarages.companyId, companyId)))
      .limit(1);

    if (!existing.length) throw new NotFoundError('Garaje', req.params.garageId);

    await db
      .delete(companyGarages)
      .where(and(eq(companyGarages.id, garageId), eq(companyGarages.companyId, companyId)));

    await logAudit(db, companyId, {
      entity: 'garages',
      entityId: toId('garage', garageId),
      action: 'delete',
      actorId: req.user!.sub,
      actorName: req.user!.name,
      description: `Garaje "${existing[0].name}" eliminado.`,
    });

    try {
      await notifyEntityCrud({
        companyId, actorSub: req.user!.sub, actorName: req.user!.name,
        crudKind: 'entity_deleted', entityKey: 'Garaje',
        entityId: existing[0].id, entityLabel: existing[0].name,
      });
    } catch (err) {
      console.warn('[garages] notify falló (no crítico):', (err as Error).message);
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── Serializer ───────────────────────────────────────────────────────────────

function serializeGarage(g: typeof companyGarages.$inferSelect) {
  return {
    id: toId('garage', g.id),
    companyId: toId('company', g.companyId),
    code: g.code,
    name: g.name,
    location: g.location,
    capacity: g.capacity,
    supervisor: g.supervisor,
    status: g.status,
    notes: g.notes,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
    latitude: g.latitude,
    longitude: g.longitude,
  };
}

export default router;