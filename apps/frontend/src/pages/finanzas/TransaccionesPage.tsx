"use client";

// pages/finanzas/TransaccionesPage.tsx
//
// jul 2026 — Submódulo Transacciones (Finanzas).
//
// Línea de tiempo GLOBAL: caja chica + gastos anuales.
// 2 tabs:
//   1) Caja Chica    → movimientos de las cuentas de caja chica
//   2) Gastos Anuales→ gastos grandes (llantas, batería, etc.) agrupados por año/mes
//
// Header: filtros por rango de fechas + scope.
// Botón "Exportar PDF" siempre visible.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  LineChart, FileDown, Loader2, AlertCircle,
  TrendingUp, TrendingDown, Calendar, Filter,
  Wallet, Repeat,
} from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "../../hooks/usePermissions";
import { useFinance, type TransactionItem } from "../../hooks/useFinance";
import { DatePicker } from "../../components/ui/date-picker/DatePicker";

// ─── Styles ──────────────────────────────────────────────────────────────────

const cardCls =
  "rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-white/[0.04]";

const inputCls =
  "h-10 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm text-gray-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-200";

const labelCls =
  "mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtMoney(n: string | number | null | undefined): string {
  if (n === null || n === undefined || n === "") return "—";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(num);
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "—";
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtDateLong(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "—";
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${day} de ${months[Number(m) - 1]} de ${y}`;
}

function startOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1));
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function TransaccionesPage() {
  const { can } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const canView = can("finanzas", "transacciones", "ver");

  const tab = (searchParams.get("tab") ?? "caja_chica") as "caja_chica" | "gastos_anuales";
  const setTab = (t: typeof tab) => setSearchParams({ tab: t });

  if (!canView) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4">
        <LineChart className="h-12 w-12 text-gray-300 dark:text-gray-600" />
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No tienes permiso para ver Transacciones.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
            <LineChart className="h-7 w-7 text-emerald-500" />
            Transacciones
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Linea de tiempo de caja chica y gastos anuales.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-white/[0.08]">
        <button
          type="button"
          onClick={() => setTab("caja_chica")}
          className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
            tab === "caja_chica"
              ? "border-emerald-500 text-emerald-700 dark:text-emerald-300"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
          }`}
        >
          <Wallet className="mr-1.5 inline h-4 w-4" />
          Caja Chica
        </button>
        <button
          type="button"
          onClick={() => setTab("gastos_anuales")}
          className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
            tab === "gastos_anuales"
              ? "border-emerald-500 text-emerald-700 dark:text-emerald-300"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
          }`}
        >
          <Repeat className="mr-1.5 inline h-4 w-4" />
          Gastos Anuales
        </button>
      </div>

      {tab === "caja_chica" && <CajaChicaTab />}
      {tab === "gastos_anuales" && <GastosAnualesTab />}
    </div>
  );
}

// ─── Tab: Caja Chica ─────────────────────────────────────────────────────────

function CajaChicaTab() {
  const finance = useFinance();
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [items, setItems] = useState<TransactionItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await finance.transactions.fetch({
        scope: "petty_cash",
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      });
      setItems(rows);
    } catch (err) {
      toast.error("Error al cargar movimientos");
    } finally {
      setLoading(false);
    }
  }, [finance, fromDate, toDate]);

  useEffect(() => { void load(); }, [load]);

  const exportPdf = useCallback(async () => {
    try {
      await finance.transactions.downloadPdf({
        scope: "petty_cash",
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      });
    } catch (err) {
      toast.error("Error al exportar el PDF");
    }
  }, [finance, fromDate, toDate]);

  const totalAmount = items.reduce((s, i) => s + Number(i.amount), 0);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className={`${cardCls} flex flex-wrap items-end gap-3 p-4`}>
        <div className="min-w-[160px]">
          <label className={labelCls}>Desde</label>
          <DatePicker compact value={fromDate} onChange={setFromDate} placeholder="Sin límite" />
        </div>
        <div className="min-w-[160px]">
          <label className={labelCls}>Hasta</label>
          <DatePicker compact value={toDate} onChange={setToDate} placeholder="Hoy" />
        </div>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => { setFromDate(""); setToDate(""); }}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-white/[0.08] dark:text-gray-200"
          >
            <Filter className="h-4 w-4" />
            Limpiar
          </button>
          <button
            type="button"
            onClick={() => void exportPdf()}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <FileDown className="h-4 w-4" />
            Exportar PDF
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className={`${cardCls} flex items-center justify-between p-4`}>
        <div>
          <p className={labelCls}>Total del periodo</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{fmtMoney(totalAmount)}</p>
        </div>
        <div className="text-right text-sm text-gray-500 dark:text-gray-400">
          {items.length} movimientos
        </div>
      </div>

      {loading ? (
        <div className={`${cardCls} flex items-center justify-center p-10`}>
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : items.length === 0 ? (
        <div className={`${cardCls} p-10 text-center`}>
          <p className="text-sm text-gray-500 dark:text-gray-400">Sin movimientos en el rango seleccionado.</p>
        </div>
      ) : (
        <div className="relative space-y-3">
          <div className="absolute left-[19px] top-2 bottom-2 w-px bg-gray-200 dark:bg-white/[0.08]" />
          {items.map(i => {
            const amount = Number(i.amount);
            const isNegative = amount < 0;
            return (
              <div key={`${i.source}-${i.id}`} className={`${cardCls} relative ml-0 flex gap-3 p-4 sm:ml-10`}>
                <div className={`absolute -left-10 top-5 flex h-9 w-9 items-center justify-center rounded-full ring-2 ring-white dark:ring-gray-900 ${
                  isNegative ? "bg-rose-500" : "bg-emerald-500"
                } text-white shadow-sm`}>
                  {isNegative ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{i.description}</p>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {fmtDateLong(i.occurredAt)} · {i.actorName ?? "—"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${isNegative ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                        {isNegative ? "−" : "+"} {fmtMoney(Math.abs(amount))}
                      </p>
                      {i.balanceAfter !== null && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">Saldo: {fmtMoney(i.balanceAfter)}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Gastos Anuales ─────────────────────────────────────────────────────

function GastosAnualesTab() {
  const finance = useFinance();
  const [items, setItems] = useState<TransactionItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await finance.transactions.fetch({ scope: "annual" });
      setItems(rows);
    } catch (err) {
      toast.error("Error al cargar gastos anuales");
    } finally {
      setLoading(false);
    }
  }, [finance]);

  useEffect(() => { void load(); }, [load]);

  const exportPdf = useCallback(async () => {
    try {
      await finance.transactions.downloadPdf({ scope: "annual" });
    } catch (err) {
      toast.error("Error al exportar el PDF");
    }
  }, [finance]);

  // Agrupar por año → mes
  const grouped = useMemo(() => {
    const byYear = new Map<number, Map<number, TransactionItem[]>>();
    for (const item of items) {
      const d = new Date(item.occurredAt);
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth();
      if (!byYear.has(y)) byYear.set(y, new Map());
      const yearMap = byYear.get(y)!;
      if (!yearMap.has(m)) yearMap.set(m, []);
      yearMap.get(m)!.push(item);
    }
    return Array.from(byYear.entries())
      .sort(([a], [b]) => b - a);
  }, [items]);

  // Proyección para el año entrante: sumamos por mes del año anterior
  const currentYear = new Date().getUTCFullYear();
  const previousYear = currentYear - 1;
  const previousYearData = grouped.find(([y]) => y === previousYear)?.[1];
  const projection: Array<{ month: number; total: number }> = [];
  if (previousYearData) {
    for (let m = 0; m < 12; m++) {
      const monthItems = previousYearData.get(m) ?? [];
      const total = monthItems.reduce((s, i) => s + Number(i.amount), 0);
      projection.push({ month: m, total });
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className={`${cardCls} flex items-center justify-between p-4`}>
        <div>
          <p className={labelCls}>Total acumulado</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {fmtMoney(items.reduce((s, i) => s + Number(i.amount), 0))}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void exportPdf()}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <FileDown className="h-4 w-4" />
          Exportar PDF
        </button>
      </div>

      {/* Proyección del año entrante */}
      {projection.length > 0 && (
        <div className={`${cardCls} p-4`}>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
              Proyección {currentYear + 1} (basada en {previousYear})
            </h3>
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Estimación calculada del gasto anual recurrente. Útil para presupuesto.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {projection
              .filter(p => p.total > 0)
              .sort((a, b) => b.total - a.total)
              .slice(0, 8)
              .map(p => (
                <div key={p.month} className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-white/[0.06] dark:bg-white/[0.04]">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    {monthName(p.month)}
                  </p>
                  <p className="mt-0.5 text-base font-bold text-gray-900 dark:text-gray-100">
                    {fmtMoney(p.total)}
                  </p>
                </div>
              ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className={`${cardCls} flex items-center justify-center p-10`}>
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : grouped.length === 0 ? (
        <div className={`${cardCls} p-10 text-center`}>
          <AlertCircle className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            No hay gastos anuales registrados.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([year, months]) => {
            const yearTotal = Array.from(months.values()).flat().reduce((s, i) => s + Number(i.amount), 0);
            return (
              <div key={year} className={`${cardCls} overflow-hidden`}>
                <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.04]">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Año {year}</h3>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{fmtMoney(yearTotal)}</span>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-white/[0.06]">
                  {Array.from(months.entries())
                    .sort(([a], [b]) => b - a)
                    .map(([month, monthItems]) => {
                      const monthTotal = monthItems.reduce((s, i) => s + Number(i.amount), 0);
                      return (
                        <div key={month} className="px-4 py-3">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                              {monthName(month)} {year}
                            </p>
                            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{fmtMoney(monthTotal)}</p>
                          </div>
                          <ul className="mt-2 space-y-1">
                            {monthItems.map(i => (
                              <li key={i.id} className="flex items-center justify-between gap-3 text-xs text-gray-600 dark:text-gray-400">
                                <span className="truncate">{fmtDate(i.occurredAt)} — {i.description}</span>
                                <span className="font-mono">{fmtMoney(i.amount)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function monthName(m: number): string {
  const names = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return names[m] ?? "";
}

export default TransaccionesPage;