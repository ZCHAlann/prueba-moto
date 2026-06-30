"use client";

// ─────────────────────────────────────────────────────────────────────────────
// pages/Reports/components/ConfirmDialog.tsx
//
// Modal de confirmación genérico para acciones destructivas dentro del
// Lienzo (quitar módulo del panel, eliminar widget, eliminar board).
// Reemplaza los window.confirm() nativos.
// ─────────────────────────────────────────────────────────────────────────────

import { AlertTriangle, X } from "lucide-react";
import { motion } from "framer-motion";

export type ConfirmDialogProps = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  title,
  description,
  confirmLabel = "Eliminar",
  cancelLabel = "Cancelar",
  tone = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="fixed inset-0 z-[81] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: "spring", stiffness: 340, damping: 28 }}
          className="w-full max-w-sm overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#0d1320]"
        >
          <div className="flex items-start gap-3 px-5 pt-5">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                tone === "danger"
                  ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
                  : "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
              }`}
            >
              <AlertTriangle size={18} />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">{title}</h2>
              {description && (
                <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{description}</p>
              )}
            </div>
            <button
              onClick={onCancel}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.06] dark:hover:text-white"
            >
              <X size={14} />
            </button>
          </div>

          <div className="mt-5 flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/60 px-5 py-3.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
            <button
              onClick={onCancel}
              className="rounded-lg border border-gray-200 px-3.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.04]"
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              className={`rounded-lg px-4 py-1.5 text-xs font-bold text-white shadow-sm transition ${
                tone === "danger"
                  ? "bg-rose-600 hover:bg-rose-700"
                  : "bg-emerald-500 hover:bg-emerald-600"
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </motion.div>
      </div>
    </>
  );
}