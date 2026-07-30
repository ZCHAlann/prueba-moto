// lib/ai/jarvis-stream.ts
// ─────────────────────────────────────────────────────────────────────
// Versión streaming del orquestador Jarvis.
//
// Diferencias con jarvis.ts:
//   - El tool-calling loop es idéntico (determinístico, server-side).
//   - Cuando llegamos a la respuesta final (msg.content no-vacío, sin
//     más tool_calls), la enviamos como chunks SSE al cliente.
//   - Antes de cada chunk mandamos un evento "tool" opcional con el
//     resumen de qué herramientas se usaron (para badges en UI).
//   - Al final mandamos "done" con metadata.
//
// Esto es el patrón estándar de copilots: el texto "aparece" en el
// cliente mientras el backend hace el trabajo duro.
// ─────────────────────────────────────────────────────────────────────

import Groq from 'groq-sdk';
import {
  GroqRateLimitError,
  detectRateLimit,
  createStreamingChatCompletion,
} from './groq-client';
import { getModel, getNextModelAfterRateLimit, switchToFallback } from './model-config';
import { db } from '../../db/client';
import { aiConversations, aiMessages, aiToolCalls } from '../../db/schema/jarvis';
import { eq, and, desc, sql } from 'drizzle-orm';
import { flattenArgs } from './schema-helpers';
import {
  getToolByName,
  runTool,
  resetTurnDedup,
  type ToolContext,
  type JarvisRole,
} from './tools/registry';
import {
  classifyToolsForQuestion,
  resolveToolsForLlm,
  resolveCurrentModule,
  buildLlmSchema,
} from './tools/intent-classifier';
import { startTurn, beginStage, recordStage, finishTurn } from './telemetry';
import { compressHistory } from './history-summarizer';
import { getGroqKeyForCompany, getGroqClientForCompany } from './client-factory';
import { buildUnifiedSystemPrompt } from './shared-prompt';

const MAX_ITERATIONS = 6;

// jul 2026 v8 — antes había un singleton con `process.env.GROQ_API_KEY`.
// Como tu `.env` usa la cascada `GROQ_API_KEY1..N` (no la legacy), ese
// singleton devolvía `null` aunque hubiera keys disponibles. Ahora el
// cliente se construye PER-REQUEST a partir del helper multi-tenant
// `getGroqClientForCompany(empresaId)`, que respeta la cascada
// (legacy + GROQ_API_KEY1..N). Sin cache porque la key de la empresa
// puede cambiar en runtime.
function getClient(empresaId: number): Promise<Groq | null> {
  return getGroqClientForCompany(empresaId);
}

// ─── System Prompt ─────────────────────────────────────────────────────
// jul 2026 v3 — Prompt unificado (ver ./shared-prompt.ts).
// El prompt local se removió porque ahora vive en shared-prompt.
// Antes el stream usaba un prompt minimalista (8 reglas, sin sección de
// capacidades ni modelo de datos). Ahora ambos orquestadores
// (jarvis.ts y jarvis-stream.ts) usan el mismo prompt completo, lo
// que mejora la calidad de las respuestas del stream sin penalizar
// tokens (el sistema lo cachea por conversación).

/** Wrapper de compat — el orquestador llama a buildSystemPrompt. */
function buildSystemPrompt(params: {
  userName: string;
  rol: string;
  empresaNombre: string;
  voiceMode?: boolean;
}): string {
  const prompt = buildUnifiedSystemPrompt({
    userName: params.userName,
    rol: params.rol,
    empresaNombre: params.empresaNombre,
    voiceMode: params.voiceMode,
  });
  // jul 2026 v3 — log del tamaño del prompt (~1 token por 4 chars en
  // español/inglés, así que es una estimación razonable). Útil para
  // verificar que las reducciones del prompt tengan efecto real.
  const approxTokens = Math.ceil(prompt.length / 4);
  // eslint-disable-next-line no-console
  console.log(`[jarvis-prompt] built: ${prompt.length} chars ≈ ${approxTokens} tokens (voiceMode=${!!params.voiceMode})`);
  return prompt;
}

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Convierte conversationId (string del frontend o numérico de DB) a
 * el integer que la columna serial espera. Devuelve null si inválido.
 */
