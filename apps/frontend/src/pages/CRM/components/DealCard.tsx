import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail, Phone, Clock, TrendingUp, AlertTriangle,
  Flame, ExternalLink, Pencil, Trash2, ArrowRight,
} from "lucide-react";
import type { CRMDeal, LeadStatus } from "../../../types/platform";

// ─── Constants ────────────────────────────────────────────────────────────────

const URGENCY_META = {
  normal:   { border: "border-white/[0.06]",        badge: null },
  warning:  { border: "border-amber-400/40",         badge: { label: "7d sin cambios", color: "text-amber-400 bg-amber-400/10" } },
  critical: { border: "border-rose-400/50",          badge: { label: "14d+ estancado", color: "text-rose-400 bg-rose-400/10"  } },
};

const STAGE_LABELS: Record<LeadStatus, string> = {
  nuevo:             "Nuevo",
  contactado:        "Contactado",
  demo_agendada:     "Demo",
  propuesta_enviada: "Propuesta",
  ganado:            "Ganado",
  perdido:           "Perdido",
};

const NEXT_STAGES: Partial<Record<LeadStatus, LeadStatus>> = {
  nuevo:             "contactado",
  contactado:        "demo_agendada",
  demo_agendada:     "propuesta_enviada",
  propuesta_enviada: "ganado",
};

// ─── Score Ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 14;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  const color =
    score >= 70 ? "#10b981" :
    score >= 40 ? "#f59e0b" : "#f43f5e";

  return (
    <div className="relative flex items-center justify-center h-9 w-9">
      <svg width="36" height="36" viewBox="0 0 36 36" className="-rotate-90">
        {/* Track */}
        <circle cx="18" cy="18" r={r} fill="none"
          stroke="rgba(255,255,255,0.06)" strokeWidth="2.5" />
        {/* Progress */}
        <circle cx="18" cy="18" r={r} fill="none"
          stroke={color} strokeWidth="2.5"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <span className="absolute text-[10px] font-bold"
        style={{ color }}>
        {score}
      </span>
    </div>
  );
}

// ─── Value Badge ──────────────────────────────────────────────────────────────

function ValueBadge({ value }: { value: string | null }) {
  if (!value || parseFloat(value) === 0) return null;
  const num = parseFloat(value);
  const formatted = num >= 1000
    ? `$${(num / 1000).toFixed(1)}k`
    : `$${num.toFixed(0)}`;

  return (
    <span className="rounded-lg bg-brand-500/10 border border-brand-500/20
      px-2 py-0.5 text-[11px] font-bold text-brand-400">
      {formatted}
    </span>
  );
}

// ─── Progress Bar (funnel position) ──────────────────────────────────────────

function FunnelProgress({ status }: { status: LeadStatus }) {
  const steps: LeadStatus[] = [
    "nuevo","contactado","demo_agendada","propuesta_enviada","ganado"
  ];
  const idx = steps.indexOf(status);
  const pct = status === "perdido" ? 0 : ((idx + 1) / steps.length) * 100;

  const color =
    status === "ganado"  ? "bg-emerald-500" :
    status === "perdido" ? "bg-rose-500"    : "bg-brand-500";

  return (
    <div className="h-0.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
      <motion.div
        className={`h-full rounded-full ${color}`}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
    </div>
  );
}

// ─── Deal Card ────────────────────────────────────────────────────────────────

interface DealCardProps {
  deal: CRMDeal;
  onDetail:  () => void;
  onEdit:    () => void;
  onDelete:  () => void;
  onMove:    (status: LeadStatus) => void;
}

