// lib/crypto.ts
// ─────────────────────────────────────────────────────────────────────
// Cifrado simétrico AES-256-GCM para secretos en reposo (API keys, SMTP
// passwords, etc.).
//
// Formato de salida: base64url( iv(12) || authTag(16) || ciphertext )
//   - iv:        12 bytes aleatorios por encrypt (recomendación GCM)
//   - authTag:   16 bytes que GCM anexa al ciphertext (Node los devuelve
//                separados, los concatenamos)
//   - ciphertext:N bytes (mismo largo que el plaintext)
//
// MASTER_ENCRYPTION_KEY
//   - 32 bytes en hex (64 chars) o en base64 (44 chars con padding).
//   - Si no está seteada, usamos un fallback derivado de JWT_SECRET
//     (NO recomendado en producción: degradación silenciosa).
//   - El backend falla al arrancar si no se puede derivar una key.
// ─────────────────────────────────────────────────────────────────────

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

let _cachedKey: Buffer | null = null;

/** Devuelve la master key. Lanza si no se puede derivar. */
function getMasterKey(): Buffer {
  if (_cachedKey) return _cachedKey;

  const raw = process.env.MASTER_ENCRYPTION_KEY;
  if (raw && raw.length >= 32) {
    // Acepta hex (64 chars) o base64 (44 chars con padding).
    if (/^[0-9a-fA-F]+$/.test(raw) && raw.length === 64) {
      _cachedKey = Buffer.from(raw, 'hex');
    } else {
      _cachedKey = Buffer.from(raw, 'base64');
      // Si decodeó a menos de 32 bytes, derivamos con sha256.
      if (_cachedKey.length < 32) {
        _cachedKey = createHash('sha256').update(raw).digest();
      }
    }
    if (_cachedKey.length === 32) return _cachedKey;
  }

  // Fallback: derivar de JWT_SECRET. NO recomendado pero no rompemos prod
  // si el operador olvidó setearla — logueamos warning.
  const jwt = process.env.JWT_SECRET;
  if (jwt && jwt.length >= 16) {
    console.warn(
      '[crypto] MASTER_ENCRYPTION_KEY no seteada — derivando de JWT_SECRET. ' +
      'Seteala en producción (32 bytes hex o base64).',
    );
    _cachedKey = createHash('sha256').update(`motors-master-v1::${jwt}`).digest();
    return _cachedKey;
  }

  throw new Error(
    'No se puede derivar MASTER_ENCRYPTION_KEY ni de JWT_SECRET. ' +
    'Seteá MASTER_ENCRYPTION_KEY (32 bytes hex o base64) en el .env.',
  );
}

/** Cifra un plaintext. Devuelve base64url(iv|tag|ciphertext). */
export function encryptSecret(plain: string): string {
  if (plain == null) throw new Error('encryptSecret: plain es requerido');
  const key = getMasterKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64url');
}

/** Descifra un payload producido por `encryptSecret`. */
export function decryptSecret(payload: string): string {
  if (!payload) throw new Error('decryptSecret: payload vacío');
  const key = getMasterKey();
  const buf = Buffer.from(payload, 'base64url');
  if (buf.length < IV_LEN + 16) {
    throw new Error('decryptSecret: payload demasiado corto');
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + 16);
  const ct = buf.subarray(IV_LEN + 16);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

/** Devuelve los últimos N caracteres del secret (para mostrar en UI). */
export function last4(plain: string): string {
  if (!plain) return '';
  return plain.slice(-4);
}

/** Fingerprint estable del secret (sha256 hex). Para historial/revocación. */
export function fingerprintOf(plain: string): string {
  return createHash('sha256').update(plain).digest('hex');
}

/**
 * Scrubbing: reemplaza cualquier string que parezca una API key en un texto
 * libre. Usado en logs/auditoría para no leakear keys accidentalmente.
 *
 * Detecta prefijos comunes: gsk_, sk-, sk-or-, AIza, xai-, key-, etc.
 */
export function scrubSecrets(input: string | null | undefined): string {
  if (!input) return '';
  return String(input)
    .replace(/\b(gsk_|sk-|sk-or-|sk-ant-|AIza|xai-|key-|ghp_|github_pat_)[A-Za-z0-9_\-]{16,}\b/g, '$1***')
    .replace(/\b[A-Za-z0-9_\-]{40,}\b/g, (m) => {
      // heurística: 40+ chars alfanuméricos → probablemente un token
      if (/^[A-Za-z0-9_\-]{40,}$/.test(m)) return '***';
      return m;
    });
}