function toIntId(id: string | number | null | undefined): number | null {
  if (id == null || id === '') return null;
  const n = typeof id === 'number' ? id : parseInt(String(id), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function ensureConversation(
  conversationId: string | null,
  empresaId: number,
  userId: number,
  userMessage: string,
): Promise<{ id: string; title: string }> {
  const incomingId = toIntId(conversationId);
  if (incomingId != null) {
    const [existing] = await db
      .select({ id: aiConversations.id, title: aiConversations.title })
      .from(aiConversations)
      .where(eq(aiConversations.id, incomingId))
      .limit(1);
    if (existing) return { id: String(existing.id), title: existing.title ?? '' };
  }
  // Crear nueva — el título es el primer mensaje truncado.
  // NOTA: aiConversations.id es `serial` (integer autoincrement), así
  // que NO le pasamos un id custom — dejamos que Postgres lo genere.
  const title = userMessage.length > 60 ? userMessage.slice(0, 57) + '...' : userMessage;
  const [created] = await db
    .insert(aiConversations)
    .values({
      empresaId,
      userId,
      title,
    })
    .returning({ id: aiConversations.id });
  // Drizzle devuelve number para serial; casteamos a string porque el
  // frontend trata conversationId como string opaco.
  return { id: String(created!.id), title };
}

async function loadHistory(conversationId: string, limit = 12) {
  const idNum = toIntId(conversationId) ?? 0;
  return db
    .select({
      id:      aiMessages.id,
      role:    aiMessages.role,
      content: aiMessages.content,
    })
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, idNum))
    .orderBy(desc(aiMessages.createdAt))
    .limit(limit)
    .then((rows) => rows.reverse());
}

// ─── SSE helpers ──────────────────────────────────────────────────────

interface SSESink {
  send(event: string, data: unknown): void;
}

/**
 * Ejecuta el chat y streamea la respuesta final al cliente.
 * @returns el id de conversación (cliente lo necesita para próximos turnos).
 */
export async function jarvisChatStream(
  input: {
    empresaId: number;
    userId: number;
    userName: string;
    rol: JarvisRole;
    empresaNombre: string;
    conversationId?: string | null;
    message: string;
    // jul 2026 v3 — modo voz: cuando viene del wake word / STT, el
    // prompt se ajusta para evitar markdown/tablas.
    voiceMode?: boolean;
    // jul 2026 v8.5 — cookieHeader y baseUrl para tools de acción
    // (crear finance request, etc.) que llaman al backend desde el
    // orquestador con la sesión del usuario.
    cookieHeader?: string;
    baseUrl?: string;
    // jul 2026 v3 — currentModule: si el frontend sabe en qué ruta
    // está el user (ej. /mantenimiento), lo manda. Sirve como
    // shortcut: NO clasificar, usar directamente las tools de ese
    // módulo + Capa 1.
    currentModule?: string | null;
  },
  sink: SSESink,
  ): Promise<string> {
  const client = await getClient(input.empresaId);
  const start = Date.now();
  // jul 2026 v3 — Inicializar telemetry al entrar al handler.
  startTurn();

  if (!client) {
    sink.send('error', { message: 'Asistente IA no configurado para esta empresa. Pedile a tu admin de empresa o al superadmin que configuren una API key.' });
    sink.send('done', { ok: false });
    return input.conversationId ?? '';
  }

  try {
    return await runJarvisStream(input, client, sink, start);
  } catch (err) {
    // Cualquier excepción interna (DB, Groq, lo que sea) se convierte
    // en evento SSE 'error' + 'done', sin propagarse. El endpoint
    // cierra el stream limpiamente sin necesidad de next(err).
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    // eslint-disable-next-line no-console
    console.error('[jarvisChatStream] error:', msg, err);
    try {
      sink.send('error', { message: msg });
      sink.send('done', { ok: false });
    } catch {
      // Sink ya cerrado — ignorar.
    }
    return input.conversationId ?? '';
  }
}

