"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";

export type WsEvent =
  | { type: "hello";     data: { companyId: number; userId: number | undefined } }
  | { type: "pong";      data: { t: number } }
  | { type: "checklist:created"; data: Record<string, unknown> }
  | { type: "checklist:updated"; data: Record<string, unknown> }
  | { type: "checklist:deleted"; data: { id: string } };

export type WsStatus = "idle" | "connecting" | "open" | "closed" | "error";

export function useChecklistWebSocket(onEvent: (evt: WsEvent) => void) {
  const { session } = useAuth();
  const [status, setStatus] = useState<WsStatus>("idle");
  const [lastEvent, setLastEvent] = useState<WsEvent | null>(null);

  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

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
    if (!session) {
      setStatus("idle");
      return;
    }

    let ws: WebSocket | null = null;
    let pingInterval: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let manuallyClosed = false;

    const scheduleReconnect = () => {
      if (manuallyClosed) return;
      attempts += 1;
      const delay = Math.min(30_000, 1000 * Math.pow(2, Math.min(attempts, 5)));
      reconnectTimer = setTimeout(connect, delay);
    };

    const connect = () => {
      if (manuallyClosed) return;
      setStatus("connecting");
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        setStatus("error");
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        attempts = 0;
        setStatus("open");
        pingInterval = setInterval(() => {
          try { ws?.send(JSON.stringify({ type: "ping" })); } catch { /* noop */ }
        }, 25_000);
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as WsEvent;
          setLastEvent(msg);
          if (
            msg.type === "checklist:created" ||
            msg.type === "checklist:updated" ||
            msg.type === "checklist:deleted"
          ) {
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

    connect();

    return () => {
      manuallyClosed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pingInterval) clearInterval(pingInterval);
      if (ws) {
        try { ws.close(); } catch { /* noop */ }
      }
    };
  }, [session, wsUrl]);

  return { status, lastEvent };
}