import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { useAssets } from "../../../hooks/useAssets";
import { usePermissions } from "../../../hooks/usePermissions";
import { ModulePageHeader } from "../../../components/features/modules/ModulePageHeader";
import { RowActionMenu } from "../../../components/ui/table/RowActionMenu";
import {
  Plus, Search, Wrench, AlertTriangle, Clock, CheckCircle2,
  Calendar, User, Pencil, Trash2, ChevronDown, X, Loader2,
  LayoutGrid, Table2, GripVertical, Cpu,
} from "lucide-react";
import {
  useMaintenancesList,
  useCreateMaintenance,
  useUpdateMaintenance,
  useCompleteMaintenance,
  useDeleteMaintenance,
  type Maintenance,
  type MaintenanceType,
  type MaintenanceCategory,
  type CadenceKind,
  type MaintenanceInput,
} from "../../../hooks/useMaintenancesV2";
import { MaintenanceFormModal } from "../../Mantenimientos/components/MaintenanceFormModal";

// ─── Mapeo de estados v2 → columnas kanban ────────────────────────────────────

type KanbanStatus = "Pendiente" | "En proceso" | "Completado";

function toKanban(status: Maintenance["status"]): KanbanStatus {
  if (status === "En curso")           return "En proceso";
  if (status === "Completado")         return "Completado";
  if (status === "Cancelado")          return "Completado"; // aparece en completados
  return "Pendiente"; // Programado | PendienteAtencion
}

