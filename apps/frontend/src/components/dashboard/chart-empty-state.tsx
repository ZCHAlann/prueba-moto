// components/dashboard/chart-empty-state.tsx
//
// jul 2026 v6 — Empty state reutilizable para charts/tablas del dashboard
// (y de cualquier otra página) que no tienen datos. Antes se mostraba un
// card con solo el header y un cuerpo en blanco, lo que se sentía como
// "la app se rompió". Ahora mostramos un mensaje claro con ícono + cara
// para que se entienda que es intencional y se sepa cómo actuar.

import type { ReactNode } from "react";
import { Smile, type LucideIcon } from "lucide-react";

type ChartEmptyStateProps = {
  /** Mensaje principal que ve el user. Por default: "No hay datos para mostrar". */
  message?: string;
  /** Descripción opcional con más contexto o call-to-action. */
  hint?: ReactNode;
  /** Altura mínima del contenedor para que ocupe lo mismo que un chart con datos. */
  minHeight?: number;
  /** Si se pasa un ícono custom, reemplaza al smile. */
  icon?: LucideIcon;
  /** className extra para ajustar márgenes / bordes. */
  className?: string;
};

export function ChartEmptyState({
  message = "No hay datos para mostrar",
  hint,
  minHeight = 240,
  icon: Icon = Smile,
  className = "",
}: ChartEmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2.5 py-10 text-center ${className}`}
      style={{ minHeight }}
    >
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gray-100 text-gray-400 dark:bg-white/[0.05] dark:text-gray-500">
        <Icon size={22} strokeWidth={1.6} />
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          {message}
        </p>
        {hint && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}
