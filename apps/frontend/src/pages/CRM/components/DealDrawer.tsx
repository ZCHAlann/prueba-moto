import { motion, AnimatePresence } from "framer-motion";
import {
  X, Mail, Phone, Globe, MapPin, Tag, DollarSign,
  Clock, TrendingUp, Calendar, User, Building2,
  ArrowRight, Flame, CheckCircle2, XCircle,
} from "lucide-react";
import type { CRMDeal, LeadStatus } from "../../../types/platform";

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGE_META: Record<LeadStatus, { label: string; color: string; bg: string; border: string }> = {
  nuevo:             { label: "Nuevo",             color: "text-gray-300",    bg: "bg-gray-500/10",    border: "border-gray-500/20"    },
  contactado:        { label: "Contactado",         color: "text-blue-300",    bg: "bg-blue-500/10",    border: "border-blue-500/20"    },
  demo_agendada:     { label: "Demo agendada",      color: "text-violet-300",  bg: "bg-violet-500/10",  border: "border-violet-500/20"  },
  propuesta_enviada: { label: "Propuesta enviada",  color: "text-amber-300",   bg: "bg-amber-500/10",   border: "border-amber-500/20"   },
  ganado:            { label: "Ganado",             color: "text-emerald-300", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  perdido:           { label: "Perdido",            color: "text-rose-300",    bg: "bg-rose-500/10",    border: "border-rose-500/20"    },
};

const PIPELINE_STEPS: LeadStatus[] = [
  "nuevo", "contactado", "demo_agendada", "propuesta_enviada", "ganado",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-EC", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function fmtValue(v: string | null) {
  if (!v || parseFloat(v) === 0) return "—";
  const num = parseFloat(v);
  return num >= 1000
    ? `$${(num / 1000).toFixed(1)}k`
    : `$${num.toFixed(0)}`;
}

// ─── Score Ring (grande) ──────────────────────────────────────────────────────

function ScoreRingLarge({ score }: { score: number }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color =
    score >= 70 ? "#10b981" :
    score >= 40 ? "#f59e0b" : "#f43f5e";
  const label =
    score >= 70 ? "Alto" :
    score >= 40 ? "Medio" : "Bajo";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative flex items-center justify-center h-16 w-16">
        <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
          <circle cx="32" cy="32" r={r} fill="none"
            stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
          <circle cx="32" cy="32" r={r} fill="none"
            stroke={color} strokeWidth="4"
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.8s ease" }}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="text-lg font-bold" style={{ color }}>{score}</span>
        </div>
      </div>
      <p className="text-[11px] font-semibold" style={{ color }}>{label} potencial</p>
    </div>
  );
}

// ─── Pipeline Stepper ─────────────────────────────────────────────────────────

