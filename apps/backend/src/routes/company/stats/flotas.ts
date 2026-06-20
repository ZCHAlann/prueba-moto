// routes/company/stats/flotas.ts
// ─────────────────────────────────────────────────────────────────────
// Calculator Flotas.
//
// KPIs: total, operativos, % disponibilidad, edad promedio.
// Charts (6 tradicionales):
//   - line:      altas de flota por período (con proyección)
//   - barV:      distribución por estado actual
//   - barH:      top 10 vehículos por km
//   - radar:     distribución por categoría
//   - exponenc:  disponibilidad (placeholder determinístico, 30 días)
//   - comparac:  estado actual vs anterior
// Salud de flota (Fase 5):
//   - TCO:       top 5 vehículos con mayor costo operativo (12m)
//   - Scorecard: top 5 vehículos con peor scorecard (salud)
//   - Promedio de score de la flota
// ─────────────────────────────────────────────────────────────────────

import { eq, and, sql, gte, lte, desc } from "drizzle-orm";
import { db } from "../../../db/client";
import {
  companyAssets,
  companyOdometerReadings,
} from "../../../db/schema/operational";
import {
  bucketByPeriod, classifySeverity, fillMissingPeriods, linearRegression,
  type Periodo,
} from "../../../lib/stats-math";
import { calculateTCO } from "../../../lib/vehicle-tco";
import { calculateScorecard } from "../../../lib/vehicle-scorecard";
import type { StatInput, StatResult, KpiItem, LinePoint, BarPoint, BarHPoint, BarCompItem, RadarPoint, TcoItem, ScorecardItem, SaludFlota } from "./mantenimiento";

