"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";

// ─── Tipos de mensajes que el backend puede enviar ───────────────────────────

export type WsEvent =
  | { type: "hello";     data: { companyId: number; userId: number | undefined } }
  | { type: "pong";      data: { t: number } }
  | { type: "checklist:created"; data: Record<string, unknown> }
  | { type: "checklist:updated"; data: Record<string, unknown> }
  | { type: "checklist:deleted"; data: { id: string } };

export type WsStatus = "idle" | "connecting" | "open" | "closed" | "error";

/**
 * useChecklistWebSocket — abre `ws://<host>/ws` y entrega los mensajes
 * del namespace "checklist:*" al consumidor.
 *
 *   const { status, lastEvent } = useChecklistWebSocket((evt) => {
 *     if (evt.type === "checklist:created") refetch();
 *   });
 *
 * Reconnect con backoff (1s, 2s, 4s, 8s, 16s, 30s). Cleanup en unmount.
 *
 * Auth: el JWT vive en una cookie httpOnly `aplismart_token` que el
 * browser envía automáticamente en el handshake WS — el server la lee
 * del header `Cookie`. No necesitamos exponer el token a JS.
 */
export function useChecklistWebSocket(onEvent: (evt: WsEvent) => void) {
  const { session } = useAuth();
  const [status, setStatus] = useState<WsStatus>("idle");
  const [lastEvent, setLastEvent] = useState<WsEvent | null>(null);

  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!session) {
      setStatus("idle");
      return;
    }

    const wsProtocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws";
    // Resolución de la URL del WS, en orden de prioridad:
    //  1) VITE_WS_URL explícito (ej: "wss://api.example.com")
    //  2) VITE_API_URL (si está seteado) derivado a ws/wss
    //  3) window.location.host — funciona cuando Vite proxy-a /ws al backend
    let url: string;
    const envWs = (import.meta as any).env?.VITE_WS_URL as string | undefined;
    const envApi = (import.meta as any).env?.VITE_API_URL as string | undefined;
    if (envWs) {
      url = envWs;
    } else if (envApi) {
      url = envApi.replace(/^http/i, wsProtocol);
    } else {
      const host = typeof window !== "undefined" ? window.location.host : "localhost:5000";
      url = `${wsProtocol}://${host}/ws`;
    }

    let ws: WebSocket | null = null;
    let pingInterval: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let manuallyClosed = false;

    const connect = () => {
      if (manuallyClosed) return;
      setStatus("connecting");
      try {
        ws = new WebSocket(url);
      } catch {
        setStatus("error");
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        attempts = 0;
        setStatus("open");
        // ── ping cada 25s para mantener viva la conexión ──
        pingInterval = setInterval(() => {
          try { ws?.send(JSON.stringify({ type: "ping" })); } catch { /* noop */ }
        }, 25_000);
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as WsEvent;
          setLastEvent(msg);
          if (msg.type === "checklist:created" || msg.type === "checklist:updated" || msg.type === "checklist:deleted") {
            try { onEventRef.current(msg); } catch { /* swallow consumer errors */ }
          }
        } catch { /* ignore */ }
      };

      ws.onerror = () => {
        setStatus("error");
      };

      ws.onclose = () => {
        setStatus("closed");
        if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      if (manuallyClosed) return;
      attempts += 1;
      const delay = Math.min(30_000, 1000 * Math.pow(2, Math.min(attempts, 5))); // 1,2,4,8,16,30s
      reconnectTimer = setTimeout(connect, delay);
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
  }, [session]);

  return { status, lastEvent };
}
