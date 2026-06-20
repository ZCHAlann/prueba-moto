// routes/company/stats/combustible.ts
// ─────────────────────────────────────────────────────────────────────
// Calculator Combustible.
//
// KPIs: # cargas, # litros, costo total, costo/km.
// Charts:
//   - line:      costo por período (con proyección 3 períodos)
//   - barV:      litros por tipo de combustible
//   - barH:      top 10 vehículos por costo
//   - radar:     costo por estación (top 8)
//   - exponenc:  costo diario (últimos 30 días)
//   - comparac:  costo actual vs anterior por tipo de combustible
// Anomalías: bucket histórico con z-score > 1; asset con costo > 2σ.
// ─────────────────────────────────────────────────────────────────────

import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { db } from "../../../db/client";
import {
  companyFuelEntries,
  companyAssets,
  companyOdometerReadings,
} from "../../../db/schema/operational";
import {
  bucketByPeriod, classifySeverity, fillMissingPeriods, linearRegression, meanStd, variationPct, zScore, type Periodo,
} from "../../../lib/stats-math";
import type { StatInput, StatResult, KpiItem, LinePoint, BarPoint, BarHPoint, BarCompItem, RadarPoint, AnomaliaItem } from "./mantenimiento";

export async function calculateCombustible(input: StatInput): Promise<StatResult> {
  const { companyId, periodo, refDate, endDate, assetId, driverId } = input;
  const end = endDate ?? refDate;

  const from = new Date(refDate);
  from.setMonth(from.getMonth() - 12);

  const where: any[] = [
    eq(companyFuelEntries.companyId, companyId),
    gte(companyFuelEntries.date, sql`${from.toISOString().slice(0, 10)}::date`),
    lte(companyFuelEntries.date, sql`${end.toISOString().slice(0, 10)}::date`),
  ];
  if (assetId)  where.push(eq(companyFuelEntries.assetId, assetId));
  if (driverId) where.push(eq(companyFuelEntries.driverId, driverId));

  const rows = await db
    .select()
    .from(companyFuelEntries)
    .where(and(...where))
    .orderBy(desc(companyFuelEntries.date));

  // Assets
  const assetIds = Array.from(new Set(rows.map((r) => r.assetId)));
  const assetMap = new Map<number, { name: string; plate: string | null; fuelType: string | null }>();
  if (assetIds.length) {
    const assets = await db
      .select({ id: companyAssets.id, name: companyAssets.name, plate: companyAssets.plate, fuelType: companyAssets.fuelType })
      .from(companyAssets)
      .where(and(eq(companyAssets.companyId, companyId), sql`${companyAssets.id} = ANY(${assetIds})`));
    for (const a of assets) assetMap.set(a.id, { name: a.name, plate: a.plate, fuelType: a.fuelType });
  }

  // Odometer readings (último año) para calcular eficiencia
  const odoStart = new Date(from);
  odoStart.setMonth(odoStart.getMonth() - 1); // 1 mes extra antes para tener baseline
  const odoReadings = assetIds.length
    ? await db
        .select({
          assetId: companyOdometerReadings.assetId,
          km:      companyOdometerReadings.km,
          takenAt: companyOdometerReadings.takenAt,
        })
        .from(companyOdometerReadings)
        .where(
          and(
            eq(companyOdometerReadings.companyId, companyId),
            gte(companyOdometerReadings.takenAt, odoStart),
            lte(companyOdometerReadings.takenAt, end),
            sql`${companyOdometerReadings.assetId} = ANY(${assetIds})`,
          ),
        )
        .orderBy(desc(companyOdometerReadings.takenAt))
    : [];

  // ─── Buckets ────────────────────────────────────────────────────
  const currentStart  = startOfBucket(end, periodo);
  const previousStart = startOfPreviousBucket(end, periodo);
  const previousEnd   = new Date(currentStart.getTime() - 1);

  const inCurrent  = rows.filter((r) => r.date >= currentStart);
  const inPrevious = rows.filter((r) => r.date >= previousStart && r.date <= previousEnd);

  // ─── KPIs ───────────────────────────────────────────────────────
  const totalCostoA   = inCurrent.reduce((a, r) => a + num(r.cost), 0);
  const totalCostoP   = inPrevious.reduce((a, r) => a + num(r.cost), 0);
  const totalLitrosA  = inCurrent.reduce((a, r) => a + num(r.liters), 0);
  const totalLitrosP  = inPrevious.reduce((a, r) => a + num(r.liters), 0);
  const cargasA       = inCurrent.length;
  const cargasP       = inPrevious.length;
  const kmRecorridosA = computeKmRecorridos(inCurrent, odoReadings, currentStart, end);
  const kmRecorridosP = computeKmRecorridos(inPrevious, odoReadings, previousStart, previousEnd);
  const costoPorKmA   = kmRecorridosA > 0 ? totalCostoA / kmRecorridosA : 0;
  const costoPorKmP   = kmRecorridosP > 0 ? totalCostoP / kmRecorridosP : 0;

  const kpis: KpiItem[] = [
    { label: "Cargas",      valor: cargasA,                       variacionPct: variationPct(cargasA, cargasP),            icono: "fuel" },
    { label: "Litros",      valor: round2(totalLitrosA), unidad: "L",  variacionPct: variationPct(totalLitrosA, totalLitrosP), icono: "droplet" },
    { label: "Costo total", valor: round2(totalCostoA), unidad: "USD", variacionPct: variationPct(totalCostoA, totalCostoP), icono: "dollar-sign" },
    { label: "Costo por km",valor: round2(costoPorKmA), unidad: "USD/km", variacionPct: variationPct(costoPorKmA, costoPorKmP), icono: "trending-up" },
  ];

  // ─── 1. Line: costo por período (con proyección) ────────────────
  const serieCosto: Record<string, number> = {};
  for (const r of rows) {
    const b = bucketByPeriod(r.date, periodo);
    serieCosto[b] = (serieCosto[b] ?? 0) + num(r.cost);
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

  // ─── 2. Bar V: litros por tipo de combustible ──────────────────
  const litrosByType: Record<string, number> = {};
  for (const r of inCurrent) {
    const t = r.fuelType || "Desconocido";
    litrosByType[t] = (litrosByType[t] ?? 0) + num(r.liters);
  }
  const barV: BarPoint[] = Object.entries(litrosByType).map(([k, v]) => ({ x: k, y: round2(v) }));

  // ─── 3. Bar H: top 10 vehículos por EFICIENCIA (km/L) ──────────
  // Eficiencia = kmRecorridos / litros por asset en el período actual
  const litrosByAsset: Record<number, number> = {};
  for (const r of inCurrent) {
    litrosByAsset[r.assetId] = (litrosByAsset[r.assetId] ?? 0) + num(r.liters);
  }
  const efficiency: Array<{ id: number; km: number; litros: number; kmL: number }> = [];
  for (const [id, litros] of Object.entries(litrosByAsset)) {
    if (litros <= 0) continue;
    const km = kmRecorridosPorAsset.get(Number(id)) ?? 0;
    if (km <= 0) continue;
    efficiency.push({ id: Number(id), km, litros, kmL: km / litros });
  }
  efficiency.sort((a, b) => b.kmL - a.kmL);
  const top10Eff = efficiency.slice(0, 10);
  const barH: BarHPoint[] = top10Eff.map((e) => {
    const a = assetMap.get(e.id);
    return { label: a?.plate || a?.name || `Activo ${e.id}`, value: round2(e.kmL), meta: `${e.km} km / ${round2(e.litros)} L` };
  });

  // ─── 4. Radar: costo por estación (top 8) ─────────────────────
  const costByStation: Record<string, number> = {};
  for (const r of inCurrent) {
    const k = r.station || "Sin estación";
    costByStation[k] = (costByStation[k] ?? 0) + num(r.cost);
  }
  const radar: RadarPoint[] = Object.entries(costByStation)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 8)
    .map(([k, v]) => ({ axis: k, value: round2(v) }));

  // ─── 5. Exponencial: costo diario (últimos 30 días) ────────────
  const dailyStart = new Date(end);
  dailyStart.setDate(dailyStart.getDate() - 30);
  const dailyCosts: Record<string, number> = {};
  for (const r of rows) {
    if (r.date < dailyStart) continue;
    const key = r.date.toISOString().slice(0, 10);
    dailyCosts[key] = (dailyCosts[key] ?? 0) + num(r.cost);
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

  // ─── 6. Comparación: actual vs anterior por tipo ──────────────
  const buildByType = (list: typeof rows) => {
    const out: Record<string, number> = {};
    for (const r of list) {
      const k = r.fuelType || "Desconocido";
      out[k] = (out[k] ?? 0) + num(r.cost);
    }
    return out;
  };
  const tA = buildByType(inCurrent);
  const tP = buildByType(inPrevious);
  const all = new Set([...Object.keys(tA), ...Object.keys(tP)]);
  const comparacion: BarCompItem[] = Array.from(all).map((t) => ({
    label: t,
    actual: round2(tA[t] ?? 0),
    anterior: round2(tP[t] ?? 0),
  }));

  // ─── Anomalías ──────────────────────────────────────────────────
  const anomalias: AnomaliaItem[] = detectAnomalias({
    serieCostoFull,
    currentBucket: bucketByPeriod(end, periodo),
    costByAsset: Object.fromEntries(Object.entries(litrosByAsset).map(([k, v]) => [k, v])),
    assetMap,
  });

  return {
    kpis,
    lineChart:        { title: "Costo de combustible por período",  unidad: "USD", data: linePoints, regresion: { slope: round2(reg.slope), r2: round2(reg.r2) } },
    barVChart:        { title: "Litros por tipo de combustible",    unidad: "L",   data: barV },
    barHChart:        { title: "Top 10 vehículos por eficiencia (km/L)", unidad: "km/L", data: barH },
    radarChart:       { title: "Costo por estación (top 8)",         data: radar },
    exponencialChart: { title: "Costo diario (últimos 30 días)",    unidad: "USD", data: exponencial },
    comparacionChart: { title: "Costo actual vs período anterior",   data: comparacion },
    anomalias,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────

const kmRecorridosPorAsset: Map<number, number> = new Map();

function num(n: any): number {
  if (n == null) return 0;
  const v = typeof n === "string" ? parseFloat(n) : n;
  return Number.isFinite(v) ? v : 0;
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

/**
 * Calcula km recorridos por asset en un rango [start, end] usando
 * la primera y última lectura de odómetro dentro de la ventana.
 * Suma todos los assets y devuelve el total.
 *
 * Side-effect: actualiza el map `kmRecorridosPorAsset` para uso externo.
 */
function computeKmRecorridos(
  entries: Array<{ assetId: number; odometer: any; date: Date }>,
  odoReadings: Array<{ assetId: number; km: number; takenAt: Date }>,
  start: Date,
  end: Date,
): number {
  kmRecorridosPorAsset.clear();
  // 1) Usar lecturas de odómetro de la tabla si están disponibles
  for (const r of odoReadings) {
    if (r.takenAt < start || r.takenAt > end) continue;
    const prev = kmRecorridosPorAsset.get(r.assetId) ?? 0;
    if (prev === 0) {
      kmRecorridosPorAsset.set(r.assetId, r.km);
    } else {
      // Si ya hay una lectura, calcular diff con la nueva
      // (esto es aproximado: asumimos que la nueva es mayor)
      const diff = Math.max(0, r.km - prev);
      kmRecorridosPorAsset.set(r.assetId, prev + diff);
    }
  }
  // 2) Si no hay lecturas de odómetro, usar los odómetros de las cargas
  if (kmRecorridosPorAsset.size === 0) {
    const byAsset: Record<number, number[]> = {};
    for (const e of entries) {
      if (!e.odometer) continue;
      const o = num(e.odometer);
      if (!byAsset[e.assetId]) byAsset[e.assetId] = [];
      byAsset[e.assetId].push(o);
    }
    for (const [id, arr] of Object.entries(byAsset)) {
      if (arr.length < 2) continue;
      const min = Math.min(...arr);
      const max = Math.max(...arr);
      kmRecorridosPorAsset.set(Number(id), max - min);
    }
  }
  let total = 0;
  for (const v of kmRecorridosPorAsset.values()) total += v;
  return total;
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
        tipo: "costo_combustible",
        dimension: "general",
        dimensionLabel: "Toda la flota",
        severidad: sev,
        descripcion: `Consumo de combustible del período actual está a ${Math.abs(z).toFixed(1)}σ de la media histórica (${round2(mean)} USD).`,
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
          tipo: "consumo_por_activo",
          dimension: "asset",
          dimensionLabel: meta?.plate || meta?.name || `Activo ${a.id}`,
          severidad: sev,
          descripcion: `${meta?.plate || meta?.name} consumió ${round2(a.v)} L en combustible, ${z.toFixed(1)}σ por encima del resto.`,
        });
      }
    }
  }

  return out;
}
