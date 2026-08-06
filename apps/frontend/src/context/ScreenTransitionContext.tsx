// context/ScreenTransitionContext.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Proveedor global de la transición de pantalla (círculo que oscurece y se
// abre). Vive por encima del <Router> para que el overlay NO se desmonte
// cuando la navegación cambia de layout (plataforma ↔ operación). El widget
// de impersonación y el banner de "volver" llaman a
// `transition({ label, navigate })`: arranca el efecto, navega en el
// instante de pantalla oscura y oculta el overlay al abrirse.
// ─────────────────────────────────────────────────────────────────────────────

import {
  createContext, useCallback, useContext, useRef, useState, type ReactNode,
} from "react";
import { ScreenTransitionOverlay } from "../components/ui/ScreenTransitionOverlay";

interface TransitionOptions {
  /** Texto que acompaña la transición. */
  label?: string;
  /** Callback que se ejecuta en el momento de pantalla oscura (cuando la
   *  nueva pantalla debe reemplazar a la anterior). */
  navigate: () => void;
}

type ScreenTransitionContextValue = { transition: (opts: TransitionOptions) => void };

const ScreenTransitionContext = createContext<ScreenTransitionContextValue | null>(null);

// El overlay dura 1.6s. Navegamos a los 600ms (pantalla totalmente oscura,
// ventana 400ms–1200ms) y lo ocultamos a los 1650ms (la animación ya
// terminó con el círculo en escala 0, invisible).
const NAVIGATE_AT_MS = 600;
const HIDE_AT_MS    = 1650;

export function ScreenTransitionProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const timersRef = useRef<number[]>([]);

  const transition = useCallback((opts: TransitionOptions) => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
    setLabel(opts.label ?? null);
    setOpen(true);
    timersRef.current = [
      window.setTimeout(() => opts.navigate(), NAVIGATE_AT_MS),
      window.setTimeout(() => {
        setOpen(false);
        setLabel(null);
      }, HIDE_AT_MS),
    ];
  }, []);

  return (
    <ScreenTransitionContext.Provider value={{ transition }}>
      {children}
      <ScreenTransitionOverlay open={open} label={label} />
    </ScreenTransitionContext.Provider>
  );
}

export function useScreenTransition() {
  const ctx = useContext(ScreenTransitionContext);
  if (!ctx) throw new Error("useScreenTransition must be used within ScreenTransitionProvider");
  return ctx;
}
