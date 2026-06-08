"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { useAssetCenter } from "../../../hooks/useInsurancesPolicies";
import { useAssets } from "@/hooks/useAssets";
import { usePermissions } from "@/hooks/usePermissions";
import { DatePicker } from "../../../components/ui/date-picker/DatePicker";
import type { Asset } from "@/types/activo";
import type { InsurancePolicy, InsuranceStatus } from "../../../hooks/useInsurancesPolicies";

// ─── Types ────────────────────────────────────────────────────────────────────

type PolicyForm = {
  assetId:      string;
  insurer:      string;
  policyNumber: string;
  coverage:     string;
  startDate:    string;
  endDate:      string;
  status:       InsuranceStatus;
  notes:        string;
  fileUrl:      string | null;
};

type PolicyFormErrors = Partial<Record<keyof PolicyForm, string>>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createEmptyForm(firstAssetId = ""): PolicyForm {
  const today = new Date().toISOString().slice(0, 10);
  return {
    assetId: firstAssetId, insurer: "", policyNumber: "",
    coverage: "", startDate: today, endDate: today,
    status: "Vigente", notes: "", fileUrl: null,
  };
}

function validatePolicy(form: PolicyForm): PolicyFormErrors {
  const errors: PolicyFormErrors = {};
  if (!form.assetId)             errors.assetId      = "Selecciona un vehículo.";
  if (!form.insurer.trim())      errors.insurer      = "La aseguradora es obligatoria.";
  if (!form.policyNumber.trim()) errors.policyNumber = "El número de póliza es obligatorio.";
  if (!form.startDate)           errors.startDate    = "La fecha de inicio es obligatoria.";
  if (!form.endDate)             errors.endDate      = "La fecha de vencimiento es obligatoria.";
  return errors;
}

function daysRemaining(endDate: string): number {
  const end = new Date(endDate);
  const now = new Date();
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

const urgencyStyles: Record<UrgencyLevel, { bar: string; text: string; banner: string; bannerBorder: string }> = {
  ok:     { bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", banner: "bg-emerald-50 dark:bg-emerald-500/10",  bannerBorder: "border-emerald-200 dark:border-emerald-500/20" },
  warn:   { bar: "bg-amber-400",   text: "text-amber-600 dark:text-amber-400",     banner: "bg-amber-50 dark:bg-amber-500/10",      bannerBorder: "border-amber-200 dark:border-amber-500/20"   },
  danger: { bar: "bg-red-500",     text: "text-red-600 dark:text-red-400",         banner: "bg-red-50 dark:bg-red-500/10",          bannerBorder: "border-red-200 dark:border-red-500/20"       },
};

function formatDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function assetLabel(a: Asset) {
  return `${a.plate ?? a.code} · ${a.brand ?? ""} ${a.model ?? ""}`.trim();
}

const ACCEPTED = "image/jpeg,image/png,image/webp,application/pdf";
const MAX_SIZE = 8 * 1024 * 1024;

// ─── SVG Icons ────────────────────────────────────────────────────────────────

const IconShield = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);
const IconCar = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 17H3v-5l2-5h14l2 5v5h-2" /><circle cx="7.5" cy="17.5" r="1.5" /><circle cx="16.5" cy="17.5" r="1.5" /><path d="M5 12h14" />
  </svg>
);
const IconCalendar = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);
const IconX = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);
const IconPlus = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const IconSearch = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" />
  </svg>
);
const IconTrash = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    <path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
  </svg>
);
const IconEdit = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);
const IconDots = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
  </svg>
);
const IconUpload = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);
const IconFile = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
  </svg>
);
const IconExternalLink = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);
const IconCheckCircle = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);
const IconAlertCircle = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

// ─── Shared input class ───────────────────────────────────────────────────────

const inputCls = "w-full rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] px-3 py-2.5 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 dark:focus:border-blue-400 transition";

function FormField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ─── File Upload Zone ─────────────────────────────────────────────────────────
// Ahora onFileSelect recibe File directamente (sin async).
// El preview local se genera con URL.createObjectURL en el modal.

