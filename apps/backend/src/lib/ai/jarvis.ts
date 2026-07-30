// lib/ai/jarvis.ts
import Groq from 'groq-sdk';
import {
  createChatCompletion as groqCreate,
  getClient as getPlatformGroqClient,
  GroqRateLimitError,
} from './groq-client';
import { db } from '../../db/client';
import { aiConversations, aiMessages, aiToolCalls } from '../../db/schema/jarvis';
import { eq, and, desc } from 'drizzle-orm';
import {
  getToolByName,
  getToolsForRol,
  toolsToGroqSchema,
  runTool,
  type ToolContext,
  type JarvisRole,
} from './tools/registry';
import { incCounter, observeHistogram, incLabeledCounter } from './metrics';
import { flattenArgs } from './schema-helpers';
import { getClassifier as getClassifierModel, getModel as getActiveModel } from './model-config';
import {
  resolveAiConfig,
  getGroqClientForCompany,
  type ResolvedAiConfig,
} from './client-factory';
import { companyAiUsage } from '../../db/schema/platform';
import { sql } from 'drizzle-orm';
import { cleanForTts } from './text-clean';

const MAX_ITERATIONS = 6;

// â”€â”€â”€ Cliente singleton â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let _client: Groq | null = null;
function getClient(): Groq | null {
  if (_client) return _client;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey.trim().length < 10) return null;
  _client = new Groq({ apiKey });
  return _client;
}

export function isJarvisEnabled(): boolean {
  // jul 2026 v6 â€” multi-tenant.
  //
  // Esta funciÃ³n se conserva como chequeo GENÃ‰RICO (no por empresa) para
  // endpoints de admin / health-check que no tienen un `companyId` en el
  // request. Devuelve `true` si hay AL MENOS una key global disponible
  // (legacy `GROQ_API_KEY` o cualquiera de la cascada `GROQ_API_KEY1..N`).
  //
  // Para endpoints de empresa, usar `isJarvisEnabledForCompany(companyId)`
  // que respeta el override por empresa definido en `company_ai_settings`.
  return !!hasAnyGroqKey();
}

/** Â¿Hay al menos una key Groq disponible en el proceso?
 *  Chequea la var legacy Y la cascada 1-based (GROQ_API_KEY1..N). */
function hasAnyGroqKey(): boolean {
  const legacy = process.env.GROQ_API_KEY?.trim();
  if (legacy && legacy.length > 10) return true;

  // Cascada 1-based: GROQ_API_KEY1, GROQ_API_KEY2, â€¦, GROQ_API_KEY{N}
  const countStr = process.env.GROQ_API_KEY_COUNT?.trim();
  const count = countStr && /^\d+$/.test(countStr) ? Math.min(20, Number(countStr)) : 0;
  for (let i = 1; i <= Math.max(count, 1); i++) {
    const v = i === 1 && !process.env[`GROQ_API_KEY${i}`] && process.env.GROQ_API_KEY
      ? process.env.GROQ_API_KEY
      : process.env[`GROQ_API_KEY${i}`];
    if (v && v.trim().length > 10) return true;
  }
  return false;
}

/**
 * jul 2026 v6 â€” chequeo por empresa. Considera:
 *   1. Override de la empresa en `company_ai_settings` (si existe y estÃ¡
 *      enabled, Y provee una key propia O usa `platform_default` con
 *      `useJarvis = true`).
 *   2. Si NO hay override, usa la config global (keys del env) y
 *      devuelve `true` si hay keys disponibles.
 *
 * Devuelve `false` si la empresa estÃ¡ kill-switched por el superadmin
 * o si `useJarvis = false` en su config.
 */
export async function isJarvisEnabledForCompany(companyId: number): Promise<boolean> {
  try {
    const cfg = await resolveAiConfig(companyId);
    if (cfg.killed) return false;
    if (!cfg.useJarvis) return false;
    if (cfg.apiKey && cfg.apiKey.length > 10) return true;
    // Sin key de la empresa â†’ dependemos de las env vars globales.
    return hasAnyGroqKey();
  } catch {
    return hasAnyGroqKey();
  }
}

