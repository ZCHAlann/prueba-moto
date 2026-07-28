// lib/ai/whisper-stt.ts
// ─────────────────────────────────────────────────────────────────────
// Speech-to-Text via Whisper de Groq.
//
// jul 2026 v6 — Migracion a Groq. El plan original (con Gemma local)
// tenia ASR nativo dentro del mismo modelo. Groq NO tiene entrada de
// audio, asi que usamos Whisper del mismo proveedor:
//
//   - Misma cuenta, misma key, mismo SDK → no fragmentamos arquitectura
//     entre self-hosted y hosted.
//   - Latencia baja (Whisper-large-v3 en Groq es rapido).
//   - Precio: ~$0.11/hora de audio.
//
// Alternativas consideradas:
//   - Whisper self-hosted: reintroduce el problema de CPU que motivó
//     la migracion a Groq. Descartado.
//   - Google Speech-to-Text: otro proveedor, otra superficie de
//     exposicion. Descartado para mantener arquitectura unificada.
// ─────────────────────────────────────────────────────────────────────

import Groq from 'groq-sdk';
import { createReadStream, promises as fs } from 'node:fs';
import { getGroqKeyForCompany } from './client-factory';

// Modelos disponibles en Groq para STT:
//   - whisper-large-v3          → el mas preciso, recomendado
//   - whisper-large-v3-turbo    → ~la misma precision, mas rapido y barato
const DEFAULT_STT_MODEL = process.env.GROQ_STT_MODEL || 'whisper-large-v3';

// Idiomas que Jarvis soporta. Whisper los auto-detecta pero pasamos
// hint cuando es uno de estos para mejorar precision.
const SUPPORTED_LANGS = new Set(['es', 'es-EC', 'es-ES', 'es-MX', 'en', 'en-US']);

/**
 * Resultado de la transcripcion.
 */
export interface SttResult {
  text: string;
  language?: string;
  durationSec?: number;
  /** Modelo que se uso para la transcripcion. */
  model: string;
  /** Latencia de la llamada a Whisper. */
  latencyMs: number;
}

/**
 * Transcribe un archivo de audio a texto.
 *
 * @param audioPath  ruta absoluta al archivo (webm, mp3, wav, m4a, ogg, flac).
 * @param opts.companyId  empresa para resolver key (multi-tenant).
 * @param opts.language   hint de idioma (ej. 'es'). Si null, Whisper auto-detecta.
 * @param opts.prompt     contexto opcional para guiar la transcripcion
 *                        (ej. "ApliSmart Motors, gestion de flotas, Ecuador").
 *                        Util cuando hay terminos tecnicos que Whisper
 *                        tiende a inventar (placas, nombres de modelos, etc).
 */
export async function transcribeAudio(
  audioPath: string,
  opts: {
    companyId: number;
    language?: string | null;
    prompt?: string;
  },
): Promise<SttResult> {
  // 1) Verificar que el archivo existe y leer tamano.
  const stat = await fs.stat(audioPath).catch(() => null);
  if (!stat) throw new Error(`Audio no encontrado: ${audioPath}`);
  if (stat.size === 0) throw new Error(`Audio vacio: ${audioPath}`);
  // Limite de Whisper de Groq: 25 MB. Si el archivo es mas grande,
  // tendriamos que comprimirlo / partirlo. Por ahora, error claro.
  if (stat.size > 25 * 1024 * 1024) {
    throw new Error(`Audio demasiado grande (${(stat.size / 1024 / 1024).toFixed(1)} MB > 25 MB). Comprimir o partir.`);
  }

  // 2) Resolver la key de Groq de la empresa (multi-tenant). Si la
  // empresa no tiene su propia key, usa la cascada global de env vars.
  const keyCfg = await getGroqKeyForCompany(opts.companyId, 'jarvis');
  if (!keyCfg) {
    throw new Error('No hay key de Groq configurada para transcribir audio. Pedile al admin que configure una.');
  }
  const groq = new Groq({ apiKey: keyCfg.apiKey });

  // 3) Hint de idioma si esta en la lista soportada.
  const lang = opts.language && SUPPORTED_LANGS.has(opts.language)
    ? opts.language
    : undefined;

  // 4) Llamada a Whisper via SDK de Groq.
  // El SDK de Groq acepta un fs.ReadStream o un Buffer como `file`.
  const t0 = Date.now();
  const transcription = await groq.audio.transcriptions.create({
    file: createReadStream(audioPath),
    model: DEFAULT_STT_MODEL,
    language: lang,
    prompt: opts.prompt, // opcional, guia a Whisper con contexto
    response_format: 'verbose_json', // pedimos language + duration ademas del texto
    temperature: 0, // 0 = deterministico, mejor para transcripcion limpia
  });

  return {
    text: (transcription as any).text ?? '',
    language: (transcription as any).language ?? lang,
    durationSec: (transcription as any).duration,
    model: DEFAULT_STT_MODEL,
    latencyMs: Date.now() - t0,
  };
}

/**
 * Helper para el caso comun: el frontend nos manda un buffer de audio
 * (no un archivo en disco). Lo escribimos a un tmp, transcribimos, y
 * borramos el tmp.
 */
export async function transcribeAudioBuffer(
  buffer: Buffer,
  opts: {
    companyId: number;
    filename?: string;     // ej. "audio.webm" — para que Whisper sepa el formato
    language?: string | null;
    prompt?: string;
  },
): Promise<SttResult> {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const os = await import('node:os');
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'jarvis-stt-'));
  const filename = opts.filename || 'audio.webm';
  const tmpPath = path.join(tmpDir, filename);
  try {
    await fs.promises.writeFile(tmpPath, buffer);
    return await transcribeAudio(tmpPath, opts);
  } finally {
    // Limpiar el tmp siempre, incluso si falla.
    await fs.promises.unlink(tmpPath).catch(() => {});
    await fs.promises.rmdir(tmpDir).catch(() => {});
  }
}

/**
 * Devuelve info del servicio STT (para health-check / debug endpoint).
 * No llama a Whisper — solo lee config local.
 */
export function getSttInfo() {
  return {
    model:    DEFAULT_STT_MODEL,
    provider: 'groq-whisper',
    maxAudioSizeMB: 25,
    supportedLanguages: Array.from(SUPPORTED_LANGS),
  };
}
