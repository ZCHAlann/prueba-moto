// components/jarvis/JarvisWakeWordController.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Controlador INVISIBLE del wake word para el Asistente IA (Jarvis).
//
// Se monta UNA SOLA VEZ en el AppLayout (no en el FloatingChatWidget)
// para que esté vivo independientemente de:
//   - Si el chat está abierto o cerrado.
//   - Si el user está en la tab "Mensajes" o "Asistente".
//   - Si la empresa tiene el módulo `jarvis` activo (este controlador
//     es el ÚNICO responsable de mantener el mic escuchando, así que
//     debe poder correr sin depender del estado del chat).
//
// Cuando el wake word se detecta, dispara un CustomEvent global
// `jarvis:wake-detected` en `window`. El FloatingAiAssistant escucha
// este evento y, si está montado, llama a `startVoiceRecording()`.
// Si NO está montado (chat cerrado), el FloatingChatWidget lo abre
// primero y recién después dispara la grabación.
//
// jul 2026 v8.7 — Botón flotante DRAGGABLE: el user puede arrastrarlo
// a cualquier posición de la pantalla y la posición persiste entre
// recargas (localStorage). Mismo patrón que el FAB del chat.
//
// IMPORTANTE: el popup de permiso de mic del browser se dispara la
// primera vez que el user carga la app. Eso es el comportamiento
// deseado — el user concede UNA vez y queda armado para siempre.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useWakeWord } from "../../hooks/useWakeWord";

const TRIGGER_DEFAULT = "jarvis";
const PERMISSION_KEY = "jarvis.wakeword.granted";
const ACTIVE_KEY     = "jarvis.wakeword.active";
const TRIGGER_KEY    = "jarvis.wakeword.trigger";
const POS_KEY        = "jarvis.wakeword.btn.pos";
const FAB_MARGIN     = 12;   // px de margen desde el borde
const DRAG_THRESHOLD = 6;    // px de movimiento para diferenciar click de drag

function isDebug(): boolean {
  if (typeof window === "undefined") return false;
  return (window as any).__jarvisDebugWake === true;
}

function dbg(...args: unknown[]) {
  if (isDebug()) {
    void args;
  }
}

export interface JarvisWakeWordControllerProps {
  /**
   * Si está oculto (default true). El controlador no renderiza nada
   * visible — solo corre el hook. Si lo ponés en false, muestra un
   * indicador discreto en la esquina para confirmar que está vivo.
   */
  silent?: boolean;
}

