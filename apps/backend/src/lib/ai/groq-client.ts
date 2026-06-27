// lib/ai/groq-client.ts
// ─────────────────────────────────────────────────────────────────────
// Wrapper alrededor del cliente Groq que detecta automáticamente rate limits
// y cambia al modelo de fallback.
//
// Comportamiento:
//   1. Llama al modelo actual.
//   2. Si Groq responde 429 / rate_limit_exceeded → cambia a fallback y
//      reintenta UNA vez.
//   3. Si el fallback también falla → lanza un error legible que el
//      orquestador convierte en mensaje amable para el usuario.
//
// La creación de completions sigue siendo síncrona desde el punto de
// vista del orquestador — la transparencia del fallback es total.
// ─────────────────────────────────────────────────────────────────────

import Groq from 'groq-sdk';
import {
  getModel,
  getNextModelAfterRateLimit,
  switchToFallback,
  fallbackEnabled,
} from './model-config';

let _client: Groq | null = null;

export function getClient(): Groq | null {
  if (_client) return _client;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey.trim().length < 10) return null;
  _client = new Groq({ apiKey });
  return _client;
}

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

/**
 * Detecta si un error de Groq es un rate limit (HTTP 429 con
 * code === 'rate_limit_exceeded' o message contiene "Rate limit").
 *
 * El SDK de Groq puede exponer el error en distintas formas según versión:
 *   - err.status                       (top-level)
 *   - err.error.status                  (envoltorio .error)
 *   - err.code                          (top-level en algunas versiones)
 *   - err.error.code                    (envoltorio .error)
 *   - err.error.error.code              (doble envoltorio, como en este caso)
 *   - err.message                       (string con "Rate limit reached")
 * Por eso revisamos TODAS las ubicaciones posibles.
 */
export interface RateLimitInfo {
  retryAfterMs: number;
  message: string;
}

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

/**
 * Crea una completion con detección de rate limit + fallback automático.
 *
 * @param messages  mensajes para Groq
 * @param opts      mismas opciones que client.chat.completions.create
 * @returns el completion object (igual que el SDK)
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
  const client = getClient();
  if (!client) {
    throw new Error('GROQ_API_KEY no configurada.');
  }

  const model = getModel();
  try {
    return await client.chat.completions.create({
      model,
      messages,
      ...opts,
    });
  } catch (err) {
    const rateInfo = detectRateLimit(err);
    if (!rateInfo) throw err;

    // Rate limit. ¿Tenemos a dónde caer?
    if (!fallbackEnabled()) {
      throw new GroqRateLimitError(rateInfo.retryAfterMs, String((err as any)?.message ?? err));
    }
    const nextModel = getNextModelAfterRateLimit();
    if (!nextModel) {
      // Ya estamos en el fallback, no hay a dónde ir.
      throw new GroqRateLimitError(rateInfo.retryAfterMs, String((err as any)?.message ?? err));
    }

    // Cambiar al fallback y reintentar.
    const switched = switchToFallback();
    if (!switched) {
      throw new GroqRateLimitError(rateInfo.retryAfterMs, String((err as any)?.message ?? err));
    }
    // eslint-disable-next-line no-console
    console.warn(
      `[groq-client] rate limit en ${switched.previous}, reintentando con ${switched.current}...`,
    );
    return await client.chat.completions.create({
      model: switched.current,
      messages,
      ...opts,
    });
  }
}