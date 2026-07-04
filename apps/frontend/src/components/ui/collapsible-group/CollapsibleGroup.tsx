"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { type ReactNode } from "react";

/**
 * Grupo colapsable con header tipo botón + cuerpo con animación de altura.
 *
 * Replica exactamente la mecánica que usan:
 *   - GroupedReportTable (Reports) — framer-motion 0.22s easeInOut.
 *   - ChecklistPendientes (sección Atrasados VencidosSection).
 *
 * Para mantener un solo tipo de acordeón en toda la app, esto reemplaza
 * los `useState<Set<string>>` + `AnimatePresence` ad-hoc que se repetían
 * en ambos lados. El padre sigue siendo dueño del estado (qué IDs están
 * abiertos) — el componente solo pinta.
 *
 * Convenciones:
 *   - `defaultOpen` arranca como `false` (todos cerrados al inicio).
 *   - Header clickable (rol button, soporta Enter/Space).
 *   - Chevron rota 0° cuando abierto, -90° cuando cerrado.
 *   - Cuerpo animado con la misma curva que GroupedReportTable.
 */
export interface CollapsibleGroupHeader {
  /** Slot izquierdo (título, badge, descripción). */
  left: ReactNode;
  /**
   * Slot derecho (badges, botones de acción). Los botones que pongas acá
   * deben usar `onClick={(e) => e.stopPropagation()}` para no disparar el
   * toggle del acordeón.
   */
  right?: ReactNode;
}

export interface CollapsibleGroupProps {
  /** ID único del grupo (lo usa el padre para trackear qué abrir/cerrar). */
  id: string;
  /** Estado controlado desde el padre. */
  isOpen: boolean;
  /** Callback al click del header. */
  onToggle: () => void;
  /**
   * Cabecera visual en dos slots: `left` (siempre presente) y `right`
   * (opcional, ej. badge de tiempo + botón de acción). El wrapper aplica
   * el `stopPropagation` solo si vos lo ponés en cada botón dentro de
   * `right`.
   */
  header: CollapsibleGroupHeader | ReactNode;
  /** Cuerpo (las filas / contenido que se anima). */
  children: ReactNode;
  /** Variante de paleta del borde. Default `gray`. */
  tone?: "gray" | "rose" | "amber" | "cyan" | "emerald";
  /** Si true, el header se renderiza sin border-b al estar abierto. Default false. */
  flush?: boolean;
}

const TONE_CLASS: Record<NonNullable<CollapsibleGroupProps["tone"]>, {
  border: string;
  borderDark: string;
  chevronActive: string;
  headerActive: string;
  containerHover: string;
}> = {
  gray: {
    border: "border-gray-200",
    borderDark: "dark:border-white/[0.06]",
    chevronActive: "text-gray-500",
    headerActive: "hover:bg-gray-50/60 dark:hover:bg-white/[0.02]",
    containerHover: "",
  },
  rose: {
    border: "border-rose-200",
    borderDark: "dark:border-rose-500/20",
    chevronActive: "text-rose-500",
    headerActive: "hover:bg-rose-50/40 dark:hover:bg-rose-500/[0.04]",
    containerHover: "",
  },
  amber: {
    border: "border-amber-200",
    borderDark: "dark:border-amber-500/20",
    chevronActive: "text-amber-500",
    headerActive: "hover:bg-amber-50/40 dark:hover:bg-amber-500/[0.04]",
    containerHover: "",
  },
  cyan: {
    border: "border-cyan-200",
    borderDark: "dark:border-cyan-500/20",
    chevronActive: "text-cyan-500",
    headerActive: "hover:bg-cyan-50/40 dark:hover:bg-cyan-500/[0.04]",
    containerHover: "",
  },
  emerald: {
    border: "border-emerald-200",
    borderDark: "dark:border-emerald-500/20",
    chevronActive: "text-emerald-500",
    headerActive: "hover:bg-emerald-50/40 dark:hover:bg-emerald-500/[0.04]",
    containerHover: "",
  },
};

export function CollapsibleGroup({
  isOpen,
  onToggle,
  header,
  children,
  tone = "gray",
}: CollapsibleGroupProps) {
  const palette = TONE_CLASS[tone];

  // Compatibilidad: si `header` viene como ReactNode suelto (sin slots),
  // lo tratamos como `left` para no romper consumers antiguos.
  const slots: CollapsibleGroupHeader =
    header && typeof header === "object" && "left" in (header as CollapsibleGroupHeader)
      ? (header as CollapsibleGroupHeader)
      : { left: header as ReactNode };

  return (
    <div
      className={`overflow-hidden rounded-2xl border ${palette.border} ${palette.borderDark} bg-white dark:bg-white/[0.03]`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className={`flex w-full items-center gap-3 px-4 py-3.5 cursor-pointer transition ${palette.headerActive}`}
      >
        <motion.div
          animate={{ rotate: isOpen ? 0 : -90 }}
          transition={{ duration: 0.18, ease: "easeInOut" }}
          className={`shrink-0 ${isOpen ? palette.chevronActive : "text-gray-400"}`}
        >
          <ChevronDown size={15} />
        </motion.div>
        <div className="min-w-0 flex-1">{slots.left}</div>
        {slots.right !== undefined && slots.right !== null && (
          <div className="flex shrink-0 items-center gap-2">{slots.right}</div>
        )}
      </div>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div
              className={`border-t ${
                tone === "gray"
                  ? "border-gray-100 dark:border-white/[0.06]"
                  : tone === "rose"
                    ? "border-rose-100 dark:border-rose-500/10"
                    : tone === "amber"
                      ? "border-amber-100 dark:border-amber-500/10"
                      : tone === "cyan"
                        ? "border-cyan-100 dark:border-cyan-500/10"
                        : "border-emerald-100 dark:border-emerald-500/10"
              }`}
            >
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Hook simple para que el padre tenga un Set<string> controlled con
 * toggle. Centraliza el patrón que ya estaba duplicado en `GroupedReportTable`
 * y en `ChecklistPendientes.VencidosSection`.
 */
export function useCollapsibleSet(initial: Iterable<string> = []) {
  // Pequeño helper local; el padre puede usar lo que prefiera.
  // Devolvemos utilidades para el patrón `new Set(...)` + toggle.
  return {
    initialSet: () => new Set(initial),
    contains: (set: Set<string>, id: string) => set.has(id),
    toggle: (set: Set<string>, id: string) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    },
  };
}
