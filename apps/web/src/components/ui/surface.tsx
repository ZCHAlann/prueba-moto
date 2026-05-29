import type { ReactNode } from "react";

/* ─── SurfaceCard ─────────────────────────────────────────────────────────── */
type SurfaceCardProps = {
  children: ReactNode;
  className?: string;
};

export function SurfaceCard({ children, className = "" }: SurfaceCardProps) {
  return (
    <article
      className={[
        "app-surface-card",
        "rounded-xl border border-gray-200 bg-white",
        "shadow-theme-sm",
        "dark:border-gray-700 dark:bg-gray-800",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </article>
  );
}

/* ─── SectionHeading ──────────────────────────────────────────────────────── */
type SectionHeadingProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function SectionHeading({ title, description, action }: SectionHeadingProps) {
  return (
    <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 sm:flex-row sm:items-start sm:justify-between dark:border-gray-700">
      <div>
        <h2 className="text-base font-semibold text-gray-800 dark:text-white">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* ─── StatCard ────────────────────────────────────────────────────────────── */
type StatCardTone = "neutral" | "success" | "warning" | "danger" | "info";

const statBadgeStyles: Record<StatCardTone, string> = {
  neutral: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  success: "bg-success-50 text-success-700 ring-1 ring-success-200 dark:bg-success-900/20 dark:text-success-400 dark:ring-success-800",
  warning: "bg-warning-50 text-warning-700 ring-1 ring-warning-200 dark:bg-warning-900/20 dark:text-warning-400 dark:ring-warning-800",
  danger:  "bg-error-50 text-error-700 ring-1 ring-error-200 dark:bg-error-900/20 dark:text-error-400 dark:ring-error-800",
  info:    "bg-brand-50 text-brand-700 ring-1 ring-brand-200 dark:bg-brand-900/20 dark:text-brand-400 dark:ring-brand-800",
};

const statValueStyles: Record<StatCardTone, string> = {
  neutral: "text-gray-900 dark:text-white",
  success: "text-success-700 dark:text-success-300",
  warning: "text-warning-700 dark:text-warning-300",
  danger:  "text-error-700 dark:text-error-300",
  info:    "text-brand-700 dark:text-brand-300",
};

type StatCardProps = {
  label: string;
  value: string;
  detail: string;
  tone?: StatCardTone;
};

export function StatCard({ label, value, detail, tone = "neutral" }: StatCardProps) {
  return (
    <SurfaceCard className={`stat-card stat-card-${tone} p-5`}>
      <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ${statBadgeStyles[tone]}`}>
        {label}
      </span>
      <p className={`mt-3 text-3xl font-bold leading-none ${statValueStyles[tone]}`}>{value}</p>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{detail}</p>
    </SurfaceCard>
  );
}

/* ─── EmptyState ──────────────────────────────────────────────────────────── */
type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="px-4 py-12 text-center">
      <p className="text-base font-semibold text-gray-800 dark:text-white">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500 dark:text-gray-400">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}