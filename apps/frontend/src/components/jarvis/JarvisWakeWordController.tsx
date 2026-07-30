// components/jarvis/JarvisWakeWordController.tsx
// ─────────────────────────────────────────────────────────────────────
// jul 2026 v10.0 — REESCRITO TOTALMENTE desde cero.
//
// El botón anterior (con drag, portal, pointer capture, etc.) tenía
// un bug que el user no podía debuggear desde el browser: el click
// no llegaba al handler en ciertos viewports. Después de muchos
// intentos de fix sin acceso al browser, decidimos BORRAR TODO y
// hacer un botón SIMPLE.
//
// v10.1 — Re-agregamos DRAG con la fix correcta:
//   - En `pointerup`/`pointercancel` LIBERAMOS el `setPointerCapture`
//     explícitamente, ANTES de que el click sintético se dispare.
//   - Si no liberamos, el click va al `<div>` contenedor y NO al
//     `<button>` hijo, y el `onClick` nunca corre.
//   - Usamos un flag `wasDragRef` que se resetea apenas se lee en
//     el onClick (no puede quedar "pegado" como antes).
//   - Persistimos la posición en `localStorage`.
//
// v10.2 — Dark/light theme:
//   - Usamos las clases `dark:` de Tailwind para que el botón se
//     vea bien en ambos temas.
//   - Estado OFF: fondo blanco (light) / gris-oscuro (dark).
//   - Estado LISTENING: violeta fuerte en ambos.
//   - Estado ERROR: rojo claro / rojo-oscuro translúcido.
//
// IMPORTANTE: el popup de permiso de mic del browser se dispara la
// primera vez que el user carga la app. El user concede UNA vez y
// queda armado para siempre.
// ─────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Loader2, AlertTriangle } from "lucide-react";
import { getVoskManager } from "../../lib/voskManager";
import { useAuth } from "../../context/AuthContext";
import { useWakeWord } from "../../hooks/useWakeWord";

const TRIGGER_DEFAULT = "jarvis";
const POS_KEY         = "jarvis.wakeword.btn.pos.v10";

const FAB_MARGIN     = 12;   // px de margen desde el borde
const DRAG_THRESHOLD = 6;    // px de movimiento para diferenciar click de drag
const BTN_W          = 200;  // ancho aproximado de la píldora
const BTN_H          = 44;   // alto aproximado

export interface JarvisWakeWordControllerProps {
  /** Si está oculto (default true). */
  silent?: boolean;
}

