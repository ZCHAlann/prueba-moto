import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyDrivers, companySites, companyAssignments, companyAssets } from '../../db/schema/operational';
import { companyUsers } from '../../db/schema/platform';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { NotFoundError, AppError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { companyDriverReports } from '../../db/schema/operational';
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

    // LEFT JOIN con companyUsers para enriquecer con profileData (datos
    // personales: firstName, lastName, phone, documentNumber, siteId).
    // La fila de drivers puede tener datos viejos si el admin editó al
    // user desde Accesos, así que el profileData es la fuente de verdad
    // para los datos personales.
    let rows = await db
      .select({
        driver: companyDrivers,
        user:   {
          id:          companyUsers.id,
          email:       companyUsers.email,
          photoUrl:    companyUsers.photoUrl,
          status:      companyUsers.status,
          profileData: companyUsers.profileData,
        },
      })
      .from(companyDrivers)
      .leftJoin(
        companyUsers,
        and(
          eq(companyUsers.id, companyDrivers.userId),
          eq(companyUsers.companyId, companyId),
        ),
      )
      .where(eq(companyDrivers.companyId, companyId))
      .orderBy(companyDrivers.lastName);

    if (status && typeof status === 'string') {
      rows = rows.filter((r) => r.driver.status === status);
    }

    if (siteId && typeof siteId === 'string') {
      const parsedSiteId = parseId('site', siteId);
      rows = rows.filter((r) => r.driver.siteId === parsedSiteId);
    }

    if (search && typeof search === 'string') {
      const q = search.toLowerCase();
      rows = rows.filter((r) => {
        const d = r.driver;
        if (
          d.firstName.toLowerCase().includes(q) ||
          d.lastName.toLowerCase().includes(q) ||
          d.code.toLowerCase().includes(q) ||
          d.licenseNumber?.toLowerCase().includes(q)
        ) {
          return true;
        }
        // Buscar también en los datos del profile del user asociado
        const p = (r.user?.profileData as Record<string, unknown> | null) ?? {};
        const pFirst = String(p.firstName ?? "").toLowerCase();
        const pLast  = String(p.lastName  ?? "").toLowerCase();
        const pDoc   = String(p.documentNumber ?? "").toLowerCase();
        return pFirst.includes(q) || pLast.includes(q) || pDoc.includes(q);
      });
    }

    // ── Enrichment: cargar nombres de sedes ────────────────────────────────────
    const sitesRows = await db
      .select({ id: companySites.id, name: companySites.name })
      .from(companySites)
      .where(eq(companySites.companyId, companyId));

    const siteMap = new Map(sitesRows.map(s => [s.id, s.name]));

    res.json({
      data: rows.map(r => serializeDriver(r.driver, siteMap.get(r.driver.siteId) ?? null, r.user)),
      total: rows.length,
      sites: sitesRows,
    });
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
      .select({
        driver: companyDrivers,
        user:   {
          id:          companyUsers.id,
          email:       companyUsers.email,
          photoUrl:    companyUsers.photoUrl,
          status:      companyUsers.status,
          profileData: companyUsers.profileData,
        },
      })
      .from(companyDrivers)
      .leftJoin(
        companyUsers,
        and(
          eq(companyUsers.id, companyDrivers.userId),
          eq(companyUsers.companyId, companyId),
        ),
      )
      .where(and(eq(companyDrivers.id, driverId), eq(companyDrivers.companyId, companyId)))
      .limit(1);

    if (!rows.length) throw new NotFoundError('Conductor', req.params.driverId);

    const { driver, user } = rows[0];

    // ── Enrichment: cargar nombre de sede ──────────────────────────────────────
    let siteName: string | null = null;
    if (driver.siteId) {
      const [site] = await db
        .select({ name: companySites.name })
        .from(companySites)
        .where(and(eq(companySites.id, driver.siteId!), eq(companySites.companyId, companyId)))
        .limit(1);
      siteName = site?.name ?? null;
    }

    // ── Enrichment: acta de asignación activa del conductor ────────────────────
    // Buscamos primero la activa; si no hay, la última cerrada, para que el
    // drawer siempre tenga qué mostrar (cuando el conductor está libre, ve
    // el historial reciente).
    const [activeAsg] = await db
      .select({
        assignment: companyAssignments,
        assetName:  companyAssets.name,
        assetPlate: companyAssets.plate,
      })
      .from(companyAssignments)
      .leftJoin(companyAssets, eq(companyAssets.id, companyAssignments.assetId))
      .where(and(
        eq(companyAssignments.driverId, driverId),
        eq(companyAssignments.companyId, companyId),
        eq(companyAssignments.status, 'Activa'),
      ))
      .orderBy(desc(companyAssignments.createdAt))
      .limit(1);

    let assignmentForActa = activeAsg;
    if (!assignmentForActa) {
      const [lastAsg] = await db
        .select({
          assignment: companyAssignments,
          assetName:  companyAssets.name,
          assetPlate: companyAssets.plate,
        })
        .from(companyAssignments)
        .leftJoin(companyAssets, eq(companyAssets.id, companyAssignments.assetId))
        .where(and(
          eq(companyAssignments.driverId, driverId),
          eq(companyAssignments.companyId, companyId),
        ))
        .orderBy(desc(companyAssignments.createdAt))
        .limit(1);
      assignmentForActa = lastAsg;
    }

    const currentAssignment = assignmentForActa?.assignment
      ? serializeAssignment(assignmentForActa.assignment, {
          firstName: driver.firstName,
          lastName:  driver.lastName,
          phone:     driver.phone,
        }, {
          id:    assignmentForActa.assetName ? toId('asset', assignmentForActa.assignment.assetId) : null,
          name:  assignmentForActa.assetName  ?? null,
          plate: assignmentForActa.assetPlate ?? null,
        })
      : null;

    res.json(serializeDriver(driver, siteName, user, currentAssignment));
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

      // Validar que el companyUser (si se pasa) exista en la misma empresa.
      if (userId) {
        const [u] = await db
          .select({ id: companyUsers.id, role: companyUsers.role })
          .from(companyUsers)
          .where(and(eq(companyUsers.id, userId), eq(companyUsers.companyId, companyId)))
          .limit(1);
        if (!u) {
          throw new NotFoundError('Usuario', body.userId!);
        }
        // Si el user es conductor, no debe existir OTRO driver con ese userId.
        if (u.role === "conductor") {
          const dup = await db
            .select({ id: companyDrivers.id })
            .from(companyDrivers)
            .where(and(eq(companyDrivers.userId, userId), eq(companyDrivers.companyId, companyId)))
            .limit(1);
          if (dup.length) {
            throw new AppError(`El usuario ya tiene un conductor asociado (driver=${dup[0]!.id}).`, 409);
          }
        }
      }

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

type UserEnrichment = {
  id: number;
  email: string | null;
  photoUrl: string | null;
  status: string | null;
  profileData: unknown;
} | null;

function serializeDriver(
  d: typeof companyDrivers.$inferSelect,
  siteNameParam?: string | null,
  user: UserEnrichment = null,
  currentAssignment?: ReturnType<typeof serializeAssignment> | null,
) {
  // Si el driver está vinculado a un company_user, los datos personales
  // (firstName/lastName/phone/email/photo) se leen del profileData (fuente
  // de verdad editada desde Accesos). Si no hay user asociado, usamos lo
  // que tenga la fila del driver.
  const profile = (user?.profileData as Record<string, unknown> | null) ?? {};
  let pFirst = typeof profile.firstName === "string" ? profile.firstName.trim() : "";
  let pLast  = typeof profile.lastName  === "string" ? profile.lastName.trim()  : "";
  const pPhone = typeof profile.phone     === "string" ? profile.phone.trim()     : "";
  // Si el form guardó `fullName` y no `firstName`/`lastName`, partimos acá
  // también (defensa en profundidad por si el profileData no fue normalizado).
  if (!pFirst && !pLast && typeof profile.fullName === "string") {
    const tokens = profile.fullName.trim().split(/\s+/).filter(Boolean);
    pFirst = tokens[0] ?? "";
    pLast  = tokens.slice(1).join(" ");
  }

  const firstName = pFirst || d.firstName;
  const lastName  = pLast  || d.lastName;
  const phone     = pPhone || d.phone;
  const email     = user?.email ?? d.email;
  const photoUrl  = user?.photoUrl ?? d.photoUrl;

  return {
    id: toId('driver', d.id),
    companyId: toId('company', d.companyId),
    siteId: d.siteId ? toId('site', d.siteId) : null,
    userId: d.userId ? toId('company-user', d.userId) : null,
    userStatus: user?.status ?? null,
    code: d.code,
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim(),
    email,
    phone,
    documentNumber: typeof profile.documentNumber === "string" ? profile.documentNumber : null,
    licenseNumber: d.licenseNumber,
    licenseType: d.licenseType,
    licenseExpiry: d.licenseExpiry,
    licensePoints: d.licensePoints,
    status: d.status,
    siteName: siteNameParam ?? null,
    notes: d.notes,
    photoUrl,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    // ── Enrichment: acta de asignación (null si el conductor no tiene
    //    asignación activa y nunca tuvo una cerrada).
    currentAssignment: currentAssignment ?? null,
  };
}

/**
 * Serializa el "acta" de una asignación. El frontend usa esto en el drawer
 * de detalle (Flotas y Conductores) sin tener que pegarle a otro endpoint.
 * Si `vehicle` viene, expone también el vehículo asignado en el mismo shape.
 */
function serializeAssignment(
  asg: typeof companyAssignments.$inferSelect,
  driver?: { firstName: string | null; lastName: string | null; phone: string | null } | null,
  vehicle?: { id: string | null; name: string | null; plate: string | null } | null,
) {
  return {
    id:               toId('assignment', asg.id),
    status:           asg.status,
    startDate:        asg.startDate,
    endDate:          asg.endDate,
    notes:            asg.notes,
    // Datos del acta
    actaNumber:       asg.actaNumber,
    actaDate:         asg.actaDate,
    actaTime:         asg.actaTime,
    actaPlace:        asg.actaPlace,
    actaArea:         asg.actaArea,
    handoverUrl:      asg.handoverUrl,
    // Datos del vehículo al momento de la entrega
    vehicleOdometer:  asg.vehicleOdometer,
    vehicleFuelLevel: asg.vehicleFuelLevel,
    vehicleCondition: asg.vehicleCondition,
    vehiclePhotoUrls: asg.vehiclePhotoUrls ?? [],
    // Firmas digitalizadas (URLs)
    signatureLogUrl:  asg.signatureLogUrl,
    signatureRespUrl: asg.signatureRespUrl,
    // Datos del conductor congelados al momento de la entrega
    driverDni:        asg.driverDni,
    driverPhone:      asg.driverPhone,
    driverRole:       asg.driverRole,
    driverSnapshot:   driver ? {
      firstName: driver.firstName ?? null,
      lastName:  driver.lastName  ?? null,
      phone:     driver.phone     ?? null,
    } : null,
    // Snapshot del vehículo (null si ya no existe)
    vehicleSnapshot:  vehicle ?? null,
    // Novedades / accesorios
    novedades:        asg.novedades       ?? {},
    accesorios:       asg.accesorios      ?? {},
    novedadesText:    asg.novedadesText,
    createdAt:        asg.createdAt,
    updatedAt:        asg.updatedAt,
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