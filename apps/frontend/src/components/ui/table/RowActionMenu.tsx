// src/components/ui/table/RowActionMenu.tsx
//
// Menú de acciones de fila (los 3 puntos) que se renderiza en un PORTAL
// al document.body con position: fixed. Esto evita que se corte cuando
// el contenedor padre tiene `overflow: auto` (típico en tablas con scroll
// horizontal).
//
// Cómo se usa:
//   <RowActionMenu
//     items={[
//       { label: "Editar", icon: <Pencil size={13} />, onClick: () => openEdit(), tone: "default" },
//       { label: "Eliminar", icon: <Trash2 size={13} />, onClick: () => onDelete(), tone: "danger" },
//     ]}
//   />
//
// El menú:
//  - Se abre al hacer click en el botón de "tres puntos"
//  - Se posiciona debajo del botón (alineado a la derecha)
//  - Se cierra al hacer click fuera, scrollear o presionar Escape
//  - Se reposiciona si la ventana cambia de tamaño

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";

export type RowActionItem = {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  tone?: "default" | "danger" | "warning" | "success";
  disabled?: boolean;
};

type Props = {
  items: RowActionItem[];
  /** Etiqueta accesible para el botón trigger */
  ariaLabel?: string;
  /** Si solo hay 1 item visible, se renderiza un botón directo en lugar del menú */
  singleItemAsButton?: boolean;
  /** Tamaño del ícono del trigger (default 14) */
  triggerSize?: number;
};

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function RowActionMenu({ items, ariaLabel = "Acciones", singleItemAsButton = true, triggerSize = 14 }: Props) {
  const visibleItems = items.filter((i) => !i.disabled);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; placement: "down" | "up" } | null>(null);

  // Si solo hay 1 item y la prop lo permite, render directo
  if (singleItemAsButton && visibleItems.length === 1) {
    const it = visibleItems[0]!;
    return (
      <button
        onClick={(e) => { e.stopPropagation(); it.onClick(); }}
        className={`rounded-lg border px-2 py-1 text-[11px] font-semibold whitespace-nowrap transition-colors ${
          it.tone === "danger"
            ? "border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-500/20 dark:text-rose-400 dark:hover:bg-rose-500/10"
            : it.tone === "warning"
            ? "border-amber-200 text-amber-600 hover:bg-amber-50 dark:border-amber-500/20 dark:text-amber-400 dark:hover:bg-amber-500/10"
            : it.tone === "success"
            ? "border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-500/20 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
            : "border-sky-200 text-sky-600 hover:bg-sky-50 dark:border-sky-500/20 dark:text-sky-400 dark:hover:bg-sky-500/10"
        }`}
      >
        {it.label}
      </button>
    );
  }

  if (visibleItems.length === 0) {
    return <span className="text-xs text-gray-400">—</span>;
  }

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const MENU_WIDTH = 192; // w-48
    const MENU_MAX_HEIGHT = 320;
    const GAP = 6;
    const VIEWPORT_MARGIN = 8;

    // Horizontal: alineado a la derecha del botón
    let left = rect.right - MENU_WIDTH;
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
    if (left + MENU_WIDTH > window.innerWidth - VIEWPORT_MARGIN) {
      left = window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN;
    }

    // Vertical: si no cabe abajo, abrir arriba
    const spaceBelow = window.innerHeight - rect.bottom;
    let top: number;
    let placement: "down" | "up";
    if (spaceBelow >= MENU_MAX_HEIGHT + GAP) {
      top = rect.bottom + GAP;
      placement = "down";
    } else {
      top = rect.top - GAP;
      placement = "up";
      // Si se sale por arriba, clamp
      if (top < VIEWPORT_MARGIN) top = VIEWPORT_MARGIN;
    }

    setPos({ top, left, placement });
  }, []);

  useIsoLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current && triggerRef.current.contains(t)) return;
      const menu = document.getElementById("row-action-menu-portal");
      if (menu && menu.contains(t)) return;
      setOpen(false);
    }
    function handleScroll() { setOpen(false); }
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open, updatePosition]);

  const toneCls = (tone?: RowActionItem["tone"]) => {
    switch (tone) {
      case "danger":  return "text-rose-600 dark:text-rose-400";
      case "warning": return "text-amber-600 dark:text-amber-400";
      case "success": return "text-emerald-600 dark:text-emerald-400";
      default:        return "text-gray-700 dark:text-gray-200";
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.08] transition-colors"
      >
        <MoreHorizontal size={triggerSize} />
      </button>

      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          id="row-action-menu-portal"
          role="menu"
          style={{
            position: "fixed",
            top: pos.placement === "down" ? pos.top : pos.top,
            left: pos.left,
            transform: pos.placement === "up" ? "translateY(-100%)" : undefined,
            width: 192,
            zIndex: 9999,
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-white/[0.08] dark:bg-[#0d1320]">
            {visibleItems.map((it, i) => (
              <button
                key={i}
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); it.onClick(); }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-semibold hover:bg-gray-50 dark:hover:bg-white/[0.05] transition-colors ${toneCls(it.tone)}`}
              >
                {it.icon}
                <span>{it.label}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
