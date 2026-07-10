// lib/maintenance-totals.ts
// jul 2026 v4-b — Cálculo de subtotal / iva / total para los items de
// mantenimiento y los extras de lavada. Centralizado acá para que el
// backend, frontend y PDF (cuando se agregue) usen la misma fórmula.
//
// Reglas de negocio (Ecuador, jul 2026):
//   - subtotal     = quantity * unitCost * (1 - discountPercent/100)
//   - ivaAmount    = subtotal * (ivaPercent/100)
//   - total        = subtotal + ivaAmount
//   - IVA 0%       = item exento (combustibles, medicamentos, etc.)
//   - IVA 12% / 15% = IVA general
//   - discountPercent es por fila (0..100), default 0
//   - ivaPercent es por fila (0..100), default 15
//
// El backend SIEMPRE recalcula antes de persistir; el frontend puede
// previsualizar en vivo (es la misma fórmula).
//
// Las funciones aceptan `unknown` para no atarse al tipo Drizzle;
// las conversiones internas toleran string/null.

export type ItemTotals = {
  subtotal: number;
  ivaAmount: number;
  total: number;
};

function toNum(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === '') return fallback;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Calcula subtotal / iva / total de UN item. */
export function computeItemTotals(input: {
  quantity?: unknown;
  unitCost?: unknown;
  discountPercent?: unknown;
  ivaPercent?: unknown;
}): ItemTotals {
  const quantity         = Math.max(0, toNum(input.quantity, 1));
  const unitCost         = Math.max(0, toNum(input.unitCost, 0));
  const discountPercent  = Math.max(0, Math.min(100, toNum(input.discountPercent, 0)));
  const ivaPercent       = Math.max(0, Math.min(100, toNum(input.ivaPercent, 15)));

  const subtotal  = round2(quantity * unitCost * (1 - discountPercent / 100));
  const ivaAmount = round2(subtotal * (ivaPercent / 100));
  const total     = round2(subtotal + ivaAmount);
  return { subtotal, ivaAmount, total };
}

/** Suma de varios items (subtotal/iva/total general + por % de IVA). */
export function aggregateTotals(items: Array<{
  quantity?: unknown;
  unitCost?: unknown;
  discountPercent?: unknown;
  ivaPercent?: unknown;
}>): {
  grandSubtotal: number;
  grandIva:      number;
  grandTotal:    number;
  // Desglose por % de IVA. Útil para el PDF y el resumen del modal.
  byIvaPercent: Record<number, { subtotal: number; iva: number; total: number }>;
  // Total de descuentos aplicados (precio original - subtotal).
  totalDiscount: number;
} {
  const byIvaPercent: Record<number, { subtotal: number; iva: number; total: number }> = {};
  let grandSubtotal = 0;
  let grandIva      = 0;
  let grandTotal    = 0;
  let totalDiscount = 0;

  for (const it of items) {
    const t = computeItemTotals(it);
    const quantity         = Math.max(0, toNum(it.quantity, 1));
    const unitCost         = Math.max(0, toNum(it.unitCost, 0));
    const discountPercent  = Math.max(0, Math.min(100, toNum(it.discountPercent, 0)));
    const ivaPercent       = Math.max(0, Math.min(100, toNum(it.ivaPercent, 15)));

    const originalSubtotal = round2(quantity * unitCost);
    const discountValue    = round2(originalSubtotal - t.subtotal);

    grandSubtotal += t.subtotal;
    grandIva      += t.ivaAmount;
    grandTotal    += t.total;
    totalDiscount += discountValue;

    // Acumular por bucket de % de IVA (sin decimales, es 0/12/15 típicamente).
    const bucket = Math.round(ivaPercent);
    if (!byIvaPercent[bucket]) byIvaPercent[bucket] = { subtotal: 0, iva: 0, total: 0 };
    byIvaPercent[bucket].subtotal = round2(byIvaPercent[bucket].subtotal + t.subtotal);
    byIvaPercent[bucket].iva      = round2(byIvaPercent[bucket].iva      + t.ivaAmount);
    byIvaPercent[bucket].total    = round2(byIvaPercent[bucket].total    + t.total);
  }

  return {
    grandSubtotal: round2(grandSubtotal),
    grandIva:      round2(grandIva),
    grandTotal:    round2(grandTotal),
    byIvaPercent,
    totalDiscount: round2(totalDiscount),
  };
}
