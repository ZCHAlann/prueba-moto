// routes/company/stats/mantenimiento.ts
// ─────────────────────────────────────────────────────────────────────
// Calculator Mantenimiento.
//
// KPIs: OTs registradas, costo total, costo promedio/OT, % correctivos.
// Charts:
//   - line:      costo por período (con proyección 3 períodos)
//   - barV:      OTs por estado
//   - barH:      top 10 vehículos por costo
//   - radar:     costo por categoría
//   - exponenc:  costo diario (últimos 30 días)
//   - comparac:  costo actual vs anterior por categoría
// Anomalías: bucket histórico con z-score > 1; asset con costo > 2σ.
// ─────────────────────────────────────────────────────────────────────

import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { db } from "../../../db/client";
import {
  companyMaintenanceRecords,
  companyAssets,
  companyOilChanges,
  companyOilTypes,
} from "../../../db/schema/operational";
import {
  bucketByPeriod, classifySeverity, fillMissingPeriods, linearRegression, meanStd, variationPct, zScore, type Periodo,
} from "../../../lib/stats-math";

// ─── Tipos públicos reusados por otros calculators ─────────────────

export type AnomaliaItem = {
  id?: number;
  tipo: string;
  dimension: string;
  dimensionLabel: string;
  severidad: "baja" | "media" | "alta";
  descripcion: string;
  detectadoEn?: string;
};

export type TcoBreakdownLite = {
  combustible:   number;
  mantenimiento: number;
  peajes:        number;
  seguros:       number;
  total:         number;
  kmRecorridos:  number;
  costoPorKm:    number;
  costoPorMes:   number;
};

export type TcoItem = {
  assetId: number;
  plate:   string | null;
  name:    string;
  tco:     TcoBreakdownLite;
};

export type ScorecardComponent = {
  key:     "edad" | "mantenimiento" | "combustible" | "alertas" | "estado";
  label:   string;
  score:   number;
  detalle: string;
};

export type ScorecardItem = {
  assetId:        number;
  plate:          string | null;
  name:           string;
  score:          number;
  riskLevel:      "saludable" | "atencion" | "riesgo" | "critico";
  recomendacion:  string;
  componentes:    ScorecardComponent[];
};

export type SaludFlota = {
  tco:            TcoItem[];
  scorecard:      ScorecardItem[];
  fleetAvgScore:  number;
  topRiesgo:      ScorecardItem[];
  topTco:         TcoItem[];
};

export type KpiItem = {
  label: string;
  valor: number | string;
  unidad?: string;
  variacionPct?: number;
  icono?: string;
};

export type LinePoint   = { x: string; y: number; proyectado?: boolean };
export type BarPoint    = { x: string; y: number };
export type BarHPoint   = { label: string; value: number; meta?: string };
export type RadarPoint  = { axis: string; value: number };
export type BarCompItem = { label: string; actual: number; anterior: number };

export type StatInput = {
  companyId: number;
  periodo: Periodo;
  refDate: Date;
  endDate?: Date;
  assetId?: number;
  driverId?: number;
};

export type StatResult = {
  kpis:             KpiItem[];
  lineChart:        { title: string; unidad: string; data: LinePoint[];  regresion: { slope: number; r2: number } };
  barVChart:        { title: string; unidad: string; data: BarPoint[] };
  barHChart:        { title: string; unidad: string; data: BarHPoint[] };
  radarChart:       { title: string; data: RadarPoint[] };
  exponencialChart: { title: string; unidad: string; data: LinePoint[] };
  comparacionChart: { title: string; data: BarCompItem[] };
  anomalias:        AnomaliaItem[];
  /** Solo el calculator de flotas lo popula. */
  salud?:           SaludFlota;
};

