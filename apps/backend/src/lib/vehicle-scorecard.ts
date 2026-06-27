// lib/vehicle-scorecard.ts
// ─────────────────────────────────────────────────────────────────────
// Scorecard 0-100 por vehículo. Mide "salud operativa" de cada unidad
// para que el dueño de la flota identifique qué activos necesitan
// intervención.
//
// Componentes (5 × 20 = 100):
//   1. Edad                → más viejo = peor
//   2. Mantenimiento       → % correctivos + backlog
//   3. Combustible         → eficiencia vs flota
//   4. Alertas             → # abiertas/críticas
//   5. Estado              → "Operativo" = full, otros = parcial
//
// Devuelve: { score, componentes, recomendacion, riskLevel }
//   - score 80-100: "saludable"
//   - score 60-79:  "atención"
//   - score 40-59:  "riesgo"
//   - score 0-39:   "crítico"
// ─────────────────────────────────────────────────────────────────────

import { eq, and, gte, sql, lt, lte } from "drizzle-orm";
import { db } from "../db/client";
import {
  companyAssets,
  companyMaintenanceRecords,
  companyFuelEntries,
  companyAlerts,
} from "../db/schema/operational";

export type ScorecardComponent = {
  key:      "edad" | "mantenimiento" | "combustible" | "alertas" | "estado";
  label:    string;
  score:    number;     // 0-20
  detalle:  string;     // explicación humana
};

export type VehicleScorecard = {
  assetId:     number;
  plate:       string | null;
  name:        string;
  score:       number;        // 0-100
  riskLevel:   "saludable" | "atencion" | "riesgo" | "critico";
  recomendacion: string;
  componentes:  ScorecardComponent[];
};

