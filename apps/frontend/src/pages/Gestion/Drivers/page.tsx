import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useDrivers, type ApiDriver } from "../../../hooks/useDrivers";
import { useAssignments } from "../../../hooks/useAssignments";
import { useAssets } from "../../../hooks/useAssets";
import { useSites } from "../../../hooks/useSites";
import { usePermissions } from "../../../hooks/usePermissions";
import { ModulePageHeader } from "../../../components/features/modules/ModulePageHeader";
import { DatePicker } from "../../../components/ui/date-picker/DatePicker";
import {
  AlertTriangle, Car, ChevronDown, ChevronLeft, ChevronRight,
  Eye, Filter, Loader2, Mail, MapPin, MoreHorizontal, Pencil,
  Phone, Plus, Search, Trash2, User, X,
  Fuel, Droplets, ClipboardList,
} from "lucide-react";
import { HandoverWizard } from "../../Gestion/Asignaciones/components/HandoerWizard";
import type { Asset } from "../../../types/activo";
import { FileCheck, Paperclip } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { useDriverReports, type ApiDriverReport, type DriverReportInvoice } from "../../../hooks/useDriverReports";

// ─── Types ────────────────────────────────────────────────────────────────────

type FluidLevel = "1/4" | "1/2" | "3/4" | "Lleno";

type DriverInvoiceDraft = {
  receiptNumber: string;
  description: string;
  photoName: string;
};

type DriverReport = {
  id: string;
  driverId: string;
  driverName: string;
  createdAt: string;
  fuelLevel: FluidLevel;
  oilLevel: FluidLevel;
  vehicleFaults: string;
  faultPhotoNames: string[];
  invoices: DriverInvoiceDraft[];
};

type ReportFormState = {
  driverId: string;
  fuelLevel: FluidLevel;
  oilLevel: FluidLevel;
  vehicleFaults: string;
  invoices: DriverInvoiceDraft[];
};

type DriverFormState = {
  code: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  site: string;
  licenseNumber: string;
  licenseType: string;
  licenseExpiry: string;
  licensePoints: number;
  status: "Activo" | "Inactivo";
  notes: string;
};

type DriverFormErrors = Partial<Record<keyof DriverFormState, string>>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 12;
const REPORT_KEY = "aplismart-driver-reports-v1";

