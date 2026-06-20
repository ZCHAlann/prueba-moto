// routes/company/stats/conductores.ts
// ─────────────────────────────────────────────────────────────────────
// Calculator Conductores.
//
// KPIs: # conductores, # activos, # con licencia vigente,
//       # con asignación activa.
//
// Charts:
//   - line:      asignaciones iniciadas por período
//   - barV:      conductores por tipo de licencia
//   - barH:      top 10 conductores con más asignaciones (últ. 12m)
//   - radar:     distribución por sede
//   - exponenc:  licencias por vencer (próximos 90 días)
//   - comparac:  activos vs inactivos, actual vs anterior
// Anomalías: conductor con muchísimas más asignaciones que el resto.
// ─────────────────────────────────────────────────────────────────────

import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { db } from "../../../db/client";
import {
  companyDrivers,
  companyAssignments,
  companySites,
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

export async function calculateConductores(input: StatInput): Promise<StatResult> {
  const { companyId, periodo, refDate, endDate, driverId } = input;
  const end = endDate ?? refDate;

  const from = new Date(refDate);
  from.setMonth(from.getMonth() - 12);

  // ─── Carga ──────────────────────────────────────────────────────
  const [allDrivers, asigns, sites] = await Promise.all([
    db.select().from(companyDrivers).where(eq(companyDrivers.companyId, companyId)),
    db
      .select()
      .from(companyAssignments)
      .where(
        and(
          eq(companyAssignments.companyId, companyId),
          gte(companyAssignments.startDate, sql`${from.toISOString().slice(0, 10)}::date`),
          lte(companyAssignments.startDate, sql`${end.toISOString().slice(0, 10)}::date`),
        ),
      )
      .orderBy(desc(companyAssignments.startDate)),
    db.select().from(companySites).where(eq(companySites.companyId, companyId)),
  ]);

  const drivers = driverId ? allDrivers.filter((d) => d.id === driverId) : allDrivers;
  const siteMap = new Map(sites.map((s) => [s.id, s]));

  // ─── Período actual vs anterior ─────────────────────────────────
  const currentStart  = startOfBucket(end, periodo);
  const previousStart = startOfPreviousBucket(end, periodo);
  const previousEnd   = new Date(currentStart.getTime() - 1);

  // ─── KPIs ───────────────────────────────────────────────────────
  const total      = drivers.length;
  const activos    = drivers.filter((d) => d.status === "Activo").length;
  const inactivos  = drivers.filter((d) => d.status !== "Activo").length;
  const conLicVig  = drivers.filter((d) => {
    if (!d.licenseExpiry) return false;
    return new Date(d.licenseExpiry) >= end;
  }).length;
  const licPorVencer = drivers.filter((d) => {
    if (!d.licenseExpiry) return false;
    const days = (new Date(d.licenseExpiry).getTime() - end.getTime()) / (1000 * 60 * 60 * 24);
    return days >= 0 && days <= 90;
  }).length;
  const conAsigActiva = drivers.filter((d) => asigns.some((a) => a.driverId === d.id && a.status === "Activa")).length;

  const kpis: KpiItem[] = [
    { label: "Conductores",        valor: total,            unidad: "conductores", variacionPct: 0, icono: "users" },
    { label: "Activos",            valor: activos,          unidad: "conductores", variacionPct: 0, icono: "check-circle" },
    { label: "Con licencia vigente", valor: conLicVig,       unidad: "conductores", variacionPct: 0, icono: "shield" },
    { label: "Con asignación",     valor: conAsigActiva,    unidad: "conductores", variacionPct: 0, icono: "clipboard-list" },
  ];

  // ─── 1. Line: asignaciones por período ──────────────────────────
  const serie: Record<string, number> = {};
  for (const a of asigns) {
    const d = new Date(a.startDate);
    if (d > end) continue;
    const b = bucketByPeriod(d, periodo);
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

  // ─── 2. Bar V: por tipo de licencia ─────────────────────────────
  const byLicense: Record<string, number> = {};
  for (const d of drivers) {
    const k = d.licenseType || "Sin tipo";
    byLicense[k] = (byLicense[k] ?? 0) + 1;
  }
  const barV: BarPoint[] = Object.entries(byLicense).map(([k, v]) => ({ x: k, y: v }));

  // ─── 3. Bar H: top 10 conductores con más asignaciones ──────────
  const asignsByDriver: Record<number, number> = {};
  for (const a of asigns) {
    asignsByDriver[a.driverId] = (asignsByDriver[a.driverId] ?? 0) + 1;
  }
  const driverMap = new Map(drivers.map((d) => [d.id, d]));
  const top = Object.entries(asignsByDriver)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 10);
  const barH: BarHPoint[] = top.map(([id, v]) => {
    const d = driverMap.get(Number(id));
    return { label: d ? `${d.firstName} ${d.lastName}`.trim() : `Conductor ${id}`, value: v, meta: d?.licenseType ?? "—" };
  });

  // ─── 4. Radar: distribución por sede ────────────────────────────
  const bySite: Record<string, number> = {};
  for (const d of drivers) {
    const s = d.siteId ? siteMap.get(d.siteId) : null;
    const k = s?.name || "Sin sede";
    bySite[k] = (bySite[k] ?? 0) + 1;
  }
  const radar: RadarPoint[] = Object.entries(bySite).map(([k, v]) => ({ axis: k, value: v }));

  // ─── 5. Exponencial: licencias por vencer (próximos 90 días) ───
  const daily: Record<string, number> = {};
  for (const d of drivers) {
    if (!d.licenseExpiry) continue;
    const ld = new Date(d.licenseExpiry);
    const days = Math.round((ld.getTime() - end.getTime()) / (1000 * 60 * 60 * 24));
    if (days < 0 || days > 90) continue;
    const dateKey = ld.toISOString().slice(0, 10);
    daily[dateKey] = (daily[dateKey] ?? 0) + 1;
  }
  // Distribuir en buckets semanales
  const weekly: Record<string, number> = {};
  for (const k of Object.keys(daily)) {
    const d = new Date(k);
    const start = new Date(d);
    start.setDate(d.getDate() - d.getUTCDay()); // inicio de semana (domingo)
    const wKey = start.toISOString().slice(0, 10);
    weekly[wKey] = (weekly[wKey] ?? 0) + daily[k];
  }
  const exponencial: LinePoint[] = Object.entries(weekly)
    .sort()
    .slice(0, 13) // 13 semanas = 90 días
    .map(([k, v]) => ({ x: k.slice(5), y: v }));

  // ─── 6. Comparación: actual vs anterior ────────────────────────
  const asignA = asigns.filter((a) => new Date(a.startDate) >= currentStart).length;
  const asignP = asigns.filter((a) => new Date(a.startDate) >= previousStart && new Date(a.startDate) <= previousEnd).length;
  const comparacion: BarCompItem[] = [
    { label: "Activos",          actual: activos,   anterior: activos },
    { label: "Inactivos",        actual: inactivos, anterior: inactivos },
    { label: "Asignaciones",     actual: asignA,    anterior: asignP },
    { label: "Lic. por vencer",  actual: licPorVencer, anterior: licPorVencer },
  ];

  // ─── Anomalías ──────────────────────────────────────────────────
  const anomalias: AnomaliaItem[] = [];
  if (asignsByDriver && Object.keys(asignsByDriver).length >= 3) {
    const values = Object.values(asignsByDriver) as number[];
    const { mean, std } = meanStd(values);
    for (const [id, v] of Object.entries(asignsByDriver)) {
      const z = std > 0 ? ((v as number) - mean) / std : 0;
      const sev = classifySeverity(z);
      if (sev && z > 0) {
        const d = driverMap.get(Number(id));
        out.push({
          tipo: "asignaciones_por_conductor",
          dimension: "driver",
          dimensionLabel: d ? `${d.firstName} ${d.lastName}`.trim() : `Conductor ${id}`,
          severidad: sev,
          descripcion: `${d?.firstName ?? "Conductor"} ${d?.lastName ?? id} tuvo ${v} asignaciones en los últimos 12 meses (${z.toFixed(1)}σ sobre el promedio).`,
        });
      }
    }
  }

  return {
    kpis,
    lineChart:        { title: "Asignaciones iniciadas por período",          unidad: "asig.", data: linePoints, regresion: { slope: reg.slope, r2: reg.r2 } },
    barVChart:        { title: "Por tipo de licencia",                       unidad: "conductores", data: barV },
    barHChart:        { title: "Top 10 conductores con más asignaciones",    unidad: "asig.", data: barH },
    radarChart:       { title: "Distribución por sede",                      data: radar },
    exponencialChart: { title: "Licencias por vencer (próximas 13 semanas)", unidad: "conductores", data: exponencial },
    comparacionChart: { title: "Actual vs anterior",                         data: comparacion },
    anomalias,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────

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
