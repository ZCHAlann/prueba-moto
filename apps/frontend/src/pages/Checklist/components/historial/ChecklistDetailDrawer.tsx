"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  AlertTriangle,
  Wrench,
  Camera,
  FileText,
  Car,
  Calendar,
  User,
  Download,
  Check,
  CircleDot,
  MessageSquareWarning,
} from "lucide-react";
import { toast } from "sonner";
import type { Checklist, ChecklistInspectionItem } from "../../../../hooks/useChecklists";

type Props = {
  checklist: Checklist | null;
  onClose: () => void;
  /** `true` = solo los hallazgos (pestaña Anomalías). `false` = vista completa (Historial). */
  focusOnAnomalies?: boolean;
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = String(iso).slice(0, 10);
  // YYYY-MM-DD → más legible
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return s;
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${d} ${months[Number(m) - 1]} ${y}`;
}

export function ChecklistDetailDrawer({ checklist, onClose, focusOnAnomalies = false }: Props) {
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!checklist) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !exporting) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [checklist, onClose, exporting]);

  useEffect(() => {
    if (checklist) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [checklist]);

  if (!checklist) return null;

  const incorrect = checklist.items.filter((i) => i.hasItem === "NO");
  const correct   = checklist.items.filter((i) => i.hasItem === "SI");
  const showOnlyAnomalies = focusOnAnomalies && incorrect.length > 0;
  const visible = showOnlyAnomalies ? incorrect : checklist.items;
  const status  = checklist.status ?? "Pendiente";
  const isAnomaly = status === "Observado" || incorrect.length > 0;

  async function handleDownload() {
    setExporting(true);
    try {
      const { generateChecklistPdf } = await import("./ChecklistPdf");
      const blob = await generateChecklistPdf(checklist!);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = (checklist!.date ?? "").slice(0, 10);
      a.download = `checklist-${(checklist!.targetLabel ?? "vehiculo").replace(/[^\w-]+/g, "_")}-${date}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      toast.error("No se pudo generar el PDF");
    } finally {
      setExporting(false);
    }
  }

  return (
    <AnimatePresence>
      {checklist && (
        <>
          <motion.div
            key="bd"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => { if (!exporting) onClose(); }}
            className="fixed inset-0 z-40 bg-gray-900/40 backdrop-blur-[2px]"
          />
          <motion.aside
            key="dr"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-xl flex-col bg-white dark:bg-gray-900 shadow-2xl border-l border-gray-200 dark:border-white/[0.08]"
          >
            {/* ── Header ─────────────────────────────────────────────────────── */}
            <header className="px-4 py-5 sm:px-7 border-b border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 dark:bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                      {showOnlyAnomalies ? "Hallazgo" : "Inspección"}
                    </span>
                    <StatusBadge status={status} hasAnomalies={isAnomaly} />
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white tracking-tight truncate">
                    {checklist.targetLabel || "Sin vehículo"}
                  </h2>
                  <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400 truncate">
                    {checklist.categoryName || "Sin plantilla"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={exporting}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 dark:hover:bg-white/[0.06] hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-50"
                  aria-label="Cerrar"
                >
                  <X size={18} />
                </button>
              </div>
            </header>

            {/* ── Body scrollable ────────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto bg-gray-50/40 dark:bg-gray-950/20">
              {/* Summary card */}
              <div className="px-4 py-5 sm:px-7">
                <SummaryCard
                  correct={correct.length}
                  incorrect={incorrect.length}
                  total={checklist.items.length}
                  isAnomaly={isAnomaly}
                  compact={showOnlyAnomalies}
                />
              </div>

              {/* Meta */}
              <div className="px-4 pb-5 sm:px-7">
                <MetaBlock
                  compact={showOnlyAnomalies}
                  checklist={checklist}
                />
              </div>

              {/* Findings (full view) */}
              {!showOnlyAnomalies && checklist.findings && (
                <div className="px-4 pb-5 sm:px-7">
                  <SectionTitle icon={<MessageSquareWarning size={12} />}>
                    Resumen del inspector
                  </SectionTitle>
                  <div className="mt-2 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] divide-y divide-gray-100 dark:divide-white/[0.06]">
                    {checklist.findings.split("|").map((entry, i) => {
                      const trimmed = entry.trim();
                      if (!trimmed) return null;
                      const [label, ...rest] = trimmed.split(":");
                      const value = rest.join(":").trim();
                      return (
                        <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                          <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                            {value ? label.trim() : trimmed}
                          </span>
                          {value && (
                            <span className="text-sm text-gray-500 dark:text-gray-400 text-right shrink-0">
                              {value}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Items */}
              <div className="px-4 pb-6 sm:px-7">
                <SectionTitle
                  icon={showOnlyAnomalies ? <AlertTriangle size={12} /> : <CircleDot size={12} />}
                  accent={showOnlyAnomalies ? "rose" : "neutral"}
                >
                  {showOnlyAnomalies
                    ? `Lo que hay que corregir (${incorrect.length})`
                    : `Ítems inspeccionados (${visible.length})`}
                </SectionTitle>
                <ul className="mt-3 space-y-2.5">
                  {visible.length === 0 ? (
                    <li className="text-sm text-gray-500 dark:text-gray-400 italic">
                      Sin ítems para mostrar.
                    </li>
                  ) : (
                    visible.map((item, i) => (
                      <AnomalyItem
                        key={`${item.itemName}-${i}`}
                        item={item}
                        index={i}
                        compact={showOnlyAnomalies}
                      />
                    ))
                  )}
                </ul>
              </div>
            </div>

            {/* ── Footer ─────────────────────────────────────────────────────── */}
            <footer className="border-t border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 shrink-0">
              <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-2 sm:px-5 sm:py-3.5">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={exporting}
                  className="flex-1 rounded-lg border border-gray-200 dark:border-white/[0.08] py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 transition hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-50"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={exporting}
                  className="flex-[1.4] inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 dark:text-gray-900 disabled:opacity-50 py-2.5 text-sm font-semibold text-white transition"
                >
                  {exporting
                    ? <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    : <Download size={14} />}
                  {exporting ? "Generando…" : "Descargar PDF"}
                </button>
              </div>
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

function StatusBadge({ status, hasAnomalies }: { status: string; hasAnomalies: boolean }) {
  const tone = hasAnomalies
    ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30"
    : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${hasAnomalies ? "bg-rose-500" : "bg-emerald-500"}`} />
      {status}
    </span>
  );
}

function SummaryCard({ correct, incorrect, total, isAnomaly, compact }: {
  correct: number;
  incorrect: number;
  total: number;
  isAnomaly: boolean;
  compact: boolean;
}) {
  if (compact && isAnomaly) {
    return (
      <div className="rounded-2xl border-2 border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/[0.06] p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-500/20">
            <AlertTriangle size={18} className="text-rose-600 dark:text-rose-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-rose-600 dark:text-rose-400">
              Acción requerida
            </p>
            <p className="mt-0.5 text-2xl font-bold text-rose-700 dark:text-rose-300 tabular-nums">
              {incorrect} {incorrect === 1 ? "hallazgo" : "hallazgos"}
            </p>
            <p className="mt-1 text-xs text-rose-700/80 dark:text-rose-300/80">
              De {total} punto{total !== 1 ? "s" : ""} inspeccionado{total !== 1 ? "s" : ""} · {correct} sin novedad
            </p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      <Metric label="Puntos" value={total} />
      <Metric label="Correctos" value={correct} tone="emerald" />
      <Metric label="Con novedad" value={incorrect} tone={isAnomaly ? "rose" : "neutral"} />
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "emerald" | "rose" | "neutral" }) {
  const colorMap = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    rose:    "text-rose-600 dark:text-rose-400",
    neutral: "text-gray-700 dark:text-gray-300",
  } as const;
  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${colorMap[tone ?? "neutral"]}`}>{value}</p>
    </div>
  );
}

function MetaBlock({ compact, checklist }: { compact: boolean; checklist: Checklist }) {
  const rows = compact
    ? [
        { icon: <Calendar size={12} />, label: "Fecha",   value: fmtDate(checklist.date) },
        { icon: <User size={12} />,     label: "Conductor", value: checklist.driverName ?? "" },
      ]
    : [
        { icon: <Calendar size={12} />, label: "Fecha",     value: fmtDate(checklist.date) },
        { icon: <Car size={12} />,      label: "Vehículo",  value: checklist.targetLabel ?? "" },
        { icon: <User size={12} />,     label: "Conductor", value: checklist.driverName ?? "" },
        { icon: <FileText size={12} />, label: "Plantilla", value: checklist.categoryName ?? "" },
      ];

  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] divide-y divide-gray-100 dark:divide-white/[0.06]">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 px-4 py-2.5">
          <span className="text-gray-400 dark:text-gray-500">{r.icon}</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 shrink-0 w-24">
            {r.label}
          </span>
          <span className="text-sm text-gray-800 dark:text-gray-200 truncate flex-1 text-right">
            {r.value || "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ icon, children, accent }: { icon: React.ReactNode; children: React.ReactNode; accent?: "rose" | "neutral" }) {
  const accentClass = accent === "rose"
    ? "text-rose-600 dark:text-rose-400"
    : "text-gray-500 dark:text-gray-400";
  return (
    <p className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest ${accentClass}`}>
      {icon}
      {children}
    </p>
  );
}

function AnomalyItem({ item, index, compact }: {
  item: ChecklistInspectionItem;
  index: number;
  compact: boolean;
}) {
  const isIncorrect = item.hasItem === "NO";
  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, delay: index * 0.03 }}
      className={`rounded-xl border ${
        isIncorrect
          ? "border-rose-200/80 dark:border-rose-500/25 bg-rose-50/60 dark:bg-rose-500/[0.04]"
          : "border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02]"
      }`}
    >
      <div className="flex items-start gap-3 p-4">
        {/* index / status icon */}
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          isIncorrect
            ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400"
            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
        }`}>
          {isIncorrect
            ? <AlertTriangle size={12} strokeWidth={2.5} />
            : <Check size={13} strokeWidth={2.5} />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-gray-900 dark:text-white text-sm leading-snug">
              {item.itemName}
            </p>
            <span className={`shrink-0 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              isIncorrect
                ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400"
                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
            }`}>
              {isIncorrect ? "Incorrecto" : "Correcto"}
            </span>
          </div>

          {!compact && item.condition && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Estado: <span className="font-semibold text-gray-700 dark:text-gray-200">{item.condition}</span>
            </p>
          )}

          {/* Observación — bloque destacado */}
          {item.comment && (
            <div className={`mt-2.5 rounded-lg px-3 py-2 ${
              isIncorrect
                ? "bg-white/80 dark:bg-white/[0.04] border border-rose-100 dark:border-rose-500/15"
                : "bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/[0.04]"
            }`}>
              <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <FileText size={10} /> Observación
              </p>
              <p className={`mt-1 text-sm leading-relaxed ${
                isIncorrect
                  ? "text-rose-950 dark:text-rose-50"
                  : "text-gray-700 dark:text-gray-200"
              }`}>
                {item.comment}
              </p>
            </div>
          )}

          {/* Foto de evidencia */}
          {item.photoUrl && (
            <a
              href={item.photoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2.5 block overflow-hidden rounded-lg border border-gray-200 dark:border-white/[0.08] hover:opacity-90 transition"
            >
              <div className="relative">
                <img
                  src={item.photoUrl}
                  alt={`Evidencia: ${item.itemName}`}
                  className={`w-full object-cover ${isIncorrect ? "h-56" : "h-32"}`}
                />
                <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                  <Camera size={10} /> Ver
                </span>
              </div>
            </a>
          )}

          {!item.comment && !item.photoUrl && isIncorrect && (
            <p className="mt-1.5 text-xs italic text-rose-600/70 dark:text-rose-400/70">
              Sin observación ni foto.
            </p>
          )}
        </div>
      </div>
    </motion.li>
  );
}

/** Re-export para compatibilidad con imports existentes */
export default ChecklistDetailDrawer;
