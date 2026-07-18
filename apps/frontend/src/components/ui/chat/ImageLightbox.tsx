// components/ui/chat/ImageLightbox.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Modal full-screen para ver una imagen adjunta a tamaño completo.
// Se abre al hacer click en la miniatura dentro del MessageBubble.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import { X, Download } from "lucide-react";

interface ImageLightboxProps {
  src: string;
  alt?: string;
  filename?: string;
  onClose: () => void;
}

export function ImageLightbox({ src, alt, filename, onClose }: ImageLightboxProps) {
  // Cerrar con Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Bloquear scroll del body mientras el lightbox está abierto.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Vista ampliada de imagen"
    >
      {/* Botón cerrar */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-4 right-4 h-10 w-10 inline-flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        aria-label="Cerrar"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Botón descargar */}
      <a
        href={src}
        download={filename ?? "imagen"}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="absolute top-4 right-16 h-10 px-3 inline-flex items-center gap-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
      >
        <Download className="h-4 w-4" />
        <span className="text-sm font-medium">Descargar</span>
      </a>

      {/* Imagen */}
      <img
        src={src}
        alt={alt ?? "Imagen adjunta"}
        onClick={(e) => e.stopPropagation()}
        className="max-w-full max-h-full object-contain rounded-md shadow-2xl"
      />
    </div>
  );
}
