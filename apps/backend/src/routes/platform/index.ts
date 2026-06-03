import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { requirePlatform } from '../../middlewares/requirePlatform';
import { db } from '../../db/client';
import { companies, companyUsers } from '../../db/schema/platform';
import { toId } from '../../lib/ids';
import companiesRouter from './companies';
import usersRouter     from './users';
import plansRouter     from './plans';
import leadsRouter     from './leads';
import statsRouter     from './stats';
import auditRouter from './audit';
import settingsRouter      from './settings';
import platformUsersRouter from './platform-users';
import crmRouter from './crm';
import billingRouter from './billing';
import fleetHealthRouter from './fleet-health';
import ticketRouter from './ticket'

const router = Router();

router.use(authenticate, requirePlatform);

// ─── GET /platform/state ─────────────────────────────────────────────────────
// Snapshot inicial que carga el frontend. Devuelve empresas y usuarios globales.

router.get('/state', async (req, res, next) => {
  try {
    const allCompanies = await db.select().from(companies).orderBy(companies.name);
    const allUsers     = await db.select().from(companyUsers);

    res.json({
      companies: allCompanies.map((c) => ({
        id:             toId('company', c.id),
        name:           c.name,
        slug:           c.slug,
        planId:         c.planId,
        status:         c.status,
        enabledModules: c.enabledModules,
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
      })),
      globalUsers: allUsers.map((u) => ({
        id:        toId('company-user', u.id),
        email:     u.email,
        username:  u.username,
        role:      u.role,
        companyId: u.companyId ? toId('company', u.companyId) : null,
        status:    u.status,
        // name y title viven en profileData
        name:      (u.profileData as Record<string, unknown>)?.name  ?? '',
        title:     (u.profileData as Record<string, unknown>)?.title ?? '',
        password:  undefined,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── Subrutas ─────────────────────────────────────────────────────────────────

router.use('/companies', companiesRouter);
router.use('/users',     usersRouter);
router.use('/plans',     plansRouter);
router.use('/leads',     leadsRouter);
router.use('/stats',     statsRouter);
router.use('/audit', auditRouter);
router.use('/settings',       settingsRouter);
router.use('/platform-users', platformUsersRouter);
router.use('/crm', crmRouter);
router.use('/billing', billingRouter);
router.use('/fleet-health', fleetHealthRouter);
router.use('/tickets', ticketRouter);


export default router;