// jul 2026 v3 — Prompt unificado (ver ./shared-prompt.ts).
// El prompt local v8/v9 se removió porque ahora vive en shared-prompt.
import { buildUnifiedSystemPrompt } from "./shared-prompt";

/**
 * Wrapper de compat — el orquestador llama a `buildSystemPrompt`.
 * Delega al compartido.
 */
function buildSystemPrompt(params: {
  userName: string;
  rol: string;
  empresaNombre: string;
  voiceMode?: boolean;
}): string {
  return buildUnifiedSystemPrompt({
    userName: params.userName,
    rol: params.rol,
    empresaNombre: params.empresaNombre,
    voiceMode: params.voiceMode,
  });
}


// â”€â”€â”€ Tipos pÃºblicos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function toIntId(id: string | number | null | undefined): number | null {
  if (id == null || id === '') return null;
  const n = typeof id === 'number' ? id : parseInt(String(id), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}


export interface JarvisChatInput {
  empresaId: number;
  userId: number;
  userName: string;
  rol: JarvisRole;
  empresaNombre: string;
  conversationId?: string | null;
  message: string;
  voiceMode?: boolean;
  ephemeral?: boolean;
  cookieHeader?: string;
  baseUrl?: string;
  ephemeralHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface JarvisChatOutput {
  conversationId: string;
  answer: string;
  answerSpoken: string;
  latencyMs: number;
  tokensIn?: number;
  tokensOut?: number;
  noData: boolean;
  toolsUsed: Array<{ tool: string; latencyMs: number; resultCount?: number }>;
}

// â”€â”€â”€ Orquestador (loop iterativo de tool-calling) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function jarvisChat(input: JarvisChatInput): Promise<JarvisChatOutput> {
  const start = Date.now();

  const aiCfg = await resolveAiConfig(input.empresaId);
  if (aiCfg.killed) {
    throw new Error('La IA estÃ¡ deshabilitada para tu empresa por el administrador de plataforma.');
  }
  if (!aiCfg.useJarvis) {
    throw new Error('Jarvis no estÃ¡ habilitado para tu empresa. Pedile al admin que lo active en ConfiguraciÃ³n â†’ IA.');
  }

  const client = aiCfg.keySource === 'company'
    ? await getGroqClientForCompany(input.empresaId)
    : getPlatformGroqClient();
  const toolCtx: ToolContext = {
    empresaId: input.empresaId,
    userId:    input.userId,
    rol:       input.rol,
    cookieHeader: input.cookieHeader,
    baseUrl:      input.baseUrl || process.env.BACKEND_URL || 'http://localhost:5000',
  };

  const isEphemeral = !!input.ephemeral;
  let conversationIdNum: number | null = isEphemeral ? -1 : toIntId(input.conversationId);
  let wasConversationNew = false;
  if (!isEphemeral) {
    if (conversationIdNum != null) {
      const exists = await db
        .select({ id: aiConversations.id })
        .from(aiConversations)
        .where(and(eq(aiConversations.id, conversationIdNum), eq(aiConversations.empresaId, input.empresaId)))
        .limit(1);
      if (!exists.length) conversationIdNum = null;
    }
    if (conversationIdNum == null) {
      const [row] = await db
        .insert(aiConversations)
        .values({
          empresaId: input.empresaId,
          userId:    input.userId,
          title:     input.message.slice(0, 80),
        })
        .returning({ id: aiConversations.id });
      conversationIdNum = row!.id;
      wasConversationNew = true;
    }
  }
  const conversationId = isEphemeral ? '' : String(conversationIdNum);

  if (!isEphemeral) {
    await db.insert(aiMessages).values({
      conversationId: conversationIdNum!,
      role:    'user',
      content: input.message,
    });
  }

