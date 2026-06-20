// lib/ai-insights.ts
// ─────────────────────────────────────────────────────────────────────
// Genera el análisis IA de un módulo de Estadísticas.
//
// Input:  el JSON agregado que devuelve el calculator (kpis, charts, anomalías).
//         NUNCA recibe filas crudas — solo agregados (privacidad + costo).
// Output: insights estructurados con `resumenEjecutivo`, `puntosClave`,
//         `recomendaciones`, `alertas`.
//
// Estrategia de cache:
//   - Hash determinístico del input → si el JSON no cambia, devolvemos
//     la respuesta cacheada sin llamar a la IA.
//   - TTL: 6 horas por defecto. El endpoint acepta `forzarRegenerar: true`
//     para invalidar el cache (no borra la fila, pero la ignora).
// ─────────────────────────────────────────────────────────────────────

import { createHash } from "crypto";
import { and, eq, gte, isNull, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { companyStatsInsightsCache } from "../db/schema/operational";
import { chatCompletion, isAiEnabled } from "./ai-client";
import type { Periodo } from "./stats-math";

const TTL_HOURS = 6;
const SYSTEM_PROMPT = `Eres un analista senior de operaciones de flotas vehiculares.
Tu trabajo es interpretar datos ya agregados (KPIs, series temporales, distribuciones, anomalías) y dar un análisis EJECUTIVO en español.

Reglas de oro:
- Máximo 1-2 oraciones por punto. Sin floritura. Sin emojis.
- Basa cada conclusión en los datos del JSON. Si no hay datos suficientes, dilo explícitamente.
- Prioriza ACCIÓN sobre descripción. El dueño de la flota necesita saber QUÉ hacer, no solo QUÉ pasó.
- Cuando menciones cifras, redondea y usa la unidad del JSON (USD, L, km, %).
- Si ves una anomalía, explica su posible causa operativa (no financiera, no técnica especializada).
- Devuelve SOLO el JSON pedido. Sin markdown, sin \`\`\`json, sin texto antes/después.`;

const RESPONSE_SCHEMA_HINT = `{
  "resumenEjecutivo": string,                  // 1-3 oraciones que resumen el estado actual
  "puntosClave": string[],                     // 3-5 bullets con hallazgos relevantes (variaciones, outliers, tendencias)
  "recomendaciones": [                          // 3-5 acciones concretas priorizadas
    {
      "titulo": string,                         // máx 8 palabras
      "accion": string,                         // 1-2 oraciones
      "prioridad": "alta" | "media" | "baja"
    }
  ],
  "alertas": [                                  // 0-3 alertas que requieren atención
    {
      "titulo": string,
      "detalle": string,                        // 1-2 oraciones
      "severidad": "alta" | "media" | "baja"
    }
  ]
}`;

// ─── Tipos ────────────────────────────────────────────────────────

export type AIInsights = {
  resumenEjecutivo: string;
  puntosClave: string[];
  recomendaciones: Array<{ titulo: string; accion: string; prioridad: "alta" | "media" | "baja" }>;
  alertas: Array<{ titulo: string; detalle: string; severidad: "alta" | "media" | "baja" }>;
};

export type GenerateOpts = {
  companyId: number;
  modulo: string;
  periodo: Periodo;
  fechaRef: string;
  fechaHasta: string;
  assetId: number | null;
  driverId: number | null;
  /** JSON agregado del calculator (kpis + charts + anomalías). */
  payload: unknown;
  /** Si true, ignora el cache y regenera. */
  forzarRegenerar?: boolean;
};

export type GenerateResult = {
  insights: AIInsights;
  model: string;
  provider: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  fromCache: boolean;
  cacheId: number;
};

// ─── Función principal ────────────────────────────────────────────

export async function generateInsights(opts: GenerateOpts): Promise<GenerateResult> {
  const inputHash = hashInput({
    companyId: opts.companyId,
    modulo:    opts.modulo,
    periodo:   opts.periodo,
    fechaRef:  opts.fechaRef,
    fechaHasta:opts.fechaHasta,
    assetId:   opts.assetId,
    driverId:  opts.driverId,
    payload:   opts.payload,
  });

  // 1) ¿Hay cache válido?
  if (!opts.forzarRegenerar) {
    const cached = await findCache(opts.companyId, opts.modulo, opts.periodo, opts.fechaRef, opts.fechaHasta, opts.assetId, opts.driverId, inputHash);
    if (cached) {
      return {
        insights: parseInsights(cached),
        model:           cached.model,
        provider:        cached.provider,
        latencyMs:       0,
        inputTokens:     cached.inputTokens    ?? 0,
        outputTokens:    cached.outputTokens   ?? 0,
        fromCache:       true,
        cacheId:         cached.id,
      };
    }
  }

  if (!isAiEnabled()) {
    throw Object.assign(new Error("IA no configurada: GROQ_API_KEY no está en el entorno."), { code: "AI_DISABLED" });
  }

  // 2) Llamar a Groq
  const userPrompt = buildUserPrompt(opts);
  const t0 = Date.now();
  const result = await chatCompletion({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user",   content: userPrompt },
    ],
    temperature: 0.3,
    maxTokens:   1500,
    jsonMode:    true,
    timeoutMs:   30_000,
  });

  // 3) Parsear respuesta
  let parsed: AIInsights;
  try {
    parsed = JSON.parse(result.content);
  } catch (err) {
    // A veces el modelo envuelve el JSON en ```json ... ```. Limpiamos.
    const cleaned = result.content.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    parsed = JSON.parse(cleaned);
  }

  // Validación mínima
  parsed = validateInsights(parsed);

  const latencyMs = Date.now() - t0;

  // 4) Guardar en cache
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + TTL_HOURS);

  const inserted = await db.insert(companyStatsInsightsCache).values({
    companyId:        opts.companyId,
    modulo:           opts.modulo,
    periodo:          opts.periodo,
    fechaRef:         opts.fechaRef,
    fechaHasta:       opts.fechaHasta,
    assetId:          opts.assetId,
    driverId:         opts.driverId,
    provider:         "groq",
    model:            result.model,
    payload:          opts.payload as any,
    responseRaw:      result.content,
    resumenEjecutivo: parsed.resumenEjecutivo,
    puntosClave:      parsed.puntosClave as any,
    recomendaciones:  parsed.recomendaciones as any,
    alertas:          parsed.alertas as any,
    inputTokens:      result.promptTokens,
    outputTokens:     result.completionTokens,
    totalTokens:      result.totalTokens,
    latencyMs,
    expiresAt,
    inputHash,
  }).returning({ id: companyStatsInsightsCache.id });

  return {
    insights:    parsed,
    model:       result.model,
    provider:    "groq",
    latencyMs,
    inputTokens: result.promptTokens,
    outputTokens:result.completionTokens,
    fromCache:   false,
    cacheId:     inserted[0]?.id ?? 0,
  };
}

