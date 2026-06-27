// lib/cross-module-signals.ts
// ─────────────────────────────────────────────────────────────────────
// Construye una "ficha cruzada" por vehículo y por conductor leyendo
// directamente de las tablas operacionales en consultas paralelas.
//
// Esto es lo que permite que la IA detecte cadenas causales reales entre
// módulos — ej. "alertas de batería sin resolver → correctivos acumulados
// → días parado" — en vez de solo resumir los agregados de un módulo.
//
// Se llama una vez por request de analisis-ia. Usa Promise.all para
// hacer las 6 queries en paralelo. El resultado se serializa en el
// prompt como JSON compacto.
// ─────────────────────────────────────────────────────────────────────

import { and, eq, gte, lte, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  companyAssets,
  companyAlerts,
  companyMaintenanceRecords,
  companyFuelEntries,
  companyChecklists,
  companyAssignments,
  companyDrivers,
} from "../db/schema/operational";

// ─── Tipos de salida ────────────────────────────────────────────────

export type AssetSignal = {
  assetId:   number;
  plate:     string | null;
  name:      string;
  /** Alertas abiertas en el período */
  openAlerts: Array<{ type: string | null; severity: string | null }>;
  /** Mantenimientos correctivos en el período */
  correctivos: number;
  /** Mantenimientos programados completados en el período */
  preventivos: number;
  /** Galones US de combustible consumidos en el período */
  fuelGallons: number;
  /** Costo de combustible en el período */
  fuelCost: number;
  /** Checklists completados con findings en el período */
  checklistsConFindings: number;
  /** Conductor activo asignado actualmente (si existe) */
  activeDriver: string | null;
};

export type DriverSignal = {
  driverId:   number;
  name:       string;
  /** Galones US de combustible consumidos como conductor en el período */
  fuelGallons: number;
  fuelCost:   number;
  /** Mantenimientos correctivos en vehículos que manejó */
  correctivosEnPeriodo: number;
  /** Checklists completados en el período */
  checklistsCompletados: number;
  /** Vehículos distintos que manejó en el período */
  vehiculosDistintos: number;
};

export type CrossModuleSignals = {
  periodoDesde: string;
  periodoHasta: string;
  assets:   AssetSignal[];
  drivers:  DriverSignal[];
  /** Totales de empresa para dar contexto relativo */
  totals: {
    openAlerts:    number;
    correctivos:   number;
    fuelGallons:   number;
    fuelCost:      number;
  };
};

// ─── Función principal ──────────────────────────────────────────────

