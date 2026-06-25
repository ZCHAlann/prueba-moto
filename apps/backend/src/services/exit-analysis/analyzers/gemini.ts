// services/exit-analysis/analyzers/gemini.ts
//
// Llama a Gemini con todas las evidencias de una autorización en UN solo
// request multimodal. Compresión previa con sharp para imágenes, video
// enviado DIRECTO a Gemini (sin ffmpeg — Gemini 2.0/2.5 Flash acepta video
// nativo). Semáforo para limitar concurrencia, retry con backoff ante 429.
//
// CAMBIO IMPORTANTE vs versión anterior: ya NO se extraen frames del video
// con ffmpeg. Esa dependencia era un punto de fallo innecesario (binario
// externo, permisos, formatos no soportados) para algo que el modelo ya
// soporta de forma nativa. Si el video pesa demasiado para mandarlo inline
// (>18 MB aprox.), se debería migrar al File API de Gemini — no implementado
// aquí todavía, ver TODO abajo.
//
// CAMBIO IMPORTANTE #2: se loguea SIEMPRE el JSON crudo de respuesta de
// Gemini, no solo cuando falla el parseo. Antes era imposible ver qué
// respondió el modelo en el camino feliz.

import { getGeminiModel, GEMINI_MODEL_NAME, isAiEnabled } from '../../../lib/gemini-client';
import { geminiSemaphore } from '../../../lib/semaphore';
import { compressForGemini } from '../../../lib/image-compress';
import { EXIT_ANALYSIS_PROMPT } from '../prompts/multimodal';
import { AppError } from '../../../lib/errors';
import type { MultiItemAnalysisResult } from '../types';

const MAX_RETRIES = 5;

// Límite conservador para mandar el video inline en base64. Gemini acepta
// hasta ~20MB de request total; dejamos margen para las 4 imágenes + texto.
const MAX_INLINE_VIDEO_BYTES = 15 * 1024 * 1024; // 15 MB

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes('429') || msg.includes('rate') || msg.includes('quota') || msg.includes('resource_exhausted');
  }
  return false;
}

/** Adivina el mimeType del video por extensión. Gemini necesita esto exacto. */
function guessVideoMimeType(url: string): string {
  const ext = url.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'mp4':  return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'mov':  return 'video/quicktime';
    case 'avi':  return 'video/x-msvideo';
    default:     return 'video/mp4'; // fallback razonable
  }
}

export type EvidenceItem = {
  type: 'image' | 'video';
  /** URL relativa del tipo /uploads/exit-auth/... */
  url: string;
};

export type AnalysisInput = {
  evidences: EvidenceItem[];
  loadFile: (url: string) => Promise<Buffer>;
  logLabel?: string;
  /** Prompt a usar. Si no se pasa, usa EXIT_ANALYSIS_PROMPT (los 5 items). */
  prompt?: string;
};

type Part =
  | { kind: 'image'; buffer: Buffer; mimeType: 'image/jpeg' }
  | { kind: 'video'; buffer: Buffer; mimeType: string };

/**
 * Punto de entrada principal: envía todas las evidencias a Gemini en un
 * solo request y devuelve el JSON parseado con la decisión por ítem.
 */
