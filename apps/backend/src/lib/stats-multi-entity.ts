// lib/stats-multi-entity.ts
// ─────────────────────────────────────────────────────────────────────
// Cálculo multi-entidad para el Lienzo de Presentación.
//
// Recibe N entidades (assets o drivers) y procesa cada una en paralelo
// con el calculator del módulo. Devuelve un JSON agregado donde:
//
//   - kpis:        Array<{ label, porEntidad: { [entityId]: { valor, unidad, variacionPct } } }>
//   - lineChart:   misma serie de buckets, una línea por entidad
//   - barVChart:   una serie por entidad, categorías unión
//   - barHChart:   reemplazado por comparación por entidad (KPI principal en barras)
//   - radarChart:  un polígono por entidad superpuesto (Radars)
//   - exponencialChart: una serie por entidad
//   - comparacionChart: omitido — solo aplica a single-entity (actual vs anterior)
//
// Espejo estructural de calculateMulti (lib/stats-multi.ts) — sigue el
// mismo criterio del proyecto: archivo paralelo por preocupación, no
// refactor del existente.
// ─────────────────────────────────────────────────────────────────────

import { calculateMantenimiento } from "../routes/company/stats/mantenimiento";
import { calculateCombustible }   from "../routes/company/stats/combustible";
import { calculateFlotas }        from "../routes/company/stats/flotas";
import { calculateConductores }   from "../routes/company/stats/conductores";
import { calculateChecklists }    from "../routes/company/stats/checklists";
import { calculateAlertas }       from "../routes/company/stats/alertas";
import { calculateInventario }    from "../routes/company/stats/inventario";
import { calculateAc }            from "../routes/company/stats/ac";
import { calculateSeguros }       from "../routes/company/stats/seguros";
import { calculatePeajes }        from "../routes/company/stats/peajes";
import { calculateAsignaciones }  from "../routes/company/stats/asignaciones";
import type {
  StatInput, StatResult, KpiItem, LinePoint, BarPoint, BarHPoint, RadarPoint,
} from "../routes/company/stats/mantenimiento";
import type { Periodo } from "../lib/stats-math";
import { inArray } from "drizzle-orm";
import { db } from "../db/client";
import { companyAssets, companyDrivers } from "../db/schema/operational";

// ─── Tipos públicos ─────────────────────────────────────────────

export type EntityKind = "asset" | "driver";

export type EntityRef = {
  id:        number;
  label:     string;       // "ABC-1234" para asset, "Juan Pérez" para driver
  sublabel?: string | null;
  color:     string;       // color hex asignado al widget
};

export type MultiEntityKpi = {
  label:   string;
  icono?:  string;
  unidad?: string;
  porEntidad: Record<string /* entityId */, {
    valor:        number | string;
    unidad?:       string;
    variacionPct?: number;
  }>;
};

export type MultiEntityLinePoint = {
  x: string;
  [entityId: string]: number | string | null | undefined;
};

export type MultiEntityResponse = {
  modulo:          string;
  periodo:         Periodo;
  entityKind:      EntityKind;
  entidades:       EntityRef[];                    // [{id, label, color}, ...]
  kpis:            MultiEntityKpi[];
  lineChart:       { title: string; unidad: string; data: MultiEntityLinePoint[] };
  barVChart:       { title: string; unidad: string; data: MultiEntityLinePoint[] };
  barHChart:       { title: string; unidad: string; data: Array<{ name: string; value: number; meta?: string }> };
  radarChart:      { title: string; data: RadarPoint[]; /** series (uno por entidad, mismo axis) */
                    series: Array<{ entityId: number; name: string; color: string; data: RadarPoint[] }> };
  exponencialChart:{ title: string; unidad: string; data: MultiEntityLinePoint[] };
  warnings:        string[];
};

const MAX_ENTIDADES = 6;
const COLORS = ["#3b82f6","#10b981","#f97316","#8b5cf6","#f43f5e","#06b6d4"];

// ─── Dispatcher por módulo (mismo que stats-multi.ts) ────────

const MODULOS_VALIDOS = [
  "mantenimiento", "combustible", "flotas", "conductores",
  "checklists", "alertas", "inventario", "ac", "seguros",
  "peajes", "asignaciones",
] as const;

type ModuloKey = (typeof MODULOS_VALIDOS)[number];