  let orderedHistory: Array<{ role: string; content: string }>;
  if (isEphemeral) {
    const hist = Array.isArray(input.ephemeralHistory) ? input.ephemeralHistory : [];
    orderedHistory = hist.slice(-12).map(m => ({
      role:    m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));
  } else {
    orderedHistory = (await db
        .select({ role: aiMessages.role, content: aiMessages.content })
        .from(aiMessages)
        .where(eq(aiMessages.conversationId, conversationIdNum!))
        .orderBy(desc(aiMessages.createdAt))
        .limit(12)).reverse();
  }

  if (!client) {
    const fallback = 'El asistente IA no estÃ¡ disponible en este momento. Configura GROQ_API_KEY en el servidor y reinicia.';
    await db.insert(aiMessages).values({
      conversationId: conversationIdNum!,
      role:    'assistant',
      content: fallback,
      latencyMs: 0,
      error:   'groq_disabled',
    });
    return {
      conversationId: conversationId!,
      answer: fallback,
      answerSpoken: fallback,
      latencyMs: Date.now() - start,
      noData: true,
      toolsUsed: [],
    };
  }

  const messages: any[] = [
    { role: 'system', content: buildSystemPrompt({
        userName:      input.userName,
        rol:           input.rol,
        empresaNombre: input.empresaNombre,
        voiceMode:     input.voiceMode ?? false,
    }) },
    ...orderedHistory
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: input.message },
  ];

