// lib/agent-core.alt.ts
// ─────────────────────────────────────────────────────────────────────
// Variante ALTERNATIVA del LlmCaller, usada SOLO para experimentación.
//
// jul 2026 v10 — Este archivo existe para que probemos modelos como
// gemma4:e2b sin tocar el flujo principal (que ya funciona con
// qwen2.5:3b o llama3.2:3b).
//
// Diferencias con defaultLlmCaller (en agent-core.ts):
//   1. NO usa `format: 'json'` — el LLM devuelve texto libre.
//   2. Prompt con few-shot example (1 ejemplo completo) para forzar
//      el formato JSON al modelo.
//   3. Parser tolerante con regex (busca { ... } balanceado).
//   4. Logging MUY detallado de lo que devuelve el modelo (raw + parseado).
//
// USO: solo desde el endpoint /agent/test-llm. NO tocar agent-core.ts.
// ─────────────────────────────────────────────────────────────────────

import { claimNext, markProcessed, markFailed, type AgentEventRow } from './agent-event-bus';
import { recordAudit, startAuditTimer, type RiskLevel } from './agent-audit';
import { ollamaChat, type OllamaChatMessage } from './ai/ollama-client';
import {
  TOOL_REGISTRY,
  getToolByName,
  runTool,
  type ToolContext,
} from './ai/tools/registry';
import type { AgentDecision, LlmCaller } from './agent-core';

// ─── Helpers ──────────────────────────────────────────────────────────

/** Extrae el primer objeto JSON balanceado de un texto. */
function extractFirstJson(text: string): any | null {
  const first = text.indexOf('{');
  if (first === -1) return null;
  let depth = 0, end = -1;
  for (let i = first; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) return null;
  try {
    return JSON.parse(text.slice(first, end + 1));
  } catch {
    return null;
  }
}

function buildToolsDescription(): string {
  return TOOL_REGISTRY.map((t) => `- ${t.name}: ${t.description.split('.')[0]}.`).join('\n');
}

// ─── LlmCaller alternativo ────────────────────────────────────────────

/** Cantidad de iteraciones del loop (no más de 3 para no quemar CPU). */
const MAX_ITERATIONS = 3;

/** Helper: loguea el texto completo del LLM con previews. */
function logLlmResponse(label: string, text: string) {
  console.log(`[alt-llm ${new Date().toISOString()}] ${label}:`);
  console.log(`  length: ${text.length}`);
  console.log(`  preview: ${text.slice(0, 200)}${text.length > 200 ? '...' : ''}`);
  if (text.length <= 1500) {
    console.log(`  full: ${text}`);
  }
}

/**
 * LlmCaller alternativo: NO usa `format: 'json'`, prompt con few-shot,
 * parser tolerante. Pensado para probar modelos como gemma4.
 */
