import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyDrivers } from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { NotFoundError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';

const router = Router({ mergeParams: true });

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createDriverSchema = z.object({
  code: z.string().min(1, 'El código es requerido'),
  firstName: z.string().min(1, 'El nombre es requerido'),
  lastName: z.string().min(1, 'El apellido es requerido'),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  siteId: z.string().optional().nullable(),       // "site-N" | null
  userId: z.string().optional().nullable(),       // "company-user-N" | null
  licenseNumber: z.string().optional().nullable(),
  licenseType: z.string().optional().nullable(),
  licenseExpiry: z.string().optional().nullable(), // ISO date "YYYY-MM-DD"
  licensePoints: z.number().int().min(0).optional(),
  status: z.enum(['Activo', 'Inactivo']).default('Activo'),
  notes: z.string().optional().nullable(),
  photoUrl: z.string().optional().nullable(),
});

const updateDriverSchema = createDriverSchema.partial();

// ─── GET /company/:id/drivers ─────────────────────────────────────────────────

router.get('/', requireModule('conductores'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const { status, siteId, search } = req.query;

    let rows = await db
      .select()
      .from(companyDrivers)
      .where(eq(companyDrivers.companyId, companyId))
      .orderBy(companyDrivers.lastName);

    if (status && typeof status === 'string') {
      rows = rows.filter((d) => d.status === status);
    }

    if (siteId && typeof siteId === 'string') {
      const parsedSiteId = parseId('site', siteId);
      rows = rows.filter((d) => d.siteId === parsedSiteId);
    }

    if (search && typeof search === 'string') {
      const q = search.toLowerCase();
      rows = rows.filter(
        (d) =>
          d.firstName.toLowerCase().includes(q) ||
          d.lastName.toLowerCase().includes(q) ||
          d.code.toLowerCase().includes(q) ||
          d.licenseNumber?.toLowerCase().includes(q)
      );
    }

    res.json({ data: rows.map(serializeDriver), total: rows.length });
  } catch (err) {
    next(err);
  }
});

// ─── GET /company/:id/drivers/:driverId ──────────────────────────────────────

router.get('/:driverId', requireModule('conductores'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const driverId = parseId('driver', req.params.driverId);

    const rows = await db
      .select()
      .from(companyDrivers)
      .where(and(eq(companyDrivers.id, driverId), eq(companyDrivers.companyId, companyId)))
      .limit(1);

    if (!rows.length) throw new NotFoundError('Conductor', req.params.driverId);

    res.json(serializeDriver(rows[0]));
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/drivers ────────────────────────────────────────────────

router.post(
  '/',
  requireModule('conductores'),
  requireAdmin,
  validate(createDriverSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const body = req.body as z.infer<typeof createDriverSchema>;

      const siteId = body.siteId ? parseId('site', body.siteId) : null;
      const userId = body.userId ? parseId('company-user', body.userId) : null;

      const [created] = await db
        .insert(companyDrivers)
        .values({
          ...body,
          companyId,
          siteId: siteId ?? undefined,
          userId: userId ?? undefined,
        })
        .returning();

      await logAudit(db, companyId, {
        entity: 'drivers',
        entityId: toId('driver', created.id),
        action: 'create',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Conductor "${created.firstName} ${created.lastName}" creado.`,
      });

      res.status(201).json(serializeDriver(created));
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /company/:id/drivers/:driverId ──────────────────────────────────────

router.put(
  '/:driverId',
  requireModule('conductores'),
  requireAdmin,
  validate(updateDriverSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const driverId = parseId('driver', req.params.driverId);
      const body = req.body as z.infer<typeof updateDriverSchema>;

      const existing = await db
        .select()
        .from(companyDrivers)
        .where(and(eq(companyDrivers.id, driverId), eq(companyDrivers.companyId, companyId)))
        .limit(1);

      if (!existing.length) throw new NotFoundError('Conductor', req.params.driverId);

      const updateData: Record<string, unknown> = { ...body, updatedAt: new Date() };
      if (body.siteId !== undefined) updateData.siteId = body.siteId ? parseId('site', body.siteId) : null;
      if (body.userId !== undefined) updateData.userId = body.userId ? parseId('company-user', body.userId) : null;

      const [updated] = await db
        .update(companyDrivers)
        .set(updateData)
        .where(and(eq(companyDrivers.id, driverId), eq(companyDrivers.companyId, companyId)))
        .returning();

      await logAudit(db, companyId, {
        entity: 'drivers',
        entityId: toId('driver', updated.id),
        action: 'update',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Conductor "${updated.firstName} ${updated.lastName}" actualizado.`,
      });

      res.json(serializeDriver(updated));
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /company/:id/drivers/:driverId ────────────────────────────────────

router.delete(
  '/:driverId',
  requireModule('conductores'),
  requireAdmin,
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const driverId = parseId('driver', req.params.driverId);

      const existing = await db
        .select()
        .from(companyDrivers)
        .where(and(eq(companyDrivers.id, driverId), eq(companyDrivers.companyId, companyId)))
        .limit(1);

      if (!existing.length) throw new NotFoundError('Conductor', req.params.driverId);

      await db
        .delete(companyDrivers)
        .where(and(eq(companyDrivers.id, driverId), eq(companyDrivers.companyId, companyId)));

      await logAudit(db, companyId, {
        entity: 'drivers',
        entityId: toId('driver', driverId),
        action: 'delete',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Conductor "${existing[0].firstName} ${existing[0].lastName}" eliminado.`,
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Serializer ───────────────────────────────────────────────────────────────

function serializeDriver(d: typeof companyDrivers.$inferSelect) {
  return {
    id: toId('driver', d.id),
    companyId: toId('company', d.companyId),
    siteId: d.siteId ? toId('site', d.siteId) : null,
    userId: d.userId ? toId('company-user', d.userId) : null,
    code: d.code,
    firstName: d.firstName,
    lastName: d.lastName,
    fullName: `${d.firstName} ${d.lastName}`,
    email: d.email,
    phone: d.phone,
    licenseNumber: d.licenseNumber,
    licenseType: d.licenseType,
    licenseExpiry: d.licenseExpiry,
    licensePoints: d.licensePoints,
    status: d.status,
    notes: d.notes,
    photoUrl: d.photoUrl,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

export default router;