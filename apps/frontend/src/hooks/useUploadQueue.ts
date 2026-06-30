// src/hooks/useUploadQueue.ts
import { useRef, useState, useCallback, useEffect } from "react";
import { compressIfImage, COMPRESS_OPTS_EVIDENCE } from "../lib/mediaCompress";

type UploadState = "idle" | "uploading" | "done" | "error";

type QueueEntry = {
  // Tarea pendiente de ejecutar (la levanta el pump cuando hay cupo).
  task: () => Promise<string>;
  // Promise externa: la que consume `resolveAll`. Se resuelve cuando
  // `task()` termina OK, o se rechaza si falla.
  promise: Promise<string>;
  // URL resuelta (solo presente cuando state === "done")
  url: string | null;
  // Estado actual
  state: UploadState;
  // Resolver/rejecter externos (los expone `enqueue` para que el caller
  // pueda hacer `await enqueue(...).then(...)` y enterarse del resultado).
  resolveOuter!: (url: string) => void;
  rejectOuter!: (err: unknown) => void;
};

// Tamaño de cada chunk para videos: 2 MB
const VIDEO_CHUNK_SIZE = 2 * 1024 * 1024;

/**
 * Concurrencia máxima de subidas simultáneas.
 * Antes era 1 (secuencial); ahora subimos 3 archivos a la vez.
 * Esto aprovecha mejor el ancho de banda del conductor (4G/Wi-Fi) y
 * reduce el tiempo total del wizard cuando hay 10 fotos de evidencia.
 */
const MAX_CONCURRENT = 3;

/** Log helper con prefijo para identificar origen en consola. */
const log = (tag: string, ...args: unknown[]) =>
  console.log(`[upload:${tag}]`, ...args);

/**
 * Genera un UUID v4 sin depender de `crypto.randomUUID()`, que NO
 * existe en algunos navegadores viejos y WebViews embebidos (especialmente
 * en Android WebView pre-Chrome 92, navegadores in-app de apps híbridas, etc.).
 *
 * El validador del backend acepta `^[a-zA-Z0-9-]{8,64}$` así que con
 * 32 hex chars + 4 guiones = 36 chars entramos cómodo.
 */
function safeUUID(): string {
  // 1) Camino feliz: crypto.randomUUID() en navegadores modernos
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      /* fallback abajo */
    }
  }
  // 2) Fallback: 16 bytes random en hex con el patrón 8-4-4-4-12
  const r = () =>
    Math.floor((Math.random() * 0xffff))
      .toString(16)
      .padStart(4, "0");
  return `${r()}${r()}-${r()}-${r()}-${r()}-${r()}${r()}${r()}`;
}

/**
 * Sube un video en chunks de 2 MB al endpoint de upload chunked.
 * El servidor ensambla los chunks y devuelve la URL final.
 */
async function uploadVideoChunked(
  file: File,
  companyId: string | number,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const totalChunks = Math.ceil(file.size / VIDEO_CHUNK_SIZE);
  const uploadId = safeUUID();
  const t0 = Date.now();

  log("chunked-start", {
    name: file.name, type: file.type || "(vacío)", sizeMB: +(file.size / 1024 / 1024).toFixed(2),
    totalChunks, companyId, uploadId,
  });

  for (let i = 0; i < totalChunks; i++) {
    const start = i * VIDEO_CHUNK_SIZE;
    const end   = Math.min(start + VIDEO_CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);

    const form = new FormData();
    form.append("chunk",       chunk);
    form.append("uploadId",    uploadId);
    form.append("chunkIndex",  String(i));
    form.append("totalChunks", String(totalChunks));
    form.append("filename",    file.name);
    form.append("mimeType",    file.type);

    const tChunk = Date.now();
    log("chunk-send", { idx: i + 1, of: totalChunks, chunkMB: +(chunk.size / 1024 / 1024).toFixed(2) });

    const res = await fetch(
      `/api/upload/exit-auth-video-chunk?companyId=${companyId}`,
      { method: "POST", credentials: "include", body: form },
    );
    log("chunk-resp", { idx: i + 1, status: res.status, ms: Date.now() - tChunk });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      log("chunk-error", { idx: i + 1, status: res.status, body: errText.slice(0, 500) });
      throw new Error(`Chunk ${i} falló: HTTP ${res.status} — ${errText.slice(0, 200)}`);
    }

    const json: { status: "partial" | "done"; url?: string } = await res.json();
    log("chunk-json", { idx: i + 1, status: json.status, url: json.url ?? null });

    onProgress?.(Math.round(((i + 1) / totalChunks) * 100));

    if (json.status === "done") {
      if (!json.url) throw new Error("Servidor no devolvió URL");
      log("chunked-done", { url: json.url, totalMs: Date.now() - t0 });
      return json.url;
    }
  }

  throw new Error("El servidor nunca confirmó el upload completo");
}

