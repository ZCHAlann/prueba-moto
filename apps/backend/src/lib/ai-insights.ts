// lib/ai-insights.ts
// ─────────────────────────────────────────────────────────────────────
// V2: genera el análisis IA de un módulo de Estadísticas.
//
// Cambios respecto a V1:
//   1. Recibe `currentStart` + `endDate` para construir señales cruzadas
//      entre módulos (cross-module-signals) antes de llamar a Groq.
//      La IA ahora ve datos reales de alertas, correctivos, combustible,
//      checklists y conductores de TODOS los módulos, no solo el activo.
//   2. El shape de salida cambió:
//        V1: { resumenEjecutivo, puntosClave, recomendaciones, alertas }
//        V2: { resumenNarrativo, nivelAtencion, metricas, accionPrincipal,
//               hallazgosSecundarios }
//      para soportar el panel "briefing" (AIBriefingPanel.tsx).
//   3. Cache intacto: mismo hash, mismo onConflictDoUpdate, mismo TTL.
//      Las columnas legacy (resumen_ejecutivo, puntos_clave, etc.) se
//      siguen escribiendo para no romper el PDF mientras no se migra.
// ─────────────────────────────────────────────────────────────────────

import { createHash } from "crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../db/client";
import { companyStatsInsightsCache } from "../db/schema/operational";
import { chatCompletionForCompany } from "./ai-client";
import { getGroqKeyForCompany } from "./ai/client-factory";
import { buildCrossModuleSignals, type CrossModuleSignals } from "./cross-module-signals";
import type { Periodo } from "./stats-math";

const TTL_HOURS = 6;

// ─── Prompts ────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un analista senior de operaciones de flotas vehiculares.
Recibirás dos bloques de datos:
  A) Los KPIs y charts AGREGADOS del módulo activo (lo que ya ve el usuario en pantalla).
  B) Señales cruzadas entre módulos: alertas abiertas, correctivos, combustible y checklists
     por vehículo y por conductor para el MISMO período.

Tu objetivo es detectar relaciones causales REALES entre módulos que no son visibles
al mirar cada módulo por separado. Por ejemplo:
  - "El vehículo ABC-123 tiene 3 alertas de batería abiertas Y 2 correctivos en el período
     → posible causa raíz de la baja disponibilidad que muestra el chart de flotas."
  - "El conductor Juan Pérez concentra el 40% del consumo de combustible Y sus vehículos
     tienen el doble de correctivos → revisar hábitos de conducción."

Reglas estrictas:
- Basa CADA afirmación en datos concretos del JSON (placas, nombres, cifras).
- NO inventes datos que no estén en el JSON.
- Si los datos son insuficientes, di "No hay suficientes datos para este período."
- Máximo 2-3 oraciones por hallazgo. Sin emojis. Sin markdown dentro del JSON.
- El "resumenNarrativo" debe explicar la CAUSA RAÍZ, no solo describir los números.
- Devuelve SOLO el JSON pedido. Sin \`\`\`json, sin texto antes/después.`;

const RESPONSE_SCHEMA_HINT = `{
  "resumenNarrativo": string,          // 2-4 oraciones que explican qué está pasando y POR QUÉ (causa raíz causal entre módulos)
  "nivelAtencion": "ok" | "media" | "alta",  // "alta" si hay ≥1 hallazgo crítico, "media" si hay anomalías menores, "ok" si todo normal
  "metricas": [                        // 2-4 métricas de soporte para el resumen (cifras concretas del JSON)
    { "label": string, "valor": string }
  ],
  "accionPrincipal": {                 // La acción MÁS urgente. null si no hay nada crítico.
    "titulo": string,                  // máx 8 palabras
    "justificacion": string,           // 1-2 oraciones con evidencia concreta del JSON
    "refAssetPlate": string | null,    // placa del vehículo si aplica (o null)
    "refDriverName": string | null,   // nombre del conductor si aplica (o null)
    "chartRef": string                 // a qué gráfico se refiere: "comparacionChart" | "lineChart" | "barHChart" | "barVChart" | "radarChart" | "exponencialChart" | "kpis" | "general"
  } | null,
  "hallazgosSecundarios": [            // 2-4 hallazgos adicionales, ordenados por severidad
    {
      "titulo": string,
      "detalle": string,               // 1-2 oraciones con cifras concretas
      "severidad": "alta" | "media" | "baja",
      "chartRef": string,              // a qué gráfico se refiere (mismo enum que accionPrincipal). Si no aplica a ninguno, usa "general"
      "tags": string[],                // array corto, ej. ["ABC-123", "Juan Pérez"]. Vacío [] si no aplica.
      "recomendacion": string          // frase corta con la acción concreta a tomar. Vacío "" si no hay sugerencia clara.
    }
  ]
}`;

