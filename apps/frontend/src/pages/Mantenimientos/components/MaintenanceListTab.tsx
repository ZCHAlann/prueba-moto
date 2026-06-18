// pages/Mantenimientos/components/MaintenanceListTab.tsx
// Vista unificada de mantenimientos. Diseño "anterior" con chips de estado y
// categoría. Lógica v3: asignación, eventos (timeline), reprogramación,
// categorías custom, vista dual admin vs operador.
//
// Fix: el selector de Tipo (Correctivo/Programado) en el modal de creación
// ya no se oculta — antes `hideTypeSelector={!editing}` forzaba siempre
// "Programado" al crear desde cualquier chip, incluso desde la pestaña de
// Correctivos. Ahora se muestra siempre y además se precarga con el tipo
// del chip activo (typeChip) para minimizar clicks.

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Search, ChevronLeft, ChevronRight, ChevronDown, Plus, Download, Pencil, Trash2, X,
  Wrench, Package, User as UserIcon, FileDown,
  ClipboardList, Truck, Check,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useAuth } from "../../../context/AuthContext";
import { usePermissions } from "../../../hooks/usePermissions";
import {
  useMaintenancesList,
  useDeleteMaintenance,
  useTakeMaintenance,
  useFinalizeMaintenance,
  useCancelRescheduleMaintenance,
  useMaintenanceCategories,
  type Maintenance,
  type MaintenanceStatus,
  type MaintenanceType,
} from "../../../hooks/useMaintenancesV2";
import { DatePicker } from "../../../components/ui/date-picker/DatePicker";
import { MaintenanceFormModal } from "./MaintenanceFormModal";
import { MaintenanceDetailDrawer } from "./MaintenanceDetailDrawer";
import { ReprogramDialog } from "./ReprogramDialog";

const PAGE_SIZE = 7;

