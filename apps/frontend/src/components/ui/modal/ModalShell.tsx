// components/ui/modal/ModalShell.tsx
//
// jul 2026 v4-b — ModalShell con tres zonas:
//   1. Header (sticky, fijo arriba)
//   2. Body (scrolleable vertical si el contenido no entra)
//   3. Footer opcional (sticky, fijo abajo — usualmente para los
//      botones "Cancelar / Confirmar" que SIEMPRE deben verse).
//
// jul 2026 v5 — Se movió a su propio archivo. Antes vivía dentro
// de CajaChicaPage.tsx como función no-exportada, lo cual rompía
// los modales externos que la importaban (Vite tira
// "does not provide an export named 'ModalShell'"). Regla: si un
// componente se va a consumir desde varios archivos, vive en un
// módulo aparte y se exporta.

import { createPortal } from "react-dom";
import type { ReactNode } from "react";

export function ModalShell({
  onClose, title, icon: Icon, children, footer, maxWidthClass,
}: {
  onClose: () => void;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: ReactNode;
  footer?: ReactNode;
  // Override del max-w default (lg). Útil para modales anchos como
  // el de revisar factura o ver timeline.
  maxWidthClass?: string;
}) {
  if (typeof document === "undefined") return null;
  const widthClass = maxWidthClass ?? "max-w-lg";
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`flex max-h-[90vh] w-full ${widthClass} flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-gray-900`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 p-4 dark:border-white/[0.06]">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-gray-100">
            <Icon className="h-5 w-5 text-emerald-500" />
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-gray-100 p-4 dark:border-white/[0.06]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
