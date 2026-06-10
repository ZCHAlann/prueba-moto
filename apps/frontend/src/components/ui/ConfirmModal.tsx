"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, AlertTriangle } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "warning" | "info";
  onConfirm: () => void;
  onClose: () => void;
  /** Si true, no cierra con click afuera ni con ESC. Útil para acciones críticas. */
  blocking?: boolean;
};

const TONE_CLS: Record<NonNullable<Props["tone"]>, { ring: string; iconBg: string; iconFg: string; btn: string; }> = {
  danger:  { ring: "ring-rose-500/20",    iconBg: "bg-rose-100 dark:bg-rose-500/15",    iconFg: "text-rose-600 dark:text-rose-400",   btn: "bg-rose-600 hover:bg-rose-700" },
  warning: { ring: "ring-amber-500/20",   iconBg: "bg-amber-100 dark:bg-amber-500/15",  iconFg: "text-amber-600 dark:text-amber-400", btn: "bg-amber-600 hover:bg-amber-700" },
  info:    { ring: "ring-blue-500/20",    iconBg: "bg-blue-100 dark:bg-blue-500/15",    iconFg: "text-blue-600 dark:text-blue-400",   btn: "bg-blue-600 hover:bg-blue-700" },
};

export function ConfirmModal({
  open, title, description, confirmLabel = "Confirmar", cancelLabel = "Cancelar",
  tone = "danger", onConfirm, onClose, blocking = false,
}: Props) {
  // ESC para cerrar
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !blocking) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, blocking, onClose]);

  const t = TONE_CLS[tone];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={() => { if (!blocking) onClose(); }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2"
          >
            <div className={`rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 shadow-2xl overflow-hidden ring-1 ${t.ring}`}>
              <div className="flex items-start gap-3 px-5 pt-5 pb-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${t.iconBg}`}>
                  <AlertTriangle size={16} className={t.iconFg} />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-semibold text-gray-800 dark:text-white">{title}</h2>
                  <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</div>
                </div>
                <button type="button" onClick={onClose}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition">
                  <X size={14} />
                </button>
              </div>

              <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02]">
                <button type="button" onClick={onClose}
                  className="rounded-lg border border-gray-200 dark:border-white/[0.08] px-3.5 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.04] transition">
                  {cancelLabel}
                </button>
                <button type="button" onClick={onConfirm}
                  className={`rounded-lg px-4 py-1.5 text-sm font-semibold text-white transition ${t.btn}`}>
                  {confirmLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
