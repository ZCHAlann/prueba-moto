import { useMemo, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useAlerts, type ApiAlert, type AlertSeverity, type AlertStatus, type AlertType } from "../../hooks/useAlerts";
import { useAssets } from "../../hooks/useAssets";

// ── helpers ──────────────────────────────────────────────────────────────────

function dueDateLabel(dateStr: string): { label: string; cls: string } {
  if (!dateStr) return { label: "Sin fecha", cls: "text-gray-400 dark:text-gray-500" };
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - now.getTime()) / 86400000);
  if (diff < 0) return { label: `Vencida hace ${Math.abs(diff)}d`, cls: "text-error-600 dark:text-error-400 font-semibold" };
  if (diff === 0) return { label: "Vence hoy", cls: "text-error-600 dark:text-error-400 font-semibold" };
  if (diff === 1) return { label: "Vence mañana", cls: "text-warning-600 dark:text-warning-400 font-semibold" };
  if (diff <= 7) return { label: `Vence en ${diff}d`, cls: "text-warning-600 dark:text-warning-400" };
  return { label: `Vence en ${diff}d`, cls: "text-gray-400 dark:text-gray-500" };
}

const severityBorder: Record<AlertSeverity, string> = {
  Alta: "border-l-error-500",
  Media: "border-l-warning-500",
  Baja: "border-l-brand-400",
};

const severityBadge: Record<AlertSeverity, string> = {
  Alta: "bg-error-50 text-error-700 border-error-200 dark:bg-error-500/10 dark:text-error-400 dark:border-error-500/20",
  Media: "bg-warning-50 text-warning-700 border-warning-200 dark:bg-warning-500/10 dark:text-warning-400 dark:border-warning-500/20",
  Baja: "bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-500/10 dark:text-brand-400 dark:border-brand-500/20",
};

const statusBadge: Record<AlertStatus, string> = {
  Abierta: "bg-error-50 text-error-700 border-error-200 dark:bg-error-500/10 dark:text-error-400 dark:border-error-500/20",
  "En seguimiento": "bg-warning-50 text-warning-700 border-warning-200 dark:bg-warning-500/10 dark:text-warning-400 dark:border-warning-500/20",
  Cerrada: "bg-success-50 text-success-700 border-success-200 dark:bg-success-500/10 dark:text-success-400 dark:border-success-500/20",
};

const nextStatus: Record<AlertStatus, AlertStatus> = {
  Abierta: "En seguimiento",
  "En seguimiento": "Cerrada",
  Cerrada: "Abierta",
};

const nextStatusLabel: Record<AlertStatus, string> = {
  Abierta: "Marcar en seguimiento",
  "En seguimiento": "Marcar como cerrada",
  Cerrada: "Reabrir",
};

// ── KPI bar ───────────────────────────────────────────────────────────────────

type FilterValue = AlertStatus | "Todas";

function KpiBar({
  alerts,
  active,
  onFilter,
}: {
  alerts: ApiAlert[];
  active: FilterValue;
  onFilter: (f: FilterValue) => void;
}) {
  const stats: { label: string; value: number; filter: FilterValue; colorCls: string; activeCls: string }[] = [
    {
      label: "Todas",
      value: alerts.length,
      filter: "Todas",
      colorCls: "text-gray-800 dark:text-white",
      activeCls: "border-gray-800 dark:border-white",
    },
    {
      label: "Abiertas",
      value: alerts.filter((a) => a.status === "Abierta").length,
      filter: "Abierta",
      colorCls: "text-error-600 dark:text-error-400",
      activeCls: "border-error-500",
    },
    {
      label: "Seguimiento",
      value: alerts.filter((a) => a.status === "En seguimiento").length,
      filter: "En seguimiento",
      colorCls: "text-warning-600 dark:text-warning-400",
      activeCls: "border-warning-500",
    },
    {
      label: "Cerradas",
      value: alerts.filter((a) => a.status === "Cerrada").length,
      filter: "Cerrada",
      colorCls: "text-success-600 dark:text-success-400",
      activeCls: "border-success-500",
    },
    {
      label: "Críticas",
      value: alerts.filter((a) => a.severity === "Alta").length,
      filter: "Todas",
      colorCls: "text-error-600 dark:text-error-400",
      activeCls: "border-error-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {stats.map((s) => (
        <button
          key={s.label}
          type="button"
          onClick={() => onFilter(s.filter)}
          className={`rounded-2xl border bg-white dark:bg-white/[0.03] p-4 text-left transition hover:border-gray-300 dark:hover:border-white/[0.15] ${
            active === s.filter && s.label !== "Críticas"
              ? `border-l-4 ${s.activeCls} border-t-gray-200 border-r-gray-200 border-b-gray-200 dark:border-t-white/[0.06] dark:border-r-white/[0.06] dark:border-b-white/[0.06]`
              : "border-gray-200 dark:border-white/[0.06]"
          }`}
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">{s.label}</p>
          <p className={`mt-1.5 text-3xl font-black tabular-nums ${s.colorCls}`}>{s.value}</p>
        </button>
      ))}
    </div>
  );
}