export async function calculateMantenimiento(input: StatInput): Promise<StatResult> {
  const { companyId, periodo, refDate, endDate, assetId } = input;
  const end = endDate ?? refDate;

  const from = new Date(refDate);
  from.setMonth(from.getMonth() - 12);

  const where: any[] = [
    eq(companyMaintenanceRecords.companyId, companyId),
    gte(companyMaintenanceRecords.createdAt, from),
    lte(companyMaintenanceRecords.createdAt, end),
  ];
  if (assetId) where.push(eq(companyMaintenanceRecords.assetId, assetId));

  const rows = await db
    .select({
      id:          companyMaintenanceRecords.id,
      type:        companyMaintenanceRecords.type,
      status:      companyMaintenanceRecords.status,
      category:    companyMaintenanceRecords.category,
      totalCost:   companyMaintenanceRecords.totalCost,
      laborCost:   companyMaintenanceRecords.laborCost,
      assetId:     companyMaintenanceRecords.assetId,
      scheduledFor: companyMaintenanceRecords.scheduledFor,
      completedAt: companyMaintenanceRecords.completedAt,
      createdAt:   companyMaintenanceRecords.createdAt,
    })
    .from(companyMaintenanceRecords)
    .where(and(...where));

  // Assets
  const assetIds = Array.from(new Set(rows.map((r) => r.assetId).filter((x): x is number => !!x)));
  const assetMap = new Map<number, { name: string; plate: string | null }>();
  if (assetIds.length) {
    const assets = await db
      .select({ id: companyAssets.id, name: companyAssets.name, plate: companyAssets.plate })
      .from(companyAssets)
      .where(and(eq(companyAssets.companyId, companyId), sql`${companyAssets.id} = ANY(${assetIds})`));
    for (const a of assets) assetMap.set(a.id, { name: a.name, plate: a.plate });
  }

  // Cambios de aceite (período de 12 meses).
  // NOTA: company_oil_changes.date es VARCHAR (no DATE) — comparamos
  // contra string ISO, sin el cast ::date que sí usamos en otras tablas.
  const oilChanges = await db
    .select()
    .from(companyOilChanges)
    .where(
      and(
        eq(companyOilChanges.companyId, companyId),
        gte(companyOilChanges.date, from.toISOString().slice(0, 10)),
        lte(companyOilChanges.date, end.toISOString().slice(0, 10)),
      ),
    )
    .orderBy(desc(companyOilChanges.date));

  // Tipos de aceite
  const oilTypes = await db
    .select()
    .from(companyOilTypes)
    .where(eq(companyOilTypes.companyId, companyId));
  const oilTypeMap = new Map(oilTypes.map((t) => [t.id, t]));

  // ─── Buckets ────────────────────────────────────────────────────
  const currentStart  = startOfBucket(end, periodo);
  const previousStart = startOfPreviousBucket(end, periodo);
  const previousEnd   = new Date(currentStart.getTime() - 1);

  const inCurrent  = rows.filter((r) => dateOf(r) >= currentStart);
  const inPrevious = rows.filter((r) => dateOf(r) >= previousStart && dateOf(r) <= previousEnd);

  // ─── KPIs ───────────────────────────────────────────────────────
  const totalActual   = inCurrent.reduce((acc, r) => acc + num(r.totalCost), 0);
  const totalAnterior = inPrevious.reduce((acc, r) => acc + num(r.totalCost), 0);
  const otsActual     = inCurrent.length;
  const otsAnterior   = inPrevious.length;
  const costoPromActual   = otsActual ? totalActual / otsActual : 0;
  const costoPromAnterior = otsAnterior ? totalAnterior / otsAnterior : 0;
  const correctivosActual = inCurrent.filter((r) => r.type === "Correctivo").length;
  const pctCorrectivosActual = otsActual ? (correctivosActual / otsActual) * 100 : 0;
  const correctivosAnterior = inPrevious.filter((r) => r.type === "Correctivo").length;
  const pctCorrectivosAnterior = otsAnterior ? (correctivosAnterior / otsAnterior) * 100 : 0;

  // Aceite
  const cambiosAceiteActuales = oilChanges.filter((o) => {
    const d = new Date(o.date);
    return d >= currentStart;
  });
  const cambiosAceiteAnterior = oilChanges.filter((o) => {
    const d = new Date(o.date);
    return d >= previousStart && d <= previousEnd;
  });
  const aceiteCantActual = cambiosAceiteActuales.reduce((a, c) => a + (c.quantity ?? 0), 0);
  const aceiteCantAnterior = cambiosAceiteAnterior.reduce((a, c) => a + (c.quantity ?? 0), 0);

  const kpis: KpiItem[] = [
    { label: "OTs registradas",   valor: otsActual,                            variacionPct: variationPct(otsActual, otsAnterior),                 icono: "clipboard-list" },
    { label: "Costo total",       valor: round2(totalActual),  unidad: "USD",  variacionPct: variationPct(totalActual, totalAnterior),          icono: "dollar-sign" },
    { label: "Costo promedio/OT", valor: round2(costoPromActual), unidad: "USD", variacionPct: variationPct(costoPromActual, costoPromAnterior), icono: "trending-up" },
    { label: "Cambios de aceite", valor: cambiosAceiteActuales.length,        variacionPct: variationPct(cambiosAceiteActuales.length, cambiosAceiteAnterior.length), icono: "droplet" },
  ];

  // ─── 1. Line: costo por período (con proyección) ───────────────
  const serieCosto: Record<string, number> = {};
  for (const r of rows) {
    const d = dateOf(r);
    if (!d) continue;
    const bucket = bucketByPeriod(d, periodo);
    serieCosto[bucket] = (serieCosto[bucket] ?? 0) + num(r.totalCost);
  }
  const serieCostoFull = fillMissingPeriods(periodo, serieCosto, () => 0);
  const linePoints: LinePoint[] = Object.keys(serieCostoFull)
    .sort()
    .map((k) => ({ x: k, y: round2(serieCostoFull[k] as number) }));

  const tail = linePoints.slice(-6);
  const reg = linearRegression(tail.map((p, i) => ({ x: i, y: p.y })));
  for (let i = 1; i <= 3; i++) {
    const nextBucket = nextBucketKey(linePoints[linePoints.length - 1]?.x ?? bucketByPeriod(end, periodo), periodo, i);
    linePoints.push({ x: nextBucket, y: round2(Math.max(0, reg.project(tail.length - 1 + i))), proyectado: true });
  }

  // ─── 2. Bar V: OTs por estado ──────────────────────────────────
  const statusCount: Record<string, number> = {};
  for (const r of inCurrent) {
    statusCount[r.status] = (statusCount[r.status] ?? 0) + 1;
  }
  const statusOrder = ["Programado", "En curso", "PendienteAtencion", "Completado", "Cancelado"];
  const barV: BarPoint[] = statusOrder
    .filter((s) => statusCount[s])
    .map((s) => ({ x: s, y: statusCount[s] ?? 0 }));

  // ─── 3. Bar H: top 10 vehículos por costo (período actual) ─────
  const costByAsset: Record<number, number> = {};
  for (const r of inCurrent) {
    if (!r.assetId) continue;
    costByAsset[r.assetId] = (costByAsset[r.assetId] ?? 0) + num(r.totalCost);
  }
  const top = Object.entries(costByAsset)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 10);
  const barH: BarHPoint[] = top.map(([id, val]) => {
    const a = assetMap.get(Number(id));
    return { label: a?.plate || a?.name || `Activo ${id}`, value: round2(val as number), meta: a?.name };
  });

  // ─── 4. Radar: aceite por tipo (cantidad de cambios) ───────────
  const cambiosByType: Record<string, number> = {};
  for (const c of cambiosAceiteActuales) {
    const t = oilTypeMap.get(c.oilTypeId);
    const k = t?.name || "Sin tipo";
    cambiosByType[k] = (cambiosByType[k] ?? 0) + 1;
  }
  // Si no hay cambios de aceite en el período, fallback a categorías de OT
  const radar: RadarPoint[] = Object.keys(cambiosByType).length > 0
    ? Object.entries(cambiosByType).map(([k, v]) => ({ axis: k, value: v }))
    : (() => {
        const costByCategory: Record<string, number> = {};
        for (const r of inCurrent) {
          const key = r.category ?? "Otro";
          costByCategory[key] = (costByCategory[key] ?? 0) + num(r.totalCost);
        }
        return Object.entries(costByCategory).map(([k, v]) => ({ axis: k, value: round2(v) }));
      })();

  // ─── 5. Exponencial: costo diario (últimos 30 días) ────────────
  const dailyStart = new Date(end);
  dailyStart.setDate(dailyStart.getDate() - 30);
  const dailyCosts: Record<string, number> = {};
  for (const r of rows) {
    const d = dateOf(r);
    if (!d || d < dailyStart) continue;
    const key = d.toISOString().slice(0, 10);
    dailyCosts[key] = (dailyCosts[key] ?? 0) + num(r.totalCost);
  }
  const dailyFull: Record<string, number> = {};
  for (let i = 30; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dailyFull[key] = round2(dailyCosts[key] ?? 0);
  }
  const exponencial: LinePoint[] = Object.entries(dailyFull)
    .sort()
    .map(([k, v]) => ({ x: k.slice(5), y: v }));

  // ─── 6. Comparación: actual vs anterior por categoría ──────────
  const buildByCategory = (list: typeof rows) => {
    const out: Record<string, number> = {};
    for (const r of list) {
      const k = r.category ?? "Otro";
      out[k] = (out[k] ?? 0) + num(r.totalCost);
    }
    return out;
  };
  const catA = buildByCategory(inCurrent);
  const catP = buildByCategory(inPrevious);
  const allCats = new Set([...Object.keys(catA), ...Object.keys(catP)]);
  const comparacion: BarCompItem[] = Array.from(allCats).map((c) => ({
    label: c,
    actual: round2(catA[c] ?? 0),
    anterior: round2(catP[c] ?? 0),
  }));

  // ─── Anomalías ──────────────────────────────────────────────────
  const anomalias = detectAnomalias({
    serieCostoFull,
    currentBucket: bucketByPeriod(end, periodo),
    costByAsset,
    assetMap,
  });

  return {
    kpis,
    lineChart:        { title: "Costo total por período",          unidad: "USD",    data: linePoints, regresion: { slope: round2(reg.slope), r2: round2(reg.r2) } },
    barVChart:        { title: "OTs por estado",                   unidad: "OTs",    data: barV },
    barHChart:        { title: "Top 10 vehículos por costo",       unidad: "USD",    data: barH },
    radarChart:       { title: Object.keys(cambiosByType).length > 0 ? "Cambios de aceite por tipo" : "Costo por categoría", data: radar },
    exponencialChart: { title: "Costo diario (últimos 30 días)",  unidad: "USD",    data: exponencial },
    comparacionChart: { title: "Costo actual vs período anterior", data: comparacion },
    anomalias,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────

function num(n: any): number {
  if (n == null) return 0;
  const v = typeof n === "string" ? parseFloat(n) : n;
  return Number.isFinite(v) ? v : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function dateOf(r: { completedAt: Date | null; scheduledFor: Date; createdAt: Date }): Date | null {
  return r.completedAt ?? r.scheduledFor ?? r.createdAt;
}

function startOfBucket(ref: Date, periodo: Periodo): Date {
  if (periodo === "year") return new Date(Date.UTC(ref.getUTCFullYear(), 0, 1));
  if (periodo === "quarter") {
    const m = Math.floor(ref.getUTCMonth() / 3) * 3;
    return new Date(Date.UTC(ref.getUTCFullYear(), m, 1));
  }
  return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
}

function startOfPreviousBucket(ref: Date, periodo: Periodo): Date {
  const d = startOfBucket(ref, periodo);
  if (periodo === "year") d.setUTCFullYear(d.getUTCFullYear() - 1);
  else if (periodo === "quarter") d.setUTCMonth(d.getUTCMonth() - 3);
  else d.setUTCMonth(d.getUTCMonth() - 1);
  return d;
}

function nextBucketKey(lastKey: string, periodo: Periodo, n: number): string {
  if (!lastKey) return lastKey;
  if (periodo === "year") return `${Number(lastKey) + n}`;
  if (periodo === "quarter") {
    const [y, qS] = lastKey.split("-Q");
    let y2 = Number(y), q = Number(qS) + n;
    while (q > 4) { q -= 4; y2 += 1; }
    return `${y2}-Q${q}`;
  }
  const [yS, mS] = lastKey.split("-");
  let y2 = Number(yS), m = Number(mS) + n;
  while (m > 12) { m -= 12; y2 += 1; }
  return `${y2}-${String(m).padStart(2, "0")}`;
}

function detectAnomalias(args: {
  serieCostoFull: Record<string, number>;
  currentBucket: string;
  costByAsset: Record<number, number>;
  assetMap: Map<number, { name: string; plate: string | null }>;
}): AnomaliaItem[] {
  const out: AnomaliaItem[] = [];

  const series = Object.entries(args.serieCostoFull)
    .sort()
    .map(([k, v]) => ({ k, v: v as number }));
  if (series.length >= 3) {
    const hist = series.slice(0, -1).map((p) => p.v);
    const current = series[series.length - 1]?.v ?? 0;
    const { mean, std } = meanStd(hist);
    const z = zScore(current, mean, std);
    const sev = classifySeverity(z);
    if (sev) {
      out.push({
        tipo: "costo_total",
        dimension: "general",
        dimensionLabel: "Toda la flota",
        severidad: sev,
        descripcion: `Costo del período actual está a ${Math.abs(z).toFixed(1)}σ de la media histórica (${round2(mean)} USD).`,
      });
    }
  }

  const assetCosts = Object.entries(args.costByAsset).map(([id, v]) => ({ id: Number(id), v: v as number }));
  if (assetCosts.length >= 3) {
    const values = assetCosts.map((a) => a.v);
    const { mean, std } = meanStd(values);
    for (const a of assetCosts) {
      const z = std > 0 ? (a.v - mean) / std : 0;
      const sev = classifySeverity(z);
      if (sev && z > 0) {
        const meta = args.assetMap.get(a.id);
        out.push({
          tipo: "costo_por_activo",
          dimension: "asset",
          dimensionLabel: meta?.plate || meta?.name || `Activo ${a.id}`,
          severidad: sev,
          descripcion: `${meta?.plate || meta?.name} tuvo un costo ${round2(a.v)} USD, ${z.toFixed(1)}σ por encima del resto de la flota.`,
        });
      }
    }
  }

  return out;
}
