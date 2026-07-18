// lib/ai/ollama-client.ts
// ─────────────────────────────────────────────────────────────────────
// Cliente HTTP directo contra Ollama local.
//
// Coherente con el doc arquitectura sección 3.4: Gemma 4 E2B (desarrollo)
// y Gemma 4 E4B (producción), corriendo en Ollama local sin GPU.
//
// jul 2026 v10 — Fix de performance:
//   - Logging detallado: qué se envía, qué se recibe, cuánto tardó.
//   - num_predict default = 200 (suficiente para JSON pequeños).
//   - keep_alive = "5m" (Ollama mantiene el modelo en RAM 5 min entre
//     requests; sin esto, cada request paga el costo de carga).
//   - El caller puede sobreescribir todo.
//
// Endpoints de Ollama que usamos:
//   GET  /api/tags              → listar modelos disponibles
//   POST /api/chat              → chat (con o sin stream)
//
// Config (env vars):
//   OLLAMA_BASE_URL       default: http://127.0.0.1:11434
//   OLLAMA_MODEL          default: gemma4:e2b
//   OLLAMA_TIMEOUT_MS     default: 60000
//   OLLAMA_KEEP_ALIVE     default: "5m"
//   OLLAMA_LOG_VERBOSE    default: "false" — si true, loguea el JSON completo
//   OLLAMA_NUM_PREDICT    default: 200
// ─────────────────────────────────────────────────────────────────────

// ─── Types ────────────────────────────────────────────────────────────

export interface OllamaChatMessage {
  role:    'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?:   string;
}

export interface OllamaChatRequest {
  model?:   string;
  messages: OllamaChatMessage[];
  stream?:  boolean;
  format?:  'json' | object;
  options?: {
    temperature?:     number;
    top_p?:           number;
    num_predict?:     number;
    stop?:            string[];
    [key: string]:    unknown;
  };
  signal?:  AbortSignal;
}

export interface OllamaChatResponse {
  model:              string;
  created_at:         string;
  message:            OllamaChatMessage;
  done:               boolean;
  total_duration?:    number;
  load_duration?:     number;
  prompt_eval_count?: number;
  eval_count?:        number;
  eval_duration?:     number;
}

export type OllamaStreamChunk = OllamaChatResponse;

// ─── Helpers ──────────────────────────────────────────────────────────

function baseUrl(): string {
  return process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
}

function defaultModel(): string {
  return process.env.OLLAMA_MODEL ?? 'gemma4:e2b';
}

