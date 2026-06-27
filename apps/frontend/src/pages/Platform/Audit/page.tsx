import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactApexChart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import {
  Shield, Search, Filter, ChevronLeft, ChevronRight,
  RefreshCw, Activity, Users, Layers, Clock,
} from "lucide-react";
import { DatePicker } from "../../../components/ui/date-picker/DatePicker";
import { usePlatformAudit }      from "../../../hooks/usePlatformAudit";
import { usePlatformAuditStats } from "../../../hooks/usePlatformAuditStats";
import { ExportToolbar }         from "../../../components/ui/export-toolbar/ExportToolbar";
import type { PlatformAuditEntry } from "../../../types/platform";
import { fmtDateTimeEc } from "@/lib/datetime";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return fmtDateTimeEc(iso);
}

function formatDay(iso: string) {
  return fmtDateShortEc(iso);
}

const ENTITY_COLORS: Record<string, string> = {
  company: "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300",
  lead:    "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  plan:    "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  user:    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  unknown: "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400",
};

const ACTION_COLORS: Record<string, string> = {
  create: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  update: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  delete: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
};

function getActionVerb(action: string) {
  const verb = action.split(".")[1] ?? action;
  return ACTION_COLORS[verb] ?? "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400";
}

// ─── Chart defaults ───────────────────────────────────────────────────────────

const CHART_BASE: ApexOptions = {
  chart: {
    background: "transparent",
    fontFamily: "Outfit, sans-serif",
    toolbar: { show: false },
    animations: { enabled: true, speed: 600 },
  },
  tooltip: { theme: "dark" },
  grid: {
    borderColor: "rgba(148,163,184,0.08)",
    strokeDashArray: 4,
  },
};

// ─── Chart Card wrapper ───────────────────────────────────────────────────────

