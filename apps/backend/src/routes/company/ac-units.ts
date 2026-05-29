import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyAcUnits, companyAcServices, companyAcRefrigerantLogs } from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { requireSupervisor } from '../../middlewares/requireSupervisor';
import { NotFoundError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';

const router = Router({ mergeParams: true });

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createAcUnitSchema = z.object({
  code: z.string().min(1, 'El código es requerido'),
  name: z.string().min(1, 'El nombre es requerido'),
  siteId: z.string().optional().nullable(),
  type: z.string().optional().nullable(),
  floor: z.string().optional().nullable(),
  area: z.string().optional().nullable(),
  serial: z.string().optional().nullable(),
  brand: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  capacityBtu: z.string().optional().nullable(),
  voltage: z.string().optional().nullable(),
  amperage: z.string().optional().nullable(),
  refrigerantType: z.string().optional().nullable(),
  installDate: z.string().optional().nullable(),
  technician: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  lastService: z.string().optional().nullable(),
  nextService: z.string().optional().nullable(),
  photoUrls: z.array(z.string()).default([]),
  notes: z.string().optional().nullable(),
});

const updateAcUnitSchema = createAcUnitSchema.partial();

const createServiceSchema = z.object({
  date: z.string().min(1, 'La fecha es requerida'),
  kind: z.string().optional().nullable(),
  technician: z.string().optional().nullable(),
  cost: z.number().nonnegative().optional().nullable(),
  findings: z.string().optional().nullable(),
  photoUrls: z.array(z.string()).default([]),
  notes: z.string().optional().nullable(),
});

const createRefrigerantLogSchema = z.object({
  date: z.string().min(1, 'La fecha es requerida'),
  refrigerantType: z.string().optional().nullable(),
  quantity: z.number().nonnegative().optional().nullable(),
  unit: z.string().optional().nullable(),
  technician: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// ─── GET /company/:id/ac-units ────────────────────────────────────────────────

router.get('/', requireModule('aires_acondicionados'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const { status, siteId } = req.query;

    let rows = await db
      .select()
      .from(companyAcUnits)
      .where(eq(companyAcUnits.companyId, companyId))
      .orderBy(companyAcUnits.name);

    if (status && typeof status === 'string') {
      rows = rows.filter((u) => u.status === status);
    }
    if (siteId && typeof siteId === 'string') {
      const parsedSiteId = parseId('site', siteId);
      rows = rows.filter((u) => u.siteId === parsedSiteId);
    }

    res.json({ data: rows.map(serializeUnit), total: rows.length });
  } catch (err) {
    next(err);
  }
});

// ─── GET /company/:id/ac-units/:unitId ────────────────────────────────────────

router.get('/:unitId', requireModule('aires_acondicionados'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const unitId = parseId('ac-unit', req.params.unitId);

    const rows = await db
      .select()
      .from(companyAcUnits)
      .where(and(eq(companyAcUnits.id, unitId), eq(companyAcUnits.companyId, companyId)))
      .limit(1);

    if (!rows.length) throw new NotFoundError('Unidad AC', req.params.unitId);

    const services = await db
      .select()
      .from(companyAcServices)
      .where(and(eq(companyAcServices.unitId, unitId), eq(companyAcServices.companyId, companyId)))
      .orderBy(companyAcServices.date);

    const refrigerantLogs = await db
      .select()
      .from(companyAcRefrigerantLogs)
      .where(and(eq(companyAcRefrigerantLogs.unitId, unitId), eq(companyAcRefrigerantLogs.companyId, companyId)))
      .orderBy(companyAcRefrigerantLogs.date);

    res.json({
      ...serializeUnit(rows[0]),
      services: services.map(serializeService),
      refrigerantLogs: refrigerantLogs.map(serializeRefrigerantLog),
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/ac-units ───────────────────────────────────────────────

router.post(
  '/',
  requireModule('aires_acondicionados'),
  requireSupervisor,
  validate(createAcUnitSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const body = req.body as z.infer<typeof createAcUnitSchema>;

      const insertData: Record<string, unknown> = { ...body, companyId };
      if (body.siteId) insertData.siteId = parseId('site', body.siteId);
      else delete insertData.siteId;

      const [created] = await db
        .insert(companyAcUnits)
        .values(insertData as typeof companyAcUnits.$inferInsert)
        .returning();

      await logAudit(db, companyId, {
        entity: 'ac_units',
        entityId: toId('ac-unit', created.id),
        action: 'create',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Unidad AC "${created.name}" creada.`,
      });

      res.status(201).json(serializeUnit(created));
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /company/:id/ac-units/:unitId ────────────────────────────────────────

router.put(
  '/:unitId',
  requireModule('aires_acondicionados'),
  requireSupervisor,
  validate(updateAcUnitSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const unitId = parseId('ac-unit', req.params.unitId);
      const body = req.body as z.infer<typeof updateAcUnitSchema>;

      const existing = await db
        .select()
        .from(companyAcUnits)
        .where(and(eq(companyAcUnits.id, unitId), eq(companyAcUnits.companyId, companyId)))
        .limit(1);

      if (!existing.length) throw new NotFoundError('Unidad AC', req.params.unitId);

      const updateData: Record<string, unknown> = { ...body, updatedAt: new Date() };
      if (body.siteId !== undefined) {
        updateData.siteId = body.siteId ? parseId('site', body.siteId) : null;
      }

      const [updated] = await db
        .update(companyAcUnits)
        .set(updateData)
        .where(and(eq(companyAcUnits.id, unitId), eq(companyAcUnits.companyId, companyId)))
        .returning();

      await logAudit(db, companyId, {
        entity: 'ac_units',
        entityId: toId('ac-unit', updated.id),
        action: 'update',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Unidad AC "${updated.name}" actualizada.`,
      });

      res.json(serializeUnit(updated));
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /company/:id/ac-units/:unitId ─────────────────────────────────────

router.delete('/:unitId', requireModule('aires_acondicionados'), requireAdmin, async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const unitId = parseId('ac-unit', req.params.unitId);

    const existing = await db
      .select()
      .from(companyAcUnits)
      .where(and(eq(companyAcUnits.id, unitId), eq(companyAcUnits.companyId, companyId)))
      .limit(1);

    if (!existing.length) throw new NotFoundError('Unidad AC', req.params.unitId);

    await db
      .delete(companyAcUnits)
      .where(and(eq(companyAcUnits.id, unitId), eq(companyAcUnits.companyId, companyId)));

    await logAudit(db, companyId, {
      entity: 'ac_units',
      entityId: toId('ac-unit', unitId),
      action: 'delete',
      actorId: req.user!.sub,
      actorName: req.user!.name,
      description: `Unidad AC "${existing[0].name}" eliminada.`,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/ac-units/:unitId/services ──────────────────────────────

router.post(
  '/:unitId/services',
  requireModule('aires_acondicionados'),
  requireSupervisor,
  validate(createServiceSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const unitId = parseId('ac-unit', req.params.unitId);
      const body = req.body as z.infer<typeof createServiceSchema>;

      const unit = await db
        .select()
        .from(companyAcUnits)
        .where(and(eq(companyAcUnits.id, unitId), eq(companyAcUnits.companyId, companyId)))
        .limit(1);

      if (!unit.length) throw new NotFoundError('Unidad AC', req.params.unitId);

      const [created] = await db
        .insert(companyAcServices)
        .values({ ...body, companyId, unitId })
        .returning();

      // Actualizar lastService en la unidad
      await db
        .update(companyAcUnits)
        .set({ lastService: body.date, updatedAt: new Date() })
        .where(eq(companyAcUnits.id, unitId));

      await logAudit(db, companyId, {
        entity: 'ac_services',
        entityId: toId('ac-unit', unitId),
        action: 'create',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Servicio AC registrado para "${unit[0].name}".`,
      });

      res.status(201).json(serializeService(created));
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /company/:id/ac-units/:unitId/refrigerant-logs ─────────────────────

router.post(
  '/:unitId/refrigerant-logs',
  requireModule('aires_acondicionados'),
  requireSupervisor,
  validate(createRefrigerantLogSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const unitId = parseId('ac-unit', req.params.unitId);
      const body = req.body as z.infer<typeof createRefrigerantLogSchema>;

      const unit = await db
        .select()
        .from(companyAcUnits)
        .where(and(eq(companyAcUnits.id, unitId), eq(companyAcUnits.companyId, companyId)))
        .limit(1);

      if (!unit.length) throw new NotFoundError('Unidad AC', req.params.unitId);

      const insertData = {
        ...body,
        companyId,
        unitId,
        quantity: body.quantity !== undefined && body.quantity !== null ? String(body.quantity) : null,
      };

      const [created] = await db
        .insert(companyAcRefrigerantLogs)
        .values(insertData)
        .returning();

      await logAudit(db, companyId, {
        entity: 'ac_refrigerant_logs',
        entityId: toId('ac-unit', unitId),
        action: 'create',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Recarga de refrigerante registrada para "${unit[0].name}".`,
      });

      res.status(201).json(serializeRefrigerantLog(created));
    } catch (err) {
      next(err);
    }
  }
);

// ─── Serializers ──────────────────────────────────────────────────────────────

function serializeUnit(u: typeof companyAcUnits.$inferSelect) {
  return {
    id: toId('ac-unit', u.id),
    companyId: toId('company', u.companyId),
    siteId: u.siteId ? toId('site', u.siteId) : null,
    code: u.code,
    name: u.name,
    type: u.type,
    floor: u.floor,
    area: u.area,
    serial: u.serial,
    brand: u.brand,
    model: u.model,
    capacityBtu: u.capacityBtu,
    voltage: u.voltage,
    amperage: u.amperage,
    refrigerantType: u.refrigerantType,
    installDate: u.installDate,
    technician: u.technician,
    status: u.status,
    lastService: u.lastService,
    nextService: u.nextService,
    photoUrls: u.photoUrls ?? [],
    notes: u.notes,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

function serializeService(s: typeof companyAcServices.$inferSelect) {
  return {
    id: s.id,
    companyId: toId('company', s.companyId),
    unitId: toId('ac-unit', s.unitId),
    date: s.date,
    kind: s.kind,
    technician: s.technician,
    cost: s.cost ? Number(s.cost) : null,
    findings: s.findings,
    photoUrls: s.photoUrls ?? [],
    notes: s.notes,
    createdAt: s.createdAt,
  };
}

function serializeRefrigerantLog(r: typeof companyAcRefrigerantLogs.$inferSelect) {
  return {
    id: r.id,
    companyId: toId('company', r.companyId),
    unitId: toId('ac-unit', r.unitId),
    date: r.date,
    refrigerantType: r.refrigerantType,
    quantity: r.quantity ? Number(r.quantity) : null,
    unit: r.unit,
    technician: r.technician,
    reason: r.reason,
    notes: r.notes,
    createdAt: r.createdAt,
  };
}

export default router;