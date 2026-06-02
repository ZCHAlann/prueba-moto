"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { useAssetCenter } from "../../../hooks/useInsurancesPolicies";
import { useAssets } from "@/hooks/useAssets";
import type { AssetDocumentStatus } from "@/types/activo";
import type { Asset } from "@/types/activo";

// ─── Types ────────────────────────────────────────────────────────────────────

type PolicyForm = {
  assetId: string;
  insurer: string;
  policyNumber: string;
  coverage: string;
  startDate: string;
  endDate: string;
  status: AssetDocumentStatus;
  notes: string;
};

type PolicyFormErrors = Partial<Record<keyof PolicyForm, string>>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createEmptyForm(firstAssetId = ""): PolicyForm {
  const today = new Date().toISOString().slice(0, 10);
  return {
    assetId: firstAssetId,
    insurer: "",
    policyNumber: "",
    coverage: "",
    startDate: today,
    endDate: today,
    status: "Vigente",
    notes: "",
  };
}

function validatePolicy(form: PolicyForm): PolicyFormErrors {
  const errors: PolicyFormErrors = {};
  if (!form.assetId)          errors.assetId      = "Selecciona un vehículo.";
  if (!form.insurer.trim())   errors.insurer      = "La aseguradora es obligatoria.";
  if (!form.policyNumber.trim()) errors.policyNumber = "El número de póliza es obligatorio.";
  if (!form.startDate)        errors.startDate    = "La fecha de inicio es obligatoria.";
  if (!form.endDate)          errors.endDate      = "La fecha de vencimiento es obligatoria.";
  return errors;
}

/** Days remaining until endDate (negative = expired) */
function daysRemaining(endDate: string): number {
  const end  = new Date(endDate);
  const now  = new Date();
  end.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - now.getTime()) / 86_400_000);
}

type UrgencyLevel = "ok" | "warn" | "danger";
function urgencyLevel(days: number): UrgencyLevel {
  if (days < 0)  return "danger";
  if (days < 30) return "danger";
  if (days < 60) return "warn";
  return "ok";
}

const urgencyStyles: Record<UrgencyLevel, { badge: string; dot: string; bar: string; text: string }> = {
  ok:     { badge: "bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400",   dot: "bg-green-500",  bar: "bg-green-500",  text: "text-green-600 dark:text-green-400" },
  warn:   { badge: "bg-yellow-50 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400", dot: "bg-yellow-400", bar: "bg-yellow-400", text: "text-yellow-600 dark:text-yellow-400" },
  danger: { badge: "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400",           dot: "bg-red-500",    bar: "bg-red-500",    text: "text-red-600 dark:text-red-400" },
};

function formatDate(iso: string) {
  if (!iso) return "—";
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

function assetLabel(asset: Asset) {
  return `${asset.plate} · ${asset.brand} ${asset.model}`;
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

const IconShield = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const IconCar = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 17H3v-5l2-5h14l2 5v5h-2" />
    <circle cx="7.5" cy="17.5" r="1.5" />
    <circle cx="16.5" cy="17.5" r="1.5" />
    <path d="M5 12h14" />
  </svg>
);

const IconCalendar = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

const IconClose = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M3 3l10 10M13 3L3 13" />
  </svg>
);

const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M7 1v12M1 7h12" />
  </svg>
);

const IconDots = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <circle cx="8" cy="3" r="1.5" />
    <circle cx="8" cy="8" r="1.5" />
    <circle cx="8" cy="13" r="1.5" />
  </svg>
);

const IconSearch = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="6.5" cy="6.5" r="4.5" />
    <path d="M10.5 10.5l3.5 3.5" />
  </svg>
);

const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
  </svg>
);

