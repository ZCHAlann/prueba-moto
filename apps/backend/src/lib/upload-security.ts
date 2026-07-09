import path from 'path';
import { promises as fs } from 'fs';

// ─── Tipos permitidos ────────────────────────────────────────────────────────
//
// Aceptamos solo imágenes. PDF y otros tipos van por endpoints separados
// (`/upload/documents`, etc.) cuando apliquen. Subir un PDF o ejecutable
// disfrazado de JPG a un endpoint de "fotos" es un vector de ataque real,
// especialmente cuando el archivo se vuelve a servir desde S3 a un browser.

const ALLOWED_MIME_TYPES = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

const ALLOWED_EXTENSIONS = new Set<string>([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif',
]);

// ─── sanitizeFilename ────────────────────────────────────────────────────────
//
// Elimina cualquier componente de directorio y caracteres peligrosos del
// nombre original del archivo. Lo importante:
//
//   1. path.basename() neutraliza "../" y "./" — un atacante que controle
//      el filename no puede escribir fuera del bucket folder.
//   2. Whitelist de chars: alfanumérico, guion, guion bajo, punto. Quita
//      acentos, espacios, paréntesis, comillas, etc.
//   3. Sin puntos al inicio: oculta archivos tipo ".env", ".htaccess".
//   4. Longitud limitada: nombres absurdos rompen algunos frontends.
//   5. Fallback "file" si quedó vacío.
//
// Ejemplos:
//   "../../etc/passwd"       → "etc_passwd"   (luego falla ext check)
//   "../secrets.env"         → "secrets.env"  (luego falla ext check)
//   "foto odómetro (1).jpg"  → "foto_od_metro__1_.jpg"
//   ".hidden"                → "hidden"
//   ""                       → "file"

export function sanitizeFilename(raw: string): string {
  // 1. Solo el basename — neutraliza path traversal
  const base = path.basename(raw ?? '');

  // 2. Whitelist de caracteres seguros
  const clean = base.replace(/[^a-zA-Z0-9._-]/g, '_');

  // 3. Sin puntos al inicio
  const noLeadingDot = clean.replace(/^\.+/, '');

  // 4. Limitar longitud
  const trimmed = noLeadingDot.slice(0, 80);

  // 5. Fallback
  return trimmed || 'file';
}

// ─── validateImageFile ───────────────────────────────────────────────────────
//
// Valida mimetype Y extensión. No confiamos solo en el frontend (el atributo
// `accept="image/*"` es bypasseable con curl o con un mimetype manipulado).
// Lanza Error con mensaje descriptivo si algo no pasa — el caller traduce a
// 400.

export function validateImageFile(file: Express.Multer.File): void {
  if (!file.mimetype || !ALLOWED_MIME_TYPES.has(file.mimetype)) {
    throw new Error(`Tipo de archivo no permitido: ${file.mimetype ?? '(vacío)'}`);
  }

  const ext = path.extname(file.originalname ?? '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`Extensión no permitida: ${ext || '(sin extensión)'}`);
  }
}

// ─── validateUploadCompanyId ─────────────────────────────────────────────────
//
// El `companyId` que viene en `?companyId=` del query DEBE coincidir con el
// `companyId` del usuario autenticado. Esto previene que un usuario de la
// empresa A suba archivos al bucket folder de la empresa B — vector
// clásico de data leakage.
//
// Lanza Error si no coincide — el caller traduce a 403.

export function validateUploadCompanyId(
  queryCompanyId: string | undefined,
  authCompanyId: number | undefined,
): number {
  const parsed = parseInt(queryCompanyId ?? '', 10);

  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error('companyId inválido en query param');
  }

  if (parsed !== authCompanyId) {
    throw new Error('companyId no autorizado');
  }

  return parsed;
}

// ─── buildSafeStoragePath ────────────────────────────────────────────────────
//
// Construye el path final de S3/storage de forma segura. Siempre incluye
// `companyId` para aislar archivos entre empresas, y siempre sanitiza el
// filename antes de usarlo.
//
// Resultado ejemplo:
//   buildSafeStoragePath('fuel-photos', 42, 'foto odómetro (1).jpg')
//   → "fuel-photos/42/1718123456789-foto_od_metro__1_.jpg"

export function buildSafeStoragePath(
  folder: string,
  companyId: number,
  originalFilename: string,
): string {
  const safeFolder = folder.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'misc';
  const safeFilename = sanitizeFilename(originalFilename);
  return `${safeFolder}/${companyId}/${Date.now()}-${safeFilename}`;
}

// ─── validatePdfFile ─────────────────────────────────────────────────────────
//
// Defensa in-depth para endpoints que aceptan PDFs (handover, invoice, insurance).
// Revisa mimetype + extensión. No confiamos solo en el `fileFilter` de multer
// porque un cambio futuro del filter no debería abrir el endpoint.
//
// Aceptamos solo PDFs reales, no documentos disfrazados (Word, Excel, ZIP).
// Lanza Error con mensaje descriptivo — el caller traduce a 400.

const ALLOWED_PDF_MIME_TYPES = new Set<string>([
  'application/pdf',
]);

const ALLOWED_PDF_EXTENSIONS = new Set<string>([
  '.pdf',
]);

