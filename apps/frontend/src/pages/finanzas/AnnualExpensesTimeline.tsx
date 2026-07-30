// pages/finanzas/AnnualExpensesTimeline.tsx
//
// jul 2026 — Línea de tiempo de gastos anuales.
//
// Layout: los años se renderizan LADO A LADO (no apilados). Cada
// año es una columna que se expande hacia abajo cuando está abierto.
// Acordeón anidado de 2 niveles: Año -> Mes -> Items. Sin nivel
// de categoría (se quitó por pedido del usuario).
//
// Cada año muestra un mini-resumen al展开lo: "En 2026 gastaste $X.
// Para 2027 se proyecta $Y (+/-Z%)". Esto le da al usuario contexto
// de "en qué se podría estar usando" el dinero del año próximo
// comparado con el actual.
//
// Auto-proyección: si el año actual (o el más reciente) tiene meses
// con gasto, se genera automáticamente una columna para el año
// SIGUIENTE marcada como "Proyectado". Solo 1 año proyectado.
//
// Sin emojis en ningún copy del UI (regla de la casa).

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronRight, Calendar, FileText, AlertCircle, Loader2, FileDown, TrendingUp, TrendingDown,
} from "lucide-react";
import { toast } from "sonner";
import { useFinance, type TransactionItem } from "../../hooks/useFinance";

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const MONTH_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const cardCls =
  "rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/[0.06] dark:bg-white/[0.04]";

const labelCls =
  "mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500";

function fmtMoney(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "—";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(num);
}

function fmtDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Tipos del árbol ──────────────────────────────────────────────────────────

type YearNode = {
  year: number;
  total: number;
  /** true si esta columna es proyección (año siguiente al actual). */
  isProjected: boolean;
  /** sourceModule predominante de los items (para mostrar de dónde viene). */
  sources: Array<{ key: string; label: string; count: number; total: number }>;
  months: MonthNode[];
};

type MonthNode = {
  month: number; // 0-11
  total: number;
  count: number;
  /** Para mostrar de dónde viene este gasto. */
  sourceSummary: string;
  items: TransactionItem[];
  /** true si este mes es proyección. */
  isProjected: boolean;
};

// Mapea source de la transacción a un label legible. Hoy todas vienen
// con source="annual_expense" pero dejamos el hook por si en el futuro
// se agregan más fuentes (vehículos, combustible, etc.).
function sourceLabel(it: TransactionItem): string {
  // source describe el "de dónde viene" el gasto. Para gastos anuales
  // siempre es "annual_expense", pero dejamos el hook.
  switch (it.source) {
    case "annual_expense":
      return "Gasto anual";
    case "petty_cash_movement":
      return "Caja chica";
    default:
      return "Otro";
  }
}

