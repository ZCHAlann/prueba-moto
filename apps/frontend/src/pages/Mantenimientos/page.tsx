import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useMaintenances } from "../../hooks/useMaintenances";
import { useAssets } from "../../hooks/useAssets";
import { useDrivers } from "../../hooks/useDrivers";
import { usePermissions } from "../../hooks/usePermissions";
import { ModulePageHeader } from "../../components/features/modules/ModulePageHeader";
import type { ApiMaintenance, MaintenancePriority, MaintenanceStatus, MaintenanceKind } from "../../hooks/useMaintenances";
import type { Asset } from "../../types/activo";
import {
  Plus, Search, Wrench, AlertTriangle, Clock, CheckCircle2,
  Calendar, User, Pencil, Trash2, ChevronDown, X, Loader2,
  Car, FileText, Image as ImageIcon, Filter,
  TrendingUp, Zap, Shield, ChevronLeft, ChevronRight,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  if (!d || d === "null" || d === "undefined") return "—";
  return new Date(d).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });
}
function todayISO() { return new Date().toISOString().slice(0, 10); }
function fmtUSD(n: number | null) {
  if (!n) return "$0.00";
  return `$${n.toFixed(2)}`;
}

const PAGE_SIZE = 10;

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<MaintenanceStatus, { label: string; icon: React.ReactNode; color: string; bg: string; border: string; dot: string }> = {
  Pendiente:    { label: "Pendiente",  icon: <Clock size={11} />,        color: "text-amber-600 dark:text-amber-400",    bg: "bg-amber-50 dark:bg-amber-500/10",    border: "border-amber-200 dark:border-amber-500/20",    dot: "bg-amber-400"   },
  "En proceso": { label: "En proceso", icon: <Wrench size={11} />,       color: "text-blue-600 dark:text-blue-400",      bg: "bg-blue-50 dark:bg-blue-500/10",      border: "border-blue-200 dark:border-blue-500/20",      dot: "bg-blue-400"    },
  Completado:   { label: "Completado", icon: <CheckCircle2 size={11} />, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10", border: "border-emerald-200 dark:border-emerald-500/20", dot: "bg-emerald-400" },
};

const KIND_CFG: Record<string, { color: string; icon: React.ReactNode }> = {
  Preventivo: { color: "text-sky-500",    icon: <Shield size={11} />     },
  Correctivo: { color: "text-orange-500", icon: <Wrench size={11} />     },
  Predictivo: { color: "text-violet-500", icon: <TrendingUp size={11} /> },
  Emergencia: { color: "text-rose-500",   icon: <Zap size={11} />        },
};

const PRIORITY_CFG: Record<MaintenancePriority, { bg: string; text: string; border: string }> = {
  Emergente:  { bg: "bg-rose-50 dark:bg-rose-500/10",    text: "text-rose-600 dark:text-rose-400",    border: "border-rose-200 dark:border-rose-500/20"    },
  Alta:       { bg: "bg-orange-50 dark:bg-orange-500/10",text: "text-orange-600 dark:text-orange-400",border: "border-orange-200 dark:border-orange-500/20" },
  Normal:     { bg: "bg-blue-50 dark:bg-blue-500/10",    text: "text-blue-600 dark:text-blue-400",    border: "border-blue-200 dark:border-blue-500/20"    },
  Programado: { bg: "bg-gray-100 dark:bg-white/[0.05]",  text: "text-gray-500 dark:text-gray-400",    border: "border-gray-200 dark:border-white/[0.06]"   },
};

// ─── KPI Cards ────────────────────────────────────────────────────────────────

function KpiRow({ stats }: {
  stats: { total: number; pendientes: number; enProceso: number; completados: number; laborTotal: number; partsTotal: number; grandTotal: number }
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <div className="col-span-2 grid grid-cols-3 gap-3 md:col-span-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Total</p>
          <p className="mt-1.5 text-3xl font-black tabular-nums text-gray-800 dark:text-white">{stats.total}</p>
          <p className="mt-0.5 text-xs text-gray-400">órdenes</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-500/20 dark:bg-amber-500/5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">Pendiente</p>
          <p className="mt-1.5 text-3xl font-black tabular-nums text-amber-700 dark:text-amber-300">{stats.pendientes}</p>
          <div className="mt-1 flex items-center gap-1 text-xs text-amber-500"><Clock size={10} />por iniciar</div>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-500/20 dark:bg-blue-500/5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">En proceso</p>
          <p className="mt-1.5 text-3xl font-black tabular-nums text-blue-700 dark:text-blue-300">{stats.enProceso}</p>
          <div className="mt-1 flex items-center gap-1 text-xs text-blue-500"><Wrench size={10} />activas</div>
        </div>
      </div>
      <div className="col-span-2 grid grid-cols-3 gap-3 md:col-span-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Mano obra</p>
          <p className="mt-1.5 text-lg font-black tabular-nums text-gray-800 dark:text-white leading-tight">{fmtUSD(stats.laborTotal)}</p>
          <p className="mt-0.5 text-xs text-gray-400">costo técnico</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Repuestos</p>
          <p className="mt-1.5 text-lg font-black tabular-nums text-gray-800 dark:text-white leading-tight">{fmtUSD(stats.partsTotal)}</p>
          <p className="mt-0.5 text-xs text-gray-400">refacciones</p>
        </div>
        <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4 dark:border-orange-500/20 dark:bg-orange-500/5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-orange-600 dark:text-orange-400">Total</p>
          <p className="mt-1.5 text-lg font-black tabular-nums text-orange-700 dark:text-orange-300 leading-tight">{fmtUSD(stats.grandTotal)}</p>
          <p className="mt-0.5 text-xs text-orange-500">MO + repuestos</p>
        </div>
      </div>
    </div>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function DetailModal({ item, asset, onClose, onEdit, onDelete, onStatusChange, canEdit, canDelete }: {
  item: ApiMaintenance; asset: Asset | undefined;
  onClose: () => void; onEdit: () => void; onDelete: () => void;
  onStatusChange: (s: MaintenanceStatus) => void;
  canEdit: boolean; canDelete: boolean;
}) {
  const s = STATUS_CFG[item.status];
  const k = KIND_CFG[item.kind] ?? KIND_CFG["Correctivo"];
  const total = (item.laborCost ?? 0) + (item.partsCost ?? 0);

  const hasFooterLeft = canDelete || canEdit;
  const hasFooterRight = canEdit; // cambios de estado son una forma de edición

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0d1320]">
        <div className={`h-1 w-full ${s.dot}`} />

        <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold ${s.bg} ${s.color} ${s.border}`}>
                {s.icon}{s.label}
              </span>
              <span className={`inline-flex items-center gap-1 text-xs font-semibold ${k.color}`}>
                {k.icon}{item.kind}
              </span>
            </div>
            <h2 className="mt-2 text-lg font-bold leading-snug text-gray-800 dark:text-white">{item.title}</h2>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.08]">
            <X size={15} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-6 pb-6 space-y-4">
          {/* Costs */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Mano de obra", value: fmtUSD(item.laborCost), accent: "border-l-2 border-l-blue-400" },
              { label: "Repuestos",    value: fmtUSD(item.partsCost), accent: "border-l-2 border-l-violet-400" },
              { label: "Total OT",     value: fmtUSD(total),          accent: "border-l-2 border-l-orange-400" },
            ].map(({ label, value, accent }) => (
              <div key={label} className={`rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-white/[0.05] dark:bg-white/[0.03] ${accent}`}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
                <p className="mt-1 text-base font-bold tabular-nums text-gray-800 dark:text-white">{value}</p>
              </div>
            ))}
          </div>

          {/* Vehicle + Dates */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-white/[0.05] dark:bg-white/[0.03]">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1"><Car size={10} />Vehículo</p>
              {asset ? (
                <>
                  <p className="text-sm font-bold text-gray-800 dark:text-white">{asset.plate ?? asset.code}</p>
                  <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{[asset.brand, asset.model].filter(Boolean).join(" ")}</p>
                </>
              ) : <p className="text-sm text-gray-400">—</p>}
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-white/[0.05] dark:bg-white/[0.03]">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1"><Calendar size={10} />Fechas</p>
              {[["Programado", item.scheduledDate], ["Vence", item.dueDate], ["Cierre", item.completedDate ?? ""]].map(([l, v]) => (
                <div key={l} className="flex justify-between text-xs">
                  <span className="text-gray-400">{l}</span>
                  <span className="font-semibold text-gray-700 dark:text-gray-300">{fmtDate(v as string)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Technician */}
          {item.technician && (
            <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 dark:border-white/[0.05] dark:bg-white/[0.03]">
              <User size={13} className="text-gray-400 shrink-0" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Responsable</p>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{item.technician}</p>
              </div>
            </div>
          )}

          {/* Notes */}
          {item.notes && (
            <div>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1"><FileText size={10} />Notas</p>
              <p className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm leading-relaxed text-gray-700 dark:border-white/[0.05] dark:bg-white/[0.03] dark:text-gray-300">{item.notes}</p>
            </div>
          )}

          {/* Photos */}
          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1"><ImageIcon size={10} />Evidencias</p>
            {item.photoUrls.length === 0
              ? <p className="rounded-xl border border-dashed border-gray-200 px-3 py-2.5 text-xs text-gray-400 dark:border-white/[0.06]">Sin evidencias adjuntas.</p>
              : <div className="grid grid-cols-3 gap-2">{item.photoUrls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer" className="aspect-square overflow-hidden rounded-xl border border-gray-200 dark:border-white/[0.08]">
                    <img src={url} alt="" className="h-full w-full object-cover transition hover:scale-105" />
                  </a>
                ))}</div>
            }
          </div>
        </div>

        {/* Footer — solo se muestra si el usuario tiene al menos una acción */}
        {(hasFooterLeft || hasFooterRight) && (
          <div className="flex items-center justify-between gap-2 border-t border-gray-100 bg-gray-50/80 px-6 py-3.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
            <div className="flex gap-2">
              {canDelete && (
                <button onClick={onDelete} className="flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-500/20 dark:text-rose-400 dark:hover:bg-rose-500/10">
                  <Trash2 size={12} />Eliminar
                </button>
              )}
              {canEdit && (
                <button onClick={onEdit} className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.06]">
                  <Pencil size={12} />Editar
                </button>
              )}
            </div>
            {canEdit && (
              <div className="flex gap-2">
                {(["Pendiente", "En proceso", "Completado"] as MaintenanceStatus[]).filter(st => st !== item.status).map(st => {
                  const cfg = STATUS_CFG[st];
                  return (
                    <button key={st} onClick={() => onStatusChange(st)}
                      className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition hover:opacity-80 ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                      {cfg.icon}{cfg.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Form Modal ───────────────────────────────────────────────────────────────

type FormState = {
  assetId: string; title: string; kind: MaintenanceKind;
  priority: MaintenancePriority; status: MaintenanceStatus;
  scheduledDate: string; dueDate: string; technician: string;
  laborCost: string; partsCost: string; notes: string;
};

const inputCls = "h-10 w-full rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.05] px-3 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/10 transition";
const selectCls = inputCls + " appearance-none cursor-pointer dark:bg-gray-800";

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}{required && <span className="ml-1 text-rose-400">*</span>}
      </label>
      {children}
    </div>
  );
}

function FormModal({ mode, initial, assets, drivers, driversLoading, onClose, onSubmit }: {
  mode: "create" | "edit"; initial: FormState; assets: Asset[]; drivers: any[]; driversLoading: boolean;
  onClose: () => void; onSubmit: (f: FormState) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof FormState, v: string) => setForm(f => ({ ...f, [k]: v }));
  const isValid = form.assetId && form.title && form.dueDate;

  const handleSubmit = async () => {
    if (!isValid) return;
    setSaving(true);
    await onSubmit(form);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0d1320]">
        <div className="h-0.5 bg-orange-500 w-full" />
        <div className="flex items-center justify-between border-b border-gray-100 px-6 pb-4 pt-5 dark:border-white/[0.06]">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-orange-500">{mode === "create" ? "Nuevo mantenimiento" : "Editar mantenimiento"}</p>
            <h2 className="mt-0.5 text-base font-bold text-gray-800 dark:text-white">{mode === "create" ? "Registrar OT" : form.title || "Editar OT"}</h2>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"><X size={15} /></button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Vehículo / Activo" required>
                <div className="relative">
                  <select className={selectCls} value={form.assetId} onChange={e => set("assetId", e.target.value)}>
                    <option value="">Seleccionar activo...</option>
                    {assets.map(a => <option key={a.id} value={a.id}>{a.name} — {a.code}</option>)}
                  </select>
                  <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Título del trabajo" required>
                <input className={inputCls} value={form.title} onChange={e => set("title", e.target.value)} placeholder="Ej: Cambio de frenos delanteros" />
              </Field>
            </div>
            <Field label="Tipo">
              <div className="relative">
                <select className={selectCls} value={form.kind} onChange={e => set("kind", e.target.value as MaintenanceKind)}>
                  {(["Preventivo","Correctivo","Predictivo","Emergencia"] as MaintenanceKind[]).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
            </Field>
            <Field label="Prioridad">
              <div className="relative">
                <select className={selectCls} value={form.priority} onChange={e => set("priority", e.target.value as MaintenancePriority)}>
                  {(["Normal","Alta","Emergente","Programado"] as MaintenancePriority[]).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
            </Field>
            <Field label="Estado">
              <div className="relative">
                <select className={selectCls} value={form.status} onChange={e => set("status", e.target.value as MaintenanceStatus)}>
                  {(["Pendiente","En proceso","Completado"] as MaintenanceStatus[]).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
            </Field>
            <Field label="Responsable">
              <div className="relative">
                <select className={selectCls} value={form.technician} onChange={e => set("technician", e.target.value)} disabled={driversLoading}>
                  <option value="">— Sin asignar —</option>
                  {drivers.map(d => <option key={d.id} value={d.name}>{d.firstName} {d.lastName}</option>)}
                </select>
                <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
            </Field>
            <Field label="Fecha inicio">
              <input className={inputCls} type="date" value={form.scheduledDate} onChange={e => set("scheduledDate", e.target.value)} />
            </Field>
            <Field label="Fecha límite" required>
              <input className={inputCls} type="date" value={form.dueDate} onChange={e => set("dueDate", e.target.value)} />
            </Field>
            <Field label="Mano de obra (USD)">
              <input className={inputCls} type="number" min="0" step="0.01" value={form.laborCost} onChange={e => set("laborCost", e.target.value)} placeholder="0.00" />
            </Field>
            <Field label="Repuestos (USD)">
              <input className={inputCls} type="number" min="0" step="0.01" value={form.partsCost} onChange={e => set("partsCost", e.target.value)} placeholder="0.00" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Notas">
                <textarea rows={3} className="w-full resize-none rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.05] px-3 py-2.5 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/10 transition"
                  value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Descripción del trabajo realizado..." />
              </Field>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-6 py-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/10">Cancelar</button>
          <button onClick={handleSubmit} disabled={saving || !isValid}
            className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-orange-500/20 hover:bg-orange-600 active:scale-95 disabled:opacity-50">
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? "Guardando..." : mode === "create" ? "Crear OT" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ title, onConfirm, onCancel }: { title: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0d1320]">
        <div className="px-6 pb-4 pt-5">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-500/10"><AlertTriangle size={18} className="text-rose-500" /></div>
          <h3 className="text-base font-bold text-gray-800 dark:text-white">Eliminar OT</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">¿Seguro que deseas eliminar <span className="font-semibold text-gray-700 dark:text-gray-200">{title}</span>? Esta acción no se puede deshacer.</p>
        </div>
        <div className="flex gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <button onClick={onCancel} className="flex-1 rounded-xl border border-gray-200 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 dark:border-white/[0.08] dark:text-gray-300">Cancelar</button>
          <button onClick={onConfirm} className="flex-1 rounded-xl bg-rose-500 py-2 text-sm font-semibold text-white hover:bg-rose-600 active:scale-95">Eliminar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Table row ────────────────────────────────────────────────────────────────

function MaintenanceRow({ item, asset, onDetail, onEdit, onDelete, canEdit, canDelete }: {
  item: ApiMaintenance; asset: Asset | undefined;
  onDetail: () => void; onEdit: () => void; onDelete: () => void;
  canEdit: boolean; canDelete: boolean;
}) {
  const s = STATUS_CFG[item.status];
  const k = KIND_CFG[item.kind] ?? KIND_CFG["Correctivo"];
  const p = PRIORITY_CFG[item.priority] ?? PRIORITY_CFG["Normal"];
  const total = (item.laborCost ?? 0) + (item.partsCost ?? 0);

  return (
    <tr className="group cursor-pointer transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.02]" onClick={onDetail}>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 dark:bg-orange-500/10">
            <Car size={13} className="text-orange-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-800 dark:text-white truncate">{asset?.plate ?? asset?.code ?? "—"}</p>
            <p className="text-xs text-gray-400 truncate max-w-[100px]">{asset?.name ?? ""}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3.5">
        <p className="text-sm font-semibold text-gray-800 dark:text-white line-clamp-1 max-w-[180px]">{item.title}</p>
        <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${k.color}`}>{k.icon}{item.kind}</span>
      </td>
      <td className="px-4 py-3.5">
        <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-semibold ${p.bg} ${p.text} ${p.border}`}>{item.priority}</span>
      </td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
          <User size={12} className="shrink-0 text-gray-400" />
          <span className="truncate max-w-[90px]">{item.technician || "—"}</span>
        </div>
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap">
        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          <Calendar size={11} />{fmtDate(item.dueDate)}
        </div>
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap">
        <p className="text-sm font-bold text-gray-800 dark:text-white">{fmtUSD(total)}</p>
        <p className="text-[11px] text-gray-400">{fmtUSD(item.laborCost)} + {fmtUSD(item.partsCost)}</p>
      </td>
      <td className="px-4 py-3.5">
        <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-semibold ${s.bg} ${s.color} ${s.border}`}>
          {s.icon}{s.label}
        </span>
      </td>
      <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {/* "Ver" siempre visible — si llegaron aquí tienen "ver" */}
          <button onClick={onDetail} className="rounded-lg border border-orange-200 px-2 py-1 text-[11px] font-semibold text-orange-600 hover:bg-orange-50 dark:border-orange-500/20 dark:text-orange-400 whitespace-nowrap">Ver</button>
          {canEdit && (
            <button onClick={onEdit} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.08]"><Pencil size={12} /></button>
          )}
          {canDelete && (
            <button onClick={onDelete} className="flex h-7 w-7 items-center justify-center rounded-lg text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"><Trash2 size={12} /></button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const EMPTY_FORM: FormState = {
  assetId: "", title: "", kind: "Preventivo", priority: "Normal",
  status: "Pendiente", scheduledDate: todayISO(), dueDate: "",
  technician: "", laborCost: "", partsCost: "", notes: "",
};

export default function MaintenancePage() {
  const { maintenances, loading, createMaintenance, updateMaintenance, deleteMaintenance, completeMaintenance } = useMaintenances();
  const { assets, loading: loadingAssets } = useAssets();
  const { drivers, loading: driversLoading } = useDrivers();
  const { can } = usePermissions();

  // ─── Permisos granulares ──────────────────────────────────────────────────
  const canCreate = can("mantenimiento", "ordenes", "crear");
  const canEdit   = can("mantenimiento", "ordenes", "editar");
  const canDelete = can("mantenimiento", "ordenes", "eliminar");

  const assetMap = useMemo(() => new Map(assets.map(a => [a.id, a])), [assets]);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<MaintenanceStatus | "">("");
  const [filterKind, setFilterKind] = useState<MaintenanceKind | "">("");
  const [page, setPage] = useState(1);

  const [detailItem, setDetailItem] = useState<ApiMaintenance | null>(null);
  const [modal, setModal] = useState<{ mode: "create" | "edit"; form: FormState; id?: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiMaintenance | null>(null);

  const filtered = useMemo(() => {
    return maintenances
      .filter(m => !filterStatus || m.status === filterStatus)
      .filter(m => !filterKind || m.kind === filterKind)
      .filter(m => {
        if (!search) return true;
        const q = search.toLowerCase();
        const a = assetMap.get(m.assetId);
        return m.title.toLowerCase().includes(q) || (a?.name ?? "").toLowerCase().includes(q) || (a?.plate ?? "").toLowerCase().includes(q) || m.technician.toLowerCase().includes(q);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [maintenances, filterStatus, filterKind, search, assetMap]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const setFilter = (fn: () => void) => { fn(); setPage(1); };

  const stats = useMemo(() => ({
    total: maintenances.length,
    pendientes: maintenances.filter(m => m.status === "Pendiente").length,
    enProceso: maintenances.filter(m => m.status === "En proceso").length,
    completados: maintenances.filter(m => m.status === "Completado").length,
    laborTotal: maintenances.reduce((s, m) => s + (m.laborCost ?? 0), 0),
    partsTotal: maintenances.reduce((s, m) => s + (m.partsCost ?? 0), 0),
    grandTotal: maintenances.reduce((s, m) => s + (m.laborCost ?? 0) + (m.partsCost ?? 0), 0),
  }), [maintenances]);

  const openCreate = () => setModal({ mode: "create", form: { ...EMPTY_FORM } });
  const openEdit = (item: ApiMaintenance) => setModal({
    mode: "edit", id: item.id,
    form: {
      assetId: item.assetId, title: item.title, kind: item.kind,
      priority: item.priority, status: item.status,
      scheduledDate: item.scheduledDate, dueDate: item.dueDate,
      technician: item.technician,
      laborCost: item.laborCost != null ? String(item.laborCost) : "",
      partsCost: item.partsCost != null ? String(item.partsCost) : "",
      notes: item.notes,
    },
  });

  const handleSubmit = async (form: FormState) => {
    const payload = {
      assetId: form.assetId, title: form.title, kind: form.kind,
      priority: form.priority, status: form.status,
      scheduledDate: form.scheduledDate, dueDate: form.dueDate,
      completedDate: null, technician: form.technician, photoUrls: [],
      laborCost: form.laborCost ? Number(form.laborCost) : null,
      partsCost: form.partsCost ? Number(form.partsCost) : null,
      notes: form.notes,
    };
    try {
      if (modal?.mode === "create") {
        await createMaintenance(payload);
        toast.success("OT creada", { description: form.title });
      } else if (modal?.mode === "edit" && modal.id) {
        await updateMaintenance(modal.id, payload);
        toast.success("OT actualizada", { description: form.title });
        if (detailItem?.id === modal.id) setDetailItem(prev => prev ? { ...prev, ...payload, id: prev.id } : null);
      }
    } catch { toast.error("No se pudo guardar"); }
    setModal(null);
  };

  const handleStatusChange = async (item: ApiMaintenance, newStatus: MaintenanceStatus) => {
    try {
      if (newStatus === "Completado") await completeMaintenance(item.id, todayISO());
      else await updateMaintenance(item.id, { status: newStatus });
      toast.success(`Movido a ${newStatus}`);
      setDetailItem(null);
    } catch { toast.error("No se pudo cambiar el estado"); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMaintenance(deleteTarget.id);
      toast.success("OT eliminada");
      if (detailItem?.id === deleteTarget.id) setDetailItem(null);
    } catch { toast.error("No se pudo eliminar"); }
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-5">
      <ModulePageHeader
        badge="Gestión técnica"
        title="Mantenimiento"
        subtitle="OTs visibles, fechas claras, responsables definidos y costos registrados."
        accent="orange"
        action={
          canCreate ? (
            <button onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-orange-500/20 hover:bg-orange-600 active:scale-95">
              <Plus size={15} />Nuevo mantenimiento
            </button>
          ) : undefined
        }
      />

      <KpiRow stats={stats} />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="relative min-w-0 flex-1">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search}
            onChange={e => { setFilter(() => setSearch(e.target.value)); }}
            placeholder="Buscar por vehículo, trabajo o técnico..."
            className="h-9 w-full rounded-xl border border-gray-200 bg-transparent pl-8 pr-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/10 dark:border-white/[0.08] dark:text-white" />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Filter size={13} className="text-gray-400" />
          <div className="relative">
            <select value={filterStatus} onChange={e => setFilter(() => setFilterStatus(e.target.value as any))}
              className="h-9 appearance-none rounded-xl border border-gray-200 bg-white pl-3 pr-7 text-sm text-gray-700 focus:border-orange-400 focus:outline-none dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300">
              <option value="">Estado</option>
              {(["Pendiente","En proceso","Completado"] as MaintenanceStatus[]).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
          <div className="relative">
            <select value={filterKind} onChange={e => setFilter(() => setFilterKind(e.target.value as any))}
              className="h-9 appearance-none rounded-xl border border-gray-200 bg-white pl-3 pr-7 text-sm text-gray-700 focus:border-orange-400 focus:outline-none dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300">
              <option value="">Tipo</option>
              {(["Preventivo","Correctivo","Predictivo","Emergencia"] as MaintenanceKind[]).map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 dark:border-white/[0.06]">
          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Órdenes de mantenimiento</h3>
            <p className="text-xs text-gray-400">{filtered.length} resultado{filtered.length !== 1 ? "s" : ""}</p>
          </div>
          {totalPages > 1 && (
            <span className="text-xs text-gray-400">Pág. {page} / {totalPages}</span>
          )}
        </div>

        {loading || loadingAssets ? (
          <div className="flex items-center justify-center gap-3 py-20 text-gray-400">
            <Loader2 size={18} className="animate-spin" /><span className="text-sm">Cargando...</span>
          </div>
        ) : paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-14">
            <Wrench size={20} className="text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-400">Sin registros</p>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/[0.06]">
                  {["Vehículo","Trabajo","Prioridad","Responsable","Fecha límite","Costo","Estado",""].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
                {paginated.map(item => (
                  <MaintenanceRow
                    key={item.id} item={item} asset={assetMap.get(item.assetId)}
                    onDetail={() => setDetailItem(item)}
                    onEdit={() => { setDetailItem(null); openEdit(item); }}
                    onDelete={() => { setDetailItem(null); setDeleteTarget(item); }}
                    canEdit={canEdit}
                    canDelete={canDelete}
                  />
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 dark:border-white/[0.06]">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-50 disabled:opacity-40 dark:border-white/[0.08] dark:text-gray-400">
                  <ChevronLeft size={13} />Anterior
                </button>
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(p => (
                    <button key={p} onClick={() => setPage(p)}
                      className={`h-7 w-7 rounded-lg text-xs font-semibold transition ${page === p ? "bg-orange-500 text-white" : "text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.05]"}`}>
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

      {/* Modals */}
      {detailItem && (
        <DetailModal
          item={detailItem} asset={assetMap.get(detailItem.assetId)}
          onClose={() => setDetailItem(null)}
          onEdit={() => { openEdit(detailItem); setDetailItem(null); }}
          onDelete={() => { setDeleteTarget(detailItem); setDetailItem(null); }}
          onStatusChange={s => handleStatusChange(detailItem, s)}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      )}
      {modal && (
        <FormModal mode={modal.mode} initial={modal.form} assets={assets}
          drivers={drivers} driversLoading={driversLoading}
          onClose={() => setModal(null)} onSubmit={handleSubmit} />
      )}
      {deleteTarget && (
        <DeleteConfirm title={deleteTarget.title} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}