import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { extname, join } from 'path';
import { AppError } from '../lib/errors';
import ffmpeg from 'fluent-ffmpeg';
import { promises as fs } from 'fs';

const router = Router();

const UPLOAD_BASE = process.env.UPLOAD_DIR ?? join(process.cwd(), '..', '..', 'uploads');
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 MB
const MAX_VIDEO_SIZE = 25 * 1024 * 1024; // 25 MB (cliente ya comprimió)
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const ALLOWED_VIDEO_MIME = ['video/mp4', 'video/webm', 'video/quicktime'];

const ALLOWED_CATEGORIES = [
  'maintenance',
  'ac',
  'users',
  'drivers',
  'assignments',
  'assets',
  'general',
  'handover-pdfs',
  'checklists',
  'exit-auth',
  'exit-auth-video',
  'fuel',
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

function videoFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) {
  if (ALLOWED_VIDEO_MIME.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError(400, `Tipo de video no permitido: ${file.mimetype}`));
  }
}

function buildUpload(category: UploadCategory) {
  return multer({
    storage: buildStorage(category),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: imageFilter,
  }).array('photos', 10);
}

function buildVideoUpload(category: UploadCategory) {
  return multer({
    storage: buildStorage(category),
    limits: { fileSize: MAX_VIDEO_SIZE },
    fileFilter: videoFilter,
  }).single('video');
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

function videoUploadHandler(category: UploadCategory) {
  const upload = buildVideoUpload(category);
  return (req: Request, res: Response, next: NextFunction) => {
    upload(req, res, (err) => {
      if (err) return next(err);
      const file = req.file as Express.Multer.File | undefined;
      if (!file) return next(new AppError(400, 'No se recibió el video.'));
      const companyId = req.query.companyId as string | undefined;
      const folder = companyId ? `${category}/${companyId}` : category;
      res.json({
        url:  `/uploads/${folder}/${file.filename}`,
        type: file.mimetype,
        name: file.originalname,
        size: file.size,
      });
    });
  };
}



// ─── Routes ───────────────────────────────────────────────────────────────────

router.post('/asset-photos', uploadHandler('assets'));
router.post('/maintenance-photos', uploadHandler('maintenance'));
router.post('/assignment-photos', uploadHandler('assignments'));
router.post('/ac-photos', uploadHandler('ac'));

router.post('/driver-photos', (req: Request, res: Response, next: NextFunction) => {
  const companyId = req.query.companyId as string | undefined;
  const folder = companyId ? `drivers/${companyId}` : 'drivers';

  const upload = multer({
    storage: buildStorage(folder),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: imageFilter,
  }).array('photos', 10);

  upload(req, res, (err) => {
    if (err) return next(err);
    const files = req.files as Express.Multer.File[];
    if (!files?.length) return next(new AppError(400, 'No se recibieron archivos.'));
    res.json({ urls: files.map((f) => `/uploads/${folder}/${f.filename}`) });
  });
});

router.post('/user-photos', (req: Request, res: Response, next: NextFunction) => {
  const companyId = req.query.companyId as string | undefined;
  const folder = companyId ? `users/${companyId}` : 'users';

  const upload = multer({
    storage: buildStorage(folder),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: imageFilter,
  }).array('photos', 10);

  upload(req, res, (err) => {
    if (err) return next(err);
    const files = req.files as Express.Multer.File[];
    if (!files?.length) return next(new AppError(400, 'No se recibieron archivos.'));
    res.json({ urls: files.map((f) => `/uploads/${folder}/${f.filename}`) });
  });
});

// ─── Evidencias de autorización de salida (fotos + video) ──────────────────
// El cliente ya comprime las imágenes a ~JPEG quality 0.8 y el video a 720p
// antes de subirlos. Aquí sólo guardamos y devolvemos las URLs públicas.
router.post('/exit-auth-photos', (req: Request, res: Response, next: NextFunction) => {
  const companyId = req.query.companyId as string | undefined;
  const folder = companyId ? `exit-auth/${companyId}` : 'exit-auth';

  const upload = multer({
    storage: buildStorage(folder),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: imageFilter,
  }).array('photos', 10);

  upload(req, res, (err) => {
    if (err) return next(err);
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0)
      return next(new AppError(400, 'No se recibieron archivos.'));
    res.json({ urls: files.map((f) => `/uploads/${folder}/${f.filename}`) });
  });
});

