// components/ui/ScreenTransitionOverlay.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Transición de "teletransporte" a pantalla completa (estilo videojuego):
//   1. Un círculo oscuro crece desde el centro hasta tapar toda la pantalla.
//   2. A mitad del efecto se navega al nuevo panel (todo sigue oscuro).
//   3. El círculo encoge y "se abre" revelando el nuevo dashboard.
// ─────────────────────────────────────────────────────────────────────────────

import { AnimatePresence, motion } from "framer-motion";

interface ScreenTransitionOverlayProps {
  open: boolean;
  /** Texto breve que acompaña la transición. */
  label?: string | null;
}

const TOTAL_MS = 1.6;
const TIMES    = [0, 0.25, 0.75, 1]; // cierra → espera oscuro → abre

export function ScreenTransitionOverlay({ open, label }: ScreenTransitionOverlayProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[200] overflow-hidden">
          {/* Círculo oscuro centrado. A escala 0 es un punto; a escala 1
              (200vw×200vh) cubre toda la pantalla. */}
          <motion.div
            className="absolute h-[200vh] w-[200vw] rounded-full bg-gray-950 dark:bg-black"
            style={{ left: "50%", top: "50%" }}
            initial={false}
            animate={{ x: "-50%", y: "-50%", scale: [0, 1, 1, 0] }}
            transition={{ duration: TOTAL_MS, times: TIMES, ease: "easeInOut" }}
          />

          {/* Spinner + label durante el oscurecimiento */}
          <motion.div
            className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-8 text-center"
            initial={false}
            animate={{ opacity: [0, 1, 1, 0] }}
            transition={{ duration: TOTAL_MS, times: TIMES }}
          >
            <span className="h-10 w-10 rounded-full border-2 border-white/20 border-t-white animate-spin" />
            {label && (
              <p className="max-w-xs text-sm font-medium text-white/70">{label}</p>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