/**
 * Sube fotos (o videos pequeños) en una sola request.
 *
 * `compressIfImage` se aplica como "defense in depth" — el caller
 * (SolicitarSalidaWizard.handleFile) ya comprime con
 * `compressIfImage(captured, COMPRESS_OPTS_EVIDENCE)` antes de encolar,
 * pero si en el futuro otro caller invoca esta función sin comprimir,
 * nos aseguramos de que las imágenes igual se reduzcan antes de subir.
 */
async function uploadSingle(
  file: File,
  companyId: string | number,
  isVideo: boolean,
): Promise<string> {
  const t0 = Date.now();
  log("single-start", {
    name: file.name, type: file.type || "(vacío)", sizeMB: +(file.size / 1024 / 1024).toFixed(2),
    isVideo, companyId,
  });

  // Comprimir si es imagen. Videos (isVideo=true) se suben tal cual —
  // su compresión se hace en otro lado (compressVideo / ffmpeg.wasm).
  const toUpload = isVideo ? file : await compressIfImage(file, COMPRESS_OPTS_EVIDENCE);

  const form = new FormData();
  form.append(isVideo ? "video" : "photos", toUpload);

  const endpoint = isVideo
    ? `/api/upload/exit-auth-video?companyId=${companyId}`
    : `/api/upload/exit-auth-photos?companyId=${companyId}`;

  log("single-send", { endpoint, bodySizeMB: +(toUpload.size / 1024 / 1024).toFixed(2) });

  const res = await fetch(endpoint, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  log("single-resp", { status: res.status, ms: Date.now() - t0 });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    log("single-error", { status: res.status, body: errText.slice(0, 500) });
    throw new Error(`HTTP ${res.status} — ${errText.slice(0, 200)}`);
  }

  const json: { urls?: string[]; url?: string } = await res.json();
  const url = isVideo ? json.url : (json.urls?.[0] ?? null);
  if (!url) throw new Error("Sin URL");
  log("single-done", { url, totalMs: Date.now() - t0 });
  return url;
}

// ─── UploadPool: pool concurrente con tope MAX_CONCURRENT ──────────────────────
//
// Diseño:
//
//   enqueue(stepId, file, isVideo)
//     │
//     ▼
//   Crea una QueueEntry con state="uploading" y la agrega a `queue` + `pendingOrder`.
//   Devuelve una promesa externa (entry.promise) que se resolverá cuando la
//   tarea efectivamente termine.
//
//   pump()
//     ▲
//     │  loop: mientras haya cupo (inFlight < MAX_CONCURRENT) y pendientes en
//     │  `pendingOrder`, saca el primero y corre su `entry.task()`.
//     │
//   Cuando una tarea termina (ok o error), decrementa inFlight y vuelve a
//   llamar a pump() para arrancar la siguiente.
//
// Esto garantiza que SOLO haya MAX_CONCURRENT fetches en vuelo a la vez,
// sin importar cuántas veces llame `enqueue()`. Antes era secuencial (1).
//
// Stats derivados (exposed via `stats`):
//   { uploading, done, error, total }

export type UploadStats = {
  uploading: number;
  done: number;
  error: number;
  total: number;
};

