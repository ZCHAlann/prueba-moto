// routes/company/stats/ac.ts
// ─────────────────────────────────────────────────────────────────────
// Calculator AC (Aires Acondicionados).
//
// KPIs: # unidades, # operativas, # con servicio próximo, costo total
//       servicios (período actual).
// Charts:
//   - line:      servicios por período
//   - barV:      unidades por estado
//   - barH:      top 10 unidades por costo de servicio
//   - radar:     unidades por tipo (split, ventana, central, etc.)
//   - comparac:  operatividad actual vs anterior
// Anomalías: unidades con costo > 2σ del promedio.
// ─────────────────────────────────────────────────────────────────────

import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { db } from "../../../db/client";
import {
  companyAcUnits,
  companyAcServices,
  companyAcRefrigerantLogs,
} from "../../../db/schema/operational";
import {
  bucketByPeriod,
  classifySeverity,
  fillMissingPeriods,
  linearRegression,
  meanStd,
  type Periodo,
} from "../../../lib/stats-math";
import type { StatInput, StatResult, KpiItem, LinePoint, BarPoint, BarHPoint, BarCompItem, RadarPoint, AnomaliaItem } from "./mantenimiento";

export async function calculateAc(input: StatInput): Promise<StatResult> {
  const { companyId, periodo, refDate, endDate } = input;
  const end = endDate ?? refDate;

  // ─── Traer unidades + servicios + refrigerante ───────────────────
  const [units, services, refrigerant] = await Promise.all([
    db.select().from(companyAcUnits).where(eq(companyAcUnits.companyId, companyId)),
    db
      .select()
      .from(companyAcServices)
      .where(
        and(
          eq(companyAcServices.companyId, companyId),
          gte(companyAcServices.date, sql`${new Date(refDate.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}::date`),
          lte(companyAcServices.date, sql`${end.toISOString().slice(0, 10)}::date`),
        ),
      )
      .orderBy(desc(companyAcServices.date)),
    db
      .select()
      .from(companyAcRefrigerantLogs)
      .where(
        and(
          eq(companyAcRefrigerantLogs.companyId, companyId),
          gte(companyAcRefrigerantLogs.date, sql`${new Date(refDate.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}::date`),
          lte(companyAcRefrigerantLogs.date, sql`${end.toISOString().slice(0, 10)}::date`),
        ),
      ),
  ]);

  // ─── Período actual vs anterior ─────────────────────────────────
  const currentStart  = startOfBucket(end, periodo);
  const previousStart = startOfPreviousBucket(end, periodo);
  const previousEnd   = new Date(currentStart.getTime() - 1);

  const inCurrent  = services.filter((s) => new Date(s.date) >= currentStart);
  const inPrevious = services.filter((s) => new Date(s.date) >= previousStart && new Date(s.date) <= previousEnd);

  // ─── KPIs ───────────────────────────────────────────────────────
  const totalUnidades  = units.length;
  const operativas     = units.filter((u) => (u.status ?? "").toLowerCase().match(/operativo|activo|bueno/)).length;
  const servicioProx   = units.filter((u) => {
    if (!u.nextService) return false;
    const d = new Date(u.nextService);
    return d >= end && (d.getTime() - end.getTime()) / (1000 * 60 * 60 * 24) <= 30;
  }).length;
  const costoA = inCurrent.reduce((a, s) => a + Number(s.cost ?? 0), 0);
  const costoP = inPrevious.reduce((a, s) => a + Number(s.cost ?? 0), 0);
  const refUnits = refrigerant.length;
  const totalRefrigerantKg = refrigerant.reduce((a, r) => a + Number(r.quantity ?? 0), 0);

  const kpis: KpiItem[] = [
    { label: "Unidades",        valor: totalUnidades,  unidad: "u.",  variacionPct: 0, icono: "air-vent" },
    { label: "Operativas",      valor: operativas,     unidad: "u.",  variacionPct: 0, icono: "check-circle" },
    { label: "Servicio próximo",valor: servicioProx,   unidad: "u.",  variacionPct: 0, icono: "alert-triangle" },
    { label: "Costo servicios", valor: round2(costoA), unidad: "USD", variacionPct: variationPct(costoA, costoP), icono: "dollar-sign" },
  ];

  // ─── 1. Line: # servicios por período (con proyección) ─────────
  const serie: Record<string, number> = {};
  for (const s of services) {
    const b = bucketByPeriod(new Date(s.date), periodo);
    serie[b] = (serie[b] ?? 0) + 1;
  }
  const serieFull = fillMissingPeriods(periodo, serie, () => 0);
  const linePoints: LinePoint[] = Object.keys(serieFull).sort().map((k) => ({ x: k, y: serieFull[k] as number }));
  const tail = linePoints.slice(-6);
  const reg = linearRegression(tail.map((p, i) => ({ x: i, y: p.y })));
  for (let i = 1; i <= 3; i++) {
    const nextBucket = nextBucketKey(linePoints[linePoints.length - 1]?.x ?? bucketByPeriod(end, periodo), periodo, i);
    linePoints.push({ x: nextBucket, y: Math.max(0, Math.round(reg.project(tail.length - 1 + i))), proyectado: true });
  }

  // ─── 2. Bar V: unidades por estado ──────────────────────────────
  const byStatus: Record<string, number> = {};
  for (const u of units) {
    const k = u.status || "Sin estado";
    byStatus[k] = (byStatus[k] ?? 0) + 1;
  }
  const barV: BarPoint[] = Object.entries(byStatus).map(([k, v]) => ({ x: k, y: v }));

  // ─── 3. Bar H: top 10 unidades por costo (período actual) ───────
  const costByUnit: Record<number, number> = {};
  for (const s of inCurrent) {
    costByUnit[s.unitId] = (costByUnit[s.unitId] ?? 0) + Number(s.cost ?? 0);
  }
  const unitMap = new Map(units.map((u) => [u.id, u]));
  const top = Object.entries(costByUnit)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 10);
  const barH: BarHPoint[] = top.map(([id, v]) => {
    const u = unitMap.get(Number(id));
    return { label: u?.code || `Unidad ${id}`, value: round2(v as number), meta: u?.name };
  });

  // ─── 4. Radar: unidades por tipo (split, ventana, central, …) ──
  const byType: Record<string, number> = {};
  for (const u of units) {
    const k = u.type || "Sin tipo";
    byType[k] = (byType[k] ?? 0) + 1;
  }
  const radar: RadarPoint[] = Object.entries(byType).map(([k, v]) => ({ axis: k, value: v }));

  // ─── 5. Exponencial: servicios diarios (últimos 30 días) ───────
  const dailyStart = new Date(end);
  dailyStart.setDate(dailyStart.getDate() - 30);
  const daily: Record<string, number> = {};
  for (const s of services) {
    const d = new Date(s.date);
    if (d < dailyStart) continue;
    const key = d.toISOString().slice(0, 10);
    daily[key] = (daily[key] ?? 0) + Number(s.cost ?? 0);
  }
  const dailyFull: Record<string, number> = {};
  for (let i = 30; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const k = d.toISOString().slice(0, 10);
    dailyFull[k] = round2(daily[k] ?? 0);
  }
  const exponencial: LinePoint[] = Object.entries(dailyFull)
    .sort()
    .map(([k, v]) => ({ x: k.slice(5), y: v }));

  // ─── 6. Comparación: servicios actuales vs anteriores ──────────
  const serviciosA = inCurrent.length;
  const serviciosP = inPrevious.length;
  const refA = refrigerant.filter((r) => new Date(r.date) >= currentStart).reduce((a, r) => a + Number(r.quantity ?? 0), 0);
  const refP = refrigerant.filter((r) => new Date(r.date) >= previousStart && new Date(r.date) <= previousEnd).reduce((a, r) => a + Number(r.quantity ?? 0), 0);
  const comparacion: BarCompItem[] = [
    { label: "Servicios",     actual: serviciosA, anterior: serviciosP },
    { label: "Refrigerante",  actual: round2(refA), anterior: round2(refP) },
    { label: "Costo",         actual: round2(costoA), anterior: round2(costoP) },
  ];

  // ─── Anomalías: unidades con costo > 2σ del promedio ───────────
  const anomalias: AnomaliaItem[] = detectAnomalias({
    costByUnit,
    unitMap,
    mean: meanStd(Object.values(costByUnit)).mean,
    std:  meanStd(Object.values(costByUnit)).std,
  });

  return {
    kpis,
    lineChart: { title: "Servicios por período",                       unidad: "servicios", data: linePoints, regresion: { slope: reg.slope, r2: reg.r2 } },
    barVChart: { title: "Unidades por estado",                          unidad: "u.",        data: barV },
    barHChart: { title: "Top 10 unidades por costo",                   unidad: "USD",       data: barH },
    radarChart: { title: "Unidades por tipo",                           data: radar },
    exponencialChart: { title: "Costo diario (últimos 30 días)",        unidad: "USD",       data: exponencial },
    comparacionChart: { title: "Servicios actual vs anterior",           data: comparacion },
    anomalias,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────

function num(n: any): number {
  if (n == null) return 0;
  const v = typeof n === "string" ? parseFloat(n) : n;
  return Number.isFinite(v) ? v : 0;
}
function round2(n: number): number { return Math.round(n * 100) / 100; }
function variationPct(actual: number, anterior: number): number {
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

function detectAnomalias(args: {
  costByUnit: Record<number, number>;
  unitMap: Map<number, { code: string; name: string }>;
  mean: number;
  std: number;
}): AnomaliaItem[] {
  const out: AnomaliaItem[] = [];
  for (const [id, v] of Object.entries(args.costByUnit)) {
    const z = args.std > 0 ? (v - args.mean) / args.std : 0;
    const sev = classifySeverity(z);
    if (sev && z > 0) {
      const u = args.unitMap.get(Number(id));
      out.push({
        tipo: "costo_servicio_ac",
        dimension: "asset",
        dimensionLabel: u?.code || `Unidad ${id}`,
        severidad: sev,
        descripcion: `${u?.code || `Unidad ${id}`} tuvo $${round2(v)} en servicios este período (${z.toFixed(1)}σ sobre el promedio).`,
      });
    }
  }
  return out;
}
