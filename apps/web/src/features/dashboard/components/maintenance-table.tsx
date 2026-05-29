"use client";

import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Badge from "@/components/ui/badge";
import { useMaintenances } from "@/hooks/useMaintenances";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Search, CheckCircle, Loader2 } from "lucide-react";

function getStatusColor(status: string): "success" | "warning" | "error" | "info" {
  if (status.includes("Completado")) return "success";
  if (status.includes("Emergente"))  return "error";
  if (status.includes("Pendiente"))  return "warning";
  if (status.includes("En proceso")) return "info";
  return "info";
}

export function MaintenanceTable() {
  const { maintenances, loading: hookLoading, completeMaintenance } = useMaintenances();

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
    setConfirming({ id: m.id, asset: m.assetId, service: `${m.title} (${m.kind})` });
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
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 pb-3 pt-4 dark:border-gray-200 dark:bg-white/[0.03] sm:px-6">

        <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Próximos mantenimientos
          </h3>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar mantenimiento..."
                className="h-9 w-52 rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-3 text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 dark:border-gray-200 dark:bg-white/[0.03] dark:text-gray-300 dark:placeholder-gray-500 dark:focus:border-brand-500 dark:focus:ring-brand-500/20 transition-all"
              />
            </div>
            <button className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] transition-colors">
              Ver todos
            </button>
          </div>
        </div>

        <div className="max-w-full overflow-x-auto">
          <Table>
            <TableHeader className="border-gray-100 dark:border-gray-300 border-y">
              <TableRow>
                <TableCell isHeader className="w-10 py-3" />
                <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">Unidad</TableCell>
                <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">Servicio</TableCell>
                <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">Fecha</TableCell>
                <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">Estado</TableCell>
              </TableRow>
            </TableHeader>

            <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
              {hookLoading ? (
                <TableRow>
                  <TableCell className="py-12 text-center" colSpan={5}>
                    <div className="flex items-center justify-center gap-2 text-gray-400">
                      <Loader2 size={16} className="animate-spin" />
                      <span className="text-sm">Cargando mantenimientos...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell className="py-12 text-center" colSpan={5}>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      {search ? "Sin resultados para tu búsqueda" : "Sin mantenimientos programados"}
                    </p>
                    <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
                      {search ? "Intenta con otro término." : "Las próximas órdenes aparecerán cuando se registren desde el módulo de mantenimiento."}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((m) => {
                  const done = completedIds.has(m.id);
                  return (
                    <TableRow key={m.id} className={done ? "opacity-50" : ""}>
                      <TableCell className="py-3 w-10">
                        <button
                          type="button"
                          onClick={() => handleCheck(m)}
                          disabled={done}
                          title={done ? "Ya completado" : "Marcar como realizado"}
                          aria-label="Marcar mantenimiento como realizado"
                          className="flex h-5 w-5 items-center justify-center rounded border-2 transition-colors disabled:cursor-not-allowed border-gray-300 hover:border-green-400 dark:border-gray-600 dark:hover:border-green-500 bg-white dark:bg-transparent"
                        >
                          {done && (
                            <svg viewBox="0 0 10 8" className="w-3 h-3 text-green-500 fill-current">
                              <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>
                      </TableCell>
                      <TableCell className="py-3">
                        <span className="font-medium text-gray-800 text-theme-sm dark:text-white/90">{m.assetId}</span>
                      </TableCell>
                      <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                        {m.title} ({m.kind})
                      </TableCell>
                      <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                        {m.scheduledDate || m.dueDate || "Sin fecha"}
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge size="sm" color={getStatusColor(m.status)}>
                          {m.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {confirming && (
        <ConfirmModal
          title="Marcar como realizado"
          description="¿Confirmas que el siguiente mantenimiento fue completado?"
          icon={<CheckCircle size={24} className="text-green-500" />}
          iconTone="green"
          confirmLabel="Confirmar"
          cancelLabel="Cancelar"
          confirmTone="green"
          hint="Se registrará la fecha de hoy como fecha de completado."
          loading={completing}
          onConfirm={handleConfirm}
          onCancel={() => !completing && setConfirming(null)}
        >
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-white/[0.03]">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Unidad</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-800 dark:text-white/90">{confirming.asset}</p>
            <p className="mt-2 text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Servicio</p>
            <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-300">{confirming.service}</p>
          </div>
        </ConfirmModal>
      )}
    </>
  );
}