// lib/ai/rate-limit.ts
// ─────────────────────────────────────────────────────────────────────
// Rate limiter en memoria por usuario.
// Default: 30 mensajes/minuto por userId.
//
// Estrategia: sliding window de 60s. Si el usuario ya hizo 30 requests
// en los últimos 60s, devolvemos 429.
//
// Es in-memory por proceso (no compartido entre workers PM2). Para
// setups multi-worker可以考虑 Redis, pero para una sola instancia es
// suficiente.
// ─────────────────────────────────────────────────────────────────────

const DEFAULT_LIMIT  = 30;          // requests
const DEFAULT_WINDOW = 60 * 1000;   // 1 min en ms

interface Bucket {
  /** Timestamps (ms) de los últimos N requests. */
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed:    boolean;
  remaining:  number;
  resetMs:    number; // ms hasta que se libere 1 slot
  limit:      number;
  windowMs:   number;
}

/** Limpia timestamps fuera de la ventana y evalúa el límite. */
export function checkRateLimit(
  key: string,
  limit: number = DEFAULT_LIMIT,
  windowMs: number = DEFAULT_WINDOW,
): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }
  // Quitar timestamps viejos.
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);

  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0]!;
    const resetMs = windowMs - (now - oldest);
    return { allowed: false, remaining: 0, resetMs, limit, windowMs };
  }
  bucket.timestamps.push(now);
  return {
    allowed:   true,
    remaining: limit - bucket.timestamps.length,
    resetMs:   windowMs,
    limit,
    windowMs,
  };
}

/** Stats para debug. */
export function getRateLimitStats() {
  return {
    activeKeys: buckets.size,
    config:     { limit: DEFAULT_LIMIT, windowMs: DEFAULT_WINDOW },
  };
}

/** Reset total (para tests). */
export function resetAllBuckets() {
  buckets.clear();
}