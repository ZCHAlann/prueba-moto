"use client";

// ─────────────────────────────────────────────────────────────────────────────
//  mediaCompress
// ─────────────────────────────────────────────────────────────────────────────
//  Compresión client-side de imágenes y videos antes de subirlos al backend.
//
//  - Imágenes:  Canvas → JPEG quality 0.85, max 1920px (mantiene aspect ratio).
//  - Video:     ffmpeg.wasm → H.264 480p @ CRF 28 "fast". Soporta 1-3 min sin
//               el problema de tiempo-real de MediaRecorder.
//  - Thumbnail: primer frame renderizado en canvas.
//
//  Si el archivo ya es suficientemente pequeño, se sube tal cual.

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

export type CompressOptions = {
  /** Para imágenes: ancho máximo en px (default 1920). */
  maxImageWidth?: number;
  /** Para imágenes: calidad JPEG 0..1 (default 0.85). */
  imageQuality?: number;
  /** Para videos: altura objetivo en px (default 480). */
  targetVideoHeight?: number;
  /** Para videos: CRF de libx264, menor = mejor calidad (default 28). */
  videoCrf?: number;
};

const DEFAULT_OPTS: Required<CompressOptions> = {
  maxImageWidth:     1920,
  imageQuality:      0.85,
  targetVideoHeight: 480,
  videoCrf:          28,
};

// ─── Singleton de FFmpeg ──────────────────────────────────────────────────────
// Se carga una sola vez y se reutiliza para todas las compresiones.

let _ffmpeg: FFmpeg | null = null;
let _ffmpegLoading: Promise<FFmpeg> | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (_ffmpeg) return _ffmpeg;
  if (_ffmpegLoading) return _ffmpegLoading;

  _ffmpegLoading = (async () => {
    const ff = new FFmpeg();
    // Carga los WASM core files desde la CDN de unpkg para no aumentar
    // el bundle. Si preferís hostearlos vos mismo, cambiá las URLs.
    await ff.load({
      coreURL:  "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js",
      wasmURL:  "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm",
    });
    _ffmpeg = ff;
    return ff;
  })();

  return _ffmpegLoading;
}

// ─── Imagen ───────────────────────────────────────────────────────────────────

/** Comprime una imagen y devuelve un File listo para subir. */
export async function compressImage(
  file: File,
  opts: CompressOptions = {},
): Promise<File> {
  const o = { ...DEFAULT_OPTS, ...opts };
  if (!file.type.startsWith("image/")) return file;
  if (file.size < 350 * 1024) return file; // <350 KB: ya está bien

  const bitmap = await loadBitmap(file);
  const ratio = Math.min(1, o.maxImageWidth / bitmap.width);
  const w = Math.round(bitmap.width * ratio);
  const h = Math.round(bitmap.height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", o.imageQuality),
  );
  bitmap.close?.();
  if (!blob) return file;

  return new File([blob], replaceExt(file.name, ".jpg"), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

// ─── Thumbnail ────────────────────────────────────────────────────────────────

/** Devuelve la URL del thumbnail (JPEG) del primer frame de un video. */
export async function generateVideoThumbnail(file: File): Promise<string> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = URL.createObjectURL(file);

  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error("No se pudo cargar el video"));
  });

  // Saltar ~0.1 s para evitar un frame negro inicial
  video.currentTime = Math.min(0.1, video.duration * 0.05 || 0.1);
  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve();
  });

  const targetW = 480;
  const ratio = Math.min(1, targetW / video.videoWidth);
  const w = Math.round(video.videoWidth * ratio);
  const h = Math.round(video.videoHeight * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no soportado");
  ctx.drawImage(video, 0, 0, w, h);

  const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
  URL.revokeObjectURL(video.src);
  return dataUrl;
}

// ─── Video ────────────────────────────────────────────────────────────────────

/**
 * Comprime un video usando ffmpeg.wasm → H.264 MP4, 480p, CRF 28.
 *
 * A diferencia de MediaRecorder, ffmpeg procesa el video más rápido que
 * en tiempo real (no hay que "reproducirlo" para codificarlo), por lo que
 * videos de 1-3 minutos se comprimen en 10-30 segundos según el dispositivo.
 *
 * Fallback: si ffmpeg.wasm no carga (browser sin SharedArrayBuffer, por
 * ejemplo), se devuelve el archivo original sin comprimir.
 */
export async function compressVideo(
  file: File,
  opts: CompressOptions = {},
  onProgress?: (pct: number) => void,
): Promise<File> {
  const o = { ...DEFAULT_OPTS, ...opts };

  if (!file.type.startsWith("video/")) return file;
  if (file.size < 5 * 1024 * 1024) return file; // <5 MB: no vale la pena

  let ff: FFmpeg;
  try {
    ff = await getFFmpeg();
  } catch {
    // ffmpeg.wasm no disponible — subir original
    console.warn("[mediaCompress] ffmpeg no cargó, subiendo video original");
    return file;
  }

  // Progreso: ffmpeg emite eventos "progress" con { progress: 0..1 }
  if (onProgress) {
    ff.on("progress", ({ progress }) => {
      onProgress(Math.min(99, Math.round(progress * 100)));
    });
  }

  const ext = file.type.includes("mp4") ? ".mp4" : ".webm";
  const inputName  = `input${ext}`;
  const outputName = "output.mp4";

  try {
    await ff.writeFile(inputName, await fetchFile(file));

    await ff.exec([
      "-i",       inputName,
      "-vcodec",  "libx264",
      "-crf",     String(o.videoCrf),         // calidad: 23=alta 28=media 32=baja
      "-preset",  "fast",                      // velocidad vs compresión
      "-vf",      `scale=-2:${o.targetVideoHeight}`, // 480p, ancho automático par
      "-movflags","faststart",                 // metadata al inicio → streaming
      "-an",                                   // sin audio (bayoneta = solo video)
      outputName,
    ]);

    const data = await ff.readFile(outputName);
    const blob = new Blob([data], { type: "video/mp4" });

    // Limpiar archivos temporales del sistema de archivos virtual de ffmpeg
    await ff.deleteFile(inputName).catch(() => {});
    await ff.deleteFile(outputName).catch(() => {});

    // Si la compresión no ayudó (raro), devolver original
    if (blob.size >= file.size) return file;

    onProgress?.(100);

    return new File([blob], replaceExt(file.name, ".mp4"), {
      type: "video/mp4",
      lastModified: Date.now(),
    });
  } catch (err) {
    console.error("[mediaCompress] Error comprimiendo video:", err);
    // Fallback seguro: subir original
    return file;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file).catch(() => {
    return new Promise<ImageBitmap>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img as unknown as ImageBitmap);
      img.onerror = () => reject(new Error("No se pudo decodificar la imagen"));
      img.src = URL.createObjectURL(file);
    });
  });
}

function replaceExt(name: string, newExt: string): string {
  const i = name.lastIndexOf(".");
  return (i >= 0 ? name.slice(0, i) : name) + newExt;
}