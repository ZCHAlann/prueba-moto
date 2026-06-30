// lib/canvas-combined.ts
// ─────────────────────────────────────────────────────────────────────────────
// Combina datos de DOS módulos del lienzo en una sola respuesta, agregados
// por entidad (asset o driver). El resultado se usa para renderizar un
// "grouped bar" o "side-by-side" en widgets de tipo chart.
//
// Ejemplo: modulo='combustible' + secondaryModulo='mantenimiento' +
//           scope='varios' + entityKind='asset'
//   → por cada vehículo, total de costo de combustible vs total de costo
//     de mantenimiento. Cada módulo devuelve su serie.
//
// Cada módulo expone un "aggregator" que toma los registros y devuelve
// Map<entityId, number> (suma de la métrica principal).
// ─────────────────────────────────────────────────────────────────────────────

import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../db/client";
import {
  companyAssets,
  companyDrivers,
  companyFuelEntries,
  companyMaintenanceRecords,
  companyTollEntries,
  companyAlerts,
  companyChecklists,
  companyInsurancePolicies,
  companyAssignments,
  companyAcServices,
} from "../db/schema/operational";

export type CombinedModulo = {
  modulo: string;
  label: string;
  unidad: string;
  /** Color hex sugerido para la serie en el chart. */
  color: string;
};

const MODULOS_COMBINABLES: Record<string, CombinedModulo> = {
  combustible:   { modulo: "combustible",   label: "Combustible",    unidad: "$",        color: "#f97316" },
  mantenimiento: { modulo: "mantenimiento", label: "Mantenimiento",  unidad: "$",        color: "#f59e0b" },
  peajes:        { modulo: "peajes",        label: "Peajes",         unidad: "$",        color: "#a855f7" },
  alertas:       { modulo: "alertas",       label: "Alertas",        unidad: " registros", color: "#f43f5e" },
  checklists:    { modulo: "checklists",    label: "Checklists",     unidad: " inspecciones", color: "#06b6d4" },
  flotas:        { modulo: "flotas",        label: "Vehículos",      unidad: " km",      color: "#3b82f6" },
  seguros:       { modulo: "seguros",       label: "Seguros",        unidad: " pólizas", color: "#6366f1" },
  asignaciones:  { modulo: "asignaciones",  label: "Asignaciones",   unidad: " registros", color: "#10b981" },
  ac:            { modulo: "ac",            label: "A/C",            unidad: "$",        color: "#14b8a6" },
  conductores:   { modulo: "conductores",   label: "Conductores",    unidad: "",         color: "#8b5cf6" },
};

export type CombinedSeries = {
  modulo: string;
  label:  string;
  unidad: string;
  color: string;
  /** entityId → valor agregado. */
  data:   Array<{ entityId: number; value: number }>;
};

export type CombinedResponse = {
  entities:    Array<{ id: number; label: string; sublabel: string | null }>;
  series:      CombinedSeries[];
  /** Total combinado por entidad (suma de todas las series). Útil para ordenar. */
  totals:      Array<{ entityId: number; value: number }>;
  /** módulo principal vs secundario (informativo para el cliente) */
  primary:     string;
  secondary:   string;
};

export type CombinedInput = {
  companyId:    number;
  modulo:       string;
  secondaryModulo: string;
  scope:        "todos" | "uno" | "varios";
  entityKind:   "asset" | "driver" | null;
  entityIds:    number[];
  fechaDesde:   string;
  fechaHasta:   string;
};

// ─── Aggregators por módulo ─────────────────────────────────────────────────

type AggFn = (companyId: number, fechaDesde: string, fechaHasta: string, entityFilter: number[] | null) => Promise<Map<number, number>>;

