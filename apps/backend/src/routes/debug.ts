// routes/debug.ts
// Endpoints de DEBUG — solo para diagnóstico. NO en producción.
//
// Sirven para verificar que el celular puede:
//   1. Alcanzar el backend (ping)
//   2. Subir un video pequeño (test multipart)
//   3. Confirmar si ffmpeg nativo está disponible (para recodificar videos)

import { Router } from 'express';
import multer from 'multer';
import { execSync } from 'child_process';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { promises as fs } from 'fs';

const router = Router();

const UPLOAD_BASE = process.env.UPLOAD_DIR ?? join(process.cwd(), '..', '..', 'uploads');
const DEBUG_DIR = join(UPLOAD_BASE, '_debug');

// ─── GET /debug/ping ────────────────────────────────────────────────────────────
// Devuelve info del request. Útil para confirmar CORS, IP del cliente, headers.

router.get('/ping', (req, res) => {
  console.log('[debug:ping] headers:', {
    origin:  req.headers.origin,
    referer: req.headers.referer,
    ua:      req.headers['user-agent'],
    ip:      req.ip,
    host:    req.headers.host,
  });
  res.json({
    ok: true,
    ts: new Date().toISOString(),
    method: req.method,
    url:    req.originalUrl,
    ip:     req.ip,
    headers: {
      origin:  req.headers.origin,
      host:    req.headers.host,
      ua:      req.headers['user-agent'],
    },
  });
});

// ─── POST /debug/echo ──────────────────────────────────────────────────────────
// Acepta multipart sin filtros y loguea qué recibe. Para diagnosticar
// si el celular puede siquiera llegar al backend con un body.

const debugUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      if (!existsSync(DEBUG_DIR)) mkdirSync(DEBUG_DIR, { recursive: true });
      cb(null, DEBUG_DIR);
    },
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      cb(null, `echo_${unique}${extname(file.originalname) || '.bin'}`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 },  // 100 MB para diagnóstico
}).any();  // acepta cualquier field

router.post('/echo', (req, res) => {
  const files = (req.files as Express.Multer.File[]) ?? [];
  console.log('[debug:echo] received', {
    bodyKeys: Object.keys(req.body),
    filesCount: files.length,
    files: files.map((f) => ({
      fieldName: f.fieldname,
      name: f.originalname,
      mime: f.mimetype,
      size: f.size,
    })),
  });

  // Limpia los archivos del debug
  setTimeout(() => {
    files.forEach((f) => fs.unlink(f.path).catch(() => {}));
  }, 30_000);

  res.json({
    ok: true,
    body: req.body,
    files: files.map((f) => ({
      fieldName: f.fieldname,
      name: f.originalname,
      mime: f.mimetype,
      size: f.size,
    })),
  });
});

// ─── GET /debug/ffmpeg ───────────────────────────────────────────────────────────
// Confirma si ffmpeg nativo está disponible en el PATH.

router.get('/ffmpeg', (_req, res) => {
  let available = false;
  let version = '';
  let error = '';
  try {
    version = execSync('ffmpeg -version 2>&1 | head -n 1', { encoding: 'utf-8' });
    available = true;
  } catch (e) {
    error = (e as Error).message;
  }
  res.json({ available, version, error });
});

export default router;
