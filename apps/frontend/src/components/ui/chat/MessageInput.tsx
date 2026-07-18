// components/ui/chat/MessageInput.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Input de mensaje con soporte para adjuntar archivos (imágenes / docs).
//
// Features:
//   - Textarea que crece con el contenido (max 5 líneas)
//   - Enter envía (Shift+Enter = nueva línea)
//   - Botón de adjuntar archivo (imagen → /upload/photos?category=chat,
//     archivo → /upload/file?category=chat)
//   - Emite "typing" via callback mientras el user escribe
//   - Emite "stop typing" cuando se queda vacío o después de 3s sin tipear
//   - Estado uploading con spinner mientras sube el archivo
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect, useCallback } from "react";
import { ImageIcon, FileText, Loader2, Send, Paperclip, X } from "lucide-react";

interface PendingAttachment {
  file: File;
  uploading: boolean;
  uploaded?: {
    url: string;
    mime_type: string;
    size_bytes: number;
    filename: string;
  };
  error?: string;
}

interface MessageInputProps {
  companyId: number;
  disabled?: boolean;
  onSend: (text: string, attachment?: PendingAttachment["uploaded"]) => void;
  /** Mientras el user tipea, llamar onTyping(true). Cuando para, onTyping(false). */
  onTyping?: (typing: boolean) => void;
  /** (opcional) aceptar solo imágenes. Default: false. */
  imagesOnly?: boolean;
}

const MAX_TEXTAREA_HEIGHT = 120; // px

export function MessageInput({
  companyId,
  disabled = false,
  onSend,
  onTyping,
  imagesOnly = false,
}: MessageInputProps) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState<PendingAttachment | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);

  // Auto-resize del textarea.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT) + "px";
  }, [text]);

  // Limpiar timeout al desmontar.
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current !== null) {
        window.clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  const handleTextChange = useCallback((value: string) => {
    setText(value);

    if (onTyping) {
      if (value.trim()) {
        onTyping(true);
        if (typingTimeoutRef.current !== null) {
          window.clearTimeout(typingTimeoutRef.current);
        }
        // Auto "stop typing" después de 3s sin tipear.
        typingTimeoutRef.current = window.setTimeout(() => {
          onTyping(false);
        }, 3000);
      } else {
        onTyping(false);
        if (typingTimeoutRef.current !== null) {
          window.clearTimeout(typingTimeoutRef.current);
        }
      }
    }
  }, [onTyping]);

  const handleSend = useCallback(() => {
    const t = text.trim();
    if (!t && !pending?.uploaded) return;
    if (pending?.uploading) return;
    onSend(t, pending?.uploaded);
    setText("");
    setPending(null);
    if (onTyping) onTyping(false);
  }, [text, pending, onSend, onTyping]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Adjuntar archivo ──────────────────────────────────────────────────
  const pickFile = (kind: "image" | "file") => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = kind === "image" ? "image/*" : "*/*";
      fileInputRef.current.click();
    }
  };

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite elegir el mismo archivo después
    if (!file) return;

    const isImg = file.type.startsWith("image/");
    // IMPORTANTE: el endpoint YA tiene /api, no duplicar.
    // El Vite proxy reescribe /api/* → /* al backend, donde vive /upload/photos.
    const endpoint = isImg ? "/api/upload/photos" : "/api/upload/file";
    const queryStr = `?category=chat&companyId=${companyId}`;

    setPending({ file, uploading: true });

    try {
      const fd = new FormData();
      fd.append(isImg ? "photos" : "file", file);
      const res = await fetch(`${endpoint}${queryStr}`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`HTTP ${res.status}: ${errBody.substring(0, 200)}`);
      }
      const body = await res.json();
      // /upload/photos devuelve { urls: [...] }, /upload/file devuelve { url, ... }
      const data = isImg
        ? { url: body.urls?.[0], mime_type: file.type, size_bytes: file.size, filename: file.name }
        : body;
      if (!data.url) throw new Error("Backend no devolvió url");

      setPending({ file, uploading: false, uploaded: data });
    } catch (err: any) {
      setPending({ file, uploading: false, error: err.message ?? "Error al subir" });
    }
  };

  const removePending = () => {
    setPending(null);
  };

  return (
    <div className="shrink-0 border-t border-gray-100 dark:border-white/[0.06] p-3">
      {/* Preview del adjunto pendiente */}
      {pending && (
        <div className="mb-2 inline-flex items-center gap-2 px-2 py-1.5 rounded-md bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 text-xs">
          {pending.file.type.startsWith("image/") ? (
            <ImageIcon className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
          ) : (
            <FileText className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
          )}
          <span className="text-blue-700 dark:text-blue-300 truncate max-w-[200px]">
            {pending.file.name}
          </span>
          {pending.uploading && <Loader2 className="h-3 w-3 animate-spin text-blue-500" />}
          {pending.error && <span className="text-red-500 text-[10px]">{pending.error}</span>}
          {!pending.uploading && (
            <button
              type="button"
              onClick={removePending}
              className="text-blue-400 hover:text-blue-600"
              title="Quitar adjunto"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Botón adjuntar (imagen) */}
        <button
          type="button"
          onClick={() => pickFile("image")}
          disabled={disabled || pending?.uploading}
          className="shrink-0 inline-flex items-center justify-center h-10 w-10 rounded-xl bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.06] text-gray-500 dark:text-white/50 hover:bg-gray-100 dark:hover:bg-white/[0.08] disabled:opacity-40 transition-colors"
          title="Adjuntar imagen"
          aria-label="Adjuntar imagen"
        >
          <ImageIcon className="h-4 w-4" />
        </button>

        {/* Botón adjuntar (archivo) */}
        <button
          type="button"
          onClick={() => pickFile("file")}
          disabled={disabled || pending?.uploading}
          className="shrink-0 inline-flex items-center justify-center h-10 w-10 rounded-xl bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.06] text-gray-500 dark:text-white/50 hover:bg-gray-100 dark:hover:bg-white/[0.08] disabled:opacity-40 transition-colors"
          title="Adjuntar archivo"
          aria-label="Adjuntar archivo"
        >
          <Paperclip className="h-4 w-4" />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          hidden
          onChange={handleFileChosen}
        />

        {/* Textarea */}
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribí un mensaje…"
          rows={1}
          disabled={disabled}
          className={[
            "chat-scroll flex-1 resize-none rounded-xl px-3 py-2.5 text-sm outline-none transition-colors",
            "bg-gray-50 border border-gray-200 text-gray-800 placeholder-gray-400",
            "focus:border-brand-500 focus:bg-white",
            "dark:bg-white/[0.04] dark:border-white/[0.06] dark:text-white/90 dark:placeholder-white/25",
            "dark:focus:border-brand-500 dark:focus:bg-white/[0.06]",
            "disabled:opacity-50",
            "max-h-[120px]",
          ].join(" ")}
          style={{ height: "auto" }}
        />

        {/* Botón enviar */}
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || (!text.trim() && !pending?.uploaded) || pending?.uploading}
          className={[
            "shrink-0 inline-flex items-center justify-center h-10 w-10 rounded-xl transition-all",
            (text.trim() || pending?.uploaded) && !pending?.uploading
              ? "bg-brand-500 text-white hover:bg-brand-600 shadow-sm"
              : "bg-gray-100 text-gray-400 dark:bg-white/[0.04] dark:text-white/20 cursor-not-allowed",
          ].join(" ")}
          aria-label="Enviar mensaje"
        >
          {pending?.uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