export function JarvisWakeWordController({
  silent = true,
}: JarvisWakeWordControllerProps) {
  const { session, companyId } = useAuth();

  // ── Permisos: ¿puede este user usar el asistente? ─────────────────
  // Mismas reglas que `canUseAssistant` en FloatingChatWidget.
  const canUseAssistant =
    !!session &&
    !!companyId &&
    (session.role === "admin_empresa" || session.role === "owner_empresa") &&
    (session.companyModules ?? []).includes("jarvis");

  // ── Estado del wake word ─────────────────────────────────────────
  // El hook va a intentar `recognition.start()` desde un useEffect.
  // Chrome puede abortar silenciosamente si no hay user gesture, así
  // que el armado depende del permiso previo:
  //   - Si `granted=1` (ya autorizó el mic antes), Chrome permite el
  //     start desde useEffect. Armando en true automáticamente.
  //   - Si nunca autorizó (`granted` no es "1"), arranco en false y
  //     muestro el botón para que el user haga click (que es el
  //     user gesture válido para arrancar).
  const [wakeWordActive, setWakeWordActive] = useState<boolean>(() => {
    // jul 2026 v8.6 — SIEMPRE arrancamos desarmados. El primer click
    // del botón "Activar escucha" es OBLIGATORIO porque:
    //   1. Chrome requiere un user gesture válido para que el
    //      AudioContext pase de "suspended" a "running". Si el wake
    //      word se arma automáticamente desde un useEffect, el mic
    //      pide permiso pero el AudioContext queda suspended y
    //      Vosk no procesa audio (wake word no matchea nunca).
    //   2. getUserMedia también necesita un user gesture reciente
    //      para no ser bloqueado.
    // El user ya granted el permiso antes (en una sesión previa), el
    // click de hoy cuenta como user gesture válido y Chrome lo acepta.
    if (typeof window === "undefined") return false;
    return false;
  });
  const [trigger] = useState<string>(() => {
    if (typeof window === "undefined") return TRIGGER_DEFAULT;
    return localStorage.getItem(TRIGGER_KEY) || TRIGGER_DEFAULT;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem(ACTIVE_KEY, wakeWordActive ? "1" : "0"); } catch {}
  }, [wakeWordActive]);

  // ── Hook de wake word (Vosk-Browser via WASM) ──────────────────────
  // Se monta SIEMPRE que el user tenga permisos. El callback dispatcha
  // un CustomEvent global cuando detecta el wake word. Vosk hace STT
  // continuo y matchea contra el keyword con variantes fonéticas
  // específicas para español (ver useWakeWord.ts).
  const wakeWord = useWakeWord({
    keyword: "jarvis",
    threshold: 0.2,
    cooldownMs: 2000,
    onTrigger: () => {
      dbg(">>> onTrigger: dispatching window event 'jarvis:wake-detected'");
      const event = new CustomEvent("jarvis:wake-detected", {
        detail: { ts: Date.now() },
      });
      window.dispatchEvent(event);
    },
    armed: wakeWordActive && canUseAssistant,
  });

  // ── Botón grande "Activar escucha" ────────────────────────────────
  // El SpeechRecognition de Chrome exige un user gesture para arrancar.
  // Mostramos un botón VISIBLE en la esquina inferior izquierda para
  // que el user sepa que tiene que activarlo una vez. Después de la
  // primera activación, queda armado y se re-arranca solo tras cada
  // `onend`.
  //
  // El botón también funciona como "pausar" cuando ya está activo.
  const handleActivate = () => {
    dbg(">>> handleActivate click, next armed=", !wakeWordActive);
    setWakeWordActive(!wakeWordActive);
  };

  // ── Render del botón flotante ────────────────────────────────────
  // Cuatro estados visuales:
  //   - OFF (gris): no armado.
  //   - LOADING (ámbar): está cargando el modelo Vosk (~40MB la 1ra vez).
  //   - LISTENING (violeta + dot): escuchando activamente.
  //   - ERROR (rojo): algo falló (mic denied, modelo no carga, etc).
  let btnClass = "";
  let btnContent: React.ReactNode = null;
  if (!wakeWord.supported) {
    btnClass = "border-gray-300 bg-gray-100 text-gray-500";
    btnContent = (
      <>
        <MicOff size={14} />
        Wake word no soportado
      </>
    );
  } else if (wakeWord.error) {
    btnClass = "border-red-300 bg-red-50 text-red-700";
    btnContent = (
      <>
        <MicOff size={14} />
        Reintentar
      </>
    );
  } else if (wakeWord.isLoading) {
    btnClass = "border-amber-300 bg-amber-50 text-amber-800";
    btnContent = (
      <>
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
        Cargando modelos…
      </>
    );
  } else if (wakeWord.isListening) {
    btnClass = "border-violet-400 bg-violet-500 text-white shadow-violet-500/30 hover:bg-violet-600";
    btnContent = (
      <>
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
        <Mic size={14} />
        Di "Jarvis"
      </>
    );
  } else {
    btnClass = "border-violet-200 bg-white text-violet-700 hover:bg-violet-50 dark:border-violet-500/40 dark:bg-gray-900/95 dark:text-violet-200 dark:hover:bg-violet-500/20";
    btnContent = (
      <>
        <MicOff size={14} />
        Activar escucha
      </>
    );
  }

  // ── FAB draggable (jul 2026 v8.7) ───────────────────────────────────
  // Posición persistida en localStorage. El user puede arrastrar el
  // botón a cualquier posición y se queda ahí entre recargas.
  const constrainFabPos = (x: number, y: number): { x: number; y: number } => {
    if (typeof window === "undefined") return { x, y };
    // El "size" lo aproximamos en 160px ancho × 60px alto (píldora con icono + texto).
    const btnW = 200;
    const btnH = 60;
    const maxX = window.innerWidth  - btnW - FAB_MARGIN;
    const maxY = window.innerHeight - btnH - FAB_MARGIN;
    return {
      x: Math.max(FAB_MARGIN, Math.min(maxX, x)),
      y: Math.max(FAB_MARGIN, Math.min(maxY, y)),
    };
  };
  const getInitialFabPos = (): { x: number; y: number } => {
    // Default: esquina inferior izquierda, igual que antes.
    const defaultX = FAB_MARGIN;
    const defaultY = (typeof window !== "undefined" ? window.innerHeight : 600) - 60 - FAB_MARGIN;
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
  const dragRef = useRef<{
    pointerId: number;
    pointerStartX: number;
    pointerStartY: number;
    fabStartX: number;
    fabStartY: number;
    moved: boolean;
  } | null>(null);

  function onBtnPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    // No prevenimos default siempre: si solo fue un click (no drag), el
    // botón necesita disparar onClick normal.
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId:      e.pointerId,
      pointerStartX:  e.clientX,
      pointerStartY:  e.clientY,
      fabStartX:      fabPos.x,
      fabStartY:      fabPos.y,
      moved:          false,
    };
    setIsDragging(true);
  }
  function onBtnPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.pointerStartX;
    const dy = e.clientY - d.pointerStartY;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
    if (!d.moved) d.moved = true;
    e.preventDefault();
    // La posición se mide desde la esquina sup-izq, así que restamos
    // el delta (movimiento del mouse = movimiento del botón en
    // sentido contrario).
    const next = constrainFabPos(d.fabStartX + dx, d.fabStartY + dy);
    setFabPos(next);
  }
  function onBtnPointerUp(_e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d) return;
    setIsDragging(false);
    // Persistir la posición final.
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem(POS_KEY, JSON.stringify(fabPos));
      }
    } catch {}
    dragRef.current = null;
  }

  return (
    <div
      className={`fixed z-50 flex flex-col items-start gap-2 ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
      style={{
        left:    `${fabPos.x}px`,
        top:     `${fabPos.y}px`,
        // Mientras arrastramos, evitamos que el browser haga text
        // selection u otras cosas raras. Después del drag, vuelve a auto.
        userSelect:    isDragging ? "none" : "auto",
        touchAction:   "none", // pointer events, no scroll
      }}
      onPointerDown={onBtnPointerDown}
      onPointerMove={onBtnPointerMove}
      onPointerUp={onBtnPointerUp}
      onPointerCancel={onBtnPointerUp}
    >
      <button
        type="button"
        // Solo actuamos como click si NO hubo drag. Si hubo drag, el click
        // no hace nada (el user quería mover, no activar).
        onClick={(e) => {
          if (dragRef.current?.moved) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          handleActivate();
        }}
        className={
          "inline-flex items-center gap-2 rounded-full border-2 px-4 py-2 text-sm font-bold shadow-lg backdrop-blur transition " +
          btnClass +
          (isDragging ? " scale-105 shadow-2xl" : "")
        }
        title={
          wakeWord.error
            ? `Error: ${wakeWord.error}`
            : wakeWord.isListening
              ? "Escuchando — Di 'Jarvis' para invocar a Jarvis"
              : "Click para activar el wake word. Arrastrá para moverlo."
        }
      >
        {btnContent}
      </button>
      {/* Debug: último score. */}
      {wakeWord.isListening && wakeWord.lastScore > 0 && (
        <div className="rounded-lg border border-violet-200 bg-white/90 px-2.5 py-1 text-[10px] text-violet-700 shadow-sm backdrop-blur dark:border-violet-500/40 dark:bg-gray-900/90 dark:text-violet-200">
          score: {wakeWord.lastScore.toFixed(2)}
        </div>
      )}
    </div>
  );
}
