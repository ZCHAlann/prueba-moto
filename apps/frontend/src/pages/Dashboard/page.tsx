// pages/Dashboard/page.tsx
//
// Dashboard con granularidad por submódulo: cada elemento (KPI, gráfica, feed)
// se muestra solo si el usuario tiene el permiso `can("dashboard", "<submodulo>", "ver")`.
// Los permisos vienen del JWT (cargados desde `company_users.module_permissions`
// en la BD, con defaults por rol aplicados en la migración 0008).
//
// Si el usuario no tiene NINGÚN submódulo visible, se muestra un empty state
// amigable. Si tiene solo algunos, el grid se reorganiza automáticamente.
//
// Organización visual:
//   1. Header con saludo + fecha + filtro de período
//   2. SECCIÓN 1 — Resumen (KPIs globales)
//   3. SECCIÓN 2 — Combustible (charts + cards inteligentes)
//   4. SECCIÓN 3 — Flota y mantenimiento (charts + próximos)
//   5. SECCIÓN 4 — Personas (conductores + asignaciones)
//   6. SECCIÓN 5 — Recursos (sedes, garajes, A/C, checklists, aceite, inventario, seguros)
//   7. SECCIÓN 6 — Atención (alertas + actividad reciente)

import { useMemo, lazy, Suspense, useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { usePermissions, useCompanyModuleAccess } from "../../hooks/usePermissions";
import { KpiCard } from "../../components/dashboard/kpi-card";
import { AlertsFeed } from "../../components/dashboard/alerts-feed";
import { MaintenanceTable } from "../../components/dashboard/maintenance-table";
import { ChartEmptyState } from "../../components/dashboard/chart-empty-state";
import { useDashboardAnalytics } from "../../hooks/useDashboardAnalytics";
import { useAlerts } from "../../hooks/useAlerts";
import type { ApexOptions } from "apexcharts";
import type { AlertItem } from "../../components/dashboard/alerts-feed";
import {
  Wrench, Truck, User, Fuel, Bell, Circle, LayoutGrid, ChevronDown, ChevronUp,
  Calendar, Activity, Settings,
} from "lucide-react";
import {
  FlotaPorSedeCard,
  KpisPorSedeCard,
  FlotaPorGarajeCard,
  OcupacionGarajesCard,
  ConsumoPorVehiculoCard,
  ConsumoPorConductorCard,
  EstadoAsignacionesCard,
  DisponibilidadConductoresCard,
  KpisMisVehiculosCard,
  PolizasPorVencerCard,
  CoberturaActivosCard,
  KpisChecklistsCard,
  ChecklistsPendientesCard,
  KpisAcCard,
  ServiciosAcPendientesCard,
  ActividadPorUsuarioCard,
  ActividadPorEntidadCard,
} from "./DashboardIntelligent";

// ─── Lazy-load ReactApexChart — never blocks initial paint ───────────────────
const ReactApexChart = lazy(() => import("react-apexcharts"));

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function Sk({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-gray-200 dark:bg-white/[0.06] ${className}`} />;
}
function ChartSkeleton({ height = "h-[260px]" }: { height?: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 dark:border-white/[0.04] bg-white dark:bg-[#0F172A] p-5">
      <Sk className="h-5 w-40 mb-5" />
      <Sk className={height} />
    </div>
  );
}

/** Encabezado de sección: número + label + descripción + acciones opcionales. */
function SectionHeader({
  number, title, subtitle, accent = "violet", collapsible, collapsed, onToggle,
}: {
  number: string;
  title: string;
  subtitle?: string;
  accent?: "violet" | "sky" | "emerald" | "amber" | "rose" | "slate" | "cyan";
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const accentText: Record<NonNullable<typeof accent>, string> = {
    violet: "text-violet-400",
    sky:    "text-sky-400",
    emerald: "text-emerald-400",
    amber:  "text-amber-400",
    rose:   "text-rose-400",
    slate:  "text-slate-300",
    cyan:   "text-cyan-400",
  };
  return (
    <div className="flex items-center gap-3 px-1">
      <span className={`text-[10px] font-black tracking-widest ${accentText[accent]} opacity-70`}>
        {number}
      </span>
      <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700 dark:text-white/80">{title}</h2>
      {subtitle && <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:inline">— {subtitle}</span>}
      <div className="ml-auto">
        {collapsible && onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-white/[0.04] hover:text-white"
            aria-label={collapsed ? "Expandir" : "Colapsar"}
          >
            {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </button>
        )}
      </div>
    </div>
  );
}

/** Grid responsive "auto-fit" — la card se estira a su contenido y el grid llena huecos. */
function AutoGrid({ children, minWidth = 320 }: { children: React.ReactNode; minWidth?: number }) {
  return (
    <div
      className="grid gap-4 md:gap-5"
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))` }}
    >
      {children}
    </div>
  );
}

/** Misma idea que AutoGrid pero aplicada inline a grids que necesitan
 * compartir estilos con otros grids (sin crear un wrapper). */
