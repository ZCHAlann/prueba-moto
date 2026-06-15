// pages/Mantenimientos/components/MaintenanceListTab.tsx
// Tabla genérica con light/dark theme completo.

import { useMemo, useState } from "react";
import { Search, ChevronLeft, ChevronRight, Plus, Download, Pencil, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useAuth } from "../../../context/AuthContext";
import { usePermissions } from "../../../hooks/usePermissions";
import {
  useMaintenancesList,
  useDeleteMaintenance,
  type Maintenance,
  type MaintenanceCategory,
  type MaintenanceStatus,
  type MaintenanceType,
} from "../../../hooks/useMaintenancesV2";
import { MaintenanceFormModal } from "./MaintenanceFormModal";

const PAGE_SIZE = 7;

const STATUS_CFG: Record<MaintenanceStatus, { label: string; cls: string; dot: string }> = {
  Programado:        { label: "Programado",         cls: "text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-500/10 border-violet-200 dark:border-violet-500/20",   dot: "bg-violet-500 dark:bg-violet-400"  },
  "En curso":        { label: "En curso",           cls: "text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-500/10 border-sky-200 dark:border-sky-500/20",                     dot: "bg-sky-500 dark:bg-sky-400"        },
  PendienteAtencion: { label: "Pendiente atención", cls: "text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20",               dot: "bg-rose-500 dark:bg-rose-400"      },
  Completado:        { label: "Completado",         cls: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20", dot: "bg-emerald-500 dark:bg-emerald-400" },
  Cancelado:         { label: "Cancelado",          cls: "text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-white/[0.04] border-gray-200 dark:border-white/[0.08]",             dot: "bg-gray-400"                       },
};

const TYPE_CFG: Record<MaintenanceType, { label: string; cls: string }> = {
  Preventivo: { label: "Preventivo", cls: "text-sky-700 dark:text-sky-300"       },
  Correctivo: { label: "Correctivo", cls: "text-orange-700 dark:text-orange-300" },
  Programado: { label: "Programado", cls: "text-violet-700 dark:text-violet-300" },
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtMoney(n: number | string | null | undefined) {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(v);
}

interface Props {
  categories?: MaintenanceCategory[];
  title?: string;
}

const selectCls =
  "px-2.5 py-2 rounded-lg bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.06] text-sm text-gray-700 dark:text-white focus:outline-none focus:border-violet-400 dark:focus:border-violet-500/50 transition";

export function MaintenanceListTab({ categories, title }: Props) {
  const { companyId } = useAuth();
  const { can } = usePermissions();
  const canCreate = can("maintenance", "execution", "crear");
  const canEdit   = can("maintenance", "execution", "editar");
  const canDelete = can("maintenance", "records", "eliminar");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<MaintenanceStatus | "">("");
  const [typeFilter, setTypeFilter] = useState<MaintenanceType | "">("");

  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    if (statusFilter) f.status = statusFilter;
    if (typeFilter)   f.type   = typeFilter;
    if (categories && categories.length === 1) f.category = categories[0]!;
    if (search) f.q = search;
    return f;
  }, [statusFilter, typeFilter, categories, search]);

  const { data, isLoading } = useMaintenancesList(filters);
  const allRows = data?.data ?? [];
  const rows = useMemo(() => {
    if (!categories || categories.length <= 1) return allRows;
    return allRows.filter((r) => categories.includes(r.category));
  }, [allRows, categories]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows   = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Maintenance | null>(null);
  const delMut = useDeleteMaintenance();

  const onDelete = async (m: Maintenance) => {
    if (!confirm(`¿Eliminar el mantenimiento "${m.title}"?`)) return;
    try {
      await delMut.mutateAsync(m.id);
      toast.success("Mantenimiento eliminado");
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <motion.div
      key={title}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="flex flex-col gap-4"
    >
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white">{title}</h3>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {/* Search */}
          <div className="relative flex-1 sm:flex-none">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input
              placeholder="Buscar…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full sm:w-56 pl-7 pr-2.5 py-2 rounded-lg bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.06] text-sm text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:border-violet-400 dark:focus:border-violet-500/50 focus:ring-1 focus:ring-violet-400/20 dark:focus:ring-violet-500/20 transition"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as MaintenanceStatus | ""); setPage(1); }}
            className={selectCls}
          >
            <option value="">Todos los estados</option>
            {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value as MaintenanceType | ""); setPage(1); }}
            className={selectCls}
          >
            <option value="">Todos los tipos</option>
            {Object.entries(TYPE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>

          <button
            onClick={async () => {
              const { generateMaintenanceListPdf } = await import("../../../components/features/pdf/MaintenanceListPdf");
              const blob = await generateMaintenanceListPdf(
                rows,
                { from: new Date().toISOString().slice(0, 10), to: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10) },
              );
              const url = URL.createObjectURL(blob);
              window.open(url, "_blank");
              setTimeout(() => URL.revokeObjectURL(url), 60_000);
            }}
            className="px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.06] text-sm flex items-center gap-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.04] bg-white dark:bg-transparent transition"
          >
            <Download size={13} /> PDF
          </button>

          {canCreate && (
            <button
              onClick={() => { setEditing(null); setModalOpen(true); }}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400 text-white flex items-center gap-1.5 transition"
            >
              <Plus size={13} /> Nuevo
            </button>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#0f1320] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-gray-50 dark:bg-white/[0.02] text-[10px] uppercase tracking-widest text-gray-400 dark:text-gray-500">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Fecha</th>
                <th className="text-left px-4 py-3 font-semibold">Vehículo</th>
                <th className="text-left px-4 py-3 font-semibold">Título</th>
                <th className="text-left px-4 py-3 font-semibold">Tipo</th>
                <th className="text-left px-4 py-3 font-semibold">Estado</th>
                <th className="text-left px-4 py-3 font-semibold">Taller</th>
                <th className="text-right px-4 py-3 font-semibold">Costo</th>
                <th className="">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8} className="text-center py-10 text-gray-400 dark:text-gray-500 text-xs">Cargando…</td></tr>
              )}
              {!isLoading && pageRows.length === 0 && (
                <tr><td colSpan={8} className="text-center py-10 text-gray-400 dark:text-gray-500 text-xs">Sin mantenimientos.</td></tr>
              )}
              {pageRows.map((m, i) => {
                const st = STATUS_CFG[m.status];
                const ty = TYPE_CFG[m.type];
                return (
                  <tr
                    key={m.id}
                    className={`border-t border-gray-100 dark:border-white/[0.04] hover:bg-gray-50 dark:hover:bg-white/[0.02] transition ${
                      i % 2 === 1 ? "bg-gray-50/50 dark:bg-white/[0.015]" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{fmtDate(m.scheduledFor)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800 dark:text-white">{m.assetPlate ?? "—"}</div>
                      <div className="text-[11px] text-gray-400 dark:text-gray-500">{m.assetName}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-200 max-w-[220px] truncate">{m.title}</td>
                    <td className={`px-4 py-3 font-medium text-xs ${ty.cls}`}>{ty.label}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${st.cls}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 dark:text-gray-400 text-xs">{m.workshopName ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-200 font-medium">{fmtMoney(m.totalCost)}</td>
                    <td className="px-4 py-3 shadow-[-4px_0_6px_-1px_rgba(0,0,0,0.04)] dark:shadow-[-4px_0_6px_-1px_rgba(0,0,0,0.5)]">
                      <div className="flex justify-end gap-1">
                        {canEdit && (
                          <button
                            onClick={() => { setEditing(m); setModalOpen(true); }}
                            className="p-1.5 rounded-md text-violet-600 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition"
                            title="Editar"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => onDelete(m)}
                            className="p-1.5 rounded-md text-rose-500 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition"
                            title="Eliminar"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 dark:border-white/[0.04] text-xs text-gray-400 dark:text-gray-500">
          <div>Mostrando {pageRows.length} de {rows.length}</div>
          <div className="flex items-center gap-1">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-white/[0.04] disabled:opacity-30"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-2">Página {page} / {totalPages}</span>
            <button
              disabled={page === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-white/[0.04] disabled:opacity-30"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      <MaintenanceFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        prefill={null}
        maintenance={editing}
      />
    </motion.div>
  );
}