// ─── Normalización defensiva de chartRef ─────────────────────────

const CHART_REFS = new Set([
  "comparacionChart", "lineChart", "barHChart", "barVChart",
  "radarChart", "exponencialChart", "kpis", "general",
]);

function normalizarChartRef(ref: unknown): string | undefined {
  return typeof ref === "string" && CHART_REFS.has(ref) ? ref : undefined;
}

// ─── Tipos ────────────────────────────────────────────────────────

export type AIMetrica = { label: string; valor: string };

export type AIAccionPrincipal = {
  titulo:        string;
  justificacion: string;
  refAssetPlate: string | null;
  refDriverName: string | null;
  chartRef?:     string;
};

export type AIHallazgo = {
  titulo:        string;
  detalle:       string;
  severidad:     "alta" | "media" | "baja";
  chartRef?:     string;
  tags?:         string[];
  recomendacion?: string;
};

export type AIInsights = {
  resumenNarrativo:     string;
  nivelAtencion:        "ok" | "media" | "alta";
  metricas:             AIMetrica[];
  accionPrincipal:      AIAccionPrincipal | null;
  hallazgosSecundarios: AIHallazgo[];
};

export type GenerateOpts = {
  companyId:    number;
  modulo:       string;
  periodo:      Periodo;
  fechaRef:     string;
  fechaHasta:   string;
  assetId:      number | null;
  driverId:     number | null;
  /** JSON agregado del calculator (kpis + charts + anomalías). */
  payload:      unknown;
  /** V2: inicio del bucket actual, necesario para cross-module-signals. */
  currentStart: Date;
  /** V2: fin del período, necesario para cross-module-signals. */
  endDate:      Date;
  /** Si true, ignora el cache y regenera. */
  forzarRegenerar?: boolean;
};

export type GenerateResult = {
  insights:     AIInsights;
  model:        string;
  provider:     string;
  latencyMs:    number;
  inputTokens:  number;
  outputTokens: number;
  fromCache:    boolean;
  cacheId:      number;
};

// ─── Función principal ────────────────────────────────────────────