function FileUploadZone({
  fileUrl,
  isPending,
  pendingName,
  onFileSelect,
  onClear,
}: {
  fileUrl: string | null;
  isPending: boolean;       // true cuando hay archivo local aún no subido
  pendingName: string | null;
  onFileSelect: (file: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (file: File) => {
    if (file.size > MAX_SIZE) { toast.error("Archivo muy grande", { description: "Máximo 8 MB." }); return; }
    onFileSelect(file);
  };

  const displayName = isPending ? pendingName : (fileUrl ? fileUrl.split("/").pop() : null);
  const isPdf = isPending
    ? pendingName?.toLowerCase().endsWith(".pdf")
    : fileUrl?.toLowerCase().endsWith(".pdf");

  const hasFile = isPending || !!fileUrl;

  if (hasFile) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.03] px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-500">
          {isPdf ? <IconFile size={18} /> : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{displayName}</p>
          <p className="text-xs text-gray-400">
            {isPending ? "Pendiente de guardar" : isPdf ? "Documento PDF" : "Imagen adjunta"}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Solo mostramos el link externo si ya está subido (URL real, no blob) */}
          {!isPending && fileUrl && (
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.08] transition-colors"
            >
              <IconExternalLink size={13} />
            </a>
          )}
          <button
            type="button"
            onClick={onClear}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500 transition-colors"
          >
            <IconX size={13} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
      onClick={() => inputRef.current?.click()}
      className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 cursor-pointer transition-colors
        ${dragOver
          ? "border-blue-400 bg-blue-50 dark:bg-blue-500/10"
          : "border-gray-200 dark:border-white/[0.08] hover:border-blue-300 dark:hover:border-blue-500/40 hover:bg-gray-50 dark:hover:bg-white/[0.02]"
        }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 dark:bg-white/[0.06] text-gray-400">
        <IconUpload size={20} />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Adjuntar documento</p>
        <p className="text-xs text-gray-400 mt-0.5">Arrastra o haz clic · JPG, PNG, WEBP, PDF · máx. 8 MB</p>
      </div>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, detail, accent, icon }: {
  label: string; value: string; detail: string;
  accent: "blue" | "green" | "amber" | "red"; icon: React.ReactNode;
}) {
  const colors: Record<typeof accent, string> = {
    blue:  "bg-blue-50 dark:bg-blue-500/10 text-blue-500 dark:text-blue-400",
    green: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400",
    red:   "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400",
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-4 rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] px-5 py-4"
    >
      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${colors[accent]}`}>
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</p>
        <p className="mt-1 text-2xl font-black tabular-nums text-gray-800 dark:text-white">{value}</p>
        <p className="text-xs text-gray-400">{detail}</p>
      </div>
    </motion.div>
  );
}

// ─── Expiry Cell ──────────────────────────────────────────────────────────────

function ExpiryCell({ startDate, endDate }: { startDate: string; endDate: string }) {
  const days    = daysRemaining(endDate);
  const level   = urgencyLevel(days);
  const styles  = urgencyStyles[level];
  const start   = new Date(startDate).getTime();
  const end     = new Date(endDate).getTime();
  const now     = Date.now();
  const progress = Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
        <IconCalendar /><span className="text-sm">{formatDate(endDate)}</span>
      </div>
      <div className="h-1 w-28 rounded-full bg-gray-100 dark:bg-white/[0.06] overflow-hidden">
        <div className={`h-full rounded-full ${styles.bar}`} style={{ width: `${progress}%` }} />
      </div>
      <p className={`text-xs font-semibold ${styles.text}`}>
        {days < 0 ? `Venció hace ${Math.abs(days)} días` : days === 0 ? "Vence hoy" : `${days} días restantes`}
      </p>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: InsuranceStatus }) {
  const cfg: Record<InsuranceStatus, { cls: string; dot: string }> = {
    "Vigente":     { cls: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20", dot: "bg-emerald-500" },
    "Por vencer":  { cls: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20",             dot: "bg-amber-400" },
    "Vencido":     { cls: "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20",                         dot: "bg-red-500" },
  };
  const { cls, dot } = cfg[status] ?? cfg["Vigente"];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  );
}

// ─── Row Menu ─────────────────────────────────────────────────────────────────

function RowMenu({ onDetail, onEdit, onDelete, canEdit, canDelete }: {
  onDetail: () => void; onEdit: () => void; onDelete: () => void;
  canEdit: boolean; canDelete: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const item = (label: string, icon: React.ReactNode, onClick: () => void, danger = false) => (
    <button
      onClick={() => { onClick(); setOpen(false); }}
      className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-left transition
        ${danger ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                 : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06]"}`}
    >
      {icon}{label}
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition">
        <IconDots />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.93, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.93, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-gray-900 shadow-xl p-1"
          >
            {item("Ver detalle", <IconShield size={13} />, onDetail)}
            {canEdit   && item("Editar",    <IconEdit size={13} />,  onEdit)}
            {canDelete && item("Eliminar",  <IconTrash size={13} />, onDelete, true)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Policy Form Modal ────────────────────────────────────────────────────────
// El archivo se sube SOLO cuando el usuario pulsa "Guardar".

function PolicyFormModal({
  open, policy, assets, onClose, onCreate, onUpdate, onUpload,
}: {
  open: boolean;
  policy: (PolicyForm & { id: string }) | null;
  assets: Asset[];
  onClose: () => void;
  onCreate: (form: PolicyForm) => Promise<void>;
  onUpdate: (id: string, form: PolicyForm) => Promise<void>;
  onUpload: (file: File) => Promise<string | null>;
}) {
  const [form, setForm]           = useState<PolicyForm>(() => policy ? { ...policy } : createEmptyForm(assets[0]?.id ?? ""));
  const [errors, setErrors]       = useState<PolicyFormErrors>({});
  const [saving, setSaving]       = useState(false);
  // pendingFile: archivo seleccionado localmente, aún NO subido
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  useEffect(() => {
    if (open) {
      setForm(policy ? { ...policy } : createEmptyForm(assets[0]?.id ?? ""));
      setErrors({});
      setPendingFile(null);
    }
  }, [open, policy, assets]);

  const set = (k: keyof PolicyForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  // Solo almacena el archivo en estado — NO lo sube todavía
  const handleFileSelect = (file: File) => {
    setPendingFile(file);
    // Limpiamos cualquier URL previa de la BD para que la UI refleje el nuevo archivo
    setForm((p) => ({ ...p, fileUrl: null }));
  };

  const handleClearFile = () => {
    setPendingFile(null);
    setForm((p) => ({ ...p, fileUrl: null }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validatePolicy(form);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setSaving(true);
    try {
      let finalForm = { ...form };

      // Si hay archivo pendiente, subirlo AHORA
      if (pendingFile) {
        const url = await onUpload(pendingFile);
        if (!url) {
          toast.error("No se pudo subir el archivo adjunto");
          setSaving(false);
          return;
        }
        finalForm = { ...finalForm, fileUrl: url };
      }

      if (policy) await onUpdate(policy.id, finalForm);
      else        await onCreate(finalForm);
      onClose();
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex flex-col max-h-[92vh]"
          >
            <div className="rounded-3xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1320] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
              <div className="h-1 w-full bg-blue-600" />

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-white/[0.06] shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-500">
                    <IconShield />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-blue-500">Seguros</p>
                    <h2 className="text-base font-bold text-gray-800 dark:text-white">
                      {policy ? "Editar póliza" : "Nueva póliza"}
                    </h2>
                  </div>
                </div>
                <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                  <IconX />
                </button>
              </div>

              {/* Body */}
              <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
                <div className="overflow-y-auto px-6 py-5 space-y-4">

                  <FormField label="Vehículo" error={errors.assetId}>
                    <select className={inputCls} value={form.assetId} onChange={set("assetId")}>
                      <option value="">Seleccionar vehículo…</option>
                      {assets.map((a) => <option key={a.id} value={a.id}>{assetLabel(a)}</option>)}
                    </select>
                  </FormField>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField label="Aseguradora" error={errors.insurer}>
                      <input className={inputCls} placeholder="Ej. Seguros Equinoccial" value={form.insurer} onChange={set("insurer")} />
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
                      <DatePicker
                        value={form.startDate}
                        onChange={(v) => setForm((p) => ({ ...p, startDate: v }))}
                        placeholder="Seleccionar"
                      />
                    </FormField>
                    <FormField label="Fecha de vencimiento" error={errors.endDate}>
                      <DatePicker
                        value={form.endDate}
                        onChange={(v) => setForm((p) => ({ ...p, endDate: v }))}
                        placeholder="Seleccionar"
                      />
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
                    <textarea rows={3} className={`${inputCls} resize-none`}
                      placeholder="Observaciones adicionales sobre la póliza."
                      value={form.notes} onChange={set("notes")} />
                  </FormField>

                  {/* Upload — selección local, sube al guardar */}
                  <FormField label="Documento adjunto">
                    <FileUploadZone
                      fileUrl={form.fileUrl}
                      isPending={!!pendingFile}
                      pendingName={pendingFile?.name ?? null}
                      onFileSelect={handleFileSelect}
                      onClear={handleClearFile}
                    />
                  </FormField>

                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-gray-100 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02] px-6 py-4 shrink-0">
                  <button type="button" onClick={onClose}
                    className="rounded-xl border border-gray-200 dark:border-white/[0.08] px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                    Cancelar
                  </button>
                  <button type="submit" disabled={saving}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-5 py-2 text-sm font-semibold text-white transition-colors active:scale-95">
                    {saving && (
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                    )}
                    {saving ? (pendingFile ? "Subiendo archivo…" : "Guardando…") : policy ? "Guardar cambios" : "Crear póliza"}
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

// ─── Detail Drawer ────────────────────────────────────────────────────────────

function PolicyDetailDrawer({
  policy, asset, canEdit, canDelete, onClose, onEdit, onDelete,
}: {
  policy: (PolicyForm & { id: string }) | null;
  asset: Asset | undefined;
  canEdit: boolean; canDelete: boolean;
  onClose: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const days    = policy ? daysRemaining(policy.endDate) : 0;
  const level   = policy ? urgencyLevel(days) : "ok";
  const styles  = urgencyStyles[level];
  const start   = policy ? new Date(policy.startDate).getTime() : 0;
  const end     = policy ? new Date(policy.endDate).getTime() : 1;
  const progress = Math.min(100, Math.max(0, Math.round(((Date.now() - start) / (end - start)) * 100)));
  const isPdf   = policy?.fileUrl?.toLowerCase().endsWith(".pdf");

  return (
    <AnimatePresence>
      {policy && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            className="fixed right-0 top-0 z-50 h-full w-full max-w-md border-l border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#0B1120] shadow-2xl flex flex-col"
          >
            <div className="h-1 w-full bg-blue-600" />

            {/* Header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 dark:border-white/[0.06] shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-500">
                  <IconShield size={20} />
                </div>
                <div>
                  <p className="text-[11px] font-mono text-gray-400">{policy.policyNumber}</p>
                  <h2 className="text-sm font-bold text-gray-800 dark:text-white leading-tight">{policy.insurer}</h2>
                </div>
              </div>
              <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                <IconX />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

              {/* Urgency banner */}
              <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${styles.banner} ${styles.bannerBorder}`}>
                <div className={styles.text}>
                  {level === "ok" ? <IconCheckCircle size={18} /> : <IconAlertCircle size={18} />}
                </div>
                <div>
                  <p className={`text-sm font-semibold ${styles.text}`}>
                    {days < 0 ? `Vencida hace ${Math.abs(days)} días` : days === 0 ? "Vence hoy" : `${days} días para el vencimiento`}
                  </p>
                  <p className="text-xs text-gray-400">Vence el {formatDate(policy.endDate)}</p>
                </div>
                <div className="ml-auto shrink-0"><StatusBadge status={policy.status} /></div>
              </div>

              {/* Vehicle */}
              {asset && (
                <div className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.03] px-4 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white dark:bg-white/[0.08] text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-white/[0.08]">
                    <IconCar />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-800 dark:text-white">{asset.plate ?? asset.code}</p>
                    <p className="text-xs text-gray-400">{asset.brand} {asset.model}</p>
                  </div>
                </div>
              )}

              {/* Info table */}
              <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] overflow-hidden">
                {[
                  { label: "Aseguradora", value: policy.insurer },
                  { label: "Póliza",      value: policy.policyNumber },
                  { label: "Cobertura",   value: policy.coverage || "—" },
                  { label: "Inicio",      value: formatDate(policy.startDate) },
                  { label: "Vencimiento", value: formatDate(policy.endDate) },
                ].map(({ label, value }, i, arr) => (
                  <div key={label} className={`flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-white/[0.02] ${i < arr.length - 1 ? "border-b border-gray-100 dark:border-white/[0.05]" : ""}`}>
                    <span className="w-24 shrink-0 text-xs font-semibold text-gray-400">{label}</span>
                    <span className="text-sm font-medium text-gray-800 dark:text-white">{value}</span>
                  </div>
                ))}
              </div>

              {/* Timeline */}
              <div>
                <p className="mb-2.5 text-xs font-bold uppercase tracking-widest text-gray-400">Vigencia</p>
                <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                  <span>{formatDate(policy.startDate)}</span>
                  <span>{formatDate(policy.endDate)}</span>
                </div>
                <div className="relative h-2 rounded-full bg-gray-100 dark:bg-white/[0.06] overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className={`h-full rounded-full ${styles.bar}`}
                  />
                </div>
                <p className={`mt-1.5 text-xs font-semibold ${styles.text}`}>{progress}% del periodo transcurrido</p>
              </div>

              {/* Attached document */}
              {policy.fileUrl && (
                <div>
                  <p className="mb-2.5 text-xs font-bold uppercase tracking-widest text-gray-400">Documento adjunto</p>
                  <a
                    href={policy.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.03] px-4 py-3 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors group"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-500">
                      <IconFile size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-white truncate">
                        {policy.fileUrl.split("/").pop()}
                      </p>
                      <p className="text-xs text-gray-400">{isPdf ? "Documento PDF" : "Imagen"}</p>
                    </div>
                    <span className="text-gray-400 group-hover:text-blue-500 transition-colors shrink-0">
                      <IconExternalLink size={14} />
                    </span>
                  </a>
                </div>
              )}

              {/* Notes */}
              {policy.notes && (
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400">Notas</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 italic leading-relaxed">{policy.notes}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            {(canEdit || canDelete) && (
              <div className="flex gap-2 px-5 py-4 border-t border-gray-100 dark:border-white/[0.06] shrink-0">
                {canEdit && (
                  <button onClick={onEdit}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-white/[0.08] px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors">
                    <IconEdit />Editar
                  </button>
                )}
                {canDelete && (
                  <button onClick={onDelete}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors">
                    <IconTrash />Eliminar
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ open, policyNumber, insurer, onCancel, onConfirm }: {
  open: boolean; policyNumber: string; insurer: string;
  onCancel: () => void; onConfirm: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="fixed left-1/2 top-1/2 z-[60] w-full max-w-sm -translate-x-1/2 -translate-y-1/2"
          >
            <div className="rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1320] shadow-2xl p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-500/10 text-red-500 mb-4">
                <IconTrash size={18} />
              </div>
              <h3 className="text-base font-bold text-gray-800 dark:text-white">Eliminar póliza</h3>
              <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                La póliza <span className="font-semibold text-gray-800 dark:text-white">{policyNumber}</span> de{" "}
                <span className="font-semibold text-gray-800 dark:text-white">{insurer}</span> será eliminada permanentemente.
              </p>
              <div className="mt-5 flex gap-2">
                <button onClick={onCancel}
                  className="flex-1 rounded-xl border border-gray-200 dark:border-white/[0.08] px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors">
                  Cancelar
                </button>
                <button disabled={deleting} onClick={async () => { setDeleting(true); await onConfirm(); setDeleting(false); }}
                  className="flex-1 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition-colors active:scale-95">
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
  const { can } = usePermissions();
  const { policies, loading, createPolicy, updatePolicy, deletePolicy, uploadPolicyFile } = useAssetCenter();

  const [query, setQuery]               = useState("");
  const [modalOpen, setModalOpen]       = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<(PolicyForm & { id: string }) | null>(null);
  const [detailPolicy, setDetailPolicy]   = useState<(PolicyForm & { id: string }) | null>(null);
  const [deleteTarget, setDeleteTarget]   = useState<(PolicyForm & { id: string }) | null>(null);

  const toForm = (p: InsurancePolicy): PolicyForm & { id: string } => ({
    id: p.id, assetId: p.assetId, insurer: p.insurer,
    policyNumber: p.policyNumber, coverage: p.coverage,
    startDate: p.startDate, endDate: p.endDate,
    status: p.status, notes: p.notes, fileUrl: p.fileUrl,
  });

  const rows = useMemo(() =>
    policies
      .map((p) => ({ ...toForm(p), asset: assets.find((a) => a.id === p.assetId) }))
      .sort((a, b) => daysRemaining(a.endDate) - daysRemaining(b.endDate)),
    [policies, assets]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.insurer.toLowerCase().includes(q) ||
      r.policyNumber.toLowerCase().includes(q) ||
      r.asset?.plate?.toLowerCase().includes(q) ||
      r.asset?.brand?.toLowerCase().includes(q) ||
      r.status.toLowerCase().includes(q)
    );
  }, [rows, query]);

  const openCreate = () => { setEditingPolicy(null); setModalOpen(true); };
  const openEdit   = (p: PolicyForm & { id: string }) => { setEditingPolicy(p); setModalOpen(true); setDetailPolicy(null); };

  const handleCreate = async (form: PolicyForm) => {
    const id = await createPolicy(form);
    if (id) toast.success("Póliza creada");
    else    toast.error("No se pudo crear la póliza");
  };

  const handleUpdate = async (id: string, form: PolicyForm) => {
    const ok = await updatePolicy(id, form);
    if (ok) toast.success("Póliza actualizada");
    else    toast.error("No se pudo actualizar la póliza");
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const ok = await deletePolicy(deleteTarget.id);
    if (ok) toast.success("Póliza eliminada");
    else    toast.error("No se pudo eliminar");
    setDeleteTarget(null);
    setDetailPolicy(null);
  };

  const vigentes   = policies.filter((p) => p.status === "Vigente").length;
  const porVencer  = policies.filter((p) => p.status === "Por vencer").length;
  const vencidas   = policies.filter((p) => p.status === "Vencido").length;

  return (
    <>
      <div className="space-y-5">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-blue-500 mb-1">Gestión</p>
            <h1 className="text-2xl font-black text-gray-800 dark:text-white">Seguros vehiculares</h1>
            <p className="mt-1 text-sm text-gray-400">Control central de pólizas por vehículo.</p>
          </div>
          {can("gestion", "seguros", "crear") && (
            <motion.button
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              onClick={openCreate}
              className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-500/20 transition-colors"
            >
              <IconPlus />Nueva póliza
            </motion.button>
          )}
        </motion.div>

        {/* KPIs */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Total" value={String(policies.length)} detail="pólizas registradas" accent="blue"
            icon={<IconShield />} />
          <KpiCard label="Vigentes" value={String(vigentes)} detail="cobertura activa" accent="green"
            icon={<IconCheckCircle size={18} />} />
          <KpiCard label="Por vencer" value={String(porVencer)} detail="menos de 60 días" accent="amber"
            icon={<IconAlertCircle size={18} />} />
          <KpiCard label="Vencidas" value={String(vencidas)} detail="sin cobertura" accent="red"
            icon={<IconAlertCircle size={18} />} />
        </div>

        {/* Table */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] overflow-hidden"
        >
          {/* Toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-5 py-4 border-b border-gray-100 dark:border-white/[0.06]">
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Pólizas registradas</h3>
              <p className="text-xs text-gray-400">{filtered.length} resultado{filtered.length !== 1 ? "s" : ""} · ordenadas por urgencia</p>
            </div>
            <div className="relative w-full sm:w-72">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><IconSearch /></span>
              <input
                className="w-full rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.04] pl-9 pr-4 py-2 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition"
                placeholder="Placa, aseguradora, póliza…"
                value={query} onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-3 py-20 text-gray-400">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              <span className="text-sm">Cargando pólizas…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-white/[0.03] text-gray-300 dark:text-gray-600">
                <IconShield size={22} />
              </div>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                {query ? "Sin resultados" : "Sin pólizas registradas"}
              </p>
              <p className="text-xs text-gray-400">
                {query ? "Prueba con otro término." : "Crea la primera póliza de seguro de la flota."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px]">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-white/[0.06]">
                    {["Vehículo", "Aseguradora / Póliza", "Cobertura", "Vencimiento", "Doc.", "Estado", ""].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
                  {filtered.map((item, i) => {
                    const days  = daysRemaining(item.endDate);
                    const level = urgencyLevel(days);
                    const leftBorder =
                      level === "danger" ? "border-l-2 border-l-red-400" :
                      level === "warn"   ? "border-l-2 border-l-amber-400" :
                      "border-l-2 border-l-transparent";
                    return (
                      <motion.tr
                        key={item.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.03 }}
                        className={`group transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.02] cursor-pointer ${leftBorder}`}
                        onClick={() => setDetailPolicy(item)}
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-gray-400">
                              <IconCar />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-gray-800 dark:text-white">{item.asset?.plate ?? item.assetId}</p>
                              <p className="text-xs text-gray-400">{item.asset ? `${item.asset.brand} ${item.asset.model}` : ""}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="text-sm font-semibold text-gray-800 dark:text-white">{item.insurer}</p>
                          <p className="font-mono text-xs text-gray-400">{item.policyNumber}</p>
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-[140px] truncate">{item.coverage || "—"}</p>
                        </td>
                        <td className="px-5 py-3.5">
                          <ExpiryCell startDate={item.startDate} endDate={item.endDate} />
                        </td>
                        <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                          {item.fileUrl ? (
                            <a href={item.fileUrl} target="_blank" rel="noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors">
                              <IconFile size={12} />Ver
                            </a>
                          ) : (
                            <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5"><StatusBadge status={item.status} /></td>
                        <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <RowMenu
                            onDetail={() => setDetailPolicy(item)}
                            onEdit={() => openEdit(item)}
                            onDelete={() => setDeleteTarget(item)}
                            canEdit={can("gestion", "seguros", "editar")}
                            canDelete={can("gestion", "seguros", "eliminar")}
                          />
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </div>

      {/* Modals */}
      <PolicyFormModal
        open={modalOpen}
        policy={editingPolicy}
        assets={assets}
        onClose={() => setModalOpen(false)}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
        onUpload={uploadPolicyFile}
      />

      <PolicyDetailDrawer
        policy={detailPolicy}
        asset={detailPolicy ? assets.find((a) => a.id === detailPolicy.assetId) : undefined}
        canEdit={can("gestion", "seguros", "editar")}
        canDelete={can("gestion", "seguros", "eliminar")}
        onClose={() => setDetailPolicy(null)}
        onEdit={() => detailPolicy && openEdit(detailPolicy)}
        onDelete={() => { setDeleteTarget(detailPolicy); setDetailPolicy(null); }}
      />

      <DeleteConfirm
        open={Boolean(deleteTarget)}
        policyNumber={deleteTarget?.policyNumber ?? ""}
        insurer={deleteTarget?.insurer ?? ""}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </>
  );
}