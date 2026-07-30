// lib/staff-card-pdf.ts
// ─────────────────────────────────────────────────────────────────────
// Generador de PDF para el carnet digital (ID card) del personal.
// jul 2026 v8.7 — Reemplaza el approach basado en html2canvas (rompía
// con gradientes, ring shadows y dark mode) Y el approach paralelo
// de "diseño parecido" (que quedaba con layout distinto al modal).
//
// AHORA: el PDF se arma leyendo la MISMA foto del modal y la MISMA
// data del user, y se dibuja con el mismo estilo (dark mode, gradientes
// de la caja de foto, barra de nombre superpuesta, etc.). No es
// pixel-perfect (jsPDF no soporta CSS como ring-* o shadow-X), pero
// el layout, colores y proporciones son los mismos que el modal en
// pantalla — el usuario ve el carnet en el modal, lo descarga, y el
// PDF ES la misma credencial, solo que con la info en un canvas
// vectorial en vez de DOM.
// ─────────────────────────────────────────────────────────────────────

import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { signStaffQrToken } from './qr-token';

// ─── Tipos ────────────────────────────────────────────────────────────────

export interface StaffCardPdfInput {
  user: {
    id: number;
    fullName: string;
    roleLabel: string;
    roleKey: string;
    username: string;
    email: string;
    dni: string | null;
    /** URL de la foto (relativa al backend `/uploads/...` o absoluta). */
    photoUrl: string | null;
  };
  company: {
    id: number;
    name: string;
  };
  /** Datos de licencia si es conductor. */
  license: {
    number: string;
    type: string;
    expiry: string | null;
    points: number;
  } | null;
}

// ─── Dimensiones del carnet (en mm) ──────────────────────────────────────
//
// El modal en pantalla mide ~360×400px con padding externo. Mantenemos
// esa misma proporción (3:4) en mm para que el PDF se imprima a tamaño
// credencial real (un poco más grande que ID-1, pero proporcional).
//
// 70×95mm + padding 4mm = 78×103mm. Da espacio cómodo para los textos
// sin saturar.
const CARD_W = 70;
const CARD_H = 95;
const M = 4;

// ─── Paleta (dark mode, idéntica al modal en pantalla) ──────────────────
//
// gris-900 del modal: bg-gray-900 = #111827 → rgb(17, 24, 39)
// black para la barra de nombre: #000
// azul-300 para el label de rol: #93c5fd → rgb(147, 197, 253)
// gris-500 para labels: #6b7280
// blanco para texto principal: #ffffff
// gris-400 para el footer: #9ca3af

const COLOR_BG_CARD:    [number, number, number] = [17, 24, 39];     // gray-900 (fondo del carnet)
const COLOR_BG_NAME:    [number, number, number] = [0, 0, 0];        // black (barra de nombre)
const COLOR_TEXT_WHITE: [number, number, number] = [255, 255, 255];  // texto principal
const COLOR_TEXT_LABEL: [number, number, number] = [107, 114, 128];  // gray-500 (labels)
const COLOR_TEXT_ROLE:  [number, number, number] = [147, 197, 253];  // blue-300 (rol)
const COLOR_TEXT_FOOT:  [number, number, number] = [156, 163, 175];  // gray-400 (footer)
const COLOR_RULE:       [number, number, number] = [55, 65, 81];      // gray-700 (footer divider)

// Foto box — igual al modal: gradiente azul (light bg-blue-400 → blue-600)
// pero acá renderizado como un color sólido azul de marca + la foto encima.
// Si no hay foto, fallback a gris-700 con iniciales blancas.
const COLOR_PHOTO_BG_TOP:    [number, number, number] = [96, 165, 250]; // blue-400
const COLOR_PHOTO_BG_BOTTOM: [number, number, number] = [37, 99, 235];  // blue-600
const COLOR_FALLBACK_BG:      [number, number, number] = [55, 65, 81];  // gray-700

// ─── Helpers ──────────────────────────────────────────────────────────────

