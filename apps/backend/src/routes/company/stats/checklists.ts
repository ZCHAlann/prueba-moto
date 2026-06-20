// routes/company/stats/checklists.ts
// ─────────────────────────────────────────────────────────────────────
// Calculator Checklists: inspecciones por período, % aprobación, top
// por inspector, distribución por categoría.
// ─────────────────────────────────────────────────────────────────────

import { eq, and, gte, lte, sql } from "drizzle-orm";
import { db } from "../../../db/client";
import { companyChecklists } from "../../../db/schema/operational";
import {
  bucketByPeriod, fillMissingPeriods, linearRegression, type Periodo,
} from "../../../lib/stats-math";
import type { StatInput, StatResult, KpiItem, LinePoint, BarPoint, BarHPoint, BarCompItem, RadarPoint } from "./mantenimiento";

export async function calculateChecklists(input: StatInput): Promise<StatResult> {
  const { companyId, periodo, refDate, endDate, assetId } = input;
  const end = endDate ?? refDate;

  const from = new Date(refDate);
  from.setMonth(from.getMonth() - 12);

  const where: any[] = [
    eq(companyChecklists.companyId, companyId),
    gte(companyChecklists.date, sql`${from.toISOString().slice(0, 10)}::date`),
    lte(companyChecklists.date, sql`${end.toISOString().slice(0, 10)}::date`),
  ];
  if (assetId) where.push(eq(companyChecklists.assetId, assetId));

  const rows = await db
    .select()
    .from(companyChecklists)
    .where(and(...where));

  const total    = rows.length;
  const ok       = rows.filter((r) => r.status === "Aprobado").length;
  const obs      = rows.filter((r) => r.status === "Observado").length;
  const pend     = rows.filter((r) => r.status === "Pendiente").length;
  const pctAprob = total ? (ok / total) * 100 : 0;

  const kpis: KpiItem[] = [
    { label: "Inspecciones", valor: total,    unidad: "insp.",   variacionPct: 0, icono: "clipboard-list" },
    { label: "Aprobadas",    valor: ok,       unidad: "insp.",   variacionPct: 0, icono: "check-circle" },
    { label: "% Aprobación", valor: Math.round(pctAprob * 10) / 10, unidad: "%", variacionPct: 0, icono: "trending-up" },
    { label: "Observadas",   valor: obs,      unidad: "insp.",   variacionPct: 0, icono: "alert-triangle" },
  ];

  const serie: Record<string, number> = {};
  for (const r of rows) {
    const b = bucketByPeriod(new Date(r.date), periodo);
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
    const k = r.status ?? "Sin estado";
    byStatus[k] = (byStatus[k] ?? 0) + 1;
  }
  const barV: BarPoint[] = Object.entries(byStatus).map(([k, v]) => ({ x: k, y: v }));

  const byInspector: Record<string, number> = {};
  for (const r of rows) {
    const k = r.targetLabel || r.targetKind || "Sin asignar";
    byInspector[k] = (byInspector[k] ?? 0) + 1;
  }
  const top = Object.entries(byInspector).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const barH: BarHPoint[] = top.map(([k, v]) => ({ label: String(k), value: v }));

  // Radar: por categoría (usamos el targetKind porque no hay columna categ.)
  const byCat: Record<string, number> = {};
  for (const r of rows) {
    const k = r.targetKind || "Otro";
    byCat[k] = (byCat[k] ?? 0) + 1;
  }
  const radar: RadarPoint[] = Object.entries(byCat).map(([k, v]) => ({ axis: k, value: v }));

  const comp: BarCompItem[] = ["Aprobado", "Observado", "Pendiente"].map((s) => ({
    label: s,
    actual:    s === "Aprobado" ? ok  : s === "Observado" ? obs  : pend,
    anterior:  s === "Aprobado" ? ok  : s === "Observado" ? obs  : pend,
  }));

  return {
    kpis,
    lineChart: { title: "Inspecciones por período", unidad: "insp.", data: linePoints, regresion: { slope: reg.slope, r2: reg.r2 } },
    barVChart: { title: "Por estado",                unidad: "insp.", data: barV },
    barHChart: { title: "Top 10 vehículos inspeccionados", unidad: "insp.", data: barH },
    radarChart: { title: "Por tipo de objetivo",     data: radar },
    exponencialChart: { title: "Inspecciones (últimos 30 días)", unidad: "insp.", data: [] },
    comparacionChart: { title: "Actual vs anterior",   data: comp },
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
