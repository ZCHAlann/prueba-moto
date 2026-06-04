import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { useAssets } from "../../../hooks/useAssets";
import { useGarages } from "../../../hooks/useGarages";
import { useCompanyUsers } from "../../../hooks/useCompanyUsers";
import { usePermissions } from "../../../hooks/usePermissions";
import { ExportToolbar } from "../../../components/ui/export-toolbar/ExportToolbar";
import type { GarageRecord, GarageStatus } from "../../../types/fleet";
import { LocationPickerModal } from "../../../components/ui/map/LocationPicker";
import { GarageMap } from "@/components/ui/map/GarageMap";

// ─── types ────────────────────────────────────────────────────────────────────
type GarageForm = Omit<GarageRecord, "id" | "tenantId"> & {
  latitude?: number;
  longitude?: number;
};

function emptyForm(): GarageForm {
  return {
    code: "", name: "", location: "",
    latitude: undefined, longitude: undefined,
    capacity: 10, supervisor: "", status: "Activo", notes: "",
  };
}

// ─── SVG icons ────────────────────────────────────────────────────────────────
function IconGarage({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 9.5L12 3l9 6.5V21H3V9.5z" />
      <path d="M9 21v-6h6v6" />
      <path d="M3 9.5h18" />
    </svg>
  );
}
function IconLocation({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}
function IconUser({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.58-7 8-7s8 3 8 7" />
    </svg>
  );
}
function IconCar({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 11l1.5-4.5h11L19 11" />
      <rect x="3" y="11" width="18" height="6" rx="1" />
      <circle cx="7.5" cy="17.5" r="1.5" />
      <circle cx="16.5" cy="17.5" r="1.5" />
      <path d="M3 13h18" />
    </svg>
  );
}
function IconEdit({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
function IconTrash({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}
function IconClose({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function IconPlus({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function IconExternalLink({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}
function IconMap({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z"/>
      <path d="M8 2v16M16 6v16"/>
    </svg>
  );
}
function IconGrid({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  );
}

// ─── Slot grid ─────────────────────────────────────────────────────────────────
function SlotGrid({ capacity, occupied }: { capacity: number; occupied: number }) {
  const total = Math.min(capacity, 40);
  const pct = capacity > 0 ? occupied / capacity : 0;
  const color =
    pct >= 0.9 ? "bg-error-500 dark:bg-error-400"
    : pct >= 0.65 ? "bg-warning-400"
    : "bg-success-500 dark:bg-success-400";
  return (
    <div className="flex flex-wrap gap-[3px]">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`h-[7px] w-[7px] rounded-[2px] transition-colors ${i < occupied ? color : "bg-gray-100 dark:bg-white/[0.07]"}`} />
      ))}
      {capacity > 40 && <span className="text-[9px] text-gray-400 dark:text-gray-500 self-end leading-none ml-0.5">+{capacity - 40}</span>}
    </div>
  );
}

// ─── Occupancy bar ─────────────────────────────────────────────────────────────
function OccupancyBar({ capacity, occupied }: { capacity: number; occupied: number }) {
  const pct = capacity > 0 ? Math.min((occupied / capacity) * 100, 100) : 0;
  const barColor =
    pct >= 90 ? "bg-error-500 dark:bg-error-400"
    : pct >= 65 ? "bg-warning-400"
    : "bg-success-500 dark:bg-success-400";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 dark:text-gray-500">Ocupación</span>
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{occupied} / {capacity}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.07]">
        <motion.div
          className={`h-full rounded-full ${barColor}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

// ─── Garage card ────────────────────────────────────────────────────────────────
function GarageCard({
  garage, occupied, vehicleList, canEdit, canDelete, onEdit, onDelete, onDetail,
}: {
  garage: GarageRecord; occupied: number;
  vehicleList: { plate: string; brand: string; model: string }[];
  canEdit: boolean; canDelete: boolean;
  onEdit: () => void; onDelete: () => void; onDetail: () => void;
}) {
  const isActive = garage.status === "Activo";
  const pct = garage.capacity > 0 ? (occupied / garage.capacity) * 100 : 0;
  const statusLabel = pct >= 90 ? "Lleno" : pct >= 65 ? "Casi lleno" : "Disponible";
  const statusTone =
    pct >= 90 ? "text-error-600 dark:text-error-400 bg-error-50 dark:bg-error-500/10 border-error-200 dark:border-error-500/20"
    : pct >= 65 ? "text-warning-600 dark:text-warning-400 bg-warning-50 dark:bg-warning-500/10 border-warning-200 dark:border-warning-500/20"
    : "text-success-600 dark:text-success-400 bg-success-50 dark:bg-success-500/10 border-success-200 dark:border-success-500/20";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className={`group relative flex flex-col rounded-2xl border bg-white dark:bg-white/[0.03] overflow-hidden transition-shadow hover:shadow-md dark:hover:shadow-black/30 ${
        isActive ? "border-gray-200 dark:border-white/[0.06]" : "border-gray-100 dark:border-white/[0.04] opacity-60"
      }`}
    >
      <div className={`h-1 w-full ${pct >= 90 ? "bg-error-400" : pct >= 65 ? "bg-warning-400" : "bg-success-400"}`} />
      <div className="flex flex-col gap-4 p-5">
        {/* header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-100 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.04]">
              <IconGarage className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            </div>
            <div>
              <h3 className="font-bold text-gray-800 dark:text-white leading-tight">{garage.name}</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500">{garage.code}</p>
            </div>
          </div>
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusTone}`}>
            {isActive ? statusLabel : "Inactivo"}
          </span>
        </div>

        {/* location */}
        <div className="flex items-start gap-2">
          <IconLocation className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" />
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{garage.location}</p>
        </div>

        {/* slot grid */}
        <div className="space-y-2">
          <SlotGrid capacity={garage.capacity} occupied={occupied} />
          <OccupancyBar capacity={garage.capacity} occupied={occupied} />
        </div>

        {/* meta */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-gray-100 dark:border-white/[0.05] bg-gray-50 dark:bg-white/[0.02] px-3 py-2">
            <IconUser className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" />
            <div className="min-w-0">
              <p className="truncate text-[10px] text-gray-400 dark:text-gray-500">Supervisor</p>
              <p className="truncate text-xs font-medium text-gray-700 dark:text-gray-300">{garage.supervisor || "—"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-gray-100 dark:border-white/[0.05] bg-gray-50 dark:bg-white/[0.02] px-3 py-2">
            <IconCar className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" />
            <div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">Capacidad</p>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{garage.capacity} espacios</p>
            </div>
          </div>
        </div>

        {/* vehicle chips */}
        {vehicleList.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {vehicleList.slice(0, 4).map((v) => (
              <span key={v.plate} className="inline-flex items-center gap-1 rounded-lg border border-gray-100 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.03] px-2 py-0.5">
                <IconCar className="h-2.5 w-2.5 text-gray-400 dark:text-gray-500" />
                <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-300">{v.plate}</span>
              </span>
            ))}
            {vehicleList.length > 4 && <span className="text-[10px] text-gray-400 dark:text-gray-500 self-center">+{vehicleList.length - 4} más</span>}
          </div>
        )}

        {/* actions */}
        <div className="flex items-center gap-2 border-t border-gray-100 dark:border-white/[0.04] pt-3">
          <button type="button" onClick={onDetail}
            className="flex-1 rounded-xl border border-gray-200 dark:border-white/[0.06] py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors">
            Ver detalle
          </button>
          {canEdit && (
            <button type="button" onClick={onEdit}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 dark:border-white/[0.06] text-gray-500 dark:text-gray-400 hover:border-brand-300 dark:hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors">
              <IconEdit className="h-3.5 w-3.5" />
            </button>
          )}
          {canDelete && (
            <button type="button" onClick={onDelete}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 dark:border-white/[0.06] text-gray-500 dark:text-gray-400 hover:border-error-200 dark:hover:border-error-500/30 hover:text-error-600 dark:hover:text-error-400 hover:bg-error-50 dark:hover:bg-error-500/10 transition-colors">
              <IconTrash className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Form helpers ────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">{label}</label>
      {children}
    </div>
  );
}
const inputCls =
  "w-full rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.03] px-3 py-2 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none focus:border-brand-400 dark:focus:border-brand-500 transition-colors";

// ─── Main page ────────────────────────────────────────────────────────────────
export function GaragesPage() {
  const { can } = usePermissions();

  const { assets } = useAssets();
  const { garages, loading, createGarage, updateGarage, deleteGarage } = useGarages();
  const { users } = useCompanyUsers();

  const [modalOpen, setModalOpen]   = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [form, setForm]             = useState<GarageForm>(emptyForm);
  const [saving, setSaving]         = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [drawerGarageId, setDrawerGarageId] = useState<string | null>(null);
  const [query, setQuery]           = useState("");
  const [view, setView]             = useState<"map" | "cards">("map");

  // ── Derived ─────────────────────────────────────────────────────────────────
  const supervisorOptions = users
    .filter((u) => ["owner_empresa", "admin_empresa", "supervisor"].includes(u.role))
    .map((u) => {
      const name = [u.profileData?.firstName, u.profileData?.lastName].filter(Boolean).join(" ") || u.username;
      return { value: name, label: name };
    });

  const garageRows = useMemo(
    () => garages.map((g) => {
      const vehicles = assets.filter((a) => a.location === g.name || a.site === g.name);
      return { ...g, vehicles, occupied: vehicles.length };
    }),
    [garages, assets]
  );

  const filteredRows = useMemo(() => {
    const v = query.trim().toLowerCase();
    if (!v) return garageRows;
    return garageRows.filter(
      (g) =>
        g.name.toLowerCase().includes(v) ||
        g.location.toLowerCase().includes(v) ||
        g.code.toLowerCase().includes(v) ||
        g.supervisor.toLowerCase().includes(v)
    );
  }, [garageRows, query]);

  const drawerGarage = useMemo(
    () => garageRows.find((g) => g.id === drawerGarageId) ?? null,
    [garageRows, drawerGarageId]
  );

  // KPIs
  const totalCapacity = garages.reduce((s, g) => s + Number(g.capacity || 0), 0);
  const totalOccupied = garageRows.reduce((s, g) => s + g.occupied, 0);
  const globalPct     = totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0;
  const fullGarages   = garageRows.filter((g) => g.capacity > 0 && g.occupied >= g.capacity).length;
  const freeAssets    = assets.filter((a) => !garages.some((g) => g.name === a.location || g.name === a.site)).length;

  // ── Actions ─────────────────────────────────────────────────────────────────
  function openCreate() { setEditingId(null); setForm(emptyForm()); setModalOpen(true); }
  function openEdit(g: GarageRecord) {
    setEditingId(g.id);
    setForm({ code: g.code, name: g.name, location: g.location, latitude: g.latitude, longitude: g.longitude, capacity: g.capacity, supervisor: g.supervisor, status: g.status, notes: g.notes });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.code.trim() || !form.name.trim() || !form.location.trim()) {
      toast.error("Formulario incompleto", { description: "Código, nombre y ubicación son obligatorios." });
      return;
    }
    setSaving(true);
    try {
      if (editingId) { await updateGarage(editingId, form); toast.success("Garaje actualizado"); }
      else           { await createGarage(form);            toast.success("Garaje creado"); }
      setModalOpen(false);
    } catch { toast.error("Error al guardar el garaje"); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string, name: string) {
    setDeletingId(id);
    try {
      await deleteGarage(id);
      toast.success(`Garaje "${name}" eliminado`);
      if (drawerGarageId === id) setDrawerGarageId(null);
    } catch { toast.error("No se pudo eliminar el garaje"); }
    finally { setDeletingId(null); }
  }

  const exportColumns = [
    { key: "code", label: "Código" }, { key: "name", label: "Garaje" },
    { key: "location", label: "Ubicación" }, { key: "capacity", label: "Capacidad" },
    { key: "occupied", label: "Ocupados" }, { key: "supervisor", label: "Supervisor" },
    { key: "status", label: "Estado" },
  ];
  const exportRows = filteredRows.map((g) => ({
    code: g.code, name: g.name, location: g.location,
    capacity: g.capacity, occupied: g.occupied, supervisor: g.supervisor, status: g.status,
  }));

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-16 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/[0.04]" />
        <div className="grid gap-3 md:grid-cols-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/[0.04]" />)}
        </div>
        <div className="h-[440px] animate-pulse rounded-2xl bg-gray-100 dark:bg-white/[0.04]" />
      </div>
    );
  }

  // ── KPI config ───────────────────────────────────────────────────────────────
  const kpis = [
    {
      label: "Garajes activos", value: garages.filter((g) => g.status === "Activo").length,
      detail: `de ${garages.length} registrados`, tone: "brand",
    },
    {
      label: "Ocupación global", value: `${globalPct}%`,
      detail: `${totalOccupied} de ${totalCapacity} espacios`,
      tone: globalPct >= 90 ? "error" : globalPct >= 65 ? "warning" : "success",
    },
    {
      label: "Garajes llenos", value: fullGarages,
      detail: "Sin espacio disponible", tone: fullGarages > 0 ? "error" : "success",
    },
    {
      label: "Sin garaje asignado", value: freeAssets,
      detail: "Vehículos sin ubicación", tone: freeAssets > 0 ? "warning" : "success",
    },
  ];

  const toneMap: Record<string, string> = {
    brand:   "bg-brand-50 dark:bg-brand-500/10 border-brand-200 dark:border-brand-500/20",
    success: "bg-success-50 dark:bg-success-500/10 border-success-200 dark:border-success-500/20",
    warning: "bg-warning-50 dark:bg-warning-500/10 border-warning-200 dark:border-warning-500/20",
    error:   "bg-error-50 dark:bg-error-500/10 border-error-200 dark:border-error-500/20",
  };
  const textMap: Record<string, string> = {
    brand:   "text-brand-600 dark:text-brand-400",
    success: "text-success-600 dark:text-success-400",
    warning: "text-warning-600 dark:text-warning-400",
    error:   "text-error-600 dark:text-error-400",
  };

  return (
    <div className="space-y-5">
      {/* ── Page header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 dark:border-brand-500/20 bg-brand-50 dark:bg-brand-500/10 px-2.5 py-0.5 text-xs font-semibold text-brand-600 dark:text-brand-400">
            <IconGarage className="h-3 w-3" />
            Gestión
          </span>
          <h1 className="mt-2 text-2xl font-bold text-gray-800 dark:text-white">Garajes</h1>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            Control de patios, capacidad, ocupación y responsables.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          {/* View toggle */}
          <div className="flex items-center gap-0.5 rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] p-1">
            {([
              { key: "map" as const,   label: "Mapa",     Icon: IconMap  },
              { key: "cards" as const, label: "Tarjetas", Icon: IconGrid },
            ]).map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  view === key
                    ? "bg-white dark:bg-white/[0.08] text-gray-800 dark:text-white shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />{label}
              </button>
            ))}
          </div>
          {can("gestion", "garajes", "crear") && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              <IconPlus className="h-4 w-4" />
              Nuevo garaje
            </button>
          )}
        </div>
      </div>

      {/* ── MAP VIEW ── */}
      {view === "map" && (
        <div className="space-y-4">
          {/* KPIs — horizontal strip above map */}
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            {kpis.map(({ label, value, detail, tone }) => (
              <div key={label} className={`rounded-2xl border p-4 ${toneMap[tone]}`}>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
                <p className={`mt-1 text-3xl font-bold ${textMap[tone]}`}>{value}</p>
                <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{detail}</p>
              </div>
            ))}
          </div>

          {/* Map — full width, below KPIs */}
          <GarageMap
            garages={garageRows}
            selectedId={drawerGarageId}
            onSelectGarage={(id) => setDrawerGarageId(id)}
          />

          {/* Garage list strip below the map — quick-select chips */}
          {garageRows.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {garageRows
                .filter((g) => g.status === "Activo")
                .map((g) => {
                  const pct = g.capacity > 0 ? g.occupied / g.capacity : 0;
                  const dot = pct >= 0.9 ? "bg-error-400" : pct >= 0.65 ? "bg-warning-400" : "bg-success-400";
                  const isSelected = g.id === drawerGarageId;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setDrawerGarageId(isSelected ? null : g.id)}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
                        isSelected
                          ? "border-brand-300 dark:border-brand-500/40 bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400"
                          : "border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-white/[0.12]"
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${dot}`} />
                      {g.name}
                      <span className="text-[10px] font-normal opacity-60">{g.occupied}/{g.capacity}</span>
                    </button>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ── CARDS VIEW ── */}
      {view === "cards" && (
        <div className="space-y-4">
          {/* KPIs */}
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            {kpis.map(({ label, value, detail, tone }) => (
              <div key={label} className={`rounded-2xl border p-4 ${toneMap[tone]}`}>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
                <p className={`mt-1 text-3xl font-bold ${textMap[tone]}`}>{value}</p>
                <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{detail}</p>
              </div>
            ))}
          </div>

          {/* Toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, código, ubicación…"
              className="w-full rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] px-3 py-2 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none focus:border-brand-400 dark:focus:border-brand-500 transition-colors sm:w-72"
            />
            <ExportToolbar title="Garajes" columns={exportColumns} rows={exportRows} />
          </div>

          {/* Cards grid */}
          {filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 dark:border-white/[0.06] py-20">
              <IconGarage className="h-10 w-10 text-gray-300 dark:text-gray-600" />
              <p className="mt-3 text-sm font-medium text-gray-400 dark:text-gray-500">Sin garajes</p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                {query ? "No hay resultados para el filtro aplicado." : "Crea el primer garaje para comenzar."}
              </p>
            </div>
          ) : (
            <motion.div layout className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <AnimatePresence>
                {filteredRows.map((g) => (
                  <GarageCard
                    key={g.id}
                    garage={g}
                    occupied={g.occupied}
                    vehicleList={g.vehicles.map((v) => ({ plate: v.plate, brand: v.brand, model: v.model }))}
                    canEdit={can("gestion", "garajes", "editar")}
                    canDelete={can("gestion", "garajes", "eliminar")}
                    onEdit={() => openEdit(g)}
                    onDelete={() => handleDelete(g.id, g.name)}
                    onDetail={() => setDrawerGarageId(g.id)}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      )}

      {/* ── FORM MODAL ── z-50 so it's above everything including map ── */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            key="modal-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-gray-950/50 backdrop-blur-sm"
            onClick={() => setModalOpen(false)}
          >
            <motion.div
              key="modal"
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-gray-900 shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-gray-200 dark:border-white/[0.06] px-5 py-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-800 dark:text-white">
                    {editingId ? "Editar garaje" : "Nuevo garaje"}
                  </h2>
                  <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                    Patio, bodega, base o zona de resguardo vehicular.
                  </p>
                </div>
                <button type="button" onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-gray-200 dark:border-white/[0.06] p-1.5 text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors">
                  <IconClose className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4 px-5 py-5 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Código">
                    <input className={inputCls} value={form.code}
                      onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                      placeholder="GAR-001" />
                  </Field>
                  <Field label="Estado">
                    <select className={inputCls} value={form.status}
                      onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as GarageStatus }))}>
                      <option value="Activo">Activo</option>
                      <option value="Inactivo">Inactivo</option>
                    </select>
                  </Field>
                </div>
                <Field label="Nombre del garaje">
                  <input className={inputCls} value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Base principal de vehículos" />
                </Field>
                <Field label="Ubicación">
                  <LocationPickerModal
                    value={form.location}
                    onChange={(result) => setForm((f) => ({
                      ...f, location: result.address,
                      latitude: result.latitude || undefined,
                      longitude: result.longitude || undefined,
                    }))}
                    placeholder="Busca la dirección del garaje…"
                  />
                </Field>
                <Field label="Capacidad (espacios)">
                  <input type="number" min="0" step="1" className={inputCls} value={form.capacity}
                    onChange={(e) => setForm((f) => ({ ...f, capacity: Number(e.target.value || 0) }))} />
                </Field>
                <Field label="Supervisor a cargo">
                  <select className={inputCls} value={form.supervisor}
                    onChange={(e) => setForm((f) => ({ ...f, supervisor: e.target.value }))}>
                    <option value="">Selecciona supervisor</option>
                    {supervisorOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
                <Field label="Notas">
                  <textarea rows={3} className={`${inputCls} resize-none`} value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Horarios, restricciones, responsable de llaves…" />
                </Field>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-gray-200 dark:border-white/[0.06] px-5 py-4">
                <button type="button" onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-gray-200 dark:border-white/[0.06] px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors">
                  Cancelar
                </button>
                <button type="button" onClick={handleSave} disabled={saving}
                  className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors">
                  {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear garaje"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── DETAIL DRAWER ── z-50 as well ── */}
      <AnimatePresence>
        {drawerGarage && (
          <>
            <motion.div
              key="drawer-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-gray-950/20"
              onClick={() => setDrawerGarageId(null)}
            />
            <motion.div
              key="drawer"
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 350, damping: 35 }}
              className="fixed right-0 top-0 z-50 h-full w-full max-w-sm border-l border-gray-200 dark:border-white/[0.06] bg-white dark:bg-gray-900 shadow-2xl overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-gray-200 dark:border-white/[0.06] px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-100 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.04]">
                    <IconGarage className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-gray-800 dark:text-white">{drawerGarage.name}</h2>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{drawerGarage.code}</p>
                  </div>
                </div>
                <button type="button" onClick={() => setDrawerGarageId(null)}
                  className="rounded-xl border border-gray-200 dark:border-white/[0.06] p-1.5 text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors">
                  <IconClose className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-5 px-5 py-5">
                {/* occupancy hero */}
                <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Ocupación</p>
                  <SlotGrid capacity={drawerGarage.capacity} occupied={drawerGarage.occupied} />
                  <OccupancyBar capacity={drawerGarage.capacity} occupied={drawerGarage.occupied} />
                </div>

                {/* info rows */}
                <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] divide-y divide-gray-100 dark:divide-white/[0.04]">
                  {[
                    { icon: <IconLocation className="h-3.5 w-3.5" />, label: "Ubicación", value: drawerGarage.location },
                    { icon: <IconUser className="h-3.5 w-3.5" />, label: "Supervisor", value: drawerGarage.supervisor || "—" },
                    { icon: <IconCar className="h-3.5 w-3.5" />, label: "Capacidad", value: `${drawerGarage.capacity} espacios` },
                    { icon: null, label: "Estado", value: drawerGarage.status, valueClass: drawerGarage.status === "Activo" ? "text-success-600 dark:text-success-400" : "text-gray-400 dark:text-gray-500" },
                  ].map(({ icon, label, value, valueClass }) => (
                    <div key={label} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500">
                        {icon}
                        <span className="text-xs">{label}</span>
                      </div>
                      <span className={`text-sm font-medium text-right ${valueClass ?? "text-gray-800 dark:text-white"}`}>{value}</span>
                    </div>
                  ))}
                </div>

                {/* google maps link */}
                {drawerGarage.location && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(drawerGarage.location)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-between rounded-xl border border-brand-200 dark:border-brand-500/20 bg-brand-50 dark:bg-brand-500/10 px-4 py-3 text-sm font-medium text-brand-600 dark:text-brand-400 hover:opacity-80 transition-opacity"
                  >
                    <div className="flex items-center gap-2">
                      <IconLocation className="h-4 w-4" />
                      Ver en Google Maps
                    </div>
                    <IconExternalLink className="h-3.5 w-3.5 opacity-70" />
                  </a>
                )}

                {/* vehicles */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Vehículos asignados ({drawerGarage.vehicles.length})
                  </p>
                  {drawerGarage.vehicles.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 dark:border-white/[0.06] px-4 py-6 text-center">
                      <IconCar className="mx-auto h-6 w-6 text-gray-300 dark:text-gray-600" />
                      <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">Sin vehículos asignados</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {drawerGarage.vehicles.map((v) => (
                        <div key={v.id} className="flex items-center gap-3 rounded-xl border border-gray-100 dark:border-white/[0.05] bg-gray-50 dark:bg-white/[0.02] px-3 py-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-white/[0.06]">
                            <IconCar className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-800 dark:text-white">{v.plate}</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{v.brand} {v.model} {v.year}</p>
                          </div>
                          <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                            v.status === "Operativo"
                              ? "bg-success-50 dark:bg-success-500/10 border-success-200 dark:border-success-500/20 text-success-600 dark:text-success-400"
                              : "bg-gray-50 dark:bg-white/[0.03] border-gray-200 dark:border-white/[0.06] text-gray-500 dark:text-gray-400"
                          }`}>
                            {v.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* notes */}
                {drawerGarage.notes && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Notas</p>
                    <p className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] px-4 py-3 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                      {drawerGarage.notes}
                    </p>
                  </div>
                )}

                {/* drawer actions */}
                {(can("gestion", "garajes", "editar") || can("gestion", "garajes", "eliminar")) && (
                  <div className="flex gap-3 pt-1">
                    {can("gestion", "garajes", "editar") && (
                      <button type="button" onClick={() => { setDrawerGarageId(null); openEdit(drawerGarage); }}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-white/[0.06] py-2.5 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors">
                        <IconEdit className="h-4 w-4" /> Editar
                      </button>
                    )}
                    {can("gestion", "garajes", "eliminar") && (
                      <button type="button" disabled={deletingId === drawerGarage.id}
                        onClick={() => handleDelete(drawerGarage.id, drawerGarage.name)}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-error-200 dark:border-error-500/20 bg-error-50 dark:bg-error-500/10 py-2.5 text-sm font-semibold text-error-600 dark:text-error-400 hover:bg-error-100 dark:hover:bg-error-500/20 disabled:opacity-60 transition-colors">
                        <IconTrash className="h-4 w-4" />
                        {deletingId === drawerGarage.id ? "Eliminando…" : "Eliminar"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}