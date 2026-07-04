import { useMemo, useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ClipboardList, Search, X, CalendarClock, CheckCircle2,
  AlertTriangle, Car, ChevronRight, Filter, Loader2,
  Hourglass, ShieldAlert, Send, MessageSquare,
} from "lucide-react";
import { CollapsibleGroup } from "../../../components/ui/collapsible-group/CollapsibleGroup";
import {
  useChecklistPendientes, type PendingCategory,
} from "../../../hooks/useChecklistPendientes";
import type { ChecklistCategory } from "../../../hooks/useChecklistCategories";
import ChecklistWizard from "./wizard/ChecklistWizard";
import { useAuth } from "../../../context/AuthContext";
import { usePermissions } from "../../../hooks/usePermissions";
import { useMyDriverAssignment } from "../../../hooks/useMyDriverAssignment";
import { useChecklistReauth, type ChecklistReauthRequest } from "../../../hooks/useChecklistReauth";
import { toast } from "sonner";

const PAGE_SIZE = 8;

type Props = {
  categories: ChecklistCategory[];
  onOpenWizard: (templateId: string | null) => void;
  /**
   * Si viene, indica que el usuario llegó aquí con `?assetId=X` (p. ej.
   * desde ProfilePage). Mostramos un banner informativo arriba del listado
   * para que sepa que está mirando pendientes de su vehículo asignado.
   * El filtrado real server-side se hace en el hook cuando aplique.
   */
  deepLinkedAssetId?: string | null;
};

type VencidoRow = {
  key: string;
  categoryId: string;
  categoryName: string;
  cycleStart: string;
  cycleEnd: string;
  cycleLabel: string;
  assetId: string;
  assetLabel: string;
  assetPlate: string | null;
  missedChecklistId: string | null;
  reauth: ChecklistReauthRequest | null;
};

function findReauthForMissed(
  missedChecklistId: string | null,
  byMissed: Map<string, ChecklistReauthRequest>,
): ChecklistReauthRequest | null {
  if (!missedChecklistId) return null;
  return byMissed.get(missedChecklistId) ?? null;
}