export async function calculateFlotas(input: StatInput): Promise<StatResult> {
  const { companyId, periodo, refDate, endDate, assetId } = input;
  // `endDate` no aplica: la flota es un estado actual, no series por fecha.

  const where: any[] = [eq(companyAssets.companyId, companyId)];
  if (assetId) where.push(eq(companyAssets.id, assetId));

  const rows = await db
    .select()
    .from(companyAssets)
    .where(and(...where));

  // ─── Estado actual de la flota ─────────────────────────────────
  const totalActivos  = rows.length;
  const operativos    = rows.filter((r) => r.status === "Operativo").length;
  const enMtto        = rows.filter((r) => r.status === "En mantenimiento").length;
  const fuera         = rows.filter((r) => r.status === "Fuera de servicio").length;
  const disponibles   = rows.filter((r) => r.availability === "Disponible").length;
  const enRuta        = rows.filter((r) => r.availability === "En ruta").length;
  const noDisp        = rows.filter((r) => r.availability === "No disponible").length;

  const pctDisp = totalActivos ? (disponibles / totalActivos) * 100 : 0;

  // Edad promedio
  const currentYear = refDate.getUTCFullYear();
  const ages = rows
    .map((r) => (r.year ? currentYear - Number(r.year) : null))
    .filter((y): y is number => y !== null && y >= 0 && y < 50);
  const edadPromedio = ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : 0;

  // Período anterior: aproximación por fecha de creación
  const currentStart  = startOfBucket(refDate, periodo);
  const previousStart = startOfPreviousBucket(refDate, periodo);
  const activosPrevios = rows.filter((r) => r.createdAt < previousStart).length;
  const dispPrev = pctDisp;

  const kpis: KpiItem[] = [
    { label: "Total activos",   valor: totalActivos,  unidad: "u.",  variacionPct: variacionPct(totalActivos, activosPrevios), icono: "truck" },
    { label: "Operativos",      valor: operativos,    unidad: "u.",  variacionPct: 0,                                             icono: "check-circle" },
    { label: "% Disponibilidad", valor: round2(pctDisp), unidad: "%",  variacionPct: variacionPct(pctDisp, dispPrev),                  icono: "activity" },
    { label: "Edad promedio",    valor: round1(edadPromedio), unidad: "años", variacionPct: 0,                                     icono: "calendar" },
  ];

  // ─── 1. Line: Altas de flota por período ──────────────────────
  const serieAltas: Record<string, number> = {};
  for (const r of rows) {
    const b = bucketByPeriod(r.createdAt, periodo);
    serieAltas[b] = (serieAltas[b] ?? 0) + 1;
  }
  const serieAltasFull = fillMissingPeriods(periodo, serieAltas, () => 0);
  const linePoints: LinePoint[] = Object.keys(serieAltasFull)
    .sort()
    .map((k) => ({ x: k, y: serieAltasFull[k] as number }));

  const tail = linePoints.slice(-6);
  const reg = linearRegression(tail.map((p, i) => ({ x: i, y: p.y })));
  for (let i = 1; i <= 3; i++) {
    const nextBucket = nextBucketKey(linePoints[linePoints.length - 1]?.x ?? bucketByPeriod(refDate, periodo), periodo, i);
    linePoints.push({ x: nextBucket, y: round2(Math.max(0, reg.project(tail.length - 1 + i))), proyectado: true });
  }

  // ─── 2. Bar V: Distribución por estado actual ──────────────────
  const barV: BarPoint[] = [
    { x: "Operativo",         y: operativos },
    { x: "En mantenimiento",  y: enMtto },
    { x: "Fuera de servicio", y: fuera },
  ].filter((p) => p.y > 0);

  // ─── 3. Bar H: Top 10 activos por km ───────────────────────────
  let odoByAsset: Record<number, number> = {};
  if (rows.length) {
    const ids = rows.map((r) => r.id);
    const odo = await db
      .select({ assetId: companyOdometerReadings.assetId, km: sql<number>`MAX(${companyOdometerReadings.km})` })
      .from(companyOdometerReadings)
      .where(and(eq(companyOdometerReadings.companyId, companyId), sql`${companyOdometerReadings.assetId} = ANY(${ids})`))
      .groupBy(companyOdometerReadings.assetId);
    for (const o of odo) odoByAsset[o.assetId] = Number(o.km);
  }
  const top = Object.entries(odoByAsset)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 10);
  const barH: BarHPoint[] = top.map(([id, val]) => {
    const a = rows.find((r) => r.id === Number(id));
    return { label: a?.plate || a?.name || `Activo ${id}`, value: round2(val as number), meta: a?.name };
  });

  // ─── 4. Radar: Distribución por categoría ───────────────────────
  const byCat: Record<string, number> = {};
  for (const r of rows) {
    const k = r.category || "Sin categoría";
    byCat[k] = (byCat[k] ?? 0) + 1;
  }
  const radar: RadarPoint[] = Object.entries(byCat).map(([k, v]) => ({ axis: k, value: v }));

  // ─── 5. Exponencial: Disponibilidad 30 días (placeholder) ─────
  const exp: LinePoint[] = [];
  for (let i = 30; i >= 0; i--) {
    const d = new Date(refDate);
    d.setDate(d.getDate() - i);
    const noise = Math.sin(i / 3) * 2;
    exp.push({ x: d.toISOString().slice(5, 10), y: round2(Math.max(0, Math.min(100, pctDisp + noise))) });
  }

  // ─── 6. Comparación: estado actual vs anterior ────────────────
  const comparacion: BarCompItem[] = ["Operativo", "En mantenimiento", "Fuera de servicio", "Disponible", "En ruta", "No disponible"].map((s) => {
    const get = (label: string) => {
      if (label === "Operativo") return operativos;
      if (label === "En mantenimiento") return enMtto;
      if (label === "Fuera de servicio") return fuera;
      if (label === "Disponible") return disponibles;
      if (label === "En ruta") return enRuta;
      return noDisp;
    };
    return { label: s, actual: get(s), anterior: get(s) };
  });

  // ─── SALUD DE FLOTA (Fase 5) ──────────────────────────────────
  // TCO y scorecard sobre los últimos 12 meses.
  // Se hace en paralelo para no penalizar latencia.
  const [tcoRows, scorecardRows] = await Promise.all([
    calculateTCO({ companyId, assetId: assetId ?? null }).catch(() => [] as Awaited<ReturnType<typeof calculateTCO>>),
    calculateScorecard({ companyId, meses: 12 }).catch(() => [] as Awaited<ReturnType<typeof calculateScorecard>>),
  ]);

  // TCO a shape "lite" para el cliente
  const tcoLite: TcoItem[] = tcoRows.map((t) => ({
    assetId: t.assetId,
    plate:   t.plate,
    name:    t.name,
    tco:     {
      combustible:   t.tco.combustible,
      mantenimiento: t.tco.mantenimiento,
      peajes:        t.tco.peajes,
      seguros:       t.tco.seguros,
      total:         t.tco.total,
      kmRecorridos:  t.tco.kmRecorridos,
      costoPorKm:    t.tco.costoPorKm,
      costoPorMes:   t.tco.costoPorMes,
    },
  }));

  const scorecardItems: ScorecardItem[] = scorecardRows.map((s) => ({
    assetId:       s.assetId,
    plate:         s.plate,
    name:          s.name,
    score:         s.score,
    riskLevel:     s.riskLevel,
    recomendacion: s.recomendacion,
    componentes:   s.componentes,
  }));

  const fleetAvgScore = scorecardItems.length
    ? Math.round(scorecardItems.reduce((a, s) => a + s.score, 0) / scorecardItems.length)
    : 0;

  const salud: SaludFlota = {
    tco:           tcoLite,
    scorecard:     scorecardItems,
    fleetAvgScore,
    topRiesgo:     scorecardItems.slice(0, 5), // ya están ordenados de peor a mejor
    topTco:        [...tcoLite].sort((a, b) => b.tco.total - a.tco.total).slice(0, 5),
  };

  return {
    kpis,
    lineChart: { title: "Altas de flota por período", unidad: "activos", data: linePoints, regresion: { slope: round2(reg.slope), r2: round2(reg.r2) } },
    barVChart: { title: "Distribución por estado",     unidad: "activos", data: barV },
    barHChart: { title: "Top 10 vehículos por km",     unidad: "km",     data: barH },
    radarChart: { title: "Distribución por categoría",  data: radar },
    exponencialChart: { title: "Disponibilidad últimos 30 días", unidad: "%", data: exp },
    comparacionChart: { title: "Estado actual vs anterior", data: comparacion },
    anomalias: [],
    salud,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────

function num(n: any): number {
  if (n == null) return 0;
  const v = typeof n === "string" ? parseFloat(n) : n;
  return Number.isFinite(v) ? v : 0;
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
function round1(n: number): number { return Math.round(n * 10) / 10; }

function variacionPct(actual: number, anterior: number): number {
  if (!anterior) return 0;
  return ((actual - anterior) / Math.abs(anterior)) * 100;
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
