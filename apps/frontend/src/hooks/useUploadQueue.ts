// src/hooks/useUploadQueue.ts
import { useRef, useState, useCallback } from "react";

type UploadState = "idle" | "uploading" | "done" | "error";

type QueueEntry = {
  promise: Promise<string>;
  url: string | null;
};

export function useUploadQueue(companyId: string | number) {
  const queue = useRef<Map<string, QueueEntry>>(new Map());
  const [states, setStates] = useState<Record<string, UploadState>>({});

  const enqueue = useCallback(
    (stepId: string, file: File, isVideo: boolean): Promise<string> => {
      // Si ya hay un upload en vuelo para este step, cancelarlo y relanzar
      queue.current.delete(stepId);

      const promise = (async () => {
        setStates((s) => ({ ...s, [stepId]: "uploading" }));
        try {
          const form = new FormData();
          form.append(isVideo ? "video" : "photos", file);

          const endpoint = isVideo
            ? `/api/upload/exit-auth-video?companyId=${companyId}`
            : `/api/upload/exit-auth-photos?companyId=${companyId}`;

          const res = await fetch(endpoint, {
            method: "POST",
            credentials: "include",
            body: form,
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);

          const json: { urls?: string[]; url?: string } = await res.json();
          const url = isVideo ? json.url : (json.urls?.[0] ?? null);
          if (!url) throw new Error("Sin URL");

          // Guardar URL resuelta en la entry
          const entry = queue.current.get(stepId);
          if (entry) entry.url = url;

          setStates((s) => ({ ...s, [stepId]: "done" }));
          return url;
        } catch (err) {
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