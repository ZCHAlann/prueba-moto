import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useAssets } from "../../../hooks/useAssets";
import { useMaintenances } from "../../../hooks/useMaintenances";
import { useDrivers } from "../../../hooks/useDrivers";
import { usePermissions } from "../../../hooks/usePermissions";
import { ModulePageHeader } from "../../../components/features/modules/ModulePageHeader";
import { DatePicker } from "../../../components/ui/date-picker/DatePicker";
import {
  Plus, Search, Wrench, AlertTriangle, Clock, CheckCircle2,
  Calendar, User, MoreVertical, Pencil, Trash2, CheckCheck,
  Cpu, ChevronDown, X, Loader2, LayoutGrid, Table2,
  GripVertical,
} from "lucide-react";
import type { ApiMaintenance, MaintenancePriority, MaintenanceStatus } from "../../../hooks/useMaintenances";
import type { Asset } from "../../../types/activo";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

function daysUntil(dateStr: string): number {
  if (!dateStr) return Infinity;
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - TODAY.getTime()) / (1000 * 60 * 60 * 24));
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("es-EC", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const PRIORITY_ORDER: Record<MaintenancePriority, number> = {
  Emergente: 0, Alta: 1, Normal: 2, Programado: 3,
};

const PRIORITY_CONFIG: Record<MaintenancePriority, {
  bg: string; text: string; border: string; dot: string;
}> = {
  Emergente: {
    bg: "bg-rose-50 dark:bg-rose-500/10",
    text: "text-rose-600 dark:text-rose-400",
    border: "border-rose-200 dark:border-rose-500/20",
    dot: "bg-rose-500",
  },
  Alta: {
    bg: "bg-orange-50 dark:bg-orange-500/10",
    text: "text-orange-600 dark:text-orange-400",
    border: "border-orange-200 dark:border-orange-500/20",
    dot: "bg-orange-500",
  },
  Normal: {
    bg: "bg-blue-50 dark:bg-blue-500/10",
    text: "text-blue-600 dark:text-blue-400",
    border: "border-blue-200 dark:border-blue-500/20",
    dot: "bg-blue-400",
  },
  Programado: {
    bg: "bg-gray-100 dark:bg-white/[0.05]",
    text: "text-gray-500 dark:text-gray-400",
    border: "border-gray-200 dark:border-white/[0.06]",
    dot: "bg-gray-400",
  },
};

const COLUMN_CONFIG: Record<MaintenanceStatus, {
  label: string; icon: React.ReactNode; accent: string;
  headerBg: string; countBg: string; countText: string;
  iconColor: string;
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

const COLUMNS: MaintenanceStatus[] = ["Pendiente", "En proceso", "Completado"];
const COMPLETED_PREVIEW = 5;

// ─── Types ────────────────────────────────────────────────────────────────────

type ModalMode = "create" | "edit";
type ViewMode = "kanban" | "table";
type TableTab = MaintenanceStatus;

type FormState = {
  assetId: string; title: string; kind: string;
  priority: MaintenancePriority; status: MaintenanceStatus;
  scheduledDate: string; dueDate: string; responsible: string; notes: string;
};

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function Field({ label, children, required }: {
  label: string; children: React.ReactNode; required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}{required && <span className="ml-1 text-rose-400">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = "h-10 w-full rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.05] px-3 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/10 transition";
const selectCls = inputCls + " cursor-pointer appearance-none dark:bg-gray-800";

// ─── Custom select for responsible ───────────────────────────────────────────

function ResponsibleSelect({
  value, onChange, drivers, loading,
}: {
  value: string;
  onChange: (v: string) => void;
  drivers: { id: string; name: string; firstName: string; lastName: string }[];
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = drivers.find(d => d.name === value);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  if (loading) return (
    <div className="flex h-10 items-center gap-2 rounded-xl border border-gray-200 px-3 dark:border-white/[0.08]">
      <Loader2 size={13} className="animate-spin text-gray-400" />
      <span className="text-sm text-gray-400">Cargando...</span>
    </div>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={inputCls + " flex items-center justify-between text-left"}
      >
        <span className={selected ? "text-gray-800 dark:text-white" : "text-gray-400"}>
          {selected ? `${selected.firstName} ${selected.lastName}` : "— Sin asignar —"}
        </span>
        <ChevronDown size={14} className={`shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-white/[0.08] dark:bg-gray-900">
          <div className="max-h-48 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className="w-full px-3 py-2 text-left text-sm text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.05]"
            >
              — Sin asignar —
            </button>
            {drivers.map(d => (
              <button
                key={d.id}
                type="button"
                onClick={() => { onChange(d.name); setOpen(false); }}
                className={`w-full px-3 py-2 text-left text-sm transition hover:bg-gray-50 dark:hover:bg-white/[0.05]
                  ${d.name === value ? "font-semibold text-orange-500" : "text-gray-700 dark:text-gray-300"}`}
              >
                {d.firstName} {d.lastName}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Card actions dropdown ────────────────────────────────────────────────────

function CardActions({ item, onEdit, onDelete, onStatusChange, canEdit, canDelete }: {
  item: ApiMaintenance;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (s: MaintenanceStatus) => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const otherStatuses = COLUMNS.filter(s => s !== item.status);
  const hasActions = canEdit || canDelete || otherStatuses.length > 0;
  if (!hasActions) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.08] dark:hover:text-gray-300"
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 w-48 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-white/[0.08] dark:bg-gray-900">
          {/* Mover a — siempre visible si hay editar */}
          {canEdit && otherStatuses.map(s => {
            const cfg = COLUMN_CONFIG[s];
            return (
              <button
                key={s}
                type="button"
                onClick={() => { setOpen(false); onStatusChange(s); }}
                className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm transition hover:bg-gray-50 dark:hover:bg-white/[0.05] ${cfg.iconColor}`}
              >
                {cfg.icon}
                <span className="text-gray-700 dark:text-gray-300">Mover a {s}</span>
              </button>
            );
          })}
          {canEdit && (
            <>
              <div className="mx-3 border-t border-gray-100 dark:border-white/[0.06]" />
              <button
                type="button"
                onClick={() => { setOpen(false); onEdit(); }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-700 transition hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.05]"
              >
                <Pencil size={14} className="text-gray-400" />
                Editar
              </button>
            </>
          )}
          {canDelete && (
            <>
              <div className="mx-3 border-t border-gray-100 dark:border-white/[0.06]" />
              <button
                type="button"
                onClick={() => { setOpen(false); onDelete(); }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
              >
                <Trash2 size={14} />
                Eliminar
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Kanban card ──────────────────────────────────────────────────────────────

function KanbanCard({
  item, motorName, onEdit, onDelete, onStatusChange,
  isDragging, dragHandleProps, canEdit, canDelete,
}: {
  item: ApiMaintenance;
  motorName: string;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (s: MaintenanceStatus) => void;
  isDragging?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const days = daysUntil(item.dueDate);
  const isOverdue = days < 0 && item.status !== "Completado";
  const isSoon = days >= 0 && days <= 3 && item.status !== "Completado";
  const p = PRIORITY_CONFIG[item.priority] ?? PRIORITY_CONFIG["Normal"];

  return (
    <div className={`group rounded-2xl border bg-white p-4 shadow-sm transition-all
      ${isDragging
        ? "rotate-1 scale-105 shadow-xl border-orange-300 dark:border-orange-500/40"
        : "border-gray-200 hover:shadow-md dark:border-white/[0.06]"
      } dark:bg-white/[0.03] dark:hover:bg-white/[0.05]`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {canEdit && (
            <div
              {...dragHandleProps}
              className="cursor-grab text-gray-300 hover:text-gray-400 dark:text-gray-600 dark:hover:text-gray-500 active:cursor-grabbing"
            >
              <GripVertical size={14} />
            </div>
          )}
          <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-semibold ${p.bg} ${p.text} ${p.border}`}>
            {item.priority === "Emergente" && (
              <span className={`h-1.5 w-1.5 animate-pulse rounded-full ${p.dot}`} />
            )}
            {item.priority}
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
        {item.title}
      </p>
      <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{item.kind}</p>

      <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-1.5 dark:bg-white/[0.04]">
        <Cpu size={12} className="shrink-0 text-orange-400" />
        <span className="truncate text-xs font-medium text-gray-600 dark:text-gray-300">{motorName}</span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className={`flex items-center gap-1.5 text-xs ${
          isOverdue ? "text-rose-500" : isSoon ? "text-amber-500" : "text-gray-400 dark:text-gray-500"
        }`}>
          <Calendar size={11} />
          <span>{fmtDate(item.dueDate)}</span>
          {isOverdue && <span className="font-semibold">· {Math.abs(days)}d atrás</span>}
          {isSoon && !isOverdue && <span className="font-semibold">· {days === 0 ? "Hoy" : `${days}d`}</span>}
        </div>
        {item.technician && (
          <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
            <User size={11} />
            <span className="max-w-[80px] truncate">{item.technician}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Kanban column ────────────────────────────────────────────────────────────

function KanbanColumn({
  status, items, motorMap, onEdit, onDelete, onStatusChange, onDrop, canEdit, canDelete,
}: {
  status: MaintenanceStatus;
  items: ApiMaintenance[];
  motorMap: Map<string, Asset>;
  onEdit: (item: ApiMaintenance) => void;
  onDelete: (item: ApiMaintenance) => void;
  onStatusChange: (item: ApiMaintenance, s: MaintenanceStatus) => void;
  onDrop: (itemId: string, targetStatus: MaintenanceStatus) => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const cfg = COLUMN_CONFIG[status];
  const [isDragOver, setIsDragOver] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const isCompleted = status === "Completado";
  const visibleItems = isCompleted && !showAll ? items.slice(0, COMPLETED_PREVIEW) : items;
  const hiddenCount = isCompleted ? items.length - COMPLETED_PREVIEW : 0;

  const handleDragStart = (e: React.DragEvent, id: string) => {
    if (!canEdit) return;
    e.dataTransfer.setData("itemId", id);
    e.dataTransfer.setData("fromStatus", status);
    setDraggingId(id);
  };

  const handleDragEnd = () => setDraggingId(null);

  const handleDragOver = (e: React.DragEvent) => {
    if (!canEdit) return;
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!canEdit) return;
    const itemId = e.dataTransfer.getData("itemId");
    const fromStatus = e.dataTransfer.getData("fromStatus");
    if (itemId && fromStatus !== status) onDrop(itemId, status);
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className={`mb-3 flex items-center justify-between rounded-2xl border border-gray-200 px-4 py-3 dark:border-white/[0.06] ${cfg.headerBg}`}>
        <div className="flex items-center gap-2">
          <div className={`h-1.5 w-1.5 rounded-full ${cfg.accent}`} />
          <span className={`flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-200 ${cfg.iconColor}`}>
            {cfg.icon}
            <span className="text-gray-700 dark:text-gray-200">{cfg.label}</span>
          </span>
        </div>
        <span className={`rounded-lg px-2 py-0.5 text-xs font-bold ${cfg.countBg} ${cfg.countText}`}>
          {items.length}
        </span>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex min-h-[120px] flex-col gap-3 rounded-2xl border-2 border-dashed p-1 transition-all
          ${isDragOver
            ? "border-orange-400 bg-orange-50/50 dark:border-orange-500/50 dark:bg-orange-500/5"
            : "border-transparent"
          }`}
      >
        {visibleItems.length === 0 && !isDragOver ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-200 py-10 dark:border-white/[0.06]">
            <Wrench size={18} className="text-gray-300 dark:text-gray-600" />
            <p className="text-xs text-gray-400 dark:text-gray-500">Sin registros</p>
          </div>
        ) : (
          visibleItems.map(item => (
            <div
              key={item.id}
              draggable={canEdit}
              onDragStart={e => handleDragStart(e, item.id)}
              onDragEnd={handleDragEnd}
            >
              <KanbanCard
                item={item}
                motorName={motorMap.get(item.assetId)?.name ?? item.assetId}
                onEdit={() => onEdit(item)}
                onDelete={() => onDelete(item)}
                onStatusChange={s => onStatusChange(item, s)}
                isDragging={draggingId === item.id}
                dragHandleProps={{}}
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
            className="rounded-xl border border-gray-200 py-2 text-xs font-semibold text-gray-500 transition hover:bg-gray-50 dark:border-white/[0.06] dark:text-gray-400 dark:hover:bg-white/[0.03]"
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
  items, motorMap, onEdit, onDelete, onStatusChange, canEdit, canDelete,
}: {
  items: ApiMaintenance[];
  motorMap: Map<string, Asset>;
  onEdit: (item: ApiMaintenance) => void;
  onDelete: (item: ApiMaintenance) => void;
  onStatusChange: (item: ApiMaintenance, s: MaintenanceStatus) => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [activeTab, setActiveTab] = useState<TableTab>("Pendiente");

  const tabItems = useMemo(
    () => items.filter(m => m.status === activeTab).sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]),
    [items, activeTab]
  );

  const tabCount = (s: TableTab) => items.filter(m => m.status === s).length;

  const tabConfig: { status: TableTab; icon: React.ReactNode; activeClass: string }[] = [
    { status: "Pendiente",  icon: <Clock size={13} />,        activeClass: "border-amber-400 text-amber-600 dark:text-amber-400" },
    { status: "En proceso", icon: <Wrench size={13} />,       activeClass: "border-blue-400 text-blue-600 dark:text-blue-400" },
    { status: "Completado", icon: <CheckCircle2 size={13} />, activeClass: "border-emerald-400 text-emerald-600 dark:text-emerald-400" },
  ];

  const showActionsColumn = canEdit || canDelete;

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]">
      <div className="flex border-b border-gray-100 dark:border-white/[0.06]">
        {tabConfig.map(({ status, icon, activeClass }) => (
          <button
            key={status}
            type="button"
            onClick={() => setActiveTab(status)}
            className={`flex items-center gap-2 border-b-2 px-5 py-3.5 text-sm font-semibold transition
              ${activeTab === status
                ? activeClass + " bg-gray-50/50 dark:bg-white/[0.02]"
                : "border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              }`}
          >
            {icon}
            {status}
            <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold
              ${activeTab === status
                ? COLUMN_CONFIG[status].countBg + " " + COLUMN_CONFIG[status].countText
                : "bg-gray-100 text-gray-400 dark:bg-white/[0.05]"
              }`}
            >
              {tabCount(status)}
            </span>
          </button>
        ))}
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
                {["Motor", "Trabajo", "Prioridad", "Responsable", "Fecha límite", showActionsColumn ? "" : null]
                  .filter(Boolean)
                  .map((h, i) => (
                    <th key={i} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                      {h}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
              {tabItems.map(item => {
                const days = daysUntil(item.dueDate);
                const isOverdue = days < 0 && item.status !== "Completado";
                const isSoon = days >= 0 && days <= 3 && item.status !== "Completado";
                const p = PRIORITY_CONFIG[item.priority] ?? PRIORITY_CONFIG["Normal"];
                return (
                  <tr key={item.id} className="group transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.02]">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <Cpu size={13} className="shrink-0 text-orange-400" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                          {motorMap.get(item.assetId)?.name ?? item.assetId}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm font-semibold text-gray-800 dark:text-white">{item.title}</p>
                      <p className="mt-0.5 text-xs text-gray-400">{item.kind}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-semibold ${p.bg} ${p.text} ${p.border}`}>
                        {item.priority === "Emergente" && (
                          <span className={`h-1.5 w-1.5 animate-pulse rounded-full ${p.dot}`} />
                        )}
                        {item.priority}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                        <User size={13} className="text-gray-400" />
                        {item.technician || "—"}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className={`flex items-center gap-1.5 text-sm ${
                        isOverdue ? "text-rose-500" : isSoon ? "text-amber-500" : "text-gray-500 dark:text-gray-400"
                      }`}>
                        <Calendar size={13} />
                        <span>{fmtDate(item.dueDate)}</span>
                        {isOverdue && <span className="text-xs font-semibold">({Math.abs(days)}d atrás)</span>}
                      </div>
                    </td>
                    {showActionsColumn && (
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => onEdit(item)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.08]"
                            >
                              <Pencil size={13} />
                            </button>
                          )}
                          {canEdit && COLUMNS.filter(s => s !== item.status).map(s => (
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
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => onDelete(item)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-rose-400 transition hover:bg-rose-50 dark:hover:bg-rose-500/10"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
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

// ─── Maintenance modal ────────────────────────────────────────────────────────

function MaintenanceModal({
  mode, initial, motors, drivers, driversLoading, onClose, onSubmit,
}: {
  mode: ModalMode; initial: FormState; motors: Asset[];
  drivers: any[]; driversLoading: boolean;
  onClose: () => void;
  onSubmit: (form: FormState) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const set = (key: keyof FormState, value: string) =>
    setForm(f => ({ ...f, [key]: value }));

  const isValid = form.assetId && form.title && form.dueDate;

  const handleSubmit = async () => {
    if (!isValid) return;
    setSaving(true);
    await onSubmit(form);
    setSaving(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0f1623]">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 pb-4 pt-5 sm:px-6 dark:border-white/[0.06]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
              {mode === "create" ? "Nuevo mantenimiento" : "Editar mantenimiento"}
            </p>
            <h2 className="mt-0.5 text-base font-bold text-gray-800 dark:text-white">
              {mode === "create" ? "Registrar trabajo técnico" : form.title || "Editar trabajo"}
            </h2>
          </div>
          <button type="button" onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 dark:hover:bg-white/10"
          >
            <X size={16} />
          </button>
        </div>
        <div className="h-0.5 w-full bg-orange-500" />

        <div className="max-h-[60vh] overflow-y-auto px-4 py-5 sm:px-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Motor" required>
                <div className="relative">
                  <select className={selectCls} value={form.assetId} onChange={e => set("assetId", e.target.value)}>
                    <option value="">Seleccionar motor...</option>
                    {motors.map(m => (
                      <option key={m.id} value={m.id}>{m.name} — {m.code}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
              </Field>
            </div>

            <div className="sm:col-span-2">
              <Field label="Título del trabajo" required>
                <input className={inputCls} value={form.title} onChange={e => set("title", e.target.value)} placeholder="Ej: Cambio de rodamientos" />
              </Field>
            </div>

            <Field label="Tipo">
              <div className="relative">
                <select className={selectCls} value={form.kind} onChange={e => set("kind", e.target.value)}>
                  {["Preventivo", "Correctivo", "Predictivo", "Emergencia"].map(o => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
            </Field>

            <Field label="Prioridad">
              <div className="relative">
                <select className={selectCls} value={form.priority} onChange={e => set("priority", e.target.value as MaintenancePriority)}>
                  {(["Normal", "Alta", "Emergente", "Programado"] as MaintenancePriority[]).map(o => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
            </Field>

            <Field label="Estado">
              <div className="relative">
                <select className={selectCls} value={form.status} onChange={e => set("status", e.target.value as MaintenanceStatus)}>
                  {(["Pendiente", "En proceso", "Completado"] as MaintenanceStatus[]).map(o => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
            </Field>

            <Field label="Responsable">
              <ResponsibleSelect
                value={form.responsible}
                onChange={v => set("responsible", v)}
                drivers={drivers}
                loading={driversLoading}
              />
            </Field>

            <Field label="Fecha inicio">
              <DatePicker
                value={form.scheduledDate}
                onChange={(v) => set("scheduledDate", v)}
                placeholder="Seleccionar"
              />
            </Field>

            <Field label="Fecha límite" required>
              <DatePicker
                value={form.dueDate}
                onChange={(v) => set("dueDate", v)}
                placeholder="Seleccionar"
              />
            </Field>

            <div className="sm:col-span-2">
              <Field label="Notas">
                <textarea
                  rows={3}
                  className="w-full resize-none rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.05] px-3 py-2.5 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/10 transition"
                  value={form.notes}
                  onChange={e => set("notes", e.target.value)}
                  placeholder="Observaciones adicionales..."
                />
              </Field>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-100 bg-gray-50 px-4 py-4 sm:flex-row sm:justify-end sm:px-6 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <button type="button" onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-100 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/10"
          >
            Cancelar
          </button>
          <button type="button" onClick={handleSubmit} disabled={saving || !isValid}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-orange-500/20 transition hover:bg-orange-600 active:scale-95 disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? "Guardando..." : mode === "create" ? "Crear mantenimiento" : "Guardar cambios"}
          </button>
        </div>
      </div>
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
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0f1623]">
        <div className="px-4 pb-4 pt-5 sm:px-6">
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
        <div className="flex flex-col-reverse items-stretch gap-2 border-t border-gray-100 bg-gray-50 px-4 py-4 sm:flex-row sm:items-center sm:px-6 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <button type="button" onClick={onCancel}
            className="flex-1 rounded-xl border border-gray-200 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-100 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/10"
          >
            Cancelar
          </button>
          <button type="button" onClick={onConfirm}
            className="flex-1 rounded-xl bg-rose-500 py-2 text-sm font-semibold text-white transition hover:bg-rose-600 active:scale-95"
          >
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
    neutral: { bar: "bg-gray-300 dark:bg-gray-600",  text: "text-gray-800 dark:text-white" },
    danger:  { bar: "bg-rose-400",                   text: "text-rose-600 dark:text-rose-400" },
    info:    { bar: "bg-blue-400",                   text: "text-blue-600 dark:text-blue-400" },
    warning: { bar: "bg-amber-400",                  text: "text-amber-600 dark:text-amber-400" },
  }[tone];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/[0.06] dark:bg-white/[0.03]">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${t.bar} opacity-60`} />
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${t.text}`}>{value}</p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type FilterPriority = "Todas" | MaintenancePriority;

export default function MotorMaintenancesRoute() {
  const { assets, loading: loadingAssets } = useAssets();
  const {
    maintenances, loading: loadingMaint,
    createMaintenance, updateMaintenance, deleteMaintenance, completeMaintenance,
  } = useMaintenances();
  const { drivers, loading: driversLoading } = useDrivers();
  const { can } = usePermissions();

  const canCreate = can("motores", "mantenimientos_motor", "crear");
  const canEdit   = can("motores", "mantenimientos_motor", "editar");
  const canDelete = can("motores", "mantenimientos_motor", "eliminar");

  const motors = useMemo(() => assets.filter(a => a.assetType === "Motor"), [assets]);
  const motorIds = useMemo(() => new Set(motors.map(m => m.id)), [motors]);
  const motorMap = useMemo(() => new Map(motors.map(m => [m.id, m])), [motors]);

  const motorMaintenances = useMemo(
    () => maintenances.filter(m => motorIds.has(m.assetId)),
    [maintenances, motorIds]
  );

  const [filterPriority, setFilterPriority] = useState<FilterPriority>("Todas");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");

  const filteredAll = useMemo(() => {
    return motorMaintenances
      .filter(m => filterPriority === "Todas" || m.priority === filterPriority)
      .filter(m => {
        if (!search) return true;
        const q = search.toLowerCase();
        const motor = motorMap.get(m.assetId);
        return (
          m.title.toLowerCase().includes(q) ||
          (motor?.name ?? "").toLowerCase().includes(q) ||
          m.technician.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  }, [motorMaintenances, filterPriority, search, motorMap]);

  const byStatus = useMemo(() => {
    const map: Record<MaintenanceStatus, ApiMaintenance[]> = {
      Pendiente: [], "En proceso": [], Completado: [],
    };
    filteredAll.forEach(m => map[m.status].push(m));
    return map;
  }, [filteredAll]);

  const stats = useMemo(() => ({
    total:      motorMaintenances.length,
    emergentes: motorMaintenances.filter(m => m.priority === "Emergente").length,
    enProceso:  motorMaintenances.filter(m => m.status === "En proceso").length,
    atrasados:  motorMaintenances.filter(m => daysUntil(m.dueDate) < 0 && m.status !== "Completado").length,
  }), [motorMaintenances]);

  const getDefaultResponsible = useCallback((assetId: string) => {
    const motor = motorMap.get(assetId);
    if (!motor?.responsible) return "";
    const driver = drivers.find(d => d.name === motor.responsible);
    return driver ? driver.name : motor.responsible;
  }, [motorMap, drivers]);

  const [modal, setModal] = useState<{ mode: ModalMode; form: FormState; id?: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiMaintenance | null>(null);

  const openCreate = () => setModal({
    mode: "create",
    form: {
      assetId: "", title: "", kind: "Preventivo", priority: "Normal",
      status: "Pendiente", scheduledDate: todayISO(), dueDate: "", responsible: "", notes: "",
    },
  });

  const openEdit = (item: ApiMaintenance) =>
    setModal({
      mode: "edit", id: item.id,
      form: {
        assetId: item.assetId, title: item.title, kind: item.kind,
        priority: item.priority, status: item.status,
        scheduledDate: item.scheduledDate, dueDate: item.dueDate,
        responsible: item.technician, notes: item.notes,
      },
    });

  const handleSubmit = async (form: FormState) => {
    try {
      if (modal?.mode === "create") {
        await createMaintenance({
          assetId: form.assetId, title: form.title,
          kind: form.kind as ApiMaintenance["kind"],
          priority: form.priority, status: form.status,
          scheduledDate: form.scheduledDate, dueDate: form.dueDate,
          completedDate: null, technician: form.responsible,
          laborCost: 0, partsCost: 0,
          photoUrls: [], notes: form.notes,
        });
        toast.success("Mantenimiento creado", { description: form.title });
      } else if (modal?.mode === "edit" && modal.id) {
        await updateMaintenance(modal.id, {
          assetId: form.assetId, title: form.title,
          kind: form.kind as ApiMaintenance["kind"],
          priority: form.priority, status: form.status,
          scheduledDate: form.scheduledDate, dueDate: form.dueDate,
          technician: form.responsible, notes: form.notes,
        });
        toast.success("Cambios guardados", { description: form.title });
      }
    } catch {
      toast.error("No se pudo guardar", { description: "Intenta de nuevo." });
    }
    setModal(null);
  };

  const handleDrop = useCallback(async (itemId: string, targetStatus: MaintenanceStatus) => {
    if (!canEdit) return;
    const item = motorMaintenances.find(m => m.id === itemId);
    if (!item) return;
    try {
      if (targetStatus === "Completado") {
        await completeMaintenance(itemId, todayISO());
      } else {
        await updateMaintenance(itemId, { status: targetStatus });
      }
      toast.success(`Movido a ${targetStatus}`, { description: item.title });
    } catch {
      toast.error("No se pudo mover el mantenimiento");
    }
  }, [motorMaintenances, completeMaintenance, updateMaintenance, canEdit]);

  const handleStatusChange = useCallback(async (item: ApiMaintenance, newStatus: MaintenanceStatus) => {
    if (!canEdit) return;
    try {
      if (newStatus === "Completado") {
        await completeMaintenance(item.id, todayISO());
      } else {
        await updateMaintenance(item.id, { status: newStatus });
      }
      toast.success(`Movido a ${newStatus}`, { description: item.title });
    } catch {
      toast.error("No se pudo cambiar el estado");
    }
  }, [completeMaintenance, updateMaintenance, canEdit]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMaintenance(deleteTarget.id);
      toast.success("Mantenimiento eliminado");
    } catch {
      toast.error("No se pudo eliminar");
    }
    setDeleteTarget(null);
  };

  const loading = loadingAssets || loadingMaint;

  return (
    <div className="space-y-6">
      <ModulePageHeader
        badge="Dominio técnico"
        title="Mantenimientos"
        subtitle="Gestión de trabajos técnicos para motores registrados."
        accent="orange"
        action={
          canCreate ? (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-orange-500/20 transition hover:bg-orange-600 active:scale-95"
            >
              <Plus size={16} />
              Nuevo
            </button>
          ) : null
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:gap-5 sm:grid-cols-3 md:grid-cols-4">
        <StatCard label="Total"      value={stats.total}      tone="neutral" />
        <StatCard label="Emergentes" value={stats.emergentes} tone="danger"  />
        <StatCard label="En proceso" value={stats.enProceso}  tone="info"    />
        <StatCard label="Atrasados"  value={stats.atrasados}  tone="warning" />
      </div>

      {/* Toolbar */}
      <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Motor, trabajo o técnico..."
              className="h-10 w-full rounded-xl border border-gray-200 bg-transparent pl-9 pr-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/10 dark:border-white/[0.08] dark:text-white dark:placeholder:text-gray-500"
            />
          </div>

          <div className="relative">
            <select
              value={filterPriority}
              onChange={e => setFilterPriority(e.target.value as FilterPriority)}
              className="h-10 appearance-none rounded-xl border border-gray-200 bg-white py-0 pl-3 pr-8 text-sm text-gray-700 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/10 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300"
            >
              <option value="Todas">Todas las prioridades</option>
              {(["Emergente", "Alta", "Normal", "Programado"] as MaintenancePriority[]).map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-gray-200 p-1 dark:border-white/[0.08]">
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
                viewMode === "kanban"
                  ? "bg-orange-500 text-white shadow-sm"
                  : "text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.05]"
              }`}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
                viewMode === "table"
                  ? "bg-orange-500 text-white shadow-sm"
                  : "text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.05]"
              }`}
            >
              <Table2 size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center gap-3 py-20 text-gray-400">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm">Cargando mantenimientos...</span>
        </div>
      ) : viewMode === "kanban" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5 md:items-start">
          {COLUMNS.map(status => (
            <KanbanColumn
              key={status}
              status={status}
              items={byStatus[status]}
              motorMap={motorMap}
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
          items={filteredAll}
          motorMap={motorMap}
          onEdit={openEdit}
          onDelete={setDeleteTarget}
          onStatusChange={handleStatusChange}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      )}

      {/* Modals */}
      {modal && (
        <MaintenanceModal
          mode={modal.mode}
          initial={modal.form}
          motors={motors}
          drivers={drivers}
          driversLoading={driversLoading}
          onClose={() => setModal(null)}
          onSubmit={handleSubmit}
        />
      )}
      {deleteTarget && canDelete && (
        <DeleteConfirm
          title={deleteTarget.title}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}