"use client";

import { useState, useMemo, useRef, useContext, useEffect } from "react";
import * as React from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../../context/AuthContext";
import {
  Wrench, Fuel, Truck, Users, ClipboardList, Bell,
  AirVent, Shield, MapPin, FileText,
  Pin, PinOff, ChevronRight, RefreshCw, FileDown,
  ArrowUp, ArrowDown, Clock, Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useEstadisticas, useExportarPDF,
  type Modulo, type Periodo, type KpiItem, type EstadisticasData,
} from "../../hooks/useEstadisticas";
import { DatePicker } from "../../components/ui/date-picker/DatePicker";
import { AIInsightsProvider } from "../../components/estadisticas/AIInsightsContext";
import { AIInformeCompleto } from "../../components/estadisticas/AIInformeCompleto";
import { ChartWithNote } from "../../components/estadisticas/ChartWithNote";
import { todayEcuador, daysFromNowEcuador } from "@/lib/datetime";
import { AIInsightsContext } from "@/components/estadisticas/AIInsightsContext";
import type { ChartRef } from "@/hooks/useEstadisticas";
import {
  CHART_PALETTE as P,
  CHART_SEQ as SEQ,
  ChartEmpty,
  ChartTooltip as CT,
  ChartHoverWrapper,
  useHoverChartRef,
  AreaTendencia, LineDots, BarVertical, BarHorizontal, RadarC, Donut, BarMultiple,
  fmtNumber as n,
} from "../../components/estadisticas/charts";

// ─── Hover Chart Ref Context se provee en components/estadisticas/charts.tsx ───
// (ChartHoverWrapper + useHoverChartRef ya vienen del archivo compartido).

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
// Se importa como `P` y `SEQ` desde components/estadisticas/charts.tsx arriba.

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