  // jul 2026 v3 — Clasificar la pregunta y resolver qué tools
  // necesita el 120b. Misma lógica que en jarvis-stream.ts: reduce
  // el schema de 16k tokens a ~5-7k en runtime. Si el clasificador
  // falla, fallback a Capa 1 + Capa 2 completas (modo seguro).
  const recentHistory = orderedHistory
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => `${m.role}: ${m.content}`)
    .slice(-2);
  const classified = await classifyToolsForQuestion({
    empresaId: input.empresaId,
    question: input.message,
    recentTurns: recentHistory,
  });
  const selectedTools = resolveToolsForLlm(classified, input.rol);
  const groqTools = buildLlmSchema(selectedTools);
  console.log(
    `[jarvis] classifier: module=${classified.module} ` +
    `tools=${selectedTools.length} (${classified.tools.length} from L2) ` +
    `needsWrite=${classified.needsWrite} reason="${classified.reason}"`,
  );

  let answer = '';
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let lastError: string | null = null;
  const toolsUsed: JarvisChatOutput['toolsUsed'] = [];

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let completion;
    try {
      if (aiCfg.keySource === 'company' && client) {
        completion = await client.chat.completions.create({
          model:       aiCfg.modelPrimary,
          messages,
          temperature: 0.2,
          max_tokens:  1024,
          top_p:       0.9,
          tools:       groqTools,
          tool_choice: 'auto',
        });
      } else {
        completion = await groqCreate(messages, {
          temperature: 0.2,
          max_tokens: 1024,
          top_p: 0.9,
          tools: groqTools,
          tool_choice: 'auto',
        });
      }
    } catch (err) {
      incCounter('jarvis_chat_errors_total');
      if (err instanceof GroqRateLimitError) {
        const mins = Math.ceil(err.retryAfterMs / 60_000);
        lastError = 'rate_limit';
        answer = `El asistente recibiÃ³ muchas solicitudes en las Ãºltimas horas y alcanzÃ³ su lÃ­mite diario. VolvÃ© a intentarlo en ~${mins} minutos.`;
      } else {
        // eslint-disable-next-line no-console
        console.error('[jarvis] groq call failed:', err);
        lastError = 'groq_call_failed';
        answer = 'No pude conectar con el asistente ahora mismo. IntentÃ¡ de nuevo en unos segundos.';
      }
      break;
    }

    const choice = completion.choices[0];
    const msg = choice?.message;
    if (!msg) {
      answer = 'No recibÃ­ respuesta del modelo.';
      break;
    }

    totalTokensIn += completion.usage?.prompt_tokens ?? 0;
    totalTokensOut += completion.usage?.completion_tokens ?? 0;

    const toolCalls = (msg as any).tool_calls as Array<{
      id: string;
      function: { name: string; arguments: string };
    }> | undefined;

    if (!toolCalls || toolCalls.length === 0) {
      answer = (msg.content ?? '').trim();
      break;
    }

    messages.push(msg);

    const toolResults = await Promise.all(
      toolCalls.map((tc) => executeToolCall(tc, input.rol, toolCtx)),
    );

    for (const r of toolResults) {
      toolsUsed.push({ tool: r.toolName, latencyMs: r.latencyMs, resultCount: r.resultCount });
      observeHistogram('jarvis_tool_latency_ms', r.latencyMs);
      incLabeledCounter('jarvis_tool_invocations_total', { tool: r.toolName, ok: r.error ? 'false' : 'true' });
      if (!isEphemeral) {
        await db.insert(aiToolCalls).values({
          conversationId: conversationIdNum!,
          tool:           r.toolName,
          arguments:      r.arguments,
          resultCount:    r.resultCount,
          resultSummary:  r.resultSummary,
          latencyMs:      r.latencyMs,
          error:          r.error,
        });
      }
      messages.push({
        role: 'tool',
        tool_call_id: r.toolCallId,
        content: JSON.stringify(r.toolResult).slice(0, 16_000),
      });
    }

    // jul 2026 v9 â€” Refuerzo de anÃ¡lisis justo antes de la respuesta final.
    //
    // Los datos crudos de la tool que acaban de entrar (JSON, potencialmente
    // 16k caracteres) compiten en atenciÃ³n con el system prompt que quedÃ³
    // varios miles de tokens atrÃ¡s. Este mensaje corto, insertado
    // INMEDIATAMENTE despuÃ©s de los resultados y antes de pedirle al modelo
    // que redacte la respuesta final, contrarresta esa pÃ©rdida de atenciÃ³n
    // por distancia (el modelo "recuerda" mejor lo mÃ¡s reciente).
    //
    // Solo aplica en modo texto: en modo voz, voiceRules ya trae su propia
    // instrucciÃ³n equivalente ("resumÃ­, no listes uno por uno") y agregar
    // otra acÃ¡ serÃ­a redundante.
    if (!input.voiceMode) {
      messages.push({
        role: 'system',
        content:
          'Recordatorio: no repitas los datos crudos de arriba tal cual. ' +
          'Analizalos: destacÃ¡ el caso mÃ¡s urgente o atÃ­pico, agrupÃ¡ patrones si los ' +
          'hay, comparÃ¡ contra lo esperable, y si armÃ¡s una tabla mostrÃ¡ mÃ¡ximo ' +
          '5-8 filas relevantes (no todas) ofreciendo el resto bajo demanda.',
      });
    }

    if (iter === MAX_ITERATIONS - 1) {
      answer = 'No pude completar esta consulta porque requiere demasiados pasos. Â¿Puedes dividir la pregunta en partes mÃ¡s simples?';
      break;
    }
  }

  const latencyMs = Date.now() - start;
  incCounter('jarvis_chat_total');
  observeHistogram('jarvis_chat_latency_ms', latencyMs);
  incCounter('jarvis_tokens_in_total',  totalTokensIn);
  incCounter('jarvis_tokens_out_total', totalTokensOut);
  const noData = !answer || /no tengo informaciÃ³n suficiente/i.test(answer);
  if (!isEphemeral) {
    const [inserted] = await db
      .insert(aiMessages)
      .values({
        conversationId: conversationIdNum!,
        role:    'assistant',
        content: answer,
        latencyMs,
        tokensIn:  totalTokensIn  || null,
        tokensOut: totalTokensOut || null,
        error:     lastError,
      })
      .returning({ id: aiMessages.id });
    void inserted;
  }

  if (!isEphemeral) {
    if (totalTokensIn || totalTokensOut) {
      const [row] = await db
        .select({ ti: aiConversations.totalTokensIn, to: aiConversations.totalTokensOut })
        .from(aiConversations)
        .where(eq(aiConversations.id, conversationIdNum!))
        .limit(1);
      if (row) {
        await db
          .update(aiConversations)
          .set({
            totalTokensIn:  row.ti + (totalTokensIn  || 0),
            totalTokensOut: row.to + (totalTokensOut || 0),
            updatedAt:      new Date(),
          })
          .where(eq(aiConversations.id, conversationIdNum!));
      }
    } else {
      await db
        .update(aiConversations)
        .set({ updatedAt: new Date() })
        .where(eq(aiConversations.id, conversationIdNum!));
    }
  }

  if (totalTokensIn + totalTokensOut > 0) {
    try {
      await db.insert(companyAiUsage).values({
        companyId: input.empresaId,
        provider:  aiCfg.provider,
        model:     aiCfg.modelPrimary,
        feature:   'jarvis',
        tokensIn:  totalTokensIn,
        tokensOut: totalTokensOut,
        requests:  1,
        costUsd:   '0',
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[jarvis] no se pudo loguear usage:', e);
    }
  }

  if (wasConversationNew && answer) {
    setTimeout(() => {
      void (async () => {
        const title = await generateConversationTitle(
          input.message,
          answer,
          input.empresaId,
        );
        if (title) {
          try {
            await db
              .update(aiConversations)
              .set({ title })
              .where(eq(aiConversations.id, conversationIdNum!));
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[jarvis] no se pudo actualizar tÃ­tulo:', e);
          }
        }
      })();
    }, 0);
  }

  const cleanedAnswer = await  cleanForTts(answer);

  return {
    conversationId: conversationId!,
    answer:         cleanedAnswer,
    answerSpoken:   cleanedAnswer,
    latencyMs,
    tokensIn:  totalTokensIn  || undefined,
    tokensOut: totalTokensOut || undefined,
    noData,
    toolsUsed,
  };
}

async function generateConversationTitle(
  userMessage: string,
  assistantAnswer: string,
  empresaId: number,
): Promise<string> {
  try {
    const client = await getGroqClientForCompany(empresaId);
    if (!client) return '';
    const model = getClassifierModel();
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.3,
      max_tokens: 30,
      messages: [
        {
          role: 'system',
          content:
            'Genera un tÃ­tulo corto (3-5 palabras, mÃ¡ximo 60 caracteres) en espaÃ±ol ' +
            'que resuma la consulta del usuario. No uses comillas, no termines en punto. ' +
            'Solo devolvÃ© el tÃ­tulo, sin explicaciÃ³n.',
        },
        {
          role: 'user',
          content: `Usuario: ${userMessage.slice(0, 200)}\n\nAsistente: ${assistantAnswer.slice(0, 200)}`,
        },
      ],
    });
    const raw = (completion.choices[0]?.message?.content ?? '').trim();
    if (!raw) return '';
    let title = raw
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s+\.\s*$/, '')
      .replace(/\.+$/, '')
      .trim();
    if (title.length > 60) {
      title = title.slice(0, 60).replace(/\s+\S*$/, '') + 'â€¦';
    }
    return title;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[jarvis] auto-title failed:', e instanceof Error ? e.message : e);
    return '';
  }
}

