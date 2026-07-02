"use client";

import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, MapPin } from "lucide-react";
import type { AnomalousActor } from "../../../hooks/useAudit";

const fmtMeters = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

type Props = {
  actor: AnomalousActor;
  index: number;
  onClick?: () => void;
};

export function AlertCard({ actor, index, onClick }: Props) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.2 }}
      className="group flex flex-col items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/[0.04] p-3.5 text-left hover:border-amber-400 dark:hover:border-amber-500/60 hover:bg-amber-50 dark:hover:bg-amber-500/[0.08] transition w-full"
    >
      <div className="flex items-center gap-2 w-full">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400">
          <AlertTriangle size={13} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-gray-900 dark:text-white truncate">
            {actor.actorName}
          </p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400">
            {actor.anomalousCount} {actor.anomalousCount === 1 ? "acción fuera" : "acciones fuera"} de rango
          </p>
        </div>
        <ArrowRight size={12} className="text-amber-500 group-hover:translate-x-0.5 transition" />
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-amber-700 dark:text-amber-300">
        <MapPin size={10} />
        <span>Máx: {fmtMeters(actor.maxDistanceM)} del garaje</span>
      </div>
    </motion.button>
  );
}
