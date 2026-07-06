﻿// pages/Dashboard/DashboardIntelligent.tsx
//
// Componentes para los 24 submódulos del dashboard que se renderizan
// condicionalmente según los permisos `can("dashboard", "<submodulo>", "ver")`.
// La parte de Fase 1 (data que viene en `/analytics/dashboard.intelligent`)
// y Fase 2 (data que viene en endpoints extendidos `/dashboard-extended/...`)
// está cubierta aquí.
//
// Patrón visual: cada componente es un ChartCard (consistente con el resto
// del dashboard) con un gráfico o tabla. Loading = ChartSkeleton. Empty
// state = texto pequeño centrado.

import { lazy, Suspense, useState, useEffect } from "react";
import { Truck, User } from "lucide-react";
import {
  useConsumoPorConductor,
  useEstadoAsignaciones,
  useDisponibilidadConductores,
  usePolizasPorVencer,
  useCoberturaActivos,
  useKpisChecklists,
  useChecklistsPendientes,
  useProximoCambioAceite,
  useKpisAc,
  useServiciosAcPendientes,
  useActividadPorUsuario,
  useActividadPorEntidad,
  type FlotaPorSede,
  type KpisPorSede,
  type FlotaPorGaraje,
  type OcupacionGaraje,
  type CombustiblePorVehiculo,
  type PolizaPorVencer,
  type ChecklistPendiente,
  type ProximoCambioAceite,
  type ServicioAcPendiente,
} from "../../hooks/useDashboardAnalytics";
import { useAuth } from "../../context/AuthContext";
import { getEntityLabel, getEntityMeta, getActionLabel } from "./entityLabels";
import { fmtDateShortEc } from "@/lib/datetime";

function IconTruck({ size = 20, className }: { size?: number; className?: string }) {
  return <Truck size={size} strokeWidth={1.8} className={className} />;
}
function IconUser({ size = 20, className }: { size?: number; className?: string }) {
  return <User size={size} strokeWidth={1.8} className={className} />;
}

const ReactApexChart = lazy(() => import("react-apexcharts"));

const BASE_AXIS_STYLE = { fontSize: "12px", colors: "#e5e7eb" as string | string[] };
const BASE_YAXIS_STYLE = { fontSize: "12px", colors: ["#6B7280"] };
const GRID_BORDER = "rgba(156,163,175,0.12)";

function ChartSkeleton({ height = "h-[220px]" }: { height?: string }) {
  return <div className={`animate-pulse rounded-lg bg-gray-200 dark:bg-white/[0.06] ${height}`} />;
}

