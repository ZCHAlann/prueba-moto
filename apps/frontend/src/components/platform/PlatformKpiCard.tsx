import { TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";

interface PlatformKpiCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
  accent?: string;                      // barra top, ej. "bg-brand-500"
  trend?: "up" | "down" | null;
  trendLabel?: string;
}

export function PlatformKpiCard({
  icon, label, value, sub, accent = "bg-brand-500", trend, trendLabel,
}: PlatformKpiCardProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/[0.06] dark:bg-white/[0.03]">
      {/* Accent bar */}
      <div className={`absolute inset-x-0 top-0 h-0.5 ${accent} opacity-80`} />

      <div className="flex items-start justify-between gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-50 text-gray-500 dark:bg-white/[0.05] dark:text-gray-400">
          {icon}
        </div>
        {trend && trendLabel && (
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

      <p className="mt-3 text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-black tabular-nums text-gray-800 dark:text-white">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{sub}</p>
    </div>
  );
}