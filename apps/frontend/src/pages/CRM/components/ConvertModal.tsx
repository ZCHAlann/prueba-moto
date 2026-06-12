// src/pages/Platform/CRM/components/ConvertModal.tsx
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import {
  X, Building2, CheckCircle2, Sparkles,
  Calendar, Package,
} from "lucide-react";
import { toast } from "sonner";
import { DatePicker } from "../../../components/ui/date-picker/DatePicker";
import type { CRMDeal, CRMConvertInput } from "../../../types/platform";

// ─── Constants ────────────────────────────────────────────────────────────────

const PLANS = [
  { id: "free",       label: "Free",       color: "text-gray-400",   border: "border-gray-500/20",   bg: "bg-gray-500/10"   },
  { id: "starter",    label: "Starter",    color: "text-blue-400",   border: "border-blue-500/20",   bg: "bg-blue-500/10"   },
  { id: "pro",        label: "Pro",        color: "text-brand-400",  border: "border-brand-500/20",  bg: "bg-brand-500/10"  },
  { id: "enterprise", label: "Enterprise", color: "text-violet-400", border: "border-violet-500/20", bg: "bg-violet-500/10" },
];

const AVAILABLE_MODULES = [
  "dashboard", "accesos", "gestion", "motores", "generadores",
  "aires_acondicionados", "mantenimiento", "checklist",
  "alertas", "reportes", "combustible", "geolocalizacion", "cuenta",
];

const inputCls = `w-full rounded-xl border border-white/[0.08] bg-white/[0.04]
  px-3.5 py-2.5 text-sm text-gray-200 placeholder:text-gray-600
  outline-none transition
  focus:border-brand-500/60 focus:ring-2 focus:ring-brand-500/10
  hover:border-white/[0.14]`;