export const altLlmCaller: LlmCaller = {
  async reason({ systemPrompt, event, toolContext }) {
    const model = process.env.ALT_LLM_MODEL ?? 'gemma4:e2b';
    const toolsDesc = buildToolsDescription();

    // Prompt con un EJEMPLO COMPLETO del formato esperado.
    // Para modelos chicos en CPU, few-shot funciona mejor que zero-shot.
    const fullSystemPrompt = `${systemPrompt}

HERRAMIENTAS DISPONIBLES (solo lectura):
${toolsDesc}

FORMATO DE RESPUESTA (sin markdown, sin backticks):
- Para pedir datos: {"tool": "nombreTool", "args": {...}}
- Para decisión final: {"type": "respond"|"propose_action"|"ignore", ...campos}

EJEMPLO (estudiá el formato):
Pregunta: "Cuántos vehículos operativos hay?"
Turno 1: {"tool": "getVehiculos", "args": {"estado": "Operativo"}}
Turno 2 (después de recibir los datos): {"type": "respond", "response": "Hay 5 vehículos operativos", "reasoning": "La tool devolvió 5 vehículos con estado Operativo"}

REGLAS:
- Si necesitás datos, primero pedí una tool. Yo te devuelvo el resultado.
- Si ya podés responder, NO incluyas "tool". Solo "type" + campos.
- "type=respond" para responder con info (no modifica datos).
- "type=propose_action" solo si requiere CREAR/EDITAR/BORRAR (POST/PATCH/PUT/DELETE).
- "type=ignore" si no amerita acción.
- "reasoning" SIEMPRE, 1 frase.`;

    const initialUserPrompt = `EVENTO: ${event.eventType} | source=${event.source}
PAYLOAD: ${JSON.stringify(event.payload)}

Respondé con el JSON de decisión. Si necesitás datos, pedí UNA tool primero.`;

    const messages: OllamaChatMessage[] = [
      { role: 'system', content: fullSystemPrompt },
      { role: 'user',   content: initialUserPrompt },
    ];

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      console.log(`\n[alt-llm] === iteración ${iter + 1}/${MAX_ITERATIONS} ===`);
      const res = await ollamaChat({
        model,
        messages,
        options: {
          temperature: 0.1,
          num_predict: 600,
          // NO `format: 'json'`. Dejamos que el modelo devuelva texto libre.
        },
      });

      const text = (res.message?.content ?? '').trim();
      logLlmResponse('RESPONSE', text);

      if (!text) {
        return { type: 'ignore', reason: 'LLM devolvió texto vacío', reasoning: 'Sin contenido' };
      }

      // Intentar parsear como JSON.
      const obj = extractFirstJson(text);
      if (!obj) {
        console.log('[alt-llm] No se pudo parsear JSON, repreguntando...');
        messages.push({ role: 'assistant', content: text });
        messages.push({
          role: 'user',
          content: `No pude parsear tu respuesta como JSON. Por favor, respondé SOLO con un JSON válido (sin markdown, sin backticks). Empezá con { y terminá con }.`,
        });
        continue;
      }

      console.log('[alt-llm] JSON parseado:', JSON.stringify(obj, null, 2).slice(0, 500));

      // Si tiene type válido, retornar.
      if (obj.type === 'respond' && typeof obj.response === 'string') {
        return { type: 'respond', response: obj.response, reasoning: obj.reasoning };
      }
      if (obj.type === 'ignore' && typeof obj.reason === 'string') {
        return { type: 'ignore', reason: obj.reason, reasoning: obj.reasoning };
      }
      if (obj.type === 'propose_action'
          && typeof obj.actionType === 'string'
          && typeof obj.summary === 'string') {
        // Si la tool existe, ejecutar como lectura.
        const tool = getToolByName(obj.actionType);
        if (tool) {
          const args = (obj.args ?? obj.httpBody ?? {}) as Record<string, unknown>;
          const { result } = await runTool(obj.actionType, args, toolContext);
          return {
            type: 'respond',
            response: `${obj.summary ?? 'Resultado:'}\n\n${JSON.stringify(result).slice(0, 2000)}`,
            reasoning: `Tool "${obj.actionType}" ejecutada como lectura`,
          };
        }
        // Si no existe la tool, es un propose_action real.
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

      // Pidió una tool sin decisión.
      if (obj.tool && typeof obj.tool === 'string') {
        const tool = getToolByName(obj.tool);
        if (!tool) {
          messages.push({ role: 'assistant', content: text });
          messages.push({
            role: 'user',
            content: `Tool "${obj.tool}" no existe. Las disponibles: ${toolsDesc}`,
          });
          continue;
        }
        const args = (obj.args ?? {}) as Record<string, unknown>;
        const { result, fromCache } = await runTool(obj.tool, args, toolContext);
        const resultStr = JSON.stringify(result).slice(0, 2500);
        messages.push({ role: 'assistant', content: text });
        messages.push({
          role: 'user',
          content: `RESULTADO de ${obj.tool} (${fromCache ? 'cache' : 'fresh'}, ${result.total ?? '?'} filas):\n${resultStr}\n\n${result.note ?? ''}\n\nAhora dame la decisión final.`,
        });
        continue;
      }

      // JSON parseado pero sin campos esperados.
      console.log('[alt-llm] JSON sin campos esperados, repreguntando...');
      messages.push({ role: 'assistant', content: text });
      messages.push({
        role: 'user',
        content: `Tu JSON no tiene "type" esperado. Recordá: solo "respond", "propose_action" o "ignore". Reformulá.`,
      });
    }

    return {
      type: 'ignore',
      reason: `Loop agotó ${MAX_ITERATIONS} iteraciones`,
      reasoning: 'El LLM no logró converger',
    };
  },
};
