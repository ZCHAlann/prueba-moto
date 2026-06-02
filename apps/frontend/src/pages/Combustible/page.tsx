"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Fuel, Plus, X, Droplets, DollarSign, Gauge,
  MapPin, TrendingUp, TrendingDown, ChevronRight,
  Flame, BarChart3, Table2, LineChart, ChevronLeft,
  BarChart,
} from "lucide-react";
import { useAssets } from "../../hooks/useAssets";
import { useFuel, type CreateFuelPayload } from "../../hooks/useFuel";
import { ExportToolbar, type ExportColumn, type ExportRow } from "../../components/ui/export-toolbar/ExportToolbar";
import { DatePicker } from "../../components/ui/date-picker/DatePicker";
import { LineChartExp } from "../../components/ui/charts/LineChart";
import { RadarChart } from "../../components/ui/charts/RadarChart";
import { BarChartExp }   from "../../components/ui/charts/BarChart";

// ─── Export columns ────────────────────────────────────────────────────────────

const EXPORT_COLS: ExportColumn[] = [
  { key: "plate",    label: "Placa"    },
  { key: "unit",     label: "Unidad"   },
  { key: "date",     label: "Fecha"    },
  { key: "liters",   label: "Litros"   },
  { key: "cost",     label: "Costo"    },
  { key: "station",  label: "Estación" },
  { key: "odometer", label: "Odómetro" },
];

const PAGE_SIZE = 10;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("es-EC", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtDate(ymd: string) {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  const months = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return `${d} ${months[Number(m) - 1]} ${y}`;
}

// ─── Mini spark bar ────────────────────────────────────────────────────────────

function SparkBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.06]">
      <div className="h-full rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${pct}%` }} />
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

// ─── Vehicle performance card ──────────────────────────────────────────────────

function VehicleCard({ plate, unit, liters, cost, maxLiters }: {
  plate: string; unit: string; liters: number; cost: number; maxLiters: number;
}) {
  const pct = maxLiters > 0 ? Math.round((liters / maxLiters) * 100) : 0;
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 transition-all hover:border-brand-300 hover:shadow-sm dark:border-white/[0.06] dark:bg-white/[0.03] dark:hover:border-brand-500/30">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-500/[0.10]">
            <Fuel size={14} className="text-brand-600 dark:text-brand-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-800 dark:text-white">{plate}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">{unit}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-black tabular-nums text-gray-800 dark:text-white">{fmt(liters, 0)} L</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500">{fmt(cost)} USD</p>
        </div>
      </div>
      <div className="mt-3 space-y-1">
        <SparkBar value={liters} max={maxLiters} />
        <div className="flex justify-between">
          <span className="text-[10px] text-gray-400 dark:text-gray-500">Participación</span>
          <span className="text-[10px] font-bold text-brand-600 dark:text-brand-400">{pct}%</span>
        </div>
      </div>
    </div>
  );
}

// ─── Table row ─────────────────────────────────────────────────────────────────

