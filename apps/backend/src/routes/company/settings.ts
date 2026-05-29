import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { companySettings } from '../../db/schema/operational';
import { validate } from '../../lib/validate';
import { requireModule } from '../../middlewares/requireModule';
import { requireAdmin } from '../../middlewares/requireAdmin';
import { logAudit } from '../../lib/audit';
import { toId } from '../../lib/ids';

const router = Router({ mergeParams: true });

type AlertConfig = { id: string; label: string; description: string; enabled: boolean };

// ─── Schema ───────────────────────────────────────────────────────────────────

const updateSettingsSchema = z.object({
  maintenanceLeadTimeDays: z.number().int().min(0).optional(),
  checklistRequired:       z.boolean().optional(),
  fuelCurrency:            z.string().max(10).optional(),
  alertEmail:              z.string().email().nullable().optional(),
  alertConfigs:            z.array(z.object({
    id:          z.string(),
    label:       z.string(),
    description: z.string(),
    enabled:     z.boolean(),
  })).optional(),
});

// ─── GET /company/:id/settings ───────────────────────────────────────────────

router.get('/', requireModule('configuracion'), async (req, res, next) => {
  try {
    const companyId = req.companyId!;

    const rows = await db
      .select()
      .from(companySettings)
      .where(eq(companySettings.companyId, companyId))
      .limit(1);

    // Si no existe aún, devolver defaults
    if (!rows.length) {
      return res.json({
        companyId: toId('company', companyId),
        maintenanceLeadTimeDays: 7,
        checklistRequired: true,
        fuelCurrency: 'USD',
        alertEmail: null,
        alertConfigs: [], 
        updatedAt: null,
      });
    }

    res.json(serializeSettings(rows[0], companyId));
  } catch (err) {
    next(err);
  }
});

// ─── PUT /company/:id/settings ────────────────────────────────────────────────

router.put(
  '/',
  requireModule('configuracion'),
  requireAdmin,
  validate(updateSettingsSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const body = req.body as z.infer<typeof updateSettingsSchema>;

      // Upsert: insert si no existe, update si ya existe
      const existing = await db
        .select()
        .from(companySettings)
        .where(eq(companySettings.companyId, companyId))
        .limit(1);

      let result;
      if (!existing.length) {
        [result] = await db
          .insert(companySettings)
          .values({ companyId, ...body, updatedAt: new Date() })
          .returning();
      } else {
        [result] = await db
          .update(companySettings)
          .set({ ...body, updatedAt: new Date() })
          .where(eq(companySettings.companyId, companyId))
          .returning();
      }

      await logAudit(db, companyId, {
        entity: 'company_settings',
        entityId: toId('company', companyId),
        action: 'update',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Configuración de empresa actualizada.`,
        metadata: body,
      });

      res.json(serializeSettings(result, companyId));
    } catch (err) {
      next(err);
    }
  }
);

// ─── Serializer ───────────────────────────────────────────────────────────────

function serializeSettings(s: typeof companySettings.$inferSelect, companyId: number) {
  return {
    companyId:               toId('company', companyId),
    maintenanceLeadTimeDays: s.maintenanceLeadTimeDays,
    checklistRequired:       s.checklistRequired,
    fuelCurrency:            s.fuelCurrency,
    alertEmail:              s.alertEmail,
    alertConfigs:            (s.alertConfigs as AlertConfig[] | null) ?? [],  // ← esto
    updatedAt:               s.updatedAt,
  };
}

export default router;