async function runJarvisStream(
  input: {
    empresaId: number;
    userId: number;
    userName: string;
    rol: JarvisRole;
    empresaNombre: string;
    conversationId?: string | null;
    message: string;
    // jul 2026 v3 — shortcut por módulo (no clasificar).
    currentModule?: string | null;
  },
  client: Groq,
  sink: SSESink,
  start: number,
): Promise<string> {
  // ── Stage 1: setup (DB) ─────────────────────────────────────────────
  const setupStage = beginStage('setup', 'ensureConv+insert+history', start);
  // 1) Asegurar conversación.
  const conv = await ensureConversation(
    input.conversationId ?? null,
    input.empresaId,
    input.userId,
    input.message,
  );
  // `convIdNum` es el id numérico para queries (la columna es serial int);
  // `convId` es el string que devolvemos al frontend (opaco).
  const convIdNum = parseInt(conv.id, 10);
  const convId    = conv.id;

  // 2) Persistir mensaje del usuario.
  await db.insert(aiMessages).values({
    conversationId: convIdNum,
    role: 'user',
    content: input.message,
  });

  // 3) Historial reciente.
  const orderedHistory = await loadHistory(convId);
  // jul 2026 v3 — Comprimir historial si hay más de 8 turnos. Reduce
  // el input de ~11k a ~5-6k tokens en conversaciones largas, lo que
  // baja el tiempo de respuesta del 120b. El LLM mantiene el contexto
  // porque el resumen conserva los datos concretos.
  const compressed = await compressHistory(convId, orderedHistory);
  setupStage.end({ convIdNum, historyLen: orderedHistory.length, compressedTo: compressed.recent.length });

  // 4) Construir mensajes para Groq.
  const messages: any[] = [
    { role: 'system', content: buildSystemPrompt(input) },
    // Si hay resumen, lo inyectamos como "system" extra (no es un
    // turno real, es contexto persistente). El LLM lo lee como
    // instrucciones, no como un turno del user.
    ...(compressed.summary
      ? [{ role: 'system', content: `CONTEXTO PREVIO DE ESTA CONVERSACIÓN (resumen automático):\n${compressed.summary}` }]
      : []),
    ...compressed.recent
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content })),
    // El último user message ya viene de la historia, no lo duplicamos.
  ];

  // Quitar el último user (porque ya está en la historia persistida).
  if (messages[messages.length - 1]?.role === 'user'
      && messages[messages.length - 1]?.content === input.message) {
    messages.pop();
  }
  messages.push({ role: 'user', content: input.message });

  // jul 2026 v3 — Clasificar la pregunta y resolver qué tools
  // necesita el 120b. Reduce el schema de 16k tokens a ~5-7k en
  // runtime. Si el clasificador falla, fallback a Capa 1 + Capa 2
  // completas (modo seguro).
  //
  // `currentModule` se pasa como PISTA al clasificador (no override)
  // porque el user puede preguntar sobre otro módulo estando en
  // otra ruta (ej. está en /flotas y pregunta por mantenimientos).
  const recentHistory = orderedHistory
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => `${m.role}: ${m.content}`)
    .slice(-2);
  const currentModuleHint = resolveCurrentModule(input.currentModule) ?? undefined;
  // ── Stage 2: classify (Groq clasificador o shortcut) ──────────────
  const classifyStage = beginStage('classify');
  const classified = await classifyToolsForQuestion({
    empresaId: input.empresaId,
    question: input.message,
    recentTurns: recentHistory,
    currentModule: currentModuleHint,
  });
  classifyStage.end({ module: classified.module, fromCache: classified.confidence === 1 && classified.reason.startsWith('Shortcut') });
  const selectedTools = resolveToolsForLlm(classified, input.rol);
  const groqTools = buildLlmSchema(selectedTools);
  // eslint-disable-next-line no-console
  console.log(
    `[jarvis-stream] classifier: module=${classified.module} ` +
    `tools=${selectedTools.length} (${classified.tools.length} from L2) ` +
    `needsWrite=${classified.needsWrite} reason="${classified.reason}"`,
  );

  const toolCtx: ToolContext = {
    empresaId: input.empresaId,
    userId: input.userId,
    rol: input.rol,
  };

  // 5) Tool-calling loop con streaming nativo de Groq.
  let finalAnswer = '';
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let assistantMsgId: string | null = null;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    // Stream nativo de Groq: cada delta llega palabra por palabra
    // del modelo real (no simulado). Si el modelo emite tool_calls,
    // esos vienen en un chunk con `finish_reason: 'tool_calls'`.
    let stream;
    let activeModel = getModel();
    // jul 2026 v3 — Cascada 2D pre-stream: el wrapper itera sobre
    // TODAS las keys × modelos hasta encontrar uno que no esté
    // rate-limiteado. Antes solo rotábamos de modelo, no de key, así
    // que 1 sola key rate-limiteada tumbaba al orquestador aunque
    // quedaran 5 keys sanas en la cascada.
    let cascadeResult: { model: string; keyIndex: number; fallbackUsed: boolean } | null = null;
    // ── Stage 3a: llm_create (espera al primer chunk) ────────────────
    const llmCreateStage = beginStage('llm_create');
    try {
      const result = await createStreamingChatCompletion(
        messages,
        {
          temperature: 0.2,
          max_tokens: 768,
          top_p: 0.9,
          tools: groqTools,
          tool_choice: 'auto',
          // Para que el último chunk incluya usage (tokens consumidos).
          stream_options: { include_usage: true },
        } as any,
      );
      stream = result.stream;
      activeModel = result.model;
      cascadeResult = result;
      llmCreateStage.end({ model: result.model, key: result.keyIndex, fallback: result.fallbackUsed });
      // Si el wrapper usó fallback, sincronizar el estado global para
      // que los próximos turnos (chat no-stream, otros requests) arranquen
      // desde la combinación que funcionó.
      if (result.fallbackUsed) {
        // eslint-disable-next-line no-console
        console.log(
          `[jarvis-stream] cascada 2D: usando key=${result.keyIndex} model=${result.model} (fallback de modelo)`,
        );
        switchToFallback();
        sink.send('fallback', { from: getModel(), to: result.model });
      } else if (result.keyIndex !== 0) {
        // eslint-disable-next-line no-console
        console.log(
          `[jarvis-stream] cascada 2D: usando key=${result.keyIndex} model=${result.model} (rotación de key)`,
        );
      }
    } catch (err) {
      llmCreateStage.end({ error: err instanceof Error ? err.message : 'unknown' });
      const rate = detectRateLimit(err);
      if (rate) {
        // Se agotaron TODAS las keys × modelos. El wrapper ya iteró
        // por toda la cascada. Informamos al usuario.
        const mins = Math.ceil(rate.retryAfterMs / 60_000);
        sink.send('error', {
          message: `El asistente recibió muchas solicitudes y alcanzó su límite en todas las keys configuradas. Volvé a intentarlo en ~${mins} minutos.`,
        });
        sink.send('done', { ok: false, conversationId: convId });
        return convId;
      } else {
        // Otro error técnico (red, parseo, etc.).
        // eslint-disable-next-line no-console
        console.error('[jarvis-stream] groq call failed:', err);
        sink.send('error', {
          message: 'No pude conectar con el asistente ahora mismo. Intentá de nuevo en unos segundos.',
        });
        sink.send('done', { ok: false, conversationId: convId });
        return convId;
      }
    }

    let streamedText = '';
    let finishReason: string | null = null;
    // Tool calls se acumulan por índice (Groq los emite por partes).
    const toolCallsAccum: Array<{
      id: string;
      function: { name: string; arguments: string };
    }> = [];

    // ── Stage 3b: llm_stream (recibir todos los chunks) ─────────────
    const llmStreamStage = beginStage('llm_stream');
    try {
      for await (const chunk of stream as any) {
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta ?? {};
        const fr = choice.finish_reason;
        if (fr) finishReason = fr;

        // Texto streaming.
        if (typeof delta.content === 'string' && delta.content.length > 0) {
          streamedText += delta.content;
          sink.send('chunk', { text: delta.content });
        }

        // Tool calls por partes.
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? toolCallsAccum.length;
            if (!toolCallsAccum[idx]) {
              toolCallsAccum[idx] = { id: '', function: { name: '', arguments: '' } };
            }
            if (tc.id)        toolCallsAccum[idx].id = tc.id;
            if (tc.function?.name)      toolCallsAccum[idx].function.name      += tc.function.name;
            // Acumular args internamente sin emitir SSE por cada delta.
            // (Antes emitíamos un evento 'tool_args' por chunk para que el
            // frontend mostrara "Construyendo argumentos…", pero eso
            // sumaba latencia perceptible por cada tool. El frontend ahora
            // solo muestra el gusanito animado mientras espera.)
            if (tc.function?.arguments) {
              toolCallsAccum[idx].function.arguments += tc.function.arguments;
            }
          }
        }

        // Token usage puede venir en chunk.usage (cuando stream_options.include_usage=true)
        // o en el último chunk. Lo acumulamos si está.
        if (chunk.usage) {
          totalTokensIn  += chunk.usage.prompt_tokens     ?? 0;
          totalTokensOut += chunk.usage.completion_tokens ?? 0;
        }
      }
    } catch (err) {
      // Si el stream fue interrumpido por rate limit, cambiamos el
      // modelo activo al fallback (los próximos turnos lo usarán)
      // y avisamos al usuario con un mensaje amable.
      const rate = detectRateLimit(err);
      if (rate) {
        const next = getNextModelAfterRateLimit();
        if (next) {
          switchToFallback();
          // eslint-disable-next-line no-console
          console.warn(`[jarvis-stream] rate limit durante stream, próximo turno usará ${next}`);
        }
        const mins = Math.ceil(rate.retryAfterMs / 60_000);
        sink.send('error', {
          message: `El asistente recibió muchas solicitudes y alcanzó su límite diario. Próximo turno usará el modelo de respaldo. Intentá de nuevo en ~${mins} minutos.`,
        });
      } else {
        // eslint-disable-next-line no-console
        console.error('[jarvis-stream] stream failed:', err);
        sink.send('error', {
          message: 'No pude conectar con el asistente ahora mismo. Intentá de nuevo en unos segundos.',
        });
      }
      sink.send('done', { ok: false, conversationId: convId });
      return convId;
    }

    const toolCalls = toolCallsAccum.filter((tc) => tc.id || tc.function.name);
    llmStreamStage.end({ tokensOut: totalTokensOut, chunks: streamedText.length > 0 ? 1 : 0 });

    // Caso 1: respuesta final (streaming).
    if (finishReason === 'stop' || (toolCalls.length === 0 && streamedText)) {
      finalAnswer = streamedText.trim();
      const latencyMs = Date.now() - start;

      // ── Stage 4: persist (DB, en background) ─────────────────────
      // Persistir en BACKGROUND para no bloquear el SSE 'done'.
      // El usuario ya recibió el texto vía chunks; los writes de DB
      // (assistant message + tokens acumulados) pueden esperar.
      const persistStart = Date.now();
      void persistAssistantTurn({
        convIdNum,
        content: finalAnswer,
        latencyMs,
        tokensIn: totalTokensIn,
        tokensOut: totalTokensOut,
      }).then((msgId) => {
        recordStage('persist', Date.now() - persistStart, 'assistant', { msgId });
        finishTurnContextual(start, convId, toolCallsAccum, totalTokensIn, totalTokensOut, cascadeResult);
        // Si el cliente necesita el messageId después (no por ahora),
        // podemos emitirlo. Por ahora solo logueamos si falla.
        assistantMsgId = msgId;
      }).catch((err) => {
        recordStage('persist', Date.now() - persistStart, 'assistant', { error: String(err) });
        finishTurnContextual(start, convId, toolCallsAccum, totalTokensIn, totalTokensOut, cascadeResult);
        // eslint-disable-next-line no-console
        console.error('[jarvis-stream] persistAssistantTurn failed:', err);
      });

      sink.send('done', {
        ok: true,
        conversationId: convId,
        latencyMs,
        tokensIn: totalTokensIn,
        tokensOut: totalTokensOut,
      });
      return convId;
    }

    // Hay tool_calls: ejecutar y devolver resultados al modelo.
    // Las tools sin dependencias entre sí corren EN PARALELO.
    // Reconstruimos el assistant message (vino en chunks) para el historial.
    messages.push({
      role: 'assistant',
      content: streamedText || null,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.function.name, arguments: tc.function.arguments },
      })),
    } as any);

    const toolResults = await Promise.all(
      toolCalls.map((tc) => executeToolCall(tc, input.rol, toolCtx)),
    );

    for (const r of toolResults) {
      // Persistir tool call. La columna `error` es varchar(200), así que
      // truncamos el mensaje para no romper el insert con un "value too long".
      // Además, si el insert falla por cualquier razón (DB caída, etc.), no
      // queremos tumbar el chat completo — logueamos y seguimos.
      try {
        await db.insert(aiToolCalls).values({
          conversationId: convIdNum,
          tool: r.toolName,
          arguments: r.arguments,
          resultCount: r.resultCount,
          resultSummary: r.resultSummary,
          latencyMs: r.latencyMs,
          error: truncateError(r.error),
        });
      } catch (persistErr) {
        // eslint-disable-next-line no-console
        console.error('[jarvis-stream] ai_tool_calls persist failed:', persistErr);
      }

      // Notificar al cliente qué tool se está usando (para badges).
      sink.send('tool', {
        name: r.toolName,
        latencyMs: r.latencyMs,
        resultCount: r.resultCount,
        ok: !r.error,
      });

      // Devolver resultado al modelo.
      messages.push({
        role: 'tool',
        tool_call_id: r.toolCallId,
        content: JSON.stringify(r.toolResult).slice(0, 16_000),
      });
    }
  }

  // Si agotamos iteraciones sin respuesta final.
  sink.send('chunk', { text: 'No pude completar la respuesta tras varios intentos. Intenta reformular la pregunta.' });
  sink.send('done', { ok: false, conversationId: convId });
  return convId;
}

