"use client";

import { motion } from "framer-motion";
import { Plus, Pencil, Trash2, CheckCheck, RefreshCw, MapPin, AlertTriangle } from "lucide-react";
import type { AuditEntry } from "../../../hooks/useAudit";
import { fmtDateTimeEc } from "@/lib/datetime";

const ACTION_META: Record<string, { label: string; icon: React.ReactNode; tone: string; dot: string }> = {
  create:   { label: "Creado",       icon: <Plus size={11} />,      tone: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
  update:   { label: "Actualizado",  icon: <Pencil size={11} />,     tone: "text-blue-600 dark:text-blue-400",       dot: "bg-blue-500" },
  delete:   { label: "Eliminado",    icon: <Trash2 size={11} />,     tone: "text-rose-600 dark:text-rose-400",       dot: "bg-rose-500" },
  complete: { label: "Completado",   icon: <CheckCheck size={11} />, tone: "text-orange-600 dark:text-orange-400",   dot: "bg-orange-500" },
};

type Props = {
  events: AuditEntry[];
  selectedEventId: string | null;
  hoveredEventId: string | null;
  onSelect: (id: string) => void;
  onHover:  (id: string | null) => void;
};

const fmtMeters = (m: number | null) => m == null ? "—" : (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

export function ActivityFeed({ events, selectedEventId, hoveredEventId, onSelect, onHover }: Props) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-xs text-gray-400 dark:text-gray-500">
        <p className="font-semibold">Sin eventos para mostrar</p>
        <p className="mt-1">Probá ajustar el rango de fechas o el filtro de entidad.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-100 dark:divide-white/[0.04]">
      {events.map((e) => {
        const meta = ACTION_META[e.action] ?? { label: e.action, icon: <RefreshCw size={11} />, tone: "text-gray-500", dot: "bg-gray-400" };
        const isSelected = selectedEventId === e.id;
        const isHovered  = hoveredEventId === e.id;
        const isAnomaly  = e.matchedGarageId != null && e.distanceToGarageM != null && e.distanceToGarageM > 150;
        return (
          <motion.li
            key={e.id}
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: isSelected ? 1 : isHovered ? 0.9 : 0.7 }}
            transition={{ duration: 0.15 }}
            onClick={() => onSelect(e.id)}
            onMouseEnter={() => onHover(e.id)}
            onMouseLeave={() => onHover(null)}
            className={`group flex items-start gap-2.5 px-3.5 py-2.5 cursor-pointer transition ${
              isSelected
                ? "bg-indigo-50/80 dark:bg-indigo-500/[0.08] border-l-2 border-indigo-500"
                : "hover:bg-gray-50 dark:hover:bg-white/[0.03] border-l-2 border-transparent"
            }`}
          >
            <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${meta.tone}`}>
                  {meta.icon} {meta.label}
                </span>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">
                  {fmtDateTimeEc(e.createdAt).slice(11, 16)}
                </span>
                {isAnomaly && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                    <AlertTriangle size={9} /> {fmtMeters(e.distanceToGarageM)}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-gray-700 dark:text-gray-300 truncate">
                <span className="font-semibold">{e.actorName || "sistema"}</span>
                <span className="text-gray-400 dark:text-gray-500"> · {e.entity}</span>
              </p>
              {e.description && (
                <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400 line-clamp-1">{e.description}</p>
              )}
            </div>
            {e.latitude != null && e.longitude != null && (
              <MapPin size={11} className="mt-1 shrink-0 text-indigo-400" />
            )}
          </motion.li>
        );
      })}
    </ul>
  );
}
