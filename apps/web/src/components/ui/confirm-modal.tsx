"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2 } from "lucide-react";

export interface ConfirmModalProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  iconTone?: "green" | "red" | "yellow" | "blue";
  children?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmTone?: "green" | "red" | "blue";
  hint?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const iconToneClasses = {
  green:  "bg-green-50 dark:bg-green-500/10",
  red:    "bg-red-50 dark:bg-red-500/10",
  yellow: "bg-yellow-50 dark:bg-yellow-500/10",
  blue:   "bg-blue-50 dark:bg-blue-500/10",
};

const confirmToneClasses = {
  green: "bg-green-500 hover:bg-green-600 focus-visible:ring-green-300 dark:focus-visible:ring-green-700",
  red:   "bg-red-500 hover:bg-red-600 focus-visible:ring-red-300 dark:focus-visible:ring-red-700",
  blue:  "bg-brand-500 hover:bg-brand-600 focus-visible:ring-brand-300 dark:focus-visible:ring-brand-700",
};

export function ConfirmModal({
  title,
  description,
  icon,
  iconTone = "green",
  children,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  confirmTone = "green",
  hint,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    setMounted(true);
    document.body.style.overflow = "hidden";

    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      observer.disconnect();
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [loading, onCancel]);

  if (!mounted) return null;

  return createPortal(
    <div className={isDark ? "dark" : ""}>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        role="dialog"
        aria-modal="true"
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-[2px] transition-opacity"
          onClick={!loading ? onCancel : undefined}
          aria-hidden="true"
        />

        {/* Card */}
        <div className="relative z-10 w-full max-w-md mx-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900">

          {/* Botón cerrar */}
          <button
            onClick={onCancel}
            disabled={loading}
            aria-label="Cerrar"
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-white/10 dark:hover:text-gray-300 disabled:pointer-events-none disabled:opacity-40"
          >
            <X size={16} />
          </button>

          {/* Ícono */}
          {icon && (
            <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-full ${iconToneClasses[iconTone]}`}>
              {icon}
            </div>
          )}

          {/* Título */}
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            {title}
          </h3>

          {/* Descripción */}
          {description && (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {description}
            </p>
          )}

          {/* Slot de contenido */}
          {children && (
            <div className="mt-4">
              {children}
            </div>
          )}

          {/* Hint */}
          {hint && (
            <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
              {hint}
            </p>
          )}

          {/* Botones */}
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 dark:border-gray-600 dark:bg-transparent dark:text-gray-300 dark:hover:bg-white/[0.05] dark:focus-visible:ring-gray-600 disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-60 ${confirmToneClasses[confirmTone]}`}
            >
              {loading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Guardando...
                </>
              ) : (
                confirmLabel
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}