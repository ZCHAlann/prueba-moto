import { Router, Request, Response, NextFunction } from 'express'; 
import { z } from 'zod';
import { AppError } from '../../lib/errors';
import { requireSupervisor } from '../../middlewares/requireSupervisor';
import { validate } from '../../lib/validate';
import { safeString, validators } from '../../lib/validators';
import {
  getVehicleCockpit,
  getVehicleLocation,
  updateAssetStatus,
  toggleEngine,
  toggleLock,
  getDailyUsage,
  getStatsFuel,
  getStatsMaintenances,
  getStatsOdometer,
  getStatsCosts,
  listAssetRoutes,
  createAssetRoute,
  listAssetNotes,
  createAssetNote,
  deleteAssetNote,
} from '../../services/vehiculo.service';

const router = Router();

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const handle = (fn: any) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    const out = await fn(req);
    res.json(out);
  } catch (err) {
    next(err);
  }
};

function getCompanyId(req: Request): string {
  if (!req.companyId) throw new AppError(400, 'companyId requerido');
  return `company-${req.companyId}`;
}

function toFiniteNumber(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// ═══════════════════════════════════════════════
//  COCKPIT
// ═══════════════════════════════════════════════

// GET /:assetId  — cockpit completo
router.get('/:assetId', handle(async (req: Request) => {
  const assetId   = String(req.params.assetId);
  const companyId = getCompanyId(req);
  return getVehicleCockpit(assetId, companyId);
}));

// ═══════════════════════════════════════════════
//  CONTROLES EN TIEMPO REAL
// ═══════════════════════════════════════════════

// GET /:assetId/location  — posición GPS actual
router.get('/:assetId/location', handle(async (req: Request) => {
  const assetId   = String(req.params.assetId);
  const companyId = getCompanyId(req);
  return getVehicleLocation(assetId, companyId);
}));

// PATCH /:assetId/status  — cambiar status del activo
const statusSchema = z.object({
  status: z.enum(['Operativo', 'Fuera de servicio', 'En mantenimiento']),
});
router.patch('/:assetId/status', requireSupervisor, validate(statusSchema), handle(async (req: Request) => {
  const assetId   = String(req.params.assetId);
  const companyId = getCompanyId(req);
  const { status } = req.body;
  return updateAssetStatus(assetId, companyId, status);
}));

// POST /:assetId/engine-toggle  — alterna motor
router.post('/:assetId/engine-toggle', requireSupervisor, handle(async (req: Request) => {
  const assetId   = String(req.params.assetId);
  const companyId = getCompanyId(req);
  return toggleEngine(assetId, companyId);
}));

// POST /:assetId/lock-toggle  — alterna bloqueo
router.post('/:assetId/lock-toggle', requireSupervisor, handle(async (req: Request) => {
  const assetId   = String(req.params.assetId);
  const companyId = getCompanyId(req);
  return toggleLock(assetId, companyId);
}));

// ═══════════════════════════════════════════════
//  USO DIARIO
// ═══════════════════════════════════════════════

// GET /:assetId/daily-usage?date=YYYY-MM-DD
router.get('/:assetId/daily-usage', handle(async (req: Request) => {
  const assetId   = String(req.params.assetId);
  const companyId = getCompanyId(req);
  const dateIso   = String(req.query.date ?? new Date().toISOString().slice(0, 10));
  return getDailyUsage(assetId, companyId, dateIso);
}));

// ═══════════════════════════════════════════════
//  ESTADÍSTICAS (12 meses atrás)
// ═══════════════════════════════════════════════

router.get('/:assetId/stats/fuel', handle(async (req: Request) => {
  const assetId   = String(req.params.assetId);
  const companyId = getCompanyId(req);
  return getStatsFuel(assetId, companyId);
}));

router.get('/:assetId/stats/maintenances', handle(async (req: Request) => {
  const assetId   = String(req.params.assetId);
  const companyId = getCompanyId(req);
  return getStatsMaintenances(assetId, companyId);
}));

router.get('/:assetId/stats/odometer', handle(async (req: Request) => {
  const assetId   = String(req.params.assetId);
  const companyId = getCompanyId(req);
  return getStatsOdometer(assetId, companyId);
}));

router.get('/:assetId/stats/costs', handle(async (req: Request) => {
  const assetId   = String(req.params.assetId);
  const companyId = getCompanyId(req);
  return getStatsCosts(assetId, companyId);
}));

// ═══════════════════════════════════════════════
//  RUTAS
// ═══════════════════════════════════════════════

router.get('/:assetId/routes', handle(async (req: Request) => {
  const assetId   = String(req.params.assetId);
  const companyId = getCompanyId(req);
  return listAssetRoutes(assetId, companyId);
}));

router.post('/:assetId/routes', validate(z.object({
  date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)'),
  origin:      safeString({ max: 200, fieldLabel: 'Origen', allowEmpty: true }).nullable().optional(),
  destination: safeString({ max: 200, fieldLabel: 'Destino', allowEmpty: true }).nullable().optional(),
  distanceKm:  z.union([z.string(), z.number()]).optional().nullable().transform(toFiniteNumber),
  durationMin: z.union([z.string(), z.number()]).optional().nullable().transform(toFiniteNumber),
  coordinates: z.unknown().optional(),
  driverId:    z.union([z.string(), z.number()]).optional().nullable().transform(toFiniteNumber),
  notes:       validators.longTextOptional,
})), handle(async (req: Request) => {
  const assetId   = String(req.params.assetId);
  const companyId = getCompanyId(req);
  const b = req.body;
  return createAssetRoute(assetId, companyId, b);
}));