const aggregators: Record<string, AggFn> = {
  combustible: async (companyId, desde, hasta, ids) => {
    const conds = [
      eq(companyFuelEntries.companyId, companyId),
      gte(companyFuelEntries.date, desde),
      lte(companyFuelEntries.date, hasta),
    ];
    if (ids && ids.length > 0) conds.push(inArray(companyFuelEntries.assetId, ids));
    const rows = await db
      .select({ assetId: companyFuelEntries.assetId, cost: companyFuelEntries.cost })
      .from(companyFuelEntries)
      .where(and(...conds));
    const m = new Map<number, number>();
    for (const r of rows) {
      const v = r.cost != null ? Number(r.cost) : 0;
      m.set(r.assetId, (m.get(r.assetId) ?? 0) + v);
    }
    return m;
  },

  mantenimiento: async (companyId, desde, hasta, ids) => {
    const conds = [
      eq(companyMaintenanceRecords.companyId, companyId),
      gte(companyMaintenanceRecords.scheduledFor, desde),
      lte(companyMaintenanceRecords.scheduledFor, hasta),
    ];
    if (ids && ids.length > 0) conds.push(inArray(companyMaintenanceRecords.assetId, ids));
    const rows = await db
      .select({ assetId: companyMaintenanceRecords.assetId, totalCost: companyMaintenanceRecords.totalCost })
      .from(companyMaintenanceRecords)
      .where(and(...conds));
    const m = new Map<number, number>();
    for (const r of rows) {
      const v = r.totalCost != null ? Number(r.totalCost) : 0;
      m.set(r.assetId, (m.get(r.assetId) ?? 0) + v);
    }
    return m;
  },

  peajes: async (companyId, desde, hasta, ids) => {
    const conds = [
      eq(companyTollEntries.companyId, companyId),
      gte(companyTollEntries.date, desde),
      lte(companyTollEntries.date, hasta),
    ];
    if (ids && ids.length > 0) conds.push(inArray(companyTollEntries.assetId, ids));
    const rows = await db
      .select({ assetId: companyTollEntries.assetId, amount: companyTollEntries.amount })
      .from(companyTollEntries)
      .where(and(...conds));
    const m = new Map<number, number>();
    for (const r of rows) {
      const v = r.amount != null ? Number(r.amount) : 0;
      m.set(r.assetId, (m.get(r.assetId) ?? 0) + v);
    }
    return m;
  },

  alertas: async (companyId, desde, hasta, ids) => {
    // Alerts: usamos assetId cuando existe, sino null (no entra al ranking).
    const conds = [
      eq(companyAlerts.companyId, companyId),
      gte(companyAlerts.createdAt, desde as unknown as Date),
      lte(companyAlerts.createdAt, hasta as unknown as Date),
    ];
    const rows = await db
      .select({ assetId: companyAlerts.assetId })
      .from(companyAlerts)
      .where(and(...conds));
    const m = new Map<number, number>();
    for (const r of rows) {
      if (r.assetId == null) continue;
      if (ids && ids.length > 0 && !ids.includes(r.assetId)) continue;
      m.set(r.assetId, (m.get(r.assetId) ?? 0) + 1);
    }
    return m;
  },

  checklists: async (companyId, desde, hasta, ids) => {
    const conds = [
      eq(companyChecklists.companyId, companyId),
      gte(companyChecklists.date, desde),
      lte(companyChecklists.date, hasta),
    ];
    if (ids && ids.length > 0) conds.push(inArray(companyChecklists.assetId, ids));
    const rows = await db
      .select({ assetId: companyChecklists.assetId })
      .from(companyChecklists)
      .where(and(...conds));
    const m = new Map<number, number>();
    for (const r of rows) {
      if (r.assetId == null) continue;
      m.set(r.assetId, (m.get(r.assetId) ?? 0) + 1);
    }
    return m;
  },

  flotas: async (companyId, _desde, _hasta, ids) => {
    // Para flotas: km actual del activo (no por período).
    const conds = [eq(companyAssets.companyId, companyId)];
    if (ids && ids.length > 0) conds.push(inArray(companyAssets.id, ids));
    const rows = await db
      .select({ id: companyAssets.id, km: companyAssets.km })
      .from(companyAssets)
      .where(and(...conds));
    const m = new Map<number, number>();
    for (const r of rows) m.set(r.id, r.km != null ? Number(r.km) : 0);
    return m;
  },

  seguros: async (companyId, desde, hasta, ids) => {
    // Pólizas vigentes en el rango.
    const conds = [
      eq(companyInsurancePolicies.companyId, companyId),
      lte(companyInsurancePolicies.startDate, hasta),
    ];
    if (ids && ids.length > 0) conds.push(inArray(companyInsurancePolicies.assetId, ids));
    const rows = await db
      .select({ assetId: companyInsurancePolicies.assetId, endDate: companyInsurancePolicies.endDate })
      .from(companyInsurancePolicies)
      .where(and(...conds));
    const m = new Map<number, number>();
    for (const r of rows) {
      // Solo contar si NO venció antes del rango.
      if (r.endDate && r.endDate < desde) continue;
      m.set(r.assetId, (m.get(r.assetId) ?? 0) + 1);
    }
    return m;
  },

  asignaciones: async (companyId, desde, hasta, ids) => {
    const conds = [
      eq(companyAssignments.companyId, companyId),
    ];
    if (ids && ids.length > 0) conds.push(inArray(companyAssignments.assetId, ids));
    const rows = await db
      .select({ assetId: companyAssignments.assetId, startDate: companyAssignments.startDate, endDate: companyAssignments.endDate })
      .from(companyAssignments)
      .where(and(...conds));
    const m = new Map<number, number>();
    for (const r of rows) {
      // Activas o que se solapan con el rango.
      if (r.startDate > hasta) continue;
      if (r.endDate && r.endDate < desde) continue;
      m.set(r.assetId, (m.get(r.assetId) ?? 0) + 1);
    }
    return m;
  },

  ac: async (companyId, desde, hasta, ids) => {
    // Servicios A/C en el rango (costo total).
    const conds = [
      eq(companyAcServices.companyId, companyId),
      gte(companyAcServices.date, desde),
      lte(companyAcServices.date, hasta),
    ];
    const rows = await db
      .select({ unitId: companyAcServices.unitId, cost: companyAcServices.cost })
      .from(companyAcServices)
      .where(and(...conds));
    // Para A/C la "entidad" es unitId (no assetId). El frontend probablemente
    // no mezcle A/C con módulos de vehículos en combined, pero soportamos.
    const m = new Map<number, number>();
    for (const r of rows) {
      const v = r.cost != null ? Number(r.cost) : 0;
      m.set(r.unitId, (m.get(r.unitId) ?? 0) + v);
    }
    return m;
  },

  // conductores no aplica como "métrica agregada por entidad" porque las
  // entidades SON conductores. Devolvemos map vacío; el frontend lo ignora.
  conductores: async () => new Map<number, number>(),
};

