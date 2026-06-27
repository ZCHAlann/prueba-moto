"use client";

import { useMemo } from "react";
import {
  Sparkles, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle2, Zap, ArrowUpRight, ArrowDownRight,
  Loader2, RefreshCw,
} from "lucide-react";
import { useFuelInsights, type FuelInsight, type FuelPeak } from "../../hooks/useFuel";

type Props = {
  from?: string;
  to?: string;
};

const KIND_STYLES: Record<FuelInsight["kind"], {
  Icon: any;
  bg: string;
  border: string;
  text: string;
  iconColor: string;
  label: string;
}> = {
  positive: {
    Icon: CheckCircle2,
    bg: "bg-emerald-50 dark:bg-emerald-500/[0.08]",
    border: "border-emerald-200 dark:border-emerald-500/30",
    text: "text-emerald-700 dark:text-emerald-300",
    iconColor: "text-emerald-500",
    label: "✓ A favor",
  },
  negative: {
    Icon: AlertTriangle,
    bg: "bg-rose-50 dark:bg-rose-500/[0.08]",
    border: "border-rose-200 dark:border-rose-500/30",
    text: "text-rose-700 dark:text-rose-300",
    iconColor: "text-rose-500",
    label: "Atención",
  },
  warning: {
    Icon: AlertTriangle,
    bg: "bg-amber-50 dark:bg-amber-500/[0.08]",
    border: "border-amber-200 dark:border-amber-500/30",
    text: "text-amber-700 dark:text-amber-300",
    iconColor: "text-amber-500",
    label: "Alerta",
  },
  info: {
    Icon: Sparkles,
    bg: "bg-sky-50 dark:bg-sky-500/[0.08]",
    border: "border-sky-200 dark:border-sky-500/30",
    text: "text-sky-700 dark:text-sky-300",
    iconColor: "text-sky-500",
    label: "Info",
  },
};

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export function FuelInsights({ from, to }: Props) {
  const { data, loading, error, refresh } = useFuelInsights(from, to);

  const sortedInsights = useMemo(() => {
    if (!data) return [];
    // Orden: negative y warning primero, luego positive, luego info
    const order: Record<FuelInsight["kind"], number> = { negative: 0, warning: 1, positive: 2, info: 3 };
    return [...data.insights].sort((a, b) => order[a.kind] - order[b.kind]);
  }, [data]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] p-6 flex items-center justify-center gap-2 text-sm text-gray-400">
        <Loader2 size={16} className="animate-spin" /> Analizando consumo…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/[0.05] p-4 text-sm text-rose-700 dark:text-rose-300">
        {error}
      </div>
    );
  }

  if (!data || data.range.totalRecords === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-8 text-center">
        <Sparkles size={20} className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Sin datos para analizar</p>
        <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
          Carga registros de combustible para que la analítica pueda detectar patrones.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-0.5">
        <div>
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white inline-flex items-center gap-2">
            <Zap size={14} className="text-violet-500" />
            Análisis automático
          </h2>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
            Patrones, picos y comparativas detectadas en {data.range.totalRecords} registros
            {data.range.from || data.range.to ? ` · ${data.range.from ?? "…"} → ${data.range.to ?? "…"}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition"
          title="Recalcular"
        >
          <RefreshCw size={12} /> Recalcular
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* ── Insights de texto ── */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <h3 className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
            <Sparkles size={11} className="text-violet-500" /> Insights
          </h3>
          {sortedInsights.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">Sin insights automáticos en este rango.</p>
          ) : (
            <ul className="space-y-1.5">
              {sortedInsights.slice(0, 8).map((it, i) => {
                const s = KIND_STYLES[it.kind];
                const Icon = s.Icon;
                return (
                  <li
                    key={i}
                    className={`flex items-start gap-2 rounded-lg border ${s.bg} ${s.border} px-3 py-2`}
                  >
                    <Icon size={13} className={`mt-0.5 shrink-0 ${s.iconColor}`} />
                    <p className={`text-[11px] leading-relaxed ${s.text}`}>{it.text}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── Picos detectados ── */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <h3 className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
            <AlertTriangle size={11} className="text-rose-500" /> Picos de consumo
          </h3>
          {data.peaks.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">Sin outliers detectados. El consumo es estable.</p>
          ) : (
            <ul className="space-y-1.5">
              {data.peaks.slice(0, 5).map((p: FuelPeak, i) => (
                <li
                  key={i}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
                    p.severity === "extreme"
                      ? "border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/[0.06]"
                      : "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/[0.06]"
                  }`}
                >
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold ${p.severity === "extreme" ? "text-rose-700 dark:text-rose-300" : "text-amber-700 dark:text-amber-300"}`}>
                      {p.plate ?? p.name ?? "—"}
                    </p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                      {p.date} · {p.gallons} gal (media {p.avgGallons} gal)
                    </p>
                  </div>
                  <span className={`shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                    p.severity === "extreme"
                      ? "bg-rose-200/60 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200"
                      : "bg-amber-200/60 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200"
                  }`}>
                    <Zap size={9} /> {p.zScore}σ
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* ── Top 5 consumidores ── */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <h3 className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-rose-500">
            <ArrowUpRight size={11} /> Top 5 consumidores
          </h3>
          {data.topConsumers.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">Sin datos.</p>
          ) : (
            <ol className="space-y-1">
              {data.topConsumers.map((c, i) => (
                <li
                  key={c.assetId}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                >
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-500/20 text-[10px] font-bold text-rose-700 dark:text-rose-300">
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate text-xs font-medium text-gray-800 dark:text-white">
                    {c.plate ?? c.name ?? "—"}
                  </span>
                  <span className="text-right text-[11px] tabular-nums">
                    <span className="font-semibold text-rose-700 dark:text-rose-300">{c.totalGallons} gal</span>
                    <span className="ml-1 text-gray-400 dark:text-gray-500">{fmtMoney(c.totalCost)}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* ── Bottom 5 consumidores ── */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <h3 className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-500">
            <ArrowDownRight size={11} /> Menor consumo
          </h3>
          {data.bottomConsumers.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">Necesitamos más datos para comparar.</p>
          ) : (
            <ol className="space-y-1">
              {data.bottomConsumers.map((c, i) => (
                <li
                  key={c.assetId}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                >
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate text-xs font-medium text-gray-800 dark:text-white">
                    {c.plate ?? c.name ?? "—"}
                  </span>
                  <span className="text-right text-[11px] tabular-nums">
                    <span className="font-semibold text-emerald-700 dark:text-emerald-300">{c.totalGallons} gal</span>
                    <span className="ml-1 text-gray-400 dark:text-gray-500">{fmtMoney(c.totalCost)}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* ── Mejor / peor rendimiento ── */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <h3 className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
            <TrendingUp size={11} className="text-emerald-500" /> Rendimiento (km/L)
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">Mejor</p>
              {data.bestEfficiency.length === 0 ? (
                <p className="mt-1 text-xs text-gray-400">Sin datos</p>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {data.bestEfficiency.map((e) => (
                    <li key={e.assetId} className="text-xs">
                      <span className="font-medium text-gray-800 dark:text-white">{e.plate ?? e.name}</span>
                      <span className="ml-1 font-semibold text-emerald-700 dark:text-emerald-300">{e.efficiency}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-rose-600 dark:text-rose-400">Peor</p>
              {data.worstEfficiency.length === 0 ? (
                <p className="mt-1 text-xs text-gray-400">Sin datos</p>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {data.worstEfficiency.map((e) => (
                    <li key={e.assetId} className="text-xs">
                      <span className="font-medium text-gray-800 dark:text-white">{e.plate ?? e.name}</span>
                      <span className="ml-1 font-semibold text-rose-700 dark:text-rose-300">{e.efficiency}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* ── Tendencias ── */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <h3 className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
            <TrendingDown size={11} className="text-amber-500" /> Tendencia del período
          </h3>
          {data.trends.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">Sin datos suficientes.</p>
          ) : (
            <ul className="space-y-1">
              {data.trends.filter((t) => t.trend !== "stable").slice(0, 6).map((t) => (
                <li
                  key={t.assetId}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                >
                  <span className="flex-1 truncate text-xs font-medium text-gray-800 dark:text-white">
                    {t.plate ?? t.name}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                      t.trend === "up"
                        ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                    }`}
                  >
                    {t.trend === "up" ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                    {t.changePct > 0 ? "+" : ""}{t.changePct}%
                  </span>
                </li>
              ))}
              {data.trends.filter((t) => t.trend !== "stable").length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500">Todos los vehículos están estables.</p>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