function calculatorFor(modulo: ModuloKey) {
  switch (modulo) {
    case "mantenimiento": return calculateMantenimiento;
    case "combustible":   return calculateCombustible;
    case "flotas":        return calculateFlotas;
    case "conductores":   return calculateConductores;
    case "checklists":    return calculateChecklists;
    case "alertas":       return calculateAlertas;
    case "inventario":    return calculateInventario;
    case "ac":            return calculateAc;
    case "seguros":       return calculateSeguros;
    case "peajes":        return calculatePeajes;
    case "asignaciones":  return calculateAsignaciones;
  }
}

// ─── Función principal ────────────────────────────────────────

export type MultiEntityOpts = {
  companyId:   number;
  modulo:      string;
  periodo:     Periodo;
  desde:       string;            // YYYY-MM-DD
  hasta:       string;
  entityKind:  EntityKind;
  entityIds:   number[];
};

export async function calculateMultiEntity(opts: MultiEntityOpts): Promise<MultiEntityResponse> {
  const warnings: string[] = [];

  if (opts.entityIds.length === 0) {
    return {
      modulo: opts.modulo,
      periodo: opts.periodo,
      entityKind: opts.entityKind,
      entidades: [],
      kpis: [],
      lineChart:    { title: "", unidad: "", data: [] },
      barVChart:    { title: "", unidad: "", data: [] },
      barHChart:    { title: "", unidad: "", data: [] },
      radarChart:   { title: "", data: [], series: [] },
      exponencialChart: { title: "", unidad: "", data: [] },
      warnings: ["Sin entidades para comparar."],
    };
  }

  if (opts.entityIds.length > MAX_ENTIDADES) {
    warnings.push(`Con más de ${MAX_ENTIDADES} entidades el radar puede saturarse; te recomendamos fewer combinaciones.`);
  }

  // 1) Resolver labels en un solo batch query
  const entidades = await resolveEntityRefs(opts.companyId, opts.entityKind, opts.entityIds);

  // 2) Calcular cada entidad en paralelo
  const calc = calculatorFor(opts.modulo as ModuloKey);
  const perEntity: Array<{ id: number; data: StatResult }> = await Promise.all(
    opts.entityIds.map(async (id) => ({
      id,
      data: await calc({
        companyId: opts.companyId,
        periodo:   opts.periodo,
        refDate:   new Date(opts.desde),
        endDate:   new Date(opts.hasta),
        assetId:   opts.entityKind === "asset"  ? id : null,
        driverId:  opts.entityKind === "driver" ? id : null,
      } as StatInput),
    })),
  );

  // ─── Merge ─────────────────────────────────────────────────────────────

  // KPIs — los 4 KPIs del calculator, una columna por entidad
  const kpiLabels = perEntity[0]?.data.kpis.map((k) => k.label) ?? [];
  const kpis: MultiEntityKpi[] = kpiLabels.map((label, idx) => {
    const icono = perEntity[0]?.data.kpis[idx]?.icono;
    const unidad = perEntity[0]?.data.kpis[idx]?.unidad;
    const porEntidad: MultiEntityKpi["porEntidad"] = {};
    for (const { id, data } of perEntity) {
      const k = data.kpis[idx];
      if (!k) continue;
      porEntidad[String(id)] = {
        valor:        k.valor,
        unidad:       k.unidad,
        variacionPct: k.variacionPct,
      };
    }
    return { label, icono, unidad, porEntidad };
  });

  // lineChart — merge por bucket; cada entidad es una key
  const lineBuckets = new Set<string>();
  for (const { data } of perEntity) {
    for (const p of data.lineChart.data) lineBuckets.add(p.x);
  }
  const lineSorted = Array.from(lineBuckets).sort();
  const lineChart: MultiEntityResponse["lineChart"] = {
    title: perEntity[0]?.data.lineChart.title ?? "Tendencia",
    unidad: perEntity[0]?.data.lineChart.unidad ?? "",
    data: lineSorted.map((bucket) => {
      const point: MultiEntityLinePoint = { x: bucket };
      for (const { id, data } of perEntity) {
        const found = data.lineChart.data.find((p) => p.x === bucket);
        point[String(id)] = found ? found.y : null;
      }
      return point;
    }),
  };

  // barVChart — categorías unión, una columna por entidad
  const barVBuckets = new Set<string>();
  for (const { data } of perEntity) {
    for (const p of data.barVChart.data) barVBuckets.add(p.x);
  }
  const barVChart: MultiEntityResponse["barVChart"] = {
    title: perEntity[0]?.data.barVChart.title ?? "Distribución",
    unidad: perEntity[0]?.data.barVChart.unidad ?? "",
    data: Array.from(barVBuckets).map((bucket) => {
      const row: MultiEntityLinePoint = { x: bucket };
      for (const { id, data } of perEntity) {
        const found = data.barVChart.data.find((p) => p.x === bucket);
        row[String(id)] = found ? found.y : 0;
      }
      return row;
    }),
  };

  // exponencialChart — mismo merge que lineChart pero sobre exponencial
  const expBuckets = new Set<string>();
  for (const { data } of perEntity) {
    for (const p of data.exponencialChart.data) expBuckets.add(p.x);
  }
  const exponencialChart: MultiEntityResponse["exponencialChart"] = {
    title: perEntity[0]?.data.exponencialChart.title ?? "Crecimiento",
    unidad: perEntity[0]?.data.exponencialChart.unidad ?? "",
    data: Array.from(expBuckets).sort().map((bucket) => {
      const point: MultiEntityLinePoint = { x: bucket };
      for (const { id, data } of perEntity) {
        const found = data.exponencialChart.data.find((p) => p.x === bucket);
        point[String(id)] = found ? found.y : null;
      }
      return point;
    }),
  };

  // barHChart — para multi-entidad, comparamos el KPI PRINCIPAL (índice 0)
  // entre entidades en una sola barra horizontal por entidad.
  const mainKpi = perEntity[0]?.data.kpis[0];
  const barHChart: MultiEntityResponse["barHChart"] = {
    title: mainKpi ? `${mainKpi.label}` : "Comparación por entidad",
    unidad: mainKpi?.unidad ?? "",
    data: perEntity.map(({ id, data }, i) => {
      const ent = entidades.find((e) => e.id === id);
      const v = data.kpis[0]?.valor;
      return {
        name: ent?.label ?? `Entidad ${id}`,
        value: typeof v === "number" ? v : 0,
        meta: ent?.color ?? COLORS[i % COLORS.length],
      };
    }),
  };

  // radarChart — un polígono por entidad superpuesto. Si el módulo no devuelve
  // radar (algunos calculators no lo usan), series queda vacío.
  const hasRadar = perEntity.some(({ data }) => data.radarChart.data.length > 0);
  const radarChart: MultiEntityResponse["radarChart"] = hasRadar ? {
    title: perEntity[0]?.data.radarChart.title ?? "Radar",
    data: perEntity[0]?.data.radarChart.data ?? [],
    series: perEntity.map(({ id, data }, i) => {
      const ent = entidades.find((e) => e.id === id);
      return {
        entityId: id,
        name: ent?.label ?? `Entidad ${id}`,
        color: ent?.color ?? COLORS[i % COLORS.length],
        data: data.radarChart.data,
      };
    }),
  } : { title: "", data: [], series: [] };

  return {
    modulo: opts.modulo,
    periodo: opts.periodo,
    entityKind: opts.entityKind,
    entidades,
    kpis,
    lineChart,
    barVChart,
    barHChart,
    radarChart,
    exponencialChart,
    warnings,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────

/** Resuelve labels de N entidades en un solo batch query. */
async function resolveEntityRefs(
  companyId: number,
  kind: EntityKind,
  ids: number[],
): Promise<EntityRef[]> {
  if (kind === "asset") {
    const rows = await db
      .select({ id: companyAssets.id, name: companyAssets.name, plate: companyAssets.plate })
      .from(companyAssets)
      .where(inArray(companyAssets.id, ids));
    return ids.map((id, i) => {
      const r = rows.find((x) => x.id === id);
      const label = r?.plate ? `${r.name} · ${r.plate}` : (r?.name ?? `Activo #${id}`);
      return {
        id,
        label,
        sublabel: r?.plate ?? null,
        color: COLORS[i % COLORS.length],
      };
    });
  }
  // driver
  const rows = await db
    .select({ id: companyDrivers.id, firstName: companyDrivers.firstName, lastName: companyDrivers.lastName })
    .from(companyDrivers)
    .where(inArray(companyDrivers.id, ids));
  return ids.map((id, i) => {
    const r = rows.find((x) => x.id === id);
    const label = r ? `${r.firstName} ${r.lastName}`.trim() : `Conductor #${id}`;
    return {
      id,
      label,
      sublabel: null,
      color: COLORS[i % COLORS.length],
    };
  });
}