/** Card base usado por todos los componentes del dashboard. */
type ChartCardProps = {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  accent?: "violet" | "sky" | "emerald" | "amber" | "rose" | "cyan" | "slate";
  href?: string;
  badge?: string | number;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
};
const ACCENT_BG: Record<NonNullable<ChartCardProps["accent"]>, string> = {
  violet:  "bg-violet-500/10 text-violet-400",
  sky:     "bg-sky-500/10 text-sky-400",
  emerald: "bg-emerald-500/10 text-emerald-400",
  amber:   "bg-amber-500/10 text-amber-400",
  rose:    "bg-rose-500/10 text-rose-400",
  cyan:    "bg-cyan-500/10 text-cyan-400",
  slate:   "bg-slate-500/10 text-slate-400",
};
function ChartCard({ title, subtitle, icon, accent = "slate", href, badge, children, className = "", onClick }: ChartCardProps) {
  return (
    <div
      className={`rounded-2xl border border-gray-100 dark:border-white/[0.04] bg-white dark:bg-[#0F172A] p-5 flex flex-col ${onClick || href ? "cursor-pointer hover:border-violet-300 dark:hover:border-violet-500/30 transition-colors" : ""} ${className}`}
      onClick={onClick ?? (href ? () => { window.location.href = href; } : undefined)}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          {icon && (
            <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${ACCENT_BG[accent]}`}>
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold leading-tight text-gray-800 dark:text-white/90 truncate">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {badge !== undefined && (
            <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-white/[0.05] px-2 py-0.5 text-[10px] font-bold text-gray-600 dark:text-gray-300">
              {badge}
            </span>
          )}
          {href && !onClick && (
            <a href={href} onClick={e => e.stopPropagation()} className="text-[10px] font-semibold text-violet-400 hover:text-violet-300 transition-colors whitespace-nowrap">
              Ver más →
            </a>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

function makeBarOptions(categories: string[], theme: "dark" | "light"): any {
  return {
    colors: ["#465fff", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#84cc16"],
    chart: { fontFamily: "Outfit, sans-serif", type: "bar", height: 220, toolbar: { show: false }, background: "transparent" },
    plotOptions: { bar: { horizontal: false, columnWidth: "55%", borderRadius: 4, borderRadiusApplication: "end", distributed: true } },
    dataLabels: { enabled: true, style: { fontSize: "11px", colors: ["#fff"], fontWeight: 700 }, offsetY: -18 },
    stroke: { show: true, width: 4, colors: ["transparent"] },
    xaxis: { categories, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: BASE_AXIS_STYLE } },
    yaxis: { labels: { style: BASE_YAXIS_STYLE } },
    grid: { yaxis: { lines: { show: true } }, borderColor: GRID_BORDER },
    fill: { opacity: 1 },
    legend: { show: false },
    tooltip: { theme },
  };
}

function makeHBarOptions(categories: string[], colors: string[], theme: "dark" | "light"): any {
  return {
    colors,
    chart: { fontFamily: "Outfit, sans-serif", type: "bar", height: 220, toolbar: { show: false }, background: "transparent" },
    plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: "55%", distributed: true } },
    dataLabels: { enabled: true, style: { fontSize: "11px", colors: ["#fff"] } },
    xaxis: {
      categories,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: { style: BASE_YAXIS_STYLE },
    },
    yaxis: { labels: { style: BASE_YAXIS_STYLE } },
    grid: { xaxis: { lines: { show: true } }, yaxis: { lines: { show: false } }, borderColor: GRID_BORDER },
    legend: { show: false },
    tooltip: { theme },
  };
}

function makeDonutOptions(labels: string[], theme: "dark" | "light"): any {
  return {
    chart: { type: "donut", background: "transparent", fontFamily: "Outfit, sans-serif", height: 220 },
    colors: ["#10b981", "#f59e0b", "#ef4444", "#9ca3af"],
    labels,
    legend: { position: "bottom", fontSize: "12px", labels: { colors: "#9ca3af" } },
    dataLabels: { enabled: false },
    plotOptions: { pie: { donut: { size: "65%", labels: { show: true, total: { show: true, label: "Total", color: "#9ca3af", fontSize: "13px" } } } } },
    stroke: { width: 0 },
    tooltip: { theme },
  };
}

function useTheme(): "dark" | "light" {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    const obs = new MutationObserver(() => setIsDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return isDark ? "dark" : "light";
}

type TableCell =
  | string
  | number
  | { kind: "dot"; color: string; label: string }
  | { kind: "badge"; color: string; label: string }
  | { kind: "value"; value: number; max: number; color?: string }
  | { kind: "raw"; node: React.ReactNode };

function Table({ headers, rows }: { headers: string[]; rows: TableCell[][] }) {
  return (
    <div className="flex-1 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 dark:border-white/[0.05]">
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-gray-100 dark:border-white/[0.04] transition-colors hover:bg-gray-50/60 dark:hover:bg-white/[0.02]"
            >
              {row.map((cell, j) => {
                if (cell && typeof cell === "object" && "kind" in cell) {
                  if (cell.kind === "dot") {
                    return (
                      <td key={j} className="px-3 py-2">
                        <span className="inline-flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${cell.color}`} />
                          <span className="text-gray-700 dark:text-gray-200">{cell.label}</span>
                        </span>
                      </td>
                    );
                  }
                  if (cell.kind === "badge") {
                    return (
                      <td key={j} className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${cell.color}`}>
                          {cell.label}
                        </span>
                      </td>
                    );
                  }
                  if (cell.kind === "value") {
                    const pct = cell.max > 0 ? Math.min(100, Math.round((cell.value / cell.max) * 100)) : 0;
                    return (
                      <td key={j} className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="relative h-1.5 flex-1 min-w-[40px] overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.06]">
                            <div
                              className={`h-full rounded-full ${cell.color ?? "bg-violet-500"} transition-all`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold tabular-nums text-gray-700 dark:text-gray-200">{cell.value}</span>
                        </div>
                      </td>
                    );
                  }
                  return <td key={j} className="px-3 py-2">{cell.node}</td>;
                }
                return <td key={j} className="px-3 py-2 text-gray-700 dark:text-gray-200">{cell}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
//  1. Flota por sede
// ────────────────────────────────────────────────────────────────────────
export function FlotaPorSedeCard({ data, loading }: { data: FlotaPorSede[]; loading: boolean }) {
  const theme = useTheme();
  return (
    <ChartCard title="Flota por sede" subtitle="Vehículos asignados a cada sede" href="/flotas">
      {loading || data.length === 0
        ? <ChartSkeleton height="h-[220px]" />
        : <Suspense fallback={<ChartSkeleton height="h-[220px]" />}>
            <ReactApexChart
              options={makeBarOptions(data.map(d => d.name), theme)}
              series={[
                { name: "Operativos", data: data.map(d => d.operative) },
                { name: "Total",      data: data.map(d => d.total) },
              ]}
              type="bar" height={220}
            />
          </Suspense>
      }
    </ChartCard>
  );
}

// ────────────────────────────────────────────────────────────────────────
//  2. KPIs por sede (tabla)
// ────────────────────────────────────────────────────────────────────────
export function KpisPorSedeCard({ data, loading }: { data: KpisPorSede[]; loading: boolean }) {
  return (
    <ChartCard title="KPIs por sede" subtitle="Disponibilidad operativa" href="/flotas">
      {loading
        ? <ChartSkeleton height="h-[220px]" />
        : data.length === 0
          ? <p className="text-xs text-gray-400 py-8 text-center">Sin datos de sedes</p>
          : <Table
              headers={["Sede", "Total", "Operativos", "Disponibilidad"]}
              rows={data.map(d => [d.name, d.total, d.operative, `${d.availability}%`])}
            />
      }
    </ChartCard>
  );
}

// ────────────────────────────────────────────────────────────────────────
//  3. Flota por garaje
// ────────────────────────────────────────────────────────────────────────
export function FlotaPorGarajeCard({ data, loading }: { data: FlotaPorGaraje[]; loading: boolean }) {
  const theme = useTheme();
  return (
    <ChartCard title="Flota por garaje" subtitle="Vehículos asignados por garaje" href="/flotas">
      {loading || data.length === 0
        ? <ChartSkeleton height="h-[220px]" />
        : <Suspense fallback={<ChartSkeleton height="h-[220px]" />}>
            <ReactApexChart
              options={makeBarOptions(data.map(d => d.name), theme)}
              series={[{ name: "Vehículos", data: data.map(d => d.total) }]}
              type="bar" height={220}
            />
          </Suspense>
      }
    </ChartCard>
  );
}

// ────────────────────────────────────────────────────────────────────────
//  4. Ocupación de garajes
// ────────────────────────────────────────────────────────────────────────
export function OcupacionGarajesCard({ data, loading }: { data: OcupacionGaraje[]; loading: boolean }) {
  const theme = useTheme();
  const colorOf = (occ: number) => occ >= 90 ? "#ef4444" : occ >= 65 ? "#f59e0b" : "#10b981";
  return (
    <ChartCard title="Ocupación de garajes" subtitle="% usado vs capacidad" href="/flotas">
      {loading || data.length === 0
        ? <ChartSkeleton height="h-[220px]" />
        : <Suspense fallback={<ChartSkeleton height="h-[220px]" />}>
            <ReactApexChart
              options={makeHBarOptions(
                data.map(d => d.name),
                data.map(d => colorOf(d.occupancy)),
                theme,
              )}
              series={[{ name: "Ocupación %", data: data.map(d => d.occupancy) }]}
              type="bar" height={220}
            />
          </Suspense>
      }
    </ChartCard>
  );
}

// ────────────────────────────────────────────────────────────────────────
//  5. Consumo de combustible por vehículo (top 10)
// ────────────────────────────────────────────────────────────────────────
export function ConsumoPorVehiculoCard({ data, loading }: { data: CombustiblePorVehiculo[]; loading: boolean }) {
  return (
    <ChartCard title="Consumo por vehículo" subtitle="Top 10 por galones cargados" href="/combustible">
      {loading
        ? <ChartSkeleton height="h-[220px]" />
        : data.length === 0
          ? <p className="text-xs text-gray-400 py-8 text-center">Sin datos de consumo</p>
          : <Table
              headers={["Placa", "Vehículo", "Galones", "Costo"]}
              rows={data.map(d => [d.plate, d.name, `${d.gallons.toLocaleString()} gal`, `$${d.cost.toLocaleString()}`])}
            />
      }
    </ChartCard>
  );
}

// ────────────────────────────────────────────────────────────────────────
//  6. Costo de combustible por vehículo (top 10)
// ────────────────────────────────────────────────────────────────────────
export function CostoPorVehiculoCard({ data, loading }: { data: CombustiblePorVehiculo[]; loading: boolean }) {
  return (
    <ChartCard title="Costo por vehículo" subtitle="Top 10 por costo de combustible" href="/combustible">
      {loading
        ? <ChartSkeleton height="h-[220px]" />
        : data.length === 0
          ? <p className="text-xs text-gray-400 py-8 text-center">Sin datos de costo</p>
          : <Table
              headers={["Placa", "Vehículo", "Costo", "Galones"]}
              rows={data.map(d => [d.plate, d.name, `$${d.cost.toLocaleString()}`, `${d.gallons.toLocaleString()} gal`])}
            />
      }
    </ChartCard>
  );
}

// ────────────────────────────────────────────────────────────────────────
//  7. Consumo de combustible por conductor (Fase 2, hook propio)
// ────────────────────────────────────────────────────────────────────────
export function ConsumoPorConductorCard() {
  const { session } = useAuth();
  const companyId = session?.companyId ?? null;
  const { data, loading } = useConsumoPorConductor(companyId, 10);
  const theme = useTheme();

  return (
    <ChartCard title="Consumo por conductor" subtitle="Top 10 por galones cargados" href="/combustible">
      {loading
        ? <ChartSkeleton height="h-[220px]" />
        : data.length === 0
          ? <p className="text-xs text-gray-400 py-8 text-center">Sin datos de consumo por conductor</p>
          : <Suspense fallback={<ChartSkeleton height="h-[220px]" />}>
              <ReactApexChart
                options={makeHBarOptions(data.map(d => d.name), ["#465fff"], theme)}
                series={[{ name: "Galones", data: data.map(d => d.gallons) }]}
                type="bar" height={220}
              />
            </Suspense>
      }
    </ChartCard>
  );
}

// ────────────────────────────────────────────────────────────────────────
//  8. Estado de asignaciones (Fase 2)
// ────────────────────────────────────────────────────────────────────────
export function EstadoAsignacionesCard() {
  const { session } = useAuth();
  const companyId = session?.companyId ?? null;
  const { data, loading } = useEstadoAsignaciones(companyId);
  const theme = useTheme();

  return (
    <ChartCard title="Estado de asignaciones" subtitle={`${data?.total ?? 0} asignaciones totales`} href="/operaciones/asignaciones">
      {loading || !data
        ? <ChartSkeleton height="h-[220px]" />
        : data.items.length === 0
          ? <p className="text-xs text-gray-400 py-8 text-center">Sin asignaciones registradas</p>
          : <Suspense fallback={<ChartSkeleton height="h-[220px]" />}>
              <ReactApexChart
                options={makeDonutOptions(data.items.map(d => d.name), theme)}
                series={data.items.map(d => d.value)}
                type="donut" height={220}
              />
            </Suspense>
      }
    </ChartCard>
  );
}

// ────────────────────────────────────────────────────────────────────────
//  9. Disponibilidad de conductores (Fase 2)
// ────────────────────────────────────────────────────────────────────────
export function DisponibilidadConductoresCard() {
  const { session } = useAuth();
  const companyId = session?.companyId ?? null;
  const { data, loading } = useDisponibilidadConductores(companyId);
  const theme = useTheme();

  return (
    <ChartCard title="Disponibilidad de conductores" subtitle={`${data?.total ?? 0} conductores`} href="/operaciones/conductores">
      {loading || !data
        ? <ChartSkeleton height="h-[220px]" />
        : data.items.length === 0
          ? <p className="text-xs text-gray-400 py-8 text-center">Sin conductores registrados</p>
          : <Suspense fallback={<ChartSkeleton height="h-[220px]" />}>
              <ReactApexChart
                options={makeDonutOptions(data.items.map(d => d.name), theme)}
                series={data.items.map(d => d.value)}
                type="donut" height={220}
              />
            </Suspense>
      }
    </ChartCard>
  );
}

// ────────────────────────────────────────────────────────────────────────
//  Fase 3: 9 componentes más para los 11 submódulos restantes
// ────────────────────────────────────────────────────────────────────────

// 8.b Mis vehículos (solo Conductor) — usa el endpoint /driver-assignment
export function KpisMisVehiculosCard() {
  const { session } = useAuth();
  const companyId = session?.companyId ?? null;
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    fetch(`/api/company/${companyId}/auth/me/driver-assignment`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(j => setData(j))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [companyId]);

  const a = data?.assignment;
  const veh = a?.asset;
  const startDate = a?.startDate ? fmtDateShortEc(a.startDate) : "—";

  return (
    <ChartCard
      title="Mi vehículo asignado"
      subtitle="Vista de Conductor"
      icon={<IconUser />}
      accent="cyan"
    >
      {loading
        ? <ChartSkeleton height="h-[160px]" />
        : !data?.hasAssignment
          ? (
            <div className="flex flex-col items-center justify-center gap-1 py-6 text-center">
              <IconTruck size={28} className="text-gray-400" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Sin vehículo asignado actualmente</p>
              <p className="text-xs text-gray-400">Contacta a tu supervisor para más detalles</p>
            </div>
          )
          : (
            <div className="space-y-3">
              <div className="rounded-xl bg-gradient-to-br from-cyan-500/10 to-sky-500/10 border border-cyan-500/20 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">Placa</p>
                <p className="mt-0.5 text-2xl font-black text-gray-800 dark:text-white font-mono">{veh?.plate ?? "—"}</p>
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">{veh?.brand} {veh?.model} {veh?.year ?? ""}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{veh?.code}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Asignado desde</p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-800 dark:text-white">{startDate}</p>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Estado</p>
                  <span className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Activo
                  </span>
                </div>
              </div>
            </div>
          )
      }
    </ChartCard>
  );
}
export function PolizasPorVencerCard() {
  const { session } = useAuth();
  const companyId = session?.companyId ?? null;
  const { data, loading } = usePolizasPorVencer(companyId);
  const theme = useTheme();
  return (
    <ChartCard title="Pólizas por vencer" subtitle={`${data?.total ?? 0} pólizas en total`} href="/gestion/seguros">
      {loading || !data
        ? <ChartSkeleton height="h-[220px]" />
        : data.data.length === 0
          ? <p className="text-xs text-gray-400 py-8 text-center">Sin pólizas registradas</p>
          : <Suspense fallback={<ChartSkeleton height="h-[220px]" />}>
              <ReactApexChart
                options={makeDonutOptions(data.data.map(d => d.name), theme)}
                series={data.data.map(d => d.value)}
                type="donut" height={220}
              />
            </Suspense>
      }
      {data && data.proximas.length > 0 && (
        <div className="mt-3 border-t border-white/[0.04] pt-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Próximas a vencer</p>
          <Table
            headers={["Placa", "Aseguradora", "Póliza", "Días"]}
            rows={data.proximas.map((p: PolizaPorVencer) => [
              p.plate ?? "—",
              p.insurer,
              p.policyNumber,
              p.daysLeft <= 0 ? "VENCIDA" : `${p.daysLeft}d`,
            ])}
          />
        </div>
      )}
    </ChartCard>
  );
}

// 11. Cobertura de activos (donut + KPI)
export function CoberturaActivosCard() {
  const { session } = useAuth();
  const companyId = session?.companyId ?? null;
  const { data, loading } = useCoberturaActivos(companyId);
  const theme = useTheme();
  return (
    <ChartCard title="Cobertura de seguros" subtitle={`${data?.coveragePercent ?? 0}% de la flota asegurada`} href="/gestion/seguros">
      {loading || !data
        ? <ChartSkeleton height="h-[220px]" />
        : data.data.length === 0
          ? <p className="text-xs text-gray-400 py-8 text-center">Sin datos de pólizas</p>
          : <Suspense fallback={<ChartSkeleton height="h-[220px]" />}>
              <ReactApexChart
                options={makeDonutOptions(data.data.map(d => d.name), theme)}
                series={data.data.map(d => d.value)}
                type="donut" height={220}
              />
            </Suspense>
      }
    </ChartCard>
  );
}

// 12. KPIs de checklists
export function KpisChecklistsCard() {
  const { session } = useAuth();
  const companyId = session?.companyId ?? null;
  const { data, loading } = useKpisChecklists(companyId);
  const theme = useTheme();
  return (
    <ChartCard title="KPIs de inspecciones" subtitle={`${data?.total ?? 0} inspecciones totales`} href="/checklist">
      {loading || !data
        ? <ChartSkeleton height="h-[220px]" />
        : data.data.length === 0
          ? <p className="text-xs text-gray-400 py-8 text-center">Sin inspecciones registradas</p>
          : <Suspense fallback={<ChartSkeleton height="h-[220px]" />}>
              <ReactApexChart
                options={makeBarOptions(data.data.map(d => d.name), theme)}
                series={[{ name: "Cantidad", data: data.data.map(d => d.value) }]}
                type="bar" height={220}
              />
            </Suspense>
      }
    </ChartCard>
  );
}

// 13. Inspecciones pendientes (tabla)
export function ChecklistsPendientesCard() {
  const { session } = useAuth();
  const companyId = session?.companyId ?? null;
  const { data, loading } = useChecklistsPendientes(companyId);
  return (
    <ChartCard title="Inspecciones pendientes" subtitle={`${data?.total ?? 0} por completar`} href="/checklist">
      {loading || !data
        ? <ChartSkeleton height="h-[220px]" />
        : data.data.length === 0
          ? <p className="text-xs text-gray-400 py-8 text-center">Sin inspecciones pendientes</p>
          : <Table
              headers={["Fecha", "Objetivo", "Vehículo", "Resumen"]}
              rows={data.data.map((c: ChecklistPendiente) => [
                c.date,
                c.targetLabel,
                c.plate ?? "—",
                c.summary ?? "—",
              ])}
            />
      }
    </ChartCard>
  );
}


// 16. KPIs de A/C
export function KpisAcCard() {
  const { session } = useAuth();
  const companyId = session?.companyId ?? null;
  const { data, loading } = useKpisAc(companyId);
  const theme = useTheme();
  return (
    <ChartCard title="KPIs de aires acondicionados" subtitle={`${data?.total ?? 0} unidades`} href="/aires-acondicionados">
      {loading || !data
        ? <ChartSkeleton height="h-[220px]" />
        : data.data.length === 0
          ? <p className="text-xs text-gray-400 py-8 text-center">Sin aires acondicionados registrados</p>
          : <Suspense fallback={<ChartSkeleton height="h-[220px]" />}>
              <ReactApexChart
                options={makeBarOptions(data.data.map(d => d.name), theme)}
                series={[{ name: "Cantidad", data: data.data.map(d => d.value) }]}
                type="bar" height={220}
              />
            </Suspense>
      }
    </ChartCard>
  );
}

// 17. Servicios de A/C pendientes
export function ServiciosAcPendientesCard() {
  const { session } = useAuth();
  const companyId = session?.companyId ?? null;
  const { data, loading } = useServiciosAcPendientes(companyId);
  return (
    <ChartCard title="Servicios de A/C pendientes" subtitle={`${data?.total ?? 0} unidades con servicio próximo`} href="/aires-acondicionados">
      {loading || !data
        ? <ChartSkeleton height="h-[220px]" />
        : data.data.length === 0
          ? <p className="text-xs text-gray-400 py-8 text-center">Sin servicios próximos</p>
          : <Table
              headers={["Código", "Unidad", "Marca/Modelo", "Próximo servicio", "Estado"]}
              rows={data.data.map((u: ServicioAcPendiente) => [
                u.code,
                u.name,
                `${u.brand ?? ""} ${u.model ?? ""}`.trim() || "—",
                String(u.nextService),
                u.status ?? "—",
              ])}
            />
      }
    </ChartCard>
  );
}

// 18. Actividad por usuario
export function ActividadPorUsuarioCard() {
  const { session } = useAuth();
  const companyId = session?.companyId ?? null;
  const { data, loading } = useActividadPorUsuario(companyId);
  const items = data?.data ?? [];
  const total = data?.total ?? 0;
  const max = items.reduce((m, x) => Math.max(m, x.count), 0);
  return (
    <ChartCard title="Actividad por usuario" subtitle={`${total} acciones en el sistema`} href="/reportes">
      {loading
        ? <ChartSkeleton height="h-[220px]" />
        : items.length === 0
          ? <p className="text-xs text-gray-400 py-8 text-center">Sin actividad registrada</p>
          : <Table
              headers={["#", "Usuario", "Acciones"]}
              rows={items.map((u, i) => [
                { kind: "raw", node: <span className="text-xs font-bold text-gray-400 tabular-nums">{i + 1}</span> },
                { kind: "dot", color: "bg-violet-500", label: u.actorName },
                { kind: "value", value: u.count, max, color: "bg-violet-500" },
              ])}
            />
      }
    </ChartCard>
  );
}

// 19. Actividad por entidad
export function ActividadPorEntidadCard() {
  const { session } = useAuth();
  const companyId = session?.companyId ?? null;
  const { data, loading } = useActividadPorEntidad(companyId);
  const items = data?.data ?? [];
  const total = data?.total ?? 0;
  const max = items.reduce((m, x) => Math.max(m, x.count), 0);
  return (
    <ChartCard title="Actividad por entidad" subtitle={`${total} acciones en el sistema`} href="/reportes">
      {loading
        ? <ChartSkeleton height="h-[220px]" />
        : items.length === 0
          ? <p className="text-xs text-gray-400 py-8 text-center">Sin actividad registrada</p>
          : <Table
              headers={["#", "Entidad", "Acción", "Cantidad"]}
              rows={items.map((e, i) => {
                const meta = getEntityMeta(e.entity);
                return [
                  { kind: "raw", node: <span className="text-xs font-bold text-gray-400 tabular-nums">{i + 1}</span> },
                  { kind: "dot", color: meta.color, label: getEntityLabel(e.entity) },
                  { kind: "badge", color: "bg-slate-100 text-slate-700 dark:bg-white/[0.05] dark:text-slate-300", label: getActionLabel(e.action) },
                  { kind: "value", value: e.count, max, color: meta.color.replace("bg-", "bg-") },
                ];
              })}
            />
      }
    </ChartCard>
  );
}
