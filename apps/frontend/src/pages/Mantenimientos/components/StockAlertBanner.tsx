import type { OilType, InventoryItem } from "./types";

interface StockAlertBannerProps {
  lowOils: OilType[];
  lowInventory: InventoryItem[];
  onOilClick: (oil: OilType) => void;
  onInventoryClick: (item: InventoryItem) => void;
}

export function StockAlertBanner({ lowOils, lowInventory, onOilClick, onInventoryClick }: StockAlertBannerProps) {
  const total = lowOils.length + lowInventory.length;
  if (total === 0) return null;

  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-widest text-emerald-500">
            {total} alerta{total !== 1 ? "s" : ""} de stock
          </span>
        </div>
        <div className="h-4 w-px bg-emerald-500/20 shrink-0 hidden sm:block" />
        <div className="flex flex-wrap gap-2">
          {lowOils.map((oil) => (
            <button
              key={oil.id}
              onClick={() => onOilClick(oil)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20"
            >
              <span className="font-mono text-emerald-600">{oil.stock}/{oil.minStock}</span>
              {oil.name}
            </button>
          ))}
          {lowInventory.map((item) => (
            <button
              key={item.id}
              onClick={() => onInventoryClick(item)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-xs font-semibold text-orange-400 transition hover:bg-orange-500/20"
            >
              <span className="font-mono text-orange-600">{item.stock}/{item.minStock}</span>
              {item.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}