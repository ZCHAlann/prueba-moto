// hooks/useVoiceStt.ts
// ─────────────────────────────────────────────────────────────────────────────
// Hook que hace STT local con Vosk, usando el VoskManager compartido.
//
// Comportamiento:
//   1. Al activarse, llama manager.switchMode('stt').
//   2. Escucha los eventos del manager:
//      - 'stt:partial' → emite onPartial(text) para feedback en vivo.
//      - 'stt:result'  → emite onResult(text) cuando hay texto final.
//      - 'stt:silence' → silencio detectado → emite onSilence() y se apaga.
//      - 'stt:timeout' → pasaron 30s → emite onTimeout() y se apaga.
//      - 'error'       → emite el error.
//   3. Al desactivarse, llama manager.switchMode('idle') para liberar.
//
// IMPORTANTE: este hook NO inicia el mic ni carga el modelo. Eso lo
// hace el VoskManager la primera vez que alguien llama manager.start().
// Este hook solo cambia el modo del recognizer.
//
// USO típico:
//   const { activate, deactivate, isListening } = useVoiceStt({
//     onResult: (text) => { ... mandar al backend ... },
//     onPartial: (text) => { ... mostrar transcripción en vivo ... },
//   });
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { getVoskManager } from "../lib/voskManager";

export interface UseVoiceSttOptions {
  onResult:  (text: string) => void;
  onPartial?: (text: string) => void;
  onSilence?: () => void;
  onTimeout?: () => void;
  onError?:   (err: Error) => void;
}

export interface UseVoiceSttResult {
  activate:     () => Promise<void>;
  deactivate:   () => void;
  isListening:  boolean;
  error:        string | null;
}

export function useVoiceStt(opts: UseVoiceSttOptions): UseVoiceSttResult {
  const { onResult, onPartial, onSilence, onTimeout, onError } = opts;

  const [isListening, setIsListening] = useState<boolean>(false);
  const [error, setError]             = useState<string | null>(null);

  // Refs para que los handlers internos siempre vean las últimas
  // callbacks sin re-suscribirse en cada render.
  const onResultRef  = useRef(onResult);
  const onPartialRef = useRef(onPartial);
  const onSilenceRef = useRef(onSilence);
  const onTimeoutRef = useRef(onTimeout);
  const onErrorRef   = useRef(onError);
  const managerRef   = useRef(getVoskManager());

  useEffect(() => { onResultRef.current  = onResult;  }, [onResult]);
  useEffect(() => { onPartialRef.current = onPartial; }, [onPartial]);
  useEffect(() => { onSilenceRef.current = onSilence; }, [onSilence]);
  useEffect(() => { onTimeoutRef.current = onTimeout; }, [onTimeout]);
  useEffect(() => { onErrorRef.current   = onError;   }, [onError]);

  // Suscribirse a los eventos del manager. Lo hacemos UNA vez al mount.
  useEffect(() => {
    const m = managerRef.current;
    const onPartialEvt = (text: string) => onPartialRef.current?.(text);
    const onResultEvt  = (text: string) => onResultRef.current(text);
    const onSilenceEvt = () => onSilenceRef.current?.();
    const onTimeoutEvt = () => onTimeoutRef.current?.();
    const onErrorEvt   = (err: Error) => {
      setError(err.message);
      onErrorRef.current?.(err);
    };
    const onModeEvt = (mode: string) => {
      setIsListening(mode === "stt");
    };
    m.on("stt:partial", onPartialEvt);
    m.on("stt:result",  onResultEvt);
    m.on("stt:silence", onSilenceEvt);
    m.on("stt:timeout", onTimeoutEvt);
    m.on("error",       onErrorEvt);
    m.on("mode",        onModeEvt);
    return () => {
      m.off("stt:partial", onPartialEvt);
      m.off("stt:result",  onResultEvt);
      m.off("stt:silence", onSilenceEvt);
      m.off("stt:timeout", onTimeoutEvt);
      m.off("error",       onErrorEvt);
      m.off("mode",        onModeEvt);
    };
  }, []);

  const activate = useCallback(async () => {
    setError(null);
    const m = managerRef.current;
    try {
      // Si el manager nunca arrancó (caso borde: el wake word aún
      // no se activó), start() lo inicializa en modo 'stt'. Si ya
      // estaba en 'wake' (caso normal: vino del wake word), switchMode
      // lo cambia a 'stt'.
      await m.start({ mode: "stt" });
      if (m.getMode() === "idle") {
        // start ya había corrido con otro modo. Forzamos el switch.
        m.switchMode("stt");
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err.message);
      onErrorRef.current?.(err);
    }
  }, []);

  const deactivate = useCallback(() => {
    const m = managerRef.current;
    if (m.isMode("stt")) m.switchMode("idle");
  }, []);

  return { activate, deactivate, isListening, error };
}