function setText(
  doc: jsPDF,
  color: [number, number, number],
  size = 10,
  bold = false,
) {
  doc.setTextColor(color[0], color[1], color[2]);
  doc.setFont('helvetica', bold ? 'bold' : 'normal');
  doc.setFontSize(size);
}

/**
 * Genera un QR como PNG buffer. Error correction level "M" (~15%
 * redundancia) — buen balance entre densidad y resistencia a rayones.
 * Margin 1 (cuadrado de Quiet Zone mínimo) para lectores de baja calidad.
 */
async function generateQrPng(text: string, sizePx = 256): Promise<Buffer> {
  return QRCode.toBuffer(text, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: sizePx,
    color: {
      dark: '#0f172a',   // slate-900 (mismo fgColor del QR del modal)
      light: '#ffffff',
    },
  });
}

/**
 * Descarga la foto del user desde el backend. Acepta URLs absolutas
 * (http/https) o relativas (`/uploads/...`). Resuelve relativas contra
 * el host del API.
 *
 * Devuelve `null` si la URL está vacía, no se puede descargar, o la
 * respuesta no es imagen. NO lanza — el caller usa el resultado de
 * forma opcional.
 */
async function fetchPhotoAsPng(photoUrl: string | null, apiHost: string): Promise<Buffer | null> {
  if (!photoUrl) return null;
  try {
    const absUrl = photoUrl.startsWith('http')
      ? photoUrl
      : `${apiHost.replace(/\/$/, '')}${photoUrl.startsWith('/') ? '' : '/'}${photoUrl}`;
    const res = await fetch(absUrl);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

// ─── Función principal ────────────────────────────────────────────────────

/**
 * Genera el buffer del PDF del carnet. Async porque la generación del
 * QR y la descarga de la foto son async.
 *
 * Layout (en mm, mismo orden visual que el modal):
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ ┌─ FOTO (h=42, full width con rounded) ─┐   │ ←  gradiente azul
 *   │ │                                        │   │
 *   │ └────────────────────────────────────────┘   │
 *   │      ┌─ BARRA NOMBRE (negra) ──────────┐     │ ←  superpuesta
 *   │      │ NOMBRE (uppercase, blanco)      │     │
 *   │      │ ROL (uppercase, azul)            │     │
 *   │      └──────────────────────────────────┘     │
 *   │                                              │
 *   │  ── columna izq ──   ── columna der ──      │
 *   │  DOCUMENTO           ┌─ QR ─┐                │
 *   │  1423423432          │     │  IDxxxxx       │
 *   │  USUARIO             └─────┘                │
 *   │  @felipe                                    │
 *   │  LICENCIA                                   │
 *   │  B · 2342342342                             │
 *   │  VENCE                                      │
 *   │  2030-03-12                                 │
 *   │  PUNTOS                                     │
 *   │  25                                         │
 *   │                                              │
 *   │  ───────────────────────────────────────     │
 *   │  VALIDAR PERSONAL · APLISMART MOTORS         │ ←  footer
 *   └──────────────────────────────────────────────┘
 */
export async function buildStaffCardPDF(
  input: StaffCardPdfInput,
  options?: { apiHost?: string },
): Promise<Buffer> {
  const apiHost = options?.apiHost
    ?? process.env.PUBLIC_API_HOST
    ?? 'http://localhost:5000';

  // 1) Token QR + PNG del QR. Mismo flujo que el modal.
  const token = signStaffQrToken(input.user.id, input.company.id);
  const publicBase =
    process.env.PUBLIC_FRONTEND_HOST
    ?? process.env.PUBLIC_API_HOST
    ?? 'http://localhost:5173';
  const qrUrl = `${publicBase.replace(/\/$/, '')}/verify/${token}`;
  const qrPng = await generateQrPng(qrUrl, 256);

  // 2) Descargar la foto del user (si hay).
  const photoPng = await fetchPhotoAsPng(input.user.photoUrl, apiHost);

  // 3) Iniciales para el fallback cuando no hay foto.
  const initials = (input.user.fullName || input.user.username || '?')
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // ── Setup del PDF ───────────────────────────────────────────────────
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [CARD_W + M * 2, CARD_H + M * 2],
  });

  // Fondo del carnet (gris-900 del modal). Rectángulo redondeado.
  doc.setFillColor(COLOR_BG_CARD[0], COLOR_BG_CARD[1], COLOR_BG_CARD[2]);
  doc.roundedRect(M, M, CARD_W, CARD_H, 4, 4, 'F');

  // ── Foto grande arriba ─────────────────────────────────────────────
  // Caja de la foto: ancho = CARD_W - 8mm (4mm padding cada lado)
  //                alto  = 42mm (proporcional al modal 168px ~ 30% del total)
  const photoX = M + 4;
  const photoY = M + 4;
  const photoW = CARD_W - 8;
  const photoH = 42;

  // Fondo de la foto: gradiente azul (simulado con dos rectángulos
  // superpuestos con opacidad). jsPDF no soporta linear-gradient
  // nativo, así que pintamos un color sólido azul-600 y dejamos que
  // la foto (si hay) tape el color.
  doc.setFillColor(COLOR_PHOTO_BG_BOTTOM[0], COLOR_PHOTO_BG_BOTTOM[1], COLOR_PHOTO_BG_BOTTOM[2]);
  doc.roundedRect(photoX, photoY, photoW, photoH, 3, 3, 'F');

  if (photoPng) {
    // Detectar formato: PNG o JPEG. La URL ya pasó el content-type
    // check así que es imagen, pero addImage necesita saber si es
    // 'PNG' o 'JPEG'.
    // Heurística: los primeros 4 bytes de un PNG son 89 50 4E 47.
    const isPng = photoPng[0] === 0x89 && photoPng[1] === 0x50;
    try {
      doc.addImage(
        photoPng,
        isPng ? 'PNG' : 'JPEG',
        photoX, photoY, photoW, photoH,
        undefined, // alias
        'FAST',    // compression (NONE también funciona pero genera PDFs grandes)
      );
    } catch {
      // Si la imagen está corrupta o el formato no se detecta bien,
      // caemos al fallback de iniciales sin romper.
      drawInitials(doc, initials, photoX, photoY, photoW, photoH);
    }
  } else {
    drawInitials(doc, initials, photoX, photoY, photoW, photoH);
  }

  // ── Barra de nombre superpuesta al borde inferior de la foto ──────
  // En el modal está con -mt-6 (superpuesto). Acá simulamos eso
  // poniéndola más arriba del borde.
  const nameBarH = 11;
  const nameBarY = photoY + photoH - (nameBarH / 2); // superpuesto
  const nameBarX = photoX + 4;
  const nameBarW = photoW - 8;

  doc.setFillColor(COLOR_BG_NAME[0], COLOR_BG_NAME[1], COLOR_BG_NAME[2]);
  doc.roundedRect(nameBarX, nameBarY, nameBarW, nameBarH, 2, 2, 'F');

  // Nombre (uppercase, bold, blanco)
  setText(doc, COLOR_TEXT_WHITE, 9, true);
  doc.text(
    (input.user.fullName || input.user.username || '—').toUpperCase(),
    M + CARD_W / 2,
    nameBarY + 5,
    { align: 'center', maxWidth: nameBarW - 6 },
  );
  // Rol (uppercase, azul claro, más chico)
  setText(doc, COLOR_TEXT_ROLE, 7, false);
  doc.text(
    (input.user.roleLabel || '').toUpperCase(),
    M + CARD_W / 2,
    nameBarY + 9,
    { align: 'center', maxWidth: nameBarW - 6 },
  );

  // ── Grilla de datos: izquierda (datos) / derecha (QR) ─────────────
  const gridY = nameBarY + nameBarH + 4; // arranca debajo de la barra
  const gridH = CARD_H - (gridY - M) - 8;  // deja 8mm para el footer

  // Split: izquierda 60% del ancho, derecha 40% con el QR
  const leftX = M + 4;
  const leftW = (CARD_W - 8) * 0.6;
  const rightX = leftX + leftW + 2;
  const rightW = (CARD_W - 8) * 0.4 - 2;

  // ── Columna izquierda: campos apilados ──
  let cy = gridY;
  const lineH = gridH / 7; // hasta 7 campos (documento, usuario, email?, licencia, vence, puntos, ...)

  // Helper local para los campos
  const drawField = (label: string, value: string, yPos: number) => {
    setText(doc, COLOR_TEXT_LABEL, 6, true);
    doc.text(label.toUpperCase(), leftX, yPos);
    setText(doc, COLOR_TEXT_WHITE, 8, true);
    doc.text(value || '—', leftX, yPos + 3, { maxWidth: leftW });
  };

  drawField('Documento', input.user.dni || '—', cy);          cy += lineH;
  drawField('Usuario', `@${input.user.username}`, cy);          cy += lineH;
  if (input.user.email) {
    drawField('Email', input.user.email, cy);                    cy += lineH;
  }

  if (input.license) {
    const licText = input.license.number
      ? `${input.license.type ? `${input.license.type} · ` : ''}${input.license.number}`
      : '—';
    drawField('Licencia', licText, cy);                          cy += lineH;
    if (input.license.expiry) {
      drawField('Vence', input.license.expiry, cy);              cy += lineH;
    }
    drawField('Puntos', String(input.license.points), cy);      cy += lineH;
  }

  // ── Columna derecha: QR ──
  // Caja blanca con border, centrada en la columna derecha
  const qrBoxSize = Math.min(rightW, gridH - 8); // ~22mm
  const qrBoxX = rightX + (rightW - qrBoxSize) / 2;
  const qrBoxY = gridY;

  // Caja blanca del QR
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 1, 1, 'F');
  // Borde sutil
  doc.setDrawColor(229, 231, 235); // gray-200
  doc.setLineWidth(0.2);
  doc.roundedRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 1, 1, 'S');

  // QR con padding interno de 1.5mm
  const qrPad = 1.5;
  doc.addImage(
    qrPng,
    'PNG',
    qrBoxX + qrPad,
    qrBoxY + qrPad,
    qrBoxSize - qrPad * 2,
    qrBoxSize - qrPad * 2,
  );

  // ID corto debajo del QR (mismo que en el modal)
  const shortId = `ID${token.replace(/[^A-Za-z0-9]/g, '').slice(-8).toUpperCase()}`;
  setText(doc, COLOR_TEXT_FOOT, 6, false);
  doc.text(
    shortId,
    qrBoxX + qrBoxSize / 2,
    qrBoxY + qrBoxSize + 3,
    { align: 'center' },
  );

  // ── Pie de marca (footer) ──────────────────────────────────────────
  const footerY = M + CARD_H - 4.5;
  // `setText` espera (doc, color_tupla, size, bold). Acá solo
  // necesitamos setear el color del draw para la línea divisoria,
  // no el texto — usamos setDrawColor directo. setText está mal
  // acá (pasé los componentes del color sueltos en lugar del array
  // completo → jsPDF explota con "Invalid argument passed to jsPDF.f3").
  doc.setDrawColor(COLOR_RULE[0], COLOR_RULE[1], COLOR_RULE[2]);
  doc.setLineWidth(0.15);
  doc.line(M + 4, footerY - 3, M + CARD_W - 4, footerY - 3);

  setText(doc, COLOR_TEXT_FOOT, 6.5, true);
  doc.text(
    `VALIDAR PERSONAL · ${input.company.name.toUpperCase().slice(0, 22)}`,
    M + CARD_W / 2,
    footerY,
    { align: 'center' },
  );

  return Buffer.from(doc.output('arraybuffer'));
}

// ─── Helpers internos ────────────────────────────────────────────────────

function drawInitials(
  doc: jsPDF,
  initials: string,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  // Fondo gris-700 cuando no hay foto
  doc.setFillColor(COLOR_FALLBACK_BG[0], COLOR_FALLBACK_BG[1], COLOR_FALLBACK_BG[2]);
  doc.roundedRect(x, y, w, h, 3, 3, 'F');
  // Iniciales grandes en blanco
  setText(doc, COLOR_TEXT_WHITE, 28, true);
  doc.text(initials, x + w / 2, y + h / 2 + 4, { align: 'center' });
}