function ChartCard({
  title, subtitle, icon, children, delay = 0,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className="rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-5 dark:border-white/[0.06] dark:bg-[#0F172A]"
    >
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-50 text-brand-500 dark:bg-brand-500/10 dark:text-brand-400">
          {icon}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-white">{title}</p>
          {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500">{subtitle}</p>}
        </div>
      </div>
      {children}
    </motion.div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ChartSkeleton({ h = 220 }: { h?: number }) {
  return (
    <div
      className="animate-pulse rounded-xl bg-gray-100 dark:bg-white/[0.04]"
      style={{ height: h }}
    />
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function AuditPage() {
  // ── Date range for stats ──────────────────────────────────────────────────
  const [from, setFrom] = useState("");
  const [to,   setTo]   = useState("");

  const { stats, loading: statsLoading, refetch: refetchStats } = usePlatformAuditStats(from, to);

  // ── Table filters via hook ────────────────────────────────────────────────
  const {
    entries, total, page, loading: tableLoading,
    filters, setFilters, setPage, refetch: refetchTable,
  } = usePlatformAudit();

  // ── Sync date range to table filters too ─────────────────────────────────
  function applyDateRange() {
    setFilters({ from, to });
    refetchStats(from, to);
  }

  function clearDateRange() {
    setFrom(""); setTo("");
    setFilters({ from: "", to: "" });
    refetchStats("", "");
  }

  // ── Derived chart data ────────────────────────────────────────────────────

  const byDayData = useMemo(() => {
    if (!stats) return { categories: [] as string[], series: [] as number[] };
    const entries = Object.entries(stats.byDay);
    return {
      categories: entries.map(([d]) => formatDay(d)),
      series:     entries.map(([, v]) => v),
    };
  }, [stats]);

  const topActionsData = useMemo(() => {
    if (!stats) return { categories: [] as string[], series: [] as number[] };
    return {
      categories: stats.topActions.map(a => a.action),
      series:     stats.topActions.map(a => a.count),
    };
  }, [stats]);

  const byEntityData = useMemo(() => {
    if (!stats) return [];
    return stats.byEntity.map(e => ({ label: e.entity, value: e.count }));
  }, [stats]);

  const topActorsData = useMemo(() => {
    if (!stats) return { categories: [] as string[], series: [] as number[] };
    return {
      categories: stats.topActors.map(a =>
        a.actor.length > 22 ? a.actor.slice(0, 22) + "…" : a.actor
      ),
      series: stats.topActors.map(a => a.count),
    };
  }, [stats]);

  const byHourData = useMemo(() => {
    if (!stats) return { categories: [] as string[], series: [] as number[] };
    return {
      categories: stats.byHour.map(h => `${String(h.hour).padStart(2, "0")}h`),
      series:     stats.byHour.map(h => h.count),
    };
  }, [stats]);

  // Radar: normalise top 5 entities + actions into 0-100
  const radarData = useMemo(() => {
    if (!stats || stats.total === 0) return { labels: [] as string[], series: [] as number[] };
    const max = stats.total;
    const points = [
      ...stats.byEntity.slice(0, 3).map(e => ({
        label: e.entity,
        value: Math.round((e.count / max) * 100),
      })),
      ...stats.topActions.slice(0, 2).map(a => ({
        label: a.action.split(".")[0] ?? a.action,
        value: Math.round((a.count / max) * 100),
      })),
    ];
    // deduplicate labels
    const seen = new Set<string>();
    const unique = points.filter(p => { if (seen.has(p.label)) return false; seen.add(p.label); return true; });
    return {
      labels: unique.map(p => p.label),
      series: unique.map(p => p.value),
    };
  }, [stats]);

  // ── ApexCharts options ────────────────────────────────────────────────────

  const barVerticalOpts: ApexOptions = {
    ...CHART_BASE,
    chart: { ...CHART_BASE.chart, type: "bar", id: "audit-by-day" },
    plotOptions: { bar: { borderRadius: 5, columnWidth: "55%" } },
    colors: ["#465fff"],
    xaxis: {
      categories: byDayData.categories,
      labels: { style: { colors: "#94a3b8", fontSize: "11px" } },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: "#94a3b8", fontSize: "11px" } } },
    dataLabels: { enabled: false },
  };

  const barHorizontalActionsOpts: ApexOptions = {
    ...CHART_BASE,
    chart: { ...CHART_BASE.chart, type: "bar", id: "audit-top-actions" },
    plotOptions: { bar: { borderRadius: 5, horizontal: true, barHeight: "55%" } },
    colors: ["#7a5af8"],
    xaxis: {
      categories: topActionsData.categories,
      labels: { style: { colors: "#94a3b8", fontSize: "11px" } },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: "#94a3b8", fontSize: "11px" } } },
    dataLabels: { enabled: false },
  };

  const barHorizontalActorsOpts: ApexOptions = {
    ...CHART_BASE,
    chart: { ...CHART_BASE.chart, type: "bar", id: "audit-top-actors" },
    plotOptions: { bar: { borderRadius: 5, horizontal: true, barHeight: "55%" } },
    colors: ["#0ba5ec"],
    xaxis: {
      categories: topActorsData.categories,
      labels: { style: { colors: "#94a3b8", fontSize: "11px" } },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: "#94a3b8", fontSize: "11px" } } },
    dataLabels: { enabled: false },
  };

  const areaHourOpts: ApexOptions = {
    ...CHART_BASE,
    chart: { ...CHART_BASE.chart, type: "area", id: "audit-by-hour" },
    stroke: { curve: "smooth", width: 2 },
    fill: {
      type: "gradient",
      gradient: { shadeIntensity: 1, opacityFrom: 0.25, opacityTo: 0.01, stops: [0, 100] },
    },
    colors: ["#12b76a"],
    xaxis: {
      categories: byHourData.categories,
      labels: { style: { colors: "#94a3b8", fontSize: "10px" }, rotate: 0 },
      axisBorder: { show: false }, axisTicks: { show: false },
      tickAmount: 6,
    },
    yaxis: { labels: { style: { colors: "#94a3b8", fontSize: "11px" } } },
    dataLabels: { enabled: false },
  };

  const donutOpts: ApexOptions = {
    ...CHART_BASE,
    chart: { ...CHART_BASE.chart, type: "donut", id: "audit-by-entity" },
    labels: byEntityData.map(e => e.label),
    colors: ["#465fff", "#7a5af8", "#0ba5ec", "#12b76a", "#f79009"],
    legend: {
      position: "bottom",
      labels: { colors: "#94a3b8" },
      fontSize: "12px",
    },
    plotOptions: {
      pie: {
        donut: {
          size: "65%",
          labels: {
            show: true,
            total: {
              show: true,
              label: "Total",
              color: "#94a3b8",
              fontSize: "13px",
              fontWeight: 600,
              formatter: () => String(stats?.total ?? 0),
            },
          },
        },
      },
    },
    dataLabels: { enabled: false },
  };

  const radarOpts: ApexOptions = {
    ...CHART_BASE,
    chart: { ...CHART_BASE.chart, type: "radar", id: "audit-radar" },
    colors: ["#465fff"],
    fill: { opacity: 0.15 },
    stroke: { width: 2 },
    markers: { size: 4 },
    xaxis: {
      categories: radarData.labels,
      labels: { style: { colors: Array(radarData.labels.length).fill("#94a3b8"), fontSize: "11px" } },
    },
    yaxis: { show: false, max: 100 },
    dataLabels: { enabled: false },
  };

  // ── Export columns ────────────────────────────────────────────────────────

  const exportColumns = [
    { key: "id",          label: "ID"       },
    { key: "actorEmail",  label: "Actor"    },
    { key: "action",      label: "Acción"   },
    { key: "entity",      label: "Entidad"  },
    { key: "entityId",    label: "ID Ent."  },
    { key: "description", label: "Descripción" },
    { key: "createdAt",   label: "Fecha"    },
  ];

  const exportRows = entries.map(e => ({
    ...e,
    createdAt: formatDate(e.createdAt),
  }));

  const totalPages = Math.max(1, Math.ceil(total / filters.limit));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
      >
        <div>
          <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-violet-200 dark:border-violet-500/20 bg-violet-50 dark:bg-violet-500/10 px-2.5 py-1">
            <Shield size={11} className="text-violet-500 dark:text-violet-400" />
            <span className="text-xs font-medium text-violet-700 dark:text-violet-400">Superadmin</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Auditoría de plataforma</h1>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            Registro completo de todas las acciones realizadas en la plataforma.
          </p>
        </div>

        {/* Date range filter */}
        <motion.div
          initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="flex flex-wrap items-center gap-2 self-start"
        >
          <DatePicker
            value={from}
            onChange={val => { setFrom(val); }}
            placeholder="Desde"
            maxDate={to || undefined}
          />
          <span className="text-sm text-gray-300 dark:text-gray-600">—</span>
          <DatePicker
            value={to}
            onChange={val => { setTo(val); }}
            placeholder="Hasta"
            minDate={from || undefined}
          />
          <button type="button" onClick={applyDateRange}
            className="rounded-xl bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600 transition-colors">
            Aplicar
          </button>
          {(from || to) && (
            <button type="button" onClick={clearDateRange}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-400">
              Limpiar
            </button>
          )}
          <button type="button" onClick={() => { refetchStats(from, to); refetchTable(); }}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-400">
            <RefreshCw size={12} /> Actualizar
          </button>
        </motion.div>
      </motion.div>

      {/* ── Fila 1: Barras verticales (por día) + Donut (por entidad) ───── */}
      <div className="grid gap-5 xl:grid-cols-3">

        <div className="xl:col-span-2">
          <ChartCard
            title="Actividad diaria"
            subtitle="Acciones registradas en los últimos 14 días"
            icon={<Activity size={15} />}
            delay={0.1}
          >
            {statsLoading ? <ChartSkeleton h={220} /> : (
              <ReactApexChart
                type="bar"
                height={220}
                options={barVerticalOpts}
                series={[{ name: "Acciones", data: byDayData.series }]}
              />
            )}
          </ChartCard>
        </div>

        <ChartCard
          title="Por entidad"
          subtitle="Distribución de acciones según tipo de entidad"
          icon={<Layers size={15} />}
          delay={0.15}
        >
          {statsLoading ? <ChartSkeleton h={220} /> : (
            <ReactApexChart
              type="donut"
              height={220}
              options={donutOpts}
              series={byEntityData.map(e => e.value)}
            />
          )}
        </ChartCard>
      </div>

      {/* ── Fila 2: Top acciones (horiz) + Top actores (horiz) ──────────── */}
      <div className="grid gap-5 xl:grid-cols-2">

        <ChartCard
          title="Acciones más frecuentes"
          subtitle="Top 8 tipos de acción en el período"
          icon={<Filter size={15} />}
          delay={0.2}
        >
          {statsLoading ? <ChartSkeleton h={240} /> : (
            <ReactApexChart
              type="bar"
              height={240}
              options={barHorizontalActionsOpts}
              series={[{ name: "Veces", data: topActionsData.series }]}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Actores más activos"
          subtitle="Top 6 usuarios por volumen de acciones"
          icon={<Users size={15} />}
          delay={0.25}
        >
          {statsLoading ? <ChartSkeleton h={240} /> : (
            <ReactApexChart
              type="bar"
              height={240}
              options={barHorizontalActorsOpts}
              series={[{ name: "Acciones", data: topActorsData.series }]}
            />
          )}
        </ChartCard>
      </div>

      {/* ── Fila 3: Área (por hora) + Radar (concentración) ─────────────── */}
      <div className="grid gap-5 xl:grid-cols-3">

        <div className="xl:col-span-2">
          <ChartCard
            title="Patrón horario"
            subtitle="Distribución de actividad por hora del día"
            icon={<Clock size={15} />}
            delay={0.3}
          >
            {statsLoading ? <ChartSkeleton h={200} /> : (
              <ReactApexChart
                type="area"
                height={200}
                options={areaHourOpts}
                series={[{ name: "Acciones", data: byHourData.series }]}
              />
            )}
          </ChartCard>
        </div>

        <ChartCard
          title="Concentración de actividad"
          subtitle="Radar normalizado: entidades vs acciones dominantes"
          icon={<Activity size={15} />}
          delay={0.35}
        >
          {statsLoading || radarData.labels.length === 0 ? (
            <ChartSkeleton h={200} />
          ) : (
            <ReactApexChart
              type="radar"
              height={200}
              options={radarOpts}
              series={[{ name: "% del total", data: radarData.series }]}
            />
          )}
        </ChartCard>
      </div>

      {/* ── Tabla ────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.4 }}
        className="rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-[#0F172A]"
      >
        {/* Table header */}
        <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 dark:border-white/[0.06] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-white">Registros de auditoría</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">{total} entradas totales</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ExportToolbar
              title="Auditoría de plataforma"
              subtitle={`${total} registros exportados`}
              filename="auditoria-plataforma"
              columns={exportColumns}
              rows={exportRows}
            />
          </div>
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap gap-2 border-b border-gray-100 px-5 py-3 dark:border-white/[0.06]">
          {/* Search */}
          <div className="relative min-w-[180px] flex-1">
            <Search size={12} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={filters.search}
              onChange={e => setFilters({ search: e.target.value })}
              placeholder="Buscar por actor, acción…"
              className="h-9 w-full rounded-xl border border-gray-200 bg-white pl-8 pr-3 text-xs
                text-gray-700 placeholder:text-gray-400 outline-none transition
                focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10
                dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300"
            />
          </div>

          {/* Entity filter */}
          <select
            value={filters.entity}
            onChange={e => setFilters({ entity: e.target.value })}
            className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-xs text-gray-700 outline-none
              focus:border-brand-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300"
          >
            <option value="">Todas las entidades</option>
            <option value="company">company</option>
            <option value="lead">lead</option>
            <option value="plan">plan</option>
            <option value="user">user</option>
          </select>

          {/* Action filter */}
          <select
            value={filters.action}
            onChange={e => setFilters({ action: e.target.value })}
            className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-xs text-gray-700 outline-none
              focus:border-brand-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300"
          >
            <option value="">Todas las acciones</option>
            <option value="company.created">company.created</option>
            <option value="company.updated">company.updated</option>
            <option value="company.deleted">company.deleted</option>
            <option value="plan.changed">plan.changed</option>
            <option value="lead.created">lead.created</option>
            <option value="lead.updated">lead.updated</option>
            <option value="user.login">user.login</option>
          </select>

          {/* Limit */}
          <select
            value={filters.limit}
            onChange={e => setFilters({ limit: Number(e.target.value) })}
            className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-xs text-gray-700 outline-none
              focus:border-brand-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300"
          >
            <option value={25}>25 / pág.</option>
            <option value={50}>50 / pág.</option>
            <option value={100}>100 / pág.</option>
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/[0.06]">
                {["ID", "Actor", "Acción", "Entidad", "Descripción", "Fecha"].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="wait">
                {tableLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50 dark:border-white/[0.03]">
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-5 py-3">
                          <div className="h-4 animate-pulse rounded-lg bg-gray-100 dark:bg-white/[0.04]"
                            style={{ width: `${[30, 60, 50, 40, 80, 45][j]}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : entries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-sm text-gray-400">
                      No se encontraron registros con los filtros actuales.
                    </td>
                  </tr>
                ) : (
                  entries.map((entry: PlatformAuditEntry, i: number) => (
                    <motion.tr
                      key={entry.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: i * 0.02 }}
                      className="border-b border-gray-50 transition-colors hover:bg-gray-50/60 dark:border-white/[0.03] dark:hover:bg-white/[0.02]"
                    >
                      {/* ID */}
                      <td className="px-5 py-3 text-xs font-mono text-gray-400 dark:text-gray-500">
                        #{entry.id}
                      </td>

                      {/* Actor */}
                      <td className="px-5 py-3">
                        <span className="max-w-[160px] truncate block text-xs font-medium text-gray-700 dark:text-gray-300">
                          {entry.actorEmail ?? "sistema"}
                        </span>
                      </td>

                      {/* Acción */}
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-semibold ${getActionVerb(entry.action)}`}>
                          {entry.action}
                        </span>
                      </td>

                      {/* Entidad */}
                      <td className="px-5 py-3">
                        {entry.entity && (
                          <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-semibold ${ENTITY_COLORS[entry.entity] ?? ENTITY_COLORS.unknown}`}>
                            {entry.entity}
                            {entry.entityId && (
                              <span className="ml-1 opacity-60">#{entry.entityId}</span>
                            )}
                          </span>
                        )}
                      </td>

                      {/* Descripción */}
                      <td className="px-5 py-3 max-w-[260px]">
                        <span className="truncate block text-xs text-gray-500 dark:text-gray-400">
                          {entry.description ?? "—"}
                        </span>
                      </td>

                      {/* Fecha */}
                      <td className="px-5 py-3 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                        {formatDate(entry.createdAt)}
                      </td>
                    </motion.tr>
                  ))
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 dark:border-white/[0.06]">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Página {page} de {totalPages} — {total} registros
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 disabled:opacity-40 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-400"
            >
              <ChevronLeft size={14} />
            </button>

            {/* Page pills */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = totalPages <= 5 ? i + 1 : Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
              return (
                <button key={p} type="button" onClick={() => setPage(p)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-medium transition
                    ${p === page
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-400"
                    }`}
                >
                  {p}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 disabled:opacity-40 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-400"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}