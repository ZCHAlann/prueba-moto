"use client";
// ─────────────────────────────────────────────────────────────────────
// pages/Reports/EstadisticasTab.tsx
// Submódulo "reportes > estadisticas".
//
// Vista con 4 KPIs + 6 charts por módulo. 11 módulos soportados:
// mantenimiento, combustible, flotas, conductores, checklists, alertas,
// inventario, ac, seguros, peajes, asignaciones.
//
// Estilo: plano, SIN gradientes. Color de acento único (azul) en chips
// y bordes. Filtros: módulo, período (Mensual/Trimestral/Anual),
// rango Desde/Hasta, activo, conductor.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart, Area,
  LineChart, Line,
  BarChart, Bar,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from "recharts";
import {
  TrendingUp, TrendingDown, AlertTriangle, RefreshCw, Sparkles, Gauge,
  Wrench, Fuel, Truck, Calendar, Filter, BarChart3, History,
  Minus, Info, Activity, DollarSign, ClipboardList, Droplet,
  Users, Shield, Package, MapPin, FileText, Bell, Map, AirVent,
  ChevronRight, X, FileDown, ExternalLink, GitCompareArrows, Plus, Trash2,
} from "lucide-react";
import { useEstadisticas, useAnomalias, useRedetectarAnomalias, useAnalisisIA, useExportarPDF, useEstadisticasMulti, type Modulo, type Periodo, type KpiItem, type AnomaliaItem, type AIInsights, type SaludFlota, type ScorecardItem, type TcoItem, type MultiRango } from "../../hooks/useEstadisticas";
import { useAssets } from "../../hooks/useAssets";
import { useDrivers } from "../../hooks/useDrivers";
import { DatePicker } from "../../components/ui/date-picker/DatePicker";

// ─── Constants ──────────────────────────────────────────────────────

const MODULOS: Array<{ key: Modulo; label: string; icon: React.ReactNode }> = [
  { key: "mantenimiento", label: "Mantenimiento", icon: <Wrench size={13} /> },
  { key: "combustible",   label: "Combustible",   icon: <Fuel size={13} /> },
  { key: "flotas",        label: "Flotas",        icon: <Truck size={13} /> },
  { key: "conductores",   label: "Conductores",   icon: <Users size={13} /> },
  { key: "checklists",    label: "Checklists",    icon: <ClipboardList size={13} /> },
  { key: "alertas",       label: "Alertas",       icon: <Bell size={13} /> },
  { key: "inventario",    label: "Inventario",    icon: <Package size={13} /> },
  { key: "ac",            label: "Aires Acond.",  icon: <AirVent size={13} /> },
  { key: "seguros",       label: "Seguros",       icon: <Shield size={13} /> },
  { key: "peajes",        label: "Peajes",        icon: <MapPin size={13} /> },
  { key: "asignaciones",  label: "Asignaciones",  icon: <FileText size={13} /> },
];

const PERIODOS: Array<{ key: Periodo; label: string }> = [
  { key: "month",   label: "Mensual" },
  { key: "quarter", label: "Trimestral" },
  { key: "year",    label: "Anual" },
];

// Paleta neutra (sin gradientes) para los charts.
const CHART_COLORS = [
  "#3B82F6", // blue
  "#10B981", // emerald
  "#F59E0B", // amber
  "#EF4444", // red
  "#8B5CF6", // violet
  "#06B6D4", // cyan
];

// ─── Helpers ────────────────────────────────────────────────────────

function fmtNumber(n: number, d = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("es-EC", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtPct(n: number | undefined): { text: string; tone: "up" | "down" | "flat" } {
  if (n == null || !Number.isFinite(n)) return { text: "—", tone: "flat" };
  const v = Math.round(n * 10) / 10;
  if (Math.abs(v) < 0.1) return { text: "0%", tone: "flat" };
  return { text: `${v > 0 ? "+" : ""}${v.toFixed(1)}%`, tone: v > 0 ? "up" : "down" };
}

function fmtBucketLabel(b: string, periodo: Periodo): string {
  if (periodo === "year") return b;
  if (periodo === "quarter") return b.replace("-", " ");
  const [y, m] = b.split("-");
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${months[Number(m) - 1] || m} ${y.slice(2)}`;
}

function kpiIcon(icono?: string) {
  switch (icono) {
    case "dollar-sign":     return <DollarSign size={13} />;
    case "trending-up":     return <TrendingUp size={13} />;
    case "alert-triangle":  return <AlertTriangle size={13} />;
    case "clipboard-list":  return <ClipboardList size={13} />;
    case "fuel":            return <Fuel size={13} />;
    case "droplet":         return <Droplet size={13} />;
    case "truck":           return <Truck size={13} />;
    case "check-circle":    return <Activity size={13} />;
    case "activity":        return <Activity size={13} />;
    case "calendar":        return <Calendar size={13} />;
    case "users":           return <Users size={13} />;
    case "shield":          return <Shield size={13} />;
    case "package":         return <Package size={13} />;
    case "map-pin":         return <MapPin size={13} />;
    case "file-text":       return <FileText size={13} />;
    case "map":             return <Map size={13} />;
    case "bell":            return <Bell size={13} />;
    default:                return <Info size={13} />;
  }
}

// ─── KPI Card ───────────────────────────────────────────────────────

function KpiCard({ kpi }: { kpi: KpiItem }) {
  const v = fmtPct(kpi.variacionPct);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
      <div className="flex items-center gap-1.5">
        <span className="text-gray-400 dark:text-gray-500">{kpiIcon(kpi.icono)}</span>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {kpi.label}
        </p>
      </div>
      <p className="mt-1.5 text-xl font-bold tabular-nums text-gray-800 dark:text-white">
        {typeof kpi.valor === "number" ? fmtNumber(kpi.valor, 0) : kpi.valor}
        {kpi.unidad && (
          <span className="ml-1 text-[11px] font-medium text-gray-400">{kpi.unidad}</span>
        )}
      </p>
      <div className="mt-1.5 flex items-center gap-1">
        {v.tone === "up"   && <span className="inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"><TrendingUp size={9} />{v.text}</span>}
        {v.tone === "down" && <span className="inline-flex items-center gap-0.5 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"><TrendingDown size={9} />{v.text}</span>}
        {v.tone === "flat" && <span className="inline-flex items-center gap-0.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:bg-white/5 dark:text-gray-400"><Minus size={9} />{v.text}</span>}
        <span className="text-[9px] text-gray-400 dark:text-gray-500">vs período anterior</span>
      </div>
    </div>
  );
}

// ─── Chart card wrapper ─────────────────────────────────────────────

function ChartCard({ title, subtitle, children, span = 1 }: { title: string; subtitle?: string; children: React.ReactNode; span?: 1 | 2 }) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-3.5 dark:border-white/[0.06] dark:bg-white/[0.03] ${span === 2 ? "sm:col-span-2" : ""}`}>
      <div className="mb-2.5">
        <p className="text-[11px] font-semibold text-gray-800 dark:text-white">{title}</p>
        {subtitle && <p className="text-[10px] text-gray-400 dark:text-gray-500">{subtitle}</p>}
      </div>
      <div style={{ width: "100%", height: 200 }}>{children}</div>
    </div>
  );
}

