// lib/ai/model-config.ts
// ─────────────────────────────────────────────────────────────────────
// Configuración del modelo Groq desde variables de entorno.
//
// Lee (con defaults sensatos):
//   GROQ_MODEL_PRIMARY      → modelo principal (default: llama-3.1-8b-instant)
//                              Rápido. Suficiente para queries de datos estructurados.
//   GROQ_MODEL_FALLBACK     → modelo de respaldo si el primario da rate limit
//                              (default: llama-3.3-70b-versatile, más capaz pero más lento)
//   GROQ_FALLBACK_ENABLED   → "true" / "false" (default: true)
//
// Modelo actual: se puede cambiar en runtime (cuando se detecta rate limit
// el orquestador llama a switchToFallback() para usar el secundario).
//
// Por qué 8b-instant como primario:
//   - Es ~5-10x más rápido que 70b-versatile.
//   - Jarvis es read-only de datos (lista vehículos, mantenimientos, etc.) —
//     no necesita la capacidad de razonamiento profundo del 70b.
//   - Permite más requests por minuto antes de rate limit.
// ─────────────────────────────────────────────────────────────────────

const DEFAULT_PRIMARY  = 'llama-3.1-8b-instant';
const DEFAULT_FALLBACK = 'llama-3.3-70b-versatile';

/** Modelo actualmente en uso (cambia dinámicamente con switchToFallback). */
let _currentModel: string = readPrimary();

function readPrimary(): string {
  const v = process.env.GROQ_MODEL_PRIMARY?.trim();
  return v && v.length > 0 ? v : DEFAULT_PRIMARY;
}

function readFallback(): string {
  const v = process.env.GROQ_MODEL_FALLBACK?.trim();
  return v && v.length > 0 ? v : DEFAULT_FALLBACK;
}

function isFallbackEnabled(): boolean {
  const v = process.env.GROQ_FALLBACK_ENABLED?.trim().toLowerCase();
  // Default: activado.
  return v == null || v === '' || v === '1' || v === 'true' || v === 'yes';
}

export function getModel(): string {
  return _currentModel;
}

export function getFallback(): string {
  return readFallback();
}

export function fallbackEnabled(): boolean {
  return isFallbackEnabled();
}

/** Devuelve el modelo al que deberíamos cambiar tras un rate limit. */
export function getNextModelAfterRateLimit(): string | null {
  if (!isFallbackEnabled()) return null;
  const fallback = readFallback();
  // Si ya estamos en el fallback, no hay a dónde ir.
  if (_currentModel === fallback) return null;
  return fallback;
}

/**
 * Cambia el modelo activo. Devuelve el modelo anterior (útil para logs).
 * NO actualiza `process.env` — el cambio es en memoria del proceso.
 */
export function switchToFallback(): { previous: string; current: string } | null {
  if (!isFallbackEnabled()) return null;
  const fallback = readFallback();
  if (_currentModel === fallback) return null;
  const previous = _currentModel;
  _currentModel = fallback;
  // eslint-disable-next-line no-console
  console.warn(`[jarvis-model] fallback activado: ${previous} → ${fallback}`);
  return { previous, current: fallback };
}

/** Vuelve al modelo primario (llamar tras un reset de rate limit, e.g. medianoche). */
export function resetToPrimary(): void {
  const primary = readPrimary();
  if (_currentModel !== primary) {
    // eslint-disable-next-line no-console
    console.log(`[jarvis-model] reset a primario: ${_currentModel} → ${primary}`);
    _currentModel = primary;
  }
}

/** Stats para debug endpoint. */
export function getModelConfig() {
  return {
    current:     _currentModel,
    primary:     readPrimary(),
    fallback:    readFallback(),
    enabled:     isFallbackEnabled(),
  };
}