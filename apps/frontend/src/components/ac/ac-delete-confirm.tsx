import { AlertTriangle } from "lucide-react";
import type { AirConditioningUnit } from "../../types/fleet";

type Props = {
  unit: AirConditioningUnit;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
};

export function AcDeleteConfirm({ unit, onConfirm, onCancel, loading }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onCancel(); }}
    >
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0f1623]">
        <div className="px-6 pb-4 pt-5">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-500/10">
            <AlertTriangle size={18} className="text-rose-500" />
          </div>
          <h3 className="text-base font-bold text-gray-800 dark:text-white">Eliminar unidad A/C</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            La unidad y todos sus mantenimientos asociados saldrán del sistema.
          </p>
        </div>

        <div className="mx-6 mb-5 rounded-xl border border-gray-100 bg-gray-50 p-3.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
          {[
            { label: "Código",   value: unit.code },
            { label: "Nombre",   value: unit.name },
            { label: "Marca",    value: unit.brand || "—" },
            { label: "Estado",   value: unit.status },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-1">
              <span className="text-xs text-gray-400 dark:text-gray-500">{label}</span>
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{value}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-xl border border-gray-200 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-100 disabled:opacity-50 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/10"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-xl bg-rose-500 py-2 text-sm font-semibold text-white transition hover:bg-rose-600 active:scale-95 disabled:opacity-60"
          >
            {loading ? "Eliminando..." : "Eliminar unidad"}
          </button>
        </div>
      </div>
    </div>
  );
}
