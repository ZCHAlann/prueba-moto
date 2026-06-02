export type AlertSeverity = "Alta" | "Media" | "Baja";

export interface AlertItem {
  title: string;
  description: string;
  severity: AlertSeverity;
  time: string;
}

const severityStyles: Record<string, string> = {
  Alta:  "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-400",
  Media: "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400",
  Baja:  "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400",
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
            <span className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${severityStyles[alert.severity]}`}>
              <span className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                alert.severity?.toLowerCase() === "alta"  ? "border-error-500 text-error-500" :
                alert.severity?.toLowerCase() === "media" ? "border-warning-500 text-warning-500" :
                                                            "border-success-500 text-success-500"
              }`}>
                {alert.severity}
              </span>
            </span>
          </div>
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">{alert.time}</p>
        </article>
      ))}
    </div>
  );
}