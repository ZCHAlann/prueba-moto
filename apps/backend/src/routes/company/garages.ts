import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyGarages } from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { NotFoundError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';

const router = Router({ mergeParams: true });

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createGarageSchema = z.object({
  code: z.string().min(1, 'El código es requerido'),
  name: z.string().min(1, 'El nombre es requerido'),
  location: z.string().optional().nullable(),
  capacity: z.number().int().nonnegative().optional().nullable(),
  supervisor: z.string().optional().nullable(),
  status: z.enum(['Activo', 'Inactivo']).default('Activo'),
  notes: z.string().optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
});

const updateGarageSchema = createGarageSchema.partial();

// ─── GET /company/:id/garages ─────────────────────────────────────────────────

router.get('/', requireModule('flotas'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;

    const rows = await db
      .select()
      .from(companyGarages)
      .where(eq(companyGarages.companyId, companyId))
      .orderBy(companyGarages.name);

    res.json({ data: rows.map(serializeGarage), total: rows.length });
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/garages ────────────────────────────────────────────────

router.post(
  '/',
  requireModule('flotas'),
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

      res.status(201).json(serializeGarage(created));
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /company/:id/garages/:garageId ───────────────────────────────────────

router.put(
  '/:garageId',
  requireModule('flotas'),
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

      res.json(serializeGarage(updated));
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /company/:id/garages/:garageId ────────────────────────────────────

router.delete('/:garageId', requireModule('flotas'), requireAdmin, async (req, res, next) => {
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