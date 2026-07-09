import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { extname, join } from 'path';
import { AppError } from '../lib/errors';
import ffmpeg from 'fluent-ffmpeg';
import { promises as fs } from 'fs';
import { authenticate } from '../middlewares/authenticate';
import {
  validateImageFile,
  validatePdfFile,
  validateUploadCompanyId,
  optimizeImageIfNeeded,
} from '../lib/upload-security';

const router = Router();

// Todas las rutas de upload requieren autenticación. Sin esto, cualquier
// persona con la URL podría subir archivos al bucket de cualquier empresa.
router.use(authenticate);

const UPLOAD_BASE = process.env.UPLOAD_DIR ?? join(process.cwd(), '..', '..', 'uploads');
const MAX_FILE_SIZE = 8 * 1024 * 1024;        // 8 MB  (fotos)
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;       // 50 MB (video completo — celulares graban más)
const MAX_CHUNK_SIZE = 3 * 1024 * 1024;        // 3 MB  (cada chunk individual)
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
// Aceptamos todos los formatos comunes de video de celular.
// IMPORTANTE: iOS graba en .mov (video/quicktime) por defecto al usar capture="environment".
const ALLOWED_VIDEO_MIME = [
  'video/mp4',
  'video/webm',
  'video/quicktime',     // .mov — iOS nativo
  'video/3gpp',           // .3gp — Android viejo
  'video/x-matroska',     // .mkv
  'video/hevc',           // HEVC
  'video/avc',
  '',
]; // el '' cubre celulares que reportan mime vacío

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
  'parts',
  'toll',
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
  // En el celular a veces mimetype viene vacío o como application/octet-stream.
  // También revisamos la extensión como fallback.
  const ext = extname(file.originalname).toLowerCase();
  const allowedExts = ['.mp4', '.mov', '.webm', '.3gp', '.mkv', '.hevc', '.avi', '.m4v'];
  const mimeOk = ALLOWED_VIDEO_MIME.includes(file.mimetype);
  const extOk  = allowedExts.includes(ext);

  if (mimeOk || extOk) {
    cb(null, true);
  } else {
    console.warn('[upload:video] mime/ext rechazados', { mime: file.mimetype, ext, name: file.originalname });
    cb(new AppError(400, `Tipo de video no permitido: ${file.mimetype} (${ext})`));
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
    upload(req, res, async (err) => {
      if (err) return next(err);
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return next(new AppError(400, 'No se recibieron archivos.'));
      }

      // Optimización server-side con sharp: reduce tamaño de las fotos de
      // celular (4-8 MB → 200-400 KB), quita EXIF (privacidad), estandariza
      // a JPEG progresivo. Si falla en alguna foto, NO rompe el upload —
      // esa foto queda como estaba.
      await Promise.allSettled(files.map((f) => optimizeImageIfNeeded(f)));

      const companyId = req.query.companyId as string | undefined;
      res.json({ urls: resolveUrls(files, category, companyId) });
    });
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.post('/asset-photos', uploadHandler('assets'));
router.post('/maintenance-photos', uploadHandler('maintenance'));
router.post('/ac-photos', uploadHandler('ac'));

router.post('/assignment-photos', (req: Request, res: Response, next: NextFunction) => {
  const companyId = req.query.companyId as string | undefined;
  const folder = companyId ? `assignments/${companyId}` : 'assignments';

  const upload = multer({
    storage: buildStorage(folder),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: imageFilter,
  }).any();

  upload(req, res, async (err) => {
    if (err) return next(err);
    const files = req.files as Express.Multer.File[];
    if (!files?.length) return next(new AppError(400, 'No se recibieron archivos.'));
    await Promise.allSettled(files.map((f) => optimizeImageIfNeeded(f)));
    res.json({ urls: files.map((f) => `/uploads/${folder}/${f.filename}`) });
  });
});

router.post('/toll-photos', (req: Request, res: Response, next: NextFunction) => {
  const companyId = req.query.companyId as string | undefined;
  const folder = companyId ? `toll/${companyId}` : 'toll';

  const upload = multer({
    storage: buildStorage(folder),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: imageFilter,
  }).array('photos', 10);

  upload(req, res, async (err) => {
    if (err) return next(err);
    const files = req.files as Express.Multer.File[];
    if (!files?.length) return next(new AppError(400, 'No se recibieron archivos.'));
    await Promise.allSettled(files.map((f) => optimizeImageIfNeeded(f)));
    res.json({ urls: files.map((f) => `/uploads/${folder}/${f.filename}`) });
  });
});