function fmtDate(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

function createDriverForm(driver?: ApiDriver): DriverFormState {
  return {
    code:          driver?.code          ?? "",
    firstName:     driver?.firstName     ?? "",
    lastName:      driver?.lastName      ?? "",
    email:         driver?.email         ?? "",
    phone:         driver?.phone         ?? "",
    site:          driver?.site          ?? "",
    licenseNumber: driver?.licenseNumber ?? "",
    licenseType:   driver?.licenseType   ?? "",
    licenseExpiry: driver?.licenseExpiry ?? "",
    licensePoints: driver?.licensePoints ?? 0,
    status:        driver?.status        ?? "Activo",
    notes:         driver?.notes         ?? "",
  };
}

function validateDriverForm(form: DriverFormState): DriverFormErrors {
  const errors: DriverFormErrors = {};
  if (!form.code.trim())      errors.code      = "El código es requerido.";
  if (!form.firstName.trim()) errors.firstName = "El nombre es requerido.";
  if (!form.lastName.trim())  errors.lastName  = "El apellido es requerido.";
  return errors;
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputCls = "h-10 w-full rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.05] px-3 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/10 transition";
const selectCls = inputCls + " appearance-none cursor-pointer";

// ─── Level badge helpers ───────────────────────────────────────────────────────

const levelColor = (v: string | null) =>
  v === "Lleno" ? "text-emerald-600 dark:text-emerald-400" :
  v === "3/4"   ? "text-sky-600 dark:text-sky-400" :
  v === "1/2"   ? "text-amber-600 dark:text-amber-400" :
                  "text-rose-600 dark:text-rose-400";

const levelBg = (v: string | null) =>
  v === "Lleno" ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20" :
  v === "3/4"   ? "bg-sky-50 border-sky-200 dark:bg-sky-500/10 dark:border-sky-500/20" :
  v === "1/2"   ? "bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20" :
                  "bg-rose-50 border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/20";

const levelBadge = (v: string | null) =>
  v === "Lleno" ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-300" :
  v === "3/4"   ? "bg-sky-50 border-sky-200 text-sky-700 dark:bg-sky-500/10 dark:border-sky-500/20 dark:text-sky-300" :
  v === "1/2"   ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-300" :
                  "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-300";

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg =
    status === "Activo"
      ? { dot: "bg-emerald-400", cls: "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20" }
      : { dot: "bg-gray-400",    cls: "text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-white/[0.05] border-gray-200 dark:border-white/[0.06]" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-semibold ${cfg.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {status}
    </span>
  );
}

// ─── License expiry badge ─────────────────────────────────────────────────────

function LicenseBadge({ expiry }: { expiry: string }) {
  const days = daysUntil(expiry);
  if (days > 60)  return <p className="mt-0.5 text-xs text-gray-400">Vence {fmtDate(expiry)}</p>;
  if (days > 0)   return <p className="mt-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">⚠ Vence en {days}d</p>;
  return <p className="mt-0.5 text-xs font-semibold text-rose-600 dark:text-rose-400">✕ Vencida</p>;
}

// ─── KPI Row ──────────────────────────────────────────────────────────────────

function KpiRow({ drivers }: { drivers: ApiDriver[] }) {
  const activos   = drivers.filter(d => d.status === "Activo").length;
  const inactivos = drivers.filter(d => d.status === "Inactivo").length;
  const vencidos  = drivers.filter(d => daysUntil(d.licenseExpiry) <= 0).length;

  const cards = [
    { label: "Total conductores", value: drivers.length, sub: "base de la empresa",  cls: "border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]",                        valCls: "text-gray-800 dark:text-white"          },
    { label: "Activos",           value: activos,         sub: "disponibles",          cls: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/20 dark:bg-emerald-500/5",          valCls: "text-emerald-700 dark:text-emerald-300" },
    { label: "Inactivos",         value: inactivos,       sub: "fuera de operación",   cls: "border-gray-200 bg-gray-50 dark:border-white/[0.06] dark:bg-white/[0.03]",                     valCls: "text-gray-500 dark:text-gray-400"       },
    { label: "Licencias vencidas",value: vencidos,        sub: "requieren atención",   cls: "border-rose-200 bg-rose-50/60 dark:border-rose-500/20 dark:bg-rose-500/5",                     valCls: "text-rose-700 dark:text-rose-300"       },
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

// ─── Row menu ─────────────────────────────────────────────────────────────────

function RowMenu({ driver, canEdit, canDelete, onView, onEdit, onReport, onAssign, onDelete }: {
  driver: ApiDriver;
  canEdit: boolean;
  canDelete: boolean;
  onView: () => void;
  onEdit: () => void;
  onReport: () => void;
  onAssign: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const items = [
    { label: "Ver detalle",      icon: <Eye size={13} />,           action: onView,   cls: "text-gray-700 dark:text-gray-300", show: true      },
    { label: "Editar",           icon: <Pencil size={13} />,        action: onEdit,   cls: "text-gray-700 dark:text-gray-300", show: canEdit   },
    { label: "Crear reporte",    icon: <ClipboardList size={13} />, action: onReport, cls: "text-cyan-600 dark:text-cyan-400", show: true      },
    { label: "Asignar vehículo", icon: <Car size={13} />,           action: onAssign, cls: "text-sky-600 dark:text-sky-400",   show: true      },
    { label: "Eliminar",         icon: <Trash2 size={13} />,        action: onDelete, cls: "text-rose-600 dark:text-rose-400", show: canDelete },
  ].filter(i => i.show);

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

// ─── Driver Form Modal ────────────────────────────────────────────────────────

function DriverFormModal({ open, driver, onClose, onCreate, onUpdate }: {
  open: boolean;
  driver: ApiDriver | null;
  onClose: () => void;
  onCreate: (form: DriverFormState) => Promise<void>;
  onUpdate: (id: string, form: DriverFormState) => Promise<void>;
}) {
  const { sites } = useSites();
  const [form, setForm] = useState<DriverFormState>(() => createDriverForm(driver ?? undefined));
  const [errors, setErrors] = useState<DriverFormErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(createDriverForm(driver ?? undefined));
      setErrors({});
    }
  }, [open, driver]);

  const set = <K extends keyof DriverFormState>(key: K, value: DriverFormState[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    const errs = validateDriverForm(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      toast.error("Formulario incompleto", { description: "Completa los campos requeridos." });
      return;
    }
    setSaving(true);
    try {
      if (driver) {
        await onUpdate(driver.id, form);
        toast.success("Conductor actualizado", { description: `${form.firstName} ${form.lastName}` });
      } else {
        await onCreate(form);
        toast.success("Conductor creado", { description: `${form.firstName} ${form.lastName}` });
      }
      onClose();
    } catch {
      toast.error("Error al guardar", { description: "No se pudo completar la operación." });
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const licenseTypes = ["A", "B", "C", "D", "E", "F"];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0d1320]">
        <div className="h-0.5 w-full bg-cyan-500" />
        <div className="flex items-center justify-between border-b border-gray-100 px-6 pb-4 pt-5 dark:border-white/[0.06]">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-cyan-500">
              {driver ? "Editar conductor" : "Nuevo conductor"}
            </p>
            <h2 className="mt-0.5 text-base font-bold text-gray-800 dark:text-white">
              {driver ? `${driver.firstName} ${driver.lastName}` : "Registrar conductor"}
            </h2>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.08]">
            <X size={15} />
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Código <span className="text-rose-400">*</span></label>
              <input className={inputCls} placeholder="COND-001" value={form.code} onChange={e => set("code", e.target.value.toUpperCase())} />
              {errors.code && <p className="text-xs text-rose-500">{errors.code}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Estado</label>
              <div className="relative">
                <select className={selectCls} value={form.status} onChange={e => set("status", e.target.value as "Activo" | "Inactivo")}>
                  <option value="Activo">Activo</option>
                  <option value="Inactivo">Inactivo</option>
                </select>
                <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Nombre <span className="text-rose-400">*</span></label>
              <input className={inputCls} placeholder="Juan" value={form.firstName} onChange={e => set("firstName", e.target.value)} />
              {errors.firstName && <p className="text-xs text-rose-500">{errors.firstName}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Apellido <span className="text-rose-400">*</span></label>
              <input className={inputCls} placeholder="Pérez" value={form.lastName} onChange={e => set("lastName", e.target.value)} />
              {errors.lastName && <p className="text-xs text-rose-500">{errors.lastName}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Correo</label>
              <input type="email" className={inputCls} placeholder="correo@empresa.com" value={form.email} onChange={e => set("email", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Teléfono</label>
              <input className={inputCls} placeholder="0999 000 000" value={form.phone} onChange={e => set("phone", e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Sede</label>
            <div className="relative">
              <select className={selectCls} value={form.site} onChange={e => set("site", e.target.value)}>
                <option value="">Sin sede asignada</option>
                {sites.map(s => (<option key={s.id} value={s.name}>{s.name}</option>))}
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-white/[0.05] dark:bg-white/[0.03] space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Información de licencia</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Número de licencia</label>
                <input className={inputCls} placeholder="0912345678" value={form.licenseNumber} onChange={e => set("licenseNumber", e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Tipo</label>
                <div className="relative">
                  <select className={selectCls} value={form.licenseType} onChange={e => set("licenseType", e.target.value)}>
                    <option value="">Seleccionar tipo...</option>
                    {["A", "B", "C", "D", "E", "F"].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Fecha de vencimiento</label>
                <DatePicker
                  value={form.licenseExpiry}
                  onChange={(v) => set("licenseExpiry", v)}
                  placeholder="Vencimiento de licencia"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Puntos</label>
                <input type="number" min={0} max={30} className={inputCls} placeholder="30" value={form.licensePoints} onChange={e => set("licensePoints", Number(e.target.value))} />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Notas</label>
            <textarea rows={3}
              className="w-full resize-none rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.05] px-3 py-2.5 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/10 transition"
              placeholder="Observaciones adicionales sobre el conductor."
              value={form.notes} onChange={e => set("notes", e.target.value)} />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-6 py-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 dark:border-white/[0.08] dark:text-gray-300">Cancelar</button>
          <button onClick={handleSubmit} disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-cyan-500/20 hover:bg-cyan-600 active:scale-95 disabled:opacity-50">
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? "Guardando..." : driver ? "Guardar cambios" : "Crear conductor"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────

function DetailDrawer({ driver, canEdit, canDelete, onClose, onEdit, onReport, onAssign, onDelete }: {
  driver: ApiDriver;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onEdit: () => void;
  onReport: () => void;
  onAssign: () => void;
  onDelete: () => void;
}) {
  const { assignments } = useAssignments();
  const { assets }      = useAssets();

  const activeAssignment = useMemo(
    () => assignments.find(a => a.driverId === driver.id && a.status === "Activa"),
    [assignments, driver.id]
  );
  const assignedAsset = useMemo(
    () => activeAssignment ? assets.find(a => a.id === activeAssignment.assetId) : null,
    [assets, activeAssignment]
  );

  const days = daysUntil(driver.licenseExpiry);
  const licenseColor =
    days > 60  ? "text-emerald-600 dark:text-emerald-400" :
    days > 0   ? "text-amber-600 dark:text-amber-400"     :
                 "text-rose-600 dark:text-rose-400";

  const drawerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = drawerRef.current;
    if (!el) return;
    el.style.transform = "translateX(100%)";
    requestAnimationFrame(() => {
      el.style.transition = "transform 0.35s cubic-bezier(0.32,0.72,0,1)";
      el.style.transform  = "translateX(0)";
    });
  }, []);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div ref={drawerRef}
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0d1320]"
        style={{ transform: "translateX(100%)" }}>
        <div className={`h-1 w-full ${driver.status === "Activo" ? "bg-emerald-400" : "bg-gray-300"}`} />

        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 dark:border-white/[0.06]">
          <div className="flex items-center gap-3 min-w-0">
            {driver.photoUrl ? (
              <img src={driver.photoUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
            ) : (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-50 dark:bg-cyan-500/10 text-lg font-black text-cyan-600 dark:text-cyan-400">
                {driver.firstName[0]}{driver.lastName[0]}
              </div>
            )}
            <div className="min-w-0">
              <p className="font-black text-gray-800 dark:text-white truncate">{driver.firstName} {driver.lastName}</p>
              <p className="text-xs text-gray-400">{driver.licenseNumber}</p>
              <div className="mt-1"><StatusBadge status={driver.status} /></div>
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.08]">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <section>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Contacto</p>
            <div className="space-y-2">
              {[
                { icon: <Phone size={12} />,  label: "Teléfono", value: driver.phone || "—" },
                { icon: <Mail size={12} />,   label: "Correo",   value: driver.email || "—" },
                { icon: <MapPin size={12} />, label: "Sede",     value: driver.siteName ?? "—" },
              ].map(({ icon, label, value }) => (
                <div key={label} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 dark:border-white/[0.05] dark:bg-white/[0.03]">
                  <span className="text-gray-400">{icon}</span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
                    <p className="truncate text-sm font-semibold text-gray-700 dark:text-gray-200">{value}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Licencia</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-white/[0.05] dark:bg-white/[0.03]">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Tipo</p>
                <p className="mt-1 text-sm font-black text-gray-800 dark:text-white">{driver.licenseType || "—"}</p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-white/[0.05] dark:bg-white/[0.03]">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Puntos</p>
                <p className="mt-1 text-sm font-black text-gray-800 dark:text-white">{driver.licensePoints}</p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-white/[0.05] dark:bg-white/[0.03]">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Vence</p>
                <p className={`mt-1 text-sm font-black ${licenseColor}`}>{fmtDate(driver.licenseExpiry)}</p>
                {days <= 60 && <p className={`text-[10px] font-semibold ${licenseColor}`}>{days > 0 ? `${days}d` : "Vencida"}</p>}
              </div>
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Vehículo asignado</p>
              {!activeAssignment && (
                <button onClick={onAssign} className="flex items-center gap-1 rounded-lg border border-sky-200 px-2 py-1 text-[10px] font-bold text-sky-600 hover:bg-sky-50 dark:border-sky-500/20 dark:text-sky-400">
                  <Plus size={10} />Asignar
                </button>
              )}
            </div>
            {assignedAsset ? (
              <div className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50/60 px-3 py-3 dark:border-sky-500/20 dark:bg-sky-500/5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-500/20">
                  <Car size={14} className="text-sky-600 dark:text-sky-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sky-700 dark:text-sky-300">{assignedAsset.plate}</p>
                  <p className="text-xs text-sky-500">{assignedAsset.brand} {assignedAsset.model} · desde {fmtDate(activeAssignment!.startDate)}</p>
                </div>
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">Activo</span>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 px-3 py-3 text-xs text-gray-400 dark:border-white/[0.06]">
                Sin vehículo asignado actualmente.
              </div>
            )}
          </section>

          {driver.notes && (
            <section>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Notas</p>
              <p className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm leading-relaxed text-gray-700 dark:border-white/[0.05] dark:bg-white/[0.03] dark:text-gray-300">
                {driver.notes}
              </p>
            </section>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-gray-100 bg-gray-50/80 px-5 py-3.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
          {canDelete ? (
            <button onClick={onDelete} className="flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-500/20 dark:text-rose-400 dark:hover:bg-rose-500/10">
              <Trash2 size={12} />Eliminar
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onReport} className="flex items-center gap-1.5 rounded-xl border border-cyan-200 bg-cyan-50/60 px-3 py-1.5 text-xs font-semibold text-cyan-700 hover:bg-cyan-100 dark:border-cyan-500/20 dark:bg-cyan-500/5 dark:text-cyan-400">
              <ClipboardList size={12} />Reporte
            </button>
            {canEdit && (
              <button onClick={onEdit} className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.06]">
                <Pencil size={12} />Editar
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Assign Modal ─────────────────────────────────────────────────────────────

function AssignModal({ driver, onClose }: { driver: ApiDriver; onClose: () => void }) {
  const { assets }      = useAssets();
  const { assignments, createAssignment, updateHandover } = useAssignments();
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  const activeIds  = useMemo(() => new Set(assignments.filter(a => a.status === "Activa").map(a => a.assetId)), [assignments]);
  const available  = useMemo(() => assets.filter(a => a.assetType === "Vehiculo" && !activeIds.has(a.id)), [assets, activeIds]);
  const assignmentCount = useMemo(() => assignments.filter(a => a.driverId === driver.id).length, [assignments, driver.id]);

  if (selectedAsset) {
    return (
      <HandoverWizard
        open={true}
        driverId={driver.id}
        assetId={selectedAsset.id}
        driver={{ firstName: driver.firstName, lastName: driver.lastName, phone: driver.phone ?? null }}
        asset={{ plate: selectedAsset.plate, brand: selectedAsset.brand, model: selectedAsset.model, color: selectedAsset.color, year: selectedAsset.year }}
        assignmentCount={assignmentCount}
        createAssignment={createAssignment}
        updateHandover={updateHandover}
        onClose={onClose}
        onComplete={onClose}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0d1320]">
        <div className="h-0.5 bg-sky-500 w-full" />
        <div className="flex items-center justify-between border-b border-gray-100 px-6 pb-4 pt-5 dark:border-white/[0.06]">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-sky-500">Asignar vehículo</p>
            <h2 className="mt-0.5 text-base font-bold text-gray-800 dark:text-white">{driver.firstName} {driver.lastName}</h2>
            <p className="text-xs text-gray-400">Selecciona el vehículo a asignar</p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"><X size={15} /></button>
        </div>
        <div className="px-6 py-4">
          {available.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8">
              <Car size={24} className="text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-400">No hay vehículos disponibles sin asignación activa.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {available.map(asset => (
                <button key={asset.id} onClick={() => setSelectedAsset(asset)}
                  className="w-full flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-left transition hover:border-sky-300 hover:bg-sky-50/60 dark:border-white/[0.06] dark:bg-white/[0.03] dark:hover:border-sky-500/30 dark:hover:bg-sky-500/5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-500/20">
                    <Car size={15} className="text-sky-600 dark:text-sky-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-gray-800 dark:text-white">{asset.plate}</p>
                    <p className="text-xs text-gray-400 truncate">{asset.brand} {asset.model} · {asset.year}</p>
                  </div>
                  <ChevronRight size={14} className="shrink-0 text-gray-400" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-gray-100 px-6 py-4 dark:border-white/[0.06]">
          <button onClick={onClose} className="w-full rounded-xl border border-gray-200 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 dark:border-white/[0.08] dark:text-gray-300">Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Report Modal ─────────────────────────────────────────────────────────────

function ReportModal({ driver, onClose }: { driver: ApiDriver; onClose: () => void }) {
  const { session } = useAuth();
  const companyId   = session?.companyId;
  const { createReport } = useDriverReports(driver.id);

  type InvoiceDraft = {
    receiptNumber: string;
    description:   string;
    file:          File | null;
    fileUrl:       string | null;
    uploading:     boolean;
  };

  const [fuelLevel,     setFuelLevel]     = useState<string>("1/2");
  const [oilLevel,      setOilLevel]      = useState<string>("1/2");
  const [vehicleFaults, setVehicleFaults] = useState("");
  const [invoices,      setInvoices]      = useState<InvoiceDraft[]>([
    { receiptNumber: "", description: "", file: null, fileUrl: null, uploading: false },
  ]);
  const [saving, setSaving] = useState(false);
  const levelOpts = ["1/4", "1/2", "3/4", "Lleno"];

  const uploadInvoiceFile = async (index: number, file: File) => {
    setInvoices(prev => prev.map((inv, i) => i === index ? { ...inv, file, uploading: true } : inv));
    try {
      const form = new FormData();
      form.append("files", file);
      const res  = await fetch(`/api/upload/invoice-files?companyId=${companyId}`, { method: "POST", body: form });
      if (!res.ok) throw new Error();
      const { urls } = await res.json();
      setInvoices(prev => prev.map((inv, i) => i === index ? { ...inv, fileUrl: urls[0], uploading: false } : inv));
    } catch {
      toast.error("No se pudo subir el archivo");
      setInvoices(prev => prev.map((inv, i) => i === index ? { ...inv, file: null, uploading: false } : inv));
    }
  };

  const updateInvoice = (index: number, patch: Partial<InvoiceDraft>) =>
    setInvoices(prev => prev.map((inv, i) => i === index ? { ...inv, ...patch } : inv));

  const handleSubmit = async () => {
    if (!vehicleFaults.trim()) { toast.error("Describe las novedades del vehículo"); return; }
    if (invoices.some(i => i.uploading)) { toast.error("Espera a que terminen las subidas"); return; }
    setSaving(true);
    try {
      await createReport({
        fuelLevel, oilLevel,
        vehicleFaults: vehicleFaults.trim(),
        invoices: invoices.filter(i => i.receiptNumber.trim() || i.description.trim()).map(i => ({ receiptNumber: i.receiptNumber, description: i.description, fileUrl: i.fileUrl ?? null })),
        fileUrls: invoices.map(i => i.fileUrl).filter(Boolean) as string[],
      });
      toast.success("Reporte guardado", { description: `${driver.firstName} ${driver.lastName}` });
      onClose();
    } catch {
      toast.error("No se pudo guardar el reporte");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0d1320]">
        <div className="h-0.5 bg-cyan-500 w-full" />
        <div className="flex items-center justify-between border-b border-gray-100 px-6 pb-4 pt-5 dark:border-white/[0.06]">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-cyan-500">Reporte operativo</p>
            <h2 className="mt-0.5 text-base font-bold text-gray-800 dark:text-white">{driver.firstName} {driver.lastName}</h2>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"><X size={15} /></button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[{ label: "Combustible", icon: <Fuel size={10} />, value: fuelLevel, set: setFuelLevel }, { label: "Aceite", icon: <Droplets size={10} />, value: oilLevel, set: setOilLevel }].map(({ label, icon, value, set: setter }) => (
              <div key={label} className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-white/[0.05] dark:bg-white/[0.03]">
                <p className="mb-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">{icon}{label}</p>
                <div className="relative">
                  <select className={selectCls} value={value} onChange={e => setter(e.target.value)}>
                    {levelOpts.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Novedades del vehículo <span className="text-rose-400">*</span></label>
            <textarea rows={4}
              className="w-full resize-none rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.05] px-3 py-2.5 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/10 transition"
              placeholder="Describe las fallas encontradas o escribe: Sin novedades."
              value={vehicleFaults} onChange={e => setVehicleFaults(e.target.value)} />
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Facturas</p>
              <button type="button" onClick={() => setInvoices(prev => [...prev, { receiptNumber: "", description: "", file: null, fileUrl: null, uploading: false }])}
                className="flex items-center gap-1 rounded-lg border border-cyan-200 px-2.5 py-1 text-xs font-semibold text-cyan-600 hover:bg-cyan-50 dark:border-cyan-500/20 dark:text-cyan-400">
                <Plus size={11} />Agregar
              </button>
            </div>
            <div className="space-y-3">
              {invoices.map((inv, i) => (
                <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-white/[0.05] dark:bg-white/[0.03] space-y-2">
                  <div className="grid grid-cols-[1fr_1.5fr_auto] gap-2">
                    <input className={inputCls} placeholder="Nro. comprobante" value={inv.receiptNumber} onChange={e => updateInvoice(i, { receiptNumber: e.target.value })} />
                    <input className={inputCls} placeholder="Descripción" value={inv.description} onChange={e => updateInvoice(i, { description: e.target.value })} />
                    <button type="button" onClick={() => setInvoices(prev => prev.filter((_, idx) => idx !== i))}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-rose-200 text-rose-500 hover:bg-rose-50 dark:border-rose-500/20">
                      <X size={13} />
                    </button>
                  </div>
                  {inv.fileUrl ? (
                    <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 dark:border-emerald-500/20 dark:bg-emerald-500/5">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-100 dark:bg-emerald-500/20">
                        <FileCheck size={12} className="text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <p className="flex-1 truncate text-xs font-semibold text-emerald-700 dark:text-emerald-300">{inv.file?.name ?? "Archivo subido"}</p>
                      <button type="button" onClick={() => updateInvoice(i, { file: null, fileUrl: null })} className="text-emerald-500 hover:text-rose-500"><X size={12} /></button>
                    </div>
                  ) : (
                    <label className={`flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2 transition ${inv.uploading ? "border-cyan-300 bg-cyan-50/60 dark:border-cyan-500/20 dark:bg-cyan-500/5" : "border-gray-200 hover:border-cyan-300 hover:bg-cyan-50/40 dark:border-white/[0.06] dark:hover:border-cyan-500/20"}`}>
                      <input type="file" className="hidden" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={inv.uploading}
                        onChange={e => { const file = e.target.files?.[0]; if (file) uploadInvoiceFile(i, file); }} />
                      {inv.uploading ? <Loader2 size={13} className="animate-spin text-cyan-500" /> : <Paperclip size={13} className="text-gray-400" />}
                      <span className="text-xs text-gray-400">{inv.uploading ? "Subiendo..." : "Adjuntar imagen o PDF"}</span>
                    </label>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-6 py-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 dark:border-white/[0.08] dark:text-gray-300">Cancelar</button>
          <button onClick={handleSubmit} disabled={saving || invoices.some(i => i.uploading)}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-cyan-500/20 hover:bg-cyan-600 active:scale-95 disabled:opacity-50">
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? "Guardando..." : "Guardar reporte"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirm (conductor) ───────────────────────────────────────────────

function DeleteConfirm({ driver, onConfirm, onCancel }: { driver: ApiDriver; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0d1320]">
        <div className="px-6 pb-4 pt-5">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-500/10">
            <AlertTriangle size={18} className="text-rose-500" />
          </div>
          <h3 className="text-base font-bold text-gray-800 dark:text-white">Eliminar conductor</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            ¿Seguro que deseas eliminar a{" "}
            <span className="font-semibold text-gray-700 dark:text-gray-200">{driver.firstName} {driver.lastName}</span>
            ? Se cerrarán sus asignaciones activas.
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

function DriverRow({ driver, index, canEdit, canDelete, onView, onEdit, onReport, onAssign, onDelete }: {
  driver: ApiDriver; index: number; canEdit: boolean; canDelete: boolean;
  onView: () => void; onEdit: () => void; onReport: () => void; onAssign: () => void; onDelete: () => void;
}) {
  return (
    <tr className="group cursor-pointer border-b border-gray-100 transition-colors hover:bg-gray-50/80 dark:border-white/[0.04] dark:hover:bg-white/[0.02]" onClick={onView}>
      <td className="px-4 py-3.5 text-xs font-semibold text-gray-400">{index + 1}</td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          {driver.photoUrl ? (
            <img src={driver.photoUrl} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-50 dark:bg-cyan-500/10 text-xs font-black text-cyan-600 dark:text-cyan-400">
              {driver.firstName[0]}{driver.lastName[0]}
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-gray-800 dark:text-white truncate">{driver.firstName} {driver.lastName}</p>
            <p className="text-[11px] text-gray-400 truncate">{driver.notes || driver.code}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3.5">
        <p className="font-semibold text-gray-800 dark:text-white">{driver.licenseNumber}</p>
        <LicenseBadge expiry={driver.licenseExpiry} />
      </td>
      <td className="px-4 py-3.5">
        <p className="text-sm text-gray-700 dark:text-gray-300">{driver.licenseType}</p>
        <p className="mt-0.5 text-xs text-gray-400">{driver.licensePoints} pts</p>
      </td>
      <td className="px-4 py-3.5">
        <p className="text-sm text-gray-700 dark:text-gray-300">{driver.phone || "—"}</p>
        <p className="mt-0.5 text-xs text-gray-400 truncate max-w-[140px]">{driver.email || "Sin correo"}</p>
      </td>
      <td className="px-4 py-3.5">
        <p className="text-sm text-gray-700 dark:text-gray-300">{driver.siteName ?? "—"}</p>
      </td>
      <td className="px-4 py-3.5"><StatusBadge status={driver.status} /></td>
      <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
        <RowMenu driver={driver} canEdit={canEdit} canDelete={canDelete}
          onView={onView} onEdit={onEdit} onReport={onReport} onAssign={onAssign} onDelete={onDelete} />
      </td>
    </tr>
  );
}

// ─── Report Drawer ────────────────────────────────────────────────────────────

function ReportDrawer({ report, onClose, onDeleted }: {
  report: ApiDriverReport;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { session } = useAuth();
  const companyId   = session?.companyId;
  const drawerRef   = useRef<HTMLDivElement>(null);
  const [deleting, setDeleting]           = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const el = drawerRef.current;
    if (!el) return;
    el.style.transform = "translateX(100%)";
    requestAnimationFrame(() => {
      el.style.transition = "transform 0.35s cubic-bezier(0.32,0.72,0,1)";
      el.style.transform  = "translateX(0)";
    });
  }, []);

  const invoices = (report.invoices ?? []) as DriverReportInvoice[];
  const fileUrls = report.fileUrls ?? [];

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/company/${companyId}/drivers/${report.driverId}/reports/${report.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error();
      toast.success("Reporte eliminado");
      onDeleted();
      onClose();
    } catch {
      toast.error("No se pudo eliminar el reporte");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div ref={drawerRef}
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0d1320]"
        style={{ transform: "translateX(100%)" }}>
        <div className="h-1 w-full bg-cyan-500" />

        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 dark:border-white/[0.06]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-500">Reporte operativo</p>
            <p className="mt-0.5 text-base font-black text-gray-800 dark:text-white">{report.driverName ?? "—"}</p>
            <p className="text-xs text-gray-400">
              {new Date(report.createdAt).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.08]">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Niveles */}
          <section>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Niveles del vehículo</p>
            <div className="grid grid-cols-2 gap-2">
              <div className={`rounded-xl border p-3 ${levelBg(report.fuelLevel)}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Fuel size={11} className={levelColor(report.fuelLevel)} />
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Combustible</p>
                </div>
                <p className={`text-lg font-black ${levelColor(report.fuelLevel)}`}>{report.fuelLevel ?? "—"}</p>
              </div>
              <div className={`rounded-xl border p-3 ${levelBg(report.oilLevel)}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Droplets size={11} className={levelColor(report.oilLevel)} />
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Aceite</p>
                </div>
                <p className={`text-lg font-black ${levelColor(report.oilLevel)}`}>{report.oilLevel ?? "—"}</p>
              </div>
            </div>
          </section>

          {/* Novedades */}
          <section>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Novedades del vehículo</p>
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 dark:border-white/[0.05] dark:bg-white/[0.03]">
              <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{report.vehicleFaults || "Sin novedades registradas."}</p>
            </div>
          </section>

          {/* Facturas */}
          {invoices.length > 0 && (
            <section>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Facturas ({invoices.length})</p>
              <div className="space-y-2">
                {invoices.map((inv, i) => (
                  <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-white/[0.05] dark:bg-white/[0.03]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-700 dark:text-gray-200 truncate">{inv.description || "Sin descripción"}</p>
                        {inv.receiptNumber && <p className="mt-0.5 font-mono text-[11px] text-gray-400">#{inv.receiptNumber}</p>}
                      </div>
                      {inv.fileUrl && (
                        <a href={inv.fileUrl} target="_blank" rel="noreferrer"
                          className="flex shrink-0 items-center gap-1 rounded-lg border border-cyan-200 px-2 py-1 text-[10px] font-bold text-cyan-600 hover:bg-cyan-50 dark:border-cyan-500/20 dark:text-cyan-400"
                          onClick={e => e.stopPropagation()}>
                          <Eye size={10} />Ver
                        </a>
                      )}
                    </div>
                    {inv.fileUrl && (
                      <div className="mt-2">
                        {inv.fileUrl.match(/\.(jpg|jpeg|png|webp)$/i) ? (
                          <img src={inv.fileUrl} alt="Comprobante" className="h-32 w-full rounded-lg object-cover border border-gray-200 dark:border-white/[0.08]" />
                        ) : inv.fileUrl.match(/\.pdf$/i) ? (
                          <div className="flex flex-col gap-2">
                            <iframe src={`${inv.fileUrl}#view=FitH`} title="PDF" className="h-48 w-full rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white" />
                            <a href={inv.fileUrl} target="_blank" rel="noreferrer"
                              className="flex items-center justify-center gap-1.5 rounded-lg border border-cyan-200 bg-cyan-50/60 py-1.5 text-xs font-semibold text-cyan-700 hover:bg-cyan-100 dark:border-cyan-500/20 dark:bg-cyan-500/5 dark:text-cyan-400">
                              <Eye size={12} />Abrir PDF completo
                            </a>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Archivos adicionales */}
          {fileUrls.filter(u => !invoices.some(i => i.fileUrl === u)).length > 0 && (
            <section>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Archivos adjuntos</p>
              <div className="space-y-2">
                {fileUrls.filter(u => !invoices.some(i => i.fileUrl === u)).map((url, i) => (
                  <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-white/[0.05] dark:bg-white/[0.03]">
                    {url.match(/\.(jpg|jpeg|png|webp)$/i) ? (
                      <img src={url} alt={`Archivo ${i + 1}`} className="h-32 w-full rounded-lg object-cover border border-gray-200 dark:border-white/[0.08]" />
                    ) : url.match(/\.pdf$/i) ? (
                      <div className="flex flex-col gap-2">
                        <iframe src={`${url}#view=FitH`} title="PDF" className="h-48 w-full rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white" />
                        <a href={url} target="_blank" rel="noreferrer"
                          className="flex items-center justify-center gap-1.5 rounded-lg border border-cyan-200 bg-cyan-50/60 py-1.5 text-xs font-semibold text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/5 dark:text-cyan-400">
                          <Eye size={12} />Abrir PDF completo
                        </a>
                      </div>
                    ) : (
                      <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs font-semibold text-cyan-600 dark:text-cyan-400">
                        <Eye size={12} />Ver archivo
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {invoices.length === 0 && fileUrls.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-400 dark:border-white/[0.06]">
              Sin archivos adjuntos en este reporte.
            </div>
          )}
        </div>

        {/* Footer con eliminar */}
        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/80 px-5 py-3.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-500/20 dark:text-rose-400">
              <Trash2 size={12} />Eliminar
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">¿Confirmar?</p>
              <button onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-500 hover:bg-gray-100 dark:border-white/[0.08]">
                No
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex items-center gap-1 rounded-lg bg-rose-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-600 disabled:opacity-50">
                {deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                Sí, eliminar
              </button>
            </div>
          )}
          <span className="text-xs text-gray-400">
            {new Date(report.createdAt).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" })}
          </span>
        </div>
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DriversPage() {
  const { drivers, loading, createDriver, updateDriver, deleteDriver } = useDrivers();
  const { can } = usePermissions();

  const canCreate = can("gestion", "conductores", "crear");
  const canEdit   = can("gestion", "conductores", "editar");
  const canDelete = can("gestion", "conductores", "eliminar");

  const [activeTab, setActiveTab] = useState<"conductores" | "reportes">("conductores");

  const [search, setSearch]             = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage]                 = useState(1);

  const [drawerDriver, setDrawerDriver]           = useState<ApiDriver | null>(null);
  const [deleteTarget, setDeleteTarget]           = useState<ApiDriver | null>(null);
  const [reportDriver, setReportDriver]           = useState<ApiDriver | null>(null);
  const [assignDriver, setAssignDriver]           = useState<ApiDriver | null>(null);
  const [driverModalOpen, setDriverModalOpen]     = useState(false);
  const [driverModalTarget, setDriverModalTarget] = useState<ApiDriver | null>(null);
  const [reportDrawer, setReportDrawer]           = useState<ApiDriverReport | null>(null);
  const [reportSearch, setReportSearch]           = useState("");

  const { allReports, loadingAll, fetchAll } = useDriverReports(null);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openCreateModal = () => { setDriverModalTarget(null); setDriverModalOpen(true); };
  const openEditModal   = (driver: ApiDriver) => { setDriverModalTarget(driver); setDriverModalOpen(true); setDrawerDriver(null); };
  const openReport      = (driver: ApiDriver) => setReportDriver(driver);

  const setFilter = (fn: () => void) => { fn(); setPage(1); };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return drivers.filter(d => {
      const fullName = `${d.firstName} ${d.lastName}`.toLowerCase();
      const siteName = d.siteName?.toLowerCase() ?? "";
      const matchQ = !q || fullName.includes(q) || d.licenseNumber.toLowerCase().includes(q)
        || d.email.toLowerCase().includes(q) || siteName.includes(q)
        || d.phone.toLowerCase().includes(q) || d.licenseType.toLowerCase().includes(q);
      const matchS = !filterStatus || d.status === filterStatus;
      return matchQ && matchS;
    });
  }, [drivers, search, filterStatus]);

  const filteredReports = useMemo(() => {
    const q = reportSearch.trim().toLowerCase();
    return allReports.filter(r =>
      !q ||
      (r.driverName ?? "").toLowerCase().includes(q) ||
      (r.vehicleFaults ?? "").toLowerCase().includes(q)
    );
  }, [allReports, reportSearch]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDriver(deleteTarget.id);
      toast.success("Conductor eliminado", { description: `${deleteTarget.firstName} ${deleteTarget.lastName}` });
      if (drawerDriver?.id === deleteTarget.id) setDrawerDriver(null);
    } catch {
      toast.error("No se pudo eliminar el conductor");
    }
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-5">
      <ModulePageHeader
        badge="Gestión operativa"
        title="Conductores"
        subtitle="Control del personal asignable — licencias, contacto, vehículo activo y reportes en un solo lugar."
        accent="cyan"
        action={
          canCreate ? (
            <button onClick={openCreateModal}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-cyan-500/20 hover:bg-cyan-600 active:scale-95">
              <Plus size={15} />Nuevo conductor
            </button>
          ) : null
        }
      />

      <KpiRow drivers={drivers} />

      {/* ─── Tabs ─────────────────────────────────────────────── */}
      <div className="flex gap-1 rounded-xl border border-gray-200 bg-gray-100/60 p-1 dark:border-white/[0.06] dark:bg-white/[0.03] w-fit">
        {(["conductores", "reportes"] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`rounded-lg px-5 py-1.5 text-sm font-semibold capitalize transition ${
              activeTab === tab
                ? "bg-white text-gray-800 shadow-sm dark:bg-white/[0.08] dark:text-white"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}>
            {tab === "conductores" ? "Conductores" : `Reportes${allReports.length > 0 ? ` (${allReports.length})` : ""}`}
          </button>
        ))}
      </div>

      {/* ─── Tab: Conductores ─────────────────────────────────── */}
      {activeTab === "conductores" && (
        <>
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
            <div className="relative min-w-0 flex-1">
              <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={search} onChange={e => setFilter(() => setSearch(e.target.value))}
                placeholder="Buscar por nombre, licencia, correo o sede..."
                className="h-9 w-full rounded-xl border border-gray-200 bg-transparent pl-8 pr-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/10 dark:border-white/[0.08] dark:text-white" />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Filter size={13} className="text-gray-400" />
              <div className="relative">
                <select value={filterStatus} onChange={e => setFilter(() => setFilterStatus(e.target.value))}
                  className="h-9 appearance-none rounded-xl border border-gray-200 bg-white pl-3 pr-7 text-sm text-gray-700 focus:border-cyan-400 focus:outline-none dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300">
                  <option value="">Estado</option>
                  <option value="Activo">Activo</option>
                  <option value="Inactivo">Inactivo</option>
                </select>
                <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
            </div>
          </div>

          {/* Tabla conductores */}
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 dark:border-white/[0.06]">
              <div>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Listado de conductores</h3>
                <p className="text-xs text-gray-400">{filtered.length} resultado{filtered.length !== 1 ? "s" : ""}</p>
              </div>
              {totalPages > 1 && <span className="text-xs text-gray-400">Pág. {page} / {totalPages}</span>}
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-3 py-20 text-gray-400">
                <Loader2 size={18} className="animate-spin" /><span className="text-sm">Cargando conductores...</span>
              </div>
            ) : paginated.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-14">
                <User size={20} className="text-gray-300 dark:text-gray-600" />
                <p className="text-sm text-gray-400">Sin conductores para los filtros actuales</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px]">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-white/[0.06]">
                        {["#", "Conductor", "Licencia", "Tipo / puntos", "Contacto", "Sede", "Estado", ""].map((h, i) => (
                          <th key={i} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map((driver, index) => (
                        <DriverRow key={driver.id} driver={driver} index={(page - 1) * PAGE_SIZE + index}
                          canEdit={canEdit} canDelete={canDelete}
                          onView={() => setDrawerDriver(driver)}
                          onEdit={() => openEditModal(driver)}
                          onReport={() => openReport(driver)}
                          onAssign={() => setAssignDriver(driver)}
                          onDelete={() => setDeleteTarget(driver)} />
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
                          className={`h-7 w-7 rounded-lg text-xs font-semibold transition ${page === p ? "bg-cyan-500 text-white" : "text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.05]"}`}>
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
        </>
      )}

      {/* ─── Tab: Reportes ────────────────────────────────────── */}
      {activeTab === "reportes" && (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 dark:border-white/[0.06]">
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Reportes operativos</h3>
              <p className="text-xs text-gray-400">{filteredReports.length} reporte{filteredReports.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="relative w-56">
              <Search size={12} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={reportSearch} onChange={e => setReportSearch(e.target.value)}
                placeholder="Buscar conductor o novedad..."
                className="h-8 w-full rounded-xl border border-gray-200 bg-transparent pl-8 pr-3 text-xs text-gray-800 placeholder:text-gray-400 focus:border-cyan-400 focus:outline-none dark:border-white/[0.08] dark:text-white" />
            </div>
          </div>

          {loadingAll ? (
            <div className="flex items-center justify-center gap-3 py-12 text-gray-400">
              <Loader2 size={16} className="animate-spin" /><span className="text-sm">Cargando reportes...</span>
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10">
              <ClipboardList size={18} className="text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-400">Sin reportes registrados</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-white/[0.06]">
                    {["#", "Conductor", "Combustible", "Aceite", "Novedades", "Facturas", "Fecha", ""].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredReports.map((r, i) => {
                    const invCount = (r.invoices as DriverReportInvoice[])?.length ?? 0;
                    return (
                      <tr key={r.id}
                        className="group cursor-pointer border-b border-gray-100 transition-colors hover:bg-gray-50/80 dark:border-white/[0.04] dark:hover:bg-white/[0.02]"
                        onClick={() => setReportDrawer(r)}>
                        <td className="px-4 py-3 text-xs font-semibold text-gray-400">{i + 1}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-50 dark:bg-cyan-500/10 text-[10px] font-black text-cyan-600 dark:text-cyan-400">
                              {(r.driverName ?? "?")[0]}
                            </div>
                            <p className="text-sm font-semibold text-gray-800 dark:text-white">{r.driverName ?? "—"}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-bold ${levelBadge(r.fuelLevel)}`}>
                            <Fuel size={10} />{r.fuelLevel ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-bold ${levelBadge(r.oilLevel)}`}>
                            <Droplets size={10} />{r.oilLevel ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-[200px]">
                          <p className="truncate text-xs text-gray-600 dark:text-gray-300">{r.vehicleFaults || "—"}</p>
                        </td>
                        <td className="px-4 py-3">
                          {invCount > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 dark:bg-white/[0.08] dark:text-gray-300">
                              <ClipboardList size={10} />{invCount}
                            </span>
                          ) : <span className="text-xs text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(r.createdAt).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" })}
                          </p>
                          <p className="text-[11px] text-gray-400">
                            {new Date(r.createdAt).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <button onClick={() => setReportDrawer(r)}
                            className="rounded-lg border border-cyan-200 px-2 py-1 text-[11px] font-semibold text-cyan-600 hover:bg-cyan-50 dark:border-cyan-500/20 dark:text-cyan-400">
                            Ver
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── Drawers y modals ─────────────────────────────────── */}
      {reportDrawer && (
        <ReportDrawer
          report={reportDrawer}
          onClose={() => setReportDrawer(null)}
          onDeleted={() => { fetchAll(); setReportDrawer(null); }}
        />
      )}

      {drawerDriver && (
        <DetailDrawer driver={drawerDriver} canEdit={canEdit} canDelete={canDelete}
          onClose={() => setDrawerDriver(null)}
          onEdit={() => openEditModal(drawerDriver)}
          onReport={() => { openReport(drawerDriver); setDrawerDriver(null); }}
          onAssign={() => { setAssignDriver(drawerDriver); setDrawerDriver(null); }}
          onDelete={() => { setDeleteTarget(drawerDriver); setDrawerDriver(null); }} />
      )}

      <DriverFormModal open={driverModalOpen} driver={driverModalTarget}
        onClose={() => setDriverModalOpen(false)}
        onCreate={async (form) => { await createDriver({ ...form, name: `${form.firstName} ${form.lastName}` }); }}
        onUpdate={async (id, form) => { await updateDriver(id, { ...form, name: `${form.firstName} ${form.lastName}` }); }} />

      {reportDriver && (
        <ReportModal driver={reportDriver} onClose={() => setReportDriver(null)} />
      )}

      {assignDriver && (
        <AssignModal driver={assignDriver} onClose={() => setAssignDriver(null)} />
      )}

      {deleteTarget && (
        <DeleteConfirm driver={deleteTarget} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}