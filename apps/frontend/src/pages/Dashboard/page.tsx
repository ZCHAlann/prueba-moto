import { useMemo, lazy, Suspense } from "react";
import { useAuth } from "../../context/AuthContext";
import { KpiCard } from "../../components/dashboard/kpi-card";
import { AlertsFeed } from "../../components/dashboard/alerts-feed";
import { MaintenanceTable } from "../../components/dashboard/maintenance-table";
import { useDashboardAnalytics } from "../../hooks/useDashboardAnalytics";
import { useAlerts } from "../../hooks/useAlerts";
import type { ApexOptions } from "apexcharts";
import type { AlertItem } from "../../components/dashboard/alerts-feed";
import { Wrench, Truck, User, Fuel, Bell, Circle } from "lucide-react";

// ─── Lazy-load ReactApexChart — never blocks initial paint ───────────────────
const ReactApexChart = lazy(() => import("react-apexcharts"));

/* ─── Icons ──────────────────────────────────────────────────────────────── */
function TruckIcon() {
  return (
    <svg className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm10 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM1 1h11l3 9H4L1 1zm13 0h4l3 9h-4.5" />
    </svg>
  );
}
function WrenchIcon() {
  return (
    <svg className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}
function BellIcon() {
  return (
    <svg className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.158V11a6 6 0 0 0-5-5.917V4a1 1 0 1 0-2 0v1.083A6 6 0 0 0 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9" />
    </svg>
  );
}
function FuelIcon() {
  return (
    <svg className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h12v13H3zM3 8h12M8 21v-5m0 0H6m2 0h2m6-9 2 2-2 2m2-2h-4" />
    </svg>
  );
}

/* ─── Skeleton ───────────────────────────────────────────────────────────── */
function Sk({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-gray-200 dark:bg-white/[0.06] ${className}`} />;
}

// Skeleton de chart — se muestra mientras ApexCharts carga (lazy) o datos cargan
function ChartSkeleton({ height }: { height: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#0F172A] p-5">
      <Sk className="h-5 w-40 mb-5" />
      <Sk className={height} />
    </div>
  );
}

/* ─── ChartCard ──────────────────────────────────────────────────────────── */
function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white dark:bg-[#0F172A] px-5 pb-5 pt-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
      <div className="mb-5">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{title}</h3>
        {subtitle && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

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

/* ─── Memoized ApexOptions (fuera del componente = nunca se recrean) ─────── */
const BASE_AXIS_STYLE = { fontSize: "12px", colors: "#e5e7eb" as string | string[] };
const BASE_YAXIS_STYLE = { fontSize: "12px", colors: ["#6B7280"] };
const GRID_BORDER = "rgba(156,163,175,0.12)";

function makeAreaOptions(categories: string[]): ApexOptions {
  return {
    legend: { show: false },
    colors: ["#465FFF", "#10b981"],
    chart: { fontFamily: "Outfit, sans-serif", height: 310, type: "line", toolbar: { show: false }, background: "transparent" },
    stroke: { curve: "straight", width: [2, 2] },
    fill: { type: "gradient", gradient: { opacityFrom: 0.55, opacityTo: 0 } },
    markers: { size: 0, strokeColors: "#fff", strokeWidth: 2, hover: { size: 6 } },
    grid: { xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } }, borderColor: GRID_BORDER },
    dataLabels: { enabled: false },
    xaxis: { type: "category", categories, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: BASE_AXIS_STYLE } },
    yaxis: { labels: { style: BASE_YAXIS_STYLE } },
    tooltip: { theme: "dark" },
  };
}

function makeBarOptions(categories: string[]): ApexOptions {
  return {
    colors: ["#465fff"],
    chart: { fontFamily: "Outfit, sans-serif", type: "bar", height: 180, toolbar: { show: false }, background: "transparent" },
    plotOptions: { bar: { horizontal: false, columnWidth: "39%", borderRadius: 5, borderRadiusApplication: "end" } },
    dataLabels: { enabled: false },
    stroke: { show: true, width: 4, colors: ["transparent"] },
    xaxis: { categories, axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: BASE_AXIS_STYLE } },
    yaxis: { labels: { style: BASE_YAXIS_STYLE } },
    grid: { yaxis: { lines: { show: true } }, borderColor: GRID_BORDER },
    fill: { opacity: 1 },
    tooltip: { theme: "dark", x: { show: false } },
  };
}

function makeDonutOptions(labels: string[]): ApexOptions {
  return {
    chart: { type: "donut", background: "transparent", fontFamily: "Outfit, sans-serif" },
    colors: ["#10b981", "#f59e0b", "#ef4444", "#9ca3af"],
    labels,
    legend: { position: "bottom", fontSize: "12px", labels: { colors: "#9ca3af" } },
    dataLabels: { enabled: false },
    plotOptions: { pie: { donut: { size: "65%", labels: { show: true, total: { show: true, label: "Total", color: "#9ca3af", fontSize: "13px" } } } } },
    stroke: { width: 0 },
    tooltip: { theme: "dark" },
  };
}

const H_BAR_OPTIONS: ApexOptions = {
  colors: ["#465fff"],
  chart: { fontFamily: "Outfit, sans-serif", type: "bar", height: 180, toolbar: { show: false }, background: "transparent" },
  plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: "55%" } },
  dataLabels: { enabled: false },
  xaxis: { axisBorder: { show: false }, axisTicks: { show: false }, labels: { style: BASE_YAXIS_STYLE } },
  yaxis: { labels: { style: BASE_YAXIS_STYLE } },
  grid: { xaxis: { lines: { show: true } }, yaxis: { lines: { show: false } }, borderColor: GRID_BORDER },
  tooltip: { theme: "dark" },
};

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

/* ─── Component ──────────────────────────────────────────────────────────── */
export function DashboardOverview() {
  const { session } = useAuth();
  const companyId = session?.companyId ?? null;

  // Único hook crítico para el primer paint (KPIs + charts + actividad)
  const { data: an, loading } = useDashboardAnalytics(companyId);

  // Alerts: solo para el feed — se difiere con su propio loading
  const { alerts } = useAlerts();

  // ── KPIs — memoizados sobre an.kpis, no sobre `an` entero ───────────────
  const kpiCards = useMemo(() => {
    const k = an?.kpis;
    if (!k) return [];
    const pctAssets = k.totalAssets > 0 ? `+${Math.round((k.operativeAssets / k.totalAssets) * 100)}%` : undefined;
    return [
      { label: "Vehículos",       value: k.totalAssets.toString(),                  badge: pctAssets,  tone: "success" as const, icon: <TruckIcon />,  href: "/flotas"        },
      { label: "Mantenimientos",  value: k.openMaintenances.toString(),             badge: undefined,  tone: "warning" as const, icon: <WrenchIcon />, href: "/mantenimiento" },
      { label: "Alertas activas", value: k.openAlerts.toString(),                   badge: k.criticalAlerts > 0 ? `-${k.criticalAlerts} críticas` : undefined, tone: "error" as const, icon: <BellIcon />, href: "/alertas" },
      { label: "Combustible (L)", value: k.totalFuelLiters.toLocaleString("es-EC"), badge: undefined,  tone: "brand" as const,   icon: <FuelIcon />,   href: "/combustible"   },
    ];
  }, [an?.kpis]);

  // ── Chart options — memoizadas sobre sus categorías ──────────────────────
  const c = an?.charts;

  const areaOptions  = useMemo(() => makeAreaOptions(c?.fuelOverTime.categories ?? []),  [c?.fuelOverTime.categories]);
  const barOptions   = useMemo(() => makeBarOptions(c?.maintenancesByMonth.categories ?? []), [c?.maintenancesByMonth.categories]);
  const donutOptions = useMemo(
    () => makeDonutOptions(c?.assetsByStatus.filter(d => d.value > 0).map(d => d.name) ?? []),
    [c?.assetsByStatus]
  );

  // ── Alert feed — memoizado sobre alerts ──────────────────────────────────
  const alertItems = useMemo<AlertItem[]>(() =>
    alerts.filter(a => a.status !== "Cerrada").slice(0, 6).map(a => ({
      title:       a.title,
      description: a.notes || `${a.type} en estado ${a.status}.`,
      severity:    a.severity as AlertItem["severity"],
      time:        a.dueDate ? `Vence: ${a.dueDate}` : a.status,
    })),
  [alerts]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-500 mb-1">Centro de control</p>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white/90">ApliSmart Motors</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Visibilidad operativa: flota, mantenimiento y combustible.</p>
      </div>

      {/* KPIs — render inmediato con skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 md:gap-6">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <div key={i}>{SkeletonKpi}</div>)
          : kpiCards.map(card => <KpiCard key={card.label} {...card} />)
        }
      </div>

      {/* Fila 1: Área combustible + Donut */}
      <div className="grid gap-4 xl:grid-cols-3 md:gap-6">
        <div className="xl:col-span-2">
          {loading || !c
            ? <ChartSkeleton height="h-[310px]" />
            : (
              <ChartCard title="Combustible por mes" subtitle="Litros cargados y costo acumulado">
                <div className="max-w-full overflow-x-hidden">
                  <div className="min-w-[600px] xl:min-w-full">
                    <Suspense fallback={<Sk className="h-[310px]" />}>
                      <ReactApexChart
                        options={areaOptions}
                        series={[
                          { name: "Litros",    data: c.fuelOverTime.liters },
                          { name: "Costo USD", data: c.fuelOverTime.cost   },
                        ]}
                        type="area"
                        height={310}
                      />
                    </Suspense>
                  </div>
                </div>
              </ChartCard>
            )
          }
        </div>
        <div>
          {loading || !c
            ? <ChartSkeleton height="h-[310px]" />
            : (
              <ChartCard title="Flota por estado" subtitle="Distribución operativa">
                <Suspense fallback={<Sk className="h-[310px]" />}>
                  <ReactApexChart
                    options={donutOptions}
                    series={c.assetsByStatus.map(d => d.value).filter(v => v > 0)}
                    type="donut"
                    height={310}
                  />
                </Suspense>
              </ChartCard>
            )
          }
        </div>
      </div>

      {/* Fila 2: Barras mantenimientos + Barras licencias */}
      <div className="grid gap-4 xl:grid-cols-3 md:gap-6">
        <div className="xl:col-span-2">
          {loading || !c
            ? <ChartSkeleton height="h-[180px]" />
            : (
              <ChartCard title="Mantenimientos por mes" subtitle="Órdenes programadas en el año">
                <div className="max-w-full overflow-x-auto">
                  <div className="-ml-5 min-w-[600px] xl:min-w-full pl-2">
                    <Suspense fallback={<Sk className="h-[180px]" />}>
                      <ReactApexChart
                        options={barOptions}
                        series={[{ name: "Cantidad", data: c.maintenancesByMonth.count }]}
                        type="bar"
                        height={180}
                      />
                    </Suspense>
                  </div>
                </div>
              </ChartCard>
            )
          }
        </div>
        <div>
          {loading || !c
            ? <ChartSkeleton height="h-[180px]" />
            : (
              <ChartCard title="Conductores por licencia">
                <Suspense fallback={<Sk className="h-[180px]" />}>
                  <ReactApexChart
                    options={H_BAR_OPTIONS}
                    series={[{ name: "Conductores", data: c.driversByLicense.map(d => d.value) }]}
                    type="bar"
                    height={180}
                  />
                </Suspense>
              </ChartCard>
            )
          }
        </div>
      </div>

      {/* Fila 3: Alertas + Actividad reciente */}
      <div className="grid gap-4 xl:grid-cols-2 md:gap-6">
        <div>
          <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-white/90">Alertas recientes</h2>
          <AlertsFeed items={alertItems} />
        </div>
        <div>
          <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-white/90">Actividad reciente</h2>
          {an?.recentActivity && an.recentActivity.length > 0 && (
            <div className="rounded-2xl border border-gray-200 dark:border-gray-100 bg-white dark:bg-white/[0.03] px-5 py-5 overflow-y-auto max-h-[480px]">
              {an.recentActivity.slice(0, 8).map((e, i) => {
                const isLast = i === Math.min(an.recentActivity.length - 1, 7);
                const { icon, color, bgColor, textColor, label } = getEventMeta(e.entity);
                return (
                  <div key={e.id} className="flex gap-0">
                    <div className="flex flex-col items-center w-10 flex-shrink-0">
                      <div className="w-2.5 h-2.5 rounded-full mt-1 ring-2 ring-gray-900 flex-shrink-0" style={{ background: color }} />
                      {!isLast && <div className="w-px flex-1 min-h-6 bg-gray-200 dark:bg-gray-700 mt-1" />}
                    </div>
                    <div className="flex-1 pb-5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1"
                          style={{ background: bgColor, color: textColor }}
                        >
                          {icon}
                          {label}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-gray-800 dark:text-white/90 leading-snug">{e.description}</p>
                      <p className="text-xs text-gray-400 mt-1">{e.actor}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Próximos mantenimientos — al fondo, carga last */}
      <section>
        <MaintenanceTable />
      </section>
    </div>
  );
}