router.post('/driver-photos', (req: Request, res: Response, next: NextFunction) => {
  const companyId = req.query.companyId as string | undefined;
  const folder = companyId ? `drivers/${companyId}` : 'drivers';

  const upload = multer({
    storage: buildStorage(folder),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: imageFilter,
  }).array('photos', 10);

  upload(req, res, async (err) => {
    if (err) return next(err);
    const files = req.files as Express.Multer.File[];
    if (!files?.length) return next(new AppError(400, 'No se recibieron archivos.'));
    await Promise.allSettled(files.map((f) => optimizeImageIfNeeded(f)));
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

  upload(req, res, async (err) => {
    if (err) return next(err);
    const files = req.files as Express.Multer.File[];
    if (!files?.length) return next(new AppError(400, 'No se recibieron archivos.'));
    await Promise.allSettled(files.map((f) => optimizeImageIfNeeded(f)));
    res.json({ urls: files.map((f) => `/uploads/${folder}/${f.filename}`) });
  });
});

// ─── Evidencias de autorización de salida (fotos) ────────────────────────────

router.post('/exit-auth-photos', (req: Request, res: Response, next: NextFunction) => {
  const companyId = req.query.companyId as string | undefined;
  const folder = companyId ? `exit-auth/${companyId}` : 'exit-auth';

  const upload = multer({
    storage: buildStorage(folder),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: imageFilter,
  }).array('photos', 10);

  upload(req, res, async (err) => {
    if (err) return next(err);
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0)
      return next(new AppError(400, 'No se recibieron archivos.'));
    await Promise.allSettled(files.map((f) => optimizeImageIfNeeded(f)));
    res.json({ urls: files.map((f) => `/uploads/${folder}/${f.filename}`) });
  });
});

// ─── Video completo (fallback para videos pequeños / sin soporte chunked) ────

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
    if (err) {
      console.error('[upload:video] multer error:', err.message, { code: err.code });
      return next(err);
    }
    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      console.error('[upload:video] no file received');
      return next(new AppError(400, 'No se recibió el video.'));
    }

    console.log('[upload:video] received', {
      name: file.originalname, mimeType: file.mimetype,
      sizeMB: +(file.size / 1024 / 1024).toFixed(2),
    });

    const inputPath  = file.path;
    const outputName = file.filename.replace('tmp_', '').replace(/\.[^.]+$/, '.mp4');
    const outputPath = join(UPLOAD_BASE, folder, outputName);

    try {
      await reencodeVideo(inputPath, outputPath);
      await fs.unlink(inputPath).catch(() => {});

      const finalSize = (await fs.stat(outputPath)).size;
      console.log('[upload:video] ffmpeg done', { output: outputName, sizeMB: +(finalSize / 1024 / 1024).toFixed(2) });

      res.json({
        url:  `/uploads/${folder}/${outputName}`,
        type: 'video/mp4',
        name: outputName,
        size: finalSize,
      });
    } catch (ffmpegErr) {
      console.error('[upload:video] ffmpeg error, serving original:', ffmpegErr);
      const origExt = extname(file.originalname);
      const origName = file.filename.replace('tmp_', '');
      await fs.rename(inputPath, outputPath.replace('.mp4', origExt)).catch(() => {});
      res.json({
        url:  `/uploads/${folder}/${origName}`,
        type: file.mimetype,
        name: file.originalname,
        size: file.size,
      });
    }
  });
});

// ─── Video chunked ────────────────────────────────────────────────────────────
// El cliente divide el video en trozos de 2 MB y los sube uno a uno.
// Cuando llega el último chunk, se ensamblan y se recodifican con ffmpeg.
//
// Request body (multipart):
//   chunk       — el trozo de archivo
//   uploadId    — UUID único por sesión de upload (generado en el cliente)
//   chunkIndex  — índice base 0
//   totalChunks — total de chunks
//   filename    — nombre original del archivo
//   mimeType    — tipo MIME original
//
// Response:
//   { status: "partial" }                  mientras faltan chunks
//   { status: "done", url: "/uploads/…" }  cuando termina

