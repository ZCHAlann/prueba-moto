import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAcUnits } from "../../hooks/useAcUnits";
import { usePermissions } from "../../hooks/usePermissions";
import { useACFormOptions } from "../../hooks/useFormOptions";
import { ModulePageHeader } from "../../components/features/modules/ModulePageHeader";
import { StatusPill } from "../../components/common/StatusPill";
import { AcCreateModal } from "../../components/ac/ac-create-modal";
import { AcEditModal } from "../../components/ac/ac-edit-modal";
import { AcDetailDrawer } from "../../components/ac/ac-detail-drawer";
import { AcServiceModal } from "../../components/ac/ac-service-modal";
import { AcDeleteConfirm } from "../../components/ac/ac-delete-confirm";
import type {
  AirConditioningStatus,
  AirConditioningUnit,
} from "../../types/fleet";
import {
  Search, Plus, Eye, Pencil, Trash2, Wind, AlertTriangle,
  Wrench, MapPin, Image as ImageIcon,
} from "lucide-react";
import { RowActionMenu } from "../../components/ui/table/RowActionMenu";

/* ── Stat card ──────────────────────────────────────────────────────────── */
function StatCard({
  label, value, detail, tone, icon,
}: {
  label: string; value: string; detail: string;
  tone: "info" | "success" | "warning" | "neutral";
  icon?: React.ReactNode;
}) {
  const toneMap = {
    info:    { bg: "bg-cyan-50 dark:bg-cyan-500/10",    text: "text-cyan-600 dark:text-cyan-400",    bar: "bg-cyan-400" },
    success: { bg: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-400" },
    warning: { bg: "bg-amber-50 dark:bg-amber-500/10",  text: "text-amber-600 dark:text-amber-400",  bar: "bg-amber-400" },
    neutral: { bg: "bg-gray-100 dark:bg-white/[0.05]",  text: "text-gray-500 dark:text-gray-400",    bar: "bg-gray-300 dark:bg-gray-600" },
  } as const;
  const t = toneMap[tone];
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 transition-all duration-200 hover:shadow-md dark:border-white/[0.06] dark:bg-white/[0.03] dark:hover:bg-white/[0.05]">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${t.bar} opacity-60`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{label}</p>
          <h4 className="mt-2 text-3xl font-bold tabular-nums text-gray-800 dark:text-white">{value}</h4>
          <p className="mt-1.5 truncate text-xs text-gray-400 dark:text-gray-500">{detail}</p>
        </div>
        <div className={`shrink-0 rounded-xl p-2.5 ${t.bg}`}>
          <span className={t.text}>{icon ?? <Wind size={16} />}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Row actions dropdown ──────────────────────────────────────────────── */
function RowActions({
  unit, onView, onEdit, onDelete, canEdit, canDelete, canCreate,
}: {
  unit: AirConditioningUnit;
  onView: (u: AirConditioningUnit) => void;
  onEdit: (u: AirConditioningUnit) => void;
  onDelete: (u: AirConditioningUnit) => void;
  canEdit: boolean; canDelete: boolean; canCreate: boolean;
}) {
  if (!canEdit && !canDelete && !canCreate) return null;

  return (
    <RowActionMenu
      ariaLabel="Acciones de la unidad A/C"
      items={[
        { label: "Ver detalle",   icon: <Eye size={13} />,     onClick: () => onView(unit),   tone: "default" },
        { label: "Editar",        icon: <Pencil size={13} />,  onClick: () => onEdit(unit),   tone: "default", disabled: !canEdit },
        { label: "Mantenimiento", icon: <Wrench size={13} />,  onClick: () => onView(unit),   tone: "default", disabled: !canCreate },
        { label: "Eliminar",      icon: <Trash2 size={13} />,  onClick: () => onDelete(unit), tone: "danger",  disabled: !canDelete },
      ]}
    />
  );
}

/* ── Empty state ───────────────────────────────────────────────────────── */
function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 dark:bg-white/[0.05]">
        <Wind size={24} className="text-gray-400 dark:text-gray-500" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">
          {hasFilters ? "Sin coincidencias" : "Sin aires acondicionados registrados"}
        </p>
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
          {hasFilters ? "Prueba ajustando los filtros de búsqueda." : "Registra la primera unidad para comenzar."}
        </p>
      </div>
    </div>
  );
}

