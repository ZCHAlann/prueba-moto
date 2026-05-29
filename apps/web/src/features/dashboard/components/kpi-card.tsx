"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

export type KpiCardTone = "success" | "error" | "warning" | "brand";

const badgeStyles: Record<KpiCardTone, string> = {
  success: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500",
  error:   "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500",
  warning: "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-500",
  brand:   "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400",
};

const sparklineColor: Record<KpiCardTone, string> = {
  success: "#10b981",
  error:   "#ef4444",
  warning: "#f59e0b",
  brand:   "#465fff",
};

export interface KpiCardProps {
  label: string;
  value: string;
  badge?: string;
  tone?: KpiCardTone;
  icon: ReactNode;
  href?: string;
  sparkline?: number[];
}

function ArrowUp() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
      <path fillRule="evenodd" clipRule="evenodd"
        d="M7.6 2.34a.6.6 0 0 1 .848 0l4 4a.6.6 0 0 1-.848.848L8.6 4.248V13.4a.6.6 0 1 1-1.2 0V4.248L4.4 7.188a.6.6 0 0 1-.848-.848l4-4z"
        fill="currentColor" />
    </svg>
  );
}
function ArrowDown() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
      <path fillRule="evenodd" clipRule="evenodd"
        d="M8.4 13.66a.6.6 0 0 1-.848 0l-4-4a.6.6 0 0 1 .848-.848L7.4 11.752V2.6a.6.6 0 1 1 1.2 0v9.152l2.952-2.94a.6.6 0 0 1 .848.848l-4 4z"
        fill="currentColor" />
    </svg>
  );
}

function Sparkline({ data, tone }: { data: number[]; tone: KpiCardTone }) {
  const color = sparklineColor[tone];
  const options: ApexOptions = {
    chart: { type: "line", sparkline: { enabled: true }, background: "transparent" },
    colors: [color],
    stroke: { curve: "smooth", width: 2 },
    tooltip: { enabled: false },
  };
  return (
    <ReactApexChart options={options} series={[{ data }]} type="line" height={40} width={80} />
  );
}

const iconBg: Record<KpiCardTone, string> = {
  success: "bg-success-50 dark:bg-success-500/15",
  error:   "bg-error-50 dark:bg-error-500/15",
  warning: "bg-warning-50 dark:bg-warning-500/15",
  brand:   "bg-brand-50 dark:bg-brand-500/15",
};

const iconColor: Record<KpiCardTone, string> = {
  success: "text-success-600 dark:text-success-400",
  error:   "text-error-600 dark:text-error-400",
  warning: "text-warning-600 dark:text-warning-400",
  brand:   "text-brand-600 dark:text-brand-400",
};

function KpiCardInner({ label, value, badge, tone = "brand", icon, sparkline }: KpiCardProps) {
  const isPositive = badge ? !badge.startsWith("-") : true;
  const badgeTone: KpiCardTone = badge ? (isPositive ? "success" : "error") : (tone ?? "brand");
  const iconTone: KpiCardTone = tone ?? "brand";

  return (
    <div className="rounded-2xl bg-white border border-gray-200 dark:border-gray-100 p-5 dark:bg-white/[0.03] md:p-6">
      <div className={`flex items-center justify-center w-12 h-12 rounded-xl ${iconBg[iconTone]}`}>
        <span className={iconColor[iconTone]}>{icon}</span>
      </div>
      <div className="flex items-end justify-between mt-5">
        <div>
          <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
          <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90">{value}</h4>
        </div>
        {badge ? (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badgeStyles[badgeTone]}`}>
            {isPositive ? <ArrowUp /> : <ArrowDown />}
            {badge.replace(/^[+-]/, "")}
          </span>
        ) : sparkline ? (
          <Sparkline data={sparkline} tone={tone} />
        ) : null}
      </div>
    </div>
  );
}

export function KpiCard(props: KpiCardProps) {
  if (props.href) {
    return (
      <Link href={props.href} className="block outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-2xl">
        <KpiCardInner {...props} />
      </Link>
    );
  }
  return <KpiCardInner {...props} />;
}