export type ScorecardOpts = {
  companyId: number;
  /** Ventana de evaluación. Default: 12 meses. */
  meses?: number;
  /** Para combinar con TCO y comparar eficiencia vs flota. */
  fleetAvgKmGal?: number;
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export async function calculateScorecard(opts: ScorecardOpts): Promise<VehicleScorecard[]> {
  const meses = opts.meses ?? 12;
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - meses * 30 * MS_PER_DAY);

  // 1) Assets
  const assets = await db
    .select()
    .from(companyAssets)
    .where(eq(companyAssets.companyId, opts.companyId));

  if (assets.length === 0) return [];

  // 2) Datos agregados por asset en una sola pasada
  const desdeIso = desde.toISOString().slice(0, 10);
  const hastaIso = hasta.toISOString().slice(0, 10);

  const [maintRows, fuelRows, alertRows] = await Promise.all([
    db
      .select()
      .from(companyMaintenanceRecords)
      .where(and(
        eq(companyMaintenanceRecords.companyId, opts.companyId),
        gte(companyMaintenanceRecords.createdAt, desde),
        lte(companyMaintenanceRecords.createdAt, hasta),
      )),
    db
      .select()
      .from(companyFuelEntries)
      .where(and(
        eq(companyFuelEntries.companyId, opts.companyId),
        gte(companyFuelEntries.date, sql`${desdeIso}::date`),
        lte(companyFuelEntries.date, sql`${hastaIso}::date`),
      )),
    db
      .select()
      .from(companyAlerts)
      .where(and(
        eq(companyAlerts.companyId, opts.companyId),
        gte(companyAlerts.createdAt, desde),
        lte(companyAlerts.createdAt, hasta),
      )),
  ]);

  // 3) Indexar por asset
  const statsByAsset: Record<number, {
    ots: number;
    correctivos: number;
    pendientes: number;
    vencidas: number;
    galones: number;
    km: number;
    alertasAbiertas: number;
    alertasCriticas: number;
  }> = {};

  const ensure = (id: number) => {
    if (!statsByAsset[id]) {
      statsByAsset[id] = {
        ots: 0, correctivos: 0, pendientes: 0, vencidas: 0,
        galones: 0, km: 0, alertasAbiertas: 0, alertasCriticas: 0,
      };
    }
    return statsByAsset[id]!;
  };

  for (const r of maintRows) {
    const s = ensure(r.assetId);
    s.ots++;
    if (r.type === "Correctivo") s.correctivos++;
    if (r.status === "Programado" || r.status === "En curso" || r.status === "PendienteAtencion") s.pendientes++;
    if (r.status === "PendienteAtencion") s.vencidas++;
  }
  for (const r of fuelRows) {
    const s = ensure(r.assetId);
    s.galones += Number(r.gallons ?? 0);
    s.km      += Number(r.odometer ?? 0); // aproximado; mejor con readings
  }
  for (const a of alertRows) {
    if (!a.assetId) continue;
    const s = ensure(a.assetId);
    if (a.status === "Abierta") s.alertasAbiertas++;
    if (a.severity === "alta" || a.severity === "critica") s.alertasCriticas++;
  }

  // 4) Calcular km/gal flota promedio
  const fleetTotalGalones = Object.values(statsByAsset).reduce((a, s) => a + s.galones, 0);
  const fleetTotalKm      = Object.values(statsByAsset).reduce((a, s) => a + s.km, 0);
  const fleetAvgKmGal     = fleetTotalGalones > 0 ? fleetTotalKm / fleetTotalGalones : 0;
  const avgKmGal          = opts.fleetAvgKmGal ?? fleetAvgKmGal;

  // 5) Score por asset
  const result: VehicleScorecard[] = [];
  for (const a of assets) {
    const s = ensure(a.id);
    const componentes: ScorecardComponent[] = [];

    // 1) Edad (0-20)
    const anio = a.year ? Number(a.year) : null;
    const edad = anio ? new Date().getUTCFullYear() - anio : 0;
    const scoreEdad = edad <= 2 ? 20 : edad >= 15 ? 0 : Math.round(20 - (edad - 2) * (20 / 13));
    componentes.push({
      key: "edad",
      label: "Edad del vehículo",
      score: scoreEdad,
      detalle: anio ? `${edad} años (${anio})` : "Sin año registrado",
    });

    // 2) Mantenimiento (0-20)
    const pctCorrectivos = s.ots > 0 ? (s.correctivos / s.ots) * 100 : 0;
    // Penalización por correctivos: 0% → 20, 50%+ → 0
    const scorePorCorrectivos = Math.max(0, Math.round(20 - pctCorrectivos * 0.4));
    // Penalización por backlog: 0 pendientes → 0, 3+ → -10
    const backlogPenalty = Math.min(10, s.vencidas * 3);
    const scoreMantenimiento = Math.max(0, Math.min(20, scorePorCorrectivos - backlogPenalty));
    componentes.push({
      key: "mantenimiento",
      label: "Mantenimiento",
      score: scoreMantenimiento,
      detalle: s.ots > 0
        ? `${s.ots} OTs · ${pctCorrectivos.toFixed(0)}% correctivos · ${s.vencidas} vencidas`
        : "Sin OTs en el período",
    });

    // 3) Combustible (0-20)
    const kmGal = s.galones > 0 ? s.km / s.galones : 0;
    let scoreCombustible = 10; // neutral si no hay datos
    if (s.galones > 0 && avgKmGal > 0) {
      const ratio = kmGal / avgKmGal;
      // ratio >= 1.2 → 20, ratio <= 0.5 → 0
      scoreCombustible = Math.max(0, Math.min(20, Math.round((ratio - 0.5) * 40)));
    }
    componentes.push({
      key: "combustible",
      label: "Eficiencia combustible",
      score: scoreCombustible,
      detalle: s.galones > 0
        ? `${kmGal.toFixed(2)} km/gal (flota: ${avgKmGal.toFixed(2)})`
        : "Sin datos de combustible",
    });

    // 4) Alertas (0-20)
    const alertPenalty = s.alertasAbiertas * 2 + s.alertasCriticas * 5;
    const scoreAlertas = Math.max(0, 20 - alertPenalty);
    componentes.push({
      key: "alertas",
      label: "Alertas",
      score: scoreAlertas,
      detalle: s.alertasAbiertas > 0
        ? `${s.alertasAbiertas} abiertas, ${s.alertasCriticas} críticas`
        : "Sin alertas",
    });

    // 5) Estado (0-20)
    let scoreEstado = 0;
    if (a.status === "Operativo")   scoreEstado = 20;
    else if (a.status === "En mantenimiento") scoreEstado = 10;
    else if (a.status === "Fuera de servicio") scoreEstado = 0;
    componentes.push({
      key: "estado",
      label: "Estado actual",
      score: scoreEstado,
      detalle: a.status ?? "Sin estado",
    });

    const score = componentes.reduce((a, c) => a + c.score, 0);
    const riskLevel =
      score >= 80 ? "saludable" :
      score >= 60 ? "atencion"  :
      score >= 40 ? "riesgo"    : "critico";

    const recomendacion = buildRecomendacion(score, componentes);

    result.push({
      assetId: a.id,
      plate:   a.plate,
      name:    a.name,
      score,
      riskLevel,
      recomendacion,
      componentes,
    });
  }

  // Ordenar de peor a mejor score
  result.sort((a, b) => a.score - b.score);
  return result;
}

function buildRecomendacion(score: number, comps: ScorecardComponent[]): string {
  if (score >= 80) return "Vehículo en buen estado. Mantener el plan de mantenimiento actual.";
  if (score >= 60) return "Atención. Revisar el componente con menor score y planificar intervención preventiva.";

  // score < 60 → buscar los 2 peores componentes
  const sorted = [...comps].sort((a, b) => a.score - b.score);
  const peores  = sorted.slice(0, 2);
  const labels  = peores.map((c) => c.label.toLowerCase()).join(" y ");
  if (score < 40) return `Crítico. Intervenir en ${labels} antes de la próxima operación.`;
  return `Riesgo. Revisar ${labels} en los próximos 15 días.`;
}
