import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyAlerts, companyAssets } from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { requireSupervisor } from '../../middlewares/requireSupervisor';
import { NotFoundError } from '../../lib/errors';
import { toId, parseId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { safeString, validators } from '../../lib/validators';

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
// Query: ?status=Abierta &severity=Alta &assetId=asset-1

router.get('/', requireModule('alertas'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;
    const { status, severity, assetId } = req.query;

    let rows = await db
      .select()
      .from(companyAlerts)
      .where(eq(companyAlerts.companyId, companyId))
      .orderBy(companyAlerts.createdAt);

    if (status && typeof status === 'string') {
      rows = rows.filter((a) => a.status === status);
    }
    if (severity && typeof severity === 'string') {
      rows = rows.filter((a) => a.severity === severity);
    }
    if (assetId && typeof assetId === 'string') {
      const parsedAssetId = parseId('asset', assetId);
      rows = rows.filter((a) => a.assetId === parsedAssetId);
    }

    // ── Enrichment: cargar nombres de activos ─────────────────────────────────
    const assetsRows = await db
      .select({ id: companyAssets.id, name: companyAssets.name, plate: companyAssets.plate })
      .from(companyAssets)
      .where(eq(companyAssets.companyId, companyId));

    const assetMap = new Map(assetsRows.map(a => [a.id, { name: a.name, plate: a.plate }]));

    res.json({ data: rows.map(a => serializeAlert(a, assetMap.get(a.assetId))), total: rows.length });
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
  requireSupervisor,
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