/* ── Página principal ──────────────────────────────────────────────────── */
export default function AcPage() {
  const { units, deleteUnit, getUnitDetail } = useAcUnits();
  const { data: formOptions } = useACFormOptions();
  const sites = formOptions?.sites ?? [];
  const { can } = usePermissions();

  const canCreate = can("ac", "lista_ac", "crear");
  const canEdit   = can("ac", "lista_ac", "editar");
  const canDelete = can("ac", "lista_ac", "eliminar");

  const [query, setQuery]     = useState("");
  const [status, setStatus]   = useState<"Todos" | AirConditioningStatus>("Todos");
  const [showCreate, setShowCreate] = useState(false);
  const [toEdit, setToEdit]   = useState<AirConditioningUnit | null>(null);
  const [toView, setToView]   = useState<AirConditioningUnit | null>(null);
  const [serviceTarget, setServiceTarget] = useState<AirConditioningUnit | null>(null);
  const [toDelete, setToDelete] = useState<AirConditioningUnit | null>(null);
  const [deleting, setDeleting] = useState(false);

  const siteName = (id?: string | null) =>
    id ? sites.find((s) => s.id === id)?.name ?? "—" : "—";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return units.filter((u) => {
      const matchQuery =
        q.length === 0 ||
        u.code.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q) ||
        (u.brand ?? "").toLowerCase().includes(q) ||
        (u.model ?? "").toLowerCase().includes(q) ||
        (u.serial ?? "").toLowerCase().includes(q);
      const matchStatus = status === "Todos" || u.status === status;
      return matchQuery && matchStatus;
    });
  }, [units, query, status]);

  const statusTone = (s: string) =>
    s === "Operativo" ? "success" :
    s === "En revision" ? "warning" :
    s === "Fuera de servicio" ? "danger" : "neutral" as const;

  const hasFilters = query.trim().length > 0 || status !== "Todos";

  const handleConfirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const ok = await deleteUnit(toDelete.id);
      if (ok) {
        toast.success("Unidad A/C eliminada", {
          description: "El registro y sus mantenimientos fueron retirados.",
        });
        setToDelete(null);
      } else {
        toast.error("No se pudo eliminar la unidad A/C");
      }
    } catch {
      toast.error("Error inesperado");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <ModulePageHeader
        badge="Confort térmico"
        title="Aires acondicionados"
        subtitle="Inventario de unidades A/C, su estado y mantenimientos."
        accent="cyan"
        action={
          canCreate ? (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-cyan-500/20 transition hover:bg-cyan-600 active:scale-95"
            >
              <Plus size={16} />
              Nueva unidad
            </button>
          ) : undefined
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:gap-5 sm:grid-cols-3 md:grid-cols-4">
        <StatCard label="Total"             value={units.length.toString()}                                            detail="Unidades registradas"        tone="info"    />
        <StatCard label="Operativos"        value={units.filter((u) => u.status === "Operativo").length.toString()}        detail="En funcionamiento"          tone="success" />
        <StatCard label="En revisión"       value={units.filter((u) => u.status === "En revision").length.toString()}      detail="Pendientes de inspección"   tone="warning" />
        <StatCard label="Fuera de servicio" value={units.filter((u) => u.status === "Fuera de servicio").length.toString()} detail="Sin operar"                  tone="neutral" />
      </div>

      {/* Filtros */}
      <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Código, nombre, marca, modelo o serie..."
              className="h-10 w-full rounded-xl border border-gray-200 bg-transparent pl-9 pr-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/10 dark:border-white/[0.08] dark:text-white dark:placeholder:text-gray-500"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "Todos" | AirConditioningStatus)}
            className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/10 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300"
          >
            {["Todos", "Operativo", "En revision", "Fuera de servicio", "Pendiente revision"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/[0.06]">
          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Lista de aires acondicionados</h3>
            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
              {filtered.length} {filtered.length !== 1 ? "resultados" : "resultado"}
              {hasFilters && (
                <button
                  type="button"
                  onClick={() => { setQuery(""); setStatus("Todos"); }}
                  className="ml-2 text-cyan-500 underline-offset-2 hover:underline"
                >
                  Limpiar filtros
                </button>
              )}
            </p>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState hasFilters={hasFilters} />
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[860px]">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-white/[0.06]">
                    {["Código", "Unidad", "Tipo", "Marca / Modelo", "Sede", "Estado", ""].map((h, i, arr) => {
                      const isLast = i === arr.length - 1;
                      return (
                        <th
                          key={i}
                          className={
                            isLast
                              ? ""
                              : "px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500"
                          }
                        >
                          {h}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
                  {filtered.map((unit) => (
                    <tr
                      key={unit.id}
                      onClick={() => setToView(unit)}
                      className="group cursor-pointer transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.02]"
                    >
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 opacity-0 transition-opacity group-hover:opacity-100" />
                          <span className="text-sm font-semibold text-gray-800 dark:text-white">{unit.code}</span>
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          {unit.photoUrls?.[0] ? (
                            <img
                              src={unit.photoUrls[0]}
                              alt=""
                              className="h-8 w-8 rounded-lg object-cover ring-1 ring-gray-200 dark:ring-white/[0.08]"
                            />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-400 dark:bg-white/[0.05]">
                              <ImageIcon size={14} />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-800 dark:text-white">{unit.name}</p>
                            <p className="truncate text-xs text-gray-400">{unit.floor || unit.area || "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">{unit.type || "—"}</td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-gray-800 dark:text-white">{unit.brand || "—"}</p>
                        <p className="text-xs text-gray-400">{unit.model || "—"}</p>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={12} className="text-gray-400" />
                          {siteName(unit.siteId)}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <StatusPill label={unit.status} tone={statusTone(unit.status)} />
                      </td>
                      <td className=" group-hover:bg-gray-50/80 dark:group-hover:bg-white/[0.02] px-5 py-4" onClick={(e) => e.stopPropagation()}>
                        <RowActions
                          unit={unit}
                          onView={setToView}
                          onEdit={setToEdit}
                          onDelete={setToDelete}
                          canEdit={canEdit}
                          canDelete={canDelete}
                          canCreate={canCreate}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="divide-y divide-gray-100 dark:divide-white/[0.04] md:hidden">
              {filtered.map((unit) => (
                <div
                  key={unit.id}
                  onClick={() => setToView(unit)}
                  className="cursor-pointer space-y-2.5 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-gray-800 dark:text-white">{unit.code}</p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">{unit.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill label={unit.status} tone={statusTone(unit.status)} />
                      <RowActions
                        unit={unit}
                        onView={setToView}
                        onEdit={setToEdit}
                        onDelete={setToDelete}
                        canEdit={canEdit}
                        canDelete={canDelete}
                        canCreate={canCreate}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-400">
                    {unit.brand && <span>{unit.brand}</span>}
                    {unit.model && <span>{unit.model}</span>}
                    {unit.type && <span>{unit.type}</span>}
                  </div>
                  <p className="text-xs text-gray-400">
                    {siteName(unit.siteId)}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modals / Drawer */}
      {showCreate && <AcCreateModal onClose={() => setShowCreate(false)} />}
      {toEdit && <AcEditModal unit={toEdit} onClose={() => setToEdit(null)} />}
      {toView && !serviceTarget && (
        <AcDetailDrawer
          unit={toView}
          onClose={() => setToView(null)}
          onEdit={(u) => { setToView(null); setToEdit(u); }}
          onAddService={(u) => { setToView(null); setServiceTarget(u); }}
          onDelete={(u) => { setToView(null); setToDelete(u); }}
          loadDetail={getUnitDetail}
        />
      )}
      {serviceTarget && (
        <AcServiceModal
          unit={serviceTarget}
          onClose={() => setServiceTarget(null)}
        />
      )}
      {toDelete && (
        <AcDeleteConfirm
          unit={toDelete}
          onConfirm={handleConfirmDelete}
          onCancel={() => setToDelete(null)}
          loading={deleting}
        />
      )}

      {/* Si algo salió cargando, muestra un aviso discreto */}
      {units.length === 0 && !showCreate && (
        <div className="hidden">
          <AlertTriangle size={0} />
        </div>
      )}
    </div>
  );
}
