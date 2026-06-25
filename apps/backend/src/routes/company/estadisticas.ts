// routes/company/estadisticas.ts
// ─────────────────────────────────────────────────────────────────────
// Submódulo "reportes > estadisticas".
//
// Expone un endpoint por módulo (mantenimiento, combustible, flotas) que
// devuelve el JSON agregado listo para que el frontend pinte los 6 charts
// y los 4 KPIs. Toda la matemática (variación, regresión, z-score, fill
// de buckets) se hace en memoria sobre filas ya agregadas, NUNCA sobre
// la BD.
//
// Doble candado:
//   1. requireModule('reportes', 'estadisticas')  → bypass solo owner/admin/superadmin
//   2. requirePermission('reportes', 'estadisticas', 'ver')  → refuerza
//
// Fase 1 (MVP, sin IA):
//   - GET /:modulo          → datos del módulo
//   - GET /:modulo/anomalias  → lista de anomalías (vacía hasta fase 4)
// ─────────────────────────────────────────────────────────────────────

import { Router } from "express";
import { eq, and, gte, lte, desc, sql, inArray } from "drizzle-orm";
import { db } from "../../db/client";
import {
  companyAssets,
  companyMaintenanceRecords,
  companyFuelEntries,
  companyDrivers,
  companyStatsAnomalies,
} from "../../db/schema/operational";
import { requireModule } from "../../middlewares/requireModule";
import { requirePermission } from "../../middlewares/requirePermission";
import {
  bucketByPeriod,
  classifySeverity,
  currentBucket,
  fillMissingPeriods,
  linearRegression,
  meanStd,
  previousBucket,
  variationPct,
  zScore,
  type Periodo,
} from "../../lib/stats-math";
import { calculateMantenimiento } from "./stats/mantenimiento";
import { calculateCombustible } from "./stats/combustible";
import { calculateFlotas } from "./stats/flotas";
import { calculateConductores } from "./stats/conductores";
import { calculateChecklists } from "./stats/checklists";
import { calculateAlertas } from "./stats/alertas";
import { calculateAc } from "./stats/ac";
import { calculateSeguros } from "./stats/seguros";
import { calculatePeajes } from "./stats/peajes";
import { calculateAsignaciones } from "./stats/asignaciones";

const router = Router({ mergeParams: true });

const MODULOS_VALIDOS = [
  "mantenimiento",
  "combustible",
  "flotas",
  "conductores",
  "checklists",
  "alertas",
  "ac",
  "seguros",
  "peajes",
  "asignaciones",
] as const;
type ModuloKey = (typeof MODULOS_VALIDOS)[number];

const PERIODOS_VALIDOS = ["month", "quarter", "year"] as const;
type PeriodoKey = (typeof PERIODOS_VALIDOS)[number];

// ─── Helpers comunes ────────────────────────────────────────────────

function parseModulo(raw: string): ModuloKey | null {
  return (MODULOS_VALIDOS as readonly string[]).includes(raw)
    ? (raw as ModuloKey)
    : null;
}

function parsePeriodo(raw: string | undefined): PeriodoKey {
  if (raw && (PERIODOS_VALIDOS as readonly string[]).includes(raw)) {
    return raw as PeriodoKey;
  }
  return "month";
}

