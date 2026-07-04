// lib/stats-multi.ts
// ─────────────────────────────────────────────────────────────────────
// Cálculo multi-rango para Estadísticas.
//
// Recibe N rangos {desde, hasta, label} y los procesa en paralelo
// (un calculator por cada uno). Devuelve una respuesta agregada donde:
//
//   - kpis:        Array<{ label, porRango: { [rangoId]: { valor, unidad, variacionPct } } }>
//   - lineChart:   misma serie de buckets, una línea por rango (key = bucket, value = valor)
//   - comparacion: matriz rango × módulo_categoría
//   - barV:        una entrada por rango, con valores por bucket
//   - barH:        top N elementos con valores por rango
//   - anomalias:   lista plana de anomalías detectadas en cada rango
//
// Privacidad: la query SQL sigue siendo por rango, igual que antes; solo
// orquestamos en paralelo.
// ─────────────────────────────────────────────────────────────────────

import { calculateMantenimiento } from "../routes/company/stats/mantenimiento";
import { calculateCombustible }   from "../routes/company/stats/combustible";
import { calculateFlotas }        from "../routes/company/stats/flotas";
import { calculateConductores }   from "../routes/company/stats/conductores";
import { calculateChecklists }    from "../routes/company/stats/checklists";
import { calculateAlertas }       from "../routes/company/stats/alertas";
import { calculateAc }            from "../routes/company/stats/ac";
import { calculateSeguros }       from "../routes/company/stats/seguros";
import { calculatePeajes }        from "../routes/company/stats/peajes";
import { calculateAsignaciones }  from "../routes/company/stats/asignaciones";
import type { StatInput, StatResult, KpiItem, LinePoint, BarPoint, BarHPoint, BarCompItem, RadarPoint, AnomaliaItem, Periodo } from "../routes/company/stats/mantenimiento";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { db } from "../db/client";
import { companyStatsAnomalies } from "../db/schema/operational";

// ─── Tipos públicos ────────────────────────────────────────────

export type Rango = {
  id:        string;         // uuid corto
  label:     string;         // ej. "Q1 2025"
  desde:     string;         // YYYY-MM-DD
  hasta:     string;         // YYYY-MM-DD
};

export type MultiKpiValue = {
  valor:        number | string;
  unidad?:       string;
  variacionPct?: number;
};

export type MultiKpi = {
  label:     string;
  icono?:    string;
  porRango:  Record<string, MultiKpiValue>;  // rangoId → value
};

export type MultiLinePoint = {
  x:       string;            // bucket
  [rangoId: string]: number | string | undefined;
};

export type MultiBarVBar = {
  rangoId:  string;
  label:    string;            // bucket (categoría)
  value:    number;
};

export type MultiBarH = {
  label:   string;
  [rangoId: string]: number | string | undefined;
};

export type MultiAnomalia = {
  rangoId:        string;
  id?:            number;
  tipo:           string;
  dimension:      string;
  dimensionLabel: string;
  severidad:      "baja" | "media" | "alta";
  descripcion:    string;
  detectadoEn?:   string;
};

export type MultiResponse = {
  modulo:         string;
  periodo:        Periodo;          // granularidad de los buckets (month/quarter/year)
  rangos:         Rango[];
  kpis:           MultiKpi[];
  lineChart:      { title: string; unidad: string; data: MultiLinePoint[]; regresion: number | null };
  barVChart:      { title: string; unidad: string; data: Array<{ x: string } & Record<string, number>> };
  barHChart:      { title: string; unidad: string; data: MultiBarH[] };
  comparacionChart:{ title: string; data: Array<{ label: string } & Record<string, number | string>> };
  anomalias:      MultiAnomalia[];
  warnings:       string[];          // ej. "se omitió el exponencial chart por N>3"
};

// ─── Dispatcher por módulo (espejo del endpoint principal) ────

const MODULOS_VALIDOS = [
  "mantenimiento", "combustible", "flotas", "conductores",
  "checklists", "alertas", "ac", "seguros",
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
    case "ac":            return calculateAc;
    case "seguros":       return calculateSeguros;
    case "peajes":        return calculatePeajes;
    case "asignaciones":  return calculateAsignaciones;
  }
}

// ─── Función principal ────────────────────────────────────────

export type MultiOpts = {
  companyId:   number;
  modulo:      string;
  periodo:     Periodo;
  rangos:      Rango[];
  assetId?:    number | null;
  driverId?:   number | null;
};

const MAX_RANGOS_LIGHT = 3;

