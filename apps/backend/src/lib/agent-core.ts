// lib/agent-core.ts
// ─────────────────────────────────────────────────────────────────────
// Agent Core del Asistente IA Transversal.
//
// Coherente con el doc arquitectura sección 1 y 2. Implementa el ciclo:
//   PERCIBIR  → toma un evento de agent_events (vía claimNext)
//   RAZONAR   → llama a Ollama (qwen2.5:1.5b en CPU) con un prompt que
//               combina: system prompt + contexto del evento + catálogo
//               de tools (8 ya implementadas, 342 por hacer del catálogo)
//   ACTUAR    → ejecuta tools (lectura: getVehiculos etc.) o propone
//               acciones de escritura (que quedan en agent_action_proposals)
//   REGISTRAR → escribe en agent_audit_log en cada etapa
//
// jul 2026 v10 — Conectado a las 8 tools de lib/ai/tools/registry.ts.
// El LlmCaller ahora hace un LOOP de tool-calling: el LLM pide una tool,
// la ejecutamos, le devolvemos el resultado, y el LLM decide si seguir
// llamando más tools o dar una respuesta final.
//
// Diseño:
//   - Funciones inyectables: el caller pasa una implementación de
//     `llmCaller` (default: ollamaClient). Esto permite testear sin Ollama.
//   - processEvent() es la unidad mínima: un evento, un ciclo, terminado.
//   - runAgentLoop() es el loop continuo: claimNext en loop infinito
//     hasta que se llame stop() o haya error fatal.
// ─────────────────────────────────────────────────────────────────────

import { claimNext, markProcessed, markFailed, type AgentEventRow } from './agent-event-bus';
import { recordAudit, startAuditTimer, type RiskLevel } from './agent-audit';
import { proposeAction } from './agent-action-proposals';
import { ollamaChat, type OllamaChatMessage } from './ai/ollama-client';
import {
  TOOL_REGISTRY,
  getToolByName,
  runTool,
  type ToolContext,
} from './ai/tools/registry';

// ─── Types ────────────────────────────────────────────────────────────

/**
 * Lo que el LLM puede "decidir" cuando razona sobre un evento.
 */
export type AgentDecision =
  | { type: 'respond';          response: string;                                reasoning?: string }
  | { type: 'propose_action';   actionType: string; summary: string;            riskLevel: RiskLevel; httpMethod?: string; httpPath?: string; httpBody?: Record<string, unknown>; reasoning?: string }
  | { type: 'ignore';           reason: string;                                  reasoning?: string };

/** Interface del LLM. Inyectable para tests. */
export interface LlmCaller {
  /**
   * Razonar sobre un evento. Devuelve la decisión del agente.
   * Puede llamar tools internamente antes de decidir.
   * Tira si el LLM no responde o devuelve JSON inválido tras N intentos.
   */
  reason(params: {
    systemPrompt: string;
    event: AgentEventRow;
    toolContext: ToolContext;
  }): Promise<AgentDecision>;
}

// ─── Helpers para el loop de tool-calling ─────────────────────────────

/** Construye el catálogo de tools en formato "texto" que Ollama entiende. */
function buildToolsDescription(): string {
  const lines: string[] = [];
  for (const t of TOOL_REGISTRY) {
    const sig = t.schema
      ? extractShapeFromZod(t.schema)
      : '(sin schema)';
    lines.push(`- ${t.name}(${sig}): ${t.description.split('.')[0]}.`);
  }
  return lines.join('\n');
}

/**
 * Extrae un shape legible del Zod schema. No es un JSON Schema completo,
 * solo un hint para que el LLM sepa qué keys pasar.
 */
function extractShapeFromZod(schema: any): string {
  try {
    const def = schema?._def ?? schema?._zod?.def ?? {};
    if (def.type !== 'object') return '()';
    const shape = def.shape ?? {};
    const keys = Object.keys(shape);
    if (keys.length === 0) return '()';
    return `{ ${keys.join(', ')} }`;
  } catch {
    return '()';
  }
}

/**
 * Extrae la primera tool call que el LLM pidió del response.
 * Soporta dos formatos:
 *   1) JSON puro: `{"tool": "getVehiculos", "args": {...}}`
 *   2) JSON envuelto en markdown: ```json\n{...}\n```
 * Devuelve null si no hay tool call.
 */
