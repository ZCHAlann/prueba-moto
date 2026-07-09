// lib/invoice-pdf.ts
// ─────────────────────────────────────────────────────────────────────
// Generador de PDF para un comprobante de gasto del módulo Finanzas
// (jul 2026 — modelo real, NO contable). Modelo simple: cada PDF resume
// los datos del comprobante del proveedor más la metadata del origen
// (combustible/peajes/mantenimiento) y opcionalmente trae items.
//
// Layout (carta A4):
//
//   ┌─────────────────────────────────────────────────────────────────┐
//   │ [MEMBRETE empresa]              │  COMPROBANTE                  │
//   │ Logo + nombre + NIT              │  N° factura: 2524             │
//   │ Dirección + teléfonos            │  N° legal: 2275               │
//   │                                  │  Emisión: 2026-07-07          │
//   ├─────────────────────────────────────────────────────────────────┤
//   │ PROVEEDOR                                                    │
//   │ ...                                                          │
//   ├─────────────────────────────────────────────────────────────────┤
//   │ DETALLE / ITEMS                                                │
//   ├─────────────────────────────────────────────────────────────────┤
//   │ TOTAL                                                         │
//   ├─────────────────────────────────────────────────────────────────┤
//   │ ORIGEN (si viene de combustible/peaje/mantenimiento)         │
//   ├─────────────────────────────────────────────────────────────────┤
//   │ NOTAS                                                        │
//   ├─────────────────────────────────────────────────────────────────┤
//   │ [QR BOX]              │ Leyenda                                │
//   └─────────────────────────────────────────────────────────────────┘
//
// Usa jsPDF + jspdf-autotable. QR es placeholder visual.
// ─────────────────────────────────────────────────────────────────────

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createHash } from 'crypto';

const COLOR_TEXT: [number, number, number]   = [31, 41, 55];   // gray-800
const COLOR_MUTED: [number, number, number]  = [107, 114, 128]; // gray-500
const COLOR_HEAD:  [number, number, number]  = [17, 24, 39];   // gray-900
const COLOR_RULE:  [number, number, number]  = [229, 231, 235]; // gray-200
const COLOR_BRAND: [number, number, number]  = [37, 99, 235];  // blue-600
const COLOR_OK:    [number, number, number]  = [5, 150, 105];  // emerald-600
const COLOR_BAD:   [number, number, number]  = [220, 38, 38];  // red-600

export interface InvoicePdfInput {
  invoice: {
    id: number;
    invoiceNumber: string;
    legalNumber:   string | null;
    issueDate:     string;     // YYYY-MM-DD
    amount:        string;     // decimal string
    notes:         string | null;
    items:         Array<{
      description: string;
      quantity:    string | number;
      unitPrice:   string | number;
      subtotal:    string | number;
    }>;
    invoiceTypeName: string | null;
    sourceModule: 'combustible' | 'peajes' | 'mantenimiento' | 'manual';
    sourceRef: {
      assetCode:   string | null;
      assetPlate:  string | null;
      fuelDate:    string | null;
      fuelStation: string | null;
      tollDate:    string | null;
      tollName:    string | null;
      maintenanceScheduledFor: string | null;
      maintenanceCompletedAt:  string | null;
      maintenanceTitle:        string | null;
      workshopName:            string | null;
    } | null;
  };
  supplier: {
    name:        string;
    nit:         string | null;
    contactName: string | null;
    phone:       string | null;
    email:       string | null;
    address:     string | null;
  } | null;
  company: {
    name:    string;
    nit:     string | null;
    address: string | null;
    phone:   string | null;
    email:   string | null;
    logoUrl: string | null;
  };
}

/**
 * Genera un PDF en formato carta con membrete de la empresa.
 */