function PipelineStepper({ status }: { status: LeadStatus }) {
  if (status === "perdido") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-rose-500/20
        bg-rose-500/10 px-3 py-2">
        <XCircle size={14} className="text-rose-400" />
        <span className="text-xs font-semibold text-rose-300">Deal perdido</span>
      </div>
    );
  }

  const currentIdx = PIPELINE_STEPS.indexOf(status);

  return (
    <div className="flex items-center gap-1">
      {PIPELINE_STEPS.map((step, idx) => {
        const meta = STAGE_META[step];
        const isDone    = idx < currentIdx;
        const isCurrent = idx === currentIdx;

        return (
          <div key={step} className="flex items-center gap-1 flex-1">
            <div className={`flex flex-col items-center gap-1 flex-1`}>
              <div className={`h-1.5 w-full rounded-full transition-all duration-500 ${
                isDone    ? "bg-brand-500" :
                isCurrent ? "bg-brand-400" :
                "bg-white/[0.06]"
              }`} />
              <span className={`text-[9px] font-medium truncate w-full text-center ${
                isCurrent ? "text-brand-400" :
                isDone    ? "text-gray-400" :
                "text-gray-600"
              }`}>
                {meta.label.split(" ")[0]}
              </span>
            </div>
            {idx < PIPELINE_STEPS.length - 1 && (
              <ArrowRight size={8} className={`shrink-0 mb-3 ${
                isDone ? "text-brand-500" : "text-gray-700"
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Info Row ─────────────────────────────────────────────────────────────────

function InfoRow({
  icon, label, value, href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
  href?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between py-2.5 px-3">
      <div className="flex items-center gap-2 text-gray-500">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer"
          className="text-xs font-medium text-brand-400 hover:opacity-80 transition truncate max-w-[160px]">
          {value}
        </a>
      ) : (
        <span className="text-xs font-medium text-gray-200 truncate max-w-[160px]">
          {value}
        </span>
      )}
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
        {title}
      </p>
      <div className="rounded-xl border border-white/[0.06]
        divide-y divide-white/[0.04] overflow-hidden">
        {children}
      </div>
    </div>
  );
}

// ─── Timeline Item ────────────────────────────────────────────────────────────

function TimelineItem({
  label, date, isFirst,
}: {
  label: string;
  date: string;
  isFirst: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center">
        <div className={`h-2 w-2 rounded-full mt-1 ${
          isFirst ? "bg-brand-400" : "bg-gray-600"
        }`} />
        {!isFirst && <div className="w-px flex-1 bg-white/[0.04] mt-1" />}
      </div>
      <div className="pb-3">
        <p className="text-xs font-medium text-gray-200">{label}</p>
        <p className="text-[11px] text-gray-500 mt-0.5">{fmtDate(date)}</p>
      </div>
    </div>
  );
}

// ─── Deal Drawer ──────────────────────────────────────────────────────────────

interface DealDrawerProps {
  deal:        CRMDeal | null;
  onClose:     () => void;
  onEdit:      () => void;
  onConvert:   () => void;
  onMove:      (status: LeadStatus) => void;
}

export function DealDrawer({
  deal, onClose, onEdit, onConvert, onMove,
}: DealDrawerProps) {
  if (!deal) return null;
  const stageMeta = STAGE_META[deal.status];

  const initials = deal.companyName
    .split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();

  const AVATAR_COLORS = [
    "bg-brand-500/20 text-brand-300",
    "bg-violet-500/20 text-violet-300",
    "bg-emerald-500/20 text-emerald-300",
    "bg-amber-500/20 text-amber-300",
    "bg-rose-500/20 text-rose-300",
    "bg-cyan-500/20 text-cyan-300",
  ];
  const avatarColor = AVATAR_COLORS[deal.companyName.charCodeAt(0) % AVATAR_COLORS.length];

  // Timeline items
  const timeline = [
    { label: "Lead creado",    date: deal.createdAt,   show: true },
    { label: "Última actividad", date: deal.updatedAt, show: deal.updatedAt !== deal.createdAt },
    { label: "Convertido",     date: deal.convertedAt ?? "", show: !!deal.convertedAt },
  ].filter(t => t.show).reverse();

  return (
    <AnimatePresence>
      {deal && (
        <>
          {/* Backdrop */}
          <motion.div
            key="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-gray-950/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            key="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 350, damping: 35 }}
            className="fixed right-0 top-0 z-50 h-full w-full max-w-sm
              overflow-y-auto border-l border-white/[0.06]
              bg-gray-900 shadow-2xl"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 border-b border-white/[0.06]
              bg-gray-900/95 backdrop-blur-sm px-5 py-4">

              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center
                    justify-center rounded-xl text-sm font-bold ${avatarColor}`}>
                    {initials}
                  </div>
                  <div>
                    <p className="font-bold text-white">{deal.companyName}</p>
                    {deal.contactName && (
                      <p className="text-xs text-gray-500">{deal.contactName}</p>
                    )}
                  </div>
                </div>
                <button type="button" onClick={onClose}
                  className="flex h-7 w-7 items-center justify-center rounded-lg
                    border border-white/[0.08] text-gray-400
                    hover:bg-white/[0.04] transition">
                  <X size={14} />
                </button>
              </div>

              {/* Stage pill */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`flex items-center gap-1.5 rounded-full border
                  px-2.5 py-1 text-[11px] font-semibold
                  ${stageMeta.bg} ${stageMeta.border} ${stageMeta.color}`}>
                  {stageMeta.label}
                </span>
                {deal.urgency !== "normal" && (
                  <span className={`flex items-center gap-1 rounded-full border
                    px-2 py-0.5 text-[10px] font-medium
                    ${deal.urgency === "critical"
                      ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                      : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                    }`}>
                    <Flame size={9} />
                    {deal.urgency === "critical" ? "Crítico" : "Atención"}
                  </span>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="space-y-5 px-5 py-5">

              {/* Score + value + days */}
              <div className="flex items-center justify-between
                rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                <ScoreRingLarge score={deal.score} />
                <div className="flex flex-col items-end gap-3">
                  <div className="text-right">
                    <p className="text-xl font-bold text-white">
                      {fmtValue(deal.estimatedValue)}
                    </p>
                    <p className="text-[11px] text-gray-500">Valor estimado</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-300">
                      {deal.daysInPipeline}d en pipeline
                    </p>
                    <p className="text-[11px] text-gray-500">
                      Último cambio hace {deal.daysSinceUpdate}d
                    </p>
                  </div>
                </div>
              </div>

              {/* Pipeline stepper */}
              <Section title="Progreso en el funnel">
                <div className="px-3 py-3">
                  <PipelineStepper status={deal.status} />
                </div>
              </Section>

              {/* Contacto */}
              <Section title="Contacto">
                <InfoRow icon={<User size={11} />}      label="Nombre"   value={deal.contactName} />
                <InfoRow icon={<Mail size={11} />}      label="Email"    value={deal.contactEmail} href={`mailto:${deal.contactEmail}`} />
                <InfoRow icon={<Phone size={11} />}     label="Teléfono" value={deal.contactPhone} href={`tel:${deal.contactPhone}`} />
                <InfoRow icon={<MapPin size={11} />}    label="Ciudad"   value={[deal.city, deal.country].filter(Boolean).join(", ")} />
                <InfoRow icon={<Building2 size={11} />} label="Industria" value={deal.industry} />
              </Section>

              {/* Deal info */}
              <Section title="Info del deal">
                <InfoRow icon={<Tag size={11} />}        label="Fuente"  value={deal.source} />
                <InfoRow icon={<DollarSign size={11} />} label="Valor"   value={fmtValue(deal.estimatedValue)} />
                <InfoRow icon={<Calendar size={11} />}   label="Creado"  value={fmtDate(deal.createdAt)} />
              </Section>

              {/* Notas */}
              {deal.notes && (
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Notas
                  </p>
                  <p className="rounded-xl border border-white/[0.06] bg-white/[0.02]
                    px-3 py-3 text-sm text-gray-300 leading-relaxed">
                    {deal.notes}
                  </p>
                </div>
              )}

              {/* Timeline */}
              <div>
                <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Timeline
                </p>
                <div className="space-y-0">
                  {timeline.map((item, idx) => (
                    <TimelineItem
                      key={idx}
                      label={item.label}
                      date={item.date}
                      isFirst={idx === 0}
                    />
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                <button type="button" onClick={onEdit}
                  className="w-full rounded-xl border border-white/[0.08]
                    py-2.5 text-sm font-semibold text-gray-200
                    transition hover:bg-white/[0.04] active:scale-[0.98]">
                  Editar deal
                </button>

                {deal.status !== "ganado" && deal.status !== "perdido" && (
                  <button type="button" onClick={onConvert}
                    className="w-full rounded-xl bg-emerald-500 py-2.5
                      text-sm font-semibold text-white shadow-sm
                      shadow-emerald-500/20 transition hover:bg-emerald-600
                      active:scale-[0.98]">
                    🎉 Convertir a empresa
                  </button>
                )}

                {deal.status === "ganado" && deal.convertedToCompanyId && (
                  <div className="flex items-center justify-center gap-2
                    rounded-xl border border-emerald-500/20 bg-emerald-500/10
                    py-2.5">
                    <CheckCircle2 size={14} className="text-emerald-400" />
                    <span className="text-sm font-semibold text-emerald-400">
                      Convertido a empresa
                    </span>
                  </div>
                )}

                {deal.status !== "perdido" && (
                  <button type="button"
                    onClick={() => onMove("perdido")}
                    className="w-full rounded-xl border border-rose-500/20
                      py-2 text-xs font-semibold text-rose-400
                      transition hover:bg-rose-500/10 active:scale-[0.98]">
                    Marcar como perdido
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}