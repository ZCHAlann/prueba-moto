import { useMemo, useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ClipboardList, Search, X, CalendarClock, CheckCircle2,
  AlertTriangle, Car, ChevronRight, Filter, Loader2, ChevronDown,
} from "lucide-react";
import {
  useChecklistPendientes, type PendingItem, type PendingCategory,
} from "../../../hooks/useChecklistPendientes";
import type { ChecklistCategory } from "../../../hooks/useChecklistCategories";
import ChecklistWizard from "./wizard/ChecklistWizard";
import { useAuth } from "../../../context/AuthContext";
import { usePermissions } from "../../../hooks/usePermissions";
import { useMyDriverAssignment } from "../../../hooks/useMyDriverAssignment";

const PAGE_SIZE = 8;

type Props = {
  categories: ChecklistCategory[];
  onOpenWizard: (templateId: string | null) => void;
};

export function ChecklistPendientes({ categories, onOpenWizard }: Props) {
  const { session } = useAuth();
  const { can } = usePermissions();
  const canExecute = can("checklist", "inspecciones", "crear");
  const isConductor = session?.role === "conductor";
  const { state: driverState } = useMyDriverAssignment();
  const myAssignedAssetId = isConductor && driverState?.hasAssignment
    ? driverState.assignment.assetId
    : null;
  const { pendientes, loading, error } = useChecklistPendientes();

  const [activeTab, setActiveTab] = useState<string>("all");
  const [search, setSearch] = useState("");

  // IDs de grupos colapsados — por defecto todos abiertos
  const collapsedInitialized = useRef(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!collapsedInitialized.current && pendientes.length > 0) {
      setCollapsed(new Set(pendientes.map((p) => p.categoryId)));
      collapsedInitialized.current = true;
    }
  }, [pendientes]);

  const [pickerFor, setPickerFor] = useState<{ categoryId: string; categoryName: string } | null>(null);
  const [wizardFor, setWizardFor] = useState<{
    template: ChecklistCategory;
    assetId: string | null;
  } | null>(null);

  const visiblePendientes: PendingCategory[] = useMemo(() => {
    return pendientes.filter((p) => {
      if (activeTab !== "all" && p.categoryId !== activeTab) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !p.categoryName.toLowerCase().includes(q) &&
          !p.pendingItems.some((it) => it.assetLabel.toLowerCase().includes(q))
        ) return false;
      }
      return true;
    });
  }, [pendientes, activeTab, search]);

  const totalCount = useMemo(
    () => pendientes.reduce((acc, p) => acc + p.pendingItems.length, 0),
    [pendientes]
  );

  const categoriesWithPending = useMemo(() => {
    return pendientes.map((p) => {
      const cat = categories.find((c) => c.id === p.categoryId);
      return {
        id: p.categoryId,
        name: cat?.name ?? p.categoryName,
        count: p.pendingItems.length,
        windowEnd: p.windowEnd,
        cadenceKind: cat?.cadenceKind ?? "none",
      };
    });
  }, [pendientes, categories]);

  function toggleCollapsed(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleStartInspection(categoryId: string) {
    if (!canExecute) return;
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return;
    if (cat.scopeKind === "pick") {
      setPickerFor({ categoryId, categoryName: cat.name });
    } else {
      setWizardFor({ template: cat, assetId: null });
    }
  }

  function handleAssetPicked(categoryId: string, assetId: string) {
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return;
    setPickerFor(null);
    setWizardFor({ template: cat, assetId });
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-12 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/[0.04]" />
        <div className="h-64 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/[0.04]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
        {error}
      </div>
    );
  }

  if (pendientes.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-8 text-center dark:border-emerald-500/20 dark:bg-emerald-500/[0.04]">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
        <h3 className="mt-3 text-sm font-bold text-emerald-700 dark:text-emerald-300">¡Sin pendientes!</h3>
        <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">Estás al día con todas tus plantillas de checklist.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="rounded-2xl border border-cyan-200 bg-cyan-50/40 p-4 dark:border-cyan-500/20 dark:bg-cyan-500/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-100 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400">
              <ClipboardList size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-600 dark:text-cyan-400">Pendientes</p>
              <h2 className="text-base font-bold text-gray-800 dark:text-white">
                {totalCount} {totalCount === 1 ? "checklist por hacer" : "checklists por hacer"}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                En {categoriesWithPending.length} {categoriesWithPending.length === 1 ? "plantilla" : "plantillas"} que te tocan
              </p>
            </div>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar pendiente..."
              className="h-9 w-full rounded-xl border border-cyan-200 bg-white pl-8 pr-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/10 dark:border-cyan-500/20 dark:bg-white/[0.04] dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* Sub-tabs por plantilla */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-gray-100/60 p-1 dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="flex w-max gap-1 md:w-full">
          <SubTab
            active={activeTab === "all"}
            onClick={() => setActiveTab("all")}
            label="Todos"
            count={totalCount}
            icon={<Filter size={11} />}
          />
          {categoriesWithPending.map((c) => (
            <SubTab
              key={c.id}
              active={activeTab === c.id}
              onClick={() => setActiveTab(c.id)}
              label={c.name}
              count={c.count}
              icon={
                c.cadenceKind === "weekly" ? <CalendarClock size={11} />
                : c.cadenceKind === "days" ? <AlertTriangle size={11} />
                : <Car size={11} />
              }
            />
          ))}
        </div>
      </div>

      {/* Lista por categoría — acordeón */}
      <div className="space-y-2">
        {visiblePendientes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400 dark:border-white/[0.06]">
            No hay pendientes que coincidan con el filtro.
          </div>
        ) : (
          visiblePendientes.map((p) => (
            <PendingAccordion
              key={p.categoryId}
              pending={p}
              isOpen={!collapsed.has(p.categoryId)}
              onToggle={() => toggleCollapsed(p.categoryId)}
              onStart={() => handleStartInspection(p.categoryId)}
              canExecute={canExecute}
            />
          ))
        )}
      </div>

      {/* Drawer de selección de activo */}
      <AnimatePresence>
        {pickerFor && (
          <AssetPickerDrawer
            key="asset-picker"
            categoryId={pickerFor.categoryId}
            categoryName={pickerFor.categoryName}
            onClose={() => setPickerFor(null)}
            restrictToAssetId={myAssignedAssetId}
            restrictedAsset={driverState?.hasAssignment ? driverState.assignment.asset : null}
            onPick={(assetId) => handleAssetPicked(pickerFor.categoryId, assetId)}
          />
        )}
      </AnimatePresence>

      {/* Wizard */}
      <ChecklistWizard
        open={wizardFor !== null}
        initialCategory={wizardFor?.template ?? null}
        presetAssetId={wizardFor?.assetId ?? myAssignedAssetId}
        presetDriverId={isConductor && driverState?.hasAssignment ? Number(driverState.assignment.driverId) : null}
        onClose={() => { setWizardFor(null); onOpenWizard(null); }}
        onSaved={() => { setWizardFor(null); onOpenWizard(null); }}
      />
    </div>
  );
}

