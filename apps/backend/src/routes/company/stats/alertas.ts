// routes/company/stats/alertas.ts
// ─────────────────────────────────────────────────────────────────────
// Calculator Alertas: # alertas, # abiertas/cerradas, top por tipo,
// distribución por severidad.
// ─────────────────────────────────────────────────────────────────────

import { eq, and, gte, lte, sql } from "drizzle-orm";
import { db } from "../../../db/client";
import { companyAlerts } from "../../../db/schema/operational";
import {
  bucketByPeriod, fillMissingPeriods, linearRegression, type Periodo,
} from "../../../lib/stats-math";
import type { StatInput, StatResult, KpiItem, LinePoint, BarPoint, BarHPoint, BarCompItem, RadarPoint } from "./mantenimiento";

export async function calculateAlertas(input: StatInput): Promise<StatResult> {
  const { companyId, periodo, refDate, endDate, assetId } = input;
  const end = endDate ?? refDate;

  const from = new Date(refDate);
  from.setMonth(from.getMonth() - 12);

  const where: any[] = [
    eq(companyAlerts.companyId, companyId),
    gte(companyAlerts.createdAt, from),
    lte(companyAlerts.createdAt, end),
  ];
  if (assetId) where.push(eq(companyAlerts.assetId, assetId));

  const rows = await db.select().from(companyAlerts).where(and(...where));

  const total    = rows.length;
  const abiertas = rows.filter((r) => r.status === "Abierta").length;
  const cerradas = rows.filter((r) => r.status === "Cerrada").length;
  const criticas = rows.filter((r) => r.severity === "critica" || r.severity === "alta").length;

  const kpis: KpiItem[] = [
    { label: "Total alertas",   valor: total,    unidad: "alertas", variacionPct: 0, icono: "bell" },
    { label: "Abiertas",        valor: abiertas, unidad: "alertas", variacionPct: 0, icono: "alert-triangle" },
    { label: "Cerradas",        valor: cerradas, unidad: "alertas", variacionPct: 0, icono: "check-circle" },
    { label: "Críticas",        valor: criticas, unidad: "alertas", variacionPct: 0, icono: "alert-triangle" },
  ];

  const serie: Record<string, number> = {};
  for (const r of rows) {
    const b = bucketByPeriod(new Date(r.createdAt), periodo);
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

  const byType: Record<string, number> = {};
  for (const r of rows) {
    const k = r.type || "Sin tipo";
    byType[k] = (byType[k] ?? 0) + 1;
  }
  const barV: BarPoint[] = Object.entries(byType).map(([k, v]) => ({ x: k, y: v }));

  const bySeverity: Record<string, number> = {};
  for (const r of rows) {
    const k = r.severity || "sin severidad";
    bySeverity[k] = (bySeverity[k] ?? 0) + 1;
  }
  const barH: BarHPoint[] = Object.entries(bySeverity).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => ({ label: k, value: v }));

  const radar: RadarPoint[] = Object.entries(bySeverity).map(([k, v]) => ({ axis: k, value: v }));

  const comp: BarCompItem[] = ["Abierta", "Cerrada"].map((s) => ({
    label: s,
    actual:   s === "Abierta" ? abiertas : cerradas,
    anterior: s === "Abierta" ? abiertas : cerradas,
  }));

  return {
    kpis,
    lineChart: { title: "Alertas por período",         unidad: "alertas", data: linePoints, regresion: { slope: reg.slope, r2: reg.r2 } },
    barVChart: { title: "Por tipo",                    unidad: "alertas", data: barV },
    barHChart: { title: "Por severidad",               unidad: "alertas", data: barH },
    radarChart: { title: "Severidad",                  data: radar },
    exponencialChart: { title: "Alertas (últimos 30 días)", unidad: "alertas", data: [] },
    comparacionChart: { title: "Actual vs anterior",      data: comp },
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