// ─── Función principal ─────────────────────────────────────────────────────

export async function fetchCombinedEntityData(input: CombinedInput): Promise<CombinedResponse> {
  const primaryModulo   = input.modulo;
  const secondaryModulo = input.secondaryModulo;
  const entityKind = input.entityKind ?? "asset";
  const filterIds = input.scope === "todos" ? null : input.entityIds;

  // Determinar universo de entidades (todas las del scope o las elegidas).
  const entityMap = await resolveEntities(input.companyId, entityKind, filterIds);

  // Aggregators de los dos módulos en paralelo.
  const [primaryMap, secondaryMap] = await Promise.all([
    runAggregator(primaryModulo,   input.companyId, input.fechaDesde, input.fechaHasta, filterIds),
    runAggregator(secondaryModulo, input.companyId, input.fechaDesde, input.fechaHasta, filterIds),
  ]);

  // Construir respuesta. entities está ordenado por total combinado desc.
  const entities = Array.from(entityMap.values());
  const totalsMap = new Map<number, number>();
  for (const e of entities) {
    const p = primaryMap.get(e.id) ?? 0;
    const s = secondaryMap.get(e.id) ?? 0;
    totalsMap.set(e.id, p + s);
  }
  entities.sort((a, b) => (totalsMap.get(b.id) ?? 0) - (totalsMap.get(a.id) ?? 0));

  const primaryDef   = MODULOS_COMBINABLES[primaryModulo];
  const secondaryDef = MODULOS_COMBINABLES[secondaryModulo];

  return {
    entities: entities.map((e) => ({ id: e.id, label: e.label, sublabel: e.sublabel })),
    series: [
      {
        modulo: primaryModulo,
        label:  primaryDef?.label   ?? primaryModulo,
        unidad: primaryDef?.unidad  ?? "",
        color:  primaryDef?.color   ?? "#3b82f6",
        data:   entities.map((e) => ({ entityId: e.id, value: primaryMap.get(e.id) ?? 0 })),
      },
      {
        modulo: secondaryModulo,
        label:  secondaryDef?.label   ?? secondaryModulo,
        unidad: secondaryDef?.unidad  ?? "",
        color:  secondaryDef?.color   ?? "#f59e0b",
        data:   entities.map((e) => ({ entityId: e.id, value: secondaryMap.get(e.id) ?? 0 })),
      },
    ],
    totals:    entities.map((e) => ({ entityId: e.id, value: totalsMap.get(e.id) ?? 0 })),
    primary:   primaryModulo,
    secondary: secondaryModulo,
  };
}

async function runAggregator(
  modulo: string,
  companyId: number,
  desde: string,
  hasta: string,
  filterIds: number[] | null,
): Promise<Map<number, number>> {
  const fn = aggregators[modulo];
  if (!fn) return new Map();
  return fn(companyId, desde, hasta, filterIds);
}

async function resolveEntities(
  companyId: number,
  entityKind: "asset" | "driver",
  filterIds: number[] | null,
): Promise<Array<{ id: number; label: string; sublabel: string | null }>> {
  if (entityKind === "asset") {
    const conds = [eq(companyAssets.companyId, companyId)];
    if (filterIds && filterIds.length > 0) conds.push(inArray(companyAssets.id, filterIds));
    const rows = await db
      .select({ id: companyAssets.id, plate: companyAssets.plate, name: companyAssets.name })
      .from(companyAssets)
      .where(and(...conds));
    return rows.map((r) => ({
      id: r.id,
      label: r.plate || r.name || `asset-${r.id}`,
      sublabel: r.plate ? r.name : null,
    }));
  }
  const conds = [eq(companyDrivers.companyId, companyId)];
  if (filterIds && filterIds.length > 0) conds.push(inArray(companyDrivers.id, filterIds));
  const rows = await db
    .select({ id: companyDrivers.id, firstName: companyDrivers.firstName, lastName: companyDrivers.lastName, code: companyDrivers.code })
    .from(companyDrivers)
    .where(and(...conds));
  return rows.map((r) => ({
    id: r.id,
    label: `${r.firstName} ${r.lastName}`.trim() || r.code || `driver-${r.id}`,
    sublabel: r.code,
  }));
}