// ─── SubTab ──────────────────────────────────────────────────────────────────

function SubTab({ active, onClick, label, count, icon }: {
  active: boolean; onClick: () => void; label: string; count: number; icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? "bg-white text-gray-800 shadow-sm dark:bg-white/[0.08] dark:text-white"
          : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      }`}
    >
      {icon}
      <span className="truncate max-w-[160px]">{label}</span>
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
        active
          ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300"
          : "bg-gray-200 text-gray-600 dark:bg-white/[0.08] dark:text-gray-400"
      }`}>{count}</span>
    </button>
  );
}

// ─── PendingAccordion ────────────────────────────────────────────────────────

function PendingAccordion({
  pending, isOpen, onToggle, onStart, canExecute,
}: {
  pending: PendingCategory;
  isOpen: boolean;
  onToggle: () => void;
  onStart: () => void;
  canExecute: boolean;
}) {
  const windowEnd = new Date(pending.windowEnd);
  const msLeft = windowEnd.getTime() - Date.now();
  const daysLeft = Math.max(0, Math.floor(msLeft / (1000 * 60 * 60 * 24)));
  const hoursLeft = Math.max(0, Math.floor((msLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));
  const urgent = msLeft < 1000 * 60 * 60 * 24;

  const itemCount = pending.pendingItems.length;

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]">
      {/* Header colapsable */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-gray-50/60 dark:hover:bg-white/[0.02]"
      >
        {/* Chevron animado */}
        <motion.div
          animate={{ rotate: isOpen ? 0 : -90 }}
          transition={{ duration: 0.18, ease: "easeInOut" }}
          className="shrink-0 text-gray-400"
        >
          <ChevronDown size={15} />
        </motion.div>

        {/* Nombre + meta */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-gray-800 dark:text-white truncate">
              {pending.categoryName}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300">
              {itemCount} {itemCount === 1 ? "pendiente" : "pendientes"}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {pending.scopeLabel} · {pending.cycleLabel}
          </p>
        </div>

        {/* Tiempo restante + botón acción */}
        <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <span
            className={`hidden sm:inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${
              urgent
                ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
            }`}
          >
            <CalendarClock size={11} />
            {daysLeft > 0 ? `${daysLeft}d ${hoursLeft}h` : `${hoursLeft}h`}
          </span>
          {canExecute ? (
            <button
              type="button"
              onClick={onStart}
              className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-cyan-600 active:scale-95"
            >
              Realizar
              <ChevronRight size={12} />
            </button>
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
              Sin permiso
            </span>
          )}
        </div>
      </button>

      {/* Cuerpo colapsable */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className="border-t border-gray-100 dark:border-white/[0.06]">
              {pending.scopeKind === "pick" ? (
                <p className="px-5 py-3 text-xs text-gray-500 dark:text-gray-400">
                  Esta plantilla es de selección libre. Pulsa <strong className="font-semibold text-gray-700 dark:text-gray-300">Realizar</strong> para elegir el activo.
                </p>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-white/[0.04]">
                  {pending.pendingItems.map((it) => (
                    <li key={it.assetId} className="flex items-center justify-between gap-2 px-5 py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gray-100 dark:bg-white/[0.06]">
                          <Car size={12} className="text-gray-400" />
                        </div>
                        <span className="truncate text-xs text-gray-700 dark:text-gray-300">{it.assetLabel}</span>
                      </div>
                      {/* Badge urgencia en mobile (dentro del body) */}
                      <span className={`sm:hidden inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        urgent
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                      }`}>
                        <CalendarClock size={9} />
                        {daysLeft > 0 ? `${daysLeft}d` : `${hoursLeft}h`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── AssetPickerDrawer ───────────────────────────────────────────────────────
// (Sin cambios respecto al original — solo se mueve al mismo archivo)

function AssetPickerDrawer({
  categoryId, categoryName, onClose, onPick, restrictToAssetId, restrictedAsset,
}: {
  categoryId: string; categoryName: string;
  onClose: () => void; onPick: (assetId: string) => void;
  restrictToAssetId?: string | null;
  restrictedAsset?: { id: string; name: string | null; code: string | null; plate: string | null; brand: string | null; model: string | null } | null;
}) {
  const { session } = useAuth();
  const companyId = session?.companyId ? String(session.companyId) : null;
  const [assets, setAssets] = useState<Array<{ id: string; name: string; plate: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    if (restrictToAssetId && restrictedAsset) {
      setAssets([{
        id: String(restrictedAsset.id),
        name: String(restrictedAsset.name ?? ""),
        plate: restrictedAsset.plate == null ? null : String(restrictedAsset.plate),
      }]);
      setLoading(false);
      return;
    }
    fetch(`/api/company/${companyId}/assets`)
      .then((r) => r.json())
      .then((json) => {
        const raw = json.data ?? json;
        const list = (Array.isArray(raw) ? raw : []).map((a: any) => ({
          id: String(a.id),
          name: String(a.name ?? ""),
          plate: a.plate == null ? null : String(a.plate),
        }));
        setAssets(list);
      })
      .finally(() => setLoading(false));
  }, [companyId, restrictToAssetId, restrictedAsset]);

  const filtered = useMemo(() => {
    let base = assets;
    if (restrictToAssetId) base = assets.filter((a) => String(a.id) === String(restrictToAssetId));
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter((a) => a.name.toLowerCase().includes(q) || (a.plate?.toLowerCase().includes(q) ?? false));
  }, [assets, search, restrictToAssetId]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const gridCols = "grid-cols-2 md:grid-cols-3 lg:grid-cols-4";

  return (
    <>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-3 sm:p-6">
        <motion.div
          key="picker-modal"
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="flex h-full max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0d1320]"
        >
          {/* Header */}
          <div className="relative shrink-0 border-b border-gray-100 bg-gradient-to-br from-cyan-50/80 via-white to-cyan-50/40 px-5 py-4 dark:border-white/[0.06] dark:from-cyan-500/10 dark:via-[#0d1320] dark:to-cyan-500/5 sm:px-6">
            <button onClick={onClose}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 transition hover:bg-white hover:text-gray-700 dark:hover:bg-white/[0.06] dark:hover:text-white sm:right-4 sm:top-4">
              <X size={15} />
            </button>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400">
                <Car size={18} />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-600 dark:text-cyan-400">Paso 2 · Selecciona el activo</p>
                <h2 className="mt-0.5 text-base font-bold text-gray-800 dark:text-white">{categoryName}</h2>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="shrink-0 border-b border-gray-100 px-5 py-3 dark:border-white/[0.06] sm:px-6">
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Buscar por nombre o placa..."
                className="h-10 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/10 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white" />
              {search && (
                <button type="button" onClick={() => { setSearch(""); setPage(1); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06]">
                  <X size={11} />
                </button>
              )}
            </div>
            <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
              {loading ? "Cargando activos…" : `${filtered.length} ${filtered.length === 1 ? "activo disponible" : "activos disponibles"}`}
            </p>
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-sm text-gray-400">
                <Loader2 size={20} className="animate-spin" /><p>Cargando activos…</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-gray-400">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 dark:bg-white/[0.06]">
                  <Car size={20} className="text-gray-300" />
                </div>
                <p className="font-semibold text-gray-500 dark:text-gray-400">Sin coincidencias</p>
                <p className="text-[11px]">No hay activos que coincidan con tu búsqueda.</p>
              </div>
            ) : (
              <div className={`grid gap-3 ${gridCols}`}>
                {pageItems.map((a) => (
                  <button key={a.id} onClick={() => onPick(a.id)}
                    className="group relative flex flex-col items-start gap-2 overflow-hidden rounded-2xl border border-gray-200 bg-white p-3.5 text-left transition hover:-translate-y-0.5 hover:border-cyan-400 hover:shadow-md hover:shadow-cyan-500/10 active:scale-[0.98] dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:border-cyan-500/40">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-100 to-cyan-50 text-cyan-600 dark:from-cyan-500/20 dark:to-cyan-500/5 dark:text-cyan-400">
                      <Car size={15} />
                    </div>
                    <p className="line-clamp-1 text-xs font-bold text-gray-800 dark:text-white">{a.name}</p>
                    {a.plate && <p className="font-mono text-[10px] font-semibold text-cyan-700 dark:text-cyan-300">{a.plate}</p>}
                    <ChevronRight size={12} className="absolute right-2 top-2 text-gray-300 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100 dark:text-gray-600" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex flex-col-reverse items-stretch gap-2 border-t border-gray-100 bg-gray-50/80 px-5 py-3 dark:border-white/[0.06] dark:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <button onClick={onClose}
              className="inline-flex items-center justify-center gap-1 rounded-xl border border-gray-200 px-3.5 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.04]">
              Cancelar
            </button>
            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                  Pág. <span className="font-bold text-gray-700 dark:text-gray-200">{page}</span> / {totalPages}
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100 disabled:opacity-40 dark:border-white/[0.08] dark:text-gray-400">
                    Anterior
                  </button>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100 disabled:opacity-40 dark:border-white/[0.08] dark:text-gray-400">
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </>
  );
}