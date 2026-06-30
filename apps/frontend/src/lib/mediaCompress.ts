"use client";

// ─────────────────────────────────────────────────────────────────────────────
//  mediaCompress
// ─────────────────────────────────────────────────────────────────────────────
//  Compresión client-side de imágenes y videos antes de subirlos al backend.
//
//  - Imágenes:  Canvas → JPEG quality 0.78, max 1280px (mantiene aspect ratio).
//               HEIC soportado via decode nativo si hay createImageBitmap, o
//               se sube tal cual (iOS lo convierte automáticamente al servir).
//  - Video:     ffmpeg.wasm → H.264 480p @ CRF 28 "fast". Soporta 1-3 min sin
//               el problema de tiempo-real de MediaRecorder.
//  - Thumbnail: primer frame renderizado en canvas.
//  - Batch:     `compressImagesBatch` corre hasta 2 imágenes en paralelo.
//  - Warmup:    `warmupFFmpeg` arranca la carga del core en background para
//               que cuando el usuario acepte la primera foto, ffmpeg ya esté listo.
//
//  Si el archivo ya es suficientemente pequeño, se sube tal cual.

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

export type CompressOptions = {
  /** Para imágenes: ancho máximo en px (default 1280). */
  maxImageWidth?: number;
  /** Para imágenes: calidad JPEG 0..1 (default 0.78). */
  imageQuality?: number;
  /** Para videos: altura objetivo en px (default 480). */
  targetVideoHeight?: number;
  /** Para videos: CRF de libx264, menor = mejor calidad (default 28). */
  videoCrf?: number;
};

const DEFAULT_OPTS: Required<CompressOptions> = {
  maxImageWidth:     1280,
  imageQuality:      0.78,
  targetVideoHeight: 480,
  videoCrf:          28,
};

// Umbral por debajo del cual NO comprimimos (ya es suficientemente pequeño).
// Bajamos de 350 KB → 180 KB porque con maxWidth=1280 las fotos típicamente
// quedan < 200 KB de todas formas.
const IMAGE_SKIP_THRESHOLD = 180 * 1024;

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

/**
 * Pre-carga el core de ffmpeg.wasm en background.
 *
 * Llamar en un useEffect de mount del componente principal (ej: Autorizaciones
 * page). Cuando el usuario termina de tomar la primera foto y el wizard llama
 * a `compressVideo()`, ffmpeg ya está listo y no hay un "freeze" de 2-3 s
 * mientras carga el WASM (~30 MB).
 *
 * Es seguro llamarlo varias veces: si ya está cargado (o cargando), es noop.
 * Si ffmpeg.wasm no está disponible (browser sin SharedArrayBuffer), el
 * promise rechaza silenciosamente — `compressVideo` ya tiene fallback al
 * archivo original.
 */
export function warmupFFmpeg(): void {
  // No await-eamos: corre en background. Capturamos errores en consola
  // para diagnóstico pero no propagamos.
  getFFmpeg().catch((err) => {
    console.warn("[mediaCompress:warmup] ffmpeg no se pudo pre-cargar:", err?.message ?? err);
  });
}

// ─── HEIC / HEIF ──────────────────────────────────────────────────────────────
// iPhone graba en HEIC por defecto. La mayoría de navegadores modernos (Chrome,
// Safari, Edge) pueden decodificar HEIC nativamente vía createImageBitmap o <img>.
// Si el browser no puede, igual subimos el archivo (el servidor lo recibe y
// puede servirlo directo).
//
// Esta función chequea si podemos decodificar HEIC en este browser, para
// decidir si comprimimos o subimos tal cual.

let _heicSupported: boolean | null = null;

async function isHeicSupported(): Promise<boolean> {
  if (_heicSupported !== null) return _heicSupported;
  try {
    // Test: crear un canvas 1x1 y dibujar un blob HEIC vacío.
    // createImageBitmap con un HEIC real valida el decoder.
    if (typeof createImageBitmap !== "function") {
      _heicSupported = false;
      return false;
    }
    // No tenemos un HEIC de prueba, así que heurística: si el userAgent es
    // Safari o iOS, asumimos soporte nativo. Si es Chrome desktop / Android,
    // también (Chrome 100+ soporta HEIC).
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    _heicSupported = /Safari|iPhone|iPad|Chrome\/1[0-9]{2,}/.test(ua);
  } catch {
    _heicSupported = false;
  }
  return _heicSupported;
}