const labelCls = `block mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(name: string) {
  return name.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function fireConfetti() {
  const colors = ["#465fff", "#7c3aed", "#10b981", "#f59e0b", "#ffffff"];

  // Burst izquierda
  confetti({
    particleCount: 60,
    angle: 60,
    spread: 70,
    origin: { x: 0, y: 0.65 },
    colors,
    scalar: 0.9,
  });

  // Burst derecha
  confetti({
    particleCount: 60,
    angle: 120,
    spread: 70,
    origin: { x: 1, y: 0.65 },
    colors,
    scalar: 0.9,
  });

  // Centro suave con delay
  setTimeout(() => {
    confetti({
      particleCount: 40,
      spread: 100,
      origin: { x: 0.5, y: 0.55 },
      colors,
      scalar: 0.75,
      gravity: 0.8,
    });
  }, 150);
}

// ─── Plan Selector ────────────────────────────────────────────────────────────

function PlanSelector({
  value, onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {PLANS.map(plan => {
        const active = value === plan.id;
        return (
          <motion.button
            key={plan.id}
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() => onChange(plan.id)}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2.5
              transition-all text-left
              ${active
                ? `${plan.bg} ${plan.border}`
                : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
              }`}
          >
            <div className={`h-2 w-2 rounded-full transition-all
              ${active ? plan.color.replace("text-", "bg-") : "bg-gray-700"}`}
            />
            <span className={`text-xs font-semibold transition-colors
              ${active ? plan.color : "text-gray-500"}`}>
              {plan.label}
            </span>
            {active && (
              <CheckCircle2 size={11} className={`ml-auto ${plan.color}`} />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

// ─── Module Chips ─────────────────────────────────────────────────────────────

function ModuleChips({
  selected, onChange,
}: {
  selected: string[];
  onChange: (mods: string[]) => void;
}) {
  function toggle(mod: string) {
    onChange(
      selected.includes(mod)
        ? selected.filter(m => m !== mod)
        : [...selected, mod]
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {AVAILABLE_MODULES.map(mod => {
        const active = selected.includes(mod);
        return (
          <motion.button
            key={mod}
            type="button"
            whileTap={{ scale: 0.93 }}
            onClick={() => toggle(mod)}
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all
              ${active
                ? "border-brand-500/40 bg-brand-500/10 text-brand-400"
                : "border-white/[0.06] text-gray-600 hover:border-white/[0.12] hover:text-gray-400"
              }`}
          >
            {mod}
          </motion.button>
        );
      })}
    </div>
  );
}

// ─── Convert Modal ────────────────────────────────────────────────────────────

interface ConvertModalProps {
  open:      boolean;
  deal:      CRMDeal | null;
  onClose:   () => void;
  onConvert: (id: number, input: CRMConvertInput) => Promise<{ company: any; lead: CRMDeal }>;
}

interface ConvertForm {
  name:             string;
  slug:             string;
  planId:           string;
  enabledModules:   string[];
  contractStartAt:  string;
  contractEndAt:    string;
}

export function ConvertModal({ open, deal, onClose, onConvert }: ConvertModalProps) {
  const [form,       setForm]       = useState<ConvertForm>({
    name: "", slug: "", planId: "starter",
    enabledModules: ["dashboard", "alertas", "reportes"],
    contractStartAt: "", contractEndAt: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [done,       setDone]       = useState(false);
  const firedRef = useRef(false);

  // Pre-llenar con datos del deal
  useEffect(() => {
    if (!open || !deal) return;
    firedRef.current = false;
    setDone(false);
    const name = deal.companyName;
    setForm({
      name,
      slug:            slugify(name),
      planId:          "starter",
      enabledModules:  ["dashboard", "alertas", "reportes"],
      contractStartAt: new Date().toISOString().slice(0, 10),
      contractEndAt:   "",
    });
  }, [open, deal]);

  function set<K extends keyof ConvertForm>(k: K, v: ConvertForm[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  async function handleSubmit() {
    if (!deal) return;
    if (!form.name.trim() || !form.slug.trim()) {
      toast.error("Nombre y slug son requeridos");
      return;
    }
    setSubmitting(true);
    try {
      await onConvert(deal.id, {
        name:            form.name,
        slug:            form.slug,
        planId:          form.planId,
        enabledModules:  form.enabledModules,
        contractStartAt: form.contractStartAt || undefined,
        contractEndAt:   form.contractEndAt   || undefined,
      });

      // Mostrar estado "done" + confetti
      setDone(true);
      if (!firedRef.current) {
        firedRef.current = true;
        fireConfetti();
      }

      setTimeout(() => {
        onClose();
        setDone(false);
      }, 2200);

    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al convertir");
    } finally {
      setSubmitting(false);
    }
  }

  if (!deal) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-gray-950/70 backdrop-blur-sm"
            onClick={!submitting ? onClose : undefined}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={{ opacity: 0,   scale: 0.95, y: 16  }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-full max-w-lg overflow-hidden rounded-2xl
              border border-white/[0.08] bg-gray-900 shadow-2xl">

              <AnimatePresence mode="wait">

                {/* ── Success state ── */}
                {done ? (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1   }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex flex-col items-center justify-center gap-4 py-16 px-4 sm:px-6"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.1 }}
                      className="flex h-16 w-16 items-center justify-center rounded-2xl
                        bg-emerald-500/10 border border-emerald-500/20"
                    >
                      <CheckCircle2 size={32} className="text-emerald-400" />
                    </motion.div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-white">¡Deal convertido!</p>
                      <p className="mt-1 text-sm text-gray-500">
                        <span className="text-gray-300 font-medium">{form.name}</span> ahora
                        es una empresa en la plataforma.
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20
                      bg-emerald-500/10 px-3 py-1.5">
                      <Sparkles size={11} className="text-emerald-400" />
                      <span className="text-xs font-semibold text-emerald-400">
                        Plan {PLANS.find(p => p.id === form.planId)?.label} activado
                      </span>
                    </div>
                  </motion.div>

                ) : (

                  /* ── Form state ── */
                  <motion.div key="form" exit={{ opacity: 0 }}>

                    {/* Header */}
                    <div className="relative overflow-hidden border-b border-white/[0.06] px-4 py-5 sm:px-6">
                      {/* Glow de fondo */}
                      <div className="absolute -top-6 -right-6 h-24 w-24 rounded-full
                        bg-emerald-500/10 blur-2xl pointer-events-none" />

                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl
                            bg-emerald-500/[0.12] border border-emerald-500/20">
                            <Building2 size={15} className="text-emerald-400" />
                          </div>
                          <div>
                            <p className="font-bold text-white text-sm">
                              Convertir a empresa
                            </p>
                            <p className="text-[11px] text-gray-500 mt-0.5">
                              {deal.companyName}
                            </p>
                          </div>
                        </div>
                        <motion.button
                          type="button" whileTap={{ scale: 0.9 }}
                          onClick={onClose}
                          className="flex h-7 w-7 items-center justify-center rounded-lg
                            border border-white/[0.08] text-gray-500
                            hover:bg-white/[0.04] hover:text-gray-300 transition"
                        >
                          <X size={14} />
                        </motion.button>
                      </div>

                      {/* Deal summary pill */}
                      <div className="mt-4 flex items-center gap-3 rounded-xl
                        border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center
                          rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                          <Sparkles size={11} className="text-emerald-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-200 truncate">
                            {deal.companyName}
                          </p>
                          <p className="text-[10px] text-gray-500">
                            Deal ganado · Score {deal.score}
                          </p>
                        </div>
                        {deal.estimatedValue && parseFloat(deal.estimatedValue) > 0 && (
                          <span className="shrink-0 rounded-lg bg-brand-500/10
                            border border-brand-500/20 px-2 py-0.5
                            text-[11px] font-bold text-brand-400">
                            ${(parseFloat(deal.estimatedValue) / 1000).toFixed(1)}k
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Body */}
                    <div className="space-y-5 px-4 py-5 sm:px-6 max-h-[52vh] overflow-y-auto custom-scrollbar">

                      {/* Nombre + slug */}
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <p className={labelCls}>Nombre de empresa</p>
                          <input
                            className={inputCls}
                            value={form.name}
                            onChange={e => {
                              set("name", e.target.value);
                              set("slug", slugify(e.target.value));
                            }}
                          />
                        </div>
                        <div>
                          <p className={labelCls}>Slug</p>
                          <input
                            className={`${inputCls} font-mono text-xs`}
                            value={form.slug}
                            onChange={e => set("slug", e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Plan */}
                      <div>
                        <p className={labelCls}>Plan</p>
                        <PlanSelector
                          value={form.planId}
                          onChange={v => set("planId", v)}
                        />
                      </div>

                      {/* Fechas */}
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <p className={`${labelCls} flex items-center gap-1.5`}>
                            <Calendar size={10} /> Inicio contrato
                          </p>
                          <DatePicker
                            value={form.contractStartAt}
                            onChange={(v) => set("contractStartAt", v)}
                            placeholder="Seleccionar"
                          />
                        </div>
                        <div>
                          <p className={`${labelCls} flex items-center gap-1.5`}>
                            <Calendar size={10} /> Fin contrato
                          </p>
                          <DatePicker
                            value={form.contractEndAt}
                            onChange={(v) => set("contractEndAt", v)}
                            placeholder="Seleccionar"
                          />
                        </div>
                      </div>

                      {/* Módulos */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className={`${labelCls} flex items-center gap-1.5 mb-0`}>
                            <Package size={10} /> Módulos ({form.enabledModules.length})
                          </p>
                          <div className="flex items-center gap-2">
                            <button type="button"
                              onClick={() => set("enabledModules", AVAILABLE_MODULES)}
                              className="text-[10px] text-brand-400 hover:opacity-80 transition">
                              Todos
                            </button>
                            <span className="text-gray-700">·</span>
                            <button type="button"
                              onClick={() => set("enabledModules", [])}
                              className="text-[10px] text-gray-600 hover:text-gray-400 transition">
                              Ninguno
                            </button>
                          </div>
                        </div>
                        <ModuleChips
                          selected={form.enabledModules}
                          onChange={v => set("enabledModules", v)}
                        />
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="flex flex-col-reverse items-stretch gap-2
                      border-t border-white/[0.06] px-4 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
                      <button type="button" onClick={onClose}
                        className="text-sm font-semibold text-gray-600
                          hover:text-gray-300 transition px-1">
                        Cancelar
                      </button>

                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.95 }}
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="inline-flex items-center gap-2 rounded-xl
                          bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white
                          shadow-sm shadow-emerald-500/25
                          hover:bg-emerald-600 transition
                          disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {submitting ? (
                          <>
                            <svg className="animate-spin" width="13" height="13"
                              viewBox="0 0 24 24" fill="none"
                              stroke="currentColor" strokeWidth="2">
                              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                            </svg>
                            Convirtiendo…
                          </>
                        ) : (
                          <>🎉 Convertir a empresa</>
                        )}
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}