// ─── MÓDULOS ──────────────────────────────────────────────────────
type ModuloDef = {
  key: Modulo; label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string; group: "Operación" | "Control";
  /**
   * jul 2026 — Módulo de empresa requerido para que este item aparezca
   * en el sidebar de Estadísticas. Mismo mecanismo que `requiresModule`
   * en REPORT_MODULES (ReportsPage.tsx). Coincide con la `MODULE_TREE`
   * key del backend (gestion, mantenimiento, combustible, checklist,
   * alertas, autorizaciones, etc.).
   */
  requiresModule?: string;
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

// ⚠️ Verifica los `requiresModule` contra la MODULE_TREE real del backend.
// Los que coinciden 1:1 con REPORT_MODULES (ReportsPage.tsx) son:
// mantenimiento, combustible, checklist, alertas. El resto (flotas,
// conductores, ac, seguros, peajes, asignaciones) los mapeé a "gestion"
// como mejor suposición — ajústalos si tu MODULE_TREE tiene keys propias
// para alguno de ellos (p.ej. "seguros", "peajes", "ac").
const MODULOS: ModuloDef[] = [
  { key: "mantenimiento", label: "Mantenimiento", icon: Wrench,        color: MODULE_COLOR.mantenimiento, group: "Operación", requiresModule: "mantenimiento" },
  { key: "combustible",   label: "Combustible",   icon: Fuel,          color: MODULE_COLOR.combustible,   group: "Operación", requiresModule: "combustible"   },
  { key: "flotas",        label: "Flotas",        icon: Truck,         color: MODULE_COLOR.flotas,        group: "Operación", requiresModule: "gestion"       },
  { key: "conductores",   label: "Conductores",   icon: Users,         color: MODULE_COLOR.conductores,   group: "Operación", requiresModule: "gestion"       },
  { key: "checklists",    label: "Checklists",    icon: ClipboardList, color: MODULE_COLOR.checklists,    group: "Control",   requiresModule: "checklist"     },
  { key: "alertas",       label: "Alertas",       icon: Bell,          color: MODULE_COLOR.alertas,       group: "Control",   requiresModule: "alertas"       },
  { key: "ac",            label: "A/C",           icon: AirVent,       color: MODULE_COLOR.ac,            group: "Control",   requiresModule: "ac"            },
  { key: "seguros",       label: "Seguros",       icon: Shield,        color: MODULE_COLOR.seguros,       group: "Control",   requiresModule: "seguros"       },
  { key: "peajes",        label: "Peajes",        icon: MapPin,        color: MODULE_COLOR.peajes,        group: "Control",   requiresModule: "peajes"        },
  { key: "asignaciones",  label: "Asignaciones",  icon: FileText,      color: MODULE_COLOR.asignaciones,  group: "Control",   requiresModule: "gestion"       },
];

const PERIODS: { key: Periodo; label: string }[] = [
  { key: "month",   label: "Este mes"  },
  { key: "quarter", label: "Trimestre" },
  { key: "year",    label: "Año"       },
];

// ─── HELPERS ──────────────────────────────────────────────────────
function fmtDelta(pct?: number) {
  if (pct == null || !Number.isFinite(pct)) return null;
  const v = Math.round(pct * 10) / 10;
  return { text: `${v > 0 ? "+" : ""}${v.toFixed(1)}%`, up: v >= 0 };
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
// CHARTS ESPECÍFICOS QUE NO SE REUSAN EN EL CANVAS
// ═══════════════════════════════════════════════════════════════════

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis,
  LabelList, RadialBar, RadialBarChart,
  ResponsiveContainer, Tooltip, Legend, Cell,
} from "recharts";

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

function dedupeComp<T extends { categoria?: string; periodo?: string }>(arr: T[]): T[] {
  if (!Array.isArray(arr)) return arr;
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of arr) {
    const key = `${row.categoria ?? ""}__${row.periodo ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
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

function Sidebar({ activeKey, onSelect, modulos }: { activeKey: Modulo; onSelect: (k: Modulo) => void; modulos: ModuloDef[] }) {
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
          {(["Operación", "Control"] as const).map(g => {
            const groupModulos = modulos.filter(m => m.group === g);
            if (groupModulos.length === 0) return null;
            return (
              <div key={g}>
                {expanded && <p className="px-2 pb-1 text-[9.5px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">{g}</p>}
                <ul className="space-y-1">
                  {groupModulos.map(m => {
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
            );
          })}
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
  const { session } = useAuth();

  // jul 2026 — Mismo filtrado que `visibleReportModules` en ReportsPage.tsx:
  // ocultamos del sidebar de Estadísticas los módulos que la empresa no
  // tiene activos. Sin `companyId` en la sesión (UI master) no filtramos.
  const companyModules = (session?.companyModules ?? []) as string[];
  const hasCompanyContext = !!session?.companyId;
  // jul 2026 v9 — Gate del botón "Informe completo" (línea ~697). El
  // informe lo genera la IA (Groq); si la empresa no tiene el módulo
  // `jarvis` habilitado en su plan, el botón no debe aparecer. Coincide
  // con el gating de `getGroqKeyForCompany` en el backend.
  const hasJarvis = !hasCompanyContext || companyModules.includes("jarvis");
  const visibleModulos = useMemo(() => {
    if (!hasCompanyContext) return MODULOS;
    if (companyModules.length === 0) return MODULOS;
    return MODULOS.filter((m) => !m.requiresModule || companyModules.includes(m.requiresModule));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyModules, hasCompanyContext]);

  const [moduloKey, setModuloKey] = useState<Modulo>(() => visibleModulos[0]?.key ?? "mantenimiento");
  const [periodo, setPeriodo]     = useState<Periodo>("month");

  const [fechaDesde, setFechaDesde]     = useState(daysFromNowEcuador(-90));
  const [fechaHasta, setFechaHasta]     = useState(todayEcuador());
  const [fechaApDesde, setFechaApDesde] = useState(fechaDesde);
  const [fechaApHasta, setFechaApHasta] = useState(fechaHasta);
  const [dateOpen, setDateOpen]         = useState(false);
  const [informeOpen, setInformeOpen]   = useState(false);
  const [assetId]  = useState<number | null>(null);
  const [driverId] = useState<number | null>(null);

  // jul 2026 — Si moduloKey quedó apuntando a un módulo que la empresa no
  // tiene habilitado (cambió de plan, o quedó guardado de una sesión
  // vieja), caemos al primero visible. Mismo fallback que en ReportsPage.
  useEffect(() => {
    if (!visibleModulos.some((m) => m.key === moduloKey)) {
      setModuloKey(visibleModulos[0]?.key ?? "mantenimiento");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleModulos]);

  const modulo = useMemo(
    () => visibleModulos.find(m => m.key === moduloKey) ?? visibleModulos[0] ?? MODULOS[0],
    [visibleModulos, moduloKey],
  );
  const { exportar, loading: exporting } = useExportarPDF();

  const { data, loading, error, refetch } = useEstadisticas({
    companyId, modulo: modulo.key, periodo,
    fecha: fechaApDesde, fechaHasta: fechaApHasta, assetId, driverId,
  });

  function applyDates() { setFechaApDesde(fechaDesde); setFechaApHasta(fechaHasta); setDateOpen(false); }

  function setPeriodoAndApply(p: Periodo) {
    setPeriodo(p);
    const today = todayEcuador();
    if (p === "month") {
      setFechaApDesde(todayEcuador().slice(0, 7) + "-01");
      setFechaApHasta(today);
    } else if (p === "quarter") {
      const startMonth = Math.floor(new Date(today).getMonth() / 3) * 3;
      const d = new Date(today);
      d.setMonth(startMonth, 1);
      const isoStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
      const end = new Date(d);
      end.setMonth(startMonth + 3, 0);
      const isoEnd = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
      setFechaApDesde(isoStart);
      setFechaApHasta(isoEnd);
    } else {
      const y = new Date(today).getFullYear();
      setFechaApDesde(`${y}-01-01`);
      setFechaApHasta(today);
    }
  }

  return (
    <div className="flex items-start gap-4">
      <Sidebar activeKey={modulo.key} onSelect={setModuloKey} modulos={visibleModulos} />
      <AnimatePresence mode="wait">
        <motion.div key={modulo.key}
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
                  <button key={p.key} type="button" onClick={() => setPeriodoAndApply(p.key)}
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
                  <DatePicker compact label="Desde" value={fechaDesde} onChange={setFechaDesde} maxDate={fechaHasta} />
                  <span className="text-xs text-gray-400">—</span>
                  <DatePicker compact label="Hasta" value={fechaHasta} onChange={setFechaApHasta} minDate={fechaDesde} />
                  <button type="button" onClick={applyDates}
                    className="rounded-xl bg-gray-900 hover:bg-gray-800 dark:bg-white dark:text-gray-900 px-3 py-1.5 text-[12px] font-bold text-white">Aplicar</button>
                </div>
              )}
              <button type="button" onClick={() => refetch()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] px-3 py-1.5 text-[12px] font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/[0.04]">
                <RefreshCw size={11} className={loading ? "animate-spin" : ""} /> Refrescar
              </button>
              {/* jul 2026 v9 — El botón "Informe completo" sólo aparece si la
                  empresa tiene el módulo `jarvis` (Asistente IA) en su plan.
                  Sin jarvis, el backend devuelve 503 al pedir el informe y
                  la UX queda mejor simplemente ocultando el control. */}
              {hasJarvis && (
                <button type="button" onClick={() => setInformeOpen((v) => !v)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[12px] font-semibold transition ${
                    informeOpen
                      ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-gray-200"
                  }`}>
                  <Sparkles size={11} /> {informeOpen ? "Ocultar informe" : "Informe completo"}
                </button>
              )}
              <button type="button" disabled={exporting}
                onClick={() => exportar({ companyId, modulo: modulo.key, periodo, fecha: fechaApDesde, fechaHasta: fechaApHasta, assetId, driverId })}
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
                {data.kpis.map(k => <KpiCard key={k.label} kpi={k} color={modulo.color} onClick={() => navigate(`${MODULE_ROUTES[modulo.key]}?from=${fechaApDesde}&to=${fechaApHasta}&kpi=${encodeURIComponent(k.label)}`)} />)}
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