// ─── Shared primitives ────────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.04] px-3 py-2 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 dark:focus:border-blue-400 transition";

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  detail,
  accent,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  accent: "blue" | "green" | "yellow" | "red";
  icon: React.ReactNode;
}) {
  const colors: Record<typeof accent, string> = {
    blue:   "bg-blue-50 dark:bg-blue-500/10 text-blue-500 dark:text-blue-400",
    green:  "bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400",
    yellow: "bg-yellow-50 dark:bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    red:    "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400",
  };
  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] px-5 py-4 flex items-start gap-4">
      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${colors[accent]}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="mt-0.5 text-2xl font-bold text-gray-800 dark:text-white">{value}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">{detail}</p>
      </div>
    </div>
  );
}

// ─── Urgency Date Cell ────────────────────────────────────────────────────────

function ExpiryCell({ endDate, startDate }: { endDate: string; startDate: string }) {
  const days   = daysRemaining(endDate);
  const level  = urgencyLevel(days);
  const styles = urgencyStyles[level];

  // Progress: how far through the policy period are we (0–100)
  const totalDays = Math.max(1, daysRemaining(startDate) * -1 + daysRemaining(endDate) + (daysRemaining(startDate) * -1));
  const start = new Date(startDate);
  const end   = new Date(endDate);
  const now   = new Date();
  const elapsed = Math.max(0, now.getTime() - start.getTime());
  const total   = Math.max(1, end.getTime() - start.getTime());
  const progress = Math.min(100, Math.round((elapsed / total) * 100));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <IconCalendar />
        <span className="text-sm text-gray-700 dark:text-gray-300">{formatDate(endDate)}</span>
      </div>
      {/* Progress bar */}
      <div className="h-1 w-24 rounded-full bg-gray-100 dark:bg-white/[0.06] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${styles.bar}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className={`text-xs font-medium ${styles.text}`}>
        {days < 0
          ? `Venció hace ${Math.abs(days)} días`
          : days === 0
          ? "Vence hoy"
          : `${days} días restantes`}
      </p>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function PolicyStatusBadge({ status }: { status: AssetDocumentStatus }) {
  const cfg: Record<AssetDocumentStatus, { cls: string; dot: string }> = {
    Vigente:     { cls: "bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400",   dot: "bg-green-500" },
    "Por vencer":{ cls: "bg-yellow-50 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400", dot: "bg-yellow-400" },
    Vencido:     { cls: "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400",           dot: "bg-red-500" },
  };
  const { cls, dot } = cfg[status] ?? cfg["Vigente"];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  );
}

// ─── Row Menu ─────────────────────────────────────────────────────────────────

