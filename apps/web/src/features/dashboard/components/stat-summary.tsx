"use client";

interface StatItem {
  label: string;
  value: number | string;
  detail: string;
  icon: React.ReactNode;
}

interface StatSummaryProps {
  items: StatItem[];
}

export type { StatItem };

export function StatSummary({ items }: StatSummaryProps) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      {items.map((stat) => (
        <article
          key={stat.label}
          className="rounded-2xl bg-white p-5 dark:bg-white/[0.03] md:p-6"
        >
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 mb-5">
            {stat.icon}
          </div>
          <span className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</span>
          <h4 className="mt-2 text-3xl font-bold text-gray-800 dark:text-white/90">{stat.value}</h4>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{stat.detail}</p>
        </article>
      ))}
    </div>
  );
}