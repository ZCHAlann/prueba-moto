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
import financeInvoicesRouter from './finance-invoices';
import financeInvoiceTypesRouter from './finance-invoice-types';
import financePettyCashRouter from './finance-petty-cash';
import financeInvoiceReviewsRouter from './finance-invoice-reviews';

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

// ── finanzas: ledger de facturas ─────────────────────────────────────────────
// jul 2026 — endpoints de lectura (listado, GET individual, PATCH notes)
// del módulo Finanzas. Las escrituras se hacen desde fuel/toll/maintenances
// vía lib/invoices-sync — esta ruta solo expone el ledger.
router.use('/finance-invoices', financeInvoicesRouter);

// ── finanzas: tipos de comprobante configurables (CxP) ───────────────────────
// jul 2026 — CRUD del catálogo `company_invoice_types`. Vive en el mismo
// módulo "finanzas" para mantener todo el dominio agrupado, pero su URL
// es independiente porque la entidad no es un invoice.
router.use('/finance-invoice-types', financeInvoiceTypesRouter);

// ── finanzas: caja chica + transacciones (jul 2026 v4) ───────────────────────
//
// Submódulo nuevo: solicitudes de gasto, vales, historial de movimientos y
// gastos anuales con recurrencia. Cubre los flujos:
//   - Operador pide recurso (POST /finance/requests)
//   - Aprobador clasifica como petty_cash o annual_expense y aprueba (PATCH /review)
//   - Operador cierra vale subiendo factura (PATCH /vouchers/:id/close)
//   - Admin_empresa / owner rellenan la caja (POST /finance/petty-cash/replenish)
//   - Lectura del historial en /finance/transactions (con export PDF)
router.use('/finance', financePettyCashRouter);

// ── finanzas: revisión contable de facturas de caja chica (jul 2026 v5) ─────
//
// Sistema de semáforo + checklist para que el equipo contable apruebe las
// facturas de vales de repuestos antes de aceptarlas. Solo aplica a
// vales con purpose='repuesto'. Los vales de 'otro' quedan como
// not_required (no entran al flujo).
//   - GET    /finance/invoice-reviews?tab=              → listado por estado
//   - GET    /finance/invoice-reviews/:id              → detalle
//   - POST   /finance/invoice-reviews/:id/seen         → revisor abrió la foto
//   - POST   /finance/invoice-reviews/:id/start        → revisor abrió checklist
//   - POST   /finance/invoice-reviews/:id/approve      → aprueba
//   - POST   /finance/invoice-reviews/:id/send-to-correction → corrige + notifica
//   - POST   /finance/invoice-reviews/:id/reupload     → nueva foto
//   - GET    /finance/invoice-reviews/:id/timeline     → eventos
router.use('/finance', financeInvoiceReviewsRouter);


export default router;