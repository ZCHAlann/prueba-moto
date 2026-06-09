import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyAcUnits, companyAcServices, companyAcRefrigerantLogs, companySites } from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { requireSupervisor } from '../../middlewares/requireSupervisor';
import { requirePermission } from '../../middlewares/requirePermission';
import { NotFoundError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { safeString, validators } from '../../lib/validators';

const router = Router({ mergeParams: true });

// ─── Schemas ──────────────────────────────────────────────────────────────────

const AC_TYPES = ['Split', 'Cassette', 'Ventana', 'Central', 'Chiller', 'Fan-coil', 'Otro'] as const;
const AC_STATUSES = ['Operativo', 'En revision', 'Fuera de servicio', 'Pendiente revision'] as const;
const AC_KINDS = ['Limpieza', 'Recarga', 'Reparacion', 'Inspeccion', 'Preventivo', 'Correctivo'] as const;
const AC_UNITS = ['kg', 'g', 'lb', 'oz'] as const;

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)').optional().nullable();

const createAcUnitSchema = z.object({
  code: z.string().trim().min(1, 'El código es requerido').max(40),
  name: safeString({ min: 2, max: 120, fieldLabel: 'Nombre', allowEmpty: false }),
  siteId: z.string().optional().nullable(),
  type: z.enum(AC_TYPES).optional().nullable(),
  floor: safeString({ max: 60, fieldLabel: 'Piso', allowEmpty: true }).nullable().optional(),
  area: safeString({ max: 60, fieldLabel: 'Área', allowEmpty: true }).nullable().optional(),
  serial: safeString({ max: 60, fieldLabel: 'Serie', allowEmpty: true }).nullable().optional(),
  brand: safeString({ min: 1, max: 80, fieldLabel: 'Marca', allowEmpty: false }),
  model: safeString({ max: 80, fieldLabel: 'Modelo', allowEmpty: true }).nullable().optional(),
  capacityBtu: z.string().max(20).optional().nullable(),
  voltage: z.string().max(20).optional().nullable(),
  amperage: z.string().max(20).optional().nullable(),
  refrigerantType: z.string().max(40).optional().nullable(),
  installDate: dateString,
  technician: z.string().optional().nullable(),
  status: z.enum(AC_STATUSES).optional().nullable(),
  lastService: dateString,
  nextService: dateString,
  photoUrls: z.array(z.string().max(2_000_000)).max(20).default([]),
  notes: validators.longTextOptional,
});

const updateAcUnitSchema = createAcUnitSchema.partial();

const createServiceSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)'),
  kind: z.enum(AC_KINDS).optional().nullable(),
  technician: z.string().optional().nullable(),
  cost: z.number().nonnegative().max(1_000_000).optional().nullable(),
  findings: validators.longTextOptional,
  photoUrls: z.array(z.string().max(2_000_000)).max(20).default([]),
  notes: validators.longTextOptional,
});

const createRefrigerantLogSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)'),
  refrigerantType: z.string().max(40).optional().nullable(),
  quantity: z.number().nonnegative().max(10_000).optional().nullable(),
  unit: z.enum(AC_UNITS).optional().nullable(),
  technician: z.string().optional().nullable(),
  reason: safeString({ max: 200, fieldLabel: 'Razón', allowEmpty: true }).nullable().optional(),
  notes: validators.longTextOptional,
});

// ─── GET /company/:id/ac-units ────────────────────────────────────────────────

router.get('/', requireModule('ac'), async (req, res, next) => {
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

    // ── Enrichment: batch-load site names ─────────────────────────────────────
    const sitesRows = await db
      .select({ id: companySites.id, name: companySites.name })
      .from(companySites)
      .where(eq(companySites.companyId, companyId));
    const siteMap = new Map(sitesRows.map(s => [s.id, s.name]));

    res.json({ data: rows.map(u => serializeUnit(u, u.siteId ? siteMap.get(u.siteId) ?? null : null)), total: rows.length });
  } catch (err) {
    next(err);
  }
});

// ─── GET /company/:id/ac-units/:unitId ────────────────────────────────────────

router.get('/:unitId', requireModule('ac'), async (req, res, next) => {
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

    const u = rows[0];
    // ── Enrichment: site name ────────────────────────────────────────────────────
    let siteName: string | null = null;
    if (u.siteId) {
      const [site] = await db.select({ name: companySites.name }).from(companySites).where(and(eq(companySites.id, u.siteId), eq(companySites.companyId, companyId))).limit(1);
      siteName = site?.name ?? null;
    }

    res.json({
      ...serializeUnit(u, siteName),
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
  requireModule('ac'),
  requirePermission('ac', 'lista_ac', 'crear'),
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

      // ── Enrichment: site name ─────────────────────────────────────────────────
      let siteName: string | null = null;
      if (created.siteId) {
        const [site] = await db.select({ name: companySites.name }).from(companySites).where(and(eq(companySites.id, created.siteId), eq(companySites.companyId, companyId))).limit(1);
        siteName = site?.name ?? null;
      }

      res.status(201).json(serializeUnit(created, siteName));
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /company/:id/ac-units/:unitId ────────────────────────────────────────

router.put(
  '/:unitId',
  requireModule('ac'),
  requirePermission('ac', 'lista_ac', 'editar'),
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

      // ── Enrichment: site name ─────────────────────────────────────────────────
      let siteName: string | null = null;
      if (updated.siteId) {
        const [site] = await db.select({ name: companySites.name }).from(companySites).where(and(eq(companySites.id, updated.siteId), eq(companySites.companyId, companyId))).limit(1);
        siteName = site?.name ?? null;
      }

      res.json(serializeUnit(updated, siteName));
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /company/:id/ac-units/:unitId ─────────────────────────────────────

router.delete('/:unitId', requireModule('ac'), requirePermission('ac', 'lista_ac', 'eliminar'), requireAdmin, async (req, res, next) => {
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
  requireModule('ac'),
  requirePermission('ac', 'mantenimientos_ac', 'crear'),
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
  requireModule('ac'),
  requirePermission('ac', 'mantenimientos_ac', 'crear'),
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

function serializeUnit(u: typeof companyAcUnits.$inferSelect, siteName?: string | null) {
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
    refrigerantType: u.refrigerantLogType,
    installDate: u.installDate,
    technician: u.technician,
    status: u.status,
    lastService: u.lastService,
    nextService: u.nextService,
    photoUrls: u.photoUrls ?? [],
    notes: u.notes,
    // ── Enrichment ─────────────────────────────────────────────────────────────
    siteName: siteName ?? null,
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