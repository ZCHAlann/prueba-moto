// components/finanzas/TimelineHorizontal.tsx
//
// jul 2026 v5 — Timeline horizontal estilo "línea del tiempo" de la
// imagen adjunta: 5 nodos con círculos de colores, conectados por
// una línea horizontal con "cintas" decorativas en cada segmento.
//
// Cada nodo es clickeable y muestra un tooltip/popover con el detalle
// del evento (fecha, actor, nota). Se usa en el modal de detalle de
// vales en corrección, para ver todas las fases por las que pasó.
//
// Estructura:
//   ●━━━●━━━●━━━●━━━●
//   ev1  ev2  ev3  ev4  ev5
//
// Los eventos se mapean a íconos (basados en el kind) y colores que
// se mantienen consistentes con el semáforo:
//   created              → 📄  azul
//   reviewer_seen        → 👁   naranja
//   reviewer_started     → ✏️  amarillo
//   correction_requested → ⚠️  rojo
//   photo_reuploaded     → 🔄  azul
//   approved             → ✅  verde

import { useState } from "react";
import {
  FileText, Eye, Pencil, AlertTriangle, RefreshCw, CheckCircle2, Circle,
} from "lucide-react";
import type { TimelineEvent } from "../../hooks/useInvoiceReviews";

interface Props {
  events: TimelineEvent[];
}

const KIND_META: Record<TimelineEvent["kind"], {
  label: string;
  color: string;       // tailwind ring/bg
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}> = {
  created:              { label: "Vale cerrado",     color: "#3b82f6", Icon: FileText },
  reviewer_seen:        { label: "Vista por revisor", color: "#f97316", Icon: Eye },
  reviewer_started:     { label: "Checklist abierto", color: "#f59e0b", Icon: Pencil },
  correction_requested: { label: "Enviada a corregir", color: "#ef4444", Icon: AlertTriangle },
  photo_reuploaded:     { label: "Nueva foto subida", color: "#3b82f6", Icon: RefreshCw },
  approved:             { label: "Aprobada",         color: "#10b981", Icon: CheckCircle2 },
};

function fmtDateTime(d: string): string {
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"][date.getUTCMonth()];
  const yy = date.getUTCFullYear();
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  return `${dd} ${mm} ${yy} ${hh}:${min}`;
}

export function TimelineHorizontal({ events }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (events.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-gray-400">
        Sin eventos registrados.
      </p>
    );
  }

  return (
    <div className="relative w-full overflow-x-auto py-6">
      <div className="flex min-w-max items-start gap-0 px-2">
        {events.map((ev, idx) => {
          const meta = KIND_META[ev.kind] ?? {
            label: ev.kind,
            color: "#94a3b8",
            Icon: Circle,
          };
          const isHovered = hovered === ev.id;
          const isLast = idx === events.length - 1;
          return (
            <div key={ev.id} className="relative flex items-start">
              {/* Nodo */}
              <button
                type="button"
                onMouseEnter={() => setHovered(ev.id)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(ev.id)}
                onBlur={() => setHovered(null)}
                className="group relative z-10 flex flex-col items-center"
                style={{ width: 120 }}
              >
                {/* Línea vertical al ícono si está hovered */}
                <div
                  className="mb-1 h-6 w-0.5"
                  style={{ backgroundColor: isHovered ? meta.color : "transparent" }}
                />
                {/* Círculo del evento */}
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full border-2 bg-white shadow-sm transition-transform group-hover:scale-110 dark:bg-slate-800"
                  style={{ borderColor: meta.color, color: meta.color }}
                >
                  <meta.Icon size={20} />
                </div>
                {/* Label */}
                <p className="mt-2 px-1 text-center text-[11px] font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-200">
                  {meta.label}
                </p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                  {fmtDateTime(ev.createdAt)}
                </p>
                {/* Detalle expandible */}
                {isHovered && (ev.note || ev.actorName) && (
                  <div className="absolute left-1/2 top-full z-20 mt-2 w-56 -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-3 text-left text-xs shadow-lg dark:border-white/[0.08] dark:bg-slate-800">
                    {ev.actorName && (
                      <p className="mb-1 font-semibold text-gray-800 dark:text-gray-100">
                        {ev.actorName}
                      </p>
                    )}
                    {ev.note && (
                      <p className="text-gray-600 dark:text-gray-300">
                        {ev.note}
                      </p>
                    )}
                  </div>
                )}
              </button>
              {/* Línea conectora al siguiente nodo */}
              {!isLast && (
                <div
                  className="mt-6 h-0.5 flex-shrink-0"
                  style={{
                    width: 60,
                    background: "linear-gradient(90deg, " + meta.color + ", " +
                      (KIND_META[events[idx + 1].kind]?.color ?? "#94a3b8") + ")",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
