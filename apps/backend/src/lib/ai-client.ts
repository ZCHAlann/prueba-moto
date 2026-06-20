// lib/ai-client.ts
// ─────────────────────────────────────────────────────────────────────
// Cliente HTTP para Groq (compatible con OpenAI Chat Completions).
//
// Variables de entorno:
//   GROQ_API_KEY   requerida
//   AI_MODEL       opcional, default: 'llama-3.3-70b-versatile'
//
// Funciones:
//   - chatCompletion(opts)   → wrapper con retry + timeout + JSON mode
//   - isAiEnabled()          → true si la key está configurada
// ─────────────────────────────────────────────────────────────────────

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

export function isAiEnabled(): boolean {
  return !!process.env.GROQ_API_KEY;
}

export function getDefaultModel(): string {
  return process.env.AI_MODEL || DEFAULT_MODEL;
}

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatOpts = {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Si true, fuerza response_format JSON. Útil para insights estructurados. */
  jsonMode?: boolean;
  /** Timeout en ms. Default 30s. */
  timeoutMs?: number;
};

export type ChatResult = {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
};

/**
 * Llama a Groq con retry exponencial. Si la API falla, devuelve error
 * con contexto suficiente para log.
 */
export async function chatCompletion(opts: ChatOpts): Promise<ChatResult> {
  if (!isAiEnabled()) {
    throw new Error("GROQ_API_KEY no está configurada.");
  }

  const model = opts.model || getDefaultModel();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens:  opts.maxTokens ?? 1500,
  };
  if (opts.jsonMode) body.response_format = { type: "json_object" };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const t0 = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        // 429 (rate limit) o 5xx → reintentar
        if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
          lastError = new Error(`Groq ${res.status}: ${txt.slice(0, 300)}`);
          await sleep(500 * Math.pow(2, attempt));
          continue;
        }
        throw new Error(`Groq ${res.status}: ${txt.slice(0, 300)}`);
      }

      const json = await res.json() as {
        choices: Array<{ message: { content: string } }>;
        model:  string;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };

      const content = json.choices?.[0]?.message?.content ?? "";
      if (!content) throw new Error("Groq devolvió respuesta vacía.");

      return {
        content,
        model:      json.model ?? model,
        promptTokens:     json.usage?.prompt_tokens     ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
        totalTokens:      json.usage?.total_tokens      ?? 0,
        latencyMs:        Date.now() - t0,
      };
    } catch (err) {
      clearTimeout(timer);
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        await sleep(500 * Math.pow(2, attempt));
        continue;
      }
    }
  }

  throw lastError ?? new Error("Groq falló tras reintentos.");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
