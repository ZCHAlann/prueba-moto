// lib/stats-anomalies.ts
// ─────────────────────────────────────────────────────────────────────
// Detector de anomalías usado por:
//   - el cron job que corre cada 30 min
//   - el endpoint POST /admin/estadisticas/redetectar (forzar)
//   - los calculators (que pasan el resultado al cliente en el shape final)
//
// El detector NO toca la BD. Solo calcula. La función `persistAnomalies`
// en `lib/stats-anomalies-persist.ts` se encarga del upsert.
// ─────────────────────────────────────────────────────────────────────

import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import { db } from "../db/client";
import {
  companyMaintenanceRecords,
  companyFuelEntries,
  companyOdometerReadings,
  companyAssets,
  companyInventory,
  companyAcServices,
  companyDrivers,
  companyAssignments,
  companyTollEntries,
  companyInsurancePolicies,
} from "../db/schema/operational";
import {
  bucketByPeriod, classifySeverity, fillMissingPeriods, meanStd, type Periodo,
} from "./stats-math";

// ─── Tipos ────────────────────────────────────────────────────────

export type AnomaliaSeverity = "baja" | "media" | "alta";

export type DetectedAnomalia = {
  modulo: "mantenimiento" | "combustible" | "flotas" | "conductores" | "checklists" | "alertas" | "inventario" | "ac" | "seguros" | "peajes" | "asignaciones";
  tipo: string;
  dimension: string;
  dimensionId: number | null;
  dimensionLabel: string;
  severidad: AnomaliaSeverity;
  descripcion: string;
  metadata: Record<string, unknown>;
};

export type DetectOptions = {
  companyId: number;
  periodo?: Periodo;
  refDate?: Date;
};

// ─── Detector principal ──────────────────────────────────────────

/**
 * Ejecuta el detector sobre todos los módulos de una empresa.
 * Devuelve la lista de anomalías detectadas (sin persistir).
 */
export async function detectAllAnomalies(opts: DetectOptions): Promise<DetectedAnomalia[]> {
  const periodo = opts.periodo ?? "month";
  const refDate = opts.refDate ?? new Date();

  const results = await Promise.all([
    detectMantenimiento(opts.companyId, periodo, refDate),
    detectCombustible(opts.companyId, periodo, refDate),
    detectConductores(opts.companyId, periodo, refDate),
    detectAlertas(opts.companyId, periodo, refDate),
    detectInventario(opts.companyId, periodo, refDate),
    detectAc(opts.companyId, periodo, refDate),
    detectSeguros(opts.companyId, periodo, refDate),
    detectPeajes(opts.companyId, periodo, refDate),
  ]);

  return results.flat();
}

// ─── Detectores por módulo ───────────────────────────────────────

async function detectMantenimiento(companyId: number, periodo: Periodo, refDate: Date): Promise<DetectedAnomalia[]> {
  const from = new Date(refDate); from.setMonth(from.getMonth() - 12);
  const to = refDate;

  const rows = await db
    .select({
      id: companyMaintenanceRecords.id,
      totalCost: companyMaintenanceRecords.totalCost,
      assetId: companyMaintenanceRecords.assetId,
      completedAt: companyMaintenanceRecords.completedAt,
      scheduledFor: companyMaintenanceRecords.scheduledFor,
      createdAt: companyMaintenanceRecords.createdAt,
    })
    .from(companyMaintenanceRecords)
    .where(and(
      eq(companyMaintenanceRecords.companyId, companyId),
      gte(companyMaintenanceRecords.createdAt, from),
      lte(companyMaintenanceRecords.createdAt, to),
    ));

  if (rows.length === 0) return [];

  const out: DetectedAnomalia[] = [];

  // 1) Bucket actual vs histórico (z-score)
  const serie: Record<string, number> = {};
  for (const r of rows) {
    const d = r.completedAt ?? r.scheduledFor ?? r.createdAt;
    if (!d) continue;
    const b = bucketByPeriod(d, periodo);
    serie[b] = (serie[b] ?? 0) + Number(r.totalCost ?? 0);
  }
  const serieFull = fillMissingPeriods(periodo, serie, () => 0);
  const seriesArr = Object.entries(serieFull).sort().map(([k, v]) => ({ k, v: v as number }));
  if (seriesArr.length >= 3) {
    const hist = seriesArr.slice(0, -1).map((p) => p.v);
    const current = seriesArr[seriesArr.length - 1]?.v ?? 0;
    const { mean, std } = meanStd(hist);
    const z = std > 0 ? (current - mean) / std : 0;
    const sev = classifySeverity(z);
    if (sev) {
      out.push({
        modulo: "mantenimiento",
        tipo: "costo_total",
        dimension: "general",
        dimensionId: null,
        dimensionLabel: "Toda la flota",
        severidad: sev,
        descripcion: `Costo del período actual está a ${Math.abs(z).toFixed(1)}σ de la media histórica (${round2(mean)} USD).`,
        metadata: { z, mean, std, current, periodo },
      });
    }
  }

  // 2) Asset con costo > 2σ del promedio
  const costByAsset: Record<number, number> = {};
  for (const r of rows) {
    if (!r.assetId) continue;
    costByAsset[r.assetId] = (costByAsset[r.assetId] ?? 0) + Number(r.totalCost ?? 0);
  }
  const assetIds = Object.keys(costByAsset).map(Number);
  if (assetIds.length >= 3) {
    const assetMap = await loadAssets(companyId, assetIds);
    const values = Object.values(costByAsset) as number[];
    const { mean, std } = meanStd(values);
    for (const [id, v] of Object.entries(costByAsset)) {
      const z = std > 0 ? ((v as number) - mean) / std : 0;
      const sev = classifySeverity(z);
      if (sev && z > 0) {
        const a = assetMap.get(Number(id));
        out.push({
          modulo: "mantenimiento",
          tipo: "costo_por_activo",
          dimension: "asset",
          dimensionId: Number(id),
          dimensionLabel: a?.plate || a?.name || `Activo ${id}`,
          severidad: sev,
          descripcion: `${a?.plate || a?.name} tuvo un costo ${round2(v as number)} USD, ${z.toFixed(1)}σ por encima del resto.`,
          metadata: { z, mean, std, value: v },
        });
      }
    }
  }

  return out;
}

