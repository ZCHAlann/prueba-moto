// src/pages/Platform/Companies/page.tsx
//
// Página principal del superadmin para gestionar tenants.
// Diseñada para ser densa pero accionable: hero con KPIs, barra de
// búsqueda + filtros, vista board/tabla con drawer de detalle y modal
// de creación/edición con wizard paso a paso.

import { useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Plus, Building2, Users, ShieldAlert, Clock,
  Pencil, Trash2, X, LayoutGrid, Table2,
  Globe, Mail, Phone, ChevronRight, ChevronLeft,
  Search, Filter, ExternalLink, Sparkles, KeyRound,
  Check, Layers, AlertCircle, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import ReactApexChart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import { useAuth } from "../../../context/AuthContext";
import { usePlatformCompanies } from "../../../hooks/usePlatformCompanies";
import { usePlatformPlans } from "../../../hooks/usePlatformPlans";
import { usePlatformStats } from "../../../hooks/usePlatformStats";
import { fmtDateShortEc } from "@/lib/datetime";
import {
  PlatformKpiCard, PlatformModal, ModalActions,
  InputField, SelectField, TextareaField,
} from "../../../components/platform";
import { StatusPill } from "../../../components/common/StatusPill";
import type {
  PlatformCompany, PlatformCompanyInput,
  CompanyStatus, PlatformPlan,
} from "../../../types/platform";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_META: Record<CompanyStatus, {
  label: string; tone: "success"|"warning"|"danger"|"neutral";
  accent: string; bg: string; border: string;
}> = {
  active:    { label: "Activa",     tone: "success", accent: "bg-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-500/10",   border: "border-emerald-200 dark:border-emerald-500/20" },
  trial:     { label: "Trial",      tone: "warning", accent: "bg-amber-500",   bg: "bg-amber-50 dark:bg-amber-500/10",       border: "border-amber-200 dark:border-amber-500/20"   },
  suspended: { label: "Suspendida", tone: "danger",  accent: "bg-rose-500",    bg: "bg-rose-50 dark:bg-rose-500/10",         border: "border-rose-200 dark:border-rose-500/20"     },
  inactive:  { label: "Inactiva",   tone: "neutral", accent: "bg-gray-400",    bg: "bg-gray-50 dark:bg-white/[0.03]",        border: "border-gray-200 dark:border-white/[0.08]"    },
};

const STATUS_ORDER: CompanyStatus[] = ["active","trial","suspended","inactive"];

const INDUSTRIES = [
  "Transporte","Logística","Construcción","Minería","Agricultura",
  "Manufactura","Distribución","Servicios","Energía","Otro",
];

const EMPTY_FORM: PlatformCompanyInput = {
  name:"", slug:"", planId:"starter", status:"active",
  enabledModules:[], industry:null, country:null, city:null,
  contactName:null, contactEmail:null, contactPhone:null,
  website:null, notes:null, trialEndsAt:null,
  contractStartAt:null, contractEndAt:null,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(" ").slice(0,2).map(w => w[0]).join("").toUpperCase();
}

function fmtDate(d: string | null) { return fmtDateShortEc(d); }

function slugify(name: string) {
  return name.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
}

const AVATAR_COLORS = [
  ["bg-brand-100 dark:bg-brand-500/20","text-brand-700 dark:text-brand-300"],
  ["bg-violet-100 dark:bg-violet-500/20","text-violet-700 dark:text-violet-300"],
  ["bg-emerald-100 dark:bg-emerald-500/20","text-emerald-700 dark:text-emerald-300"],
  ["bg-amber-100 dark:bg-amber-500/20","text-amber-700 dark:text-amber-300"],
  ["bg-rose-100 dark:bg-rose-500/20","text-rose-700 dark:text-rose-300"],
  ["bg-cyan-100 dark:bg-cyan-500/20","text-cyan-700 dark:text-cyan-300"],
];

function avatarColor(name: string) {
  const i = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[i];
}

// ─── Company Avatar ───────────────────────────────────────────────────────────

function CompanyAvatar({ name, size = "md" }: { name: string; size?: "sm"|"md"|"lg" }) {
  const [bg, text] = avatarColor(name);
  const sz = { sm:"h-7 w-7 text-[10px]", md:"h-9 w-9 text-xs", lg:"h-12 w-12 text-sm" }[size];
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-xl font-bold ${sz} ${bg} ${text}`}>
      {getInitials(name)}
    </div>
  );
}

// ─── Status Switcher (inline popover) ────────────────────────────────────────

function StatusSwitcher({
  company, onUpdate,
}: { company: PlatformCompany; onUpdate: (id: number, status: CompanyStatus) => void }) {
  const [open, setOpen] = useState(false);
  const meta = STATUS_META[company.status];

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(v => !v)} className="flex items-center gap-1">
        <StatusPill label={meta.label} tone={meta.tone} />
        <ChevronRight size={10} className={`text-gray-400 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 top-full z-20 mt-1.5 w-40 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-white/[0.08] dark:bg-gray-900"
            >
              {STATUS_ORDER.map(status => {
                const m = STATUS_META[status];
                const isActive = company.status === status;
                return (
                  <button key={status} type="button"
                    onClick={() => { onUpdate(company.id, status); setOpen(false); }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-xs font-medium transition-colors
                      ${isActive
                        ? "bg-gray-50 dark:bg-white/[0.04] text-gray-800 dark:text-white"
                        : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                      }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${m.accent}`} />
                    {m.label}
                    {isActive && <span className="ml-auto text-brand-500">✓</span>}
                  </button>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Company Card (Board view) ────────────────────────────────────────────────

function CompanyCard({
  company, plan, onEdit, onDelete, onStatusChange, onDetail,
}: {
  company: PlatformCompany;
  plan?: PlatformPlan;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: CompanyStatus) => void;
  onDetail: () => void;
}) {
  const meta = STATUS_META[company.status];
  const [bg, text] = avatarColor(company.name);
  const counts = company.userCounts;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.22 }}
      className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white
        transition-all hover:border-brand-300/60 hover:shadow-sm
        dark:border-white/[0.06] dark:bg-white/[0.03] dark:hover:border-brand-500/30"
    >
      <div className={`absolute inset-x-0 top-0 h-0.5 ${meta.accent} opacity-70`} />
      <div className="absolute right-3 top-3 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <motion.button type="button" whileTap={{ scale: 0.88 }} onClick={onDetail}
          className="flex h-6 w-6 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 transition hover:text-brand-500 dark:border-white/[0.08] dark:bg-gray-900 dark:hover:text-brand-400">
          <ExternalLink size={11} />
        </motion.button>
        <motion.button type="button" whileTap={{ scale: 0.88 }} onClick={onEdit}
          className="flex h-6 w-6 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 transition hover:text-brand-500 dark:border-white/[0.08] dark:bg-gray-900 dark:hover:text-brand-400">
          <Pencil size={11} />
        </motion.button>
        <motion.button type="button" whileTap={{ scale: 0.88 }} onClick={onDelete}
          className="flex h-6 w-6 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 transition hover:text-rose-500 dark:border-white/[0.08] dark:bg-gray-900 dark:hover:text-rose-400">
          <Trash2 size={11} />
        </motion.button>
      </div>

      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${bg} ${text}`}>
            {getInitials(company.name)}
          </div>
          <div className="min-w-0 flex-1 pr-16">
            <p className="truncate font-semibold text-gray-800 dark:text-white">{company.name}</p>
            <p className="truncate text-[11px] text-gray-400 dark:text-gray-500 font-mono">{company.slug}</p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {plan && (
            <span className="rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-600 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-400">
              {plan.name}
            </span>
          )}
          {company.industry && (
            <span className="text-[11px] text-gray-400 dark:text-gray-500">{company.industry}</span>
          )}
        </div>

        {/* Indicador de uso del plan */}
        {counts && (
          <div className="mt-3 flex items-center gap-1.5">
            <Users size={11} className="text-gray-400" />
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              {counts.total}
              {plan?.maxUsers !== null && plan?.maxUsers !== undefined && (
                <span className="text-gray-400 dark:text-gray-500"> / {plan.maxUsers}</span>
              )}
              {" "}usuarios
            </span>
          </div>
        )}

        {company.enabledModules.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {company.enabledModules.slice(0,3).map(m => (
              <span key={m} className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
                {m}
              </span>
            ))}
            {company.enabledModules.length > 3 && (
              <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
                +{company.enabledModules.length - 3}
              </span>
            )}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 dark:border-white/[0.04]">
          <StatusSwitcher company={company} onUpdate={(_, s) => onStatusChange(s)} />
          {company.contactEmail && (
            <a href={`mailto:${company.contactEmail}`}
              className="text-[11px] text-gray-400 hover:text-brand-500 dark:text-gray-500 dark:hover:text-brand-400 truncate max-w-[120px]">
              {company.contactEmail}
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Board Column ─────────────────────────────────────────────────────────────

function BoardColumn({
  status, companies, plans, onEdit, onDelete, onStatusChange, onDetail,
}: {
  status: CompanyStatus;
  companies: PlatformCompany[];
  plans: PlatformPlan[];
  onEdit: (c: PlatformCompany) => void;
  onDelete: (c: PlatformCompany) => void;
  onStatusChange: (id: number, status: CompanyStatus) => void;
  onDetail: (c: PlatformCompany) => void;
}) {
  const meta = STATUS_META[status];
  return (
    <div className="flex flex-col gap-3">
      <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${meta.bg} ${meta.border}`}>
        <span className={`h-2 w-2 rounded-full ${meta.accent}`} />
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{meta.label}</span>
        <span className="ml-auto rounded-full bg-white/60 px-1.5 py-0.5 text-[10px] font-bold text-gray-600 dark:bg-white/[0.08] dark:text-gray-300">
          {companies.length}
        </span>
      </div>
      <AnimatePresence>
        {companies.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 py-8 dark:border-white/[0.06]">
            <Building2 size={18} className="text-gray-300 dark:text-gray-600 mb-1" />
            <p className="text-xs text-gray-400 dark:text-gray-500">Sin empresas</p>
          </motion.div>
        ) : (
          companies.map(company => (
            <CompanyCard
              key={company.id}
              company={company}
              plan={plans.find(p => p.id === company.planId)}
              onEdit={() => onEdit(company)}
              onDelete={() => onDelete(company)}
              onStatusChange={(s) => onStatusChange(company.id, s)}
              onDetail={() => onDetail(company)}
            />
          ))
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────

function CompanyDrawer({
  company, plan, onClose, onEdit,
}: {
  company: PlatformCompany | null;
  plan?: PlatformPlan;
  onClose: () => void;
  onEdit: () => void;
}) {
  if (!company) return null;
  const meta = STATUS_META[company.status];
  const counts = company.userCounts;
  return (
    <AnimatePresence>
      {company && (
        <>
          <motion.div key="drawer-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-gray-950/40 backdrop-blur-sm"
            onClick={onClose} />
          <motion.div key="drawer"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 350, damping: 35 }}
            className="fixed right-0 top-0 z-50 h-full w-full max-w-sm overflow-y-auto
              border-l border-gray-200 bg-white shadow-2xl
              dark:border-white/[0.06] dark:bg-gray-900">
            <div className={`relative overflow-hidden border-b border-gray-100 px-5 py-5 dark:border-white/[0.06]`}>
              <div className={`absolute inset-x-0 top-0 h-0.5 ${meta.accent}`} />
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <CompanyAvatar name={company.name} size="lg" />
                  <div>
                    <p className="font-bold text-gray-800 dark:text-white">{company.name}</p>
                    <p className="text-xs text-gray-400 font-mono">{company.slug}</p>
                  </div>
                </div>
                <button type="button" onClick={onClose}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200
                    text-gray-400 hover:bg-gray-50 dark:border-white/[0.08] dark:hover:bg-white/[0.04]">
                  <X size={14} />
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <StatusPill label={meta.label} tone={meta.tone} />
                {plan && (
                  <span className="rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-600 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-400">
                    {plan.name}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-5 px-5 py-5">
              {/* Uso del plan */}
              {plan && counts && (
                <Section title="Uso del plan">
                  <PlanUsageRow label="Usuarios"      used={counts.total}      max={plan.maxUsers} />
                  <PlanUsageRow label="Admins"        used={counts.admins}     max={plan.maxAdmins} />
                  <PlanUsageRow label="Supervisores"  used={counts.supervisors} max={plan.maxSupervisors} />
                  <PlanUsageRow label="Operadores"    used={counts.operators}   max={plan.maxOperators} />
                  <PlanUsageRow label="Conductores"   used={counts.drivers}     max={plan.maxDrivers} />
                </Section>
              )}

              <Section title="Información comercial">
                <InfoRow label="Industria"   value={company.industry} />
                <InfoRow label="País"        value={company.country} />
                <InfoRow label="Ciudad"      value={company.city} />
                {company.website && (
                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs text-gray-400">Sitio web</span>
                    <a href={company.website} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:opacity-80 dark:text-brand-400">
                      <Globe size={11} /> Ver sitio
                    </a>
                  </div>
                )}
              </Section>

              <Section title="Contacto">
                <InfoRow label="Nombre" value={company.contactName} />
                {company.contactEmail && (
                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs text-gray-400">Email</span>
                    <a href={`mailto:${company.contactEmail}`}
                      className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:opacity-80 dark:text-brand-400">
                      <Mail size={11} /> {company.contactEmail}
                    </a>
                  </div>
                )}
                {company.contactPhone && (
                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs text-gray-400">Teléfono</span>
                    <a href={`tel:${company.contactPhone}`}
                      className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-200">
                      <Phone size={11} /> {company.contactPhone}
                    </a>
                  </div>
                )}
              </Section>

              <Section title="Fechas clave">
                <InfoRow label="Trial hasta"     value={fmtDate(company.trialEndsAt)} />
                <InfoRow label="Inicio contrato" value={fmtDate(company.contractStartAt)} />
                <InfoRow label="Fin contrato"    value={fmtDate(company.contractEndAt)} />
                <InfoRow label="Cliente desde"   value={fmtDate(company.createdAt)} />
              </Section>

              {company.enabledModules.length > 0 && (
                <Section title={`Módulos habilitados (${company.enabledModules.length})`}>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {company.enabledModules.map(m => (
                      <span key={m} className="rounded-lg bg-brand-50 px-2.5 py-1 text-[11px] font-medium text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                        {m}
                      </span>
                    ))}
                  </div>
                </Section>
              )}

              {company.notes && (
                <Section title="Notas">
                  <p className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 text-sm text-gray-600 dark:border-white/[0.04] dark:bg-white/[0.02] dark:text-gray-300">
                    {company.notes}
                  </p>
                </Section>
              )}

              {/* jul 2026 v6 — link a la config de IA por empresa */}
              <Section title="Asistente IA">
                <Link
                  to={`/platform/companies/${company.id}/ai`}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-700 hover:text-violet-800 dark:text-violet-300 dark:hover:text-violet-200"
                >
                  <Sparkles size={12} /> Ver config IA →
                </Link>
                <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                  Provider, API key, kill-switch y uso de tokens.
                </p>
              </Section>

              <button type="button" onClick={onEdit}
                className="w-full rounded-xl bg-brand-500 py-2.5 text-sm font-semibold text-white
                  shadow-sm shadow-brand-500/20 transition hover:bg-brand-600 active:scale-95">
                Editar empresa
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function PlanUsageRow({ label, used, max }: { label: string; used: number; max: number | null | undefined }) {
  const isUnlimited = max === null || max === undefined;
  const pct = !isUnlimited && max ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const over = !isUnlimited && used > (max ?? 0);
  return (
    <div className="px-3 py-2">
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-gray-500 dark:text-gray-400">{label}</span>
        <span className={`font-bold ${over ? "text-rose-600" : "text-gray-700 dark:text-gray-200"}`}>
          {used} / {isUnlimited ? "∞" : max}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-white/[0.06] overflow-hidden">
          <div className={`h-full rounded-full transition-all ${over ? "bg-rose-500" : pct > 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
        {title}
      </p>
      <div className="rounded-xl border border-gray-100 dark:border-white/[0.06] divide-y divide-gray-100 dark:divide-white/[0.04]">
        {children}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5">
      <span className="text-xs text-gray-400 dark:text-gray-500">{label}</span>
      <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{value || "—"}</span>
    </div>
  );
}

// ─── Wizard de creación/edición (3 pasos) ─────────────────────────────────────

interface CompanyFormExtended extends PlatformCompanyInput {
  masterUser?: {
    email: string;
    username: string;
    fullName: string;
    password: string;
  };
}

function CompanyWizard({
  initialForm, onSubmit, onCancel, plans, isEdit,
}: {
  initialForm: PlatformCompanyInput;
  onSubmit: (f: CompanyFormExtended) => Promise<void>;
  onCancel: () => void;
  plans: PlatformPlan[];
  isEdit: boolean;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<CompanyFormExtended>({
    ...initialForm,
    enabledModules: initialForm.enabledModules ?? [],
    masterUser: isEdit ? undefined : { email: "", username: "", fullName: "", password: "" },
  });
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof CompanyFormExtended>(k: K, v: CompanyFormExtended[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  const selectedPlan = plans.find(p => p.id === form.planId);
  const planModules = selectedPlan?.allowedModules ?? [];

  const steps = [
    { label: "Datos básicos", icon: Building2 },
    { label: "Plan + módulos", icon: Layers },
    { label: "Usuario owner", icon: KeyRound },
  ];

  const canNext = (() => {
    if (step === 0) return form.name.trim().length >= 2;
    if (step === 1) return !!form.planId;
    if (step === 2) {
      if (isEdit) return true;
      return !!form.masterUser?.email &&
             !!form.masterUser.username &&
             (form.masterUser?.password?.length ?? 0) >= 8;
    }
    return true;
  })();

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await onSubmit(form);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {/* Stepper */}
      <div className="flex items-center gap-2 border-b border-gray-100 px-6 py-4 dark:border-white/[0.06]">
        {steps.map((s, i) => {
          const active = i === step;
          const done = i < step;
          return (
            <div key={s.label} className="flex flex-1 items-center gap-2">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition
                ${done ? "bg-brand-500 text-white" : active ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-400 dark:bg-white/[0.06] dark:text-gray-500"}`}>
                {done ? <Check size={12}/> : i + 1}
              </div>
              <p className={`text-xs ${active || done ? "font-semibold text-gray-800 dark:text-white" : "text-gray-400"}`}>{s.label}</p>
              {i < steps.length - 1 && (
                <div className={`ml-2 h-px flex-1 ${done ? "bg-brand-400" : "bg-gray-200 dark:bg-white/[0.08]"}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Body */}
      <div className="px-6 py-6">
        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <InputField label="Nombre de empresa" value={form.name} required
              onChange={e => {
                const name = e.target.value;
                set("name", name);
                if (!isEdit && !form.slug) set("slug", slugify(name));
              }} />
            <InputField label="Slug (URL)" value={form.slug} required
              placeholder="mi-empresa"
              onChange={e => set("slug", e.target.value)} />
            <SelectField label="Industria" value={form.industry ?? ""}
              onChange={e => set("industry", e.target.value || null)}>
              <option value="">Sin especificar</option>
              {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
            </SelectField>
            <SelectField label="Estado" value={form.status}
              onChange={e => set("status", e.target.value as CompanyStatus)}>
              {STATUS_ORDER.map(s => (
                <option key={s} value={s}>{STATUS_META[s].label}</option>
              ))}
            </SelectField>
            <InputField label="País" value={form.country ?? ""}
              placeholder="Ecuador"
              onChange={e => set("country", e.target.value || null)} />
            <InputField label="Ciudad" value={form.city ?? ""}
              placeholder="Guayaquil"
              onChange={e => set("city", e.target.value || null)} />
            <div className="sm:col-span-2">
              <TextareaField label="Notas internas" rows={3} colSpan="full"
                value={form.notes ?? ""}
                placeholder="Observaciones, condiciones especiales…"
                onChange={e => set("notes", e.target.value || null)} />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-5">
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Plan ({plans.length} disponibles)
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {plans.map(p => {
                  const active = form.planId === p.id;
                  return (
                    <button key={p.id} type="button"
                      onClick={() => {
                        set("planId", p.id);
                        // Si cambia plan, sincronizamos módulos permitidos
                        if (p.allowedModules.length > 0) {
                          set("enabledModules", [...p.allowedModules]);
                        }
                      }}
                      className={`relative rounded-xl border p-3 text-left transition
                        ${active
                          ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10"
                          : "border-gray-200 dark:border-white/[0.08] hover:border-gray-300 dark:hover:border-white/[0.15]"
                        }`}>
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-gray-800 dark:text-white">{p.name}</p>
                        {p.isPopular && (
                          <span className="rounded-full bg-amber-100 dark:bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                            Popular
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                        ${Number(p.monthlyPrice) > 0 ? `${p.monthlyPrice}/mes` : "Gratis"} · {p.allowedModules.length} módulos
                      </p>
                      {active && (
                        <Check size={14} className="absolute right-2 top-2 text-brand-500" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                <span>Módulos habilitados ({form.enabledModules?.length ?? 0})</span>
                <button type="button"
                  onClick={() => {
                    set("enabledModules",
                      form.enabledModules?.length === planModules.length ? [] : [...planModules],
                    )}
                  className="normal-case text-brand-600 dark:text-brand-400 hover:underline">
                  {form.enabledModules?.length === planModules.length ? "Quitar todos" : "Aplicar plan"}
                </button>
              </p>
              <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
                {planModules.map((m: string) => {
                  const active = form.enabledModules?.includes(m);
                  return (
                    <button key={m} type="button"
                      onClick={() => {
                        const current = form.enabledModules ?? [];
                        set("enabledModules",
                          active ? current.filter(x => x !== m) : [...current, m]);
                      }}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left transition
                        ${active
                          ? "border-brand-400 bg-brand-50 dark:bg-brand-500/10"
                          : "border-gray-200 dark:border-white/[0.08] hover:border-gray-300"
                        }`}>
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{m}</span>
                      {active && <Check size={12} className="text-brand-500" />}
                    </button>
                  );
                })}
              </div>
              {form.enabledModules && form.enabledModules.length > 0 &&
                form.enabledModules.length < planModules.length && (
                <p className="mt-2 flex items-start gap-1 text-[11px] text-amber-700 dark:text-amber-400">
                  <AlertCircle size={11} className="mt-0.5 shrink-0" />
                  {form.enabledModules.length} de {planModules.length} módulos activados.
                </p>
              )}
            </div>
          </div>
        )}

        {step === 2 && !isEdit && (
          <div className="grid gap-4">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-500/20 dark:bg-blue-500/10">
              <div className="flex items-start gap-2">
                <Sparkles size={14} className="mt-0.5 text-blue-600 dark:text-blue-400" />
                <div>
                  <p className="text-xs font-semibold text-blue-900 dark:text-blue-300">
                    Usuario owner
                  </p>
                  <p className="mt-1 text-[11px] text-blue-800/80 dark:text-blue-300/80">
                    Será el primer usuario de la empresa, con acceso total. Le enviaremos un email con sus credenciales.
                  </p>
                </div>
              </div>
            </div>

            <InputField label="Nombre completo" value={form.masterUser?.fullName ?? ""}
              placeholder="Juan Pérez"
              onChange={e => set("masterUser", { ...(form.masterUser ?? { email: "", username: "", fullName: "", password: "" }), fullName: e.target.value })} />
            <InputField label="Email" type="email" value={form.masterUser?.email ?? ""} required
              placeholder="admin@empresa.com"
              onChange={e => set("masterUser", { ...(form.masterUser ?? { email: "", username: "", fullName: "", password: "" }), email: e.target.value })} />
            <InputField label="Username" value={form.masterUser?.username ?? ""} required
              placeholder="admin"
              onChange={e => set("masterUser", { ...(form.masterUser ?? { email: "", username: "", fullName: "", password: "" }), username: e.target.value })} />
            <InputField label="Contraseña" type="password" value={form.masterUser?.password ?? ""} required
              placeholder="Mínimo 8 caracteres"
              onChange={e => set("masterUser", { ...(form.masterUser ?? { email: "", username: "", fullName: "", password: "" }), password: e.target.value })} />
          </div>
        )}

        {step === 2 && isEdit && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Estás editando la empresa. Los cambios de plan/módulos afectarán a los usuarios existentes; revisa las validaciones.
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/50 px-6 py-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
        <button type="button" onClick={step === 0 ? onCancel : () => setStep(step - 1)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-500 transition hover:bg-white hover:text-gray-700 dark:hover:bg-white/[0.05] dark:hover:text-gray-300">
          {step === 0 ? <X size={13} /> : <ChevronLeft size={13} />}
          {step === 0 ? "Cancelar" : "Atrás"}
        </button>
        {step < steps.length - 1 ? (
          <button type="button" disabled={!canNext}
            onClick={() => setStep(step + 1)}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition
              ${canNext ? "bg-brand-500 text-white hover:bg-brand-600" : "cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-white/[0.06]"}`}>
            Siguiente <ChevronRight size={13} />
          </button>
        ) : (
          <button type="button" disabled={!canNext || submitting}
            onClick={handleSubmit}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition
              ${canNext && !submitting
                ? "bg-brand-500 text-white hover:bg-brand-600"
                : "cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-white/[0.06]"}`}>
            {submitting && <Loader2 size={12} className="animate-spin" />}
            {isEdit ? "Guardar cambios" : "Crear empresa"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type ViewMode = "board" | "table";

export function CompaniesPage() {
  const { session }  = useAuth();
  const isSuperadmin = session?.role === "superadmin";

  const { companies, loading, createCompany, updateCompany, deleteCompany } = usePlatformCompanies();
  const { plans }    = usePlatformPlans();
  const { data: stats } = usePlatformStats();

  const [view,       setView]       = useState<ViewMode>("board");
  const [search,     setSearch]     = useState("");
  const [filterStatus, setFilterStatus] = useState<CompanyStatus | "all">("all");
  const [filterPlan,   setFilterPlan]   = useState<string>("all");
  const [modalOpen,  setModalOpen]  = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing,    setEditing]    = useState<PlatformCompany | null>(null);
  const [deleting,   setDeleting]   = useState<PlatformCompany | null>(null);
  const [drawerCompany, setDrawerCompany] = useState<PlatformCompany | null>(null);
  const [form,       setForm]       = useState<PlatformCompanyInput>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.filter(c => {
      if (filterStatus !== "all" && c.status !== filterStatus) return false;
      if (filterPlan   !== "all" && c.planId  !== filterPlan)   return false;
      if (q && !c.name.toLowerCase().includes(q) &&
               !c.slug.toLowerCase().includes(q) &&
               !(c.contactEmail ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [companies, search, filterStatus, filterPlan]);

  const byStatus = useMemo(() =>
    STATUS_ORDER.reduce((acc, s) => ({
      ...acc, [s]: filtered.filter(c => c.status === s),
    }), {} as Record<CompanyStatus, PlatformCompany[]>),
  [filtered]);

  const donutData = useMemo(() => {
    const byPlan = stats?.companies.byPlan ?? {};
    return plans.map(p => ({ label: p.name, value: byPlan[p.id] ?? 0 }));
  }, [plans, stats]);

  const donutOptions: ApexOptions = {
    chart: { type: "donut", background: "transparent", fontFamily: "Outfit, sans-serif" },
    colors: ["#9ca3af","#3b82f6","#465fff","#7c3aed","#10b981"],
    labels: donutData.map(d => d.label),
    legend: { position: "bottom", fontSize: "11px", labels: { colors: "#9ca3af" } },
    dataLabels: { enabled: false },
    plotOptions: { pie: { donut: { size: "68%",
      labels: { show: true, total: { show: true, label: "Total", color: "#9ca3af", fontSize: "12px" } }
    }}},
    stroke: { width: 0 },
    tooltip: { theme: "dark" },
  };

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, enabledModules: [] });
    setModalOpen(true);
  }

  function openEdit(company: PlatformCompany) {
    setEditing(company);
    setForm({
      name: company.name, slug: company.slug,
      planId: company.planId, status: company.status,
      enabledModules: company.enabledModulesDetailed ?? company.enabledModules,
      industry: company.industry, country: company.country,
      city: company.city, contactName: company.contactName,
      contactEmail: company.contactEmail, contactPhone: company.contactPhone,
      website: company.website, notes: company.notes,
      trialEndsAt: company.trialEndsAt, contractStartAt: company.contractStartAt,
      contractEndAt: company.contractEndAt,
    });
    setModalOpen(true);
  }

  const handleStatusChange = useCallback(async (id: number, status: CompanyStatus) => {
    try {
      await updateCompany(id, { status });
      toast.success("Estado actualizado");
    } catch {
      toast.error("Error al actualizar estado");
    }
  }, [updateCompany]);

  async function handleSubmit(submitted: CompanyFormExtended) {
    setSubmitting(true);
    try {
      if (editing) {
        const { masterUser: _, ...rest } = submitted;
        await updateCompany(editing.id, rest);
        toast.success("Empresa actualizada");
      } else {
        await createCompany(submitted);
        toast.success("Empresa creada con su usuario owner");
      }
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setSubmitting(true);
    try {
      await deleteCompany(deleting.id);
      toast.success(`"${deleting.name}" eliminada`);
      setDeleteOpen(false);
      setDeleting(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
      >
        <div>
          <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Plataforma</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Empresas clientes</h1>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            Crea empresas, asignales un plan y controla qué módulos pueden usar.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start">
          <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-white/[0.08] dark:bg-white/[0.04]">
            {(["board","table"] as ViewMode[]).map(v => (
              <button key={v} type="button" onClick={() => setView(v)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all
                  ${view === v
                    ? "bg-white text-gray-800 shadow-sm dark:bg-white/[0.08] dark:text-white"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
                  }`}>
                {v === "board" ? <><LayoutGrid size={12} />Board</> : <><Table2 size={12} />Tabla</>}
              </button>
            ))}
          </div>

          <motion.button type="button" whileTap={{ scale: 0.95 }} onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5
              text-sm font-semibold text-white shadow-sm shadow-brand-500/20
              transition hover:bg-brand-600">
            <Plus size={15} /> Nueva empresa
          </motion.button>
        </div>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          { icon:<Building2 size={16}/>, label:"Total empresas",  value:(stats?.companies.total ?? 0).toString(),     sub:"Todos los tenants",          accent:"bg-brand-500"   },
          { icon:<Users     size={16}/>, label:"Activas",         value:(stats?.companies.active ?? 0).toString(),    sub:"En producción",               accent:"bg-emerald-500" },
          { icon:<Clock     size={16}/>, label:"En trial",        value:(stats?.companies.trial ?? 0).toString(),     sub:"Período de prueba",           accent:"bg-amber-500"   },
          { icon:<ShieldAlert size={16}/>,label:"Suspendidas",    value:(stats?.companies.suspended ?? 0).toString(), sub:"Requieren atención",          accent:"bg-rose-500"    },
        ].map((kpi,i) => (
          <motion.div key={kpi.label}
            initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}
            transition={{ duration:0.35, delay: i*0.07 }}>
            <PlatformKpiCard {...kpi} />
          </motion.div>
        ))}
      </div>

      {/* Filtros */}
      <motion.div
        initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
        transition={{ duration:0.3, delay:0.2 }}
        className="flex flex-wrap items-center gap-2"
      >
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar empresa…"
            className="h-9 rounded-xl border border-gray-200 bg-white pl-9 pr-4 text-sm
              text-gray-700 placeholder:text-gray-400 outline-none transition
              focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10
              dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300" />
        </div>

        <div className="flex items-center gap-1">
          <Filter size={12} className="text-gray-400 mr-1" />
          {(["all",...STATUS_ORDER] as const).map(s => {
            const isAll = s === "all";
            const active = filterStatus === s;
            const meta = isAll ? null : STATUS_META[s];
            return (
              <motion.button key={s} type="button" whileTap={{ scale: 0.93 }}
                onClick={() => setFilterStatus(s)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all ${
                  active
                    ? isAll
                      ? "border-brand-400 bg-brand-50 text-brand-600 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-400"
                      : `${meta!.bg} ${meta!.border} text-gray-700 dark:text-gray-200`
                    : "border-gray-200 text-gray-500 hover:border-gray-300 dark:border-white/[0.08] dark:text-gray-500"
                }`}>
                {isAll ? "Todas" : meta!.label}
              </motion.button>
            );
          })}
        </div>

        <select value={filterPlan} onChange={e => setFilterPlan(e.target.value)}
          className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-600
            outline-none transition focus:border-brand-500
            dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300">
          <option value="all">Todos los planes</option>
          {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
          {filtered.length} empresa{filtered.length !== 1 ? "s" : ""}
        </span>
      </motion.div>

      <div className="grid gap-6 xl:grid-cols-4">
        <div className="xl:col-span-3">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-24 text-gray-400">
              <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <span className="text-sm">Cargando empresas…</span>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {view === "board" && (
                <motion.div key="board"
                  initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
                  exit={{ opacity:0, y:-8 }} transition={{ duration:0.2 }}
                  className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {STATUS_ORDER.map(status => (
                    <BoardColumn
                      key={status}
                      status={status}
                      companies={byStatus[status]}
                      plans={plans}
                      onEdit={openEdit}
                      onDelete={c => { setDeleting(c); setDeleteOpen(true); }}
                      onStatusChange={handleStatusChange}
                      onDetail={c => setDrawerCompany(c)}
                    />
                  ))}
                </motion.div>
              )}

              {view === "table" && (
                <motion.div key="table"
                  initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
                  exit={{ opacity:0, y:-8 }} transition={{ duration:0.2 }}
                  className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]">
                  {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-16">
                      <Building2 size={20} className="text-gray-300 dark:text-gray-600" />
                      <p className="text-sm font-medium text-gray-400">Sin resultados</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[900px] text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 dark:border-white/[0.06]">
                            {["Empresa","Plan","Estado","Usuarios","Módulos","Contacto","Creada",""].map(h => (
                              <th key={h} className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
                          <AnimatePresence>
                            {filtered.map((company, i) => {
                              const plan = plans.find(p => p.id === company.planId);
                              const counts = company.userCounts;
                              return (
                                <motion.tr key={company.id}
                                  initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }}
                                  exit={{ opacity:0 }}
                                  transition={{ duration:0.18, delay: i*0.03 }}
                                  className="group transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.02]">
                                  <td className="px-5 py-3.5">
                                    <div className="flex items-center gap-2.5">
                                      <CompanyAvatar name={company.name} size="sm" />
                                      <div>
                                        <p className="font-semibold text-gray-800 dark:text-white">{company.name}</p>
                                        <p className="text-[11px] text-gray-400 font-mono">{company.slug}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-5 py-3.5">
                                    {plan && (
                                      <span className="rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-600 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-400">
                                        {plan.name}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-5 py-3.5">
                                    <StatusSwitcher company={company} onUpdate={handleStatusChange} />
                                  </td>
                                  <td className="px-5 py-3.5">
                                    {counts && (
                                      <div className="flex flex-col gap-0.5">
                                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 tabular-nums">
                                          {counts.total}
                                          {plan?.maxUsers !== null && plan?.maxUsers !== undefined && (
                                            <span className="ml-1 text-gray-400 dark:text-gray-500">/ {plan.maxUsers}</span>
                                          )}
                                        </span>
                                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                          {counts.admins}A · {counts.supervisors}S · {counts.operators}O · {counts.drivers}C
                                        </span>
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-5 py-3.5">
                                    <span className="rounded-lg bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                                      {company.enabledModules.length} módulos
                                    </span>
                                  </td>
                                  <td className="px-5 py-3.5">
                                    <p className="text-xs text-gray-700 dark:text-gray-200">{company.contactName || "—"}</p>
                                    <p className="text-[11px] text-gray-400">{company.contactEmail || ""}</p>
                                  </td>
                                  <td className="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400">
                                    {fmtDate(company.createdAt)}
                                  </td>
                                  <td className="px-5 py-3.5 group-hover:bg-gray-50/80 dark:group-hover:bg-white/[0.02]">
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <motion.button type="button" whileTap={{ scale:0.9 }}
                                        onClick={() => setDrawerCompany(company)}
                                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition hover:text-brand-500 dark:border-white/[0.08]">
                                        <ExternalLink size={12} />
                                      </motion.button>
                                      <motion.button type="button" whileTap={{ scale:0.9 }}
                                        onClick={() => openEdit(company)}
                                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition hover:text-brand-500 dark:border-white/[0.08]">
                                        <Pencil size={12} />
                                      </motion.button>
                                      {isSuperadmin && (
                                        <motion.button type="button" whileTap={{ scale:0.9 }}
                                          onClick={() => { setDeleting(company); setDeleteOpen(true); }}
                                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition hover:text-rose-500 dark:border-white/[0.08]">
                                          <Trash2 size={12} />
                                        </motion.button>
                                      )}
                                    </div>
                                  </td>
                                </motion.tr>
                              );
                            })}
                          </AnimatePresence>
                        </tbody>
                      </table>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>

        {/* Donut lateral */}
        <motion.div
          initial={{ opacity:0, x:16 }} animate={{ opacity:1, x:0 }}
          transition={{ duration:0.35, delay:0.25 }}
          className="rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-5 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Por plan</h3>
          <p className="mt-0.5 mb-4 text-xs text-gray-400 dark:text-gray-500">Distribución actual</p>
          {donutData.some(d => d.value > 0) ? (
            <ReactApexChart options={donutOptions} series={donutData.map(d => d.value)} type="donut" height={220} />
          ) : (
            <div className="flex flex-col items-center justify-center py-10">
              <p className="text-xs text-gray-400">Sin datos aún</p>
            </div>
          )}
          <div className="mt-4 space-y-2 border-t border-gray-100 pt-4 dark:border-white/[0.06]">
            {STATUS_ORDER.map(s => {
              const count = companies.filter(c => c.status === s).length;
              const meta  = STATUS_META[s];
              const pct   = companies.length > 0 ? Math.round((count / companies.length) * 100) : 0;
              return (
                <div key={s} className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${meta.accent}`} />
                  <span className="flex-1 text-[11px] text-gray-500 dark:text-gray-400">{meta.label}</span>
                  <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">{count}</span>
                  <div className="w-16 h-1 rounded-full bg-gray-100 dark:bg-white/[0.06] overflow-hidden">
                    <div className={`h-full rounded-full ${meta.accent} transition-all duration-500`} style={{ width:`${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>

      <CompanyDrawer
        company={drawerCompany}
        plan={plans.find(p => p.id === drawerCompany?.planId)}
        onClose={() => setDrawerCompany(null)}
        onEdit={() => { if (drawerCompany) { openEdit(drawerCompany); setDrawerCompany(null); }}}
      />

      {/* Modal wizard */}
      <PlatformModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Editar ${editing.name}` : "Nueva empresa"}
        subtitle={editing ? "Modifica los datos de la empresa." : "Crea una empresa nueva con su plan y usuario owner."}
        icon={<Building2 size={15} />}
        iconBg="bg-brand-50 dark:bg-brand-500/[0.12]"
        iconColor="text-brand-600 dark:text-brand-400"
        maxWidth="max-w-3xl"
        hideFooter
      >
        <CompanyWizard
          initialForm={editing ?? EMPTY_FORM}
          onSubmit={handleSubmit}
          onCancel={() => setModalOpen(false)}
          plans={plans}
          isEdit={!!editing}
        />
      </PlatformModal>

      {/* Modal confirmar eliminación */}
      <PlatformModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Eliminar empresa"
        subtitle={`¿Seguro que deseas eliminar "${deleting?.name}"? Esta acción no se puede deshacer.`}
        icon={<Trash2 size={15} />}
        iconBg="bg-error-50 dark:bg-error-500/[0.12]"
        iconColor="text-error-600 dark:text-error-400"
        maxWidth="max-w-md"
        footer={
          <ModalActions
            onCancel={() => setDeleteOpen(false)}
            submitting={submitting}
            submitLabel="Sí, eliminar"
            danger
          />
        }
      >
        <form onSubmit={handleDelete}>
          <div className="px-6 py-4">
            <div className="rounded-xl border border-error-100 bg-error-50 px-4 py-3 dark:border-error-500/20 dark:bg-error-500/[0.07]">
              <p className="text-sm text-error-700 dark:text-error-400">
                Se borrarán también todos los usuarios, vehículos, mantenimientos y datos asociados. Esta acción es IRREVERSIBLE.
              </p>
            </div>
          </div>
        </form>
      </PlatformModal>
    </div>
  );
}