// ─── Helper: ejecutar un tool call (reutilizado en paralelo) ──────────

interface ToolExecutionResult {
  toolCallId:    string;
  toolName:      string;
  arguments:     string;
  resultCount:   number | undefined;
  resultSummary: string | undefined;
  error:         string | null;
  latencyMs:     number;
  toolResult:    unknown;
}

// ─── Truncar mensaje de error a 200 chars (límite de la columna ai_tool_calls.error) ─

const ERROR_MAX_LEN = 200;
function truncateError(err: string | null | undefined): string | null {
  if (err == null) return null;
  const s = String(err);
  if (s.length <= ERROR_MAX_LEN) return s;
  return s.slice(0, ERROR_MAX_LEN - 3) + '...';
}

// ─── Telemetry: log de breakdown ───────────────────────────────────────
// jul 2026 v3 — Helper que cierra el turno y loguea el desglose de
// tiempos por etapa. Se llama desde el `then` y el `catch` del
// persistAssistantTurn (para que el log salga siempre, falle o no).
function finishTurnContextual(
  start: number,
  convId: string,
  toolCallsAccum: Array<{ id: string; function: { name: string; arguments: string } }>,
  totalTokensIn: number,
  totalTokensOut: number,
  cascadeResult: { model: string; keyIndex: number; fallbackUsed: boolean } | null,
) {
  const toolsExecuted = toolCallsAccum.filter((tc) => tc.id || tc.function.name).length;
  finishTurn({
    messageLen:      0, // se completa abajo en finishTurn helper
    conversationId:  convId,
    hasCurrentModule: false, // se infiere desde stages si hace falta
    shortcutUsed:    false, // idem
    toolsSelected:   0, // idem
    toolsExecuted,
    tokensIn:        totalTokensIn,
    tokensOut:       totalTokensOut,
    cascadeKey:      cascadeResult?.keyIndex ?? -1,
    cascadeModel:    cascadeResult?.model ?? 'unknown',
    fallbackUsed:    cascadeResult?.fallbackUsed ?? false,
  });
}

