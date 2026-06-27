// components/ui/FloatingAiAssistant.tsx

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Bot, Send, X, Loader2, MessageSquarePlus, History, Trash2, Pencil,
  Check, Search, AlertCircle, Mic, MicOff, Volume2, Download, FileText,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";

// ─── Tipos ────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: number;
}

interface Conversation {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  snippet?: string;
  matchRole?: string;
}

interface PersistedMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  latencyMs: number | null;
  createdAt: string;
}

// ─── Avatar del bot ───────────────────────────────────────────────────
function BotAvatar() {
  return (
    <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-700 shadow-sm">
      <Bot className="h-3.5 w-3.5 text-white" />
    </div>
  );
}

// ─── Waveform (mic activo) ────────────────────────────────────────────
function VoiceWave() {
  return (
    <div className="flex items-center gap-[3px] h-4">
      {[0.4, 0.7, 1, 0.7, 0.4, 0.8, 0.5].map((h, i) => (
        <div
          key={i}
          className="w-[2px] rounded-full bg-rose-400"
          style={{ height: `${h * 100}%`, animation: `voiceBar 0.6s ease-in-out ${i * 0.07}s infinite alternate` }}
        />
      ))}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────

export function FloatingAiAssistant() {
  const { session, companyId } = useAuth();
  const [isOpen, setIsOpen]         = useState(false);
  const [showHistory, setShowHistory] = useState(true);
  const [message, setMessage]       = useState("");
  const [messages, setMessages]     = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sending, setSending]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConvs, setLoadingConvs]   = useState(false);
  const [loadingMsgs, setLoadingMsgs]     = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [search, setSearch]         = useState("");
  const [searching, setSearching]   = useState(false);
  const [listening, setListening]   = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceLang, setVoiceLang]   = useState<"es-EC" | "es-CO" | "es-MX" | "es-ES">(() => {
    if (typeof window === "undefined") return "es-EC";
    const stored = localStorage.getItem("jarvis.voice.lang");
    if (stored === "es-EC" || stored === "es-CO" || stored === "es-MX" || stored === "es-ES") return stored;
    return "es-EC";
  });
  const [voices, setVoices] = useState<Array<{ id: string; label: string; description: string; gender?: string }>>([]);
  const [voice, setVoice] = useState<string>(() => {
    if (typeof window === "undefined") return "cgSgspJ2msm6clMCkdW9"; // Jessica (ElevenLabs, español)
    return localStorage.getItem("jarvis.voice.id") || "cgSgspJ2msm6clMCkdW9";
  });
  const [autoPlay, setAutoPlay] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    // Default: activado. El usuario puede apagarlo explícitamente.
    const stored = localStorage.getItem("jarvis.autoplay");
    return stored == null ? true : stored === "1";
  });
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const chatRef   = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fabRef    = useRef<HTMLDivElement>(null);

  // ── FAB draggable ─────────────────────────────────────────────────
  // Posición del FAB en píxeles desde la esquina inferior derecha.
  // Persistida en localStorage. Se arrastra con pointer events (mouse/touch).
  const FAB_SIZE = 56; // h-14 w-14
  const FAB_MARGIN = 24; // px de margen mínimo desde el borde
  const DRAG_THRESHOLD = 4; // px para distinguir click de drag
  const getInitialFabPos = (): { x: number; y: number } => {
    if (typeof window === "undefined") return { x: 24, y: 24 };
    try {
      const stored = localStorage.getItem("jarvis.fab.pos");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
          return constrainFabPos(parsed.x, parsed.y);
        }
      }
    } catch {}
    return { x: 24, y: 24 };
  };
  function constrainFabPos(x: number, y: number): { x: number; y: number } {
    if (typeof window === "undefined") return { x, y };
    const maxX = window.innerWidth  - FAB_SIZE - FAB_MARGIN;
    const maxY = window.innerHeight - FAB_SIZE - FAB_MARGIN;
    return {
      x: Math.max(FAB_MARGIN, Math.min(maxX, x)),
      y: Math.max(FAB_MARGIN, Math.min(maxY, y)),
    };
  }
  const [fabPos, setFabPos] = useState(getInitialFabPos);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    pointerStartX: number;
    pointerStartY: number;
    fabStartX: number;
    fabStartY: number;
    moved: boolean;
  } | null>(null);

  // Recalcular la posición cuando se redimensiona la ventana.
  useEffect(() => {
    const onResize = () => setFabPos((p) => constrainFabPos(p.x, p.y));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function onFabPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Aceptamos cualquier botón (mouse izq, touch, pen).
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId:     e.pointerId,
      pointerStartX: e.clientX,
      pointerStartY: e.clientY,
      fabStartX:     fabPos.x,
      fabStartY:     fabPos.y,
      moved:         false,
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
    // fabPos.x es la DISTANCIA DESDE LA DERECHA → al arrastrar a la derecha
    // (dx > 0) debemos decrementar (acercar al borde derecho). Por eso restamos.
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
      try { localStorage.setItem("jarvis.fab.pos", JSON.stringify(fabPos)); } catch {}
    } else {
      // Click (no drag) → toggle del chat.
      setIsOpen((v) => !v);
    }
  }

  const rol = session?.role;
  if (!companyId || (rol !== "admin_empresa" && rol !== "owner_empresa")) return null;

  // ── Cerrar al click fuera ──────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!chatRef.current?.contains(t) && !t.closest(".jarvis-fab")) setIsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  // ── Auto-scroll ────────────────────────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  // ── Cargar conversaciones ──────────────────────────────────────────
  const loadConversations = useCallback(async (query = "") => {
    if (!companyId) return;
    setLoadingConvs(true);
    setSearching(!!query);
    try {
      const url = query
        ? `/api/company/${companyId}/ai/conversations?q=${encodeURIComponent(query)}`
        : `/api/company/${companyId}/ai/conversations`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const body = (await res.json()) as { data: Conversation[] };
      setConversations(body.data ?? []);
    } catch (err) {
      console.warn("No pude cargar conversaciones:", err);
    } finally {
      setLoadingConvs(false);
      setSearching(false);
    }
  }, [companyId]);

  useEffect(() => { if (isOpen) void loadConversations(); }, [isOpen, loadConversations]);

  useEffect(() => {
    const t = setTimeout(() => void loadConversations(search), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // ── Cargar mensajes ────────────────────────────────────────────────
  async function loadConversationMessages(cid: string) {
    if (!companyId) return;
    setLoadingMsgs(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/company/${companyId}/ai/conversations/${cid}/messages`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const body = (await res.json()) as { data: PersistedMessage[] };
      const loaded: ChatMessage[] = (body.data ?? [])
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          ts: new Date(m.createdAt).getTime(),
        }));
      setMessages(loaded);
      setConversationId(cid);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoadingMsgs(false);
    }
  }

  // ── Enviar mensaje ─────────────────────────────────────────────────
  async function send() {
    const text = message.trim();
    if (!text || sending) return;
    setMessage("");
    setError(null);

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: text, ts: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    const assistantId = `a-${Date.now()}`;
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "", ts: Date.now() }]);

    try {
      const res = await fetch(`/api/company/${companyId}/ai/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        credentials: "include",
        body: JSON.stringify({ message: text, conversationId }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message ?? `Error ${res.status}`);
      }
      if (!res.body) throw new Error("Sin stream disponible.");

      const reader  = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let streamedText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const raw = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const lines = raw.split("\n");
          let evType = "message";
          let dataLine = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) evType = line.slice(7).trim();
            else if (line.startsWith("data: ")) dataLine += line.slice(6);
          }
          if (!dataLine) continue;
          let payload: any;
          try { payload = JSON.parse(dataLine); } catch { continue; }

          if (evType === "chunk" && typeof payload.text === "string") {
            streamedText += payload.text;
            setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: streamedText } : m));
          } else if (evType === "done") {
            if (payload.conversationId) setConversationId(payload.conversationId);
            // Auto-play: si está activado, reproducir la última respuesta del assistant.
            if (autoPlay && streamedText.trim()) {
              void speakText(streamedText.trim());
            }
          } else if (evType === "error") {
            setError(payload.message ?? "Error del asistente");
          }
        }
      }
      void loadConversations();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setError(msg);
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.id === assistantId && !last.content) {
          return [...prev.slice(0, -1), { id: assistantId, role: "assistant", content: "No pude conectar con el asistente. Verifica tu conexión.", ts: Date.now() }];
        }
        return prev;
      });
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
  }

  function newConversation() {
    setMessages([]);
    setConversationId(null);
    setError(null);
  }

  async function deleteConversation(cid: string) {
    if (!companyId || !confirm("¿Borrar esta conversación?")) return;
    try {
      const res = await fetch(
        `/api/company/${companyId}/ai/conversations/${cid}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok && res.status !== 404) throw new Error(`Error ${res.status}`);
      if (cid === conversationId) newConversation();
      void loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  async function exportConversation(cid: string, format: "csv" | "pdf") {
    if (!companyId) return;
    try {
      const res = await fetch(
        `/api/company/${companyId}/ai/conversations/${cid}/export?format=${format}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `jarvis-conversation.${format}`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  async function commitRename(cid: string) {
    const value = renameValue.trim();
    if (!value || !companyId) { setRenamingId(null); return; }
    try {
      const res = await fetch(`/api/company/${companyId}/ai/conversations/${cid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: value }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setConversations((prev) => prev.map((c) => c.id === cid ? { ...c, title: value } : c));
      setRenamingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  async function executeAction() {
    // Jarvis es solo lectura: este handler ya no se usa para ejecutar
    // acciones de escritura (propuestas por el LLM). Se deja como stub
    // vacío para no romper firmas llamadas por otros handlers históricos.
  }

  function cancelAction() {
    // Stub — Jarvis ya no propone acciones de escritura.
  }

  function toggleListening() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setError("Tu navegador no soporta reconocimiento de voz. Usa Chrome."); return; }
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const rec = new SR();
    rec.lang = voiceLang; rec.continuous = false; rec.interimResults = false;
    rec.onresult = (e: any) => { setMessage(e.results[0][0].transcript); setListening(false); setTimeout(() => void send(), 200); };
    rec.onerror  = (e: any) => { setError(`Error de voz: ${e.error}`); setListening(false); };
    rec.onend    = () => setListening(false);
    recognitionRef.current = rec; rec.start(); setListening(true);
  }

function speakLastResponse() {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant || !lastAssistant.content) return;
    speakText(lastAssistant.content);
  }

  /** Reproduce texto con Web Speech API (fallback cuando ElevenLabs falla). */
  function speakWithWebSpeech(text: string, lang: string) {
    if (!("speechSynthesis" in window)) {
      setError("Tu navegador no soporta síntesis de voz.");
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 1.0;
    // Intentar elegir una voz del navegador que matchee el idioma.
    const voices = window.speechSynthesis.getVoices();
    const match = voices.find((v) => v.lang.startsWith(lang)) || voices[0];
    if (match) u.voice = match;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  }

  async function speakText(text: string) {
    if (!text.trim()) return;
    // Cancelar reproducción en curso.
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(true);

    // ElevenLabs (multilingual_v2) habla español nativo, así que siempre
    // vamos al backend. Solo caemos a Web Speech si el backend falla
    // (sin API key, sin créditos, timeout, etc.).
    try {
      const res = await fetch(`/api/company/${companyId}/ai/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text, voice }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        // eslint-disable-next-line no-console
        console.warn("[jarvis] TTS backend falló, fallback a Web Speech:", res.status, errBody);
        speakWithWebSpeech(text, voiceLang);
        setSpeaking(false);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => {
        setSpeaking(false);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setSpeaking(false);
        URL.revokeObjectURL(url);
      };
      audioRef.current = audio;
      audio.volume = 1;
      await audio.play();
      setVoiceEnabled(true);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[jarvis] TTS exception, fallback a Web Speech:", err);
      speakWithWebSpeech(text, voiceLang);
      setSpeaking(false);
    }
  }

  function stopSpeaking() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  // Cargar voces disponibles del backend al montar.
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    fetch(`/api/company/${companyId}/ai/tts/voices`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((body) => {
        if (cancelled || !body?.voices) return;
        setVoices(body.voices);
        // Si la voz guardada en localStorage ya no existe, usar default.
        if (!body.voices.some((v: any) => v.id === voice) && body.default) {
          setVoice(body.default);
          localStorage.setItem("jarvis.voice.id", body.default);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      recognitionRef.current?.abort?.();
    };
  }, []);

  function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const min  = Math.floor(diff / 60_000);
    if (min < 1)  return "ahora";
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    if (h < 24)   return `${h}h`;
    const dd = Math.floor(h / 24);
    if (dd < 7)   return `${dd}d`;
    return new Date(iso).toLocaleDateString();
  }

  const SUGGESTIONS = [
    "¿Cuántos mantenimientos hubo este mes?",
    "Vehículos con seguros por vencer",
    "¿Qué checklists están pendientes?",
    "Gasto en peajes este mes",
  ];

  return (
    <>
      {/* ── FAB (draggable) ──────────────────────────────────────────── */}
      <div
        ref={fabRef}
        className="fixed z-50 select-none"
        role="button"
        tabIndex={0}
        aria-label="Abrir asistente IA (arrastrable)"
        style={{
          right:  fabPos.x,
          bottom: fabPos.y,
          width:  FAB_SIZE,
          height: FAB_SIZE,
          cursor: isDragging ? "grabbing" : "grab",
          userSelect: "none",
          touchAction: "none",
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
            background: "linear-gradient(135deg, rgba(99,102,241,0.85) 0%, rgba(168,85,247,0.85) 100%)",
            boxShadow: isDragging
              ? "0 0 30px rgba(139,92,246,0.95), 0 0 60px rgba(124,58,237,0.6)"
              : "0 0 20px rgba(139,92,246,0.5), 0 0 40px rgba(124,58,237,0.3)",
            border: "2px solid rgba(255,255,255,0.15)",
          }}
        >
          <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/20 to-transparent opacity-30" />
          <div className="absolute inset-0 rounded-full border-2 border-white/10" />
          <div className="relative z-10 pointer-events-none">
            {isOpen ? <X className="h-7 w-7 text-white" /> : <Bot className="h-7 w-7 text-white" />}
          </div>
        </div>
      </div>

      {/* ── Panel ────────────────────────────────────────────────────── */}
      {isOpen && (
        <div
          ref={chatRef}
          className={[
            "fixed z-50",
            "w-[min(720px,calc(100vw-3rem))] max-h-[80vh]",
            "overflow-hidden flex",
            "rounded-2xl border shadow-2xl backdrop-blur-xl",
            // Light: blanco con borde gris suave
            "bg-white border-gray-200",
            // Dark: bg oscuro del sistema, borde sutil
            "dark:bg-[#0F172A] dark:border-white/[0.06]",
          ].join(" ")}
          style={{
            // Posición del panel relativa al FAB.
            // Si el FAB está en la mitad derecha, el panel se ancla a la derecha;
            // si está en la izquierda, se ancla a la izquierda.
            bottom: fabPos.y + FAB_SIZE + 8,
            right:  fabPos.x,
            animation: "panelIn 0.3s cubic-bezier(0.175,0.885,0.32,1.275) forwards",
            transformOrigin: fabPos.x > (typeof window !== "undefined" ? window.innerWidth / 2 : 0)
              ? "bottom right"
              : "bottom left",
          }}
        >

          {/* ── Sidebar historial ──────────────────────────────────── */}
          {showHistory && (
            <div className="w-56 shrink-0 flex flex-col border-r border-gray-100 bg-gray-50 dark:border-white/[0.06] dark:bg-white/[0.02]">

              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 dark:border-white/[0.06]">
                <div className="flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5 text-gray-400 dark:text-white/30" />
                  <span className="text-xs font-medium text-gray-500 dark:text-white/40">Historial</span>
                </div>
                <button
                  type="button"
                  onClick={newConversation}
                  className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-white/30 dark:hover:bg-white/[0.06] dark:hover:text-white/70"
                  title="Nueva conversación"
                >
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Buscador */}
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
                  {searching && (
                    <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-gray-400 dark:text-white/25" />
                  )}
                </div>
              </div>

              {/* Lista */}
              <div
                className="flex-1 overflow-y-auto px-1.5 py-2 space-y-0.5"
                style={{ scrollbarWidth: "thin" }}
              >
                {loadingConvs && !searching && (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-300 dark:text-white/20" />
                  </div>
                )}
                {!loadingConvs && conversations.length === 0 && (
                  <div className="py-8 text-center text-[11px] text-gray-400 dark:text-white/25">
                    {search ? `Sin resultados para "${search}"` : "Aún no tienes conversaciones."}
                  </div>
                )}
                {conversations.map((c) => {
                  const active = c.id === conversationId;
                  return (
                    <div
                      key={c.id}
                      className={[
                        "group relative rounded-lg transition-all border",
                        active
                          ? "bg-blue-50 border-blue-200 dark:bg-blue-500/[0.12] dark:border-blue-500/30"
                          : "border-transparent hover:bg-gray-100 dark:hover:bg-white/[0.04]",
                      ].join(" ")}
                    >
                      {renamingId === c.id ? (
                        <div className="flex items-center gap-1 px-2 py-1.5">
                          <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void commitRename(c.id);
                              if (e.key === "Escape") setRenamingId(null);
                            }}
                            autoFocus
                            className="flex-1 min-w-0 rounded px-1.5 py-0.5 text-xs outline-none bg-white border border-blue-300 text-gray-800 dark:bg-white/[0.06] dark:border-blue-500/40 dark:text-white/90"
                          />
                          <button
                            type="button"
                            onClick={() => void commitRename(c.id)}
                            className="rounded p-1 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => void loadConversationMessages(c.id)}
                            className="w-full text-left rounded-lg px-2.5 py-2"
                          >
                            <div className={[
                              "text-[11px] font-medium truncate pr-10",
                              active
                                ? "text-blue-700 dark:text-blue-300"
                                : "text-gray-700 dark:text-white/60",
                            ].join(" ")}>
                              {c.title || "Nueva conversación"}
                            </div>
                            <div className="text-[10px] mt-0.5 text-gray-400 dark:text-white/25">
                              {relativeTime(c.updatedAt)}
                            </div>
                            {c.snippet && (
                              <div className="text-[10px] mt-1 italic line-clamp-2 text-gray-400 dark:text-white/25">
                                "{c.snippet}"
                              </div>
                            )}
                          </button>
                          <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {[
                              { icon: <Download className="h-3 w-3" />, fn: () => void exportConversation(c.id, "csv"), title: "CSV" },
                              { icon: <FileText className="h-3 w-3" />,  fn: () => void exportConversation(c.id, "pdf"), title: "PDF" },
                              { icon: <Pencil className="h-3 w-3" />,    fn: () => { setRenamingId(c.id); setRenameValue(c.title ?? ""); }, title: "Renombrar" },
                              { icon: <Trash2 className="h-3 w-3" />,    fn: () => void deleteConversation(c.id), title: "Eliminar" },
                            ].map((btn, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={btn.fn}
                                className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:text-white/25 dark:hover:bg-white/[0.08] dark:hover:text-white/70"
                                title={btn.title}
                              >
                                {btn.icon}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Área principal ─────────────────────────────────────── */}
          <div className="flex-1 min-w-0 flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 shrink-0 border-b border-gray-100 dark:border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                </span>
                <span className="text-sm font-semibold text-gray-800 dark:text-white/90">Jarvis</span>
                <span className="text-xs text-gray-400 dark:text-white/30">· Asistente IA</span>
              </div>
              <div className="flex items-center gap-1">
                {/* Voz TTS (ElevenLabs) */}
                <select
                  value={voice}
                  onChange={(e) => {
                    const v = e.target.value;
                    setVoice(v);
                    try { localStorage.setItem("jarvis.voice.id", v); } catch {}
                  }}
                  className="rounded-md px-1.5 py-0.5 text-[10px] outline-none cursor-pointer bg-gray-100 text-gray-500 border-0 dark:bg-white/[0.06] dark:text-white/40"
                  title="Voz del TTS"
                >
                  {voices.length === 0 ? (
                    <option value={voice}>…</option>
                  ) : (
                    voices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label} ({v.gender})
                      </option>
                    ))
                  )}
                </select>

                {/* Toggle auto-play */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !autoPlay;
                    setAutoPlay(next);
                    try { localStorage.setItem("jarvis.autoplay", next ? "1" : "0"); } catch {}
                  }}
                  className={[
                    "rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                    autoPlay
                      ? "bg-indigo-500 text-white"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-white/[0.06] dark:text-white/40 dark:hover:bg-white/[0.10]",
                  ].join(" ")}
                  title={autoPlay ? "Auto-play activado" : "Activar auto-play de respuestas"}
                >
                  {autoPlay ? "Auto ON" : "Auto OFF"}
                </button>

                {/* Toggle historial */}
                <button
                  type="button"
                  onClick={() => setShowHistory((v) => !v)}
                  className={[
                    "rounded-md p-1.5 transition-colors",
                    showHistory
                      ? "bg-gray-100 text-gray-600 dark:bg-white/[0.08] dark:text-white/60"
                      : "text-gray-400 hover:bg-gray-100 dark:text-white/25 dark:hover:bg-white/[0.05]",
                  ].join(" ")}
                  title={showHistory ? "Ocultar historial" : "Mostrar historial"}
                >
                  <History className="h-3.5 w-3.5" />
                </button>
                {/* Eliminar conversación activa */}
                {conversationId && (
                  <button
                    type="button"
                    onClick={() => { setMessages([]); setConversationId(null); setError(null); void loadConversations(); }}
                    className="rounded-md p-1.5 transition-colors text-gray-400 hover:bg-red-50 hover:text-red-500 dark:text-white/25 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                    title="Cerrar conversación"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                {/* Cerrar panel */}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-md p-1.5 transition-colors text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-white/25 dark:hover:bg-white/[0.06] dark:hover:text-white/70"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Mensajes */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0"
              style={{ scrollbarWidth: "thin" }}
            >
              {loadingMsgs && (
                <div className="flex justify-center items-center h-full">
                  <div className="flex items-center gap-2 text-gray-400 dark:text-white/30">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-xs">Cargando mensajes…</span>
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!loadingMsgs && messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center px-2 py-8">
                  <div className="h-12 w-12 rounded-2xl flex items-center justify-center mb-4 bg-blue-50 dark:bg-blue-500/10">
                    <Bot className="h-6 w-6 text-blue-500 dark:text-blue-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-700 dark:text-white/80 mb-1">¿En qué te ayudo?</p>
                  <p className="text-xs text-gray-400 dark:text-white/30 max-w-[280px] leading-relaxed">
                    Pregúntame sobre vehículos, mantenimientos, combustibles, seguros, checklists o conductores.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-1.5 justify-center">
                    {SUGGESTIONS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setMessage(q)}
                        className="rounded-full px-3 py-1 text-[11px] border transition-colors bg-white border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 dark:bg-white/[0.03] dark:border-white/[0.08] dark:text-white/50 dark:hover:border-blue-500/40 dark:hover:text-blue-300 dark:hover:bg-blue-500/10"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Mensajes */}
              {messages.map((m, idx) => (
                <div key={m.id} className={`flex items-end gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  {m.role === "assistant" && <BotAvatar />}
                  <div className="flex flex-col gap-1.5 max-w-[85%]">
                    <div className={[
                      "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                      m.role === "user"
                        ? "bg-blue-600 text-white rounded-br-sm"
                        : "bg-gray-100 text-gray-800 rounded-bl-sm dark:bg-white/[0.06] dark:text-white/85",
                    ].join(" ")}>
                      {m.content}
                    </div>
                    {/* Tool badges — oculto, no queremos exponer qué herramienta usó. */}
                  </div>
                </div>
              ))}

              {/* Typing indicator (solo el gusanito — sin mostrar herramientas ni args) */}
              {sending && (
                <div className="flex items-end gap-2 justify-start">
                  <BotAvatar />
                  <div className="rounded-2xl rounded-bl-sm px-4 py-3 bg-gray-100 dark:bg-white/[0.06] flex items-center gap-1">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-blue-400 dark:bg-blue-500"
                        style={{ animation: `typingDot 1.2s ease-in-out ${i * 0.2}s infinite` }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-lg px-3 py-2 text-xs flex items-start gap-2 bg-red-50 border border-red-200 text-red-600 dark:bg-red-500/[0.08] dark:border-red-500/20 dark:text-red-400">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {error}
                </div>
              )}
            </div>

            {/* Input */}
            <div className="px-3 pb-3 pt-2.5 shrink-0 border-t border-gray-100 dark:border-white/[0.06]">
              <div className="flex items-end gap-2">
                <div className="flex-1 relative">
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    maxLength={2000}
                    placeholder={listening ? "Escuchando…" : "Pregúntale algo a Jarvis…"}
                    className={[
                      "w-full resize-none outline-none text-sm transition-colors rounded-xl px-3.5 py-2.5",
                      "bg-gray-50 border border-gray-200 text-gray-800 placeholder-gray-400",
                      "focus:border-blue-400 focus:bg-white",
                      "dark:bg-white/[0.04] dark:border-white/[0.06] dark:text-white/85 dark:placeholder-white/25",
                      "dark:focus:border-blue-500/40 dark:focus:bg-white/[0.06]",
                    ].join(" ")}
                    style={{
                      minHeight: "40px",
                      maxHeight: "120px",
                      scrollbarWidth: "thin",
                      height: `${Math.min(120, 40 + message.split("\n").length * 20)}px`,
                    }}
                  />
                  {listening && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <VoiceWave />
                    </div>
                  )}
                </div>

                {/* Mic */}
                <button
                  type="button"
                  onClick={toggleListening}
                  className={[
                    "h-10 w-10 shrink-0 rounded-xl flex items-center justify-center transition-all",
                    listening
                      ? "bg-red-50 border border-red-300 text-red-500 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-400"
                      : "bg-gray-100 border border-gray-200 text-gray-500 hover:bg-gray-200 dark:bg-white/[0.05] dark:border-white/[0.06] dark:text-white/40 dark:hover:bg-white/[0.08]",
                  ].join(" ")}
                  style={listening ? { animation: "micPulse 1.5s ease-in-out infinite" } : undefined}
                  aria-label={listening ? "Detener" : "Grabar"}
                >
                  {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>

                {/* Speaker: leer / detener */}
                <button
                  type="button"
                  onClick={() => speaking ? stopSpeaking() : speakLastResponse()}
                  className={[
                    "h-10 w-10 shrink-0 rounded-xl flex items-center justify-center transition-all",
                    speaking
                      ? "bg-rose-500/20 border border-rose-500/40 text-rose-300 animate-pulse"
                      : voiceEnabled
                      ? "bg-indigo-500/20 border border-indigo-400/40 text-indigo-300"
                      : "bg-zinc-800/60 border border-zinc-700/40 text-zinc-300 hover:bg-zinc-700/60",
                  ].join(" ")}
                  aria-label={speaking ? "Detener audio" : "Leer respuesta en voz alta"}
                  title={speaking ? "Detener" : `Leer con ${voices.find((v) => v.id === voice)?.label ?? "TTS"}`}
                >
                  <Volume2 className="h-4 w-4" />
                </button>

                {/* Enviar */}
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={!message.trim() || sending}
                  className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100"
                  style={{
                    background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
                    color: "white",
                    boxShadow: "0 2px 8px rgba(249,115,22,0.25)",
                  }}
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10px] text-gray-400 dark:text-white/25">
                  <kbd className="rounded px-1.5 py-0.5 text-[10px] font-mono bg-gray-100 border border-gray-200 text-gray-500 dark:bg-white/[0.05] dark:border-white/[0.06] dark:text-white/30">
                    Shift+Enter
                  </kbd>{" "}
                  nueva línea
                </span>
                <span className={`text-[10px] ${message.length > 1800 ? "text-orange-500" : "text-gray-400 dark:text-white/25"}`}>
                  {message.length}/2000
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal confirmación ──────────────────────────────────────── */}
      {/* Jarvis es solo lectura: ya no propone acciones de escritura, */}
      {/* así que este modal ya no se renderiza nunca. */}

      <style>{`
        @keyframes panelIn {
          0%   { opacity: 0; transform: scale(0.88) translateY(16px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes typingDot {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40%            { transform: translateY(-4px); opacity: 1; }
        }
        @keyframes voiceBar {
          0%   { transform: scaleY(0.3); }
          100% { transform: scaleY(1); }
        }
        @keyframes micPulse {
          0%, 100% { box-shadow: 0 0 6px rgba(239,68,68,0.2); }
          50%       { box-shadow: 0 0 14px rgba(239,68,68,0.4); }
        }
        .jarvis-fab:hover {
          transform: scale(1.08) rotate(5deg);
          box-shadow: 0 0 28px rgba(139,92,246,0.7),
                      0 0 50px rgba(124,58,237,0.5),
                      0 0 70px rgba(109,40,217,0.3);
        }
      `}</style>
    </>
  );
}
