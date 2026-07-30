// lib/ai/history-summarizer.ts
// ─────────────────────────────────────────────────────────────────────
// jul 2026 v3 — Compresor de historial conversacional.
//
// PROBLEMA: cada turno del asistente manda el historial completo
// (system prompt + ordered history). En conversaciones largas,
// el historial pesa 5-10k tokens. Eso encarece cada llamada y
// alenta al 120b.
//
// SOLUCIÓN: si hay más de `SUMMARY_THRESHOLD` turnos (default 4),
// resumir los más viejos en un párrafo corto usando el clasificador
// barato (gpt-oss-20b). El LLM principal solo ve:
//   [system prompt]
//   [resumen de turnos viejos]
//   [últimos N turnos completos]
//
// EFECTO ESPERADO:
//   - Turno 5+ de una conversación: input baja de 11k a 5-6k tokens.
//   - El LLM mantiene el contexto (entiende que se habló de X antes)
//     sin pagar el costo del historial completo.
//   - El resumen se cachea por conversación y se invalida cuando
//     llega un mensaje nuevo.
//
// CACHÉ:
//   - Key: `${conversationId}:${lastSummarizedMsgId}`.
//   - TTL: indefinido (se invalida explícitamente cuando hay
//     mensajes más nuevos).
//   - Invalida cuando el `lastMessageId` del resumen es < el último
//     mensaje en DB al momento de cargar.
// ─────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';
import { getClassifierGroqClient } from './client-factory';
import { getClassifier } from './model-config';

const SUMMARY_THRESHOLD = 4;   // Si hay más de 4 turnos, empezamos a resumir.
const KEEP_RECENT = 4;         // Cuántos turnos dejamos sin resumir.

interface HistoryEntry {
  role: string;
  content: string;
  id?: number;
}

const summaryCache = new Map<string, { summary: string; upToId: number; ts: number }>();

function cacheKey(convId: string, upToId: number): string {
  return createHash('sha256').update(`${convId}:${upToId}`).digest('hex').slice(0, 32);
}

const SUMMARIZER_PROMPT = `Sos un resumidor de historial conversacional.

Tu trabajo: tomar una lista de turnos (user/assistant) y producir un
resumen ejecutivo de máximo 200 palabras que conserve:

1. El tema principal de la conversación (ej. "el user preguntó sobre
   gastos de combustible de julio").
2. Los datos concretos clave que se mencionaron (números, IDs,
   vehículos por placa, fechas, estados). No inventes nada.
3. La última pregunta del usuario, si la hay.

NO incluyas: detalles del funcionamiento del asistente, nombres de
herramientas, frases de cortesía, ni meta-información.

Responde SOLO con el resumen, sin markdown, sin comillas, sin
"Resumen:" al inicio.`;

/**
 * Comprime el historial de una conversación.
 *
 * @param convId   ID de la conversación (para cache key).
 * @param entries  Historial completo (ya ordenado, más viejo → más nuevo).
 * @returns        `{ summary, recent }` donde `summary` es un string
 *                 con el resumen de los turnos viejos (o null si no
 *                 aplica), y `recent` son los últimos N turnos que
 *                 se mandan completos al LLM principal.
 */
export async function compressHistory(
  convId: string,
  entries: HistoryEntry[],
): Promise<{ summary: string | null; recent: HistoryEntry[] }> {
  if (entries.length <= SUMMARY_THRESHOLD + KEEP_RECENT) {
    // No hay suficiente historial para resumir. Devolver todo.
    return { summary: null, recent: entries };
  }

  const oldEntries = entries.slice(0, entries.length - KEEP_RECENT);
  const recent = entries.slice(-KEEP_RECENT);
  const lastOldId = oldEntries[oldEntries.length - 1]?.id ?? 0;

  // 1) Cache hit.
  const ck = cacheKey(convId, lastOldId);
  const cached = summaryCache.get(ck);
  if (cached) {
    return { summary: cached.summary, recent };
  }

  // 2) Construir el texto a resumir.
  const text = oldEntries
    .map((e) => `${e.role.toUpperCase()}: ${e.content}`)
    .join('\n\n');

  // 3) Llamar al clasificador (barato) para resumir.
  const client = await getClassifierGroqClient(0); // empresaId=0 usa solo la key del .env
  if (!client) {
    // Sin cliente, no resumir. Devolver todo y dejar que el LLM principal
    // cargue con el historial completo.
    return { summary: null, recent: entries };
  }

  try {
    const completion = await client.chat.completions.create({
      model: getClassifier(),
      messages: [
        { role: 'system', content: SUMMARIZER_PROMPT },
        { role: 'user', content: text },
      ],
      temperature: 0,
      max_tokens: 350,
    });
    const summary = completion.choices[0]?.message?.content?.trim() ?? '';
    if (summary.length > 0) {
      summaryCache.set(ck, { summary, upToId: lastOldId, ts: Date.now() });
    }
    return { summary: summary.length > 0 ? summary : null, recent };
  } catch (err) {
    // Si falla el resumidor, no rompe el flujo. Devolvemos todo el
    // historial y dejamos que el LLM principal lo maneje (con el
    // costo extra que eso implica).
    // eslint-disable-next-line no-console
    console.warn('[jarvis:history] summary failed, using full history:', err);
    return { summary: null, recent: entries };
  }
}

/** Invalida el cache de resúmenes (útil en tests). */
export function clearSummaryCache(): void {
  summaryCache.clear();
}
