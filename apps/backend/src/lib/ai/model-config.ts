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

// jul 2026 v6 — Migracion de Gemma local a Groq hosted.
// Modelo principal: `openai/gpt-oss-120b` (recomendacion oficial de Groq
// para tool calling / agentic en produccion, ~500 tok/s, $0.15/$0.60 por
// 1M tokens). Reemplaza a los deprecados llama-3.x.
//
// Modelo liviano: `openai/gpt-oss-20b` (mas chico, mas barato, $0.075/$0.30
// por 1M). Usado como clasificador barato previo al razonamiento grande
// en el Chat Listener (seccion 2.3 del plan), y como fallback automatico
// si el primario da rate limit (gpt-oss-120B consume mas TPM).
const DEFAULT_PRIMARY  = 'openai/gpt-oss-120b';
const DEFAULT_FALLBACK = 'openai/gpt-oss-20b';

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

/**
 * jul 2026 v6 — Modelo "clasificador" barato, separado del primario y
 * del fallback. Se usa en `classifyAndMaybeAnswer()` y en cualquier
 * punto del pipeline donde queremos gastar menos tokens (ej. el
 * pre-filtro del Chat Listener, parseo de intent, etc).
 *
 * Por que un modelo aparte y no el mismo `fallback`?
 *   - El `fallback` se activa SOLO en rate limit del primario.
 *   - El clasificador lo queremos usar SIEMPRE que llegue un
 *     mensaje trivial, para no gastar tokens del primario.
 *   - Si usaran el mismo modelo, en un rate limit del primario
 *     tambien estariamos rate-limiteando el clasificador.
 */
let _currentClassifier: string = readClassifier();

function readClassifier(): string {
  const v = process.env.GROQ_MODEL_CLASSIFIER?.trim();
  return v && v.length > 0 ? v : 'openai/gpt-oss-20b';
}

export function getClassifier(): string {
  return _currentClassifier;
}

export function setClassifier(model: string): void {
  _currentClassifier = model;
}