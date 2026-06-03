// src/pages/Platform/CRM/components/DealForm.tsx
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2, User, DollarSign,
  ChevronRight, ChevronLeft, Check, X,
} from "lucide-react";
import { toast } from "sonner";
import type { CRMDeal, LeadStatus, PlatformLeadInput } from "../../../types/platform";

// ─── Constants ────────────────────────────────────────────────────────────────

const SOURCES   = ["Referido","LinkedIn","Web","Cold outreach","Evento","Partner","Otro"];
const INDUSTRIES = ["Transporte","Logística","Construcción","Minería","Agricultura","Manufactura","Distribución","Servicios","Energía","Otro"];

const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: "nuevo",             label: "Nuevo"             },
  { value: "contactado",        label: "Contactado"        },
  { value: "demo_agendada",     label: "Demo agendada"     },
  { value: "propuesta_enviada", label: "Propuesta enviada" },
];

const EMPTY: PlatformLeadInput = {
  companyName: "", contactName: null, contactEmail: null,
  contactPhone: null, industry: null, country: null, city: null,
  status: "nuevo", source: null, assignedTo: null,
  estimatedValue: null, notes: null,
};

const STEPS = [
  { id: 1, label: "Empresa",  icon: Building2  },
  { id: 2, label: "Contacto", icon: User        },
  { id: 3, label: "Deal",     icon: DollarSign  },
];

// ─── Shared input styles ──────────────────────────────────────────────────────

const inputCls = `w-full rounded-xl border border-white/[0.08] bg-white/[0.04]
  px-3.5 py-2.5 text-sm text-gray-200 placeholder:text-gray-600
  outline-none transition
  focus:border-brand-500/60 focus:ring-2 focus:ring-brand-500/10
  hover:border-white/[0.14]`;

