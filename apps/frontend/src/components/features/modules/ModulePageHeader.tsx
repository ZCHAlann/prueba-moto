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
        <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            <span className="text-xs font-medium text-blue-700 dark:text-blue-400">{badge}</span>
        </div>
        <h2 className="mt-2 text-xl font-semibold text-gray-800 dark:text-white/90">{title}</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
      </div>
      {action && (
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">{action}</div>
      )}
    </div>
  );
}