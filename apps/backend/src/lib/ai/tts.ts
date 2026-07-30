// lib/ai/tts.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 v3 — TTS multi-provider: Piper local (primario) + ElevenLabs
// (fallback).
//
// ANTES: solo ElevenLabs (cloud, multilingual_v2). Funcionaba bien
// pero consumía créditos y agregaba latencia de ~3-5s por request.
//
// AHORA: Piper TTS local. Es un servidor HTTP en Python que carga
// un modelo ONNX una vez y responde WAV casi instantáneo (<200ms
// para textos cortos, ~1-2s para textos largos). Costo: $0, sin
// rate limits, sin cloud, sin dependencia de internet.
//
// Setup:
//   1) pip install 'piper-tts[http]'
//   2) bash scripts/setup-piper-voice.sh es_ES-davefx-medium
//   3) bash scripts/start-piper.sh
//   4) Configurar PIPER_URL en .env (default: http://127.0.0.1:5000)
//
// Si Piper NO está disponible (servidor caído, modelo no descargado),
// hacemos fallback transparente a ElevenLabs. La API pública no
// cambia, así que el frontend y el resto del sistema siguen igual.
// ─────────────────────────────────────────────────────────────────────

import { Buffer } from 'node:buffer';

// ─── Config de providers ───────────────────────────────────────────

