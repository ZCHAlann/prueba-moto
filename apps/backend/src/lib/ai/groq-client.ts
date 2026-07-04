// lib/ai/groq-client.ts
// ─────────────────────────────────────────────────────────────────────
// Wrapper alrededor del cliente Groq con cascada 2D:
//
//   1. Cascada de KEY (ai-keys.ts): si la key actual rate-limita, salta a
//      la siguiente key. Si se acaban, lanza `GroqRateLimitError`.
//   2. Cascada de MODELO (model-config.ts): dentro de cada key, intenta
//      primero el modelo primario y, si rate-limita, el fallback
//      (`GROQ_MODEL_FALLBACK`). Tras agotar el fallback de una key,
//      rota a la siguiente key + resetea al modelo primario.
//
// El proceso se repite hasta agotar el producto cartesiano
//   `keys × modelos`. En la práctica eso es:
//
//   keys=1, models=2 → hasta 2 attempts
//   keys=3, models=2 → hasta 6 attempts
//   keys=5, models=2 → hasta 10 attempts
//
// Lo expuesto al resto del código sigue siendo `createChatCompletion`,
// con la misma signature. La transparencia del fallback es total.
// ─────────────────────────────────────────────────────────────────────

import Groq from 'groq-sdk';
import {
  getModel,
  getFallback,
  switchToFallback,
  resetToPrimary,
  fallbackEnabled,
} from './model-config';
import {
  getApiKeys,
  getApiKeyCount,
  getCurrentApiKey,
  getCurrentKeyIndex,
  advanceKeyIndex,
  resetToPrimaryKey,
  noteKeyRotation,
  maybeRecoverToPrimaryKey,
} from './keys';

// ─── Clientes cacheados por key (cada key tiene su propia instancia) ────
// Cada llamada `new Groq({ apiKey })` abre conexiones; cacheamos para
// reutilizar. Si rotamos de key, instanciamos una nueva solo cuando hace
// falta — el resto del tiempo reusamos.

const _clients = new Map<string, Groq>();

export function getClient(): Groq | null {
  const key = getCurrentApiKey();
  if (!key) return null;
  const cached = _clients.get(key);
  if (cached) return cached;
  const client = new Groq({ apiKey: key });
  _clients.set(key, client);
  return client;
}

/** Total de keys configuradas (largo de la cascada). Para logs / debug. */
export function getAvailableKeyCount(): number {
  return getApiKeyCount();
}

/** Invalida el cache (tests / rotación manual). No se llama automáticamente. */
export function invalidateGroqClientCache(): void {
  _clients.clear();
}

// ─── Detección de rate-limit ──────────────────────────────────────────────

/** Tipo de error detectable que indica rate limit. */
export class GroqRateLimitError extends Error {
  constructor(
    public readonly retryAfterMs: number,
    public readonly originalMessage: string,
  ) {
    super(`rate_limit: ${originalMessage}`);
    this.name = 'GroqRateLimitError';
  }
}

export interface RateLimitInfo {
  retryAfterMs: number;
  message: string;
}

/**
 * Detecta si un error de Groq es un rate limit. El SDK puede exponer el
 * error en distintas formas según versión; revisamos todas.
 */
export function detectRateLimit(err: unknown): RateLimitInfo | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as any;

  const status =
    e.status ?? e.error?.status ?? e.response?.status ??
    e.error?.error?.status;
  const code =
    e.code ?? e.error?.code ?? e.error?.error?.code;
  const message = String(
    e.message ?? e.error?.message ?? e.error?.error?.message ?? ''
  );

  const looksLikeRateLimit =
    status === 429 ||
    code === 'rate_limit_exceeded' ||
    message.includes('Rate limit reached') ||
    message.includes('rate_limit_exceeded') ||
    e.error?.error?.type === 'tokens';

  if (!looksLikeRateLimit) return null;

  // Intentamos extraer el retry-after del mensaje.
  const retryMatch = message.match(/try again in (\d+)m([\d.]+)s/i);
  const retryMs = retryMatch
    ? Number(retryMatch[1]) * 60_000 + Number(retryMatch[2]) * 1000
    : 60_000;
  return { retryAfterMs: retryMs, message };
}

// ─── Cascada 2D ─────────────────────────────────────────────────────────

/**
 * Loop principal de cascada. Itera sobre el espacio (keys × modelos):
 *
 *   - Empieza en (`currentKeyIdx`, primaryModel).
 *   - Si rate-limit:
 *       1. Intenta fallback de modelo en la misma key.
 *       2. Si ambos modelos de esa key ya rate-limitaron, rota a la
 *          siguiente key y resetea al modelo primario.
 *
 * Si termina el producto cartesiano sin éxito, lanza
 * `GroqRateLimitError` con el último error.
 */