function TableRow({ plate, unit, date, liters, cost, station, odometer }: {
  plate: string; unit: string; date: string; liters: string;
  cost: string; station: string; odometer: number;
}) {
  return (
    <tr className="group transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.02]">
      <td className="px-5 py-3.5">
        <p className="font-semibold text-gray-800 dark:text-white">{plate}</p>
        <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{unit}</p>
      </td>
      <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300">{fmtDate(date)}</td>
      <td className="px-5 py-3.5">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-warning-50 px-2.5 py-1 text-xs font-bold text-warning-700 dark:bg-warning-500/[0.12] dark:text-warning-400">
          <Droplets size={11} />
          {liters}
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

// ─── Form field helpers ────────────────────────────────────────────────────────

const inputCls =
  "h-10 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm text-gray-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-200 dark:placeholder:text-gray-500";

const labelCls =
  "mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500";

// ─── Main page ─────────────────────────────────────────────────────────────────

type ViewTab = "tabla" | "graficas";

export function FuelPage() {
  const { assets, loading: assetsLoading } = useAssets();
  const { fuelEntries, loading: fuelLoading, createFuelEntry } = useFuel();

  const loading = assetsLoading || fuelLoading;

  const [search,     setSearch]     = useState("");
  const [modalOpen,  setModalOpen]  = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [viewTab,    setViewTab]    = useState<ViewTab>("graficas");
  const [page,       setPage]       = useState(1);

  const [form, setForm] = useState<CreateFuelPayload>({
    assetId:  "",
    date:     new Date().toISOString().slice(0, 10),
    liters:   0,
    cost:     0,
    odometer: 0,
    station:  "",
    notes:    "",
  });

  function openModal() {
    setForm((f) => ({ ...f, assetId: assets[0]?.id ?? "" }));
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createFuelEntry(form);
      setModalOpen(false);
      setForm((f) => ({ ...f, liters: 0, cost: 0, odometer: 0, station: "", notes: "" }));
    } finally {
      setSubmitting(false);
    }
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  const totalLiters = fuelEntries.reduce((s, e) => s + e.liters, 0);
  const totalCost   = fuelEntries.reduce((s, e) => s + e.cost,   0);
  const avgCostPerL = totalLiters > 0 ? totalCost / totalLiters : 0;

  // ── Performance por vehículo ───────────────────────────────────────────────

  const performance = useMemo(() => {
    const map = new Map<string, { liters: number; cost: number }>();
    fuelEntries.forEach((e) => {
      const cur = map.get(e.assetId) ?? { liters: 0, cost: 0 };
      map.set(e.assetId, { liters: cur.liters + e.liters, cost: cur.cost + e.cost });
    });
    return assets
      .map((a) => {
        const d = map.get(a.id) ?? { liters: 0, cost: 0 };
        return { id: a.id, plate: a.plate, unit: `${a.brand} ${a.model}`, ...d };
      })
      .filter((x) => x.liters > 0)
      .sort((a, b) => b.liters - a.liters)
      .slice(0, 6);
  }, [assets, fuelEntries]);

  const maxLiters = performance[0]?.liters ?? 0;

  // ── Table rows ─────────────────────────────────────────────────────────────

  const tableRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return fuelEntries
      .map((e) => {
        const asset = assets.find((a) => a.id === e.assetId);
        return {
          id:       e.id,
          plate:    asset?.plate?.trim() || "—",
          unit:     asset ? `${asset.brand} ${asset.model}`.trim() || "—" : "—",
          date:     e.date,
          liters:   `${fmt(e.liters, 0)} L`,
          cost:     `${fmt(e.cost)} USD`,
          station:  e.station,
          odometer: e.odometer,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter((r) =>
        !q ||
        r.plate.toLowerCase().includes(q) ||
        r.unit.toLowerCase().includes(q) ||
        r.station.toLowerCase().includes(q)
      );
  }, [fuelEntries, assets, search]);

  // Reset page when search changes
  const handleSearch = (v: string) => { setSearch(v); setPage(1); };

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return tableRows.slice(start, start + PAGE_SIZE);
  }, [tableRows, page]);

  const exportRows: ExportRow[] = tableRows.map((r) => ({ ...r }));

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

        <button
          type="button"
          onClick={openModal}
          className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-500/20 transition hover:bg-brand-600 active:scale-95"
        >
          <Plus size={15} />
          Nuevo registro
        </button>
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard icon={<BarChart3 size={16} />} label="Registros"   value={fuelEntries.length.toString()} sub="Cargas totales"      accent="bg-brand-500"   />
        <KpiCard icon={<Droplets  size={16} />} label="Litros"      value={`${fmt(totalLiters, 0)} L`}    sub="Consumo acumulado"   accent="bg-warning-500" />
        <KpiCard icon={<DollarSign size={16}/>} label="Costo total" value={`${fmt(totalCost)} USD`}       sub={`Promedio ${fmt(avgCostPerL)} USD/L`} accent="bg-success-500" />
      </div>

      {/* ── Performance por vehículo ────────────────────────────────────────── */}
      {performance.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/[0.06]">
            <div>
              <h2 className="text-sm font-semibold text-gray-800 dark:text-white">Consumo por unidad</h2>
              <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">Top {performance.length} vehículos por volumen cargado</p>
            </div>
            <TrendingUp size={15} className="text-brand-400" />
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {performance.map((v) => (
              <VehicleCard key={v.id} {...v} maxLiters={maxLiters} />
            ))}
          </div>
        </div>
      )}

      {/* ── Historial / Gráficas ───────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]">

        {/* Card header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/[0.06]">
          <div>
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white">
              {viewTab === "tabla" ? "Historial de cargas" : "Análisis gráfico"}
            </h2>
            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
              {viewTab === "tabla"
                ? "Todos los abastecimientos registrados, ordenados por fecha."
                : "Visualización del consumo por vehículo y período."}
            </p>
          </div>

          {/* Tab switcher */}
          <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-white/[0.08] dark:bg-white/[0.04]">
            <button
              type="button"
              onClick={() => setViewTab("tabla")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all
                ${viewTab === "tabla"
                  ? "bg-white text-gray-800 shadow-sm dark:bg-white/[0.08] dark:text-white"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
            >
              <Table2 size={12} />
              Tabla
            </button>
            <button
              type="button"
              onClick={() => setViewTab("graficas")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all
                ${viewTab === "graficas"
                  ? "bg-white text-gray-800 shadow-sm dark:bg-white/[0.08] dark:text-white"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
            >
              <LineChart size={12} />
              Gráficas
            </button>
          </div>
        </div>

        {/* ── VISTA: TABLA ─────────────────────────────────────────────────── */}
        {viewTab === "tabla" && (
          <>
            {/* Toolbar */}
            <div className="border-b border-gray-100 px-5 py-3 dark:border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder="Buscar por placa, unidad o estación…"
                    className="h-9 w-full rounded-xl border border-gray-200 bg-transparent pl-9 pr-4 text-sm text-gray-700 placeholder:text-gray-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-white/[0.08] dark:text-gray-300 dark:placeholder:text-gray-500"
                  />
                </div>
                <ExportToolbar
                  title="Historial de combustible"
                  columns={EXPORT_COLS}
                  rows={exportRows}
                  subtitle="Motors Aplismart — Reporte de combustible"
                  filename="combustible"
                />
              </div>
            </div>

            {/* Table */}
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
                  <table className="w-full min-w-[860px] text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-white/[0.06]">
                        {["Vehículo","Fecha","Litros","Costo","Estación","Odómetro"].map((h) => (
                          <th key={h} className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
                      {paginatedRows.map((r) => (
                        <TableRow key={r.id} {...r} />
                      ))}
                    </tbody>
                  </table>
                </div>

                <Pagination
                  page={page}
                  total={tableRows.length}
                  pageSize={PAGE_SIZE}
                  onChange={setPage}
                />
              </>
            )}
          </>
        )}

        {/* ── VISTA: GRÁFICAS ──────────────────────────────────────────────── */}
        {viewTab === "graficas" && (
          <div className="space-y-6 p-5">
            {loading ? (
              <div className="flex items-center justify-center gap-3 py-20 text-gray-400">
                <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                <span className="text-sm">Cargando datos…</span>
              </div>
            ) : (
              <>
                {/* Línea */}
                <div className="rounded-2xl border border-gray-100 p-5 dark:border-white/[0.06]">
                  <h3 className="mb-1 text-sm font-semibold text-gray-800 dark:text-white">Consumo mensual</h3>
                  <p className="mb-4 text-xs text-gray-400 dark:text-gray-500">Litros acumulados por mes · zoom con rueda del mouse</p>
                  <LineChartExp fuelEntries={fuelEntries} assets={assets} mode="liters" />
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                  {/* Barras */}
                  <div className="rounded-2xl border border-gray-100 p-5 dark:border-white/[0.06]">
                    <h3 className="mb-1 text-sm font-semibold text-gray-800 dark:text-white">Comparativa por vehículo</h3>
                    <p className="mb-4 text-xs text-gray-400 dark:text-gray-500">Litros · Costo · Cargas por unidad</p>
                    <BarChartExp fuelEntries={fuelEntries} assets={assets} />
                  </div>

                  {/* Radar */}
                  <div className="rounded-2xl border border-gray-100 p-5 dark:border-white/[0.06]">
                    <h3 className="mb-1 text-sm font-semibold text-gray-800 dark:text-white">Radar de salud por vehículo</h3>
                    <p className="mb-4 text-xs text-gray-400 dark:text-gray-500">Comparativa multidimensional normalizada</p>
                    <RadarChart fuelEntries={fuelEntries} assets={assets} />
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Modal nuevo registro ───────────────────────────────────────────── */}
      <AnimatePresence>
        {modalOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-gray-950/50 backdrop-blur-sm"
              onClick={() => setModalOpen(false)}
            />

            <motion.div
              key="modal"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-gray-900"
            >
              {/* Modal header */}
              <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5 dark:border-white/[0.06]">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-warning-50 dark:bg-warning-500/[0.12]">
                      <Fuel size={15} className="text-warning-600 dark:text-warning-400" />
                    </div>
                    <h2 className="text-lg font-bold text-gray-800 dark:text-white">Nuevo registro de combustible</h2>
                  </div>
                  <p className="mt-1 ml-10 text-xs text-gray-400 dark:text-gray-500">
                    Registra la carga con litros, costo y lectura de odómetro.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 text-gray-400 transition hover:bg-gray-50 dark:border-white/[0.08] dark:hover:bg-white/[0.05]"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Modal form */}
              <form onSubmit={handleSubmit}>
                <div className="grid gap-4 p-6 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Vehículo</label>
                    <select value={form.assetId} onChange={(e) => setForm((f) => ({ ...f, assetId: e.target.value }))} className={inputCls} required>
                      {assets.map((a) => (
                        <option key={a.id} value={a.id}>{a.plate} — {a.brand} {a.model}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <DatePicker label="Fecha de carga" value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} />
                  </div>

                  <div>
                    <label className={labelCls}>Estación de servicio</label>
                    <input type="text" value={form.station} onChange={(e) => setForm((f) => ({ ...f, station: e.target.value }))} placeholder="Ej. Petroecuador El Recreo" className={inputCls} required />
                  </div>

                  <div>
                    <label className={labelCls}>Litros cargados</label>
                    <div className="relative">
                      <Droplets size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="number" min={0} step={0.01} value={form.liters || ""} onChange={(e) => setForm((f) => ({ ...f, liters: Number(e.target.value) }))} placeholder="0.00" className={`${inputCls} pl-9`} required />
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Costo total (USD)</label>
                    <div className="relative">
                      <DollarSign size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="number" min={0} step={0.01} value={form.cost || ""} onChange={(e) => setForm((f) => ({ ...f, cost: Number(e.target.value) }))} placeholder="0.00" className={`${inputCls} pl-9`} required />
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <label className={labelCls}>Lectura de odómetro / horómetro (km)</label>
                    <div className="relative">
                      <Gauge size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="number" min={0} value={form.odometer || ""} onChange={(e) => setForm((f) => ({ ...f, odometer: Number(e.target.value) }))} placeholder="0" className={`${inputCls} pl-9`} required />
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <label className={labelCls}>Notas (opcional)</label>
                    <textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Observaciones adicionales…" className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-200 dark:placeholder:text-gray-500" />
                  </div>
                </div>

                {form.liters > 0 && form.cost > 0 && (
                  <div className="mx-6 mb-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 dark:border-brand-500/20 dark:bg-brand-500/[0.07]">
                    <div className="flex items-center gap-2 text-xs font-semibold text-brand-700 dark:text-brand-300">
                      <ChevronRight size={12} />
                      Precio por litro: <span className="font-black">{fmt(form.cost / form.liters)} USD/L</span>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4 dark:border-white/[0.06]">
                  <button type="button" onClick={() => setModalOpen(false)} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.04]">
                    Cancelar
                  </button>
                  <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-500/20 transition hover:bg-brand-600 active:scale-95 disabled:opacity-60">
                    {submitting && <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>}
                    Guardar consumo
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}