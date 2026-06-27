"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, Lightbulb } from "lucide-react";

type Props = {
  titulo: string;
  detalle: string;
  tags?: string[];
  recomendacion?: string;
  esAccionPrincipal?: boolean;
  severidad?: "alta" | "media" | "baja";
  color: string;
};

const SEVERIDAD_DOT: Record<"alta" | "media" | "baja", string> = {
  alta: "bg-rose-500",
  media: "bg-amber-500",
  baja: "bg-gray-400",
};

export function AIInsightNote({ titulo, detalle, tags, recomendacion, esAccionPrincipal, severidad, color }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-xl bg-gray-50 dark:bg-white/[0.03] px-2.5 py-2 text-left transition hover:bg-gray-100 dark:hover:bg-white/[0.06]"
      >
        <div className="flex items-center gap-1.5">
          {severidad && !esAccionPrincipal ? (
            <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${SEVERIDAD_DOT[severidad]}`} />
          ) : (
            <Sparkles size={11} className="flex-shrink-0" style={{ color }} />
          )}
          <span className="text-[11.5px] font-semibold leading-snug text-gray-800 dark:text-gray-100">
            {titulo}
          </span>
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="mt-1 rounded-xl bg-gray-50 dark:bg-white/[0.03] px-2.5 py-2.5">
              <p className="text-[11.5px] leading-relaxed text-gray-600 dark:text-gray-300">{detalle}</p>

              {tags && tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {tags.map((t, i) => (
                    <span
                      key={i}
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{ background: `${color}1f`, color }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {recomendacion && (
                <p className="mt-2 flex items-start gap-1 border-t border-gray-100 dark:border-white/[0.06] pt-2 text-[10.5px] text-gray-400">
                  <Lightbulb size={11} className="mt-0.5 flex-shrink-0" />
                  {recomendacion}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