const labelCls = `block mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500`;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className={labelCls}>{label}</p>
      {children}
    </div>
  );
}

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-start gap-0 px-6 pt-6 pb-2">
      {STEPS.map((step, idx) => {
        const done   = current > step.id;
        const active = current === step.id;
        const Icon   = step.icon;

        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <motion.div
                animate={{
                  backgroundColor: done
                    ? "#465fff"
                    : active
                    ? "rgba(70,95,255,0.15)"
                    : "rgba(255,255,255,0.04)",
                  borderColor: done || active
                    ? "rgba(70,95,255,0.5)"
                    : "rgba(255,255,255,0.08)",
                }}
                transition={{ duration: 0.25 }}
                className="flex h-9 w-9 items-center justify-center rounded-xl border"
              >
                {done
                  ? <Check size={14} className="text-white" />
                  : <Icon size={14} className={active ? "text-brand-400" : "text-gray-600"} />
                }
              </motion.div>
              <span className={`text-[10px] font-semibold ${
                active ? "text-brand-400" : done ? "text-gray-500" : "text-gray-700"
              }`}>
                {step.label}
              </span>
            </div>

            {idx < STEPS.length - 1 && (
              <div className="flex-1 mx-3 mb-5">
                <div className="relative h-px overflow-hidden bg-white/[0.06]">
                  <motion.div
                    className="absolute inset-y-0 left-0 bg-brand-500/50"
                    animate={{ width: done ? "100%" : "0%" }}
                    transition={{ duration: 0.35 }}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Steps ────────────────────────────────────────────────────────────────────

function Step1({ form, set }: { form: PlatformLeadInput; set: Setter }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="Nombre de la empresa *">
          <input
            className={inputCls}
            placeholder="Ej: Logística del Sur S.A."
            value={form.companyName}
            onChange={e => set("companyName", e.target.value)}
          />
        </Field>
      </div>
      <Field label="Industria">
        <select
          className={inputCls}
          value={form.industry ?? ""}
          onChange={e => set("industry", e.target.value || null)}
        >
          <option value="">Sin especificar</option>
          {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
        </select>
      </Field>
      <Field label="País">
        <input
          className={inputCls}
          placeholder="Ecuador"
          value={form.country ?? ""}
          onChange={e => set("country", e.target.value || null)}
        />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Ciudad">
          <input
            className={inputCls}
            placeholder="Guayaquil"
            value={form.city ?? ""}
            onChange={e => set("city", e.target.value || null)}
          />
        </Field>
      </div>
    </div>
  );
}

function Step2({ form, set }: { form: PlatformLeadInput; set: Setter }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="Nombre del contacto">
          <input
            className={inputCls}
            placeholder="Ej: Juan Pérez"
            value={form.contactName ?? ""}
            onChange={e => set("contactName", e.target.value || null)}
          />
        </Field>
      </div>
      <Field label="Email">
        <input
          type="email"
          className={inputCls}
          placeholder="juan@empresa.com"
          value={form.contactEmail ?? ""}
          onChange={e => set("contactEmail", e.target.value || null)}
        />
      </Field>
      <Field label="Teléfono">
        <input
          className={inputCls}
          placeholder="+593 99 000 0000"
          value={form.contactPhone ?? ""}
          onChange={e => set("contactPhone", e.target.value || null)}
        />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Fuente del lead">
          <select
            className={inputCls}
            value={form.source ?? ""}
            onChange={e => set("source", e.target.value || null)}
          >
            <option value="">Sin especificar</option>
            {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      </div>
    </div>
  );
}

function Step3({ form, set }: { form: PlatformLeadInput; set: Setter }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Valor estimado (USD)">
        <input
          type="number"
          min="0"
          className={inputCls}
          placeholder="0"
          value={form.estimatedValue ?? ""}
          onChange={e => set("estimatedValue", e.target.value || null)}
        />
      </Field>
      <Field label="Etapa inicial">
        <select
          className={inputCls}
          value={form.status}
          onChange={e => set("status", e.target.value as LeadStatus)}
        >
          {STATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Notas internas">
          <textarea
            rows={4}
            className={`${inputCls} resize-none`}
            placeholder="Contexto del deal, condiciones especiales…"
            value={form.notes ?? ""}
            onChange={e => set("notes", e.target.value || null)}
          />
        </Field>
      </div>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Setter = <K extends keyof PlatformLeadInput>(k: K, v: PlatformLeadInput[K]) => void;

// ─── Deal Form Modal ──────────────────────────────────────────────────────────

interface DealFormProps {
  open:          boolean;
  editing:       CRMDeal | null;
  initialStage?: LeadStatus;
  onClose:       () => void;
  onCreate:      (input: PlatformLeadInput) => Promise<CRMDeal>;
  onUpdate:      (id: number, input: Partial<PlatformLeadInput>) => Promise<CRMDeal>;
}

export function DealForm({
  open, editing, initialStage, onClose, onCreate, onUpdate,
}: DealFormProps) {
  const isEdit = !!editing;
  const [step,       setStep]       = useState(1);
  const [form,       setForm]       = useState<PlatformLeadInput>(EMPTY);
  const [submitting, setSubmitting] = useState(false);

  // Reset al abrir
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        companyName:    editing.companyName,
        contactName:    editing.contactName,
        contactEmail:   editing.contactEmail,
        contactPhone:   editing.contactPhone,
        industry:       editing.industry,
        country:        editing.country,
        city:           editing.city,
        status:         editing.status,
        source:         editing.source,
        assignedTo:     editing.assignedTo,
        estimatedValue: editing.estimatedValue,
        notes:          editing.notes,
      });
    } else {
      setForm({ ...EMPTY, status: initialStage ?? "nuevo" });
    }
    setStep(1);
  }, [open, editing, initialStage]);

  const set: Setter = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  function handleNext() {
    if (step === 1 && !form.companyName.trim()) {
      toast.error("El nombre de la empresa es requerido");
      return;
    }
    setStep(s => Math.min(s + 1, 3));
  }

  async function handleSubmit() {
    if (!form.companyName.trim()) {
      toast.error("El nombre de la empresa es requerido");
      setStep(1);
      return;
    }
    setSubmitting(true);
    try {
      if (isEdit && editing) {
        await onUpdate(editing.id, form);
        toast.success("Deal actualizado");
      } else {
        await onCreate(form);
        toast.success("Deal creado 🎯");
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSubmitting(false);
    }
  }

  const stepContent = isEdit
    ? null // edit muestra todo junto
    : [
        <Step1 key={1} form={form} set={set} />,
        <Step2 key={2} form={form} set={set} />,
        <Step3 key={3} form={form} set={set} />,
      ][step - 1];

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
            className="fixed inset-0 z-40 bg-gray-950/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={{ opacity: 0,   scale: 0.96, y: 12  }}
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-full max-w-lg overflow-hidden rounded-2xl
              border border-white/[0.08] bg-gray-900 shadow-2xl">

              {/* Header */}
              <div className="flex items-start justify-between border-b border-white/[0.06] px-6 py-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl
                    bg-brand-500/[0.12] border border-brand-500/20">
                    <DollarSign size={15} className="text-brand-400" />
                  </div>
                  <div>
                    <p className="font-bold text-white text-sm">
                      {isEdit ? `Editar — ${editing?.companyName}` : "Nuevo deal"}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {isEdit
                        ? "Modifica los datos del deal"
                        : `Paso ${step} de 3 — ${STEPS[step - 1].label}`}
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

              {/* Step indicator — solo al crear */}
              {!isEdit && <StepIndicator current={step} />}

              {/* Body */}
              <div className="px-6 py-5 max-h-[60vh] overflow-y-auto custom-scrollbar">
                {isEdit ? (
                  <div className="space-y-6">
                    <Step1 form={form} set={set} />
                    <div className="border-t border-white/[0.06]" />
                    <Step2 form={form} set={set} />
                    <div className="border-t border-white/[0.06]" />
                    <Step3 form={form} set={set} />
                  </div>
                ) : (
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={step}
                      initial={{ opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0  }}
                      exit={{ opacity: 0,   x: -16 }}
                      transition={{ duration: 0.18 }}
                    >
                      {stepContent}
                    </motion.div>
                  </AnimatePresence>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-white/[0.06] px-6 py-4">

                {/* Left — back / cancel + dots */}
                <div className="flex items-center gap-3">
                  {!isEdit && step > 1 ? (
                    <motion.button
                      type="button" whileTap={{ scale: 0.95 }}
                      onClick={() => setStep(s => s - 1)}
                      className="inline-flex items-center gap-1.5 rounded-xl
                        border border-white/[0.08] px-3 py-2 text-sm
                        font-semibold text-gray-400
                        hover:bg-white/[0.04] hover:text-gray-200 transition"
                    >
                      <ChevronLeft size={14} /> Atrás
                    </motion.button>
                  ) : (
                    <button type="button" onClick={onClose}
                      className="text-sm font-semibold text-gray-600
                        hover:text-gray-300 transition px-1">
                      Cancelar
                    </button>
                  )}

                  {/* Step dots */}
                  {!isEdit && (
                    <div className="flex items-center gap-1.5">
                      {STEPS.map(s => (
                        <motion.div
                          key={s.id}
                          animate={{
                            width:           step === s.id ? 18 : 6,
                            backgroundColor: step === s.id
                              ? "#465fff"
                              : step > s.id
                              ? "rgba(70,95,255,0.4)"
                              : "rgba(255,255,255,0.1)",
                          }}
                          transition={{ duration: 0.2 }}
                          className="h-1.5 rounded-full"
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Right — next / submit */}
                {!isEdit && step < 3 ? (
                  <motion.button
                    type="button" whileTap={{ scale: 0.95 }}
                    onClick={handleNext}
                    className="inline-flex items-center gap-1.5 rounded-xl
                      bg-brand-500 px-4 py-2 text-sm font-semibold text-white
                      shadow-sm shadow-brand-500/20 hover:bg-brand-600 transition"
                  >
                    Siguiente <ChevronRight size={14} />
                  </motion.button>
                ) : (
                  <motion.button
                    type="button" whileTap={{ scale: 0.95 }}
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="inline-flex items-center gap-1.5 rounded-xl
                      bg-brand-500 px-4 py-2 text-sm font-semibold text-white
                      shadow-sm shadow-brand-500/20 hover:bg-brand-600 transition
                      disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <>
                        <svg className="animate-spin" width="13" height="13"
                          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                        Guardando…
                      </>
                    ) : (
                      <>{isEdit ? "Guardar cambios" : "Crear deal"} <Check size={13} /></>
                    )}
                  </motion.button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}