export async function buildCrossModuleSignals(opts: {
  companyId:    number;
  currentStart: Date;
  endDate:      Date;
  assetId?:     number | null;
  driverId?:    number | null;
}): Promise<CrossModuleSignals> {
  const { companyId, currentStart, endDate, assetId, driverId } = opts;

  const startStr = currentStart.toISOString().slice(0, 10);
  const endStr   = endDate.toISOString().slice(0, 10);

  // ── Filtros opcionales por vehículo ─────────────────────────────
  const assetWhere = assetId
    ? and(eq(companyAssets.companyId, companyId), eq(companyAssets.id, assetId))
    : eq(companyAssets.companyId, companyId);

  const alertWhere = assetId
    ? and(eq(companyAlerts.companyId, companyId), eq(companyAlerts.assetId, assetId))
    : eq(companyAlerts.companyId, companyId);

  const maintWhere = assetId
    ? and(
        eq(companyMaintenanceRecords.companyId, companyId),
        eq(companyMaintenanceRecords.assetId, assetId),
        gte(companyMaintenanceRecords.scheduledFor, currentStart),
        lte(companyMaintenanceRecords.scheduledFor, endDate),
      )
    : and(
        eq(companyMaintenanceRecords.companyId, companyId),
        gte(companyMaintenanceRecords.scheduledFor, currentStart),
        lte(companyMaintenanceRecords.scheduledFor, endDate),
      );

  const fuelWhere = assetId
    ? and(
        eq(companyFuelEntries.companyId, companyId),
        eq(companyFuelEntries.assetId, assetId),
        gte(companyFuelEntries.date, sql`${startStr}::date`),
        lte(companyFuelEntries.date, sql`${endStr}::date`),
      )
    : and(
        eq(companyFuelEntries.companyId, companyId),
        gte(companyFuelEntries.date, sql`${startStr}::date`),
        lte(companyFuelEntries.date, sql`${endStr}::date`),
      );

  const checkWhere = assetId
    ? and(
        eq(companyChecklists.companyId, companyId),
        eq(companyChecklists.assetId, assetId),
        gte(companyChecklists.date, sql`${startStr}::date`),
        lte(companyChecklists.date, sql`${endStr}::date`),
      )
    : and(
        eq(companyChecklists.companyId, companyId),
        gte(companyChecklists.date, sql`${startStr}::date`),
        lte(companyChecklists.date, sql`${endStr}::date`),
      );

  const assignWhere = assetId
    ? and(
        eq(companyAssignments.companyId, companyId),
        eq(companyAssignments.assetId, assetId),
        eq(companyAssignments.status, "Activa"),
      )
    : and(
        eq(companyAssignments.companyId, companyId),
        eq(companyAssignments.status, "Activa"),
      );

  // ── Queries en paralelo ─────────────────────────────────────────
  const [assets, alerts, maints, fuels, checks, activeAssigns] =
    await Promise.all([
      // 1) Activos de la empresa (filtrado si hay assetId)
      db
        .select({
          id:    companyAssets.id,
          plate: companyAssets.plate,
          name:  companyAssets.name,
        })
        .from(companyAssets)
        .where(assetWhere),

      // 2) Alertas abiertas
      db
        .select({
          assetId:  companyAlerts.assetId,
          type:     companyAlerts.type,
          severity: companyAlerts.severity,
          status:   companyAlerts.status,
        })
        .from(companyAlerts)
        .where(and(alertWhere, eq(companyAlerts.status, "Abierta"))),

      // 3) Mantenimientos del período
      db
        .select({
          assetId:  companyMaintenanceRecords.assetId,
          type:     companyMaintenanceRecords.type,
          status:   companyMaintenanceRecords.status,
          driverId: companyMaintenanceRecords.assignedUserId,
        })
        .from(companyMaintenanceRecords)
        .where(maintWhere),

      // 4) Combustible del período
      db
        .select({
          assetId:  companyFuelEntries.assetId,
          driverId: companyFuelEntries.driverId,
          gallons:  companyFuelEntries.gallons,
          cost:     companyFuelEntries.cost,
        })
        .from(companyFuelEntries)
        .where(fuelWhere),

      // 5) Checklists del período
      db
        .select({
          assetId:  companyChecklists.assetId,
          driverId: companyChecklists.driverId,
          status:   companyChecklists.status,
          findings: companyChecklists.findings,
        })
        .from(companyChecklists)
        .where(checkWhere),

      // 6) Asignaciones activas (para saber el conductor actual de cada vehículo)
      db
        .select({
          assetId:  companyAssignments.assetId,
          driverId: companyAssignments.driverId,
        })
        .from(companyAssignments)
        .where(assignWhere),
    ]);

  // ── Obtener nombres de conductores ──────────────────────────────
  const driverIds = [
    ...new Set([
      ...fuels.map((f) => f.driverId).filter(Boolean),
      ...checks.map((c) => c.driverId).filter(Boolean),
      ...activeAssigns.map((a) => a.driverId),
    ]),
  ] as number[];

  const driverRows =
    driverIds.length > 0
      ? await db
          .select({
            id:        companyDrivers.id,
            firstName: companyDrivers.firstName,
            lastName:  companyDrivers.lastName,
          })
          .from(companyDrivers)
          .where(
            and(
              eq(companyDrivers.companyId, companyId),
              inArray(companyDrivers.id, driverIds),
            ),
          )
      : [];

  const driverMap = new Map(
    driverRows.map((d) => [d.id, `${d.firstName} ${d.lastName}`.trim()]),
  );

  // Mapa assetId → conductor activo
  const activeDriverMap = new Map(
    activeAssigns.map((a) => [a.assetId, driverMap.get(a.driverId) ?? null]),
  );

  // ── Construir señales por vehículo ──────────────────────────────
  const assetSignals: AssetSignal[] = assets.map((a) => {
    const myAlerts = alerts.filter((al) => al.assetId === a.id);
    const myMaints = maints.filter((m) => m.assetId === a.id);
    const myFuels  = fuels.filter((f) => f.assetId === a.id);
    const myChecks = checks.filter((c) => c.assetId === a.id);

    return {
      assetId:   a.id,
      plate:     a.plate,
      name:      a.name,
      openAlerts: myAlerts.map((al) => ({ type: al.type, severity: al.severity })),
      correctivos: myMaints.filter((m) => m.type === "Correctivo").length,
      preventivos: myMaints.filter(
        (m) => m.type === "Programado" && m.status === "Completado",
      ).length,
      fuelGallons: myFuels.reduce((s, f) => s + Number(f.gallons ?? 0), 0),
      fuelCost:   myFuels.reduce((s, f) => s + Number(f.cost   ?? 0), 0),
      checklistsConFindings: myChecks.filter(
        (c) => c.status === "Completado" && c.findings && String(c.findings).trim().length > 0,
      ).length,
      activeDriver: activeDriverMap.get(a.id) ?? null,
    };
  });

  // ── Construir señales por conductor ─────────────────────────────
  // Filtramos por driverId si hay filtro activo
  const targetDriverIds =
    driverId
      ? [driverId]
      : [...new Set([
          ...fuels.map((f) => f.driverId).filter(Boolean),
          ...checks.map((c) => c.driverId).filter(Boolean),
        ])] as number[];

  // Mapa assetId → correctivos (para cruzar con conductores via fuel)
  const correctivosByAsset = new Map<number, number>();
  for (const m of maints) {
    if (m.type === "Correctivo") {
      correctivosByAsset.set(m.assetId, (correctivosByAsset.get(m.assetId) ?? 0) + 1);
    }
  }

  const driverSignals: DriverSignal[] = targetDriverIds
    .map((did) => {
      const name = driverMap.get(did) ?? `Conductor ${did}`;
      const myFuels  = fuels.filter((f) => f.driverId === did);
      const myChecks = checks.filter((c) => c.driverId === did);

      const vehiculosSet = new Set(myFuels.map((f) => f.assetId));
      const correctivosTotal = [...vehiculosSet].reduce(
        (s, aid) => s + (correctivosByAsset.get(aid) ?? 0),
        0,
      );

      return {
        driverId:              did,
        name,
        fuelGallons:           myFuels.reduce((s, f) => s + Number(f.gallons ?? 0), 0),
        fuelCost:              myFuels.reduce((s, f) => s + Number(f.cost   ?? 0), 0),
        correctivosEnPeriodo:  correctivosTotal,
        checklistsCompletados: myChecks.filter((c) => c.status === "Completado").length,
        vehiculosDistintos:    vehiculosSet.size,
      };
    })
    .filter((d) => d.fuelGallons > 0 || d.checklistsCompletados > 0 || d.correctivosEnPeriodo > 0);

  // ── Totales empresa ─────────────────────────────────────────────
  const totals = {
    openAlerts:  alerts.length,
    correctivos: maints.filter((m) => m.type === "Correctivo").length,
    fuelGallons: fuels.reduce((s, f) => s + Number(f.gallons ?? 0), 0),
    fuelCost:    fuels.reduce((s, f) => s + Number(f.cost   ?? 0), 0),
  };

  return {
    periodoDesde: startStr,
    periodoHasta: endStr,
    assets:  assetSignals,
    drivers: driverSignals,
    totals,
  };
}   