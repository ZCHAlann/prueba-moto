import { useMemo, useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { useAssets } from "../../../hooks/useAssets";
import { useAssignments } from "../../../hooks/useAssignments";
import { useMaintenances } from "../../../hooks/useMaintenances";
import { useGarages } from "../../../hooks/useGarages";
import { createPortal } from "react-dom";
import { DatePicker } from "../../../components/ui/date-picker/DatePicker";
import type {
  CreateMaintenancePayload,
  MaintenanceKind,
  MaintenancePriority,
  MaintenanceStatus,
} from "../../../hooks/useMaintenances";
import { usePermissions } from "../../../hooks/usePermissions";
import { ModulePageHeader } from "../../../components/features/modules/ModulePageHeader";
import type { Asset, AssetCategory, AssetFuelType, AssetStatus, AssetType } from "../../../types/activo";
import {
  Plus, Search, Car, Wrench, Trash2, Pencil, X, Loader2,
  ChevronDown, Filter, MoreHorizontal, MapPin, User, Fuel,
  Droplets, Calendar, Hash, AlertTriangle,
  ChevronLeft, ChevronRight, Eye, Warehouse,
} from "lucide-react";
import { useDrivers } from "@/hooks/useDrivers";
import { useSites } from "@/hooks/useSites";
import { RowActionMenu } from "../../../components/ui/table/RowActionMenu";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  if (!d || d === "null" || d === "undefined") return "—";
  return new Date(d).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });
}

