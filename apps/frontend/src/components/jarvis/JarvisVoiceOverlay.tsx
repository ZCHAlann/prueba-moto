// components/jarvis/JarvisVoiceOverlay.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Overlay estilo Siri para el flujo de voz del Asistente IA (jul 2026 v8.6).
//
// FLUJO:
//   1. El JarvisWakeWordController dispatchea `jarvis:wake-detected`
//      cuando Vosk matchea "jarvis".
//   2. Este overlay escucha el evento y:
//      a. Aparece con animación desde la esquina inferior derecha.
//      b. Reproduce saludo TTS ("Hola, en qué te puedo ayudar").
//      c. Activa el useVoiceStt (Vosk transcribe la pregunta del user).
//      d. Muestra la transcripción en vivo con la onda animada.
//      e. Cuando hay transcript, manda al backend con __skipStt=1
//         (saltamos Whisper porque Vosk ya transcribió).
//      f. Muestra la respuesta del LLM.
//      g. Reproduce el TTS. **Las ondas se animan al ritmo del TTS
//         en tiempo real usando un AnalyserNode del <audio> element.**
//      h. Vuelve a idle (esperando próxima pregunta).
//   3. Auto-cierre 10s después de inactividad, o si el user hace click
//      en la X.
//
// UBICACIÓN:
//   Se monta en AppLayout al lado del JarvisWakeWordController, NO
//   dentro del FloatingChatWidget. Así aparece aunque el chat esté
//   cerrado y el user esté trabajando en cualquier módulo.
//
// NO REEMPLAZA el chat: el botón violeta del FloatingChatWidget sigue
// funcionando como hasta ahora (MediaRecorder + Whisper).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useVoiceStt } from "../../hooks/useVoiceStt";
import { getVoskManager } from "../../lib/voskManager";
import { normalizeVoiceText } from "../../lib/voiceTextNormalizer";

type OverlayState =
  | "hidden"        // overlay cerrado
  | "greeting"      // saludo TTS sonando
  | "listening"     // STT activo, esperando voz
  | "processing"    // mandamos al backend, esperando respuesta
  | "speaking"      // TTS de la respuesta sonando
  | "awaiting"      // (jul 2026 v8.6) TTS terminó, esperando que el user
                    // siga hablando (modo conversación multi-turn).
                    // El STT se re-activa automáticamente; si pasan
                    // 6s sin habla, pasamos a done y auto-hide.
  | "done";         // cerrando, auto-hide programado

const SALUDO_TEXT = "Hola, en qué te puedo ayudar";
const GREETING_DURATION_MS = 2500;
const AUTO_HIDE_AFTER_DONE_MS = 3_000; // jul 2026 v8.6 — antes 10s, demasiado
                                          // largo. El user quiere volver a
                                          // hablar pronto. 3s le da tiempo
                                          // de leer la respuesta y luego
                                          // rearma el wake word.