export type ClassificationResult =
  | { kind: 'answer_directly'; reply: string }
  | { kind: 'passthrough' };

export async function classifyAndMaybeAnswer(
  message: string,
  ctx: { empresaId: number; userName: string; rol: JarvisRole; empresaNombre: string },
): Promise<ClassificationResult> {
  const trimmed = message.trim();
  if (!trimmed) {
    return { kind: 'answer_directly', reply: '' };
  }
  const trivial = /^(hola|buenas|buen[oa]s d[iÃ­]as|buen[oa]s tardes|buen[oa]s noches|hey|alo|al[oÃ³]|qu[eÃ©] tal|gracias|muchas gracias|ok|dale|listo|chau|adios|chao|nos vemos)/i;
  if (trivial.test(trimmed) && trimmed.length < 40) {
    const hora = new Date().getHours();
    const saludo = hora < 12 ? 'buenos dias' : hora < 19 ? 'buenas tardes' : 'buenas noches';
    return { kind: 'answer_directly', reply: saludo + ', ' + ctx.userName + '. En que te puedo ayudar?' };
  }
  return { kind: 'passthrough' };
}

export function listAvailableTools(rol: JarvisRole) {
  return getToolsForRol(rol).map((t) => ({
    name: t.name,
    description: t.description,
    category: t.category,
  }));
}

