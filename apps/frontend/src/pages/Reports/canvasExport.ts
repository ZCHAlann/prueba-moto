"use client";

// ─────────────────────────────────────────────────────────────────────────────
// pages/Reports/canvasExport.ts
//
// Exporta el lienzo (canvas libre con widgets) a PDF tal cual se ve en
// pantalla. Captura el DOM a PNG en alta resolución y lo embebe en un PDF
// con el mismo aspect ratio — no reconstruye el layout, lo "fotografía".
//
// Requiere: npm install html-to-image
// ─────────────────────────────────────────────────────────────────────────────

import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";

const PX_TO_MM = 0.2645833333;

export type ExportCanvasOpts = {
  /** Elemento contenedor del canvas (el div con los widgets de react-rnd). */
  canvasEl: HTMLElement;
  /** Nombre del lienzo, usado para el nombre del archivo. */
  boardName: string;
  /** Resolución de captura. 2 = nítido en pantallas retina/impresión. */
  pixelRatio?: number;
};

export async function exportCanvasToPdf(opts: ExportCanvasOpts): Promise<void> {
  const { canvasEl, boardName, pixelRatio = 2 } = opts;

  const bg = getComputedStyle(canvasEl).backgroundColor;
  const dataUrl = await toPng(canvasEl, {
    pixelRatio,
    backgroundColor: bg && bg !== "rgba(0, 0, 0, 0)" ? bg : "#ffffff",
    filter: (node) => {
      // Permite excluir elementos puramente de edición (handles de resize,
      // botones flotantes de un widget seleccionado) agregando
      // data-export-ignore="true" en esos nodos si hace falta más adelante.
      if (node instanceof HTMLElement && node.dataset?.exportIgnore === "true") {
        return false;
      }
      return true;
    },
  });

  const img = await loadImage(dataUrl);

  const wMm = img.width * PX_TO_MM;
  const hMm = img.height * PX_TO_MM;

  const doc = new jsPDF({
    orientation: wMm >= hMm ? "landscape" : "portrait",
    unit: "mm",
    format: [wMm, hMm],
  });

  doc.addImage(dataUrl, "PNG", 0, 0, wMm, hMm);

  const safeName = boardName.trim().length > 0
    ? boardName.replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/g, "").replace(/\s+/g, "_")
    : "lienzo";

  doc.save(`${safeName}.pdf`);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e instanceof Error ? e : new Error("No se pudo cargar la imagen capturada"));
    img.src = src;
  });
}