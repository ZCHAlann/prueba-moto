// routes/company/odometer.ts
// Endpoints de lecturas de odómetro del vehículo.
// Al insertar una lectura, dispara la revisión de mantenimientos km_based
// del vehículo y notifica si alguno cruza el umbral.

import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyOdometerReadings, companyAssets } from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requirePermission } from '../../middlewares/requirePermission';
import { parseId } from '../../lib/ids';
import { NotFoundError } from '../../lib/errors';
import { logAudit } from '../../lib/audit';
import { sweepKmBasedTriggers } from '../../lib/maintenance-rescheduler';

const router = Router({ mergeParams: true });

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createReadingSchema = z.object({
  km:     z.number().int().nonnegative().max(10_000_000),
  source: z.enum(['manual', 'fuel', 'handover', 'maintenance']).default('manual'),
  notes:  z.string().max(2_000).optional().nullable(),
});

// ─── GET /company/:id/assets/:assetId/odometer ───────────────────────────────

router.get(
  '/assets/:assetId/odometer',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'records', 'ver'),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const assetId = parseId('asset', req.params.assetId);

      const rows = await db
        .select()
        .from(companyOdometerReadings)
        .where(and(
          eq(companyOdometerReadings.companyId, companyId),
          eq(companyOdometerReadings.assetId, assetId),
        ))
        .orderBy(desc(companyOdometerReadings.takenAt))
        .limit(100);

      res.json({ data: rows, total: rows.length });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /company/:id/assets/:assetId/odometer ──────────────────────────────

router.post(
  '/assets/:assetId/odometer',
  requireModule('mantenimiento'),
  requirePermission('mantenimiento', 'records', 'crear'),
  validate(createReadingSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const assetId   = parseId('asset', req.params.assetId);
      const body      = req.body as z.infer<typeof createReadingSchema>;
      const userId    = parseId('company-user', req.user!.sub);

      // Validar que el vehículo existe y es de la empresa
      const [asset] = await db
        .select({ id: companyAssets.id })
        .from(companyAssets)
        .where(and(eq(companyAssets.id, assetId), eq(companyAssets.companyId, companyId)))
        .limit(1);
      if (!asset) throw new NotFoundError('Activo', req.params.assetId);

      // Insertar la lectura
      const [created] = await db
        .insert(companyOdometerReadings)
        .values({
          companyId,
          assetId,
          km:       body.km,
          source:   body.source,
          notes:    body.notes ?? null,
          createdBy: userId,
        })
        .returning();

      await logAudit(db, companyId, {
        entity: 'odometer',
        entityId: toId('odometer', created.id),
        action: 'create',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Lectura de odómetro ${body.km} km para activo ${assetId}.`,
      });

      // Disparar revisión de mantenimientos km_based (sin esperar al cron)
      void sweepKmBasedTriggers(companyId).catch((err) =>
        console.error('[odometer] sweep km_based falló:', err),
      );

      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  },
);

function toId(prefix: string, n: number | string): string {
  return `${prefix}-${n}`;
}

export default router;
