"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, RefreshCw, Calendar, AlertCircle } from "lucide-react";
import type { Maintenance } from "../../../hooks/useMaintenancesV2";

export function ReprogramDialog({
  open, target, saving, onClose, onConfirm,
}: {
  open: boolean;
  target: Maintenance | null;
  saving: boolean;
  onClose: () => void;
  onConfirm: (newScheduledFor: string, reason: string) => void;
}) {
  // Guardamos fecha (YYYY-MM-DD) y hora (HH:mm) por separado para que
  // el datetime-local nativo funcione bien, y al confirmar mandamos
  // el ISO completo al backend.
  const [date, setDate]   = useState<string>("");
  const [time, setTime]   = useState<string>("08:00");
  const [reason, setReason] = useState<string>("");

  useEffect(() => {
    if (open) {
      // Por defecto: mañana a las 08:00 (o lo que estuviera antes).
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const baseDate = target?.scheduledFor
        ? target.scheduledFor.slice(0, 10)
        : tomorrow.toISOString().slice(0, 10);
      const baseTime = target?.scheduledFor
        ? target.scheduledFor.slice(11, 16)
        : "08:00";
      setDate(baseDate);
      setTime(baseTime);
      setReason("");
    }
  }, [open, target]);

  const canSubmit = !!(date && time && reason.trim()) && !saving;

  const handleSubmit = () => {
    if (!canSubmit) return;
    // Combinar fecha + hora y mandar ISO al backend.
    const iso = new Date(`${date}T${time}:00`).toISOString();
    onConfirm(iso, reason.trim());
  };

  return (
    <AnimatePresence>
      {open && target && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="fixed left-1/2 top-1/2 z-[60] w-full max-w-md -translate-x-1/2 -translate-y-1/2"
          >
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-white/[0.06] dark:bg-gray-900">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-500 dark:bg-amber-500/10">
                    <RefreshCw size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-800 dark:text-white">Reprogramar mantenimiento</h3>
                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[280px]">"{target.title}"</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                      <Calendar size={10} className="inline mr-1" /> Nueva fecha
                    </label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/10 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                      Hora
                    </label>
                    <input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/10 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Motivo
                  </label>
                  <textarea
                    rows={3}
                    placeholder="¿Por qué reprogramás este mantenimiento?"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/10 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:placeholder:text-gray-500 resize-none"
                  />
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-500/30 dark:bg-amber-500/10">
                  <p className="inline-flex items-start gap-1.5 text-[11px] text-amber-800 dark:text-amber-200">
                    <AlertCircle size={12} className="mt-0.5 shrink-0" />
                    Los repuestos y fotos asociados se eliminan, pero la línea de tiempo se conserva. El mantenimiento vuelve a Programado, conservando la asignación.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-lg border border-gray-200 dark:border-white/[0.06] px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!canSubmit}
                  onClick={handleSubmit}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-amber-500/20 transition"
                >
                  <RefreshCw size={13} /> {saving ? "Reprogramando…" : "Reprogramar"}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
