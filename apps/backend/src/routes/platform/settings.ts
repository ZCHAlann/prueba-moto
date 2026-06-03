import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client';
import { platformSettings } from '../../db/schema/platform';
import { validate } from '../../lib/validate';
import { requireSuperadmin } from '../../middlewares/requireSuperadmin';
import { logAudit } from '../../lib/audit';
import { toId } from '../../lib/ids';
import { invalidateSettingsCache } from '../../services/auth.service';

const router = Router();

const updateSettingsSchema = z.object({
  // General
  platformName:          z.string().min(1).optional(),
  platformUrl:           z.string().url().optional().or(z.literal('')),
  supportEmail:          z.string().email().optional().or(z.literal('')),
  defaultTimezone:       z.string().optional(),
  defaultLanguage:       z.string().optional(),
  // Seguridad
  passwordMinLength:     z.number().int().min(6).max(32).optional(),
  passwordRequireUpper:  z.boolean().optional(),
  passwordRequireNumber: z.boolean().optional(),
  passwordRequireSymbol: z.boolean().optional(),
  passwordExpiryDays:    z.number().int().min(0).optional(),
  sessionExpiryHours:    z.number().int().min(1).max(720).optional(),
  maxLoginAttempts:      z.number().int().min(1).max(20).optional(),
  lockoutMinutes:        z.number().int().min(1).max(1440).optional(),
  // SMTP
  smtpHost:              z.string().optional(),
  smtpPort:              z.number().int().min(1).max(65535).optional(),
  smtpUser:              z.string().optional(),
  smtpPassword:          z.string().optional(),
  smtpFromAddress:       z.string().email().optional().or(z.literal('')),
  smtpFromName:          z.string().optional(),
  // Notificaciones
  notifyOnNewCompany:    z.boolean().optional(),
  notifyOnTrialExpiring: z.boolean().optional(),
  notifyOnLoginFailure:  z.boolean().optional(),
  // Defaults empresas
  defaultTrialDays:      z.number().int().min(0).optional(),
  defaultMaxUsers:       z.number().int().min(1).optional(),
  defaultMaxAssets:      z.number().int().min(1).optional(),
});

// ─── GET /platform/settings ───────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    let [row] = await db
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.id, 1))
      .limit(1);

    // Si no existe aún, la creamos con defaults
    if (!row) {
      [row] = await db
        .insert(platformSettings)
        .values({ id: 1 })
        .returning();
    }

    // Nunca devolver smtpPassword al cliente
    const { smtpPassword: _, ...safe } = row;
    res.json(safe);
  } catch (err) {
    next(err);
  }
});

// ─── PUT /platform/settings ── solo superadmin ────────────────────────────────

router.put('/', requireSuperadmin, validate(updateSettingsSchema), async (req, res, next) => {
  try {
    const data = req.body as z.infer<typeof updateSettingsSchema>;

    const [updated] = await db
      .update(platformSettings)
      .set({ ...data, updatedAt: new Date(), updatedBy: Number(req.user!.sub) })
      .where(eq(platformSettings.id, 1))
      .returning();

    await logAudit(db, null, {
      entity:      'platform_settings',
      entityId:    '1',
      action:      'update',
      actorId:     req.user!.sub,
      actorName:   req.user!.name,
      description: 'Configuración de plataforma actualizada.',
      metadata:    { fields: Object.keys(data) },
    });

    const { smtpPassword: _, ...safe } = updated;
    invalidateSettingsCache();
    res.json(safe);
  } catch (err) {
    next(err);
  }
});

export default router;