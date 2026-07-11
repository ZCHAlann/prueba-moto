// pages/finanzas/EstadisticasPage.tsx
//
// jul 2026 v4-b — Submódulo "Estadísticas" del módulo Finanzas.
// Réplica del flujo de "pagos-estadisticas" del demo Mikrowisp:
//   • Filtros: vehículo + categoría (combustible | peaje | mantenimiento | manual) + año.
//   • Gráfico de barras con 12 columnas (meses del año) — recharts.
//   • Tabla con drill-down: mes → semana → día (click expande con framer-motion).
//   • Buscador por texto (origen / placa / proveedor) sobre la lista.
//   • Diseño profesional con shadcn-style cards + framer-motion animations.

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  ChevronRight, ChevronDown, Search, RefreshCw,
  Truck, Calendar, Tag, BarChart3, Loader2,
  ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import {
  useFinanceStats,
  useFinanceDrill,
  type FinanceStatsCategory,
  type FinanceMonthlyPoint,
} from "../../hooks/useFinanceInvoices";

const MONTH_LABELS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

const CATEGORY_LABELS: Record<FinanceStatsCategory | string, string> = {
  all:            "Todas las categorías",
  combustible:     "Combustible",
  peaje:          "Peajes",
  mantenimiento:  "Mantenimiento",
  manual:         "Caja Chica / Otros",
};

const CATEGORY_COLORS: Record<string, string> = {
  combustible:    "#f59e0b", // amber
  peaje:         "#6366f1", // indigo
  mantenimiento: "#10b981", // emerald
  manual:        "#94a3b8", // slate
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtMoney(v: number, currency = "USD"): string {
  return new Intl.NumberFormat("es-EC", {
    style: "currency", currency, minimumFractionDigits: 2,
  }).format(v);
}

function fmtDateShort(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const s = typeof d === "string" ? d : d.toISOString();
  return s.slice(0, 10);
}

function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=dom, 1=lun
  const diff = (day === 0 ? -6 : 1 - day); // semana empieza lunes
  const out = new Date(d);
  out.setDate(d.getDate() + diff);
  out.setHours(0, 0, 0, 0);
  return out;
}

function groupByWeek(invoices: InvoiceRowLike[]): WeekGroup[] {
  const map = new Map<string, WeekGroup>();
  for (const inv of invoices) {
    const d = new Date(inv.invoiceDate);
    if (Number.isNaN(d.getTime())) continue;
    const ws = startOfWeek(d);
    const we = new Date(ws);
    we.setDate(ws.getDate() + 6);
    const key = ws.toISOString().slice(0, 10);
    const slot = map.get(key) ?? {
      key,
      weekStart: ws.toISOString().slice(0, 10),
      weekEnd: we.toISOString().slice(0, 10),
      total: 0,
      count: 0,
      invoices: [],
    };
    slot.total += inv.total;
    slot.count += 1;
    slot.invoices.push(inv);
    map.set(key, slot);
  }
  return Array.from(map.values()).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

function groupByDay(invoices: InvoiceRowLike[]): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const inv of invoices) {
    const key = (typeof inv.invoiceDate === "string"
      ? inv.invoiceDate.slice(0, 10)
      : new Date(inv.invoiceDate).toISOString().slice(0, 10));
    const slot = map.get(key) ?? { key, total: 0, count: 0, invoices: [] };
    slot.total += inv.total;
    slot.count += 1;
    slot.invoices.push(inv);
    map.set(key, slot);
  }
  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}

interface InvoiceRowLike {
  id: string;
  invoiceNumber: string;
  invoiceDate: string | Date;
  total: number;
  subtotal?: number;
  ivaAmount?: number;
  sourceModule: string;
  sourceRef?: { assetPlate?: string; maintenanceTitle?: string; tollName?: string; fuelStation?: string } | null;
  supplierName?: string | null;
  workshopName?: string | null;
  workerName?: string | null;
}

interface WeekGroup {
  key: string;
  weekStart: string;
  weekEnd: string;
  total: number;
  count: number;
  invoices: InvoiceRowLike[];
}

