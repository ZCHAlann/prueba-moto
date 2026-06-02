// src/pages/Platform/Leads/page.tsx
import { useState, useMemo, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Plus, TrendingUp, Target, Award, BarChart2,
  Pencil, Trash2, X, Search, Filter,
  Mail, Phone, DollarSign, User, Calendar,
  ChevronRight, MoveRight, ArrowUpRight,
  Kanban, Table2, Clock,
} from "lucide-react";
import { toast } from "sonner";
import ReactApexChart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import { useAuth } from "../../../context/AuthContext";
import { usePlatformLeads }   from "../../../hooks/usePlatformLeads";
import { usePlatformStats }   from "../../../hooks/usePlatformStats";
import {
  PlatformKpiCard, PlatformModal, ModalActions,
  InputField, SelectField, TextareaField,
} from "../../../components/platform";
import { StatusPill } from "../../../components/common/StatusPill";
import type {
  PlatformLead, PlatformLeadInput, LeadStatus,
} from "../../../types/platform";

// ─── Constants ────────────────────────────────────────────────────────────────

type LeadTone = "success" | "warning" | "danger" | "neutral" | "info";

const STATUS_META: Record<LeadStatus, {
  label: string;
  tone: LeadTone;
  accent: string;
  bg: string;
  border: string;
  description: string;
}> = {
  nuevo:              { label: "Nuevo",              tone: "neutral", accent: "bg-gray-400",    bg: "bg-gray-50 dark:bg-white/[0.03]",          border: "border-gray-200 dark:border-white/[0.08]",    description: "Lead recién ingresado" },
  contactado:         { label: "Contactado",         tone: "info",    accent: "bg-blue-500",    bg: "bg-blue-50 dark:bg-blue-500/10",            border: "border-blue-200 dark:border-blue-500/20",     description: "Primer contacto realizado" },
  demo_agendada:      { label: "Demo agendada",      tone: "warning", accent: "bg-violet-500",  bg: "bg-violet-50 dark:bg-violet-500/10",        border: "border-violet-200 dark:border-violet-500/20", description: "Demo programada" },
  propuesta_enviada:  { label: "Propuesta enviada",  tone: "warning", accent: "bg-amber-500",   bg: "bg-amber-50 dark:bg-amber-500/10",          border: "border-amber-200 dark:border-amber-500/20",   description: "Propuesta comercial enviada" },
  ganado:             { label: "Ganado",             tone: "success", accent: "bg-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-500/10",      border: "border-emerald-200 dark:border-emerald-500/20", description: "Deal cerrado ✓" },
  perdido:            { label: "Perdido",            tone: "danger",  accent: "bg-rose-500",    bg: "bg-rose-50 dark:bg-rose-500/10",            border: "border-rose-200 dark:border-rose-500/20",     description: "Lead no convertido" },
};

const STATUS_ORDER: LeadStatus[] = [
  "nuevo", "contactado", "demo_agendada", "propuesta_enviada", "ganado", "perdido",
];

const SOURCES = [
  "Web", "Referido", "Demo", "Cold outreach", "LinkedIn", "Evento", "Partner", "Otro",
];

const INDUSTRIES = [
  "Transporte", "Logística", "Construcción", "Minería", "Agricultura",
  "Manufactura", "Distribución", "Servicios", "Energía", "Otro",
];

