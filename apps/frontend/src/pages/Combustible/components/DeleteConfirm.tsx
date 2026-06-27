import { AlertTriangle } from "lucide-react";
import type { ApiFuelEntry } from "../../../hooks/useFuel";

type Props = {
  entry: ApiFuelEntry;
  assets: Array<{ id: string; plate: string; brand?: string | null; model?: string | null }>;
  onConfirm: () => void;
  onCancel: () => void;
};

function fmtDate(ymd: string) {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  const months = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return `${d} ${months[Number(m) - 1]} ${y}`;
}

export function DeleteConfirm({ entry, assets, onConfirm, onCancel }: Props) {
  const asset = assets.find((a) => a.id === entry.assetId);
  const plate = asset?.plate?.trim() || "—";
  const unit  = asset ? `${asset.brand ?? ""} ${asset.model ?? ""}`.trim() : "";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0d1320]">
        {/* Accent line */}
        <div className="h-0.5 w-full bg-rose-500" />

        <div className="px-6 pb-4 pt-5">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-500/10">
            <AlertTriangle size={18} className="text-rose-500" />
          </div>

          <h3 className="text-base font-bold text-gray-800 dark:text-white">
            Eliminar registro de combustible
          </h3>

          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            ¿Seguro que deseas eliminar la carga del{" "}
            <span className="font-semibold text-gray-700 dark:text-gray-200">
              {fmtDate(entry.date)}
            </span>{" "}
            para{" "}
            <span className="font-semibold text-gray-700 dark:text-gray-200">
              {plate}{unit ? ` — ${unit}` : ""}
            </span>
            ? Esta acción no se puede deshacer.
          </p>

          {/* Mini resumen */}
          <div className="mt-4 grid grid-cols-3 divide-x divide-gray-100 rounded-xl border border-gray-100 bg-gray-50 dark:divide-white/[0.06] dark:border-white/[0.06] dark:bg-white/[0.03]">
            <div className="px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Galones</p>
              <p className="mt-0.5 text-sm font-black text-gray-700 dark:text-white">
                {entry.gallons.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} gal
              </p>
            </div>
            <div className="px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Costo</p>
              <p className="mt-0.5 text-sm font-black text-gray-700 dark:text-white">
                {entry.cost.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
              </p>
            </div>
            <div className="px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Estación</p>
              <p className="mt-0.5 truncate text-sm font-black text-gray-700 dark:text-white">
                {entry.station || "—"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-gray-200 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-100 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.06]"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-rose-500 py-2 text-sm font-semibold text-white transition hover:bg-rose-600 active:scale-95"
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}