// ─── Persist en background ───────────────────────────────────────────────
// Inserta el mensaje del asistente y actualiza los totales de tokens de la
// conversación. Se ejecuta DESPUÉS de enviar el 'done' al cliente para no
// agregar latencia al round-trip visible. Si falla, el chat sigue
// funcionando — solo se pierde la persistencia de ESE turno.

async function persistAssistantTurn(args: {
  convIdNum: number;
  content: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
}): Promise<string | null> {
  try {
    const [ins] = await db.insert(aiMessages).values({
      conversationId: args.convIdNum,
      role: 'assistant',
      content: args.content,
      latencyMs: args.latencyMs,
      tokensIn: args.tokensIn,
      tokensOut: args.tokensOut,
    }).returning({ id: aiMessages.id });

    // Acumular tokens en la conversación.
    const [prevTotals] = await db
      .select({
        totalIn: sql<number>`COALESCE(${aiConversations.totalTokensIn}, 0)`,
        totalOut: sql<number>`COALESCE(${aiConversations.totalTokensOut}, 0)`,
      })
      .from(aiConversations)
      .where(eq(aiConversations.id, args.convIdNum))
      .limit(1);

    await db
      .update(aiConversations)
      .set({
        totalTokensIn:  (Number(prevTotals?.totalIn)  || 0) + args.tokensIn,
        totalTokensOut: (Number(prevTotals?.totalOut) || 0) + args.tokensOut,
        updatedAt: new Date(),
      })
      .where(eq(aiConversations.id, args.convIdNum));

    return ins?.id ?? null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[jarvis-stream] persistAssistantTurn error:', err);
    return null;
  }
}