function extractToolCall(text: string): { name: string; args: Record<string, unknown> } | null {
  // Buscar el primer objeto JSON en el texto.
  const fenceStart = text.indexOf('```');
  let candidate = text;
  if (fenceStart !== -1) {
    const fenceEnd = text.indexOf('```', fenceStart + 3);
    if (fenceEnd !== -1) {
      candidate = text.slice(fenceStart + 3, fenceEnd);
      // Quitar 'json' si está al principio
      candidate = candidate.replace(/^json\s*/i, '').trim();
    }
  }

  // Encontrar el primer {...} balanceado.
  const firstBrace = candidate.indexOf('{');
  if (firstBrace === -1) return null;
  let depth = 0;
  let end = -1;
  for (let i = firstBrace; i < candidate.length; i++) {
    if (candidate[i] === '{') depth++;
    else if (candidate[i] === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) return null;

  const jsonStr = candidate.slice(firstBrace, end + 1);
  try {
    const obj = JSON.parse(jsonStr);
    if (typeof obj.tool === 'string') {
      return { name: obj.tool, args: (obj.args ?? {}) as Record<string, unknown> };
    }
  } catch {
    return null;
  }
  return null;
}

/** Extrae la decisión final del JSON del LLM (mismo formato que extractToolCall). */
function extractFinalDecision(text: string): AgentDecision | null {
  // Buscar el ÚLTIMO objeto JSON en el texto (puede haber varios si el LLM
  // divagó). Si no, el primero.
  const matches: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (text[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        matches.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  // Buscar el primer JSON que tenga "type" válido y campos esperados.
  for (const jsonStr of matches) {
    try {
      const obj = JSON.parse(jsonStr);
      if (obj.type === 'respond' && typeof obj.response === 'string') {
        return { type: 'respond', response: obj.response, reasoning: obj.reasoning };
      }
      if (obj.type === 'propose_action'
          && typeof obj.actionType === 'string'
          && typeof obj.summary === 'string') {
        return {
          type: 'propose_action',
          actionType: obj.actionType,
          summary: obj.summary,
          riskLevel: (obj.riskLevel as RiskLevel) ?? 'medium',
          httpMethod: obj.httpMethod,
          httpPath: obj.httpPath,
          httpBody: obj.httpBody,
          reasoning: obj.reasoning,
        };
      }
      if (obj.type === 'ignore' && typeof obj.reason === 'string') {
        return { type: 'ignore', reason: obj.reason, reasoning: obj.reasoning };
      }
    } catch {
      continue;
    }
  }
  return null;
}

// ─── LlmCaller por defecto: usa Ollama + las 8 tools ─────────────────

/** Máximo de iteraciones del loop de tool-calling. */
const MAX_TOOL_ITERATIONS = 3;

export const defaultLlmCaller: LlmCaller = {
  async reason({ systemPrompt, event, toolContext }) {
    const model = process.env.OLLAMA_MODEL ?? 'qwen2.5:1.5b';

    // System prompt con el catálogo de tools inline.
    const toolsDesc = buildToolsDescription();
    const fullSystemPrompt = `${systemPrompt}

HERRAMIENTAS DISPONIBLES (solo lectura, devuelven datos reales de la BD):
${toolsDesc}

FORMATO DE RESPUESTA (respondé SOLO con este JSON, sin texto antes/después):
{
  "tool": "getVehiculos",         // nombre de la tool (opcional)
  "args": { "estado": "Operativo" },  // argumentos de la tool (opcional)
  "type": "respond" | "propose_action" | "ignore",   // decisión final
  "response": "Hay 5 vehículos operativos",   // si type=respond
  "actionType": "schedule_maintenance",         // si type=propose_action
  "summary": "Agendar mantenimiento",           // si type=propose_action
  "riskLevel": "low|medium|high",               // si type=propose_action
  "httpMethod": "POST",                         // si type=propose_action
  "httpPath": "/api/company/X/...",              // si type=propose_action
  "httpBody": { ... },                          // si type=propose_action
  "reason": "no amerita acción",                // si type=ignore
  "reasoning": "explicá tu decisión en 1 frase"  // SIEMPRE
}

CÓMO DECIDIR EL "type" FINAL (cuando ya tenés datos de tools):
- type="respond" si podés responder con info de los datos (NO es acción de escritura).
  → Para "lista los vehículos", "cuántos hay", "qué conductores vencen licencia", etc.
- type="propose_action" SOLO si requiere CREAR/EDITAR/BORRAR algo en la BD.
  → Para "agendar mantenimiento", "marcar como completado", "enviar email", etc.
- type="ignore" si la pregunta no aplica o no entendés.

IMPORTANTE: las tools del catálogo son TODAS de SOLO LECTURA. Si la pregunta es de lectura,
NUNCA uses "propose_action" — usá "respond" con la información que sacaste de la tool.
"propose_action" es SOLO para acciones de escritura que vos describas en httpMethod/Path/Body.
}

REGLAS:
1. Si necesitás datos de la BD, primero listá las tools que querés usar en "tool" (1 sola por turno). Yo las ejecuto y te devuelvo los resultados.
2. Si ya podés decidir, NO incluyas "tool". Solo "type" + los campos relevantes.
3. "type=respond" si podés responder con info (no modifica datos).
4. "type=propose_action" si requiere crear/editar/borrar (con httpMethod/Path/Body correctos).
5. "type=ignore" si no amerita acción.
6. Respondé SIEMPRE con JSON puro, sin markdown ni backticks.
7. "reasoning" SIEMPRE requerido, max 1 frase.`;

    // Mensaje inicial con el evento.
    const initialUserPrompt = `EVENTO RECIBIDO:
- type: ${event.eventType}
- source: ${event.source}
- priority: ${event.priority}
- payload: ${JSON.stringify(event.payload)}

Respondé con el JSON de decisión. Si necesitás datos, pedí UNA tool primero. Si ya podés decidir, dame la decisión final directa.`;

    const messages: OllamaChatMessage[] = [
      { role: 'system', content: fullSystemPrompt },
      { role: 'user',   content: initialUserPrompt },
    ];

    // Loop de tool-calling (max 3 iteraciones para no quemar tokens en CPU).
    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
      const res = await ollamaChat({
        model,
        messages,
        options: {
          temperature: 0.1,
          num_predict: 400,
        },
      });

      const text = (res.message?.content ?? '').trim();
      if (!text) {
        return { type: 'ignore', reason: 'LLM devolvió respuesta vacía', reasoning: 'Sin contenido' };
      }

      // Intentar parsear la respuesta como un único JSON.
      let obj: any;
      try {
        // Extraer el primer {...} balanceado.
        const first = text.indexOf('{');
        if (first === -1) {
          throw new Error('No hay JSON en el response');
        }
        let depth = 0, end = -1;
        for (let i = first; i < text.length; i++) {
          if (text[i] === '{') depth++;
          else if (text[i] === '}') {
            depth--;
            if (depth === 0) { end = i; break; }
          }
        }
        if (end === -1) throw new Error('JSON no balanceado');
        obj = JSON.parse(text.slice(first, end + 1));
      } catch (parseErr) {
        // Forzar reformulación.
        messages.push({ role: 'assistant', content: text });
        messages.push({
          role: 'user',
          content: `No pude parsear tu respuesta como JSON. Por favor respondé SOLO con un JSON válido con el formato que te di.`,
        });
        continue;
      }

      // ─── FASE 1: ¿Hay decisión final válida? ──────────────────────
      // Chequeamos ANTES de ejecutar tools. Si el LLM ya tiene type
      // válido, retornamos sin ejecutar más tools.
      if (obj.type === 'respond' && typeof obj.response === 'string') {
        return { type: 'respond', response: obj.response, reasoning: obj.reasoning };
      }
      if (obj.type === 'ignore' && typeof obj.reason === 'string') {
        return { type: 'ignore', reason: obj.reason, reasoning: obj.reasoning };
      }

      // ─── FASE 2: ¿propose_action con tool de lectura? ──────────────
      // Si el LLM dijo "propose_action" pero con actionType = una tool
      // de SOLO LECTURA del registry, lo convertimos automáticamente a
      // "respond" + ejecutamos la tool nosotros. Esto evita que el
      // LLM confunda "pedir datos" con "acción de escritura".
      if (obj.type === 'propose_action' && typeof obj.actionType === 'string') {
        const tool = getToolByName(obj.actionType);
        if (tool) {
          const args = (obj.args ?? obj.httpBody ?? {}) as Record<string, unknown>;
          const { result } = await runTool(obj.actionType, args, toolContext);
          const resultStr = JSON.stringify(result).slice(0, 2000);
          const summary = obj.summary
            ?? `Resultado de ${obj.actionType}: ${result.total ?? '?'} fila(s).`;
          return {
            type: 'respond',
            response: `${summary}\n\n${resultStr}`,
            reasoning: `El LLM pidió "${obj.actionType}" como acción; el código la ejecutó como lectura y devolvió el resultado.`,
          };
        }
      }

      // ─── FASE 3: ¿propose_action de escritura real? ────────────────
      if (obj.type === 'propose_action'
          && typeof obj.actionType === 'string'
          && typeof obj.summary === 'string') {
        return {
          type: 'propose_action',
          actionType: obj.actionType,
          summary: obj.summary,
          riskLevel: (obj.riskLevel as RiskLevel) ?? 'medium',
          httpMethod: obj.httpMethod,
          httpPath: obj.httpPath,
          httpBody: obj.httpBody,
          reasoning: obj.reasoning,
        };
      }

      // ─── FASE 4: ¿pidió una tool? Ejecutar y volver a iterar. ──────
      // Solo llegamos acá si NO hay decisión válida todavía.
      if (obj.tool && typeof obj.tool === 'string') {
        const tool = getToolByName(obj.tool);
        if (!tool) {
          messages.push({ role: 'assistant', content: text });
          messages.push({
            role: 'user',
            content: `Tool "${obj.tool}" no existe. Las disponibles son: ${toolsDesc}. Reformulá.`,
          });
          continue;
        }

        const args = (obj.args ?? {}) as Record<string, unknown>;
        const { result, fromCache } = await runTool(obj.tool, args, toolContext);
        const resultStr = JSON.stringify(result).slice(0, 3000);

        // Agregar resultado al contexto y volver a iterar.
        messages.push({ role: 'assistant', content: text });
        messages.push({
          role: 'user',
          content: `RESULTADO de ${obj.tool} (${fromCache ? 'cache' : 'fresh'}, ${result.total ?? '?'} filas):\n${resultStr}\n\n${result.note ?? ''}\n\nAhora dame la decisión final (solo type + campos relevantes, SIN tool).`,
        });
        continue;
      }
      if (obj.type === 'ignore' && typeof obj.reason === 'string') {
        return { type: 'ignore', reason: obj.reason, reasoning: obj.reasoning };
      }

      // ─── SEGUNDO: si pidió una tool, ejecutar. ─────────────────────
      // Solo llegamos acá si NO hay decisión válida todavía.
      if (obj.tool && typeof obj.tool === 'string') {
        const tool = getToolByName(obj.tool);
        if (!tool) {
          messages.push({ role: 'assistant', content: text });
          messages.push({
            role: 'user',
            content: `Tool "${obj.tool}" no existe. Las disponibles son: ${toolsDesc}. Reformulá.`,
          });
          continue;
        }

        const args = (obj.args ?? {}) as Record<string, unknown>;
        const { result, fromCache } = await runTool(obj.tool, args, toolContext);
        const resultStr = JSON.stringify(result).slice(0, 3000);

        // Agregar resultado al contexto y volver a iterar.
        messages.push({ role: 'assistant', content: text });
        messages.push({
          role: 'user',
          content: `RESULTADO de ${obj.tool} (${fromCache ? 'cache' : 'fresh'}, ${result.total ?? '?'} filas):\n${resultStr}\n\n${result.note ?? ''}\n\nAhora dame la decisión final (solo type + campos relevantes, SIN tool).`,
        });
        continue;
      }

      // No pidió tool → es decisión final. Validar.
      if (obj.type === 'respond' && typeof obj.response === 'string') {
        return { type: 'respond', response: obj.response, reasoning: obj.reasoning };
      }

      // ─── FALLBACK INTELIGENTE ────────────────────────────────────
      // Si el LLM dijo "propose_action" con actionType = una tool de SOLO
      // LECTURA del registry, lo convertimos automáticamente a "respond" +
      // ejecutamos la tool nosotros. Esto evita que el LLM confunda
      // "pedir datos" con "acción de escritura".
      if (obj.type === 'propose_action' && typeof obj.actionType === 'string') {
        const tool = getToolByName(obj.actionType);
        if (tool) {
          // La tool existe y (en Fase 1) todas son de solo lectura.
          // La ejecutamos y devolvemos el resultado como respond.
          const args = (obj.args ?? obj.httpBody ?? {}) as Record<string, unknown>;
          const { result, fromCache } = await runTool(obj.actionType, args, toolContext);
          const resultStr = JSON.stringify(result).slice(0, 2000);
          const summary = obj.summary
            ?? `Resultado de ${obj.actionType}: ${result.total ?? '?'} fila(s).`;
          return {
            type: 'respond',
            response: `${summary}\n\n${resultStr}`,
            reasoning: `El LLM pidió "${obj.actionType}" como acción; el código la ejecutó como lectura y devolvió el resultado.`,
          };
        }
      }

      if (obj.type === 'propose_action'
          && typeof obj.actionType === 'string'
          && typeof obj.summary === 'string') {
        return {
          type: 'propose_action',
          actionType: obj.actionType,
          summary: obj.summary,
          riskLevel: (obj.riskLevel as RiskLevel) ?? 'medium',
          httpMethod: obj.httpMethod,
          httpPath: obj.httpPath,
          httpBody: obj.httpBody,
          reasoning: obj.reasoning,
        };
      }
      if (obj.type === 'ignore' && typeof obj.reason === 'string') {
        return { type: 'ignore', reason: obj.reason, reasoning: obj.reasoning };
      }

      // El LLM devolvió un JSON pero sin los campos esperados.
      messages.push({ role: 'assistant', content: text });
      messages.push({
        role: 'user',
        content: `Tu JSON no tiene "type" válido. Recordá: solo "respond", "propose_action" o "ignore". Si necesitás datos, primero pedí una "tool". Reformulá.`,
      });
    }

    // Si agotamos las iteraciones, devolver ignore.
    return {
      type: 'ignore',
      reason: `Loop agotó ${MAX_TOOL_ITERATIONS} iteraciones sin decisión final`,
      reasoning: 'El LLM no logró converger',
    };
  },
};

// ─── System prompt ───────────────────────────────────────────────────

/**
 * System prompt base del Agent Core. El `defaultLlmCaller` lo extiende
 * con la lista de tools y el modo tool-calling.
 */
export function buildAgentSystemPrompt(opts: { empresaNombre?: string } = {}): string {
  return `Eres el Agent Core de Motors ApliSmart${opts.empresaNombre ? ` (empresa: "${opts.empresaNombre}")` : ''}.

Tu trabajo: recibir EVENTOS del sistema y actuar sobre ellos usando herramientas reales.

REGLAS ESTRICTAS:
1. NUNCA inventes datos. Si no sabés, "ignore".
2. Si el usuario/admin pide información, usá las herramientas para obtenerla.
3. Si pide una acción de escritura (crear/editar/borrar), respondé con "propose_action" para que un humano la confirme.
4. riskLevel="high" SOLO para acciones irreversibles (DELETE).
5. Respondé SIEMPRE en JSON puro.`;
}

// ─── processEvent (la unidad mínima) ─────────────────────────────────

export interface ProcessEventOptions {
  llmCaller?: LlmCaller;
  /** Si true, no ejecuta acciones (dry-run). Solo registra en audit. */
  dryRun?:   boolean;
  /** system prompt override. Default: buildAgentSystemPrompt(). */
  systemPrompt?: string;
}

/**
 * Procesa UN evento: claim → razonar (con tools) → actuar → registrar.
 */
export async function processEvent(opts: ProcessEventOptions = {}): Promise<number | null> {
  const llm = opts.llmCaller ?? defaultLlmCaller;
  const systemPrompt = opts.systemPrompt ?? buildAgentSystemPrompt();

  // 1) PERCIBIR — tomar un evento de la cola.
  const event = await claimNext({ lockTtlMs: 120_000 });
  if (!event) return null;

  // Construir el ToolContext: agentId SIEMPRE del evento, userId=0 (system actor).
  const toolContext: ToolContext = {
    empresaId: event.agentId ?? 0,
    userId: 0,        // system actor (no es un user específico)
    rol: 'admin_empresa',  // permisos de admin por default; el LLM solo lee
  };

  // 2) REGISTRAR "perceived".
  const finishPerceived = startAuditTimer({
    agentId: event.agentId,
    eventId: event.id,
    stage:   'perceived',
    correlationId: event.correlationId,
  });

  try {
    // 3) RAZONAR (con tool-calling).
    const finishReasoned = startAuditTimer({
      agentId: event.agentId,
      eventId: event.id,
      stage:   'reasoned',
      correlationId: event.correlationId,
    });

    let decision: AgentDecision;
    try {
      decision = await llm.reason({ systemPrompt, event, toolContext });
    } catch (llmErr) {
      const errMsg = llmErr instanceof Error ? llmErr.message : String(llmErr);
      await finishReasoned({ stage: 'failed', error: `LLM error: ${errMsg}` });
      await markFailed(event.id, errMsg, { requeue: event.claimAttempts < 3 });
      await finishPerceived({ stage: 'failed', error: `Razonar falló: ${errMsg}` });
      return event.id;
    }

    await finishReasoned({
      stage:     'reasoned',
      reasoning: decision.reasoning ?? `Decisión: ${decision.type}`,
    });

    // 4) ACTUAR.
    const finishActed = startAuditTimer({
      agentId: event.agentId,
      eventId: event.id,
      stage:   'acted',
      correlationId: event.correlationId,
    });

    if (opts.dryRun) {
      await finishActed({ stage: 'system', reasoning: `dryRun: hubiera actuado ${decision.type}` });
    } else if (decision.type === 'ignore') {
      await finishActed({ stage: 'system', reasoning: `ignored: ${decision.reason}` });
    } else if (decision.type === 'respond') {
      await finishActed({
        stage:  'system',
        toolName: 'respond',
        toolResult: { response: decision.response },
        reasoning: decision.reasoning,
      });
    } else if (decision.type === 'propose_action') {
      if (event.agentId == null) {
        await finishActed({
          stage:  'failed',
          error:  'propose_action requiere agentId, evento cross-empresa',
        });
      } else {
        const proposalId = await proposeAction({
          agentId:       event.agentId,
          eventId:       event.id,
          actionType:    decision.actionType,
          httpMethod:    decision.httpMethod,
          httpPath:      decision.httpPath,
          httpBody:      decision.httpBody,
          summary:       decision.summary,
          riskLevel:     decision.riskLevel,
          correlationId: event.correlationId ?? undefined,
        });
        await finishActed({
          stage:     'acted',
          toolName:  decision.actionType,
          toolParams: decision.httpBody,
          reasoning: `Proposal creada: ${decision.summary}`,
          riskLevel: decision.riskLevel,
          proposalId,
        });
      }
    }

    // 5) CERRAR EL EVENTO.
    await markProcessed(event.id);
    await finishPerceived({ stage: 'system', reasoning: `evento procesado OK` });
    return event.id;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await finishPerceived({ stage: 'failed', error: `processEvent: ${errMsg}` });
    await markFailed(event.id, errMsg, { requeue: event.claimAttempts < 3 });
    return event.id;
  }
}

// ─── runAgentLoop ────────────────────────────────────────────────────

export interface RunAgentLoopOptions extends ProcessEventOptions {
  stopSignal?: { stopped: boolean };
  idleLogMs?: number;
  maxIterations?: number;
  onFatalError?: (err: unknown) => void;
}

export async function runAgentLoop(opts: RunAgentLoopOptions = {}): Promise<void> {
  const idleLogMs = opts.idleLogMs ?? 5000;
  const maxIter  = opts.maxIterations ?? Infinity;
  let lastIdleLog = 0;
  let iter = 0;

  console.log('[agent-core] runAgentLoop: arrancando');

  while (!opts.stopSignal?.stopped && iter < maxIter) {
    iter++;
    try {
      const processed = await processEvent(opts);
      if (processed == null) {
        if (Date.now() - lastIdleLog > idleLogMs) {
          console.log(`[agent-core] idle (sin eventos en los últimos ${idleLogMs}ms)`);
          lastIdleLog = Date.now();
        }
        await sleep(1_000);
      } else {
        console.log(`[agent-core] evento #${processed} procesado`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[agent-core] error en iteración: ${errMsg}`);
      if (opts.onFatalError) {
        opts.onFatalError(err);
        return;
      }
      await sleep(2_000);
    }
  }

  console.log(`[agent-core] runAgentLoop: terminó después de ${iter} iteraciones`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