function parseAssetId(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function parseDriverId(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

// ─── GET /company/:id/estadisticas/:modulo ───────────────────────────

router.get(
  "/:modulo",
  requireModule("reportes", "estadisticas"),
  requirePermission("reportes", "estadisticas", "ver"),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const modulo = parseModulo(req.params.modulo);
      if (!modulo) {
        return res.status(400).json({
          error: "Módulo inválido. Usa: mantenimiento | combustible | flotas | conductores | checklists | alertas | ac | seguros | peajes | asignaciones",
        });
      }

      const periodo = parsePeriodo(req.query.periodo as string | undefined);
      const fechaRef = (req.query.fecha as string | undefined) ?? new Date().toISOString().slice(0, 10);
      const fechaHasta = (req.query.fechaHasta as string | undefined) ?? fechaRef;
      const assetId  = parseAssetId(req.query.assetId as string | undefined);
      const driverId = parseDriverId(req.query.driverId as string | undefined);
      const refDate  = new Date(fechaRef);
      const endDate  = new Date(fechaHasta);

      const data =
        modulo === "mantenimiento"
          ? await calculateMantenimiento({ companyId, periodo, refDate, endDate, assetId, driverId })
          : modulo === "combustible"
            ? await calculateCombustible({ companyId, periodo, refDate, endDate, assetId, driverId })
            : modulo === "flotas"
              ? await calculateFlotas({ companyId, periodo, refDate, endDate, assetId, driverId })
              : modulo === "conductores"
                ? await calculateConductores({ companyId, periodo, refDate, endDate, driverId })
                : modulo === "checklists"
                  ? await calculateChecklists({ companyId, periodo, refDate, endDate, assetId })
                  : modulo === "alertas"
                    ? await calculateAlertas({ companyId, periodo, refDate, endDate, assetId })
                      : modulo === "ac"
                        ? await calculateAc({ companyId, periodo, refDate, endDate })
                        : modulo === "seguros"
                          ? await calculateSeguros({ companyId, periodo, refDate, endDate, assetId })
                          : modulo === "peajes"
                            ? await calculatePeajes({ companyId, periodo, refDate, endDate, assetId, driverId })
                            : await calculateAsignaciones({ companyId, periodo, refDate, endDate, assetId, driverId });

      return res.json({
        modulo,
        periodo,
        fechaRef,
        fechaHasta,
        bucketActual:   currentBucket(periodo, refDate),
        bucketAnterior: previousBucket(periodo, refDate),
        ...data,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /company/:id/estadisticas/:modulo/multi ─────────────────────
// Compara N rangos en el mismo chart. Útil para ver tendencias entre
// períodos (Q1 vs Q2 vs Q3, año actual vs año pasado, etc).
//
// Query params:
//   - rangos:  Array<YYYY-MM-DD..YYYY-MM-DD>  (separados por coma)
//              ej. ?rangos=2025-01-01..2025-03-31,2025-04-01..2025-06-30
//   - comparar: shortcut para casos comunes:
//                "anterior"    → período anterior (mes/trimestre/año)
//                "yoy"         → mismo período año pasado
//                "qAnterior"   → trimestre anterior
//              si se usa `comparar`, `rangos` se ignora.
//   - periodo, assetId, driverId: igual que el endpoint normal
//
// Devuelve: MultiResponse con series paralelas, una por rango.

router.get(
  "/:modulo/multi",
  requireModule("reportes", "estadisticas"),
  requirePermission("reportes", "estadisticas", "ver"),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const modulo = parseModulo(req.params.modulo);
      if (!modulo) {
        return res.status(400).json({ error: "Módulo inválido" });
      }

      const periodo = parsePeriodo(req.query.periodo as string | undefined);
      const assetId  = parseAssetId(req.query.assetId as string | undefined);
      const driverId = parseDriverId(req.query.driverId as string | undefined);

      // ── Resolver lista de rangos ────────────────────────────
      const { calculateMulti } = await import("../../lib/stats-multi");
      let rangos: Array<{ id: string; label: string; desde: string; hasta: string }> = [];

      const comparar = req.query.comparar as string | undefined;
      const refDate = new Date(req.query.fecha as string ?? new Date().toISOString().slice(0, 10));

      if (comparar === "anterior" || comparar === "yoy" || comparar === "qAnterior") {
        // Para 'anterior' y 'qAnterior' generamos 1 rango extra.
        // Para 'yoy' generamos mismo rango año pasado.
        if (comparar === "yoy") {
          const yoyDate = new Date(refDate);
          yoyDate.setFullYear(yoyDate.getFullYear() - 1);
          const yoyStart = startOfBucket(yoyDate, periodo);
          const yoyEnd   = new Date(startOfBucket(refDate, periodo).getTime() - 1);
          rangos.push({
            id:    `yoy-${refDate.toISOString().slice(0,7)}`,
            label: `Año anterior (${yoyDate.getFullYear()})`,
            desde: yoyStart.toISOString().slice(0, 10),
            hasta: yoyEnd.toISOString().slice(0, 10),
          });
        } else if (comparar === "qAnterior") {
          const prev = new Date(refDate);
          if (periodo === "month")   prev.setMonth(prev.getMonth() - 3);
          else if (periodo === "quarter") prev.setMonth(prev.getMonth() - 3);
          else                        prev.setFullYear(prev.getFullYear() - 1);
          rangos.push({
            id:    `prevq-${prev.toISOString().slice(0,7)}`,
            label: comparar === "anterior" ? "Período anterior" : "Trimestre anterior",
            desde: startOfBucket(prev, periodo).toISOString().slice(0, 10),
            hasta: new Date(startOfBucket(refDate, periodo).getTime() - 1).toISOString().slice(0, 10),
          });
        } else {
          const prev = new Date(refDate);
          if (periodo === "month") prev.setMonth(prev.getMonth() - 1);
          else if (periodo === "quarter") prev.setMonth(prev.getMonth() - 3);
          else prev.setFullYear(prev.getFullYear() - 1);
          rangos.push({
            id:    `prev-${prev.toISOString().slice(0,7)}`,
            label: "Período anterior",
            desde: startOfBucket(prev, periodo).toISOString().slice(0, 10),
            hasta: new Date(startOfBucket(refDate, periodo).getTime() - 1).toISOString().slice(0, 10),
          });
        }
      } else {
        // Parseamos el param `rangos`: "2025-01-01..2025-03-31,2025-04-01..2025-06-30"
        const raw = (req.query.rangos as string | undefined) ?? "";
        const pairs = raw.split(",").map((s) => s.trim()).filter(Boolean);
        for (const p of pairs) {
          const [desde, hasta] = p.split("..").map((s) => s.trim());
          if (!desde || !hasta) continue;
          rangos.push({
            id:    `r${rangos.length}-${desde}`,
            label: `${desde} → ${hasta}`,
            desde,
            hasta,
          });
        }
      }

      if (rangos.length === 0) {
        return res.status(400).json({
          error: "Debes enviar ?rangos=YYYY-MM-DD..YYYY-MM-DD,YYYY-MM-DD..YYYY-MM-DD o ?comparar=anterior|yoy|qAnterior",
        });
      }

      const data = await calculateMulti({
        companyId, modulo, periodo, rangos, assetId, driverId,
      });

      return res.json(data);
    } catch (err) {
      next(err);
    }
  },
);

function startOfBucket(ref: Date, periodo: "month" | "quarter" | "year"): Date {
  if (periodo === "year") return new Date(Date.UTC(ref.getUTCFullYear(), 0, 1));
  if (periodo === "quarter") {
    const m = Math.floor(ref.getUTCMonth() / 3) * 3;
    return new Date(Date.UTC(ref.getUTCFullYear(), m, 1));
  }
  return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
}

// ─── GET /company/:id/estadisticas/:modulo/anomalias ─────────────────
// Devuelve las anomalías registradas en `company_stats_anomalias` para
// el módulo solicitado. En Fase 1 simplemente las lista; en Fase 4 el
// detector se ejecuta en background y persiste aquí.

router.get(
  "/:modulo/anomalias",
  requireModule("reportes", "estadisticas"),
  requirePermission("reportes", "estadisticas", "ver"),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const modulo = parseModulo(req.params.modulo);
      if (!modulo) {
        return res.status(400).json({ error: "Módulo inválido" });
      }

      // Query params opcionales:
      //   ?incluirResueltas=true   → incluye las que tienen metadata.resolvedAt
      //   ?limite=200               → hasta 200 (default 100)
      const incluirResueltas = (req.query.incluirResueltas as string) === "true";
      const limite = Math.min(Number(req.query.limite ?? 100) || 100, 500);

      const all = await db
        .select()
        .from(companyStatsAnomalies)
        .where(
          and(
            eq(companyStatsAnomalies.companyId, companyId),
            eq(companyStatsAnomalies.modulo, modulo),
          ),
        )
        .orderBy(desc(companyStatsAnomalies.detectadoEn))
        .limit(limite);

      const rows = incluirResueltas
        ? all
        : all.filter((r) => {
            const meta = (r.metadata as any) ?? {};
            return !meta.resolvedAt;
          });

      return res.json({
        modulo,
        total: rows.length,
        anomalias: rows.map((r) => ({
          id:             r.id,
          tipo:           r.tipo,
          dimension:      r.dimension,
          dimensionId:    r.dimensionId,
          dimensionLabel: r.dimensionLabel,
          severidad:      r.severidad,
          descripcion:    r.descripcion,
          metadata:       r.metadata,
          detectadoEn:    r.detectadoEn,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /company/:id/estadisticas/redetectar ─────────────────────
// Fuerza la ejecución del detector para esta empresa.
// Útil cuando el admin quiere refrescar las anomalías sin esperar al cron.

router.post(
  "/redetectar",
  requireModule("reportes", "estadisticas"),
  requirePermission("reportes", "estadisticas", "ver"),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const { runSweep } = await import("../../lib/cron/stats-anomalies");
      const result = await runSweep(companyId);
      return res.json({
        ok: true,
        companyId,
        ...result,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /company/:id/estadisticas/cleanup ──────────────────────
// Ejecuta la limpieza de insights_cache >7d y anomalías resueltas >90d.
// Lo usa el cron de mantenimiento; expuesto aquí para forzar manualmente.

router.post(
  "/cleanup",
  requireModule("reportes", "estadisticas"),
  requirePermission("reportes", "estadisticas", "ver"),
  async (_req, res, next) => {
    try {
      const { runCleanup } = await import("../../lib/cron/cleanup");
      const result = await runCleanup();
      return res.json({ ok: true, ...result });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /company/:id/estadisticas/:modulo/exportar-pdf ───────────
// Genera un PDF con KPIs, charts, anomalías e insights IA del módulo.
// Body: { periodo?, fecha?, fechaHasta?, assetId?, driverId? }
//
// Devuelve: application/pdf (stream).

const MODULO_LABELS: Record<ModuloKey, string> = {
  mantenimiento:  "Mantenimiento",
  combustible:    "Combustible",
  flotas:         "Flotas",
  conductores:    "Conductores",
  checklists:     "Checklists",
  alertas:        "Alertas",
  ac:             "Aires Acondicionados",
  seguros:        "Seguros",
  peajes:         "Peajes",
  asignaciones:   "Asignaciones",
};

router.post(
  "/:modulo/exportar-pdf",
  requireModule("reportes", "estadisticas"),
  requirePermission("reportes", "estadisticas", "ver"),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const modulo = parseModulo(req.params.modulo);
      if (!modulo) {
        return res.status(400).json({ error: "Módulo inválido" });
      }

      const body = (req.body ?? {}) as {
        periodo?: Periodo;
        fecha?: string;
        fechaHasta?: string;
        assetId?: number | null;
        driverId?: number | null;
      };

      const periodo    = body.periodo ?? "month";
      const fechaRef   = body.fecha   ?? new Date().toISOString().slice(0, 10);
      const fechaHasta = body.fechaHasta ?? fechaRef;
      const assetId    = body.assetId  ?? null;
      const driverId   = body.driverId ?? null;

      const refDate = new Date(fechaRef);
      const endDate = new Date(fechaHasta);

      // 1) Reutiliza el calculator para obtener el JSON agregado.
      const data =
        modulo === "mantenimiento"
          ? await calculateMantenimiento({ companyId, periodo, refDate, endDate, assetId, driverId })
          : modulo === "combustible"
            ? await calculateCombustible({ companyId, periodo, refDate, endDate, assetId, driverId })
            : modulo === "flotas"
              ? await calculateFlotas({ companyId, periodo, refDate, endDate, assetId, driverId })
              : modulo === "conductores"
                ? await calculateConductores({ companyId, periodo, refDate, endDate, driverId })
                : modulo === "checklists"
                  ? await calculateChecklists({ companyId, periodo, refDate, endDate, assetId })
                  : modulo === "alertas"
                    ? await calculateAlertas({ companyId, periodo, refDate, endDate, assetId })
                      : modulo === "ac"
                        ? await calculateAc({ companyId, periodo, refDate, endDate })
                        : modulo === "seguros"
                          ? await calculateSeguros({ companyId, periodo, refDate, endDate, assetId })
                          : modulo === "peajes"
                            ? await calculatePeajes({ companyId, periodo, refDate, endDate, assetId, driverId })
                            : await calculateAsignaciones({ companyId, periodo, refDate, endDate, assetId, driverId });

      // 2) Anomalías persistidas (cron) — para que el PDF refleje el estado actual.
      const persistedAnoms = await db
        .select()
        .from(companyStatsAnomalies)
        .where(and(
          eq(companyStatsAnomalies.companyId, companyId),
          eq(companyStatsAnomalies.modulo, modulo),
        ))
        .orderBy(desc(companyStatsAnomalies.detectadoEn))
        .limit(50);

      const anomaliasParaPDF = persistedAnoms
        .filter((r) => !(r.metadata as any)?.resolvedAt)
        .map((r) => ({
          tipo:           r.tipo,
          dimensionLabel: r.dimensionLabel ?? "—",
          severidad:      r.severidad as "alta" | "media" | "baja",
          descripcion:    r.descripcion,
          detectadoEn:    r.detectadoEn?.toISOString(),
        }));

      // 3) Insights del cache (sin generar nuevos para el PDF)
      const { generateInsights } = await import("../../lib/ai-insights");
      const { isAiEnabled }     = await import("../../lib/ai-client");
      let insights: any = null;
      let insightsMeta: any = null;
      if (isAiEnabled()) {
        try {
          const ins = await generateInsights({
            companyId, modulo, periodo, fechaRef, fechaHasta, assetId, driverId,
            payload:        data,
            forzarRegenerar: false,
          });
          insights    = ins.insights;
          insightsMeta = {
            fromCache: ins.fromCache,
            model:     ins.model,
            latencyMs: ins.latencyMs,
          };
        } catch (err) {
          // Si falla la IA, el PDF se genera sin insights.
          console.warn("[exportar-pdf] sin insights IA:", (err as Error)?.message);
        }
      }

      // 4) Nombre de la empresa (best-effort)
      const { companies } = await import("../../db/schema/platform");
      const [c] = await db
        .select({ name: companies.name })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);

      // 5) Generar PDF
      const { buildStatsPDF } = await import("../../lib/stats-pdf");
      const buffer = buildStatsPDF({
        companyName:     c?.name ?? `Empresa ${companyId}`,
        modulo,
        moduloLabel:     MODULO_LABELS[modulo],
        periodo,
        fechaRef,
        fechaHasta,
        bucketActual:    bucketByPeriod(refDate, periodo),
        bucketAnterior:   previousBucket(periodo, refDate),
        kpis:            data.kpis,
        lineChart:       data.lineChart,
        barVChart:       data.barVChart,
        barHChart:       data.barHChart,
        radarChart:      data.radarChart,
        exponencialChart:data.exponencialChart,
        comparacionChart:data.comparacionChart,
        anomalias:       anomaliasParaPDF,
        insights,
        insightsMeta,
      });

      // 6) Headers de respuesta (Content-Disposition con filename)
      const filename = `estadisticas-${modulo}-${fechaRef}.pdf`
        .replace(/[^a-z0-9.\-]/gi, "_");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", String(buffer.length));
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /company/:id/estadisticas/:modulo/analisis-ia ────────────
// Análisis IA del módulo. Usa cache (TTL 6h) por (inputHash).
// Body: { periodo?, fecha?, fechaHasta?, assetId?, driverId?, forzarRegenerar? }
//
// Devuelve: { insights, fromCache, model, provider, latencyMs, tokens, ... }

router.post(
  "/:modulo/analisis-ia",
  requireModule("reportes", "estadisticas"),
  requirePermission("reportes", "estadisticas", "ver"),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const modulo = parseModulo(req.params.modulo);
      if (!modulo) {
        return res.status(400).json({
          error: "Módulo inválido. Usa: mantenimiento | combustible | flotas | ...",
        });
      }

      const body = (req.body ?? {}) as {
        periodo?: Periodo;
        fecha?: string;
        fechaHasta?: string;
        assetId?: number | null;
        driverId?: number | null;
        forzarRegenerar?: boolean;
      };

      const periodo    = body.periodo ?? "month";
      const fechaRef   = body.fecha   ?? new Date().toISOString().slice(0, 10);
      const fechaHasta = body.fechaHasta ?? fechaRef;
      const assetId    = body.assetId  ?? null;
      const driverId   = body.driverId ?? null;

      const refDate = new Date(fechaRef);
      const endDate = new Date(fechaHasta);

      // 1) Calcular el JSON agregado con el calculator del módulo.
      //    Es el MISMO cálculo que usa GET /:modulo, así que el cache de
      //    insights es coherente con la pantalla del Tablero.
      const data =
        modulo === "mantenimiento"
          ? await calculateMantenimiento({ companyId, periodo, refDate, endDate, assetId, driverId })
          : modulo === "combustible"
            ? await calculateCombustible({ companyId, periodo, refDate, endDate, assetId, driverId })
            : modulo === "flotas"
              ? await calculateFlotas({ companyId, periodo, refDate, endDate, assetId, driverId })
              : modulo === "conductores"
                ? await calculateConductores({ companyId, periodo, refDate, endDate, driverId })
                : modulo === "checklists"
                  ? await calculateChecklists({ companyId, periodo, refDate, endDate, assetId })
                  : modulo === "alertas"
                    ? await calculateAlertas({ companyId, periodo, refDate, endDate, assetId })
                      : modulo === "ac"
                        ? await calculateAc({ companyId, periodo, refDate, endDate })
                        : modulo === "seguros"
                          ? await calculateSeguros({ companyId, periodo, refDate, endDate, assetId })
                          : modulo === "peajes"
                            ? await calculatePeajes({ companyId, periodo, refDate, endDate, assetId, driverId })
                            : await calculateAsignaciones({ companyId, periodo, refDate, endDate, assetId, driverId });

      // 2) Llamar al generador de insights (con cache automático).
      const { generateInsights } = await import("../../lib/ai-insights");
      const { isAiEnabled }     = await import("../../lib/ai-client");
      if (!isAiEnabled()) {
        return res.status(503).json({
          error: "Análisis IA no disponible: GROQ_API_KEY no configurada en el backend.",
          code:  "AI_DISABLED",
        });
      }

      try {
        const result = await generateInsights({
          companyId,
          modulo,
          periodo,
          fechaRef,
          fechaHasta,
          assetId,
          driverId,
          payload:        data,
          forzarRegenerar: body.forzarRegenerar ?? false,
        });

        return res.json({
          modulo,
          periodo,
          fechaRef,
          fechaHasta,
          fromCache:    result.fromCache,
          provider:     result.provider,
          model:        result.model,
          latencyMs:    result.latencyMs,
          inputTokens:  result.inputTokens,
          outputTokens: result.outputTokens,
          insights:     result.insights,
        });
      } catch (err: any) {
        if (err?.code === "AI_DISABLED") {
          return res.status(503).json({ error: err.message, code: "AI_DISABLED" });
        }
        // Cualquier otro error de la IA: devolvemos 502 para que el frontend
        // muestre "no se pudo generar el análisis" sin romper la página.
        console.error("[analisis-ia] error:", err);
        return res.status(502).json({
          error:  "No se pudo generar el análisis IA.",
          detalle: err?.message ?? String(err),
        });
      }
    } catch (err) {
      next(err);
    }
  },
);

export default router;
