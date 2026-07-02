"use client";

import { lazy, Suspense, useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  Fuel, Plus, X, Droplets, DollarSign, Gauge,
  MapPin, TrendingUp, TrendingDown, ChevronRight,
  Flame, BarChart3, ChevronLeft,
  Pencil, Trash2,
  Download, Calendar, Table2, CalendarRange as CalRangeIcon,
  FileText, FileDown, Sheet, Copy, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import type { ApexOptions } from "apexcharts";
import { useFuel, type ApiFuelEntry, type CreateFuelPayload } from "../../hooks/useFuel";
import { usePermissions } from "../../hooks/usePermissions";
import { RowActionMenu } from "../../components/ui/table/RowActionMenu";
import {
  exportToPdf,
  exportToExcel,
  exportToCsv,
  copyToClipboard,
  type ExportColumn,
  type ExportRow,
} from "../../components/ui/export-toolbar/ExportToolbar";
import { DatePicker } from "../../components/ui/date-picker/DatePicker";
import { useAuth } from "../../context/AuthContext";
import { FuelDetailDrawer } from "./components/FuelDetailDrawer";
import { DeleteConfirm } from "./components/DeleteConfirm";
import { FuelFormModal } from "./components/FuelFormModal";
import { FuelInsights } from "./FuelInsights";
import { FuelCalendarBreakdown } from "./components/FuelCalendarBreakdown";

// ─── Lazy ApexCharts (igual que el dashboard) ──────────────────────────────
const ReactApexChart = lazy(() => import("react-apexcharts"));

// ─── Export columns ────────────────────────────────────────────────────────────

const EXPORT_COLS: ExportColumn[] = [
  { key: "plate",    label: "Placa"    },
  { key: "unit",     label: "Unidad"   },
  { key: "date",     label: "Fecha"    },
  { key: "gallons",  label: "Galones"  },
  { key: "cost",     label: "Costo"    },
  { key: "station",  label: "Estación" },
  { key: "odometer", label: "Odómetro" },
];

const PAGE_SIZE = 7;

// ─── Palette ───────────────────────────────────────────────────────────────
const CHART_COLORS = [
  "#465FFF", "#10b981", "#f59e0b", "#06b6d4",
  "#8b5cf6", "#f43f5e", "#22c55e", "#eab308",
  "#a78bfa", "#fb7185", "#38bdf8", "#4ade80",
];

const MONTHS_ES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("es-EC", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtMonth(ym: string) {
  const [y, m] = ym.split("-");
  return `${MONTHS_ES[Number(m) - 1]} ${y.slice(2)}`;
}

function fmtDate(ymd: string) {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  return `${d} ${MONTHS_ES[Number(m) - 1]} ${y}`;
}

function Sk({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-gray-200 dark:bg-white/[0.06] ${className}`} />;
}

// ─── Chart data builders ───────────────────────────────────────────────────

type AssetMeta = { id: string; plate: string };

function buildMonthBuckets(
  fuelEntries: ApiFuelEntry[],
  activeAssets: AssetMeta[]
): { months: string[]; labels: string[]; seriesByAsset: Map<string, number[]> } {
  const monthSet = new Set<string>();
  const raw = new Map<string, Map<string, number>>(); // month → assetId → value

  for (const e of fuelEntries) {
    const month = e.date.slice(0, 7);
    monthSet.add(month);
    if (!raw.has(month)) raw.set(month, new Map());
    const bucket = raw.get(month)!;
    bucket.set(e.assetId, (bucket.get(e.assetId) ?? 0) + e.gallons);
  }

  const months = [...monthSet].sort();
  const labels = months.map(fmtMonth);

  const seriesByAsset = new Map<string, number[]>();
  for (const a of activeAssets) {
    seriesByAsset.set(
      a.id,
      months.map((m) => raw.get(m)?.get(a.id) ?? 0)
    );
  }

  return { months, labels, seriesByAsset };
}

function buildCostBuckets(
  fuelEntries: ApiFuelEntry[],
  activeAssets: AssetMeta[]
): { months: string[]; labels: string[]; seriesByAsset: Map<string, number[]> } {
  const monthSet = new Set<string>();
  const raw = new Map<string, Map<string, number>>();

  for (const e of fuelEntries) {
    const month = e.date.slice(0, 7);
    monthSet.add(month);
    if (!raw.has(month)) raw.set(month, new Map());
    const bucket = raw.get(month)!;
    bucket.set(e.assetId, (bucket.get(e.assetId) ?? 0) + e.cost);
  }

  const months = [...monthSet].sort();
  const labels = months.map(fmtMonth);

  const seriesByAsset = new Map<string, number[]>();
  for (const a of activeAssets) {
    seriesByAsset.set(
      a.id,
      months.map((m) => raw.get(m)?.get(a.id) ?? 0)
    );
  }

  return { months, labels, seriesByAsset };
}

// ─── ApexCharts option builders ────────────────────────────────────────────

const GRID_BORDER = "rgba(156,163,175,0.10)";
const BASE_AXIS_STYLE = { fontSize: "11px", colors: "#6B7280" as string | string[] };

function makeLineOptions(
  categories: string[],
  colors: string[],
  theme: "dark" | "light",
  yFormatter: (v: number) => string
): ApexOptions {
  return {
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: "line",
      height: 260,
      toolbar: { show: false },
      background: "transparent",
      zoom: { enabled: false },
      animations: { enabled: true, speed: 400 },
    },
    colors,
    stroke: {
      curve: "smooth",
      width: 2.5,
    },
    markers: {
      size: 0,
      hover: { size: 5, sizeOffset: 2 },
    },
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.18,
        opacityTo: 0,
        stops: [0, 100],
      },
    },
    grid: {
      borderColor: GRID_BORDER,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { top: 0, right: 8, bottom: 0, left: 0 },
    },
    dataLabels: { enabled: false },
    xaxis: {
      type: "category",
      categories,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: { style: BASE_AXIS_STYLE },
    },
    yaxis: {
      labels: {
        style: { fontSize: "11px", colors: ["#6B7280"] },
        formatter: yFormatter,
      },
    },
    legend: {
      show: true,
      position: "top",
      horizontalAlign: "left",
      fontSize: "11px",
      labels: { colors: theme === "dark" ? "#9CA3AF" : "#6B7280" },
      markers: { size: 6 },
      itemMargin: { horizontal: 10 },
    },
    tooltip: {
      theme,
      shared: true,
      intersect: false,
      y: { formatter: yFormatter },
    },
  };
}

function makeBarOptions(
  categories: string[],
  colors: string[],
  theme: "dark" | "light",
  yFormatter: (v: number) => string
): ApexOptions {
  return {
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: "bar",
      height: 260,
      toolbar: { show: false },
      background: "transparent",
      animations: { enabled: true, speed: 400 },
    },
    colors,
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: "55%",
        borderRadius: 4,
        borderRadiusApplication: "end",
      },
    },
    dataLabels: { enabled: false },
    stroke: { show: true, width: 2, colors: ["transparent"] },
    grid: {
      borderColor: GRID_BORDER,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { top: 0, right: 8, bottom: 0, left: 0 },
    },
    xaxis: {
      categories,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: { style: BASE_AXIS_STYLE },
    },
    yaxis: {
      labels: {
        style: { fontSize: "11px", colors: ["#6B7280"] },
        formatter: yFormatter,
      },
    },
    legend: {
      show: true,
      position: "top",
      horizontalAlign: "left",
      fontSize: "11px",
      labels: { colors: theme === "dark" ? "#9CA3AF" : "#6B7280" },
      markers: { size: 6 },
      itemMargin: { horizontal: 10 },
    },
    tooltip: {
      theme,
      shared: true,
      intersect: false,
      y: { formatter: yFormatter },
    },
    fill: {
      type: "gradient",
      gradient: { opacityFrom: 0.9, opacityTo: 0.6 },
    },
  };
}

// ─── FuelCharts component ─────────────────────────────────────────────────

type FuelChartsProps = {
  fuelEntries: ApiFuelEntry[];
  assets: Array<{ id: number; plate: string; brand: string | null; model: string | null }>;
};

function FuelCharts({ fuelEntries, assets }: FuelChartsProps) {
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

  // Assets activos (que tienen al menos una entry)
  const activeAssets = useMemo<AssetMeta[]>(() => {
    const ids = new Set<string>(fuelEntries.map((e) => e.assetId));
    return assets
      .filter((a) => ids.has(String(a.id)))
      .map((a) => ({
        id: String(a.id),
        plate: a.plate ?? String(a.id),
      }))
      .sort((a, b) => a.plate.localeCompare(b.plate));
  }, [fuelEntries, assets]);

  const gallonsBuckets = useMemo(
    () => buildMonthBuckets(fuelEntries, activeAssets),
    [fuelEntries, activeAssets]
  );

  const costBuckets = useMemo(
    () => buildCostBuckets(fuelEntries, activeAssets),
    [fuelEntries, activeAssets]
  );

  const gallonsSeries = useMemo(() =>
    activeAssets.map((a, i) => ({
      name: a.plate,
      data: gallonsBuckets.seriesByAsset.get(a.id) ?? [],
    })),
    [activeAssets, gallonsBuckets]
  );

  const costSeries = useMemo(() =>
    activeAssets.map((a) => ({
      name: a.plate,
      data: costBuckets.seriesByAsset.get(a.id) ?? [],
    })),
    [activeAssets, costBuckets]
  );

  const colors = useMemo(
    () => activeAssets.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
    [activeAssets]
  );

  const lineOpts = useMemo(
    () => makeLineOptions(
      gallonsBuckets.labels,
      colors,
      theme,
      (v) => `${fmt(v, 2)} gal`
    ),
    [gallonsBuckets.labels, colors, theme]
  );

  const barOpts = useMemo(
    () => makeBarOptions(
      costBuckets.labels,
      colors,
      theme,
      (v) => `$${fmt(v)}`
    ),
    [costBuckets.labels, colors, theme]
  );

  if (fuelEntries.length === 0 || activeAssets.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="flex flex-col items-center gap-2">
          <BarChart3 size={20} className="text-gray-300 dark:text-gray-600" />
          <p className="text-xs text-gray-400 dark:text-gray-500">Sin datos suficientes para generar gráficas</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

      {/* Gráfica 1 — Línea suavizada: galones por vehículo */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-[#0F172A]">
        <div className="border-b border-gray-100 px-5 py-4 dark:border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-500/[0.12]">
              <TrendingUp size={14} className="text-brand-600 dark:text-brand-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white">
                Galones por vehículo
              </h3>
              <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                Consumo mensual · una línea por unidad
              </p>
            </div>
          </div>
        </div>
        <div className="p-4">
          <div className="max-w-full overflow-x-hidden">
            <div className="min-w-[400px] xl:min-w-full">
              <Suspense fallback={<Sk className="h-[260px]" />}>
                <ReactApexChart
                  options={lineOpts}
                  series={gallonsSeries}
                  type="line"
                  height={260}
                />
              </Suspense>
            </div>
          </div>
        </div>
      </div>

      {/* Gráfica 2 — Barras verticales: costo por vehículo */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-[#0F172A]">
        <div className="border-b border-gray-100 px-5 py-4 dark:border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-success-50 dark:bg-success-500/[0.12]">
              <DollarSign size={14} className="text-success-600 dark:text-success-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white">
                Gasto por vehículo
              </h3>
              <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                Costo mensual en USD · comparativa entre unidades
              </p>
            </div>
          </div>
        </div>
        <div className="p-4">
          <div className="max-w-full overflow-x-hidden">
            <div className="min-w-[400px] xl:min-w-full">
              <Suspense fallback={<Sk className="h-[260px]" />}>
                <ReactApexChart
                  options={barOpts}
                  series={costSeries}
                  type="bar"
                  height={260}
                />
              </Suspense>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

type KpiProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  trend?: "up" | "down" | null;
  trendLabel?: string;
  accent: string;
};

function KpiCard({ icon, label, value, sub, trend, trendLabel, accent }: KpiProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/[0.06] dark:bg-white/[0.03]">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${accent} opacity-80`} />
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-50 text-gray-500 dark:bg-white/[0.05] dark:text-gray-400">
          {icon}
        </div>
        {trend && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
            trend === "up"
              ? "bg-success-50 text-success-600 dark:bg-success-500/[0.12] dark:text-success-400"
              : "bg-error-50 text-error-600 dark:bg-error-500/[0.12] dark:text-error-400"
          }`}>
            {trend === "up" ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {trendLabel}
          </span>
        )}
      </div>
      <p className="mt-3 text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums text-gray-800 dark:text-white">{value}</p>
      <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{sub}</p>
    </div>
  );
}

// ─── Table row ─────────────────────────────────────────────────────────────────

function TableRow({ plate, unit, date, gallons, cost, station, odometer, onClick, onEdit, onDelete, canEdit, canDelete }: {
  plate: string; unit: string; date: string; gallons: string;
  cost: string; station: string; odometer: number;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
}) {
  const showMenu = canEdit || canDelete;

  return (
    <tr
      onClick={onClick}
      className={`group transition-colors ${onClick ? "cursor-pointer hover:bg-gray-50/80 dark:hover:bg-white/[0.02]" : ""}`}
    >
      <td className="px-5 py-3.5">
        <p className="font-semibold text-gray-800 dark:text-white">{plate}</p>
        <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{unit}</p>
      </td>
      <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300">{fmtDate(date)}</td>
      <td className="px-5 py-3.5">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-warning-50 px-2.5 py-1 text-xs font-bold text-warning-700 dark:bg-warning-500/[0.12] dark:text-warning-400">
          <Droplets size={11} />
          {gallons}
        </span>
      </td>
      <td className="px-5 py-3.5 text-sm font-semibold text-gray-700 dark:text-gray-200">{cost}</td>
      <td className="px-5 py-3.5">
        <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          <MapPin size={11} className="shrink-0" />
          {station}
        </span>
      </td>
      <td className="px-5 py-3.5">
        <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          <Gauge size={11} className="shrink-0" />
          {odometer.toLocaleString()} km
        </span>
      </td>
      {showMenu && (
        <td className="group-hover:bg-gray-50/80 dark:group-hover:bg-white/[0.02] px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
          <RowActionMenu
            ariaLabel="Acciones del registro de combustible"
            items={[
              { label: "Editar",   icon: <Pencil size={13} />, onClick: () => onEdit?.(),   tone: "default", disabled: !canEdit },
              { label: "Eliminar", icon: <Trash2 size={13} />, onClick: () => onDelete?.(), tone: "danger",  disabled: !canDelete },
            ]}
          />
        </td>
      )}
    </tr>
  );
}

// ─── Paginación ────────────────────────────────────────────────────────────────

function Pagination({ page, total, pageSize, onChange }: {
  page: number; total: number; pageSize: number; onChange: (p: number) => void;
}) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;

  return (
    <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 dark:border-white/[0.06]">
      <span className="text-xs text-gray-400 dark:text-gray-500">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total} registros
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition hover:bg-gray-50 disabled:opacity-30 dark:border-white/[0.08] dark:hover:bg-white/[0.04]"
        >
          <ChevronLeft size={13} />
        </button>

        {Array.from({ length: pages }, (_, i) => i + 1)
          .filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 1)
          .reduce<(number | "…")[]>((acc, p, i, arr) => {
            if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
            acc.push(p);
            return acc;
          }, [])
          .map((p, i) =>
            p === "…" ? (
              <span key={`ellipsis-${i}`} className="px-1 text-xs text-gray-400">…</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onChange(p as number)}
                className={`flex h-7 w-7 items-center justify-center rounded-lg border text-xs font-semibold transition
                  ${page === p
                    ? "border-brand-500 bg-brand-500 text-white"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.04]"
                  }`}
              >
                {p}
              </button>
            )
          )
        }

        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page === pages}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition hover:bg-gray-50 disabled:opacity-30 dark:border-white/[0.08] dark:hover:bg-white/[0.04]"
        >
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Export Modal ──────────────────────────────────────────────────────────────

type ExportScope  = "current" | "date_range" | "all";
type ExportFormat = "pdf" | "excel" | "csv" | "copy";

type ExportModalProps = {
  allRows: ExportRow[];
  currentRows: ExportRow[];
  title: string;
  subtitle: string;
  filename: string;
  columns: ExportColumn[];
  onClose: () => void;
};

function ExportModal({ allRows, currentRows, title, subtitle, filename, columns, onClose }: ExportModalProps) {
  const [scope,    setScope]  = useState<ExportScope>("current");
  const [format,   setFormat] = useState<ExportFormat>("excel");
  const [fromDate, setFrom]   = useState("");
  const [toDate,   setTo]     = useState("");
  const [exporting, setExporting] = useState(false);

  const rangeRows = useMemo(() => {
    return allRows.filter((r) => {
      const d = (r.date as string) ?? "";
      if (fromDate && d < fromDate) return false;
      if (toDate   && d > toDate)   return false;
      return true;
    });
  }, [allRows, fromDate, toDate]);

  const previewCount =
    scope === "all"        ? allRows.length :
    scope === "date_range" ? rangeRows.length :
    currentRows.length;

  async function handleExport() {
    const rows =
      scope === "all"        ? allRows :
      scope === "date_range" ? rangeRows :
      currentRows;

    if (rows.length === 0) {
      toast.warning("No hay registros para exportar con esos filtros.");
      return;
    }

    const props = { title, subtitle, filename, columns, rows };
    setExporting(true);
    try {
      if (format === "pdf")   await exportToPdf(props);
      if (format === "excel") await exportToExcel(props);
      if (format === "csv")   exportToCsv(props);
      if (format === "copy")  {
        await copyToClipboard(props);
        toast.success("Copiado al portapapeles", { description: `${rows.length} filas listas para pegar.` });
        onClose();
        return;
      }
      toast.success("Archivo generado", { description: "La descarga comenzó automáticamente." });
      onClose();
    } catch (err) {
      toast.error("Error al exportar", { description: err instanceof Error ? err.message : "Intenta de nuevo." });
    } finally {
      setExporting(false);
    }
  }

  const scopeOptions: { value: ExportScope; icon: React.ReactNode; title: string; desc: string }[] = [
    { value: "current",    icon: <Table2 size={15} />,      title: "Vista actual",    desc: "Registros con filtros aplicados." },
    { value: "date_range", icon: <CalRangeIcon size={15} />, title: "Rango de fechas", desc: "Entre dos fechas específicas."    },
    { value: "all",        icon: <Download size={15} />,    title: "Toda la base",    desc: "Sin paginado ni filtros."          },
  ];

  const formatOptions: { value: ExportFormat; icon: React.ReactNode; label: string }[] = [
    { value: "excel", icon: <Sheet    size={13} />, label: "Excel" },
    { value: "pdf",   icon: <FileText size={13} />, label: "PDF"   },
    { value: "csv",   icon: <FileDown size={13} />, label: "CSV"   },
    { value: "copy",  icon: <Copy     size={13} />, label: "Copiar"},
  ];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0d1320]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-white/[0.06]">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-500/[0.12]">
              <Download size={15} className="text-brand-600 dark:text-brand-400" />
            </div>
            <h2 className="text-base font-bold text-gray-800 dark:text-white">Exportar registros</h2>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:bg-gray-50 dark:border-white/[0.08] dark:hover:bg-white/[0.05]">
            <X size={15} />
          </button>
        </div>

        <div className="space-y-5 p-6">
          {/* Alcance */}
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">¿Qué registros?</p>
            <div className="space-y-2">
              {scopeOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setScope(opt.value)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                    scope === opt.value
                      ? "border-brand-400 bg-brand-50 dark:border-brand-500/40 dark:bg-brand-500/[0.08]"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-white/[0.06] dark:hover:bg-white/[0.03]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={scope === opt.value ? "text-brand-600 dark:text-brand-400" : "text-gray-400"}>
                      {opt.icon}
                    </span>
                    <div>
                      <p className={`text-sm font-semibold ${scope === opt.value ? "text-brand-700 dark:text-brand-300" : "text-gray-700 dark:text-gray-200"}`}>
                        {opt.title}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{opt.desc}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {scope === "date_range" && (
              <div className="mt-2 rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-white/[0.05] dark:bg-white/[0.03] space-y-3">
                <DatePicker label="Desde" value={fromDate} onChange={setFrom} maxDate={toDate || undefined} />
                <DatePicker label="Hasta" value={toDate}   onChange={setTo}   minDate={fromDate || undefined} />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {rangeRows.length} registro{rangeRows.length !== 1 ? "s" : ""} en ese rango.
                </p>
              </div>
            )}

            {scope === "all" && (
              <div className="mt-2 rounded-xl border border-warning-200 bg-warning-50 px-4 py-2.5 dark:border-warning-500/20 dark:bg-warning-500/[0.08]">
                <p className="text-xs font-semibold text-warning-700 dark:text-warning-400">
                  Se exportarán <span className="font-black">{allRows.length} registros</span>. El archivo puede ser grande.
                </p>
              </div>
            )}
          </div>

          {/* Formato */}
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Formato</p>
            <div className="grid grid-cols-4 gap-2">
              {formatOptions.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFormat(f.value)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border py-3 text-xs font-semibold transition ${
                    format === f.value
                      ? "border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-500/40 dark:bg-brand-500/[0.08] dark:text-brand-300"
                      : "border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50 dark:border-white/[0.06] dark:text-gray-400 dark:hover:bg-white/[0.03]"
                  }`}
                >
                  {f.icon}
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4 dark:border-white/[0.06]">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {previewCount} registro{previewCount !== 1 ? "s" : ""} a exportar
          </span>
          <div className="flex gap-3">
            <button onClick={onClose} disabled={exporting} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-white/[0.08] dark:text-gray-300">
              Cancelar
            </button>
            <button
              onClick={handleExport}
              disabled={previewCount === 0 || exporting}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600 active:scale-95 disabled:opacity-50"
            >
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {exporting ? "Generando…" : "Exportar"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export function FuelPage() {
  const { fuelEntries, assets, loading: fuelLoading, createFuelEntry, updateFuelEntry, deleteFuelEntry } = useFuel();
  const { can } = usePermissions();
  const { session } = useAuth();

  const canCreate = can("combustible", "combustible", "crear");
  const canEdit   = can("combustible", "combustible", "editar");
  const canDelete = can("combustible", "combustible", "eliminar");

  const isAdminOrOwner =
    session?.role === "admin_empresa" || session?.role === "owner_empresa";

  const loading = fuelLoading;

  const [search,       setSearch]       = useState("");
  const [dateFrom,     setDateFrom]     = useState("");
  const [dateTo,       setDateTo]       = useState("");
  const [page,         setPage]         = useState(1);
  const [detail,       setDetail]       = useState<ApiFuelEntry | null>(null);

  const [formOpen,     setFormOpen]     = useState(false);

  // KPI click: read ?from=&to= params from URL (set by EstadisticasTab KPI card)
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const f = searchParams.get("from");
    const t = searchParams.get("to");
    // Only set if valid YYYY-MM-DD format
    if (f && /^\d{4}-\d{2}-\d{2}$/.test(f)) setDateFrom(f);
    if (t && /^\d{4}-\d{2}-\d{2}$/.test(t)) setDateTo(t);
  }, []);
  const [editEntry,    setEditEntry]    = useState<ApiFuelEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiFuelEntry | null>(null);
  const [exportOpen,   setExportOpen]   = useState(false);

  // ── Stats ──────────────────────────────────────────────────────────────────

  const totalGallons = fuelEntries.reduce((s, e) => s + e.gallons, 0);
  const totalCost    = fuelEntries.reduce((s, e) => s + e.cost,   0);
  const avgCostPerGal = totalGallons > 0 ? totalCost / totalGallons : 0;

  // ── Table rows ─────────────────────────────────────────────────────────────

  const tableRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return fuelEntries
      .map((e) => {
        const asset = assets.find((a) => String(a.id) === String(e.assetId));
        return {
          id:       e.id,
          plate:    asset?.plate?.trim() || "—",
          unit:     asset ? `${asset.brand ?? ""} ${asset.model ?? ""}`.trim() || "—" : "—",
          date:     e.date,
gallons:  `${fmt(e.gallons, 2)} gal`,
          cost:     `${fmt(e.cost)} USD`,
          station:  e.station,
          odometer: e.odometer,
          entry:    e,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter((r) => {
        const matchQ    = !q || r.plate.toLowerCase().includes(q) || r.unit.toLowerCase().includes(q) || r.station.toLowerCase().includes(q) || (r.entry.invoiceNumber ?? "").toLowerCase().includes(q);
        const matchFrom = !dateFrom || r.date >= dateFrom;
        const matchTo   = !dateTo   || r.date <= dateTo;
        return matchQ && matchFrom && matchTo;
      });
  }, [fuelEntries, assets, search, dateFrom, dateTo]);

  const handleSearch   = (v: string) => { setSearch(v);   setPage(1); };
  const handleDateFrom = (v: string) => { setDateFrom(v); setPage(1); };
  const handleDateTo   = (v: string) => { setDateTo(v);   setPage(1); };

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return tableRows.slice(start, start + PAGE_SIZE);
  }, [tableRows, page]);

  const allExportRows: ExportRow[] = useMemo(() => fuelEntries
    .map((e) => {
      // BUG FIX: mismo fix de comparación
      const asset = assets.find((a) => String(a.id) === String(e.assetId));
      return {
        id:       e.id,
        plate:    asset?.plate?.trim() || "—",
        unit:     asset ? `${asset.brand ?? ""} ${asset.model ?? ""}`.trim() || "—" : "—",
        date:     e.date,
        gallons:  `${fmt(e.gallons, 2)} gal`,
        cost:     `${fmt(e.cost)} USD`,
        station:  e.station,
        odometer: e.odometer,
        entry:    e,
      };
    })
    .sort((a, b) => (b.date as string).localeCompare(a.date as string)),
  [fuelEntries, assets]);

  const currentExportRows: ExportRow[] = tableRows.map((r) => ({ ...r }));

  // ── Handlers ───────────────────────────────────────────────────────────────

  function openCreate() {
    setEditEntry(null);
    setFormOpen(true);
  }

  function openEdit(entry: ApiFuelEntry) {
    setEditEntry(entry);
    setFormOpen(true);
    setDetail(null);
  }

  async function handleSave(payload: CreateFuelPayload, id?: string) {
    try {
      if (id) {
        await updateFuelEntry(id, payload);
        toast.success("Registro actualizado");
      } else {
        await createFuelEntry(payload);
        toast.success("Registro guardado");
      }
    } catch {
      toast.error("No se pudo guardar el registro");
      throw new Error("save failed");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteFuelEntry(deleteTarget.id);
      toast.success("Registro eliminado");
      if (detail?.id === deleteTarget.id) setDetail(null);
    } catch {
      toast.error("No se pudo eliminar el registro");
    }
    setDeleteTarget(null);
  }

  const hasDateFilter = dateFrom || dateTo;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-50 px-3 py-1 text-xs font-bold uppercase tracking-widest text-warning-600 dark:bg-warning-500/[0.12] dark:text-warning-400">
            <Flame size={11} />
            Combustible
          </span>
          <h1 className="mt-2 text-2xl font-bold text-gray-800 dark:text-white">
            Control de combustible
          </h1>
          <p className="mt-1 max-w-lg text-sm text-gray-500 dark:text-gray-400">
            Registro de cargas, rendimiento por unidad y análisis de consumo consolidado.
          </p>
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-500/20 transition hover:bg-brand-600 active:scale-95"
          >
            <Plus size={15} />
            Nuevo registro
          </button>
        )}
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard icon={<BarChart3 size={16} />}   label="Registros"   value={fuelEntries.length.toString()} sub="Cargas totales"      accent="bg-brand-500"   />
        <KpiCard icon={<Droplets  size={16} />}   label="Galones"     value={`${fmt(totalGallons, 2)} gal`} sub="Consumo acumulado"   accent="bg-warning-500" />
        <KpiCard icon={<DollarSign size={16} />}  label="Costo total" value={`${fmt(totalCost)} USD`}        sub={`Promedio ${fmt(avgCostPerGal)} USD/gal`} accent="bg-success-500" />
      </div>

      {/* ── Dashboard de gráficas (solo admin/owner) ───────────────────────── */}
      {isAdminOrOwner && (
        <div className="space-y-3">
          <div className="flex items-end justify-between px-0.5">
            <div>
              <h2 className="text-sm font-semibold text-gray-800 dark:text-white">
                Análisis de consumo
              </h2>
              <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                Evolución y comparativa mensual por vehículo
              </p>
            </div>
          </div>
          <FuelCharts fuelEntries={fuelEntries} assets={assets} />

          {/* Insights automáticos — usa el mismo rango de fechas del historial */}
          <FuelInsights from={dateFrom} to={dateTo} />

          {/* Calendario con heatmap + timeline del día seleccionado */}
          <div className="max-w-sm">
            <FuelCalendarBreakdown entries={fuelEntries} isAdmin={isAdminOrOwner} />
          </div>
        </div>
      )}

      {/* ── Historial ─────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]">

        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/[0.06]">
          <div>
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white">Historial de cargas</h2>
            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
              Todos los abastecimientos registrados, ordenados por fecha. Haz clic en una fila para ver el detalle.
            </p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="border-b border-gray-100 px-5 py-3 dark:border-white/[0.06]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="relative flex-1">
              <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Buscar por placa, unidad o estación…"
                className="h-9 w-full rounded-xl border border-gray-200 bg-transparent pl-9 pr-4 text-sm text-gray-700 placeholder:text-gray-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-white/[0.08] dark:text-gray-300 dark:placeholder:text-gray-500"
              />
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Calendar size={13} className="shrink-0 text-gray-400" />
              <DatePicker value={dateFrom} onChange={handleDateFrom} placeholder="Desde" maxDate={dateTo || undefined} />
              <span className="text-xs text-gray-400">—</span>
              <DatePicker value={dateTo}   onChange={handleDateTo}   placeholder="Hasta" minDate={dateFrom || undefined} />
              {hasDateFilter && (
                <button
                  type="button"
                  onClick={() => { setDateFrom(""); setDateTo(""); setPage(1); }}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-600 dark:border-white/[0.08] dark:hover:bg-white/[0.04]"
                  title="Limpiar filtro de fechas"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="shrink-0">
              <button
                type="button"
                onClick={() => setExportOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3.5 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.04]"
              >
                <Download size={14} />
                Exportar
              </button>
            </div>
          </div>

          {hasDateFilter && (
            <div className="mt-2 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-500/[0.10] dark:text-brand-300">
                <Calendar size={10} />
                {dateFrom ? fmtDate(dateFrom) : "inicio"} — {dateTo ? fmtDate(dateTo) : "hoy"}
                <span className="ml-1 font-bold text-brand-500">· {tableRows.length} resultado{tableRows.length !== 1 ? "s" : ""}</span>
              </span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-20 text-gray-400">
            <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            <span className="text-sm">Cargando datos…</span>
          </div>
        ) : tableRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16">
            <Fuel size={20} className="text-gray-300 dark:text-gray-600" />
            <p className="text-sm font-medium text-gray-400 dark:text-gray-500">Sin registros</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">No hay cargas para el filtro actual.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-white/[0.06]">
                    {["Vehículo","Fecha","Galones","Costo","Estación","Odómetro", ...(canEdit || canDelete ? [""] : [])].map((h, i, arr) => {
                      const isLast = i === arr.length - 1 && (canEdit || canDelete);
                      return (
                        <th
                          key={i}
                          className={
                            isLast
                              ? ""
                              : "px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 sm:px-5"
                          }
                        >
                          {h}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
                  {paginatedRows.map((r) => (
                    <TableRow
                      key={r.id}
                      {...r}
                      canEdit={canEdit}
                      canDelete={canDelete}
                      onClick={() => setDetail(r.entry)}
                      onEdit={() => openEdit(r.entry)}
                      onDelete={() => setDeleteTarget(r.entry)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={tableRows.length} pageSize={PAGE_SIZE} onChange={setPage} />
          </>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      <FuelFormModal
        open={formOpen}
        entry={editEntry}
        assets={assets}
        assetsLoading={fuelLoading}
        companyId={Number(session?.companyId ?? 0)}
        onClose={() => { setFormOpen(false); setEditEntry(null); }}
        onSave={handleSave}
      />

      {deleteTarget && (
        <DeleteConfirm
          entry={deleteTarget}
          assets={assets}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <AnimatePresence>
        {exportOpen && (
          <ExportModal
            allRows={allExportRows}
            currentRows={currentExportRows}
            title="Historial de combustible"
            subtitle="Motors Aplismart — Reporte de combustible"
            filename="combustible"
            columns={EXPORT_COLS}
            onClose={() => setExportOpen(false)}
          />
        )}
      </AnimatePresence>

      <FuelDetailDrawer entry={detail} onClose={() => setDetail(null)} />
    </div>
  );
}