export async function generateInsights(opts: GenerateOpts): Promise<GenerateResult> {
  const inputHash = hashInput({
    companyId:  opts.companyId,
    modulo:     opts.modulo,
    periodo:    opts.periodo,
    fechaRef:   opts.fechaRef,
    fechaHasta: opts.fechaHasta,
    assetId:    opts.assetId,
    driverId:   opts.driverId,
    payload:    opts.payload,
  });

  // Sentinel -1 para NULL (alineado con el unique index de la tabla)
  const assetId  = opts.assetId  ?? -1;
  const driverId = opts.driverId ?? -1;

  // 1) Cache hit?
  if (!opts.forzarRegenerar) {
    const cached = await findCache(
      opts.companyId, opts.modulo, opts.periodo,
      opts.fechaRef, opts.fechaHasta, assetId, driverId, inputHash,
    );
    if (cached) {
      return {
        insights:    parseInsights(cached),
        model:       cached.model,
        provider:    cached.provider,
        latencyMs:   0,
        inputTokens: cached.inputTokens  ?? 0,
        outputTokens:cached.outputTokens ?? 0,
        fromCache:   true,
        cacheId:     cached.id,
      };
    }
  }

  // jul 2026 v7 — multi-tenant. Resolvemos key+model para esta empresa
  // (key propia o cascada global). Si no hay nada, AI_DISABLED.
  const aiKey = await getGroqKeyForCompany(opts.companyId, 'ai_insights');
  if (!aiKey) {
    throw Object.assign(
      new Error("Análisis IA no disponible: la empresa no tiene API key de Groq ni la cascada global tiene keys."),
      { code: "AI_DISABLED" },
    );
  }

  // 2) Construir señales cruzadas (V2 — no existía en V1)
  let crossSignals: CrossModuleSignals | null = null;
  try {
    crossSignals = await buildCrossModuleSignals({
      companyId:    opts.companyId,
      currentStart: opts.currentStart,
      endDate:      opts.endDate,
      assetId:      opts.assetId,
      driverId:     opts.driverId,
    });
  } catch (err) {
    // Si el cruce falla (ej. tabla no existe en este entorno), seguimos
    // sin él en vez de romper el análisis completo.
    console.warn("[ai-insights] cross-module-signals falló, continuando sin cruce:", (err as Error)?.message);
  }

  // 3) Llamar a Groq
  const userPrompt = buildUserPrompt(opts, crossSignals);
  const t0 = Date.now();
  const result = await chatCompletionForCompany({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user",   content: userPrompt },
    ],
    temperature: 0.3,
    maxTokens:   1800,
    jsonMode:    true,
    timeoutMs:   35_000,
  }, opts.companyId);

  // 4) Parsear respuesta
  let parsed: AIInsights;
  try {
    parsed = JSON.parse(result.content);
  } catch {
    const cleaned = result.content
      .replace(/^```json\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    parsed = JSON.parse(cleaned);
  }
  parsed = validateInsights(parsed);

  const latencyMs = Date.now() - t0;

  // 5) Guardar en cache
  //    Las columnas legacy (resumen_ejecutivo, puntos_clave, etc.) se siguen
  //    escribiendo para no romper buildStatsPDF mientras no se actualice.
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + TTL_HOURS);

  const legacyResumen = parsed.resumenNarrativo;
  const legacyPuntos  = parsed.hallazgosSecundarios.map((h) => h.titulo);
  const legacyRecs    = parsed.accionPrincipal
    ? [{ titulo: parsed.accionPrincipal.titulo, accion: parsed.accionPrincipal.justificacion, prioridad: "alta" }]
    : [];
  const legacyAlertas = parsed.hallazgosSecundarios
    .filter((h) => h.severidad === "alta")
    .map((h) => ({ titulo: h.titulo, detalle: h.detalle, severidad: h.severidad }));

  const inserted = await db
    .insert(companyStatsInsightsCache)
    .values({
      companyId:        opts.companyId,
      modulo:           opts.modulo,
      periodo:          opts.periodo,
      fechaRef:         opts.fechaRef,
      fechaHasta:       opts.fechaHasta,
      assetId,
      driverId,
      provider:         "groq",
      model:            result.model,
      payload:          opts.payload as any,
      responseRaw:      result.content,
      // Columnas legacy (backward compat con PDF)
      resumenEjecutivo: legacyResumen,
      puntosClave:      legacyPuntos   as any,
      recomendaciones:  legacyRecs     as any,
      alertas:          legacyAlertas  as any,
      inputTokens:      result.promptTokens,
      outputTokens:     result.completionTokens,
      totalTokens:      result.totalTokens,
      latencyMs,
      expiresAt,
      inputHash,
    })
    .onConflictDoUpdate({
      target: [
        companyStatsInsightsCache.companyId,
        companyStatsInsightsCache.modulo,
        companyStatsInsightsCache.periodo,
        companyStatsInsightsCache.fechaRef,
        companyStatsInsightsCache.fechaHasta,
        companyStatsInsightsCache.assetId,
        companyStatsInsightsCache.driverId,
        companyStatsInsightsCache.inputHash,
      ],
      set: {
        provider:         "groq",
        model:            result.model,
        payload:          opts.payload as any,
        responseRaw:      result.content,
        resumenEjecutivo: legacyResumen,
        puntosClave:      legacyPuntos   as any,
        recomendaciones:  legacyRecs     as any,
        alertas:          legacyAlertas  as any,
        inputTokens:      result.promptTokens,
        outputTokens:     result.completionTokens,
        totalTokens:      result.totalTokens,
        latencyMs,
        expiresAt,
        createdAt:        new Date(),
      },
    })
    .returning({ id: companyStatsInsightsCache.id });

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

function hashInput(data: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(data, Object.keys(data).sort()))
    .digest("hex")
    .slice(0, 40);
}

function buildUserPrompt(opts: GenerateOpts, cross: CrossModuleSignals | null): string {
  const crossBlock = cross
    ? `\n\n── SEÑALES CRUZADAS ENTRE MÓDULOS (${cross.periodoDesde} → ${cross.periodoHasta}) ──
Alertas abiertas empresa: ${cross.totals.openAlerts}
Correctivos empresa: ${cross.totals.correctivos}
Combustible empresa: ${cross.totals.fuelGallons.toFixed(2)} gal / $${cross.totals.fuelCost.toFixed(2)}

Por vehículo (top 10 con actividad):
${JSON.stringify(
  cross.assets
    .filter((a) => a.openAlerts.length + a.correctivos + a.fuelGallons > 0)
    .sort((a, b) => b.openAlerts.length + b.correctivos - (a.openAlerts.length + a.correctivos))
    .slice(0, 10)
    .map((a) => ({
      placa:       a.plate ?? a.name,
      alertas:     a.openAlerts.length,
      correctivos: a.correctivos,
      galones:     +a.fuelGallons.toFixed(2),
      conductor:   a.activeDriver,
    })),
  null, 0,
)}

Por conductor (top 8 con actividad):
${JSON.stringify(
  cross.drivers
    .sort((a, b) => b.fuelGallons - a.fuelGallons)
    .slice(0, 8)
    .map((d) => ({
      nombre:      d.name,
      galones:     +d.fuelGallons.toFixed(2),
      correctivos: d.correctivosEnPeriodo,
      checklists:  d.checklistsCompletados,
      vehiculos:   d.vehiculosDistintos,
    })),
  null, 0,
)}`
    : "\n\n── SEÑALES CRUZADAS: no disponibles para este período ──";

  return `Módulo activo: ${opts.modulo}
Período: ${opts.periodo} (${opts.fechaRef} → ${opts.fechaHasta})
${opts.assetId  ? `Filtro vehículo ID: ${opts.assetId}\n` : ""}${opts.driverId ? `Filtro conductor ID: ${opts.driverId}\n` : ""}

── DATOS AGREGADOS DEL MÓDULO (lo que ya ve el usuario en pantalla) ──
${JSON.stringify(opts.payload, null, 0).slice(0, 5000)}
${crossBlock}

Devuelve SOLO este JSON (sin markdown, sin texto antes/después):
${RESPONSE_SCHEMA_HINT}`;
}

async function findCache(
  companyId: number, modulo: string, periodo: Periodo,
  fechaRef: string, fechaHasta: string,
  assetId: number, driverId: number, inputHash: string,
) {
  const rows = await db
    .select()
    .from(companyStatsInsightsCache)
    .where(
      and(
        eq(companyStatsInsightsCache.companyId,  companyId),
        eq(companyStatsInsightsCache.modulo,     modulo),
        eq(companyStatsInsightsCache.periodo,    periodo),
        eq(companyStatsInsightsCache.fechaRef,   fechaRef),
        eq(companyStatsInsightsCache.fechaHasta, fechaHasta),
        eq(companyStatsInsightsCache.assetId,    assetId),
        eq(companyStatsInsightsCache.driverId,   driverId),
        eq(companyStatsInsightsCache.inputHash,  inputHash),
        gte(companyStatsInsightsCache.expiresAt, new Date()),
      ),
    )
    .orderBy(sql`${companyStatsInsightsCache.createdAt} DESC`)
    .limit(1);
  return rows[0] ?? null;
}

function parseInsights(row: any): AIInsights {
  // Intenta leer el shape V2 desde responseRaw primero
  if (row.responseRaw) {
    try {
      const raw = JSON.parse(row.responseRaw);
      if (raw?.resumenNarrativo) return validateInsights(raw);
    } catch {
      // fallthrough a legacy
    }
  }
  // Fallback: convierte shape V1 → V2 para entradas cacheadas antiguas
  return {
    resumenNarrativo:     row.resumenEjecutivo ?? "",
    nivelAtencion:        "media",
    metricas:             [],
    accionPrincipal:      null,
    hallazgosSecundarios: Array.isArray(row.puntosClave)
      ? (row.puntosClave as string[]).map((t) => ({
          titulo: t, detalle: t, severidad: "baja" as const,
        }))
      : [],
  };
}

function validateInsights(raw: any): AIInsights {
  const nivelAtencion = (["ok", "media", "alta"] as const).includes(raw?.nivelAtencion)
    ? (raw.nivelAtencion as "ok" | "media" | "alta")
    : "media";

  const metricas: AIMetrica[] = Array.isArray(raw?.metricas)
    ? raw.metricas
        .filter((m: any) => m && typeof m.label === "string" && typeof m.valor === "string")
        .slice(0, 6)
    : [];

  let accionPrincipal: AIAccionPrincipal | null = null;
  if (raw?.accionPrincipal && typeof raw.accionPrincipal.titulo === "string") {
    accionPrincipal = {
      titulo:        raw.accionPrincipal.titulo,
      justificacion: raw.accionPrincipal.justificacion ?? "",
      refAssetPlate: raw.accionPrincipal.refAssetPlate ?? null,
      refDriverName: raw.accionPrincipal.refDriverName ?? null,
      chartRef:      normalizarChartRef(raw.accionPrincipal.chartRef),
    };
  }

  const hallazgosSecundarios: AIHallazgo[] = Array.isArray(raw?.hallazgosSecundarios)
    ? raw.hallazgosSecundarios
        .filter((h: any) => h && typeof h.titulo === "string" && typeof h.detalle === "string")
        .map((h: any) => ({
          titulo:        h.titulo,
          detalle:       h.detalle,
          severidad:     (["alta", "media", "baja"] as const).includes(h.severidad)
            ? (h.severidad as "alta" | "media" | "baja")
            : "baja",
          chartRef:      normalizarChartRef(h.chartRef),
          tags:          Array.isArray(h.tags) ? h.tags.filter((t: any) => typeof t === "string") : undefined,
          recomendacion: typeof h.recomendacion === "string" ? h.recomendacion : undefined,
        }))
        .slice(0, 5)
    : [];

  return {
    resumenNarrativo:     typeof raw?.resumenNarrativo === "string" ? raw.resumenNarrativo : "",
    nivelAtencion,
    metricas,
    accionPrincipal,
    hallazgosSecundarios,
  };
}