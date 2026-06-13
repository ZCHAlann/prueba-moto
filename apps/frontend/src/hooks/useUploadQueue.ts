// src/hooks/useUploadQueue.ts
import { useRef, useState, useCallback } from "react";

type UploadState = "idle" | "uploading" | "done" | "error";

type QueueEntry = {
  promise: Promise<string>;
  url: string | null;
};

// Tamaño de cada chunk para videos: 2 MB
const VIDEO_CHUNK_SIZE = 2 * 1024 * 1024;

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
 *
 * Esto permite:
 * - Videos de 1-3 min sin timeout
 * - Reintentar chunks individuales si falla la red
 * - Progreso real de subida
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
 * Sube fotos (o videos pequeños) en una sola request, como antes.
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

  const form = new FormData();
  form.append(isVideo ? "video" : "photos", file);

  const endpoint = isVideo
    ? `/api/upload/exit-auth-video?companyId=${companyId}`
    : `/api/upload/exit-auth-photos?companyId=${companyId}`;

  log("single-send", { endpoint, bodySizeMB: +(file.size / 1024 / 1024).toFixed(2) });

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

export function useUploadQueue(companyId: string | number) {
  const queue = useRef<Map<string, QueueEntry>>(new Map());
  const [states, setStates] = useState<Record<string, UploadState>>({});

  const enqueue = useCallback(
    (stepId: string, file: File, isVideo: boolean): Promise<string> => {
      // Si ya hay un upload en vuelo para este step, reemplazarlo
      queue.current.delete(stepId);

      log("enqueue", {
        stepId, name: file.name, type: file.type || "(vacío)",
        sizeMB: +(file.size / 1024 / 1024).toFixed(2), isVideo,
      });

      const promise = (async () => {
        setStates((s) => ({ ...s, [stepId]: "uploading" }));
        try {
          let url: string;

          if (isVideo && file.size > VIDEO_CHUNK_SIZE) {
            // Video grande → chunked upload
            log("enqueue-routing", { stepId, route: "chunked", sizeMB: +(file.size / 1024 / 1024).toFixed(2) });
            url = await uploadVideoChunked(file, companyId);
          } else {
            // Foto o video pequeño → upload simple como antes
            log("enqueue-routing", { stepId, route: "single", sizeMB: +(file.size / 1024 / 1024).toFixed(2) });
            url = await uploadSingle(file, companyId, isVideo);
          }

          // Guardar URL resuelta en la entry
          const entry = queue.current.get(stepId);
          if (entry) entry.url = url;

          setStates((s) => ({ ...s, [stepId]: "done" }));
          return url;
        } catch (err: any) {
          // Logueamos TODO lo posible para diagnosticar:
          //  - mensaje de la excepción
          //  - stack
          //  - info extra de fetch (si es AbortError, TypeError=network fail, etc.)
          log("enqueue-error", {
            stepId,
            name: err instanceof Error ? err.name : typeof err,
            msg:  err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack?.slice(0, 500) : null,
            type:  file.type || "(vacío)",
            sizeMB: +(file.size / 1024 / 1024).toFixed(2),
            isVideo,
          });
          queue.current.delete(stepId);
          setStates((s) => ({ ...s, [stepId]: "error" }));
          throw err;
        }
      })();

      queue.current.set(stepId, { promise, url: null });
      return promise;
    },
    [companyId],
  );

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
    queue.current.clear();
    setStates({});
  }, []);

  return { enqueue, resolveAll, getState, reset };
}