import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { requireCompany } from '../../middlewares/requireCompany';
import { requireActiveStatus } from '../../middlewares/requireActiveStatus';
import settingsRouter from './settings';
import sitesRouter from './sites';
import assetsRouter from './assets';
import driversRouter from './drivers';
import assignmentsRouter from './assignments';
import maintenancesRouter from './maintenances';
import fuelRouter from './fuel';
import tollRouter from './toll';
import alertsRouter from './alerts';
import checklistsRouter from './checklists';
import checklistReauthRouter from './checklist-reauth';
import canvasBoardsRouter from './canvas-boards';
import garagesRouter from './garages';
import acUnitsRouter from './ac-units';
import auditRouter from './audit';
import analyticsRouter from './analytics';
import vehiculoRouter from './vehiculo';
import profileRouter from './auth.me';
import usersRouter from './user';
import ticketsRouter from './ticket';
import insurancesRouter from './insurance';
import rolesRouter from './roles';
import exitAuthRouter from './exit-authorizations';
import workshopsRouter from './workshops';
import suppliersRouter from './suppliers';
import odometerRouter from './odometer';
import notificationsRouter from './notifications';
import reportsRouter from './reports';
import estadisticasRouter from './estadisticas';
import jarvisRouter from './jarvis';
import formOptionsRouter from './formOptions';

const router = Router({ mergeParams: true });

// Toda la sección company requiere auth + pertenecer a esa empresa + estar activo.
// requireActiveStatus invalida la sesión en caliente si el usuario/conductor/sede
// quedó inactivo mientras la sesión estaba abierta.
router.use(authenticate, requireCompany, requireActiveStatus);

router.use('/settings', settingsRouter);
router.use('/sites', sitesRouter);
router.use('/assets', assetsRouter);
router.use('/drivers', driversRouter);

// Form-options: endpoints de catálogos que cada módulo necesita para
// sus forms/selectores. NO están bajo ningún sub-router de recurso
// (assets/drivers/etc.) para que el orden de matching no los confunda
// con `/:assetId` o `/:driverId`. Validación: solo authenticate +
// requireCompany + requireActiveStatus (a nivel global del router).
router.use(formOptionsRouter);
router.use('/assignments', assignmentsRouter);
router.use('/maintenances', maintenancesRouter);
router.use('/fuel', fuelRouter);
router.use('/toll', tollRouter);
router.use('/alerts', alertsRouter);
router.use('/checklists', checklistsRouter);
router.use('/checklists', checklistReauthRouter);
router.use('/canvas-boards', canvasBoardsRouter);
router.use('/garages', garagesRouter);
router.use('/ac-units', acUnitsRouter);
router.use('/audit', auditRouter);
router.use('/analytics', analyticsRouter);
router.use('/vehicle-cockpit', vehiculoRouter);
router.use('/auth/me', profileRouter);
router.use('/users', usersRouter);  
router.use('/tickets', ticketsRouter);
router.use('/insurance', insurancesRouter);
router.use('/roles', rolesRouter);
router.use('/exit-authorizations', exitAuthRouter);
router.use('/workshops', workshopsRouter);
router.use('/suppliers', suppliersRouter);
router.use('/odometer', odometerRouter);
router.use('/notifications', notificationsRouter);
router.use('/reports', reportsRouter);
router.use('/estadisticas', estadisticasRouter);
router.use('/ai', jarvisRouter);


export default router;