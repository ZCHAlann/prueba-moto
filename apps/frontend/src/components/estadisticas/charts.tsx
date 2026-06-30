"use client";

// ─────────────────────────────────────────────────────────────────────────────
// components/estadisticas/charts.tsx
//
// Componentes de chart compartidos entre EstadisticasTab y el Lienzo.
// Extraídos desde pages/Reports/EstadisticasTab.tsx sin cambiar implementación.
//
// Look & feel garantizado: el canvas de presentación muestra EXACTAMENTE los
// mismos charts que la pestaña de Estadísticas. Sin divergencia visual.
// ─────────────────────────────────────────────────────────────────────────────

import { useContext, createContext, ReactNode } from "react";
import {
  Area, AreaChart, Bar, BarChart, Line, LineChart,
  CartesianGrid, XAxis, YAxis,
  PolarAngleAxis, PolarGrid, Radar, RadarChart,
  LabelList, RadialBar, RadialBarChart,
  Pie, PieChart, Cell,
  ResponsiveContainer, Tooltip, Legend,
} from "recharts";
import { BarChart2, Sparkles } from "lucide-react";
import { AIInsightsContext } from "./AIInsightsContext";
import type { ChartRef } from "@/hooks/useEstadisticas";
import type {
  LinePoint, BarPoint, BarHPoint, RadarPoint, BarCompItem,
} from "@/hooks/useEstadisticas";

// ─── Paleta ─────────────────────────────────────────────────────────────────
// Colores fijos, independientes de CSS vars del tema (consistente con
// EstadisticasTab original).
export const CHART_PALETTE = {
  blue:    "#3b82f6",
  indigo:  "#6366f1",
  violet:  "#8b5cf6",
  orange:  "#f97316",
  amber:   "#f59e0b",
  emerald: "#10b981",
  teal:    "#14b8a6",
  rose:    "#f43f5e",
  cyan:    "#06b6d4",
  pink:    "#d946ef",
} as const;

