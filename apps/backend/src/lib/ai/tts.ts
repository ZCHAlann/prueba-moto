// lib/ai/tts.ts
// ─────────────────────────────────────────────────────────────────────
// Text-to-Speech usando ElevenLabs (voces humanas multilingües).
//
// Antes: Groq Orpheus (solo inglés/árabe, voz robótica).
// Ahora: ElevenLabs multilingual_v2 — voces humanas en español nativo.
//
// API ElevenLabs:
//   POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
//   Headers: xi-api-key: <API_KEY>
//   Body:    { text, model_id, voice_settings }
//   Audio:   audio/mpeg (MP3) por defecto con Accept: audio/mpeg
//
// Caché en memoria con TTL 10 min, máximo 100 entradas.
// Si ElevenLabs falla, el frontend hace fallback a Web Speech API.
// ─────────────────────────────────────────────────────────────────────

const ELEVENLABS_TTS_URL = (voiceId: string) =>
  `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

const ELEVENLABS_MODEL = 'eleven_multilingual_v2';

// ─── Voces ──────────────────────────────────────────────────────────
// IDs reales de voces pre-construidas de la librería pública de
// ElevenLabs, todas con buen rendimiento en español. Disponibles
// en plan gratuito y superiores.
//
// Si querés más voces, consultá https://elevenlabs.io/voice-library
// (filtrar por "Spanish") o usa GET https://api.elevenlabs.io/v1/voices
// con tu xi-api-key.
export const TTS_VOICES = [
  {
    id:          'cgSgspJ2msm6clMCkdW9',
    label:       'Jessica',
    gender:      'F',
    lang:        'es',
    description: 'Mujer, cálida, español neutro, conversacional',
  },
  {
    id:          'EXAVITQu4vr4xnSDxMaL',
    label:       'Sarah',
    gender:      'F',
    lang:        'es',
    description: 'Mujer, profesional, clara',
  },
  {
    id:          'TX3LPaxmHKxFdv7VOQHJ',
    label:       'Liam',
    gender:      'M',
    lang:        'es',
    description: 'Hombre, joven, amigable',
  },
  {
    id:          'pFZP5JQG7iQjIQuC4Bku',
    label:       'Lily',
    gender:      'F',
    lang:        'es',
    description: 'Mujer, expresiva, cálida',
  },
  {
    id:          'onwK4e9ZLuTAKqWW03F9',
    label:       'Daniel',
    gender:      'M',
    lang:        'es',
    description: 'Hombre, maduro, narrativo',
  },
] as const;

export type VoiceId = typeof TTS_VOICES[number]['id'];

export const DEFAULT_VOICE: VoiceId = 'cgSgspJ2msm6clMCkdW9'; // Jessica

export function isValidVoice(v: string): v is VoiceId {
  return TTS_VOICES.some((voice) => voice.id === v);
}

// ─── Cache en memoria ───────────────────────────────────────────────

interface TtsCacheEntry {
  buffer:    Buffer;
  expiresAt: number;
}

const cache = new Map<string, TtsCacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 100;

function cacheKey(text: string, voice: VoiceId, model: string): string {
  let h = 5381;
  const combined = `${model}:${voice}:${text}`;
  for (let i = 0; i < combined.length; i++) {
    h = ((h << 5) + h) ^ combined.charCodeAt(i);
  }
  return `${combined.length}:${h.toString(36)}`;
}

function getFromCache(text: string, voice: VoiceId, model: string): Buffer | null {
  const entry = cache.get(cacheKey(text, voice, model));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(cacheKey(text, voice, model));
    return null;
  }
  return entry.buffer;
}

function putInCache(text: string, voice: VoiceId, model: string, buffer: Buffer): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(cacheKey(text, voice, model), { buffer, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ─── Synth principal ───────────────────────────────────────────────

export interface TtsResult {
  buffer: Buffer;
  voice:  VoiceId;
  model:  string;
  cached: boolean;
  bytes:  number;
  /** Idioma del modelo. Con ElevenLabs multilingual_v2 es siempre 'es'. */
  lang:   'es' | 'en' | 'ar';
}

/**
 * Sintetiza el texto a MP3 usando ElevenLabs.
 *
 * Devuelve el buffer + metadata. Si ElevenLabs no responde (sin API key,
 * sin créditos, timeout), lanza error y el frontend hace fallback a
 * Web Speech API.
 */
export async function synthesizeSpeech(
  text: string,
  voice: VoiceId = DEFAULT_VOICE,
): Promise<TtsResult> {
  if (!text.trim()) {
    throw new Error('Texto vacío para TTS.');
  }
  // ElevenLabs tiene un límite de ~5000 caracteres por request.
  const trimmed = text.length > 5000 ? text.slice(0, 5000) + '...' : text;

  // Cache hit
  const cached = getFromCache(trimmed, voice, ELEVENLABS_MODEL);
  if (cached) {
    return {
      buffer: cached,
      voice,
      model:  ELEVENLABS_MODEL,
      cached: true,
      bytes:  cached.length,
      lang:   'es',
    };
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey || apiKey.trim().length < 10) {
    throw new Error('ELEVENLABS_API_KEY no configurada — TTS no disponible.');
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
    console.error('[tts] ElevenLabs error:', response.status, errText.slice(0, 500));
    throw new Error(`ElevenLabs TTS ${response.status}: ${errText.slice(0, 200) || response.statusText}`);
  }

  // ElevenLabs devuelve MP3 con Accept: audio/mpeg.
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  putInCache(trimmed, voice, ELEVENLABS_MODEL, buffer);

  return {
    buffer,
    voice,
    model:  ELEVENLABS_MODEL,
    cached: false,
    bytes:  buffer.length,
    lang:   'es',
  };
}

/** Stats para debug endpoint. */
export function getTtsStats() {
  return {
    cacheSize: cache.size,
    cacheMax:  CACHE_MAX_ENTRIES,
    voices:    TTS_VOICES.length,
    model:     ELEVENLABS_MODEL,
    provider:  'elevenlabs',
  };
}