// ── Alert card ────────────────────────────────────────────────────────────────

function AlertCard({
  alert,
  assetLabel,
  onStatusChange,
  onDelete,
}: {
  alert: ApiAlert;
  assetLabel: string;
  onStatusChange: (id: string, status: AlertStatus) => void;
  onDelete: (id: string) => void;
}) {
  const [changing, setChanging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const due = dueDateLabel(alert.dueDate);

  async function handleStatusChange() {
    setChanging(true);
    try {
      await onStatusChange(alert.id, nextStatus[alert.status]);
    } finally {
      setChanging(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete(alert.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: alert.status === "Cerrada" ? 0.55 : 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.2 }}
      className={`group relative overflow-hidden rounded-2xl border border-l-4 border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] transition hover:border-gray-300 dark:hover:border-white/[0.12] ${severityBorder[alert.severity]}`}
    >
      <div className="flex items-start gap-4 p-4">
        {/* left: main info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{alert.title}</p>
            <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-bold ${severityBadge[alert.severity]}`}>
              {alert.severity}
            </span>
            <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-bold ${statusBadge[alert.status]}`}>
              {alert.status}
            </span>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
            {assetLabel && (
              <span className="flex items-center gap-1">
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                  <rect x="1" y="5" width="14" height="8" rx="2" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M4 5V4a4 4 0 018 0v1" stroke="currentColor" strokeWidth="1.3"/>
                </svg>
                {assetLabel}
              </span>
            )}
            <span className="flex items-center gap-1">
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M5 1v2M11 1v2M2 6h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              <span className={due.cls}>{due.label}</span>
            </span>
            <span className="rounded-md bg-gray-100 dark:bg-white/[0.05] px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
              {alert.type}
            </span>
          </div>

          {alert.notes && (
            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500 line-clamp-1">{alert.notes}</p>
          )}
        </div>

        {/* right: actions */}
        <div className="flex shrink-0 items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={handleStatusChange}
            disabled={changing}
            title={nextStatusLabel[alert.status]}
            className="rounded-xl border border-gray-200 dark:border-white/[0.08] px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 transition hover:border-brand-300 dark:hover:border-brand-500/40 hover:bg-brand-50 dark:hover:bg-brand-500/[0.08] hover:text-brand-600 dark:hover:text-brand-400 disabled:opacity-40"
          >
            {changing ? "…" : nextStatusLabel[alert.status]}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            aria-label="Eliminar alerta"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 dark:border-white/[0.08] text-gray-300 dark:text-gray-600 transition hover:border-error-200 dark:hover:border-error-500/30 hover:bg-error-50 dark:hover:bg-error-500/[0.08] hover:text-error-400 disabled:opacity-40"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none">
              <path d="M2 3.5h10M5.5 3.5V2.5a1 1 0 012 0v1M5 3.5l.5 8M9 3.5l-.5 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Create drawer ─────────────────────────────────────────────────────────────

type FormState = {
  assetId: string;
  title: string;
  type: AlertType;
  severity: AlertSeverity;
  dueDate: string;
  notes: string;
};

const emptyForm = (): FormState => ({
  assetId: "",
  title: "",
  type: "Vencimiento",
  severity: "Media",
  dueDate: new Date().toISOString().slice(0, 10),
  notes: "",
});

const selectCls = "w-full appearance-none rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.05] px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 [&>option]:bg-white dark:[&>option]:bg-gray-800";
const inputCls = "w-full rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.05] px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-600 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1.5 block">{children}</label>;
}

function CreateDrawer({
  open,
  onClose,
  assets,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  assets: { id: string; plate?: string; brand?: string; model?: string; code?: string; name?: string }[];
  onSave: (form: FormState) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  function validate() {
    const e: typeof errors = {};
    if (!form.title.trim()) e.title = "El título es requerido";
    if (!form.dueDate) e.dueDate = "La fecha límite es requerida";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave(form);
      setForm(emptyForm());
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="alert-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          />
          <motion.aside
            key="alert-drawer"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-white/[0.06] shadow-2xl"
          >
            {/* header */}
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-white/[0.06] px-6 py-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Nueva alerta</p>
                <h2 className="mt-1 text-base font-semibold text-gray-800 dark:text-white">Crear alerta operativa</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-gray-200 dark:border-white/[0.08] p-2 text-gray-400 transition hover:bg-gray-50 dark:hover:bg-white/[0.05] hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none">
                  <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div>
                <FieldLabel>Título</FieldLabel>
                <input
                  value={form.title}
                  onChange={e => { setForm(f => ({ ...f, title: e.target.value })); setErrors(er => ({ ...er, title: undefined })); }}
                  placeholder="Ej. Vencimiento SOAT"
                  className={`${inputCls} ${errors.title ? "border-error-300 focus:border-error-500 focus:ring-error-500/10" : ""}`}
                />
                {errors.title && <p className="mt-1 text-xs text-error-500">{errors.title}</p>}
              </div>

              <div>
                <FieldLabel>Vehículo (opcional)</FieldLabel>
                <div className="relative">
                  <select value={form.assetId} onChange={e => setForm(f => ({ ...f, assetId: e.target.value }))} className={`${selectCls} pr-8`}>
                    <option value="">Sin vehículo asignado</option>
                    {assets.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.plate || a.code || a.name} {a.brand && a.model ? `— ${a.brand} ${a.model}` : ""}
                      </option>
                    ))}
                  </select>
                  <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel>Tipo</FieldLabel>
                  <div className="relative">
                    <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as AlertType }))} className={`${selectCls} pr-8`}>
                      <option value="Vencimiento">Vencimiento</option>
                      <option value="Mantenimiento">Mantenimiento</option>
                      <option value="Manual">Manual</option>
                    </select>
                    <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>
                <div>
                  <FieldLabel>Severidad</FieldLabel>
                  <div className="relative">
                    <select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value as AlertSeverity }))} className={`${selectCls} pr-8`}>
                      <option value="Alta">Alta</option>
                      <option value="Media">Media</option>
                      <option value="Baja">Baja</option>
                    </select>
                    <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>
              </div>

              <div>
                <FieldLabel>Fecha límite</FieldLabel>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={e => { setForm(f => ({ ...f, dueDate: e.target.value })); setErrors(er => ({ ...er, dueDate: undefined })); }}
                  className={`${inputCls} ${errors.dueDate ? "border-error-300 focus:border-error-500 focus:ring-error-500/10" : ""}`}
                />
                {errors.dueDate && <p className="mt-1 text-xs text-error-500">{errors.dueDate}</p>}
              </div>

              <div>
                <FieldLabel>Notas (opcional)</FieldLabel>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Detalle adicional sobre esta alerta…"
                  rows={4}
                  className={`${inputCls} resize-none`}
                />
              </div>
            </div>

            {/* footer */}
            <div className="border-t border-gray-100 dark:border-white/[0.06] px-6 py-4 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-gray-200 dark:border-white/[0.08] py-2.5 text-sm font-semibold text-gray-500 dark:text-gray-400 transition hover:bg-gray-50 dark:hover:bg-white/[0.05]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-500/20 transition hover:bg-brand-600 active:scale-95 disabled:opacity-50"
              >
                {saving && (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                )}
                Crear alerta
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function AlertsPage() {
  const { alerts, loading, createAlert, updateAlert, deleteAlert } = useAlerts();
  const { assets } = useAssets();
  const [filter, setFilter] = useState<FilterValue>("Todas");
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const assetMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of assets) {
      const label = [a.plate || a.code || a.name, a.brand && a.model ? `${a.brand} ${a.model}` : ""].filter(Boolean).join(" — ");
      m[a.id] = label;
    }
    return m;
  }, [assets]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return [...alerts]
      .sort((a, b) => {
        if (a.status === "Cerrada" && b.status !== "Cerrada") return 1;
        if (a.status !== "Cerrada" && b.status === "Cerrada") return -1;
        const sevOrder: Record<AlertSeverity, number> = { Alta: 0, Media: 1, Baja: 2 };
        return sevOrder[a.severity] - sevOrder[b.severity];
      })
      .filter(a => filter === "Todas" || a.status === filter)
      .filter(a => !q || a.title.toLowerCase().includes(q) || (a.notes ?? "").toLowerCase().includes(q) || (assetMap[a.assetId ?? ""] ?? "").toLowerCase().includes(q));
  }, [alerts, filter, search, assetMap]);

  async function handleStatusChange(id: string, status: AlertStatus) {
    try {
      await updateAlert(id, { status });
      toast.success(`Alerta marcada como ${status}`);
    } catch {
      toast.error("Error al actualizar estado");
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteAlert(id);
      toast.success("Alerta eliminada");
    } catch {
      toast.error("Error al eliminar");
    }
  }

  async function handleCreate(form: FormState) {
    try {
      await createAlert({
        assetId: form.assetId,
        title: form.title,
        type: form.type,
        severity: form.severity,
        status: "Abierta",
        dueDate: form.dueDate,
        notes: form.notes,
      });
      toast.success("Alerta creada");
    } catch {
      toast.error("Error al crear alerta");
      throw new Error();
    }
  }

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="inline-flex rounded-full bg-error-50 dark:bg-error-500/[0.12] px-2.5 py-0.5 text-xs font-bold uppercase tracking-widest text-error-600 dark:text-error-400">
            Monitoreo
          </span>
          <h1 className="mt-2 text-2xl font-bold text-gray-800 dark:text-white">Alertas</h1>
          <p className="mt-1 max-w-xl text-sm text-gray-500 dark:text-gray-400">
            Gestiona vencimientos, mantenimientos y eventos críticos de tu flota en tiempo real.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-600 transition hover:bg-brand-100 dark:border-brand-500/20 dark:bg-brand-500/[0.08] dark:text-brand-400 dark:hover:bg-brand-500/[0.15]"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          Nueva alerta
        </button>
      </div>

      {/* KPI bar */}
      <KpiBar alerts={alerts} active={filter} onFilter={setFilter} />

      {/* list */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03]">
        {/* toolbar */}
        <div className="flex flex-col gap-3 border-b border-gray-100 dark:border-white/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white">Feed de alertas</h2>
            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{filtered.length} alerta{filtered.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="relative">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              placeholder="Buscar alerta, vehículo…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-9 w-64 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-transparent py-2 pl-9 pr-4 text-sm text-gray-700 dark:text-gray-300 placeholder:text-gray-400 dark:placeholder:text-gray-600 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10"
            />
          </div>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/[0.04]"/>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-gray-400 dark:text-gray-500">
                {search || filter !== "Todas" ? "Sin resultados para ese filtro" : "No hay alertas registradas"}
              </p>
              {!search && filter === "Todas" && (
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  className="mt-3 text-sm font-semibold text-brand-500 hover:text-brand-600 dark:text-brand-400"
                >
                  Crear primera alerta →
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {filtered.map(alert => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    assetLabel={assetMap[alert.assetId ?? ""] ?? ""}
                    onStatusChange={handleStatusChange}
                    onDelete={handleDelete}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      <CreateDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        assets={assets}
        onSave={handleCreate}
      />
    </div>
  );
}