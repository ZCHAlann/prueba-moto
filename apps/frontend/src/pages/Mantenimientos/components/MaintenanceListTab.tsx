// pages/Mantenimientos/components/MaintenanceListTab.tsx
// Tabla genérica con light/dark theme completo.

import { useMemo, useState } from "react";
import { Search, ChevronLeft, ChevronRight, Plus, Download, Pencil, Trash2, X, Wrench, AlertTriangle, Droplet, Cog, Package } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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

const TYPE_CFG: Record<MaintenanceType, { label: string; cls: string; rowAccent: string }> = {
  Preventivo:  { label: "Preventivo",  cls: "text-sky-700 dark:text-sky-300",        rowAccent: "border-l-sky-500"       },
  Correctivo:  { label: "Correctivo",  cls: "text-orange-700 dark:text-orange-300",  rowAccent: "border-l-orange-500"    },
  Programado:  { label: "Programado",  cls: "text-violet-700 dark:text-violet-300",  rowAccent: "border-l-violet-500"    },
};

const CATEGORY_CFG: Record<MaintenanceCategory, { label: string; icon: React.ReactNode; cls: string }> = {
  "Primordial:Bombas":     { label: "Primordial · Bombas",  icon: <AlertTriangle size={12} />, cls: "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10"        },
  "Primordial:Motores":    { label: "Primordial · Motores", icon: <Cog size={12} />,           cls: "text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-500/10"            },
  "Aceite:Cambio":         { label: "Aceite · Cambio",      icon: <Droplet size={12} />,       cls: "text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-500/10"  },
  "Aceite:Inventario":     { label: "Aceite · Inventario",  icon: <Droplet size={12} />,       cls: "text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-500/10"  },
  "Otro":                  { label: "Otro",                  icon: <Wrench size={12} />,        cls: "text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-white/[0.04]"          },
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
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
  // Filtros de chips (lo que el user ve arriba de la tabla)
  const [subTab, setSubTab]   = useState<"all" | MaintenanceStatus>("all");
  const [catChip, setCatChip] = useState<"all" | MaintenanceCategory>("all");

  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    if (subTab !== "all") f.status = subTab;
    if (catChip !== "all") f.category = catChip;
    if (search) f.q = search;
    return f;
  }, [subTab, catChip, search]);

  const { data, isLoading } = useMaintenancesList(filters);
  const allRows = data?.data ?? [];
  const rows = useMemo(() => {
    if (!categories || categories.length <= 1) return allRows;
    return allRows.filter((r) => categories.includes(r.category));
  }, [allRows, categories]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows   = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing]     = useState<Maintenance | null>(null);
  const [detailItem, setDetailItem] = useState<Maintenance | null>(null);
  const delMut = useDeleteMaintenance();

  const onDelete = async (m: Maintenance) => {
    if (!confirm(`¿Eliminar el mantenimiento "${m.title}"?`)) return;
    try {
      await delMut.mutateAsync(m.id);
      toast.success("Mantenimiento eliminado");
    } catch (e) { toast.error((e as Error).message); }
  };

  // Chips de categoría — todos los disponibles en el árbol + "Todos"
  const categoryChips: Array<{ id: "all" | MaintenanceCategory; label: string; icon: React.ReactNode }> = [
    { id: "all",                   label: "Todas las categorías", icon: <Package size={12} /> },
    { id: "Primordial:Bombas",     label: "Primordial · Bombas",  icon: <AlertTriangle size={12} /> },
    { id: "Primordial:Motores",    label: "Primordial · Motores", icon: <Cog size={12} /> },
    { id: "Aceite:Cambio",         label: "Aceite · Cambio",      icon: <Droplet size={12} /> },
    { id: "Aceite:Inventario",     label: "Aceite · Inventario",  icon: <Droplet size={12} /> },
    { id: "Otro",                  label: "Otro",                  icon: <Wrench size={12} /> },
  ];

  return (
    <motion.div
      key={title}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="flex flex-col gap-4"
    >
      {/* ── Fila 1: chips de estado ── */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Estado</span>
        {([
          { id: "all",               label: "Todos"               },
          { id: "Programado",        label: "Programados"         },
          { id: "En curso",          label: "En curso"            },
          { id: "PendienteAtencion", label: "Pendiente atención"  },
          { id: "Completado",        label: "Completados"         },
          { id: "Cancelado",         label: "Cancelados"          },
        ] as const).map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => { setSubTab(opt.id); setPage(1); }}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              subTab === opt.id
                ? "bg-blue-600 text-white shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* ── Fila 2: chips de categoría ── */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Categoría</span>
        {categoryChips.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => { setCatChip(opt.id); setPage(1); }}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
              catChip === opt.id
                ? "bg-blue-600 text-white shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"
            }`}
          >
            {opt.icon}
            {opt.label}
          </button>
        ))}
      </div>

      {/* ── Toolbar ── */}
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

      {/* ── Tabla ── */}
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
                <th className="text-left px-4 py-3 font-semibold">Categoría</th>
                <th className="text-left px-4 py-3 font-semibold">Taller</th>
                <th className="text-right px-4 py-3 font-semibold">Costo</th>
                <th className="">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={9} className="text-center py-10 text-gray-400 dark:text-gray-500 text-xs">Cargando…</td></tr>
              )}
              {!isLoading && pageRows.length === 0 && (
                <tr><td colSpan={9} className="text-center py-10 text-gray-400 dark:text-gray-500 text-xs">Sin mantenimientos.</td></tr>
              )}
              {pageRows.map((m, i) => {
                const st = STATUS_CFG[m.status];
                const ty = TYPE_CFG[m.type];
                const cat = CATEGORY_CFG[m.category] ?? CATEGORY_CFG["Otro"];
                return (
                  <tr
                    key={m.id}
                    onClick={() => setDetailItem(m)}
                    className={`border-t border-gray-100 dark:border-white/[0.04] border-l-4 ${ty.rowAccent} cursor-pointer transition ${
                      i % 2 === 1 ? "bg-gray-50/50 dark:bg-white/[0.015]" : ""
                    } hover:bg-blue-50/40 dark:hover:bg-white/[0.04]`}
                  >
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{fmtDate(m.scheduledFor)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800 dark:text-white">{m.assetPlate ?? "—"}</div>
                      <div className="text-[11px] text-gray-400 dark:text-gray-500">{m.assetName}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-200 max-w-[220px] truncate">{m.title ?? "—"}</td>
                    <td className={`px-4 py-3 font-medium text-xs ${ty.cls}`}>{ty.label}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${st.cls}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${cat.cls}`}>
                        {cat.icon}
                        {cat.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 dark:text-gray-400 text-xs">{m.workshopName ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-200 font-medium">{fmtMoney(m.totalCost)}</td>
                    <td className="px-4 py-3 shadow-[-4px_0_6px_-1px_rgba(0,0,0,0.04)] dark:shadow-[-4px_0_6px_-1px_rgba(0,0,0,0.5)]" onClick={(e) => e.stopPropagation()}>
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
                        {canDelete && m.status !== "Completado" && (
                          <button
                            onClick={() => onDelete(m)}
                            className="p-1.5 rounded-md text-rose-500 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition"
                            title="Eliminar"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                        {canDelete && m.status === "Completado" && (
                          <span
                            className="p-1.5 text-gray-300 dark:text-gray-600 cursor-not-allowed"
                            title="Los mantenimientos completados no se pueden eliminar"
                          >
                            <Trash2 size={13} />
                          </span>
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

      {/* ── Drawer de detalle ── */}
      <MaintenanceDetailDrawer
        item={detailItem}
        onClose={() => setDetailItem(null)}
        onEdit={(m) => { setDetailItem(null); setEditing(m); setModalOpen(true); }}
      />
    </motion.div>
  );
}

// ─── Drawer de detalle ─────────────────────────────────────────────────────────

function MaintenanceDetailDrawer({
  item, onClose, onEdit,
}: {
  item: Maintenance | null;
  onClose: () => void;
  onEdit: (m: Maintenance) => void;
}) {
  return (
    <AnimatePresence>
      {item && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl dark:bg-gray-900"
          >
            {(() => {
              const st = STATUS_CFG[item.status];
              const ty = TYPE_CFG[item.type];
              const cat = CATEGORY_CFG[item.category] ?? CATEGORY_CFG["Otro"];
              return (
                <div className="flex h-full flex-col">
                  {/* Header con accent lateral del tipo */}
                  <div className={`relative border-l-4 ${ty.rowAccent} px-5 py-4 border-b border-gray-200 dark:border-white/[0.06]`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${st.cls}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                            {st.label}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${cat.cls}`}>
                            {cat.icon}
                            {cat.label}
                          </span>
                          <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${ty.cls} bg-gray-50 dark:bg-white/[0.04]`}>
                            {ty.label}
                          </span>
                        </div>
                        <h2 className="mt-2 text-lg font-bold text-gray-800 dark:text-white">
                          {item.title ?? "Mantenimiento"}
                        </h2>
                        <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500 font-mono">
                          #{item.id}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={onClose}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-sm">
                    <Section title="Vehículo">
                      <Row label="Placa" value={item.assetPlate ?? "—"} />
                      <Row label="Nombre" value={item.assetName ?? "—"} />
                    </Section>

                    <Section title="Programación">
                      <Row label="Programado para"  value={fmtDateTime(item.scheduledFor)} />
                      <Row label="Ejecutado"        value={fmtDateTime(item.executedAt)} />
                      <Row label="Completado"       value={fmtDateTime(item.completedAt)} />
                      <Row label="Odómetro"         value={item.odometerKm != null ? `${item.odometerKm.toLocaleString("es-CO")} km` : "—"} />
                      <Row label="Cadencia"         value={
                        item.cadenceKind === "km_based"
                          ? `Por km${item.cadenceValue ? ` · cada ${item.cadenceValue.toLocaleString("es-CO")} km` : ""}`
                          : item.cadenceKind === "days"
                            ? `Por días${item.cadenceValue ? ` · cada ${item.cadenceValue} días` : ""}`
                            : item.cadenceKind === "monthly" ? "Mensual"
                            : item.cadenceKind === "weekly"  ? "Semanal"
                            : "Sin cadencia"
                      } />
                      {item.nextTriggerKm != null && (
                        <Row label="Próximo trigger" value={`${item.nextTriggerKm.toLocaleString("es-CO")} km`} />
                      )}
                    </Section>

                    <Section title="Ejecución">
                      <Row label="Taller"     value={item.workshopName ?? "—"} />
                      <Row label="Creado por" value={item.createdBy ?? "—"} />
                      <Row label="Completado por" value={item.completedBy ?? "—"} />
                    </Section>

                    {item.description && (
                      <Section title="Descripción">
                        <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-700 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-gray-200 whitespace-pre-wrap">
                          {item.description}
                        </p>
                      </Section>
                    )}

                    {item.notes && (
                      <Section title="Notas">
                        <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-700 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-gray-200 whitespace-pre-wrap">
                          {item.notes}
                        </p>
                      </Section>
                    )}

                    {item.items && item.items.length > 0 && (
                      <Section title={`Repuestos / Items (${item.items.length})`}>
                        <ul className="divide-y divide-gray-100 dark:divide-white/[0.05] rounded-lg border border-gray-200 dark:border-white/[0.06] overflow-hidden">
                          {item.items.map((it) => (
                            <li key={it.id} className="flex items-start gap-3 px-3 py-2.5 text-xs">
                              {it.photoUrl ? (
                                <img src={it.photoUrl} alt={it.name} className="h-10 w-10 rounded-md object-cover" />
                              ) : (
                                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-100 text-gray-400 dark:bg-white/[0.04]">
                                  <Package size={14} />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-800 dark:text-white truncate">{it.name}</p>
                                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                                  {it.supplierName ? `${it.supplierName} · ` : ""}{it.quantity} × {fmtMoney(it.unitCost)}
                                </p>
                              </div>
                              <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap">
                                {fmtMoney(it.subtotal)}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </Section>
                    )}

                    <Section title="Costo">
                      <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 dark:border-violet-500/20 dark:bg-violet-500/10">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-violet-700 dark:text-violet-300">Total</p>
                        <p className="mt-0.5 text-xl font-bold text-violet-700 dark:text-violet-200">{fmtMoney(item.totalCost)}</p>
                      </div>
                    </Section>

                    <Section title="Auditoría">
                      <Row label="Creado"  value={fmtDateTime(item.createdAt)} />
                      <Row label="Actualizado" value={fmtDateTime(item.updatedAt)} />
                    </Section>
                  </div>

                  {/* Footer */}
                  <div className="flex justify-end gap-2 border-t border-gray-200 dark:border-white/[0.06] px-5 py-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-lg border border-gray-200 dark:border-white/[0.06] px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition"
                    >
                      Cerrar
                    </button>
                    {item.status !== "Completado" && (
                      <button
                        type="button"
                        onClick={() => onEdit(item)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400 px-4 py-2 text-xs font-medium text-white transition"
                      >
                        <Pencil size={13} /> Editar
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">{title}</p>
      <div className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] divide-y divide-gray-100 dark:divide-white/[0.04]">
        {children}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2 text-xs">
      <span className="shrink-0 text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-right text-gray-800 dark:text-white">{value}</span>
    </div>
  );
}