export function validatePdfFile(file: Express.Multer.File): void {
  if (!file.mimetype || !ALLOWED_PDF_MIME_TYPES.has(file.mimetype)) {
    throw new Error(`Tipo de archivo no permitido: ${file.mimetype ?? '(vacío)'} (esperado PDF)`);
  }
  const ext = path.extname(file.originalname ?? '').toLowerCase();
  if (!ALLOWED_PDF_EXTENSIONS.has(ext)) {
    throw new Error(`Extensión no permitida: ${ext || '(sin extensión)'} (esperado .pdf)`);
  }
}

// ─── optimizeImageIfNeeded ───────────────────────────────────────────────────
//
// Re-codifica la imagen subida con sharp para reducir tamaño y estandarizar
// el formato. Beneficios:
//
//   1. Reduce ancho de banda de almacenamiento y de serving (un JPEG de 4 MB
//      de celular queda en ~250-400 KB).
//   2. Quita EXIF (privacidad — GPS del conductor, modelo de cámara, etc).
//   3. Estandariza a JPEG progresivo → mejor perceived performance al servir.
//
// SAFETY: si sharp falla por cualquier razón, NO rompe el upload. Devuelve
// el archivo original sin tocar. El log queda en consola para diagnóstico.
//
// PERFORMANCE: usamos Promise.race con timeout de 5 s para no colgar el
// handler si sharp se cuelga (raro, pero visto en deploys con poca RAM).
//
// USO:
//
//   const files = req.files as Express.Multer.File[];
//   await Promise.allSettled(files.map(f => optimizeImageIfNeeded(f)));
//
// Ponemos `Promise.allSettled` (no `Promise.all`) porque si UNA imagen falla
// no queremos tirar el upload entero — las que sí optimizaron quedan
// optimizadas y la que falló queda como estaba.
//
// NOTA: NO se llama desde `/handover-pdf`, `/invoice-files`, ni
// `/insurance-files` porque esos aceptan PDF, no imágenes. Los endpoints de
// fotos que sí lo llaman son:
//
//   /exit-auth-photos      /maintenance-photos
//   /maintenance-evidence  /fuel-photos
//   /checklist-photos      /asset-photos
//   /driver-photos         /user-photos

const MAX_IMAGE_DIMENSION = 1600;     // px — fotos de evidencia no necesitan más
const JPEG_QUALITY = 80;               // 0-100; 80 = buen balance tamaño/calidad
const MIN_SIZE_TO_OPTIMIZE = 200 * 1024; // 200 KB — por debajo no vale la pena
const OPTIMIZE_TIMEOUT_MS = 5000;

export async function optimizeImageIfNeeded(
  file: Express.Multer.File,
): Promise<void> {
  // Solo imágenes
  if (!file.mimetype || !file.mimetype.startsWith('image/')) return;

  // Solo si el archivo es lo suficientemente grande (optimizar imágenes de 50 KB
  // gasta CPU sin ganancia perceptible).
  let size: number;
  try {
    const stat = await fs.stat(file.path);
    size = stat.size;
  } catch {
    return; // no se pudo leer — no bloqueamos el upload
  }
  if (size < MIN_SIZE_TO_OPTIMIZE) return;

  // GIF y SVG los dejamos como están (sharp no maneja bien GIF animados).
  if (file.mimetype === 'image/gif' || file.mimetype === 'image/svg+xml') return;

  const inputPath = file.path;
  const tmpPath = `${inputPath}.opt.jpg`;

  try {
    // Lazy import: sharp es pesado (binding nativo) y solo lo necesitamos
    // aquí. Si falla por falta de memoria o binario incompatible, el catch
    // general protege el upload.
    const sharp = (await import('sharp')).default;

    const optimizePromise = sharp(inputPath)
      .rotate() // respeta EXIF orientation antes de re-codificar
      .resize({
        width: MAX_IMAGE_DIMENSION,
        height: MAX_IMAGE_DIMENSION,
        fit: 'inside', // mantiene aspect ratio, no recorta
        withoutEnlargement: true, // no upscalea imágenes chicas
      })
      .jpeg({
        quality: JPEG_QUALITY,
        progressive: true,
        mozjpeg: false, // libmozjpeg no viene en el binario default de sharp
      })
      .toFile(tmpPath);

    // Timeout duro: si sharp se cuelga, no rompemos el handler.
    const result = await Promise.race([
      optimizePromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('sharp timeout')), OPTIMIZE_TIMEOUT_MS),
      ),
    ]);

    // Si el archivo optimizado es MAYOR que el original (raro, pasa con
    // imágenes muy pequeñas que ya estaban bien comprimidas), descartamos
    // la optimización y dejamos el original.
    if (result.size >= size) {
      await fs.unlink(tmpPath).catch(() => {});
      return;
    }

    // Atomic rename: reemplazar el archivo original solo si la optimización
    // fue exitosa. Si el rename falla por permisos o filesystem, el original
    // queda intacto.
    await fs.rename(tmpPath, inputPath);
  } catch (err) {
    // Limpiar tmp si quedó
    await fs.unlink(tmpPath).catch(() => {});
    console.warn(
      '[upload:optimize] falló la optimización, manteniendo original:',
      { name: file.originalname, mime: file.mimetype, err: (err as Error).message },
    );
    // NO propagamos el error — el upload sigue OK con el archivo original.
  }
}
