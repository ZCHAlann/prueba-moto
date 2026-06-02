import { ChevronLeft, ChevronRight } from "lucide-react";

interface PlatformPaginationProps {
  page: number;
  total: number;
  pageSize: number;
  onChange: (p: number) => void;
}

export function PlatformPagination({ page, total, pageSize, onChange }: PlatformPaginationProps) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;

  const pageNumbers = Array.from({ length: pages }, (_, i) => i + 1)
    .filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 1)
    .reduce<(number | "…")[]>((acc, p, i, arr) => {
      if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
      acc.push(p);
      return acc;
    }, []);

  return (
    <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 dark:border-white/[0.06]">
      <span className="text-xs text-gray-400 dark:text-gray-500">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total} registros
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200
            text-gray-400 transition hover:bg-gray-50 disabled:opacity-30
            dark:border-white/[0.08] dark:hover:bg-white/[0.04]"
        >
          <ChevronLeft size={13} />
        </button>

        {pageNumbers.map((p, i) =>
          p === "…" ? (
            <span key={`e-${i}`} className="px-1 text-xs text-gray-400">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p as number)}
              className={`flex h-7 w-7 items-center justify-center rounded-lg border text-xs font-semibold transition
                ${page === p
                  ? "border-brand-500 bg-brand-500 text-white"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.04]"
                }`}
            >
              {p}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page === pages}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200
            text-gray-400 transition hover:bg-gray-50 disabled:opacity-30
            dark:border-white/[0.08] dark:hover:bg-white/[0.04]"
        >
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}