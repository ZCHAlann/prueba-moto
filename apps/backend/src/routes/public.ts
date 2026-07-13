// src/routes/public.ts
//
// Endpoints públicos (sin autenticación) usados por la landing page:
//   - GET /public/plans       → 4 planes con features y módulos
//   - GET /public/config      → settings del sitio (brand, contacto, etc.)
//
// No exponemos datos sensibles: solo marketing + funcionalidades resumidas.

import { Router } from 'express';
import { eq, and, asc } from 'drizzle-orm';
import { db } from '../db/client';
import {
  platformPlans,
  platformModules,
  platformPlanModules,
} from '../db/schema/platform';
import { platformSettings } from '../db/schema/platform';
import { rateLimitPublic } from '../middlewares/rateLimit';

const router = Router();

// Rate-limit público: sin auth, key por IP. Suficiente para que la
// landing no sea scrapable de forma masiva. 120 / min.
router.use(rateLimitPublic);

const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// GET /public/plans
// Devuelve los 4 planes (starter/pro/business/enterprise) con bullets y
// módulos habilitados en formato resumido para la landing.
router.get('/plans', async (_req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(platformPlans)
      .where(and(eq(platformPlans.isActive, true)))
      .orderBy(asc(platformPlans.sortOrder));

    // Traer todas las relaciones plan→módulo para esos planes
    const planIds = rows.map(p => p.id);
    const allMods = planIds.length > 0
      ? await db
          .select({ planId: platformPlanModules.planId, moduleId: platformPlanModules.moduleId })
          .from(platformPlanModules)
      : [];

    // Traer labels de los módulos
    const moduleIds = Array.from(new Set(allMods.map(m => m.moduleId)));
    const moduleLabels = moduleIds.length > 0
      ? await db
          .select({ id: platformModules.id, label: platformModules.label, icon: platformModules.icon, accent: platformModules.accent })
          .from(platformModules)
          .where(eq(platformModules.isActive, true))
      : [];

    const labelById = new Map(moduleLabels.map(m => [m.id, m]));

    res.json({
      data: rows.map(p => ({
        id:             slugify(p.id),
        slug:           p.id,
        name:           p.name,
        tier:           p.tier,
        description:    p.description ?? '',
        monthlyPrice:   p.monthlyPrice,
        annualPrice:    p.annualPrice,
        currency:       p.currency,
        features:       (p.features as unknown as string[]) ?? [],
        isPopular:      p.isPopular,
        sortOrder:      p.sortOrder,
        maxUsers:       p.maxUsers,
        maxAdmins:      p.maxAdmins,
        maxSupervisors: p.maxSupervisors,
        maxOperators:   p.maxOperators,
        maxDrivers:     p.maxDrivers,
        maxAssets:      p.maxAssets,
        modules:        allMods
          .filter(m => m.planId === p.id)
          .map(m => ({
            id:     m.moduleId,
            label:  labelById.get(m.moduleId)?.label ?? m.moduleId,
            icon:   labelById.get(m.moduleId)?.icon  ?? null,
            accent: labelById.get(m.moduleId)?.accent ?? null,
          })),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /public/config
// Settings públicos del sitio (brand, tagline, contacto).
router.get('/config', async (_req, res, next) => {
  try {
    const [row] = await db
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.id, 1))
      .limit(1);

    if (!row) {
      // Defaults razonables si todavía no se sembró settings
      return res.json({
        data: {
          platformName: 'ApliSmart Motors',
          platformUrl:  null,
          supportEmail: 'ventas@aplismartmotors.app',
          defaultTimezone: 'America/Guayaquil',
          defaultLanguage: 'es',
        },
      });
    }

    res.json({
      data: {
        platformName:    row.platformName,
        platformUrl:     row.platformUrl,
        supportEmail:    row.supportEmail,
        supportPhone:    null,
        brandTagline:    'Control de flota y equipos motorizados',
        defaultTimezone: row.defaultTimezone,
        defaultLanguage: row.defaultLanguage,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
