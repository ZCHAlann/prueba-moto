import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useDrivers, type ApiDriver } from "../../../hooks/useDrivers";
import { useAssignments } from "../../../hooks/useAssignments";
import { useAssets } from "../../../hooks/useAssets";
import { useAuth } from "../../../context/AuthContext";
import { ModulePageHeader } from "../../../components/features/modules/ModulePageHeader";
import {
  AlertTriangle, Calendar, Car, ChevronDown, ChevronLeft, ChevronRight,
  Eye, Filter, Loader2, Mail, MapPin, MoreHorizontal, Pencil,
  Phone, Plus, Search, Trash2, User, UserCheck, UserX, X,
  Fuel, Droplets, FileText, ClipboardList, Link2,
} from "lucide-react";

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 12;
const REPORT_KEY = "aplismart-driver-reports-v1";
const ADMIN_ROLES = ["owner_empresa", "admin_empresa", "supervisor", "superadmin"];

function fmtDate(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });
}

function nowStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

function createReportForm(driverId = ""): ReportFormState {
  return { driverId, fuelLevel: "1/2", oilLevel: "1/2", vehicleFaults: "", invoices: [{ receiptNumber: "", description: "", photoName: "" }] };
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputCls = "h-10 w-full rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.05] px-3 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/10 transition";
const selectCls = inputCls + " appearance-none cursor-pointer";

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
    { label: "Total conductores", value: drivers.length, sub: "base de la empresa",   cls: "border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]",                           valCls: "text-gray-800 dark:text-white"          },
    { label: "Activos",           value: activos,         sub: "disponibles",           cls: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/20 dark:bg-emerald-500/5",             valCls: "text-emerald-700 dark:text-emerald-300" },
    { label: "Inactivos",         value: inactivos,       sub: "fuera de operación",    cls: "border-gray-200 bg-gray-50 dark:border-white/[0.06] dark:bg-white/[0.03]",                        valCls: "text-gray-500 dark:text-gray-400"       },
    { label: "Licencias vencidas",value: vencidos,        sub: "requieren atención",    cls: "border-rose-200 bg-rose-50/60 dark:border-rose-500/20 dark:bg-rose-500/5",                        valCls: "text-rose-700 dark:text-rose-300"       },
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

function RowMenu({ driver, canManage, onView, onEdit, onReport, onAssign, onDelete }: {
  driver: ApiDriver; canManage: boolean;
  onView: () => void; onEdit: () => void; onReport: () => void;
  onAssign: () => void; onDelete: () => void;
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
    { label: "Ver detalle",       icon: <Eye size={13} />,         action: onView,   cls: "text-gray-700 dark:text-gray-300",               always: true  },
    { label: "Editar",            icon: <Pencil size={13} />,      action: onEdit,   cls: "text-gray-700 dark:text-gray-300",               always: true  },
    { label: "Crear reporte",     icon: <ClipboardList size={13}/>, action: onReport, cls: "text-cyan-600 dark:text-cyan-400",               always: true  },
    { label: "Asignar vehículo",  icon: <Car size={13} />,         action: onAssign, cls: "text-sky-600 dark:text-sky-400",                 always: true  },
    { label: "Eliminar",          icon: <Trash2 size={13} />,      action: onDelete, cls: "text-rose-600 dark:text-rose-400",               always: canManage },
  ].filter(i => i.always);

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

function DetailDrawer({ driver, onClose, onEdit, onReport, onAssign, onDelete, canManage }: {
  driver: ApiDriver; canManage: boolean;
  onClose: () => void; onEdit: () => void; onReport: () => void;
  onAssign: () => void; onDelete: () => void;
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
      <div
        ref={drawerRef}
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0d1320]"
        style={{ transform: "translateX(100%)" }}
      >
        {/* Top bar */}
        <div className={`h-1 w-full ${driver.status === "Activo" ? "bg-emerald-400" : "bg-gray-300"}`} />

        {/* Header */}
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Contacto */}
          <section>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Contacto</p>
            <div className="space-y-2">
              {[
                { icon: <Phone size={12} />,  label: "Teléfono", value: driver.phone || "—" },
                { icon: <Mail size={12} />,   label: "Correo",   value: driver.email || "—" },
                { icon: <MapPin size={12} />, label: "Sede",     value: driver.site  || "—" },
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

          {/* Licencia */}
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

          {/* Vehículo asignado */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Vehículo asignado</p>
              {!activeAssignment && (
                <button
                  onClick={onAssign}
                  className="flex items-center gap-1 rounded-lg border border-sky-200 px-2 py-1 text-[10px] font-bold text-sky-600 hover:bg-sky-50 dark:border-sky-500/20 dark:text-sky-400"
                >
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

          {/* Notas */}
          {driver.notes && (
            <section>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Notas</p>
              <p className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm leading-relaxed text-gray-700 dark:border-white/[0.05] dark:bg-white/[0.03] dark:text-gray-300">
                {driver.notes}
              </p>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-gray-100 bg-gray-50/80 px-5 py-3.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
          {canManage ? (
            <button onClick={onDelete} className="flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-500/20 dark:text-rose-400 dark:hover:bg-rose-500/10">
              <Trash2 size={12} />Eliminar
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onReport} className="flex items-center gap-1.5 rounded-xl border border-cyan-200 bg-cyan-50/60 px-3 py-1.5 text-xs font-semibold text-cyan-700 hover:bg-cyan-100 dark:border-cyan-500/20 dark:bg-cyan-500/5 dark:text-cyan-400">
              <ClipboardList size={12} />Reporte
            </button>
            <button onClick={onEdit} className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.06]">
              <Pencil size={12} />Editar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Assign Vehicle Modal ─────────────────────────────────────────────────────

function AssignModal({ driver, onClose }: { driver: ApiDriver; onClose: () => void }) {
  const { assets }      = useAssets();
  const { assignments, createAssignment } = useAssignments();
  const [assetId, setAssetId]   = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes]       = useState("");
  const [saving, setSaving]     = useState(false);

  const activeIds  = new Set(assignments.filter(a => a.status === "Activa").map(a => a.assetId));
  const available  = assets.filter(a => a.assetType === "Vehiculo" && !activeIds.has(a.id));

  const handleSubmit = async () => {
    if (!assetId) return;
    setSaving(true);
    try {
      await createAssignment({ assetId, driverId: driver.id, startDate, endDate: null, status: "Activa", notes, handoverFileName: "" });
      toast.success("Vehículo asignado", { description: `${driver.firstName} ${driver.lastName} — ${assets.find(a => a.id === assetId)?.plate}` });
      onClose();
    } catch {
      toast.error("No se pudo crear la asignación");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0d1320]">
        <div className="h-0.5 bg-sky-500 w-full" />
        <div className="flex items-center justify-between border-b border-gray-100 px-6 pb-4 pt-5 dark:border-white/[0.06]">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-sky-500">Asignar vehículo</p>
            <h2 className="mt-0.5 text-base font-bold text-gray-800 dark:text-white">{driver.firstName} {driver.lastName}</h2>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10">
            <X size={15} />
          </button>
        </div>
        <div className="space-y-4 px-6 py-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Vehículo disponible <span className="text-rose-400">*</span></label>
            <div className="relative">
              <select className={selectCls} value={assetId} onChange={e => setAssetId(e.target.value)}>
                <option value="">Seleccionar vehículo...</option>
                {available.map(a => <option key={a.id} value={a.id}>{a.plate} — {a.brand} {a.model}</option>)}
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
            {available.length === 0 && <p className="text-xs text-amber-600 dark:text-amber-400">No hay vehículos disponibles sin asignación activa.</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Fecha de inicio</label>
            <input type="date" className={inputCls} value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Observaciones</label>
            <textarea rows={3} className="w-full resize-none rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.05] px-3 py-2.5 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/10 transition"
              value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas de entrega o condiciones." />
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-6 py-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 dark:border-white/[0.08] dark:text-gray-300">Cancelar</button>
          <button onClick={handleSubmit} disabled={saving || !assetId}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-sky-500/20 hover:bg-sky-600 active:scale-95 disabled:opacity-50">
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? "Asignando..." : "Confirmar asignación"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Report Modal ─────────────────────────────────────────────────────────────

function ReportModal({ drivers, initialDriverId, reports, onSave, onClose }: {
  drivers: ApiDriver[];
  initialDriverId: string;
  reports: DriverReport[];
  onSave: (r: DriverReport) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ReportFormState>(() => createReportForm(initialDriverId));
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof ReportFormState>(k: K, v: ReportFormState[K]) => setForm(f => ({ ...f, [k]: v }));

  const updateInvoice = (i: number, patch: Partial<DriverInvoiceDraft>) =>
    setForm(f => ({ ...f, invoices: f.invoices.map((inv, idx) => idx === i ? { ...inv, ...patch } : inv) }));

  const handleSubmit = async () => {
    if (!form.driverId) { toast.error("Selecciona un conductor"); return; }
    if (!form.vehicleFaults.trim()) { toast.error("Describe las novedades del vehículo"); return; }
    setSaving(true);
    const driver = drivers.find(d => d.id === form.driverId);
    const report: DriverReport = {
      id: `dr-${Date.now()}`,
      driverId: form.driverId,
      driverName: driver ? `${driver.firstName} ${driver.lastName}` : "",
      createdAt: nowStamp(),
      fuelLevel: form.fuelLevel,
      oilLevel: form.oilLevel,
      vehicleFaults: form.vehicleFaults.trim(),
      faultPhotoNames: [],
      invoices: form.invoices.filter(i => i.receiptNumber.trim() || i.description.trim()),
    };
    onSave(report);
    toast.success("Reporte creado", { description: report.driverName });
    setSaving(false);
    onClose();
  };

  const levelOpts: { value: FluidLevel; label: string }[] = [
    { value: "1/4", label: "1/4" }, { value: "1/2", label: "1/2" },
    { value: "3/4", label: "3/4" }, { value: "Lleno", label: "Lleno" },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0d1320]">
        <div className="h-0.5 bg-cyan-500 w-full" />
        <div className="flex items-center justify-between border-b border-gray-100 px-6 pb-4 pt-5 dark:border-white/[0.06]">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-cyan-500">Reporte operativo</p>
            <h2 className="mt-0.5 text-base font-bold text-gray-800 dark:text-white">Registrar novedades del conductor</h2>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"><X size={15} /></button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto px-6 py-5 space-y-4">
          {/* Conductor */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Conductor</label>
            <div className="relative">
              <select className={selectCls} value={form.driverId} onChange={e => set("driverId", e.target.value)}>
                <option value="">Seleccionar conductor...</option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.firstName} {d.lastName} / {d.licenseNumber}</option>)}
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
          </div>

          {/* Niveles */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-white/[0.05] dark:bg-white/[0.03]">
              <p className="mb-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-400"><Fuel size={10} />Combustible</p>
              <div className="relative">
                <select className={selectCls} value={form.fuelLevel} onChange={e => set("fuelLevel", e.target.value as FluidLevel)}>
                  {levelOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-white/[0.05] dark:bg-white/[0.03]">
              <p className="mb-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gray-400"><Droplets size={10} />Aceite</p>
              <div className="relative">
                <select className={selectCls} value={form.oilLevel} onChange={e => set("oilLevel", e.target.value as FluidLevel)}>
                  {levelOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
            </div>
          </div>

          {/* Fallas */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Novedades del vehículo <span className="text-rose-400">*</span></label>
            <textarea rows={4} className="w-full resize-none rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.05] px-3 py-2.5 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/10 transition"
              value={form.vehicleFaults} onChange={e => set("vehicleFaults", e.target.value)}
              placeholder="Describe las fallas encontradas o escribe: Sin novedades." />
          </div>

          {/* Facturas */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Facturas</p>
              <button type="button"
                onClick={() => set("invoices", [...form.invoices, { receiptNumber: "", description: "", photoName: "" }])}
                className="flex items-center gap-1 rounded-lg border border-cyan-200 px-2.5 py-1 text-xs font-semibold text-cyan-600 hover:bg-cyan-50 dark:border-cyan-500/20 dark:text-cyan-400">
                <Plus size={11} />Agregar
              </button>
            </div>
            <div className="space-y-2">
              {form.invoices.map((inv, i) => (
                <div key={i} className="grid grid-cols-[1fr_1.5fr_auto] gap-2 rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-white/[0.05] dark:bg-white/[0.03]">
                  <input className={inputCls} placeholder="Nro. comprobante" value={inv.receiptNumber} onChange={e => updateInvoice(i, { receiptNumber: e.target.value })} />
                  <input className={inputCls} placeholder="Descripción" value={inv.description} onChange={e => updateInvoice(i, { description: e.target.value })} />
                  <button type="button" onClick={() => set("invoices", form.invoices.filter((_, idx) => idx !== i))}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-rose-200 text-rose-500 hover:bg-rose-50 dark:border-rose-500/20">
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-6 py-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 dark:border-white/[0.08] dark:text-gray-300">Cancelar</button>
          <button onClick={handleSubmit} disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-cyan-500/20 hover:bg-cyan-600 active:scale-95 disabled:opacity-50">
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? "Guardando..." : "Guardar reporte"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────

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

function DriverRow({ driver, index, canManage, onView, onEdit, onReport, onAssign, onDelete }: {
  driver: ApiDriver; index: number; canManage: boolean;
  onView: () => void; onEdit: () => void; onReport: () => void;
  onAssign: () => void; onDelete: () => void;
}) {
  return (
    <tr className="group cursor-pointer border-b border-gray-100 transition-colors hover:bg-gray-50/80 dark:border-white/[0.04] dark:hover:bg-white/[0.02]"
      onClick={onView}>
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
        <p className="text-sm text-gray-700 dark:text-gray-300">{driver.site || "—"}</p>
      </td>
      <td className="px-4 py-3.5">
        <StatusBadge status={driver.status} />
      </td>
      <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
        <RowMenu
          driver={driver} canManage={canManage}
          onView={onView} onEdit={onEdit} onReport={onReport}
          onAssign={onAssign} onDelete={onDelete}
        />
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DriversPage() {
  const { drivers, loading, deleteDriver } = useDrivers();
  const { session } = useAuth();
  const canManage = ADMIN_ROLES.includes(session?.role ?? "");

  const [search, setSearch]               = useState("");
  const [filterStatus, setFilterStatus]   = useState("");
  const [page, setPage]                   = useState(1);

  const [drawerDriver, setDrawerDriver]   = useState<ApiDriver | null>(null);
  const [deleteTarget, setDeleteTarget]   = useState<ApiDriver | null>(null);
  const [reportDriverId, setReportDriverId] = useState<string | null>(null);
  const [assignDriver, setAssignDriver]   = useState<ApiDriver | null>(null);

  const [reports, setReports] = useState<DriverReport[]>([]);
  useEffect(() => {
    try { const r = localStorage.getItem(REPORT_KEY); setReports(r ? JSON.parse(r) : []); } catch { setReports([]); }
  }, []);
  useEffect(() => {
    localStorage.setItem(REPORT_KEY, JSON.stringify(reports));
  }, [reports]);

  const setFilter = (fn: () => void) => { fn(); setPage(1); };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return drivers.filter(d => {
      const matchQ = !q || d.name.toLowerCase().includes(q) || d.licenseNumber.toLowerCase().includes(q)
        || d.email.toLowerCase().includes(q) || d.site.toLowerCase().includes(q)
        || d.phone.toLowerCase().includes(q) || d.licenseType.toLowerCase().includes(q);
      const matchS = !filterStatus || d.status === filterStatus;
      return matchQ && matchS;
    });
  }, [drivers, search, filterStatus]);

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

  const openReport = (driverId?: string) => {
    if (drivers.length === 0) { toast.error("Sin conductores", { description: "Registra un conductor primero." }); return; }
    setReportDriverId(driverId ?? drivers[0]?.id ?? "");
  };

  return (
    <div className="space-y-5">
      <ModulePageHeader
        badge="Gestión operativa"
        title="Conductores"
        subtitle="Control del personal asignable — licencias, contacto, vehículo activo y reportes en un solo lugar."
        accent="cyan"
        action={
          <a href="/operaciones/conductores/nuevo"
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-cyan-500/20 hover:bg-cyan-600 active:scale-95">
            <Plus size={15} />Nuevo conductor
          </a>
        }
      />

      <KpiRow drivers={drivers} />

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
          <button onClick={() => openReport()}
            className="flex items-center gap-1.5 rounded-xl border border-cyan-200 bg-cyan-50/60 px-3 py-1.5 text-xs font-semibold text-cyan-700 hover:bg-cyan-100 dark:border-cyan-500/20 dark:bg-cyan-500/5 dark:text-cyan-400">
            <ClipboardList size={13} />Crear reporte
          </button>
        </div>
      </div>

      {/* Table */}
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
                    <DriverRow
                      key={driver.id}
                      driver={driver}
                      index={(page - 1) * PAGE_SIZE + index}
                      canManage={canManage}
                      onView={() => setDrawerDriver(driver)}
                      onEdit={() => { window.location.href = `/operaciones/conductores/${driver.id}/editar`; }}
                      onReport={() => openReport(driver.id)}
                      onAssign={() => setAssignDriver(driver)}
                      onDelete={() => setDeleteTarget(driver)}
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

      {/* Drawer */}
      {drawerDriver && (
        <DetailDrawer
          driver={drawerDriver} canManage={canManage}
          onClose={() => setDrawerDriver(null)}
          onEdit={() => { window.location.href = `/operaciones/conductores/${drawerDriver.id}/editar`; }}
          onReport={() => { openReport(drawerDriver.id); setDrawerDriver(null); }}
          onAssign={() => { setAssignDriver(drawerDriver); setDrawerDriver(null); }}
          onDelete={() => { setDeleteTarget(drawerDriver); setDrawerDriver(null); }}
        />
      )}

      {/* Modals */}
      {reportDriverId !== null && (
        <ReportModal
          drivers={drivers}
          initialDriverId={reportDriverId}
          reports={reports}
          onSave={r => setReports(prev => [r, ...prev])}
          onClose={() => setReportDriverId(null)}
        />
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