export function ChecklistPendientes({ categories, onOpenWizard, deepLinkedAssetId }: Props) {
  const { session } = useAuth();
  const { can } = usePermissions();
  const canExecute = can("checklist", "inspecciones", "crear");
  const isConductor = session?.role === "conductor";
  const { state: driverState } = useMyDriverAssignment();
  const myAssignedAssetId = isConductor && driverState?.hasAssignment
    ? driverState.assignment.assetId
    : null;
  const myAssignedAssetPlate = isConductor && driverState?.hasAssignment
    ? (driverState.assignment.asset?.plate ?? null)
    : null;

  const { pendientes, vencidos, loading, error, refetch } = useChecklistPendientes(
    deepLinkedAssetId ?? null,
  );
  const { requests: reauths, refetch: refetchReauths, createRequest } = useChecklistReauth();

  // Fetch explícito al montar — el hook useChecklistReauth ya NO hace
  // auto-fetch interno (ver fix en el hook), así que cada consumidor
  // debe pedir sus propios datos.
  useEffect(() => {
    void refetchReauths();
  }, [refetchReauths]);


  const reauthByMissed = useMemo(() => {
    const map = new Map<string, ChecklistReauthRequest>();
    for (const r of reauths) {
      if (r.missedChecklistId) map.set(r.missedChecklistId, r);
    }
    return map;
  }, [reauths]);

  const vencidosFlat: VencidoRow[] = useMemo(() => {
    const rows: VencidoRow[] = [];
    for (const v of vencidos) {
      for (const it of v.missedItems) {
        const reauth = findReauthForMissed(it.missedChecklistId, reauthByMissed);
        rows.push({
          key: `${v.categoryId}|${it.assetId}|${it.missedChecklistId ?? "no-id"}`,
          categoryId: v.categoryId,
          categoryName: v.categoryName,
          cycleStart: v.cycleStart,
          cycleEnd: v.cycleEnd,
          cycleLabel: v.cycleLabel,
          assetId: it.assetId,
          assetLabel: it.assetLabel,
          assetPlate: it.assetPlate,
          missedChecklistId: it.missedChecklistId,
          reauth,
        });
      }
    }
    return rows;
  }, [vencidos, reauthByMissed]);

  const [activeTab, setActiveTab] = useState<string>("all");
  const [search, setSearch] = useState("");

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
    presetAsset: { id: string | number; plate?: string | null } | null;
    reauthRequestId?: string | null;
  } | null>(null);
  const [reauthModalFor, setReauthModalFor] = useState<VencidoRow | null>(null);

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
      // Para conductor, presetAsset con su asignación activa
      const presetAsset = myAssignedAssetId
        ? { id: myAssignedAssetId, plate: myAssignedAssetPlate }
        : null;
      setWizardFor({ template: cat, presetAsset });
    }
  }

  function handleAssetPicked(categoryId: string, assetId: string, assetPlate?: string | null) {
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return;
    setPickerFor(null);
    setWizardFor({ template: cat, presetAsset: { id: assetId, plate: assetPlate ?? null } });
  }

  function openReauthWizard(row: VencidoRow) {
    const cat = categories.find((c) => c.id === row.categoryId);
    if (!cat || !row.reauth) return;
    const presetAsset = row.assetId
      ? { id: row.assetId, plate: row.assetPlate }
      : myAssignedAssetId
        ? { id: myAssignedAssetId, plate: myAssignedAssetPlate }
        : null;
    setWizardFor({
      template: cat,
      presetAsset,
      reauthRequestId: row.reauth.id,
    });
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

  if (pendientes.length === 0 && vencidosFlat.length === 0) {
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
      {/* Banner de deep-link: el usuario llegó con `?assetId=X` desde
          otra página (Profile → "Mis inspecciones pendientes"). */}
      {deepLinkedAssetId && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-2.5 dark:border-brand-500/20 dark:bg-brand-500/[0.06]">
          <p className="text-xs font-medium text-brand-700 dark:text-brand-300">
            Mostrando pendientes de tu vehículo asignado.{" "}
            <span className="font-mono text-[10px] text-brand-700/70 dark:text-brand-300/70">
              assetId={deepLinkedAssetId}
            </span>
          </p>
        </div>
      )}

      {/* Hero */}
      {pendientes.length > 0 && (
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
      )}

      {/* Sub-tabs por plantilla */}
      {pendientes.length > 0 && (
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
      )}

      {/* Lista por categoría — acordeón */}
      {pendientes.length > 0 && (
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
      )}

      {/* ── Sección Atrasados ── */}
      {vencidosFlat.length > 0 && (
        <VencidosSection
          rows={vencidosFlat}
          canExecute={canExecute}
          onAskReauth={(row) => setReauthModalFor(row)}
          onResumeReauth={(row) => openReauthWizard(row)}
        />
      )}

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
            onPick={(assetId, assetPlate) => handleAssetPicked(pickerFor.categoryId, assetId, assetPlate)}
          />
        )}
      </AnimatePresence>

      {/* Modal: pedir reautorización */}
      <AnimatePresence>
        {reauthModalFor && (
          <ReauthRequestModal
            key="reauth-modal"
            row={reauthModalFor}
            onClose={() => setReauthModalFor(null)}
            onSubmit={async (reason) => {
              try {
                const missedId = reauthModalFor.missedChecklistId;
                if (!missedId) {
                  toast.error("No se pudo identificar el ID del checklist vencido.");
                  return;
                }
                await createRequest({ missedChecklistId: missedId, reason });
                toast.success("Solicitud enviada. Un aprobador la revisará.");
                setReauthModalFor(null);
                void refetch();
                void refetchReauths();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Error al pedir reautorización");
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* Wizard */}
      <ChecklistWizard
        open={wizardFor !== null}
        initialCategory={wizardFor?.template ?? null}
        reauthRequestId={wizardFor?.reauthRequestId ?? null}
        presetAsset={wizardFor?.presetAsset ?? null}
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
    <CollapsibleGroup
      id={pending.categoryId}
      isOpen={isOpen}
      onToggle={onToggle}
      tone="gray"
      header={{
        left: (
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
        ),
        right: (
          <>
            <span className={`hidden sm:inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${
              urgent
                ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
            }`}>
              <CalendarClock size={11} />
              {daysLeft > 0 ? `${daysLeft}d ${hoursLeft}h` : `${hoursLeft}h`}
            </span>
            {canExecute ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onStart(); }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-cyan-600 active:scale-95"
              >
                Realizar <ChevronRight size={12} />
              </button>
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                Sin permiso
              </span>
            )}
          </>
        ),
      }}
    >
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
    </CollapsibleGroup>
  );
}

// ─── VencidosSection ─────────────────────────────────────────────────────────

