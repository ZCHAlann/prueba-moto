// components/ui/FloatingChatWidget.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Widget flotante UNIFICADO del chat ApliSmart Motors (jul 2026 v8.2).
//
// Cambios v8.2:
//   ✅ Fix: comparaciones remitente_id === myUserId ahora usan Number(...)
//      de ambos lados (evita mismatch string vs number).
//   ✅ Fix: showHeader calculado por mensaje (agrupa racha del mismo
//      remitente, evita avatar+nombre repetido en cada línea).
//   ✅ Fix: conversacionesRef para que la notificación del navegador no
//      use un closure viejo de `conversaciones` dentro del handler WS.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback } from "react";
import {
  MessageCircle, X, Search, Plus, Loader2, Sparkles, ArrowLeft,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { FloatingAiAssistant } from "./FloatingAiAssistant";
import { MessageBubble, type MessageBubbleData } from "./chat/MessageBubble";
import { MessageInput, type PendingAttachment } from "./chat/MessageInput";
import { TypingIndicator } from "./chat/TypingIndicator";
import type { MessageEstado } from "./chat/MessageStatus";
import type { Reaccion } from "./chat/MessageReactions";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ConversacionResumen {
  id: number;
  public_id: string;
  tipo: "directo" | "grupo";
  nombre: string | null;
  otro_participante: {
    user_id: number;
    name: string;
    rol: string;
    avatar_url: string | null;
    online: boolean;
  } | null;
  ultimo_mensaje: {
    contenido: string | null;
    tipo: "texto" | "imagen" | "ubicacion" | "archivo";
    creado_en: string;
  } | null;
  no_leidos: number;
  actualizado_en: string;
}

interface MensajeBackend {
  id: number;
  public_id: string;
  conversacion_id: number;
  remitente_id: number;
  remitente_nombre?: string;
  remitente_avatar_url?: string | null;
  contenido: string | null;
  tipo: "texto" | "imagen" | "ubicacion" | "archivo";
  adjunto_url: string | null;
  adjunto_mime_type: string | null;
  adjunto_size_bytes: number | null;
  creado_en: string;
  reacciones?: Reaccion[];
  leido_por?: Array<{ usuario_id: number; leido_en: string }>;
  /**
   * UUID generado por el cliente al crear el placeholder. El backend lo
   * devuelve en `mensaje:recibido` y se usa para matchear placeholder ↔
   * real sin comparar por contenido (que causaba duplicación cuando el
   * user enviaba el mismo texto dos veces).
   */
  client_msg_id?: string | null;
}

interface Usuario {
  id: number;
  name: string;
  email: string;
  rol: string;
  online: boolean;
}

type SidebarMode = "list" | "new-conv";
type TabId = "messages" | "assistant";

// ─── Constantes de layout ───────────────────────────────────────────────────

const FAB_SIZE = 56;
const FAB_MARGIN = 24;
const DRAG_THRESHOLD = 4;
const PANEL_DESKTOP_W        = 800;
const PANEL_DESKTOP_H_RATIO  = 0.85;
const PANEL_DESKTOP_H_MAX_PX = 820;
const GROUP_GAP_MS = 5 * 60 * 1000; // 5 min → si pasa más tiempo, se rompe la racha

// ─── Componente principal ───────────────────────────────────────────────────

export function FloatingChatWidget() {
  const { session, companyId } = useAuth();

  // ── Estado del panel ──────────────────────────────────────────────────
  type Phase = "closed" | "opening" | "open" | "closing";
  const [phase, setPhase] = useState<Phase>("closed");
  const isOpen = phase === "open" || phase === "opening" || phase === "closing";
  const setIsOpen = (v: boolean | ((prev: boolean) => boolean)) => {
    setPhase(prev => {
      const current = prev === "open" || prev === "opening";
      const target = typeof v === "function" ? v(current) : v;
      if (target && !current) {
        setTimeout(() => setPhase(p => p === "opening" ? "open" : p), 200);
        return "opening";
      }
      if (!target && current) {
        setTimeout(() => setPhase(p => p === "closing" ? "closed" : p), 200);
        return "closing";
      }
      return prev;
    });
  };
  const [activeTab, setActiveTab] = useState<TabId>("messages");
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [conversaciones, setConversaciones] = useState<ConversacionResumen[]>([]);
  const [mensajes, setMensajes] = useState<MensajeBackend[]>([]);
  const [estadosPorMensaje, setEstadosPorMensaje] = useState<Record<number, MessageEstado>>({});
  // Paginación cursor-based (jul 2026 v8.2).
  const [hasMore, setHasMore] = useState(true);          // ¿hay mensajes más viejos?
  const [loadingMore, setLoadingMore] = useState(false); // true cuando estamos cargando una página más vieja
  // Refs para el load-more-on-scroll-up: el cursor (id del mensaje más
  // viejo en pantalla) y el estado de scroll que hay que restaurar después
  // de preprender los mensajes viejos (si no, el user salta al fondo).
  const oldestMessageIdRef = useRef<number | null>(null);
  const prevScrollStateRef = useRef<{ height: number; top: number } | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<number, Array<{ user_id: number; name: string }>>>({});
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("list");
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [searchUsers, setSearchUsers] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const totalUnread = conversaciones.reduce((acc, c) => acc + c.no_leidos, 0);

  // ── Notificaciones (jul 2026 v8.2) ──────────────────────────────────────
  //
  // Tres formas de notificar al user que llegó un mensaje:
  //   1. Sonido "pop" generado con Web Audio API (no requiere archivo).
  //   2. Flash en el título de la pestaña (para cuando el user está en
  //      otra tab del browser).
  //   3. Highlight amarillo en el bubble del mensaje nuevo (2s fade).
  //
  // Los tres se disparan SOLO cuando el mensaje viene de OTRO user.
  // ───────────────────────────────────────────────────────────────────────
  const audioCtxRef = useRef<AudioContext | null>(null);
  const titleFlashIntervalRef = useRef<number | null>(null);
  const originalTitleRef = useRef<string>('');
  // Set de IDs de mensajes que acaban de llegar — el MessageBubble chequea
  // si su id está en este set para mostrar el highlight amarillo.
  const newMessageIdsRef = useRef<Set<number>>(new Set());

  // Sonido "ding" usando Web Audio API. 0.3s, 800Hz, volumen bajo.
  function playNotificationSound() {
    try {
      if (!audioCtxRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
        if (!Ctx) return;
        audioCtxRef.current = new Ctx();
      }
      const ctx = audioCtxRef.current;
      // Si el contexto está suspended (autoplay policy), lo resume.
      if (ctx.state === 'suspended') void ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      osc.type = 'sine';
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.start(t);
      osc.stop(t + 0.3);
    } catch {
      /* silent — si el browser no soporta Web Audio, no suena pero no rompe */
    }
  }

  // Flash en el título de la pestaña: alterna entre "💬 Nuevo mensaje de X"
  // y el título original cada 1s. Se para cuando el user hace focus en
  // la tab o cuando hace click en algún mensaje de la conv.
  function startTitleFlash(senderName: string) {
    if (titleFlashIntervalRef.current) return;
    if (!originalTitleRef.current) {
      originalTitleRef.current = document.title;
    }
    let visible = false;
    titleFlashIntervalRef.current = window.setInterval(() => {
      document.title = visible
        ? `💬 Nuevo mensaje de ${senderName}`
        : originalTitleRef.current;
      visible = !visible;
    }, 1000);
  }
  function stopTitleFlash() {
    if (titleFlashIntervalRef.current) {
      clearInterval(titleFlashIntervalRef.current);
      titleFlashIntervalRef.current = null;
    }
    if (originalTitleRef.current) {
      document.title = originalTitleRef.current;
    }
  }

  // Parar el flash cuando el user vuelve a la tab.
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) stopTitleFlash();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Cleanup al desmontar.
  useEffect(() => {
    return () => {
      stopTitleFlash();
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, []);

  // ── WebSocket ───────────────────────────────────────────────────────
  const wsRef = useRef<WebSocket | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsReconnecting, setWsReconnecting] = useState(false);
  // Cuando el WS se reconecta, este ref queda true hasta que el join +
  // refetch del active conv se hagan. Sirve para que el useEffect de
  // abajo sepa que tiene que refetchear (no solo enviar el join).
  const wasDisconnectedRef = useRef(false);

  // ── Permisos ────────────────────────────────────────────────────────
  const myUserId = (() => {
    if (!session?.id) return 0;
    const match = String(session.id).match(/(\d+)$/);
    return match ? Number(match[1]) : 0;
  })();
  const myName = session?.name ?? "";
  const myAvatarUrl = session?.photoUrl ?? null;

  const canUseAssistant =
    !!session &&
    !!companyId &&
    (session.role === "admin_empresa" || session.role === "owner_empresa") &&
    (session.companyModules ?? []).includes("jarvis");

  useEffect(() => {
    if (activeTab === "assistant" && !canUseAssistant) {
      setActiveTab("messages");
    }
  }, [activeTab, canUseAssistant]);

  // ── FAB draggable ────────────────────────────────────────────────────
  const constrainFabPos = (x: number, y: number): { x: number; y: number } => {
    if (typeof window === "undefined") return { x, y };
    const maxX = window.innerWidth  - FAB_SIZE - FAB_MARGIN;
    const maxY = window.innerHeight - FAB_SIZE - FAB_MARGIN;
    return {
      x: Math.max(FAB_MARGIN, Math.min(maxX, x)),
      y: Math.max(FAB_MARGIN, Math.min(maxY, y)),
    };
  };
  const getInitialFabPos = (): { x: number; y: number } => {
    if (typeof window === "undefined") return { x: FAB_MARGIN, y: FAB_MARGIN };
    try {
      const stored = localStorage.getItem("chat.fab.pos");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
          return constrainFabPos(parsed.x, parsed.y);
        }
      }
    } catch {}
    return { x: FAB_MARGIN, y: FAB_MARGIN };
  };
  const [fabPos, setFabPos] = useState(getInitialFabPos);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number; pointerStartX: number; pointerStartY: number;
    fabStartX: number; fabStartY: number; moved: boolean;
  } | null>(null);
  const fabRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  function onFabPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      pointerStartX: e.clientX,
      pointerStartY: e.clientY,
      fabStartX: fabPos.x, fabStartY: fabPos.y,
      moved: false,
    };
    setIsDragging(true);
  }
  function onFabPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.pointerStartX;
    const dy = e.clientY - d.pointerStartY;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    const next = constrainFabPos(d.fabStartX - dx, d.fabStartY - dy);
    setFabPos(next);
  }
  function onFabPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d) return;
    try { (e.currentTarget as HTMLDivElement).releasePointerCapture(d.pointerId); } catch {}
    const wasDrag = d.moved;
    dragRef.current = null;
    setIsDragging(false);
    if (wasDrag) {
      try { localStorage.setItem("chat.fab.pos", JSON.stringify(fabPos)); } catch {}
    } else {
      setIsOpen((v) => !v);
    }
  }

  useEffect(() => {
    const onResize = () => setFabPos((p) => constrainFabPos(p.x, p.y));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!panelRef.current?.contains(t) && !t.closest(".chat-fab")) setIsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  // ── REST: conversaciones ─────────────────────────────────────────────
  const loadConversaciones = useCallback(async () => {
    if (!companyId) return;
    setLoadingConvs(true);
    try {
      const res = await fetch(`/api/company/${companyId}/chat/conversaciones`, {
        credentials: "include",
      });
      if (!res.ok) { setConversaciones([]); return; }
      const body = await res.json();
      setConversaciones(body.data ?? []);
    } catch { setConversaciones([]); }
    finally { setLoadingConvs(false); }
  }, [companyId]);

  useEffect(() => {
    if (isOpen && activeTab === "messages") void loadConversaciones();
  }, [isOpen, activeTab, loadConversaciones]);

  // ── REST: mensajes ──────────────────────────────────────────────────
  // jul 2026 v8.2: paginación cursor-based.
  //   - `before === null`  → carga inicial: últimos 20 mensajes.
  //   - `before === <id>`  → carga una página de mensajes más viejos.
  // El backend devuelve { data, has_more, next_cursor }.
  const loadMensajes = useCallback(async (convId: number, before: number | null = null) => {
    if (!companyId) return;
    const isInitialLoad = before === null;
    if (isInitialLoad) {
      setActiveConvId(convId);
      setLoadingMsgs(true);
      setMensajes([]);
      setEstadosPorMensaje({});
      setHasMore(true);
      oldestMessageIdRef.current = null;
    } else {
      setLoadingMore(true);
      // Guardamos el estado de scroll ANTES de que se preprendan los
      // mensajes viejos, para poder restaurarlo después.
      const el = threadScrollRef.current;
      if (el) {
        prevScrollStateRef.current = {
          height: el.scrollHeight,
          top: el.scrollTop,
        };
      }
    }
    try {
      const params = new URLSearchParams();
      if (before !== null) params.set('before', String(before));
      params.set('limit', '20');
      const res = await fetch(
        `/api/company/${companyId}/chat/conversaciones/${convId}/mensajes?${params.toString()}`,
        { credentials: 'include' },
      );
      if (!res.ok) {
        if (isInitialLoad) setMensajes([]);
        setHasMore(false);
        return;
      }
      const body = await res.json();
      const list: MensajeBackend[] = body.data ?? [];
      const hasMoreFromServer: boolean = !!body.has_more;
      setHasMore(hasMoreFromServer);

      if (isInitialLoad) {
        setMensajes(list);
        // FIX jul 2026 v8.2: forzar scroll al fondo SIEMPRE en carga
        // inicial. El useEffect de auto-scroll depende de "nearBottom",
        // pero cuando el thread está vacío (scrollHeight=0, scrollTop=0)
        // la condición no se cumple de forma confiable. Hacemos el scroll
        // explícitamente en el próximo frame, cuando el DOM ya tenga los
        // mensajes renderizados.
        requestAnimationFrame(() => {
          const el = threadScrollRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        });
      } else {
        // Prepend: descartar duplicados (defense in depth, no debería haber)
        setMensajes(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const nuevos = list.filter(m => !existingIds.has(m.id));
          return [...nuevos, ...prev];
        });
      }

      // Inicializar estado de mis mensajes (solo en carga inicial; en
      // paginación los mensajes viejos ya tienen su estado).
      if (isInitialLoad) {
        const estados: Record<number, MessageEstado> = {};
        for (const m of list) {
          if (Number(m.remitente_id) === Number(myUserId)) {
            const readByOthers = (m.leido_por ?? []).some(l => Number(l.usuario_id) !== Number(myUserId));
            estados[m.id] = readByOthers ? 'read' : 'delivered';
          }
        }
        setEstadosPorMensaje(estados);
        setConversaciones(prev => prev.map(c => c.id === convId ? { ...c, no_leidos: 0 } : c));
      }

      // Actualizar cursor (id del mensaje más viejo en pantalla).
      if (list.length > 0) {
        oldestMessageIdRef.current = list[0].id;
      }
    } catch {
      if (isInitialLoad) setMensajes([]);
      setHasMore(false);
    } finally {
      if (isInitialLoad) setLoadingMsgs(false);
      else setLoadingMore(false);
    }
  }, [companyId, myUserId]);

  // Cuando cambia la conversación, resetear cursor y refs.
  useEffect(() => {
    if (activeConvId === null) {
      oldestMessageIdRef.current = null;
      setHasMore(true);
    }
  }, [activeConvId]);

  // ── REST: usuarios ──────────────────────────────────────────────────
  const loadUsuarios = useCallback(async () => {
    if (!companyId) return;
    setLoadingUsers(true);
    try {
      const res = await fetch(`/api/company/${companyId}/chat/usuarios`, {
        credentials: "include",
      });
      if (!res.ok) { setUsuarios([]); return; }
      const body = await res.json();
      setUsuarios(body.data ?? []);
    } catch { setUsuarios([]); }
    finally { setLoadingUsers(false); }
  }, [companyId]);

  async function startConversationWith(otherUserId: number) {
    if (!companyId) return;
    try {
      const res = await fetch(`/api/company/${companyId}/chat/conversaciones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tipo: "directo", participantes_ids: [otherUserId] }),
      });
      if (!res.ok) return;
      const body = await res.json();
      const newConvId = body.data.id;
      setSidebarMode("list");
      await loadConversaciones();
      void loadMensajes(newConvId);
    } catch { /* noop */ }
  }

  // Refs para usar valores actuales dentro de los handlers del WS
  // (evitan closures viejos dentro de ws.onmessage).
  const activeConvIdRef = useRef<number | null>(null);
  const myUserIdRef     = useRef<number>(0);
  const conversacionesRef = useRef<ConversacionResumen[]>([]);
  useEffect(() => { activeConvIdRef.current = activeConvId; }, [activeConvId]);
  useEffect(() => { myUserIdRef.current = myUserId; }, [myUserId]);
  useEffect(() => { conversacionesRef.current = conversaciones; }, [conversaciones]);

  // FIX jul 2026 v8.2: timer por placeholder para detectar "ghost sends".
  // Antes, si el WS se abría bien pero el server moría después de recibir
  // el mensaje (o si el broadcast se perdía), el placeholder quedaba en
  // "sending" para siempre — el `sendWS` solo verifica que el WS esté
  // ABIERTO al momento de enviar, no que el mensaje se haya confirmado.
  //
  // Ahora: al crear un placeholder, setear un timer de 10s. Si en ese
  // tiempo el placeholder sigue en "sending" (porque el `mensaje:recibido`
  // del broadcast no llegó), marcar como "failed" para que el user pueda
  // reintentar. El UNIQUE INDEX + idempotency check del backend garantiza
  // que el retry no cree duplicados aunque el original SÍ se haya
  // persistido.
  const pendingTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  // Limpiar todos los timers al desmontar.
  useEffect(() => {
    return () => {
      for (const t of pendingTimersRef.current.values()) clearTimeout(t);
      pendingTimersRef.current.clear();
    };
  }, []);

  // ── WebSocket connect (jul 2026 v8.2: con auto-reconnect) ────────────
  //
  // Antes: si el WS se cerraba (internet cayó, server reinició, etc.), el
  // `onclose` solo seteaba wsRef.current = null y listo. El user tenía que
  // recargar la página para reconectar. Resultado: mientras estabas
  // desconectado, los mensajes que el otro user mandaba NO llegaban en
  // tiempo real, y los que vos mandabas durante la ventana de
  // desconexión tampoco se enteraban en el otro lado.
  //
  // Ahora: cuando el WS se cierra, reintenta con backoff exponencial
  // (1s, 2s, 4s, 8s, 16s, 30s max) hasta que conecte. Cuando reconecta,
  // el useEffect de join (más abajo) reenvía el `conversacion:unirse`
  // y refetchea los mensajes del active conv para no perder lo que se
  // mandó mientras estábamos offline.
  useEffect(() => {
    if (!isOpen || !companyId || !session) return;
    if (wsRef.current) return;

    let closed = false;
    let attempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const MAX_RECONNECT_DELAY = 30000;

    const connect = () => {
      if (closed) return;
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${proto}//${window.location.host}/ws/chat`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        setWsReconnecting(false);
        attempt = 0;
      };

      ws.onerror = () => {
        setWsConnected(false);
      };

      ws.onclose = () => {
        wsRef.current = null;
        setWsConnected(false);
        wasDisconnectedRef.current = true; // Para que el join refetchee al reconectar.
        if (closed) return;
        // Reintentar con backoff exponencial.
        attempt++;
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), MAX_RECONNECT_DELAY);
        setWsReconnecting(true);
        if (attempt === 1 || attempt % 4 === 0) {
          console.log(`[chat-ws] disconnected, reconnecting in ${Math.round(delay/1000)}s (attempt ${attempt})`);
        }
        reconnectTimer = setTimeout(connect, delay);
      };

    ws.onmessage = (ev) => {
      let msg: any;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (!msg || typeof msg !== "object") return;

      switch (msg.type) {
        case "hello":
          break;

        case "mensaje:recibido": {
          const m = msg.data;
          const isFromOther = Number(m.remitente_id) !== Number(myUserIdRef.current);

          setMensajes(prev => {
            // FIX jul 2026 v8.2: solo agregar si es de la conv activa.
            // Antes se podía meter un mensaje de OTRA conv (a la que el
            // user también pertenece pero no está mirando) en el thread
            // de la conv actual. Esto lo evitaba solo el activeConvId
            // check en "no_leidos" — los mensajes en sí se mezclaban.
            if (Number(m.conversacion_id) !== Number(activeConvIdRef.current)) return prev;
            if (prev.some(x => x.id === m.id)) return prev;
            // FIX jul 2026 v8.2: marcar el mensaje como "recién llegado"
            // para que el MessageBubble muestre un highlight amarillo
            // que se desvanece. Se quita del set después de 2s.
            if (isFromOther) {
              newMessageIdsRef.current.add(m.id);
              window.setTimeout(() => {
                newMessageIdsRef.current.delete(m.id);
                // Forzar re-render del bubble (sin setState explícito,
                // el setMensajes abajo lo va a triggerear).
                setMensajes(p => [...p]);
              }, 2000);
            }
            const newMsg: MensajeBackend = { ...m, reacciones: [], leido_por: [] };
            return [...prev, newMsg];
          });
          // Si YO soy el remitente, marcar como 'sent' (el server confirmó persistencia).
          if (!isFromOther) {
            setEstadosPorMensaje(prev => ({ ...prev, [m.id]: "sent" }));
          }
          setConversaciones(prev => prev.map(c =>
            c.id === m.conversacion_id
              ? {
                  ...c,
                  actualizado_en: m.creado_en,
                  ultimo_mensaje: { contenido: m.contenido, tipo: m.tipo, creado_en: m.creado_en },
                  no_leidos: (m.conversacion_id === activeConvIdRef.current || !isFromOther)
                    ? c.no_leidos
                    : c.no_leidos + 1,
                }
              : c
          ).sort((a, b) => new Date(b.actualizado_en).getTime() - new Date(a.actualizado_en).getTime()));

          // ── Notificaciones (jul 2026 v8.2) ──────────────────────
          // 1. Sonido "ding" cuando llega un mensaje de otro.
          // 2. Flash en el título de la pestaña (intercalando "💬 Nuevo
          //    mensaje de X" con el título original cada 1s).
          // 3. Browser notification nativa (ya estaba) si el panel está
          //    cerrado, en otra tab, o en otra conv.
          // 4. Highlight amarillo en el bubble (markeado arriba vía
          //    newMessageIdsRef).
          if (isFromOther) {
            playNotificationSound();
            const senderName =
              conversacionesRef.current.find(c => c.id === m.conversacion_id)
                ?.otro_participante?.name ?? "Nuevo mensaje";
            startTitleFlash(senderName);

            const panelHidden = document.hidden || !isOpen || activeConvIdRef.current !== m.conversacion_id;
            if (panelHidden && "Notification" in window && Notification.permission === "granted") {
              new Notification(senderName, {
                body: m.tipo === "texto" ? (m.contenido ?? "") : m.tipo === "imagen" ? "📷 Imagen" : "📎 Archivo",
                icon: "/favicon.ico",
                tag: `chat-${m.conversacion_id}`,
              });
            }
          }
          break;
        }

        case "mensaje:entregado": {
          const { mensaje_id, leido_por, entregado_a } = msg.data;
          void leido_por; void entregado_a;
          setEstadosPorMensaje(prev => {
            const cur = prev[mensaje_id];
            if (cur === "sending" || cur === "sent") return { ...prev, [mensaje_id]: "delivered" };
            return prev;
          });
          break;
        }

        case "mensaje:leido:confirmado": {
          const { mensaje_id, usuario_id } = msg.data;
          if (Number(usuario_id) !== Number(myUserIdRef.current)) {
            setEstadosPorMensaje(prev => ({ ...prev, [mensaje_id]: "read" }));
            setMensajes(prev => prev.map(m =>
              m.id === mensaje_id
                ? { ...m, leido_por: [...(m.leido_por ?? []), { usuario_id, leido_en: new Date().toISOString() }] }
                : m
            ));
          }
          break;
        }

        case "typing:actualizado": {
          const { conversacion_id, usuario_id, escribiendo } = msg.data;
          if (Number(usuario_id) === Number(myUserIdRef.current)) break;
          setTypingUsers(prev => {
            const arr = prev[conversacion_id] ?? [];
            const has = arr.some(u => u.user_id === usuario_id);
            let next: typeof arr;
            if (escribiendo && !has) next = [...arr, { user_id: usuario_id, name: "" }];
            else if (!escribiendo && has) next = arr.filter(u => u.user_id !== usuario_id);
            else next = arr;
            return { ...prev, [conversacion_id]: next };
          });
          break;
        }

        case "reaccion:actualizada": {
          const { mensaje_id, reacciones } = msg.data;
          setMensajes(prev => prev.map(m =>
            m.id === mensaje_id ? { ...m, reacciones } : m
          ));
          break;
        }

        case "presence:actualizado": {
          setConversaciones(prev => prev.map(c => {
            if (c.otro_participante?.user_id === msg.data.user_id) {
              return {
                ...c,
                otro_participante: { ...c.otro_participante, online: msg.data.online },
              };
            }
            return c;
          }));
          break;
        }

        case "error":
          console.warn("[chat] ws error:", msg.data);
          break;

        default:
          break;
      }
    };
    };  // FIX jul 2026 v8.2: cierra la función `connect`

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try { wsRef.current?.close(); } catch { /* noop */ }
      wsRef.current = null;
      setWsConnected(false);
      setWsReconnecting(false);
    };
  }, [isOpen, companyId, session, myUserId]);

  // Unirse a la conversación activa + refetch en reconexión.
  //
  // Cuando el WS se reconecta (wasDisconnectedRef = true), hacemos dos
  // cosas: reenviar el join al room Y refetchear los mensajes del active
  // conv. Esto es lo que hace que los mensajes enviados durante la
  // ventana de desconexión aparezcan en el receptor (felipe, en el caso
  // típico) sin necesidad de recargar la página.
  useEffect(() => {
    if (!wsConnected || !activeConvId) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "conversacion:unirse", conversacion_id: activeConvId }));
    if (wasDisconnectedRef.current) {
      wasDisconnectedRef.current = false;
      console.log('[chat] WS reconnected, refetching active conv messages');
      void loadMensajes(activeConvId, null);
    }
  }, [wsConnected, activeConvId, loadMensajes]);

  // ── Enviar mensaje (con attachment) ─────────────────────────────────
  const sendWS = useCallback((payload: object) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(payload));
    return true;
  }, []);

  const placeholderIdRef = useRef(0);

  const handleSend = useCallback((text: string, attachment?: { url: string; mime_type: string; size_bytes: number; filename: string }) => {
    const convId = activeConvId;
    if (!convId) return;
    if (!text.trim() && !attachment) return;

    const tempId = --placeholderIdRef.current;
    const now = new Date().toISOString();
    const isImg = attachment?.mime_type?.startsWith("image/") ?? false;
    // FIX jul 2026: si hay attachment, el tipo siempre es "imagen" o "archivo",
    // NUNCA "texto". Antes caía en "texto" cuando el user escribía caption
    // + adjuntaba archivo en el mismo send, y el archivo quedaba invisible
    // porque MessageBubble solo renderiza la card si m.tipo === "archivo".
    const tipo: "texto" | "imagen" | "archivo" = attachment
      ? (isImg ? "imagen" : "archivo")
      : "texto";

    // FIX jul 2026 v2: UUID local para matchear placeholder ↔ real.
    // Si NO lo tuviéramos, el useEffect de reemplazo matchearía por contenido,
    // y al enviar "Hola" dos veces el placeholder #2 se matchearía con el
    // mensaje real #1 (mismo contenido), causando que el placeholder #2
    // fuera reemplazado por el viejo y el nuevo real #2 quedara aparte.
    // Resultado: dos "Hola" en pantalla cuando el user solo envió dos.
    const clientMsgId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    // Optimistic add.
    const optimistic: MensajeBackend = {
      id: tempId,
      public_id: `temp-${tempId}`,
      conversacion_id: convId,
      remitente_id: myUserId,
      remitente_nombre: myName,
      remitente_avatar_url: myAvatarUrl,
      contenido: text.trim() || null,
      tipo,
      adjunto_url: attachment?.url ?? null,
      adjunto_mime_type: attachment?.mime_type ?? null,
      adjunto_size_bytes: attachment?.size_bytes ?? null,
      creado_en: now,
      reacciones: [],
      leido_por: [],
      client_msg_id: clientMsgId,
    };
    setMensajes(prev => [...prev, optimistic]);
    setEstadosPorMensaje(prev => ({ ...prev, [tempId]: "sending" }));

    // Timer de "ghost send": si en 10s el placeholder sigue en "sending"
    // (porque el broadcast `mensaje:recibido` no llegó), marcar como failed.
    const SEND_TIMEOUT_MS = 10000;
    const timer = setTimeout(() => {
      setEstadosPorMensaje(prev => {
        // Si el useEffect de matching ya borró el entry del placeholder
        // (porque llegó el real con el mismo client_msg_id), no hacer nada.
        if (!(tempId in prev)) return prev;
        if (prev[tempId] !== 'sending') return prev;
        return { ...prev, [tempId]: 'failed' };
      });
      pendingTimersRef.current.delete(tempId);
    }, SEND_TIMEOUT_MS);
    pendingTimersRef.current.set(tempId, timer);

    const ok = sendWS({
      type: "mensaje:enviar",
      conversacion_id: convId,
      contenido: text.trim() || null,
      tipo,
      adjunto_url: attachment?.url,
      adjunto_mime_type: attachment?.mime_type,
      adjunto_size_bytes: attachment?.size_bytes,
      client_msg_id: clientMsgId,
    });

    if (!ok) {
      // WS ni siquiera está abierto. Marcamos failed inmediatamente y
      // limpiamos el timer.
      setEstadosPorMensaje(prev => ({ ...prev, [tempId]: "failed" }));
      clearTimeout(timer);
      pendingTimersRef.current.delete(tempId);
    }
  }, [activeConvId, myUserId, myName, myAvatarUrl, sendWS]);

  // Reemplazar placeholders con el mensaje real cuando llega por WS.
  //
  // FIX jul 2026 v3: match ESTRICTO por client_msg_id (UUID), SIN fallback
  // por contenido. El fallback era responsable de la duplicación residual:
  // cuando el user carga la conversación, los mensajes del historial
  // (vía GET) NO tienen client_msg_id (mensajes viejos de antes del fix
  // o mensajes que se persistieron sin el campo). Al enviar un nuevo
  // "Hola" con el mismo contenido que un mensaje viejo, el placeholder
  // matcheaba por contenido con el viejo, se reemplazaba, y el real
  // nuevo quedaba aparte → dos "Hola" en pantalla.
  //
  // Ahora el match es ESTRICTO: si alguno de los dos no tiene UUID, no
  // matchean. Los placeholders quedan en "sending" hasta que llegue un
  // real con el MISMO UUID (que sí va a llegar si el backend está
  // actualizado y devuelve client_msg_id en mensaje:recibido).
  //
  // El UNIQUE INDEX (remitente_id, client_msg_id) en la DB garantiza
  // que el backend no cree duplicados aunque el cliente reenvíe el
  // mismo UUID (caso retry).
  useEffect(() => {
    setMensajes(prev => {
      const placeholders = prev.filter(m => m.id < 0 && Number(m.remitente_id) === Number(myUserId));
      if (placeholders.length === 0) return prev;

      const usedRealIds = new Set<number>();
      const pairs: Array<{ phId: number; real: MensajeBackend }> = [];

      for (const ph of placeholders) {
        // Placeholder sin client_msg_id no puede matchear nada (es código
        // legacy de antes del fix). Lo dejamos en "sending" por ahora.
        if (!ph.client_msg_id) continue;

        const real = prev.find(r => {
          if (r.id <= 0) return false;
          if (usedRealIds.has(r.id)) return false;
          if (r.conversacion_id !== ph.conversacion_id) return false;
          if (Number(r.remitente_id) !== Number(myUserId)) return false;
          // ESTRICTO: solo match por UUID. Ambos deben tenerlo.
          if (!r.client_msg_id) return false;
          return r.client_msg_id === ph.client_msg_id;
        });
        if (real) {
          usedRealIds.add(real.id);
          pairs.push({ phId: ph.id, real });
        }
      }

      if (pairs.length === 0) return prev;

      const phToReal = new Map(pairs.map(p => [p.phId, p.real]));
      const realIdsToSkip = new Set(pairs.map(p => p.real.id));

      // Reconstruimos: donde estaba el placeholder, va el real. La entrada
      // "real" original (que llegó suelta por WS) se descarta, ya que ahora
      // vive en la posición del placeholder.
      const next: MensajeBackend[] = [];
      for (const m of prev) {
        if (phToReal.has(m.id)) {
          next.push(phToReal.get(m.id)!);
          continue;
        }
        if (m.id > 0 && realIdsToSkip.has(m.id)) {
          continue;
        }
        next.push(m);
      }

      setEstadosPorMensaje(p => {
        const n = { ...p };
        for (const { phId, real } of pairs) {
          const est = n[phId] ?? "sent";
          delete n[phId];
          n[real.id] = est;
          // FIX jul 2026 v8.2: limpiar el timer del placeholder — el match
          // fue exitoso, no necesitamos marcar como failed.
          const timer = pendingTimersRef.current.get(phId);
          if (timer) {
            clearTimeout(timer);
            pendingTimersRef.current.delete(phId);
          }
        }
        return n;
      });

      return next;
    });
  }, [mensajes, myUserId]);

  const handleRetry = useCallback((tempId: number) => {
    setMensajes(prev => {
      const m = prev.find(x => x.id === tempId);
      if (!m) return prev;
      setEstadosPorMensaje(p => ({ ...p, [tempId]: "sending" }));
      // Re-setear el timer para el retry (limpia el anterior si existe).
      const oldTimer = pendingTimersRef.current.get(tempId);
      if (oldTimer) clearTimeout(oldTimer);
      const SEND_TIMEOUT_MS = 10000;
      const timer = setTimeout(() => {
        setEstadosPorMensaje(p => {
          if (!(tempId in p)) return p;
          if (p[tempId] !== 'sending') return p;
          return { ...p, [tempId]: 'failed' };
        });
        pendingTimersRef.current.delete(tempId);
      }, SEND_TIMEOUT_MS);
      pendingTimersRef.current.set(tempId, timer);

      const ok = sendWS({
        type: "mensaje:enviar",
        conversacion_id: m.conversacion_id,
        contenido: m.contenido,
        tipo: m.tipo,
        adjunto_url: m.adjunto_url,
        adjunto_mime_type: m.adjunto_mime_type,
        adjunto_size_bytes: m.adjunto_size_bytes,
        // Reenviamos el mismo UUID para que el backend pueda deduplicar
        // si el mensaje original ya estaba persistido y la falla fue
        // solo un glitch de transporte.
        client_msg_id: m.client_msg_id ?? undefined,
      });
      if (!ok) {
        setEstadosPorMensaje(p => ({ ...p, [tempId]: "failed" }));
        clearTimeout(timer);
        pendingTimersRef.current.delete(tempId);
      }
      return prev;
    });
  }, [sendWS]);

  // ── Reacciones: toggle ─────────────────────────────────────────────
  const handleToggleReaction = useCallback((mensajeId: number, emoji: string) => {
    const msg = mensajes.find(m => m.id === mensajeId);
    if (!msg) return;
    const iReacted = (msg.reacciones ?? []).some(r => Number(r.usuario_id) === Number(myUserId) && r.emoji === emoji);
    const type = iReacted ? "reaccion:quitar" : "reaccion:agregar";
    sendWS({ type, mensaje_id: mensajeId, emoji });
  }, [mensajes, myUserId, sendWS]);

  // ── Typing: emitir start/stop ───────────────────────────────────────
  const handleTyping = useCallback((typing: boolean) => {
    if (!activeConvId) return;
    sendWS({
      type: typing ? "typing:start" : "typing:stop",
      conversacion_id: activeConvId,
    });
  }, [activeConvId, sendWS]);

  // ── Marcar como leído: al abrir la conversación Y cuando llega un mensaje
  //    nuevo de otro user. Usa una ref para no re-marcar el mismo mensaje.
  const mensajesLeidosRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!activeConvId || mensajes.length === 0) return;
    let sent = 0;
    for (const m of mensajes) {
      // Solo mensajes del OTRO user, y que no hayamos marcado ya.
      if (Number(m.remitente_id) !== Number(myUserId) && !mensajesLeidosRef.current.has(m.id)) {
        mensajesLeidosRef.current.add(m.id);
        sendWS({ type: "mensaje:leido", mensaje_id: m.id });
        sent++;
      }
    }
    // Si no mandamos nada en este render, no logueamos.
    if (sent > 0) {
      console.debug(`[chat] marcados ${sent} mensajes como leídos en conv ${activeConvId}`);
    }
  }, [activeConvId, mensajes, myUserId, sendWS]);

  // Reset del set cuando cambia de conversación (para no perder marcas
  // de la conv anterior que ya se enviaron).
  useEffect(() => {
    mensajesLeidosRef.current = new Set();
  }, [activeConvId]);

  // ── Auto-scroll y restauración de scroll tras paginación ────────────
  //
  // Hay TRES efectos sobre el scroll del thread:
  //  1. (en useEffect más abajo) Handler onScroll que dispara loadMensajes
  //     cuando el user se acerca al tope.
  //  2. (acá) Si el user está cerca del fondo cuando llega un mensaje nuevo
  //     (o cambia de conv), scrollear al fondo. Si está lejos del fondo,
  //     respetar su posición (no scrollear forzado).
  //  3. (useEffect siguiente) Después de preprender mensajes viejos, restaurar
  //     el scroll para que el user no salte al fondo.
  const threadScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = threadScrollRef.current;
    if (!el) return;
    // Si estamos cargando más (paginación), el efecto (3) de abajo se
    // encarga de restaurar la posición. No hacemos nada acá.
    if (loadingMore) return;
    // Si hay un prevScrollState pendiente, también es el efecto (3) el
    // que se va a encargar.
    if (prevScrollStateRef.current) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [mensajes, activeConvId, typingUsers, loadingMore]);

  // Restaurar scroll después de preprender mensajes viejos (paginación).
  // Sin esto, el thread se "salta" al fondo cuando se cargan los viejos.
  useEffect(() => {
    const el = threadScrollRef.current;
    if (!el) return;
    const prev = prevScrollStateRef.current;
    if (!prev) return;
    // Esperar un frame para que el DOM actualice con los nuevos mensajes.
    requestAnimationFrame(() => {
      const newHeight = el.scrollHeight;
      const diff = newHeight - prev.height;
      el.scrollTop = prev.top + diff;
      prevScrollStateRef.current = null;
    });
  }, [mensajes, loadingMore]);

  // Handler de scroll del thread: si está cerca del tope, carga más.
  const handleThreadScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (loadingMore || !hasMore) return;
    const el = e.currentTarget;
    const oldestId = oldestMessageIdRef.current;
    if (oldestId === null) return;
    // Tope: scrollTop < 100px. Trigger load more.
    if (el.scrollTop < 100 && activeConvId !== null) {
      void loadMensajes(activeConvId, oldestId);
    }
  }, [loadingMore, hasMore, activeConvId, loadMensajes]);

  useEffect(() => {
    console.log("=== DEBUG CHAT ===");
    console.log("session.id:", session?.id, typeof session?.id);
    console.log("myUserId calculado:", myUserId, typeof myUserId);
    console.log("mensajes crudos:", mensajes.map(m => ({
      id: m.id,
      remitente_id: m.remitente_id,
      tipo_remitente_id: typeof m.remitente_id,
      remitente_nombre: m.remitente_nombre,
    })));
  }, [mensajes, myUserId, session]);

  // ── Detección mobile ─────────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // ── Gate: solo renderizar si hay sesión + empresa + módulo `chat` ──
  const canUseChat = (session?.companyModules ?? []).includes("chat");
  if (!session || !companyId || !canUseChat) return null;

  const typingForConv = activeConvId ? (typingUsers[activeConvId] ?? []) : [];

  return (
    <>
      {/* FAB */}
      <div
        ref={fabRef}
        className="chat-fab fixed z-50 select-none"
        role="button"
        tabIndex={0}
        aria-label={isOpen ? "Cerrar chat interno" : "Abrir chat interno (arrastrable)"}
        style={{
          right:  fabPos.x, bottom: fabPos.y,
          width:  FAB_SIZE, height: FAB_SIZE,
          cursor: isDragging ? "grabbing" : "grab",
          userSelect: "none", touchAction: "none",
          WebkitUserSelect: "none",
        }}
        onPointerDown={onFabPointerDown}
        onPointerMove={onFabPointerMove}
        onPointerUp={onFabPointerUp}
        onPointerCancel={onFabPointerUp}
      >
        <div
          className={`relative w-full h-full rounded-full flex items-center justify-center transition-shadow duration-300 ${
            isOpen ? "rotate-90 scale-95" : "rotate-0"
          } ${isDragging ? "scale-110" : ""}`}
          style={{
            background: "linear-gradient(135deg, #465fff 0%, #0ba5ec 100%)",
            boxShadow: isDragging
              ? "0 0 30px rgba(70,95,255,0.95), 0 0 60px rgba(11,165,236,0.6)"
              : "0 0 20px rgba(70,95,255,0.5), 0 0 40px rgba(11,165,236,0.3)",
            border: "2px solid rgba(255,255,255,0.15)",
          }}
        >
          <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/20 to-transparent opacity-30 pointer-events-none" />
          <div className="absolute inset-0 rounded-full border-2 border-white/10 pointer-events-none" />
          <div className="relative z-10 pointer-events-none">
            {isOpen ? <X className="h-7 w-7 text-white" /> : <MessageCircle className="h-7 w-7 text-white" />}
          </div>
        </div>

        {!isOpen && totalUnread > 0 && (
          <span
            key={totalUnread}
            className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-bold shadow-lg ring-2 ring-white dark:ring-[#0F172A] pointer-events-none"
            style={{ animation: "chatMessageIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both" }}
            aria-label={`${totalUnread} mensajes sin leer`}
          >
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </div>

      {/* Panel */}
      {phase !== "closed" && (
        <div
          ref={panelRef}
          className={[
            "fixed z-50 bg-white dark:bg-[#0F172A]",
            "border border-gray-200 dark:border-white/[0.06]",
            "shadow-2xl backdrop-blur-xl",
            "flex flex-col overflow-hidden",
            isMobile ? "inset-0 rounded-none" : "rounded-2xl",
          ].join(" ")}
          style={
            isMobile
              ? undefined
              : {
                  width: `min(${PANEL_DESKTOP_W}px, calc(100vw - 2rem))`,
                  height: `${PANEL_DESKTOP_H_RATIO * 100}vh`,
                  maxHeight: `${PANEL_DESKTOP_H_MAX_PX}px`,
                  bottom: fabPos.y + FAB_SIZE + 8,
                  right:  fabPos.x,
                  animation:
                    phase === "closing"
                      ? "chatPanelOut 0.2s ease-in forwards"
                      : "chatPanelIn 0.3s cubic-bezier(0.175,0.885,0.32,1.275) forwards",
                  transformOrigin: "bottom right",
                }
          }
        >
          {/* Tabs */}
          <div className="flex items-center gap-1 p-1.5 shrink-0 border-b border-gray-100 dark:border-white/[0.06] bg-gray-50/50 dark:bg-white/[0.02]">
            <TabButton
              active={activeTab === "messages"}
              onClick={() => setActiveTab("messages")}
              icon={<MessageCircle className="h-3.5 w-3.5" />}
              label="Mensajes"
            />
            {canUseAssistant && (
              <TabButton
                active={activeTab === "assistant"}
                onClick={() => setActiveTab("assistant")}
                icon={<Sparkles className="h-3.5 w-3.5" />}
                label="Asistente IA"
              />
            )}
          </div>

          <div className="flex-1 min-h-0 relative">
            {/* Tab: Mensajes */}
            <div className={activeTab === "messages" ? "absolute inset-0 flex" : "hidden"}>
              {/* Sidebar */}
              <div className="w-64 shrink-0 flex flex-col border-r border-gray-100 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02]">
                {sidebarMode === "list" ? (
                  <>
                    <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 dark:border-white/[0.06]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-gray-500 dark:text-white/40">Conversaciones</span>
                        {wsConnected && (
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" title="Conectado" />
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => { setSidebarMode("new-conv"); setSearchUsers(""); void loadUsuarios(); }}
                        className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-white/30 dark:hover:bg-white/[0.06] dark:hover:text-white/70"
                        title="Nueva conversación"
                        aria-label="Nueva conversación"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="px-2 py-2 border-b border-gray-100 dark:border-white/[0.04]">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 dark:text-white/25" />
                        <input
                          type="text"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="Buscar conversaciones…"
                          className={[
                            "w-full rounded-md pl-7 pr-2 py-1.5 text-[11px] outline-none transition-colors",
                            "bg-white border border-gray-200 text-gray-700 placeholder-gray-400",
                            "focus:border-blue-400",
                            "dark:bg-white/[0.04] dark:border-white/[0.06] dark:text-white/80 dark:placeholder-white/25",
                            "dark:focus:border-blue-500/50",
                          ].join(" ")}
                        />
                      </div>
                    </div>

                    <div className="chat-scroll flex-1 overflow-y-auto px-1.5 py-2 space-y-0.5">
                      {loadingConvs && (
                        <div className="flex justify-center py-8">
                          <Loader2 className="h-4 w-4 animate-spin text-gray-300 dark:text-white/20" />
                        </div>
                      )}
                      {!loadingConvs && conversaciones.length === 0 && (
                        <div className="py-8 px-2 text-center text-[11px] text-gray-400 dark:text-white/25">
                          Aún no tienes conversaciones.
                          <br />
                          Hacé click en <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-gray-200 dark:bg-white/[0.06] mx-0.5"><Plus className="h-2.5 w-2.5" /></span> para empezar.
                        </div>
                      )}
                      {conversaciones
                        .filter(c => !search.trim() || (c.otro_participante?.name ?? c.nombre ?? "").toLowerCase().includes(search.toLowerCase()))
                        .map((c) => {
                          const active = c.id === activeConvId;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => void loadMensajes(c.id)}
                              className={[
                                "w-full text-left rounded-lg transition-all border px-2.5 py-2",
                                active ? "bg-blue-50 border-blue-200 dark:bg-blue-500/[0.12] dark:border-blue-500/30"
                                       : "border-transparent hover:bg-gray-100 dark:hover:bg-white/[0.04]",
                              ].join(" ")}
                            >
                              <div className="flex items-center gap-2">
                                <div className="relative shrink-0">
                                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-blue-light-500 flex items-center justify-center text-white text-[10px] font-medium overflow-hidden">
                                    {c.otro_participante?.avatar_url ? (
                                      <img src={c.otro_participante.avatar_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                      c.otro_participante?.name?.[0]?.toUpperCase() ?? c.nombre?.[0]?.toUpperCase() ?? "?"
                                    )}
                                  </div>
                                  {c.otro_participante?.online && (
                                    <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-gray-50 dark:border-[#0F172A]" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className={[
                                      "text-[11px] font-medium truncate",
                                      active ? "text-blue-700 dark:text-blue-300" : "text-gray-700 dark:text-white/60",
                                    ].join(" ")}>
                                      {c.otro_participante?.name ?? c.nombre ?? "Conversación"}
                                    </span>
                                    {c.no_leidos > 0 && (
                                      <span className="shrink-0 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-brand-500 text-white text-[9px] font-semibold">
                                        {c.no_leidos}
                                      </span>
                                    )}
                                  </div>
                                  {c.ultimo_mensaje?.contenido && (
                                    <div className="text-[10px] mt-0.5 truncate text-gray-400 dark:text-white/25">
                                      {c.ultimo_mensaje.contenido}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 dark:border-white/[0.06]">
                      <button
                        type="button"
                        onClick={() => setSidebarMode("list")}
                        className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-white/30 dark:hover:bg-white/[0.06] dark:hover:text-white/70"
                        title="Volver"
                        aria-label="Volver"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </button>
                      <span className="text-xs font-medium text-gray-500 dark:text-white/40">Nueva conversación</span>
                    </div>
                    <div className="px-2 py-2 border-b border-gray-100 dark:border-white/[0.04]">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 dark:text-white/25" />
                        <input
                          type="text"
                          value={searchUsers}
                          onChange={(e) => setSearchUsers(e.target.value)}
                          placeholder="Buscar personas…"
                          className={[
                            "w-full rounded-md pl-7 pr-2 py-1.5 text-[11px] outline-none transition-colors",
                            "bg-white border border-gray-200 text-gray-700 placeholder-gray-400",
                            "focus:border-blue-400",
                            "dark:bg-white/[0.04] dark:border-white/[0.06] dark:text-white/80 dark:placeholder-white/25",
                            "dark:focus:border-blue-500/50",
                          ].join(" ")}
                        />
                      </div>
                    </div>
                    <div className="chat-scroll flex-1 overflow-y-auto px-1.5 py-2 space-y-0.5">
                      {loadingUsers && (
                        <div className="flex justify-center py-8">
                          <Loader2 className="h-4 w-4 animate-spin text-gray-300 dark:text-white/20" />
                        </div>
                      )}
                      {!loadingUsers && usuarios.length === 0 && (
                        <div className="py-8 px-2 text-center text-[11px] text-gray-400 dark:text-white/25">
                          No hay otros usuarios en tu empresa.
                        </div>
                      )}
                      {usuarios
                        .filter(u => !searchUsers.trim() || u.name.toLowerCase().includes(searchUsers.toLowerCase()) || u.email.toLowerCase().includes(searchUsers.toLowerCase()))
                        .map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => void startConversationWith(u.id)}
                            className="w-full text-left rounded-lg transition-all border border-transparent px-2.5 py-2 hover:bg-gray-100 dark:hover:bg-white/[0.04]"
                          >
                            <div className="flex items-center gap-2">
                              <div className="relative shrink-0">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-blue-light-500 flex items-center justify-center text-white text-[10px] font-medium">
                                  {u.name[0]?.toUpperCase() ?? "?"}
                                </div>
                                {u.online && (
                                  <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-gray-50 dark:border-[#0F172A]" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-[11px] font-medium truncate text-gray-700 dark:text-white/80">{u.name}</div>
                                <div className="text-[10px] truncate text-gray-400 dark:text-white/30">{u.rol}</div>
                              </div>
                            </div>
                          </button>
                        ))}
                    </div>
                  </>
                )}
              </div>

              {/* Thread */}
              <div className="flex-1 min-w-0 flex flex-col">
                {activeConvId == null ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-brand-500 to-blue-light-500 flex items-center justify-center mb-3 opacity-50">
                      <MessageCircle className="h-8 w-8 text-white" />
                    </div>
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90 mb-1">Chat interno</h3>
                    <p className="text-xs text-gray-500 dark:text-white/40 max-w-[260px]">
                      Seleccioná una conversación de la izquierda o empezá una nueva con el botón <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-white/[0.06] text-[10px]">+</kbd>.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Header del thread */}
                    <div className="flex items-center gap-2.5 px-4 py-3 shrink-0 border-b border-gray-100 dark:border-white/[0.06]">
                      {(() => {
                        const c = conversaciones.find(x => x.id === activeConvId);
                        const other = c?.otro_participante;
                        return (
                          <>
                            <div className="relative shrink-0">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-blue-light-500 flex items-center justify-center text-white text-[10px] font-medium overflow-hidden">
                                {other?.avatar_url ? (
                                  <img src={other.avatar_url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  other?.name?.[0]?.toUpperCase() ?? c?.nombre?.[0]?.toUpperCase() ?? "?"
                                )}
                              </div>
                              {other?.online && (
                                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-white dark:border-[#0F172A]" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-gray-800 dark:text-white/90 truncate">
                                {other?.name ?? c?.nombre ?? "Conversación"}
                              </div>
                              <div className="text-[10px] text-gray-500 dark:text-white/40 truncate flex items-center gap-1.5">
                                {/* FIX jul 2026 v8.2: indicador del estado de NUESTRO
                                    WS. Si está desconectado o reconectando, le
                                    decimos al user (porque sus mensajes pueden
                                    no llegar al otro lado en tiempo real). */}
                                {wsReconnecting ? (
                                  <>
                                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                                    <span className="text-amber-600 dark:text-amber-400">Reconectando…</span>
                                  </>
                                ) : !wsConnected ? (
                                  <>
                                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
                                    <span className="text-red-600 dark:text-red-400">Desconectado</span>
                                  </>
                                ) : other?.online ? (
                                  <>
                                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                    <span>En línea</span>
                                  </>
                                ) : other ? (
                                  <>
                                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-white/20" />
                                    <span>Desconectado</span>
                                  </>
                                ) : (
                                  c?.tipo === "grupo" ? "Grupo" : ""
                                )}
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    {/* Lista de mensajes */}
                    <div
                      ref={threadScrollRef}
                      onScroll={handleThreadScroll}
                      className="chat-scroll flex-1 overflow-y-auto px-3 py-3 space-y-1.5"
                    >
                      {/* Indicador de paginación: 3 dots que rebotan (estilo
                          WhatsApp/Slack), aparece arriba cuando se están
                          cargando mensajes más viejos. */}
                      {loadingMore && (
                        <div className="flex justify-center py-2 sticky top-0">
                          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100/80 dark:bg-white/[0.04] backdrop-blur-sm">
                            <span
                              className="w-1.5 h-1.5 rounded-full bg-gray-500 dark:bg-white/60"
                              style={{ animation: 'chatTypingBounce 1.2s infinite', animationDelay: '0ms' }}
                            />
                            <span
                              className="w-1.5 h-1.5 rounded-full bg-gray-500 dark:bg-white/60"
                              style={{ animation: 'chatTypingBounce 1.2s infinite', animationDelay: '180ms' }}
                            />
                            <span
                              className="w-1.5 h-1.5 rounded-full bg-gray-500 dark:bg-white/60"
                              style={{ animation: 'chatTypingBounce 1.2s infinite', animationDelay: '360ms' }}
                            />
                          </div>
                        </div>
                      )}
                      {loadingMsgs ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="h-4 w-4 animate-spin text-gray-300" />
                        </div>
                      ) : mensajes.length === 0 ? (
                        <div className="text-center text-xs text-gray-400 dark:text-white/25 py-8">
                          No hay mensajes todavía. ¡Mandá el primero!
                        </div>
                      ) : (
                        mensajes.map((m, idx) => {
                          const isMine = Number(m.remitente_id) === Number(myUserId);
                          const prev = mensajes[idx - 1];
                          // Header nuevo si: es el primer mensaje, cambió el remitente,
                          // o pasaron más de 5 min desde el mensaje anterior.
                          const showHeader =
                            !prev ||
                            Number(prev.remitente_id) !== Number(m.remitente_id) ||
                            (new Date(m.creado_en).getTime() - new Date(prev.creado_en).getTime()) > GROUP_GAP_MS;

                          const bubbleData: MessageBubbleData = {
                            id: m.id,
                            public_id: m.public_id,
                            remitente_id: m.remitente_id,
                            remitente_nombre: m.remitente_nombre ?? "",
                            remitente_avatar_url: m.remitente_avatar_url ?? null,
                            contenido: m.contenido,
                            tipo: m.tipo,
                            adjunto_url: m.adjunto_url,
                            adjunto_mime_type: m.adjunto_mime_type,
                            adjunto_size_bytes: m.adjunto_size_bytes,
                            creado_en: m.creado_en,
                            reacciones: m.reacciones ?? [],
                            estado: estadosPorMensaje[m.id] ?? (isMine ? "sent" : undefined),
                            is_mine: isMine,
                            showHeader,
                            onRetry: isMine && m.id < 0 ? () => handleRetry(m.id) : undefined,
                            onToggleReaction: (emoji) => handleToggleReaction(m.id, emoji),
                            // FIX jul 2026 v8.2: si el id está en el set
                            // de "recién llegados", mostrar el highlight.
                            isNew: newMessageIdsRef.current.has(m.id),
                          };
                          return (
                            <MessageBubble key={m.id} message={bubbleData} myUserId={myUserId} />
                          );
                        })
                      )}

                      {/* Typing indicator */}
                      <TypingIndicator typing={typingForConv} />
                    </div>

                    {/* Input */}
                    <MessageInput
                      companyId={companyId}
                      onSend={handleSend}
                      onTyping={handleTyping}
                    />
                  </>
                )}
              </div>
            </div>

            {/* Tab: Asistente */}
            {canUseAssistant && (
              <div className={activeTab === "assistant" ? "absolute inset-0" : "hidden"}>
                <FloatingAiAssistant embedded />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Sub-componente: TabButton ──────────────────────────────────────────────

function TabButton({
  active, onClick, icon, label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
        active ? "bg-white text-brand-600 shadow-sm dark:bg-white/[0.08] dark:text-blue-light-400"
               : "text-gray-500 hover:text-gray-700 hover:bg-white/50 dark:text-white/40 dark:hover:text-white/60 dark:hover:bg-white/[0.04]",
      ].join(" ")}
      role="tab"
      aria-selected={active}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}