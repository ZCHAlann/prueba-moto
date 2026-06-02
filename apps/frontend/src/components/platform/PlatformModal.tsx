import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import type { ReactNode } from "react";

interface PlatformModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  iconBg?: string;       // ej. "bg-brand-50 dark:bg-brand-500/[0.12]"
  iconColor?: string;    // ej. "text-brand-600 dark:text-brand-400"
  maxWidth?: string;     // default "max-w-2xl"
  children: ReactNode;
  footer?: ReactNode;    // botones de acción
}

export function PlatformModal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  iconBg   = "bg-brand-50 dark:bg-brand-500/[0.12]",
  iconColor = "text-brand-600 dark:text-brand-400",
  maxWidth = "max-w-2xl",
  children,
  footer,
}: PlatformModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-gray-950/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={`fixed left-1/2 top-1/2 z-50 w-full ${maxWidth}
              -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl
              border border-gray-200 bg-white shadow-2xl
              dark:border-white/[0.08] dark:bg-gray-900`}
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5 dark:border-white/[0.06]">
              <div>
                <div className="flex items-center gap-2">
                  {icon && (
                    <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${iconBg}`}>
                      <span className={iconColor}>{icon}</span>
                    </div>
                  )}
                  <h2 className="text-lg font-bold text-gray-800 dark:text-white">{title}</h2>
                </div>
                {subtitle && (
                  <p className="mt-1 ml-10 text-xs text-gray-400 dark:text-gray-500">{subtitle}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200
                  text-gray-400 transition hover:bg-gray-50
                  dark:border-white/[0.08] dark:hover:bg-white/[0.05]"
              >
                <X size={15} />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto max-h-[70vh]">
              {children}
            </div>

            {/* Footer */}
            {footer && (
              <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4 dark:border-white/[0.06]">
                {footer}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}