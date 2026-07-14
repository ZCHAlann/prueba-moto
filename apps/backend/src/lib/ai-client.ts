// lib/ai-client.ts
// ─────────────────────────────────────────────────────────────────────
// Cliente HTTP para Groq (compatible con OpenAI Chat Completions).
//
// jul 2026 v7 — multi-tenant. Cada empresa puede tener su propia
// API key de Groq (groqApiKeyEncrypted en company_ai_settings). Si la
// tiene, se usa ESA key. Si no, cae a la cascada global (env vars).
//
// Funciones:
//   - chatCompletion(opts)              → legacy: usa env var directo (sin empresa)
//   - chatCompletionForCompany(opts, companyId) → per-empresa
// ─────────────────────────────────────────────────────────────────────

import { getGroqKeyForCompany } from './ai/client-factory';

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

export function getDefaultModel(): string {
  return DEFAULT_MODEL;
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
 * jul 2026 v7 — LEGACY: usar `chatCompletionForCompany` cuando se
 * tenga el `companyId`. Esta función solo aplica a health checks
 * admin y a código viejo que no se migró todavía.
 *
 * Si `GROQ_API_KEY` no está en el entorno, lanza 503 / `AI_DISABLED`.
 */
export async function chatCompletion(opts: ChatOpts): Promise<ChatResult> {
  const legacyKey = process.env.GROQ_API_KEY ?? process.env.GROQ_API_KEY1;
  if (!legacyKey) {
    throw new Error("GROQ_API_KEY no está configurada en el entorno.");
  }
  const model = opts.model || DEFAULT_MODEL;
  return doChatCompletion(opts, model, legacyKey);
}

/**
 * jul 2026 v7 — versión multi-tenant. Usa la key de Groq de la empresa
 * si la tiene cargada, si no, la cascada global.
 *
 * Lanza error con `code = 'AI_DISABLED'` si la feature no está
 * habilitada, la empresa fue kill-switched, o no hay key en ningún lado.
 */
export async function chatCompletionForCompany(
  opts: ChatOpts,
  companyId: number,
): Promise<ChatResult> {
  const aiKey = await getGroqKeyForCompany(companyId, 'ai_insights');
  if (!aiKey) {
    throw Object.assign(
      new Error("Análisis IA no disponible: la empresa no tiene API key de Groq ni la cascada global tiene keys."),
      { code: 'AI_DISABLED' },
    );
  }
  const model = opts.model || aiKey.model;
  return doChatCompletion(opts, model, aiKey.apiKey);
}

/**
 * Lógica común de HTTP call a Groq. Usada por ambas versiones
 * (`chatCompletion` legacy y `chatCompletionForCompany`).
 */
async function doChatCompletion(
  opts: ChatOpts,
  model: string,
  apiKey: string,
): Promise<ChatResult> {
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
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
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
