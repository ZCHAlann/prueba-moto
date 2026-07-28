// hooks/useWakeWord.ts
// ─────────────────────────────────────────────────────────────────────────────
// Hook de wake word que usa el VoskManager compartido (lib/voskManager.ts).
//
// API (compatible con la versión vieja):
//   useWakeWord({ keyword, threshold, cooldownMs, onTrigger, armed })
//   → { supported, error, isLoading, isListening, lastScore }
//
// CAMBIO IMPORTANTE (jul 2026 v8.6):
//   Este hook YA NO hace STT. Solo se encarga del wake word.
//   El STT lo hace el JarvisVoiceOverlay usando el mismo VoskManager
//   (compartido: mismo modelo, mismo mic, mismo AudioContext). Cuando
//   el wake word dispara, el hook apaga el modo 'wake' para que el
//   overlay pueda switcheear a 'stt' sin chocar con el wake word.
//
//   Esto resuelve el bug clásico de "wake word se confunde con el
//   STT" — un solo recognizer activo a la vez.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { getVoskManager, VoskMode } from "../lib/voskManager";

export interface UseWakeWordOptions {
  keyword: string;          // legacy — no se usa directamente, el manager tiene hardcoded "jarvis"
  threshold?: number;       // 0..1, ignorado (Vosk matchea por texto)
  cooldownMs?: number;      // tiempo mínimo entre triggers
  onTrigger: () => void;
  armed: boolean;           // ¿debe estar escuchando?
}

export interface UseWakeWordResult {
  supported: boolean;
  error: string | null;
  isLoading: boolean;
  isListening: boolean;
  lastScore: number;
}

export function useWakeWord(opts: UseWakeWordOptions): UseWakeWordResult {
  const {
    cooldownMs = 2000,
    onTrigger,
    armed,
  } = opts;

  const [supported, setSupported] = useState<boolean>(true);
  const [error, setError]                     = useState<string | null>(null);
  const [isLoading, setIsLoading]             = useState<boolean>(false);
  const [isListening, setIsListening]         = useState<boolean>(false);
  const [lastScore, setLastScore]             = useState<number>(0);

  const onTriggerRef = useRef(onTrigger);
  const cooldownRef  = useRef<number>(0);
  const managerRef   = useRef(getVoskManager());
  // jul 2026 v8.6 — counter para forzar re-mount del effect sin tocar `armed`.
  const [rearmCounter, setRearmCounter] = useState<number>(0);

  useEffect(() => { onTriggerRef.current = onTrigger; }, [onTrigger]);

  useEffect(() => {
    // Detección de soporte
    if (typeof window === "undefined") {
      setSupported(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setSupported(false);
      setError("Tu navegador no expone getUserMedia (micrófono).");
      return;
    }
    if (typeof AudioContext === "undefined" && typeof (window as any).webkitAudioContext === "undefined") {
      setSupported(false);
      setError("Tu navegador no expone Web Audio API.");
      return;
    }
    setSupported(true);

    if (!armed) {
      // No armado. Si el manager está en wake, lo apagamos.
      const m = managerRef.current;
      if (m.isMode("wake")) m.switchMode("idle");
      setIsListening(false);
      return;
    }

    // Armado.
    const m = managerRef.current;

    const onLoading = (loading: boolean) => setIsLoading(loading);
    const onError   = (err: Error) => {
      setError(err.message);
      setIsLoading(false);
      setIsListening(false);
    };
    const onMode    = (mode: VoskMode) => {
      setIsListening(mode === "wake");
    };
    const onWake    = () => {
      const now = Date.now();
      if (now - cooldownRef.current < cooldownMs) return;
      cooldownRef.current = now;
      onTriggerRef.current();
      // (jul 2026 v8.6) Apagamos el wake word. El overlay switchea
      // a STT cuando quiere (después del saludo). Re-armamos
      // automáticamente después de un rato, PERO solo si el manager
      // sigue en idle (sino el STT del overlay está corriendo y no
      // debemos pisarlo).
      m.switchMode("idle");
      const rearm = () => {
        if (m.getMode() === "idle") {
          setRearmCounter(c => c + 1);
        } else {
          // El overlay está usando el manager (STT activo). Reintentamos
          // en 1s hasta que vuelva a idle.
          window.setTimeout(rearm, 1000);
        }
      };
      window.setTimeout(rearm, 8000);
    };

    m.on("loading", onLoading);
    m.on("error",   onError);
    m.on("mode",    onMode);
    m.on("wake",    onWake);

    m.start({ mode: "wake" }).catch(err => {
      setError(err instanceof Error ? err.message : String(err));
    });

    return () => {
      m.off("loading", onLoading);
      m.off("error",   onError);
      m.off("mode",    onMode);
      m.off("wake",    onWake);
      // NO cerramos el manager acá — el overlay puede seguir usándolo.
      // Si nadie más lo usa, el overlay se encarga de llamar stop().
      if (m.isMode("wake")) m.switchMode("idle");
      setIsListening(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, cooldownMs, rearmCounter]);

  // lastScore: hoy no lo exponemos (Vosk no nos da un "score de match"
  // fácil sin deserializar el último result). Lo dejamos en 0 por compat.
  return { supported, error, isLoading, isListening, lastScore: 0 };
}
