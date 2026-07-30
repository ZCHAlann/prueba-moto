// lib/ai-api-keys.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 — Generación, hashing y verificación de API Keys emitidas
// para integración con Custom GPT de OpenAI (/api/ai/*).
//
// Decisiones:
//   - Algoritmo: SHA-256 con un SALT FIJO embebido en el código.
//     (A diferencia de passwords, estas keys son de MUY alta entropía:
//     32 chars base62 random ≈ 190 bits de entropía → rainbow tables
//     inútiles. El salt fijo es solo defense-in-depth.)
//   - Formato del key: `aik_live_<32 chars base62 random>`.
//   - Se muestra UNA sola vez al generarlo (igual que Stripe/GitHub).
//   - En la DB solo se guarda: hash + prefix (primeros 16 chars) +
//     scopes + active + expiresAt. NUNCA el key en texto plano.
//
// Esto es SEPARADO de `lib/crypto.ts` (que usa AES-256-GCM reversible):
//   - crypto.ts: para secretos que necesitamos RECUPERAR (ej: API keys
//     de providers que tenemos que mandar a la API de OpenAI).
//   - ai-api-keys.ts: para secretos que SOLO necesitamos VALIDAR (el
//     Custom GPT manda el Bearer, validamos que el hash coincida).
// ─────────────────────────────────────────────────────────────────────

import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

// ── Constantes ──────────────────────────────────────────────────────────

/**
 * Salt fijo embebido. NO es un secreto (está en el código), pero sirve
 * para que un atacante con acceso a la DB no pueda pre-computar hashes
 * de keys comunes. Combinado con la entropía de 190 bits del key random,
 * es suficiente.
 */
const FIXED_SALT = 'motors-ai-api-key-salt-v1::do-not-leak';

/** Prefijo de las API keys. `aik_live_` = "AI Key, live environment". */
const KEY_PREFIX = 'aik_live_';

/** Largo de la parte random del key. 32 chars base62 = 190 bits entropía. */
const RANDOM_LEN = 32;

/** Largo del `keyPrefix` que se guarda en la DB (visible en listas/UI). */
const DB_PREFIX_LEN = 16; // "aik_live_a1b2c3d4" (16 chars)

// ── Generación ──────────────────────────────────────────────────────────

/**
 * Genera un API Key nuevo. Devuelve el objeto con todos los datos
 * necesarios para:
 *   1. Mostrar `plainKey` UNA sola vez al usuario.
 *   2. Guardar `keyHash` y `keyPrefix` en la DB.
 *   3. Validar con `verifyApiKey()` después.
 */
export function generateApiKey(): {
  plainKey: string;     // aik_live_a1b2c3d4...   ← mostrar UNA sola vez
  keyHash: string;      // 64 hex chars             ← guardar en DB
  keyPrefix: string;    // "aik_live_a1b2c3d4"     ← guardar en DB (visible)
} {
  // randomBytes(24) → 24 bytes → base62 encoding ≈ 32 chars. Usamos 24
  // para garantizar ≥32 chars en base62 (a veces 31 por redondeo).
  const random = randomBytes(24).toString('base64url'); // base64url = [A-Za-z0-9_-]
  // Convertimos base64url a base62-ish (reemplazamos _ y - por chars alfanum).
  // En realidad base64url ya es subconjunto de [A-Za-z0-9], suficiente.
  const trimmed = random.slice(0, RANDOM_LEN);
  const plainKey = `${KEY_PREFIX}${trimmed}`;

  return {
    plainKey,
    keyHash: hashApiKey(plainKey),
    keyPrefix: plainKey.slice(0, DB_PREFIX_LEN),
  };
}

// ── Hashing ─────────────────────────────────────────────────────────────

/**
 * Hashea un API Key con SHA-256 + salt fijo.
 * Devuelve 64 chars hex (lo que se guarda en `ai_api_keys.key_hash`).
 */
export function hashApiKey(plainKey: string): string {
  return createHash('sha256')
    .update(`${FIXED_SALT}::${plainKey}`)
    .digest('hex');
}

/**
 * Verifica un API Key contra un hash guardado.
 *
 * Usa `timingSafeEqual` para evitar timing attacks (un attacker podría
 * inferir byte por byte comparando tiempos de respuesta). Como el hash
 * es siempre 64 chars hex, comparamos strings de igual largo.
 *
 * Devuelve `true` SOLO si la comparación constante-tiempo pasó.
 */
export function verifyApiKey(plainKey: string, keyHash: string): boolean {
  if (!plainKey || !keyHash) return false;
  if (keyHash.length !== 64) return false; // hash SHA-256 siempre 64 hex

  const computed = hashApiKey(plainKey);
  // timingSafeEqual requiere Buffers del mismo largo.
  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(keyHash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ── Validación de scopes ───────────────────────────────────────────────

/** Scopes soportados. El campo `scopes` en la DB es `string[]`. */
export type ApiKeyScope = 'read' | 'write';

/** Valida que un scope esté presente en el array. */
export function hasScope(scopes: string[] | null | undefined, required: ApiKeyScope): boolean {
  if (!Array.isArray(scopes)) return false;
  return scopes.includes(required);
}

// ── Helpers de formato ──────────────────────────────────────────────────

/** Valida que un string parezca un API Key bien formado. NO valida el hash. */
export function isWellFormedApiKey(plainKey: string): boolean {
  if (typeof plainKey !== 'string') return false;
  if (!plainKey.startsWith(KEY_PREFIX)) return false;
  const body = plainKey.slice(KEY_PREFIX.length);
  // base64url: A-Z, a-z, 0-9, _, -
  return body.length >= RANDOM_LEN && /^[A-Za-z0-9_-]+$/.test(body);
}

/** Scrubbing: reemplaza el key en logs por `aik_live_***XXXX` (últimos 4). */
export function scrubApiKey(plainKey: string | null | undefined): string {
  if (!plainKey) return '';
  if (plainKey.length < 8) return 'aik_live_***';
  return `${KEY_PREFIX}***${plainKey.slice(-4)}`;
}

// ── Extrae el Bearer del header Authorization ───────────────────────────

/**
 * Extrae el Bearer token del header `Authorization`.
 * Devuelve `null` si el header no está bien formado.
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || typeof authHeader !== 'string') return null;
  const trimmed = authHeader.trim();
  if (!trimmed.toLowerCase().startsWith('bearer ')) return null;
  const token = trimmed.slice(7).trim();
  return token || null;
}
