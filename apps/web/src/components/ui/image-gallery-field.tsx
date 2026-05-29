"use client";

import { useRef, useState, useCallback } from "react";
import type { AppAccent } from "@/lib/navigation";

const API_BASE = typeof window !== "undefined" && window.location.hostname !== "localhost"
  ? "https://motors.aplismart.com/api"
  : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001");

export type ImageGalleryFieldProps = {
  label: string;
  /** URLs ya guardadas en BBDD */
  values: string[];
  onChange: (values: string[]) => void;
  /** Endpoint del backend: "ac-photos" | "maintenance-photos" | "user-photos" | "driver-photos" | "assignment-photos" | "asset-photos" */
  uploadEndpoint: string;
  companyId?: string;
  maxFiles?: number;
  accept?: string;
  accent?: AppAccent;
  error?: string;
  hint?: string;
  className?: string;
};

const accentRing: Record<string, string> = {
  teal: "focus-within:ring-teal-300",
  emerald: "focus-within:ring-emerald-300",
  sky: "focus-within:ring-sky-300",
  amber: "focus-within:ring-amber-300",
  rose: "focus-within:ring-rose-300",
  cyan: "focus-within:ring-cyan-300",
  orange: "focus-within:ring-orange-300",
  lime: "focus-within:ring-lime-300",
};

/**
 * Galería de imágenes multi-archivo con:
 *  • Preview en miniatura estilo redes sociales.
 *  • Botón × en la esquina para eliminar cada imagen (también borra del servidor).
 *  • Botón "Agregar más" para subir imágenes adicionales.
 *  • Upload real al backend NestJS y persistencia de URLs en PostgreSQL.
 */
export function ImageGalleryField({
  label,
  values,
  onChange,
  uploadEndpoint,
  companyId,
  maxFiles = 10,
  accept = "image/*",
  accent = "teal",
  error,
  hint,
  className = "",
}: ImageGalleryFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const resolveUrl = (url: string) => {
    if (url.startsWith("http")) return url;
    return `${API_BASE}${url}`;
  };

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setUploading(true);
      setUploadError(null);

      try {
        const formData = new FormData();
        files.forEach((file) => formData.append("photos", file));

        const url = companyId
          ? `${API_BASE}/upload/${uploadEndpoint}?companyId=${companyId}`
          : `${API_BASE}/upload/${uploadEndpoint}`;

        const response = await fetch(url, { method: "POST", body: formData });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error((payload as { message?: string }).message ?? "Error al subir las imágenes.");
        }

        const data = (await response.json()) as { urls: string[] };
        onChange([...values, ...data.urls].slice(0, maxFiles));
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Error al subir las imágenes.");
      } finally {
        setUploading(false);
      }
    },
    [companyId, maxFiles, onChange, uploadEndpoint, values],
  );

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) {
      void uploadFiles(files);
    }
    // Reset input so same file can be re-selected if needed
    event.target.value = "";
  };

  const handleRemove = async (url: string, index: number) => {
    // Remove from local state immediately (optimistic)
    onChange(values.filter((_, i) => i !== index));

    // Attempt to delete from server (best-effort, non-blocking)
    if (url.startsWith("/uploads/")) {
      try {
        await fetch(`${API_BASE}/upload/file?path=${encodeURIComponent(url)}`, {
          method: "DELETE",
        });
      } catch {
        // Silently ignore — file can be garbage-collected later
      }
    }
  };

  const canAddMore = values.length < maxFiles;

  return (
    <div className={`space-y-2 ${className}`}>
      <span className="block text-sm font-medium text-neutral-700 dark:text-slate-300">
        {label}
      </span>

      {/* Image grid */}
      {values.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {values.map((url, index) => (
            <div key={url} className="relative group h-24 w-24 flex-shrink-0">
              {/* Thumbnail */}
              <img
                src={resolveUrl(url)}
                alt={`Imagen ${index + 1}`}
                className="h-full w-full rounded-xl object-cover border border-neutral-200 dark:border-slate-600 shadow-sm"
              />

              {/* × button */}
              <button
                type="button"
                onClick={() => void handleRemove(url, index)}
                aria-label="Eliminar imagen"
                className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 text-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-600 focus:opacity-100 focus:outline-none z-10"
              >
                <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3">
                  <path
                    d="M2 2l8 8M10 2l-8 8"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>

              {/* Index badge */}
              <span className="absolute bottom-1 left-1 rounded bg-black/50 px-1 text-[10px] font-bold text-white">
                {index + 1}
              </span>
            </div>
          ))}

          {/* Add more button */}
          {canAddMore && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="h-24 w-24 flex-shrink-0 flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-neutral-300 dark:border-slate-600 text-neutral-400 dark:text-slate-500 hover:border-teal-400 hover:text-teal-500 transition-colors disabled:opacity-50"
              aria-label="Agregar más imágenes"
            >
              {uploading ? (
                <svg className="h-5 w-5 animate-spin text-teal-500" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" />
                </svg>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <span className="text-[10px] font-semibold leading-tight text-center">Agregar</span>
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Empty state upload zone */}
      {values.length === 0 && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={`w-full rounded-xl border-2 border-dashed py-8 flex flex-col items-center gap-2 transition-colors disabled:opacity-50 ${
            error
              ? "border-rose-300 dark:border-rose-500"
              : `border-neutral-300 dark:border-slate-600 hover:border-${accent}-400 hover:text-${accent}-600 ${accentRing[accent] ?? "focus-within:ring-teal-300"} focus-within:ring-2`
          } text-neutral-400 dark:text-slate-500`}
          aria-label={label}
        >
          {uploading ? (
            <svg className="h-8 w-8 animate-spin text-teal-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" />
            </svg>
          ) : (
            <svg viewBox="0 0 48 48" fill="none" className="h-10 w-10">
              <rect x="6" y="8" width="36" height="32" rx="4" stroke="currentColor" strokeWidth="2.5" />
              <circle cx="17" cy="20" r="4" stroke="currentColor" strokeWidth="2.5" />
              <path d="M6 34l9-9 6 6 5-5 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M30 14h8M34 10v8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          )}
          <span className="text-sm font-semibold">
            {uploading ? "Subiendo..." : "Haz clic para subir imágenes"}
          </span>
          <span className="text-xs">JPG, PNG, WebP · Máx. 8 MB por imagen · Hasta {maxFiles} imágenes</span>
        </button>
      )}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={handleInputChange}
        aria-hidden="true"
      />

      {/* Counter */}
      {values.length > 0 && (
        <p className="text-xs text-neutral-500 dark:text-slate-400">
          {values.length} de {maxFiles} imágenes · Pasa el cursor sobre una imagen para eliminarla
        </p>
      )}

      {/* Errors */}
      {(error || uploadError) && (
        <p className="text-xs font-medium text-rose-600 dark:text-rose-400">
          {error ?? uploadError}
        </p>
      )}
      {!error && !uploadError && hint && (
        <p className="text-xs text-neutral-500 dark:text-slate-400">{hint}</p>
      )}
    </div>
  );
}
