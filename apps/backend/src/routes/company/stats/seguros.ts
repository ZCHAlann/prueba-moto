// routes/company/stats/seguros.ts
// Calculator Seguros: vigentes, por vencer, costo total.
import { eq, gte, lte, and, sql } from "drizzle-orm";
import { db } from "../../../db/client";
import { companyInsurancePolicies } from "../../../db/schema/operational";
import { bucketByPeriod, fillMissingPeriods, linearRegression, type Periodo } from "../../../lib/stats-math";
import type { StatInput, StatResult, KpiItem, LinePoint, BarPoint, BarHPoint, BarCompItem, RadarPoint } from "./mantenimiento";

export async function calculateSeguros(input: StatInput): Promise<StatResult> {
  const { companyId, periodo, refDate, endDate, assetId } = input;
  const end = endDate ?? refDate;
  const from = new Date(refDate); from.setMonth(from.getMonth() - 12);

  const where: any[] = [
    eq(companyInsurancePolicies.companyId, companyId),
    gte(companyInsurancePolicies.endDate, sql`${from.toISOString().slice(0, 10)}::date`),
    lte(companyInsurancePolicies.endDate, sql`${end.toISOString().slice(0, 10)}::date`),
  ];
  if (assetId) where.push(eq(companyInsurancePolicies.assetId, assetId));

  const rows = await db.select().from(companyInsurancePolicies).where(and(...where));

  const total    = rows.length;
  const vigentes = rows.filter((r) => r.status === "Vigente").length;
  const porVencer = rows.filter((r) => {
    if (!r.endDate) return false;
    const d = new Date(r.endDate);
    const diff = (d.getTime() - end.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 30;
  }).length;
  const vencidas = rows.filter((r) => r.status !== "Vigente").length;

  const kpis: KpiItem[] = [
    { label: "Pólizas",    valor: total,     unidad: "pólizas", variacionPct: 0, icono: "shield" },
    { label: "Vigentes",   valor: vigentes,  unidad: "pólizas", variacionPct: 0, icono: "check-circle" },
    { label: "Por vencer", valor: porVencer, unidad: "pólizas", variacionPct: 0, icono: "alert-triangle" },
    { label: "Vencidas",   valor: vencidas,  unidad: "pólizas", variacionPct: 0, icono: "x" },
  ];

  const serie: Record<string, number> = {};
  for (const r of rows) {
    const b = bucketByPeriod(new Date(r.startDate), periodo);
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

  const byInsurer: Record<string, number> = {};
  for (const r of rows) {
    const k = r.insurer || "Sin aseguradora";
    byInsurer[k] = (byInsurer[k] ?? 0) + 1;
  }
  const barV: BarPoint[] = Object.entries(byInsurer).map(([k, v]) => ({ x: k, y: v }));

  const barH: BarHPoint[] = Object.entries(byInsurer).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => ({ label: k, value: v }));
  const radar: RadarPoint[] = Object.entries(byInsurer).map(([k, v]) => ({ axis: k, value: v }));

  const comp: BarCompItem[] = ["Vigentes", "Por vencer", "Vencidas"].map((s) => ({
    label: s,
    actual:   s === "Vigentes" ? vigentes : s === "Por vencer" ? porVencer : vencidas,
    anterior: s === "Vigentes" ? vigentes : s === "Por vencer" ? porVencer : vencidas,
  }));

  return {
    kpis,
    lineChart: { title: "Pólizas iniciadas por período", unidad: "pólizas", data: linePoints, regresion: { slope: reg.slope, r2: reg.r2 } },
    barVChart: { title: "Por aseguradora",               unidad: "pólizas", data: barV },
    barHChart: { title: "Top aseguradoras",              unidad: "pólizas", data: barH },
    radarChart: { title: "Aseguradoras",                  data: radar },
    exponencialChart: { title: "Seguros (últimos 30 días)", unidad: "pólizas", data: [] },
    comparacionChart: { title: "Actual vs anterior",       data: comp },
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
