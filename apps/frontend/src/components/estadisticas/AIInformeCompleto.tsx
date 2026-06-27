"use client";

import { AnimatePresence, motion } from "framer-motion";
import { RefreshCw, Sparkles, AlertTriangle } from "lucide-react";
import { useAIInsights } from "./AIInsightsContext";

type Props = { open: boolean; moduloLabel: string; periodoLabel: string };

export function AIInformeCompleto({ open, moduloLabel, periodoLabel }: Props) {
  const { data, loading, error, regenerar } = useAIInsights();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div className="mt-3 rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] p-4">
            <div className="mb-3 flex items-center gap-1.5">
              <Sparkles size={13} className="text-amber-500" />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                Informe generado por IA · {moduloLabel.toLowerCase()} · {periodoLabel.toLowerCase()}
              </span>
            </div>

            {loading && !data && (
              <div className="flex items-center justify-center gap-2 py-6">
                <RefreshCw size={14} className="animate-spin text-gray-400" />
                <p className="text-[13px] text-gray-500">Redactando informe…</p>
              </div>
            )}

            {error && !data && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-200 dark:border-rose-500/20 bg-rose-50/40 dark:bg-rose-500/[0.04] p-3">
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-rose-500" />
                <div>
                  <p className="text-[12.5px] font-medium text-rose-700 dark:text-rose-300">No se pudo generar el informe.</p>
                  <button type="button" onClick={() => regenerar()} className="mt-1 text-[12px] font-semibold text-rose-600 dark:text-rose-400 underline">
                    Reintentar
                  </button>
                </div>
              </div>
            )}

            {data && (
              <>
                <p className="text-[13.5px] leading-relaxed text-gray-700 dark:text-gray-200">
                  {data.insights.resumenNarrativo || "No hay suficientes datos para un análisis sólido en este período."}
                </p>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-[10.5px] font-bold uppercase tracking-widest text-gray-400">Hallazgos</p>
                    <ul className="space-y-2">
                      {data.insights.accionPrincipal && (
                        <li className="border-l-2 border-amber-500 pl-3 text-[12.5px] text-gray-700 dark:text-gray-200">
                          {data.insights.accionPrincipal.titulo}
                        </li>
                      )}
                      {data.insights.hallazgosSecundarios.map((h, i) => (
                        <li
                          key={i}
                          className={`border-l-2 pl-3 text-[12.5px] text-gray-700 dark:text-gray-200 ${
                            h.severidad === "alta" ? "border-rose-500" :
                            h.severidad === "media" ? "border-amber-500" :
                            "border-gray-300 dark:border-white/15"
                          }`}
                        >
                          {h.titulo}
                        </li>
                      ))}
                      {!data.insights.accionPrincipal && data.insights.hallazgosSecundarios.length === 0 && (
                        <li className="text-[12.5px] text-gray-400">Sin hallazgos relevantes en este período.</li>
                      )}
                    </ul>
                  </div>

                  <div>
                    <p className="mb-2 text-[10.5px] font-bold uppercase tracking-widest text-gray-400">Recomendaciones</p>
                    <ul className="space-y-2">
                      {data.insights.accionPrincipal && (
                        <li className="border-l-2 border-gray-300 dark:border-white/15 pl-3 text-[12.5px] text-gray-700 dark:text-gray-200">
                          {data.insights.accionPrincipal.justificacion}
                        </li>
                      )}
                      {data.insights.hallazgosSecundarios.filter((h) => h.recomendacion).map((h, i) => (
                        <li key={i} className="border-l-2 border-gray-300 dark:border-white/15 pl-3 text-[12.5px] text-gray-700 dark:text-gray-200">
                          {h.recomendacion}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-gray-100 dark:border-white/[0.06] pt-3">
                  <span className="text-[10px] text-gray-400">
                    {data.fromCache ? "Desde caché" : "Recién generado"} · {data.latencyMs}ms
                  </span>
                  <button
                    type="button"
                    onClick={() => regenerar()}
                    className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  >
                    <RefreshCw size={11} /> Regenerar
                  </button>
                </div>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
