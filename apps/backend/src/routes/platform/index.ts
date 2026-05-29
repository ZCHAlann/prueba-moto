import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { requirePlatform } from '../../middlewares/requirePlatform';
import { db } from '../../db/client';
import { companies, companyUsers } from '../../db/schema/platform';
import { toId } from '../../lib/ids';
import companiesRouter from './companies';
import usersRouter from './users';

const router = Router();

router.use(authenticate, requirePlatform);

// ─── GET /platform/state — snapshot que usa el frontend al cargar ─────────────
router.get('/state', async (req, res, next) => {
  try {
    const allCompanies = await db.select().from(companies).orderBy(companies.name);
    const allUsers = await db.select().from(companyUsers);

    res.json({
      companies: allCompanies.map((c) => ({
        id: toId('company', c.id),
        name: c.name,
        slug: c.slug,
        planId: c.planId,
        status: c.status,
        enabledModules: c.enabledModules,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      globalUsers: allUsers.map((u) => ({
        id: toId('company-user', u.id),
        name: u.name,
        email: u.email,
        username: u.username,
        role: u.role,
        companyId: u.companyId ? toId('company', u.companyId) : null,
        status: u.status,
        title: (u.profileData as Record<string, unknown>)?.title ?? '',
        password: undefined,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.use('/companies', companiesRouter);
router.use('/users', usersRouter);

export default router;