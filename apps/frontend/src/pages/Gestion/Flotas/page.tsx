import { useMemo, useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { useAssets } from "../../../hooks/useAssets";
import { useAssignments } from "../../../hooks/useAssignments";
import { useMaintenances } from "../../../hooks/useMaintenances";
import { ModulePageHeader } from "../../../components/features/modules/ModulePageHeader";
import type { Asset } from "../../../types/activo";
import {
  Plus, Search, Car, Wrench, Trash2, Pencil, X, Loader2,
  ChevronDown, Filter, MoreHorizontal, MapPin, User, Fuel,
  Droplets, Calendar, Hash, AlertTriangle, ShieldCheck,
  ClipboardList, ChevronLeft, ChevronRight, Eye,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  if (!d || d === "null" || d === "undefined") return "—";
  return new Date(d).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });
}

const PAGE_SIZE = 12;

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { color: string; bg: string; border: string; dot: string }> = {
  Operativo:         { dot: "bg-emerald-400", color: "text-emerald-700 dark:text-emerald-400",  bg: "bg-emerald-50 dark:bg-emerald-500/10",  border: "border-emerald-200 dark:border-emerald-500/20"  },
  "En mantenimiento":{ dot: "bg-amber-400",   color: "text-amber-700 dark:text-amber-400",     bg: "bg-amber-50 dark:bg-amber-500/10",      border: "border-amber-200 dark:border-amber-500/20"      },
  "Fuera de servicio":{ dot: "bg-rose-400",   color: "text-rose-700 dark:text-rose-400",       bg: "bg-rose-50 dark:bg-rose-500/10",        border: "border-rose-200 dark:border-rose-500/20"        },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG["Operativo"];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.color} ${cfg.border}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {status}
    </span>
  );
}

// ─── KPI Row ──────────────────────────────────────────────────────────────────

