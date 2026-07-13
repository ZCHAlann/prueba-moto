import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { requirePlatform } from '../../middlewares/requirePlatform';
import {
  rateLimitPlatform,
  rateLimitRead,
  rateLimitWrite,
  writeOnly,
  readOnly,
} from '../../middlewares/rateLimit';
import { db } from '../../db/client';
import { companies, companyUsers, companyUserCounts, companyEnabledModules, platformPlanModules, platformModules, platformPlans } from '../../db/schema/platform';
import { eq, inArray, sql } from 'drizzle-orm';
import { toId } from '../../lib/ids';
import companiesRouter from './companies';
import usersRouter     from './users';
import plansRouter     from './plans';
import modulesRouter   from './modules';
import statsRouter     from './stats';
import auditRouter from './audit';
import settingsRouter      from './settings';
import platformUsersRouter from './platform-users';
import fleetHealthRouter from './fleet-health';
import ticketRouter from './ticket'
import companiesAiRouter from './companies-ai';

const router = Router();

// Rate-limit plataforma: superadmins son usuarios sensibles.
// 200 / min read + 60 / min write por (user + IP).
router.use(
  authenticate,
  requirePlatform,
  readOnly(rateLimitPlatform),
  writeOnly(rateLimitWrite),
);

// ─── GET /platform/state ─────────────────────────────────────────────────────
// Snapshot inicial que carga el frontend. Devuelve empresas, planes, módulos
// y usuarios globales. Incluye los conteos por rol (company_user_counts)
// para que la UI de creación de usuarios aplique los límites del plan.

router.get('/state', async (req, res, next) => {
  try {
    const allCompanies = await db.select().from(companies).orderBy(companies.name);
    const allUsers     = await db.select().from(companyUsers);

    // Conteos por empresa (poblados por trigger sync_company_user_counts)
    const allCounts = await db.select().from(companyUserCounts);
    const countByCompany = new Map(allCounts.map(c => [c.companyId, c]));

    // Módulos habilitados por empresa (fuente de verdad: tabla puente)
    const companyIds = allCompanies.map(c => c.id);
    const enabledMods = companyIds.length > 0
      ? await db.select().from(companyEnabledModules).where(inArray(companyEnabledModules.companyId, companyIds))
      : [];
    const modsByCompany = new Map<number, string[]>();
    for (const em of enabledMods) {
      const arr = modsByCompany.get(em.companyId) ?? [];
      arr.push(em.moduleId);
      modsByCompany.set(em.companyId, arr);
    }

    // Traer TODOS los planes + sus módulos
    const allPlans = await db.select().from(platformPlans);
    const allPlanModules = await db.select().from(platformPlanModules);
    const planModulesMap = new Map<string, string[]>();
    for (const pm of allPlanModules) {
      const arr = planModulesMap.get(pm.planId) ?? [];
      arr.push(pm.moduleId);
      planModulesMap.set(pm.planId, arr);
    }

    res.json({
      companies: allCompanies.map((c) => ({
        id:             toId('company', c.id),
        name:           c.name,
        slug:           c.slug,
        planId:         c.planId,
        status:         c.status,
        enabledModules: c.enabledModules,
        enabledModulesDetached: modsByCompany.get(c.id) ?? [],   // ← tabla puente
        // Info comercial
        industry:       c.industry,
        country:        c.country,
        city:           c.city,
        contactName:    c.contactName,
        contactEmail:   c.contactEmail,
        contactPhone:   c.contactPhone,
        // Fechas de contrato
        trialEndsAt:      c.trialEndsAt,
        contractStartAt:  c.contractStartAt,
        contractEndAt:    c.contractEndAt,
        createdAt:      c.createdAt,
        updatedAt:      c.updatedAt,
        userCounts:     (() => {
          const cnt = countByCompany.get(c.id);
          return cnt ? {
            total:       cnt.total,
            admins:      cnt.admins,
            supervisors: cnt.supervisors,
            operators:   cnt.operators,
            drivers:     cnt.drivers,
          } : { total: 0, admins: 0, supervisors: 0, operators: 0, drivers: 0 };
        })(),
      })),
      globalUsers: allUsers.map((u) => ({
        id:        toId('company-user', u.id),
        email:     u.email,
        username:  u.username,
        role:      u.role,
        companyId: u.companyId ? toId('company', u.companyId) : null,
        status:    u.status,
        name:      (u.profileData as Record<string, unknown>)?.name  ?? '',
        title:     (u.profileData as Record<string, unknown>)?.title ?? '',
        password:  undefined,
      })),
      plans: allPlans.map(p => ({
        ...p,
        modules: planModulesMap.get(p.id) ?? [],
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── Subrutas ─────────────────────────────────────────────────────────────────

router.use('/companies', companiesRouter);
// jul 2026 v6 — endpoints de IA por empresa (superadmin): ai-settings,
// ai-usage, ai-disable, ai-enable. Se monta en /platform/companies/:id/ai-*
// y NO pisa a companiesRouter (las rutas son distintas).
router.use('/companies', companiesAiRouter);
router.use('/users',     usersRouter);
router.use('/plans',     plansRouter);
router.use('/modules',   modulesRouter);
router.use('/stats',     statsRouter);
router.use('/audit', auditRouter);
router.use('/settings',       settingsRouter);
router.use('/platform-users', platformUsersRouter);
router.use('/fleet-health', fleetHealthRouter);
router.use('/tickets', ticketRouter);


export default router;