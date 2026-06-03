import { motion } from "framer-motion";
import {
  DollarSign, TrendingUp, Clock, Target,
  ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import type { CRMStats } from "../../../types/platform";

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label:   string;
  value:   string;
  sub?:    string;
  icon:    React.ReactNode;
  accent:  string;
  trend?:  { value: number; label: string };
  delay?:  number;
}

function KpiCard({ label, value, sub, icon, accent, trend, delay = 0 }: KpiCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className="rounded-2xl border border-white/[0.06] bg-white/[0.03]
        p-4 flex flex-col gap-3"
    >
      {/* Icon + trend */}
      <div className="flex items-center justify-between">
        <div className={`flex h-9 w-9 items-center justify-center
          rounded-xl ${accent} bg-opacity-10`}>
          {icon}
        </div>
        {trend && (
          <div className={`flex items-center gap-0.5 rounded-lg px-1.5 py-0.5
            text-[10px] font-semibold
            ${trend.value >= 0
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-rose-500/10 text-rose-400"
            }`}>
            {trend.value >= 0
              ? <ArrowUpRight size={10} />
              : <ArrowDownRight size={10} />
            }
            {Math.abs(trend.value)}%
          </div>
        )}
      </div>

      {/* Value */}
      <div>
        <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>

      {/* Sub */}
      {sub && (
        <p className="text-[11px] text-gray-600 border-t border-white/[0.04] pt-2">
          {sub}
        </p>
      )}
    </motion.div>
  );
}

// ─── CRM KPI Cards ────────────────────────────────────────────────────────────

interface CRMKpiCardsProps {
  stats: CRMStats | null;
}

export function CRMKpiCards({ stats }: CRMKpiCardsProps) {
  const pipelineValue = stats?.pipelineValue ?? 0;
  const formatted = pipelineValue >= 1000
    ? `$${(pipelineValue / 1000).toFixed(1)}k`
    : `$${pipelineValue.toFixed(0)}`;

  const winRateDiff = stats
    ? stats.winRateThisMonth - stats.winRateLastMonth
    : 0;

  const cards: KpiCardProps[] = [
    {
      label:  "Valor en pipeline",
      value:  formatted,
      sub:    `${stats?.activeDeals ?? 0} deals activos`,
      icon:   <DollarSign size={16} className="text-brand-400" />,
      accent: "bg-brand-500",
      delay:  0,
    },
    {
      label:  "Win rate",
      value:  `${stats?.winRateThisMonth ?? 0}%`,
      sub:    `${stats?.wonThisMonth ?? 0} ganados este mes`,
      icon:   <Target size={16} className="text-emerald-400" />,
      accent: "bg-emerald-500",
      trend:  { value: winRateDiff, label: "vs mes anterior" },
      delay:  0.07,
    },
    {
      label:  "Deals activos",
      value:  String(stats?.activeDeals ?? 0),
      sub:    `${stats?.staleDeals ?? 0} estancados`,
      icon:   <TrendingUp size={16} className="text-violet-400" />,
      accent: "bg-violet-500",
      delay:  0.14,
    },
    {
      label:  "Velocidad de cierre",
      value:  `${stats?.avgClosingDays ?? 0}d`,
      sub:    "Promedio días para cerrar",
      icon:   <Clock size={16} className="text-amber-400" />,
      accent: "bg-amber-500",
      delay:  0.21,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {cards.map(card => (
        <KpiCard key={card.label} {...card} />
      ))}
    </div>
  );
}