export function buildInvoicePDF(input: InvoicePdfInput): Buffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;

  let y = M;

  // ─── Helpers ─────────────────────────────────────────────────────────
  const setText = (color: [number, number, number], size = 10, bold = false) => {
    doc.setTextColor(color[0], color[1], color[2]);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
  };
  const rule = (yy: number) => {
    doc.setDrawColor(COLOR_RULE[0], COLOR_RULE[1], COLOR_RULE[2]);
    doc.setLineWidth(0.2);
    doc.line(M, yy, W - M, yy);
  };
  const ensureSpace = (needed: number) => {
    if (y + needed > H - M - 16) {
      doc.addPage();
      y = M;
    }
  };
  const fmtMoney = (n: string | number | null | undefined): string => {
    if (n === null || n === undefined) return '$ —';
    const num = typeof n === 'string' ? parseFloat(n) : n;
    if (Number.isNaN(num)) return '$ —';
    return '$ ' + num.toFixed(2);
  };
  const fmtDate = (d: string | Date | null | undefined): string => {
    if (!d) return '—';
    const dt = typeof d === 'string' ? new Date(d) : d;
    if (Number.isNaN(dt.getTime())) return '—';
    return dt.toISOString().slice(0, 10);
  };

  // ─── 1) Header / membrete ────────────────────────────────────────────
  // Bloque izquierdo: empresa
  setText(COLOR_HEAD, 16, true);
  doc.text(input.company.name, M, y + 4);
  y += 9;

  setText(COLOR_MUTED, 9);
  if (input.company.nit)     { doc.text(`NIT: ${input.company.nit}`,          M, y); y += 4; }
  if (input.company.address) { doc.text(input.company.address,                 M, y); y += 4; }
  if (input.company.phone)   { doc.text(`Tel: ${input.company.phone}`,         M, y); y += 4; }
  if (input.company.email)   { doc.text(input.company.email,                   M, y); y += 4; }

  // Bloque derecho: "COMPROBANTE" + datos clave
  const rightX = W - M;
  setText(COLOR_BRAND, 18, true);
  doc.text('COMPROBANTE', rightX, M + 4, { align: 'right' });
  setText(COLOR_TEXT, 9);
  doc.text(`N° factura: ${input.invoice.invoiceNumber}`, rightX, M + 12, { align: 'right' });
  if (input.invoice.legalNumber) {
    doc.text(`N° legal: ${input.invoice.legalNumber}`, rightX, M + 17, { align: 'right' });
  }
  doc.text(`Emisión:  ${fmtDate(input.invoice.issueDate)}`, rightX, M + 22, { align: 'right' });
  y = Math.max(y, M + 32);
  rule(y);
  y += 6;

  // ─── 2) Proveedor ────────────────────────────────────────────────────
  setText(COLOR_HEAD, 11, true);
  doc.text('PROVEEDOR', M, y);
  y += 6;

  const s = input.supplier;
  const supplierName = s?.name ?? input.invoice.notes ?? '(proveedor libre)';
  setText(COLOR_TEXT, 10, true);
  doc.text(`Nombre / Razón social: ${supplierName}`, M, y); y += 5;
  setText(COLOR_TEXT, 9);
  if (s?.nit)         { doc.text(`NIT:        ${s.nit}`,         M, y); y += 4; }
  if (s?.contactName) { doc.text(`Contacto:   ${s.contactName}`,  M, y); y += 4; }
  if (s?.phone)       { doc.text(`Teléfono:   ${s.phone}`,        M, y); y += 4; }
  if (s?.email)       { doc.text(`Email:      ${s.email}`,        M, y); y += 4; }
  if (s?.address)     { doc.text(`Dirección:  ${s.address}`,      M, y); y += 4; }
  rule(y);
  y += 6;

  // ─── 3) Tabla de items ───────────────────────────────────────────────
  setText(COLOR_HEAD, 11, true);
  doc.text('DETALLE', M, y);
  y += 4;

  const items = input.invoice.items ?? [];
  const tableRows =
    items.length > 0
      ? items.map((it, idx) => [
          String(idx + 1),
          it.description,
          String(it.quantity),
          fmtMoney(it.unitPrice),
          fmtMoney(it.subtotal),
        ])
      : [['1', 'Servicio / compra descrita en la factura', '1', fmtMoney(input.invoice.amount), fmtMoney(input.invoice.amount)]];

  autoTable(doc, {
    head: [['#', 'Descripción', 'Cant.', 'Precio unit.', 'Subtotal']],
    body: tableRows,
    startY: y,
    margin: { left: M, right: M },
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: COLOR_HEAD, textColor: [255, 255, 255] },
    columnStyles: {
      0: { halign: 'right',  cellWidth: 10 },
      1: { halign: 'left',                  },
      2: { halign: 'right',  cellWidth: 18 },
      3: { halign: 'right',  cellWidth: 28 },
      4: { halign: 'right',  cellWidth: 28 },
    },
  });

  // After autoTable, y advances internally. Get it:
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lastTableY = (doc as any).lastAutoTable?.finalY ?? y + 20;
  y = lastTableY + 8;

  // ─── 4) Totales (a la derecha) ──────────────────────────────────────
  ensureSpace(40);
  const totalsX = W - M - 60;
  const totalsW = 60;

  // Subtotal = amount - IVA asumida (15%); si no tiene items, Subtotal = amount.
  // Para el MVP mostramos solo: Subtotal, Total, Saldo.
  const amount = parseFloat(input.invoice.amount);

  setText(COLOR_HEAD, 10, true);
  doc.text('TOTAL', totalsX, y);
  doc.text(fmtMoney(amount), totalsX + totalsW, y, { align: 'right' });
  y += 6;

  rule(y);
  y += 6;

  // (jul 2026 — REMOVIDO bloque CxP: el módulo ya no maneja estados de pago
  // ni saldos. El PDF muestra solo la metadata del comprobante + origen.)

  // ─── 5) Source ref (si viene de combustible/peajes/mantenimiento) ─────
  if (input.invoice.sourceModule !== 'manual' && input.invoice.sourceRef) {
    ensureSpace(20);
    setText(COLOR_HEAD, 10, true);
    doc.text('ORIGEN', M, y);
    y += 5;
    setText(COLOR_TEXT, 9);
    const sr = input.invoice.sourceRef;
    if (sr.assetPlate) {
      doc.text(`Vehículo: ${sr.assetPlate}${sr.assetCode ? ` (${sr.assetCode})` : ''}`, M, y); y += 4;
    }
    if (sr.fuelDate)   { doc.text(`Fecha de carga:  ${fmtDate(sr.fuelDate)}`, M, y); y += 4; }
    if (sr.fuelStation){ doc.text(`Estación:        ${sr.fuelStation}`,       M, y); y += 4; }
    if (sr.tollDate)   { doc.text(`Fecha de peaje:  ${fmtDate(sr.tollDate)}`, M, y); y += 4; }
    if (sr.tollName)   { doc.text(`Caseta:          ${sr.tollName}`,          M, y); y += 4; }
    if (sr.maintenanceTitle) {
      doc.text(`Mant. título:    ${sr.maintenanceTitle}`, M, y); y += 4;
    }
    if (sr.maintenanceCompletedAt) {
      doc.text(`Mant. cierre:    ${fmtDate(sr.maintenanceCompletedAt)}`, M, y); y += 4;
    }
    if (sr.workshopName) {
      doc.text(`Taller:          ${sr.workshopName}`, M, y); y += 4;
    }
  }

  // ─── 7) Notas ────────────────────────────────────────────────────────
  if (input.invoice.notes) {
    ensureSpace(20);
    setText(COLOR_HEAD, 10, true);
    doc.text('NOTAS', M, y);
    y += 5;
    setText(COLOR_TEXT, 9);
    const lines = doc.splitTextToSize(input.invoice.notes, W - M * 2);
    doc.text(lines, M, y);
    y += lines.length * 4 + 2;
  }

  // ─── 8) Footer + QR placeholder ──────────────────────────────────────
  ensureSpace(50);
  y = Math.max(y, H - M - 50);
  rule(y);
  y += 6;

  // Bloque izquierdo: QR placeholder (cuadrado 30×30mm con label "QR").
  // Genera un token hash de la factura (no expone el ID plano).
  const tokenSrc = `inv-${input.invoice.id}-${input.company.name}`;
  const verifyToken = createHash('sha256').update(tokenSrc).digest('hex').slice(0, 16);
  const qrUrl = `${process.env.PUBLIC_API_HOST ?? 'https://aplismart.example.com'}/api/public/invoices/${verifyToken}`;

  const qrSize = 30;
  const qrX = M;
  const qrY = y;

  doc.setDrawColor(COLOR_RULE[0], COLOR_RULE[1], COLOR_RULE[2]);
  doc.setLineWidth(0.5);
  doc.rect(qrX, qrY, qrSize, qrSize);

  setText(COLOR_MUTED, 7);
  doc.text('QR de verificación', qrX + qrSize / 2, qrY + qrSize / 2, { align: 'center' });
  doc.text(`token: ${verifyToken}`, qrX + qrSize / 2, qrY + qrSize / 2 + 5, { align: 'center' });

  // Bloque derecho: leyenda.
  const legendX = qrX + qrSize + 6;
  setText(COLOR_TEXT, 8, true);
  doc.text('ApliSmart Motors — v2', legendX, y + 4);
  y += 8;

  setText(COLOR_MUTED, 7);
  doc.text(
    [
      'Verificá este comprobante escaneando el QR o',
      'ingresando a:',
      qrUrl,
    ],
    legendX,
    y,
  );
  y += 12;

  setText(COLOR_MUTED, 7, true);
  doc.text(
    'Este documento NO es una factura electrónica salvo que la empresa haya',
    legendX,
    y,
  );
  y += 4;
  doc.text(
    'registrado número ante la DIAN/SRI/SUNAT y se emita a través del PAC autorizado.',
    legendX,
    y,
  );

  // ─── Número de página ────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    setText(COLOR_MUTED, 7);
    doc.text(`Página ${i} de ${totalPages}`, W - M, H - 6, { align: 'right' });
  }

  return Buffer.from(doc.output('arraybuffer'));
}

/**
 * Genera el token de verificación que se codifica en el QR.
 * Por seguridad NO usa el ID plano de la factura — usa un hash del ID
 * + nombre de empresa, lo que evita enumeración de IDs públicos.
 */
export function getInvoiceVerifyToken(invoiceId: number, companyName: string): string {
  return createHash('sha256')
    .update(`inv-${invoiceId}-${companyName}`)
    .digest('hex')
    .slice(0, 16);
}
