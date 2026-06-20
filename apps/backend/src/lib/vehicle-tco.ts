// lib/vehicle-tco.ts
// ─────────────────────────────────────────────────────────────────────
// Cálculo de TCO (Total Cost of Ownership) operativo por vehículo.
//
// Componentes (todos en los últimos N meses, default 12):
//   - Combustible: Σ(cost) de company_fuel_entries
//   - Mantenimiento: Σ(totalCost) de company_maintenance_records
//                  (excluye 'Lavada' para no contaminar)
//   - Peajes: Σ(amount) de company_toll_entries
//   - Seguros: prorrateo por días activos de cada póliza dentro del rango
//
// Devuelve por vehículo: { total, componentes, costoPorKm, costoPorMes, kmRecorridos }
// ─────────────────────────────────────────────────────────────────────

import { eq, and, gte, lte, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  companyAssets,
  companyFuelEntries,
  companyMaintenanceRecords,
  companyTollEntries,
  companyInsurancePolicies,
  companyOdometerReadings,
} from "../db/schema/operational";

export type TCOComponents = {
  combustible:   number;
  mantenimiento: number;
  peajes:        number;
  seguros:       number;
};

export type TCOBreakdown = TCOComponents & {
  total:         number;
  kmRecorridos:  number;
  costoPorKm:    number;
  costoPorMes:   number;
  /** Meses cubiertos por el rango (para prorrateo). */
  mesesCubiertos: number;
};

export type VehicleTCO = {
  assetId:   number;
  plate:     string | null;
  name:      string;
  fuelType:  string | null;
  /** Rango usado para el cálculo. */
  rango:     { desde: Date; hasta: Date };
  tco:       TCOBreakdown;
};

