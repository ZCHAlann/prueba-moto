import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyDrivers, companySites } from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { NotFoundError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { companyDriverReports } from '../../db/schema/operational';
import { desc } from 'drizzle-orm';
import { validators, safeString } from '../../lib/validators';

const router = Router({ mergeParams: true });

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createDriverSchema = z.object({
  code: z.string().trim().min(1, 'El código es requerido').max(40),
  firstName: validators.name,
  lastName: validators.name,
  email: validators.emailOptional,
  phone: validators.phoneOptional,
  siteId: z.string().optional().nullable(),       // "site-N" | null
  userId: z.string().optional().nullable(),       // "company-user-N" | null
  licenseNumber: validators.digits10Optional,
  licenseType: z.enum(['A', 'B', 'C', 'D', 'E', 'F']).optional().nullable(),
  licenseExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)').optional().nullable(),
  licensePoints: z.number().int().min(0).max(30).optional(),
  status: z.enum(['Activo', 'Inactivo']).default('Activo'),
  notes: validators.longTextOptional,
  photoUrl: z.string().max(2_000_000).optional().nullable(), // ~1.5 MB base64
});

const updateDriverSchema = createDriverSchema.partial();

// ─── GET /company/:id/drivers ─────────────────────────────────────────────────

router.get('/', requireModule('gestion', 'conductores'), async (req, res, next) => {
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

    // ── Enrichment: cargar nombres de sedes ────────────────────────────────────
    const sitesRows = await db
      .select({ id: companySites.id, name: companySites.name })
      .from(companySites)
      .where(eq(companySites.companyId, companyId));

    const siteMap = new Map(sitesRows.map(s => [s.id, s.name]));

    res.json({ data: rows.map(d => serializeDriver(d, siteMap.get(d.siteId) ?? null)), total: rows.length });
  } catch (err) {
    next(err);
  }
});

// ─── GET /company/:id/drivers/:driverId ──────────────────────────────────────