export function JarvisVoiceOverlay() {
  const { session, companyId } = useAuth();

  const canUseAssistant =
    !!session &&
    !!companyId &&
    (session.role === "admin_empresa" || session.role === "owner_empresa") &&
    (session.companyModules ?? []).includes("jarvis");

  const [state, setState]         = useState<OverlayState>("hidden");
  const [partial, setPartial]     = useState<string>("");
  const [finalText, setFinalText] = useState<string>("");
  const [answer, setAnswer]       = useState<string>("");
  const [error, setError]         = useState<string | null>(null);
  const [voiceId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("jarvis.tts.voice") || "";
  });

  // ── Refs ──────────────────────────────────────────────────────────
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoHideTimerRef = useRef<number | null>(null);
  // (jul 2026 v8.6) Historial de la conversación de voz. Se
  // acumula en memoria (NO se persiste) y se manda en cada
  // request al backend para que el LLM tenga contexto multi-turn.
  // Estructura: [{ role: 'user' | 'assistant', content: string }].
  const historyRef = useRef<Array<{ role: "user" | "assistant"; content: string }>>([]);
  /** RMS por barra, refrescado por el AnalyserNode del <audio> TTS
   *  o por la animación CSS. Lo leemos desde el componente VoiceWave. */
  const levelsRef = useRef<number[]>(new Array(20).fill(0));
  const [, forceLevels] = useState(0);

  // ── STT (Vosk local) ─────────────────────────────────────────────
  //
  // (jul 2026 v8.6) El flow de "silencio → mandar al backend" se
  // maneja desde onSilence directamente, no desde un useEffect
  // dependiente de finalText. Razón: si Vosk emite el mismo texto
  // dos veces (uno como `result` y otro como `stt:result` del
  // finalizeStt), React no re-renderiza y el useEffect no se
  // dispara. Pero onSilence se ejecuta una sola vez y podemos
  // gatillar el envío ahí sin ambigüedad.
  const stt = useVoiceStt({
    onResult: (text) => {
      setFinalText(text);
      setPartial("");
    },
    onPartial: (text) => {
      setPartial(text);
    },
    onSilence: () => {
      stt.deactivate();
      // (jul 2026 v8.6) El silencio se detectó. En este momento
      // finalText YA tiene el último texto (Vosk emitió result
      // antes del silence, o el partial acumulado). Mandamos al
      // backend directamente desde acá, sin esperar al useEffect.
      // Usamos un microtask para asegurar que setFinalText se
      // haya commiteado.
      queueMicrotask(() => {
        // Leemos finalText y partial del closure actual. Si el
        // último result fue vacío (caso borde), usamos el partial.
        const raw = (typeof finalText === "string" && finalText.trim())
          ? finalText
          : partial;
        if (raw && raw.trim()) {
          // (jul 2026 v8.6) Normalizamos el texto antes de mandar
          // al backend. Vosk transcribe "abm cuatro seis seis dos"
          // en vez de "abm-4662", y "mil doscientos" en vez de
          // "1200". El normalizador arregla eso para que el LLM
          // pueda matchear placas y números reales.
          const normalized = normalizeVoiceText(raw);
          void sendToBackend(normalized);
          return;
        }
        // Sin texto. Esto pasa en dos casos:
        //   1. Primer wake word → saludo → user no habló nada (raro,
        //      el STT startup wait ya cerró a los 8s).
        //   2. Estado `awaiting` después de TTS → el user no siguió
        //      hablando, hay que cerrar el flujo.
        setState("done");
        scheduleAutoHide();
      });
    },
    onError: (err) => {
      setError(err.message);
      setState("done");
    },
  });

  // (jul 2026 v8.6) El envío al backend se hace desde onSilence del
  // useVoiceStt (más arriba), no desde un useEffect. Razón: si el
  // último texto de Vosk es el mismo que el anterior, React no
  // re-renderiza y el useEffect no se dispara, pero el silencio
  // sí se detecta. onSilence es la única señal inequívoca de
  // "el user terminó de hablar".

  // ── Análisis del TTS en tiempo real ───────────────────────────────
  // (jul 2026 v8.6) Conectamos un AnalyserNode al <audio> element del
  // TTS para que las ondas se muevan AL RITMO de la voz del asistente
  // (no con una animación CSS genérica).
  useEffect(() => {
    if (state !== "speaking") {
      // Reset levels cuando no estamos hablando.
      levelsRef.current = new Array(20).fill(0);
      forceLevels(n => n + 1);
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;

    let raf = 0;
    let cancelled = false;
    let analyser: AnalyserNode | null = null;
    let dataArray: Uint8Array | null = null;
    let audioCtx: AudioContext | null = null;

    const setup = () => {
      try {
        const AudioContextClass: typeof AudioContext =
          (window as any).AudioContext || (window as any).webkitAudioContext;
        audioCtx = new AudioContextClass();
        // createMediaElementSource crea un nodo que podemos analizar.
        // OJO: solo se puede llamar UNA vez por <audio> element. Si
        // ya se creó (caso HMR), lo reusamos vía un try/catch.
        // @ts-ignore — propiedad interna, la cacheamos en el audio
        const cached: any = (audio as any).__analyserCtx;
        let source: MediaElementAudioSourceNode;
        if (cached) {
          audioCtx = cached.ctx;
          source = cached.source;
          analyser = cached.analyser;
          dataArray = cached.dataArray;
        } else {
          source = audioCtx.createMediaElementSource(audio);
          analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          analyser.smoothingTimeConstant = 0.5;
          source.connect(analyser);
          analyser.connect(audioCtx.destination);
          dataArray = new Uint8Array(analyser.frequencyBinCount);
          (audio as any).__analyserCtx = { ctx: audioCtx, source, analyser, dataArray };
        }
      } catch {
        // No se pudo crear el analyser — caemos a la animación CSS.
        return;
      }

      const tick = () => {
        if (cancelled || !analyser || !dataArray) return;
        analyser.getByteFrequencyData(dataArray as any);
        // Tomamos 20 bins equiespaciados (saltamos los primeros 2 que
        // son DC + ruido muy bajo). Cada nivel va de 0..1.
        const N = 20;
        const skip = 2;
        const usable = dataArray.length - skip;
        const step = Math.max(1, Math.floor(usable / N));
        const out: number[] = new Array(N);
        for (let i = 0; i < N; i++) {
          const v = dataArray[Math.min(dataArray.length - 1, skip + i * step)] / 255;
          out[i] = Math.pow(v, 0.6); // gamma para que se vea más vivo
        }
        levelsRef.current = out;
        forceLevels(n => (n + 1) & 0xffff);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    // El audio tarda unos ms en empezar. Esperamos al primer evento.
    if (audio.readyState >= 2) {
      setup();
    } else {
      audio.addEventListener("canplay", setup, { once: true });
    }

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      // NO cerramos audioCtx — puede reusarse entre reproducciones.
    };
  }, [state]);

  // ── Análisis del mic durante el STT (efecto extra) ────────────────
  // (jul 2026 v8.6) Cuando estamos escuchando, también analizamos el
  // AudioContext del mic (que ya tiene el manager corriendo) y
  // actualizamos levelsRef. Eso le da "vida" a las ondas al hablar.
  // Lo conectamos al estado del manager vía un setInterval.
  useEffect(() => {
    if (state !== "listening") return;
    const m = getVoskManager();
    // El manager expone `audioCtx` internamente pero no público.
    // Truco: Vosk NO procesa audio hasta que hay recognizer activo.
    // Como nosotros SÍ tenemos recognizer stt activo, podemos
    // acceder al audioCtx vía un canal ad-hoc.
    // (Lo más simple: animamos con CSS random mientras listening.)
    // Para evitar meter complejidad, usamos solo animación CSS en
    // listening y analyser real en speaking. La animación CSS ya
    // tiene variación random por barra.
    void m;
  }, [state]);

  // ── TTS saludo ────────────────────────────────────────────────────
  const playGreeting = useCallback(async () => {
    setState("greeting");
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setState("listening");
      await stt.activate();
      return;
    }
    return new Promise<void>((resolve) => {
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(SALUDO_TEXT);
        u.lang = "es-ES";
        u.rate = 1.0;
        u.volume = 1.0;
        u.onend   = () => { resolve(); };
        u.onerror = () => { resolve(); };
        window.speechSynthesis.speak(u);
      } catch {
        resolve();
      }
    });
  }, [stt]);

  const playAnswerTts = useCallback(async (audioBase64: string, mime: string) => {
    if (!audioBase64) return;
    try {
      const bin = atob(audioBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: mime || "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        // (jul 2026 v8.6) El TTS terminó. NO cerramos el overlay.
        // Pasamos a `awaiting` y re-activamos el STT para que el
        // user pueda seguir hablando sin volver a decir "jarvis".
        // Si pasan 6s sin que hable, el timeout del STT (startup
        // wait) cierra el flujo y va a done.
        setState("awaiting");
        setPartial("");
        setFinalText("");
        // Re-activar el STT (sin pasar por wake word). El manager
        // ya está cargado, así que es rápido.
        void stt.activate();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setState("done");
        scheduleAutoHide();
      };
      await audio.play();
    } catch {
      setState("done");
      scheduleAutoHide();
    }
  }, []);

  // ── Backend ───────────────────────────────────────────────────────
  const sendToBackend = useCallback(async (text: string) => {
    if (!companyId) return;
    setState("processing");
    setAnswer("");
    setError(null);

    // (jul 2026 v8.6) Acumulamos la pregunta actual al historial.
    // El backend lo va a usar para darle contexto multi-turn al LLM
    // (sin persistir). NO incluimos el `text` actual en el history
    // porque el backend lo agrega como el último user message.
    historyRef.current.push({ role: "user", content: text });
    // Trim por si el user habla 50 veces (evitar payload gigante).
    if (historyRef.current.length > 16) {
      historyRef.current = historyRef.current.slice(-16);
    }

    const fd = new FormData();
    fd.append("text", text);
    if (voiceId) fd.append("voice", voiceId);
    // (jul 2026 v8.6) Modo ephemeral: mandamos el historial acumulado
    // (sin la pregunta actual, que se manda en `text` arriba y el
    // backend la agrega al final). El backend NO persiste.
    fd.append("history", JSON.stringify(historyRef.current.slice(0, -1)));
    fd.append("audio", new Blob([new Uint8Array(0)], { type: "audio/webm" }), "empty.webm");

    try {
      const res = await fetch(
        `/api/company/${companyId}/ai/voice?__skipStt=1`,
        { method: "POST", body: fd, credentials: "include" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const ans: string = data?.answer ?? "";
      const audioB64: string | null = data?.audioBase64 ?? null;
      const audioMime: string | null = data?.audioMime ?? null;
      // (jul 2026 v8.6) Acumulamos la respuesta del assistant al
      // historial (en memoria) para que la próxima pregunta tenga
      // contexto multi-turn. NO se persiste en la DB.
      if (ans) historyRef.current.push({ role: "assistant", content: ans });
      // (jul 2026 v8.6) Modo ephemeral: ignoramos el conversationId.
      // El backend devuelve null o string vacío. NO persistimos nada.
      setAnswer(ans);

      if (audioB64 && audioMime) {
        setState("speaking");
        await playAnswerTts(audioB64, audioMime);
      } else {
        setState("done");
        scheduleAutoHide();
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err.message);
      setState("done");
      scheduleAutoHide();
    }
  }, [companyId, voiceId, playAnswerTts]);

  // ── Auto-hide ──────────────────────────────────────────────────────
  const scheduleAutoHide = useCallback(() => {
    if (autoHideTimerRef.current !== null) {
      window.clearTimeout(autoHideTimerRef.current);
    }
    // (jul 2026 v8.6) Re-armamos el wake word YA (no esperamos a
    // hide()). Así, si el user quiere volver a hablar antes de que
    // se cierre el overlay, el wake word ya está activo. Si el
    // manager está en idle, switchMode lo cambia a wake (crea un
    // recognizer nuevo). Si está en otro modo (stt, error), no
    // hacemos nada y que el hide() se encargue.
    const m = getVoskManager();
    if (m.getMode() === "idle") {
      try {
        const r = m.switchMode("wake");
        if (r && typeof (r as any).catch === "function") {
          (r as any).catch(() => {});
        }
      } catch { /* noop */ }
    }
    autoHideTimerRef.current = window.setTimeout(() => {
      hide();
    }, AUTO_HIDE_AFTER_DONE_MS);
  }, []);

  const hide = useCallback(() => {
    setState("hidden");
    setPartial("");
    setFinalText("");
    setAnswer("");
    setError(null);
    if (autoHideTimerRef.current !== null) {
      window.clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = null;
    }
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch {}
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    stt.deactivate();
    const m = getVoskManager();
    if (m.getMode() === "idle") {
      // (jul 2026 v8.6) switchMode puede devolver undefined si el
      // modo no cambió (caso idempotente), así que NO encadenamos
      // .catch() directamente.
      try {
        const r = m.switchMode("wake");
        if (r && typeof (r as any).catch === "function") {
          (r as any).catch(() => {});
        }
      } catch { /* noop */ }
    }
  }, [stt]);

  // ── Listener del wake word ────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!canUseAssistant) return;

    const handler = (_e: Event) => {
      setError(null);
      setPartial("");
      setFinalText("");
      setAnswer("");

      void (async () => {
        await playGreeting();
        setState("listening");
        await stt.activate();
      })();
    };
    window.addEventListener("jarvis:wake-detected", handler);
    return () => window.removeEventListener("jarvis:wake-detected", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUseAssistant]);

  if (state === "hidden") return null;

  return (
    <div
      className="fixed left-1/2 top-3 z-[60] -translate-x-1/2 animate-in slide-in-from-top-4 fade-in duration-300"
      role="dialog"
      aria-label="Asistente IA"
    >
      <div
        className="relative flex items-center gap-3 overflow-hidden rounded-full border border-white/10 bg-black/70 px-5 py-2.5 shadow-2xl backdrop-blur-2xl"
        style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.05)" }}
      >
        {/* Onda central (la Dynamic Island SOLO muestra las ondas) */}
        <div className="flex h-7 items-center">
          <VoiceWave
            state={state}
            partial={partial}
            levels={levelsRef.current}
          />
        </div>

        {/* Botón X a la derecha (discreto) */}
        <button
          type="button"
          onClick={hide}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white"
          aria-label="Cerrar"
        >
          <X size={11} />
        </button>
      </div>
    </div>
  );
}