export function DealCard({ deal, onDetail, onEdit, onDelete, onMove }: DealCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const urgencyMeta = URGENCY_META[deal.urgency];
  const nextStage   = NEXT_STAGES[deal.status];

  // Iniciales de la empresa
  const initials = deal.companyName
    .split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();

  // Color avatar por nombre
  const AVATAR_COLORS = [
    "bg-brand-500/20 text-brand-300",
    "bg-violet-500/20 text-violet-300",
    "bg-emerald-500/20 text-emerald-300",
    "bg-amber-500/20 text-amber-300",
    "bg-rose-500/20 text-rose-300",
    "bg-cyan-500/20 text-cyan-300",
  ];
  const avatarColor = AVATAR_COLORS[deal.companyName.charCodeAt(0) % AVATAR_COLORS.length];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={`group relative rounded-2xl border bg-white/[0.03] p-3.5
        transition-all hover:bg-white/[0.05] cursor-pointer
        ${urgencyMeta.border}`}
      onClick={onDetail}
    >
      {/* Urgency pulse — solo si es critical */}
      {deal.urgency === "critical" && (
        <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
        </span>
      )}

      {/* Quick actions — hover */}
      <div
        className="absolute right-2.5 top-2.5 flex items-center gap-1
          opacity-0 group-hover:opacity-100 transition-opacity z-10"
        onClick={e => e.stopPropagation()}
      >
        {nextStage && (
          <motion.button
            type="button" whileTap={{ scale: 0.88 }}
            onClick={() => onMove(nextStage)}
            title={`Mover a ${STAGE_LABELS[nextStage]}`}
            className="flex h-6 w-6 items-center justify-center rounded-lg
              border border-white/[0.08] bg-gray-900 text-gray-400
              hover:text-brand-400 hover:border-brand-500/30 transition"
          >
            <ArrowRight size={10} />
          </motion.button>
        )}
        <motion.button
          type="button" whileTap={{ scale: 0.88 }}
          onClick={onEdit}
          className="flex h-6 w-6 items-center justify-center rounded-lg
            border border-white/[0.08] bg-gray-900 text-gray-400
            hover:text-brand-400 transition"
        >
          <Pencil size={10} />
        </motion.button>
        <motion.button
          type="button" whileTap={{ scale: 0.88 }}
          onClick={onDelete}
          className="flex h-6 w-6 items-center justify-center rounded-lg
            border border-white/[0.08] bg-gray-900 text-gray-400
            hover:text-rose-400 transition"
        >
          <Trash2 size={10} />
        </motion.button>
      </div>

      {/* Header — avatar + nombre + score */}
      <div className="flex items-start gap-2.5 pr-16">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center
          rounded-xl text-[11px] font-bold ${avatarColor}`}>
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white leading-tight">
            {deal.companyName}
          </p>
          {deal.contactName && (
            <p className="truncate text-[11px] text-gray-500 mt-0.5">
              {deal.contactName}
            </p>
          )}
        </div>
        <ScoreRing score={deal.score} />
      </div>

      {/* Value + urgency badge */}
      <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
        <ValueBadge value={deal.estimatedValue} />
        {urgencyMeta.badge && (
          <span className={`flex items-center gap-1 rounded-lg px-1.5 py-0.5
            text-[10px] font-medium ${urgencyMeta.badge.color}`}>
            <AlertTriangle size={9} />
            {urgencyMeta.badge.label}
          </span>
        )}
        {deal.source && (
          <span className="text-[10px] text-gray-500">{deal.source}</span>
        )}
      </div>

      {/* Funnel progress */}
      <div className="mt-3">
        <FunnelProgress status={deal.status} />
      </div>

      {/* Footer — contacto + días */}
      <div className="mt-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {deal.contactEmail && (
            <a href={`mailto:${deal.contactEmail}`}
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-brand-400 transition"
            >
              <Mail size={9} /> {deal.contactEmail.split("@")[0]}
            </a>
          )}
          {deal.contactPhone && (
            <a href={`tel:${deal.contactPhone}`}
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-emerald-400 transition"
            >
              <Phone size={9} />
            </a>
          )}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-gray-500">
          <Clock size={9} />
          {deal.daysInPipeline === 0 ? "Hoy" : `${deal.daysInPipeline}d`}
        </div>
      </div>
    </motion.div>
  );
}