const PAGE_SIZE = 7;

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { color: string; bg: string; border: string; dot: string }> = {
  Operativo:           { dot: "bg-emerald-400", color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10", border: "border-emerald-200 dark:border-emerald-500/20" },
  "En mantenimiento":  { dot: "bg-amber-400",   color: "text-amber-700 dark:text-amber-400",    bg: "bg-amber-50 dark:bg-amber-500/10",    border: "border-amber-200 dark:border-amber-500/20"   },
  "Fuera de servicio": { dot: "bg-rose-400",     color: "text-rose-700 dark:text-rose-400",      bg: "bg-rose-50 dark:bg-rose-500/10",      border: "border-rose-200 dark:border-rose-500/20"     },
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

// ─── Modal primitives ─────────────────────────────────────────────────────────

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return createPortal(
    <div
      className="fixed inset-0 z-[99999] overflow-y-auto bg-black/70 backdrop-blur-md"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex min-h-full items-start justify-center p-4 pt-16 pb-10">
        {children}
      </div>
    </div>,
    document.body
  );
}

interface SelectOption { value: string; label: string; sub?: string; }

function DarkSelect({ options, value, onChange, placeholder }: {
  options: SelectOption[]; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white transition hover:border-white/20 focus:border-amber-500/50 focus:outline-none"
      >
        <span className={selected ? "text-white" : "text-white/30"}>
          {selected ? selected.label : placeholder ?? "Seleccionar..."}
        </span>
        <ChevronDown size={12} className={`shrink-0 text-white/30 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-[100000] overflow-hidden rounded-xl border border-white/[0.08] bg-[#0d1117] shadow-xl">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`flex w-full flex-col px-3 py-2.5 text-left transition hover:bg-white/[0.05] ${value === opt.value ? "bg-amber-500/10" : ""}`}
            >
              <span className={`text-sm font-medium ${value === opt.value ? "text-amber-400" : "text-white"}`}>{opt.label}</span>
              {opt.sub && <span className="text-xs text-white/35">{opt.sub}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DarkField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-bold uppercase tracking-widest text-white/30">
        {label}{required && <span className="ml-1 text-amber-500">*</span>}
      </label>
      {children}
    </div>
  );
}

const darkInputCls = "h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/20 focus:border-amber-500/50 focus:outline-none transition";

// ─── CreateMaintenanceModal ───────────────────────────────────────────────────

function CreateMaintenanceModal({ vehicle, onClose, onCreated }: {
  vehicle: Asset; onClose: () => void; onCreated: () => void;
}) {
  const { createMaintenance } = useMaintenances();
  const { drivers } = useDrivers();
  const today = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState<CreateMaintenancePayload>({
    assetId: vehicle.id,
    title: "",
    kind: "Preventivo",
    priority: "Normal",
    status: "Pendiente",
    scheduledDate: today,
    dueDate: today,
    completedDate: null,
    technician: "",
    laborCost: null,
    partsCost: null,
    photoUrls: [],
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof CreateMaintenancePayload>(k: K, v: CreateMaintenancePayload[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const isValid = form.title.trim() && form.scheduledDate && form.dueDate;

  const handleSubmit = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      await createMaintenance(form);
      toast.success("Mantenimiento agendado", { description: `OT para ${vehicle.plate || vehicle.name} creada.` });
      onCreated();
      onClose();
    } catch {
      toast.error("No se pudo crear el mantenimiento");
    } finally {
      setSaving(false);
    }
  };

  const kindOptions: SelectOption[]     = ["Preventivo","Correctivo","Predictivo","Emergencia"].map(v => ({ value: v, label: v }));
  const priorityOptions: SelectOption[] = ["Normal","Alta","Programado","Emergente"].map(v => ({ value: v, label: v }));
  const statusOptions: SelectOption[]   = ["Pendiente","En proceso","Completado"].map(v => ({ value: v, label: v }));
  const techOptions: SelectOption[]     = [
    { value: "", label: "Sin asignar" },
    ...drivers.filter(d => d.status === "Activo").map(d => ({ value: d.name, label: d.name, sub: d.code })),
  ];

  return (
    <ModalOverlay onClose={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d1117] shadow-2xl">
        <div className="h-0.5 w-full bg-amber-500" />
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 pb-4 pt-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500">Mantenimiento</p>
            <h2 className="mt-0.5 text-base font-bold text-white">Agendar orden de trabajo</h2>
            <p className="mt-0.5 text-xs text-white/30">
              {vehicle.plate && <span className="font-mono text-white/50">{vehicle.plate} · </span>}
              {vehicle.brand} {vehicle.model}
            </p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white/40 hover:bg-white/[0.06] hover:text-white">
            <X size={14} />
          </button>
        </div>

        <div className="max-h-[65vh] space-y-4 overflow-y-auto px-6 py-5">
          <DarkField label="Título de la OT" required>
            <input className={darkInputCls} placeholder="Ej. Cambio de filtros y aceite" value={form.title}
              onChange={(e) => set("title", e.target.value)} />
          </DarkField>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DarkField label="Tipo" required>
              <DarkSelect options={kindOptions} value={form.kind} onChange={(v) => set("kind", v as MaintenanceKind)} />
            </DarkField>
            <DarkField label="Prioridad">
              <DarkSelect options={priorityOptions} value={form.priority} onChange={(v) => set("priority", v as MaintenancePriority)} />
            </DarkField>
          </div>
          <DarkField label="Estado">
            <DarkSelect options={statusOptions} value={form.status} onChange={(v) => set("status", v as MaintenanceStatus)} />
          </DarkField>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DarkField label="Fecha programada" required>
              <DatePicker
                value={form.scheduledDate}
                onChange={(v) => set("scheduledDate", v)}
                placeholder="Seleccionar"
              />
            </DarkField>
            <DarkField label="Fecha límite" required>
              <DatePicker
                value={form.dueDate}
                onChange={(v) => set("dueDate", v)}
                placeholder="Seleccionar"
              />
            </DarkField>
          </div>
          <DarkField label="Técnico responsable">
            <DarkSelect options={techOptions} value={form.technician} onChange={(v) => set("technician", v)} placeholder="Seleccionar técnico..." />
          </DarkField>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DarkField label="Costo mano de obra">
              <input className={darkInputCls} type="number" placeholder="0.00" value={form.laborCost ?? ""}
                onChange={(e) => set("laborCost", e.target.value ? Number(e.target.value) : null)} />
            </DarkField>
            <DarkField label="Costo repuestos">
              <input className={darkInputCls} type="number" placeholder="0.00" value={form.partsCost ?? ""}
                onChange={(e) => set("partsCost", e.target.value ? Number(e.target.value) : null)} />
            </DarkField>
          </div>
          <DarkField label="Notas">
            <textarea rows={3}
              className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:border-amber-500/50 focus:outline-none transition"
              placeholder="Observaciones, repuestos necesarios..." value={form.notes}
              onChange={(e) => set("notes", e.target.value)} />
          </DarkField>
        </div>

        <div className="flex gap-3 border-t border-white/[0.06] px-6 py-4">
          <button onClick={onClose} className="flex-1 rounded-xl border border-white/[0.08] py-2.5 text-sm font-semibold text-white/50 transition hover:bg-white/[0.05] hover:text-white">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={saving || !isValid}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-black transition hover:bg-amber-400 active:scale-95 disabled:opacity-40">
            {saving ? <><Loader2 size={13} className="animate-spin" />Guardando...</> : <><Wrench size={13} />Agendar OT</>}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ─── VehicleForm (shared between Create & Edit) ───────────────────────────────

type VehicleFormData = {
  code: string; name: string; assetType: AssetType; category: AssetCategory;
  status: AssetStatus; site: string; siteId: string | null; responsible: string; brand: string; model: string;
  serial: string; plate: string; year: string; color: string; maxLoad: string;
  fuelType: AssetFuelType; oilType: string; oilCapacity: string; location: string;
  availability: string; observations: string; utilization: string; nextMaintenance: string;
  lastInspection: string; alerts: number; photoUrls: string[]; garageId: string | null;
};

const EMPTY_FORM: VehicleFormData = {
  code: "", name: "", assetType: "Vehiculo", category: "Camioneta", status: "Operativo",
  site: "", responsible: "", siteId: null, brand: "", model: "", serial: "", plate: "", year: "", color: "",
  maxLoad: "", fuelType: "Diesel", oilType: "", oilCapacity: "", location: "",
  availability: "Disponible", observations: "", utilization: "0%",
  nextMaintenance: "", lastInspection: "", alerts: 0, photoUrls: [], garageId: null,
};

interface VehicleFormProps {
  form: VehicleFormData;
  set: (field: keyof VehicleFormData, value: unknown) => void;
  inputCls: string;
  selectCls: string;
  labelCls: string;
  spanCls: string;
}

function VehicleFormFields({ form, set, inputCls, selectCls, labelCls, spanCls }: VehicleFormProps) {
  const { sites } = useSites();
  const { drivers } = useDrivers();
  const { garages } = useGarages();

  return (
    <>
      {/* Identificación */}
      <section>
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">Identificación</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={labelCls}>
            <span className={spanCls}>Placa *</span>
            <input className={inputCls} placeholder="Ej. ABC-1234" maxLength={8} value={form.plate}
              onChange={(e) => set("plate", e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))} />
          </label>
          <label className={labelCls}>
            <span className={spanCls}>Código interno</span>
            <input className={inputCls} placeholder="Ej. VH-001" maxLength={40} value={form.code}
              onChange={(e) => set("code", e.target.value.toUpperCase())} />
          </label>
          <label className={`${labelCls} col-span-2`}>
            <span className={spanCls}>Nombre / descripción</span>
            <input className={inputCls} placeholder="Ej. Camioneta de reparto Guayaquil" maxLength={120} value={form.name}
              onChange={(e) => set("name", e.target.value)} />
          </label>
        </div>
      </section>

      {/* Datos técnicos */}
      <section>
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">Datos técnicos</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={labelCls}>
            <span className={spanCls}>Marca</span>
            <input className={inputCls} placeholder="Toyota" value={form.brand}
              onChange={(e) => set("brand", e.target.value)} />
          </label>
          <label className={labelCls}>
            <span className={spanCls}>Modelo</span>
            <input className={inputCls} placeholder="Hilux 4x4" value={form.model}
              onChange={(e) => set("model", e.target.value)} />
          </label>
          <label className={labelCls}>
            <span className={spanCls}>Año</span>
            <input className={inputCls} placeholder="2022" maxLength={4} value={form.year}
              onKeyDown={(e) => { if (!/[0-9]/.test(e.key) && !['Backspace','Delete','Tab','ArrowLeft','ArrowRight','Home','End'].includes(e.key)) e.preventDefault(); }}
              onChange={(e) => set("year", e.target.value.replace(/\D/g, '').slice(0, 4))} />
          </label>
          <label className={labelCls}>
            <span className={spanCls}>N° chasis / serie</span>
            <input className={inputCls} placeholder="9FTWW7..." value={form.serial}
              onChange={(e) => set("serial", e.target.value)} />
          </label>
          <label className={labelCls}>
            <span className={spanCls}>Categoría</span>
            <select className={selectCls} value={form.category}
              onChange={(e) => set("category", e.target.value as AssetCategory)}>
              {(["Camion","Camioneta","SUV","Furgon","Furgoneta","Bus","Volqueta"] as AssetCategory[]).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            <span className={spanCls}>Color</span>
            <input className={inputCls} placeholder="Blanco" value={form.color}
              onChange={(e) => set("color", e.target.value)} />
          </label>
        </div>
      </section>

      {/* Combustible y aceite */}
      <section>
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">Combustible y aceite</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          <label className={labelCls}>
            <span className={spanCls}>Combustible</span>
            <select className={selectCls} value={form.fuelType}
              onChange={(e) => set("fuelType", e.target.value as AssetFuelType)}>
              {(["Diesel","Gasolina","Electrico","Hibrido"] as AssetFuelType[]).map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            <span className={spanCls}>Tipo de aceite</span>
            <input className={inputCls} placeholder="15W-40" value={form.oilType}
              onChange={(e) => set("oilType", e.target.value)} />
          </label>
          <label className={labelCls}>
            <span className={spanCls}>Capacidad aceite</span>
            <input className={inputCls} placeholder="6L" value={form.oilCapacity}
              onChange={(e) => set("oilCapacity", e.target.value)} />
          </label>
        </div>
      </section>

      {/* Operación */}
      <section>
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">Operación</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={labelCls}>
            <span className={spanCls}>Garaje</span>
            <select className={selectCls} value={form.garageId ?? ""}
              onChange={(e) => set("garageId", e.target.value || null)}>
              <option value="">Sin garaje</option>
              {garages.map(g => (
                <option key={g.id} value={g.id}>
                  {g.name}{g.location ? ` — ${g.location}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            <span className={spanCls}>Responsable</span>
            <select className={selectCls} value={form.responsible}
              onChange={(e) => set("responsible", e.target.value)}>
              <option value="">Sin responsable</option>
              {drivers.filter(d => d.status === "Activo").map(d => (
                <option key={d.id} value={d.name}>{d.name}</option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            <span className={spanCls}>Estado</span>
            <select className={selectCls} value={form.status}
              onChange={(e) => set("status", e.target.value as AssetStatus)}>
              <option value="Operativo">Operativo</option>
              <option value="En mantenimiento">En mantenimiento</option>
              <option value="Fuera de servicio">Fuera de servicio</option>
            </select>
          </label>
          <label className={labelCls}>
            <span className={spanCls}>Carga máxima</span>
            <input className={inputCls} placeholder="1000 kg" value={form.maxLoad}
              onChange={(e) => set("maxLoad", e.target.value)} />
          </label>
          <label className={`${labelCls} col-span-2`}>
            <span className={spanCls}>Observaciones</span>
            <textarea rows={2} className={inputCls} value={form.observations}
              onChange={(e) => set("observations", e.target.value)} />
          </label>
        </div>
      </section>
    </>
  );
}

// ─── CreateVehicleModal ───────────────────────────────────────────────────────

function CreateVehicleModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { createAsset } = useAssets();
  const [form, setForm] = useState<VehicleFormData>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const set = (field: keyof VehicleFormData, value: unknown) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async () => {
    if (!form.plate.trim() && !form.name.trim()) { toast.error("Completá al menos la placa o el nombre"); return; }
    // Validación de placa (si está llena)
    if (form.plate.trim() && !/^[A-Z]{3}-?\d{3,4}$/.test(form.plate.trim().toUpperCase())) {
      toast.error("Formato de placa inválido", { description: "Use el formato ABC-1234 o ABC1234." });
      return;
    }
    // Validación de año
    if (form.year.trim()) {
      const y = Number(form.year);
      const now = new Date().getFullYear();
      if (!Number.isInteger(y) || y < 1900 || y > now + 1) {
        toast.error("Año inválido", { description: `Use un año entre 1900 y ${now + 1}.` });
        return;
      }
    }
    setSaving(true);
    const id = await createAsset(form);
    setSaving(false);
    if (!id) { toast.error("No se pudo crear el vehículo"); return; }
    toast.success("Vehículo creado", { description: `${form.plate || form.name} registrado correctamente.` });
    onCreated();
    onClose();
  };

  const inputCls  = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-500/10 dark:border-white/[0.08] dark:bg-gray-900 dark:text-white";
  const selectCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-500/10 dark:border-white/[0.08] dark:bg-gray-900 dark:text-white";
  const labelCls  = "block space-y-1.5";
  const spanCls   = "text-xs font-semibold text-gray-500 dark:text-gray-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 py-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0d1320]">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 dark:bg-sky-500/10">
              <Car size={16} className="text-sky-500" />
            </div>
            <div>
              <p className="text-base font-black text-gray-800 dark:text-white">Nuevo vehículo</p>
              <p className="text-xs text-gray-400">Completá los datos del vehículo a registrar</p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.08]">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <VehicleFormFields form={form} set={set} inputCls={inputCls} selectCls={selectCls} labelCls={labelCls} spanCls={spanCls} />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-100 bg-gray-50/80 px-6 py-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.06]">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-sky-500 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-60 active:scale-95">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {saving ? "Guardando..." : "Crear vehículo"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── EditVehicleModal ─────────────────────────────────────────────────────────

function EditVehicleModal({ vehicle, onClose, onUpdated }: {
  vehicle: Asset; onClose: () => void; onUpdated: () => void;
}) {
  const { updateAsset } = useAssets();
  const [form, setForm] = useState<VehicleFormData>({
    code: vehicle.code, name: vehicle.name, assetType: vehicle.assetType,
    category: vehicle.category, status: vehicle.status, site: vehicle.site,
    siteId: vehicle.siteId ?? null, responsible: vehicle.responsible, 
    brand: vehicle.brand, model: vehicle.model,
    serial: vehicle.serial, plate: vehicle.plate, year: vehicle.year, color: vehicle.color,
    maxLoad: vehicle.maxLoad, fuelType: vehicle.fuelType, oilType: vehicle.oilType,
    oilCapacity: vehicle.oilCapacity, location: vehicle.location, availability: vehicle.availability,
    observations: vehicle.observations, utilization: vehicle.utilization,
    nextMaintenance: vehicle.nextMaintenance, lastInspection: vehicle.lastInspection,
    alerts: vehicle.alerts, photoUrls: vehicle.photoUrls, garageId: vehicle.garageId ?? null,
  });
  const [saving, setSaving] = useState(false);

  const set = (field: keyof VehicleFormData, value: unknown) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async () => {
    if (!form.plate.trim() && !form.name.trim()) { toast.error("Completá al menos la placa o el nombre"); return; }
    setSaving(true);
    const ok = await updateAsset(vehicle.id, form as Omit<Asset, "id" | "tenantId">);
    setSaving(false);
    if (!ok) { toast.error("No se pudo actualizar el vehículo"); return; }
    toast.success("Vehículo actualizado", { description: `${form.plate || form.name} guardado correctamente.` });
    onUpdated();
    onClose();
  };

  const inputCls  = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-500/10 dark:border-white/[0.08] dark:bg-gray-900 dark:text-white";
  const selectCls = "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-500/10 dark:border-white/[0.08] dark:bg-gray-900 dark:text-white";
  const labelCls  = "block space-y-1.5";
  const spanCls   = "text-xs font-semibold text-gray-500 dark:text-gray-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 py-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0d1320]">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 dark:bg-sky-500/10">
              <Pencil size={16} className="text-sky-500" />
            </div>
            <div>
              <p className="text-base font-black text-gray-800 dark:text-white">
                Editar vehículo{form.plate && <span className="ml-2 font-mono text-sky-500">{form.plate}</span>}
              </p>
              <p className="text-xs text-gray-400">{form.brand} {form.model} · {form.year}</p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.08]">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <VehicleFormFields form={form} set={set} inputCls={inputCls} selectCls={selectCls} labelCls={labelCls} spanCls={spanCls} />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-100 bg-gray-50/80 px-6 py-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.06]">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-sky-500 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-60 active:scale-95">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />}
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── KPI Row ──────────────────────────────────────────────────────────────────

function KpiRow({ vehicles }: { vehicles: Asset[] }) {
  const operativos    = vehicles.filter(v => v.status === "Operativo").length;
  const mantenimiento = vehicles.filter(v => v.status === "En mantenimiento").length;
  const fuera         = vehicles.filter(v => v.status === "Fuera de servicio").length;
  const cards = [
    { label: "Total flota",       value: vehicles.length, sub: "unidades registradas",    cls: "border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]",                valCls: "text-gray-800 dark:text-white"          },
    { label: "Operativos",        value: operativos,      sub: "listos para despacho",    cls: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/20 dark:bg-emerald-500/5", valCls: "text-emerald-700 dark:text-emerald-300" },
    { label: "En mantenimiento",  value: mantenimiento,   sub: "con restricción técnica", cls: "border-amber-200 bg-amber-50/60 dark:border-amber-500/20 dark:bg-amber-500/5",         valCls: "text-amber-700 dark:text-amber-300"     },
    { label: "Fuera de servicio", value: fuera,           sub: "detenidos por novedad",   cls: "border-rose-200 bg-rose-50/60 dark:border-rose-500/20 dark:bg-rose-500/5",             valCls: "text-rose-700 dark:text-rose-300"       },
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

function RowMenu({ onView, onEdit, onMaintenance, onDelete, canEdit, canDelete, canMaintenance }: {
  vehicle: Asset; onView: () => void; onEdit: () => void; onMaintenance: () => void; onDelete: () => void;
  canEdit: boolean; canDelete: boolean; canMaintenance: boolean;
}) {
  return (
    <RowActionMenu
      ariaLabel="Acciones de vehículo"
      items={[
        { label: "Ver detalle",         icon: <Eye size={13} />,    onClick: onView,        tone: "default" },
        { label: "Editar",              icon: <Pencil size={13} />, onClick: onEdit,        tone: "default", disabled: !canEdit },
        { label: "Nuevo mantenimiento", icon: <Wrench size={13} />, onClick: onMaintenance, tone: "warning", disabled: !canMaintenance },
        { label: "Eliminar",            icon: <Trash2 size={13} />, onClick: onDelete,      tone: "danger",  disabled: !canDelete },
      ]}
    />
  );
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────

function DetailDrawer({ vehicle, onClose, onEdit, onDelete, onMaintenance, canEdit, canDelete, canMaintenance }: {
  vehicle: Asset; onClose: () => void; onEdit: () => void; onDelete: () => void; onMaintenance: () => void;
  canEdit: boolean; canDelete: boolean; canMaintenance: boolean;
}) {
  const { assignments } = useAssignments();
  const { maintenances } = useMaintenances();
  const { garages } = useGarages();
  const { sites } = useSites();
  const siteName = useMemo(() => {
    const found = sites.find(s => String(s.id) === vehicle.siteId?.replace("site-", ""));
    return found?.name ?? vehicle.site ?? "—";
  }, [sites, vehicle.siteId, vehicle.site]);

  const garage = useMemo(() => garages.find(g => g.id === vehicle.garageId), [garages, vehicle.garageId]);

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

  const drawerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = drawerRef.current;
    if (!el) return;
    el.style.transform = "translateX(100%)";
    requestAnimationFrame(() => {
      el.style.transition = "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)";
      el.style.transform = "translateX(0)";
    });
  }, []);

  const hasFooter = canDelete || canEdit || canMaintenance;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div ref={drawerRef}
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0d1320]"
        style={{ transform: "translateX(100%)" }}>
        <div className={`h-1 w-full ${cfg.dot}`} />

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
            <div className="mt-3"><StatusBadge status={vehicle.status} /></div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.08]">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Datos técnicos */}
          <section>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Datos técnicos</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: <Car size={12} />,      label: "Tipo",        value: vehicle.category },
                { icon: <Hash size={12} />,     label: "Chasis",      value: vehicle.serial   },
                { icon: <Fuel size={12} />,     label: "Combustible", value: vehicle.fuelType },
                { icon: <Droplets size={12} />, label: "Aceite",      value: `${vehicle.oilType} · ${vehicle.oilCapacity}` },
              ].map(({ icon, label, value }) => (
                <div key={label} className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-white/[0.05] dark:bg-white/[0.03]">
                  <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">{icon}{label}</p>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 truncate">{value || "—"}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Ubicación */}
          <section>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Ubicación y responsable</p>
            <div className="space-y-2">
              <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 dark:border-white/[0.05] dark:bg-white/[0.03]">
                <Warehouse size={13} className="shrink-0 text-gray-400" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Garaje</p>
                  <p className="truncate text-sm font-semibold text-gray-700 dark:text-gray-200">
                    {garage ? garage.name : "—"}
                  </p>
                  {garage?.location && <p className="truncate text-xs text-gray-400">{garage.location}</p>}
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

          {/* Conductor */}
          <section>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Conductor asignado</p>
            {activeAssignment ? (
              <div className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50/60 px-3 py-2.5 dark:border-sky-500/20 dark:bg-sky-500/5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-500/20">
                  <User size={13} className="text-sky-600 dark:text-sky-400" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-sky-700 dark:text-sky-300">
                    {vehicle.currentDriver?.name ?? activeAssignment.driverId}
                  </p>
                  <p className="text-xs text-sky-500">Asignado desde {fmtDate(activeAssignment.startDate)}</p>
                </div>
                <span className="ml-auto rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">Activo</span>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 px-3 py-3 text-xs text-gray-400 dark:border-white/[0.06]">
                Sin conductor asignado actualmente.
              </div>
            )}
          </section>

          {/* Mantenimiento */}
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
                  <Calendar size={11} /><span>Vence {fmtDate(lastMaintenance.dueDate)}</span>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 px-3 py-3 text-xs text-gray-400 dark:border-white/[0.06]">
                Sin historial de mantenimiento.
              </div>
            )}
          </section>
        </div>

        {hasFooter && (
          <div className="flex items-center justify-between gap-2 border-t border-gray-100 bg-gray-50/80 px-5 py-3.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
            {canDelete ? (
              <button onClick={onDelete} className="flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-500/20 dark:text-rose-400 dark:hover:bg-rose-500/10">
                <Trash2 size={12} />Eliminar
              </button>
            ) : <div />}
            <div className="flex gap-2">
              {canMaintenance && (
                <button onClick={onMaintenance} className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/5 dark:text-amber-400">
                  <Wrench size={12} />Mantenimiento
                </button>
              )}
              {canEdit && (
                <button onClick={onEdit} className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.06]">
                  <Pencil size={12} />Editar
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ vehicle, onConfirm, onCancel }: { vehicle: Asset; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0d1320]">
        <div className="px-6 pb-4 pt-5">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-500/10">
            <AlertTriangle size={18} className="text-rose-500" />
          </div>
          <h3 className="text-base font-bold text-gray-800 dark:text-white">Eliminar vehículo</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            ¿Seguro que deseas eliminar{" "}
            <span className="font-semibold text-gray-700 dark:text-gray-200">{vehicle.plate} — {vehicle.brand} {vehicle.model}</span>? Esta acción no se puede deshacer.
          </p>
        </div>
        <div className="flex gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <button onClick={onCancel} className="flex-1 rounded-xl border border-gray-200 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 dark:border-white/[0.08] dark:text-gray-300">Cancelar</button>
          <button onClick={onConfirm} className="flex-1 rounded-xl bg-rose-500 py-2 text-sm font-semibold text-white hover:bg-rose-600 active:scale-95">Eliminar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Table Row ────────────────────────────────────────────────────────────────

function VehicleRow({ vehicle, index, garageName, onView, onEdit, onMaintenance, onDelete, canEdit, canDelete, canMaintenance }: {
  vehicle: Asset; index: number; garageName: string;
  onView: () => void; onEdit: () => void; onMaintenance: () => void; onDelete: () => void;
  canEdit: boolean; canDelete: boolean; canMaintenance: boolean;
}) {
  return (
    <tr className="group cursor-pointer border-b border-gray-100 transition-colors hover:bg-gray-50/80 dark:border-white/[0.04] dark:hover:bg-white/[0.02]" onClick={onView}>
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
        <p className="text-sm text-gray-700 dark:text-gray-300">{vehicle.responsible || "—"}</p>
      </td>
      <td className="px-4 py-3.5">
        {garageName ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300">
            <Warehouse size={11} />{garageName}
          </span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>
      <td className="px-4 py-3.5">
        <p className="text-sm text-gray-700 dark:text-gray-300">{vehicle.fuelType || "—"}</p>
        <p className="mt-0.5 text-xs text-gray-400">{vehicle.oilType || ""}</p>
      </td>
      <td className="px-4 py-3.5"><StatusBadge status={vehicle.status} /></td>
      <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
        <RowMenu vehicle={vehicle} onView={onView} onEdit={onEdit} onMaintenance={onMaintenance} onDelete={onDelete}
          canEdit={canEdit} canDelete={canDelete} canMaintenance={canMaintenance} />
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FlotasPage() {
  const { assets, loading, deleteAsset, refresh } = useAssets();
  const { garages } = useGarages();
  const { can } = usePermissions();

  const canCreate      = can("gestion", "flotas", "crear");
  const canEdit        = can("gestion", "flotas", "editar");
  const canDelete      = can("gestion", "flotas", "eliminar");
  const canMaintenance = can("mantenimiento", "ordenes", "crear");

  const vehicles = useMemo(() => assets.filter(a => a.assetType === "Vehiculo"), [assets]);

  // Mapa id → nombre para lookup O(1)
  const garageMap = useMemo(() =>
    Object.fromEntries(garages.map(g => [g.id, g.name])),
    [garages]
  );

  const [search, setSearch]                 = useState("");
  const [filterStatus, setFilterStatus]     = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterGarage, setFilterGarage]     = useState("");
  const [page, setPage]                     = useState(1);

  const [drawerVehicle, setDrawerVehicle]         = useState<Asset | null>(null);
  const [deleteTarget, setDeleteTarget]           = useState<Asset | null>(null);
  const [showCreateModal, setShowCreateModal]     = useState(false);
  const [editTarget, setEditTarget]               = useState<Asset | null>(null);
  const [maintenanceTarget, setMaintenanceTarget] = useState<Asset | null>(null);

  const setFilter = (fn: () => void) => { fn(); setPage(1); };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles.filter(v => {
      const matchQ = !q || v.plate.toLowerCase().includes(q) || v.brand.toLowerCase().includes(q) || v.model.toLowerCase().includes(q) || (v.responsible ?? "").toLowerCase().includes(q) || (v.site ?? "").toLowerCase().includes(q);
      const matchS = !filterStatus   || v.status === filterStatus;
      const matchC = !filterCategory || v.category === filterCategory;
      const matchG = !filterGarage   || v.garageId === filterGarage;
      return matchQ && matchS && matchC && matchG;
    });
  }, [vehicles, search, filterStatus, filterCategory, filterGarage]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const categories = useMemo(() => [...new Set(vehicles.map(v => v.category).filter(Boolean))], [vehicles]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteAsset(deleteTarget.id);
      toast.success("Vehículo eliminado", { description: `${deleteTarget.plate} — ${deleteTarget.brand} ${deleteTarget.model}` });
      if (drawerVehicle?.id === deleteTarget.id) setDrawerVehicle(null);
    } catch { toast.error("No se pudo eliminar el vehículo"); }
    setDeleteTarget(null);
  };

  const openEdit = (vehicle: Asset) => { setDrawerVehicle(null); setEditTarget(vehicle); };
  const openMaintenance = (vehicle: Asset) => { setDrawerVehicle(null); setMaintenanceTarget(vehicle); };

  return (
    <div className="space-y-5">
      <ModulePageHeader
        badge="Gestión vehicular" title="Flotas"
        subtitle="Centro operativo de vehículos — detalle completo, historial y acciones sin salir de la tabla."
        accent="sky"
        action={
          canCreate ? (
            <button onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-sky-500/20 hover:bg-sky-600 active:scale-95">
              <Plus size={15} />Nuevo vehículo
            </button>
          ) : undefined
        }
      />

      <KpiRow vehicles={vehicles} />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="relative min-w-0 flex-1">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={e => setFilter(() => setSearch(e.target.value))}
            placeholder="Buscar por placa, marca, o responsable..."
            className="h-9 w-full rounded-xl border border-gray-200 bg-transparent pl-8 pr-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/10 dark:border-white/[0.08] dark:text-white" />
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Filter size={13} className="text-gray-400" />
          {/* Estado */}
          <div className="relative">
            <select value={filterStatus} onChange={e => setFilter(() => setFilterStatus(e.target.value))}
              className="h-9 appearance-none rounded-xl border border-gray-200 bg-white pl-3 pr-7 text-sm text-gray-700 focus:border-sky-400 focus:outline-none dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300">
              <option value="">Estado</option>
              <option value="Operativo">Operativo</option>
              <option value="En mantenimiento">En mantenimiento</option>
              <option value="Fuera de servicio">Fuera de servicio</option>
            </select>
            <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
          {/* Tipo */}
          <div className="relative">
            <select value={filterCategory} onChange={e => setFilter(() => setFilterCategory(e.target.value))}
              className="h-9 appearance-none rounded-xl border border-gray-200 bg-white pl-3 pr-7 text-sm text-gray-700 focus:border-sky-400 focus:outline-none dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300">
              <option value="">Tipo</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
          {/* Garaje */}
          {garages.length > 0 && (
            <div className="relative">
              <select value={filterGarage} onChange={e => setFilter(() => setFilterGarage(e.target.value))}
                className="h-9 appearance-none rounded-xl border border-gray-200 bg-white pl-3 pr-7 text-sm text-gray-700 focus:border-sky-400 focus:outline-none dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300">
                <option value="">Garaje</option>
                {garages.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 dark:border-white/[0.06]">
          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Vehículos operativos</h3>
            <p className="text-xs text-gray-400">{filtered.length} resultado{filtered.length !== 1 ? "s" : ""}</p>
          </div>
          {totalPages > 1 && <span className="text-xs text-gray-400">Pág. {page} / {totalPages}</span>}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-20 text-gray-400">
            <Loader2 size={18} className="animate-spin" /><span className="text-sm">Cargando vehículos...</span>
          </div>
        ) : paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-14">
            <Car size={20} className="text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-400">Sin vehículos para los filtros actuales</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px]">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-white/[0.06]">
                    {["#", "Placa", "Vehículo", "Responsable", "Garaje", "Combustible / aceite", "Estado", ""].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((vehicle, index) => (
                    <VehicleRow
                      key={vehicle.id}
                      vehicle={vehicle}
                      index={(page - 1) * PAGE_SIZE + index}
                      garageName={vehicle.garageId ? (garageMap[vehicle.garageId] ?? "") : ""}
                      onView={() => setDrawerVehicle(vehicle)}
                      onEdit={() => openEdit(vehicle)}
                      onMaintenance={() => openMaintenance(vehicle)}
                      onDelete={() => setDeleteTarget(vehicle)}
                      canEdit={canEdit} canDelete={canDelete} canMaintenance={canMaintenance}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 dark:border-white/[0.06]">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-40 dark:border-white/[0.08] dark:text-gray-400">
                  <ChevronLeft size={13} />Anterior
                </button>
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(p => (
                    <button key={p} onClick={() => setPage(p)}
                      className={`h-7 w-7 rounded-lg text-xs font-semibold transition ${page === p ? "bg-sky-500 text-white" : "text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.05]"}`}>
                      {p}
                    </button>
                  ))}
                </div>
                <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-40 dark:border-white/[0.08] dark:text-gray-400">
                  Siguiente<ChevronRight size={13} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals & Drawer */}
      {drawerVehicle && (
        <DetailDrawer vehicle={drawerVehicle} onClose={() => setDrawerVehicle(null)}
          onEdit={() => openEdit(drawerVehicle)}
          onDelete={() => { setDeleteTarget(drawerVehicle); setDrawerVehicle(null); }}
          onMaintenance={() => openMaintenance(drawerVehicle)}
          canEdit={canEdit} canDelete={canDelete} canMaintenance={canMaintenance}
        />
      )}
      {deleteTarget && (
        <DeleteConfirm vehicle={deleteTarget} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      )}
      {showCreateModal && (
        <CreateVehicleModal onClose={() => setShowCreateModal(false)} onCreated={refresh} />
      )}
      {editTarget && (
        <EditVehicleModal vehicle={editTarget} onClose={() => setEditTarget(null)} onUpdated={refresh} />
      )}
      {maintenanceTarget && (
        <CreateMaintenanceModal vehicle={maintenanceTarget} onClose={() => setMaintenanceTarget(null)} onCreated={refresh} />
      )}
    </div>
  );
}