router.get('/:driverId', requireModule('gestion', 'conductores'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const driverId = parseId('driver', req.params.driverId);

    const rows = await db
      .select()
      .from(companyDrivers)
      .where(and(eq(companyDrivers.id, driverId), eq(companyDrivers.companyId, companyId)))
      .limit(1);

    if (!rows.length) throw new NotFoundError('Conductor', req.params.driverId);

    // ── Enrichment: cargar nombre de sede ──────────────────────────────────────
    let siteName: string | null = null;
    if (rows[0].siteId) {
      const [site] = await db
        .select({ name: companySites.name })
        .from(companySites)
        .where(and(eq(companySites.id, rows[0].siteId!), eq(companySites.companyId, companyId)))
        .limit(1);
      siteName = site?.name ?? null;
    }

    res.json(serializeDriver(rows[0], siteName));
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/drivers ────────────────────────────────────────────────

router.post(
  '/',
  requireModule('gestion', 'conductores'),
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

      // ── Enrichment: cargar nombre de sede ──────────────────────────────────────
      let siteName: string | null = null;
      if (created.siteId) {
        const [site] = await db
          .select({ name: companySites.name })
          .from(companySites)
          .where(and(eq(companySites.id, created.siteId), eq(companySites.companyId, companyId)))
          .limit(1);
        siteName = site?.name ?? null;
      }

      res.status(201).json(serializeDriver(created, siteName));
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /company/:id/drivers/:driverId ──────────────────────────────────────

router.put(
  '/:driverId',
  requireModule('gestion', 'conductores'),
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

      // ── Enrichment: cargar nombre de sede ──────────────────────────────────────
      let siteName: string | null = null;
      if (updated.siteId) {
        const [site] = await db
          .select({ name: companySites.name })
          .from(companySites)
          .where(and(eq(companySites.id, updated.siteId), eq(companySites.companyId, companyId)))
          .limit(1);
        siteName = site?.name ?? null;
      }

      res.json(serializeDriver(updated, siteName));
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /company/:id/drivers/:driverId ────────────────────────────────────

router.delete(
  '/:driverId',
  requireModule('gestion', 'conductores'),
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

function serializeDriver(d: typeof companyDrivers.$inferSelect, siteName?: string | null) {
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
    site: siteName ?? d.site ?? null,
    notes: d.notes,
    photoUrl: d.photoUrl,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}


// ─── Schemas reports ──────────────────────────────────────────────────────────

const createReportSchema = z.object({
  fuelLevel:     z.enum(['1/4', '1/2', '3/4', 'Lleno']).optional().nullable(),
  oilLevel:      z.enum(['Bajo', 'Medio', 'Alto']).optional().nullable(),
  vehicleFaults: validators.longText,
  invoices: z.array(z.object({
    receiptNumber: safeString({ min: 1, max: 60, fieldLabel: 'Número de recibo' }),
    description:   safeString({ min: 1, max: 200, fieldLabel: 'Descripción' }),
    fileUrl:       z.string().max(2_000_000).optional().nullable(),
  })).max(20).default([]),
  fileUrls: z.array(z.string().max(2_000_000)).max(20).default([]),
});

// ─── GET /company/:id/drivers/:driverId/reports ───────────────────────────────

router.get('/:driverId/reports', requireModule('gestion', 'conductores'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const driverId  = parseId('driver', req.params.driverId);

    const rows = await db
      .select()
      .from(companyDriverReports)
      .where(and(
        eq(companyDriverReports.companyId, companyId),
        eq(companyDriverReports.driverId, driverId),
      ))
      .orderBy(desc(companyDriverReports.createdAt));

    res.json({ data: rows.map(serializeReport) });
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/drivers/:driverId/reports ──────────────────────────────

router.post(
  '/:driverId/reports',
  requireModule('gestion', 'conductores'),
  validate(createReportSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const driverId  = parseId('driver', req.params.driverId);
      const body      = req.body as z.infer<typeof createReportSchema>;

      // Verificar que el conductor existe
      const driver = await db
        .select()
        .from(companyDrivers)
        .where(and(eq(companyDrivers.id, driverId), eq(companyDrivers.companyId, companyId)))
        .limit(1);

      if (!driver.length) throw new NotFoundError('Conductor', req.params.driverId);

      const [created] = await db
        .insert(companyDriverReports)
        .values({
          companyId,
          driverId,
          driverName:    `${driver[0].firstName} ${driver[0].lastName}`,
          fuelLevel:     body.fuelLevel,
          oilLevel:      body.oilLevel,
          vehicleFaults: body.vehicleFaults,
          invoices:      body.invoices,
          fileUrls:      body.fileUrls,
        })
        .returning();

      res.status(201).json(serializeReport(created));
    } catch (err) {
      next(err);
    }
  }
);

// ─── Report serializer ────────────────────────────────────────────────────────

function serializeReport(r: typeof companyDriverReports.$inferSelect) {
  return {
    id:            toId('driver-report', r.id),
    companyId:     toId('company', r.companyId),
    driverId:      toId('driver', r.driverId),
    driverName:    r.driverName,
    fuelLevel:     r.fuelLevel,
    oilLevel:      r.oilLevel,
    vehicleFaults: r.vehicleFaults,
    invoices:      r.invoices,
    fileUrls:      r.fileUrls ?? [],
    createdAt:     r.createdAt,
    updatedAt:     r.updatedAt,
  };
}

// ─── GET /company/:id/drivers/reports/all ─────────────────────────────────────
router.get('/reports/all', requireModule('gestion', 'conductores'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;

    const rows = await db
      .select()
      .from(companyDriverReports)
      .where(eq(companyDriverReports.companyId, companyId))
      .orderBy(desc(companyDriverReports.createdAt));

    res.json({ data: rows.map(serializeReport), total: rows.length });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /company/:id/drivers/:driverId/reports/:reportId ─────────────────

router.delete('/:driverId/reports/:reportId', requireModule('gestion', 'conductores'), requireAdmin, async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const driverId  = parseId('driver', req.params.driverId);
    const reportId  = parseId('driver-report', req.params.reportId);

    const existing = await db
      .select()
      .from(companyDriverReports)
      .where(and(
        eq(companyDriverReports.id, reportId),
        eq(companyDriverReports.driverId, driverId),
        eq(companyDriverReports.companyId, companyId),
      ))
      .limit(1);

    if (!existing.length) throw new NotFoundError('Reporte', req.params.reportId);

    await db
      .delete(companyDriverReports)
      .where(and(
        eq(companyDriverReports.id, reportId),
        eq(companyDriverReports.companyId, companyId),
      ));

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;