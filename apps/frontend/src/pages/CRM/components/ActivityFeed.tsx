// src/pages/Platform/CRM/components/ActivityFeed.tsx
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, ArrowRight, Plus, TrendingUp,
  AlertTriangle, CheckCircle2, Clock,
} from "lucide-react";
import type { CRMActivity, LeadStatus } from "../../../types/platform";

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGE_META: Record<LeadStatus, { label: string; color: string; dot: string }> = {
  nuevo:             { label: "Nuevo",            color: "text-gray-400",   dot: "bg-gray-500"   },
  contactado:        { label: "Contactado",        color: "text-blue-400",   dot: "bg-blue-500"   },
  demo_agendada:     { label: "Demo",              color: "text-violet-400", dot: "bg-violet-500" },
  propuesta_enviada: { label: "Propuesta",         color: "text-amber-400",  dot: "bg-amber-500"  },
  ganado:            { label: "Ganado",            color: "text-emerald-400",dot: "bg-emerald-500"},
  perdido:           { label: "Perdido",           color: "text-rose-400",   dot: "bg-rose-500"   },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 1)  return "Ahora";
  if (mins  < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  return `${days}d`;
}

function fmtValue(v: string | null) {
  if (!v || parseFloat(v) === 0) return null;
  const n = parseFloat(v);
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;
}

// ─── Activity Item ────────────────────────────────────────────────────────────

function ActivityItem({ item, index }: { item: CRMActivity; index: number }) {
  const meta  = STAGE_META[item.status];
  const value = fmtValue(item.estimatedValue);

  const Icon =
    item.status === "ganado"  ? CheckCircle2  :
    item.urgency === "critical" ? AlertTriangle :
    item.isNew ? Plus : ArrowRight;

  const iconColor =
    item.status === "ganado"    ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" :
    item.urgency === "critical" ? "text-rose-400 bg-rose-500/10 border-rose-500/20"          :
    item.isNew                  ? "text-brand-400 bg-brand-500/10 border-brand-500/20"        :
    "text-gray-400 bg-white/[0.04] border-white/[0.08]";

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0  }}
      transition={{ duration: 0.2, delay: index * 0.04 }}
      className="group flex items-start gap-3 py-3
        border-b border-white/[0.04] last:border-0"
    >
      {/* Icon */}
      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center
        justify-center rounded-lg border ${iconColor}`}>
        <Icon size={11} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold text-gray-200 leading-tight truncate">
            {item.companyName}
          </p>
          <span className="shrink-0 text-[10px] text-gray-600">
            {timeAgo(item.updatedAt)}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
          <span className={`flex items-center gap-1 text-[10px] font-medium ${meta.color}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
          {value && (
            <span className="text-[10px] text-gray-600">· {value}</span>
          )}
          {item.urgency !== "normal" && (
            <span className={`text-[10px] font-semibold
              ${item.urgency === "critical" ? "text-rose-400" : "text-amber-400"}`}>
              · {item.urgency === "critical" ? "Crítico" : "Atención"}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Activity Feed ────────────────────────────────────────────────────────────

interface ActivityFeedProps {
  activity: CRMActivity[];
  loading:  boolean;
}

export function ActivityFeed({ activity, loading }: ActivityFeedProps) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3.5">
        <div className="flex h-6 w-6 items-center justify-center rounded-lg
          bg-brand-500/10 border border-brand-500/20">
          <Activity size={11} className="text-brand-400" />
        </div>
        <p className="text-xs font-bold text-white">Actividad reciente</p>
        {activity.length > 0 && (
          <span className="ml-auto rounded-full bg-white/[0.06]
            px-1.5 py-0.5 text-[10px] font-bold text-gray-400">
            {activity.length}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="px-4 max-h-[420px] overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-gray-600">
            <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <span className="text-xs">Cargando…</span>
          </div>
        ) : activity.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10">
            <TrendingUp size={18} className="text-gray-700" />
            <p className="text-xs text-gray-600">Sin actividad reciente</p>
          </div>
        ) : (
          <AnimatePresence>
            {activity.map((item, idx) => (
              <ActivityItem key={item.id} item={item} index={idx} />
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Footer */}
      {activity.length > 0 && (
        <div className="border-t border-white/[0.04] px-4 py-3">
          <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
            <Clock size={9} />
            Últimas {activity.length} actualizaciones
          </div>
        </div>
      )}
    </div>
  );
}