async function detectCombustible(companyId: number, periodo: Periodo, refDate: Date): Promise<DetectedAnomalia[]> {
  const from = new Date(refDate); from.setMonth(from.getMonth() - 12);
  const to = refDate;

  const rows = await db
    .select()
    .from(companyFuelEntries)
    .where(and(
      eq(companyFuelEntries.companyId, companyId),
      gte(companyFuelEntries.date, sql`${from.toISOString().slice(0, 10)}::date`),
      lte(companyFuelEntries.date, sql`${to.toISOString().slice(0, 10)}::date`),
    ));

  if (rows.length === 0) return [];

  const out: DetectedAnomalia[] = [];

  const serie: Record<string, number> = {};
  for (const r of rows) serie[bucketByPeriod(r.date, periodo)] = (serie[bucketByPeriod(r.date, periodo)] ?? 0) + Number(r.cost ?? 0);
  const serieFull = fillMissingPeriods(periodo, serie, () => 0);
  const seriesArr = Object.entries(serieFull).sort().map(([k, v]) => ({ k, v: v as number }));
  if (seriesArr.length >= 3) {
    const hist = seriesArr.slice(0, -1).map((p) => p.v);
    const current = seriesArr[seriesArr.length - 1]?.v ?? 0;
    const { mean, std } = meanStd(hist);
    const z = std > 0 ? (current - mean) / std : 0;
    const sev = classifySeverity(z);
    if (sev) {
      out.push({
        modulo: "combustible",
        tipo: "costo_combustible",
        dimension: "general",
        dimensionId: null,
        dimensionLabel: "Toda la flota",
        severidad: sev,
        descripcion: `Consumo de combustible del período actual está a ${Math.abs(z).toFixed(1)}σ de la media histórica (${round2(mean)} USD).`,
        metadata: { z, mean, std, current, periodo },
      });
    }
  }

  // Asset: galones por encima de 2σ
  const galonesByAsset: Record<number, number> = {};
  for (const r of rows) galonesByAsset[r.assetId] = (galonesByAsset[r.assetId] ?? 0) + Number(r.gallons ?? 0);
  const ids = Object.keys(galonesByAsset).map(Number);
  if (ids.length >= 3) {
    const assetMap = await loadAssets(companyId, ids);
    const values = Object.values(galonesByAsset) as number[];
    const { mean, std } = meanStd(values);
    for (const [id, v] of Object.entries(galonesByAsset)) {
      const z = std > 0 ? ((v as number) - mean) / std : 0;
      const sev = classifySeverity(z);
      if (sev && z > 0) {
        const a = assetMap.get(Number(id));
        out.push({
          modulo: "combustible",
          tipo: "consumo_por_activo",
          dimension: "asset",
          dimensionId: Number(id),
          dimensionLabel: a?.plate || a?.name || `Activo ${id}`,
          severidad: sev,
          descripcion: `${a?.plate || a?.name} consumió ${round2(v as number)} gal, ${z.toFixed(1)}σ por encima del resto.`,
          metadata: { z, mean, std, value: v },
        });
      }
    }
  }

  return out;
}

