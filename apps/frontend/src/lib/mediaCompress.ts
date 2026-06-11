"use client";

// ─────────────────────────────────────────────────────────────────────────────
//  mediaCompress
// ─────────────────────────────────────────────────────────────────────────────
//  Compresión client-side de imágenes y videos antes de subirlos al backend.
//
//  - Imágenes: Canvas → JPEG quality 0.85, max 1920px (mantiene aspect ratio).
//  - Video:    MediaRecorder + WebCodecs/Canvas fallback → 720p webm @ ~1.5Mbps.
//  - Thumbnail del video: primer frame renderizado en canvas.
//
//  Si el archivo ya es suficientemente pequeño, se sube tal cual (no se
//  re-codifica innecesariamente).

export type CompressOptions = {
  /** Para imágenes: ancho máximo en px (default 1920). */
  maxImageWidth?: number;
  /** Para imágenes: calidad JPEG 0..1 (default 0.85). */
  imageQuality?: number;
  /** Para videos: ancho objetivo (default 1280 = 720p). */
  targetVideoWidth?: number;
  /** Para videos: bitrate objetivo (default 1_500_000). */
  videoBitrate?: number;
};

const DEFAULT_OPTS: Required<CompressOptions> = {
  maxImageWidth:   1920,
  imageQuality:    0.85,
  targetVideoWidth: 1280,
  videoBitrate:    1_500_000,
};

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

  // Saltar ~0.1s para evitar un frame negro inicial
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

/**
 * Comprime un video re-codificándolo a 720p vía MediaRecorder.
 * Si el browser no soporta MediaRecorder, devuelve el original.
 */
export async function compressVideo(
  file: File,
  opts: CompressOptions = {},
): Promise<File> {
  const o = { ...DEFAULT_OPTS, ...opts };
  if (file.size < 2 * 1024 * 1024) return file; // <2 MB: ya está bien

  if (typeof MediaRecorder === "undefined") return file;
  if (!file.type.startsWith("video/")) return file;

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = URL.createObjectURL(file);

  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error("No se pudo cargar el video"));
  });

  const ratio = Math.min(1, o.targetVideoWidth / video.videoWidth);
  const w = Math.round(video.videoWidth * ratio);
  const h = Math.round(video.videoHeight * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  // Stream que dibuja cada frame en el canvas
  const stream = (canvas as HTMLCanvasElement).captureStream(30);
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType: "video/webm;codecs=vp8,opus",
    videoBitsPerSecond: o.videoBitrate,
  });
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  const finished = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
  });

  // Reproducir el video y dibujar cada frame
  video.currentTime = 0;
  video.play().catch(() => { /* noop */ });
  recorder.start();

  // Loop de dibujo mientras el video se reproduce
  let stopped = false;
  function drawFrame() {
    if (stopped) return;
    if (video.ended || video.paused) {
      recorder.stop();
      stopped = true;
      return;
    }
    ctx.drawImage(video, 0, 0, w, h);
    requestAnimationFrame(drawFrame);
  }
  requestAnimationFrame(drawFrame);

  const blob = await finished;
  URL.revokeObjectURL(video.src);

  if (blob.size >= file.size) {
    // Si la compresión no ayudó, devolvemos el original
    return file;
  }

  return new File([blob], replaceExt(file.name, ".webm"), {
    type: "video/webm",
    lastModified: Date.now(),
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file).catch(() => {
    // Fallback: <img> + drawImage
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
