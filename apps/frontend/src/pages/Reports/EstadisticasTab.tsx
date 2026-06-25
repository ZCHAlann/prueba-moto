"use client";
// ─────────────────────────────────────────────────────────────────────
// EstadisticasTab.tsx — V9 (Producción)
// Gráficas con sentido real por módulo, conectadas al backend existente.
// Usa los shapes exactos que devuelve cada calculate*:
//   lineChart, barVChart, barHChart, comparacionChart, exponencialChart
//
// Cambios vs V8:
//   - Cada módulo tiene su propia composición de gráficas semántica
//   - Los títulos de los charts son los que devuelve el backend
//   - Colores condicionales (verde/rojo) donde corresponde
//   - Panel IA colapsable al fondo (no interrumpe el flujo visual)
//   - Sin gráficas fake: si no hay data, skeleton honesto con mensaje
// ─────────────────────────────────────────────────────────────────────

import { useState, useMemo, useRef } from "react";
import {
  AreaChart, Area,
  BarChart, Bar,
  ComposedChart,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceLine, ResponsiveContainer, Cell,
  PieChart, Pie,
} from "recharts";
import {
  Wrench, Fuel, Truck, Users, ClipboardList, Bell,
  AirVent, Shield, MapPin, FileText,
  Pin, PinOff, ChevronRight, RefreshCw, FileDown,
  Sparkles, TrendingUp, TrendingDown, AlertTriangle,
  ArrowUp, ArrowDown, Activity, DollarSign,
  CheckCircle2, Clock, Database, X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useEstadisticas,
  useAnalisisIA,
  useExportarPDF,
  type Modulo,
  type Periodo,
  type KpiItem,
  type EstadisticasData,
} from "../../hooks/useEstadisticas";
import { DatePicker } from "../../components/ui/date-picker/DatePicker";

// ─── Módulos ──────────────────────────────────────────────────────────
type ModuloDef = {
  key: Modulo;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
  group: "Operación" | "Control";
};

const MODULOS: ModuloDef[] = [
  { key: "mantenimiento", label: "Mantenimiento", icon: Wrench,        color: "#f59e0b", group: "Operación" },
  { key: "combustible",   label: "Combustible",   icon: Fuel,          color: "#f97316", group: "Operación" },
  { key: "flotas",        label: "Flotas",        icon: Truck,         color: "#3b82f6", group: "Operación" },
  { key: "conductores",   label: "Conductores",   icon: Users,         color: "#8b5cf6", group: "Operación" },
  { key: "checklists",    label: "Checklists",    icon: ClipboardList, color: "#06b6d4", group: "Control" },
  { key: "alertas",       label: "Alertas",       icon: Bell,          color: "#f43f5e", group: "Control" },
  { key: "ac",            label: "A/C",           icon: AirVent,       color: "#14b8a6", group: "Control" },
  { key: "seguros",       label: "Seguros",       icon: Shield,        color: "#6366f1", group: "Control" },
  { key: "peajes",        label: "Peajes",        icon: MapPin,        color: "#d946ef", group: "Control" },
  { key: "asignaciones",  label: "Asignaciones",  icon: FileText,      color: "#10b981", group: "Control" },
];

const PERIODS: { key: Periodo; label: string }[] = [
  { key: "month",   label: "Este mes" },
  { key: "quarter", label: "Trimestre" },
  { key: "year",    label: "Año" },
];

// ─── Helpers ──────────────────────────────────────────────────────────
function n(v: number, decimals = 0) {
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("es-EC", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtDelta(pct?: number) {
  if (pct == null || !Number.isFinite(pct)) return null;
  const v = Math.round(pct * 10) / 10;
  return { text: `${v > 0 ? "+" : ""}${v.toFixed(1)}%`, up: v >= 0 };
}

// ─── Tooltip custom ──────────────────────────────────────────────────
function CT({ active, payload, label, color = "#111", prefix = "", suffix = "" }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-xl text-[12px]">
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="flex items-center gap-2 font-semibold" style={{ color: p.color || color }}>
          <span className="inline-block h-2 w-2 rounded-full flex-shrink-0" style={{ background: p.color || color }} />
          <span className="font-mono">{prefix}{typeof p.value === "number" ? n(p.value, 1) : p.value}{suffix}</span>
          <span className="text-gray-400 font-normal text-[11px]">{p.name}</span>
        </p>
      ))}
    </div>
  );
}

// ─── Empty / Skeleton ─────────────────────────────────────────────────
function ChartEmpty({ color }: { color: string }) {
  const bars = [38, 62, 48, 78, 55, 84, 44, 70, 58, 90];
  return (
    <div className="flex h-full w-full items-end gap-2 px-3 pb-6">
      {bars.map((h, i) => (
        <div key={i} className="flex-1 animate-pulse rounded-t-sm"
          style={{ height: `${h}%`, background: `${color}18`, animationDelay: `${i * 0.07}s` }} />
      ))}
    </div>
  );
}