const STATUS_CFG: Record<MaintenanceStatus, { label: string; cls: string; dot: string }> = {
  Programado:    { label: "Programado",   cls: "text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-500/10 border-violet-200 dark:border-violet-500/20",   dot: "bg-violet-500 dark:bg-violet-400" },
  "En proceso":  { label: "En proceso",   cls: "text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-500/10 border-sky-200 dark:border-sky-500/20",                     dot: "bg-sky-500 dark:bg-sky-400"        },
  Completado:    { label: "Completado",   cls: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20", dot: "bg-emerald-500 dark:bg-emerald-400" },
};

const TYPE_CFG: Record<string, { label: string; cls: string; rowAccent: string }> = {
  Correctivo:  { label: "Correctivo",  cls: "text-orange-700 dark:text-orange-300",  rowAccent: "border-l-orange-500"   },
  Programado:  { label: "Programado",  cls: "text-violet-700 dark:text-violet-300",  rowAccent: "border-l-violet-500"   },
  // Preventivo se conserva como fallback para registros legacy (no aparece en UI)
  Preventivo:  { label: "Programado",  cls: "text-violet-700 dark:text-violet-300",  rowAccent: "border-l-violet-500"   },
};

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtMoney(n: number | string | null | undefined) {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(v);
}

function userIdFromSession(sub: string | undefined): number | null {
  if (!sub) return null;
  const m = String(sub).match(/(\d+)$/);
  return m ? Number(m[1]) : null;
}

interface Props {
  title?: string;
}

export function MaintenanceListTab({ title }: Props) {
  const { session, companyId } = useAuth();
  const { can } = usePermissions();
  const meId   = userIdFromSession(session?.sub);
  const meRole = session?.role ?? "";
  const isFullAccess = meRole === "owner_empresa" || meRole === "admin_empresa" || meRole === "supervisor";

  const canCreate = can("maintenance", "execution", "crear");
  const canEdit   = can("maintenance", "execution", "editar");
  const canDelete = can("maintenance", "records", "eliminar");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  // Chips de estado (incluye "all" para Todos)
  const [subTab, setSubTab] = useState<"all" | MaintenanceStatus>("all");
  // Chips de categoría (string libre, "all" = todas)
  const [catChip, setCatChip] = useState<"all" | string>("all");
  // Chips de tipo (incluye "all" para Todos)
  const [typeChip, setTypeChip] = useState<"all" | "Correctivo" | "Programado">("all");

  // Filtros de rango de fechas (compat con lo que ya teníamos)
  const [from, setFrom] = useState<string>("");
  const [to,   setTo]   = useState<string>("");
  // Filtro por vehículo desde query string (?assetId=asset-123)
  const [searchParams, setSearchParams] = useSearchParams();
  const assetIdFromUrl = searchParams.get("assetId") || "";

  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    if (subTab !== "all")   f.status   = subTab;
    if (catChip !== "all")  f.category = catChip;
    if (typeChip !== "all") f.type     = typeChip;
    if (search) f.q = search;
    if (from)   f.from = from;
    if (to)     f.to   = to;
    if (assetIdFromUrl) f.assetId = assetIdFromUrl;
    return f;
  }, [subTab, catChip, typeChip, search, from, to, assetIdFromUrl]);

  const clearAssetFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("assetId");
    setSearchParams(next, { replace: true });
  };

  const { data, isLoading } = useMaintenancesList(filters);
  const allRows = data?.data ?? [];
  const rows = useMemo(() => allRows, [allRows]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows   = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Categorías: base + custom
  const { data: customCats = [] } = useMaintenanceCategories();
  const allCategories = useMemo(() => {
    const map: Record<string, { label: string; dot: string; cls: string }> = {
      "Primordial:Bombas":   { label: "Primordial · Bombas",  dot: "bg-amber-500",   cls: "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10" },
      "Primordial:Motores":  { label: "Primordial · Motores", dot: "bg-cyan-500",    cls: "text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-500/10" },
      "Aceite:Cambio":       { label: "Aceite · Cambio",      dot: "bg-yellow-500",  cls: "text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-500/10" },
      "Aceite:Inventario":   { label: "Aceite · Inventario",  dot: "bg-emerald-500", cls: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10" },
      "Otro":                { label: "Otro",                  dot: "bg-gray-400",    cls: "text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-white/[0.04]" },
    };
    for (const c of customCats) {
      const id = `custom:${c.id}`;
      map[id] = {
        label: c.label,
        dot:   "", // se sobreescribe con style inline abajo
        cls:   "text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-white/[0.06]",
      };
    }
    return map;
  }, [customCats]);

  // Chips de categoría — base + custom (con dot sutil)
  const categoryChips: Array<{ id: "all" | string; label: string; dot: React.ReactNode }> = useMemo(() => {
    const dotFor = (key: string): React.ReactNode => {
      if (key === "all") return <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />;
      const cfg = allCategories[key];
      if (!cfg) return <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />;
      // Para customs, el dot toma el color custom de la BD
      if (key.startsWith("custom:")) {
        const id = key.replace("custom:", "");
        const c = customCats.find((x) => x.id === id);
        if (c) return <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.color }} />;
      }
      return <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />;
    };
    const base: Array<{ id: "all" | string; label: string; dot: React.ReactNode }> = [
      { id: "all",                   label: "Todas las categorías", dot: <span className="h-1.5 w-1.5 rounded-full bg-gray-400" /> },
      { id: "Primordial:Bombas",     label: "Primordial · Bombas",  dot: dotFor("Primordial:Bombas") },
      { id: "Primordial:Motores",    label: "Primordial · Motores", dot: dotFor("Primordial:Motores") },
      { id: "Aceite:Cambio",         label: "Aceite · Cambio",      dot: dotFor("Aceite:Cambio") },
      { id: "Aceite:Inventario",     label: "Aceite · Inventario",  dot: dotFor("Aceite:Inventario") },
      { id: "Otro",                  label: "Otro",                  dot: dotFor("Otro") },
    ];
    for (const c of customCats) {
      const key = `custom:${c.id}`;
      base.push({ id: key, label: c.label, dot: dotFor(key) });
    }
    return base;
  }, [allCategories, customCats]);

  // Modals & drawer
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing]     = useState<Maintenance | null>(null);
  const [detailId, setDetailId]   = useState<string | null>(null);
  const [reprogramTarget, setReprogramTarget] = useState<Maintenance | null>(null);
  const [reprogramOpen, setReprogramOpen]     = useState(false);

  const delMut        = useDeleteMaintenance();
  const takeMut       = useTakeMaintenance();
  const finalizeMut   = useFinalizeMaintenance();
  const rescheduleMut = useCancelRescheduleMaintenance();

  const onDelete = async (m: Maintenance) => {
    if (!confirm(`¿Eliminar el mantenimiento "${m.title}"?`)) return;
    try { await delMut.mutateAsync(m.id); toast.success("Mantenimiento eliminado"); }
    catch (e) { toast.error((e as Error).message); }
  };
  const onTake = async (m: Maintenance) => {
    try { await takeMut.mutateAsync(m.id); toast.success("Mantenimiento iniciado"); }
    catch (e) { toast.error((e as Error).message); }
  };
  const onFinalize = async (m: Maintenance) => {
    if (!confirm(`¿Marcar "${m.title}" como completado?`)) return;
    try { await finalizeMut.mutateAsync(m.id); toast.success("Mantenimiento completado"); }
    catch (e) { toast.error((e as Error).message); }
  };
  const onReschedule = async (newScheduledFor: string, reason: string) => {
    if (!reprogramTarget) return;
    try {
      await rescheduleMut.mutateAsync({ id: reprogramTarget.id, newScheduledFor, reason });
      toast.success("Mantenimiento reprogramado", { description: `Nueva fecha: ${fmtDate(newScheduledFor)}` });
      setReprogramOpen(false);
      setReprogramTarget(null);
    } catch (e) { toast.error((e as Error).message); }
  };

  // ── Tipo a precargar en el modal al crear ──────────────────────────────────
  // Si hay un chip de tipo activo (Correctivo / Programado), se usa como
  // default del formulario. Si está en "Todos", el modal cae a su default
  // interno ("Programado").
  const createPrefillType: MaintenanceType | undefined =
    typeChip === "Correctivo" || typeChip === "Programado" ? typeChip : undefined;

  return (
    <motion.div
      key={title}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="flex flex-col gap-4"
    >
      {/* ── Filtro por vehículo activo (vino del cockpit) ── */}
      {assetIdFromUrl && (
        <div className="flex items-center gap-2 rounded-xl border border-indigo-200/60 bg-indigo-50/80 px-3 py-2 text-xs text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-200">
          <Truck size={13} />
          <span>
            Filtrado por vehículo <code className="rounded bg-white/40 px-1.5 py-0.5 font-mono text-[11px] dark:bg-black/20">{assetIdFromUrl}</code>
          </span>
          <button
            type="button"
            onClick={clearAssetFilter}
            className="ml-auto flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold hover:bg-white/40 dark:hover:bg-black/20"
          >
            <X size={11} /> Quitar filtro
          </button>
        </div>
      )}

      {/* ── Filtros como 3 dropdowns: Estado / Categoría / Tipo ── */}
      <div className="flex flex-wrap items-end gap-2">
        {/* Estado */}
        <FilterDropdown
          label="Estado"
          value={subTab}
          onChange={(v) => { setSubTab(v as typeof subTab); setPage(1); }}
          options={[
            { id: "all",         label: "Todos",       dot: <span className="h-1.5 w-1.5 rounded-full bg-gray-400" /> },
            { id: "Programado",  label: "Programado",  dot: <span className="h-1.5 w-1.5 rounded-full bg-violet-500 dark:bg-violet-400" /> },
            { id: "En proceso",  label: "En proceso",  dot: <span className="h-1.5 w-1.5 rounded-full bg-sky-500 dark:bg-sky-400" /> },
            { id: "Completado",  label: "Completado",  dot: <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" /> },
          ]}
        />

        {/* Categoría */}
        <FilterDropdown
          label="Categoría"
          value={catChip}
          onChange={(v) => { setCatChip(v); setPage(1); }}
          options={categoryChips.map((c) => ({ id: c.id, label: c.label, dot: c.dot }))}
        />

        {/* Tipo */}
        <FilterDropdown
          label="Tipo"
          value={typeChip}
          onChange={(v) => { setTypeChip(v as typeof typeChip); setPage(1); }}
          options={[
            { id: "all",         label: "Todos",      dot: <span className="h-1.5 w-1.5 rounded-full bg-gray-400" /> },
            { id: "Correctivo",  label: "Correctivo", dot: <span className="h-1.5 w-1.5 rounded-full bg-orange-500 dark:bg-orange-400" /> },
            { id: "Programado",  label: "Programado", dot: <span className="h-1.5 w-1.5 rounded-full bg-violet-500 dark:bg-violet-400" /> },
          ]}
        />
      </div>

      {/* ── Toolbar: título + fechas + search + PDF + Nuevo ── */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3 pt-1">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white leading-tight">
            {title}
          </h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {rows.length} resultado{rows.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-2">
          <DatePicker label="Desde" value={from} onChange={(v) => { setFrom(v); setPage(1); }} maxDate={to || undefined} />
          <DatePicker label="Hasta" value={to}   onChange={(v) => { setTo(v); setPage(1); }}   minDate={from || undefined} />
          <div className="relative flex-1 sm:flex-none">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input
              placeholder="Buscar…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full sm:w-56 h-9 pl-7 pr-2.5 rounded-lg bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.06] text-sm text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:border-violet-400 dark:focus:border-violet-500/50 focus:ring-1 focus:ring-violet-400/20 dark:focus:ring-violet-500/20 transition"
            />
          </div>
          <button
            onClick={async () => {
              const { generateMaintenanceListPdf } = await import("../../../components/features/pdf/MaintenanceListPdf");
              const blob = await generateMaintenanceListPdf(
                rows,
                { from: from || new Date().toISOString().slice(0, 10), to: to || new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10) },
              );
              const url = URL.createObjectURL(blob);
              window.open(url, "_blank");
              setTimeout(() => URL.revokeObjectURL(url), 60_000);
            }}
            className="h-9 px-3 rounded-lg border border-gray-200 dark:border-white/[0.06] text-sm flex items-center gap-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.04] bg-white dark:bg-transparent transition"
          >
            <Download size={13} /> PDF
          </button>
          {canCreate && (
            <button
              onClick={() => { setEditing(null); setModalOpen(true); }}
              className="h-9 px-3 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400 text-white flex items-center gap-1.5 transition"
            >
              <Plus size={13} /> Nuevo
            </button>
          )}
        </div>
      </div>

      {/* ── Tabla ── */}
      <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#0f1320] overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-sm text-gray-400">Cargando…</div>
        ) : pageRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-white/[0.06]">
              <ClipboardList size={20} />
            </div>
            <p className="mt-3 text-sm font-medium text-gray-800 dark:text-white">Sin mantenimientos en esta vista.</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">Ajustá los filtros o creá un nuevo mantenimiento.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-gray-50 dark:bg-white/[0.02] text-[10px] uppercase tracking-widest text-gray-400 dark:text-gray-500">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Fecha</th>
                  <th className="text-left px-4 py-3 font-semibold">Vehículo</th>
                  <th className="text-left px-4 py-3 font-semibold">Título</th>
                  <th className="text-left px-4 py-3 font-semibold">Asignado</th>
                  <th className="text-left px-4 py-3 font-semibold">Tipo</th>
                  <th className="text-left px-4 py-3 font-semibold">Estado</th>
                  <th className="text-left px-4 py-3 font-semibold">Categoría</th>
                  <th className="text-right px-4 py-3 font-semibold">Costo</th>
                  <th className="">Acciones</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {pageRows.map((m, i) => {
                  const st = STATUS_CFG[m.status as MaintenanceStatus] ?? STATUS_CFG.Programado;
                  const ty = TYPE_CFG[m.type] ?? TYPE_CFG.Programado;
                  const cat = allCategories[m.category] ?? { label: m.category, dot: "bg-gray-400", cls: "text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-white/[0.04]" };
                  return (
                    <motion.tr
                      key={m.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.18, delay: Math.min(i, 10) * 0.025, ease: "easeOut" }}
                      onClick={() => setDetailId(m.id)}
                      className={`border-t border-gray-100 dark:border-white/[0.04] border-l-4 ${ty.rowAccent} cursor-pointer transition-colors ${
                        i % 2 === 1 ? "bg-gray-50/50 dark:bg-white/[0.015]" : ""
                      } hover:bg-blue-50/40 dark:hover:bg-white/[0.04]`}
                    >
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                        {fmtDate(m.scheduledFor)}
                        {m.isReprogrammed && (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" title={m.reprogramReason ?? ""}>
                            Reprog.
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800 dark:text-white">{m.assetPlate ?? "—"}</div>
                        <div className="text-[11px] text-gray-400 dark:text-gray-500">{m.assetName}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-200 max-w-[220px] truncate">{m.title ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-200">
                        {m.assignedUserName ? (
                          <span className="inline-flex items-center gap-1">
                            <UserIcon size={11} className="text-gray-400" />
                            {m.assignedUserName}
                          </span>
                        ) : <span className="text-gray-400 dark:text-gray-500">—</span>}
                      </td>
                      <td className={`px-4 py-3 font-medium text-xs ${ty.cls}`}>{ty.label}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${st.cls}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium ${cat.cls}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${cat.dot}`} />
                          {cat.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-200 font-medium">{fmtMoney(m.totalCost)}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
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
                    </motion.tr>
                  );
                })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {!isLoading && pageRows.length > 0 && (
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
        )}
      </div>

      {/*
        FIX: ya no se pasa hideTypeSelector={!editing}. Antes esto forzaba
        "Programado" siempre al crear, sin importar desde qué chip de tipo
        se abriera el modal. Ahora el selector de tipo siempre está visible
        al crear desde esta vista, y se precarga con el chip de tipo activo
        (createPrefillType) para minimizar clicks cuando el usuario ya está
        filtrando por "Correctivo" o "Programado".
      */}
      <MaintenanceFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        prefill={editing ? null : { type: createPrefillType }}
        maintenance={editing}
      />

      <ReprogramDialog
        open={reprogramOpen}
        target={reprogramTarget}
        saving={rescheduleMut.isPending}
        onClose={() => { setReprogramOpen(false); setReprogramTarget(null); }}
        onConfirm={onReschedule}
      />

      <MaintenanceDetailDrawer
        id={detailId}
        isFullAccess={isFullAccess}
        meId={meId}
        onClose={() => setDetailId(null)}
        onEdit={(m) => { setDetailId(null); setEditing(m); setModalOpen(true); }}
        onTake={onTake}
        onFinalize={onFinalize}
        onReschedule={(m) => { setReprogramTarget(m); setReprogramOpen(true); }}
      />
    </motion.div>
  );
}

// ─── FilterDropdown ──────────────────────────────────────────────────────────
// Dropdown compacto con label arriba + trigger + panel de opciones.
// Cierra con click-outside o con Escape.

type FilterOption = { id: string; label: string; dot?: React.ReactNode };

function FilterDropdown({
  label, value, options, onChange, align = "left",
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (id: string) => void;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = options.find((o) => o.id === value) ?? options[0];
  const isAll = current?.id === "all" || value === "all";

  return (
    <div ref={ref} className="relative">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-2 h-9 rounded-lg border px-2.5 text-xs font-medium transition min-w-[160px] ${
          isAll
            ? "border-gray-200 dark:border-white/[0.06] text-gray-500 dark:text-gray-400 bg-white dark:bg-white/[0.04] hover:border-gray-300 dark:hover:border-white/[0.12]"
            : "border-violet-300 dark:border-violet-500/40 text-gray-800 dark:text-white bg-violet-50/40 dark:bg-violet-500/10"
        }`}
      >
        {current?.dot}
        <span className="truncate flex-1 text-left">{current?.label ?? "—"}</span>
        <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className={`absolute z-30 mt-1.5 min-w-full rounded-lg border border-gray-200 bg-white shadow-lg dark:border-white/[0.08] dark:bg-[#0f1320] py-1 max-h-72 overflow-y-auto ${
              align === "right" ? "right-0" : "left-0"
            }`}
          >
            {options.map((opt) => {
              const selected = opt.id === value;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => { onChange(opt.id); setOpen(false); }}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs transition ${
                    selected
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200"
                      : "text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                  }`}
                >
                  {opt.dot ?? <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />}
                  <span className="flex-1 text-left truncate">{opt.label}</span>
                  {selected && <Check size={11} className="shrink-0 text-blue-600 dark:text-blue-300" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}