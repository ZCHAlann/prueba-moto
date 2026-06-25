// lib/video-frames.ts
//
// Extrae N frames de un video de la bayoneta de aceite. También comprime
// el video si pesa más de 5 MB para no reventar el límite de tokens
// de Gemini free tier (~1M TPM).
//
// Usa `ffmpeg-static` (binario pre-empaquetado de npm). No requiere
// instalar ffmpeg en el sistema. Funciona en Windows, Linux y Mac.

import { execFile } from 'child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import os from 'os';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// ffmpeg-static devuelve la ruta al binario de ffmpeg para esta plataforma.
// En Windows, ffmpeg.exe viene incluido en el paquete.
import ffmpegPath from 'ffmpeg-static';
const FFMPEG_BIN: string = ffmpegPath as unknown as string;

const MAX_VIDEO_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_FRAME_DIM = 1024; // ancho máximo de cada frame

/**
 * Resultado de la extracción: frames JPEG + el video comprimido (si se
 * tuvo que re-comprimir). El video comprimido se guarda temporalmente
 * para que el caller (analyzers/gemini) pueda usarlo si quiere.
 */
export type ExtractedFrames = {
  frames: Buffer[];
  /** Path al video comprimido (si se tuvo que re-comprimir). */
  compressedVideoPath: string | null;
};

/**
 * Punto de entrada principal.
 *
 * 1. Si el video > 5 MB, lo re-comprime a ~2-3 MB con ffmpeg-static.
 * 2. Extrae N frames (default 3) en posiciones 20/50/80% de la duración.
 * 3. Devuelve los frames como buffers JPEG listos para enviar a Gemini.
 *
 * Si el video es muy corto (<3s), extrae 1 solo frame.
 *
 * El directorio temporal se limpia automáticamente al final.
 */
export async function extractVideoFrames(
  videoPath: string,
  frameCount = 3,
): Promise<Buffer[]> {
  const result = await extractVideoFramesWithVideo(videoPath, frameCount);
  return result.frames;
}

/**
 * Variante que devuelve también el path al video comprimido (si se
 * comprimió). Útil cuando se quiere enviar el video completo a Gemini
 * en lugar de frames individuales.
 */
export async function extractVideoFramesWithVideo(
  videoPath: string,
  frameCount = 3,
): Promise<ExtractedFrames> {
  if (!FFMPEG_BIN) {
    throw new Error('ffmpeg-static no está disponible. Reinstala la dependencia.');
  }
  if (!existsSync(videoPath)) {
    throw new Error(`Video no encontrado en ruta: ${videoPath}`);
  }

  // Directorio temporal para esta extracción.
  const tempDir = join(os.tmpdir(), `exitauth_v_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  mkdirSync(tempDir, { recursive: true });

  let compressedVideoPath: string | null = null;
  const frames: Buffer[] = [];

  try {
    // 1. Si el video es muy grande (> 5 MB), comprimir.
    const originalSize = statSync(videoPath).size;
    let videoToUse = videoPath;
    if (originalSize > MAX_VIDEO_SIZE_BYTES) {
      const compressedPath = join(tempDir, 'compressed.mp4');
      console.info(`[video-frames] Video de ${(originalSize / 1024 / 1024).toFixed(2)} MB → comprimiendo a <5 MB`);

      // ffmpeg con CRF alto (calidad baja) y resolución reducida.
      // -preset ultrafast para que no demore.
      // -movflags +faststart para que sea un mp4 reproducible.
      await execFileAsync(FFMPEG_BIN, [
        '-y', // sobreescribir
        '-i', videoPath,
        '-vf', "scale='min(1024,iw)':-2", // máximo 1024px de ancho
        '-c:v', 'libx264',
        '-crf', '30',         // calidad baja = archivo chico
        '-preset', 'ultrafast',
        '-c:a', 'aac',
        '-b:a', '64k',
        '-movflags', '+faststart',
        compressedPath,
      ]);
      videoToUse = compressedPath;
      compressedVideoPath = compressedPath;
    }

    // 2. Obtener duración.
    // ffprobe viene incluido en ffmpeg-static? NO, solo ffmpeg. Usamos
    // ffmpeg con un input dummy para extraer la duración de los streams.
    // Truco: ffmpeg -i archivo 2>&1 | grep "Duration" → extrae la duración
    // del stderr (ffmpeg imprime info a stderr).
    const { stderr: probeStderr } = await execFileAsync(FFMPEG_BIN, [
      '-i', videoToUse,
      '-f', 'null',
      '-',
    ]).catch((err) => err as { stderr: string; stdout: string });

    // Parsear "Duration: HH:MM:SS.xx"
    const durationMatch = probeStderr.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
    let duration = 0;
    if (durationMatch) {
      const [, h, m, s] = durationMatch;
      duration = Number(h) * 3600 + Number(m) * 60 + Number(s);
    }

    if (!duration || duration <= 0) {
      // Si no pudimos parsear la duración, usar 1 frame al medio.
      console.warn('[video-frames] No se pudo determinar duración, extrayendo 1 frame al medio');
      const outputPath = join(tempDir, 'frame_0.jpg');
      await execFileAsync(FFMPEG_BIN, [
        '-y',
        '-i', videoToUse,
        '-vf', `scale='min(${MAX_FRAME_DIM},iw)':-2`,
        '-vframes', '1',
        '-q:v', '3',
        outputPath,
      ]);
      if (existsSync(outputPath)) frames.push(readFileSync(outputPath));
      return { frames, compressedVideoPath };
    }

    // 3. Si el video es muy corto, 1 frame. Si no, frameCount frames.
    const effectiveFrameCount = duration < 3 ? 1 : frameCount;

    // 4. Calcular timestamps: ratios (i+1)/(N+1) → evita 0% y 100%.
    const positions = Array.from({ length: effectiveFrameCount }, (_, i) => {
      const ratio = (i + 1) / (effectiveFrameCount + 1);
      return duration * ratio;
    });

    // 5. Extraer cada frame.
    for (let i = 0; i < positions.length; i++) {
      const timestamp = positions[i].toFixed(3);
      const outputPath = join(tempDir, `frame_${i}.jpg`);

      await execFileAsync(FFMPEG_BIN, [
        '-y',
        '-ss', timestamp,
        '-i', videoToUse,
        '-vf', `scale='min(${MAX_FRAME_DIM},iw)':-2`,
        '-vframes', '1',
        '-q:v', '3',
        outputPath,
      ]);

      if (existsSync(outputPath)) {
        frames.push(readFileSync(outputPath));
      }
    }

    return { frames, compressedVideoPath };
  } finally {
    // Limpiar el directorio temporal al final. NO borramos compressedVideoPath
    // si el caller lo está usando — el caller debe limpiarlo después.
    // Pero como el caller usa el buffer del video comprimido, no el path,
    // podemos borrar todo acá sin problema.
    try {
      const files = readdirSync(tempDir);
      for (const file of files) {
        try { unlinkSync(join(tempDir, file)); } catch { /* */ }
      }
      const { rmdirSync } = await import('fs');
      try { rmdirSync(tempDir); } catch { /* */ }
    } catch { /* */ }
  }
}

/**
 * Helper: comprime un video a un buffer MP4 (en memoria).
 * Usado cuando el caller quiere el video comprimido directamente sin
 * tener que leerlo del disco.
 */
export async function compressVideoInMemory(videoPath: string): Promise<Buffer> {
  const result = await extractVideoFramesWithVideo(videoPath, 1);
  if (!result.compressedVideoPath) {
    return readFileSync(videoPath);
  }
  return readFileSync(result.compressedVideoPath);
}