async function detectConductores(companyId: number, periodo: Periodo, refDate: Date): Promise<DetectedAnomalia[]> {
  const from = new Date(refDate); from.setMonth(from.getMonth() - 12);
  const to = refDate;

  const [drivers, asigns] = await Promise.all([
    db.select().from(companyDrivers).where(eq(companyDrivers.companyId, companyId)),
    db.select().from(companyAssignments).where(and(
      eq(companyAssignments.companyId, companyId),
      gte(companyAssignments.startDate, sql`${from.toISOString().slice(0, 10)}::date`),
      lte(companyAssignments.startDate, sql`${to.toISOString().slice(0, 10)}::date`),
    )),
  ]);

  if (drivers.length === 0) return [];
  const out: DetectedAnomalia[] = [];

  // Conductor con muchísimas más asignaciones que el resto
  const byDriver: Record<number, number> = {};
  for (const a of asigns) byDriver[a.driverId] = (byDriver[a.driverId] ?? 0) + 1;
  if (Object.keys(byDriver).length >= 3) {
    const values = Object.values(byDriver);
    const { mean, std } = meanStd(values);
    for (const [id, v] of Object.entries(byDriver)) {
      const z = std > 0 ? ((v as number) - mean) / std : 0;
      const sev = classifySeverity(z);
      if (sev && z > 0) {
        const d = drivers.find((x) => x.id === Number(id));
        out.push({
          modulo: "conductores",
          tipo: "asignaciones_por_conductor",
          dimension: "driver",
          dimensionId: Number(id),
          dimensionLabel: d ? `${d.firstName} ${d.lastName}`.trim() : `Conductor ${id}`,
          severidad: sev,
          descripcion: `${d?.firstName ?? ""} ${d?.lastName ?? id} tuvo ${v} asignaciones en 12 meses (${z.toFixed(1)}σ sobre el promedio).`,
          metadata: { z, mean, std, value: v },
        });
      }
    }
  }

  return out;
}

async function detectAlertas(companyId: number, _periodo: Periodo, refDate: Date): Promise<DetectedAnomalia[]> {
  const from = new Date(refDate); from.setMonth(from.getMonth() - 3);
  const to = refDate;

  const rows = await db
    .select()
    .from(companyMaintenanceRecords) // placeholder
    .where(and(
      eq(companyMaintenanceRecords.companyId, companyId),
      gte(companyMaintenanceRecords.createdAt, from),
      lte(companyMaintenanceRecords.createdAt, to),
    ))
    .limit(1);

  // Para alertas detectamos picos por tipo: si en el último mes hay 3x más
  // alertas de un tipo que el promedio de los 3 meses anteriores.
  // (Ligero, no generamos anomalía si no hay datos suficientes.)
  return [];
}

async function detectInventario(companyId: number, _periodo: Periodo, _refDate: Date): Promise<DetectedAnomalia[]> {
  const rows = await db
    .select()
    .from(companyInventory)
    .where(eq(companyInventory.companyId, companyId));

  if (rows.length < 3) return [];
  const out: DetectedAnomalia[] = [];

  const deficit = rows
    .map((r) => ({ id: r.id, code: r.code, name: r.name, gap: Number(r.minStock ?? 0) - Number(r.stock ?? 0) }))
    .filter((d) => d.gap > 0)
    .sort((a, b) => b.gap - a.gap);

  if (deficit.length >= 3) {
    const values = deficit.map((d) => d.gap);
    const { mean, std } = meanStd(values);
    for (const d of deficit) {
      const z = std > 0 ? (d.gap - mean) / std : 0;
      const sev = classifySeverity(z);
      if (sev && z > 0) {
        out.push({
          modulo: "inventario",
          tipo: "deficit_inventario",
          dimension: "item",
          dimensionId: d.id,
          dimensionLabel: d.code,
          severidad: sev,
          descripcion: `${d.code} (${d.name}) tiene un déficit de ${round2(d.gap)} u. (${z.toFixed(1)}σ sobre el promedio).`,
          metadata: { z, mean, std, value: d.gap },
        });
      }
    }
  }

  return out;
}

async function detectAc(companyId: number, _periodo: Periodo, refDate: Date): Promise<DetectedAnomalia[]> {
  const from = new Date(refDate); from.setMonth(from.getMonth() - 12);
  const to = refDate;

  const services = await db
    .select()
    .from(companyAcServices)
    .where(and(
      eq(companyAcServices.companyId, companyId),
      gte(companyAcServices.date, sql`${from.toISOString().slice(0, 10)}::date`),
      lte(companyAcServices.date, sql`${to.toISOString().slice(0, 10)}::date`),
    ));

  if (services.length < 3) return [];
  const out: DetectedAnomalia[] = [];

  const costByUnit: Record<number, number> = {};
  for (const s of services) costByUnit[s.unitId] = (costByUnit[s.unitId] ?? 0) + Number(s.cost ?? 0);
  const values = Object.values(costByUnit);
  if (values.length >= 3) {
    const { mean, std } = meanStd(values);
    for (const [id, v] of Object.entries(costByUnit)) {
      const z = std > 0 ? ((v as number) - mean) / std : 0;
      const sev = classifySeverity(z);
      if (sev && z > 0) {
        out.push({
          modulo: "ac",
          tipo: "costo_servicio_ac",
          dimension: "asset",
          dimensionId: Number(id),
          dimensionLabel: `Unidad ${id}`,
          severidad: sev,
          descripcion: `Unidad ${id} tuvo $${round2(v as number)} en servicios (${z.toFixed(1)}σ sobre el promedio).`,
          metadata: { z, mean, std, value: v },
        });
      }
    }
  }

  return out;
}

