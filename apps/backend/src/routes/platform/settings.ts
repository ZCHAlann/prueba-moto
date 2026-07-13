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
  platformName:          z.string().min(1).nullish(),
  // Aceptamos `null` además de `undefined` y '' para que el front pueda
  // mandar campos vacíos sin que Zod explote.
  platformUrl:           z.string().url().nullish().or(z.literal('')),
  supportEmail:          z.string().email().nullish().or(z.literal('')),
  defaultTimezone:       z.string().nullish(),
  defaultLanguage:       z.string().nullish(),
  // Seguridad
  passwordMinLength:     z.number().int().min(6).max(32).nullish(),
  passwordRequireUpper:  z.boolean().nullish(),
  passwordRequireNumber: z.boolean().nullish(),
  passwordRequireSymbol: z.boolean().nullish(),
  passwordExpiryDays:    z.number().int().min(0).nullish(),
  sessionExpiryHours:    z.number().int().min(1).max(720).nullish(),
  maxLoginAttempts:      z.number().int().min(1).max(20).nullish(),
  lockoutMinutes:        z.number().int().min(1).max(1440).nullish(),
  // SMTP
  smtpHost:              z.string().nullish(),
  smtpPort:              z.number().int().min(1).max(65535).nullish(),
  smtpUser:              z.string().nullish(),
  smtpPassword:          z.string().nullish(),
  smtpFromAddress:       z.string().email().nullish().or(z.literal('')),
  smtpFromName:          z.string().nullish(),
  // Notificaciones
  notifyOnNewCompany:    z.boolean().nullish(),
  notifyOnTrialExpiring: z.boolean().nullish(),
  notifyOnLoginFailure:  z.boolean().nullish(),
  // Defaults empresas
  defaultTrialDays:      z.number().int().min(0).nullish(),
  defaultMaxUsers:       z.number().int().min(1).nullish(),
  defaultMaxAssets:      z.number().int().min(1).nullish(),
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

    // jul 2026 — `req.user.sub` viene prefijado (ej: "user-5",
    // "superadmin-1"). `Number("user-5")` da NaN y rompe el UPDATE.
    // Extraemos el sufijo numérico igual que en el resto del backend
    // (ver `getUserIdFromSub` en routes/company/maintenances.ts).
    const sub = req.user!.sub;
    const subMatch = sub ? String(sub).match(/(\d+)$/) : null;
    const updatedBy = subMatch ? Number(subMatch[1]) : null;

    const [updated] = await db
      .update(platformSettings)
      .set({ ...data, updatedAt: new Date(), updatedBy })
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