// ─── VoiceWave — 20 barras ──────────────────────────────────────────
// Reglas (jul 2026 v8.6):
//   - speaking (TTS reproduciéndose) → bars verdes al ritmo del
//     AnalyserNode del <audio>. heights reales del FFT.
//   - listening CON parcial de Vosk → bars violeta con animación
//     suave (está transcribiendo algo en vivo, "se ve" que escucha).
//   - listening SIN parcial → bars violeta PLANAS, quietas. El user
//     tiene que sentir que el sistema está esperando, no que está
//     reaccionando a ruido.
//   - processing → bars ámbar planas (o animación lenta, esperando
//     respuesta del LLM).
//   - greeting / done → bars tenues, casi planas.
// ────────────────────────────────────────────────────────────────────

function VoiceWave({
  state, partial, levels,
}: {
  state: OverlayState;
  partial: string;
  levels: number[];
}) {
  const BARS = 20;
  const useRealtime = state === "speaking";
  const hasPartial = state === "listening" && partial.length > 0;
  return (
    <div className="flex h-12 w-full items-center justify-center gap-[3px]">
      {Array.from({ length: BARS }, (_, i) => {
        let height: number;
        let animClass: string | undefined;
        let color: string;

        if (useRealtime) {
          // TTS: heights del AnalyserNode.
          const v = levels[i] ?? 0;
          height = 4 + v * 36; // 4..40 px
          color = "bg-emerald-400";
          animClass = undefined;
        } else if (hasPartial) {
          // Listening CON texto parcial: animación suave, heights random.
          const baseHeight = 6 + Math.abs(Math.sin(i * 0.7 + 1.3)) * 14;
          const duration = 0.5 + (i % 4) * 0.18;
          const delay = (i * 0.07) % 1;
          height = baseHeight;
          color = "bg-violet-300";
          animClass = `voice-bar ${duration}s ease-in-out ${delay}s infinite alternate`;
        } else if (state === "greeting") {
          // Saludo sonando: animación media.
          const baseHeight = 6 + Math.abs(Math.sin(i * 0.7 + 1.3)) * 14;
          const duration = 0.6 + (i % 4) * 0.18;
          const delay = (i * 0.07) % 1;
          height = baseHeight;
          color = "bg-violet-300";
          animClass = `voice-bar ${duration}s ease-in-out ${delay}s infinite alternate`;
        } else {
          // listening SIN parcial / processing / done → PLANAS, quietas.
          height = 6;
          animClass = undefined;
          if (state === "listening")       color = "bg-violet-500/50";
          else if (state === "processing") color = "bg-amber-500/50";
          else                             color = "bg-white/30";
        }
        return (
          <div
            key={i}
            className={`w-[3px] rounded-full ${color} transition-all`}
            style={{
              height: `${height}px`,
              animation: animClass,
            }}
          />
        );
      })}
      {/* partial no se usa acá pero lo dejamos para extensibilidad */}
      <span className="hidden">{partial}</span>
    </div>
  );
}

// (jul 2026 v8.6) — StateLine eliminado. La UI ahora es solo
// ondas (estilo Mac Dynamic Island), sin texto debajo.