// Secuencia para multi-serie / multi-categoría (barras y pie).
export const CHART_SEQ = [
  CHART_PALETTE.blue, CHART_PALETTE.emerald, CHART_PALETTE.orange,
  CHART_PALETTE.violet, CHART_PALETTE.rose,    CHART_PALETTE.cyan,
  CHART_PALETTE.amber, CHART_PALETTE.teal,    CHART_PALETTE.indigo,
  CHART_PALETTE.pink,
];

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Formateador numérico localizado (es-EC). */
export function fmtNumber(v: number, dec = 0): string {
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("es-EC", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

/** Empty state compartido por todos los charts cuando no hay datos. */
export function ChartEmpty({ label = "Sin datos para este período" }: { label?: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2">
      <BarChart2 size={26} className="text-gray-300 dark:text-gray-600" />
      <p className="text-[12px] font-medium text-gray-400 dark:text-gray-500 text-center px-6 max-w-[200px]">{label}</p>
    </div>
  );
}

// ─── Hover Chart Ref Context ────────────────────────────────────────────────
// Pasa el chartRef actual hacia abajo al CustomTooltip para que pueda
// buscar la insight de IA correspondiente en AIInsightsContext.
//
// Es exportado para que EstadisticasTab lo provea a sus charts (igual que
// antes), y para que el canvas pueda proveerlo también si quiere insights
// en widgets.

export const HoverChartRefCtx = createContext<ChartRef | null>(null);
export function useHoverChartRef() { return useContext(HoverChartRefCtx); }
export function ChartHoverWrapper({ chartRef, children }: { chartRef: ChartRef; children: ReactNode }) {
  return <HoverChartRefCtx.Provider value={chartRef}>{children}</HoverChartRefCtx.Provider>;
}

/** Dedupe por label (suma actual + anterior). */
function dedupeComp(data: BarCompItem[]): BarCompItem[] {
  const seen = new Map<string, BarCompItem>();
  for (const d of data) {
    if (seen.has(d.label)) {
      const prev = seen.get(d.label)!;
      seen.set(d.label, { label: d.label, actual: prev.actual + d.actual, anterior: prev.anterior + d.anterior });
    } else {
      seen.set(d.label, { ...d });
    }
  }
  return Array.from(seen.values());
}

// ─── Tooltip personalizado ─────────────────────────────────────────────────

export type ChartTooltipProps = {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string;
  suffix?: string;
};

/** Tooltip usado por todos los charts. Soporta nota IA si hay chartRef en contexto. */
export function ChartTooltip({ active, payload, label: lbl, suffix = "" }: ChartTooltipProps) {
  const chartRef = useHoverChartRef();
  const ctx = useContext(AIInsightsContext);
  const aiNota = ctx && chartRef ? ctx.notaPara(chartRef) : null;

  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-gray-900 shadow-xl text-[12px] min-w-[160px] max-w-[260px] overflow-hidden">
      {lbl && (
        <div className="px-3 pt-2.5 pb-1.5 border-b border-gray-100 dark:border-white/6">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{lbl}</p>
        </div>
      )}
      <div className="px-3 py-2 space-y-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
              <span className="text-gray-500 dark:text-gray-400 text-[11px]">{p.name}</span>
            </div>
            <span className="font-bold tabular-nums text-gray-900 dark:text-white">
              {typeof p.value === "number" ? fmtNumber(p.value, 1) : p.value}{suffix}
            </span>
          </div>
        ))}
      </div>
      {aiNota && (
        <div className="px-3 pb-2.5 pt-1.5 border-t border-gray-100 dark:border-white/6">
          <div className="flex items-center gap-1 mb-1">
            <Sparkles size={9} className="flex-shrink-0" style={{ color: "#8b5cf6" }} />
            <p className="text-[10px] font-bold text-violet-600 dark:text-violet-400">{aiNota.titulo}</p>
          </div>
          <p className="text-[10.5px] text-gray-500 dark:text-gray-400 leading-relaxed">{aiNota.detalle}</p>
          {aiNota.tags && aiNota.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {aiNota.tags.slice(0, 3).map((t, i) => (
                <span key={i} className="rounded-full bg-violet-100 dark:bg-violet-500/20 px-1.5 py-0.5 text-[9px] font-medium text-violet-700 dark:text-violet-300">
                  {t}
                </span>
              ))}
            </div>
          )}
          {aiNota.recomendacion && (
            <p className="mt-1.5 text-[10px] text-amber-600 dark:text-amber-400 leading-relaxed italic">
              💡 {aiNota.recomendacion}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Componentes de chart ──────────────────────────────────────────────────

/** Area con gradiente y curva natural. */
export function AreaTendencia({ data, color, unidad = "" }: {
  data: LinePoint[]; color: string; unidad?: string;
}) {
  if (!data.length || data.every(d => d.y === 0)) return <ChartEmpty />;
  const gId = `at${color.replace(/[^a-z0-9]/gi,"")}`;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 6, right: 8, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id={gId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.55} />
            <stop offset="95%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 4" strokeOpacity={0.07} vertical={false} />
        <XAxis dataKey="x" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickMargin={8} minTickGap={20} />
        <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={36} />
        <Tooltip content={<ChartTooltip suffix={unidad ? ` ${unidad}` : ""} />} cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: "3 3", strokeOpacity: 0.4 }} />
        <Area dataKey="y" name={unidad || "valor"} type="natural" fill={`url(#${gId})`} stroke={color} strokeWidth={2.2} dot={false} activeDot={{ r: 4, fill: color, stroke: "#fff", strokeWidth: 2 }} isAnimationActive animationDuration={600} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Line con dots — para series puntuales. */
export function LineDots({ data, color, unidad = "" }: {
  data: LinePoint[]; color: string; unidad?: string;
}) {
  if (!data.length || data.every(d => d.y === 0)) return <ChartEmpty />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 6, right: 12, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 4" strokeOpacity={0.07} vertical={false} />
        <XAxis dataKey="x" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickMargin={8} minTickGap={20} />
        <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={36} />
        <Tooltip content={<ChartTooltip suffix={unidad ? ` ${unidad}` : ""} />} cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: "3 3", strokeOpacity: 0.4 }} />
        <Line dataKey="y" name={unidad || "valor"} type="natural" stroke={color} strokeWidth={2.2}
          dot={{ fill: color, r: 4, stroke: "#fff", strokeWidth: 2 }}
          activeDot={{ r: 6, fill: color, stroke: "#fff", strokeWidth: 2 }}
          isAnimationActive animationDuration={500} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Bar vertical con colores por categoría (una barra por bucket). */
export function BarVertical({ data, color }: {
  data: BarPoint[]; color: string;
}) {
  if (!data.length || data.every(d => d.y === 0)) return <ChartEmpty />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 6, right: 8, left: -10, bottom: 0 }} barCategoryGap="32%">
        <CartesianGrid strokeDasharray="3 4" strokeOpacity={0.07} vertical={false} />
        <XAxis dataKey="x" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false}
          tickFormatter={(v: string) => v.length > 9 ? v.slice(0,8)+"…" : v} />
        <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={32} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: color, fillOpacity: 0.05 }} />
        <Bar dataKey="y" name="Cantidad" radius={[4,4,0,0]} maxBarSize={28} isAnimationActive animationDuration={500}>
          {data.map((_, i) => <Cell key={i} fill={CHART_SEQ[i % CHART_SEQ.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Bar horizontal rankeado (top N). */
export function BarHorizontal({ data, color, unidad = "" }: {
  data: BarHPoint[]; color: string; unidad?: string;
}) {
  if (!data.length || data.every(d => d.value === 0)) return <ChartEmpty />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 52, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 4" strokeOpacity={0.07} horizontal={false} />
        <XAxis type="number" hide />
        <YAxis dataKey="label" type="category" tickLine={false} axisLine={false}
          tick={{ fontSize: 11, fill: "#6b7280" }} width={100}
          tickFormatter={(v: string) => v.length > 14 ? v.slice(0,13)+"…" : v} />
        <Tooltip content={<ChartTooltip suffix={unidad ? ` ${unidad}` : ""} />} cursor={{ fill: color, fillOpacity: 0.05 }} />
        <Bar dataKey="value" name={unidad || "valor"} radius={[0,4,4,0]} maxBarSize={14} isAnimationActive animationDuration={500}>
          {data.map((d, i) => (
            <Cell key={i} fill={CHART_SEQ[i % CHART_SEQ.length]} />
          ))}
          <LabelList dataKey="value" position="right"
            formatter={(v: number) => `${fmtNumber(v)}${unidad ? " "+unidad : ""}`}
            style={{ fontSize: 10, fill: "#9ca3af" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Radar de un solo polígono. Para multi-entidad, ver RadarMulti abajo. */
export function RadarC({ data, color }: {
  data: RadarPoint[]; color: string;
}) {
  if (!data.length || data.every(d => d.value === 0)) return <ChartEmpty label="Sin datos de evaluación" />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={data} cx="50%" cy="50%">
        <PolarGrid gridType="circle" strokeOpacity={0.12} />
        <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fill: "#9ca3af" }} />
        <Radar dataKey="value" name="Valor"
          fill={color} fillOpacity={0.3}
          stroke={color} strokeWidth={2}
          dot={{ r: 4, fill: color, stroke: "#fff", strokeWidth: 2, fillOpacity: 1 }} />
        <Tooltip content={<ChartTooltip />} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

/**
 * Radar multi-entidad: un polígono superpuesto por cada (label, color).
 * Usado por el canvas con scope='varios'.
 *
 * `series`: [{ name: "ABC-123", color: "#xxx", data: RadarPoint[] }, ...]
 * `axes`:   array de axis names (eje "x" del radar). Calculado de la primera serie
 *           o pasado explícito.
 */
export function RadarMulti({ series, axes }: {
  series: Array<{ name: string; color: string; data: RadarPoint[] }>;
  axes?: string[];
}) {
  if (!series.length) return <ChartEmpty label="Sin datos de evaluación" />;
  const ax = axes ?? series[0].data.map((d) => d.axis);
  // Construimos filas: cada fila es un eje, con columnas por serie.
  const rows = ax.map((axis, i) => {
    const row: Record<string, number | string> = { axis };
    for (const s of series) {
      row[s.name] = s.data[i]?.value ?? 0;
    }
    return row;
  });
  return (
    <div className="flex flex-col h-full">
      <div className="relative flex-1 min-h-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={rows} cx="50%" cy="50%">
            <PolarGrid gridType="circle" strokeOpacity={0.12} />
            <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fill: "#9ca3af" }} />
            {series.map((s) => (
              <Radar key={s.name} dataKey={s.name} name={s.name}
                fill={s.color} fillOpacity={0.18}
                stroke={s.color} strokeWidth={2}
                dot={{ r: 3, fill: s.color, stroke: "#fff", strokeWidth: 1.5 }} />
            ))}
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 10, paddingTop: 6 }} iconType="circle" iconSize={7} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Donut con leyenda. Reusa datos BarPoint (x, y). */
export function Donut({ data, color }: {
  data: BarPoint[]; color: string;
}) {
  if (!data.length || data.every(d => d.y === 0)) return <ChartEmpty />;
  const total = data.reduce((s, d) => s + d.y, 0) || 1;
  return (
    <div className="flex flex-col h-full">
      <div className="relative flex-1 min-h-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="y" nameKey="x" cx="50%" cy="50%"
              innerRadius="46%" outerRadius="80%" paddingAngle={2} startAngle={90} endAngle={-270} stroke="none">
              {data.map((_, i) => <Cell key={i} fill={CHART_SEQ[i % CHART_SEQ.length]} />)}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">total</p>
          <p className="text-[22px] font-black tabular-nums text-gray-900 dark:text-white">{fmtNumber(total)}</p>
        </div>
      </div>
      <ul className="mt-2 space-y-1 px-1">
        {data.slice(0, 5).map((d, i) => (
          <li key={d.x} className="flex items-center gap-2 text-[11px]">
            <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: CHART_SEQ[i % CHART_SEQ.length] }} />
            <span className="flex-1 truncate text-gray-600 dark:text-gray-300">{d.x}</span>
            <span className="font-mono font-semibold text-gray-500 tabular-nums">
              {fmtNumber(d.y)} <span className="text-gray-300 dark:text-gray-600">({fmtNumber((d.y/total)*100)}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** BarMultiple actual vs anterior (single-entity, comparacionChart). */
export function BarMultiple({ data, color }: {
  data: BarCompItem[]; color: string;
}) {
  const clean = dedupeComp(data);
  if (!clean.length || clean.every(d => d.actual === 0 && d.anterior === 0)) return <ChartEmpty />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={clean} margin={{ top: 6, right: 8, left: -10, bottom: 0 }} barGap={3} barCategoryGap="28%">
        <CartesianGrid strokeDasharray="3 4" strokeOpacity={0.07} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false}
          tickFormatter={(v: string) => v.length > 9 ? v.slice(0, 8) + "…" : v} />
        <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={32} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: color, fillOpacity: 0.05 }} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={7} />
        <Bar dataKey="anterior" name="Período anterior" fill="#94a3b8" fillOpacity={0.65} radius={[4,4,0,0]} maxBarSize={20} isAnimationActive animationDuration={500} />
        <Bar dataKey="actual"   name="Período actual"   fill={color}    radius={[4,4,0,0]} maxBarSize={20} isAnimationActive animationDuration={500} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Comparación multi-entidad en barras verticales (top N entidades, con su
 * valor principal lado a lado). Cada entidad es una serie.
 *
 * `series`: [{ name: "ABC-123", color: "#xxx", data: BarPoint[] }, ...]
 *
 * Salida: un BarChart con buckets en X (unión de todas las series) y
 * una `<Bar>` por serie.
 */
export function BarVerticalMulti({ series, title }: {
  series: Array<{ name: string; color: string; data: BarPoint[] }>;
  title?: string;
}) {
  if (!series.length) return <ChartEmpty />;
  const buckets = new Set<string>();
  for (const s of series) for (const p of s.data) buckets.add(p.x);
  const sortedBuckets = Array.from(buckets);
  const rows = sortedBuckets.map((x) => {
    const row: Record<string, number | string> = { x };
    for (const s of series) {
      const found = s.data.find((p) => p.x === x);
      row[s.name] = found ? found.y : 0;
    }
    return row;
  });
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 6, right: 8, left: -10, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid strokeDasharray="3 4" strokeOpacity={0.07} vertical={false} />
        <XAxis dataKey="x" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false}
          tickFormatter={(v: string) => v.length > 9 ? v.slice(0,8)+"…" : v} />
        <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={32} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "#000", fillOpacity: 0.04 }} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={7} />
        {series.map((s) => (
          <Bar key={s.name} dataKey={s.name} name={s.name}
            fill={s.color} radius={[4,4,0,0]} maxBarSize={22}
            isAnimationActive animationDuration={500} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Comparación multi-entidad: una barra por entidad, mostrando su valor de
 * KPI principal (suma de todos los buckets de su barVChart, o el valor del
 * primer KPI). Útil cuando se quiere comparar "el total de X" entre N
 * entidades en lugar de un chart multi-bucket.
 *
 * Usado por el canvas con chartType='bar_h' + scope='varios'.
 */
export function BarHorizontalMulti({ items, title }: {
  items: Array<{ name: string; value: number; meta?: string }>;
  title?: string;
}) {
  if (!items.length || items.every(d => d.value === 0)) return <ChartEmpty />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={items} layout="vertical" margin={{ top: 4, right: 52, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 4" strokeOpacity={0.07} horizontal={false} />
        <XAxis type="number" hide />
        <YAxis dataKey="name" type="category" tickLine={false} axisLine={false}
          tick={{ fontSize: 11, fill: "#6b7280" }} width={120}
          tickFormatter={(v: string) => v.length > 14 ? v.slice(0,13)+"…" : v} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "#000", fillOpacity: 0.04 }} />
        <Bar dataKey="value" radius={[0,4,4,0]} maxBarSize={14} isAnimationActive animationDuration={500}>
          {items.map((it, i) => (
            <Cell key={i} fill={it.meta ?? CHART_SEQ[i % CHART_SEQ.length]} />
          ))}
          <LabelList dataKey="value" position="right"
            formatter={(v: number) => fmtNumber(v)}
            style={{ fontSize: 10, fill: "#9ca3af" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Line/area multi-entidad: una serie por entidad, misma X (buckets).
 * Soporta modo area o line puro.
 */
export function LineMulti({
  series, mode = "area", unidad = "",
}: {
  series: Array<{ name: string; color: string; data: LinePoint[] }>;
  mode?: "area" | "line";
  unidad?: string;
}) {
  if (!series.length) return <ChartEmpty />;
  const buckets = new Set<string>();
  for (const s of series) for (const p of s.data) buckets.add(p.x);
  const sorted = Array.from(buckets).sort();
  const rows = sorted.map((x) => {
    const row: Record<string, number | string | null> = { x };
    for (const s of series) {
      const found = s.data.find((p) => p.x === x);
      row[s.name] = found ? found.y : null;
    }
    return row;
  });

  const ChartCmp = mode === "area" ? AreaChart : LineChart;
  const SeriesCmp = mode === "area" ? Area : Line;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ChartCmp data={rows} margin={{ top: 6, right: 12, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 4" strokeOpacity={0.07} vertical={false} />
        <XAxis dataKey="x" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickMargin={8} minTickGap={20} />
        <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={36} />
        <Tooltip content={<ChartTooltip suffix={unidad ? ` ${unidad}` : ""} />} cursor={{ stroke: "#94a3b8", strokeWidth: 1, strokeDasharray: "3 3", strokeOpacity: 0.4 }} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={7} />
        {series.map((s, i) => (
          <SeriesCmp
            key={s.name}
            dataKey={s.name}
            name={s.name}
            type="natural"
            stroke={s.color}
            fill={mode === "area" ? s.color : "transparent"}
            fillOpacity={mode === "area" ? 0.18 : 0}
            strokeWidth={2.2}
            dot={mode === "line" ? { fill: s.color, r: 3, stroke: "#fff", strokeWidth: 1.5 } : false}
            activeDot={{ r: 4, fill: s.color, stroke: "#fff", strokeWidth: 2 }}
            connectNulls
            isAnimationActive
            animationDuration={600}
          />
        ))}
      </ChartCmp>
    </ResponsiveContainer>
  );
}