// Construye el árbol: items -> año -> mes. Inyecta año siguiente como
// proyección. Sin nivel de categoría.
function buildTree(items: TransactionItem[], currentYear: number): YearNode[] {
  // year -> month -> items
  const raw = new Map<number, Map<number, TransactionItem[]>>();

  for (const item of items) {
    const d = new Date(item.occurredAt);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    if (!raw.has(y)) raw.set(y, new Map());
    const yMap = raw.get(y)!;
    if (!yMap.has(m)) yMap.set(m, []);
    yMap.get(m)!.push(item);
  }

  const years: YearNode[] = [];

  for (const [year, mMap] of Array.from(raw.entries()).sort(([a], [b]) => b - a)) {
    const months: MonthNode[] = [];
    let yearTotal = 0;
    let yearCount = 0;
    const sourcesMap = new Map<string, { label: string; count: number; total: number }>();

    for (const [m, mItems] of Array.from(mMap.entries()).sort(([a], [b]) => b - a)) {
      const mTotal = mItems.reduce((s, i) => s + Number(i.amount), 0);
      // Armamos un "source summary" corto: ej. "Gasto anual · Caja chica"
      // o si todas vienen del mismo lado, solo ese.
      const srcSet = new Set(mItems.map(sourceLabel));
      const sourceSummary = Array.from(srcSet).join(" · ");
      months.push({ month: m, total: mTotal, count: mItems.length, sourceSummary, items: mItems, isProjected: false });
      yearTotal += mTotal;
      yearCount += mItems.length;
      for (const it of mItems) {
        const lbl = sourceLabel(it);
        const key = it.source;
        const cur = sourcesMap.get(key) ?? { label: lbl, count: 0, total: 0 };
        cur.count += 1;
        cur.total += Number(it.amount);
        sourcesMap.set(key, cur);
      }
    }

    const sources = Array.from(sourcesMap.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.total - a.total);

    years.push({ year, total: yearTotal, isProjected: false, sources, months });
  }

  // jul 2026 — Proyección: solo el año SIGUIENTE al currentYear. Si el
  // año actual tiene meses con gasto, replicamos esos meses en el año
  // próximo. Sin proyección si no hay año actual NI años anteriores.
  const referenceYear = years.find((y) => y.year === currentYear) ?? years[0];
  if (referenceYear && referenceYear.year + 1 === currentYear + 1) {
    const projectedYear = currentYear + 1;
    // Sumar los mismos meses a lo largo de todos los años reales.
    const monthsAcc = new Map<number, number>();
    const yearCount = years.filter((y) => !y.isProjected).length;
    for (const yn of years) {
      if (yn.isProjected) continue;
      for (const m of yn.months) {
        monthsAcc.set(m.month, (monthsAcc.get(m.month) ?? 0) + m.total);
      }
    }
    // 1 año: monto directo. 2+ años: promedio.
    const useAvg = yearCount >= 2;

    const projectedMonths: MonthNode[] = [];
    let projTotal = 0;
    let projCount = 0;
    for (const m of referenceYear.months) {
      const baseAmt = monthsAcc.get(m.month) ?? m.total;
      const amt = useAvg ? baseAmt / Math.max(1, yearCount) : baseAmt;
      projectedMonths.push({
        month: m.month,
        total: amt,
        count: 1,
        sourceSummary: m.sourceSummary,
        items: [],
        isProjected: true,
      });
      projTotal += amt;
      projCount += 1;
    }
    // Ordenar meses proyectados ASCENDENTE (enero -> diciembre) porque
    // es una línea de tiempo que avanza.
    projectedMonths.sort((a, b) => a.month - b.month);

    years.push({
      year: projectedYear,
      total: projTotal,
      isProjected: true,
      sources: referenceYear.sources,
      months: projectedMonths,
    });
  }

  return years;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function AnnualExpensesTimeline() {
  const finance = useFinance();
  const [items, setItems] = useState<TransactionItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Estado de "qué columnas están expandidas". Ahora los 2 años
  // pueden estar abiertos al MISMO tiempo (acordeón solo a nivel de
  // mes dentro de cada año: solo UN mes abierto por año).
  const [openYears, setOpenYears] = useState<Set<number>>(new Set());
  const [openMonthByYear, setOpenMonthByYear] = useState<Record<number, number | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await finance.transactions.fetch({
        scope: "annual",
        page: 1,
        pageSize: 100, // cap del backend
      });
      setItems(result.data);
    } catch (err) {
      toast.error("Error al cargar gastos anuales");
    } finally {
      setLoading(false);
    }
  }, [finance]);

  useEffect(() => { void load(); }, [load]);

  const currentYear = new Date().getUTCFullYear();
  const tree = useMemo(() => buildTree(items, currentYear), [items, currentYear]);

  // jul 2026 — Para el indicador de "en qué se podría estar usando":
  // comparamos el año proyectado (currentYear+1) contra el último
  // año real (el currentYear, si tiene datos).
  const projected = tree.find((y) => y.isProjected);
  const baseline = tree.find((y) => y.year === currentYear) ?? tree.find((y) => !y.isProjected);
  const baselineTotal = baseline?.total ?? 0;
  const projectedTotal = projected?.total ?? 0;
  const pctDiff = baselineTotal > 0
    ? ((projectedTotal - baselineTotal) / baselineTotal) * 100
    : 0;
  const isUp = pctDiff > 0.5;
  const isDown = pctDiff < -0.5;

  // Auto-apertura inicial: abre los 2 años (actual + proyectado) si
  // existen, así el user ve la comparación de entrada.
  useEffect(() => {
    if (tree.length === 0) return;
    if (openYears.size === 0) {
      const next = new Set<number>();
      // Año actual (o el más reciente si no hay del actual)
      const baseline = tree.find((n) => n.year === currentYear) ?? tree[0];
      next.add(baseline.year);
      // Y el proyectado si existe
      const proj = tree.find((n) => n.isProjected);
      if (proj) next.add(proj.year);
      setOpenYears(next);
      // Auto-abrir el primer mes del año baseline
      if (baseline.months.length > 0) {
        setOpenMonthByYear({ [baseline.year]: baseline.months[0].month });
      }
    }
  }, [tree, openYears, currentYear]);

  const toggleYear = (year: number) => {
    setOpenYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) {
        next.delete(year);
        setOpenMonthByYear((m) => ({ ...m, [year]: null }));
      } else {
        next.add(year);
        // Auto-abrir el primer mes al abrir el año
        const yn = tree.find((n) => n.year === year);
        if (yn && yn.months.length > 0) {
          setOpenMonthByYear((m) => ({ ...m, [year]: yn.months[0].month }));
        }
      }
      return next;
    });
  };

  const toggleMonth = (year: number, month: number) => {
    setOpenMonthByYear((prev) => {
      const cur = prev[year];
      return { ...prev, [year]: cur === month ? null : month };
    });
  };

  const exportPdf = useCallback(async () => {
    try {
      await finance.transactions.downloadPdf({ scope: "annual" });
    } catch (err) {
      toast.error("Error al exportar el PDF");
    }
  }, [finance]);

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading && tree.length === 0) {
    return (
      <div className={`${cardCls} flex items-center justify-center p-10`}>
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className={`${cardCls} p-10 text-center`}>
        <AlertCircle className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          No hay gastos anuales registrados.
        </p>
        <button
          type="button"
          onClick={exportPdf}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <FileDown className="h-4 w-4" />
          Exportar PDF
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary + indicador de presupuesto + Exportar PDF */}
      <div className={`${cardCls} flex flex-wrap items-center justify-between gap-4 p-4`}>
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className={labelCls}>Total acumulado</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {fmtMoney(tree.filter((y) => !y.isProjected).reduce((s, y) => s + y.total, 0))}
            </p>
          </div>
          {projected && baseline && baseline.year !== projected.year && (
            <div className="border-l border-gray-200 dark:border-white/[0.06] pl-6">
              <p className={labelCls}>
                En {baseline.year} gastaste &nbsp;·&nbsp; para {projected.year} se proyecta
              </p>
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="text-lg font-semibold text-gray-700 dark:text-gray-200">
                  {fmtMoney(baselineTotal)}
                </span>
                <span className="text-gray-400">→</span>
                <span className="text-lg font-bold text-violet-700 dark:text-violet-300">
                  {fmtMoney(projectedTotal)}
                </span>
                {Math.abs(pctDiff) >= 0.5 && (
                  <span
                    className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
                      isUp
                        ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                    }`}
                    title={
                      isUp
                        ? `Se proyecta gastar ${Math.abs(pctDiff).toFixed(1)}% más que en ${baseline.year}`
                        : `Se proyecta gastar ${Math.abs(pctDiff).toFixed(1)}% menos que en ${baseline.year}`
                    }
                  >
                    {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {isUp ? "+" : ""}
                    {pctDiff.toFixed(1)}%
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-gray-400">
                {isUp
                  ? `En ${projected.year} se podría estar usando ${fmtMoney(projectedTotal - baselineTotal)} más que en ${baseline.year}.`
                  : isDown
                    ? `En ${projected.year} se podría estar usando ${fmtMoney(baselineTotal - projectedTotal)} menos que en ${baseline.year}.`
                    : `El gasto anual se mantiene estable.`}
              </p>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={exportPdf}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <FileDown className="h-4 w-4" />
          Exportar PDF
        </button>
      </div>

      {/* Línea de tiempo: columnas de años LADO A LADO. Cada columna
          ocupa la mitad del ancho disponible (flex-1) con un mínimo
          razonable. Como típicamente hay 2 años (actual + proyectado),
          las 2 columnas llenan la pantalla. Los 2 años pueden estar
          abiertos al mismo tiempo. */}
      <div className="flex flex-wrap items-start gap-4">
        {tree.map((yn) => {
          const isYearOpen = openYears.has(yn.year);
          const openMonth = openMonthByYear[yn.year] ?? null;
          // Top 5 gastos del año (o referencias si es proyectado).
          // Para año real: items reales ordenados por monto desc.
          // Para año proyectado: los items del año de referencia
          // (los que originaron la proyección).
          const topItems: Array<{ description: string; amount: number; month: number; isProjected: boolean }> = [];
          if (yn.isProjected) {
            // Usamos los items del año de referencia que dispararon la proyección
            const referenceYear = tree.find((y) => !y.isProjected);
            if (referenceYear) {
              for (const m of referenceYear.months) {
                for (const it of m.items) {
                  topItems.push({
                    description: it.description || sourceLabel(it),
                    amount: Number(it.amount),
                    month: m.month,
                    isProjected: true,
                  });
                }
              }
            }
          } else {
            for (const m of yn.months) {
              for (const it of m.items) {
                topItems.push({
                  description: it.description || sourceLabel(it),
                  amount: Number(it.amount),
                  month: m.month,
                  isProjected: false,
                });
              }
            }
          }
          topItems.sort((a, b) => b.amount - a.amount);

          return (
            <div
              key={yn.year}
              className={`${cardCls} overflow-hidden flex-1 min-w-[280px] ${yn.isProjected ? "ring-1 ring-violet-300 dark:ring-violet-500/30" : ""}`}
            >
              {/* Header de la columna: año */}
              <button
                type="button"
                onClick={() => toggleYear(yn.year)}
                className="flex w-full flex-col items-stretch gap-1.5 px-4 py-3.5 text-left transition hover:bg-gray-50 dark:hover:bg-white/[0.04]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <ChevronRight
                      className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${isYearOpen ? "rotate-90" : ""}`}
                    />
                    <Calendar className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span className="text-xl font-bold text-gray-900 dark:text-gray-100">
                      {yn.year}
                    </span>
                    {yn.isProjected && (
                      <span className="rounded bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:bg-violet-500/20 dark:text-violet-300 shrink-0">
                        Proy
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-gray-400">
                    {yn.months.length} {yn.months.length === 1 ? "mes" : "meses"}
                  </span>
                  <span className="text-2xl font-bold tabular-nums text-gray-800 dark:text-gray-200 truncate">
                    {fmtMoney(yn.total)}
                  </span>
                </div>
              </button>

              {/* Cuerpo de la columna */}
              {isYearOpen && (
                <div className="border-t border-gray-100 dark:border-white/[0.06]">
                  {/* "En qué se gastó" / "En qué se va a gastar" — Top gastos del año */}
                  {topItems.length > 0 && (
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.04]">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                        {yn.isProjected
                          ? "En qué se va a gastar"
                          : "En qué se gastó"}
                      </p>
                      <ul className="space-y-1.5">
                        {topItems.slice(0, 5).map((ti, idx) => (
                          <li
                            key={`${ti.description}-${ti.month}-${idx}`}
                            className="flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              <span className="text-[10px] text-gray-400 shrink-0 w-5 tabular-nums">
                                {idx + 1}.
                              </span>
                              <FileText className="h-3 w-3 shrink-0 text-gray-400" />
                              <span className="truncate text-gray-700 dark:text-gray-300">
                                {ti.description}
                              </span>
                              <span className="text-[10px] text-gray-400 shrink-0">
                                · {MONTH_SHORT[ti.month]}
                              </span>
                            </div>
                            <span className="font-mono tabular-nums shrink-0 text-gray-800 dark:text-gray-200">
                              {fmtMoney(ti.amount)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Meses */}
                  {yn.months.map((m) => {
                    const isMonthOpen = openMonth === m.month;
                    return (
                      <div key={m.month} className="border-b border-gray-100 last:border-b-0 dark:border-white/[0.04]">
                        <button
                          type="button"
                          onClick={() => toggleMonth(yn.year, m.month)}
                          className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left transition hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <ChevronRight
                              className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${isMonthOpen ? "rotate-90" : ""}`}
                            />
                            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                              {MONTH_SHORT[m.month]}
                            </span>
                            {m.isProjected && (
                              <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-600 dark:bg-violet-500/15 dark:text-violet-300 shrink-0">
                                Proy
                              </span>
                            )}
                          </div>
                          <div className="flex items-baseline gap-1.5 shrink-0">
                            <span className="text-[11px] text-gray-400">{m.count} {m.count === 1 ? "gasto" : "gastos"}</span>
                            <span className="text-sm font-semibold tabular-nums text-gray-700 dark:text-gray-300">
                              {fmtMoney(m.total)}
                            </span>
                          </div>
                        </button>

                        {/* Items del mes: al展开, lista con la fuente de cada gasto */}
                        {isMonthOpen && (
                          <div className="border-t border-gray-100 bg-gray-50/50 px-3 py-2 dark:border-white/[0.04] dark:bg-white/[0.015]">
                            {m.items.length === 0 ? (
                              <p className="px-2 py-1.5 text-xs italic text-gray-400">
                                {m.isProjected
                                  ? "Monto proyectado a partir de los mismos meses en años anteriores."
                                  : "Sin gastos este mes."}
                              </p>
                            ) : (
                              <ul className="space-y-1.5">
                                {m.items.map((it) => (
                                  <li
                                    key={it.id}
                                    className="rounded px-2.5 py-1.5 text-xs text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-white/[0.04]"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                        <FileText className="h-3 w-3 shrink-0 text-gray-400" />
                                        <span className="truncate font-medium">
                                          {it.description || sourceLabel(it)}
                                        </span>
                                      </div>
                                      <span className="font-mono tabular-nums shrink-0 text-gray-800 dark:text-gray-200">
                                        {fmtMoney(it.amount)}
                                      </span>
                                    </div>
                                    <div className="mt-0.5 flex items-center gap-1.5 pl-4.5 text-[10px] text-gray-400">
                                      <span>{fmtDate(it.occurredAt)}</span>
                                      {it.actorName && (
                                        <>
                                          <span className="text-gray-300">·</span>
                                          <span>{it.actorName}</span>
                                        </>
                                      )}
                                      <span className="text-gray-300">·</span>
                                      <span className="font-semibold uppercase tracking-wider text-[9px]">
                                        {sourceLabel(it)}
                                      </span>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