// ─── Chart Card ──────────────────────────────────────────────────────
function CC({
  title, subtitle, children, height = 240, col = 1,
}: {
  title: string; subtitle?: string; children: React.ReactNode; height?: number; col?: number;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.02]"
      style={{ gridColumn: `span ${col}` }}>
      <div className="mb-3">
        <p className="text-[13.5px] font-semibold text-gray-900 dark:text-white tracking-tight">{title}</p>
        {subtitle && <p className="mt-0.5 text-[11px] text-gray-400 font-medium">{subtitle}</p>}
      </div>
      <div style={{ height }}>{children}</div>
    </div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────
function KpiCard({ kpi, color }: { kpi: KpiItem; color: string }) {
  const val = typeof kpi.valor === "number" ? n(kpi.valor, kpi.unidad === "USD" ? 2 : 0) : kpi.valor;
  const delta = fmtDelta(kpi.variacionPct);
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-[11.5px] font-medium text-gray-500 dark:text-gray-400 leading-snug">{kpi.label}</p>
        {delta && (
          <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold flex-shrink-0 ${
            delta.up ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
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

// ─── Donut pequeño ───────────────────────────────────────────────────
function MiniDonut({
  data, color, centerLabel, centerValue,
}: { data: { x: string; y: number }[]; color: string; centerLabel?: string; centerValue?: string }) {
  if (!data.length) return <ChartEmpty color={color} />;
  const OPACITIES = [1, 0.75, 0.5, 0.3, 0.2];
  const total = data.reduce((s, d) => s + d.y, 0) || 1;
  return (
    <div className="flex flex-col h-full">
      <div className="relative flex-1 min-h-[160px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="y" nameKey="x" cx="50%" cy="50%"
              innerRadius="54%" outerRadius="88%" paddingAngle={2}
              startAngle={90} endAngle={-270} stroke="none">
              {data.map((_, i) => (
                <Cell key={i} fill={color} fillOpacity={OPACITIES[i] ?? 0.15} />
              ))}
            </Pie>
            <Tooltip content={<CT color={color} />} />
          </PieChart>
        </ResponsiveContainer>
        {centerValue && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400">{centerLabel}</p>
            <p className="text-[22px] font-black tabular-nums text-gray-900 dark:text-white mt-0.5">{centerValue}</p>
          </div>
        )}
      </div>
      <ul className="mt-2 space-y-1.5">
        {data.slice(0, 4).map((d, i) => (
          <li key={d.x} className="flex items-center gap-2 text-[11px]">
            <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: color, opacity: OPACITIES[i] ?? 0.2 }} />
            <span className="flex-1 truncate text-gray-600 dark:text-gray-300">{d.x}</span>
            <span className="font-mono font-semibold text-gray-500 dark:text-gray-400 tabular-nums">
              {n(d.y)} <span className="text-gray-300 dark:text-gray-600">({n((d.y / total) * 100)}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Área chart ──────────────────────────────────────────────────────
function AreaC({
  data, color, unidad, showProjected = true,
}: { data: { x: string; y: number; proyectado?: boolean }[]; color: string; unidad: string; showProjected?: boolean }) {
  if (data.filter(d => !d.proyectado).length < 2) return <ChartEmpty color={color} />;
  const gId = `ag${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 6, right: 8, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id={gId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.45} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 4" stroke="currentColor" className="text-gray-100 dark:text-white/[0.05]" vertical={false} />
        <XAxis dataKey="x" tick={{ fontSize: 10, fill: "currentColor" }} axisLine={false} tickLine={false}
          className="text-gray-400" interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 10, fill: "currentColor" }} axisLine={false} tickLine={false}
          className="text-gray-400" width={38} />
        <Tooltip content={<CT color={color} suffix={` ${unidad}`} />}
          cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: "3 3", strokeOpacity: 0.5 }} />
        {showProjected && (
          <ReferenceLine x={data.filter(d => !d.proyectado).at(-1)?.x}
            stroke={color} strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.6} />
        )}
        <Area dataKey="y" name={unidad} stroke={color} strokeWidth={2.2} fill={`url(#${gId})`}
          dot={false} activeDot={{ r: 4, fill: color, stroke: "#fff", strokeWidth: 2 }}
          isAnimationActive animationDuration={600} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Barras verticales con color condicional ──────────────────────────
function BarCV({
  data, color, unidad, benchmarkKey, benchmarkValue, colorFn,
}: {
  data: { x: string; y: number }[];
  color: string;
  unidad: string;
  benchmarkKey?: string;
  benchmarkValue?: number;
  colorFn?: (d: { x: string; y: number }) => string;
}) {
  if (!data.length) return <ChartEmpty color={color} />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 6, right: 8, left: -10, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid strokeDasharray="3 4" stroke="currentColor" className="text-gray-100 dark:text-white/[0.05]" vertical={false} />
        <XAxis dataKey="x" tick={{ fontSize: 10, fill: "currentColor" }} axisLine={false} tickLine={false} className="text-gray-400" />
        <YAxis tick={{ fontSize: 10, fill: "currentColor" }} axisLine={false} tickLine={false} className="text-gray-400" width={34} />
        <Tooltip content={<CT color={color} suffix={` ${unidad}`} />} cursor={{ fill: color, fillOpacity: 0.06 }} />
        {benchmarkValue != null && (
          <ReferenceLine y={benchmarkValue} stroke="#6b7280" strokeWidth={1.5} strokeDasharray="4 3"
            label={{ value: benchmarkKey ?? "", fill: "#9ca3af", fontSize: 10, position: "right" }} />
        )}
        <Bar dataKey="y" name={unidad} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive animationDuration={550}>
          {data.map((d, i) => (
            <Cell key={i} fill={colorFn ? colorFn(d) : color} fillOpacity={colorFn ? 1 : 1 - (i / data.length) * 0.3} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Barras horizontales ──────────────────────────────────────────────
function BarCH({
  data, color, unidad, colorFn,
}: {
  data: { label: string; value: number; meta?: string }[];
  color: string;
  unidad: string;
  colorFn?: (v: number, max: number) => string;
}) {
  if (!data.length) return <ChartEmpty color={color} />;
  const max = Math.max(...data.map(d => d.value));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 4" stroke="currentColor" className="text-gray-100 dark:text-white/[0.05]" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: "currentColor" }} axisLine={false} tickLine={false} className="text-gray-400" />
        <YAxis dataKey="label" type="category" tick={{ fontSize: 11, fill: "currentColor" }} axisLine={false} tickLine={false}
          className="text-gray-700 dark:text-gray-300" width={110} />
        <Tooltip content={<CT color={color} suffix={` ${unidad}`} />} cursor={{ fill: color, fillOpacity: 0.06 }} />
        <Bar dataKey="value" name={unidad} radius={[0, 4, 4, 0]} maxBarSize={14} isAnimationActive animationDuration={550}>
          {data.map((d, i) => (
            <Cell key={i} fill={colorFn ? colorFn(d.value, max) : color} fillOpacity={colorFn ? 1 : 1 - (i / data.length) * 0.35} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Grouped bar (comparación actual vs anterior) ─────────────────────
function BarComp({
  data, color, unidad,
}: { data: { label: string; actual: number; anterior: number }[]; color: string; unidad: string }) {
  if (!data.length) return <ChartEmpty color={color} />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 6, right: 8, left: -10, bottom: 0 }} barGap={3} barCategoryGap="24%">
        <CartesianGrid strokeDasharray="3 4" stroke="currentColor" className="text-gray-100 dark:text-white/[0.05]" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "currentColor" }} axisLine={false} tickLine={false} className="text-gray-400" />
        <YAxis tick={{ fontSize: 10, fill: "currentColor" }} axisLine={false} tickLine={false} className="text-gray-400" width={34} />
        <Tooltip content={<CT color={color} />} cursor={{ fill: color, fillOpacity: 0.05 }} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} iconType="circle" />
        <Bar dataKey="anterior" name="Anterior" fill="#d1d5db" radius={[3, 3, 0, 0]} maxBarSize={14} isAnimationActive animationDuration={500} />
        <Bar dataKey="actual" name="Actual" fill={color} radius={[3, 3, 0, 0]} maxBarSize={14} isAnimationActive animationDuration={500} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Composited (barras + línea) ──────────────────────────────────────
function ComposedC({
  data, color, barKey, barName, lineKey, lineName, lineColor = "#6b7280", unidad = "",
}: any) {
  if (!data.length) return <ChartEmpty color={color} />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 6, right: 12, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 4" stroke="currentColor" className="text-gray-100 dark:text-white/[0.05]" vertical={false} />
        <XAxis dataKey="x" tick={{ fontSize: 10, fill: "currentColor" }} axisLine={false} tickLine={false} className="text-gray-400" />
        <YAxis tick={{ fontSize: 10, fill: "currentColor" }} axisLine={false} tickLine={false} className="text-gray-400" width={34} />
        <Tooltip content={<CT color={color} suffix={unidad ? ` ${unidad}` : ""} />} cursor={{ fill: color, fillOpacity: 0.05 }} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} iconType="circle" />
        <Bar dataKey={barKey} name={barName} fill={color} fillOpacity={0.85} radius={[4, 4, 0, 0]} maxBarSize={20} isAnimationActive animationDuration={550} />
        {lineKey && (
          <Line dataKey={lineKey} name={lineName} stroke={lineColor} strokeWidth={2} strokeDasharray="4 3"
            dot={false} isAnimationActive={false} />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ═════════════════════════════════════════════════════════════════════
// LAYOUTS POR MÓDULO — cada uno usa los shapes reales del backend
// ═════════════════════════════════════════════════════════════════════

function MantenimientoLayout({ d, color }: { d: EstadisticasData; color: string }) {
  // barVChart → OTs por estado → donut semántico
  // barHChart → top 10 vehículos por costo → ranking horizontal
  // lineChart → costo por período (con proyección)
  // comparacionChart → costo actual vs anterior por categoría
  const STATUS_COLORS: Record<string, string> = {
    "Completado": "#10b981", "En curso": "#3b82f6",
    "Programado": "#f59e0b", "PendienteAtencion": "#f97316",
    "Cancelado": "#9ca3af",
  };
  return (
    <div className="grid grid-cols-3 gap-3">
      {/* Costo por período + proyección — span 2 */}
      <CC title={d.lineChart.title} subtitle="Proyección 3 períodos en punteado" col={2} height={250}>
        <AreaC data={d.lineChart.data} color={color} unidad={d.lineChart.unidad} />
      </CC>
      {/* OTs por estado — donut */}
      <CC title={d.barVChart.title} subtitle="Período actual" height={250}>
        <MiniDonut
          data={d.barVChart.data}
          color={color}
          centerLabel="OTs"
          centerValue={String(d.barVChart.data.reduce((s, x) => s + x.y, 0))}
        />
      </CC>
      {/* Top vehículos por costo — barras horizontales rankeadas */}
      <CC title={d.barHChart.title} subtitle={`Unidad: ${d.barHChart.unidad}`} col={2} height={260}>
        <BarCH data={d.barHChart.data} color={color} unidad={d.barHChart.unidad}
          colorFn={(v, max) => {
            const pct = v / max;
            return pct > 0.8 ? "#f43f5e" : pct > 0.5 ? "#f97316" : color;
          }}
        />
      </CC>
      {/* Comparativa: costo actual vs anterior por categoría */}
      <CC title={d.comparacionChart.title} subtitle="Actual vs período anterior" height={260}>
        <BarComp data={d.comparacionChart.data} color={color} unidad="USD" />
      </CC>
    </div>
  );
}

function CombustibleLayout({ d, color }: { d: EstadisticasData; color: string }) {
  // lineChart  → costo de combustible por período
  // barVChart  → litros por tipo de combustible
  // barHChart  → top 10 vehículos por eficiencia (km/L) ← el más importante
  // comparacionChart → costo actual vs anterior por tipo
  // exponencialChart → costo diario (últimos 30 días)
  const benchmark = d.barHChart.data.length
    ? d.barHChart.data.reduce((s, x) => s + x.value, 0) / d.barHChart.data.length
    : undefined;
  return (
    <div className="grid grid-cols-3 gap-3">
      {/* ESTRELLA: eficiencia km/L por vehículo con benchmark */}
      <CC title={d.barHChart.title}
        subtitle={`Verde = sobre el promedio (${benchmark ? n(benchmark, 1) : "—"} km/L) · Rojo = bajo`}
        col={2} height={260}>
        <BarCH data={d.barHChart.data} color={color} unidad={d.barHChart.unidad}
          colorFn={(v, max) => (benchmark && v >= benchmark) ? "#10b981" : "#f43f5e"}
        />
      </CC>
      {/* Litros por tipo (diesel / gasolina / etc.) */}
      <CC title={d.barVChart.title} subtitle="Distribución del período" height={260}>
        <MiniDonut data={d.barVChart.data} color={color}
          centerLabel="Litros"
          centerValue={n(d.barVChart.data.reduce((s, x) => s + x.y, 0))}
        />
      </CC>
      {/* Costo por período — tendencia */}
      <CC title={d.lineChart.title} subtitle="Tendencia + proyección" col={2} height={220}>
        <AreaC data={d.lineChart.data} color={color} unidad={d.lineChart.unidad} />
      </CC>
      {/* Comparación tipo actual vs anterior */}
      <CC title={d.comparacionChart.title} subtitle="Por tipo de combustible" height={220}>
        <BarComp data={d.comparacionChart.data} color={color} unidad="USD" />
      </CC>
    </div>
  );
}

function FlotasLayout({ d, color }: { d: EstadisticasData; color: string }) {
  // barVChart  → distribución por estado actual (Operativo / En mantenimiento / Fuera de servicio)
  // barHChart  → top 10 vehículos por km
  // exponencialChart → disponibilidad últimos 30 días (%)
  // lineChart  → altas de flota por período
  const estadoColors: Record<string, string> = {
    "Operativo": "#10b981", "En mantenimiento": "#f59e0b",
    "Fuera de servicio": "#f43f5e", "Disponible": "#3b82f6",
    "En ruta": "#8b5cf6", "No disponible": "#9ca3af",
  };
  return (
    <div className="grid grid-cols-3 gap-3">
      {/* Estado actual — donut con semáforo */}
      <CC title={d.barVChart.title} subtitle="Distribución actual de la flota" height={280}>
        <MiniDonut
          data={d.barVChart.data}
          color={color}
          centerLabel="Total"
          centerValue={String(d.barVChart.data.reduce((s, x) => s + x.y, 0))}
        />
      </CC>
      {/* Disponibilidad últimos 30 días */}
      <CC title={d.exponencialChart.title} subtitle="% diario — línea base 80%" col={2} height={280}>
        {d.exponencialChart.data.length > 3 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={d.exponencialChart.data} margin={{ top: 6, right: 8, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="dispGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 4" stroke="currentColor" className="text-gray-100 dark:text-white/[0.05]" vertical={false} />
              <XAxis dataKey="x" tick={{ fontSize: 10, fill: "currentColor" }} axisLine={false} tickLine={false} className="text-gray-400" interval={4} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "currentColor" }} axisLine={false} tickLine={false} className="text-gray-400" width={30} />
              <Tooltip content={<CT color={color} suffix="%" />} cursor={{ stroke: color, strokeDasharray: "3 3" }} />
              <ReferenceLine y={80} stroke="#9ca3af" strokeWidth={1} strokeDasharray="3 3"
                label={{ value: "80%", fill: "#9ca3af", fontSize: 10, position: "right" }} />
              <Area dataKey="y" name="%" stroke={color} strokeWidth={2} fill="url(#dispGrad)"
                dot={false} activeDot={{ r: 4, fill: color, stroke: "#fff", strokeWidth: 2 }}
                isAnimationActive animationDuration={600} />
            </AreaChart>
          </ResponsiveContainer>
        ) : <ChartEmpty color={color} />}
      </CC>
      {/* Top vehículos por km */}
      <CC title={d.barHChart.title} subtitle="Km recorridos en el período" col={2} height={240}>
        <BarCH data={d.barHChart.data} color={color} unidad={d.barHChart.unidad} />
      </CC>
      {/* Altas de flota por período */}
      <CC title={d.lineChart.title} subtitle="Incorporaciones al período" height={240}>
        <AreaC data={d.lineChart.data} color={color} unidad={d.lineChart.unidad} showProjected={false} />
      </CC>
    </div>
  );
}

function ConductoresLayout({ d, color }: { d: EstadisticasData; color: string }) {
  // lineChart  → asignaciones iniciadas por período
  // barVChart  → por tipo de licencia
  // barHChart  → top 10 conductores con más asignaciones
  // exponencialChart → licencias por vencer (próximas 13 semanas)
  // comparacionChart → actual vs anterior
  return (
    <div className="grid grid-cols-3 gap-3">
      {/* Top conductores por asignaciones */}
      <CC title={d.barHChart.title} subtitle={`Unidad: ${d.barHChart.unidad}`} col={2} height={260}>
        <BarCH data={d.barHChart.data} color={color} unidad={d.barHChart.unidad} />
      </CC>
      {/* Por tipo de licencia */}
      <CC title={d.barVChart.title} subtitle="Distribución del período" height={260}>
        <MiniDonut data={d.barVChart.data} color={color}
          centerLabel="Total" centerValue={String(d.barVChart.data.reduce((s, x) => s + x.y, 0))} />
      </CC>
      {/* Licencias por vencer — urgente */}
      <CC title={d.exponencialChart.title}
        subtitle="Pico alto = semana con muchas licencias expirando"
        col={2} height={220}>
        {d.exponencialChart.data.length > 2 ? (
          <BarCV data={d.exponencialChart.data} color="#f43f5e" unidad="conductores"
            colorFn={(d) => d.y >= 3 ? "#f43f5e" : d.y >= 1 ? "#f97316" : "#10b981"}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <CheckCircle2 size={28} className="text-emerald-500" />
            <p className="text-[12px] font-medium text-gray-500">Sin licencias por vencer en las próximas 13 semanas</p>
          </div>
        )}
      </CC>
      {/* Tendencia de asignaciones */}
      <CC title={d.lineChart.title} subtitle="Asignaciones nuevas por período" height={220}>
        <AreaC data={d.lineChart.data} color={color} unidad={d.lineChart.unidad} showProjected={false} />
      </CC>
    </div>
  );
}

function ChecklistsLayout({ d, color }: { d: EstadisticasData; color: string }) {
  // lineChart  → inspecciones por período
  // barVChart  → por estado (Aprobado / Observado / Pendiente)
  // barHChart  → top 10 vehículos inspeccionados
  // comparacionChart → actual vs anterior (por estado)
  const statusColors: Record<string, string> = {
    "Aprobado": "#10b981", "Observado": "#f59e0b", "Pendiente": "#f43f5e",
  };
  return (
    <div className="grid grid-cols-3 gap-3">
      {/* Inspecciones en el tiempo */}
      <CC title={d.lineChart.title} subtitle="Tendencia de cumplimiento" col={2} height={240}>
        <AreaC data={d.lineChart.data} color={color} unidad={d.lineChart.unidad} showProjected={false} />
      </CC>
      {/* Distribución por estado */}
      <CC title={d.barVChart.title} subtitle="Resultado de inspecciones" height={240}>
        <MiniDonut
          data={d.barVChart.data}
          color={color}
          centerLabel="Total"
          centerValue={String(d.barVChart.data.reduce((s, x) => s + x.y, 0))}
        />
      </CC>
      {/* Top vehículos inspeccionados */}
      <CC title={d.barHChart.title} subtitle="Mayor número de inspecciones" col={2} height={240}>
        <BarCH data={d.barHChart.data} color={color} unidad={d.barHChart.unidad} />
      </CC>
      {/* Comparativa actual vs anterior por estado */}
      <CC title={d.comparacionChart.title} subtitle="Aprobado / Observado / Pendiente" height={240}>
        <BarComp data={d.comparacionChart.data} color={color} unidad="insp." />
      </CC>
    </div>
  );
}

function AlertasLayout({ d, color }: { d: EstadisticasData; color: string }) {
  // lineChart  → alertas por período
  // barVChart  → por tipo
  // barHChart  → por severidad
  // comparacionChart → abierta vs cerrada actual vs anterior
  const sevColors: Record<string, string> = {
    "Crítica": "#f43f5e", "Alta": "#f97316",
    "Media": "#f59e0b", "Baja": "#3b82f6",
  };
  return (
    <div className="grid grid-cols-3 gap-3">
      {/* Tendencia de alertas en el tiempo */}
      <CC title={d.lineChart.title} subtitle="Evolución del período" col={2} height={240}>
        <AreaC data={d.lineChart.data} color={color} unidad={d.lineChart.unidad} showProjected={false} />
      </CC>
      {/* Por tipo — donut */}
      <CC title={d.barVChart.title} subtitle="Distribución por tipo" height={240}>
        <MiniDonut data={d.barVChart.data} color={color}
          centerLabel="Total" centerValue={String(d.barVChart.data.reduce((s, x) => s + x.y, 0))} />
      </CC>
      {/* Por severidad — barras con color crítico */}
      <CC title={d.barHChart.title} subtitle="Alta = rojo, Media = naranja, Baja = azul" col={2} height={240}>
        <BarCH data={d.barHChart.data} color={color} unidad={d.barHChart.unidad}
          colorFn={(v, max) => {
            const label = d.barHChart.data.find(x => x.value === v)?.label ?? "";
            return sevColors[label] ?? color;
          }}
        />
      </CC>
      {/* Comparativa estado (abierta/cerrada) */}
      <CC title={d.comparacionChart.title} subtitle="Abierta vs Cerrada" height={240}>
        <BarComp data={d.comparacionChart.data} color={color} unidad="alertas" />
      </CC>
    </div>
  );
}

function AcLayout({ d, color }: { d: EstadisticasData; color: string }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <CC title={d.lineChart.title} subtitle="Servicios por período" col={2} height={240}>
        <AreaC data={d.lineChart.data} color={color} unidad={d.lineChart.unidad} showProjected={false} />
      </CC>
      <CC title={d.barVChart.title} subtitle="Estado de unidades" height={240}>
        <MiniDonut data={d.barVChart.data} color={color}
          centerLabel="Unidades" centerValue={String(d.barVChart.data.reduce((s, x) => s + x.y, 0))} />
      </CC>
      <CC title={d.barHChart.title} subtitle="Mayor gasto de mantenimiento" col={2} height={240}>
        <BarCH data={d.barHChart.data} color={color} unidad={d.barHChart.unidad} />
      </CC>
      <CC title={d.comparacionChart.title} subtitle="Servicios / Refrigerante / Costo" height={240}>
        <BarComp data={d.comparacionChart.data} color={color} unidad="" />
      </CC>
    </div>
  );
}

function GenericLayout({ d, color }: { d: EstadisticasData; color: string }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <CC title={d.lineChart.title} subtitle="" col={2} height={240}>
        <AreaC data={d.lineChart.data} color={color} unidad={d.lineChart.unidad} showProjected={false} />
      </CC>
      <CC title={d.barVChart.title} subtitle="" height={240}>
        <MiniDonut data={d.barVChart.data} color={color} />
      </CC>
      <CC title={d.barHChart.title} subtitle="" col={2} height={240}>
        <BarCH data={d.barHChart.data} color={color} unidad={d.barHChart.unidad} />
      </CC>
      <CC title={d.comparacionChart.title} subtitle="Actual vs anterior" height={240}>
        <BarComp data={d.comparacionChart.data} color={color} unidad="" />
      </CC>
    </div>
  );
}

function ModuleCharts({ modulo, data }: { modulo: ModuloDef; data: EstadisticasData }) {
  switch (modulo.key) {
    case "mantenimiento": return <MantenimientoLayout d={data} color={modulo.color} />;
    case "combustible":   return <CombustibleLayout  d={data} color={modulo.color} />;
    case "flotas":        return <FlotasLayout       d={data} color={modulo.color} />;
    case "conductores":   return <ConductoresLayout  d={data} color={modulo.color} />;
    case "checklists":    return <ChecklistsLayout   d={data} color={modulo.color} />;
    case "alertas":       return <AlertasLayout      d={data} color={modulo.color} />;
    case "ac":            return <AcLayout           d={data} color={modulo.color} />;
    default:              return <GenericLayout      d={data} color={modulo.color} />;
  }
}

// ─── Panel IA (colapsable) ────────────────────────────────────────────
function AIPanel({
  companyId, modulo, periodo, fecha, fechaHasta, assetId, driverId,
}: {
  companyId: string; modulo: ModuloDef; periodo: Periodo;
  fecha: string; fechaHasta: string; assetId: number | null; driverId: number | null;
}) {
  const [open, setOpen] = useState(false);
  const { data, loading, error, regenerar, ejecutar } = useAnalisisIA({
    companyId, modulo: modulo.key, periodo, fecha, fechaHasta, assetId, driverId,
    manual: true,
  });

  function handleOpen() {
    setOpen(true);
    if (!data && !loading) void ejecutar();
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.02]">
      <button
        type="button"
        onClick={() => open ? setOpen(false) : handleOpen()}
        className="flex w-full items-center justify-between gap-3 p-4"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ background: `${modulo.color}14`, color: modulo.color }}>
            <Sparkles size={16} className={loading ? "animate-pulse" : ""} />
          </span>
          <div className="text-left">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Análisis IA</p>
            <p className="text-[13px] font-semibold text-gray-900 dark:text-white">
              {open ? "Ocultar análisis" : `Analizar ${modulo.label} con IA`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <span className="hidden sm:block text-[10px] text-gray-400">
              {data.fromCache ? "caché" : "nuevo"} · {data.latencyMs}ms · {data.model}
            </span>
          )}
          <ChevronRight size={14} className={`text-gray-400 transition-transform ${open ? "rotate-90" : ""}`} />
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-100 p-4 dark:border-white/[0.04]">
              {loading && (
                <div className="flex items-center gap-3 py-6 justify-center">
                  <RefreshCw size={15} className="animate-spin text-gray-400" />
                  <p className="text-[13px] text-gray-500">Generando análisis…</p>
                </div>
              )}
              {error && (
                <p className="text-[12px] text-rose-600 dark:text-rose-400">{error}</p>
              )}
              {data && !loading && (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
                  {/* Resumen + puntos clave */}
                  <div className="space-y-3 lg:col-span-3">
                    {data.insights.resumenEjecutivo && (
                      <div className="rounded-xl p-3.5" style={{ background: `${modulo.color}08`, borderLeft: `3px solid ${modulo.color}` }}>
                        <p className="text-[13px] font-medium leading-relaxed text-gray-800 dark:text-gray-100">
                          {data.insights.resumenEjecutivo}
                        </p>
                      </div>
                    )}
                    {data.insights.puntosClave.length > 0 && (
                      <ol className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {data.insights.puntosClave.map((p, i) => (
                          <li key={i} className="flex items-start gap-2 rounded-lg border border-gray-100 bg-white/60 p-2 dark:border-white/[0.06] dark:bg-white/[0.02]">
                            <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white"
                              style={{ background: modulo.color }}>{i + 1}</span>
                            <span className="text-[12px] leading-snug text-gray-700 dark:text-gray-200">{p}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                  {/* Recomendaciones */}
                  {data.insights.recomendaciones.length > 0 && (
                    <div className="space-y-2 lg:col-span-2 lg:border-l lg:border-gray-100 lg:pl-3 lg:dark:border-white/[0.04]">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Recomendaciones</p>
                      {data.insights.recomendaciones.map((r, i) => {
                        const tone = r.prioridad === "alta"
                          ? { bg: "bg-rose-50 dark:bg-rose-500/[0.04]", border: "border-rose-200 dark:border-rose-500/20", bar: "bg-rose-500", text: "text-rose-700 dark:text-rose-300", pill: "bg-rose-100 text-rose-700" }
                          : r.prioridad === "media"
                          ? { bg: "bg-amber-50 dark:bg-amber-500/[0.04]", border: "border-amber-200 dark:border-amber-500/20", bar: "bg-amber-500", text: "text-amber-700 dark:text-amber-300", pill: "bg-amber-100 text-amber-700" }
                          : { bg: "bg-gray-50 dark:bg-white/[0.02]", border: "border-gray-200 dark:border-white/[0.06]", bar: "bg-gray-400", text: "text-gray-700 dark:text-gray-300", pill: "bg-gray-100 text-gray-600" };
                        return (
                          <div key={i} className={`relative overflow-hidden rounded-lg border ${tone.border} ${tone.bg} p-2.5`}>
                            <div className={`absolute left-0 top-0 h-full w-0.5 ${tone.bar}`} />
                            <span className={`inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest ${tone.pill}`}>
                              {r.prioridad}
                            </span>
                            <p className={`mt-1 text-[12.5px] font-bold leading-snug ${tone.text}`}>{r.titulo}</p>
                            <p className="mt-0.5 text-[11px] leading-snug text-gray-600 dark:text-gray-400">{r.accion}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {data && !loading && (
                <div className="mt-3 flex justify-end">
                  <button type="button" onClick={() => regenerar()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-[12px] font-semibold text-gray-600 hover:bg-gray-50 dark:border-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.04]">
                    <RefreshCw size={11} /> Regenerar
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────
function Sidebar({ activeKey, onSelect }: { activeKey: Modulo; onSelect: (k: Modulo) => void }) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const closeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const expanded = pinned || hovered;

  function enter() {
    if (closeRef.current) { clearTimeout(closeRef.current); closeRef.current = null; }
    setHovered(true);
  }
  function leave() {
    if (pinned) return;
    closeRef.current = setTimeout(() => setHovered(false), 220);
  }

  const groups: ("Operación" | "Control")[] = ["Operación", "Control"];

  return (
    <motion.aside
      onMouseEnter={enter} onMouseLeave={leave}
      animate={{ width: expanded ? 220 : 60 }}
      transition={{ type: "spring", stiffness: 400, damping: 34 }}
      className="relative shrink-0 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.02]"
      style={{ willChange: "width" }}
    >
      <div className="flex flex-col p-2 h-full">
        {/* Logo */}
        <div className={`flex items-center pt-1 pb-2 ${expanded ? "justify-between px-1 gap-2" : "justify-center"}`}>
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white font-black text-[14px] shadow">
            S
          </span>
          {expanded && <span className="text-[12.5px] font-bold text-gray-900 dark:text-white whitespace-nowrap">Estadísticas</span>}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden space-y-3 mt-1">
          {groups.map(g => (
            <div key={g}>
              {expanded && (
                <p className="px-2 pb-1 text-[9.5px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">{g}</p>
              )}
              <ul className="space-y-1">
                {MODULOS.filter(m => m.group === g).map(m => {
                  const Icon = m.icon;
                  const active = activeKey === m.key;
                  return (
                    <li key={m.key}>
                      <button type="button" onClick={() => onSelect(m.key)} title={!expanded ? m.label : undefined}
                        className={`flex w-full items-center gap-2.5 rounded-xl text-[12px] font-medium transition-colors
                          ${expanded ? "px-2.5 py-2" : "h-11 w-11 justify-center mx-auto"}
                          ${active
                            ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                            : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/[0.06]"
                          }`}
                      >
                        <span className={`flex flex-shrink-0 items-center justify-center rounded-lg
                          ${expanded ? "h-7 w-7" : "h-8 w-8"}
                          ${active ? "bg-white/15" : ""}`}
                          style={!active ? { color: m.color, background: `${m.color}14` } : {}}>
                          <Icon size={expanded ? 13 : 15} className={active ? "text-white dark:text-gray-900" : ""} />
                        </span>
                        {expanded && (
                          <>
                            <span className="truncate flex-1">{m.label}</span>
                            {active && <ChevronRight size={11} className="opacity-60" />}
                          </>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Pin */}
        <div className={`mt-1 border-t border-gray-100 dark:border-white/[0.05] pt-2 flex ${expanded ? "justify-end px-1" : "justify-center"}`}>
          <button type="button" onClick={() => setPinned(p => !p)}
            title={pinned ? "Soltar" : "Fijar"}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${
              pinned ? "bg-amber-500 text-white" : "text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
            }`}>
            {pinned ? <PinOff size={12} /> : <Pin size={12} />}
          </button>
        </div>
      </div>
    </motion.aside>
  );
}

// ─── Página principal ─────────────────────────────────────────────────
export function EstadisticasTab({ companyId }: { companyId: string }) {
  const [moduloKey, setModuloKey] = useState<Modulo>("mantenimiento");
  const [periodo, setPeriodo] = useState<Periodo>("month");

  const today = new Date();
  const ninetyAgo = new Date(); ninetyAgo.setDate(ninetyAgo.getDate() - 90);
  const [fechaDesde, setFechaDesde] = useState(ninetyAgo.toISOString().slice(0, 10));
  const [fechaHasta, setFechaHasta] = useState(today.toISOString().slice(0, 10));
  const [fechaApDesde, setFechaApDesde] = useState(fechaDesde);
  const [fechaApHasta, setFechaApHasta] = useState(fechaHasta);
  const [dateOpen, setDateOpen] = useState(false);

  const [assetId] = useState<number | null>(null);
  const [driverId] = useState<number | null>(null);

  const modulo = useMemo(() => MODULOS.find(m => m.key === moduloKey)!, [moduloKey]);
  const { exportar, loading: exporting } = useExportarPDF();

  const [refreshKey, setRefreshKey] = useState(0);

  const { data, loading, error, refetch } = useEstadisticas({
    companyId, modulo: moduloKey, periodo,
    fecha: fechaApDesde, fechaHasta: fechaApHasta,
    assetId, driverId,
  });

  function applyDates() {
    setFechaApDesde(fechaDesde);
    setFechaApHasta(fechaHasta);
    setDateOpen(false);
  }

  return (
    <div className="flex items-start gap-4 space-y-0">
      <Sidebar activeKey={moduloKey} onSelect={(k) => { setModuloKey(k); setRefreshKey(n => n + 1); }} />

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
                {periodo === "month" ? "Este mes" : periodo === "quarter" ? "Trimestre" : "Año"} ·{" "}
                {fechaApDesde} → {fechaApHasta}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Período pills */}
              <div className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white p-1 dark:border-white/[0.06] dark:bg-white/[0.02]">
                {PERIODS.map(p => (
                  <button key={p.key} type="button" onClick={() => setPeriodo(p.key)}
                    className={`rounded-full px-3 py-1 text-[11.5px] font-semibold transition ${
                      periodo === p.key
                        ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                        : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                    }`}>{p.label}</button>
                ))}
              </div>
              {/* Fechas */}
              <button type="button" onClick={() => setDateOpen(o => !o)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[12px] font-semibold transition ${
                  dateOpen
                    ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-gray-200"
                }`}>
                <Clock size={11} />
                Rango
              </button>
              {dateOpen && (
                <div className="flex items-center gap-2">
                  <DatePicker label="Desde" value={fechaDesde} onChange={setFechaDesde} maxDate={fechaHasta} />
                  <span className="text-xs text-gray-400">—</span>
                  <DatePicker label="Hasta" value={fechaHasta} onChange={setFechaApHasta} minDate={fechaDesde} />
                  <button type="button" onClick={applyDates}
                    className="rounded-xl bg-gray-900 hover:bg-gray-800 dark:bg-white dark:text-gray-900 px-3 py-1.5 text-[12px] font-bold text-white">
                    Aplicar
                  </button>
                </div>
              )}
              {/* Refrescar */}
              <button type="button" onClick={() => refetch()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-gray-200">
                <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
                Refrescar
              </button>
              {/* Exportar */}
              <button type="button" disabled={exporting} onClick={() => exportar({ companyId, modulo: moduloKey, periodo, fecha: fechaApDesde, fechaHasta: fechaApHasta, assetId, driverId })}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 dark:text-gray-900 px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-sm disabled:opacity-50">
                <FileDown size={11} className={exporting ? "animate-pulse" : ""} />
                {exporting ? "Generando…" : "PDF"}
              </button>
            </div>
          </div>

          {/* Loading */}
          {loading && !data && (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white p-16 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <RefreshCw size={16} className="animate-spin text-gray-400" />
              <p className="text-[13px] text-gray-500">Calculando estadísticas…</p>
            </div>
          )}

          {/* Error */}
          {error && !data && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-5 dark:border-rose-500/20">
              <p className="text-[13px] font-semibold text-rose-700 dark:text-rose-300">No se pudieron cargar las estadísticas</p>
              <p className="mt-1 text-[12px] text-rose-600/80">{error}</p>
              <button onClick={() => refetch()}
                className="mt-2 inline-flex items-center gap-1 rounded-lg bg-rose-500 hover:bg-rose-600 px-3 py-1.5 text-[12px] font-semibold text-white">
                <RefreshCw size={11} /> Reintentar
              </button>
            </div>
          )}

          {data && (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {data.kpis.map((k, i) => (
                  <KpiCard key={k.label} kpi={k} color={modulo.color} />
                ))}
              </div>

              {/* Gráficas por módulo */}
              <ModuleCharts modulo={modulo} data={data} />

              {/* Panel IA — al fondo, colapsable */}
              <AIPanel
                companyId={companyId} modulo={modulo} periodo={periodo}
                fecha={fechaApDesde} fechaHasta={fechaApHasta}
                assetId={assetId} driverId={driverId}
              />
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}