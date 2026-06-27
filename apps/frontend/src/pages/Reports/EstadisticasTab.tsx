"use client";

import { useState, useMemo, useRef, createContext, useContext } from "react";
import * as React from "react";
import { useNavigate } from "react-router";
import {
  Area, AreaChart, Bar, BarChart, Line, LineChart,
  CartesianGrid, XAxis, YAxis,
  PolarAngleAxis, PolarGrid, Radar, RadarChart,
  LabelList, RadialBar, RadialBarChart,
  Pie, PieChart, Cell,
  ResponsiveContainer, Tooltip, Legend,
} from "recharts";
import {
  Wrench, Fuel, Truck, Users, ClipboardList, Bell,
  AirVent, Shield, MapPin, FileText,
  Pin, PinOff, ChevronRight, RefreshCw, FileDown,
  ArrowUp, ArrowDown, Clock, BarChart2, Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useEstadisticas, useExportarPDF,
  type Modulo, type Periodo, type KpiItem, type EstadisticasData,
  type BarHPoint, type BarCompItem, type LinePoint, type BarPoint, type RadarPoint,
} from "../../hooks/useEstadisticas";
import { DatePicker } from "../../components/ui/date-picker/DatePicker";
import { AIInsightsProvider } from "../../components/estadisticas/AIInsightsContext";
import { AIInformeCompleto } from "../../components/estadisticas/AIInformeCompleto";
import { ChartWithNote } from "../../components/estadisticas/ChartWithNote";
import { todayEcuador, daysFromNowEcuador } from "@/lib/datetime";
import { AIInsightsContext } from "@/components/estadisticas/AIInsightsContext";
import type { ChartRef } from "@/hooks/useEstadisticas";

// ─── Hover Chart Ref Context ─────────────────────────────────────────
// Passes the current chartRef down to CT (custom tooltip) so it can
// look up the AI insight from AIInsightsContext.
const HoverChartRefCtx = createContext<ChartRef | null>(null);
export function useHoverChartRef() { return useContext(HoverChartRefCtx); }
function ChartHoverWrapper({ chartRef, children }: { chartRef: ChartRef; children: React.ReactNode }) {
  return <HoverChartRefCtx.Provider value={chartRef}>{children}</HoverChartRefCtx.Provider>;
}

// Combines ChartWithNote (sidebar AI note) with ChartHoverWrapper (tooltip insight)
function ChartWithHoverInsight({ chartRef, side, children, onClick }: {
  chartRef: ChartRef; side?: boolean; children: React.ReactNode; onClick?: () => void;
}) {
  return (
    <ChartHoverWrapper chartRef={chartRef}>
      <ChartWithNote chartRef={chartRef} side={side} onClick={onClick}>
        {children}
      </ChartWithNote>
    </ChartHoverWrapper>
  );
}