// ─── Imagen ───────────────────────────────────────────────────────────────────

/** Comprime una imagen y devuelve un File listo para subir. */
export async function compressImage(
  file: File,
  opts: CompressOptions = {},
): Promise<File> {
  const o = { ...DEFAULT_OPTS, ...opts };

  // HEIC: si el browser no lo soporta, subimos tal cual (el servidor lo maneja).
  const isHeic = /\.(heic|heif)$/i.test(file.name) ||
                  file.type === "image/heic" ||
                  file.type === "image/heif";
  if (isHeic) {
    const supported = await isHeicSupported();
    if (!supported) return file;
  }

  if (!file.type.startsWith("image/") && !isHeic) return file;
  if (file.size < IMAGE_SKIP_THRESHOLD) return file; // ya está bien

  const bitmap = await loadBitmap(file);
  // Para imágenes muy pequeñas (<= maxWidth), no redimensionamos (ratio = 1).
  const ratio = Math.min(1, o.maxImageWidth / bitmap.width);
  const w = Math.max(1, Math.round(bitmap.width * ratio));
  const h = Math.max(1, Math.round(bitmap.height * ratio));

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

// ─── Batch ────────────────────────────────────────────────────────────────────
// Corre `compressImage` sobre varios archivos con concurrencia limitada.
// Antes cada llamada era secuencial (N fotos → N awaits); ahora corremos 2
// en paralelo (suficiente para no saturar memoria del browser con bitmaps
// grandes). El orden del array de salida es estable.

const BATCH_CONCURRENCY = 2;

/**
 * Comprime varias imágenes en paralelo (concurrencia 2).
 *
 * Devuelve un File[] en el mismo orden del input. Si una imagen falla, se
 * devuelve el File original (no se rompe el wizard).
 */
export async function compressImagesBatch(
  files: File[],
  opts: CompressOptions = {},
): Promise<File[]> {
  const results: File[] = new Array(files.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= files.length) return;
      try {
        results[idx] = await compressImage(files[idx], opts);
      } catch (err) {
        console.warn(`[mediaCompress:batch] idx=${idx} falló, subiendo original:`, err);
        results[idx] = files[idx];
      }
    }
  }

  const workers = Array.from({ length: Math.min(BATCH_CONCURRENCY, files.length) }, worker);
  await Promise.all(workers);
  return results;
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

// ─── Presets + helper de "comprimir si es imagen" ────────────────────────────
// Capa fina sobre `compressImage` pensada para los uploads puntuales del
// frontend (facturas, repuestos, fotos de mantenimiento, combustible,
// checklists). Centralizar acá evita que cada componente re-defina su
// propia versión y nos asegura que las opciones aplicadas son consistentes.

/** Opciones estándar para fotos de evidencia/operación (facturas,
 *  repuestos, fotos de mantenimiento, combustible, checklists). No
 *  necesitan alta fidelidad — legibilidad es suficiente. */
export const COMPRESS_OPTS_EVIDENCE: CompressOptions = {
  maxImageWidth: 1280,
  imageQuality: 0.78,
};

/** Opciones para fotos de perfil y documentos donde el detalle
 *  importa más. */
export const COMPRESS_OPTS_STANDARD: CompressOptions = {
  maxImageWidth: 1600,
  imageQuality: 0.82,
};

/**
 * Comprime si es imagen. Si es PDF u otro tipo, devuelve el archivo
 * original. Si la compresión falla, devuelve el original silenciosamente
 * (preferimos subir un archivo sin comprimir antes que romper el flujo).
 */
export async function compressIfImage(
  file: File,
  opts: CompressOptions = COMPRESS_OPTS_EVIDENCE,
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    return await compressImage(file, opts);
  } catch {
    return file;
  }
}