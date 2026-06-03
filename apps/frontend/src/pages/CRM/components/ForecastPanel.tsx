// src/pages/Platform/CRM/components/ForecastPanel.tsx
import { motion } from "framer-motion";
import { TrendingUp, Info } from "lucide-react";
import type { CRMForecast, LeadStatus } from "../../../types/platform";

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGE_META: Record<LeadStatus, {
  label: string; color: string; bar: string; prob: number;
}> = {
  nuevo:             { label: "Nuevo",            color: "text-gray-400",   bar: "bg-gray-500",   prob: 10 },
  contactado:        { label: "Contactado",        color: "text-blue-400",   bar: "bg-blue-500",   prob: 25 },
  demo_agendada:     { label: "Demo agendada",     color: "text-violet-400", bar: "bg-violet-500", prob: 40 },
  propuesta_enviada: { label: "Propuesta enviada", color: "text-amber-400",  bar: "bg-amber-500",  prob: 70 },
  ganado:            { label: "Ganado",            color: "text-emerald-400",bar: "bg-emerald-500",prob: 100},
  perdido:           { label: "Perdido",           color: "text-rose-400",   bar: "bg-rose-500",   prob: 0  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtK(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

// ─── Forecast Row ─────────────────────────────────────────────────────────────

function ForecastRow({
  stage, dealCount, totalValue, forecastValue, probability, index,
}: {
  stage:         LeadStatus;
  dealCount:     number;
  totalValue:    number;
  forecastValue: number;
  probability:   number;
  index:         number;
}) {
  const meta = STAGE_META[stage];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.06 }}
      className="space-y-2 py-3 border-b border-white/[0.04] last:border-0"
    >
      {/* Stage + probability */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${meta.bar}`} />
          <span className={`text-xs font-semibold ${meta.color}`}>{meta.label}</span>
          <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5
            text-[9px] font-bold text-gray-500">
            {dealCount}
          </span>
        </div>
        <span className="text-[10px] font-bold text-gray-500">{probability}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.04]">
        <motion.div
          className={`h-full rounded-full ${meta.bar} opacity-70`}
          initial={{ width: 0 }}
          animate={{ width: `${probability}%` }}
          transition={{ duration: 0.6, ease: "easeOut", delay: index * 0.06 }}
        />
      </div>

      {/* Values */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-600">Pipeline: {fmtK(totalValue)}</span>
        <span className={`text-[11px] font-bold ${meta.color}`}>
          {fmtK(forecastValue)}
        </span>
      </div>
    </motion.div>
  );
}

// ─── Forecast Panel ───────────────────────────────────────────────────────────

interface ForecastPanelProps {
  forecast: CRMForecast | null;
  loading:  boolean;
}

export function ForecastPanel({ forecast, loading }: ForecastPanelProps) {
  const pct = forecast && forecast.totalPipeline > 0
    ? Math.round((forecast.totalForecast / forecast.totalPipeline) * 100)
    : 0;

  const activeStages = (forecast?.byStage ?? [])
    .filter(s => !["ganado","perdido"].includes(s.stage) && s.dealCount > 0);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3.5">
        <div className="flex h-6 w-6 items-center justify-center rounded-lg
          bg-violet-500/10 border border-violet-500/20">
          <TrendingUp size={11} className="text-violet-400" />
        </div>
        <p className="text-xs font-bold text-white">Revenue Forecast</p>
        <div className="group relative ml-auto">
          <Info size={11} className="text-gray-600 cursor-help" />
          <div className="pointer-events-none absolute bottom-full right-0 mb-2 w-48
            rounded-xl border border-white/[0.08] bg-gray-900 px-3 py-2
            opacity-0 group-hover:opacity-100 transition-opacity shadow-xl z-10">
            <p className="text-[10px] text-gray-400 leading-relaxed">
              Forecast ponderado por probabilidad de cierre por etapa del pipeline.
            </p>
          </div>
        </div>
      </div>

      {/* Summary */}
      {forecast && (
        <div className="border-b border-white/[0.04] px-4 py-4">
          <div className="flex items-end justify-between mb-3">
            <div>
              <p className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold">
                Forecast total
              </p>
              <motion.p
                key={forecast.totalForecast}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xl font-bold text-white tabular-nums mt-0.5"
              >
                {fmtK(forecast.totalForecast)}
              </motion.p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-600">de {fmtK(forecast.totalPipeline)}</p>
              <p className="text-sm font-bold text-violet-400">{pct}%</p>
            </div>
          </div>

          {/* Total bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-brand-500 to-violet-500"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
        </div>
      )}

      {/* By stage */}
      <div className="px-4 max-h-[320px] overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-gray-600">
            <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <span className="text-xs">Calculando…</span>
          </div>
        ) : activeStages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10">
            <TrendingUp size={18} className="text-gray-700" />
            <p className="text-xs text-gray-600">Sin datos de forecast</p>
          </div>
        ) : (
          activeStages.map((row, idx) => (
            <ForecastRow
              key={row.stage}
              stage={row.stage}
              dealCount={row.dealCount}
              totalValue={row.totalValue}
              forecastValue={row.forecastValue}
              probability={row.probability}
              index={idx}
            />
          ))
        )}
      </div>
    </div>
  );
}