const chunkUpload = multer({
  storage: multer.memoryStorage(),          // chunks en RAM, son pequeños (2 MB)
  limits: { fileSize: MAX_CHUNK_SIZE },
}).single('chunk');

router.post('/exit-auth-video-chunk', (req: Request, res: Response, next: NextFunction) => {
  chunkUpload(req, res, async (err) => {
    if (err) {
      console.error('[upload:chunk] multer error:', err.message, { code: err.code });
      return next(err);
    }

    const chunk = req.file;
    if (!chunk) return next(new AppError(400, 'No se recibió el chunk.'));

    const { uploadId, chunkIndex, totalChunks, filename, mimeType } =
      req.body as Record<string, string>;

    if (!uploadId || chunkIndex === undefined || !totalChunks) {
      return next(new AppError(400, 'Faltan campos: uploadId, chunkIndex, totalChunks.'));
    }

    const idx   = parseInt(chunkIndex,  10);
    const total = parseInt(totalChunks, 10);

    // Log reducido para no llenar la consola: solo el primer y último chunk.
    if (idx === 0 || idx === total - 1) {
      console.log('[upload:chunk]', {
        uploadId, chunk: `${idx + 1}/${total}`, filename, mimeType,
        sizeMB: +(chunk.size / 1024 / 1024).toFixed(2),
      });
    }

    // Validar uploadId — solo alfanuméricos y guiones para evitar path traversal
    if (!/^[a-zA-Z0-9-]{8,64}$/.test(uploadId)) {
      return next(new AppError(400, 'uploadId inválido.'));
    }

    const companyId = req.query.companyId as string | undefined;

    // Directorio temporal donde se acumulan los chunks de esta sesión
    const tmpDir = join(UPLOAD_BASE, 'tmp-chunks', uploadId);
    ensureDir(tmpDir);

    // Guardar este chunk en disco
    const chunkPath = join(tmpDir, `chunk_${idx}`);
    await fs.writeFile(chunkPath, chunk.buffer);

    // Contar cuántos chunks tenemos ya
    const received = (await fs.readdir(tmpDir)).length;

    if (received < total) {
      // Todavía faltan chunks
      return res.json({ status: 'partial', received, total });
    }

    // ── Todos los chunks llegaron → ensamblar ─────────────────────────────
    const folder = companyId ? `exit-auth-video/${companyId}` : 'exit-auth-video';
    const finalDir = join(UPLOAD_BASE, folder);
    ensureDir(finalDir);

    const unique      = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const assembledPath = join(tmpDir,  `assembled_${unique}.tmp`);
    const outputName    = `${unique}.mp4`;
    const outputPath    = join(finalDir, outputName);

    try {
      // Concatenar chunks en orden
      const writeStream = (await import('fs')).createWriteStream(assembledPath);
      for (let i = 0; i < total; i++) {
        const part = await fs.readFile(join(tmpDir, `chunk_${i}`));
        writeStream.write(part);
      }
      await new Promise<void>((resolve, reject) => {
        writeStream.end();
        writeStream.on('finish', resolve);
        writeStream.on('error',  reject);
      });

      // Recodificar con ffmpeg (mismo pipeline que /exit-auth-video)
      await reencodeVideo(assembledPath, outputPath);

      res.json({
        status: 'done',
        url:    `/uploads/${folder}/${outputName}`,
        type:   'video/mp4',
        name:   outputName,
        size:   (await fs.stat(outputPath)).size,
      });
    } catch (ffmpegErr) {
      console.error('[upload/chunk] ffmpeg error:', ffmpegErr);
      // Fallback: mover el archivo ensamblado sin recodificar
      const rawExt  = extname(filename || '').toLowerCase() || '.mp4';
      const rawName = `${unique}${rawExt}`;
      const rawPath = join(finalDir, rawName);
      await fs.rename(assembledPath, rawPath).catch(() => {});
      res.json({
        status: 'done',
        url:    `/uploads/${folder}/${rawName}`,
        type:   mimeType || 'video/mp4',
        name:   rawName,
      });
    } finally {
      // Limpiar directorio temporal de chunks
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});

// ─── Helper: recodificar video con ffmpeg ─────────────────────────────────────
function reencodeVideo(_inputPath: string, _outputPath: string): Promise<void> {
  // No-op: sin ffmpeg nativo, no hacemos recodificado server-side.
  // El archivo queda como llegó. Si en el futuro se instala ffmpeg en el
  // VPS, basta con descomentar la implementación con fluent-ffmpeg.
  return Promise.resolve();
}

// ─── Fotos de repuestos / insumos ─────────────────────────────────────────────

router.post('/part-photos', (req: Request, res: Response, next: NextFunction) => {
  // El router /upload no es company-scoped (no pasa por `requireCompany`).
  // Por eso leemos `req.user.companyId` directamente del JWT para validar
  // que el companyId del query coincida con el del usuario autenticado.
  let companyId: number;
  try {
    companyId = validateUploadCompanyId(
      req.query.companyId as string | undefined,
      req.user?.companyId ?? undefined,
    );
  } catch (e) {
    return next(new AppError(403, (e as Error).message));
  }

  const folder = `parts/${companyId}`;

  const upload = multer({
    storage: buildStorage(folder),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: imageFilter,
  }).single('photo');

  upload(req, res, async (err) => {
    if (err) return next(err);
    const file = req.file as Express.Multer.File | undefined;
    if (!file) return next(new AppError(400, 'No se recibió la foto.'));
    // Defense in depth: revalidar mimetype + extensión después de multer.
    try {
      validateImageFile(file);
    } catch (e) {
      return next(new AppError(400, (e as Error).message));
    }
    await optimizeImageIfNeeded(file);
    res.json({
      url:  `/uploads/${folder}/${file.filename}`,
      type: file.mimetype,
      name: file.originalname,
      size: file.size,
    });
  });
});

// ─── Fuel ─────────────────────────────────────────────────────────────────────
// SEGURIDAD: este endpoint valida que el `companyId` del query coincida con
// el del usuario autenticado, y revalida mimetype + extensión de cada archivo
// (defense in depth — el `fileFilter` ya filtra, pero un futuro cambio del
// filter no debería abrir este endpoint). Usado para foto del recibo Y foto
// del odómetro.

router.post('/fuel-photos', (req: Request, res: Response, next: NextFunction) => {
  let companyId: number;
  try {
    companyId = validateUploadCompanyId(
      req.query.companyId as string | undefined,
      // El router /upload NO pasa por `requireCompany` (no es company-scoped).
      // Tomamos el companyId del JWT directamente.
      req.user?.companyId ?? undefined,
    );
  } catch (e) {
    return next(new AppError(403, (e as Error).message));
  }

  const folder = `fuel/${companyId}`;

  const upload = multer({
    storage: buildStorage(folder),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: imageFilter,
  }).array('photos', 10);

  upload(req, res, async (err) => {
    if (err) return next(err);
    const files = req.files as Express.Multer.File[];
    if (!files?.length) return next(new AppError(400, 'No se recibió el archivo.'));

    // Defense in depth: revalidar cada archivo después de multer
    try {
      for (const f of files) validateImageFile(f);
    } catch (e) {
      return next(new AppError(400, (e as Error).message));
    }

    await Promise.allSettled(files.map((f) => optimizeImageIfNeeded(f)));
    res.json({ urls: files.map((f) => `/uploads/${folder}/${f.filename}`) });
  });
});

// ─── Checklist ────────────────────────────────────────────────────────────────

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

  upload(req, res, async (err) => {
    if (err) return next(err);
    const file = req.file as Express.Multer.File | undefined;
    if (!file) return next(new AppError(400, 'No se recibió la foto.'));
    await optimizeImageIfNeeded(file);
    res.json({
      url:  `/uploads/${folder}/${file.filename}`,
      type: file.mimetype,
      name: file.originalname,
      size: file.size,
    });
  });
});

// ─── PDFs ─────────────────────────────────────────────────────────────────────

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

// ─── Facturas ─────────────────────────────────────────────────────────────────
//
// SEGURIDAD (jul 2026 — módulo Finanzas):
//   • Valida `companyId` del query contra el del JWT (validateUploadCompanyId).
//     Esto evita que un usuario suba al bucket de otra empresa.
//   • Defense in depth: revalida mimetype + extensión por archivo
//     (validateImageFile para imágenes, validatePdfFile para PDFs). Un futuro
//     cambio del `fileFilter` de multer no debería abrir este endpoint.
//   • Folder FINAL siempre es `invoices/${validatedCompanyId}` — nunca
//     depende del query string sin validar.

router.post('/invoice-files', (req, res, next) => {
  // El router /upload no es company-scoped (no pasa por `requireCompany`).
  // Tomamos el companyId del JWT para validar contra el query param.
  let companyId: number;
  try {
    companyId = validateUploadCompanyId(
      req.query.companyId as string | undefined,
      req.user?.companyId ?? undefined,
    );
  } catch (e) {
    return next(new AppError(403, (e as Error).message));
  }

  const folder = `invoices/${companyId}`;

  const upload = multer({
    storage: buildStorage(folder),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(new AppError(400, 'Solo imágenes o PDF.'));
    },
  }).array('files', 5);

  upload(req, res, async (err) => {
    if (err) return next(err);
    const files = req.files as Express.Multer.File[];
    if (!files?.length) return next(new AppError(400, 'No se recibieron archivos.'));

    // Defense in depth: revalidar mimetype + extensión de cada archivo.
    try {
      for (const f of files) {
        if (f.mimetype === 'application/pdf') {
          validatePdfFile(f);
        } else if (f.mimetype.startsWith('image/')) {
          validateImageFile(f);
        } else {
          throw new Error(`Tipo de archivo no soportado: ${f.mimetype}`);
        }
      }
    } catch (e) {
      return next(new AppError(400, (e as Error).message));
    }

    // Solo optimizamos imágenes; los PDFs van tal cual (sharp no los maneja).
    const imageFiles = files.filter((f) => f.mimetype.startsWith('image/'));
    await Promise.allSettled(imageFiles.map((f) => optimizeImageIfNeeded(f)));
    res.json({ urls: files.map(f => `/uploads/${folder}/${f.filename}`) });
  });
});