// ─── Helpers ────────────────────────────────────────────────────

function hashInput(data: any): string {
  return createHash("sha256")
    .update(JSON.stringify(data, Object.keys(data).sort()))
    .digest("hex")
    .slice(0, 40);
}

function buildUserPrompt(opts: GenerateOpts): string {
  return `Módulo: ${opts.modulo}
Período: ${opts.periodo}
Rango: ${opts.fechaRef} → ${opts.fechaHasta}
${opts.assetId  ? `Filtro activo: ${opts.assetId}\n` : ""}${opts.driverId ? `Filtro conductor: ${opts.driverId}\n` : ""}

Datos agregados (JSON, no incluir en respuesta):
${JSON.stringify(opts.payload, null, 0).slice(0, 6000)}

Devuelve SOLO este JSON (sin markdown, sin texto antes/después):
${RESPONSE_SCHEMA_HINT}`;
}

async function findCache(
  companyId: number, modulo: string, periodo: Periodo,
  fechaRef: string, fechaHasta: string,
  assetId: number | null, driverId: number | null, inputHash: string,
) {
  const rows = await db.select()
    .from(companyStatsInsightsCache)
    .where(and(
      eq(companyStatsInsightsCache.companyId, companyId),
      eq(companyStatsInsightsCache.modulo,    modulo),
      eq(companyStatsInsightsCache.periodo,   periodo),
      eq(companyStatsInsightsCache.fechaRef,  fechaRef),
      eq(companyStatsInsightsCache.fechaHasta,fechaHasta),
      // asset/driver: NULL = sin filtro, 0/missing = filtrado
      assetId  == null
        ? isNull(companyStatsInsightsCache.assetId)
        : eq(companyStatsInsightsCache.assetId, assetId),
      driverId == null
        ? isNull(companyStatsInsightsCache.driverId)
        : eq(companyStatsInsightsCache.driverId, driverId),
      eq(companyStatsInsightsCache.inputHash, inputHash),
      gte(companyStatsInsightsCache.expiresAt, new Date()),
    ))
    .orderBy(sql`${companyStatsInsightsCache.createdAt} DESC`)
    .limit(1);
  return rows[0] ?? null;
}

function parseInsights(row: any): AIInsights {
  return {
    resumenEjecutivo: row.resumenEjecutivo ?? "",
    puntosClave:      Array.isArray(row.puntosClave)     ? row.puntosClave     : [],
    recomendaciones:  Array.isArray(row.recomendaciones) ? row.recomendaciones : [],
    alertas:          Array.isArray(row.alertas)         ? row.alertas         : [],
  };
}

function validateInsights(raw: any): AIInsights {
  return {
    resumenEjecutivo: typeof raw?.resumenEjecutivo === "string" ? raw.resumenEjecutivo : "",
    puntosClave: Array.isArray(raw?.puntosClave)
      ? raw.puntosClave.filter((s: any) => typeof s === "string").slice(0, 8)
      : [],
    recomendaciones: Array.isArray(raw?.recomendaciones)
      ? raw.recomendaciones
          .filter((r: any) => r && typeof r.titulo === "string" && typeof r.accion === "string")
          .map((r: any) => ({
            titulo:    r.titulo,
            accion:    r.accion,
            prioridad: ["alta", "media", "baja"].includes(r.prioridad) ? r.prioridad : "media",
          }))
          .slice(0, 6)
      : [],
    alertas: Array.isArray(raw?.alertas)
      ? raw.alertas
          .filter((a: any) => a && typeof a.titulo === "string" && typeof a.detalle === "string")
          .map((a: any) => ({
            titulo:    a.titulo,
            detalle:   a.detalle,
            severidad: ["alta", "media", "baja"].includes(a.severidad) ? a.severidad : "media",
          }))
          .slice(0, 5)
      : [],
  };
}
