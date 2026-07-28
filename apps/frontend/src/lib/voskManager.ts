// lib/voskManager.ts
// ─────────────────────────────────────────────────────────────────────────────
// Manager compartido de Vosk para wake word + STT en el frontend.
//
// POR QUÉ EXISTE:
//   Vosk no soporta dos recognizers simultáneos sobre el mismo modelo de
//   forma oficial en la lib `vosk-browser` v0.0.8. Pero SÍ podemos
//   crear/destruir recognizers sobre el mismo modelo y mismo audio stream
//   de forma secuencial. Eso nos da:
//     - Wake word escuchando "jarvis".
//     - Cuando matchea, switcheamos a STT con el mismo audio stream.
//     - Cuando el STT termina (silencio), switcheamos de vuelta a wake.
//
// QUÉ COMPARTIMOS ENTRE MODO WAKE Y STT:
//   - `model: VoskModel` — se carga UNA vez (~40MB, 5-15s la primera).
//   - `stream: MediaStream` — un único getUserMedia para toda la sesión.
//   - `audioCtx: AudioContext` — un único AudioContext.
//   - `worklet: ScriptProcessorNode` — un único nodo que manda audio al
//     recognizer que esté activo. Cuando switcheamos, solo cambiamos
//     la referencia `activeRecognizer`.
//
// QUÉ ES ÚNICO POR MODO:
//   - `activeRecognizer: KaldiRecognizer` — se destruye y se crea nuevo
//     en cada switch de modo. Es barato (no recarga el modelo).
//
// CICLO DE VIDA:
//   1. Mount → manager.start({ mode: 'wake' })
//        → carga modelo, pide mic, conecta audio.
//   2. wake matchea "jarvis" → emit('wake')
//        → el componente overlay llama manager.switchMode('stt')
//   3. STT recibe audio, transcribe, cuando detecta silencio
//        → emit('stt:result', transcript)
//        → el overlay llama manager.switchMode('wake')
//   4. Unmount → manager.stop() → libera todo.
// ─────────────────────────────────────────────────────────────────────────────

import { EventEmitter } from "events";

type VoskModel = any;
type KaldiRecognizer = any;

const MODEL_URL = "/models/vosk-model-small-es.tar.gz";
const SAMPLE_RATE = 16000;

export type VoskMode = "idle" | "wake" | "stt";

export interface VoskManagerEvents {
  "mode":         (mode: VoskMode) => void;
  "wake":         () => void;
  "stt:partial":  (text: string) => void;
  "stt:result":   (text: string) => void;
  "stt:silence":  () => void;
  "stt:timeout":  () => void;
  "error":        (err: Error) => void;
  "loading":      (isLoading: boolean) => void;
}

class VoskManager extends EventEmitter {
  private model: VoskModel | null = null;
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private worklet: ScriptProcessorNode | null = null;
  private activeRecognizer: KaldiRecognizer | null = null;
  private mode: VoskMode = "idle";

  // (jul 2026 v8.6) — Locks para evitar doble carga cuando React
  // StrictMode ejecuta useEffect mount → cleanup → mount, o cuando
  // varios hooks llaman start() casi al mismo tiempo. Sin esto, vosk
  // crea 2 modelos en paralelo, cada uno con su Web Worker, y se
  // quedan pegados mutuamente en la inicialización.
  private loadModelPromise: Promise<VoskModel> | null = null;
  private acquireStreamPromise: Promise<{ stream: MediaStream; ctx: AudioContext; worklet: ScriptProcessorNode }> | null = null;

  // Para STT silence detection
  private sttSilenceStart: number | null = null;
  private sttLastPartial: string = "";
  private sttLastResult: string = "";
  private sttStartedAt: number = 0;
  private sttSilenceTimer: number | null = null;
  private sttMaxTimer: number | null = null;

  // (jul 2026 v8.6) Tunables del STT. Estos valores son globales
  // (no se exponen al componente) porque son detalles internos del
  // manager. Si necesitamos ajustarlos, los movemos a la API después.
  private readonly STT_SILENCE_MS     = 1500;
  private readonly STT_MAX_DURATION_MS = 30_000;
  private readonly STT_STARTUP_WAIT_MS = 8_000;  // jul 2026 v8.6 — si el
                                                   // user no habla NADA
                                                   // en 8s, cerramos.
                                                   // Antes era infinito
                                                   // (esperaba el
                                                   // STT_MAX_DURATION_MS
                                                   // completo), pero el
                                                   // user puede quedarse
                                                   // pensando qué decir y
                                                   // el STT quedaba
                                                   // abierto mucho
                                                   // tiempo.

