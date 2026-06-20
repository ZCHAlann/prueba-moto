// routes/company/stats/asignaciones.ts
// Calculator Asignaciones: activas, # por período, top conductores.
import { eq, sql } from "drizzle-orm";
import { db } from "../../../db/client";
import { companyAssignments } from "../../../db/schema/operational";
import { bucketByPeriod, fillMissingPeriods, linearRegression, type Periodo } from "../../../lib/stats-math";
import type { StatInput, StatResult, KpiItem, LinePoint, BarPoint, BarHPoint, BarCompItem, RadarPoint } from "./mantenimiento";

export async function calculateAsignaciones(input: StatInput): Promise<StatResult> {
  const { companyId, periodo, refDate, endDate } = input;
  const end = endDate ?? refDate;

  const rows = await db.select().from(companyAssignments).where(eq(companyAssignments.companyId, companyId));

  const total    = rows.length;
  const activas  = rows.filter((r) => r.status === "Activa").length;
  const cerradas = rows.filter((r) => r.status !== "Activa").length;
  const conActa  = rows.filter((r) => !!r.handoverUrl).length;

  const kpis: KpiItem[] = [
    { label: "Asignaciones", valor: total,     unidad: "asig.", variacionPct: 0, icono: "clipboard-list" },
    { label: "Activas",      valor: activas,   unidad: "asig.", variacionPct: 0, icono: "check-circle" },
    { label: "Cerradas",     valor: cerradas,  unidad: "asig.", variacionPct: 0, icono: "x" },
    { label: "Con acta",     valor: conActa,   unidad: "asig.", variacionPct: 0, icono: "file-text" },
  ];

  const serie: Record<string, number> = {};
  for (const r of rows) {
    const d = new Date(r.startDate);
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

  const byStatus: Record<string, number> = {};
  for (const r of rows) {
    const k = r.status || "Sin estado";
    byStatus[k] = (byStatus[k] ?? 0) + 1;
  }
  const barV: BarPoint[] = Object.entries(byStatus).map(([k, v]) => ({ x: k, y: v }));

  const byAsset: Record<number, number> = {};
  for (const r of rows) {
    byAsset[r.assetId] = (byAsset[r.assetId] ?? 0) + 1;
  }
  const top = Object.entries(byAsset).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const barH: BarHPoint[] = top.map(([id, v]) => ({ label: `Activo ${id}`, value: v }));

  const radar: RadarPoint[] = Object.entries(byStatus).map(([k, v]) => ({ axis: k, value: v }));

  const comp: BarCompItem[] = ["Activas", "Cerradas"].map((s) => ({
    label: s,
    actual:   s === "Activas" ? activas : cerradas,
    anterior: s === "Activas" ? activas : cerradas,
  }));

  return {
    kpis,
    lineChart: { title: "Asignaciones por período", unidad: "asig.", data: linePoints, regresion: { slope: reg.slope, r2: reg.r2 } },
    barVChart: { title: "Por estado",              unidad: "asig.", data: barV },
    barHChart: { title: "Top 10 vehículos",         unidad: "asig.", data: barH },
    radarChart: { title: "Por estado",              data: radar },
    exponencialChart: { title: "Asignaciones (últimos 30 días)", unidad: "asig.", data: [] },
    comparacionChart: { title: "Actual vs anterior",  data: comp },
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