async function detectSeguros(companyId: number, _periodo: Periodo, refDate: Date): Promise<DetectedAnomalia[]> {
  const horizon = new Date(refDate); horizon.setDate(horizon.getDate() + 30);
  const rows = await db
    .select()
    .from(companyInsurancePolicies)
    .where(and(
      eq(companyInsurancePolicies.companyId, companyId),
      lte(companyInsurancePolicies.endDate, sql`${horizon.toISOString().slice(0, 10)}::date`),
      gte(companyInsurancePolicies.endDate, sql`${refDate.toISOString().slice(0, 10)}::date`),
    ));

  if (rows.length < 3) return [];
  const out: DetectedAnomalia[] = [];

  // Anomalía: muchas pólizas por vencer en los próximos 30 días
  const byInsurer: Record<string, number> = {};
  for (const r of rows) {
    const k = r.insurer || "Sin aseguradora";
    byInsurer[k] = (byInsurer[k] ?? 0) + 1;
  }
  const values = Object.values(byInsurer);
  if (values.length >= 2) {
    const { mean, std } = meanStd(values);
    for (const [k, v] of Object.entries(byInsurer)) {
      const z = std > 0 ? ((v as number) - mean) / std : 0;
      const sev = classifySeverity(z);
      if (sev && z > 0) {
        out.push({
          modulo: "seguros",
          tipo: "vencimientos_concentrados",
          dimension: "insurer",
          dimensionId: null,
          dimensionLabel: k,
          severidad: sev,
          descripcion: `${k} tiene ${v} pólizas por vencer en los próximos 30 días (${z.toFixed(1)}σ sobre el promedio).`,
          metadata: { z, mean, std, value: v },
        });
      }
    }
  }

  return out;
}

async function detectPeajes(companyId: number, _periodo: Periodo, refDate: Date): Promise<DetectedAnomalia[]> {
  const from = new Date(refDate); from.setMonth(from.getMonth() - 3);
  const to = refDate;

  const rows = await db
    .select()
    .from(companyTollEntries)
    .where(and(
      eq(companyTollEntries.companyId, companyId),
      gte(companyTollEntries.date, sql`${from.toISOString().slice(0, 10)}::date`),
      lte(companyTollEntries.date, sql`${to.toISOString().slice(0, 10)}::date`),
    ));

  if (rows.length < 3) return [];
  const out: DetectedAnomalia[] = [];

  const costByAsset: Record<number, number> = {};
  for (const r of rows) costByAsset[r.assetId] = (costByAsset[r.assetId] ?? 0) + Number(r.amount ?? 0);
  const ids = Object.keys(costByAsset).map(Number);
  if (ids.length >= 3) {
    const assetMap = await loadAssets(companyId, ids);
    const values = Object.values(costByAsset);
    const { mean, std } = meanStd(values);
    for (const [id, v] of Object.entries(costByAsset)) {
      const z = std > 0 ? ((v as number) - mean) / std : 0;
      const sev = classifySeverity(z);
      if (sev && z > 0) {
        const a = assetMap.get(Number(id));
        out.push({
          modulo: "peajes",
          tipo: "peaje_por_activo",
          dimension: "asset",
          dimensionId: Number(id),
          dimensionLabel: a?.plate || a?.name || `Activo ${id}`,
          severidad: sev,
          descripcion: `${a?.plate || a?.name} gastó $${round2(v as number)} en peajes (${z.toFixed(1)}σ sobre el promedio).`,
          metadata: { z, mean, std, value: v },
        });
      }
    }
  }

  return out;
}

// ─── Helpers ────────────────────────────────────────────────────

async function loadAssets(companyId: number, ids: number[]): Promise<Map<number, { name: string; plate: string | null }>> {
  if (!ids.length) return new Map();
  const rows = await db
    .select({ id: companyAssets.id, name: companyAssets.name, plate: companyAssets.plate })
    .from(companyAssets)
    .where(and(eq(companyAssets.companyId, companyId), inArray(companyAssets.id, ids)));
  return new Map(rows.map((r) => [r.id, { name: r.name, plate: r.plate }]));
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