function KpiRow({ vehicles }: { vehicles: Asset[] }) {
  const operativos   = vehicles.filter(v => v.status === "Operativo").length;
  const mantenimiento = vehicles.filter(v => v.status === "En mantenimiento").length;
  const fuera        = vehicles.filter(v => v.status === "Fuera de servicio").length;

  const cards = [
    { label: "Total flota",        value: vehicles.length, sub: "unidades registradas",   cls: "border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]",                                    valCls: "text-gray-800 dark:text-white"   },
    { label: "Operativos",         value: operativos,      sub: "listos para despacho",   cls: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/20 dark:bg-emerald-500/5",                      valCls: "text-emerald-700 dark:text-emerald-300" },
    { label: "En mantenimiento",   value: mantenimiento,   sub: "con restricción técnica", cls: "border-amber-200 bg-amber-50/60 dark:border-amber-500/20 dark:bg-amber-500/5",                             valCls: "text-amber-700 dark:text-amber-300" },
    { label: "Fuera de servicio",  value: fuera,           sub: "detenidos por novedad",  cls: "border-rose-200 bg-rose-50/60 dark:border-rose-500/20 dark:bg-rose-500/5",                                  valCls: "text-rose-700 dark:text-rose-300"   },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map(c => (
        <div key={c.label} className={`rounded-2xl border p-4 ${c.cls}`}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{c.label}</p>
          <p className={`mt-1.5 text-3xl font-black tabular-nums ${c.valCls}`}>{c.value}</p>
          <p className="mt-0.5 text-xs text-gray-400">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Three-dot menu ───────────────────────────────────────────────────────────

function RowMenu({ vehicle, onView, onEdit, onMaintenance, onDelete }: {
  vehicle: Asset;
  onView: () => void;
  onEdit: () => void;
  onMaintenance: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const items = [
    { label: "Ver detalle",       icon: <Eye size={13} />,         action: onView,        cls: "text-gray-700 dark:text-gray-300" },
    { label: "Editar",            icon: <Pencil size={13} />,      action: onEdit,        cls: "text-gray-700 dark:text-gray-300" },
    { label: "Nuevo mantenimiento", icon: <Wrench size={13} />,    action: onMaintenance, cls: "text-amber-600 dark:text-amber-400" },
    { label: "Eliminar",          icon: <Trash2 size={13} />,      action: onDelete,      cls: "text-rose-600 dark:text-rose-400" },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.08]"
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-48 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-white/[0.08] dark:bg-[#0d1320]">
          {items.map(item => (
            <button
              key={item.label}
              onClick={e => { e.stopPropagation(); item.action(); setOpen(false); }}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-semibold hover:bg-gray-50 dark:hover:bg-white/[0.05] ${item.cls}`}
            >
              {item.icon}{item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────

function DetailDrawer({ vehicle, onClose, onEdit, onDelete, onMaintenance }: {
  vehicle: Asset;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMaintenance: () => void;
}) {
  const { assignments } = useAssignments();
  const { maintenances } = useMaintenances();

  const activeAssignment = useMemo(
    () => assignments.find(a => a.assetId === vehicle.id && a.status === "Activa"),
    [assignments, vehicle.id]
  );

  const vehicleMaintenances = useMemo(
    () => maintenances
      .filter(m => m.assetId === vehicle.id)
      .sort((a, b) => new Date(b.createdAt ?? b.scheduledDate).getTime() - new Date(a.createdAt ?? a.scheduledDate).getTime()),
    [maintenances, vehicle.id]
  );

  const lastMaintenance = vehicleMaintenances[0];
  const pendingCount = vehicleMaintenances.filter(m => m.status === "Pendiente" || m.status === "En proceso").length;

  const cfg = STATUS_CFG[vehicle.status] ?? STATUS_CFG["Operativo"];

  // Spring animation via useEffect
  const drawerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = drawerRef.current;
    if (!el) return;
    el.style.transform = "translateX(100%)";
    requestAnimationFrame(() => {
      el.style.transition = "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)";
      el.style.transform = "translateX(0)";
    });
    return () => {
      el.style.transform = "translateX(100%)";
    };
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Drawer */}
      <div
        ref={drawerRef}
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0d1320]"
        style={{ transform: "translateX(100%)" }}
      >
        {/* Color bar */}
        <div className={`h-1 w-full ${cfg.dot}`} />

        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 dark:border-white/[0.06]">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 dark:bg-sky-500/10">
                <Car size={18} className="text-sky-500" />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-black text-gray-800 dark:text-white">{vehicle.plate}</p>
                <p className="truncate text-xs text-gray-400">{vehicle.brand} {vehicle.model} · {vehicle.year}</p>
              </div>
            </div>
            <div className="mt-3">
              <StatusBadge status={vehicle.status} />
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.08]"
          >
            <X size={15} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Datos técnicos */}
          <section>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Datos técnicos</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: <Car size={12} />,        label: "Tipo",     value: vehicle.category },
                { icon: <Hash size={12} />,       label: "Chasis",   value: vehicle.serial   },
                { icon: <Fuel size={12} />,       label: "Combustible", value: vehicle.fuelType },
                { icon: <Droplets size={12} />,   label: "Aceite",   value: `${vehicle.oilType} · ${vehicle.oilCapacity}` },
              ].map(({ icon, label, value }) => (
                <div key={label} className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-white/[0.05] dark:bg-white/[0.03]">
                  <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">{icon}{label}</p>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 truncate">{value || "—"}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Sede y responsable */}
          <section>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Ubicación y responsable</p>
            <div className="space-y-2">
              <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 dark:border-white/[0.05] dark:bg-white/[0.03]">
                <MapPin size={13} className="shrink-0 text-gray-400" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Sede</p>
                  <p className="truncate text-sm font-semibold text-gray-700 dark:text-gray-200">{vehicle.site || "—"}</p>
                  {vehicle.location && <p className="truncate text-xs text-gray-400">{vehicle.location}</p>}
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 dark:border-white/[0.05] dark:bg-white/[0.03]">
                <User size={13} className="shrink-0 text-gray-400" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Responsable</p>
                  <p className="truncate text-sm font-semibold text-gray-700 dark:text-gray-200">{vehicle.responsible || "—"}</p>
                </div>
              </div>
            </div>
          </section>

          {/* Conductor asignado */}
          <section>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Conductor asignado</p>
            {activeAssignment ? (
              <div className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50/60 px-3 py-2.5 dark:border-sky-500/20 dark:bg-sky-500/5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-500/20">
                  <User size={13} className="text-sky-600 dark:text-sky-400" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-sky-700 dark:text-sky-300">
                    {activeAssignment.driverId}
                  </p>
                  <p className="text-xs text-sky-500">Asignado desde {fmtDate(activeAssignment.startDate)}</p>
                </div>
                <span className="ml-auto rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">
                  Activo
                </span>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 px-3 py-3 text-xs text-gray-400 dark:border-white/[0.06]">
                Sin conductor asignado actualmente.
              </div>
            )}
          </section>

          {/* Último mantenimiento */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Mantenimiento</p>
              {pendingCount > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                  {pendingCount} pendiente{pendingCount > 1 ? "s" : ""}
                </span>
              )}
            </div>
            {lastMaintenance ? (
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-white/[0.05] dark:bg-white/[0.03]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-gray-700 dark:text-gray-200">{lastMaintenance.title}</p>
                    <p className="mt-0.5 text-xs text-gray-400">{lastMaintenance.kind}</p>
                  </div>
                  <StatusBadge status={lastMaintenance.status} />
                </div>
                <div className="mt-2 flex items-center gap-1 text-xs text-gray-400">
                  <Calendar size={11} />
                  <span>Vence {fmtDate(lastMaintenance.dueDate)}</span>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 px-3 py-3 text-xs text-gray-400 dark:border-white/[0.06]">
                Sin historial de mantenimiento.
              </div>
            )}
            {vehicleMaintenances.length > 1 && (
              <p className="mt-1.5 text-right text-[11px] text-gray-400">
                {vehicleMaintenances.length} OT{vehicleMaintenances.length !== 1 ? "s" : ""} en total
              </p>
            )}
          </section>

          {/* Seguro */}
          {(vehicle as any).insuranceExpiry && (
            <section>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Seguro vehicular</p>
              <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 dark:border-white/[0.05] dark:bg-white/[0.03]">
                <ShieldCheck size={13} className="shrink-0 text-gray-400" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Vencimiento</p>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    {fmtDate((vehicle as any).insuranceExpiry)}
                  </p>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-2 border-t border-gray-100 bg-gray-50/80 px-5 py-3.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <button
            onClick={onDelete}
            className="flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-500/20 dark:text-rose-400 dark:hover:bg-rose-500/10"
          >
            <Trash2 size={12} />Eliminar
          </button>
          <div className="flex gap-2">
            <button
              onClick={onMaintenance}
              className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/5 dark:text-amber-400"
            >
              <Wrench size={12} />Mantenimiento
            </button>
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.06]"
            >
              <Pencil size={12} />Editar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ vehicle, onConfirm, onCancel }: {
  vehicle: Asset;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0d1320]">
        <div className="px-6 pb-4 pt-5">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-500/10">
            <AlertTriangle size={18} className="text-rose-500" />
          </div>
          <h3 className="text-base font-bold text-gray-800 dark:text-white">Eliminar vehículo</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            ¿Seguro que deseas eliminar{" "}
            <span className="font-semibold text-gray-700 dark:text-gray-200">
              {vehicle.plate} — {vehicle.brand} {vehicle.model}
            </span>
            ? Esta acción no se puede deshacer.
          </p>
        </div>
        <div className="flex gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-gray-200 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 dark:border-white/[0.08] dark:text-gray-300"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-rose-500 py-2 text-sm font-semibold text-white hover:bg-rose-600 active:scale-95"
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Table Row ────────────────────────────────────────────────────────────────

function VehicleRow({ vehicle, index, onView, onEdit, onMaintenance, onDelete }: {
  vehicle: Asset;
  index: number;
  onView: () => void;
  onEdit: () => void;
  onMaintenance: () => void;
  onDelete: () => void;
}) {
  return (
    <tr
      className="group cursor-pointer border-b border-gray-100 transition-colors hover:bg-gray-50/80 dark:border-white/[0.04] dark:hover:bg-white/[0.02]"
      onClick={onView}
    >
      <td className="px-4 py-3.5 text-xs font-semibold text-gray-400">{index + 1}</td>
      <td className="px-4 py-3.5">
        <p className="font-black text-gray-800 dark:text-white">{vehicle.plate}</p>
        <p className="mt-0.5 text-[11px] text-gray-400">Chasis {vehicle.serial || "—"}</p>
      </td>
      <td className="px-4 py-3.5">
        <p className="font-semibold text-gray-800 dark:text-white">{vehicle.brand} {vehicle.model}</p>
        <p className="mt-0.5 text-xs text-gray-400">{vehicle.year} · {vehicle.category}</p>
      </td>
      <td className="px-4 py-3.5">
        <p className="text-sm text-gray-700 dark:text-gray-300">{vehicle.site || "—"}</p>
        {vehicle.location && <p className="mt-0.5 text-xs text-gray-400">{vehicle.location}</p>}
      </td>
      <td className="px-4 py-3.5">
        <p className="text-sm text-gray-700 dark:text-gray-300">{vehicle.responsible || "—"}</p>
      </td>
      <td className="px-4 py-3.5">
        <p className="text-sm text-gray-700 dark:text-gray-300">{vehicle.fuelType || "—"}</p>
        <p className="mt-0.5 text-xs text-gray-400">{vehicle.oilType || ""}</p>
      </td>
      <td className="px-4 py-3.5">
        <StatusBadge status={vehicle.status} />
      </td>
      <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
        <RowMenu
          vehicle={vehicle}
          onView={onView}
          onEdit={onEdit}
          onMaintenance={onMaintenance}
          onDelete={onDelete}
        />
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FlotasPage() {
  const { assets, loading, deleteAsset } = useAssets();

  const vehicles = useMemo(
    () => assets.filter(a => a.assetType === "Vehiculo"),
    [assets]
  );

  const [search, setSearch]         = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [page, setPage]             = useState(1);

  const [drawerVehicle, setDrawerVehicle]   = useState<Asset | null>(null);
  const [deleteTarget, setDeleteTarget]     = useState<Asset | null>(null);

  const setFilter = (fn: () => void) => { fn(); setPage(1); };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles.filter(v => {
      const matchQ     = !q || v.plate.toLowerCase().includes(q) || v.brand.toLowerCase().includes(q) || v.model.toLowerCase().includes(q) || (v.responsible ?? "").toLowerCase().includes(q) || (v.site ?? "").toLowerCase().includes(q);
      const matchS     = !filterStatus || v.status === filterStatus;
      const matchC     = !filterCategory || v.category === filterCategory;
      return matchQ && matchS && matchC;
    });
  }, [vehicles, search, filterStatus, filterCategory]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const categories = useMemo(
    () => [...new Set(vehicles.map(v => v.category).filter(Boolean))],
    [vehicles]
  );

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteAsset(deleteTarget.id);
      toast.success("Vehículo eliminado", { description: `${deleteTarget.plate} — ${deleteTarget.brand} ${deleteTarget.model}` });
      if (drawerVehicle?.id === deleteTarget.id) setDrawerVehicle(null);
    } catch {
      toast.error("No se pudo eliminar el vehículo");
    }
    setDeleteTarget(null);
  };

  const openMaintenance = (vehicle: Asset) => {
    window.location.href = `/mantenimiento/nuevo?assetId=${vehicle.id}`;
  };

  const openEdit = (vehicle: Asset) => {
    window.location.href = `/flotas/${vehicle.id}/editar`;
  };

  return (
    <div className="space-y-5">
      <ModulePageHeader
        badge="Gestión vehicular"
        title="Flotas"
        subtitle="Centro operativo de vehículos — detalle completo, historial y acciones sin salir de la tabla."
        accent="sky"
        action={
          <a
            href="/flotas/nuevo"
            className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-sky-500/20 hover:bg-sky-600 active:scale-95"
          >
            <Plus size={15} />Nuevo vehículo
          </a>
        }
      />

      <KpiRow vehicles={vehicles} />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="relative min-w-0 flex-1">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setFilter(() => setSearch(e.target.value))}
            placeholder="Buscar por placa, marca, responsable o sede..."
            className="h-9 w-full rounded-xl border border-gray-200 bg-transparent pl-8 pr-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/10 dark:border-white/[0.08] dark:text-white"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Filter size={13} className="text-gray-400" />
          <div className="relative">
            <select
              value={filterStatus}
              onChange={e => setFilter(() => setFilterStatus(e.target.value))}
              className="h-9 appearance-none rounded-xl border border-gray-200 bg-white pl-3 pr-7 text-sm text-gray-700 focus:border-sky-400 focus:outline-none dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300"
            >
              <option value="">Estado</option>
              <option value="Operativo">Operativo</option>
              <option value="En mantenimiento">En mantenimiento</option>
              <option value="Fuera de servicio">Fuera de servicio</option>
            </select>
            <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
          <div className="relative">
            <select
              value={filterCategory}
              onChange={e => setFilter(() => setFilterCategory(e.target.value))}
              className="h-9 appearance-none rounded-xl border border-gray-200 bg-white pl-3 pr-7 text-sm text-gray-700 focus:border-sky-400 focus:outline-none dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300"
            >
              <option value="">Tipo</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 dark:border-white/[0.06]">
          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Vehículos operativos</h3>
            <p className="text-xs text-gray-400">{filtered.length} resultado{filtered.length !== 1 ? "s" : ""}</p>
          </div>
          {totalPages > 1 && (
            <span className="text-xs text-gray-400">Pág. {page} / {totalPages}</span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-20 text-gray-400">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Cargando vehículos...</span>
          </div>
        ) : paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-14">
            <Car size={20} className="text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-400">Sin vehículos para los filtros actuales</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-white/[0.06]">
                    {["#", "Placa", "Vehículo", "Sede", "Responsable", "Combustible / aceite", "Estado", ""].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((vehicle, index) => (
                    <VehicleRow
                      key={vehicle.id}
                      vehicle={vehicle}
                      index={(page - 1) * PAGE_SIZE + index}
                      onView={() => setDrawerVehicle(vehicle)}
                      onEdit={() => openEdit(vehicle)}
                      onMaintenance={() => openMaintenance(vehicle)}
                      onDelete={() => setDeleteTarget(vehicle)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 dark:border-white/[0.06]">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-40 dark:border-white/[0.08] dark:text-gray-400"
                >
                  <ChevronLeft size={13} />Anterior
                </button>
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(p => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`h-7 w-7 rounded-lg text-xs font-semibold transition ${page === p ? "bg-sky-500 text-white" : "text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.05]"}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-40 dark:border-white/[0.08] dark:text-gray-400"
                >
                  Siguiente<ChevronRight size={13} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Drawer */}
      {drawerVehicle && (
        <DetailDrawer
          vehicle={drawerVehicle}
          onClose={() => setDrawerVehicle(null)}
          onEdit={() => { openEdit(drawerVehicle); setDrawerVehicle(null); }}
          onDelete={() => { setDeleteTarget(drawerVehicle); setDrawerVehicle(null); }}
          onMaintenance={() => { openMaintenance(drawerVehicle); }}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <DeleteConfirm
          vehicle={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}