export function useUploadQueue(companyId: string | number) {
  const queue = useRef<Map<string, QueueEntry>>(new Map());
  // Cola FIFO de stepIds pendientes (los que aún no arrancaron)
  const pendingOrder = useRef<string[]>([]);
  // Cantidad de uploads en vuelo (cuenta independiente de la cola)
  const inFlight = useRef(0);
  // Trigger para re-render cuando cambian los stats
  const [tick, setTick] = useState(0);
  const [states, setStates] = useState<Record<string, UploadState>>({});

  const bump = useCallback(() => setTick((t) => t + 1), []);

  /**
   * Avanza el pool: arranca hasta MAX_CONCURRENT - inFlight nuevas tareas
   * desde la cola FIFO `pendingOrder`.
   *
   * Se llama: al encolar (para arrancar la primera tanda), y cada vez que
   * una tarea termina (para arrancar la siguiente).
   */
  const pump = useCallback(() => {
    while (inFlight.current < MAX_CONCURRENT && pendingOrder.current.length > 0) {
      const stepId = pendingOrder.current.shift()!;
      const entry = queue.current.get(stepId);
      if (!entry) continue; // fue removida antes de arrancar

      inFlight.current++;

      // Corremos la tarea. Ya está marcada como "uploading" desde enqueue()
      // para feedback inmediato de UI.
      entry.task()
        .then((url) => {
          entry.url = url;
          entry.state = "done";
          setStates((s) => ({ ...s, [stepId]: "done" }));
          entry.resolveOuter(url);
        })
        .catch((err) => {
          entry.state = "error";
          setStates((s) => ({ ...s, [stepId]: "error" }));
          entry.rejectOuter(err);
        })
        .finally(() => {
          inFlight.current--;
          bump();
          pump();
        });
    }
  }, [bump]);

  const enqueue = useCallback(
    (stepId: string, file: File, isVideo: boolean): Promise<string> => {
      // Si ya hay un upload en vuelo para este step, reemplazarlo.
      // NOTA: la outerPromise anterior queda "huérfana" (nadie la await-ea)
      // porque el caller que hizo enqueue() antes va a usar la NUEVA promise
      // que retornamos ahora. Eso es correcto — el caller debe estar
      // sincronizado con la última entry.
      const existing = queue.current.get(stepId);
      if (existing) {
        log("enqueue-replace", { stepId, prevState: existing.state });
        // Si estaba pendiente (aún no arrancaba), la sacamos de pendingOrder
        const idx = pendingOrder.current.indexOf(stepId);
        if (idx >= 0) pendingOrder.current.splice(idx, 1);
        queue.current.delete(stepId);
        // Rechazamos la outerPromise anterior para no dejar promesas colgadas
        try { existing.rejectOuter(new Error("Reemplazado por nuevo upload")); } catch { /* noop */ }
      }

      log("enqueue", {
        stepId, name: file.name, type: file.type || "(vacío)",
        sizeMB: +(file.size / 1024 / 1024).toFixed(2), isVideo,
      });

      // Creamos la outerPromise que el caller podrá await-ear.
      let resolveOuter!: (url: string) => void;
      let rejectOuter!: (err: unknown) => void;
      const outerPromise = new Promise<string>((res, rej) => {
        resolveOuter = res;
        rejectOuter = rej;
      });

      // La tarea que ejecutará el pump cuando haya cupo.
      const task = async (): Promise<string> => {
        if (isVideo && file.size > VIDEO_CHUNK_SIZE) {
          log("enqueue-routing", { stepId, route: "chunked", sizeMB: +(file.size / 1024 / 1024).toFixed(2) });
          return uploadVideoChunked(file, companyId);
        }
        log("enqueue-routing", { stepId, route: "single", sizeMB: +(file.size / 1024 / 1024).toFixed(2) });
        return uploadSingle(file, companyId, isVideo);
      };

      const entry: QueueEntry = {
        task,
        promise: outerPromise,
        url: null,
        state: "uploading",
        resolveOuter,
        rejectOuter,
      };
      queue.current.set(stepId, entry);
      pendingOrder.current.push(stepId);

      // Feedback inmediato a la UI: "Subiendo..." desde el primer frame.
      setStates((s) => ({ ...s, [stepId]: "uploading" }));
      bump();

      // Tratamos de arrancar la tarea inmediatamente (el pump respeta el cupo)
      pump();

      return outerPromise;
    },
    [companyId, bump, pump],
  );

  // Re-derivamos stats cuando cambia tick (las mutaciones a queue.current no
  // causan re-render por sí solas, por eso necesitamos el bump manual).
  // Como stats se calcula como un IIFE dentro del return, depende de `tick`
  // y `states` para que React lo reevalúe en cada render.
  useEffect(() => { /* noop — solo para registrar dependencia de tick */ }, [tick]);

  const stats: UploadStats = (() => {
    void tick; void states; // dependencias
    let uploading = 0;
    let done = 0;
    let error = 0;
    queue.current.forEach((e) => {
      if (e.state === "uploading") uploading++;
      else if (e.state === "done") done++;
      else if (e.state === "error") error++;
    });
    return { uploading, done, error, total: queue.current.size };
  })();

  // Espera todos los uploads pendientes y devuelve las URLs resueltas
  const resolveAll = useCallback(
    async (stepIds: string[]): Promise<Record<string, string | null>> => {
      const results: Record<string, string | null> = {};
      await Promise.allSettled(
        stepIds.map(async (id) => {
          const entry = queue.current.get(id);
          if (!entry) { results[id] = null; return; }
          try {
            results[id] = await entry.promise;
          } catch {
            results[id] = null;
          }
        }),
      );
      return results;
    },
    [],
  );

  const getState = (stepId: string): UploadState =>
    states[stepId] ?? "idle";

  const reset = useCallback(() => {
    // Rechazamos todas las outerPromises pendientes para que awaiters no queden colgados
    queue.current.forEach((e) => {
      try { e.rejectOuter(new Error("Reset")); } catch { /* noop */ }
    });
    queue.current.clear();
    pendingOrder.current = [];
    inFlight.current = 0;
    setStates({});
    bump();
  }, [bump]);

  return {
    enqueue,
    resolveAll,
    getState,
    reset,
    stats,
    MAX_CONCURRENT,
  };
}