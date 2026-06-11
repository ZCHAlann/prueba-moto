"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";

export type ExitAuthEvent =
  | { type: "exit-authorization:created"; data: { id: string; status: string } }
  | { type: "exit-authorization:decided"; data: { id: string; status: string; decidedBy?: string } }
  | { type: "exit-authorization:deleted"; data: { id: string } }
  | { type: "hello"; data: { companyId: number; userId: number | undefined } }
  | { type: "pong"; data: { t: number } };

export function useExitAuthorizationsSocket(
  companyId: string | null,
  handlers: {
    onCreated?: (data: { id: string; status: string }) => void;
    onDecided?: (data: { id: string; status: string; decidedBy?: string }) => void;
    onDeleted?: (data: { id: string }) => void;
  },
) {
  const { session } = useAuth();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const wsUrl = (() => {
    if (import.meta.env.DEV) {
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      return `${proto}://${window.location.host}/ws`;
    }
    const envWs = import.meta.env.VITE_WS_URL as string | undefined;
    const envApi = import.meta.env.VITE_API_URL as string | undefined;
    if (envWs) return envWs;
    if (envApi) return envApi.replace(/^http/i, "wss") + "/ws";
    return `wss://${window.location.host}/ws`;
  })();

  useEffect(() => {
    if (!session || !companyId) return;

    let ws: WebSocket | null = null;
    let pingInterval: ReturnType<typeof setInterval> | null = null;
    let attempts = 0;
    let manuallyClosed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (manuallyClosed) return;

      try {
        ws = new WebSocket(wsUrl);
      } catch {
        attempts += 1;
        const delay = Math.min(30_000, 1000 * Math.pow(2, Math.min(attempts, 5)));
        reconnectTimer = setTimeout(connect, delay);
        return;
      }

      ws.onopen = () => {
        attempts = 0;
        pingInterval = setInterval(() => {
          try { ws?.send(JSON.stringify({ type: "ping" })); } catch { /* noop */ }
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
          }
        } catch { /* noop */ }
      };

      ws.onerror = (e) => {
        console.log("[WS] Error");
      };

      ws.onclose = (e) => {
        if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
        if (manuallyClosed) return;
        attempts += 1;
        const delay = Math.min(30_000, 1000 * Math.pow(2, Math.min(attempts, 5)));
        reconnectTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      manuallyClosed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pingInterval) clearInterval(pingInterval);
      if (ws) {
        try { ws.close(); } catch { /* noop */ }
      }
    };
  }, [session, companyId, wsUrl]);
}