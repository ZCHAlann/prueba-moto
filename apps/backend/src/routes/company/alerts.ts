import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc, sql, isNull, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  companyAlerts,
  companyAssets,
  companyDrivers,
  companyAssignments,
} from '../../db/schema/operational';
import { companyUsers } from '../../db/schema/platform';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { requireSupervisor } from '../../middlewares/requireSupervisor';
import { requireSupervisorOrOperator } from '../../middlewares/requireSupervisorOrOperator';
import { NotFoundError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { safeString, validators } from '../../lib/validators';
import { parsePageParams, buildPageResponse } from '../../lib/pagination';
import { notifyMany } from '../../lib/notification-service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * jul 2026 v8 — Calcula el intervalo de re-envío (minutos) según
 * la severidad de la alerta. 0 = sin recordatorio.
 *   Alta  →  30 min
 *   Media → 120 min
 *   Baja  → 480 min
 */
function reminderIntervalMinutesFor(severity: string | null | undefined): number {
  switch (severity) {
    case 'Alta':  return 30;
    case 'Media': return 120;
    case 'Baja':  return 480;
    default:      return 120;   // default razonable para severidades custom
  }
}

/**
 * jul 2026 v8 — Resuelve el `assetId` final para una alerta que crea un
 * usuario. Si el actor es CONDUCTOR (rol='conductor' o 'operador'
 * con perfil de driver) y tiene una asignación ACTIVA (sin endDate y
 * status='Activa'), forzamos `assetId` al vehículo asignado — el
 * conductor NO puede elegir otro.
 *
 * Devuelve { assetId, driverId, siteId, forced }.
 */
async function resolveAssetForAlert(actor: {
  userId: number;
  role: string;
  companyId: number;
}): Promise<{ assetId: number | null; driverId: number | null; siteId: number | null; forced: boolean }> {
  // 1) ¿El actor tiene un company_drivers.userId match?
  const [driver] = await db
    .select({
      id:        companyDrivers.id,
      siteId:    companyDrivers.siteId,
    })
    .from(companyDrivers)
    .where(and(
      eq(companyDrivers.companyId, actor.companyId),
      eq(companyDrivers.userId,    actor.userId),
    ))
    .limit(1);

  if (!driver) {
    // No es conductor (o no está dado de alta en company_drivers).
    return { assetId: null, driverId: null, siteId: null, forced: false };
  }

  // 2) Buscar su asignación ACTIVA (sin endDate o endDate >= hoy).
  const today = new Date().toISOString().slice(0, 10);
  const [assignment] = await db
    .select({
      assetId: companyAssignments.assetId,
    })
    .from(companyAssignments)
    .where(and(
      eq(companyAssignments.companyId, actor.companyId),
      eq(companyAssignments.driverId,  driver.id),
      eq(companyAssignments.status,    'Activa'),
      sql`(${companyAssignments.endDate} IS NULL OR ${companyAssignments.endDate} >= ${today}::date)`,
    ))
    .orderBy(desc(companyAssignments.startDate))
    .limit(1);

  return {
    assetId: assignment?.assetId ?? null,
    driverId: driver.id,
    siteId:   driver.siteId ?? null,
    forced:   true,
  };
}

/**
 * jul 2026 v8 — Resuelve la lista de userIds destinatarios de una
 * alerta recién creada.
 *
 * Reglas:
 *   1. TODOS los admin_empresa / owner_empresa de la empresa.
 *   2. Los supervisores de la MISMA SEDE que el activo (si assetId
 *      tiene siteId y el schema lo permite). Si no hay siteId,
 *      supervisores de TODA la empresa.
 *   3. EXCLUYE al actor (no se notifica a sí mismo).
 *   4. EXCLUYE admins duplicados en la lista de supervisores.
 */
async function resolveAlertRecipients(args: {
  companyId: number;
  actorUserId: number;
  assetId: number | null;
  driverSiteId: number | null;  // siteId del conductor (si fue quien creó)
}): Promise<{ adminUserIds: number[]; supervisorUserIds: number[]; allRecipientUserIds: number[] }> {
  // 1) Admins
  const admins = await db
    .select({ id: companyUsers.id })
    .from(companyUsers)
    .where(and(
      eq(companyUsers.companyId, args.companyId),
      inArray(companyUsers.role, ['admin_empresa', 'owner_empresa']),
      eq(companyUsers.status, 'active'),
    ));
  const adminUserIds = admins.map((a) => a.id).filter((id) => id !== args.actorUserId);

  // 2) Site del activo (si assetId). Prioridad: siteId del activo > siteId del driver.
  let siteId: number | null = null;
  if (args.assetId) {
    const [a] = await db
      .select({ siteId: companyAssets.siteId })
      .from(companyAssets)
      .where(and(eq(companyAssets.id, args.assetId), eq(companyAssets.companyId, args.companyId)))
      .limit(1);
    siteId = a?.siteId ?? null;
  }
  if (!siteId) siteId = args.driverSiteId;

  // 3) Supervisores.
  //
  // jul 2026 v8 — TODO futuro: filtrar por `company_sites.managerId`
  // cuando se agregue esa columna. Por ahora `company_sites` no tiene
  // managerId en el schema, así que notificamos a TODOS los
  // supervisores activos de la empresa. El filtro por sede se puede
  // agregar en una migración futura (agregando `siteId` a
  // `company_users` o un join table `user_sites`).
  const supConditions = [
    eq(companyUsers.companyId, args.companyId),
    eq(companyUsers.role, 'supervisor'),
    eq(companyUsers.status, 'active'),
  ];
  const supervisors = await db
    .select({ id: companyUsers.id })
    .from(companyUsers)
    .where(and(...supConditions));

  // Si tenemos siteId, podemos filtrar via una tabla puente cuando
  // exista. Por ahora: logueamos el siteId para debug.
  if (siteId) {
    // (futuro) Filtrar por `users_sites.user_id` cuando se cree esa tabla.
    // const userIdsAtSite = await db.select(...).from(usersSites).where(eq(usersSites.siteId, siteId));
  }

  const supervisorUserIds = supervisors
    .map((s) => s.id)
    .filter((id) => id !== args.actorUserId && !adminUserIds.includes(id));

  const allRecipientUserIds = Array.from(new Set([...adminUserIds, ...supervisorUserIds]));
  return { adminUserIds, supervisorUserIds, allRecipientUserIds };
}

const router = Router({ mergeParams: true });

// ─── Schemas ─────────────────────────────────────────────────────────────────

const ALERT_SEVERITIES = ['Alta', 'Media', 'Baja'] as const;
const ALERT_STATUSES = ['Abierta', 'En seguimiento', 'Cerrada'] as const;
const ALERT_TYPES = ['Vencimiento', 'Mantenimiento', 'Documento', 'Manual'] as const;

const createAlertSchema = z.object({
  title: safeString({ min: 3, max: 200, fieldLabel: 'Título', allowEmpty: false }),
  type: z.enum(ALERT_TYPES).optional().nullable(),
  severity: z.enum(ALERT_SEVERITIES).default('Media'),
  status: z.enum(ALERT_STATUSES).default('Abierta'),
  assetId: z.string().optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)').optional().nullable(),
  notes: validators.longTextOptional,
});