const PIPER_URL_DEFAULT = 'http://127.0.0.1:5000';
const ELEVENLABS_TTS_URL = (voiceId: string) =>
  `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

const ELEVENLABS_MODEL = 'eleven_multilingual_v2';

// ─── Voces ──────────────────────────────────────────────────────────
// Mantenemos los IDs de ElevenLabs para no romper la API pública.
// El campo `piperVoice` se usa cuando el provider es Piper (es_ES-*,
// es_MX-*, etc.). Para ElevenLabs seguimos usando `id`.
//
// En la práctica: cuando PIPER_URL esté configurado, los IDs de
// ElevenLabs se ignoran y se usa el `piperVoice` por default.
// Pero el frontend sigue mandando IDs de ElevenLabs, así que
// aceptamos ambos formatos en `isValidVoice`.

interface PiperVoice {
  /** ID ElevenLabs legacy (compat con frontend). */
  id: string;
  label: string;
  gender: 'F' | 'M';
  lang: 'es' | 'en' | 'ar';
  description: string;
  /** Nombre de la voz Piper (es_ES-*, es_MX-*, etc.). */
  piperVoice: string;
}

export const TTS_VOICES: readonly PiperVoice[] = [
  // jul 2026 v3 — Solo 3 voces activas (las que Piper soporta bien).
  // El resto (Lily, Daniel) queda comentado por si querés sumar más adelante.
  {
    id:          'cgSgspJ2msm6clMCkdW9',
    label:       'David',
    gender:      'M',
    lang:        'es',
    description: 'Hombre, cálido, español de España, conversacional',
    piperVoice:  'es_ES-davefx-medium',
  },
  {
    id:          'EXAVITQu4vr4xnSDxMaL',
    label:       'Sara',
    gender:      'F',
    lang:        'es',
    description: 'Mujer, profesional, clara, español de México',
    piperVoice:  'es_MX-claude-high',
  },
  {
    id:          'TX3LPaxmHKxFdv7VOQHJ',
    label:       'Aldo',
    gender:      'M',
    lang:        'es',
    description: 'Hombre, joven, amigable, español de México',
    piperVoice:  'es_MX-ald-medium',
  },
  // {
  //   id:          'pFZP5JQG7iQjIQuC4Bku',
  //   label:       'Lily',
  //   gender:      'F',
  //   lang:        'es',
  //   description: 'Mujer, expresiva, cálida',
  //   piperVoice:  'es_ES-mls_9972-low',
  // },
  // {
  //   id:          'onwK4e9ZLuTAKqWW03F9',
  //   label:       'Daniel',
  //   gender:      'M',
  //   lang:        'es',
  //   description: 'Hombre, maduro, narrativo',
  //   piperVoice:  'es_ES-carlfm-x_low',
  // },
] as const;

export type VoiceId = typeof TTS_VOICES[number]['id'];

export const DEFAULT_VOICE: VoiceId = 'cgSgspJ2msm6clMCkdW9'; // David (default)

export function isValidVoice(v: string): v is VoiceId {
  return TTS_VOICES.some((voice) => voice.id === v);
}

function getPiperVoiceForVoiceId(v: VoiceId): string {
  const found = TTS_VOICES.find((voice) => voice.id === v);
  return found?.piperVoice ?? process.env.PIPER_VOICE ?? 'es_ES-davefx-medium';
}

function getPiperUrl(): string {
  return (process.env.PIPER_URL ?? PIPER_URL_DEFAULT).replace(/\/$/, '');
}

function isPiperEnabled(): boolean {
  return !!process.env.PIPER_ENABLED && process.env.PIPER_ENABLED !== 'false' && process.env.PIPER_ENABLED !== '0';
}

// ─── Cache en memoria ───────────────────────────────────────────────

interface TtsCacheEntry {
  buffer:    Buffer;
  expiresAt: number;
  provider:  'piper' | 'elevenlabs';
}

const cache = new Map<string, TtsCacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 100;

function cacheKey(text: string, voice: VoiceId, provider: 'piper' | 'elevenlabs'): string {
  let h = 5381;
  const combined = `${provider}:${voice}:${text}`;
  for (let i = 0; i < combined.length; i++) {
    h = ((h << 5) + h) ^ combined.charCodeAt(i);
  }
  return `${combined.length}:${h.toString(36)}`;
}

function getFromCache(text: string, voice: VoiceId, provider: 'piper' | 'elevenlabs'): Buffer | null {
  const entry = cache.get(cacheKey(text, voice, provider));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(cacheKey(text, voice, provider));
    return null;
  }
  return entry.buffer;
}

function putInCache(text: string, voice: VoiceId, buffer: Buffer, provider: 'piper' | 'elevenlabs'): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(cacheKey(text, voice, provider), { buffer, expiresAt: Date.now() + CACHE_TTL_MS, provider });
}

// ─── Synth principal ───────────────────────────────────────────────

export interface TtsResult {
  buffer: Buffer;
  voice:  VoiceId;
  model:  string;
  cached: boolean;
  bytes:  number;
  /** Idioma del modelo. Con Piper y ElevenLabs multilingual_v2 es siempre 'es'. */
  lang:   'es' | 'en' | 'ar';
  /** Qué provider se usó (útil para debug). */
  provider: 'piper' | 'elevenlabs';
}

export async function synthesizeSpeech(
  text: string,
  voice: VoiceId = DEFAULT_VOICE,
): Promise<TtsResult> {
  if (!text.trim()) {
    throw new Error('Texto vacío para TTS.');
  }
  return doSynthesize(text, voice);
}

export async function synthesizeSpeechForCompany(
  text: string,
  voice: VoiceId,
  companyId: number,
): Promise<TtsResult> {
  if (!text.trim()) {
    throw new Error('Texto vacío para TTS.');
  }

  const { resolveAiConfig } = await import('./client-factory');
  const cfg = await resolveAiConfig(companyId);
  if (cfg.killed) {
    throw Object.assign(
      new Error('TTS deshabilitado: la IA de tu empresa está kill-switched por el superadmin.'),
      { code: 'AI_DISABLED' },
    );
  }
  if (!cfg.useTts) {
    throw Object.assign(
      new Error('TTS deshabilitado: tu empresa desactivó esta feature. Pedile a tu admin que la habilite.'),
      { code: 'AI_DISABLED' },
    );
  }

  return doSynthesize(text, voice);
}

// ─── Síntesis con Piper ─────────────────────────────────────────────

async function synthesizeWithPiper(text: string, voice: VoiceId): Promise<TtsResult> {
  const piperVoice = getPiperVoiceForVoiceId(voice);
  const trimmed = text.length > 5000 ? text.slice(0, 5000) + '...' : text;

  // Cache hit (Piper-specific key).
  const cached = getFromCache(trimmed, voice, 'piper');
  if (cached) {
    return {
      buffer: cached,
      voice,
      model:  `piper:${piperVoice}`,
      cached: true,
      bytes:  cached.length,
      lang:   'es',
      provider: 'piper',
    };
  }

  const url = `${getPiperUrl()}/synthesize`;
  const start = Date.now();

  // jul 2026 v3 — Piper puede colgarse si el modelo está mal cargado.
  // AbortController con timeout para no esperar infinito.
  const controller = new AbortController();
  const timeoutMs = 15_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: trimmed,
        voice: piperVoice,
        // Acelera un toque (length_scale=1 es la velocidad normal;
        // 0.95 es ~5% más rápido, lo que ayuda con respuestas largas
        // sin sonar apurado).
        length_scale: 0.95,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    // eslint-disable-next-line no-console
    console.warn(
      `[tts:piper] ${response.status} en ${Date.now() - start}ms — ` +
      `fallback a ElevenLabs. Error: ${errText.slice(0, 200)}`,
    );
    throw new Error(`Piper TTS ${response.status}: ${errText.slice(0, 200) || response.statusText}`);
  }

  // Piper devuelve audio/wav (no MP3). Lo pasamos como WAV.
  // Si el frontend lo necesita como audio/mpeg, lo convertimos
  // fuera de acá. Por ahora mandamos WAV que Chrome/Firefox aceptan.
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  putInCache(trimmed, voice, buffer, 'piper');

  return {
    buffer,
    voice,
    model:  `piper:${piperVoice}`,
    cached: false,
    bytes:  buffer.length,
    lang:   'es',
    provider: 'piper',
  };
}

// ─── Síntesis con ElevenLabs (fallback) ─────────────────────────────

async function synthesizeWithElevenLabs(text: string, voice: VoiceId): Promise<TtsResult> {
  const trimmed = text.length > 5000 ? text.slice(0, 5000) + '...' : text;

  const cached = getFromCache(trimmed, voice, 'elevenlabs');
  if (cached) {
    return {
      buffer: cached,
      voice,
      model:  ELEVENLABS_MODEL,
      cached: true,
      bytes:  cached.length,
      lang:   'es',
      provider: 'elevenlabs',
    };
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey || apiKey.trim().length < 10) {
    throw new Error('ELEVENLABS_API_KEY no configurada y Piper no disponible.');
  }

  const response = await fetch(ELEVENLABS_TTS_URL(voice), {
    method: 'POST',
    headers: {
      'xi-api-key':   apiKey,
      'Content-Type': 'application/json',
      'Accept':       'audio/mpeg',
    },
    body: JSON.stringify({
      text:     trimmed,
      model_id: ELEVENLABS_MODEL,
      voice_settings: {
        stability:        0.5,
        similarity_boost: 0.75,
        style:            0.0,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    // eslint-disable-next-line no-console
    console.error('[tts:elevenlabs] error:', response.status, errText.slice(0, 500));
    throw new Error(`ElevenLabs TTS ${response.status}: ${errText.slice(0, 200) || response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  putInCache(trimmed, voice, buffer, 'elevenlabs');

  return {
    buffer,
    voice,
    model:  ELEVENLABS_MODEL,
    cached: false,
    bytes:  buffer.length,
    lang:   'es',
    provider: 'elevenlabs',
  };
}