export async function calculateMulti(opts: MultiOpts): Promise<MultiResponse> {
  const warnings: string[] = [];

  if (opts.rangos.length > MAX_RANGOS_LIGHT) {
    warnings.push(`Con más de ${MAX_RANGOS_LIGHT} rangos el exponencial chart y el radar se omiten para no penalizar la latencia.`);
  }

  // 1) Calcular cada rango en paralelo
  const calc = calculatorFor(opts.modulo as ModuloKey);
  const perRango: Array<{ rango: Rango; data: StatResult }> = await Promise.all(
    opts.rangos.map(async (r) => ({
      rango: r,
      data: await calc({
        companyId: opts.companyId,
        periodo:   opts.periodo,
        refDate:   new Date(r.desde),
        endDate:   new Date(r.hasta),
        assetId:   opts.assetId,
        driverId:  opts.driverId,
      }),
    })),
  );

  // 2) KPIs — los 4 KPIs del calculator, una columna por rango
  const kpiLabels = perRango[0]?.data.kpis.map((k) => k.label) ?? [];
  const kpis: MultiKpi[] = kpiLabels.map((label, idx) => {
    const icono = perRango[0]?.data.kpis[idx]?.icono;
    const unidad = perRango[0]?.data.kpis[idx]?.unidad;
    const porRango: Record<string, MultiKpiValue> = {};
    for (const { rango, data } of perRango) {
      const k = data.kpis[idx];
      if (!k) continue;
      porRango[rango.id] = {
        valor:        k.valor,
        unidad:       k.unidad,
        variacionPct: k.variacionPct,
      };
    }
    return { label, icono, porRango };
  });

  // 3) Line chart — merge por bucket; cada rango es una key
  const lineBuckets = new Set<string>();
  for (const { data } of perRango) {
    for (const p of data.lineChart.data) lineBuckets.add(p.x);
  }
  const lineSorted = Array.from(lineBuckets).sort();
  const lineChart = {
    title: perRango[0]?.data.lineChart.title ?? "Tendencia",
    unidad: perRango[0]?.data.lineChart.unidad ?? "",
    data: lineSorted.map((bucket) => {
      const point: MultiLinePoint = { x: bucket };
      for (const { rango, data } of perRango) {
        const found = data.lineChart.data.find((p) => p.x === bucket);
        point[rango.id] = found ? found.y : null;
      }
      return point;
    }),
    regresion: perRango.length === 1
      ? perRango[0]!.data.lineChart.regresion.slope
      : null,
  };

  // 4) BarV — top categorías union, una serie por rango
  //    Estructura: [{ x: "Cat", [rango1]: 10, [rango2]: 20 }, ...]
  const barVCategories = new Set<string>();
  for (const { data } of perRango) {
    for (const p of data.barVChart.data) barVCategories.add(p.x);
  }
  const barVData = Array.from(barVCategories).map((cat) => {
    const row: { x: string } & Record<string, number> = { x: cat };
    for (const { rango, data } of perRango) {
      const found = data.barVChart.data.find((p) => p.x === cat);
      row[rango.id] = found ? found.y : 0;
    }
    return row;
  });

  // 5) BarH — top 10 union, una columna por rango
  const barHItems = new Map<string, MultiBarH>();
  for (const { rango, data } of perRango) {
    for (const p of data.barHChart.data) {
      if (!barHItems.has(p.label)) {
        barHItems.set(p.label, { label: p.label });
      }
      barHItems.get(p.label)![rango.id] = p.value;
    }
  }
  // Ordenar por suma de valores descendente, top 10
  const barHSorted = Array.from(barHItems.values())
    .map((row) => {
      const sum = opts.rangos.reduce((a, r) => a + (Number(row[r.id]) || 0), 0);
      return { row, sum };
    })
    .sort((a, b) => b.sum - a.sum)
    .slice(0, 10)
    .map((x) => x.row);

  // 6) Comparación — matrix label × rango
  const comparacionLabels = new Set<string>();
  for (const { data } of perRango) {
    for (const p of data.comparacionChart.data) comparacionLabels.add(p.label);
  }
  const comparacionData = Array.from(comparacionLabels).map((label) => {
    const row: { label: string } & Record<string, number | string> = { label };
    for (const { rango, data } of perRango) {
      const found = data.comparacionChart.data.find((p) => p.label === label);
      row[rango.id] = found ? found.actual : 0;
    }
    return row;
  });

  // 7) Anomalías — unir las de todos los rangos
  const anomalias: MultiAnomalia[] = [];
  for (const { rango, data } of perRango) {
    for (const a of data.anomalias) {
      anomalias.push({
        rangoId:        rango.id,
        id:             a.id,
        tipo:           a.tipo,
        dimension:      a.dimension,
        dimensionLabel: a.dimensionLabel,
        severidad:      a.severidad,
        descripcion:    a.descripcion,
        detectadoEn:    a.detectadoEn,
      });
    }
  }

  return {
    modulo:   opts.modulo,
    periodo:  opts.periodo,
    rangos:   opts.rangos,
    kpis,
    lineChart,
    barVChart: {
      title: perRango[0]?.data.barVChart.title ?? "Distribución",
      unidad: perRango[0]?.data.barVChart.unidad ?? "",
      data: barVData,
    },
    barHChart: {
      title: perRango[0]?.data.barHChart.title ?? "Top elementos",
      unidad: perRango[0]?.data.barHChart.unidad ?? "",
      data: barHSorted,
    },
    comparacionChart: {
      title: perRango[0]?.data.comparacionChart.title ?? "Comparación",
      data: comparacionData,
    },
    anomalias,
    warnings,
  };
}
