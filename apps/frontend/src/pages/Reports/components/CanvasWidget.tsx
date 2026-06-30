"use client";

// ─────────────────────────────────────────────────────────────────────────────
// pages/Reports/components/CanvasWidget.tsx
//
// Tarjeta individual en el canvas del lienzo:
//   - Renderiza el chart/tabla (delega en CanvasWidgetRenderer)
//   - Drag libre: se puede agarrar CUALQUIER parte del header (no solo una
//     crucecita escondida). El cuerpo del chart NO es draggable para que
//     tooltips y clicks internos sigan funcionando.
//   - Resize por la esquina inferior derecha (siempre visible, no solo en hover)
//   - Botón "eliminar" en hover (header, esquina sup. derecha)
//   - Auto-save al soltar (useCanvasDrag → onCommit)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import { Trash2, GripVertical, Maximize2, Pencil } from "lucide-react";
import { CanvasWidgetRenderer } from "./CanvasWidgetRenderer";
import { useCanvasDrag } from "../../../hooks/useCanvasDrag";
import { useDebouncedCallback } from "../../../hooks/useDebouncedCallback";
import type { CanvasWidget as CanvasWidgetType } from "../../../hooks/useCanvasBoards";

export function CanvasWidget({
  widget,
  selected,
  onSelect,
  onChangeGeometry,
  onDelete,
  onEdit,
}: {
  widget: CanvasWidgetType;
  selected: boolean;
  onSelect: () => void;
  onChangeGeometry: (next: { posX: number; posY: number; width: number; height: number }) => void;
  onDelete: () => void;
  onEdit?: () => void;
}) {
  // Sincronizar la posición/tamaño del widget (BD) al rect interno del drag.
  const initialRef = useRef({ x: widget.posX, y: widget.posY, w: widget.width, h: widget.height });
  useEffect(() => {
    initialRef.current = { x: widget.posX, y: widget.posY, w: widget.width, h: widget.height };
  }, [widget.posX, widget.posY, widget.width, widget.height]);

  const { rect, bindDragHandle, bindResizeHandle } = useCanvasDrag(
    { x: widget.posX, y: widget.posY, w: widget.width, h: widget.height },
    (next) => onChangeGeometry({ posX: next.x, posY: next.y, width: next.w, height: next.h }),
  );

  // Hook disponible para futuro autosave (no se usa actualmente).
  const debouncedSave = useDebouncedCallback((next: typeof rect) => {
    onChangeGeometry({ posX: next.x, posY: next.y, width: next.w, height: next.h });
  }, 500);

  return (
    <div
      onMouseDown={(e) => {
        // Seleccionar al hacer click en cualquier parte, EXCEPTO si el usuario
        // empezó un drag (eso se maneja dentro de bindDragHandle) o si tocó
        // el handle de resize / botón de borrar.
        const target = e.target as HTMLElement;
        if (target.closest("[data-resize-handle]")) return;
        if (target.closest("[data-no-drag]")) return;
        // Si el click empezó en un elemento draggable, NO seleccionar acá:
        // el handler de drag ya hace stopPropagation cuando lo inicia.
        onSelect();
      }}
      style={{
        position: "absolute",
        left: rect.x,
        top:  rect.y,
        width: rect.w,
        height: rect.h,
        zIndex: selected ? 10 : 1,
      }}
      className={`group flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition dark:bg-[#0d1320] ${
        selected
          ? "border-emerald-500 ring-2 ring-emerald-500/30"
          : "border-gray-200 hover:border-gray-300 dark:border-white/[0.06] dark:hover:border-white/20"
      }`}
    >
      {/* ───── Header draggable (toda la franja es handle, sin crucecita escondida) ───── */}
      <div
        {...bindDragHandle}
        className="flex shrink-0 cursor-move items-center justify-between gap-1 border-b border-gray-100 bg-gradient-to-b from-gray-50/80 to-transparent px-2 py-1.5 dark:border-white/[0.06] dark:from-white/[0.02]"
        title="Arrastrá para mover el widget"
      >
        <span className="flex items-center gap-1.5 text-gray-400 dark:text-gray-500">
          <GripVertical size={11} className="opacity-60 group-hover:opacity-100" />
          <span className="text-[10px] font-bold uppercase tracking-wider">
            {selected ? "Seleccionado" : "Mover"}
          </span>
        </span>

        {/* Hover actions (esquina sup. derecha) */}
        <div
          className="flex gap-1 opacity-0 transition group-hover:opacity-100"
          data-no-drag
          onMouseDown={(e) => e.stopPropagation()}
        >
          {onEdit && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="rounded-md bg-white/90 p-1 text-sky-500 shadow-sm ring-1 ring-sky-200 hover:bg-sky-50 dark:bg-gray-900/80 dark:ring-sky-500/30 dark:hover:bg-sky-500/15"
              title="Editar widget"
            >
              <Pencil size={11} />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="rounded-md bg-white/90 p-1 text-rose-500 shadow-sm ring-1 ring-rose-200 hover:bg-rose-50 dark:bg-gray-900/80 dark:ring-rose-500/30 dark:hover:bg-rose-500/15"
            title="Eliminar widget"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {/* ───── Body: render del chart/tabla (no draggable) ───── */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <CanvasWidgetRenderer widget={widget} />
      </div>

      {/* ───── Resize handle (esquina inferior derecha, siempre visible) ───── */}
      <div
        {...bindResizeHandle}
        data-resize-handle
        className="absolute bottom-1 right-1 z-20 flex h-5 w-5 cursor-nwse-resize items-center justify-center rounded-md bg-white/80 text-gray-400 shadow ring-1 ring-gray-200 transition hover:bg-white hover:text-gray-600 dark:bg-gray-900/70 dark:ring-white/10 dark:hover:text-gray-300"
        onClick={(e) => e.stopPropagation()}
        title="Arrastrá para redimensionar"
      >
        <Maximize2 size={10} className="rotate-45" />
      </div>
    </div>
  );
}

// Re-exportar para no romper el import circular.
export { Trash2 };