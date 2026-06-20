// routes/company/stats/peajes.ts
// Calculator Peajes: total gastado, # cruces, top por ruta, por tipo.
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { db } from "../../../db/client";
import { companyTollEntries } from "../../../db/schema/operational";
import { bucketByPeriod, fillMissingPeriods, linearRegression, type Periodo } from "../../../lib/stats-math";
import type { StatInput, StatResult, KpiItem, LinePoint, BarPoint, BarHPoint, BarCompItem, RadarPoint } from "./mantenimiento";

export async function calculatePeajes(input: StatInput): Promise<StatResult> {
  const { companyId, periodo, refDate, endDate, assetId, driverId } = input;
  const end = endDate ?? refDate;
  const from = new Date(refDate); from.setMonth(from.getMonth() - 12);

  const where: any[] = [
    eq(companyTollEntries.companyId, companyId),
    gte(companyTollEntries.date, sql`${from.toISOString().slice(0, 10)}::date`),
    lte(companyTollEntries.date, sql`${end.toISOString().slice(0, 10)}::date`),
  ];
  if (assetId)  where.push(eq(companyTollEntries.assetId, assetId));
  if (driverId) where.push(eq(companyTollEntries.driverId, driverId));

  const rows = await db.select().from(companyTollEntries).where(and(...where));

  const total   = rows.length;
  const totalUsd = rows.reduce((a, r) => a + Number(r.amount ?? 0), 0);
  const prom    = total ? totalUsd / total : 0;
  const rutas   = new Set(rows.map((r) => r.route).filter(Boolean)).size;

  const kpis: KpiItem[] = [
    { label: "Cruces",   valor: total,                        unidad: "cruces", variacionPct: 0, icono: "map-pin" },
    { label: "Gasto",    valor: Math.round(totalUsd * 100) / 100, unidad: "USD",  variacionPct: 0, icono: "dollar-sign" },
    { label: "Promedio", valor: Math.round(prom * 100) / 100,    unidad: "USD",  variacionPct: 0, icono: "trending-up" },
    { label: "Rutas",    valor: rutas,                        unidad: "rutas",  variacionPct: 0, icono: "map" },
  ];

  const serie: Record<string, number> = {};
  for (const r of rows) {
    const b = bucketByPeriod(new Date(r.date), periodo);
    serie[b] = (serie[b] ?? 0) + Number(r.amount ?? 0);
  }
  const serieFull = fillMissingPeriods(periodo, serie, () => 0);
  const linePoints: LinePoint[] = Object.keys(serieFull).sort().map((k) => ({ x: k, y: Math.round((serieFull[k] as number) * 100) / 100 }));
  const tail = linePoints.slice(-6);
  const reg = linearRegression(tail.map((p, i) => ({ x: i, y: p.y })));
  for (let i = 1; i <= 3; i++) {
    const nextBucket = nextBucketKey(linePoints[linePoints.length - 1]?.x ?? bucketByPeriod(end, periodo), periodo, i);
    linePoints.push({ x: nextBucket, y: Math.max(0, Math.round(reg.project(tail.length - 1 + i))), proyectado: true });
  }

  const byCat: Record<string, number> = {};
  for (const r of rows) {
    const k = r.category || "Sin categoría";
    byCat[k] = (byCat[k] ?? 0) + Number(r.amount ?? 0);
  }
  const barV: BarPoint[] = Object.entries(byCat).map(([k, v]) => ({ x: k, y: Math.round(v * 100) / 100 }));

  const byRoute: Record<string, number> = {};
  for (const r of rows) {
    const k = r.route || "Sin ruta";
    byRoute[k] = (byRoute[k] ?? 0) + Number(r.amount ?? 0);
  }
  const top = Object.entries(byRoute).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const barH: BarHPoint[] = top.map(([k, v]) => ({ label: k, value: Math.round(v * 100) / 100 }));

  const radar: RadarPoint[] = top.map(([k, v]) => ({ axis: k, value: Math.round(v * 100) / 100 }));

  const comp: BarCompItem[] = ["Gasto", "Cruces"].map((s) => ({
    label: s,
    actual:   s === "Gasto" ? Math.round(totalUsd) : total,
    anterior: s === "Gasto" ? Math.round(totalUsd) : total,
  }));

  return {
    kpis,
    lineChart: { title: "Gasto en peajes por período", unidad: "USD", data: linePoints, regresion: { slope: reg.slope, r2: reg.r2 } },
    barVChart: { title: "Por categoría de peaje",     unidad: "USD", data: barV },
    barHChart: { title: "Top 10 rutas",                unidad: "USD", data: barH },
    radarChart: { title: "Rutas",                      data: radar },
    exponencialChart: { title: "Peajes (últimos 30 días)", unidad: "USD", data: [] },
    comparacionChart: { title: "Actual vs anterior",    data: comp },
    anomalias: [],
  };
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