// ─── Síntesis con fallback automático ──────────────────────────────

async function doSynthesize(text: string, voice: VoiceId): Promise<TtsResult> {
  // jul 2026 v3 — Estrategia:
  //   1) Si Piper está habilitado, intentar Piper primero.
  //   2) Si Piper falla (timeout, modelo no cargado, red), fallback
  //      transparente a ElevenLabs.
  //   3) Si ElevenLabs también falla, lanzar error para que el
  //      frontend use Web Speech API como último recurso.
  if (isPiperEnabled()) {
    try {
      return await synthesizeWithPiper(text, voice);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[tts] Piper failed, falling back to ElevenLabs:', err instanceof Error ? err.message : err);
      // Continue to ElevenLabs.
    }
  }
  return synthesizeWithElevenLabs(text, voice);
}

// ─── Stats para debug ─────────────────────────────────────────────

export function getTtsStats() {
  const piperEnabled = isPiperEnabled();
  return {
    cacheSize:    cache.size,
    cacheMax:     CACHE_MAX_ENTRIES,
    voices:       TTS_VOICES.length,
    piperEnabled,
    piperUrl:     piperEnabled ? getPiperUrl() : null,
    piperDefault: getPiperVoiceForVoiceId(DEFAULT_VOICE),
    elevenlabsConfigured: !!process.env.ELEVENLABS_API_KEY,
    // jul 2026 v3 — provider por defecto: piper si está habilitado.
    provider:     piperEnabled ? 'piper' : 'elevenlabs',
  };
}
