export interface ActivityItem {
  title: string;
  description: string;
  time: string;
  tone: "emerald" | "amber" | "rose" | "sky";
}

const dotColor: Record<string, string> = {
  emerald: "bg-success-500",
  amber:   "bg-warning-500",
  rose:    "bg-error-500",
  sky:     "bg-brand-500",
};

interface ActivityFeedProps {
  items: ActivityItem[];
}

export function ActivityFeed({ items }: ActivityFeedProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl dark:bg-white/[0.03] p-8 text-center">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Sin actividad reciente</p>
        <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
          Los eventos aparecerán cuando se creen vehículos, conductores o mantenimientos.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <article
          key={`${item.title}-${item.time}`}
          className="rounded-2xl bg-white p-4 dark:bg-white/[0.03]"
        >
          <div className="flex gap-3">
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dotColor[item.tone] ?? "bg-gray-400"}`} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">{item.title}</h3>
                <span className="text-xs text-gray-400 dark:text-gray-500">{item.time}</span>
              </div>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{item.description}</p>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}