router.post('/exit-auth-video', (req: Request, res: Response, next: NextFunction) => {
  const companyId = req.query.companyId as string | undefined;
  const folder = companyId ? `exit-auth-video/${companyId}` : 'exit-auth-video';

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        const dir = join(UPLOAD_BASE, folder);
        ensureDir(dir);
        cb(null, dir);
      },
      filename: (_req, file, cb) => {
        const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        cb(null, `tmp_${unique}${extname(file.originalname).toLowerCase() || '.mp4'}`);
      },
    }),
    limits: { fileSize: MAX_VIDEO_SIZE },
    fileFilter: videoFilter,
  }).single('video');

  upload(req, res, async (err) => {
    if (err) return next(err);
    const file = req.file as Express.Multer.File | undefined;
    if (!file) return next(new AppError(400, 'No se recibió el video.'));

    const inputPath  = file.path;
    const outputName = file.filename.replace('tmp_', '') .replace(/\.[^.]+$/, '.mp4');
    const outputPath = join(UPLOAD_BASE, folder, outputName);

    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .outputOptions([
            '-vcodec libx264',
            '-crf 28',          // calidad: 18=alta, 28=media, 35=baja — sube este para más compresión
            '-preset ultrafast', // ultrafast = más rápido, menos compresión; slow = más compresión
            '-vf scale=720:-2',  // 720p, mantiene aspect ratio
            '-movflags +faststart',
            '-an',               // sin audio (bayoneta no necesita audio)
          ])
          .output(outputPath)
          .on('end', () => resolve())
          .on('error', (e) => reject(e))
          .run();
      });

      // Eliminar el archivo temporal
      await fs.unlink(inputPath).catch(() => {});

      res.json({
        url:  `/uploads/${folder}/${outputName}`,
        type: 'video/mp4',
        name: outputName,
        size: (await fs.stat(outputPath)).size,
      });
    } catch (ffmpegErr) {
      // Si ffmpeg falla, devolver el original sin comprimir
      console.error('[upload] ffmpeg error, serving original:', ffmpegErr);
      await fs.rename(inputPath, outputPath.replace('.mp4', extname(file.originalname))).catch(() => {});
      res.json({
        url:  `/uploads/${folder}/${file.filename.replace('tmp_', '')}`,
        type: file.mimetype,
        name: file.originalname,
        size: file.size,
      });
    }
  });
});

// ─── Evidencias de carga de combustible (foto del surtidor / factura) ──────────
router.post('/fuel-photos', (req: Request, res: Response, next: NextFunction) => {
  const companyId = req.query.companyId as string | undefined;
  const folder = companyId ? `fuel/${companyId}` : 'fuel';

  const upload = multer({
    storage: buildStorage(folder),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: imageFilter,
  }).array('photos', 10);  

  upload(req, res, (err) => {
    if (err) return next(err);
    const files = req.files as Express.Multer.File[];
    if (!files?.length) return next(new AppError(400, 'No se recibió el archivo.'));
    res.json({ urls: files.map((f) => `/uploads/${folder}/${f.filename}`) });
  });
});

// ─── Evidencias de checklist (un archivo por item, usado al marcar "Incorrecto") ──
router.post('/checklist-photos', (req: Request, res: Response, next: NextFunction) => {
  const companyId = req.query.companyId as string | undefined;
  const folder = companyId ? `checklists/${companyId}` : 'checklists';

  const upload = multer({
    storage: buildStorage(folder),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(new AppError(400, 'Solo imágenes (JPG/PNG/WebP/HEIC).'));
    },
  }).single('photo');

  upload(req, res, (err) => {
    if (err) return next(err);
    const file = req.file as Express.Multer.File | undefined;
    if (!file) return next(new AppError(400, 'No se recibió la foto.'));
    res.json({
      url:  `/uploads/${folder}/${file.filename}`,
      type: file.mimetype,
      name: file.originalname,
      size: file.size,
    });
  });
});

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

// ─── Evidencias de mantenimiento (imágenes + PDF, hasta 10 archivos) ────────
router.post('/maintenance-evidence', (req, res, next) => {
  const companyId = req.query.companyId as string | undefined;
  const folder = companyId ? `maintenance/${companyId}` : 'maintenance';
  const upload = multer({
    storage: buildStorage(folder),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(new AppError(400, 'Solo imágenes o PDF.'));
    },
  }).array('files', 10);

  upload(req, res, (err) => {
    if (err) return next(err);
    const files = req.files as Express.Multer.File[];
    if (!files?.length) return next(new AppError(400, 'No se recibieron archivos.'));
    res.json({
      urls: files.map(f => ({
        url: `/uploads/${folder}/${f.filename}`,
        type: f.mimetype,
        name: f.originalname,
      })),
    });
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