function timeoutMs(): number {
  const v = Number(process.env.OLLAMA_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? v : 180_000;  // 3 min default
}

function keepAlive(): string {
  return process.env.OLLAMA_KEEP_ALIVE ?? '5m';
}

function numPredictDefault(): number {
  const v = Number(process.env.OLLAMA_NUM_PREDICT);
  return Number.isFinite(v) && v > 0 ? v : 200;
}

function verbose(): boolean {
  return process.env.OLLAMA_LOG_VERBOSE === 'true';
}

/** Log helper. Solo se imprime si OLLAMA_LOG_VERBOSE=true. */
function logOllama(label: string, data: unknown) {
  if (!verbose()) return;
  const ts = new Date().toISOString();
  if (typeof data === 'string') {
    console.log(`[ollama ${ts}] ${label}: ${data}`);
  } else {
    console.log(`[ollama ${ts}] ${label}:`, JSON.stringify(data, null, 2).slice(0, 2000));
  }
}

// ─── Connectivity check ───────────────────────────────────────────────

export async function listOllamaModels(): Promise<Array<{ name: string; size: number; modified_at: string }>> {
  const res = await fetch(`${baseUrl()}/api/tags`, {
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) {
    throw new Error(
      `Ollama no responde en ${baseUrl()} (HTTP ${res.status}). ` +
      `¿Está corriendo? Iniciá con 'ollama serve' o abrí la app de escritorio.`
    );
  }
  const body = await res.json() as { models: Array<{ name: string; size: number; modified_at: string }> };
  return body.models ?? [];
}

export async function isOllamaReady(model?: string): Promise<{ ready: boolean; model: string; available: string[]; reason?: string }> {
  const target = model ?? defaultModel();
  try {
    const models = await listOllamaModels();
    const names = models.map((m) => m.name);
    const has = names.some((n) => n === target || n.startsWith(`${target}:`) || target.startsWith(`${n}:`));
    return {
      ready: has,
      model: target,
      available: names,
      reason: has ? undefined : `Modelo '${target}' no instalado. Corré: ollama pull ${target}`,
    };
  } catch (err) {
    return {
      ready: false,
      model: target,
      available: [],
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Chat (no streaming) ──────────────────────────────────────────────

export async function ollamaChat(req: Omit<OllamaChatRequest, 'stream' | 'signal'>): Promise<OllamaChatResponse> {
  const model = req.model ?? defaultModel();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs());
  const t0 = Date.now();

  // Default num_predict conservador (configurable por env o por req).
  const options = {
    num_predict: numPredictDefault(),
    ...req.options,
  };

  const body = JSON.stringify({
    model,
    messages: req.messages,
    stream:   false,
    format:   req.format,
    options,
    keep_alive: keepAlive(),
  });

  logOllama('REQUEST', { url: `${baseUrl()}/api/chat`, model, body: body.slice(0, 500) });

  try {
    const res = await fetch(`${baseUrl()}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logOllama('HTTP_ERROR', { status: res.status, body: text.slice(0, 500) });
      throw new Error(`Ollama HTTP ${res.status}: ${text.slice(0, 500)}`);
    }

    const json = await res.json() as OllamaChatResponse;
    const elapsed = Date.now() - t0;

    logOllama('RESPONSE', {
      elapsed_ms: elapsed,
      model:      json.model,
      eval_count: json.eval_count,
      prompt_eval_count: json.prompt_eval_count,
      total_duration_ms: json.total_duration ? Math.round(json.total_duration / 1_000_000) : null,
      content_preview: (json.message?.content ?? '').slice(0, 200),
    });

    return json;
  } catch (err) {
    const elapsed = Date.now() - t0;
    if (err instanceof Error && err.name === 'AbortError') {
      logOllama('TIMEOUT', { elapsed_ms: elapsed, model });
      throw new Error(`Ollama timeout después de ${timeoutMs()}ms (modelo: ${model})`);
    }
    logOllama('EXCEPTION', { elapsed_ms: elapsed, error: err instanceof Error ? err.message : String(err) });
    throw err;
  } finally {
    clearTimeout(t);
  }
}

// ─── Chat (streaming) ─────────────────────────────────────────────────

export async function* ollamaChatStream(
  req: OllamaChatRequest,
): AsyncGenerator<OllamaStreamChunk, void, void> {
  const model = req.model ?? defaultModel();
  const controller = new AbortController();

  if (req.signal) {
    if (req.signal.aborted) {
      throw new Error('AbortError: ollamaChatStream cancelado antes de empezar');
    }
    req.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let inactivityTimer: NodeJS.Timeout | null = null;
  const resetInactivity = () => {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => controller.abort(), timeoutMs() * 2);
  };

  const t0 = Date.now();
  const options = {
    num_predict: numPredictDefault(),
    ...req.options,
  };

  logOllama('STREAM_REQUEST', { url: `${baseUrl()}/api/chat`, model });

  try {
    const res = await fetch(`${baseUrl()}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: req.messages,
        stream:   true,
        format:   req.format,
        options,
        keep_alive: keepAlive(),
      }),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      logOllama('STREAM_HTTP_ERROR', { status: res.status, body: text.slice(0, 500) });
      throw new Error(`Ollama HTTP ${res.status}: ${text.slice(0, 500)}`);
    }

    resetInactivity();
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let chunkCount = 0;
    let fullText = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        resetInactivity();

        buffer += decoder.decode(value, { stream: true });
        let nlIdx: number;
        while ((nlIdx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, nlIdx).trim();
          buffer = buffer.slice(nlIdx + 1);
          if (!line) continue;
          try {
            const chunk = JSON.parse(line) as OllamaStreamChunk;
            chunkCount++;
            if (chunk.message?.content) fullText += chunk.message.content;
            yield chunk;
          } catch (parseErr) {
            console.warn('[ollama-client] chunk no es JSON válido:', line.slice(0, 200));
          }
        }
      }
    } finally {
      try { reader.releaseLock(); } catch {}
    }

    const elapsed = Date.now() - t0;
    logOllama('STREAM_DONE', {
      elapsed_ms: elapsed,
      chunk_count: chunkCount,
      content_preview: fullText.slice(0, 300),
    });
  } catch (err) {
    const elapsed = Date.now() - t0;
    if (err instanceof Error && err.name === 'AbortError') {
      logOllama('STREAM_TIMEOUT', { elapsed_ms: elapsed, model });
      throw new Error(`Ollama stream cancelado o timeout (modelo: ${model})`);
    }
    logOllama('STREAM_EXCEPTION', { elapsed_ms: elapsed, error: err instanceof Error ? err.message : String(err) });
    throw err;
  } finally {
    if (inactivityTimer) clearTimeout(inactivityTimer);
  }
}

// ─── JSON forzado (Fase 1 — para el Agent Core) ───────────────────────

export async function ollamaChatJson<T = unknown>(
  req: Omit<OllamaChatRequest, 'format' | 'stream' | 'signal'>,
): Promise<{ parsed: T; raw: OllamaChatResponse }> {
  const res = await ollamaChat({ ...req, format: 'json' });
  const text = res.message?.content ?? '';
  // Loguear SIEMPRE el content, no solo cuando falla. Así cuando hay
  // string vacío podemos ver el context length, model, eval_count, etc.
  logOllama('JSON_RESPONSE', {
    text_length: text.length,
    text_preview: text.slice(0, 800),
    text_repr: JSON.stringify(text).slice(0, 400),  // muestra espacios / newlines
    eval_count: res.eval_count,
    prompt_eval_count: res.prompt_eval_count,
    total_duration_ms: res.total_duration ? Math.round(res.total_duration / 1_000_000) : null,
  });
  if (!text.trim()) {
    logOllama('JSON_EMPTY', { eval_count: res.eval_count, total_duration_ms: res.total_duration });
    throw new Error(`Ollama devolvió texto VACÍO (eval_count=${res.eval_count ?? '?'}, total_duration_ms=${res.total_duration ? Math.round(res.total_duration / 1_000_000) : '?'}). Probable: stop token cortó antes de generar JSON, o num_predict muy bajo.`);
  }
  try {
    return { parsed: JSON.parse(text) as T, raw: res };
  } catch (err) {
    logOllama('JSON_PARSE_ERROR', { content: text.slice(0, 500), content_repr: JSON.stringify(text).slice(0, 200) });
    throw new Error(`Ollama devolvió texto no parseable como JSON (length=${text.length}): ${text.slice(0, 300)}`);
  }
}
