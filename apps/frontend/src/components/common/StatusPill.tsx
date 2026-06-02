type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const statusToneStyles: Record<StatusTone, string> = {
  success: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20",
  warning: "bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20",
  danger:  "bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20",
  info:    "bg-sky-50 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:ring-sky-500/20",
  neutral: "bg-neutral-100 text-neutral-700 ring-1 ring-neutral-200 dark:bg-white/[0.05] dark:text-gray-400 dark:ring-white/10",
};

export function StatusPill({ label, tone = "neutral" }: { label: string; tone?: StatusTone }) {
  return (
    <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-semibold ${statusToneStyles[tone]}`}>
      {label}
    </span>
  );
}