// ─── Mantenimiento ────────────────────────────────────────────────────────────

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

  upload(req, res, async (err) => {
    if (err) return next(err);
    const files = req.files as Express.Multer.File[];
    if (!files?.length) return next(new AppError(400, 'No se recibieron archivos.'));
    // Solo optimizamos imágenes; los PDFs van tal cual.
    const imageFiles = files.filter((f) => f.mimetype.startsWith('image/'));
    await Promise.allSettled(imageFiles.map((f) => optimizeImageIfNeeded(f)));
    res.json({
      urls: files.map(f => ({
        url:  `/uploads/${folder}/${f.filename}`,
        type: f.mimetype,
        name: f.originalname,
      })),
    });
  });
});

// ─── Seguros ──────────────────────────────────────────────────────────────────

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

  upload(req, res, async (err) => {
    if (err) return next(err);
    const file = req.file;
    if (!file) return next(new AppError(400, 'No se recibió archivo.'));
    // Solo optimizamos si es imagen; PDF va tal cual.
    if (file.mimetype.startsWith('image/')) {
      await optimizeImageIfNeeded(file);
    }
    res.json({ url: `/uploads/${folder}/${file.filename}` });
  });
});

// ─── Genérico ─────────────────────────────────────────────────────────────────

router.post('/photos', (req: Request, res: Response, next: NextFunction) => {
  const category = req.query.category as string;
  const safeCategory: UploadCategory = (ALLOWED_CATEGORIES as readonly string[]).includes(category)
    ? (category as UploadCategory)
    : 'general';

  let companyId: number | undefined;
  if (req.query.companyId) {
    try {
      companyId = validateUploadCompanyId(
        req.query.companyId as string | undefined,
        // Ver nota en /fuel-photos: el router /upload no es company-scoped.
        req.user?.companyId ?? undefined,
      );
    } catch (e) {
      return next(new AppError(403, (e as Error).message));
    }
  }

  const upload = buildUpload(safeCategory);
  upload(req, res, async (err) => {
    if (err) return next(err);
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return next(new AppError(400, 'No se recibieron archivos.'));
    }
    try {
      for (const f of files) validateImageFile(f);
    } catch (e) {
      return next(new AppError(400, (e as Error).message));
    }
    await Promise.allSettled(files.map((f) => optimizeImageIfNeeded(f)));
    res.json({ urls: resolveUrls(files, safeCategory, companyId?.toString()) });
  });
});

// ─── Eliminar archivo ─────────────────────────────────────────────────────────

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