function VencidosSection({
  rows, canExecute, onAskReauth, onResumeReauth,
}: {
  rows: VencidoRow[];
  canExecute: boolean;
  onAskReauth: (row: VencidoRow) => void;
  onResumeReauth: (row: VencidoRow) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, { categoryName: string; cycleLabel: string; rows: VencidoRow[] }>();
    for (const row of rows) {
      const existing = map.get(row.categoryId);
      if (existing) {
        existing.rows.push(row);
      } else {
        map.set(row.categoryId, { categoryName: row.categoryName, cycleLabel: row.cycleLabel, rows: [row] });
      }
    }
    return Array.from(map.entries());
  }, [rows]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // IDs que el usuario ha toggleado explícitamente (abrir o cerrar). Los
  // respetamos aunque el set de grupos cambie. Para los IDs nuevos (que
  // el usuario no ha tocado), los defaulteamos a colapsados.
  const userToggled = useRef<Set<string>>(new Set());
  useEffect(() => {
    setCollapsed((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const [catId] of groups) {
        if (!userToggled.current.has(catId) && !next.has(catId)) {
          next.add(catId);
          changed = true;
        }
      }
      // Limpieza: si un catId ya no existe en `groups` y nunca fue
      // togglado, lo sacamos para no mantener basura.
      for (const id of Array.from(next)) {
        if (!groups.some(([cid]) => cid === id) && !userToggled.current.has(id)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [groups]);
  function toggle(catId: string) {
    userToggled.current.add(catId);
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  }

  return (
    <div className="mt-6 space-y-3">
      {/* Header de sección */}
      <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4 dark:border-rose-500/20 dark:bg-rose-500/[0.04]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400">
            <Hourglass size={20} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-rose-600 dark:text-rose-400">Atrasados</p>
            <h2 className="text-base font-bold text-gray-800 dark:text-white">
              {rows.length} {rows.length === 1 ? "vencido" : "vencidos"} del ciclo anterior
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Podés pedir una autorización para hacerlos fuera de la ventana, o pedirle a un supervisor que la apruebe.
            </p>
          </div>
        </div>
      </div>

      {/* Grupos por categoría */}
      <div className="space-y-2">
        {groups.map(([catId, group]) => {
          const isOpen = !collapsed.has(catId);
          const multiple = group.rows.length > 1;

          if (!multiple) {
            return (
              <VencidoRowItem
                key={group.rows[0].key}
                row={group.rows[0]}
                canExecute={canExecute}
                onAskReauth={() => onAskReauth(group.rows[0])}
                onResumeReauth={() => onResumeReauth(group.rows[0])}
              />
            );
          }

          return (
            <CollapsibleGroup
              key={catId}
              id={catId}
              isOpen={isOpen}
              onToggle={() => toggle(catId)}
              tone="rose"
              header={{
                left: (
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-400">
                      <AlertTriangle size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-gray-800 dark:text-white truncate">
                          {group.categoryName}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                          {group.rows.length} atrasados
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                        Ciclo {group.cycleLabel}
                      </p>
                    </div>
                  </div>
                ),
              }}
            >
              <div className="divide-y divide-rose-100 dark:divide-rose-500/10">
                {group.rows.map((row) => (
                  <VencidoRowItem
                    key={row.key}
                    row={row}
                    canExecute={canExecute}
                    compact
                    onAskReauth={() => onAskReauth(row)}
                    onResumeReauth={() => onResumeReauth(row)}
                  />
                ))}
              </div>
            </CollapsibleGroup>
          );
        })}
      </div>
    </div>
  );
}

// ─── VencidoRowItem ──────────────────────────────────────────────────────────

function VencidoRowItem({
  row, canExecute, compact = false, onAskReauth, onResumeReauth,
}: {
  row: VencidoRow;
  canExecute: boolean;
  compact?: boolean;
  onAskReauth: () => void;
  onResumeReauth: () => void;
}) {
  const r = row.reauth;

  const inner = (
    <div className={`flex flex-wrap items-center gap-3 px-4 ${compact ? "py-3" : "py-3.5"}`}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-400">
        <AlertTriangle size={16} />
      </div>
      <div className="min-w-0 flex-1">
        {!compact && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-gray-800 dark:text-white truncate">
              {row.categoryName}
            </span>
          </div>
        )}
        <p className={`truncate text-xs ${compact ? "font-medium text-gray-700 dark:text-gray-300" : "text-gray-500 dark:text-gray-400"}`}>
          {row.assetLabel || "(activo no seleccionado)"}
        </p>
        <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
          Ciclo {row.cycleLabel}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!r && (
          <button
            type="button"
            onClick={onAskReauth}
            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-rose-600 active:scale-95"
          >
            <Send size={11} /> Pedir autorización
          </button>
        )}
        {r && r.status === "Pendiente" && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            <Hourglass size={11} /> Esperando aprobación
          </span>
        )}
        {r && r.status === "Autorizada" && r.completedChecklistId && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            <CheckCircle2 size={11} /> Completada
          </span>
        )}
        {r && r.status === "Autorizada" && !r.completedChecklistId && canExecute && (
          <button
            type="button"
            onClick={onResumeReauth}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-600 active:scale-95"
          >
            Realizar ahora <ChevronRight size={11} />
          </button>
        )}
        {r && r.status === "Autorizada" && !r.completedChecklistId && !canExecute && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            <CheckCircle2 size={11} /> Aprobada
          </span>
        )}
        {r && r.status === "Autorizada" && !canExecute && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            <CheckCircle2 size={11} /> Aprobada
          </span>
        )}
        {r && r.status === "Rechazada" && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-bold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
            title={r.decisionNotes ?? "Rechazada sin notas"}
          >
            <ShieldAlert size={11} /> Rechazada
            {r.decisionNotes && <MessageSquare size={10} />}
          </span>
        )}
      </div>
    </div>
  );

  const notes = (r?.reason || r?.decisionNotes) ? (
    <div className="border-t border-rose-100 bg-rose-50/30 px-4 py-2.5 dark:border-rose-500/10 dark:bg-rose-500/[0.03]">
      {r?.reason && (
        <p className="text-[11px] text-gray-600 dark:text-gray-400">
          <span className="font-semibold text-gray-700 dark:text-gray-300">Motivo:</span>{" "}
          <span className="italic">"{r.reason}"</span>
        </p>
      )}
      {r?.status === "Rechazada" && r?.decisionNotes && (
        <p className="mt-1 text-[11px] text-rose-700 dark:text-rose-300">
          <span className="font-semibold">Nota del aprobador:</span> {r.decisionNotes}
        </p>
      )}
    </div>
  ) : null;

  if (compact) {
    return (
      <div>
        {inner}
        {notes}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-rose-200 bg-white dark:border-rose-500/20 dark:bg-white/[0.03]">
      {inner}
      {notes}
    </div>
  );
}