async function executeToolCall(
  tc: { id: string; function: { name: string; arguments: string } },
  rol: JarvisRole,
  toolCtx: ToolContext,
): Promise<ToolExecutionResult> {
  const toolStart = Date.now();
  // jul 2026 v3 — Stage de telemetría: engloba todo el ciclo de
  // ejecución del tool (parse, validate, run, cache). El final se
  // registra en el catch o al final del try.
  const toolStage = beginStage('tool', tc.function.name, toolStart);
  // jul 2026 v8.6 — Instrumentación de tiempo por etapa. Mismo
  // formato que en jarvis.ts. Permite ver dónde se va la latencia.
  const stageStart = { parse: toolStart, validate: 0, run: 0 };
  const toolDef = getToolByName(tc.function.name);

  let resultCount: number | undefined;
  let resultSummary: string | undefined;
  let toolError: string | null = null;
  let toolResult: unknown;

  try {
    if (!toolDef) {
      toolError = 'tool_not_found';
      toolResult = { error: `Herramienta desconocida: ${tc.function.name}` };
    } else if (!toolDef.rolesPermitidos.includes(rol)) {
      toolError = 'forbidden_for_rol';
      toolResult = { error: `La herramienta "${tc.function.name}" no está disponible para tu rol.` };
    } else {
      const rawArgs = tc.function.arguments || '{}';
      let parsedArgs: unknown;
      try { parsedArgs = JSON.parse(rawArgs); } catch { parsedArgs = {}; }
      stageStart.validate = Date.now();

      // jul 2026 v8.6 — Pre-procesado defensivo de los args.
      // Ver el mismo bloque en jarvis.ts. Groq manda `null` en lugar
      // de omitir params opcionales, y Zod con `.optional()` rechaza
      // `null` (solo acepta `undefined`). Convertimos `null` → undefined,
      // `[]` → undefined y strings vacíos → undefined.
      if (parsedArgs && typeof parsedArgs === 'object' && !Array.isArray(parsedArgs)) {
        const obj = parsedArgs as Record<string, unknown>;
        for (const k of Object.keys(obj)) {
          if (obj[k] === null) {
            delete obj[k];
          } else if (Array.isArray(obj[k]) && (obj[k] as unknown[]).length === 0) {
            delete obj[k];
          } else if (typeof obj[k] === 'string' && (obj[k] as string).trim() === '') {
            delete obj[k];
          }
        }
      }

      let argsParsed = toolDef.schema.safeParse(parsedArgs);

      // Rescate 1: aplanar el objeto args por si el LLM envolvió los
      // filtros en objetos anidados.
      if (!argsParsed.success) {
        const flat = flattenArgs(parsedArgs);
        if (flat.stats.modified) {
          const retry = toolDef.schema.safeParse(flat.value);
          if (retry.success) {
            // eslint-disable-next-line no-console
            console.warn('[jarvis-stream] args rescued via flatten:', {
              tool: tc.function.name,
              rawArgs,
              rescuedKeys: flat.stats.extractedKeys,
            });
            argsParsed = retry;
          }
        }
      }

      // Rescate 2: si todo falla y todos los campos son opcionales,
      // intentar con args vacíos {}.
      if (!argsParsed.success) {
        const empty = toolDef.schema.safeParse({});
        if (empty.success) {
          // eslint-disable-next-line no-console
          console.warn('[jarvis-stream] args rescued via empty {}:', {
            tool: tc.function.name,
            rawArgs,
            issues: argsParsed.error.issues,
          });
          argsParsed = empty;
        } else {
          // eslint-disable-next-line no-console
          console.warn('[jarvis-stream] invalid_args (all rescues failed):', {
            tool: tc.function.name,
            rawArgs,
            parsed: parsedArgs,
            issues: argsParsed.error.issues,
          });
          toolResult = {
            error: 'Argumentos inválidos',
            details: argsParsed.error.flatten(),
          };
        }
      }
      if (argsParsed.success) {
        stageStart.run = Date.now();
        // Cache wrapper: si los args ya se consultaron hace <5min,
        // devolvemos el resultado cacheado sin tocar la DB.
        const { result, fromCache } = await runTool(tc.function.name, argsParsed.data, toolCtx);
        toolResult = result;
        resultCount = result.total;
        resultSummary = `${result.total} fila(s)` + (result.note ? ` — ${result.note}` : '');
        if (fromCache) toolError = null;
      }
    }
  } catch (err) {
    // jul 2026 — LOG: capturar la excepción completa para diagnosticar
    // por qué las tools de escritura fallan silenciosamente.
    // eslint-disable-next-line no-console
    console.error(`[jarvis:tool:EXCEPTION] ${tc.function.name} threw:`, err);
    if (err instanceof Error) {
      // eslint-disable-next-line no-console
      console.error(`[jarvis:tool:EXCEPTION] stack:`, err.stack);
    }
    toolError = err instanceof Error ? err.message : 'tool_threw';
    toolResult = { error: toolError };
  }

  // jul 2026 v8.6 — Log de tiempo por etapa. Mismo formato que
  // jarvis.ts. Permite identificar si la latencia está en el
  // parseo/validación (~ms) o en la ejecución real (~s).
  const parseMs    = stageStart.validate - stageStart.parse;
  const validateMs = stageStart.run - stageStart.validate;
  const execMs     = Date.now() - stageStart.run;
  // eslint-disable-next-line no-console
  console.log(
    `[jarvis:tool] ${tc.function.name} ` +
    `parse=${parseMs}ms validate=${validateMs}ms exec=${execMs}ms ` +
    `total=${Date.now() - toolStart}ms ` +
    (toolError ? `error=${toolError}` : `rows=${resultCount ?? 'n/a'}`),
  );

  // Cierre del stage de telemetría.
  toolStage.end({
    parseMs:    stageStart.validate - stageStart.parse,
    validateMs: stageStart.run    - stageStart.validate,
    runMs:      Date.now()         - stageStart.run,
    error:      toolError,
  });

  return {
    toolCallId:    tc.id,
    toolName:      tc.function.name,
    arguments:     tc.function.arguments,
    resultCount,
    resultSummary,
    error:         toolError,
    latencyMs:     Date.now() - toolStart,
    toolResult,
  };
}