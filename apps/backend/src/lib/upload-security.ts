import path from 'path';

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
