import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticate } from '../middlewares/authenticate';
import { requireCompany } from '../middlewares/requireCompany';
import { analyzeOilCheck, getOilChecks } from '../services/oil-check.service';
import { AppError } from '../lib/errors';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(400, 'Solo se aceptan imágenes JPG, PNG, WebP o HEIC.'));
    }
  },
});

// ─── POST /oil-check ──────────────────────────────────────────────────────────
// multipart: photo
// query: assetId, technicianId, companyId

router.post(
  '/',
  authenticate,
  upload.single('photo'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const photo = req.file;
      const { assetId, technicianId, companyId } = req.query as Record<string, string>;

      if (!photo) return next(new AppError(400, 'La foto es requerida.'));
      if (!assetId) return next(new AppError(400, 'assetId es requerido.'));
      if (!technicianId) return next(new AppError(400, 'technicianId es requerido.'));
      if (!companyId) return next(new AppError(400, 'companyId es requerido.'));

      const result = await analyzeOilCheck({ file: photo, assetId, technicianId, companyId });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /oil-check ───────────────────────────────────────────────────────────
// query: companyId (requerido), assetId (opcional)

router.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { companyId, assetId } = req.query as Record<string, string>;

      if (!companyId) return next(new AppError(400, 'companyId es requerido.'));

      const rows = await getOilChecks({ companyId, assetId });
      res.json({ data: rows, total: rows.length });
    } catch (err) {
      next(err);
    }
  },
);

export default router;