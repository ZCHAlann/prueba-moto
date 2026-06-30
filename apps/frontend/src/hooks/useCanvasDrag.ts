"use client";

// ─────────────────────────────────────────────────────────────────────────────
// hooks/useCanvasDrag.ts
//
// Drag + resize SIN librería externa. Mousedown en un handle → mousemove
// global → mouseup. Cada frame actualiza la posición/tamaño local y al
// soltar notifica al caller.
//
// Decisión de proyecto: implementar a mano en lugar de react-rnd para
// evitar incompatibilidad con React 19 (las versiones <11 no declaran
// React 19 en peer deps). Es ~80 LOC y maneja exactamente lo que el
// canvas necesita: drag de toda la tarjeta + resize por la esquina
// inferior derecha.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";

export type CanvasRect = { x: number; y: number; w: number; h: number };

type DragMode = "move" | "resize-br" | null;

/**
 * Devuelve handlers de drag/resize + el rect actual controlado.
 *
 * Uso:
 *   const { rect, bindDragHandle, bindResizeHandle, setRect } = useCanvasDrag(
 *     { x, y, w, h },
 *     (next) => onUpdate(next),    // llamado al SOLTAR (no en cada frame)
 *     { minW: 220, minH: 140 },
 *   );
 */
export function useCanvasDrag(
  initial: CanvasRect,
  onCommit: (next: CanvasRect) => void,
  constraints?: { minW?: number; minH?: number },
) {
  const minW = constraints?.minW ?? 180;
  const minH = constraints?.minH ?? 120;
  const startMouse = useRef<{ mx: number; my: number; rect: CanvasRect } | null>(null);
  const mode = useRef<DragMode>(null);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  // `rect` es la fuente de verdad local durante el drag. El padre no
  // necesita re-render por frame — solo al soltar.
  const [rect, setRect] = useState<CanvasRect>(initial);
  // Sincronizar cuando el padre cambia `initial` (ej. carga inicial del board).
  useEffect(() => { setRect(initial); /* eslint-disable-line react-hooks/exhaustive-deps */ },
    [initial.x, initial.y, initial.w, initial.h]);

  const onMove = useCallback((e: MouseEvent) => {
    const s = startMouse.current;
    if (!s) return;
    const dx = e.clientX - s.mx;
    const dy = e.clientY - s.my;
    if (mode.current === "move") {
      setRect({ ...s.rect, x: s.rect.x + dx, y: s.rect.y + dy });
    } else if (mode.current === "resize-br") {
      setRect({
        ...s.rect,
        w: Math.max(minW, s.rect.w + dx),
        h: Math.max(minH, s.rect.h + dy),
      });
    }
  }, [minW, minH]);

  const onUp = useCallback(() => {
    if (!startMouse.current) return;
    startMouse.current = null;
    mode.current = null;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    // Notificar al padre al SOLTAR (no por frame).
    setRect((cur) => {
      onCommitRef.current(cur);
      return cur;
    });
  }, [onMove]);

  const bindDragHandle: Record<string, unknown> = {
    onMouseDown: (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      startMouse.current = { mx: e.clientX, my: e.clientY, rect };
      mode.current = "move";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    style: { cursor: "move" },
  };

  const bindResizeHandle: Record<string, unknown> = {
    onMouseDown: (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      startMouse.current = { mx: e.clientX, my: e.clientY, rect };
      mode.current = "resize-br";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    style: { cursor: "nwse-resize" },
  };

  // Forzar el rect (usado cuando el padre carga posición inicial async).
  const forceRect = useCallback((r: CanvasRect) => setRect(r), []);

  return { rect, bindDragHandle, bindResizeHandle, setRect: forceRect };
}