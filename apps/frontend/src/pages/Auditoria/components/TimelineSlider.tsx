"use client";

import { useState } from "react";

type Props = {
  /** Hora del día en formato 24h (0-23). */
  value: number;
  onChange: (h: number) => void;
  /** Puntos discretos en el slider. Default: 24 (1 por hora). */
  steps?: number;
};

/**
 * Slider horizontal para filtrar "eventos hasta la hora X".
 * Se muestra como una barra con ticks por hora.
 * Replica el patrón de shadcn (slider) sin agregar dependencia.
 */
export function TimelineSlider({ value, onChange, steps = 24 }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = steps - 1;
  const pct = (value / max) * 100;
  const display = hovered ?? value;
  const hh = String(Math.floor(display)).padStart(2, "0");

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        <span>Timeline</span>
        <span className="text-gray-900 dark:text-white font-mono text-[11px]">Hasta las {hh}:00</span>
      </div>
      <div
        className="relative h-2 rounded-full bg-gray-200 dark:bg-white/[0.08] cursor-pointer"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = (e.clientX - rect.left) / rect.width;
          const v = Math.round(Math.max(0, Math.min(1, x)) * max);
          onChange(v);
        }}
      >
        <div
          className="absolute left-0 top-0 h-full rounded-full bg-indigo-500/80"
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute top-1/2 h-4 w-4 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white dark:bg-gray-200 border-2 border-indigo-500 shadow cursor-grab"
          style={{ left: `${pct}%` }}
          onMouseDown={(e) => {
            e.preventDefault();
            const target = e.currentTarget.parentElement!;
            const rect = target.getBoundingClientRect();
            const move = (ev: MouseEvent) => {
              const x = (ev.clientX - rect.left) / rect.width;
              const v = Math.round(Math.max(0, Math.min(1, x)) * max);
              onChange(v);
            };
            const up = () => {
              window.removeEventListener("mousemove", move);
              window.removeEventListener("mouseup", up);
            };
            window.addEventListener("mousemove", move);
            window.addEventListener("mouseup", up);
          }}
        />
      </div>
      <div
        className="flex justify-between mt-1.5 text-[9px] text-gray-400 dark:text-gray-500 font-mono"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = (e.clientX - rect.left) / rect.width;
          setHovered(Math.round(Math.max(0, Math.min(1, x)) * max));
        }}
        onMouseLeave={() => setHovered(null)}
      >
        {Array.from({ length: 7 }, (_, i) => {
          const h = Math.round((i / 6) * 23);
          return <span key={i}>{String(h).padStart(2, "0")}h</span>;
        })}
      </div>
    </div>
  );
}
