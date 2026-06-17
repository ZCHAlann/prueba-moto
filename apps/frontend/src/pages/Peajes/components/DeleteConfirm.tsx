"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, AlertTriangle, Banknote } from "lucide-react";
import type { ApiTollEntry } from "../../../hooks/useToll";

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

type DeleteConfirmProps = {
  entry: ApiTollEntry | null;
  assets: Array<{ id: string; plate: string }>;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

export function DeleteConfirm({ entry, onConfirm, onCancel }: DeleteConfirmProps) {
  return (
    <AnimatePresence>
      {entry && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onCancel}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="fixed left-1/2 top-1/2 z-[60] w-full max-w-sm -translate-x-1/2 -translate-y-1/2"
          >
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-white/[0.06] dark:bg-gray-900">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-100 text-rose-500 dark:bg-rose-500/10 mb-4">
                <AlertTriangle size={18} />
              </div>
              <h3 className="text-base font-semibold text-gray-800 dark:text-white">Eliminar peaje</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                ¿Eliminar el cruce{" "}
                <span className="font-medium text-gray-800 dark:text-white">"{entry.tollName}"</span>{" "}
                por <span className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-300">
                  <Banknote size={11} /> {fmtMoney(entry.amount)}
                </span>?
                Esta acción no se puede deshacer.
              </p>
              <div className="mt-5 flex gap-2">
                <button
                  onClick={onCancel}
                  className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-white/[0.06] dark:text-gray-400 dark:hover:bg-white/[0.04] transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={onConfirm}
                  className="flex-1 rounded-lg bg-rose-600 hover:bg-rose-700 px-4 py-2 text-sm font-medium text-white transition"
                >
                  Eliminar
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
