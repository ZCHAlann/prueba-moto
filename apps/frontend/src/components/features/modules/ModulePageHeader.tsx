import type { ReactNode } from "react";
import { accentStyles, type AppAccent } from "../../..//lib/navigation";

type ModulePageHeaderProps = {
  badge: string;
  title: string;
  subtitle: string;
  accent: AppAccent;
  action?: ReactNode;
};

export function ModulePageHeader({ badge, title, subtitle, accent, action }: ModulePageHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
      <div className="max-w-4xl">
        <span className={`inline-flex items-center rounded-lg px-3 py-1 text-xs font-semibold ${accentStyles[accent].pill}`}>
          {badge}
        </span>
        <h2 className="mt-2 text-xl font-semibold text-gray-800 dark:text-white/90">{title}</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
      </div>
      {action && (
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">{action}</div>
      )}
    </div>
  );
}