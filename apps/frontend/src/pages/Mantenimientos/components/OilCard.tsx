import type { OilType } from "./types";

interface OilTableProps {
  oils: OilType[];
  onEdit?: (oil: OilType) => void;      // ← agregar ?
  onDelete?: (oil: OilType) => void;
  onRegisterChange?: (oil: OilType) => void;
}

function StockBar({ stock, minStock }: { stock: number; minStock: number }) {
  const max = Math.max(minStock * 2, stock, 1);
  const pct = Math.min(100, Math.round((stock / max) * 100));
  const isCritical = stock === 0;
  const isLow = stock <= minStock;
  const color = isCritical ? "bg-rose-500" : isLow ? "bg-amber-400" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/[0.06]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs tabular-nums font-semibold ${isCritical ? "text-rose-400" : isLow ? "text-amber-400" : "text-emerald-400"}`}>
        {stock}
      </span>
    </div>
  );
}

export function OilCard({ oils, onEdit, onDelete, onRegisterChange }: OilTableProps) {
  if (oils.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.07]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06] bg-white/[0.02]">
            <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-white/30">Aceite</th>
            <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-white/30">Viscosidad</th>
            <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-white/30">Aplicación</th>
            <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-white/30">Stock</th>
            <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-white/30">Mín.</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {oils.map((oil) => {
            const isCritical = oil.stock === 0;
            const isLow = oil.stock <= oil.minStock;
            const statusLabel = isCritical ? "Sin stock" : isLow ? "Stock bajo" : "Disponible";
            const statusColor = isCritical
              ? "text-rose-400 bg-rose-500/10 border-rose-500/20"
              : isLow
              ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
              : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";

            return (
              <tr key={oil.id} className="group transition hover:bg-white/[0.02]">
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-white leading-tight">{oil.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/40">{oil.brand}</span>
                      <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${statusColor}`}>
                        {statusLabel}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs font-semibold text-white/70">{oil.viscosity ?? "—"}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-white/60">{oil.application ?? "—"}</span>
                </td>
                <td className="px-4 py-3">
                  <StockBar stock={oil.stock} minStock={oil.minStock} />
                  <span className="mt-0.5 block text-[10px] text-white/25">mín. {oil.minStock} {oil.unit}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-white/40">{oil.unit}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1 opacity-0 transition group-hover:opacity-100">
                    <button
                      onClick={() => onRegisterChange?.(oil)}
                      className="rounded-lg bg-emerald-500 px-2.5 py-1.5 text-[11px] font-bold text-black transition hover:bg-emerald-400"
                    >
                      + Cambio
                    </button>
                    <button
                      onClick={() => onEdit?.(oil)}
                      className="rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[11px] font-semibold text-white/50 transition hover:bg-white/[0.06] hover:text-white"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => onDelete?.(oil)}
                      className="rounded-lg border border-rose-500/20 px-2.5 py-1.5 text-[11px] font-semibold text-rose-500/60 transition hover:bg-rose-500/10 hover:text-rose-400"
                    >
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}