export async function analyzeMultiItem(input: AnalysisInput): Promise<{
  result: MultiItemAnalysisResult;
  latencyMs: number;
  model: string;
  rawResponseText: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}> {
  if (!isAiEnabled()) {
    throw Object.assign(new Error('IA no configurada: GEMINI_API_KEY ausente.'), { code: 'AI_DISABLED' });
  }

  const label = input.logLabel ? `[${input.logLabel}]` : '';

  // Preparamos las imágenes y el video FUERA del semáforo (I/O de disco y
  // compresión no necesitan ocupar el cupo de concurrencia con Gemini).
  const parts: Part[] = [];

  for (const ev of input.evidences) {
    const buf = await input.loadFile(ev.url);

    if (ev.type === 'image') {
      const { buffer, mimeType } = await compressForGemini(buf);
      parts.push({ kind: 'image', buffer, mimeType });
      console.info(`[gemini]${label} imagen cargada: ${ev.url} → ${buffer.length} bytes comprimidos`);
      continue;
    }

    // Video: directo a Gemini, sin ffmpeg.
    if (buf.length > MAX_INLINE_VIDEO_BYTES) {
      // No implementamos File API todavía. Por ahora, fallamos con un
      // mensaje claro en vez de mandar un request que Gemini va a rechazar.
      throw new AppError(
        413,
        `El video de la bayoneta pesa ${(buf.length / 1024 / 1024).toFixed(1)} MB, supera el límite de ${MAX_INLINE_VIDEO_BYTES / 1024 / 1024} MB para envío directo. Pedir al conductor un video más corto o de menor resolución.`,
      );
    }
    const mimeType = guessVideoMimeType(ev.url);
    parts.push({ kind: 'video', buffer: buf, mimeType });
    console.info(`[gemini]${label} video cargado: ${ev.url} → ${buf.length} bytes, mimeType=${mimeType}`);
  }

  if (parts.length === 0) {
    throw new AppError(400, 'No se enviaron evidencias a Gemini (ningún archivo se pudo cargar).');
  }

  const start = Date.now();

  return geminiSemaphore.run(async () => {
    const model = getGeminiModel();
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const geminiParts = [
          ...parts.map((p) => ({
            inlineData: {
              data: p.buffer.toString('base64'),
              mimeType: p.mimeType,
            },
          })),
          { text: input.prompt ?? EXIT_ANALYSIS_PROMPT },
        ];

        const result = await model.generateContent({
          contents: [{ role: 'user', parts: geminiParts }],
          generationConfig: {
            temperature: 0,         // diagnóstico técnico → determinismo
            maxOutputTokens: 8192,  // subido de 4096: cuando la IA decide
                                    // "rechazar" varios items, escribe mucho
                                    // aiGuidance, observaciones, etc., y
                                    // 4096 se cortaba a mitad del 2do item
                                    // dejando un JSON inválido. 8192 cubre
                                    // el peor caso con video de bayoneta.
            responseMimeType: 'application/json',
          },
        });

        const response = result.response;
        const text = response.text().trim();
        const clean = text.replace(/```json|```/g, '').trim();

        // SIEMPRE logueamos el texto crudo, éxito o fallo. Esto es lo que
        // antes faltaba por completo — sin esto, un análisis "raro" no
        // dejaba ningún rastro.
        console.info(`[gemini]${label} respuesta cruda (intento ${attempt + 1}):\n${clean}`);

        let parsed: MultiItemAnalysisResult;
        try {
          parsed = JSON.parse(clean);
        } catch (err) {
          // ── FALLBACK de JSON truncado ──
          // Si Gemini se quedó sin tokens y dejó un JSON incompleto (típico
          // cuando el campo aiGuidance sale muy largo en varios items),
          // intentamos cerrar lo que se pueda y aceptar la respuesta parcial.
          // Esto evita que TODO el análisis se pierda por un solo item
          // que cortó al final.
          const salvaged = trySalvageTruncatedJson(clean);
          if (salvaged) {
            console.warn(`[gemini]${label} respuesta cruda fue JSON truncado — usando versión rescatada`);
            parsed = salvaged;
          } else {
            throw new AppError(500, `Gemini devolvió JSON inválido: ${clean.slice(0, 500)}`);
          }
        }

        if (!parsed.items || typeof parsed.items !== 'object') {
          throw new AppError(500, `Gemini devolvió JSON sin estructura esperada (falta "items"): ${clean.slice(0, 500)}`);
        }

        const usage = response.usageMetadata
          ? {
              promptTokens:     response.usageMetadata.promptTokenCount     ?? 0,
              completionTokens: response.usageMetadata.candidatesTokenCount ?? 0,
              totalTokens:      response.usageMetadata.totalTokenCount       ?? 0,
            }
          : undefined;

        console.info(`[gemini]${label} OK en ${Date.now() - start}ms, decision_global=${parsed.decision_global}, tokens=${usage?.totalTokens ?? '?'}`);

        return {
          result: parsed,
          latencyMs: Date.now() - start,
          model: GEMINI_MODEL_NAME,
          rawResponseText: clean,
          usage,
        };
      } catch (err) {
        lastError = err;
        console.error(`[gemini]${label} error en intento ${attempt + 1}/${MAX_RETRIES}:`, err);

        if (isRateLimitError(err) && attempt < MAX_RETRIES - 1) {
          const waitMs = Math.pow(2, attempt) * 3000;
          console.warn(`[gemini]${label} rate limit. Esperando ${waitMs / 1000}s...`);
          await sleep(waitMs);
          continue;
        }

        if (err instanceof AppError) throw err;
        throw new AppError(500, `Error llamando a Gemini: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    throw new AppError(429, `Gemini rate limit agotado después de ${MAX_RETRIES} intentos. Último error: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  });
}

// ─── Helpers de parseo ───────────────────────────────────────────────────

/**
 * Si Gemini devuelve un JSON incompleto (típicamente: maxOutputTokens
 * cortó a mitad de un valor de string, dejando comillas sin cerrar),
 * intentamos cerrar el string + el objeto + el array para que JSON.parse
 * lo acepte. Aceptamos la respuesta parcial: los items que sí
 * alcanzaron a entrar quedan en el resultado, los que se cortaron
 * quedan fuera y el llamador los maneja.
 *
 * Si la respuesta no parece truncada (otra clase de JSON malformado),
 * devolvemos null y el llamador tira el error de siempre.
 */
function trySalvageTruncatedJson(raw: string): MultiItemAnalysisResult | null {
  // 1. Detectar fin "dentro de un string". Si la respuesta NO termina en
  //    `}`, `]`, `"`, ni `:` es probable que un string quedó abierto.
  const trimmed = raw.trimEnd();
  const lastChar = trimmed[trimmed.length - 1];
  const endsInClosedJson = lastChar === '}' || lastChar === ']';
  if (endsInClosedJson) return null; // JSON no parece truncado, no intentamos.

  // 2. Cerrar string abierto si lo hay.
  //    Si la respuesta termina con un fragmento como `"...: "toma una `
  //    (comilla de apertura sí, pero la de cierre no), agregamos `"` al
  //    final. Si ya tenía `"` al final (estaba cerrado y solo falta `}`),
  //    no agregamos otra.
  let repaired = trimmed;
  if (!repaired.endsWith('"')) {
    repaired += '"';
  }

  // 3. Contar nivel de anidación. Si quedó un objeto/array sin cerrar,
  //    cerrarlos. Usamos un análisis simple por conteo de llaves/corchetes.
  const opens = (repaired.match(/[\{\[]/g) ?? []).length;
  const closes = (repaired.match(/[\}\]]/g) ?? []).length;
  const missing = opens - closes;

  // El cierre se hace con lo que abrió más recientemente. Como la lógica
  // de anidación en JSON estricto siempre es { [ { [ ... ] } ], el último
  // abierto que no se cerró lo cerramos primero.
  // Para mantenerlo simple y correcto para nuestro caso (items anidados
  // dentro de un objeto), cerramos primero los corchetes que falten y
  // después las llaves.
  for (let i = 0; i < missing; i++) {
    // Miramos el último char no-whitespace para saber qué cerrar.
    const last = repaired.trimEnd().slice(-1);
    if (last === '{') {
      repaired += '}';
    } else if (last === '[') {
      repaired += ']';
    } else if (last === ',') {
      // Si quedó una coma colgando después de un item incompleto,
      // la sacamos antes de cerrar.
      repaired = repaired.trimEnd().replace(/,\s*$/, '');
      repaired += '}';
    } else if (last === '"') {
      // Si después de cerrar el string quedó un `:` o nada, debemos
      // completar con un valor razonable. Como no tenemos idea de qué
      // campo era, mejor cerrar lo que se pueda.
      repaired = repaired.trimEnd().replace(/"\s*:\s*$/, '""');
      repaired += '}';
    } else {
      // Cualquier otro caso, cerramos llave.
      repaired += '}';
    }
  }

  // 4. Re-contar por las dudas, agregar lo que falte.
  const finalOpens = (repaired.match(/[\{\[]/g) ?? []).length;
  const finalCloses = (repaired.match(/[\}\]]/g) ?? []).length;
  for (let i = 0; i < finalOpens - finalCloses; i++) {
    repaired += '}';
  }

  // 5. Intentar parsear.
  try {
    const parsed = JSON.parse(repaired);
    if (parsed && typeof parsed === 'object' && parsed.items && typeof parsed.items === 'object') {
      return parsed as MultiItemAnalysisResult;
    }
    return null;
  } catch {
    return null;
  }
}