const EMPTY_FORM: PlatformLeadInput = {
  companyName: "",
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  industry: null,
  country: null,
  city: null,
  status: "nuevo",
  source: null,
  assignedTo: null,
  estimatedValue: null,
  notes: null,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtCurrency(v: string | number | null | undefined) {
  if (!v) return "—";
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(Number(v));
}

function daysSince(d: string | null | undefined) {
  if (!d) return 0;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
}

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

const AVATAR_COLORS = [
  ["bg-brand-100 dark:bg-brand-500/20",   "text-brand-700 dark:text-brand-300"],
  ["bg-violet-100 dark:bg-violet-500/20", "text-violet-700 dark:text-violet-300"],
  ["bg-emerald-100 dark:bg-emerald-500/20","text-emerald-700 dark:text-emerald-300"],
  ["bg-amber-100 dark:bg-amber-500/20",   "text-amber-700 dark:text-amber-300"],
  ["bg-rose-100 dark:bg-rose-500/20",     "text-rose-700 dark:text-rose-300"],
  ["bg-cyan-100 dark:bg-cyan-500/20",     "text-cyan-700 dark:text-cyan-300"],
];

function avatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

// ─── Lead Avatar ──────────────────────────────────────────────────────────────

function LeadAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const [bg, text] = avatarColor(name);
  const sz = { sm: "h-7 w-7 text-[10px]", md: "h-9 w-9 text-xs", lg: "h-11 w-11 text-sm" }[size];
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-xl font-bold ${sz} ${bg} ${text}`}>
      {getInitials(name)}
    </div>
  );
}

// ─── Status Switcher ──────────────────────────────────────────────────────────

function StatusSwitcher({
  lead, onUpdate,
}: { lead: PlatformLead; onUpdate: (id: number, status: LeadStatus) => void }) {
  const [open, setOpen] = useState(false);
  const meta = STATUS_META[lead.status];

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
              className="absolute left-0 top-full z-20 mt-1.5 w-48 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-white/[0.08] dark:bg-gray-900"
            >
              {STATUS_ORDER.map(status => {
                const m = STATUS_META[status];
                const isActive = lead.status === status;
                return (
                  <button key={status} type="button"
                    onClick={() => { onUpdate(lead.id, status); setOpen(false); }}
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

// ─── Kanban Card ──────────────────────────────────────────────────────────────

function KanbanCard({
  lead, onEdit, onDelete, onDetail,
}: {
  lead: PlatformLead;
  onEdit: () => void;
  onDelete: () => void;
  onDetail: () => void;
}) {
  const meta = STATUS_META[lead.status];
  const days = daysSince(lead.createdAt);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.22 }}
      onClick={onDetail}
      className="group relative cursor-pointer overflow-hidden rounded-2xl border border-gray-200 bg-white
        transition-all hover:border-brand-300/60 hover:shadow-sm
        dark:border-white/[0.06] dark:bg-white/[0.03] dark:hover:border-brand-500/30"
    >
      <div className={`absolute inset-x-0 top-0 h-0.5 ${meta.accent} opacity-70`} />

      {/* Quick actions */}
      <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <motion.button type="button" whileTap={{ scale: 0.88 }}
          onClick={e => { e.stopPropagation(); onEdit(); }}
          className="flex h-6 w-6 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 transition hover:text-brand-500 dark:border-white/[0.08] dark:bg-gray-900"
        >
          <Pencil size={10} />
        </motion.button>
        <motion.button type="button" whileTap={{ scale: 0.88 }}
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="flex h-6 w-6 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 transition hover:text-rose-500 dark:border-white/[0.08] dark:bg-gray-900"
        >
          <Trash2 size={10} />
        </motion.button>
      </div>

      <div className="p-3.5">
        <div className="flex items-start gap-2.5 pr-12">
          <LeadAvatar name={lead.companyName} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-gray-800 dark:text-white">{lead.companyName}</p>
            {lead.contactName && (
              <p className="truncate text-[11px] text-gray-400">{lead.contactName}</p>
            )}
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {lead.estimatedValue && (
            <span className="flex items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
              <DollarSign size={8} />{fmtCurrency(lead.estimatedValue)}
            </span>
          )}
          {lead.source && (
            <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
              {lead.source}
            </span>
          )}
          {lead.industry && (
            <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
              {lead.industry}
            </span>
          )}
        </div>

        <div className="mt-2.5 flex items-center justify-between border-t border-gray-100 pt-2 dark:border-white/[0.04]">
          <div className="flex items-center gap-1 text-[10px] text-gray-400">
            <Clock size={9} />
            {days === 0 ? "Hoy" : `${days}d`}
          </div>
          {lead.contactEmail && (
            <a href={`mailto:${lead.contactEmail}`} onClick={e => e.stopPropagation()}
              className="text-[10px] text-gray-400 hover:text-brand-500 truncate max-w-[100px]"
            >
              {lead.contactEmail}
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Kanban Column ────────────────────────────────────────────────────────────

function KanbanColumn({
  status, leads, onEdit, onDelete, onDetail,
}: {
  status: LeadStatus;
  leads: PlatformLead[];
  onEdit: (l: PlatformLead) => void;
  onDelete: (l: PlatformLead) => void;
  onDetail: (l: PlatformLead) => void;
}) {
  const meta = STATUS_META[status];
  const totalValue = leads.reduce((sum, l) => sum + Number(l.estimatedValue ?? 0), 0);

  return (
    <div className="flex flex-col gap-2.5 min-w-[200px]">
      <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${meta.bg} ${meta.border}`}>
        <span className={`h-2 w-2 rounded-full ${meta.accent}`} />
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{meta.label}</span>
        <span className="ml-auto rounded-full bg-white/60 px-1.5 py-0.5 text-[10px] font-bold text-gray-600 dark:bg-white/[0.08] dark:text-gray-300">
          {leads.length}
        </span>
      </div>
      {totalValue > 0 && (
        <p className="text-center text-[10px] font-medium text-gray-400 dark:text-gray-500">
          {fmtCurrency(totalValue)}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <AnimatePresence>
          {leads.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 py-8 dark:border-white/[0.06]"
            >
              <Target size={16} className="text-gray-300 dark:text-gray-600 mb-1" />
              <p className="text-[11px] text-gray-400 dark:text-gray-500">Sin leads</p>
            </motion.div>
          ) : (
            leads.map(lead => (
              <KanbanCard
                key={lead.id}
                lead={lead}
                onEdit={() => onEdit(lead)}
                onDelete={() => onDelete(lead)}
                onDetail={() => onDetail(lead)}
              />
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Lead Detail Drawer ───────────────────────────────────────────────────────

function LeadDrawer({
  lead, onClose, onEdit,
}: {
  lead: PlatformLead | null;
  onClose: () => void;
  onEdit: () => void;
}) {
  if (!lead) return null;
  const meta = STATUS_META[lead.status];

  return (
    <AnimatePresence>
      {lead && (
        <>
          <motion.div key="backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-gray-950/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div key="drawer"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 350, damping: 35 }}
            className="fixed right-0 top-0 z-50 h-full w-full max-w-sm overflow-y-auto
              border-l border-gray-200 bg-white shadow-2xl
              dark:border-white/[0.06] dark:bg-gray-900"
          >
            {/* Header */}
            <div className="relative overflow-hidden border-b border-gray-100 px-5 py-5 dark:border-white/[0.06]">
              <div className={`absolute inset-x-0 top-0 h-0.5 ${meta.accent}`} />
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <LeadAvatar name={lead.companyName} size="lg" />
                  <div>
                    <p className="font-bold text-gray-800 dark:text-white">{lead.companyName}</p>
                    {lead.contactName && (
                      <p className="text-xs text-gray-400">{lead.contactName}</p>
                    )}
                  </div>
                </div>
                <button type="button" onClick={onClose}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 dark:border-white/[0.08] dark:hover:bg-white/[0.04]"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <StatusPill label={meta.label} tone={meta.tone} />
                {lead.source && (
                  <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:border-white/[0.08] dark:bg-white/[0.04]">
                    {lead.source}
                  </span>
                )}
                {lead.estimatedValue && (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                    {fmtCurrency(lead.estimatedValue)}
                  </span>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="space-y-5 px-5 py-5">
              <DrawerSection title="Contacto">
                <DrawerRow label="Nombre"   value={lead.contactName} />
                {lead.contactEmail && (
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <span className="text-xs text-gray-400">Email</span>
                    <a href={`mailto:${lead.contactEmail}`}
                      className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:opacity-80 dark:text-brand-400"
                    >
                      <Mail size={11} />{lead.contactEmail}
                    </a>
                  </div>
                )}
                {lead.contactPhone && (
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <span className="text-xs text-gray-400">Teléfono</span>
                    <a href={`tel:${lead.contactPhone}`}
                      className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-200"
                    >
                      <Phone size={11} />{lead.contactPhone}
                    </a>
                  </div>
                )}
              </DrawerSection>

              <DrawerSection title="Datos comerciales">
                <DrawerRow label="Industria"        value={lead.industry} />
                <DrawerRow label="País"             value={lead.country} />
                <DrawerRow label="Ciudad"           value={lead.city} />
                <DrawerRow label="Fuente"           value={lead.source} />
                <DrawerRow label="Valor estimado"   value={fmtCurrency(lead.estimatedValue)} />
              </DrawerSection>

              <DrawerSection title="Fechas">
                <DrawerRow label="Creado"       value={fmtDate(lead.createdAt)} />
                <DrawerRow label="Actualizado"  value={fmtDate(lead.updatedAt)} />
                {lead.convertedAt && (
                  <DrawerRow label="Convertido" value={fmtDate(lead.convertedAt)} />
                )}
                <DrawerRow label="En pipeline"  value={`${daysSince(lead.createdAt)} días`} />
              </DrawerSection>

              {lead.notes && (
                <DrawerSection title="Notas">
                  <p className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 text-sm text-gray-600 dark:border-white/[0.04] dark:bg-white/[0.02] dark:text-gray-300">
                    {lead.notes}
                  </p>
                </DrawerSection>
              )}

              <button type="button" onClick={onEdit}
                className="w-full rounded-xl bg-brand-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-500/20 transition hover:bg-brand-600 active:scale-95"
              >
                Editar lead
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">{title}</p>
      <div className="rounded-xl border border-gray-100 dark:border-white/[0.06] divide-y divide-gray-100 dark:divide-white/[0.04]">
        {children}
      </div>
    </div>
  );
}

function DrawerRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5">
      <span className="text-xs text-gray-400 dark:text-gray-500">{label}</span>
      <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{value || "—"}</span>
    </div>
  );
}

// ─── Lead Form ────────────────────────────────────────────────────────────────

function LeadForm({
  form, onChange,
}: { form: PlatformLeadInput; onChange: (f: PlatformLeadInput) => void }) {
  function set<K extends keyof PlatformLeadInput>(k: K, v: PlatformLeadInput[K]) {
    onChange({ ...form, [k]: v });
  }

  return (
    <div className="grid gap-4 p-6 sm:grid-cols-2">
      <InputField label="Empresa" value={form.companyName} required
        onChange={e => set("companyName", e.target.value)}
        colSpan="full"
      />

      <InputField label="Nombre de contacto" value={form.contactName ?? ""}
        onChange={e => set("contactName", e.target.value || null)}
      />
      <InputField label="Email" type="email" value={form.contactEmail ?? ""}
        onChange={e => set("contactEmail", e.target.value || null)}
      />
      <InputField label="Teléfono" value={form.contactPhone ?? ""}
        onChange={e => set("contactPhone", e.target.value || null)}
      />

      <SelectField label="Estado" value={form.status}
        onChange={e => set("status", e.target.value as LeadStatus)}
      >
        {STATUS_ORDER.map(s => (
          <option key={s} value={s}>{STATUS_META[s].label}</option>
        ))}
      </SelectField>

      <SelectField label="Industria" value={form.industry ?? ""}
        onChange={e => set("industry", e.target.value || null)}
      >
        <option value="">Sin especificar</option>
        {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
      </SelectField>

      <InputField label="País" value={form.country ?? ""}
        placeholder="Ecuador"
        onChange={e => set("country", e.target.value || null)}
      />
      <InputField label="Ciudad" value={form.city ?? ""}
        placeholder="Guayaquil"
        onChange={e => set("city", e.target.value || null)}
      />

      <SelectField label="Fuente" value={form.source ?? ""}
        onChange={e => set("source", e.target.value || null)}
      >
        <option value="">Sin especificar</option>
        {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
      </SelectField>

      <InputField label="Valor estimado (USD)" type="number" value={form.estimatedValue?.toString() ?? ""}
        placeholder="0"
        onChange={e => set("estimatedValue", e.target.value ? e.target.value : null)}
      />

      <TextareaField label="Notas" rows={3} colSpan="full"
        value={form.notes ?? ""}
        placeholder="Observaciones del lead…"
        onChange={e => set("notes", e.target.value || null)}
      />
    </div>
  );
}

// ─── Funnel Mini ──────────────────────────────────────────────────────────────

function FunnelBar({ status, count, max }: { status: LeadStatus; count: number; max: number }) {
  const meta = STATUS_META[status];
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-right text-[11px] text-gray-500 dark:text-gray-400">{meta.label}</span>
      <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-gray-100 dark:bg-white/[0.05]">
        <motion.div
          className={`absolute inset-y-0 left-0 rounded-md ${meta.accent} opacity-80`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
        <span className="absolute inset-0 flex items-center px-2 text-[10px] font-semibold text-white mix-blend-lighten">
          {count}
        </span>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type ViewMode = "kanban" | "table";

export function LeadsPage() {
  const { session } = useAuth();
  const isSuperadmin = session?.role === "superadmin";

  const { leads, loading, createLead, updateLead, deleteLead } = usePlatformLeads();
  const { data: stats } = usePlatformStats();

  const [view,          setView]          = useState<ViewMode>("kanban");
  const [search,        setSearch]        = useState("");
  const [filterStatus,  setFilterStatus]  = useState<LeadStatus | "all">("all");
  const [filterSource,  setFilterSource]  = useState<string>("all");
  const [modalOpen,     setModalOpen]     = useState(false);
  const [deleteOpen,    setDeleteOpen]    = useState(false);
  const [editing,       setEditing]       = useState<PlatformLead | null>(null);
  const [deleting,      setDeleting]      = useState<PlatformLead | null>(null);
  const [drawerLead,    setDrawerLead]    = useState<PlatformLead | null>(null);
  const [form,          setForm]          = useState<PlatformLeadInput>(EMPTY_FORM);
  const [submitting,    setSubmitting]    = useState(false);

  // ── Derived ───────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter(l => {
      if (filterStatus !== "all" && l.status !== filterStatus) return false;
      if (filterSource !== "all" && l.source !== filterSource) return false;
      if (q &&
        !l.companyName.toLowerCase().includes(q) &&
        !(l.contactName ?? "").toLowerCase().includes(q) &&
        !(l.contactEmail ?? "").toLowerCase().includes(q)
      ) return false;
      return true;
    });
  }, [leads, search, filterStatus, filterSource]);

  const byStatus = useMemo(() =>
    STATUS_ORDER.reduce((acc, s) => ({
      ...acc, [s]: filtered.filter(l => l.status === s),
    }), {} as Record<LeadStatus, PlatformLead[]>),
  [filtered]);

  const maxByStatus = useMemo(() =>
    Math.max(...STATUS_ORDER.map(s => byStatus[s].length), 1),
  [byStatus]);

  const pipelineValue = useMemo(() =>
    leads
      .filter(l => !["ganado", "perdido"].includes(l.status))
      .reduce((s, l) => s + Number(l.estimatedValue ?? 0), 0),
  [leads]);

  const wonThisMonth = useMemo(() => {
    const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
    return leads.filter(l => l.status === "ganado" && new Date(l.updatedAt ?? "") >= start).length;
  }, [leads]);

  const conversionRate = useMemo(() => {
    const total = leads.length;
    const won = leads.filter(l => l.status === "ganado").length;
    return total > 0 ? Math.round((won / total) * 100) : 0;
  }, [leads]);

  const sources = useMemo(() =>
    [...new Set(leads.map(l => l.source).filter(Boolean))],
  [leads]);

  // ── Bar chart: leads by source ────────────────────────────────────────────

  const sourceChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    leads.forEach(l => { if (l.source) counts[l.source] = (counts[l.source] ?? 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [leads]);

  const barOptions: ApexOptions = {
    chart: { type: "bar", background: "transparent", fontFamily: "Outfit, sans-serif", toolbar: { show: false } },
    plotOptions: { bar: { horizontal: true, borderRadius: 6, dataLabels: { position: "top" } } },
    colors: ["#465fff"],
    dataLabels: { enabled: true, style: { fontSize: "11px", colors: ["#9ca3af"] }, offsetX: 20 },
    xaxis: { categories: sourceChartData.map(([s]) => s), labels: { style: { colors: "#9ca3af", fontSize: "11px" } }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: { style: { colors: "#9ca3af", fontSize: "11px" } } },
    grid: { borderColor: "rgba(255,255,255,0.05)", strokeDashArray: 4 },
    tooltip: { theme: "dark" },
    legend: { show: false },
  };

  // ── Handlers ──────────────────────────────────────────────────────────────

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(lead: PlatformLead) {
    setEditing(lead);
    setForm({
      companyName:   lead.companyName,
      contactName:   lead.contactName,
      contactEmail:  lead.contactEmail,
      contactPhone:  lead.contactPhone,
      industry:      lead.industry,
      country:       lead.country,
      city:          lead.city,
      status:        lead.status,
      source:        lead.source,
      assignedTo:    lead.assignedTo,
      estimatedValue: lead.estimatedValue,
      notes:         lead.notes,
    });
    setModalOpen(true);
  }

  const handleStatusChange = useCallback(async (id: number, status: LeadStatus) => {
    try {
      await updateLead(id, { status });
      toast.success("Estado actualizado");
    } catch {
      toast.error("Error al actualizar estado");
    }
  }, [updateLead]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editing) {
        await updateLead(editing.id, form);
        toast.success("Lead actualizado");
      } else {
        await createLead(form);
        toast.success("Lead creado");
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
      await deleteLead(deleting.id);
      toast.success(`"${deleting.companyName}" eliminado`);
      setDeleteOpen(false);
      setDeleting(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
      >
        <div>
          <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-violet-200 dark:border-violet-500/20 bg-violet-50 dark:bg-violet-500/10 px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
            <span className="text-xs font-medium text-violet-700 dark:text-violet-400">CRM Comercial</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Leads</h1>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            Gestiona el pipeline comercial y el seguimiento de prospectos.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start">
          {/* View toggle */}
          <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-white/[0.08] dark:bg-white/[0.04]">
            {(["kanban", "table"] as ViewMode[]).map(v => (
              <button key={v} type="button" onClick={() => setView(v)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all
                  ${view === v
                    ? "bg-white text-gray-800 shadow-sm dark:bg-white/[0.08] dark:text-white"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
                  }`}
              >
                {v === "kanban" ? <><Kanban size={12} />Kanban</> : <><Table2 size={12} />Tabla</>}
              </button>
            ))}
          </div>

          <motion.button type="button" whileTap={{ scale: 0.95 }} onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-500/20 transition hover:bg-brand-600"
          >
            <Plus size={15} /> Nuevo lead
          </motion.button>
        </div>
      </motion.div>

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          { icon: <Target size={16} />,      label: "Total leads",       value: leads.length.toString(),        sub: "En todos los estados",    accent: "bg-brand-500"   },
          { icon: <TrendingUp size={16} />,   label: "Pipeline activo",   value: fmtCurrency(pipelineValue),     sub: "Excluyendo ganados/perdidos", accent: "bg-violet-500" },
          { icon: <Award size={16} />,        label: "Ganados este mes",  value: wonThisMonth.toString(),        sub: "Deals cerrados",          accent: "bg-emerald-500" },
          { icon: <BarChart2 size={16} />,    label: "Tasa conversión",   value: `${conversionRate}%`,           sub: "Ganados / total",         accent: "bg-amber-500"   },
        ].map((kpi, i) => (
          <motion.div key={kpi.label}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.07 }}
          >
            <PlatformKpiCard {...kpi} />
          </motion.div>
        ))}
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="flex flex-wrap items-center gap-2"
      >
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar lead…"
            className="h-9 rounded-xl border border-gray-200 bg-white pl-9 pr-4 text-sm text-gray-700 placeholder:text-gray-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300"
          />
        </div>

        <div className="flex items-center gap-1">
          <Filter size={12} className="text-gray-400 mr-1" />
          {(["all", ...STATUS_ORDER] as const).map(s => {
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
                }`}
              >
                {isAll ? "Todos" : meta!.label}
              </motion.button>
            );
          })}
        </div>

        {sources.length > 0 && (
          <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
            className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-600 outline-none transition focus:border-brand-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300"
          >
            <option value="all">Todas las fuentes</option>
            {sources.map(s => <option key={s!} value={s!}>{s}</option>)}
          </select>
        )}

        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
          {filtered.length} lead{filtered.length !== 1 ? "s" : ""}
        </span>
      </motion.div>

      {/* ── Contenido principal + sidebar ─────────────────────────────────── */}
      <div className="grid gap-6 xl:grid-cols-4">

        {/* Vista principal (3/4) */}
        <div className="xl:col-span-3">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-24 text-gray-400">
              <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <span className="text-sm">Cargando leads…</span>
            </div>
          ) : (
            <AnimatePresence mode="wait">

              {/* ── KANBAN ── */}
              {view === "kanban" && (
                <motion.div key="kanban"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}
                  className="overflow-x-auto pb-2"
                >
                  <div className="flex gap-4" style={{ minWidth: `${STATUS_ORDER.length * 220}px` }}>
                    {STATUS_ORDER.map(status => (
                      <div key={status} className="flex-1" style={{ minWidth: 200 }}>
                        <KanbanColumn
                          status={status}
                          leads={byStatus[status]}
                          onEdit={openEdit}
                          onDelete={l => { setDeleting(l); setDeleteOpen(true); }}
                          onDetail={l => setDrawerLead(l)}
                        />
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* ── TABLE ── */}
              {view === "table" && (
                <motion.div key="table"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}
                  className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]"
                >
                  {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-16">
                      <Target size={20} className="text-gray-300 dark:text-gray-600" />
                      <p className="text-sm font-medium text-gray-400">Sin resultados</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[900px] text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 dark:border-white/[0.06]">
                            {["Empresa","Contacto","Estado","Fuente","Valor","Pipeline","Creado",""].map(h => (
                              <th key={h} className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
                          <AnimatePresence>
                            {filtered.map((lead, i) => (
                              <motion.tr key={lead.id}
                                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.18, delay: i * 0.03 }}
                                className="group cursor-pointer transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.02]"
                                onClick={() => setDrawerLead(lead)}
                              >
                                <td className="px-5 py-3.5">
                                  <div className="flex items-center gap-2.5">
                                    <LeadAvatar name={lead.companyName} size="sm" />
                                    <div>
                                      <p className="font-semibold text-gray-800 dark:text-white">{lead.companyName}</p>
                                      {lead.industry && (
                                        <p className="text-[11px] text-gray-400">{lead.industry}</p>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-5 py-3.5">
                                  <p className="text-xs text-gray-700 dark:text-gray-200">{lead.contactName || "—"}</p>
                                  <p className="text-[11px] text-gray-400">{lead.contactEmail || ""}</p>
                                </td>
                                <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                                  <StatusSwitcher lead={lead} onUpdate={handleStatusChange} />
                                </td>
                                <td className="px-5 py-3.5">
                                  {lead.source ? (
                                    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                                      {lead.source}
                                    </span>
                                  ) : "—"}
                                </td>
                                <td className="px-5 py-3.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                  {fmtCurrency(lead.estimatedValue)}
                                </td>
                                <td className="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400">
                                  {daysSince(lead.createdAt)}d
                                </td>
                                <td className="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400">
                                  {fmtDate(lead.createdAt)}
                                </td>
                                <td className="px-5 py-3.5">
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <motion.button type="button" whileTap={{ scale: 0.9 }}
                                      onClick={() => openEdit(lead)}
                                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition hover:text-brand-500 dark:border-white/[0.08]"
                                    >
                                      <Pencil size={12} />
                                    </motion.button>
                                    {isSuperadmin && (
                                      <motion.button type="button" whileTap={{ scale: 0.9 }}
                                        onClick={() => { setDeleting(lead); setDeleteOpen(true); }}
                                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition hover:text-rose-500 dark:border-white/[0.08]"
                                      >
                                        <Trash2 size={12} />
                                      </motion.button>
                                    )}
                                  </div>
                                </td>
                              </motion.tr>
                            ))}
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

        {/* Sidebar (1/4) */}
        <motion.div
          initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, delay: 0.25 }}
          className="space-y-4"
        >
          {/* Funnel */}
          <div className="rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-5 dark:border-white/[0.06] dark:bg-white/[0.03]">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Embudo</h3>
            <p className="mt-0.5 mb-4 text-xs text-gray-400 dark:text-gray-500">Leads por etapa</p>
            <div className="space-y-2">
              {STATUS_ORDER.map(s => (
                <FunnelBar
                  key={s}
                  status={s}
                  count={byStatus[s].length}
                  max={maxByStatus}
                />
              ))}
            </div>
          </div>

          {/* Por fuente */}
          {sourceChartData.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-5 dark:border-white/[0.06] dark:bg-white/[0.03]">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Por fuente</h3>
              <p className="mt-0.5 mb-2 text-xs text-gray-400 dark:text-gray-500">Origen de los leads</p>
              <ReactApexChart
                options={barOptions}
                series={[{ data: sourceChartData.map(([, v]) => v) }]}
                type="bar"
                height={Math.max(120, sourceChartData.length * 36)}
              />
            </div>
          )}

          {/* Pipeline value breakdown */}
          <div className="rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-5 dark:border-white/[0.06] dark:bg-white/[0.03]">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white">Valor por etapa</h3>
            <p className="mt-0.5 mb-4 text-xs text-gray-400 dark:text-gray-500">Pipeline acumulado</p>
            <div className="space-y-2.5">
              {STATUS_ORDER.filter(s => s !== "perdido").map(s => {
                const value = byStatus[s].reduce((sum, l) => sum + Number(l.estimatedValue ?? 0), 0);
                const meta = STATUS_META[s];
                if (value === 0) return null;
                return (
                  <div key={s} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${meta.accent}`} />
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">{meta.label}</span>
                    </div>
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                      {fmtCurrency(value)}
                    </span>
                  </div>
                );
              })}
              <div className="flex items-center justify-between border-t border-gray-100 pt-2.5 dark:border-white/[0.06]">
                <span className="text-xs font-bold text-gray-600 dark:text-gray-300">Total pipeline</span>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  {fmtCurrency(pipelineValue)}
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── Drawer ─────────────────────────────────────────────────────────── */}
      <LeadDrawer
        lead={drawerLead}
        onClose={() => setDrawerLead(null)}
        onEdit={() => { if (drawerLead) { openEdit(drawerLead); setDrawerLead(null); } }}
      />

      {/* ── Modal crear/editar ─────────────────────────────────────────────── */}
      <PlatformModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Editar — ${editing.companyName}` : "Nuevo lead"}
        subtitle={editing ? "Modifica los datos del lead." : "Registra un nuevo prospecto en el pipeline."}
        icon={<Target size={15} />}
        iconBg="bg-violet-50 dark:bg-violet-500/[0.12]"
        iconColor="text-violet-600 dark:text-violet-400"
        maxWidth="max-w-2xl"
        footer={
          <ModalActions
            onCancel={() => setModalOpen(false)}
            submitting={submitting}
            submitLabel={editing ? "Guardar cambios" : "Crear lead"}
          />
        }
      >
        <form onSubmit={handleSubmit}>
          <LeadForm form={form} onChange={setForm} />
        </form>
      </PlatformModal>

      {/* ── Modal eliminar ─────────────────────────────────────────────────── */}
      <PlatformModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Eliminar lead"
        subtitle={`¿Seguro que deseas eliminar "${deleting?.companyName}"?`}
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
                Esta acción eliminará permanentemente el lead. No se puede deshacer.
              </p>
            </div>
          </div>
        </form>
      </PlatformModal>
    </div>
  );
}