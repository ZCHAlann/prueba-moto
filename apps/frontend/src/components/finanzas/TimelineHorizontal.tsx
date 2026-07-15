// components/finanzas/TimelineHorizontal.tsx
//
// jul 2026 v5/v6/v7 — Timeline horizontal estilo "línea del tiempo" de la
// imagen adjunta: nodos con círculos de colores, conectados por una
// línea horizontal centrada con el centro de los círculos.
//
// v6: arregla el bug donde la línea conectora se mostraba DEBAJO del
//     círculo (estaba a `mt-6` dentro de un flex `items-start` que no
//     la centraba con el círculo). Ahora cada item es un grid con el
//     bloque superior (círculo + conector) centrado verticalmente.
// v7: el popover de detalle (actor + nota) se renderiza con position:
//     fixed + createPortal a document.body para que NUNCA quede
//     recortado por el overflow-x-auto del contenedor (problema
//     clásico: un `absolute top-full` dentro de un `overflow:auto` se
//     corta porque el overflow crea un nuevo stacking context).
//
// Cada nodo es clickeable y muestra un popover con el detalle del
// evento (fecha, actor, nota). Se usa en el modal de detalle de
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

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  FileText, Eye, Pencil, AlertTriangle, RefreshCw, CheckCircle2, Circle,
} from "lucide-react";
import type { TimelineEvent } from "../../hooks/useInvoiceReviews";

interface Props {
  events: TimelineEvent[];
}

const KIND_META: Record<TimelineEvent["kind"], {
  label: string;
  color: string;       // hex del color del nodo
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}> = {
  created:              { label: "Vale cerrado",      color: "#3b82f6", Icon: FileText },
  reviewer_seen:        { label: "Vista por revisor", color: "#f97316", Icon: Eye },
  reviewer_started:     { label: "Checklist abierto", color: "#f59e0b", Icon: Pencil },
  correction_requested: { label: "Enviada a corregir", color: "#ef4444", Icon: AlertTriangle },
  photo_reuploaded:     { label: "Nueva foto subida", color: "#3b82f6", Icon: RefreshCw },
  approved:             { label: "Aprobada",          color: "#10b981", Icon: CheckCircle2 },
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

interface PopoverState {
  ev: TimelineEvent;
  rect: DOMRect;
}

export function TimelineHorizontal({ events }: Props) {
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const buttonRefs = useRef<Map<number, HTMLButtonElement | null>>(new Map());

  if (events.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-gray-400">
        Sin eventos registrados.
      </p>
    );
  }

  return (
    <>
      <div className="relative w-full overflow-x-auto py-6">
        <div className="flex min-w-max items-start px-2">
          {events.map((ev, idx) => {
            const meta = KIND_META[ev.kind] ?? {
              label: ev.kind,
              color: "#94a3b8",
              Icon: Circle,
            };
            const isLast = idx === events.length - 1;
            const nextMeta = !isLast
              ? (KIND_META[events[idx + 1].kind]?.color ?? "#94a3b8")
              : null;
            return (
              <div key={ev.id} className="flex items-start">
                {/* Contenedor del nodo (círculo + labels) */}
                <button
                  type="button"
                  ref={(el) => { buttonRefs.current.set(ev.id, el); }}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setPopover({ ev, rect });
                  }}
                  onMouseLeave={() => setPopover((p) => (p?.ev.id === ev.id ? null : p))}
                  onFocus={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setPopover({ ev, rect });
                  }}
                  onBlur={() => setPopover((p) => (p?.ev.id === ev.id ? null : p))}
                  className="group relative z-10 flex w-[120px] flex-col items-center"
                >
                  {/* Línea vertical al ícono si está hovered */}
                  <div
                    className="mb-1 h-6 w-0.5"
                    style={{
                      backgroundColor: popover?.ev.id === ev.id ? meta.color : "transparent",
                    }}
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
                </button>
                {/* Línea conectora — v6: alineada verticalmente con el
                    centro del círculo (6px de la línea vertical invisible
                    + 24 = 30px desde el tope del flex item). */}
                {!isLast && nextMeta && (
                  <div
                    className="ml-0 mr-0 h-0.5 flex-shrink-0"
                    style={{
                      width: 60,
                      marginTop: 30,
                      background: `linear-gradient(90deg, ${meta.color}, ${nextMeta})`,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* v7: Popover renderizado via portal para que NO lo recorte el
          overflow-x-auto del contenedor. position:fixed lo posiciona
          relativo al viewport, evitando el stacking context del
          overflow:auto. Cerramos el popover con Escape y al scrollear. */}
      {popover && (popover.ev.note || popover.ev.actorName) &&
        createPortal(
          <TimelinePopover
            ev={popover.ev}
            rect={popover.rect}
            onClose={() => setPopover(null)}
          />,
          document.body,
        )}
    </>
  );
}

function TimelinePopover({
  ev,
  rect,
  onClose,
}: {
  ev: TimelineEvent;
  rect: DOMRect;
  onClose: () => void;
}) {
  // Cerrar con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Cerrar al scrollear (porque position:fixed queda en el mismo lugar
  // mientras scrolleás, y se ve mal)
  useEffect(() => {
    const onScroll = () => onClose();
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [onClose]);

  // Centrar horizontalmente el popover debajo del círculo, con un
  // margen de 8px (mt-2). Si se sale del viewport por izquierda o
  // derecha, clamp al borde.
  const POPOVER_W = 224; // w-56
  const MARGIN = 8;
  const desiredLeft = rect.left + rect.width / 2 - POPOVER_W / 2;
  const clampedLeft = Math.max(8, Math.min(desiredLeft, window.innerWidth - POPOVER_W - 8));
  const top = rect.bottom + MARGIN;

  return (
    <div
      role="tooltip"
      style={{
        position: "fixed",
        top,
        left: clampedLeft,
        width: POPOVER_W,
        zIndex: 9999,    // por encima de cualquier modal/overlay
      }}
      className="rounded-lg border border-gray-200 bg-white p-3 text-left text-xs shadow-xl ring-1 ring-black/5 dark:border-white/[0.08] dark:bg-slate-800 dark:ring-white/10"
    >
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
  );
}