// ─── Tooltip genérico ───────────────────────────────────────────────

function MiniTooltip({ active, payload, label, unidad }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-gray-200 bg-white/95 px-2.5 py-1.5 text-xs shadow-md backdrop-blur dark:border-white/[0.08] dark:bg-gray-900/95">
      <p className="font-mono text-[10px] text-gray-500 dark:text-gray-400">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="mt-0.5 flex items-center gap-1.5 font-bold tabular-nums" style={{ color: p.color || p.fill }}>
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          {fmtNumber(p.value, 0)} {unidad && <span className="text-[10px] font-normal text-gray-400">{unidad}</span>}
          {p.payload?.proyectado && <span className="ml-1 rounded bg-violet-100 px-1 text-[9px] font-bold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">PROY</span>}
        </p>
      ))}
    </div>
  );
}

// ─── Charts por tipo ────────────────────────────────────────────────

function LineWithProjection({ data, periodo, unidad }: { data: { x: string; y: number; proyectado?: boolean }[]; periodo: Periodo; unidad: string }) {
  const color = CHART_COLORS[0];
  const formatted = data.map((d) => ({ ...d, label: fmtBucketLabel(d.x, periodo) }));
  return (
    <ResponsiveContainer>
      <AreaChart data={formatted} margin={{ top: 4, right: 6, left: -22, bottom: 0 }}>
        <defs>
          <linearGradient id="grad-stats" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0}    />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 6" stroke="rgba(120,120,140,0.10)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 9, fill: "currentColor", opacity: 0.5 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 9, fill: "currentColor", opacity: 0.5 }} axisLine={false} tickLine={false} width={38} />
        <Tooltip content={<MiniTooltip unidad={unidad} />} cursor={{ stroke: `${color}40`, strokeWidth: 1, strokeDasharray: "3 3" }} />
        <Area type="monotone" dataKey="y" stroke={color} strokeWidth={2} fill="url(#grad-stats)" dot={false} activeDot={{ r: 3, fill: color }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function BarV({ data }: { data: { x: string; y: number }[] }) {
  return (
    <ResponsiveContainer>
      <BarChart data={data} margin={{ top: 4, right: 6, left: -22, bottom: 0 }}>
        <CartesianGrid strokeDasharray="2 6" stroke="rgba(120,120,140,0.10)" vertical={false} />
        <XAxis dataKey="x" tick={{ fontSize: 9, fill: "currentColor", opacity: 0.5 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 9, fill: "currentColor", opacity: 0.5 }} axisLine={false} tickLine={false} width={38} />
        <Tooltip content={<MiniTooltip />} cursor={{ fill: "rgba(99,102,241,0.08)" }} />
        <Bar dataKey="y" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function BarH({ data, unidad }: { data: { label: string; value: number; meta?: string }[]; unidad: string }) {
  return (
    <ResponsiveContainer>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="2 6" stroke="rgba(120,120,140,0.10)" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 9, fill: "currentColor", opacity: 0.5 }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" tick={{ fontSize: 9, fill: "currentColor", opacity: 0.7 }} axisLine={false} tickLine={false} width={80} />
        <Tooltip content={<MiniTooltip unidad={unidad} />} cursor={{ fill: "rgba(99,102,241,0.08)" }} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function RadarStat({ data }: { data: { axis: string; value: number }[] }) {
  return (
    <ResponsiveContainer>
      <RadarChart data={data} margin={{ top: 4, right: 12, left: 12, bottom: 0 }}>
        <PolarGrid stroke="rgba(120,120,140,0.18)" />
        <PolarAngleAxis dataKey="axis" tick={{ fontSize: 9, fill: "currentColor", opacity: 0.7 }} />
        <PolarRadiusAxis tick={{ fontSize: 8, fill: "currentColor", opacity: 0.4 }} angle={90} />
        <Tooltip content={<MiniTooltip />} />
        <Radar name="valor" dataKey="value" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.22} strokeWidth={2} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

function ComparacionBars({ data }: { data: { label: string; actual: number; anterior: number }[] }) {
  return (
    <ResponsiveContainer>
      <BarChart data={data} margin={{ top: 4, right: 6, left: -22, bottom: 0 }}>
        <CartesianGrid strokeDasharray="2 6" stroke="rgba(120,120,140,0.10)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 9, fill: "currentColor", opacity: 0.5 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 9, fill: "currentColor", opacity: 0.5 }} axisLine={false} tickLine={false} width={38} />
        <Tooltip content={<MiniTooltip />} cursor={{ fill: "rgba(99,102,241,0.08)" }} />
        <Legend wrapperStyle={{ fontSize: 10 }} iconType="circle" />
        <Bar dataKey="anterior" fill="#94A3B8" radius={[4, 4, 0, 0]} name="Anterior" />
        <Bar dataKey="actual"   fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} name="Actual" />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Panel de Salud de Flota (Fase 5) ─────────────────────────────

function riskTone(level: ScorecardItem["riskLevel"]) {
  switch (level) {
    case "saludable": return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30";
    case "atencion":  return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30";
    case "riesgo":    return "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:border-orange-500/30";
    case "critico":   return "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30";
  }
}

function riskLabel(level: ScorecardItem["riskLevel"]) {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

function saludFlotaColor(avg: number): { bar: string; text: string } {
  if (avg >= 80) return { bar: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300" };
  if (avg >= 60) return { bar: "bg-amber-500",   text: "text-amber-700 dark:text-amber-300" };
  if (avg >= 40) return { bar: "bg-orange-500",  text: "text-orange-700 dark:text-orange-300" };
  return            { bar: "bg-rose-500",    text: "text-rose-700 dark:text-rose-300" };
}

function SaludFlotaPanel({ salud }: { salud: SaludFlota }) {
  const tone = saludFlotaColor(salud.fleetAvgScore);
  const totalTCO = salud.tco.reduce((a, t) => a + t.tco.total, 0);
  const fleetKm  = salud.tco.reduce((a, t) => a + t.tco.kmRecorridos, 0);
  const fleetCostPerKm = fleetKm > 0 ? totalTCO / fleetKm : 0;

  return (
    <div className="space-y-3">
      {/* Header de salud de flota */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Score promedio */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300">
              <Gauge size={13} />
            </span>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Scorecard promedio</p>
          </div>
          <p className={`mt-2 text-3xl font-black tabular-nums ${tone.text}`}>{salud.fleetAvgScore}</p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/5">
            <div className={`h-full ${tone.bar}`} style={{ width: `${salud.fleetAvgScore}%` }} />
          </div>
          <p className="mt-1.5 text-[10px] text-gray-400 dark:text-gray-500">
            {salud.fleetAvgScore >= 80 ? "Flota saludable" :
             salud.fleetAvgScore >= 60 ? "Flota requiere atención" :
             salud.fleetAvgScore >= 40 ? "Flota en riesgo" : "Flota crítica"}
          </p>
        </div>

        {/* TCO total 12m */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300">
              <DollarSign size={13} />
            </span>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">TCO 12 meses</p>
          </div>
          <p className="mt-2 text-3xl font-black tabular-nums text-gray-800 dark:text-white">${fmtNumber(totalTCO, 0)}</p>
          <p className="mt-1.5 text-[10px] text-gray-400 dark:text-gray-500">
            {fmtNumber(fleetCostPerKm, 2)} USD/km · {fmtNumber(fleetKm, 0)} km
          </p>
        </div>

        {/* Desglose por componente */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Composición del TCO</p>
          <div className="mt-2.5 space-y-1">
            {[
              { label: "Combustible",   value: salud.tco.reduce((a, t) => a + t.tco.combustible,   0) },
              { label: "Mantenimiento", value: salud.tco.reduce((a, t) => a + t.tco.mantenimiento, 0) },
              { label: "Peajes",        value: salud.tco.reduce((a, t) => a + t.tco.peajes,        0) },
            ].map((row) => {
              const pct = totalTCO > 0 ? (row.value / totalTCO) * 100 : 0;
              return (
                <div key={row.label}>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-gray-600 dark:text-gray-300">{row.label}</span>
                    <span className="font-mono tabular-nums text-gray-500 dark:text-gray-400">${fmtNumber(row.value, 0)} · {pct.toFixed(0)}%</span>
                  </div>
                  <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/5">
                    <div className="h-full bg-gray-700 dark:bg-gray-300" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top 5 vehículos por scorecard y TCO */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Top Riesgo */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <div className="mb-2.5 flex items-center gap-2">
            <AlertTriangle size={13} className="text-orange-600 dark:text-orange-400" />
            <p className="text-[11px] font-semibold text-gray-800 dark:text-white">Top 5 vehículos con peor scorecard</p>
          </div>
          {salud.topRiesgo.length === 0 ? (
            <p className="py-4 text-center text-[11px] text-gray-400">Sin datos.</p>
          ) : (
            <div className="space-y-1.5">
              {salud.topRiesgo.map((s) => (
                <ScorecardRow key={s.assetId} s={s} />
              ))}
            </div>
          )}
        </div>

        {/* Top TCO */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <div className="mb-2.5 flex items-center gap-2">
            <DollarSign size={13} className="text-gray-600 dark:text-gray-400" />
            <p className="text-[11px] font-semibold text-gray-800 dark:text-white">Top 5 vehículos con mayor TCO (12m)</p>
          </div>
          {salud.topTco.length === 0 ? (
            <p className="py-4 text-center text-[11px] text-gray-400">Sin datos.</p>
          ) : (
            <div className="space-y-1.5">
              {salud.topTco.map((t) => (
                <TcoRow key={t.assetId} t={t} maxTotal={salud.topTco[0]?.tco.total ?? 1} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ScorecardRow({ s }: { s: ScorecardItem }) {
  return (
    <a
      href={`/flotas`}
      onClick={(e) => e.preventDefault()}
      className="block rounded-lg border border-gray-200 bg-white p-2 transition hover:border-gray-300 hover:bg-gray-50 dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:bg-white/[0.04]"
    >
      <div className="flex items-center gap-2.5">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold ${riskTone(s.riskLevel)}`}>
          {s.score}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[12px] font-semibold text-gray-800 dark:text-white">{s.plate || s.name}</p>
            <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${riskTone(s.riskLevel)}`}>
              {riskLabel(s.riskLevel)}
            </span>
          </div>
          <p className="truncate text-[10px] text-gray-500 dark:text-gray-400">{s.recomendacion}</p>
        </div>
        <ExternalLink size={11} className="shrink-0 text-gray-400" />
      </div>
    </a>
  );
}

function TcoRow({ t, maxTotal }: { t: TcoItem; maxTotal: number }) {
  const pct = maxTotal > 0 ? (t.tco.total / maxTotal) * 100 : 0;
  return (
    <a
      href={`/flotas`}
      onClick={(e) => e.preventDefault()}
      className="block rounded-lg border border-gray-200 bg-white p-2 transition hover:border-gray-300 hover:bg-gray-50 dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:bg-white/[0.04]"
    >
      <div className="flex items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <p className="truncate text-[12px] font-semibold text-gray-800 dark:text-white">{t.plate || t.name}</p>
            <p className="ml-2 shrink-0 text-[12px] font-bold tabular-nums text-gray-800 dark:text-white">${fmtNumber(t.tco.total, 0)}</p>
          </div>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/5">
            <div className="h-full bg-gray-700 dark:bg-gray-300" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 flex items-center gap-2 text-[9px] tabular-nums text-gray-400 dark:text-gray-500">
            <span>${fmtNumber(t.tco.combustible, 0)} comb.</span>
            <span>·</span>
            <span>${fmtNumber(t.tco.mantenimiento, 0)} mant.</span>
            <span>·</span>
            <span>{t.tco.kmRecorridos > 0 ? fmtNumber(t.tco.costoPorKm, 2) + " USD/km" : "sin km"}</span>
          </div>
        </div>
      </div>
    </a>
  );
}

// ─── Anomalías ──────────────────────────────────────────────────────

function AnomaliaCard({ a }: { a: AnomaliaItem }) {
  const sevColor: Record<string, string> = {
    alta:  "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-300",
    media: "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300",
    baja:  "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-500/10 dark:border-blue-500/30 dark:text-blue-300",
  };
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border p-2.5 ${sevColor[a.severidad]}`}>
      <AlertTriangle size={12} className="mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-wider">{a.severidad}</span>
          {a.dimensionLabel && <span className="text-[11px] font-semibold">· {a.dimensionLabel}</span>}
        </div>
        <p className="mt-0.5 text-[11px]">{a.descripcion}</p>
        {a.detectadoEn && <p className="mt-1 text-[9px] opacity-70">{new Date(a.detectadoEn).toLocaleString("es-EC")}</p>}
      </div>
    </div>
  );
}

// ─── Panel Multi-Período (Fase 5) ─────────────────────────────────

const PALETTE_RANGOS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4"];

function MultiPeriodoPanel({
  companyId, modulo, periodo,
}: {
  companyId: string;
  modulo: Modulo;
  periodo: Periodo;
}) {
  // ── Estado local de rangos ────────────────────────────────
  const [rangos, setRangos] = useState<MultiRango[]>(() => defaultRangos(periodo));

  // Si cambia el período, regeneramos defaults solo si el usuario no ha
  // tocado nada (en este MVP, siempre regeneramos al cambiar periodo).
  useEffect(() => {
    setRangos(defaultRangos(periodo));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo]);

  const { data, loading, error, refetch } = useEstadisticasMulti({
    companyId, modulo, rangos, periodo,
  });

  // Helpers
  function addRango() {
    const last = rangos[rangos.length - 1];
    const start = last ? nextMonth(new Date(last.hasta)) : new Date();
    const end   = new Date(start);
    end.setMonth(end.getMonth() + 1);
    setRangos((prev) => [
      ...prev,
      {
        id:    `r${prev.length}-${start.toISOString().slice(0,10)}`,
        label: `R${prev.length + 1}`,
        desde: start.toISOString().slice(0, 10),
        hasta: end.toISOString().slice(0, 10),
      },
    ]);
  }
  function updateRango(id: string, patch: Partial<MultiRango>) {
    setRangos((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function removeRango(id: string) {
    setRangos((prev) => prev.filter((r) => r.id !== id));
  }
  function applyPreset(preset: "anterior" | "yoy" | "qAnterior") {
    setRangos(defaultRangos(periodo, preset));
  }

  return (
    <div className="space-y-3">
      {/* Selector de rangos */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            <GitCompareArrows size={11} /> Rangos a comparar
          </span>
          {([
            { key: "anterior",  label: "+ Período anterior" },
            { key: "qAnterior", label: "+ Q anterior"      },
            { key: "yoy",       label: "+ Año pasado"      },
          ] as const).map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPreset(p.key)}
              className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300 dark:hover:bg-white/[0.06]"
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={addRango}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300 dark:hover:bg-white/[0.06]"
          >
            <Plus size={10} /> Custom
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={loading}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300 dark:hover:bg-white/[0.06]"
          >
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
            Refrescar
          </button>
        </div>

        {/* Lista de rangos */}
        <div className="mt-2 space-y-1.5">
          {rangos.map((r, i) => (
            <div key={r.id} className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: PALETTE_RANGOS[i % PALETTE_RANGOS.length] }}
              />
              <input
                value={r.label}
                onChange={(e) => updateRango(r.id, { label: e.target.value })}
                className="h-7 w-32 rounded border border-gray-200 bg-white px-2 text-[11px] dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200"
                placeholder="Etiqueta"
              />
              <input
                type="date"
                value={r.desde}
                onChange={(e) => updateRango(r.id, { desde: e.target.value })}
                className="h-7 rounded border border-gray-200 bg-white px-2 text-[11px] dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200"
              />
              <span className="text-[10px] text-gray-400">→</span>
              <input
                type="date"
                value={r.hasta}
                onChange={(e) => updateRango(r.id, { hasta: e.target.value })}
                className="h-7 rounded border border-gray-200 bg-white px-2 text-[11px] dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200"
              />
              {rangos.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRango(r.id)}
                  className="ml-auto rounded-md p-1 text-gray-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                  title="Quitar rango"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Warnings */}
      {data?.warnings?.map((w, i) => (
        <p key={i} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          {w}
        </p>
      ))}

      {loading && !data ? (
        <div className="flex items-center justify-center gap-2.5 py-12 text-gray-400">
          <RefreshCw size={16} className="animate-spin" />
          <span className="text-sm">Calculando multi-período…</span>
        </div>
      ) : error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </div>
      ) : data ? (
        <>
          {/* Tabla de KPIs multi-columna */}
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/[0.06]">
                  <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-semibold text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">KPI</th>
                  {data.rangos.map((r, i) => (
                    <th key={r.id} className="px-3 py-2 text-right font-semibold" style={{ color: PALETTE_RANGOS[i % PALETTE_RANGOS.length] }}>
                      {r.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.kpis.map((kpi, i) => (
                  <tr key={kpi.label} className={i % 2 === 0 ? "bg-gray-50/40 dark:bg-white/[0.02]" : ""}>
                    <td className="sticky left-0 z-10 bg-inherit px-3 py-2 font-medium text-gray-700 dark:text-gray-300">
                      {kpi.label}
                    </td>
                    {data.rangos.map((r) => {
                      const v = kpi.porRango[r.id];
                      const variacion = v?.variacionPct;
                      return (
                        <td key={r.id} className="px-3 py-2 text-right">
                          <div className="font-bold tabular-nums text-gray-800 dark:text-white">
                            {typeof v?.valor === "number" ? fmtNumber(v.valor as number, 0) : (v?.valor ?? "—")}
                            {v?.unidad && <span className="ml-1 text-[10px] font-normal text-gray-400">{v.unidad}</span>}
                          </div>
                          {variacion != null && Math.abs(variacion) >= 0.1 && (
                            <div className="mt-0.5 text-[9px] tabular-nums">
                              {variacion > 0
                                ? <span className="text-emerald-600 dark:text-emerald-400">+{variacion.toFixed(1)}%</span>
                                : <span className="text-rose-600 dark:text-rose-400">{variacion.toFixed(1)}%</span>}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Line chart multi-serie */}
          <div className="rounded-xl border border-gray-200 bg-white p-3.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
            <p className="mb-2.5 text-[11px] font-semibold text-gray-800 dark:text-white">{data.lineChart.title}</p>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <LineChart data={data.lineChart.data} margin={{ top: 6, right: 12, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 6" stroke="rgba(120,120,140,0.10)" vertical={false} />
                  <XAxis dataKey="x" tick={{ fontSize: 9, fill: "currentColor", opacity: 0.5 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: "currentColor", opacity: 0.5 }} axisLine={false} tickLine={false} width={38} />
                  <Tooltip content={<MultiTooltip rangos={data.rangos} unidad={data.lineChart.unidad} />} />
                  <Legend wrapperStyle={{ fontSize: 10 }} iconType="circle" />
                  {data.rangos.map((r, i) => (
                    <Line
                      key={r.id}
                      type="monotone"
                      dataKey={r.id}
                      name={r.label}
                      stroke={PALETTE_RANGOS[i % PALETTE_RANGOS.length]}
                      strokeWidth={2.2}
                      dot={false}
                      activeDot={{ r: 4 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabla Top multi-columna */}
          {data.barHChart.data.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-white/[0.06]">
                    <th className="bg-white px-3 py-2 text-left font-semibold text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
                      {data.barHChart.title}
                    </th>
                    {data.rangos.map((r, i) => (
                      <th key={r.id} className="px-3 py-2 text-right font-semibold" style={{ color: PALETTE_RANGOS[i % PALETTE_RANGOS.length] }}>
                        {r.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.barHChart.data.map((row, i) => (
                    <tr key={String(row.label)} className={i % 2 === 0 ? "bg-gray-50/40 dark:bg-white/[0.02]" : ""}>
                      <td className="bg-inherit px-3 py-2 font-medium text-gray-700 dark:text-gray-300">{row.label}</td>
                      {data.rangos.map((r) => {
                        const v = row[r.id];
                        return (
                          <td key={r.id} className="px-3 py-2 text-right font-mono tabular-nums text-gray-800 dark:text-white">
                            {typeof v === "number" ? fmtNumber(v, 0) : (v ?? "—")}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Anomalías multi-rango */}
          {data.anomalias.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-3.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
              <p className="mb-2.5 text-[11px] font-semibold text-gray-800 dark:text-white">
                Anomalías detectadas ({data.anomalias.length})
              </p>
              <div className="space-y-1.5">
                {data.anomalias.slice(0, 10).map((a, i) => {
                  const r = data.rangos.find((x) => x.id === a.rangoId);
                  const idx = data.rangos.findIndex((x) => x.id === a.rangoId);
                  return (
                    <div key={i} className="flex items-start gap-2 rounded-md border border-gray-200 bg-white p-2 dark:border-white/[0.06] dark:bg-white/[0.02]">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: PALETTE_RANGOS[idx % PALETTE_RANGOS.length] }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded bg-rose-50 px-1 py-0.5 text-[9px] font-bold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">{a.severidad.toUpperCase()}</span>
                          <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">{a.dimensionLabel}</span>
                          {r && <span className="text-[10px] text-gray-400">· {r.label}</span>}
                        </div>
                        <p className="mt-0.5 text-[11px] text-gray-600 dark:text-gray-400">{a.descripcion}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function MultiTooltip({ active, payload, label, rangos, unidad }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-gray-200 bg-white/95 px-2.5 py-1.5 text-xs shadow-md backdrop-blur dark:border-white/[0.08] dark:bg-gray-900/95">
      <p className="font-mono text-[10px] text-gray-500 dark:text-gray-400">{label}</p>
      {payload.map((p: any, i: number) => {
        const r = rangos.find((x: MultiRango) => x.id === p.dataKey);
        return (
          <p key={i} className="mt-0.5 flex items-center gap-1.5 font-bold tabular-nums" style={{ color: p.color }}>
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
            {r?.label ?? p.dataKey}: {fmtNumber(p.value, 0)} {unidad && <span className="text-[10px] font-normal text-gray-400">{unidad}</span>}
          </p>
        );
      })}
    </div>
  );
}

function nextMonth(d: Date): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + 1);
  return x;
}

function defaultRangos(periodo: Periodo, preset?: "anterior" | "yoy" | "qAnterior"): MultiRango[] {
  const today = new Date();
  const start = startOfBucket(today, periodo);
  const endPrev = new Date(start.getTime() - 1);

  const result: MultiRango[] = [
    {
      id:    "actual",
      label: "Actual",
      desde: start.toISOString().slice(0, 10),
      hasta: today.toISOString().slice(0, 10),
    },
  ];
  if (preset === "yoy" || !preset) {
    const yoyStart = new Date(start); yoyStart.setFullYear(yoyStart.getFullYear() - 1);
    const yoyEnd   = new Date(endPrev);  yoyEnd.setFullYear(yoyEnd.getFullYear() - 1);
    result.push({
      id:    "yoy",
      label: `Año pasado (${yoyStart.getFullYear()})`,
      desde: yoyStart.toISOString().slice(0, 10),
      hasta: yoyEnd.toISOString().slice(0, 10),
    });
  }
  if (preset === "anterior" || preset === "qAnterior") {
    const prevStart = new Date(start);
    if (periodo === "month")   prevStart.setMonth(prevStart.getMonth() - 1);
    else if (periodo === "quarter") prevStart.setMonth(prevStart.getMonth() - 3);
    else                        prevStart.setFullYear(prevStart.getFullYear() - 1);
    const prevEnd = new Date(start.getTime() - 1);
    result.push({
      id:    "prev",
      label: "Período anterior",
      desde: prevStart.toISOString().slice(0, 10),
      hasta: prevEnd.toISOString().slice(0, 10),
    });
  }
  return result;
}

function startOfBucket(ref: Date, periodo: Periodo): Date {
  if (periodo === "year") return new Date(Date.UTC(ref.getUTCFullYear(), 0, 1));
  if (periodo === "quarter") {
    const m = Math.floor(ref.getUTCMonth() / 3) * 3;
    return new Date(Date.UTC(ref.getUTCFullYear(), m, 1));
  }
  return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
}

// ─── Panel de Análisis IA ──────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  alta:  "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-300",
  media: "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300",
  baja:  "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-500/10 dark:border-blue-500/30 dark:text-blue-300",
};

function AIInsightsPanel({
  companyId, modulo, periodo, fecha, fechaHasta, assetId, driverId,
}: {
  companyId: string;
  modulo: Modulo;
  periodo: Periodo;
  fecha: string;
  fechaHasta: string;
  assetId: number | null;
  driverId: number | null;
}) {
  const { data, loading, error, regenerar } = useAnalisisIA({
    companyId, modulo, periodo, fecha, fechaHasta, assetId, driverId,
  });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300">
          <Sparkles size={13} />
        </span>
        <div className="flex-1">
          <p className="text-[11px] font-semibold text-gray-800 dark:text-white">Análisis IA · {modulo}</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500">
            {data
              ? `${data.fromCache ? "Caché" : "Generado"} por ${data.model} · ${data.latencyMs}ms · ${data.inputTokens}+${data.outputTokens} tokens`
              : "Interpretación ejecutiva de los datos."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => regenerar()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300 dark:hover:bg-white/[0.06]"
        >
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
          {loading ? "Generando…" : data?.fromCache ? "Regenerar" : "Refrescar"}
        </button>
      </div>

      {loading && !data ? (
        <div className="flex items-center gap-2.5 py-6 text-gray-400">
          <RefreshCw size={14} className="animate-spin" />
          <span className="text-[11px]">Analizando con IA…</span>
        </div>
      ) : error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </div>
      ) : data ? (
        <AIInsightsBody insights={data.insights} />
      ) : null}
    </div>
  );
}

function AIInsightsBody({ insights }: { insights: AIInsights }) {
  return (
    <div className="space-y-3">
      {insights.resumenEjecutivo && (
        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-[12px] leading-relaxed text-gray-700 dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-gray-200">
          {insights.resumenEjecutivo}
        </div>
      )}

      {insights.puntosClave.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Puntos clave</p>
          <ul className="space-y-1">
            {insights.puntosClave.map((p, i) => (
              <li key={i} className="flex gap-2 text-[11px] text-gray-700 dark:text-gray-300">
                <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-gray-400 dark:bg-gray-500" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}

      {insights.recomendaciones.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Recomendaciones</p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {insights.recomendaciones.map((r, i) => (
              <div key={i} className={`rounded-md border p-2.5 ${PRIORITY_COLORS[r.prioridad] ?? PRIORITY_COLORS.baja}`}>
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-white/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider dark:bg-black/20">
                    {r.prioridad}
                  </span>
                  <p className="text-[11px] font-bold">{r.titulo}</p>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed">{r.accion}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {insights.alertas.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-400">Alertas</p>
          <div className="space-y-1">
            {insights.alertas.map((a, i) => (
              <div key={i} className={`flex items-start gap-2 rounded-md border p-2 ${PRIORITY_COLORS[a.severidad] ?? PRIORITY_COLORS.baja}`}>
                <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold">{a.titulo}</p>
                  <p className="mt-0.5 text-[11px]">{a.detalle}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!insights.resumenEjecutivo && insights.puntosClave.length === 0 && (
        <p className="py-2 text-center text-[11px] text-gray-400 dark:text-gray-500">
          La IA no devolvió insights para este período.
        </p>
      )}
    </div>
  );
}

// ─── Tablero (vista principal) ──────────────────────────────────────

function Tablero({
  companyId, modulo, periodo, fecha, fechaHasta, assetId, driverId,
}: {
  companyId: string;
  modulo: Modulo;
  periodo: Periodo;
  fecha: string;
  fechaHasta: string;
  assetId: number | null;
  driverId: number | null;
}) {
  const { data, loading, error, refetch } = useEstadisticas({ companyId, modulo, periodo, fecha, fechaHasta, assetId, driverId });
  // Anomalías persistidas por el cron job (no las on-demand del calculator)
  const { data: anomaliasPersistidas, total: totalAnomalias } = useAnomalias(companyId, modulo);
  const { exportar, loading: exporting, error: exportError } = useExportarPDF();
  const moduloCfg = MODULOS.find((m) => m.key === modulo)!;

  // Modo: "unico" (vista actual) o "comparar" (multi-período)
  const [modo, setModo] = useState<"unico" | "comparar">("unico");

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center gap-2.5 py-16 text-gray-400">
        <RefreshCw size={16} className="animate-spin" />
        <span className="text-sm">Calculando estadísticas…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
        <p className="text-xs font-semibold">No se pudieron cargar las estadísticas.</p>
        <p className="mt-1 text-[11px]">{error}</p>
        <button onClick={() => refetch()} className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-rose-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-600">
          <RefreshCw size={11} /> Reintentar
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-3">
      {/* Header plano (sin gradiente) */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
        <span className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300">
          {moduloCfg.icon}
        </span>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Período</p>
          <p className="text-sm font-semibold text-gray-800 dark:text-white">{data.bucketActual}</p>
        </div>
        <div className="ml-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Anterior</p>
          <p className="text-sm text-gray-600 dark:text-gray-300">{data.bucketAnterior}</p>
        </div>
        <div className="ml-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Rango</p>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {data.fechaRef} → {data.fechaHasta}
          </p>
        </div>
        <div className="ml-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">R²</p>
          <p className="text-sm tabular-nums text-gray-600 dark:text-gray-300">{fmtNumber(data.lineChart.regresion.r2, 2)}</p>
        </div>
        <button
          onClick={() => refetch()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300 dark:hover:bg-white/[0.06]"
        >
          <RefreshCw size={11} /> Refrescar
        </button>

        {/* Toggle único / comparar */}
        <div className="inline-flex items-center rounded-md border border-gray-200 bg-white p-0.5 dark:border-white/[0.08] dark:bg-white/[0.04]">
          {([
            { key: "unico",    label: "Único" },
            { key: "comparar", label: "Comparar" },
          ] as const).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setModo(t.key)}
              className={`rounded px-2 py-0.5 text-[10px] font-semibold transition ${
                modo === t.key
                  ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                  : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => exportar({ companyId, modulo, periodo, fecha, fechaHasta, assetId, driverId })}
          disabled={exporting || !data}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-white/[0.12] dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.08]"
          title="Exporta el tablero a PDF (incluye análisis IA)"
        >
          <FileDown size={11} className={exporting ? "animate-pulse" : ""} />
          {exporting ? "Generando…" : "Exportar PDF"}
        </button>
        {exportError && (
          <span className="text-[10px] text-rose-600 dark:text-rose-400" title={exportError}>
            Error PDF
          </span>
        )}
      </div>

      {/* Modo comparaciï¿½n multi-perï¿½odo (reemplaza todo lo de abajo) */}
      {modo === "comparar" ? (
        <MultiPeriodoPanel
          companyId={companyId}
          modulo={modulo}
          periodo={data.periodo}
        />
      ) : (
        <>
      {/* Análisis IA */}
      <AIInsightsPanel
        companyId={companyId}
        modulo={modulo}
        periodo={data.periodo}
        fecha={data.fechaRef}
        fechaHasta={data.fechaHasta}
        assetId={assetId}
        driverId={driverId}
      />

      {/* 4 KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {data.kpis.map((k) => <KpiCard key={k.label} kpi={k} />)}
      </div>

      {/* 6 charts en grid 2x3 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ChartCard title={data.lineChart.title} subtitle="Tendencia + proyección 3 períodos" span={2}>
          <LineWithProjection data={data.lineChart.data} periodo={data.periodo} unidad={data.lineChart.unidad} />
        </ChartCard>
        <ChartCard title={data.barVChart.title}>
          <BarV data={data.barVChart.data} />
        </ChartCard>
        <ChartCard title={data.barHChart.title}>
          <BarH data={data.barHChart.data} unidad={data.barHChart.unidad} />
        </ChartCard>
        <ChartCard title={data.radarChart.title}>
          <RadarStat data={data.radarChart.data} />
        </ChartCard>
        <ChartCard title={data.comparacionChart.title} subtitle="Período actual vs anterior" span={2}>
          <ComparacionBars data={data.comparacionChart.data} />
        </ChartCard>
      </div>

      {/* Salud de flota (solo módulo flotas) */}
      {modulo === "flotas" && data.salud && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300">
              <Gauge size={13} />
            </span>
            <div className="flex-1">
              <p className="text-[11px] font-semibold text-gray-800 dark:text-white">Salud de flota · últimos 12 meses</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">TCO operativo + scorecard por vehículo (no incluye depreciación).</p>
            </div>
          </div>
          <SaludFlotaPanel salud={data.salud} />
        </div>
      )}

      {/* Anomalías persistidas (cron job cada 30 min) */}
      <div className="rounded-xl border border-gray-200 bg-white p-3.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="mb-2.5 flex items-center gap-2">
          <p className="text-[11px] font-semibold text-gray-800 dark:text-white">Anomalías activas</p>
          <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
            {totalAnomalias}
          </span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">· actualizadas cada 30 min</span>
        </div>
        {anomaliasPersistidas.length === 0 ? (
          <p className="py-4 text-center text-[11px] text-gray-400 dark:text-gray-500">
            Sin anomalías activas. Los valores están dentro del rango histórico.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {anomaliasPersistidas.slice(0, 6).map((a) => <AnomaliaCard key={a.id ?? `${a.dimension}-${a.dimensionLabel}-${a.tipo}`} a={a} />)}
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}

// ─── Historial ──────────────────────────────────────────────────────

function Historial({ companyId, modulo }: { companyId: string; modulo: Modulo }) {
  const [severidadFilter, setSeveridadFilter] = useState<"todas" | "alta" | "media" | "baja">("todas");
  const [incluirResueltas, setIncluirResueltas] = useState(false);

  const { data, total, loading, refetch } = useAnomalias(companyId, modulo, {
    incluirResueltas,
    limite: 200,
  });
  const { redetectar, loading: redetectando, result: redetectResult, error: redetectError } = useRedetectarAnomalias(companyId);

  const filtered = severidadFilter === "todas"
    ? data
    : data.filter((a) => a.severidad === severidadFilter);

  // ─── Acciones ──────────────────────────────────────────────
  async function handleRedetectar() {
    await redetectar();
    // Re-leer la lista
    setTimeout(() => refetch(), 500);
  }

  // ─── Resumen por severidad ─────────────────────────────────
  const counts = {
    alta:  data.filter((a) => a.severidad === "alta").length,
    media: data.filter((a) => a.severidad === "media").length,
    baja:  data.filter((a) => a.severidad === "baja").length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2.5 py-16 text-gray-400">
        <RefreshCw size={16} className="animate-spin" />
        <span className="text-sm">Cargando historial…</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header del historial */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Severidad</span>
          {([
            { key: "todas", label: `Todas (${data.length})`, color: "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300" },
            { key: "alta",  label: `Alta (${counts.alta})`,  color: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
            { key: "media", label: `Media (${counts.media})`, color: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
            { key: "baja",  label: `Baja (${counts.baja})`,  color: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
          ] as const).map((opt) => {
            const active = severidadFilter === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSeveridadFilter(opt.key)}
                className={`rounded-md px-2 py-1 text-[11px] font-semibold transition ${
                  active
                    ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                    : `${opt.color} hover:opacity-80`
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <label className="ml-auto flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
          <input
            type="checkbox"
            checked={incluirResueltas}
            onChange={(e) => setIncluirResueltas(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 text-gray-900 focus:ring-gray-500 dark:border-white/[0.1] dark:bg-white/[0.04]"
          />
          Mostrar resueltas
        </label>

        <button
          type="button"
          onClick={handleRedetectar}
          disabled={redetectando}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300 dark:hover:bg-white/[0.06]"
        >
          <RefreshCw size={11} className={redetectando ? "animate-spin" : ""} />
          {redetectando ? "Redetectando…" : "Redetectar"}
        </button>
      </div>

      {/* Mensaje de resultado de redetección */}
      {redetectResult && !redetectando && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
          Sweep completado: {redetectResult.inserted} nuevas, {redetectResult.updated} actualizadas, {redetectResult.resolved} resueltas.
        </div>
      )}
      {redetectError && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          Error: {redetectError}
        </div>
      )}

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center dark:border-white/[0.06] dark:bg-white/[0.03]">
          <History size={24} className="mx-auto text-gray-300 dark:text-gray-600" />
          <p className="mt-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Sin anomalías registradas</p>
          <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
            {severidadFilter === "todas"
              ? "A medida que se detecten desviaciones, aparecerán aquí. Click 'Redetectar' para forzar un análisis."
              : `No hay anomalías con severidad "${severidadFilter}" en este módulo.`}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-[10px] text-gray-500 dark:text-gray-400">
            {filtered.length} de {total} para <strong>{modulo}</strong>
          </p>
          {filtered.map((a) => <AnomaliaCard key={a.id ?? `${a.dimension}-${a.dimensionLabel}-${a.tipo}`} a={a} />)}
        </div>
      )}
    </div>
  );
}

// ─── Página principal ───────────────────────────────────────────────

export function EstadisticasTab({ companyId }: { companyId: string }) {
  const [modulo, setModulo]   = useState<Modulo>("mantenimiento");
  const [periodo, setPeriodo] = useState<Periodo>("month");

  // Rango de fechas manual. Default: últimos 90 días.
  const today = new Date();
  const ninetyAgo = new Date(); ninetyAgo.setDate(ninetyAgo.getDate() - 90);
  const [fechaDesde, setFechaDesde]   = useState(ninetyAgo.toISOString().slice(0, 10));
  const [fechaHasta, setFechaHasta]   = useState(today.toISOString().slice(0, 10));
  const [fechaAplicadaDesde, setFechaAplicadaDesde] = useState(fechaDesde);
  const [fechaAplicadaHasta, setFechaAplicadaHasta] = useState(fechaHasta);

  const [assetId, setAssetId]   = useState<number | null>(null);
  const [driverId, setDriverId] = useState<number | null>(null);
  const [tab, setTab]         = useState<"tablero" | "historial">("tablero");

  const { assets }   = useAssets();
  const { drivers }  = useDrivers();

  const moduloCfg = MODULOS.find((m) => m.key === modulo)!;

  // Mostrar el selector de conductor solo para módulos que lo usan.
  const showDriverFilter = modulo === "combustible" || modulo === "mantenimiento" || modulo === "peajes" || modulo === "conductores";

  return (
    <div className="space-y-3">
      {/* Header con toggle Tablero / Historial */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-700 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200">
            {moduloCfg.icon}
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Estadísticas</p>
            <h2 className="text-sm font-bold text-gray-800 dark:text-white">{moduloCfg.label}</h2>
          </div>
        </div>

        <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white p-0.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
          {([
            { key: "tablero",   label: "Tablero",   icon: <BarChart3 size={11} /> },
            { key: "historial", label: "Historial", icon: <History size={11} /> },
          ] as const).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                tab === t.key
                  ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                  : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filtros (plano, sin gradientes) */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
        {/* Fila 1: Módulo + Período */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            <Filter size={10} /> Módulo
          </span>
          {MODULOS.map((m) => {
            const active = modulo === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setModulo(m.key)}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition ${
                  active
                    ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-gray-300 dark:hover:bg-white/[0.06]"
                }`}
              >
                {m.icon}{m.label}
              </button>
            );
          })}

          <span className="ml-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            <Calendar size={10} /> Período
          </span>
          {PERIODOS.map((p) => {
            const active = periodo === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriodo(p.key)}
                className={`rounded-md px-2 py-1 text-[11px] font-semibold transition ${
                  active
                    ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-white/[0.04] dark:text-gray-400 dark:hover:bg-white/[0.08]"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Fila 2: Rango Desde / Hasta + filtros entidad */}
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <DatePicker
            label="Desde"
            value={fechaDesde}
            onChange={(v) => setFechaDesde(v)}
            maxDate={fechaHasta || undefined}
          />
          <DatePicker
            label="Hasta"
            value={fechaHasta}
            onChange={(v) => setFechaHasta(v)}
            minDate={fechaDesde || undefined}
          />
          <button
            type="button"
            onClick={() => {
              setFechaAplicadaDesde(fechaDesde);
              setFechaAplicadaHasta(fechaHasta);
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-gray-900 px-3 text-[11px] font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
          >
            Aplicar rango
          </button>
          {(fechaAplicadaDesde !== ninetyAgo.toISOString().slice(0, 10) || fechaAplicadaHasta !== today.toISOString().slice(0, 10)) && (
            <button
              type="button"
              onClick={() => {
                const d = ninetyAgo.toISOString().slice(0, 10);
                const h = today.toISOString().slice(0, 10);
                setFechaDesde(d); setFechaHasta(h);
                setFechaAplicadaDesde(d); setFechaAplicadaHasta(h);
              }}
              className="inline-flex h-10 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
            >
              <X size={11} /> Reset
            </button>
          )}

          <div className="ml-auto flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Activo</span>
              <select
                value={assetId ?? ""}
                onChange={(e) => setAssetId(e.target.value ? Number(e.target.value) : null)}
                className="h-8 rounded-md border border-gray-200 bg-white px-2 text-[11px] text-gray-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200"
              >
                <option value="">Todos</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>{a.plate || a.name}</option>
                ))}
              </select>
            </div>
            {showDriverFilter && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Conductor</span>
                <select
                  value={driverId ?? ""}
                  onChange={(e) => setDriverId(e.target.value ? Number(e.target.value) : null)}
                  className="h-8 rounded-md border border-gray-200 bg-white px-2 text-[11px] text-gray-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200"
                >
                  <option value="">Todos</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>{d.firstName} {d.lastName}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Contenido */}
      {tab === "tablero" ? (
        <Tablero
          companyId={companyId}
          modulo={modulo}
          periodo={periodo}
          fecha={fechaAplicadaDesde}
          fechaHasta={fechaAplicadaHasta}
          assetId={assetId}
          driverId={driverId}
        />
      ) : (
        <Historial companyId={companyId} modulo={modulo} />
      )}

      <p className="text-center text-[10px] text-gray-400 dark:text-gray-500">
        <ChevronRight size={10} className="inline" /> Capa matemática: regresión lineal, variación %, z-score vs histórico 3-6 meses. Análisis IA disponible en una próxima fase.
      </p>
    </div>
  );
}