  isMode(m: VoskMode): boolean {
    return this.mode === m;
  }

  getMode(): VoskMode {
    return this.mode;
  }

  /**
   * Inicia el manager y carga el modelo + mic. Si ya estaba cargado,
   * solo cambia al modo pedido. Si el modelo ya estaba cargado de una
   * sesión anterior, NO lo vuelve a bajar (Vosk hace cache en OPFS).
   */
  async start(opts: { mode: VoskMode }): Promise<void> {
    if (this.mode !== "idle" && this.mode === opts.mode) {
      // Ya estamos en el modo pedido, no hacer nada.
      return;
    }

    // (jul 2026 v8.6) — Lock de carga del modelo. Si ya hay una carga
    // en curso (de una llamada anterior a start), esperamos ESA misma
    // promesa en vez de arrancar otra. Sin esto, React StrictMode (mount
    // → cleanup → mount) o el doble useEffect (useWakeWord + useVoiceStt)
    // crean 2 modelos en paralelo que se traban mutuamente.
    if (!this.model) {
      if (!this.loadModelPromise) {
        this.emit("loading", true);
        this.loadModelPromise = (async () => {
          try {
            const { createModel } = await import("vosk-browser");
            const m = await createModel(MODEL_URL, 0); // logLevel 0 = silent
            return m;
          } catch (e) {
            this.loadModelPromise = null; // reset para que se pueda reintentar
            throw e;
          }
        })();
      }
      try {
        this.model = await this.loadModelPromise;
        this.emit("loading", false);
      } catch (e) {
        this.emit("loading", false);
        this.emit("error", e instanceof Error ? e : new Error(String(e)));
        return;
      } finally {
        // Mantenemos loadModelPromise para futuras llamadas, no la reseteamos.
        // Solo reseteamos si falló (catch arriba).
      }
    }

    // (jul 2026 v8.6) — Mismo lock para el mic + AudioContext + worklet.
    if (!this.stream || !this.audioCtx || !this.worklet) {
      if (!this.acquireStreamPromise) {
        this.acquireStreamPromise = (async () => {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              channelCount: 1,
              sampleRate: SAMPLE_RATE,
              echoCancellation: true,
              noiseSuppression: true,
            },
            video: false,
          });
          const AudioContextClass: typeof AudioContext =
            (window as any).AudioContext || (window as any).webkitAudioContext;
          const ctx = new AudioContextClass({ sampleRate: SAMPLE_RATE });
          // (jul 2026 v8.6) — Chrome suspende el AudioContext hasta que
          // hay un user gesture. Si el manager se inicializa desde un
          // useEffect al mount (sin click reciente), el context queda
          // en estado "suspended" y el ScriptProcessor no procesa audio.
          // Vosk no detecta el wake word. El resume() es un no-op si
          // ya está running, pero si está suspended lo levanta.
          if (ctx.state === "suspended") {
            try { await ctx.resume(); } catch {}
          }
          const source = ctx.createMediaStreamSource(stream);
          // Buffer de 4096 samples = 256ms a 16kHz. Suficiente para que
          // Vosk detecte palabras sin sentir lag, sin saturar CPU.
          const processor = ctx.createScriptProcessor(4096, 1, 1);
          processor.onaudioprocess = (event: AudioProcessingEvent) => {
            if (!this.activeRecognizer) return;
            const input = event.inputBuffer.getChannelData(0); // Float32Array
            try {
              this.activeRecognizer.acceptWaveformFloat(input, SAMPLE_RATE);
            } catch {
              // silent
            }
          };
          source.connect(processor);
          processor.connect(ctx.destination); // necesario en algunos browsers
          return { stream, ctx, worklet: processor };
        })();
      }
      try {
        const r = await this.acquireStreamPromise;
        this.stream = r.stream;
        this.audioCtx = r.ctx;
        this.worklet = r.worklet;
      } catch (e) {
        this.acquireStreamPromise = null;
        this.emit("error", e instanceof Error ? e : new Error(String(e)));
        return;
      }
    }
    this.switchMode(opts.mode);
  }

  /**
   * Cambia el modo del recognizer activo. Destruye el anterior y crea
   * uno nuevo (no se puede tener dos a la vez sobre el mismo modelo).
   */
  switchMode(newMode: VoskMode): void {
    if (this.mode === newMode) return;
    if (!this.model) {
      // Manager no inicializado todavía. start() se encargará.
      return;
    }
    // Destruir recognizer anterior.
    this.teardownRecognizer();
    this.mode = newMode;
    this.emit("mode", newMode);

    if (newMode === "idle") {
      return;
    }
    if (newMode === "wake") {
      this.createWakeRecognizer();
    } else if (newMode === "stt") {
      this.createSttRecognizer();
    }
  }

  private createWakeRecognizer(): void {
    if (!this.model) return;
    const rec = new this.model.KaldiRecognizer(SAMPLE_RATE);
    rec.setWords(true);
    this.activeRecognizer = rec;

    const onResult = (_msg: any) => {
      const text = (_msg?.result?.text ?? "").toLowerCase().trim();
      if (matchesWakeKeyword(text)) {
        // (jul 2026 v8.6) Matcheó. NO procesamos más audio (cambiamos
        // a STT, que creará un recognizer nuevo). Pero primero emitimos
        // el evento para que el overlay pueda arrancar el saludo.
        this.emit("wake");
        // Apagamos el wake word inmediatamente para que no matchee de
        // nuevo mientras el user está hablando. El overlay se encarga
        // de llamar switchMode('stt') después del saludo.
        rec.remove();
        this.activeRecognizer = null;
      }
    };
    rec.on("result", onResult);
    // (También escuchamos partialresult para detectar el wake word
    // más rápido — no esperamos a la frase completa.)
    rec.on("partialresult", (msg: any) => {
      const text = (msg?.result?.partial ?? "").toLowerCase().trim();
      if (matchesWakeKeyword(text)) {
        this.emit("wake");
        rec.remove();
        this.activeRecognizer = null;
      }
    });
  }

  private createSttRecognizer(): void {
    if (!this.model) return;
    const rec = new this.model.KaldiRecognizer(SAMPLE_RATE);
    rec.setWords(true);
    this.activeRecognizer = rec;
    this.sttStartedAt = Date.now();
    this.sttSilenceStart = null;
    this.sttLastPartial = "";
    this.sttLastResult = "";

    // (jul 2026 v8.6) El recognizer YA está creado y conectado al
    // audio. NO armamos el silence timer todavía. Lo armamos SOLO
    // cuando llegue el primer partial/result del user. Si el user
    // tarda más de 1.5s en empezar a hablar (típico: piensa qué
    // decir después del saludo), el timer NO se dispara y el STT
    // queda abierto esperando.
    //
    // El único timer que armamos al inicio es el startup wait: si
    // pasan STT_STARTUP_WAIT_MS (8s) sin que el user haya dicho
    // NADA, cerramos con `stt:timeout`. Esto es un safety net para
    // que el overlay no quede colgado si el user cambió de idea.
    this.sttMaxTimer = window.setTimeout(() => {
      this.emit("stt:timeout");
      this.finalizeStt();
    }, this.STT_STARTUP_WAIT_MS);

    rec.on("result", (msg: any) => {
      const text: string = (msg?.result?.text ?? "").trim();
      if (text) {
        this.sttLastResult = text;
        // (jul 2026 v8.6) El user está hablando: cancelamos el
        // startup wait y armamos el silence timer normal.
        this.cancelStartupWait();
        this.armSilenceTimer();
        this.emit("stt:result", text);
      } else if (this.sttLastResult) {
        // Result vacío después de texto: posible fin de utterance.
        this.finalizeStt();
      }
    });

    rec.on("partialresult", (msg: any) => {
      const text: string = (msg?.result?.partial ?? "").trim();
      if (text && text !== this.sttLastPartial) {
        this.sttLastPartial = text;
        // (jul 2026 v8.6) El user está hablando. Cancelamos el
        // startup wait (si todavía no se disparó) y armamos el
        // silence timer.
        this.cancelStartupWait();
        this.armSilenceTimer();
        this.emit("stt:partial", text);
      }
    });
  }

  /** (jul 2026 v8.6) Cancela el startup wait cuando el user empieza
   *  a hablar y arma el max duration timer real (30s de grabación
   *  continua). Si el user habla por 30s seguidos, cerramos. */
  private cancelStartupWait(): void {
    if (this.sttMaxTimer !== null) {
      window.clearTimeout(this.sttMaxTimer);
      this.sttMaxTimer = null;
    }
    // Armar el max duration real AHORA que el user está hablando.
    this.sttMaxTimer = window.setTimeout(() => {
      this.emit("stt:timeout");
      this.finalizeStt();
    }, this.STT_MAX_DURATION_MS);
  }

  private armSilenceTimer(): void {
    // Cada vez que llega audio o texto, reseteamos. Si pasan
    // STT_SILENCE_MS sin nada nuevo, cerramos.
    if (this.sttSilenceTimer !== null) {
      window.clearTimeout(this.sttSilenceTimer);
    }
    this.sttSilenceTimer = window.setTimeout(() => {
      this.emit("stt:silence");
      this.finalizeStt();
    }, this.STT_SILENCE_MS);
  }

  private finalizeStt(): void {
    if (this.mode !== "stt") return;
    if (this.sttSilenceTimer !== null) {
      window.clearTimeout(this.sttSilenceTimer);
      this.sttSilenceTimer = null;
    }
    if (this.sttMaxTimer !== null) {
      window.clearTimeout(this.sttMaxTimer);
      this.sttMaxTimer = null;
    }
    // Vosk deja texto en `sttLastResult` (o partial si nunca llegó un
    // `result` final). El overlay recibe ambos en orden.
    const final = this.sttLastResult || this.sttLastPartial;
    this.teardownRecognizer();
    this.mode = "idle";
    this.emit("mode", "idle");
    this.emit("stt:result", final);
  }

  private teardownRecognizer(): void {
    if (this.sttSilenceTimer !== null) {
      window.clearTimeout(this.sttSilenceTimer);
      this.sttSilenceTimer = null;
    }
    if (this.sttMaxTimer !== null) {
      window.clearTimeout(this.sttMaxTimer);
      this.sttMaxTimer = null;
    }
    if (this.activeRecognizer) {
      try { this.activeRecognizer.remove(); } catch {}
      this.activeRecognizer = null;
    }
  }

  /**
   * Libera TODO. Útil al desmontar el overlay o al cerrar la sesión.
   */
  async stop(): Promise<void> {
    this.teardownRecognizer();
    if (this.worklet) {
      try { this.worklet.disconnect(); } catch {}
      this.worklet = null;
    }
    if (this.audioCtx && this.audioCtx.state !== "closed") {
      try { await this.audioCtx.close(); } catch {}
      this.audioCtx = null;
    }
    if (this.stream) {
      try { this.stream.getTracks().forEach(t => t.stop()); } catch {}
      this.stream = null;
    }
    if (this.model) {
      try { this.model.terminate(); } catch {}
      this.model = null;
    }
    this.mode = "idle";
    this.sttLastResult = "";
    this.sttLastPartial = "";
  }
}

// ─── Wake word matching (reusado de useWakeWord viejo) ─────────────

const JARVIS_VARIANTS = [
  "jarvis", "yarvis", "yervis", "jarves", "charvis", "jarvi",
  "yarbi", "yarbis", "yarbe", "yarvith", "jervis", "jerves",
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, "")
    .trim();
}

function matchesWakeKeyword(transcriptRaw: string): boolean {
  const t = normalize(transcriptRaw);
  if (!t) return false;
  return JARVIS_VARIANTS.some(v => t.includes(v));
}

// ─── Singleton ─────────────────────────────────────────────────────

let _instance: VoskManager | null = null;

export function getVoskManager(): VoskManager {
  if (!_instance) {
    _instance = new VoskManager();
  }
  return _instance;
}

// On hot-reload (Vite HMR), limpiamos el singleton para que no quede
// con referencias a un módulo viejo.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (_instance) {
      void _instance.stop();
      _instance = null;
    }
  });
}
