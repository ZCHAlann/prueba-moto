// lib/maintenance-totals.ts
// jul 2026 v4-b — Cálculo de subtotal / iva / total para los items de
// mantenimiento y los extras de lavada. Centralizado acá para que el
// backend, frontend y PDF (cuando se agregue) usen la misma fórmula.
//
// jul 2026 v4-c — Cambio de semántica: `discountValue` es un IMPORTE
// monetario que el usuario ingresa (ej: "le descontaron $50"), NO un
// porcentaje. Fórmula:
//
//   subtotalPre  = quantity * unitCost           (sin descuento)
//   subtotal     = max(0, subtotalPre - discountValue)
//   ivaAmount    = subtotal * (ivaPercent/100)
//   total        = subtotal + ivaAmount
//
// El campo en BD se llama `discount_value` (migración 0042). Antes se
// llamaba `discount_percent` y representaba un 0..100.

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
  /** IMPORTE del descuento (no porcentaje). Se clampea al subtotal original. */
  discountValue?: unknown;
  ivaPercent?: unknown;
}): ItemTotals {
  const quantity         = Math.max(0, toNum(input.quantity, 1));
  const unitCost         = Math.max(0, toNum(input.unitCost, 0));
  // El descuento no puede ser negativo ni superar el subtotal original.
  const discountValue    = Math.max(0, Math.min(quantity * unitCost, toNum(input.discountValue, 0)));
  const ivaPercent       = Math.max(0, Math.min(100, toNum(input.ivaPercent, 15)));

  const subtotalPre = round2(quantity * unitCost);
  const subtotal    = round2(Math.max(0, subtotalPre - discountValue));
  const ivaAmount   = round2(subtotal * (ivaPercent / 100));
  const total       = round2(subtotal + ivaAmount);
  return { subtotal, ivaAmount, total };
}

/**
 * Suma de varios items (subtotal/iva/total general + por % de IVA).
 *
 * Devuelve también `totalDiscount` (la suma de los descuentos aplicados
 * en cada item — útil para el resumen del modal y el PDF).
 */
export function aggregateTotals(items: Array<{
  quantity?: unknown;
  unitCost?: unknown;
  discountValue?: unknown;
  ivaPercent?: unknown;
}>): {
  grandSubtotal: number;
  grandIva:      number;
  grandTotal:    number;
  byIvaPercent: Record<number, { subtotal: number; iva: number; total: number }>;
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
    const discountValue    = Math.max(0, Math.min(quantity * unitCost, toNum(it.discountValue, 0)));
    const ivaPercent       = Math.max(0, Math.min(100, toNum(it.ivaPercent, 15)));

    const originalSubtotal = round2(quantity * unitCost);

    grandSubtotal += t.subtotal;
    grandIva      += t.ivaAmount;
    grandTotal    += t.total;
    totalDiscount += discountValue;

    // Acumular por bucket de % de IVA.
    const bucket = Math.round(ivaPercent);
    if (!byIvaPercent[bucket]) byIvaPercent[bucket] = { subtotal: 0, iva: 0, total: 0 };
    byIvaPercent[bucket].subtotal = round2(byIvaPercent[bucket].subtotal + t.subtotal);
    byIvaPercent[bucket].iva      = round2(byIvaPercent[bucket].iva      + t.ivaAmount);
    byIvaPercent[bucket].total    = round2(byIvaPercent[bucket].total    + t.total);
    // Nota: originalSubtotal acá solo se usa por coherencia con la regla
    // "subtotal_pre - subtotal_post = discount" — pero como clampeamos
    // discountValue al subtotal original, en la práctica coincide con
    // `discountValue`. Mantener para auditoría visual.
    void originalSubtotal;
  }

  return {
    grandSubtotal: round2(grandSubtotal),
    grandIva:      round2(grandIva),
    grandTotal:    round2(grandTotal),
    byIvaPercent,
    totalDiscount: round2(totalDiscount),
  };
}