async function createWithCascade(
  messages: any[],
  opts: Record<string, any>,
): Promise<any> {
  const keys = getApiKeys();
  if (keys.length === 0) {
    throw new Error('GROQ_API_KEY no configurada.');
  }

  const totalKeys = keys.length;
  const primaryModel = getModel();
  // El "universo" a explorar es N_keys × 2 modelos.
  // Para evitar loops infinitos si TODAS las keys rate-limitan (Groq
  // no resetea globalmente), llevamos un Set de combinaciones ya
  // probadas. Si llegamos a un estado ya visto → terminamos.
  const visited = new Set<string>();

  let attemptKeyIndex = clampCurrentIndex(totalKeys);
  let attemptModel = primaryModel;
  let lastError: unknown = null;

  // Límite duro como red de seguridad (= 2 ciclos completos). Con
  // N_keys=10 sería 20 attempts; con N_keys=1 sería 2. Suficiente.
  const HARD_LIMIT = Math.max(20, totalKeys * 4);

  for (let i = 0; i < HARD_LIMIT; i++) {
    const stateKey = `${attemptKeyIndex}|${attemptModel}`;
    if (visited.has(stateKey)) {
      // Ya probamos este par key+modelo y rate-limitó. No hay nada
      // más que probar — agotado.
      break;
    }
    visited.add(stateKey);

    const key = keys[attemptKeyIndex];
    const client = _clients.get(key) ?? new Groq({ apiKey: key });
    _clients.set(key, client);

    try {
      return await client.chat.completions.create({
        model: attemptModel,
        messages,
        ...opts,
      });
    } catch (err) {
      const rateInfo = detectRateLimit(err);
      if (!rateInfo) throw err; // no es rate-limit → propagar

      lastError = err;
      // eslint-disable-next-line no-console
      console.warn(
        `[groq-client] rate limit en key=${attemptKeyIndex} model=${attemptModel}: ${rateInfo.message}`,
      );

      // ─── Paso 1: fallback de modelo en esta misma key ────────────
      if (fallbackEnabled() && attemptModel !== getFallback()) {
        const switched = switchToFallback();
        if (switched) {
          attemptModel = switched.current;
          continue;
        }
      }

      // ─── Paso 2: rotar a la siguiente key, resetear a primary ─────
      const advance = advanceKeyIndex();
      if (!advance) break; // solo había 1 key
      // eslint-disable-next-line no-console
      console.warn(
        `[groq-client] rotando de key: ${advance.previous} → ${advance.current}, reseteando a primary`,
      );
      noteKeyRotation();
      attemptKeyIndex = advance.current;
      resetToPrimary();
      attemptModel = getModel();
    }
  }

  throw new GroqRateLimitError(60_000, String((lastError as any)?.message ?? lastError ?? 'rate_limit'));
}

/**
 * Helper — cuando `_currentIndex` queda fuera de rango (p.ej. si
 * `GROQ_API_KEY_COUNT` se redujo en runtime), clampeamos a 0. Existe
 * porque `getApiKeys()` solo devuelve las keys truthy, pero
 * `_currentIndex` podría tener un valor stale.
 */
function clampCurrentIndex(totalKeys: number): number {
  const idx = getCurrentKeyIndex();
  return idx >= totalKeys ? 0 : idx;
}

/**
 * Crea una completion con cascada automática. API pública.
 */
export async function createChatCompletion(
  messages: any[],
  opts: {
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    tools?: any[];
    tool_choice?: any;
    stream?: boolean;
    [k: string]: any;
  } = {},
) {
  // Validación rápida de cliente antes de intentar.
  if (!getCurrentApiKey()) {
    throw new Error('GROQ_API_KEY no configurada.');
  }
  return await createWithCascade(messages, opts);
}

/**
 * Después de un 200 OK, si hace rato estamos en una key fallback y
 * pasaron `GROQ_KEY_RECOVERY_MIN` minutos desde la última rotación,
 * intentamos volver a la primaria (que ya debería haber recuperado
 * su rate-limit). El orquestador lo llama **al final** de un 200 OK,
 * no antes.
 *
 * Devuelve `true` si la cascada se "curó" (volvió a K0).
 */
export function maybeRecoverPrimary(): boolean {
  if (getCurrentKeyIndex() === 0) return false;
  if (maybeRecoverToPrimaryKey()) {
    resetToPrimary();
    return true;
  }
  return false;
}

