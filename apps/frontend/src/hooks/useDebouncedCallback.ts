"use client";

// ─────────────────────────────────────────────────────────────────────────────
// hooks/useDebouncedCallback.ts
// Debounce simple: retrasa la llamada hasta que pasen `delay` ms sin
// nuevas invocaciones. Usado por el canvas para no saturar el backend
// durante el drag/resize (solo se envía al SOLTAR igual, pero queda
// disponible por si más adelante se quiere auto-save durante el drag).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";

export function useDebouncedCallback<T extends (...args: never[]) => void>(
  fn: T,
  delay: number,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return ((...args: Parameters<T>) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fnRef.current(...args), delay);
  }) as T;
}