interface DayGroup {
  key: string;
  total: number;
  count: number;
  invoices: InvoiceRowLike[];
}

// ─── Pág ────────────────────────────────────────────────────────────────

export function EstadisticasPage() {
  const { companyId, session } = useAuth();
  const canView = session?.companyModules?.includes("finanzas") ?? true;

  // ── Filtros ──
  const currentYear = new Date().getFullYear();
  const [year, setYear]               = useState<number>(currentYear);
  const [category, setCategory]       = useState<FinanceStatsCategory>("all");
  const [assetId, setAssetId]         = useState<string>("all");
  const [searchText, setSearchText]   = useState<string>("");
  const [expandedMonth, setExpandedMonth] = useState<number | null>(null);
  const [expandedWeek, setExpandedWeek]   = useState<string | null>(null);

  // ── Hooks ──
  const stats = useFinanceStats({ year, assetId, category });
  // jul 2026 v4-b — El drill del mes se obtiene del endpoint /drill
  // usando el hook canónico (paginación estándar `page`/`pageSize`).
  // enabled=true sólo cuando hay un mes expandido; al colapsar, lo
  // desactivamos para que el hook no siga gastando requests.
  const drill = useFinanceDrill({
    year, assetId, category,
    month: expandedMonth ?? undefined,
    enabled: expandedMonth != null,
    page: 1, pageSize: 100,
  });

  // ── Vehículos para el dropdown ──
  // jul 2026 v4-b: SIN hooks cruzados. La lista de vehículos viene
  // directo del endpoint /stats (campo `vehicles`). NO dependemos
  // del módulo `gestion` (ni de su permiso) para filtrar.
  const vehicles: Array<{ id: string; plate: string }> = useMemo(
    () => stats.data?.vehicles ?? [],
    [stats.data],
  );
  const vehiclesLoading = stats.loading && !stats.data;

  // ── Filtro de búsqueda sobre drill.rows (paginadas) ──
  const filteredDrill = useMemo(() => {
    if (!searchText.trim()) return drill.rows;
    const q = searchText.toLowerCase();
    return drill.rows.filter((r) => {
      const plate  = r.sourceRef?.assetPlate ?? "";
      const title  = r.sourceRef?.maintenanceTitle ?? "";
      const toll   = r.sourceRef?.tollName ?? "";
      const fuel   = r.sourceRef?.fuelStation ?? "";
      const sup    = r.supplierName ?? "";
      const work   = r.workshopName ?? "";
      const workr  = r.workerName ?? "";
      return [r.invoiceNumber, plate, title, toll, fuel, sup, work, workr]
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [drill.rows, searchText]);

  // ── Agrupación mes→semana→día ──
  const monthInvoices = useMemo(() => {
    if (expandedMonth == null) return [];
    return filteredDrill.filter((r) => {
      const d = new Date(r.invoiceDate);
      return d.getMonth() + 1 === expandedMonth;
    });
  }, [filteredDrill, expandedMonth]);

  const weekGroups = useMemo(() => groupByWeek(monthInvoices), [monthInvoices]);
  const dayGroups  = useMemo(() => groupByDay(monthInvoices), [monthInvoices]);

  // ── Chart data ──
  const chartData = useMemo(() => {
    const m = stats.data?.monthly ?? [];
    return m.map((p) => ({
      monthLabel: MONTH_LABELS[p.month - 1] ?? "",
      month: p.month,
      total: +p.total.toFixed(2),
      count: p.count,
    }));
  }, [stats.data]);

  // jul 2026 v4-c — Datos del mes en curso y mes anterior para el hero KPI.
  // Si el `year` actual coincide con el año del sistema, usamos el mes real;
  // si no (año histórico), el "mes en curso" es diciembre del año y el
  // "anterior" noviembre.
  const currentMonthData = useMemo(() => {
    const m = stats.data?.monthly ?? [];
    const isCurrentYear = year === new Date().getFullYear();
    const month = isCurrentYear ? new Date().getMonth() + 1 : 12;
    return m.find((x) => x.month === month) ?? {
      year, month, subtotal: 0, ivaAmount: 0, total: 0, count: 0,
      byCategory: { combustible: 0, peaje: 0, mantenimiento: 0 },
    };
  }, [stats.data, year]);

  const previousMonthData = useMemo(() => {
    const m = stats.data?.monthly ?? [];
    const isCurrentYear = year === new Date().getFullYear();
    const currentM = isCurrentYear ? new Date().getMonth() + 1 : 12;
    const prevM = currentM === 1 ? 12 : currentM - 1;
    return m.find((x) => x.month === prevM) ?? {
      year: currentM === 1 ? year - 1 : year, month: prevM,
      subtotal: 0, ivaAmount: 0, total: 0, count: 0,
      byCategory: { combustible: 0, peaje: 0, mantenimiento: 0 },
    };
  }, [stats.data, year]);

  // ── Render ──────────────────────────────────────────────────────────

  if (!canView) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <h2 className="text-base font-semibold text-amber-900 dark:text-amber-200">Acceso restringido</h2>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
            No tenés permiso para ver Estadísticas de Finanzas. Pedile al administrador que active el módulo.
          </p>
        </div>
      </div>
    );
  }

  // jul 2026 v4-b fix — antes, si el endpoint /stats devolvía 403/500 (por
  // permisos, timeout, etc), `stats.data` quedaba null y la UI mostraba
  // todo en $0.00 sin mensaje. Ahora mostramos un banner visible con el
  // error real para que el user sepa por qué la página está vacía.
  if (stats.error) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 text-white shadow-sm dark:bg-slate-200 dark:text-slate-900">
            <BarChart3 size={18} />
          </span>
          <div>
            <h1 className="text-lg font-bold text-gray-800 dark:text-white">Estadísticas</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Resumen de gastos por vehículo, categoría y mes.
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-500/10">
          <h2 className="text-base font-semibold text-red-900 dark:text-red-200">No se pudieron cargar las estadísticas</h2>
          <p className="mt-1 text-sm text-red-800 dark:text-red-300">
            {stats.error}
          </p>
          <p className="mt-2 text-xs text-red-700 dark:text-red-300">
            Si el mensaje menciona permisos, pedile al admin que active el submódulo <strong>Finanzas &gt; Estadísticas</strong> en tu rol.
          </p>
          <button
            type="button"
            onClick={() => { stats.refresh(); }}
            className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200"
          >
            <RefreshCw size={12} /> Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 text-white shadow-sm dark:bg-slate-200 dark:text-slate-900">
            <BarChart3 size={18} />
          </span>
          <div>
            <h1 className="text-lg font-bold text-gray-800 dark:text-white">Estadísticas</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Resumen de gastos por vehículo, categoría y mes.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { stats.refresh(); }}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-300"
        >
          <RefreshCw size={13} /> Refrescar
        </button>
      </div>

      {/* Filtros */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Vehículo */}
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              <Truck size={10} className="inline mr-1" />Vehículo
            </label>
            <select
              value={assetId}
              onChange={(e) => { setAssetId(e.target.value); setExpandedMonth(null); }}
              disabled={vehiclesLoading}
              className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-200"
            >
              <option value="all">{vehiclesLoading ? "Cargando…" : "Todos los vehículos"}</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.plate}</option>
              ))}
            </select>
          </div>

          {/* Categoría */}
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              <Tag size={10} className="inline mr-1" />Categoría
            </label>
            <select
              value={category}
              onChange={(e) => { setCategory(e.target.value as FinanceStatsCategory); setExpandedMonth(null); }}
              className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-200"
            >
              {(["all", "combustible", "peaje", "mantenimiento", "manual"] as const).map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>

          {/* Año */}
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              <Calendar size={10} className="inline mr-1" />Año
            </label>
            <select
              value={year}
              onChange={(e) => { setYear(Number(e.target.value)); setExpandedMonth(null); }}
              className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-200"
            >
              {Array.from({ length: 6 }, (_, i) => currentYear - i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Buscador */}
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              <Search size={10} className="inline mr-1" />Buscar
            </label>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Placa, factura, proveedor, taller..."
              className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-200 placeholder:text-gray-400"
            />
          </div>
        </div>
      </div>

      {/* KPIs — jul 2026 v4-c — rediseño "finance-grade".
          Hero: mes actual + delta % vs mes anterior + sparkline 12 meses.
          3 cards secundarias: combustible / peajes / mantenimiento del mes
          actual, con mini-barras comparando vs promedio del año. */}

      {/* Hero KPI */}
      <HeroKpiCard
        currentMonth={currentMonthData.total}
        previousMonth={previousMonthData.total}
        currentMonthCount={currentMonthData.count}
        previousMonthCount={previousMonthData.count}
        currentMonthByCat={currentMonthData.byCategory}
        yearTotal={stats.data?.totals.total ?? 0}
        yearCount={stats.data?.totals.count ?? 0}
        year={year}
        monthly={stats.data?.monthly ?? []}
        onResetFilter={() => setCategory("all")}
        active={category === "all"}
      />

      {/* 3 cards secundarias: combustible / peajes / mantenimiento (del año completo, click filtra) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SecondaryKpiCard
          label="Combustible"
          value={stats.data?.byCategory.combustible ?? 0}
          monthly={stats.data?.monthly ?? []}
          pickMonthly={(m) => m.byCategory.combustible}
          active={category === "combustible"}
          onClick={() => setCategory(category === "combustible" ? "all" : "combustible")}
        />
        <SecondaryKpiCard
          label="Peajes"
          value={stats.data?.byCategory.peaje ?? 0}
          monthly={stats.data?.monthly ?? []}
          pickMonthly={(m) => m.byCategory.peaje}
          active={category === "peaje"}
          onClick={() => setCategory(category === "peaje" ? "all" : "peaje")}
        />
        <SecondaryKpiCard
          label="Mantenimiento"
          value={stats.data?.byCategory.mantenimiento ?? 0}
          monthly={stats.data?.monthly ?? []}
          pickMonthly={(m) => m.byCategory.mantenimiento}
          active={category === "mantenimiento"}
          onClick={() => setCategory(category === "mantenimiento" ? "all" : "mantenimiento")}
        />
      </div>

      {/* Gráfico de barras */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200">
            Gasto mensual — {year}
          </h2>
          {stats.loading && <Loader2 size={14} className="animate-spin text-gray-400" />}
        </div>
        <div className="h-64 w-full">
          {chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-gray-400">
              Sin datos para los filtros seleccionados.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                <XAxis dataKey="monthLabel" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `$${v.toFixed(0)}`} />
                <Tooltip
                  cursor={{ fill: "rgba(99,102,241,0.08)" }}
                  contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                  formatter={(v: number) => fmtMoney(v)}
                />
                <Bar
                  dataKey="total"
                  radius={[4, 4, 0, 0]}
                  fill="#475569"
                  onClick={(d: { month?: number }) => {
                    if (d?.month) {
                      setExpandedMonth((curr) => curr === d.month ? null : d.month);
                    }
                  }}
                  style={{ cursor: "pointer" }}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <p className="mt-2 text-[10px] text-gray-400">
          Click en una barra para expandir el detalle del mes.
        </p>
      </div>

      {/* Tabla con drill-down: mes → semana → día */}
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 px-4 py-3 dark:border-white/[0.06]">
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200">
            Detalle por mes
            {expandedMonth != null && (
              <span className="ml-2 text-xs font-normal text-indigo-600 dark:text-indigo-300">
                · expandiendo {MONTH_LABELS[expandedMonth - 1]} {year}
              </span>
            )}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-white/[0.02]">
              <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <th className="w-8 px-3 py-2.5"></th>
                <th className="px-3 py-2.5">Mes</th>
                <th className="px-3 py-2.5 text-right">Operaciones</th>
                <th className="px-3 py-2.5 text-right">Subtotal</th>
                <th className="px-3 py-2.5 text-right">IVA</th>
                <th className="px-3 py-2.5 text-right">Total</th>
                <th className="px-3 py-2.5 text-right">Combustible</th>
                <th className="px-3 py-2.5 text-right">Peajes</th>
                <th className="px-3 py-2.5 text-right">Mant.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-mono tabular-nums dark:divide-white/[0.05]">
              {(stats.data?.monthly ?? []).map((m, idx) => {
                const isExpanded = expandedMonth === m.month;
                return (
                  <MonthRow
                    key={`${m.year}-${m.month}`}
                    month={m}
                    isExpanded={isExpanded}
                    onToggle={() => setExpandedMonth(isExpanded ? null : m.month)}
                    rowIndex={idx}
                  >
                    {isExpanded && (
                      <div className="px-4 py-3 border-t border-slate-200/60 dark:border-slate-500/30">
                        <div className="mb-2 flex items-center justify-between">
                          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
                            {MONTH_LABELS[expandedMonth - 1]} {year} — Detalle por semana
                          </h3>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            {drill.loading ? "Cargando…" : `${filteredDrill.length} factura(s)`}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {weekGroups.map((w) => (
                            <WeekGroup
                              key={w.key}
                              week={w}
                              isExpanded={expandedWeek === w.key}
                              onToggle={() => setExpandedWeek((curr) => curr === w.key ? null : w.key)}
                              dayGroups={dayGroups.filter((d) => {
                                // días dentro de esta semana
                                return d.key >= w.weekStart && d.key <= w.weekEnd;
                              })}
                              searchText={searchText}
                            />
                          ))}
                          {weekGroups.length === 0 && !drill.loading && (
                            <p className="text-xs text-gray-500 italic">Sin facturas en este mes con los filtros activos.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </MonthRow>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-50 font-mono tabular-nums dark:bg-white/[0.02]">
              <tr className="text-[11px] font-semibold">
                <td className="px-3 py-2.5 font-sans" colSpan={2}>Total {year}</td>
                <td className="px-3 py-2.5 text-right">{stats.data?.totals.count ?? 0}</td>
                <td className="px-3 py-2.5 text-right">{fmtMoney(stats.data?.totals.subtotal ?? 0)}</td>
                <td className="px-3 py-2.5 text-right">{fmtMoney(stats.data?.totals.ivaAmount ?? 0)}</td>
                <td className="px-3 py-2.5 text-right text-slate-700 dark:text-slate-200">{fmtMoney(stats.data?.totals.total ?? 0)}</td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* jul 2026 v4-b — Quitamos el "Top vehículos por gasto". El usuario
          prefiere menos widgets, más sobrios. El dropdown de vehículo
          + la tabla de meses siguen disponibles para drill-down. */}
    </div>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────

// jul 2026 v4-c — Hero KPI: mes actual grande, con delta % vs mes
// anterior + sparkline de 12 meses al lado. Diseño "finance-grade":
// paleta slate, tipografía mono para números, sin gradientes brillantes.
function HeroKpiCard(props: {
  currentMonth: number;
  previousMonth: number;
  currentMonthCount: number;
  previousMonthCount: number;
  currentMonthByCat: { combustible: number; peaje: number; mantenimiento: number };
  yearTotal: number;
  yearCount: number;
  year: number;
  monthly: FinanceMonthlyPoint[];
  onResetFilter: () => void;
  active: boolean;
}) {
  const delta = props.currentMonth - props.previousMonth;
  const deltaPct = props.previousMonth > 0
    ? (delta / props.previousMonth) * 100
    : (props.currentMonth > 0 ? 100 : 0);
  const trendUp = delta >= 0;

  // Sparkline data: 12 puntos normalizados.
  const sparkData = props.monthly.map((m) => m.total);
  const sparkMax = Math.max(1, ...sparkData);
  const currentMonthIdx = new Date().getMonth(); // 0-11

  return (
    <div
      className={`relative overflow-hidden rounded-lg border bg-white p-5 transition dark:bg-white/[0.03] ${
        props.active
          ? "border-slate-400 ring-2 ring-slate-300/40 dark:border-slate-500 dark:ring-slate-500/30"
          : "border-gray-200 dark:border-white/[0.08]"
      }`}
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_240px]">
        {/* Columna izquierda: mes actual + delta */}
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
              Inversión · mes en curso
            </p>
            {props.active && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-700 dark:bg-slate-700/40 dark:text-slate-200">
                Vista general
              </span>
            )}
          </div>
          <p className="mt-3 font-mono text-4xl font-bold tabular-nums text-gray-900 dark:text-white">
            {fmtMoney(props.currentMonth)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1 font-medium">
              {trendUp ? (
                <ArrowUpRight size={14} className="text-emerald-600 dark:text-emerald-400" />
              ) : (
                <ArrowDownRight size={14} className="text-rose-600 dark:text-rose-400" />
              )}
              <span className={`tabular-nums ${trendUp ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
                {delta >= 0 ? "+" : ""}{fmtMoney(Math.abs(delta))}
              </span>
              <span className="text-gray-500 dark:text-gray-400">
                ({deltaPct >= 0 ? "+" : ""}{deltaPct.toFixed(1)}%) vs mes anterior
              </span>
            </span>
            <span className="text-gray-400 dark:text-gray-500">·</span>
            <span className="text-gray-500 dark:text-gray-400 tabular-nums">
              {props.currentMonthCount} comprobante{props.currentMonthCount === 1 ? "" : "s"}
            </span>
            <span className="text-gray-400 dark:text-gray-500">·</span>
            <span className="text-gray-500 dark:text-gray-400 tabular-nums">
              Acum. {fmtMoney(props.yearTotal)} · {props.yearCount} op.
            </span>
          </div>
          {/* Mini resumen por categoría (mes actual) */}
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs">
            <span className="text-gray-500 dark:text-gray-400">
              Combustible <span className="ml-1 font-mono font-semibold tabular-nums text-gray-700 dark:text-gray-200">{fmtMoney(props.currentMonthByCat.combustible)}</span>
            </span>
            <span className="text-gray-500 dark:text-gray-400">
              Peajes <span className="ml-1 font-mono font-semibold tabular-nums text-gray-700 dark:text-gray-200">{fmtMoney(props.currentMonthByCat.peaje)}</span>
            </span>
            <span className="text-gray-500 dark:text-gray-400">
              Mant. <span className="ml-1 font-mono font-semibold tabular-nums text-gray-700 dark:text-gray-200">{fmtMoney(props.currentMonthByCat.mantenimiento)}</span>
            </span>
          </div>
        </div>

        {/* Columna derecha: sparkline 12 meses */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
            Últimos 12 meses
          </p>
          <div className="mt-3 flex h-16 items-end gap-1">
            {sparkData.length === 0 ? (
              <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">
                Sin datos
              </div>
            ) : (
              sparkData.map((v, i) => {
                const h = (v / sparkMax) * 100;
                const isCurrent = i === currentMonthIdx;
                return (
                  <div
                    key={i}
                    title={`${MONTH_LABELS[i]}: ${fmtMoney(v)}`}
                    className={`flex-1 rounded-sm transition-all ${
                      isCurrent
                        ? "bg-slate-700 dark:bg-slate-200"
                        : "bg-slate-300/70 hover:bg-slate-400 dark:bg-slate-600/60 dark:hover:bg-slate-500"
                    }`}
                    style={{ height: `${Math.max(2, h)}%` }}
                  />
                );
              })
            )}
          </div>
          <div className="mt-1 flex justify-between text-[9px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
            <span>Ene</span>
            <span>Dic</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// jul 2026 v4-c — KPI secundaria: total del año por categoría +
// mini-barras mensuales. Click → filtra / des-filtra esa categoría.
function SecondaryKpiCard(props: {
  label: string;
  value: number;
  monthly: FinanceMonthlyPoint[];
  pickMonthly: (m: FinanceMonthlyPoint) => number;
  active: boolean;
  onClick: () => void;
}) {
  const series = props.monthly.map(props.pickMonthly);
  const max = Math.max(1, ...series);
  const total = series.reduce((acc, v) => acc + v, 0);
  const avg = props.monthly.length > 0 ? total / props.monthly.length : 0;
  const pctOfYear = total > 0 ? (props.value / total) * 100 : 0;
  return (
    <motion.button
      type="button"
      onClick={props.onClick}
      whileHover={{ y: -1 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
      className={`group relative overflow-hidden rounded-lg border bg-white p-4 text-left transition dark:bg-white/[0.03] ${
        props.active
          ? "border-slate-500 ring-2 ring-slate-400/30 dark:border-slate-400 dark:ring-slate-400/30"
          : "border-gray-200 hover:border-gray-300 dark:border-white/[0.08] dark:hover:border-white/[0.15]"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
          {props.label}
        </p>
        {props.active && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-700 dark:bg-slate-700/40 dark:text-slate-200">
            Filtrado
          </span>
        )}
      </div>
      <p className="mt-2 font-mono text-xl font-bold tabular-nums text-gray-900 dark:text-white">
        {fmtMoney(props.value)}
      </p>
      <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
        {pctOfYear.toFixed(0)}% del total · prom. {fmtMoney(avg)}/mes
      </p>
      {/* Mini barras 12 meses */}
      <div className="mt-3 flex h-7 items-end gap-0.5">
        {series.map((v, i) => {
          const h = (v / max) * 100;
          return (
            <div
              key={i}
              title={`${MONTH_LABELS[i]}: ${fmtMoney(v)}`}
              className={`flex-1 rounded-sm transition-all ${
                props.active
                  ? "bg-slate-600 dark:bg-slate-300"
                  : "bg-slate-300/70 group-hover:bg-slate-400 dark:bg-slate-600/60 dark:group-hover:bg-slate-500"
              }`}
              style={{ height: `${Math.max(2, h)}%` }}
            />
          );
        })}
      </div>
    </motion.button>
  );
}

function MonthRow(props: {
  month: FinanceMonthlyPoint;
  isExpanded: boolean;
  onToggle: () => void;
  rowIndex: number;
  /**
   * jul 2026 v4-b — Drill-down INLINE. Cuando `isExpanded`, el componente
   * renderiza una segunda `<tr>` con `colSpan` que contiene el detalle
   * por semana/día/facturas. Antes el drill-down era una sección
   * separada al final de la página (lejos del click), el user no lo
   * encontraba y pensaba que la página no cargaba.
   */
  children?: React.ReactNode;
}) {
  const { month, isExpanded, onToggle, rowIndex, children } = props;
  const monthLabel = MONTH_LABELS[month.month - 1] ?? "?";
  const hasData = month.total > 0;
  return (
    <>
      <motion.tr
        layout
        initial={false}
        animate={{ opacity: 1 }}
        className={`text-gray-700 transition hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-white/[0.04] ${
          isExpanded ? "bg-slate-50/80 dark:bg-white/[0.06]" : ""
        } ${!hasData ? "opacity-50" : ""}`}
      >
        <td className="px-3 py-2.5 align-middle">
          <button
            type="button"
            onClick={onToggle}
            disabled={!hasData}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-gray-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-white/[0.08] dark:hover:text-slate-200"
          >
            {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        </td>
        <td className="px-3 py-2.5 text-xs font-medium text-gray-800 dark:text-white">
          {monthLabel}
          <span className="ml-2 text-[10px] text-gray-400">#{String(rowIndex + 1).padStart(2, "0")}</span>
        </td>
        <td className="px-3 py-2.5 text-right text-xs">{month.count}</td>
        <td className="px-3 py-2.5 text-right text-xs">{fmtMoney(month.subtotal)}</td>
        <td className="px-3 py-2.5 text-right text-xs">{fmtMoney(month.ivaAmount)}</td>
        <td className="px-3 py-2.5 text-right text-xs font-semibold text-slate-900 dark:text-white">
          {fmtMoney(month.total)}
        </td>
        <td className="px-3 py-2.5 text-right text-[10px] text-gray-600 dark:text-gray-300">
          {month.byCategory.combustible > 0 ? fmtMoney(month.byCategory.combustible) : "—"}
        </td>
        <td className="px-3 py-2.5 text-right text-[10px] text-gray-600 dark:text-gray-300">
          {month.byCategory.peaje > 0 ? fmtMoney(month.byCategory.peaje) : "—"}
        </td>
        <td className="px-3 py-2.5 text-right text-[10px] text-gray-600 dark:text-gray-300">
          {month.byCategory.mantenimiento > 0 ? fmtMoney(month.byCategory.mantenimiento) : "—"}
        </td>
      </motion.tr>
      {isExpanded && children && (
        <motion.tr
          key={`drill-${month.year}-${month.month}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {/* 9 columnas en el thead: expand | mes | ops | subtotal | iva | total | comb | pea | mant */}
          <td colSpan={9} className="p-0 bg-slate-50/40 dark:bg-white/[0.03]">
            {children}
          </td>
        </motion.tr>
      )}
    </>
  );
}

function WeekGroup(props: {
  week: WeekGroup;
  isExpanded: boolean;
  onToggle: () => void;
  dayGroups: DayGroup[];
  searchText: string;
}) {
  const { week, isExpanded, onToggle, dayGroups, searchText } = props;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-indigo-200 bg-white dark:border-indigo-500/30 dark:bg-white/[0.02]"
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-indigo-50/40 dark:hover:bg-indigo-500/5"
      >
        <div className="flex items-center gap-2 text-xs">
          {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <span className="font-semibold text-gray-800 dark:text-white">
            Semana {week.weekStart.slice(8)}–{week.weekEnd.slice(8)}
          </span>
          <span className="text-[10px] text-gray-400">({fmtDateShort(week.weekStart)} → {fmtDateShort(week.weekEnd)})</span>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="text-gray-500">{week.count} factura(s)</span>
          <span className="font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{fmtMoney(week.total)}</span>
        </div>
      </button>
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden border-t border-indigo-200 dark:border-indigo-500/30"
          >
            <div className="px-3 py-2 space-y-1.5">
              {dayGroups.map((d) => (
                <div
                  key={d.key}
                  className="rounded-md border border-gray-100 bg-white px-2 py-1.5 dark:border-white/[0.05] dark:bg-white/[0.02]"
                >
                  <div className="mb-1 flex items-center justify-between text-[10px] text-gray-500">
                    <span className="font-semibold">{fmtDateShort(d.key)}</span>
                    <span>{d.count} factura(s) · {fmtMoney(d.total)}</span>
                  </div>
                  <ul className="space-y-0.5">
                    {d.invoices
                      .filter((inv) => {
                        if (!searchText.trim()) return true;
                        const q = searchText.toLowerCase();
                        const plate = inv.sourceRef?.assetPlate ?? "";
                        const title = inv.sourceRef?.maintenanceTitle ?? "";
                        const toll  = inv.sourceRef?.tollName ?? "";
                        const fuel  = inv.sourceRef?.fuelStation ?? "";
                        return [inv.invoiceNumber, plate, title, toll, fuel, inv.supplierName ?? "", inv.workshopName ?? "", inv.workerName ?? ""]
                          .some((v) => String(v).toLowerCase().includes(q));
                      })
                      .map((inv) => (
                        <li
                          key={inv.id}
                          className="flex items-center justify-between text-[11px] py-0.5 px-1 rounded hover:bg-indigo-50/40 dark:hover:bg-indigo-500/10"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono font-medium text-gray-800 dark:text-white">{inv.invoiceNumber}</span>
                            <span className="text-gray-500 truncate">
                              {[
                                inv.sourceRef?.assetPlate,
                                inv.sourceRef?.maintenanceTitle,
                                inv.sourceRef?.tollName,
                                inv.sourceRef?.fuelStation,
                                inv.supplierName,
                                inv.workshopName,
                                inv.workerName,
                              ].filter(Boolean).join(" · ") || "(sin detalle)"}
                            </span>
                          </div>
                          <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-300 shrink-0 ml-2">
                            {fmtMoney(inv.total)}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
              {dayGroups.length === 0 && (
                <p className="text-[10px] text-gray-400 italic">Sin días con facturas en esta semana.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
