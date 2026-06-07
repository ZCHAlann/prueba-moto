import type { InventoryItem } from "./types";

interface InventoryTableProps {
  items: InventoryItem[];
  onItemClick: (item: InventoryItem) => void;
  onAddItem?: () => void;
}

export function InventoryTable({ items, onItemClick }: InventoryTableProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.03]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-300 dark:text-white/20">
            <path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
            <path d="M16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z" />
          </svg>
        </div>
        <p className="text-sm text-gray-400 dark:text-white/30">Sin repuestos registrados</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100 dark:border-white/[0.05]">
            {["Código", "Nombre", "Categoría", "Stock", "Ubicación", ""].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-white/30">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
          {items.map((item) => {
            const isCritical = item.stock === 0;
            const isLow = item.stock <= item.minStock;

            return (
              <tr key={item.id} onClick={() => onItemClick(item)}
                className="group cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]">
                <td className="px-4 py-3.5">
                  <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-500/80">{item.code}</span>
                </td>
                <td className="px-4 py-3.5">
                  <p className="text-sm font-semibold leading-tight text-gray-800 dark:text-white/90">{item.name}</p>
                </td>
                <td className="px-4 py-3.5">
                  <span className="rounded-lg border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.04] px-2 py-0.5 text-xs text-gray-500 dark:text-white/50">
                    {item.category}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    <div className="relative h-1.5 w-16 overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.08]">
                      <div
                        className={`absolute left-0 top-0 h-full rounded-full transition-all ${isCritical ? "bg-rose-500" : isLow ? "bg-amber-400" : "bg-teal-400"}`}
                        style={{ width: `${Math.min(100, Math.round((item.stock / Math.max(item.minStock * 2, item.stock, 1)) * 100))}%` }}
                      />
                    </div>
                    <span className={`text-sm font-bold tabular-nums ${isCritical ? "text-rose-500 dark:text-rose-400" : isLow ? "text-amber-500 dark:text-amber-400" : "text-gray-700 dark:text-white/80"}`}>
                      {item.stock}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-white/30">{item.unit}</span>
                    {isLow && (
                      <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                        isCritical
                          ? "border-rose-200 dark:border-rose-500/20 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400"
                          : "border-amber-200 dark:border-emerald-500/20 bg-amber-50 dark:bg-emerald-500/10 text-amber-600 dark:text-emerald-400"
                      }`}>
                        {isCritical ? "Agotado" : "Bajo"}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <span className="text-xs text-gray-400 dark:text-white/40">{item.location}</span>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <span className="rounded-lg border border-gray-200 dark:border-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-gray-400 dark:text-white/30 opacity-0 transition group-hover:opacity-100">
                    Ver ficha
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}