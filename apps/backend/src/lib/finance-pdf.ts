// ─────────────────────────────────────────────────────────────────────────────
// lib/finance-pdf.ts
//
// jul 2026 — Generación de PDFs del módulo Caja Chica + Transacciones.
//
// 1) buildVoucherPdf   → vale de caja chica imprimible (formato media carta).
//                        Se descarga desde GET /finance/vouchers/:id/pdf.
// 2) buildTransactionsPdf → reporte detallado de transacciones (rango de fechas
//                        + scope petty_cash/annual/all). Se descarga desde
//                        GET /finance/transactions/export.pdf.
//
// Implementación: jsPDF + jspdf-autotable (mismas libs que invoice-pdf.ts y
// stats-pdf.ts ya usan en este proyecto).
// ─────────────────────────────────────────────────────────────────────────────

import type { companyPettyCashVouchers } from '../db/schema/operational';

export interface VoucherPdfInput {
  voucher: typeof companyPettyCashVouchers.$inferSelect;
  siteName: string;
  assigneeName: string;
  requestReason: string;
}

export interface TransactionsPdfInput {
  companyName: string;
  scope: 'petty_cash' | 'annual' | 'all';
  fromDate?: string;
  toDate?: string;
  items: Array<{
    source: 'petty_cash_movement' | 'annual_expense';
    id: number;
    amount: string | number;
    occurredAt: Date | string;
    description: string;
    category: string | null;
    relatedVoucherId: number | null;
    relatedRequestId: number | null;
    actorName: string | null;
    balanceAfter: string | null;
  }>;
}

/**
 * Genera el PDF del vale de caja chica. Formato media carta, una plana.
 * Devuelve un Buffer con el PDF binario listo para enviar al cliente.
 *
 * Se llama desde el route handler — errores se propagan al errorHandler.
 */
export async function buildVoucherPdf(input: VoucherPdfInput): Promise<Buffer> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'landscape' });

  const v = input.voucher;
  const issued = Number(v.issuedAmount);
  const actual = v.closedActualAmount != null ? Number(v.closedActualAmount) : null;
  const refund = Number(v.refundAmount);

  // ── Header ───────────────────────────────────────────────────────────────
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('VALE DE CAJA CHICA', 10, 15);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Vale #${v.id}`, 10, 22);
  doc.text(`Emitido: ${formatDate(v.createdAt)}`, 10, 27);
  doc.text(`Estado: ${labelStatus(v.status)}`, 10, 32);

  // ── Datos del operador y sede ─────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.text('OPERADOR', 10, 42);
  doc.setFont('helvetica', 'normal');
  doc.text(input.assigneeName, 10, 47);

  doc.setFont('helvetica', 'bold');
  doc.text('SEDE', 90, 42);
  doc.setFont('helvetica', 'normal');
  doc.text(input.siteName, 90, 47);

  // ── Motivo ──────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.text('MOTIVO / JUSTIFICACIÓN', 10, 58);
  doc.setFont('helvetica', 'normal');
  const reasonLines = doc.splitTextToSize(input.requestReason || '—', 130);
  doc.text(reasonLines, 10, 63);

  // ── Montos ──────────────────────────────────────────────────────────────
  const yMoney = 85;
  doc.setFont('helvetica', 'bold');
  doc.text('MONTO EMITIDO', 10, yMoney);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.text(`$ ${issued.toFixed(2)}`, 10, yMoney + 7);

  if (actual != null) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('MONTO GASTADO', 60, yMoney);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(14);
    doc.text(`$ ${actual.toFixed(2)}`, 60, yMoney + 7);

    if (refund > 0) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('REEMBOLSO A CAJA', 110, yMoney);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(14);
      doc.text(`$ ${refund.toFixed(2)}`, 110, yMoney + 7);
    }
  }

  // ── Firmas ──────────────────────────────────────────────────────────────
  const ySign = 115;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.line(15, ySign, 75, ySign);
  doc.text('Firma del operador', 30, ySign + 4);
  doc.line(115, ySign, 175, ySign);
  doc.text('Firma del aprobador', 130, ySign + 4);

  // ── Footer ─────────────────────────────────────────────────────────────
  doc.setFontSize(7);
  doc.setTextColor(120);
  doc.text(`Generado ${formatDateTime(new Date())}`, 10, 140);

  const out = doc.output('arraybuffer');
  return Buffer.from(out);
}

/**
 * Genera el PDF detallado de transacciones para el rango + scope dados.
 * Tabla con todas las filas + totales por scope al final.
 */
export async function buildTransactionsPdf(input: TransactionsPdfInput): Promise<Buffer> {
  const { jsPDF } = await import('jspdf');
  const autoTableMod = await import('jspdf-autotable');
  const autoTable = (autoTableMod as any).default ?? autoTableMod;

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  // Header
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Reporte de Transacciones', 14, 18);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(input.companyName, 14, 24);

  doc.setFontSize(9);
  const scopeLabel = input.scope === 'all' ? 'Caja chica + Gastos anuales'
                   : input.scope === 'petty_cash' ? 'Caja chica'
                   : 'Gastos anuales';
  doc.text(`Scope: ${scopeLabel}`, 14, 30);
  doc.text(`Desde: ${input.fromDate ?? 'inicio'}   Hasta: ${input.toDate ?? 'hoy'}`, 14, 35);

  // Body — tabla
  const body = input.items.map(i => [
    formatDate(i.occurredAt),
    i.source === 'petty_cash_movement' ? 'Caja Chica' : 'Gasto Anual',
    i.category ?? '—',
    i.description.length > 50 ? i.description.slice(0, 47) + '...' : i.description,
    i.actorName ?? '—',
    `$${Number(i.amount).toFixed(2)}`,
  ]);

  autoTable(doc, {
    startY: 42,
    head: [['Fecha', 'Origen', 'Categoría', 'Descripción', 'Actor', 'Monto']],
    body,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [60, 60, 80], textColor: 255 },
    columnStyles: {
      5: { halign: 'right', fontStyle: 'bold' },
    },
  });

  // Total
  const total = input.items.reduce((s, i) => s + Number(i.amount), 0);
  const finalY = (doc as any).lastAutoTable?.finalY ?? 50;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total: $${total.toFixed(2)}`, 14, finalY + 10);
  doc.text(`Cantidad de movimientos: ${input.items.length}`, 14, finalY + 16);

  const out = doc.output('arraybuffer');
  return Buffer.from(out);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '—';
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateTime(d: Date): string {
  const datePart = formatDate(d);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${datePart} ${hh}:${mm} UTC`;
}

function labelStatus(s: string): string {
  switch (s) {
    case 'open':      return 'ABIERTO';
    case 'closed':    return 'CERRADO';
    case 'cancelled': return 'CANCELADO';
    default: return s;
  }
}