export async function listMyConversations(empresaId: number, userId: number) {
  return db
    .select({
      id: aiConversations.id,
      title: aiConversations.title,
      createdAt: aiConversations.createdAt,
      updatedAt: aiConversations.updatedAt,
    })
    .from(aiConversations)
    .where(and(eq(aiConversations.empresaId, empresaId), eq(aiConversations.userId, userId)))
    .orderBy(desc(aiConversations.updatedAt))
    .limit(50);
}

export async function getConversationMessages(conversationId: string, empresaId: number) {
  const idNum = toIntId(conversationId);
  if (idNum == null) return [];
  return db
    .select({
      id: aiMessages.id,
      role: aiMessages.role,
      content: aiMessages.content,
      latencyMs: aiMessages.latencyMs,
      createdAt: aiMessages.createdAt,
    })
    .from(aiMessages)
    .innerJoin(aiConversations, eq(aiMessages.conversationId, aiConversations.id))
    .where(and(eq(aiConversations.id, idNum), eq(aiConversations.empresaId, empresaId)))
    .orderBy(aiMessages.createdAt);
}

interface ToolExecutionResult {
  toolCallId:   string;
  toolName:     string;
  arguments:    string;
  resultCount:  number | undefined;
  resultSummary: string | undefined;
  error:        string | null;
  latencyMs:    number;
  toolResult:   unknown;
}

async function executeToolCall(
  tc: { id: string; function: { name: string; arguments: string } },
  rol: JarvisRole,
  toolCtx: ToolContext,
): Promise<ToolExecutionResult> {
  const toolStart = Date.now();
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
      toolResult = { error: `La herramienta "${tc.function.name}" no estÃ¡ disponible para tu rol.` };
    } else {
      const rawArgs = tc.function.arguments || '{}';
      let parsedArgs: unknown;
      try { parsedArgs = JSON.parse(rawArgs); } catch { parsedArgs = {}; }
      stageStart.validate = Date.now();

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

      if (!argsParsed.success) {
        const flat = flattenArgs(parsedArgs);
        if (flat.stats.modified) {
          const retry = toolDef.schema.safeParse(flat.value);
          if (retry.success) {
            // eslint-disable-next-line no-console
            console.warn('[jarvis] args rescued via flatten:', {
              tool: tc.function.name,
              rawArgs,
              rescuedKeys: flat.stats.extractedKeys,
            });
            argsParsed = retry;
          }
        }
      }

      if (!argsParsed.success) {
        const empty = toolDef.schema.safeParse({});
        if (empty.success) {
          // eslint-disable-next-line no-console
          console.warn('[jarvis] args rescued via empty {}:', {
            tool: tc.function.name,
            rawArgs,
            issues: argsParsed.error.issues,
          });
          argsParsed = empty;
        } else {
          // eslint-disable-next-line no-console
          console.warn('[jarvis] invalid_args (all rescues failed):', {
            tool: tc.function.name,
            rawArgs,
            parsed: parsedArgs,
            issues: argsParsed.error.issues,
          });
          toolResult = {
            error: 'Argumentos invÃ¡lidos',
            details: argsParsed.error.flatten(),
          };
        }
      }
      if (argsParsed.success) {
        stageStart.run = Date.now();
        const { result, fromCache } = await runTool(tc.function.name, argsParsed.data, toolCtx);
        toolResult = result;
        resultCount = result.total;
        resultSummary = `${result.total} fila(s)` + (result.note ? ` â€” ${result.note}` : '');
        if (fromCache) toolError = null;
      }
    }
  } catch (err) {
    toolError = err instanceof Error ? err.message : 'tool_threw';
    toolResult = { error: toolError };
  }

  const parseMs   = stageStart.validate - stageStart.parse;
  const validateMs = stageStart.run - stageStart.validate;
  const execMs    = Date.now() - stageStart.run;
  // eslint-disable-next-line no-console
  console.log(
    `[jarvis:tool] ${tc.function.name} ` +
    `parse=${parseMs}ms validate=${validateMs}ms exec=${execMs}ms ` +
    `total=${Date.now() - toolStart}ms ` +
    (toolError ? `error=${toolError}` : `rows=${resultCount ?? 'n/a'}`),
  );

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