export function JarvisWakeWordController({
  silent = true,
}: JarvisWakeWordControllerProps) {
  void silent;
  const { session, companyId } = useAuth();

  const canUseAssistant =
    !!session &&
    !!companyId &&
    (session.role === "admin_empresa" || session.role === "owner_empresa") &&
    (session.companyModules ?? []).includes("jarvis");

  // ── Estado del wake word ─────────────────────────────────────────
  const [wakeWordActive, setWakeWordActive] = useState(false);

  const wakeWord = useWakeWord({
    keyword: "jarvis",
    threshold: 0.2,
    cooldownMs: 2000,
    onTrigger: () => {
      // eslint-disable-next-line no-console
      console.log("[jarvis] wake word detected, dispatching event");
      window.dispatchEvent(
        new CustomEvent("jarvis:wake-detected", { detail: { ts: Date.now() } }),
      );
    },
    armed: wakeWordActive && canUseAssistant,
  });

  // ── Posición del FAB (persistida en localStorage) ────────────────
  const constrainFabPos = (x: number, y: number) => {
    if (typeof window === "undefined") return { x, y };
    const maxX = window.innerWidth - BTN_W - FAB_MARGIN;
    const maxY = window.innerHeight - BTN_H - FAB_MARGIN;
    return {
      x: Math.max(FAB_MARGIN, Math.min(maxX, x)),
      y: Math.max(FAB_MARGIN, Math.min(maxY, y)),
    };
  };
  const getInitialFabPos = (): { x: number; y: number } => {
    // Default: esquina inferior DERECHA (bottom-4 right-4).
    const defaultX =
      typeof window !== "undefined"
        ? window.innerWidth - BTN_W - FAB_MARGIN
        : 100;
    const defaultY =
      typeof window !== "undefined"
        ? window.innerHeight - BTN_H - FAB_MARGIN
        : 100;
    if (typeof window === "undefined") return { x: defaultX, y: defaultY };
    try {
      const stored = localStorage.getItem(POS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
          return constrainFabPos(parsed.x, parsed.y);
        }
      }
    } catch {}
    return { x: defaultX, y: defaultY };
  };
  const [fabPos, setFabPos] = useState(getInitialFabPos);
  const [isDragging, setIsDragging] = useState(false);

  // Reajustar si la ventana cambia de tamaño.
  useEffect(() => {
    const onResize = () => setFabPos((p) => constrainFabPos(p.x, p.y));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Drag (jul 2026 v10.1) ─────────────────────────────────────────
  // La fix del bug: `wasDragRef` se resetea apenas se lee en
  // `onButtonClick`, así no puede quedar "pegado" entre clicks.
  // Además, en `endDrag` (pointerup/pointercancel) NO seteamos
  // `wasDragRef = false` — eso lo hace el onClick inmediatamente
  // después (síncrono, en el mismo task del click).
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    fabStartX: number;
    fabStartY: number;
  } | null>(null);
  const wasDragRef = useRef(false);

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    // Capturamos el puntero. Esto es necesario para que pointermove
    // nos siga llegando aunque el cursor salga del botón durante el
    // drag. En endDrag() liberamos explícitamente ANTES de que el
    // click sintético se dispare.
    (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      fabStartX: fabPos.x,
      fabStartY: fabPos.y,
    };
    wasDragRef.current = false;
    setIsDragging(true);
  }
  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!wasDragRef.current && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
    wasDragRef.current = true;
    e.preventDefault();
    setFabPos(constrainFabPos(d.fabStartX + dx, d.fabStartY + dy));
  }
  function endDrag(e: React.PointerEvent<HTMLButtonElement>) {
    // Liberar la captura del puntero ANTES de que el navegador
    // dispare el click sintético. Si no, el click va al <button>
    // contenedor (el que capturó) y no se procesa el onClick.
    try {
      const el = e.currentTarget as HTMLButtonElement;
      if (dragRef.current && el.hasPointerCapture?.(dragRef.current.pointerId)) {
        el.releasePointerCapture(dragRef.current.pointerId);
      }
    } catch {}
    setIsDragging(false);
    if (wasDragRef.current) {
      try { localStorage.setItem(POS_KEY, JSON.stringify(fabPos)); } catch {}
    }
    dragRef.current = null;
    // NO reseteamos wasDragRef acá. Lo lee el onClick (que se
    // dispara inmediatamente después) y ahí se limpia.
  }
  function onPointerUp(e: React.PointerEvent<HTMLButtonElement>) { endDrag(e); }
  function onPointerCancel(e: React.PointerEvent<HTMLButtonElement>) { endDrag(e); }

  function onButtonClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (wasDragRef.current) {
      // Fue un drag, no un click: consumimos el evento y limpiamos
      // el flag. El reset acá es CLAVE para que el próximo click sí
      // cuente (no quede "pegado" como pasaba en el bug original).
      wasDragRef.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // jul 2026 v10.3 — FIX: además de toggle el state, llamamos
    // explícitamente al manager de Vosk para que apague el mic.
    // `switchMode("idle")` solo cambia el modo interno del
    // recognizer; el `MediaStream` y el `AudioContext` siguen
    // abiertos. Necesitamos `stop()` para liberar el mic y que
    // Chrome saque el dot rojo de la pestaña.
    const willBeActive = !wakeWordActive;
    if (!willBeActive) {
      // Vamos a apagar.
      const m = getVoskManager();
      if (m.isMode("wake")) {
        // eslint-disable-next-line no-console
        console.log("[jarvis] click → apagando manager (stop completo)");
        void m.stop();
      }
    }
    // eslint-disable-next-line no-console
    console.log("[jarvis] button click, wakeWordActive=", wakeWordActive, "->", willBeActive);
    setWakeWordActive(willBeActive);
  }

  if (!canUseAssistant) return null;
  if (typeof document === "undefined") return null;

  // ── Estado visual ────────────────────────────────────────────────
  type Visual = "unsupported" | "error" | "loading" | "listening" | "off";
  let visual: Visual = "off";
  if (!wakeWord.supported) visual = "unsupported";
  else if (wakeWord.error) visual = "error";
  else if (wakeWord.isLoading) visual = "loading";
  else if (wakeWord.isListening) visual = "listening";

  // Clases de Tailwind por estado visual.
  // Light theme: bordes y fondos claros. Dark theme: `dark:` prefix.
  const VISUAL_CLASSES: Record<Visual, string> = {
    unsupported:
      "border-gray-300 bg-gray-100 text-gray-500 " +
      "dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400",
    error:
      "border-red-300 bg-red-50 text-red-700 hover:bg-red-100 " +
      "dark:border-red-500/50 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60",
    loading:
      "border-amber-300 bg-amber-50 text-amber-800 " +
      "dark:border-amber-500/50 dark:bg-amber-900/40 dark:text-amber-300",
    listening:
      // Violeta fuerte en ambos temas — indica "escuchando".
      "border-violet-400 bg-violet-600 text-white shadow-violet-500/30 hover:bg-violet-700 " +
      "dark:border-violet-400 dark:bg-violet-600 dark:hover:bg-violet-700",
    off:
      // Light: blanco con borde violeta claro. Dark: gris-oscuro con borde violeta.
      "border-violet-300 bg-white text-violet-700 hover:bg-violet-50 " +
      "dark:border-violet-500/50 dark:bg-gray-900/95 dark:text-violet-200 dark:hover:bg-violet-500/20",
  };

  const ICON: Record<Visual, React.ReactNode> = {
    unsupported: <MicOff size={14} />,
    error:       <AlertTriangle size={14} />,
    loading:     <Loader2 size={14} className="animate-spin" />,
    listening: (
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
      </span>
    ),
    off:         <Mic size={14} />,
  };

  const LABEL: Record<Visual, string> = {
    unsupported: "Wake word no soportado",
    error:       `Reintentar${wakeWord.error ? ` (${wakeMem(wakeWord.error)})` : ""}`,
    loading:     "Cargando modelo…",
    listening:   `Di "${TRIGGER_DEFAULT}"`,
    off:         "Activar escucha",
  };

  return (
    <button
      type="button"
      data-visual={visual}
      data-testid="jarvis-wakeword-btn"
      // Estilos en línea solo para la posición (porque depende de fabPos
      // y de los constraints del viewport).
      style={{
        position: "fixed",
        left: `${fabPos.x}px`,
        top: `${fabPos.y}px`,
        zIndex: 50,
        userSelect: isDragging ? "none" : "auto",
        touchAction: "none",
      }}
      className={
        `inline-flex items-center gap-2 rounded-full border-2 ` +
        `px-4 py-2 text-sm font-bold shadow-lg backdrop-blur transition ` +
        `${isDragging ? "cursor-grabbing scale-105 shadow-2xl " : "cursor-grab "}` +
        VISUAL_CLASSES[visual]
      }
      onClick={onButtonClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      title={
        wakeWord.error
          ? `Error: ${wakeWord.error}`
          : wakeWord.isListening
            ? `Escuchando — decí "${TRIGGER_DEFAULT}" para invocarlo. Click para apagar, arrastrá para mover.`
            : 'Click para activar el wake word. Arrastrá para mover.'
      }
    >
      {ICON[visual]}
      {LABEL[visual]}
    </button>
  );
}

// Truncar el mensaje de error a 30 chars para que no rompa el layout
// del botón.
function wakeMem(s: string): string {
  return s.length > 30 ? s.slice(0, 27) + "..." : s;
}
