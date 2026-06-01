import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { requireCompany } from '../../middlewares/requireCompany';
import settingsRouter from './settings';
import sitesRouter from './sites';
import assetsRouter from './assets';
import driversRouter from './drivers';
import assignmentsRouter from './assignments';
import maintenancesRouter from './maintenances';
import fuelRouter from './fuel';
import alertsRouter from './alerts';
import checklistsRouter from './checklists';
import inventoryRouter from './inventory';
import garagesRouter from './garages';
import acUnitsRouter from './ac-units';
import auditRouter from './audit';
import analyticsRouter from './analytics';
import oilsRouter from './oils';
import oilChangesRouter from './oil-changes';
import vehiculoRouter from './vehiculo';
import profileRouter from './auth.me';
import usersRouter from './user'; 

const router = Router({ mergeParams: true });

// Toda la sección company requiere auth + pertenecer a esa empresa
router.use(authenticate, requireCompany);

router.use('/settings', settingsRouter);
router.use('/sites', sitesRouter);
router.use('/assets', assetsRouter);
router.use('/drivers', driversRouter);
router.use('/assignments', assignmentsRouter);
router.use('/maintenances', maintenancesRouter);
router.use('/fuel', fuelRouter);
router.use('/alerts', alertsRouter);
router.use('/checklists', checklistsRouter);
router.use('/inventory', inventoryRouter);
router.use('/garages', garagesRouter);
router.use('/ac-units', acUnitsRouter);
router.use('/audit', auditRouter);
router.use('/analytics', analyticsRouter);
router.use('/oils', oilsRouter);
router.use('/oil-changes', oilChangesRouter);
router.use('/vehicle-cockpit', vehiculoRouter);
router.use('/auth/me', profileRouter);
router.use('/users', usersRouter);  
export default router;