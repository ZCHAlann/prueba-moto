// components/ui/chat/MessageBubble.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Burbuja de mensaje individual, estilo shadcn/WhatsApp.
//   - Mío  → azul, alineado a la derecha, sin avatar (o avatar chico si querés).
//   - Ajeno → gris, alineado a la izquierda, con avatar + nombre (solo si es
//     el primer mensaje de una racha consecutiva del mismo remitente).
//   - Animación "pop" al aparecer (Framer Motion).
//   - Soporta texto / imagen (con lightbox) / archivo / ubicación.
//   - Muestra estado (sending/sent/delivered/read/failed) + hora exacta.
//   - Reacciones con hover.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { motion } from "framer-motion";
import { FileText, Download, MapPin, Copy, Check } from "lucide-react";
import { MessageAvatar } from "./MessageAvatar";
import { MessageStatus, type MessageEstado } from "./MessageStatus";
import { MessageReactions, type Reaccion } from "./MessageReactions";
import { ImageLightbox } from "./ImageLightbox";

export interface MessageBubbleData {
  id: number;
  public_id: string;
  remitente_id: number;
  remitente_nombre: string;
  remitente_avatar_url?: string | null;
  contenido: string | null;
  tipo: "texto" | "imagen" | "ubicacion" | "archivo";
  adjunto_url: string | null;
  adjunto_mime_type: string | null;
  adjunto_size_bytes: number | null;
  creado_en: string;
  reacciones: Reaccion[];
  estado?: MessageEstado;
  is_mine: boolean;
  onRetry?: () => void;
  onToggleReaction: (emoji: string) => void;
  /** true si es el primer mensaje de una racha del mismo remitente (muestra avatar + nombre). */
  showHeader?: boolean;
  /** true si es el último mensaje de la racha (redondea más la esquina "cola"). */
  isLastOfGroup?: boolean;
  /**
   * true si el mensaje acaba de llegar por WS (jul 2026 v8.2). El
   * FloatingChatWidget lo setea en true al recibir el WS y lo limpia
   * después de 2s. El bubble muestra un highlight amarillo que se
   * desvanece.
   */
  isNew?: boolean;
}

interface MessageBubbleProps {
  message: MessageBubbleData;
  myUserId: number;
}