// ─── PALETA ───────────────────────────────────────────────────────
// Colores fijos, independientes de CSS vars del tema
const P = {
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

const MODULE_COLOR: Record<Modulo, string> = {
  mantenimiento: P.amber,
  combustible:   P.orange,
  flotas:        P.blue,
  conductores:   P.violet,
  checklists:    P.cyan,
  alertas:       P.rose,
  ac:            P.teal,
  seguros:       P.indigo,
  peajes:        P.pink,
  asignaciones:  P.emerald,
};

// Secuencia para multi-serie / multi-categoría
const SEQ = [P.blue, P.emerald, P.orange, P.violet, P.rose, P.cyan, P.amber, P.teal, P.indigo, P.pink];

// ─── MÓDULOS ──────────────────────────────────────────────────────
type ModuloDef = {
  key: Modulo; label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string; group: "Operación" | "Control";
};

const MODULE_ROUTES: Record<Modulo, string> = {
  mantenimiento: "/mantenimiento",
  combustible:   "/combustible",
  flotas:         "/flotas",
  conductores:    "/operaciones/conductores",
  checklists:      "/checklist",
  alertas:        "/alertas",
  ac:             "/aires-acondicionados",
  seguros:        "/gestion/seguros",
  peajes:         "/peajes",
  asignaciones:   "/operaciones/asignaciones",
};

const MODULOS: ModuloDef[] = [
  { key: "mantenimiento", label: "Mantenimiento", icon: Wrench,        color: MODULE_COLOR.mantenimiento, group: "Operación" },
  { key: "combustible",   label: "Combustible",   icon: Fuel,          color: MODULE_COLOR.combustible,   group: "Operación" },
  { key: "flotas",        label: "Flotas",        icon: Truck,         color: MODULE_COLOR.flotas,        group: "Operación" },
  { key: "conductores",   label: "Conductores",   icon: Users,         color: MODULE_COLOR.conductores,   group: "Operación" },
  { key: "checklists",    label: "Checklists",    icon: ClipboardList, color: MODULE_COLOR.checklists,    group: "Control"   },
  { key: "alertas",       label: "Alertas",       icon: Bell,          color: MODULE_COLOR.alertas,       group: "Control"   },
  { key: "ac",            label: "A/C",           icon: AirVent,       color: MODULE_COLOR.ac,            group: "Control"   },
  { key: "seguros",       label: "Seguros",       icon: Shield,        color: MODULE_COLOR.seguros,       group: "Control"   },
  { key: "peajes",        label: "Peajes",        icon: MapPin,        color: MODULE_COLOR.peajes,        group: "Control"   },
  { key: "asignaciones",  label: "Asignaciones",  icon: FileText,      color: MODULE_COLOR.asignaciones,  group: "Control"   },
];

const PERIODS: { key: Periodo; label: string }[] = [
  { key: "month",   label: "Este mes"  },
  { key: "quarter", label: "Trimestre" },
  { key: "year",    label: "Año"       },
];

// ─── HELPERS ──────────────────────────────────────────────────────
function n(v: number, dec = 0) {
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("es-EC", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtDelta(pct?: number) {
  if (pct == null || !Number.isFinite(pct)) return null;
  const v = Math.round(pct * 10) / 10;
  return { text: `${v > 0 ? "+" : ""}${v.toFixed(1)}%`, up: v >= 0 };
}
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

// ─── EMPTY STATE ──────────────────────────────────────────────────
function ChartEmpty({ label = "Sin datos para este período" }: { label?: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2">
      <BarChart2 size={26} className="text-gray-300 dark:text-gray-600" />
      <p className="text-[12px] font-medium text-gray-400 dark:text-gray-500 text-center px-6 max-w-[200px]">{label}</p>
    </div>
  );
}

// ─── TOOLTIP ──────────────────────────────────────────────────────
function CT({ active, payload, label: lbl, suffix = "" }: any) {
  const chartRef = useHoverChartRef();
  // Use raw context directly to avoid hook-in-try/catch violation;
  // useContext is always unconditional at the top level.
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
        {payload.map((p: any, i: number) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
              <span className="text-gray-500 dark:text-gray-400 text-[11px]">{p.name}</span>
            </div>
            <span className="font-bold tabular-nums text-gray-900 dark:text-white">
              {typeof p.value === "number" ? n(p.value, 1) : p.value}{suffix}
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

// ─── CHART CARD ───────────────────────────────────────────────────
function CC({ title, subtitle, children, height = 240, onClick }: {
  title: string; subtitle?: string; children: React.ReactNode; height?: number;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-4${onClick ? " cursor-pointer hover:border-gray-300 dark:hover:border-white/20 transition-colors" : ""}`}
    >
      <p className="text-[13px] font-semibold text-gray-900 dark:text-white tracking-tight">{title}</p>
      {subtitle && <p className="mt-0.5 mb-3 text-[11px] text-gray-400">{subtitle}</p>}
      <div style={{ height }}>{children}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CHARTS — Recharts con colores reales
// ═══════════════════════════════════════════════════════════════════

// Area comparativa: período actual vs anterior
function AreaComparativa({ data, color, label1 = "Actual", label2 = "Anterior", unidad = "" }: {
  data: { x: string; actual: number; anterior: number }[];
  color: string; label1?: string; label2?: string; unidad?: string;
}) {
  if (!data.length || data.every(d => d.actual === 0 && d.anterior === 0))
    return <ChartEmpty />;
  const gA = `ga${color.replace(/[^a-z0-9]/gi,"")}`;
  const gB = `gb${color.replace(/[^a-z0-9]/gi,"")}`;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 6, right: 8, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id={gA} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color}    stopOpacity={0.7}  />
            <stop offset="95%" stopColor={color}    stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id={gB} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#94a3b8"  stopOpacity={0.35} />
            <stop offset="95%" stopColor="#94a3b8"  stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 4" strokeOpacity={0.07} vertical={false} />
        <XAxis dataKey="x" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickMargin={8} minTickGap={24} />
        <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={36} />
        <Tooltip content={<CT suffix={unidad ? ` ${unidad}` : ""} />} cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: "3 3", strokeOpacity: 0.4 }} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={7} />
        <Area dataKey="anterior" name={label2} type="natural" fill={`url(#${gB})`} stroke="#94a3b8" strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: "#94a3b8", stroke: "#fff", strokeWidth: 2 }} />
        <Area dataKey="actual"   name={label1} type="natural" fill={`url(#${gA})`} stroke={color}    strokeWidth={2.2} dot={false} activeDot={{ r: 4, fill: color, stroke: "#fff", strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Area simple con tendencia
function AreaTendencia({ data, color, unidad = "" }: { data: LinePoint[]; color: string; unidad?: string }) {
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
        <Tooltip content={<CT suffix={unidad ? ` ${unidad}` : ""} />} cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: "3 3", strokeOpacity: 0.4 }} />
        <Area dataKey="y" name={unidad || "valor"} type="natural" fill={`url(#${gId})`} stroke={color} strokeWidth={2.2} dot={false} activeDot={{ r: 4, fill: color, stroke: "#fff", strokeWidth: 2 }} isAnimationActive animationDuration={600} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Line con dots — para eficiencia / tendencia puntual
function LineDots({ data, color, unidad = "" }: { data: LinePoint[]; color: string; unidad?: string }) {
  if (!data.length || data.every(d => d.y === 0)) return <ChartEmpty />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 6, right: 12, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 4" strokeOpacity={0.07} vertical={false} />
        <XAxis dataKey="x" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickMargin={8} minTickGap={20} />
        <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={36} />
        <Tooltip content={<CT suffix={unidad ? ` ${unidad}` : ""} />} cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: "3 3", strokeOpacity: 0.4 }} />
        <Line dataKey="y" name={unidad || "valor"} type="natural" stroke={color} strokeWidth={2.2}
          dot={{ fill: color, r: 4, stroke: "#fff", strokeWidth: 2 }}
          activeDot={{ r: 6, fill: color, stroke: "#fff", strokeWidth: 2 }}
          isAnimationActive animationDuration={500} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Bar vertical actual vs anterior (deduplicado)
function BarMultiple({ data, color }: { data: BarCompItem[]; color: string }) {
  const clean = dedupeComp(data);
  if (!clean.length || clean.every(d => d.actual === 0 && d.anterior === 0)) return <ChartEmpty />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={clean} margin={{ top: 6, right: 8, left: -10, bottom: 0 }} barGap={3} barCategoryGap="28%">
        <CartesianGrid strokeDasharray="3 4" strokeOpacity={0.07} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false}
          tickFormatter={(v: string) => v.length > 9 ? v.slice(0, 8) + "…" : v} />
        <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={32} />
        <Tooltip content={<CT />} cursor={{ fill: color, fillOpacity: 0.05 }} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={7} />
        <Bar dataKey="anterior" name="Período anterior" fill="#94a3b8" fillOpacity={0.65} radius={[4,4,0,0]} maxBarSize={20} isAnimationActive animationDuration={500} />
        <Bar dataKey="actual"   name="Período actual"   fill={color}    radius={[4,4,0,0]} maxBarSize={20} isAnimationActive animationDuration={500} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// Bar vertical con colores por categoría
function BarVertical({ data, color }: { data: BarPoint[]; color: string }) {
  if (!data.length || data.every(d => d.y === 0)) return <ChartEmpty />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 6, right: 8, left: -10, bottom: 0 }} barCategoryGap="32%">
        <CartesianGrid strokeDasharray="3 4" strokeOpacity={0.07} vertical={false} />
        <XAxis dataKey="x" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false}
          tickFormatter={(v: string) => v.length > 9 ? v.slice(0,8)+"…" : v} />
        <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={32} />
        <Tooltip content={<CT />} cursor={{ fill: color, fillOpacity: 0.05 }} />
        <Bar dataKey="y" name="Cantidad" radius={[4,4,0,0]} maxBarSize={28} isAnimationActive animationDuration={500}>
          {data.map((_, i) => <Cell key={i} fill={SEQ[i % SEQ.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Bar horizontal rankeado con color según intensidad
function BarHorizontal({ data, color, unidad = "" }: { data: BarHPoint[]; color: string; unidad?: string }) {
  if (!data.length || data.every(d => d.value === 0)) return <ChartEmpty />;
  const max = Math.max(...data.map(d => d.value));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 52, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 4" strokeOpacity={0.07} horizontal={false} />
        <XAxis type="number" hide />
        <YAxis dataKey="label" type="category" tickLine={false} axisLine={false}
          tick={{ fontSize: 11, fill: "#6b7280" }} width={100}
          tickFormatter={(v: string) => v.length > 14 ? v.slice(0,13)+"…" : v} />
        <Tooltip content={<CT suffix={unidad ? ` ${unidad}` : ""} />} cursor={{ fill: color, fillOpacity: 0.05 }} />
        <Bar dataKey="value" name={unidad || "valor"} radius={[0,4,4,0]} maxBarSize={14} isAnimationActive animationDuration={500}>
          {data.map((d, i) => {
            const pct = d.value / (max || 1);
            return <Cell key={i} fill={SEQ[i % SEQ.length]} />;
          })}
          <LabelList dataKey="value" position="right"
            formatter={(v: number) => `${n(v)}${unidad ? " "+unidad : ""}`}
            style={{ fontSize: 10, fill: "#9ca3af" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Radar — shape real { axis, value }
function RadarC({ data, color }: { data: RadarPoint[]; color: string }) {
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
        <Tooltip content={<CT />} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// Donut con leyenda
function Donut({ data, color }: { data: BarPoint[]; color: string }) {
  if (!data.length || data.every(d => d.y === 0)) return <ChartEmpty />;
  const total = data.reduce((s, d) => s + d.y, 0) || 1;
  return (
    <div className="flex flex-col h-full">
      <div className="relative flex-1 min-h-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="y" nameKey="x" cx="50%" cy="50%"
              innerRadius="46%" outerRadius="80%" paddingAngle={2} startAngle={90} endAngle={-270} stroke="none">
              {data.map((_, i) => <Cell key={i} fill={SEQ[i % SEQ.length]} />)}
            </Pie>
            <Tooltip content={<CT />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">total</p>
          <p className="text-[22px] font-black tabular-nums text-gray-900 dark:text-white">{n(total)}</p>
        </div>
      </div>
      <ul className="mt-2 space-y-1 px-1">
        {data.slice(0, 5).map((d, i) => (
          <li key={d.x} className="flex items-center gap-2 text-[11px]">
            <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: SEQ[i % SEQ.length] }} />
            <span className="flex-1 truncate text-gray-600 dark:text-gray-300">{d.x}</span>
            <span className="font-mono font-semibold text-gray-500 tabular-nums">
              {n(d.y)} <span className="text-gray-300 dark:text-gray-600">({n((d.y/total)*100)}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Radial bar distribución
function RadialDist({ data, color }: { data: BarPoint[]; color: string }) {
  if (!data.length || data.every(d => d.y === 0)) return <ChartEmpty />;
  const radialData = data.map((d, i) => ({ ...d, fill: SEQ[i % SEQ.length] }));
  const total = data.reduce((s, d) => s + d.y, 0);
  const top = [...data].sort((a, b) => b.y - a.y)[0];
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart data={radialData} startAngle={-90} endAngle={380} innerRadius={24} outerRadius="90%">
            <RadialBar dataKey="y" background={{ fill: "#f1f5f9" }}>
              <LabelList position="insideStart" dataKey="x"
                style={{ fill: "#fff", fontSize: 10, fontWeight: 600 }} />
            </RadialBar>
            <Tooltip content={<CT />} />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-center text-[11px] text-gray-500 dark:text-gray-400">
        <span className="font-semibold text-gray-900 dark:text-white">{top?.x}</span>{" "}
        · <span className="font-semibold" style={{ color }}>{total ? n((top?.y ?? 0)/total*100,1) : 0}%</span> del total
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// LAYOUTS POR MÓDULO
// ═══════════════════════════════════════════════════════════════════

function MantenimientoLayout({ d, color, onClick }: { d: EstadisticasData; color: string; onClick?: () => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <ChartWithHoverInsight chartRef="comparacionChart">
        <CC title={d.comparacionChart.title} subtitle="Período actual vs anterior" onClick={onClick}>
          <BarMultiple data={d.comparacionChart.data} color={color} />
        </CC>
      </ChartWithHoverInsight>
      <ChartWithHoverInsight chartRef="barHChart">
        <CC title={d.barHChart.title} subtitle={d.barHChart.unidad} height={260} onClick={onClick}>
          <BarHorizontal data={d.barHChart.data} color={color} unidad={d.barHChart.unidad} />
        </CC>
      </ChartWithHoverInsight>
      <ChartWithHoverInsight chartRef="lineChart">
        <CC title={d.lineChart.title} subtitle="Tendencia del período" onClick={onClick}>
          <AreaTendencia data={d.lineChart.data} color={color} unidad={d.lineChart.unidad} />
        </CC>
      </ChartWithHoverInsight>
      <ChartWithHoverInsight chartRef="barVChart">
        <CC title={d.barVChart.title} subtitle="Distribución por estado" onClick={onClick}>
          <BarVertical data={d.barVChart.data} color={color} />
        </CC>
      </ChartWithHoverInsight>
    </div>
  );
}

function CombustibleLayout({ d, color, onClick }: { d: EstadisticasData; color: string; onClick?: () => void }) {
  const areaComp = d.exponencialChart.data.map((p, i) => ({
    x: p.x,
    actual: p.y,
    anterior: d.lineChart.data[i]?.y ?? 0,
  }));
  return (
    <div className="space-y-3">
      <ChartWithHoverInsight chartRef="exponencialChart">
        <CC title="Consumo: período actual vs anterior" subtitle="Comparativa diaria" height={200} onClick={onClick}>
          <AreaComparativa data={areaComp} color={color} label1="Período actual" label2="Período anterior" unidad="gal" />
        </CC>
      </ChartWithHoverInsight>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <ChartWithHoverInsight chartRef="lineChart" side={false}>
          <CC title={d.lineChart.title} subtitle="Rendimiento km/gal" height={220} onClick={onClick}>
            <LineDots data={d.lineChart.data} color={color} unidad="km/gal" />
          </CC>
        </ChartWithHoverInsight>
        <ChartWithHoverInsight chartRef="barVChart" side={false}>
          <CC title={d.barVChart.title} subtitle="Por tipo de combustible" height={220} onClick={onClick}>
            <Donut data={d.barVChart.data} color={color} />
          </CC>
        </ChartWithHoverInsight>
        <ChartWithHoverInsight chartRef="barHChart" side={false}>
          <CC title={d.barHChart.title} subtitle={d.barHChart.unidad} height={220} onClick={onClick}>
            <BarHorizontal data={d.barHChart.data} color={color} unidad={d.barHChart.unidad} />
          </CC>
        </ChartWithHoverInsight>
      </div>
    </div>
  );
}

function FlotasLayout({ d, color, onClick }: { d: EstadisticasData; color: string; onClick?: () => void }) {
  const areaComp = d.lineChart.data.map((p, i) => ({
    x: p.x,
    actual: p.y,
    anterior: d.exponencialChart.data[i]?.y ?? 0,
  }));
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <ChartWithHoverInsight chartRef="lineChart">
        <CC title="Disponibilidad de flota" subtitle="Período actual vs referencia" height={220} onClick={onClick}>
          <AreaComparativa data={areaComp} color={color} label1="Operativos" label2="Referencia" unidad="veh." />
        </CC>
      </ChartWithHoverInsight>
      <ChartWithHoverInsight chartRef="barVChart">
        <CC title={d.barVChart.title} subtitle="Estado actual" onClick={onClick}>
          <BarVertical data={d.barVChart.data} color={color} />
        </CC>
      </ChartWithHoverInsight>
      <ChartWithHoverInsight chartRef="barHChart">
        <CC title={d.barHChart.title} subtitle={d.barHChart.unidad} height={260} onClick={onClick}>
          <BarHorizontal data={d.barHChart.data} color={color} unidad={d.barHChart.unidad} />
        </CC>
      </ChartWithHoverInsight>
      <ChartWithHoverInsight chartRef="comparacionChart">
        <CC title={d.comparacionChart.title} subtitle="Actual vs anterior" onClick={onClick}>
          <BarMultiple data={d.comparacionChart.data} color={color} />
        </CC>
      </ChartWithHoverInsight>
    </div>
  );
}

function ConductoresLayout({ d, color, onClick }: { d: EstadisticasData; color: string; onClick?: () => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <ChartWithHoverInsight chartRef="radarChart">
        <CC title={d.radarChart.title} subtitle="Mayor área = mejor desempeño en esa dimensión" onClick={onClick}>
          <RadarC data={d.radarChart.data} color={color} />
        </CC>
      </ChartWithHoverInsight>
      <ChartWithHoverInsight chartRef="barHChart">
        <CC title={d.barHChart.title} subtitle={d.barHChart.unidad} height={260} onClick={onClick}>
          <BarHorizontal data={d.barHChart.data} color={color} unidad={d.barHChart.unidad} />
        </CC>
      </ChartWithHoverInsight>
      <ChartWithHoverInsight chartRef="lineChart">
        <CC title={d.lineChart.title} subtitle="Tendencia de asignaciones" onClick={onClick}>
          <AreaTendencia data={d.lineChart.data} color={color} unidad={d.lineChart.unidad} />
        </CC>
      </ChartWithHoverInsight>
      <ChartWithHoverInsight chartRef="comparacionChart">
        <CC title={d.comparacionChart.title} subtitle="Actual vs período anterior" onClick={onClick}>
          <BarMultiple data={dedupeComp(d.comparacionChart.data)} color={color} />
        </CC>
      </ChartWithHoverInsight>
    </div>
  );
}

function ChecklistsLayout({ d, color, onClick }: { d: EstadisticasData; color: string; onClick?: () => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <ChartWithHoverInsight chartRef="lineChart">
        <CC title={d.lineChart.title} subtitle="Inspecciones realizadas" onClick={onClick}>
          <AreaTendencia data={d.lineChart.data} color={color} unidad={d.lineChart.unidad} />
        </CC>
      </ChartWithHoverInsight>
      <ChartWithHoverInsight chartRef="barVChart">
        <CC title={d.barVChart.title} subtitle="Resultado de inspecciones" onClick={onClick}>
          <Donut data={d.barVChart.data} color={color} />
        </CC>
      </ChartWithHoverInsight>
      <ChartWithHoverInsight chartRef="barHChart">
        <CC title={d.barHChart.title} subtitle={d.barHChart.unidad} height={260} onClick={onClick}>
          <BarHorizontal data={d.barHChart.data} color={color} unidad={d.barHChart.unidad} />
        </CC>
      </ChartWithHoverInsight>
      <ChartWithHoverInsight chartRef="comparacionChart">
        <CC title={d.comparacionChart.title} subtitle="Actual vs anterior" onClick={onClick}>
          <BarMultiple data={dedupeComp(d.comparacionChart.data)} color={color} />
        </CC>
      </ChartWithHoverInsight>
    </div>
  );
}

function AlertasLayout({ d, color, onClick }: { d: EstadisticasData; color: string; onClick?: () => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <ChartWithHoverInsight chartRef="lineChart">
        <CC title={d.lineChart.title} subtitle="Evolución de alertas" onClick={onClick}>
          <AreaTendencia data={d.lineChart.data} color={color} unidad={d.lineChart.unidad} />
        </CC>
      </ChartWithHoverInsight>
      <ChartWithHoverInsight chartRef="barVChart">
        <CC title={d.barVChart.title} subtitle="Por tipo de alerta" onClick={onClick}>
          <Donut data={d.barVChart.data} color={color} />
        </CC>
      </ChartWithHoverInsight>
      <ChartWithHoverInsight chartRef="barHChart">
        <CC title={d.barHChart.title} subtitle="Por severidad / vehículo" height={240} onClick={onClick}>
          <BarHorizontal data={d.barHChart.data} color={color} unidad={d.barHChart.unidad} />
        </CC>
      </ChartWithHoverInsight>
      <ChartWithHoverInsight chartRef="comparacionChart">
        <CC title={d.comparacionChart.title} subtitle="Abierta vs cerrada" onClick={onClick}>
          <BarMultiple data={dedupeComp(d.comparacionChart.data)} color={color} />
        </CC>
      </ChartWithHoverInsight>
    </div>
  );
}

function SegurosLayout({ d, color, onClick }: { d: EstadisticasData; color: string; onClick?: () => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <ChartWithHoverInsight chartRef="radarChart">
        <CC title={d.radarChart.title} subtitle="Cobertura por categoría de riesgo" onClick={onClick}>
          <RadarC data={d.radarChart.data} color={color} />
        </CC>
      </ChartWithHoverInsight>
      <ChartWithHoverInsight chartRef="barVChart">
        <CC title={d.barVChart.title} subtitle="Distribución de pólizas" onClick={onClick}>
          <Donut data={d.barVChart.data} color={color} />
        </CC>
      </ChartWithHoverInsight>
      <ChartWithHoverInsight chartRef="barHChart">
        <CC title={d.barHChart.title} subtitle={d.barHChart.unidad} height={240} onClick={onClick}>
          <BarHorizontal data={d.barHChart.data} color={color} unidad={d.barHChart.unidad} />
        </CC>
      </ChartWithHoverInsight>
      <ChartWithHoverInsight chartRef="comparacionChart">
        <CC title={d.comparacionChart.title} subtitle="Actual vs anterior" onClick={onClick}>
          <BarMultiple data={dedupeComp(d.comparacionChart.data)} color={color} />
        </CC>
      </ChartWithHoverInsight>
    </div>
  );
}

function GenericLayout({ d, color, onClick }: { d: EstadisticasData; color: string; onClick?: () => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <ChartWithHoverInsight chartRef="lineChart">
        <CC title={d.lineChart.title} subtitle="Tendencia del período" onClick={onClick}>
          <AreaTendencia data={d.lineChart.data} color={color} unidad={d.lineChart.unidad} />
        </CC>
      </ChartWithHoverInsight>
      <ChartWithHoverInsight chartRef="barVChart">
        <CC title={d.barVChart.title} subtitle="" onClick={onClick}>
          <Donut data={d.barVChart.data} color={color} />
        </CC>
      </ChartWithHoverInsight>
      <ChartWithHoverInsight chartRef="barHChart">
        <CC title={d.barHChart.title} subtitle={d.barHChart.unidad} height={260} onClick={onClick}>
          <BarHorizontal data={d.barHChart.data} color={color} unidad={d.barHChart.unidad} />
        </CC>
      </ChartWithHoverInsight>
      <ChartWithHoverInsight chartRef="comparacionChart">
        <CC title={d.comparacionChart.title} subtitle="Actual vs período anterior" onClick={onClick}>
          <BarMultiple data={dedupeComp(d.comparacionChart.data)} color={color} />
        </CC>
      </ChartWithHoverInsight>
    </div>
  );
}

function ModuleCharts({ modulo, data, navigate }: { modulo: ModuloDef; data: EstadisticasData; navigate: ReturnType<typeof useNavigate> }) {
  const c = modulo.color;
  const go = () => navigate(MODULE_ROUTES[modulo.key]);
  switch (modulo.key) {
    case "mantenimiento": return <MantenimientoLayout d={data} color={c} onClick={go} />;
    case "combustible":   return <CombustibleLayout  d={data} color={c} onClick={go} />;
    case "flotas":        return <FlotasLayout       d={data} color={c} onClick={go} />;
    case "conductores":   return <ConductoresLayout  d={data} color={c} onClick={go} />;
    case "checklists":    return <ChecklistsLayout   d={data} color={c} onClick={go} />;
    case "alertas":       return <AlertasLayout      d={data} color={c} onClick={go} />;
    case "seguros":       return <SegurosLayout      d={data} color={c} onClick={go} />;
    default:              return <GenericLayout      d={data} color={c} onClick={go} />;
  }
}

// ═══════════════════════════════════════════════════════════════════
// KPI CARD
// ═══════════════════════════════════════════════════════════════════

function KpiCard({ kpi, color, onClick }: { kpi: KpiItem; color: string; onClick?: () => void }) {
  const val = typeof kpi.valor === "number" ? n(kpi.valor, kpi.unidad === "USD" ? 2 : 0) : kpi.valor;
  const delta = fmtDelta(kpi.variacionPct);
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-4${onClick ? " cursor-pointer hover:border-gray-300 dark:hover:border-white/20 transition-colors" : ""}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-[11.5px] font-medium text-gray-500 dark:text-gray-400 leading-snug">{kpi.label}</p>
        {delta && (
          <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold flex-shrink-0 ${
            delta.up
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
              : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
          }`}>
            {delta.up ? <ArrowUp size={9} /> : <ArrowDown size={9} />}
            {delta.text}
          </span>
        )}
      </div>
      <p className="text-2xl font-black tabular-nums text-gray-900 dark:text-white leading-none tracking-tight">
        {kpi.unidad === "USD" ? `$${val}` : val}
        {kpi.unidad && kpi.unidad !== "USD" && (
          <span className="ml-1 text-sm font-medium text-gray-400">{kpi.unidad}</span>
        )}
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════════════════════════

function Sidebar({ activeKey, onSelect }: { activeKey: Modulo; onSelect: (k: Modulo) => void }) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const closeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expanded = pinned || hovered;
  function enter() { if (closeRef.current) { clearTimeout(closeRef.current); closeRef.current = null; } setHovered(true); }
  function leave() { if (pinned) return; closeRef.current = setTimeout(() => setHovered(false), 220); }
  return (
    <motion.aside onMouseEnter={enter} onMouseLeave={leave}
      animate={{ width: expanded ? 220 : 60 }}
      transition={{ type: "spring", stiffness: 400, damping: 34 }}
      className="relative shrink-0 overflow-hidden rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02]"
      style={{ willChange: "width" }}>
      <div className="flex flex-col p-2 h-full">
        <div className={`flex items-center pt-1 pb-2 ${expanded ? "justify-between px-1 gap-2" : "justify-center"}`}>
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white font-black text-[14px] shadow">S</span>
          {expanded && <span className="text-[12.5px] font-bold text-gray-900 dark:text-white whitespace-nowrap">Estadísticas</span>}
        </div>
        <nav className="flex-1 overflow-y-auto overflow-x-hidden space-y-3 mt-1">
          {(["Operación", "Control"] as const).map(g => (
            <div key={g}>
              {expanded && <p className="px-2 pb-1 text-[9.5px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">{g}</p>}
              <ul className="space-y-1">
                {MODULOS.filter(m => m.group === g).map(m => {
                  const Icon = m.icon;
                  const active = activeKey === m.key;
                  return (
                    <li key={m.key}>
                      <button type="button" onClick={() => onSelect(m.key)} title={!expanded ? m.label : undefined}
                        className={`flex w-full items-center gap-2.5 rounded-xl text-[12px] font-medium transition-colors
                          ${expanded ? "px-2.5 py-2" : "h-11 w-11 justify-center mx-auto"}
                          ${active ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/[0.06]"}`}>
                        <span className={`flex flex-shrink-0 items-center justify-center rounded-lg ${expanded ? "h-7 w-7" : "h-8 w-8"} ${active ? "bg-white/15" : ""}`}
                          style={!active ? { color: m.color, background: `${m.color}18` } : {}}>
                          <Icon size={expanded ? 13 : 15} className={active ? "text-white dark:text-gray-900" : ""} />
                        </span>
                        {expanded && (<><span className="truncate flex-1">{m.label}</span>{active && <ChevronRight size={11} className="opacity-60" />}</>)}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className={`mt-1 border-t border-gray-100 dark:border-white/[0.05] pt-2 flex ${expanded ? "justify-end px-1" : "justify-center"}`}>
          <button type="button" onClick={() => setPinned(p => !p)} title={pinned ? "Soltar" : "Fijar"}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${pinned ? "bg-amber-500 text-white" : "text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06]"}`}>
            {pinned ? <PinOff size={12} /> : <Pin size={12} />}
          </button>
        </div>
      </div>
    </motion.aside>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ═══════════════════════════════════════════════════════════════════

export function EstadisticasTab({ companyId }: { companyId: string }) {
  const navigate = useNavigate();
  const [moduloKey, setModuloKey] = useState<Modulo>("mantenimiento");
  const [periodo, setPeriodo]     = useState<Periodo>("month");

  const [fechaDesde, setFechaDesde]     = useState(daysFromNowEcuador(-90));
  const [fechaHasta, setFechaHasta]     = useState(todayEcuador());
  const [fechaApDesde, setFechaApDesde] = useState(fechaDesde);
  const [fechaApHasta, setFechaApHasta] = useState(fechaHasta);
  const [dateOpen, setDateOpen]         = useState(false);
  const [informeOpen, setInformeOpen]   = useState(false);
  const [assetId]  = useState<number | null>(null);
  const [driverId] = useState<number | null>(null);

  const modulo = useMemo(() => MODULOS.find(m => m.key === moduloKey)!, [moduloKey]);
  const { exportar, loading: exporting } = useExportarPDF();

  const { data, loading, error, refetch } = useEstadisticas({
    companyId, modulo: moduloKey, periodo,
    fecha: fechaApDesde, fechaHasta: fechaApHasta, assetId, driverId,
  });

  function applyDates() { setFechaApDesde(fechaDesde); setFechaApHasta(fechaHasta); setDateOpen(false); }

  return (
    <div className="flex items-start gap-4">
      <Sidebar activeKey={moduloKey} onSelect={setModuloKey} />
      <AnimatePresence mode="wait">
        <motion.div key={moduloKey}
          initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="flex-1 min-w-0 space-y-4">

          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">{modulo.label}</h1>
              <p className="mt-0.5 text-[12px] text-gray-400">
                {periodo === "month" ? "Este mes" : periodo === "quarter" ? "Trimestre" : "Año"} · {fechaApDesde} → {fechaApHasta}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1 rounded-full border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-1">
                {PERIODS.map(p => (
                  <button key={p.key} type="button" onClick={() => setPeriodo(p.key)}
                    className={`rounded-full px-3 py-1 text-[11.5px] font-semibold transition ${
                      periodo === p.key
                        ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                        : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                    }`}>{p.label}</button>
                ))}
              </div>
              <button type="button" onClick={() => setDateOpen(o => !o)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[12px] font-semibold transition ${
                  dateOpen
                    ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-gray-200"
                }`}><Clock size={11} /> Rango</button>
              {dateOpen && (
                <div className="flex items-center gap-2">
                  <DatePicker label="Desde" value={fechaDesde} onChange={setFechaDesde} maxDate={fechaHasta} />
                  <span className="text-xs text-gray-400">—</span>
                  <DatePicker label="Hasta" value={fechaHasta} onChange={setFechaApHasta} minDate={fechaDesde} />
                  <button type="button" onClick={applyDates}
                    className="rounded-xl bg-gray-900 hover:bg-gray-800 dark:bg-white dark:text-gray-900 px-3 py-1.5 text-[12px] font-bold text-white">Aplicar</button>
                </div>
              )}
              <button type="button" onClick={() => refetch()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] px-3 py-1.5 text-[12px] font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/[0.04]">
                <RefreshCw size={11} className={loading ? "animate-spin" : ""} /> Refrescar
              </button>
              <button type="button" onClick={() => setInformeOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[12px] font-semibold transition ${
                  informeOpen
                    ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-gray-200"
                }`}>
                <Sparkles size={11} /> {informeOpen ? "Ocultar informe" : "Informe completo"}
              </button>
              <button type="button" disabled={exporting}
                onClick={() => exportar({ companyId, modulo: moduloKey, periodo, fecha: fechaApDesde, fechaHasta: fechaApHasta, assetId, driverId })}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 dark:text-gray-900 px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-sm disabled:opacity-50">
                <FileDown size={11} className={exporting ? "animate-pulse" : ""} />
                {exporting ? "Generando…" : "PDF"}
              </button>
            </div>
          </div>

          {/* Barra de color del módulo */}
          <div className="h-0.5 w-full rounded-full" style={{ background: `linear-gradient(90deg, ${modulo.color}, ${modulo.color}30)` }} />

          {loading && !data && (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-16">
              <RefreshCw size={16} className="animate-spin" style={{ color: modulo.color }} />
              <p className="text-[13px] text-gray-500">Calculando estadísticas…</p>
            </div>
          )}

          {error && !data && (
            <div className="rounded-2xl border border-rose-200 dark:border-rose-500/20 bg-rose-50/40 p-5">
              <p className="text-[13px] font-semibold text-rose-700 dark:text-rose-300">No se pudieron cargar las estadísticas</p>
              <p className="mt-1 text-[12px] text-rose-600/80">{error}</p>
              <button onClick={() => refetch()} className="mt-2 inline-flex items-center gap-1 rounded-lg bg-rose-500 hover:bg-rose-600 px-3 py-1.5 text-[12px] font-semibold text-white">
                <RefreshCw size={11} /> Reintentar
              </button>
            </div>
          )}

          {data && (
            <AIInsightsProvider companyId={companyId} modulo={modulo} periodo={periodo}
              fecha={fechaApDesde} fechaHasta={fechaApHasta} assetId={assetId} driverId={driverId}>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {data.kpis.map(k => <KpiCard key={k.label} kpi={k} color={modulo.color} onClick={() => navigate(`${MODULE_ROUTES[moduloKey]}?from=${fechaApDesde}&to=${fechaApHasta}&kpi=${encodeURIComponent(k.label)}`)} />)}
              </div>
              <ModuleCharts modulo={modulo} data={data} navigate={navigate} />
              <AIInformeCompleto open={informeOpen}
                moduloLabel={modulo.label}
                periodoLabel={periodo === "month" ? "Este mes" : periodo === "quarter" ? "Trimestre" : "Año"} />
            </AIInsightsProvider>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}