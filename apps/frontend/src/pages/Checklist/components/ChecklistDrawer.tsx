import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Checklist } from "../../../hooks/useChecklists";
import type { ChecklistItemCondition, ChecklistStatus } from "../../../types/fleet";

type Props = {
  checklist: Checklist | null;
  onClose: () => void;
};

function StatusPill({ status }: { status: ChecklistStatus }) {
  const map = {
    Aprobado: "bg-success-50 text-success-700 border-success-200 dark:bg-success-500/10 dark:text-success-400 dark:border-success-500/20",
    Observado: "bg-warning-50 text-warning-700 border-warning-200 dark:bg-warning-500/10 dark:text-warning-400 dark:border-warning-500/20",
    Pendiente: "bg-gray-100 text-gray-500 border-gray-200 dark:bg-white/[0.05] dark:text-gray-400 dark:border-white/[0.08]",
  };
  return (
    <span className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 text-xs font-semibold ${map[status] ?? map.Pendiente}`}>
      {status}
    </span>
  );
}

function ConditionDot({ c }: { c: ChecklistItemCondition }) {
  const map = {
    Bueno: "bg-success-400",
    Regular: "bg-warning-400",
    Malo: "bg-error-400",
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${map[c] ?? "bg-gray-300"}`} />;
}

function ConditionLabel({ c }: { c: ChecklistItemCondition }) {
  const map = {
    Bueno: "text-success-600 dark:text-success-400",
    Regular: "text-warning-600 dark:text-warning-400",
    Malo: "text-error-600 dark:text-error-400",
  };
  return <span className={`text-sm font-semibold ${map[c] ?? "text-gray-400"}`}>{c}</span>;
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-gray-100 dark:border-white/[0.06] last:border-0">
      <span className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">{label}</span>
      <span className="text-right text-sm font-medium text-gray-800 dark:text-gray-200">{value}</span>
    </div>
  );
}

export function ChecklistDrawer({ checklist, onClose }: Props) {
  useEffect(() => {
    if (!checklist) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [checklist, onClose]);

  useEffect(() => {
    if (checklist) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [checklist]);

  const approvedCount = checklist?.items?.filter((i) => i.condition === "Bueno" && i.hasItem === "SI").length ?? 0;
  const totalCount = checklist?.items?.length ?? 0;
  const observedCount = totalCount - approvedCount;

  return (
    <AnimatePresence>
      {checklist && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          />

          <motion.aside
            key="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-xl flex-col bg-white dark:bg-gray-900 shadow-2xl border-l border-gray-200 dark:border-white/[0.06]"
          >
            {/* header */}
            <div className="flex items-start justify-between border-b border-gray-100 dark:border-white/[0.06] px-6 py-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                  Detalle de inspección
                </p>
                <h2 className="mt-1 text-lg font-semibold text-gray-800 dark:text-white">
                  {checklist.categoryName || "Checklist"}
                </h2>
                <p className="mt-0.5 text-sm text-gray-400 dark:text-gray-500">{checklist.targetLabel}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-gray-200 dark:border-white/[0.08] p-2 text-gray-400 transition hover:bg-gray-50 dark:hover:bg-white/[0.05] hover:text-gray-600 dark:hover:text-gray-300"
                aria-label="Cerrar"
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none">
                  <path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* scrollable content */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* status banner */}
              <div className={`flex items-center justify-between rounded-2xl border px-5 py-4 ${
                checklist.status === "Aprobado"
                  ? "border-success-200 bg-success-50 dark:border-success-500/20 dark:bg-success-500/[0.08]"
                  : "border-warning-200 bg-warning-50 dark:border-warning-500/20 dark:bg-warning-500/[0.08]"
              }`}>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                    Resultado de la inspección
                  </p>
                  <p className={`mt-1 text-2xl font-black ${
                    checklist.status === "Aprobado"
                      ? "text-success-600 dark:text-success-400"
                      : "text-warning-600 dark:text-warning-400"
                  }`}>
                    {checklist.status}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 text-right text-sm text-gray-400 dark:text-gray-500">
                  <span>
                    <span className="font-bold text-gray-700 dark:text-gray-200">{approvedCount}</span> correctos
                  </span>
                  <span>
                    <span className={`font-bold ${observedCount > 0 ? "text-warning-600 dark:text-warning-400" : "text-gray-700 dark:text-gray-200"}`}>
                      {observedCount}
                    </span>{" "}
                    con novedad
                  </span>
                </div>
              </div>

              {/* progress bar */}
              {totalCount > 0 && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
                    <span>Progreso de inspección</span>
                    <span>{Math.round((approvedCount / totalCount) * 100)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.06]">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(approvedCount / totalCount) * 100}%` }}
                      transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
                      className={`h-full rounded-full ${
                        checklist.status === "Aprobado"
                          ? "bg-success-400"
                          : "bg-warning-400"
                      }`}
                    />
                  </div>
                </div>
              )}

              {/* meta */}
              <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-gray-50/60 dark:bg-white/[0.02] px-5 py-1">
                <MetaRow label="Tipo de equipo" value={checklist.targetKind} />
                <MetaRow label="Equipo" value={checklist.targetLabel || "—"} />
                <MetaRow label="Inspector" value={checklist.inspector} />
                <MetaRow label="Fecha y hora" value={checklist.date} />
                <MetaRow label="Categoría" value={checklist.categoryName || "—"} />
              </div>

              {/* items */}
              <div>
                <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                  Items inspeccionados ({totalCount})
                </p>
                {totalCount === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500">Sin items registrados</p>
                ) : (
                  <div className="space-y-2">
                    {checklist.items.map((item, i) => (
                      <motion.div
                        key={item.itemName}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15, delay: i * 0.04 }}
                        className="rounded-2xl border border-gray-100 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] p-4"
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-white/[0.06] text-xs font-semibold text-gray-400 dark:text-gray-500">
                            {i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-semibold text-gray-800 dark:text-gray-200 text-sm">{item.itemName}</p>
                              <ConditionLabel c={item.condition} />
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
                              <span className="flex items-center gap-1.5">
                                <ConditionDot c={item.condition} />
                                Estado: {item.condition}
                              </span>
                              <span className={`font-semibold ${
                                item.hasItem === "SI"
                                  ? "text-success-600 dark:text-success-400"
                                  : "text-error-600 dark:text-error-400"
                              }`}>
                                {item.hasItem === "SI" ? "✓ Presente" : "✗ Ausente"}
                              </span>
                            </div>
                            {item.comment && (
                              <p className="mt-2 rounded-xl border border-gray-100 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.03] px-3 py-2 text-xs text-gray-500 dark:text-gray-400 italic">
                                {item.comment}
                              </p>
                            )}
                            {item.imagePreview && (
                              <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 dark:border-white/[0.08]">
                                <img
                                  src={item.imagePreview}
                                  alt={`Evidencia de ${item.itemName}`}
                                  className="h-28 w-full object-cover"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              {/* findings */}
              {checklist.findings && (
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                    Hallazgos consolidados
                  </p>
                  <p className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-gray-50/60 dark:bg-white/[0.02] px-4 py-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                    {checklist.findings}
                  </p>
                </div>
              )}
            </div>

            {/* footer */}
            <div className="border-t border-gray-100 dark:border-white/[0.06] px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-xl border border-gray-200 dark:border-white/[0.08] py-2.5 text-sm font-semibold text-gray-500 dark:text-gray-400 transition hover:bg-gray-50 dark:hover:bg-white/[0.05] hover:text-gray-700 dark:hover:text-gray-200"
              >
                Cerrar
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}