function RowMenu({
  onDetail,
  onEdit,
  onDelete,
}: {
  onDetail: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const item = (label: string, icon: React.ReactNode, onClick: () => void, danger = false) => (
    <button
      onClick={() => { onClick(); setOpen(false); }}
      className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-left transition
        ${danger
          ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
          : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06]"}`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition"
      >
        <IconDots />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-gray-900 shadow-xl p-1"
          >
            {item("Ver detalle", <IconShield />, onDetail)}
            {item("Editar", (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            ), onEdit)}
            {item("Eliminar", <IconTrash />, onDelete, true)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Policy Form Modal ────────────────────────────────────────────────────────

function PolicyFormModal({
  open,
  policy,
  assets,
  onClose,
  onCreate,
  onUpdate,
}: {
  open: boolean;
  policy: (PolicyForm & { id: string }) | null;
  assets: Asset[];
  onClose: () => void;
  onCreate: (form: PolicyForm) => Promise<void>;
  onUpdate: (id: string, form: PolicyForm) => Promise<void>;
}) {
  const [form, setForm] = useState<PolicyForm>(() =>
    policy ? { ...policy } : createEmptyForm(assets[0]?.id ?? "")
  );
  const [errors, setErrors] = useState<PolicyFormErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(policy ? { ...policy } : createEmptyForm(assets[0]?.id ?? ""));
      setErrors({});
    }
  }, [open, policy, assets]);

  const set = (key: keyof PolicyForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validatePolicy(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      toast.error("Formulario incompleto", { description: "Completa todos los campos obligatorios." });
      return;
    }
    setSaving(true);
    try {
      if (policy) {
        await onUpdate(policy.id, form);
        toast.success("Póliza actualizada", { description: "El control de seguros ya refleja el cambio." });
      } else {
        await onCreate(form);
        toast.success("Póliza creada", { description: "La póliza ya forma parte del control de seguros." });
      }
      onClose();
    } catch {
      toast.error("Error al guardar", { description: "No se pudo completar la operación." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 max-h-[90vh] flex flex-col"
          >
            <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-gray-900 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200 dark:border-white/[0.06] shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-500 dark:text-blue-400">
                    <IconShield />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-gray-800 dark:text-white">
                      {policy ? "Editar póliza" : "Nueva póliza"}
                    </h2>
                    <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                      Control central de seguros vehiculares.
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition"
                >
                  <IconClose />
                </button>
              </div>

              {/* Body — scrollable */}
              <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
                <div className="overflow-y-auto px-6 py-5 space-y-4">
                  <FormField label="Vehículo" error={errors.assetId}>
                    <select className={inputCls} value={form.assetId} onChange={set("assetId")}>
                      <option value="">Seleccionar vehículo…</option>
                      {assets.map((a) => (
                        <option key={a.id} value={a.id}>{assetLabel(a)}</option>
                      ))}
                    </select>
                  </FormField>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField label="Aseguradora" error={errors.insurer}>
                      <input className={inputCls} placeholder="Nombre de la aseguradora" value={form.insurer} onChange={set("insurer")} />
                    </FormField>
                    <FormField label="Número de póliza" error={errors.policyNumber}>
                      <input className={inputCls} placeholder="POL-000000" value={form.policyNumber} onChange={set("policyNumber")} />
                    </FormField>
                  </div>

                  <FormField label="Cobertura">
                    <input className={inputCls} placeholder="Ej. Todo riesgo, Responsabilidad civil…" value={form.coverage} onChange={set("coverage")} />
                  </FormField>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField label="Fecha de inicio" error={errors.startDate}>
                      <input type="date" className={inputCls} value={form.startDate} onChange={set("startDate")} />
                    </FormField>
                    <FormField label="Fecha de vencimiento" error={errors.endDate}>
                      <input type="date" className={inputCls} value={form.endDate} onChange={set("endDate")} />
                    </FormField>
                  </div>

                  <FormField label="Estado">
                    <select className={inputCls} value={form.status} onChange={set("status")}>
                      <option value="Vigente">Vigente</option>
                      <option value="Por vencer">Por vencer</option>
                      <option value="Vencido">Vencido</option>
                    </select>
                  </FormField>

                  <FormField label="Notas">
                    <textarea
                      className={`${inputCls} resize-none`}
                      rows={3}
                      placeholder="Observaciones adicionales sobre la póliza."
                      value={form.notes}
                      onChange={set("notes")}
                    />
                  </FormField>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200 dark:border-white/[0.06] shrink-0">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-gray-200 dark:border-white/[0.06] px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-4 py-2 text-sm font-medium text-white transition"
                  >
                    {saving ? "Guardando…" : policy ? "Guardar cambios" : "Crear póliza"}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Policy Detail Drawer ─────────────────────────────────────────────────────

function PolicyDetailDrawer({
  policy,
  asset,
  onClose,
  onEdit,
  onDelete,
}: {
  policy: (PolicyForm & { id: string }) | null;
  asset: Asset | undefined;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const days   = policy ? daysRemaining(policy.endDate) : 0;
  const level  = policy ? urgencyLevel(days) : "ok";
  const styles = urgencyStyles[level];

  // Timeline progress
  const start    = policy ? new Date(policy.startDate) : new Date();
  const end      = policy ? new Date(policy.endDate)   : new Date();
  const now      = new Date();
  const elapsed  = Math.max(0, now.getTime() - start.getTime());
  const total    = Math.max(1, end.getTime() - start.getTime());
  const progress = Math.min(100, Math.round((elapsed / total) * 100));

  return (
    <AnimatePresence>
      {policy && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            className="fixed right-0 top-0 z-50 h-full w-full max-w-md border-l border-gray-200 dark:border-white/[0.06] bg-white dark:bg-gray-900 shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-start justify-between px-6 py-5 border-b border-gray-200 dark:border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-500 dark:text-blue-400">
                  <IconShield />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500">{policy.policyNumber}</p>
                  <h2 className="text-base font-semibold text-gray-800 dark:text-white leading-tight">{policy.insurer}</h2>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition"
              >
                <IconClose />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {/* Urgency banner */}
              <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${
                level === "ok"
                  ? "border-green-200 dark:border-green-500/20 bg-green-50 dark:bg-green-500/10"
                  : level === "warn"
                  ? "border-yellow-200 dark:border-yellow-500/20 bg-yellow-50 dark:bg-yellow-500/10"
                  : "border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10"
              }`}>
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${styles.badge}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {level === "ok"
                      ? <><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>
                      : <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>
                    }
                  </svg>
                </div>
                <div>
                  <p className={`text-sm font-semibold ${styles.text}`}>
                    {days < 0
                      ? `Póliza vencida hace ${Math.abs(days)} días`
                      : days === 0
                      ? "Vence hoy"
                      : `${days} días para el vencimiento`}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Vence el {formatDate(policy.endDate)}</p>
                </div>
              </div>

              {/* Vehicle */}
              {asset && (
                <div className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] px-4 py-3 flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white dark:bg-white/[0.06] text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-white/[0.06]">
                    <IconCar />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-white">{asset.plate}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{asset.brand} {asset.model}</p>
                  </div>
                  <PolicyStatusBadge status={policy.status} />
                </div>
              )}

              {/* Policy info */}
              <div className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] divide-y divide-gray-200 dark:divide-white/[0.06]">
                {[
                  { label: "Aseguradora", value: policy.insurer },
                  { label: "Póliza",      value: policy.policyNumber },
                  { label: "Cobertura",   value: policy.coverage || "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center gap-3 px-4 py-3">
                    <span className="w-24 shrink-0 text-xs font-medium text-gray-400 dark:text-gray-500">{label}</span>
                    <span className="text-sm text-gray-800 dark:text-white font-medium">{value}</span>
                  </div>
                ))}
              </div>

              {/* Timeline visual */}
              <div>
                <p className="mb-3 text-sm font-semibold text-gray-800 dark:text-white">Vigencia de la póliza</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500">
                    <span>{formatDate(policy.startDate)}</span>
                    <span>{formatDate(policy.endDate)}</span>
                  </div>
                  <div className="relative h-2 rounded-full bg-gray-100 dark:bg-white/[0.06] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${styles.bar}`}
                      style={{ width: `${progress}%` }}
                    />
                    {/* Needle */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3.5 w-0.5 rounded-full bg-gray-800 dark:bg-white"
                      style={{ left: `${Math.min(98, progress)}%` }}
                    />
                  </div>
                  <p className={`text-xs font-medium ${styles.text}`}>
                    {progress}% del periodo transcurrido
                  </p>
                </div>
              </div>

              {/* Notes */}
              {policy.notes && (
                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-800 dark:text-white">Notas</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 italic leading-relaxed">{policy.notes}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-2 px-6 py-4 border-t border-gray-200 dark:border-white/[0.06]">
              <button
                onClick={onEdit}
                className="flex-1 rounded-lg border border-gray-200 dark:border-white/[0.06] px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition"
              >
                Editar póliza
              </button>
              <button
                onClick={onDelete}
                className="flex-1 rounded-lg border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 transition"
              >
                Eliminar
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteConfirmModal({
  open,
  policyNumber,
  insurer,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  policyNumber: string;
  insurer: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onCancel}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="fixed left-1/2 top-1/2 z-[60] w-full max-w-sm -translate-x-1/2 -translate-y-1/2"
          >
            <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-gray-900 shadow-2xl p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/10 text-red-500 mb-4">
                <IconTrash />
              </div>
              <h3 className="text-base font-semibold text-gray-800 dark:text-white">Eliminar póliza</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                La póliza <span className="font-medium text-gray-800 dark:text-white">{policyNumber}</span> de{" "}
                <span className="font-medium text-gray-800 dark:text-white">{insurer}</span> se retirará del control central.
                Esta acción no se puede deshacer.
              </p>
              <div className="mt-5 flex gap-2">
                <button
                  onClick={onCancel}
                  className="flex-1 rounded-lg border border-gray-200 dark:border-white/[0.06] px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition"
                >
                  Cancelar
                </button>
                <button
                  disabled={deleting}
                  onClick={async () => {
                    setDeleting(true);
                    await onConfirm();
                    setDeleting(false);
                  }}
                  className="flex-1 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60 px-4 py-2 text-sm font-medium text-white transition"
                >
                  {deleting ? "Eliminando…" : "Eliminar"}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function InsuranceManagementPage() {
  const { assets } = useAssets();
  const {
    policies: insurancePolicies,
    createPolicy: createInsurancePolicy,
    updatePolicy: updateInsurancePolicy,
    deletePolicy: deleteInsurancePolicy,
    } = useAssetCenter();

  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<(PolicyForm & { id: string }) | null>(null);
  const [detailPolicy, setDetailPolicy] = useState<(PolicyForm & { id: string }) | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<(PolicyForm & { id: string }) | null>(null);

  const rows = useMemo(() =>
    insurancePolicies
      .map((item) => ({
        ...item,
        asset: assets.find((a) => a.id === item.assetId),
      }))
      .sort((a, b) => {
        // Sort by urgency: expired first, then by days remaining asc
        const da = daysRemaining(a.endDate);
        const db = daysRemaining(b.endDate);
        return da - db;
      }),
    [assets, insurancePolicies]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.insurer.toLowerCase().includes(q) ||
        r.policyNumber.toLowerCase().includes(q) ||
        r.asset?.plate?.toLowerCase().includes(q) ||
        r.asset?.brand?.toLowerCase().includes(q) ||
        r.asset?.model?.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q),
    );
  }, [query, rows]);

  const openCreate = () => { setEditingPolicy(null); setModalOpen(true); };
  const openEdit = (p: PolicyForm & { id: string }) => {
    setEditingPolicy(p);
    setModalOpen(true);
    setDetailPolicy(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteInsurancePolicy(deleteTarget.id);   // ← agregar await
    toast.success("Póliza eliminada", { description: "La base de seguros fue actualizada." });
    setDeleteTarget(null);
    setDetailPolicy(null);
    };
    
  const totalVigentes    = insurancePolicies.filter((p) => p.status === "Vigente").length;
  const totalPorVencer   = insurancePolicies.filter((p) => p.status === "Por vencer").length;
  const totalVencidos    = insurancePolicies.filter((p) => p.status === "Vencido").length;

  return (
    <>
      <div className="space-y-5">
        {/* ── Page header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 px-2.5 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              <span className="text-xs font-medium text-blue-700 dark:text-blue-400">Gestión</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Seguros vehiculares</h1>
            <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
              Control central de pólizas por vehículo con alta, edición y baja.
            </p>
          </div>
          <button
            onClick={openCreate}
            className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition"
          >
            <IconPlus />
            Nueva póliza
          </button>
        </div>

        {/* ── KPI row ── */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Total pólizas"
            value={String(insurancePolicies.length)}
            detail="Base vigente de la empresa"
            accent="blue"
            icon={<IconShield />}
          />
          <KpiCard
            label="Vigentes"
            value={String(totalVigentes)}
            detail="Cobertura operativa activa"
            accent="green"
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            }
          />
          <KpiCard
            label="Por vencer"
            value={String(totalPorVencer)}
            detail="Menos de 60 días · atención prioritaria"
            accent="yellow"
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            }
          />
          <KpiCard
            label="Vencidas"
            value={String(totalVencidos)}
            detail="Sin cobertura · gestión urgente"
            accent="red"
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            }
          />
        </div>

        {/* ── Table card ── */}
        <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] overflow-hidden">
          {/* Toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-5 py-4 border-b border-gray-200 dark:border-white/[0.06]">
            <div>
              <h2 className="text-sm font-semibold text-gray-800 dark:text-white">Pólizas registradas</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Ordenadas por urgencia de vencimiento.
              </p>
            </div>
            <div className="relative w-full sm:w-72">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
                <IconSearch />
              </span>
              <input
                className="w-full rounded-lg border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.04] pl-9 pr-4 py-2 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition"
                placeholder="Buscar por placa, aseguradora, póliza…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-white/[0.06] text-gray-400">
                <IconShield />
              </div>
              <p className="text-sm font-medium text-gray-800 dark:text-white">Sin pólizas</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {query ? "No hay resultados para esa búsqueda." : "Todavía no hay seguros registrados para la flota."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-white/[0.06]">
                    {["Vehículo", "Aseguradora / Póliza", "Cobertura", "Vencimiento", "Estado", ""].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
                  {filtered.map((item) => {
                    const days  = daysRemaining(item.endDate);
                    const level = urgencyLevel(days);
                    return (
                      <tr
                        key={item.id}
                        className={`group transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.02] ${
                          level === "danger" ? "border-l-2 border-l-red-400 dark:border-l-red-500" :
                          level === "warn"   ? "border-l-2 border-l-yellow-400 dark:border-l-yellow-500" :
                          "border-l-2 border-l-transparent"
                        }`}
                      >
                        {/* Vehicle */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-gray-400">
                              <IconCar />
                            </div>
                            <div>
                              <p className="font-semibold text-gray-800 dark:text-white text-sm">
                                {item.asset?.plate ?? item.assetId}
                              </p>
                              <p className="text-xs text-gray-400 dark:text-gray-500">
                                {item.asset ? `${item.asset.brand} ${item.asset.model}` : "Vehículo"}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Insurer / Policy */}
                        <td className="px-5 py-3.5">
                          <p className="text-sm font-medium text-gray-800 dark:text-white">{item.insurer}</p>
                          <p className="mt-0.5 font-mono text-xs text-gray-400 dark:text-gray-500">{item.policyNumber}</p>
                        </td>

                        {/* Coverage */}
                        <td className="px-5 py-3.5">
                          <p className="text-sm text-gray-600 dark:text-gray-400">{item.coverage || "—"}</p>
                        </td>

                        {/* Expiry with urgency */}
                        <td className="px-5 py-3.5">
                          <ExpiryCell endDate={item.endDate} startDate={item.startDate} />
                        </td>

                        {/* Status */}
                        <td className="px-5 py-3.5">
                          <PolicyStatusBadge status={item.status} />
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-3.5">
                          <RowMenu
                            onDetail={() => setDetailPolicy(item)}
                            onEdit={() => openEdit(item)}
                            onDelete={() => setDeleteTarget(item)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Modals & Drawers ── */}
      <PolicyFormModal
        open={modalOpen}
        policy={editingPolicy}
        assets={assets}
        onClose={() => setModalOpen(false)}
        onCreate={async (form) => { await createInsurancePolicy(form); }}
        onUpdate={async (id, form) => { await updateInsurancePolicy(id, form); }}
      />

      <PolicyDetailDrawer
        policy={detailPolicy}
        asset={detailPolicy ? assets.find((a) => a.id === detailPolicy.assetId) : undefined}
        onClose={() => setDetailPolicy(null)}
        onEdit={() => detailPolicy && openEdit(detailPolicy)}
        onDelete={() => { setDeleteTarget(detailPolicy); setDetailPolicy(null); }}
      />

      <DeleteConfirmModal
        open={Boolean(deleteTarget)}
        policyNumber={deleteTarget?.policyNumber ?? ""}
        insurer={deleteTarget?.insurer ?? ""}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </>
  );
}