// Para cambiar estado desde el kanban, mapeamos hacia v2
function fromKanban(k: KanbanStatus): Maintenance["status"] {
  if (k === "En proceso")  return "En curso";
  if (k === "Completado")  return "Completado";
  return "Programado";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-EC", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function daysUntil(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(iso); d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

const COLUMNS: KanbanStatus[] = ["Pendiente", "En proceso", "Completado"];
const COMPLETED_PREVIEW = 5;

const COLUMN_CONFIG: Record<KanbanStatus, {
  label: string; icon: React.ReactNode; accent: string;
  headerBg: string; countBg: string; countText: string; iconColor: string;
}> = {
  Pendiente: {
    label: "Pendiente", icon: <Clock size={14} />, accent: "bg-amber-400",
    headerBg: "bg-amber-50 dark:bg-amber-500/10",
    countBg: "bg-amber-100 dark:bg-amber-500/20",
    countText: "text-amber-700 dark:text-amber-400",
    iconColor: "text-amber-500",
  },
  "En proceso": {
    label: "En proceso", icon: <Wrench size={14} />, accent: "bg-blue-400",
    headerBg: "bg-blue-50 dark:bg-blue-500/10",
    countBg: "bg-blue-100 dark:bg-blue-500/20",
    countText: "text-blue-700 dark:text-blue-400",
    iconColor: "text-blue-500",
  },
  Completado: {
    label: "Completado", icon: <CheckCircle2 size={14} />, accent: "bg-emerald-400",
    headerBg: "bg-emerald-50 dark:bg-emerald-500/10",
    countBg: "bg-emerald-100 dark:bg-emerald-500/20",
    countText: "text-emerald-700 dark:text-emerald-400",
    iconColor: "text-emerald-500",
  },
};

// v2 status badge config
const STATUS_DOT: Record<Maintenance["status"], string> = {
  Programado:        "bg-violet-400",
  "En curso":        "bg-sky-400",
  PendienteAtencion: "bg-rose-400",
  Completado:        "bg-emerald-400",
  Cancelado:         "bg-gray-400",
};
const STATUS_LABEL: Record<Maintenance["status"], string> = {
  Programado:        "Programado",
  "En curso":        "En curso",
  PendienteAtencion: "Pendiente atención",
  Completado:        "Completado",
  Cancelado:         "Cancelado",
};

// ─── Card actions ─────────────────────────────────────────────────────────────

function CardActions({ item, onEdit, onDelete, onStatusChange, canEdit, canDelete }: {
  item: Maintenance;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (s: KanbanStatus) => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const current = toKanban(item.status);
  const otherStatuses = COLUMNS.filter(s => s !== current);

  return (
    <RowActionMenu
      ariaLabel="Acciones del mantenimiento"
      items={[
        ...(canEdit ? otherStatuses.map(s => ({
          label: `Mover a ${s}`,
          icon: COLUMN_CONFIG[s].icon,
          onClick: () => onStatusChange(s),
          tone: "default" as const,
        })) : []),
        { label: "Editar",   icon: <Pencil size={13} />, onClick: onEdit,   tone: "default", disabled: !canEdit },
        { label: "Eliminar", icon: <Trash2 size={13} />, onClick: onDelete, tone: "danger",  disabled: !canDelete || current === "Completado" },
      ]}
    />
  );
}

// ─── Kanban card ──────────────────────────────────────────────────────────────

function KanbanCard({
  item, onEdit, onDelete, onStatusChange, isDragging, canEdit, canDelete,
}: {
  item: Maintenance;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (s: KanbanStatus) => void;
  isDragging?: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const days = daysUntil(item.scheduledFor);
  const isOverdue = days < 0 && item.status !== "Completado" && item.status !== "Cancelado";
  const isSoon    = days >= 0 && days <= 3 && item.status !== "Completado";

  return (
    <div className={`group rounded-2xl border bg-white dark:bg-white/[0.03] p-4 shadow-sm transition-all
      ${isDragging
        ? "rotate-1 scale-105 shadow-xl border-orange-300 dark:border-orange-500/40"
        : "border-gray-200 dark:border-white/[0.06] hover:shadow-md dark:hover:bg-white/[0.05]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {canEdit && <GripVertical size={14} className="cursor-grab text-gray-300 dark:text-gray-600" />}
          {/* Status badge */}
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.04] px-2 py-0.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300">
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[item.status]}`} />
            {STATUS_LABEL[item.status]}
          </span>
        </div>
        <CardActions
          item={item}
          onEdit={onEdit}
          onDelete={onDelete}
          onStatusChange={onStatusChange}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      </div>

      <p className="mt-2.5 text-sm font-semibold leading-snug text-gray-800 dark:text-white">
        {item.title ?? item.category}
      </p>
      <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{item.type}</p>

      {/* Asset */}
      <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-gray-50 dark:bg-white/[0.04] px-2.5 py-1.5">
        <Cpu size={12} className="shrink-0 text-orange-400" />
        <span className="truncate text-xs font-medium text-gray-600 dark:text-gray-300">
          {item.assetPlate ? `${item.assetPlate} · ${item.assetName ?? ""}` : (item.assetName ?? "—")}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className={`flex items-center gap-1.5 text-xs ${
          isOverdue ? "text-rose-500" : isSoon ? "text-amber-500" : "text-gray-400 dark:text-gray-500"
        }`}>
          <Calendar size={11} />
          <span>{fmtDate(item.scheduledFor)}</span>
          {isOverdue && <span className="font-semibold">· {Math.abs(days)}d atrás</span>}
          {isSoon && !isOverdue && <span className="font-semibold">· {days === 0 ? "Hoy" : `${days}d`}</span>}
        </div>
        {item.workshopName && (
          <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
            <Wrench size={11} />
            <span className="max-w-[80px] truncate">{item.workshopName}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Kanban column ────────────────────────────────────────────────────────────

function KanbanColumn({
  status, items, onEdit, onDelete, onStatusChange, onDrop, canEdit, canDelete,
}: {
  status: KanbanStatus;
  items: Maintenance[];
  onEdit: (item: Maintenance) => void;
  onDelete: (item: Maintenance) => void;
  onStatusChange: (item: Maintenance, s: KanbanStatus) => void;
  onDrop: (itemId: string, targetStatus: KanbanStatus) => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const cfg = COLUMN_CONFIG[status];
  const [isDragOver, setIsDragOver] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const isCompleted  = status === "Completado";
  const visibleItems = isCompleted && !showAll ? items.slice(0, COMPLETED_PREVIEW) : items;
  const hiddenCount  = isCompleted ? items.length - COMPLETED_PREVIEW : 0;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className={`mb-3 flex items-center justify-between rounded-2xl border border-gray-200 dark:border-white/[0.06] px-4 py-3 ${cfg.headerBg}`}>
        <div className="flex items-center gap-2">
          <div className={`h-1.5 w-1.5 rounded-full ${cfg.accent}`} />
          <span className={`flex items-center gap-1.5 text-sm font-semibold ${cfg.iconColor}`}>
            {cfg.icon}
            <span className="text-gray-700 dark:text-gray-200">{cfg.label}</span>
          </span>
        </div>
        <span className={`rounded-lg px-2 py-0.5 text-xs font-bold ${cfg.countBg} ${cfg.countText}`}>
          {items.length}
        </span>
      </div>

      <div
        onDragOver={e => { if (!canEdit) return; e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={e => {
          e.preventDefault(); setIsDragOver(false);
          if (!canEdit) return;
          const itemId     = e.dataTransfer.getData("itemId");
          const fromStatus = e.dataTransfer.getData("fromStatus");
          if (itemId && fromStatus !== status) onDrop(itemId, status);
        }}
        className={`flex min-h-[120px] flex-col gap-3 rounded-2xl border-2 border-dashed p-1 transition-all
          ${isDragOver
            ? "border-orange-400 bg-orange-50/50 dark:border-orange-500/50 dark:bg-orange-500/5"
            : "border-transparent"
          }`}
      >
        {visibleItems.length === 0 && !isDragOver ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-200 dark:border-white/[0.06] py-10">
            <Wrench size={18} className="text-gray-300 dark:text-gray-600" />
            <p className="text-xs text-gray-400 dark:text-gray-500">Sin registros</p>
          </div>
        ) : (
          visibleItems.map(item => (
            <div
              key={item.id}
              draggable={canEdit}
              onDragStart={e => {
                if (!canEdit) return;
                e.dataTransfer.setData("itemId", item.id);
                e.dataTransfer.setData("fromStatus", status);
                setDraggingId(item.id);
              }}
              onDragEnd={() => setDraggingId(null)}
            >
              <KanbanCard
                item={item}
                onEdit={() => onEdit(item)}
                onDelete={() => onDelete(item)}
                onStatusChange={s => onStatusChange(item, s)}
                isDragging={draggingId === item.id}
                canEdit={canEdit}
                canDelete={canDelete}
              />
            </div>
          ))
        )}

        {isCompleted && items.length > COMPLETED_PREVIEW && (
          <button
            type="button"
            onClick={() => setShowAll(v => !v)}
            className="rounded-xl border border-gray-200 dark:border-white/[0.06] py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 transition hover:bg-gray-50 dark:hover:bg-white/[0.03]"
          >
            {showAll ? "Ver menos" : `Ver ${hiddenCount} más`}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Table view ───────────────────────────────────────────────────────────────

function TableView({
  items, onEdit, onDelete, onStatusChange, canEdit, canDelete,
}: {
  items: Maintenance[];
  onEdit: (item: Maintenance) => void;
  onDelete: (item: Maintenance) => void;
  onStatusChange: (item: Maintenance, s: KanbanStatus) => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [activeTab, setActiveTab] = useState<KanbanStatus>("Pendiente");

  const tabItems = useMemo(
    () => items.filter(m => toKanban(m.status) === activeTab),
    [items, activeTab],
  );

  const tabCount = (s: KanbanStatus) => items.filter(m => toKanban(m.status) === s).length;

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03]">
      {/* Tabs */}
      <div className="flex border-b border-gray-100 dark:border-white/[0.06]">
        {COLUMNS.map(s => {
          const cfg = COLUMN_CONFIG[s];
          return (
            <button
              key={s}
              type="button"
              onClick={() => setActiveTab(s)}
              className={`flex items-center gap-2 border-b-2 px-5 py-3.5 text-sm font-semibold transition
                ${activeTab === s
                  ? `${cfg.iconColor} border-current bg-gray-50/50 dark:bg-white/[0.02]`
                  : "border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                }`}
            >
              {cfg.icon}
              {s}
              <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold
                ${activeTab === s ? `${cfg.countBg} ${cfg.countText}` : "bg-gray-100 dark:bg-white/[0.05] text-gray-400"}`}>
                {tabCount(s)}
              </span>
            </button>
          );
        })}
      </div>

      {tabItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16">
          <Wrench size={20} className="text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-400 dark:text-gray-500">Sin registros en esta categoría</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/[0.06]">
                {["Vehículo", "Título", "Tipo", "Estado", "Taller", "Fecha", ""].map((h, i) => (
                  <th key={i} className={h ? "px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500" : ""}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
              {tabItems.map(item => {
                const days = daysUntil(item.scheduledFor);
                const isOverdue = days < 0 && item.status !== "Completado" && item.status !== "Cancelado";
                const isSoon    = days >= 0 && days <= 3 && item.status !== "Completado";
                return (
                  <tr key={item.id} className="group transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.02]">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <Cpu size={13} className="shrink-0 text-orange-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                            {item.assetPlate ?? item.assetName ?? "—"}
                          </p>
                          {item.assetPlate && item.assetName && (
                            <p className="text-[11px] text-gray-400">{item.assetName}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm font-semibold text-gray-800 dark:text-white">{item.title ?? "—"}</p>
                      <p className="mt-0.5 text-xs text-gray-400">{item.category}</p>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">{item.type}</td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
                        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[item.status]}`} />
                        {STATUS_LABEL[item.status]}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-400 dark:text-gray-500">
                      {item.workshopName ?? "—"}
                    </td>
                    <td className="px-5 py-4">
                      <div className={`flex items-center gap-1.5 text-sm ${
                        isOverdue ? "text-rose-500" : isSoon ? "text-amber-500" : "text-gray-500 dark:text-gray-400"
                      }`}>
                        <Calendar size={13} />
                        <span>{fmtDate(item.scheduledFor)}</span>
                        {isOverdue && <span className="text-xs font-semibold">({Math.abs(days)}d atrás)</span>}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => onEdit(item)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 dark:hover:bg-white/[0.08]"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                        {canEdit && COLUMNS.filter(s => s !== toKanban(item.status)).map(s => (
                          <button
                            key={s}
                            type="button"
                            title={`Mover a ${s}`}
                            onClick={() => onStatusChange(item, s)}
                            className={`flex h-7 w-7 items-center justify-center rounded-lg transition hover:bg-gray-100 dark:hover:bg-white/[0.08] ${COLUMN_CONFIG[s].iconColor}`}
                          >
                            {COLUMN_CONFIG[s].icon}
                          </button>
                        ))}
                        {canDelete && toKanban(item.status) !== "Completado" && (
                          <button
                            type="button"
                            onClick={() => onDelete(item)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-rose-400 transition hover:bg-rose-50 dark:hover:bg-rose-500/10"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                        {canDelete && toKanban(item.status) === "Completado" && (
                          <span
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-300 dark:text-gray-600 cursor-not-allowed"
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
      )}
    </div>
  );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ title, onConfirm, onCancel }: {
  title: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#0f1623] shadow-2xl">
        <div className="px-5 pb-4 pt-5">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-500/10">
            <AlertTriangle size={18} className="text-rose-500" />
          </div>
          <h3 className="text-base font-bold text-gray-800 dark:text-white">Eliminar mantenimiento</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            ¿Seguro que deseas eliminar{" "}
            <span className="font-semibold text-gray-700 dark:text-gray-200">{title}</span>?
            Esta acción no se puede deshacer.
          </p>
        </div>
        <div className="flex gap-2 border-t border-gray-100 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] px-5 py-4">
          <button type="button" onClick={onCancel}
            className="flex-1 rounded-xl border border-gray-200 dark:border-white/[0.08] py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 transition hover:bg-gray-100 dark:hover:bg-white/10">
            Cancelar
          </button>
          <button type="button" onClick={onConfirm}
            className="flex-1 rounded-xl bg-rose-500 py-2 text-sm font-semibold text-white transition hover:bg-rose-600">
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, tone }: {
  label: string; value: number;
  tone: "neutral" | "danger" | "info" | "warning";
}) {
  const t = {
    neutral: { bar: "bg-gray-300 dark:bg-gray-600", text: "text-gray-800 dark:text-white" },
    danger:  { bar: "bg-rose-400",                  text: "text-rose-600 dark:text-rose-400" },
    info:    { bar: "bg-blue-400",                  text: "text-blue-600 dark:text-blue-400" },
    warning: { bar: "bg-amber-400",                 text: "text-amber-600 dark:text-amber-400" },
  }[tone];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] p-5">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${t.bar} opacity-60`} />
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${t.text}`}>{value}</p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type ViewMode = "kanban" | "table";

export default function MotorMaintenancesRoute() {
  const { can } = usePermissions();
  const canCreate = can("motores", "mantenimientos_motor", "crear");
  const canEdit   = can("motores", "mantenimientos_motor", "editar");
  const canDelete = can("motores", "mantenimientos_motor", "eliminar");

  const [search, setSearch]     = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  // Rango de fechas del kanban. Por defecto muestra SOLO los del día de hoy.
  // El user puede expandir el rango con el date range o limpiarlo para ver todos.
  const todayIso = new Date().toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState<string>(todayIso);
  const [dateTo,   setDateTo]   = useState<string>(todayIso);
  const [dateRangeActive, setDateRangeActive] = useState<boolean>(true);

  // ── v2 hooks ──────────────────────────────────────────────────────────────
  const { data, isLoading } = useMaintenancesList({
    q: search || undefined,
    from: dateRangeActive ? dateFrom : undefined,
    to:   dateRangeActive ? dateTo   : undefined,
  });
  const allItems = data?.data ?? [];

  const updateMut   = useUpdateMaintenance();
  const completeMut = useCompleteMaintenance();
  const deleteMut   = useDeleteMaintenance();

  // ── Agrupar por columna kanban ─────────────────────────────────────────────
  const byKanban = useMemo(() => {
    const map: Record<KanbanStatus, Maintenance[]> = {
      Pendiente: [], "En proceso": [], Completado: [],
    };
    allItems.forEach(m => map[toKanban(m.status)].push(m));
    return map;
  }, [allItems]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:      allItems.length,
    pendiente:  allItems.filter(m => toKanban(m.status) === "Pendiente").length,
    enProceso:  allItems.filter(m => toKanban(m.status) === "En proceso").length,
    atrasados:  allItems.filter(m => daysUntil(m.scheduledFor) < 0 && m.status !== "Completado" && m.status !== "Cancelado").length,
  }), [allItems]);

  // ── Acciones ───────────────────────────────────────────────────────────────
  const handleDrop = useCallback(async (itemId: string, targetStatus: KanbanStatus) => {
    if (!canEdit) return;
    const item = allItems.find(m => m.id === itemId);
    if (!item) return;
    try {
      if (targetStatus === "Completado") {
        await completeMut.mutateAsync({ id: itemId, body: {} });
      } else {
        await updateMut.mutateAsync({ id: itemId, body: { status: fromKanban(targetStatus) } });
      }
      toast.success(`Movido a ${targetStatus}`, { description: item.title ?? undefined });
    } catch {
      toast.error("No se pudo mover el mantenimiento");
    }
  }, [allItems, completeMut, updateMut, canEdit]);

  const handleStatusChange = useCallback(async (item: Maintenance, newStatus: KanbanStatus) => {
    if (!canEdit) return;
    try {
      if (newStatus === "Completado") {
        await completeMut.mutateAsync({ id: item.id, body: {} });
      } else {
        await updateMut.mutateAsync({ id: item.id, body: { status: fromKanban(newStatus) } });
      }
      toast.success(`Movido a ${newStatus}`, { description: item.title ?? undefined });
    } catch {
      toast.error("No se pudo cambiar el estado");
    }
  }, [completeMut, updateMut, canEdit]);

  // ── Modal (reutiliza MaintenanceFormModal de v2) ───────────────────────────
  const [modalOpen, setModalOpen]   = useState(false);
  const [editing, setEditing]       = useState<Maintenance | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Maintenance | null>(null);

  const openCreate = () => { setEditing(null); setModalOpen(true); };
  const openEdit   = (item: Maintenance) => { setEditing(item); setModalOpen(true); };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
      toast.success("Mantenimiento eliminado");
    } catch {
      toast.error("No se pudo eliminar");
    }
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-6">
      <ModulePageHeader
        badge="Mantenimientos"
        title="Mantenimientos"
        subtitle="Vista kanban de todos los mantenimientos programados y en curso."
        accent="orange"
        action={
          canCreate ? (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-orange-500/20 transition hover:bg-orange-600 active:scale-95"
            >
              <Plus size={16} /> Nuevo
            </button>
          ) : null
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total"      value={stats.total}     tone="neutral" />
        <StatCard label="Pendientes" value={stats.pendiente} tone="warning" />
        <StatCard label="En proceso" value={stats.enProceso} tone="info"    />
        <StatCard label="Atrasados"  value={stats.atrasados} tone="danger"  />
      </div>

      {/* Toolbar */}
      <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por vehículo, título o taller…"
              className="h-10 w-full rounded-xl border border-gray-200 dark:border-white/[0.08] bg-transparent pl-9 pr-4 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/10 transition"
            />
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-1 rounded-xl border border-gray-200 dark:border-white/[0.08] p-1">
            {([
              { mode: "kanban" as const, icon: <LayoutGrid size={15} /> },
              { mode: "table"  as const, icon: <Table2 size={15} /> },
            ]).map(({ mode, icon }) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
                  viewMode === mode
                    ? "bg-orange-500 text-white shadow-sm"
                    : "text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.05]"
                }`}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Date range (default = hoy). Si el user lo desactiva, ve todos los mantenimientos. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] px-4 py-3 text-xs">
        <span className="font-semibold text-gray-500 dark:text-gray-400">Rango:</span>
        <label className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setDateRangeActive(true); }}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
          />
        </label>
        <span className="text-gray-400">→</span>
        <label className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setDateRangeActive(true); }}
            min={dateFrom}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
          />
        </label>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => { setDateFrom(todayIso); setDateTo(todayIso); setDateRangeActive(true); }}
            className={`rounded-md px-2.5 py-1 font-medium transition ${
              dateRangeActive && dateFrom === todayIso && dateTo === todayIso
                ? "bg-orange-500 text-white"
                : "text-gray-500 hover:text-gray-700 dark:hover:text-white"
            }`}
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => { setDateFrom(""); setDateTo(""); setDateRangeActive(false); }}
            className={`rounded-md px-2.5 py-1 font-medium transition ${
              !dateRangeActive
                ? "bg-orange-500 text-white"
                : "text-gray-500 hover:text-gray-700 dark:hover:text-white"
            }`}
          >
            Todos
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center gap-3 py-20 text-gray-400">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm">Cargando mantenimientos…</span>
        </div>
      ) : viewMode === "kanban" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5 md:items-start">
          {COLUMNS.map(status => (
            <KanbanColumn
              key={status}
              status={status}
              items={byKanban[status]}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
              onStatusChange={handleStatusChange}
              onDrop={handleDrop}
              canEdit={canEdit}
              canDelete={canDelete}
            />
          ))}
        </div>
      ) : (
        <TableView
          items={allItems}
          onEdit={openEdit}
          onDelete={setDeleteTarget}
          onStatusChange={handleStatusChange}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      )}

      {/* Modals */}
      <MaintenanceFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        prefill={null}
        maintenance={editing}
      />

      {deleteTarget && canDelete && (
        <DeleteConfirm
          title={deleteTarget.title ?? "este mantenimiento"}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}