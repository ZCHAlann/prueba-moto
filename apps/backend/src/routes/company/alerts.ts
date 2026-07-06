import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyAlerts, companyAssets } from '../../db/schema/operational';
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
import { notifyAdmins, notifyAdminsExceptActor } from '../../lib/notification-service';

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
    let assetInfo: { name: string | null; plate: string | null } | null = null;
    if (rows[0].assetId) {
      const [asset] = await db
        .select({ name: companyAssets.name, plate: companyAssets.plate })
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
  // Los admins las reciben por WS via notifyAdmins(companyId, ...).
  requireSupervisorOrOperator,
  validate(createAlertSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const body = req.body as z.infer<typeof createAlertSchema>;

      const assetId = body.assetId ? parseId('asset', body.assetId) : null;

      const [created] = await db
        .insert(companyAlerts)
        .values({ ...body, companyId, assetId: assetId ?? undefined })
        .returning();

      await logAudit(db, companyId, {
        entity: 'alerts',
        entityId: toId('alert', created.id),
        action: 'create',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Alerta "${created.title}" creada (${created.severity}).`,
      });

      // ── Enrichment ────────────────────────────────────────────────────────────
      let assetInfo: { name: string | null; plate: string | null } | null = null;
      if (created.assetId) {
        const [asset] = await db
          .select({ name: companyAssets.name, plate: companyAssets.plate })
          .from(companyAssets)
          .where(and(eq(companyAssets.id, created.assetId), eq(companyAssets.companyId, companyId)))
          .limit(1);
        assetInfo = asset ?? null;
      }

      // ── Notificación: alerta creada ──────────────────────────────────────────
      // Regla: si el creador es un conductor/operador (NO admin), se notifica a
      // TODOS los admin_empresa/owner_empresa de la empresa. Si el creador ya
      // es admin, se notifica al resto de admins (excepto actor).
      try {
        const actorRole = req.user!.role;
        const actorId = parseId('company-user', req.user!.sub);
        const isAdmin = actorRole === 'admin_empresa' || actorRole === 'owner_empresa';

        const title = `Nueva alerta (${created.severity}): ${created.title}`;
        const body  = assetInfo
          ? `Vehículo: ${assetInfo.name}${assetInfo.plate ? ` (${assetInfo.plate})` : ''}`
          : (created.notes ?? '');

        if (isAdmin) {
          await notifyAdminsExceptActor(companyId, actorId, {
            kind:    'alert_created',
            title,
            body,
            payload: {
              alertId:  created.id,
              severity: created.severity,
              type:     created.type ?? 'Manual',
              assetId:  created.assetId,
              actor:    req.user!.name,
            },
          });
        } else {
          // Conductor/operador: avisar a TODOS los admins (incluyendo si el
          // actor es admin, cosa que no debería pasar por el middleware, pero
          // por seguridad lo manejamos así).
          await notifyAdmins(companyId, {
            kind:    'alert_created',
            title,
            body,
            payload: {
              alertId:  created.id,
              severity: created.severity,
              type:     created.type ?? 'Manual',
              assetId:  created.assetId,
              actor:    req.user!.name,
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
  assetInfo?: { name: string | null; plate: string | null } | null
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
    assetName: assetInfo?.name ?? null,
    assetPlate: assetInfo?.plate ?? null,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

export default router;