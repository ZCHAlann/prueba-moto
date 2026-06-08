import { useState, useMemo } from "react";
import { useMaintenances } from "../../hooks/useMaintenances";
import { useAssets } from "../../hooks/useAssets";
import { Search, CheckCircle, Loader2, X } from "lucide-react";

/* ─── Badge ──────────────────────────────────────────────────────────────── */
type BadgeColor = "success" | "warning" | "error" | "info";

const badgeStyles: Record<BadgeColor, string> = {
  success: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400",
  warning: "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400",
  error:   "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-400",
  info:    "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400",
};

function Badge({ color, children }: { color: BadgeColor; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeStyles[color]}`}>
      {children}
    </span>
  );
}

/* ─── ConfirmModal ───────────────────────────────────────────────────────── */
function ConfirmModal({
  title,
  description,
  hint,
  loading,
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  description: string;
  hint?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/50" onClick={() => !loading && onCancel()} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-xl">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50 dark:bg-green-500/10">
              <CheckCircle size={20} className="text-green-500" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">{title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !loading && onCancel()}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X size={18} />
          </button>
        </div>

        {children && <div className="mb-4">{children}</div>}

        {hint && (
          <p className="mb-4 text-xs text-gray-400 dark:text-gray-500">{hint}</p>
        )}

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-transparent dark:text-gray-300 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-60"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function getStatusColor(status: string): BadgeColor {
  if (status.includes("Completado")) return "success";
  if (status.includes("Emergente"))  return "error";
  if (status.includes("Pendiente"))  return "warning";
  if (status.includes("En proceso")) return "info";
  return "info";
}

/* ─── MaintenanceTable ───────────────────────────────────────────────────── */
export function MaintenanceTable() {
  const { maintenances, loading: hookLoading, completeMaintenance } = useMaintenances();
  const { assets } = useAssets();

  const assetLabel = (assetId: string) => {
    const a = assets.find((x) => x.id === assetId);
    return a?.plate || a?.name || assetId;
  };

  const [search, setSearch]         = useState("");
  const [confirming, setConfirming] = useState<{ id: string; asset: string; service: string } | null>(null);
  const [completing, setCompleting] = useState(false);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

  const items = useMemo(() => {
    const q = search.toLowerCase();
    return maintenances
      .filter((m) => m.status !== "Completado")
      .filter((m) =>
        !q ||
        m.title.toLowerCase().includes(q) ||
        m.assetId.toLowerCase().includes(q) ||
        m.kind.toLowerCase().includes(q) ||
        m.responsible.toLowerCase().includes(q)
      );
  }, [maintenances, search]);

  const handleCheck = (m: typeof maintenances[0]) => {
    if (completedIds.has(m.id)) return;
    setConfirming({ id: m.id, asset: assetLabel(m.assetId), service: `${m.title} (${m.kind})` });
  };

  const handleConfirm = async () => {
    if (!confirming) return;
    setCompleting(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      await completeMaintenance(confirming.id, today);
      setCompletedIds((prev) => new Set(prev).add(confirming.id));
      setConfirming(null);
    } catch (err) {
      console.error("Error al completar mantenimiento:", err);
    } finally {
      setCompleting(false);
    }
  };

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-gray-100 dark:border-white/[0.05] bg-white dark:bg-white/[0.02] px-4 pb-3 pt-4 sm:px-6 shadow-sm">
        <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Próximos mantenimientos
          </h3>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="h-8 w-44 rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-3 text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-100 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300 dark:placeholder-gray-500 dark:focus:border-brand-500 transition-all"
              />
            </div>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-400 dark:hover:bg-white/[0.05] transition-colors">
              Ver todos
            </button>
          </div>
        </div>

        <div className="max-w-full overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-y border-gray-100 dark:border-white/[0.05]">
                <th className="w-9 py-2.5" />
                <th className="py-2.5 text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Unidad</th>
                <th className="py-2.5 text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Servicio</th>
                <th className="py-2.5 text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Fecha</th>
                <th className="py-2.5 text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-white/[0.03]">
              {hookLoading ? (
                <tr>
                  <td className="py-10 text-center" colSpan={5}>
                    <div className="flex items-center justify-center gap-2 text-gray-400">
                      <Loader2 size={14} className="animate-spin" />
                      <span className="text-sm">Cargando...</span>
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td className="py-10 text-center" colSpan={5}>
                    <p className="text-sm font-medium text-gray-400 dark:text-gray-500">
                      {search ? "Sin resultados" : "Sin mantenimientos programados"}
                    </p>
                    {!search && (
                      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                        Las órdenes aparecerán cuando se registren desde el módulo de mantenimiento.
                      </p>
                    )}
                  </td>
                </tr>
              ) : (
                items.map((m) => {
                  const done = completedIds.has(m.id);
                  return (
                    <tr key={m.id} className={`group hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors ${done ? "opacity-40" : ""}`}>
                      <td className="py-2.5 w-9">
                        <button
                          type="button"
                          onClick={() => handleCheck(m)}
                          disabled={done}
                          title={done ? "Completado" : "Marcar como realizado"}
                          aria-label="Marcar mantenimiento como realizado"
                          className="flex h-4 w-4 items-center justify-center rounded border-2 transition-colors disabled:cursor-not-allowed border-gray-200 hover:border-green-400 dark:border-gray-600 dark:hover:border-green-500 bg-white dark:bg-transparent"
                        >
                          {done && (
                            <svg viewBox="0 0 10 8" className="w-2.5 h-2.5 text-green-500 fill-current">
                              <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>
                      </td>
                      <td className="py-2.5">
                        <span className="font-medium text-sm text-gray-700 dark:text-white/80">{assetLabel(m.assetId)}</span>
                      </td>
                      <td className="py-2.5 text-sm text-gray-500 dark:text-gray-400">
                        {m.title} <span className="text-gray-400 dark:text-gray-500">({m.kind})</span>
                      </td>
                      <td className="py-2.5 text-sm text-gray-400 dark:text-gray-500">
                        {m.scheduledDate || m.dueDate || "—"}
                      </td>
                      <td className="py-2.5">
                        <Badge color={getStatusColor(m.status)}>
                          {m.status}
                        </Badge>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {confirming && (
        <ConfirmModal
          title="Marcar como realizado"
          description="¿Confirmas que el siguiente mantenimiento fue completado?"
          hint="Se registrará la fecha de hoy como fecha de completado."
          loading={completing}
          onConfirm={handleConfirm}
          onCancel={() => !completing && setConfirming(null)}
        >
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-white/[0.05] dark:bg-white/[0.03]">
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Unidad</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-700 dark:text-white/80">{confirming.asset}</p>
            <p className="mt-2 text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Servicio</p>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{confirming.service}</p>
          </div>
        </ConfirmModal>
      )}
    </>
  );
}