// ─── AssetPickerDrawer ───────────────────────────────────────────────────────

function AssetPickerDrawer({
  categoryId, categoryName, onClose, onPick, restrictToAssetId, restrictedAsset,
}: {
  categoryId: string;
  categoryName: string;
  onClose: () => void;
  onPick: (assetId: string, assetPlate?: string | null) => void;
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
    fetch(`/api/company/${companyId}/assets`, { credentials: "include" })
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
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                {pageItems.map((a) => (
                  <button key={a.id} onClick={() => onPick(a.id, a.plate)}
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

// ─── ReauthRequestModal ───────────────────────────────────────────────────────

function ReauthRequestModal({
  row, onClose, onSubmit,
}: {
  row: VencidoRow;
  onClose: () => void;
  onSubmit: (reason: string) => void | Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const minLen = 10;
  const ok = reason.trim().length >= minLen;
  const [submitting, setSubmitting] = useState(false);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-3 sm:p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="w-full max-w-md overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0d1320]"
        >
          <div className="border-b border-gray-100 bg-gradient-to-br from-rose-50/80 via-white to-rose-50/40 px-5 py-4 dark:border-white/[0.06] dark:from-rose-500/10 dark:via-[#0d1320] dark:to-rose-500/5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-rose-600 dark:text-rose-400">
              Reautorización
            </p>
            <h2 className="mt-0.5 text-base font-bold text-gray-800 dark:text-white">
              Pedir permiso para hacer "{row.categoryName}"
            </h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {row.assetLabel} · ciclo {row.cycleLabel}
            </p>
          </div>
          <div className="px-5 py-4">
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Motivo <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={2000}
              rows={4}
              placeholder={`Contá brevemente por qué necesitás hacer este checklist fuera de la ventana (mínimo ${minLen} caracteres).`}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500/10 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200"
            />
            <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
              {reason.trim().length}/{minLen}+ caracteres
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/80 px-5 py-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
            <button onClick={onClose} disabled={submitting}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.04]">
              Cancelar
            </button>
            <button
              disabled={!ok || submitting}
              onClick={async () => {
                setSubmitting(true);
                try { await onSubmit(reason.trim()); } finally { setSubmitting(false); }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500 px-4 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-rose-600 disabled:opacity-40"
            >
              <Send size={11} />
              {submitting ? "Enviando…" : "Enviar solicitud"}
            </button>
          </div>
        </motion.div>
      </div>
    </>
  );
}