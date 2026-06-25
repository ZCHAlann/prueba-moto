"use client";

import { useEffect, useMemo, useRef } from "react";
import { useAuth } from "../context/AuthContext";

export type ExitAuthEvent =
  | { type: "exit-authorization:created"; data: { id: string; status: string } & Record<string, unknown> }
  | { type: "exit-authorization:decided"; data: { id: string; status: string; decidedBy?: string } & Record<string, unknown> }
  | { type: "exit-authorization:deleted"; data: { id: string } }
  | { type: "exit-authorization:corrections-sent"; data: { exitAuthorizationId: string; correctionsCount: number; round: number; sentBy?: string } }
  | { type: "exit-authorization:corrections-resubmitted"; data: { exitAuthorizationId: string; reanalyzedItems: string[]; decision: string } }
  | { type: "exit-authorization:analysis-failed"; data: { exitAuthorizationId: string; userMessage: string; errorCode: string } }
  | { type: "hello"; data: { companyId: number; userId: number | undefined } }
  | { type: "pong"; data: { t: number } };

export type ExitAuthHandlers = {
  onCreated?: (data: { id: string; status: string } & Record<string, unknown>) => void;
  onDecided?: (data: { id: string; status: string; decidedBy?: string } & Record<string, unknown>) => void;
  onDeleted?: (data: { id: string }) => void;
  /**
   * Notificación de que la autorización fue devuelta al conductor
   * con correcciones (por IA o por supervisor). El frontend debe
   * refrescar la lista de autorizaciones para que el card amarillo
   * "Corregir ahora" aparezca en la app del conductor.
   */
  onCorrectionsSent?: (data: { exitAuthorizationId: string; correctionsCount: number; round: number; sentBy?: string }) => void;
  /**
   * Notificación de que el conductor subió las correcciones y se
   * disparó el re-análisis. Sirve para refrescar el drawer del
   * supervisor y ver el nuevo status.
   */
  onCorrectionsResubmitted?: (data: { exitAuthorizationId: string; reanalyzedItems: string[]; decision: string }) => void;
  /**
   * Notificación de que el análisis IA falló (ej: video muy grande).
   * El conductor debe ver el mensaje de error.
   */
  onAnalysisFailed?: (data: { exitAuthorizationId: string; userMessage: string; errorCode: string }) => void;
};

/**
 * Suscripción WS para el módulo de autorizaciones de salida.
 *
 *  • Se conecta cuando hay `session` y `companyId`.
 *  • La URL se memoiza — no se reconstruye en cada render, así no se gatilla
 *    un cleanup/reconexión por re-render.
 *  • Los handlers van SIEMPRE por ref — nunca se reconecta porque cambie
 *    el callback que el padre pasó.
 *  • Reconecta con backoff exponencial (1s, 2s, 4s, 8s, 16s, 30s) si se
 *    cierra sin ser unmount.
 */
export function useExitAuthorizationsSocket(
  companyId: string | null,
  handlers: ExitAuthHandlers,
) {
  const { session } = useAuth();

  // Ref estable con los handlers. Actualizamos en cada render para que el
  // `onmessage` use la versión más reciente sin forzar reconexión.
  const handlersRef = useRef<ExitAuthHandlers>(handlers);
  handlersRef.current = handlers;

  // ── URL memoizada — ya no se reconstruye en cada render ─────────────────────
  //
  // Estrategia de URL del WS:
  //   - En dev (Vite): el proxy de `vite.config.ts` ya redirige `/ws` al
  //     backend (puerto 5000), así que usamos `window.location.host` y
  //     dejamos que el proxy haga su trabajo. No usar VITE_API_URL porque
  //     eso saltea el proxy y rompe la convención de dev.
  //   - En prod: si VITE_WS_URL está definido, se usa tal cual. Si no,
  //     se deriva de VITE_API_URL. Si ninguno está, fallback a wss.
  // ── URL memoizada — ya no se reconstruye en cada render ─────────────────────
  const wsUrl = useMemo(() => {
    if (import.meta.env.DEV) {
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      return `${proto}://${window.location.host}/ws`;
    }
    const envWs = import.meta.env.VITE_WS_URL as string | undefined;
    const envApi = import.meta.env.VITE_API_URL as string | undefined;
    if (envWs) return envWs;
    if (envApi) return envApi.replace(/^http/i, "wss") + "/ws";
    return `wss://${window.location.host}/ws`;
  }, []);

  useEffect(() => {
    // Sin sesión o sin empresa → no conectamos. Si cambia la sesión más
    // adelante, el effect se vuelve a correr y recién ahí conecta.
    if (!session || !companyId) return;

    let ws: WebSocket | null = null;
    let pingInterval: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    // `cancelled` se vuelve true en el cleanup — se usa para distinguir
    // unmount de cierre por red.
    let cancelled = false;

    const clearTimers = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      attempts += 1;
      const delay = Math.min(30_000, 1000 * Math.pow(2, Math.min(attempts, 5)));
      reconnectTimer = setTimeout(connect, delay);
    };

    const connect = () => {
      if (cancelled) return;

      try {
        ws = new WebSocket(wsUrl);
      } catch {
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        // Resetear el backoff al conectar.
        attempts = 0;
        // Re-asegurar un solo ping interval.
        if (pingInterval) clearInterval(pingInterval);
        pingInterval = setInterval(() => {
          if (!ws || ws.readyState !== ws.OPEN) return;
          try {
            ws.send(JSON.stringify({ type: "ping" }));
          } catch {
            /* noop */
          }
        }, 25_000);
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as ExitAuthEvent;
          if (msg.type === "exit-authorization:created") {
            handlersRef.current.onCreated?.(msg.data);
          } else if (msg.type === "exit-authorization:decided") {
            handlersRef.current.onDecided?.(msg.data);
          } else if (msg.type === "exit-authorization:deleted") {
            handlersRef.current.onDeleted?.(msg.data);
          } else if (msg.type === "exit-authorization:corrections-sent") {
            // El conductor recibe este evento cuando se le devuelven
            // correcciones (las manda la IA o el supervisor). Refresca
            // la lista para que aparezca el card "Corregir ahora".
            handlersRef.current.onCorrectionsSent?.(msg.data);
          } else if (msg.type === "exit-authorization:corrections-resubmitted") {
            handlersRef.current.onCorrectionsResubmitted?.(msg.data);
          } else if (msg.type === "exit-authorization:analysis-failed") {
            // El análisis IA falló (ej: video muy grande). El
            // frontend debe refrescar la lista y mostrar el card
            // con el mensaje de error al conductor.
            handlersRef.current.onAnalysisFailed?.(msg.data);
          } else if (msg.type === "exit-authorization:analysis-completed") {
            handlersRef.current.onAnalysisCompleted?.(msg.data);
          }
        } catch {
          /* noop */
        }
      };

      ws.onerror = () => {
        // No logueamos: el `onclose` ya maneja la reconexión.
      };

      ws.onclose = () => {
        clearTimers();
        // Si fue unmount, no reconectamos.
        if (cancelled) return;
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      cancelled = true;
      clearTimers();
      if (ws) {
        try {
          ws.close();
        } catch {
          /* noop */
        }
        ws = null;
      }
    };
  }, [session, companyId, wsUrl]);
}
