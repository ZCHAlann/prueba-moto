import { motion } from "framer-motion";
import { RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { CRMStats } from "../../../types/platform";

// ─── Pipeline Health Indicator ────────────────────────────────────────────────

function PipelineHealth({ health, stalePercent }: {
  health: CRMStats["pipelineHealth"];
  stalePercent: number;
}) {
  const meta = {
    healthy:  { label: "Pipeline saludable",  color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", dot: "bg-emerald-400", pulse: false },
    warning:  { label: "Atención requerida",  color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20",   dot: "bg-amber-400",   pulse: true  },
    critical: { label: "Pipeline en riesgo",  color: "text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-500/20",    dot: "bg-rose-400",    pulse: true  },
  }[health];

  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2
      ${meta.bg} ${meta.border}`}>
      <span className="relative flex h-2 w-2">
        {meta.pulse && (
          <span className={`animate-ping absolute inline-flex h-full w-full
            rounded-full opacity-75 ${meta.dot}`} />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${meta.dot}`} />
      </span>
      <span className={`text-xs font-semibold ${meta.color}`}>
        {meta.label}
      </span>
      <span className="text-xs text-gray-500">
        {stalePercent}% estancado
      </span>
    </div>
  );
}

// ─── Pipeline Value Ticker ────────────────────────────────────────────────────

function ValueTicker({ value, label }: { value: number; label: string }) {
  const formatted = value >= 1000000
    ? `$${(value / 1000000).toFixed(2)}M`
    : value >= 1000
    ? `$${(value / 1000).toFixed(1)}k`
    : `$${value.toFixed(0)}`;

  return (
    <div className="flex flex-col items-end">
      <motion.p
        key={value}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-2xl font-bold text-white tabular-nums"
      >
        {formatted}
      </motion.p>
      <p className="text-[11px] text-gray-500">{label}</p>
    </div>
  );
}

// ─── Win Rate Badge ───────────────────────────────────────────────────────────

function WinRateBadge({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  const isUp   = diff > 0;
  const isDown = diff < 0;

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col items-end">
        <div className="flex items-center gap-1.5">
          <span className="text-2xl font-bold text-white tabular-nums">
            {current}%
          </span>
          {isUp && (
            <span className="flex items-center gap-0.5 rounded-lg bg-emerald-500/10
              border border-emerald-500/20 px-1.5 py-0.5 text-[10px]
              font-semibold text-emerald-400">
              <TrendingUp size={9} /> +{diff}%
            </span>
          )}
          {isDown && (
            <span className="flex items-center gap-0.5 rounded-lg bg-rose-500/10
              border border-rose-500/20 px-1.5 py-0.5 text-[10px]
              font-semibold text-rose-400">
              <TrendingDown size={9} /> {diff}%
            </span>
          )}
          {!isUp && !isDown && (
            <span className="flex items-center gap-0.5 rounded-lg bg-gray-500/10
              border border-white/[0.08] px-1.5 py-0.5 text-[10px]
              font-semibold text-gray-400">
              <Minus size={9} /> Sin cambio
            </span>
          )}
        </div>
        <p className="text-[11px] text-gray-500">Win rate este mes</p>
      </div>
    </div>
  );
}

// ─── CRM Header ───────────────────────────────────────────────────────────────

interface CRMHeaderProps {
  stats: CRMStats | null;
  loading: boolean;
  onRefetch: () => void;
}

export function CRMHeader({ stats, loading, onRefetch }: CRMHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col gap-4"
    >
      {/* Top row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">

        {/* Title */}
        <div>
          <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full
            border border-brand-500/20 bg-brand-500/10 px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
            <span className="text-xs font-medium text-brand-400">Plataforma</span>
          </div>
          <h1 className="text-2xl font-bold text-white">CRM Comercial</h1>
          <p className="mt-1 text-sm text-gray-400">
            Pipeline de ventas de ApliSmart Motors
          </p>
        </div>

        {/* Right side — metrics + refresh */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-5">

          {stats && (
            <>
              <ValueTicker
                value={stats.pipelineValue}
                label="Valor en pipeline"
              />
              <div className="h-8 w-px bg-white/[0.06]" />
              <ValueTicker
                value={stats.forecastValue}
                label="Forecast ponderado"
              />
              <div className="h-8 w-px bg-white/[0.06]" />
              <WinRateBadge
                current={stats.winRateThisMonth}
                previous={stats.winRateLastMonth}
              />
            </>
          )}

          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={onRefetch}
            disabled={loading}
            className="flex h-8 w-8 items-center justify-center rounded-xl
              border border-white/[0.08] text-gray-400 transition
              hover:border-brand-500/30 hover:text-brand-400 disabled:opacity-40"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </motion.button>
        </div>
      </div>

      {/* Health indicator */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <PipelineHealth
            health={stats.pipelineHealth}
            stalePercent={stats.stalePercent}
          />
        </motion.div>
      )}
    </motion.div>
  );
}