// ═══════════════════════════════════════════════
//  NOTAS
// ═══════════════════════════════════════════════

router.get('/:assetId/notes', handle(async (req: Request) => {
  const assetId   = String(req.params.assetId);
  const companyId = getCompanyId(req);
  const limit  = req.query.limit  != null ? Math.max(1, Math.min(200, Number(req.query.limit)))  : 50;
  const offset = req.query.offset != null ? Math.max(0, Number(req.query.offset)) : 0;
  return listAssetNotes(assetId, companyId, { limit, offset });
}));

router.post('/:assetId/notes', validate(z.object({
  body: safeString({ min: 1, max: 2000, fieldLabel: 'Nota', allowEmpty: false }),
})), handle(async (req: Request) => {
  const assetId   = String(req.params.assetId);
  const companyId = getCompanyId(req);
  const { body }  = req.body;

  const user = (req as any).user ?? {};
  return createAssetNote(assetId, companyId, {
    id:   user.id   ?? user.userId ?? null,
    name: user.name ?? user.fullName ?? user.email ?? null,
  }, body);
}));

router.delete('/:assetId/notes/:noteId', handle(async (req: Request) => {
  const assetId   = String(req.params.assetId);
  const companyId = getCompanyId(req);
  const noteId    = Number(req.params.noteId);
  if (!Number.isFinite(noteId) || noteId <= 0) {
    throw new AppError(400, 'noteId inválido');
  }

  const user = (req as any).user ?? {};
  const userId   = user.id   ?? user.userId ?? null;
  const userRole = (user.role ?? user.roles ?? '').toString().toLowerCase();
  const isAdmin  = userRole.includes('admin') || userRole.includes('superadmin') || userRole.includes('platform');

  // 1) Borrado atómico; el service devuelve el authorId de la nota
  const result = await deleteAssetNote(assetId, companyId, noteId);

  // 2) Verificar autorización
  if (!isAdmin && result.authorId && userId && result.authorId !== userId) {
    // Re-insertamos la nota si no tenía autor pero el rol no es admin?
    // No: si el autor es null y el rol no es admin, NO dejamos borrar.
    throw new AppError(403, 'No autorizado para borrar esta nota');
  }

  return { ok: true, id: result.id };
}));

export default router;
