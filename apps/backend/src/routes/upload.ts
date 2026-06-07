import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { extname, join } from 'path';
import { AppError } from '../lib/errors';

const router = Router();

const UPLOAD_BASE = process.env.UPLOAD_DIR ?? join(process.cwd(), '..', '..', 'uploads');
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 MB
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

const ALLOWED_CATEGORIES = [
  'maintenance',
  'ac',
  'users',
  'drivers',
  'assignments',
  'assets',
  'general',
  'handover-pdfs',
] as const;

type UploadCategory = (typeof ALLOWED_CATEGORIES)[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function buildStorage(folder: string) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = join(UPLOAD_BASE, folder);
      ensureDir(dir);
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const ext = extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${unique}${ext}`);
    },
  });
}

function imageFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) {
  if (ALLOWED_MIME.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError(400, `Tipo de archivo no permitido: ${file.mimetype}`));
  }
}

function buildUpload(category: UploadCategory) {
  return multer({
    storage: buildStorage(category),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: imageFilter,
  }).array('photos', 10);
}

function resolveUrls(
  files: Express.Multer.File[],
  category: UploadCategory,
  companyId?: string,
): string[] {
  const folder = companyId ? `${category}/${companyId}` : category;
  return files.map((f) => `/uploads/${folder}/${f.filename}`);
}

function uploadHandler(category: UploadCategory) {
  const upload = buildUpload(category);
  return (req: Request, res: Response, next: NextFunction) => {
    upload(req, res, (err) => {
      if (err) return next(err);
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return next(new AppError(400, 'No se recibieron archivos.'));
      }
      const companyId = req.query.companyId as string | undefined;
      res.json({ urls: resolveUrls(files, category, companyId) });
    });
  };
}



// ─── Routes ───────────────────────────────────────────────────────────────────

router.post('/asset-photos', uploadHandler('assets'));
router.post('/maintenance-photos', uploadHandler('maintenance'));
router.post('/driver-photos', uploadHandler('drivers'));
router.post('/assignment-photos', uploadHandler('assignments'));
router.post('/ac-photos', uploadHandler('ac'));
router.post('/user-photos', uploadHandler('users'));

// PDF actas de entrega
router.post('/handover-pdf', (req: Request, res: Response, next: NextFunction) => {
  const companyId = req.query.companyId as string | undefined;
  const folder = companyId ? `handover-pdfs/${companyId}` : 'handover-pdfs'; 

  const upload = multer({
    storage: buildStorage(folder),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === 'application/pdf') cb(null, true);
      else cb(new AppError(400, 'Solo se aceptan PDFs aquí.'));
    },
  }).single('pdf');

  upload(req, res, (err) => {
    if (err) return next(err);
    const file = req.file;
    if (!file) return next(new AppError(400, 'No se recibió el PDF.'));
    res.json({ url: `/uploads/${folder}/${file.filename}` });
  });
});

router.post('/invoice-files', (req, res, next) => {
  const folder = 'invoices';
  const upload = multer({
    storage: buildStorage(folder),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(new AppError(400, 'Solo imágenes o PDF.'));
    },
  }).array('files', 5);

  upload(req, res, (err) => {
    if (err) return next(err);
    const files = req.files as Express.Multer.File[];
    if (!files?.length) return next(new AppError(400, 'No se recibieron archivos.'));
    const companyId = req.query.companyId as string | undefined;
    const folder2 = companyId ? `invoices/${companyId}` : 'invoices';
    res.json({ urls: files.map(f => `/uploads/${folder2}/${f.filename}`) });
  });
});

router.post('/insurance-files', (req, res, next) => {
  const companyId = req.query.companyId as string | undefined;
  const folder = companyId ? `insurance/${companyId}` : 'insurance';

  const upload = multer({
    storage: buildStorage(folder),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(new AppError(400, 'Solo imágenes o PDF.'));
    },
  }).single('file');

  upload(req, res, (err) => {
    if (err) return next(err);
    if (!req.file) return next(new AppError(400, 'No se recibió archivo.'));
    res.json({ url: `/uploads/${folder}/${req.file.filename}` });
  });
});

// Genérico
router.post('/photos', (req: Request, res: Response, next: NextFunction) => {
  const category = req.query.category as string;
  const safeCategory: UploadCategory = (ALLOWED_CATEGORIES as readonly string[]).includes(category)
    ? (category as UploadCategory)
    : 'general';

  const upload = buildUpload(safeCategory);
  upload(req, res, (err) => {
    if (err) return next(err);
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return next(new AppError(400, 'No se recibieron archivos.'));
    }
    const companyId = req.query.companyId as string | undefined;
    res.json({ urls: resolveUrls(files, safeCategory, companyId) });
  });
});

// Eliminar archivo
router.delete('/file', (req: Request, res: Response, next: NextFunction) => {
  const filePath = req.query.path as string;

  if (!filePath || !filePath.startsWith('/uploads/')) {
    return next(new AppError(400, 'Ruta de archivo no válida.'));
  }

  const absolutePath = join(UPLOAD_BASE, filePath.replace('/uploads/', ''));

  try {
    if (existsSync(absolutePath)) unlinkSync(absolutePath);
    res.json({ ok: true });
  } catch {
    res.json({ ok: false });
  }
});

export default router;