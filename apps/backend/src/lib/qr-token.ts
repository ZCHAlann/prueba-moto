// src/lib/qr-token.ts
//
// Tokens JWT firmados para los QR de carnets del personal.
// ──────────────────────────────────────────────────────────────────────
// DISEÑO (jul 2026, v2 — más corto)
// ──────────────────────────────────────────────────────────────────────
// 1) Secreto INDEPENDIENTE del JWT_SECRET de sesiones (si filtran
//    sesiones, no pueden falsificar QRs y viceversa). Usa
//    STAFF_QR_SECRET si está definida, si no deriva de JWT_SECRET con
//    prefijo+hash para que un leak de JWT_SECRET no abra el espacio
//    de claves del QR directamente.
// 2) Payload MÍNIMO: solo { sub, companyId, exp, iat }. Sin iss/aud/jti
//    ni nada decorativo — el secreto largo + la firma HS256 ya dan
//    toda la seguridad que necesitamos, y cada claim removido recorta
//    ~10-15 chars del JWT. Resultado: el JWT serializado pasa de ~280
//    bytes a ~110 bytes, lo que hace que el QR tenga menos módulos
//    (más fácil de escanear con cámaras de baja calidad).
// 3) Expiración: 1 año (en segundos, no como string "365d" — eso
//    reduce el tamaño del header del payload y se mantiene el
//    "blast radius" acotado en caso de QR filtrado).
// 4) Rate-limit en el endpoint de verificación: ver middleware
//    rateLimitPublic (120/min por IP).
// 5) Si rotás STAFF_QR_SECRET, todos los QRs viejos dejan de validar
//    inmediatamente. Eso invalida carnets físicos — comunicar antes
//    de rotar.

import { sign, verify, type JwtPayload } from 'jsonwebtoken';
import { createHash } from 'crypto';

// ─── Secreto ────────────────────────────────────────────────────────────────

function getSecret(): string {
  const explicit = process.env.STAFF_QR_SECRET;
  if (explicit && explicit.length >= 32) return explicit;
  // Fallback: derivar de JWT_SECRET con prefijo y hash. NO recomendado en
  // prod, pero evita romper dev donde STAFF_QR_SECRET no está seteada.
  // Aun si JWT_SECRET se filtra, el atacante no puede simplemente "reusar"
  // JWT_SECRET — necesita re-hashear con el prefijo.
  const base = process.env.JWT_SECRET ?? '';
  if (base.length < 16) {
    throw new Error(
      'qr-token: ni STAFF_QR_SECRET ni JWT_SECRET están definidas/suficientes. ' +
      'Definí STAFF_QR_SECRET (≥32 chars) en .env para que los carnets QR funcionen.'
    );
  }
  return createHash('sha256').update(`staff-qr::v2::${base}`).digest('hex');
}

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface StaffQrPayload extends JwtPayload {
  /** `company-user-<id>` (mismo formato que el sub de sesión). */
  sub: string;
  /** Empresa dueña del carnet. Aísla el QR cross-tenant. */
  companyId: number;
  /** Expiración en epoch-seconds. jsonwebtoken lo setea automáticamente
   *  cuando pasás `expiresIn` como número, sin agregar el sufijo "365d"
   *  al payload. */
  exp?: number;
  iat?: number;
}

const STAFF_QR_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 año

// ─── Issue ──────────────────────────────────────────────────────────────────

/**
 * Firma un JWT para el QR del carnet. El payload es deliberadamente
 * diminuto — solo lo necesario para resolver el user y validar tenant.
 */
export function signStaffQrToken(userId: number, companyId: number): string {
  // `expiresIn` como número (segundos) en vez de string "365d" hace
  // que el header del payload sea ~5 chars más corto y evita un
  // potencial issue de parsing en clientes exóticos.
  return sign(
    { sub: `company-user-${userId}`, companyId },
    getSecret(),
    { expiresIn: STAFF_QR_TTL_SECONDS, noTimestamp: false }
  );
}

// ─── Verify ─────────────────────────────────────────────────────────────────

/**
 * Verifica firma + expiración. Devuelve el payload o tira
 * `JsonWebTokenError` / `TokenExpiredError`. El caller (ruta pública)
 * debe mapear esos errores a `{ valid: false, reason }` sin filtrar
 * detalles del error al cliente.
 *
 * No validamos iss/aud (no los emitimos) — eso recorta bytes del
 * header y simplifica el path. La seguridad descansa en la longitud
 * del secreto + HS256.
 */
export function verifyStaffQrToken(token: string): StaffQrPayload {
  return verify(token, getSecret()) as StaffQrPayload;
}
