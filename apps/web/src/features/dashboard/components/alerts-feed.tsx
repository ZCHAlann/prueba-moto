"use client";

import type { AlertItem } from "@/types/dashboard";

const severityStyles: Record<string, string> = {
  Alta: "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-400",
  Media: "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400",
  Baja: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400",
};

interface AlertsFeedProps {
  items: AlertItem[];
}

export function AlertsFeed({ items }: AlertsFeedProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-white border border-gray-200 dark:border-gray-100 dark:bg-white/[0.03] p-8 text-center">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Sin alertas recientes</p>
        <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
          Cuando existan vencimientos o novedades se mostrarán aquí.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((alert) => (
        <article
          key={`${alert.title}-${alert.time}`}
          className="rounded-2xl bg-white p-4 dark:bg-white/[0.03]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">{alert.title}</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{alert.description}</p>
            </div>
            <span className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${severityStyles[alert.severity]}`}>
              {alert.severity}
            </span>
          </div>
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">{alert.time}</p>
        </article>
      ))}
    </div>
  );
}