const updateAlertSchema = createAlertSchema.partial();

const patchStatusSchema = z.object({
  status: z.enum(ALERT_STATUSES),
  notes: validators.longTextOptional,
});

// ─── GET /company/:id/alerts ──────────────────────────────────────────────────
// Query: ?status=Abierta &severity=Alta &assetId=asset-1 &q=texto &page=1 &pageSize=20
//
// Paginación SQL real: las condiciones del WHERE se construyen UNA SOLA VEZ
// en `conds` y se reusan en la query de datos y en la query de count.
// `assets` (catálogo para dropdowns de filtro) NO se pagina — es un subrecurso
// aparte, no parte del dataset de alertas.

router.get('/', requireModule('alertas'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const { status, severity, assetId, q } = req.query;
    const { page, pageSize, offset } = parsePageParams(req.query as Record<string, unknown>);

    // WHERE compartido entre SELECT paginado y COUNT(*).
    const conds = [eq(companyAlerts.companyId, companyId)];
    if (status && typeof status === 'string') {
      conds.push(eq(companyAlerts.status, status as 'Abierta'));
    }
    if (severity && typeof severity === 'string') {
      conds.push(eq(companyAlerts.severity, severity as 'Alta'));
    }
    if (assetId && typeof assetId === 'string') {
      try {
        const parsedAssetId = parseId('asset', assetId);
        conds.push(eq(companyAlerts.assetId, parsedAssetId));
      } catch {
        // assetId malformado → no filtra, simplemente no matchea nada
        conds.push(eq(companyAlerts.id, -1));
      }
    }
    if (q && typeof q === 'string' && q.trim().length > 0) {
      const like = `%${q.trim().toLowerCase()}%`;
      // ILIKE sobre title/notes. Para no romper el contrato de "todas las
      // condiciones compartidas entre datos y count", aplicamos el mismo OR
      // en ambos.
      conds.push(sql`(
        lower(${companyAlerts.title}) like ${like}
        or lower(coalesce(${companyAlerts.notes}, '')) like ${like}
      )`);
    }
    const where = and(...conds);

    const [rows, countRow, assetsRows] = await Promise.all([
      db
        .select()
        .from(companyAlerts)
        .where(where)
        .orderBy(desc(companyAlerts.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ value: sql<number>`cast(count(*) as int)` })
        .from(companyAlerts)
        .where(where),
      // Catálogo de activos (no paginado, se usa para dropdowns).
      db
        .select({ id: companyAssets.id, name: companyAssets.name, plate: companyAssets.plate })
        .from(companyAssets)
        .where(eq(companyAssets.companyId, companyId)),
    ]);

    const total = countRow?.[0]?.value ?? 0;
    const assetMap = new Map(assetsRows.map(a => [a.id, { name: a.name, plate: a.plate }]));

    res.json({
      ...buildPageResponse(rows.map(a => serializeAlert(a, assetMap.get(a.assetId))), total, page, pageSize),
      assets: assetsRows.map((a) => ({ id: a.id, name: a.name, plate: a.plate })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /company/:id/alerts/:alertId ────────────────────────────────────────

router.get('/:alertId', requireModule('alertas'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const alertId = parseId('alert', req.params.alertId);

    const rows = await db
      .select()
      .from(companyAlerts)
      .where(and(eq(companyAlerts.id, alertId), eq(companyAlerts.companyId, companyId)))
      .limit(1);

    if (!rows.length) throw new NotFoundError('Alerta', req.params.alertId);

    // ── Enrichment ────────────────────────────────────────────────────────────
    let assetInfo: { name: string | null; plate: string | null; siteId: number | null } | null = null;
    if (rows[0].assetId) {
      const [asset] = await db
        .select({ name: companyAssets.name, plate: companyAssets.plate, siteId: companyAssets.siteId })
        .from(companyAssets)
        .where(and(eq(companyAssets.id, rows[0].assetId), eq(companyAssets.companyId, companyId)))
        .limit(1);
      assetInfo = asset ?? null;
    }

    res.json(serializeAlert(rows[0], assetInfo));
  } catch (err) {
    next(err);
  }
});

// ─── POST /company/:id/alerts ─────────────────────────────────────────────────

router.post(
  '/',
  requireModule('alertas'),
  // Operadores / conductores también pueden crear alertas (regla de
  // negocio: "Cualquier usuario de la empresa puede reportar incidentes").
  // Los admins las reciben por WS via notifyMany(companyId, ...).
  requireSupervisorOrOperator,
  validate(createAlertSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const body = req.body as z.infer<typeof createAlertSchema>;

      // ── 1) Resolver el actor ─────────────────────────────────────────────
      const actorUserId = parseId('company-user', req.user!.sub) ?? 0;
      const actorRole   = req.user!.role;
      const isConductor = actorRole === 'conductor';

      // ── 2) Resolver assetId ──────────────────────────────────────────────
      //
      // jul 2026 v8 — REGLA NUEVA:
      //   - Si el actor es CONDUCTOR: forzar `assetId` al vehículo de su
      //     asignación ACTIVA. Si no tiene asignación, la alerta se crea
      //     sin vehículo (assetId = null).
      //   - Si NO es conductor: aceptar el `assetId` del body (o null).
      let resolvedAssetId: number | null = null;
      let driverSiteId:   number | null = null;
      let actorIsDriver   = false;
      if (isConductor) {
        const r = await resolveAssetForAlert({
          userId:    actorUserId,
          role:      actorRole,
          companyId,
        });
        resolvedAssetId = r.assetId;
        driverSiteId   = r.siteId;
        actorIsDriver  = true;
        // El body.assetId es IGNORADO para conductores — la regla es dura.
      } else {
        resolvedAssetId = body.assetId ? parseId('asset', body.assetId) : null;
      }

      // ── 3) Calcular periodicidad de recordatorio ─────────────────────────
      const reminderInterval = reminderIntervalMinutesFor(body.severity ?? 'Media');
      const nextReminderAt   = reminderInterval > 0
        ? new Date(Date.now() + reminderInterval * 60_000)
        : null;

      // ── 4) Insertar la alerta ─────────────────────────────────────────────
      const [created] = await db
        .insert(companyAlerts)
        .values({
          ...body,
          companyId,
          assetId:                  resolvedAssetId ?? undefined,
          reminderIntervalMinutes:  reminderInterval,
          lastRemindedAt:           null,
          nextReminderAt:           nextReminderAt,
        })
        .returning();

      await logAudit(db, companyId, {
        entity: 'alerts',
        entityId: toId('alert', created.id),
        action: 'create',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Alerta "${created.title}" creada (${created.severity}).` +
          (actorIsDriver ? ' [forzada por conductor, assetId=' + (resolvedAssetId ?? 'null') + ']' : ''),
      });

      // ── Enrichment ─────────────────────────────────────────────────────────
      let assetInfo: { name: string | null; plate: string | null; siteId: number | null } | null = null;
      if (created.assetId) {
        const [asset] = await db
          .select({ name: companyAssets.name, plate: companyAssets.plate, siteId: companyAssets.siteId })
          .from(companyAssets)
          .where(and(eq(companyAssets.id, created.assetId), eq(companyAssets.companyId, companyId)))
          .limit(1);
        assetInfo = asset ?? null;
      }

      // ── 5) Notificación a admins + supervisores de la sede ──────────────
      try {
        const recipients = await resolveAlertRecipients({
          companyId,
          actorUserId,
          assetId:      created.assetId ?? null,
          driverSiteId,
        });

        const title = `Nueva alerta (${created.severity}): ${created.title}`;
        const body  = assetInfo
          ? `Vehículo: ${assetInfo.name}${assetInfo.plate ? ` (${assetInfo.plate})` : ''}`
          : (created.notes ?? '');

        if (recipients.allRecipientUserIds.length > 0) {
          await notifyMany(companyId, recipients.allRecipientUserIds, {
            kind:    'alert_created',
            title,
            body,
            payload: {
              alertId:                created.id,
              severity:               created.severity,
              type:                   created.type ?? 'Manual',
              assetId:                created.assetId,
              reminderIntervalMinutes: reminderInterval,
              nextReminderAt:         nextReminderAt?.toISOString() ?? null,
              actor:                  req.user!.name,
            },
          });
        }
      } catch (err) {
        console.warn('[alerts] notify created falló (no crítico):', (err as Error).message);
      }

      res.status(201).json(serializeAlert(created, assetInfo));
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /company/:id/alerts/:alertId ────────────────────────────────────────

router.put(
  '/:alertId',
  requireModule('alertas'),
  requireSupervisor,
  validate(updateAlertSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const alertId = parseId('alert', req.params.alertId);
      const body = req.body as z.infer<typeof updateAlertSchema>;

      const existing = await db
        .select()
        .from(companyAlerts)
        .where(and(eq(companyAlerts.id, alertId), eq(companyAlerts.companyId, companyId)))
        .limit(1);

      if (!existing.length) throw new NotFoundError('Alerta', req.params.alertId);

      const updateData: Record<string, unknown> = { ...body, updatedAt: new Date() };
      if (body.assetId !== undefined) {
        updateData.assetId = body.assetId ? parseId('asset', body.assetId) : null;
      }

      const [updated] = await db
        .update(companyAlerts)
        .set(updateData)
        .where(and(eq(companyAlerts.id, alertId), eq(companyAlerts.companyId, companyId)))
        .returning();

      await logAudit(db, companyId, {
        entity: 'alerts',
        entityId: toId('alert', updated.id),
        action: 'update',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Alerta "${updated.title}" actualizada.`,
      });

      res.json(serializeAlert(updated));
    } catch (err) {
      next(err);
    }
  }
);

// ─── PATCH /company/:id/alerts/:alertId/status ────────────────────────────────

router.patch(
  '/:alertId/status',
  requireModule('alertas'),
  requireSupervisor,
  validate(patchStatusSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const alertId = parseId('alert', req.params.alertId);
      const { status, notes } = req.body as z.infer<typeof patchStatusSchema>;

      const existing = await db
        .select()
        .from(companyAlerts)
        .where(and(eq(companyAlerts.id, alertId), eq(companyAlerts.companyId, companyId)))
        .limit(1);

      if (!existing.length) throw new NotFoundError('Alerta', req.params.alertId);

      const updateData: Record<string, unknown> = { status, updatedAt: new Date() };
      if (notes !== undefined) updateData.notes = notes;

      const [updated] = await db
        .update(companyAlerts)
        .set(updateData)
        .where(and(eq(companyAlerts.id, alertId), eq(companyAlerts.companyId, companyId)))
        .returning();

      await logAudit(db, companyId, {
        entity: 'alerts',
        entityId: toId('alert', updated.id),
        action: 'status_change',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Alerta "${updated.title}" cambió a estado "${status}".`,
      });

      // Notificación: cuando se CIERRA notificar a los admins (excepto actor).
      try {
        if (status === 'Cerrada') {
          const actorId = parseId('company-user', req.user!.sub);
          await notifyAdminsExceptActor(companyId, actorId, {
            kind:    'alert_closed',
            title:   `Alerta cerrada: ${updated.title}`,
            body:    `Cerrada por ${req.user!.name}.`,
            payload: {
              alertId: updated.id,
              severity: updated.severity,
              actor:    req.user!.name,
            },
          });
        }
      } catch (err) {
        console.warn('[alerts] notify status falló (no crítico):', (err as Error).message);
      }

      res.json(serializeAlert(updated));
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /company/:id/alerts/:alertId ──────────────────────────────────────

router.delete(
  '/:alertId',
  requireModule('alertas'),
  requireAdmin,
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const alertId = parseId('alert', req.params.alertId);

      const existing = await db
        .select()
        .from(companyAlerts)
        .where(and(eq(companyAlerts.id, alertId), eq(companyAlerts.companyId, companyId)))
        .limit(1);

      if (!existing.length) throw new NotFoundError('Alerta', req.params.alertId);

      await db
        .delete(companyAlerts)
        .where(and(eq(companyAlerts.id, alertId), eq(companyAlerts.companyId, companyId)));

      await logAudit(db, companyId, {
        entity: 'alerts',
        entityId: toId('alert', alertId),
        action: 'delete',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Alerta "${existing[0].title}" eliminada.`,
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Serializer ───────────────────────────────────────────────────────────────

function serializeAlert(
  a: typeof companyAlerts.$inferSelect,
  assetInfo?: { name: string | null; plate: string | null; siteId?: number | null } | null
) {
  return {
    id: toId('alert', a.id),
    companyId: toId('company', a.companyId),
    assetId: a.assetId ? toId('asset', a.assetId) : null,
    title: a.title,
    type: a.type,
    severity: a.severity,
    status: a.status,
    dueDate: a.dueDate,
    notes: a.notes,
    // ── Enrichment: datos del activo para display sin hooks externos ─────────
    assetName:  assetInfo?.name ?? null,
    assetPlate: assetInfo?.plate ?? null,
    assetSiteId: assetInfo?.siteId ?? null,
    // ── jul 2026 v8 — recordatorio periódico ─────────────────────────────
    reminderIntervalMinutes: a.reminderIntervalMinutes ?? 0,
    lastRemindedAt:          a.lastRemindedAt?.toISOString() ?? null,
    nextReminderAt:          a.nextReminderAt?.toISOString() ?? null,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

export default router;