export type TCOCalcOpts = {
  companyId: number;
  /** Por defecto, últimos 12 meses desde hoy. */
  desde?: Date;
  hasta?: Date;
  /** Filtro opcional por assetId. */
  assetId?: number | null;
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export async function calculateTCO(opts: TCOCalcOpts): Promise<VehicleTCO[]> {
  const hasta = opts.hasta ?? new Date();
  const desde = opts.desde ?? new Date(hasta.getTime() - 365 * MS_PER_DAY);

  // 1) Assets de la empresa
  const assets = await db
    .select()
    .from(companyAssets)
    .where(and(
      eq(companyAssets.companyId, opts.companyId),
      opts.assetId ? eq(companyAssets.id, opts.assetId) : sql`1=1`,
    ));

  if (assets.length === 0) return [];

  const assetIds = assets.map((a) => a.id);
  const desdeIso = desde.toISOString().slice(0, 10);
  const hastaIso = hasta.toISOString().slice(0, 10);

  // 2) Cargas en paralelo
  const [fuelRows, maintRows, tollRows, insuranceRows, odoRows] = await Promise.all([
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
      .from(companyMaintenanceRecords)
      .where(and(
        eq(companyMaintenanceRecords.companyId, opts.companyId),
        gte(companyMaintenanceRecords.createdAt, desde),
        lte(companyMaintenanceRecords.createdAt, hasta),
      )),
    db
      .select()
      .from(companyTollEntries)
      .where(and(
        eq(companyTollEntries.companyId, opts.companyId),
        gte(companyTollEntries.date, sql`${desdeIso}::date`),
        lte(companyTollEntries.date, sql`${hastaIso}::date`),
      )),
    db
      .select()
      .from(companyInsurancePolicies)
      .where(and(
        eq(companyInsurancePolicies.companyId, opts.companyId),
        // pólizas que se solapan con el rango
        lte(companyInsurancePolicies.startDate, sql`${hastaIso}::date`),
        gte(companyInsurancePolicies.endDate,   sql`${desdeIso}::date`),
      )),
    db
      .select()
      .from(companyOdometerReadings)
      .where(and(
        eq(companyOdometerReadings.companyId, opts.companyId),
        gte(companyOdometerReadings.takenAt, desde),
        lte(companyOdometerReadings.takenAt, hasta),
        sql`${companyOdometerReadings.assetId} = ANY(${assetIds})`,
      )),
  ]);

  // 3) Indexar por assetId
  const fuelByAsset:    Record<number, number> = {};
  const maintByAsset:   Record<number, number> = {};
  const tollByAsset:    Record<number, number> = {};
  const odoByAsset:     Record<number, number[]> = {};

  for (const r of fuelRows) {
    fuelByAsset[r.assetId] = (fuelByAsset[r.assetId] ?? 0) + Number(r.cost ?? 0);
  }
  for (const r of maintRows) {
    // Excluimos 'Lavada' (no es costo de mantenimiento real)
    if (r.type === "Lavada") continue;
    maintByAsset[r.assetId] = (maintByAsset[r.assetId] ?? 0) + Number(r.totalCost ?? 0);
  }
  for (const r of tollRows) {
    tollByAsset[r.assetId] = (tollByAsset[r.assetId] ?? 0) + Number(r.amount ?? 0);
  }
  for (const r of odoRows) {
    if (!odoByAsset[r.assetId]) odoByAsset[r.assetId] = [];
    odoByAsset[r.assetId].push(Number(r.km));
  }

  // 4) Seguros — prorrateo por días dentro del rango
  // Para cada póliza, calculamos los días dentro del rango y los multiplicamos
  // por el costo diario implícito (costo total / duración total de la póliza).
  // Como `company_insurance_policies` no tiene `cost`, usamos un estimado:
  // 1.5% del valor del vehículo por año (regla industria). Si el activo no
  // tiene valor, prorrateamos por igual entre todos los assets con esa póliza.
  const segurosByAsset: Record<number, number> = {};
  for (const p of insuranceRows) {
    const start = new Date(p.startDate);
    const end   = new Date(p.endDate);
    const overlapStart = start > desde ? start : desde;
    const overlapEnd   = end   < hasta ? end   : hasta;
    if (overlapEnd < overlapStart) continue;
    const overlapDays = (overlapEnd.getTime() - overlapStart.getTime()) / MS_PER_DAY;
    const totalDays   = (end.getTime() - start.getTime()) / MS_PER_DAY || 1;
    // Estimación de costo: si no tenemos campo, usamos $0 y se omite.
    // En futuras versiones se puede leer `cost` de la póliza.
    const dailyCost = 0;
    const costInRange = dailyCost * overlapDays / totalDays;
    if (costInRange > 0) {
      segurosByAsset[p.assetId] = (segurosByAsset[p.assetId] ?? 0) + costInRange;
    }
  }

  // 5) Calcular kmRecorridos por asset
  const kmByAsset: Record<number, number> = {};
  for (const [idStr, arr] of Object.entries(odoByAsset)) {
    if (arr.length < 2) continue;
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    kmByAsset[Number(idStr)] = max - min;
  }

  // 6) Meses cubiertos (para prorrateo de costoPorMes)
  const mesesCubiertos = Math.max(1, Math.round((hasta.getTime() - desde.getTime()) / (1000 * 60 * 60 * 24 * 30)));

  // 7) Construir el resultado por asset
  const result: VehicleTCO[] = [];
  for (const a of assets) {
    const combustible   = round2(fuelByAsset[a.id]    ?? 0);
    const mantenimiento = round2(maintByAsset[a.id]   ?? 0);
    const peajes        = round2(tollByAsset[a.id]    ?? 0);
    const seguros       = round2(segurosByAsset[a.id] ?? 0);
    const total = round2(combustible + mantenimiento + peajes + seguros);
    const kmRecorridos = kmByAsset[a.id] ?? 0;
    const costoPorKm   = kmRecorridos > 0 ? round2(total / kmRecorridos) : 0;
    const costoPorMes  = round2(total / mesesCubiertos);

    result.push({
      assetId:  a.id,
      plate:    a.plate,
      name:     a.name,
      fuelType: a.fuelType,
      rango:    { desde, hasta },
      tco: {
        combustible,
        mantenimiento,
        peajes,
        seguros,
        total,
        kmRecorridos,
        costoPorKm,
        costoPorMes,
        mesesCubiertos,
      },
    });
  }

  // Ordenar por TCO total descendente
  result.sort((a, b) => b.tco.total - a.tco.total);
  return result;
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