const autoFitStyle = (minWidth: number): React.CSSProperties => ({
  gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`,
});

/* ─── Iconos para los KPIs ──────────────────────────────────────────────── */
function IconTruck()    { return <Truck    size={20} strokeWidth={1.8} />; }
function IconWrench()   { return <Wrench   size={20} strokeWidth={1.8} />; }
function IconBell()     { return <Bell     size={20} strokeWidth={1.8} />; }
function IconFuel()     { return <Fuel     size={20} strokeWidth={1.8} />; }
function IconUser()     { return <User     size={20} strokeWidth={1.8} />; }
function IconActivity() { return <Activity  size={16} strokeWidth={1.8} />; }
function IconCal()      { return <Calendar size={14} strokeWidth={1.8} />; }
function IconSettings() { return <Settings size={14} strokeWidth={1.8} />; }

/* ─── Event meta ─────────────────────────────────────────────────────────── */
function getEventMeta(entity: string) {
  const map: Record<string, { icon: React.ReactNode; color: string; bgColor: string; textColor: string; label: string }> = {
    maintenances:        { icon: <Wrench size={11} />, color: "#10b981", bgColor: "rgba(16,185,129,0.15)", textColor: "#10b981", label: "Mantenimiento" },
    companyMaintenances: { icon: <Wrench size={11} />, color: "#10b981", bgColor: "rgba(16,185,129,0.15)", textColor: "#10b981", label: "Mantenimiento" },
    companyAssets:       { icon: <Truck  size={11} />, color: "#465FFF", bgColor: "rgba(70,95,255,0.15)",  textColor: "#818cf8", label: "Activo"        },
    companyDrivers:      { icon: <User   size={11} />, color: "#f59e0b", bgColor: "rgba(245,158,11,0.15)", textColor: "#fbbf24", label: "Conductor"     },
    companyFuel:         { icon: <Fuel   size={11} />, color: "#06b6d4", bgColor: "rgba(6,182,212,0.15)",  textColor: "#22d3ee", label: "Combustible"   },
    alerts:              { icon: <Bell   size={11} />, color: "#ef4444", bgColor: "rgba(239,68,68,0.15)",  textColor: "#f87171", label: "Alerta"        },
  };
  return map[entity] ?? { icon: <Circle size={11} />, color: "#6b7280", bgColor: "rgba(107,114,128,0.15)", textColor: "#9ca3af", label: entity };
}

/* ─── Shared axis styles ─────────────────────────────────────────────────── */
const BASE_AXIS_STYLE = { fontSize: "12px", colors: "#e5e7eb" as string | string[] };
const BASE_YAXIS_STYLE = { fontSize: "12px", colors: ["#6B7280"] };
const GRID_BORDER = "rgba(156,163,175,0.12)";

function makeAreaOptions(categories: string[], theme: "dark" | "light", onClick?: () => void): ApexOptions {
  return {
    legend: { show: false },
    colors: ["#465FFF", "#10b981"],
    chart: { fontFamily: "Outfit, sans-serif", height: 280, type: "line", toolbar: { show: false }, background: "transparent", events: { click: onClick ? () => onClick() : undefined } },
    stroke: { curve: "smooth", width: [2.5, 2.5] },
    fill: { type: "gradient", gradient: { opacityFrom: 0.5, opacityTo: 0 } },
    markers: { size: 0, strokeColors: "#fff", strokeWidth: 2, hover: { size: 5 } },
    grid: { xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } }, borderColor: GRID_BORDER, padding: { top: 0, right: 0 } },
    dataLabels: { enabled: false },
    xaxis: { type: "category", categories, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: BASE_AXIS_STYLE } },
    yaxis: { labels: { style: BASE_YAXIS_STYLE } },
    tooltip: { theme, x: { show: false } },
  };
}

function makeBarOptions(categories: string[], theme: "dark" | "light", height = 220, onClick?: () => void): ApexOptions {
  return {
    colors: ["#465fff"],
    chart: { fontFamily: "Outfit, sans-serif", type: "bar", height, toolbar: { show: false }, background: "transparent", events: { click: onClick ? () => onClick() : undefined } },
    plotOptions: { bar: { horizontal: false, columnWidth: "50%", borderRadius: 5, borderRadiusApplication: "end" } },
    dataLabels: { enabled: false },
    stroke: { show: true, width: 3, colors: ["transparent"] },
    xaxis: { categories, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: BASE_AXIS_STYLE } },
    yaxis: { labels: { style: BASE_YAXIS_STYLE } },
    grid: { yaxis: { lines: { show: true } }, borderColor: GRID_BORDER },
    fill: { opacity: 1, type: "gradient", gradient: { opacityFrom: 0.85, opacityTo: 0.5 } },
    tooltip: { theme, x: { show: false } },
  };
}

function makeDonutOptions(labels: string[], theme: "dark" | "light", height = 240, onClick?: () => void): ApexOptions {
  return {
    chart: { type: "donut", background: "transparent", fontFamily: "Outfit, sans-serif", height, events: { click: onClick ? () => onClick() : undefined } },
    colors: ["#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6", "#9ca3af"],
    labels,
    legend: { position: "bottom", fontSize: "11px", labels: { colors: "#9ca3af" }, markers: { size: 6 } },
    dataLabels: { enabled: false },
    plotOptions: { pie: { donut: { size: "70%", labels: { show: true, total: { show: true, label: "Total", color: "#9ca3af", fontSize: "13px" }, value: { color: "#e5e7eb", fontSize: "12px" } } } } },
    stroke: { width: 2, colors: ["transparent"] },
    tooltip: { theme },
  };
}

function makeHBarOptions(categories: string[], colors: string[], theme: "dark" | "light", height = 240, onClick?: () => void): ApexOptions {
  return {
    colors,
    chart: { fontFamily: "Outfit, sans-serif", type: "bar", height, toolbar: { show: false }, background: "transparent", events: { click: onClick ? () => onClick() : undefined } },
    plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: "55%", distributed: true } },
    dataLabels: { enabled: true, style: { fontSize: "11px", colors: ["#fff"] } },
    xaxis: { categories, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: BASE_YAXIS_STYLE } },
    yaxis: { labels: { style: BASE_YAXIS_STYLE } },
    grid: { xaxis: { lines: { show: true } }, yaxis: { lines: { show: false } }, borderColor: GRID_BORDER },
    legend: { show: false },
    tooltip: { theme },
  };
}

/* ─── KPI skeleton ───────────────────────────────────────────────────────── */
const SkeletonKpi = (
  <div className="rounded-2xl bg-white dark:bg-white/[0.03] p-5 md:p-6 space-y-4">
    <Sk className="h-12 w-12 rounded-xl" />
    <div className="space-y-2 mt-5">
      <Sk className="h-3 w-20" />
      <Sk className="h-7 w-16" />
    </div>
  </div>
);

/* ─── Visibility hook: deriva los booleanos para los 24 submódulos ───────── */
function useDashboardVisibility() {
  const { can } = usePermissions();
  const v = (sub: string): boolean => can("dashboard", sub, "ver");
  type BoolGroup = Record<string, boolean>;
  const vis = {
    kpis: {
      flotas:         v("kpis_flotas"),
      mantenimiento: v("kpis_mantenimiento"),
      combustible:    v("kpis_combustible"),
      // alertas se ve junto con feed_alertas
    },
    charts: {
      combustibleMes:      v("chart_combustible_mes"),
      mantenimientosMes:   v("chart_mantenimientos_mes"),
      flotasEstado:        v("chart_flotas_estado"),
      flotasCategoria:     v("chart_flotas_categoria"),
      conductoresLicencia: v("chart_conductores_licencia"),
    },
    alerts: {
      feed: v("feed_alertas"),
    },
    activity: {
      timeline:     v("timeline_actividad"),
      proximosMtto: v("tabla_proximos_mantenimientos"),
    },
    // Grupos por dominio — cada grupo tiene un accent color
    sections: {
      combustible: {
        consumoPorVehiculo: v("consumo_por_vehiculo"),
        costoPorVehiculo:    v("costo_por_vehiculo"),
        consumoPorConductor: v("consumo_por_conductor"),
      } as BoolGroup,
      flota: {
        flotaPorSede:     v("flota_por_sede"),
        kpisPorSede:      v("kpis_por_sede"),
        flotaPorGaraje:   v("flota_por_garaje"),
        ocupacionGarajes: v("ocupacion_garajes"),
      } as BoolGroup,
      personas: {
        estadoAsignaciones:        v("estado_asignaciones"),
        disponibilidadConductores: v("disponibilidad_conductores"),
        kpisMisVehiculos:          v("kpis_mis_vehiculos"),
      } as BoolGroup,
      recursos: {
        kpisAc:                v("kpis_ac"),
        serviciosAcPendientes: v("servicios_ac_pendientes"),
        kpisChecklists:        v("kpis_checklists"),
        checklistsPendientes:  v("checklists_pendientes"),
        proximoCambioAceite:   v("proximo_cambio_aceite"),
        polizasPorVencer:      v("polizas_por_vencer"),
        coberturaActivos:      v("cobertura_activos"),
      } as BoolGroup,
      auditoria: {
        actividadPorUsuario:  v("actividad_por_usuario"),
        actividadPorEntidad: v("actividad_por_entidad"),
      } as BoolGroup,
    },
  };
  return vis;
}

function countVisible(sections: Record<string, unknown> | Record<string, Record<string, boolean>>): number {
  const values = Object.values(sections);
  return values.reduce<number>((acc, g) => {
    if (g && typeof g === "object" && !Array.isArray(g)) {
      return acc + Object.values(g as Record<string, unknown>).filter(Boolean).length;
    }
    return acc + (g ? 1 : 0);
  }, 0);
}

/* ─── Periodo (placeholder para futuro date-range filter) ───────────────── */
function usePeriod(): { from: Date; to: Date; label: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  return { from, to: now, label: "Últimos 12 meses" };
}

/* ─── Componente principal ───────────────────────────────────────────────── */
export function DashboardOverview() {
  const { session } = useAuth();
  const companyId = session?.companyId ?? null;
  const firstName = (session?.name ?? "").split(" ")[0] || "equipo";

  const { data: an, loading } = useDashboardAnalytics(companyId);
  const { alerts } = useAlerts();
  const vis = useDashboardVisibility();
  // Gating a nivel EMPRESA: si la empresa no tiene el módulo X activo,
  // no se muestran las tarjetas/charts que dependan de X. Esto se
  // aplica ADEMÁS del gating por permisos del user (vis.*).
  // El superadmin de plataforma bypassa este filtro.
  const mod = useCompanyModuleAccess();
  const period = usePeriod();
  const navigate = useNavigate();

  // ── Tema ──
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains("dark")
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  const theme = isDark ? "dark" : "light";

  // ── Colapsable state de secciones ──
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setCollapsed((p) => ({ ...p, [k]: !p[k] }));

  // ── KPIs (filtrado por permisos) ──
  const kpiCards = useMemo(() => {
    const k = an?.kpis;
    if (!k) return [];
    const pctAssets = k.totalAssets > 0 ? `+${Math.round((k.operativeAssets / k.totalAssets) * 100)}%` : undefined;
    return [
      { key: "kpis_flotas",        label: "Vehículos",       value: k.totalAssets.toString(),                  badge: pctAssets,  tone: "success" as const, icon: <IconTruck />,  href: "/flotas?kpi=Veh%C3%ADculos"        },
      { key: "kpis_mantenimiento", label: "Mantenimientos",  value: k.openMaintenances.toString(),             badge: undefined,  tone: "warning" as const, icon: <IconWrench />, href: "/mantenimiento?kpi=Mantenimientos" },
      { key: "kpis_alertas",       label: "Alertas activas", value: k.openAlerts.toString(),                   badge: k.criticalAlerts > 0 ? `-${k.criticalAlerts} críticas` : undefined, tone: "error" as const, icon: <IconBell />, href: "/alertas?kpi=Alertas" },
      { key: "kpis_combustible",   label: "Combustible (gal)", value: k.totalFuelGallons.toLocaleString("es-EC"), badge: undefined,  tone: "brand" as const,   icon: <IconFuel />,   href: "/combustible?kpi=Combustible"   },
    ].filter((c) => {
      if (c.key === "kpis_flotas")        return vis.kpis.flotas        && mod.hasModule("gestion");
      if (c.key === "kpis_mantenimiento") return vis.kpis.mantenimiento  && mod.hasModule("mantenimiento");
      if (c.key === "kpis_alertas")       return vis.alerts.feed         && mod.hasModule("alertas");
      if (c.key === "kpis_combustible")   return vis.kpis.combustible    && mod.hasModule("combustible");
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [an?.kpis, vis, mod.modules]);

  // ── Charts base ──
  const c = an?.charts;
  const areaOptions = useMemo(() => makeAreaOptions(c?.fuelOverTime.categories ?? [], theme, () => navigate("/combustible")),  [c?.fuelOverTime.categories, theme, navigate]);
  const barOptions  = useMemo(() => makeBarOptions(c?.maintenancesByMonth.categories ?? [], theme, 220, () => navigate("/mantenimiento")), [c?.maintenancesByMonth.categories, theme, navigate]);
  const donutOptions = useMemo(
    () => makeDonutOptions(c?.assetsByStatus.filter(d => d.value > 0).map(d => d.name) ?? [], theme, 280, () => navigate("/flotas")),
    [c?.assetsByStatus, theme, navigate]
  );
  const hBarOptions = useMemo(
    () => makeHBarOptions(c?.driversByLicense.map(d => d.name) ?? [], ["#465fff"], theme, 240, () => navigate("/operaciones/conductores")),
    [c?.driversByLicense, theme, navigate]
  );
  const catBarOptions = useMemo(
    () => makeBarOptions(c?.assetsByCategory.map(d => d.name) ?? [], theme, 220, () => navigate("/flotas")),
    [c?.assetsByCategory, theme, navigate]
  );

  // ── Alertas ──
  const alertItems = useMemo<AlertItem[]>(() =>
    alerts.filter(a => a.status !== "Cerrada").slice(0, 8).map(a => ({
      title:       a.title,
      description: a.notes || `${a.type} en estado ${a.status}.`,
      severity:    a.severity as AlertItem["severity"],
      time:        a.dueDate ? `Vence: ${a.dueDate}` : a.status,
    })),
  [alerts]);

  // ── Empty state ──
  const totalVisible = kpiCards.length
    + (vis.charts.combustibleMes ? 1 : 0) + (vis.charts.mantenimientosMes ? 1 : 0)
    + (vis.charts.flotasEstado ? 1 : 0) + (vis.charts.flotasCategoria ? 1 : 0) + (vis.charts.conductoresLicencia ? 1 : 0)
    + (vis.alerts.feed ? 1 : 0) + (vis.activity.timeline ? 1 : 0) + (vis.activity.proximosMtto ? 1 : 0)
    + countVisible(vis.sections);

  if (!loading && totalVisible === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center min-h-[60vh] gap-5 px-4">
        <div className="grid h-20 w-20 place-items-center rounded-2xl bg-gradient-to-br from-violet-500/10 to-sky-500/10 text-violet-400 ring-1 ring-violet-500/20">
          <LayoutGrid size={32} strokeWidth={1.5} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-white/90">Sin acceso a elementos del dashboard</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto leading-relaxed">
            Tu rol no tiene permisos para ver ningún elemento del dashboard.
            Para empezar a ver información, el administrador debe asignarte permisos.
          </p>
        </div>
      </div>
    );
  }

  // Helpers de colapso
  const isCollapsed = (k: string) => !!collapsed[k];

  return (
    <div className="space-y-7">
      {/* ─── HEADER ────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-500 mb-1">Centro de control</p>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white/90">
            Hola, {firstName}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
            <IconCal /> {period.label} · <span className="font-mono text-xs">{period.from.toISOString().slice(0,10)} → {period.to.toISOString().slice(0,10)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {vis.activity.timeline && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 text-emerald-400 px-3 py-1 text-[10px] font-bold uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              En vivo
            </span>
          )}
        </div>
      </div>

      {/* ─── SECCIÓN 1 · RESUMEN ────────────────────────────────────── */}
      {kpiCards.length > 0 && (
        <section className="space-y-3">
          <SectionHeader number="01" title="Resumen" subtitle="Indicadores clave en un vistazo" accent="violet" />
          <div className="grid gap-4 md:gap-5" style={autoFitStyle(220)}>
            {loading
              ? Array.from({ length: kpiCards.length }).map((_, i) => <div key={i}>{SkeletonKpi}</div>)
              : kpiCards.map(card => {
                  const { key, ...rest } = card;
                  return <KpiCard key={key} {...rest} />;
                })
            }
          </div>
        </section>
      )}

      {/* ─── SECCIÓN 2 · COMBUSTIBLE ─────────────────────────────────── */}
      {((vis.charts.combustibleMes && mod.hasModule("combustible")) || (vis.charts.flotasEstado && mod.hasModule("gestion")) || (vis.charts.flotasCategoria && mod.hasModule("gestion")) || (countVisible(vis.sections.combustible) > 0 && mod.hasModule("combustible"))) && (
        <section className="space-y-3">
          <SectionHeader
            number="02"
            title="Combustible & Flota"
            subtitle="Tendencias de carga y distribución de vehículos"
            accent="amber"
            collapsible
            collapsed={isCollapsed("combustible")}
            onToggle={() => toggle("combustible")}
          />
          {!isCollapsed("combustible") && (
            <div className="space-y-5">
              {/* Fila 1: 2 charts principales */}
              <div className="grid gap-5" style={autoFitStyle(420)}>
                {vis.charts.combustibleMes && mod.hasModule("combustible") && (
                  <div>
                    {loading || !c
                      ? <ChartSkeleton height="h-[280px]" />
                      : (
                        <div className="rounded-2xl border border-gray-100 dark:border-white/[0.04] bg-white dark:bg-[#0F172A] p-5">
                          <div className="mb-4 flex items-center gap-2.5">
                            <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500/10 text-amber-400">
                              <IconFuel />
                            </div>
                            <div>
                              <h3 className="text-[15px] font-semibold text-gray-800 dark:text-white/90">Combustible por mes</h3>
                              <p className="text-xs text-gray-500 dark:text-gray-400">Litros cargados y costo acumulado</p>
                            </div>
                            <a href="/combustible" className="ml-auto text-[10px] font-semibold text-violet-400 hover:text-violet-300">Ver más →</a>
                          </div>
                          <div className="max-w-full overflow-x-hidden">
                            <div className="min-w-[500px] xl:min-w-full">
                              <Suspense fallback={<Sk className="h-[280px]" />}>
                                {c.fuelOverTime.galones.every(v => v === 0) && c.fuelOverTime.cost.every(v => v === 0)
                                  ? <ChartEmptyState
                                      message="Sin cargas de combustible aún"
                                      hint="Cuando registres la primera carga, vas a ver la tendencia mensual acá."
                                      minHeight={280}
                                    />
                                  : <ReactApexChart
                                      options={areaOptions}
                                      series={[
                                        { name: "Galones",   data: c.fuelOverTime.galones },
                                        { name: "Costo USD", data: c.fuelOverTime.cost   },
                                      ]}
                                      type="area" height={280}
                                    />
                                }
                              </Suspense>
                            </div>
                          </div>
                        </div>
                      )
                    }
                  </div>
                )}
                {vis.charts.flotasEstado && mod.hasModule("gestion") && (
                  <div>
                    {loading || !c
                      ? <ChartSkeleton height="h-[280px]" />
                      : (
                        <div className="rounded-2xl border border-gray-100 dark:border-white/[0.04] bg-white dark:bg-[#0F172A] p-5 cursor-pointer hover:border-sky-300 dark:hover:border-sky-500/30 transition-colors" onClick={() => navigate("/flotas")}>
                          <div className="mb-4 flex items-center gap-2.5">
                            <div className="grid h-9 w-9 place-items-center rounded-xl bg-sky-500/10 text-sky-400">
                              <IconTruck />
                            </div>
                            <div>
                              <h3 className="text-[15px] font-semibold text-gray-800 dark:text-white/90">Flota por estado</h3>
                              <p className="text-xs text-gray-500 dark:text-gray-400">Distribución operativa</p>
                            </div>
                            <a href="/flotas" className="ml-auto text-[10px] font-semibold text-violet-400 hover:text-violet-300">Ver más →</a>
                          </div>
                          <Suspense fallback={<Sk className="h-[280px]" />}>
                            {c.assetsByStatus.every(d => d.value === 0)
                              ? <ChartEmptyState
                                  message="No hay vehículos en la flota"
                                  hint="Creá tu primer vehículo en Flotas para ver el desglose por estado."
                                  minHeight={280}
                                />
                              : <ReactApexChart
                                  options={donutOptions}
                                  series={c.assetsByStatus.map(d => d.value).filter(v => v > 0)}
                                  type="donut" height={280}
                                />
                            }
                          </Suspense>
                        </div>
                      )
                    }
                  </div>
                )}
              </div>

              {/* Fila 2: charts secundarios (mantenimientos + categoría + licencias) */}
              {((vis.charts.mantenimientosMes && mod.hasModule("mantenimiento")) || (vis.charts.flotasCategoria && mod.hasModule("gestion")) || (vis.charts.conductoresLicencia && mod.hasModule("gestion"))) && (
                <div className="grid gap-5" style={autoFitStyle(320)}>
                  {((vis.charts.mantenimientosMes && mod.hasModule("mantenimiento")) || (vis.charts.flotasCategoria && mod.hasModule("gestion"))) && (
                    <div>
                      {vis.charts.mantenimientosMes && mod.hasModule("mantenimiento") && (
                        loading || !c
                          ? <ChartSkeleton height="h-[220px]" />
                          : (
                        <div className="rounded-2xl border border-gray-100 dark:border-white/[0.04] bg-white dark:bg-[#0F172A] p-5 cursor-pointer hover:border-violet-300 dark:hover:border-violet-500/30 transition-colors" onClick={() => navigate("/mantenimiento")}>
                              <div className="mb-4 flex items-center gap-2.5">
                                <div className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500/10 text-violet-400">
                                  <IconWrench />
                                </div>
                                <div>
                                  <h3 className="text-[15px] font-semibold text-gray-800 dark:text-white/90">Mantenimientos por mes</h3>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">Órdenes programadas en el año</p>
                                </div>
                                <a href="/mantenimiento" className="ml-auto text-[10px] font-semibold text-violet-400 hover:text-violet-300">Ver más →</a>
                              </div>
                              <Suspense fallback={<Sk className="h-[220px]" />}>
                                {c.maintenancesByMonth.count.every(v => v === 0)
                                  ? <ChartEmptyState
                                      message="Sin mantenimientos en el año"
                                      hint="Cuando agendes el primero, vas a ver el histograma mensual acá."
                                      minHeight={220}
                                    />
                                  : <ReactApexChart
                                      options={barOptions}
                                      series={[{ name: "Cantidad", data: c.maintenancesByMonth.count }]}
                                      type="bar" height={220}
                                    />
                                }
                              </Suspense>
                            </div>
                          )
                      )}
                    </div>
                  )}
                  {vis.charts.conductoresLicencia && mod.hasModule("gestion") && (
                    <div>
                      {loading || !c
                        ? <ChartSkeleton height="h-[220px]" />
                        : (
                          <div className="rounded-2xl border border-gray-100 dark:border-white/[0.04] bg-white dark:bg-[#0F172A] p-5 cursor-pointer hover:border-amber-300 dark:hover:border-amber-500/30 transition-colors" onClick={() => navigate("/operaciones/conductores")}>
                            <div className="mb-4 flex items-center gap-2.5">
                              <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500/10 text-amber-400">
                                <IconUser />
                              </div>
                              <div>
                                <h3 className="text-[15px] font-semibold text-gray-800 dark:text-white/90">Conductores por licencia</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Distribución por tipo</p>
                              </div>
                            </div>
                            <Suspense fallback={<Sk className="h-[220px]" />}>
                              {c.driversByLicense.every(d => d.value === 0)
                                ? <ChartEmptyState
                                    message="Sin conductores registrados"
                                    hint="Cuando cargues el primer conductor, vas a ver el desglose por tipo de licencia."
                                    minHeight={220}
                                  />
                                : <ReactApexChart
                                    options={hBarOptions}
                                    series={[{ name: "Conductores", data: c.driversByLicense.map(d => d.value) }]}
                                    type="bar" height={220}
                                  />
                              }
                            </Suspense>
                          </div>
                        )
                      }
                    </div>
                  )}
                  {vis.charts.flotasCategoria && mod.hasModule("gestion") && (
                    <div>
                      {loading || !c
                        ? <ChartSkeleton height="h-[220px]" />
                        : (
                          <div className="rounded-2xl border border-gray-100 dark:border-white/[0.04] bg-white dark:bg-[#0F172A] p-5 cursor-pointer hover:border-emerald-300 dark:hover:border-emerald-500/30 transition-colors" onClick={() => navigate("/flotas")}>
                            <div className="mb-4 flex items-center gap-2.5">
                              <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500/10 text-emerald-400">
                                <IconTruck />
                              </div>
                              <div>
                                <h3 className="text-[15px] font-semibold text-gray-800 dark:text-white/90">Flota por categoría</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Camionetas, SUV, etc.</p>
                              </div>
                            </div>
                            <Suspense fallback={<Sk className="h-[220px]" />}>
                              {c.assetsByCategory.every(d => d.value === 0)
                                ? <ChartEmptyState
                                    message="Sin vehículos categorizados"
                                    hint="Cuando registres vehículos con categoría, vas a ver el desglose acá."
                                    minHeight={220}
                                  />
                                : <ReactApexChart
                                    options={catBarOptions}
                                    series={[{ name: "Cantidad", data: c.assetsByCategory.map(d => d.value) }]}
                                    type="bar" height={220}
                                  />
                              }
                            </Suspense>
                          </div>
                        )
                      }
                    </div>
                  )}
                </div>
              )}

              {/* Fila 3: consumo/costo por vehículo (cards inteligentes) */}
              {(vis.sections.combustible.consumoPorVehiculo || vis.sections.combustible.costoPorVehiculo || vis.sections.combustible.consumoPorConductor) && (
                <AutoGrid minWidth={360}>
                  {vis.sections.combustible.consumoPorVehiculo && <ConsumoPorVehiculoCard data={an?.intelligent.consumoPorVehiculo ?? []} loading={loading} />}
                  {vis.sections.combustible.consumoPorConductor && <ConsumoPorConductorCard />}
                </AutoGrid>
              )}
            </div>
          )}
        </section>
      )}

      {/* ─── SECCIÓN 3 · FLOTA Y SEDES/GARAJES ─────────────────────────── */}
      {mod.hasModule("gestion") && countVisible(vis.sections.flota) > 0 && (
        <section className="space-y-3">
          <SectionHeader
            number="03"
            title="Flota por ubicación"
            subtitle="Distribución por sede y garaje"
            accent="sky"
            collapsible
            collapsed={isCollapsed("flota")}
            onToggle={() => toggle("flota")}
          />
          {!isCollapsed("flota") && (
            <AutoGrid minWidth={360}>
              {vis.sections.flota.flotaPorSede     && <FlotaPorSedeCard     data={an?.intelligent.flotaPorSede     ?? []} loading={loading} />}
              {vis.sections.flota.kpisPorSede      && <KpisPorSedeCard      data={an?.intelligent.kpisPorSede      ?? []} loading={loading} />}
              {vis.sections.flota.flotaPorGaraje   && <FlotaPorGarajeCard   data={an?.intelligent.flotaPorGaraje   ?? []} loading={loading} />}
              {vis.sections.flota.ocupacionGarajes && <OcupacionGarajesCard data={an?.intelligent.ocupacionGarajes ?? []} loading={loading} />}
            </AutoGrid>
          )}
        </section>
      )}

      {/* ─── SECCIÓN 4 · PERSONAS (conductores, asignaciones) ─────────── */}
      {mod.hasModule("gestion") && countVisible(vis.sections.personas) > 0 && (
        <section className="space-y-3">
          <SectionHeader
            number="04"
            title="Personas"
            subtitle="Conductores y asignaciones"
            accent="emerald"
            collapsible
            collapsed={isCollapsed("personas")}
            onToggle={() => toggle("personas")}
          />
          {!isCollapsed("personas") && (
            <AutoGrid minWidth={360}>
              {vis.sections.personas.estadoAsignaciones        && <EstadoAsignacionesCard />}
              {vis.sections.personas.disponibilidadConductores && <DisponibilidadConductoresCard />}
              {vis.sections.personas.kpisMisVehiculos          && <KpisMisVehiculosCard />}
            </AutoGrid>
          )}
        </section>
      )}

      {/* ─── SECCIÓN 5 · RECURSOS (A/C, checklists, aceite, inventario, seguros) ─ */}
      {((vis.sections.recursos.kpisAc && mod.hasModule("ac")) ||
        (vis.sections.recursos.serviciosAcPendientes && mod.hasModule("ac")) ||
        (vis.sections.recursos.kpisChecklists && mod.hasModule("checklist")) ||
        (vis.sections.recursos.checklistsPendientes && mod.hasModule("checklist")) ||
        (vis.sections.recursos.polizasPorVencer && mod.hasModule("seguros")) ||
        (vis.sections.recursos.coberturaActivos && mod.hasModule("seguros"))
      ) && (
        <section className="space-y-3">
          <SectionHeader
            number="05"
            title="Recursos & Servicios"
            subtitle="Aires acondicionados, checklists, aceite, inventario, seguros"
            accent="rose"
            collapsible
            collapsed={isCollapsed("recursos")}
            onToggle={() => toggle("recursos")}
          />
          {!isCollapsed("recursos") && (
            <AutoGrid minWidth={360}>
              {vis.sections.recursos.kpisAc                && mod.hasModule("ac")            && <KpisAcCard />}
              {vis.sections.recursos.serviciosAcPendientes && mod.hasModule("ac")            && <ServiciosAcPendientesCard />}
              {vis.sections.recursos.kpisChecklists        && mod.hasModule("checklist")     && <KpisChecklistsCard />}
              {vis.sections.recursos.checklistsPendientes  && mod.hasModule("checklist")     && <ChecklistsPendientesCard />}
              {vis.sections.recursos.polizasPorVencer      && mod.hasModule("seguros")       && <PolizasPorVencerCard />}
              {vis.sections.recursos.coberturaActivos      && mod.hasModule("seguros")       && <CoberturaActivosCard />}
            </AutoGrid>
          )}
        </section>
      )}

      {/* ─── SECCIÓN 6 · ATENCIÓN (alertas + actividad) ───────────────── */}
      {((vis.alerts.feed && mod.hasModule("alertas")) || (vis.activity.timeline && mod.hasModule("alertas"))) && (
        <section className="space-y-3">
          <SectionHeader
            number="06"
            title="Atención"
            subtitle="Alertas activas y actividad reciente"
            accent="rose"
            collapsible
            collapsed={isCollapsed("atencion")}
            onToggle={() => toggle("atencion")}
          />
          {!isCollapsed("atencion") && (
            <div className="grid gap-5" style={autoFitStyle(420)}>
              {vis.alerts.feed && mod.hasModule("alertas") && (
                <div className="rounded-2xl border border-gray-100 dark:border-white/[0.04] bg-white dark:bg-[#0F172A] p-5">
                  <div className="mb-4 flex items-center gap-2.5">
                    <div className="grid h-9 w-9 place-items-center rounded-xl bg-rose-500/10 text-rose-400">
                      <IconBell />
                    </div>
                    <div>
                      <h3 className="text-[15px] font-semibold text-gray-800 dark:text-white/90">Alertas activas</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{alerts.filter(a => a.status !== "Cerrada").length} abiertas</p>
                    </div>
                    <a href="/alertas" className="ml-auto text-[10px] font-semibold text-violet-400 hover:text-violet-300">Ver más →</a>
                  </div>
                  {alertItems.length === 0
                    ? <ChartEmptyState
                        message="Sin alertas activas"
                        hint="Cuando se genere una alerta, va a aparecer acá."
                        minHeight={180}
                        icon={Bell}
                      />
                    : <AlertsFeed items={alertItems} />
                  }
                </div>
              )}
              {vis.activity.timeline && mod.hasModule("alertas") && (
                <div className="rounded-2xl border border-gray-100 dark:border-white/[0.04] bg-white dark:bg-[#0F172A] p-5">
                  <div className="mb-4 flex items-center gap-2.5">
                    <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500/10 text-emerald-400">
                      <IconActivity />
                    </div>
                    <div>
                      <h3 className="text-[15px] font-semibold text-gray-800 dark:text-white/90">Actividad reciente</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Últimos eventos en la empresa</p>
                    </div>
                    <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 text-emerald-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      En vivo
                    </span>
                  </div>
                  {an?.recentActivity && an.recentActivity.length > 0 ? (
                    <div className="overflow-y-auto max-h-[480px] -mx-2 px-2">
                      {an.recentActivity.slice(0, 10).map((e, i) => {
                        const isLast = i === Math.min(an.recentActivity.length - 1, 9);
                        const { icon, color, bgColor, textColor, label } = getEventMeta(e.entity);
                        return (
                          <div key={e.id} className="flex gap-0">
                            <div className="flex flex-col items-center w-8 shrink-0">
                              <div className="w-2.5 h-2.5 rounded-full mt-1.5 ring-2 ring-white dark:ring-[#0F172A] shrink-0" style={{ background: color }} />
                              {!isLast && <div className="w-px flex-1 min-h-4 bg-gray-200 dark:bg-gray-700 mt-1" />}
                            </div>
                            <div className="flex-1 pb-4 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1" style={{ background: bgColor, color: textColor }}>
                                  {icon}{label}
                                </span>
                              </div>
                              <p className="text-[13px] font-medium text-gray-800 dark:text-white/90 leading-snug">{e.description}</p>
                              <p className="text-[11px] text-gray-400 mt-0.5">{e.actor}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 text-center py-8">Sin actividad reciente</p>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ─── PRÓXIMOS MANTENIMIENTOS ─────────────────────────────────── */}
      {vis.activity.proximosMtto && mod.hasModule("mantenimiento") && (
        <section className="space-y-3">
          <SectionHeader number="07" title="Próximos mantenimientos" subtitle="Mantenimientos programados" accent="violet" />
          <MaintenanceTable />
        </section>
      )}

      {/* ─── SECCIÓN 8 · AUDITORÍA (al final, opcional) ──────────────── */}
      {mod.hasModule("alertas") && countVisible(vis.sections.auditoria) > 0 && (
        <section className="space-y-3">
          <SectionHeader
            number="08"
            title="Auditoría"
            subtitle="Actividad por usuario y entidad"
            accent="slate"
            collapsible
            collapsed={isCollapsed("auditoria")}
            onToggle={() => toggle("auditoria")}
          />
          {!isCollapsed("auditoria") && (
            <AutoGrid minWidth={400}>
              {vis.sections.auditoria.actividadPorUsuario  && <ActividadPorUsuarioCard />}
              {vis.sections.auditoria.actividadPorEntidad && <ActividadPorEntidadCard />}
            </AutoGrid>
          )}
        </section>
      )}
    </div>
  );
}