function formatHora(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Extrae el nombre del archivo del final del URL.
// Ej: "/uploads/chat/1/1784404418553-yrnv3e.pdf" → "1784404418553-yrnv3e.pdf"
// (El filename "amigable" original —ej "reporte.pdf"— hoy no se guarda en DB.
//  En el futuro, agregar columna `adjunto_filename` y usar acá.)
function fileNameFromUrl(url: string | null): string {
  if (!url) return "Archivo adjunto";
  const parts = url.split("/");
  return parts[parts.length - 1] || "Archivo adjunto";
}

export function MessageBubble({ message: m, myUserId }: MessageBubbleProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const isMine = m.is_mine;
  const showHeader = m.showHeader ?? true;
  const isFailed = m.estado === "failed";

  const handleCopy = async () => {
    if (!m.contenido) return;
    try {
      await navigator.clipboard.writeText(m.contenido);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 30, mass: 0.6 }}
      className={[
        "group/bubble flex w-full gap-2",
        isMine ? "flex-row-reverse" : "flex-row",
        showHeader ? "mt-3" : "mt-0.5",
      ].join(" ")}
    >
      {/* Avatar (solo del lado ajeno, solo en el primer mensaje de la racha) */}
      <div className={isMine ? "w-7" : "w-7 shrink-0"}>
        {!isMine && showHeader && (
          <MessageAvatar name={m.remitente_nombre} avatarUrl={m.remitente_avatar_url} size="sm" />
        )}
      </div>

      <div className={`flex flex-col max-w-[75%] ${isMine ? "items-end" : "items-start"}`}>
        {/* Nombre del remitente (solo ajeno, solo header de racha) */}
        {!isMine && showHeader && (
          <span className="text-[11px] font-medium text-gray-500 dark:text-white/40 mb-0.5 px-1">
            {m.remitente_nombre}
          </span>
        )}

        {/* Bubble */}
        <div
          className={[
            "relative px-3 py-2 text-sm leading-relaxed break-words",
            "shadow-sm",
            isMine
              ? "bg-brand-500 text-white rounded-2xl rounded-br-md"
              : "bg-gray-100 dark:bg-white/[0.06] text-gray-800 dark:text-white/90 rounded-2xl rounded-bl-md",
            isFailed ? "opacity-60 ring-1 ring-red-400" : "",
            // FIX jul 2026 v8.2: highlight amarillo si el mensaje acaba
            // de llegar (2s, fade out). Se aplica solo a mensajes de
            // OTROS para no flashear los propios.
            m.isNew && !isMine ? "chat-new-msg-highlight" : "",
          ].join(" ")}
        >
          {/* Texto */}
          {m.tipo === "texto" && m.contenido && (
            <div className="whitespace-pre-wrap">{m.contenido}</div>
          )}

          {/* Imagen */}
          {m.tipo === "imagen" && m.adjunto_url && (
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="block overflow-hidden rounded-lg max-w-[220px]"
              >
                <img
                  src={m.adjunto_url}
                  alt="Imagen adjunta"
                  className="w-full h-auto object-cover hover:opacity-90 transition-opacity"
                  loading="lazy"
                />
              </button>
              {m.contenido && <div className="whitespace-pre-wrap">{m.contenido}</div>}
            </div>
          )}

          {/* Archivo */}
          {m.tipo === "archivo" && m.adjunto_url && (
            <div className="space-y-1">
              <a
                href={m.adjunto_url}
                target="_blank"
                rel="noreferrer"
                download
                className={[
                  "flex items-center gap-2 rounded-lg px-2 py-1.5 -mx-1 transition-colors",
                  isMine ? "hover:bg-white/10" : "hover:bg-black/5 dark:hover:bg-white/[0.08]",
                ].join(" ")}
              >
                <span
                  className={[
                    "shrink-0 h-8 w-8 rounded-md flex items-center justify-center",
                    isMine ? "bg-white/15" : "bg-gray-200 dark:bg-white/[0.08]",
                  ].join(" ")}
                >
                  <FileText className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">
                    {/* FIX jul 2026: usar el basename del URL, no m.contenido
                       (contenido es el caption del user, no el nombre del archivo). */}
                    {fileNameFromUrl(m.adjunto_url)}
                  </span>
                  <span className={`block text-[10px] ${isMine ? "text-white/70" : "text-gray-500 dark:text-white/40"}`}>
                    {formatSize(m.adjunto_size_bytes)}
                  </span>
                </span>
                <Download className="h-3.5 w-3.5 shrink-0 opacity-70" />
              </a>
              {/* Si el user mandó un caption con el archivo, lo mostramos abajo. */}
              {m.contenido && <div className="whitespace-pre-wrap">{m.contenido}</div>}
            </div>
          )}

          {/* Ubicación */}
          {m.tipo === "ubicacion" && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0" />
              <span>{m.contenido || "Ubicación compartida"}</span>
            </div>
          )}

          {/* Botón copiar (hover, solo si hay texto) */}
          {m.contenido && (
            <button
              type="button"
              onClick={handleCopy}
              title="Copiar"
              className={[
                "absolute -top-2.5 opacity-0 group-hover/bubble:opacity-100 transition-opacity",
                "h-5 w-5 inline-flex items-center justify-center rounded-full shadow-sm",
                "bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-white/[0.08] text-gray-500 dark:text-white/60",
                isMine ? "-left-2.5" : "-right-2.5",
              ].join(" ")}
            >
              {copied ? <Check className="h-2.5 w-2.5 text-emerald-500" /> : <Copy className="h-2.5 w-2.5" />}
            </button>
          )}
        </div>

        {/* Reacciones */}
        {(m.reacciones.length > 0 || true) && (
          <MessageReactions
            reacciones={m.reacciones}
            myUserId={myUserId}
            onToggle={m.onToggleReaction}
            alwaysVisible={m.reacciones.length > 0}
          />
        )}

        {/* Hora + estado (texto) */}
        <div className={[
          "flex items-center gap-1.5 mt-0.5 px-1 text-[10px]",
          isMine ? "text-white/70" : "text-gray-400 dark:text-white/30",
        ].join(" ")}>
          <span title={new Date(m.creado_en).toLocaleString("es-EC")}>{formatHora(m.creado_en)}</span>
          {isMine && m.estado && (
            <>
              <span className={isMine ? "text-white/30" : "text-gray-300 dark:text-white/20"}>·</span>
              <MessageStatus
                estado={m.estado}
                onRetry={m.onRetry}
                variant="mine"
              />
            </>
          )}
        </div>
      </div>

      {lightboxOpen && m.adjunto_url && (
        <ImageLightbox
          src={m.adjunto_url}
          filename={m.contenido ?? "imagen"}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </motion.div>
  );
}