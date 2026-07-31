// lib/maintenance-totals.ts
// jul 2026 v4-b — Mirror del frontend (apps/frontend/src/lib/maintenance-totals.ts).
// jul 2026 v4-c — `discountValue` es IMPORTE monetario.
// jul 2026 v4-d — `discountType` ('amount' | 'percent') define cómo se lee
// `discountValue`: como importe directo o como % sobre el subtotal pre-descuento.
// Default 'amount' para no romper mantenimientos ya guardados (columna nueva,
// filas viejas quedan sin discountType → se tratan como importe, igual que antes).
//
// Reglas:
//   subtotalPre = quantity * unitCost
//   discountAmount = discountType === 'percent'
//                      ? subtotalPre * clamp(discountValue, 0, 100) / 100
//                      : clamp(discountValue, 0, subtotalPre)
//   subtotal    = max(0, subtotalPre - discountAmount)
//   ivaAmount   = subtotal * (ivaPercent/100)
//   total       = subtotal + ivaAmount

export type DiscountType = 'amount' | 'percent';

export type ItemTotals = {
  subtotal: number;
  ivaAmount: number;
  total: number;
  /** Importe efectivo del descuento en $, ya resuelto sea cual sea el discountType. Útil para el footer agregado. */
  discountAmount: number;
};

function toNum(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === '') return fallback;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function resolveDiscountType(v: unknown): DiscountType {
  return v === 'percent' ? 'percent' : 'amount';
}

function computeDiscountAmount(input: {
  quantity?: unknown;
  unitCost?: unknown;
  discountValue?: unknown;
  discountType?: unknown;
}): number {
  const quantity = Math.max(0, toNum(input.quantity, 1));
  const unitCost = Math.max(0, toNum(input.unitCost, 0));
  const subtotalPre = quantity * unitCost;
  const discountType = resolveDiscountType(input.discountType);

  if (discountType === 'percent') {
    const pct = Math.max(0, Math.min(100, toNum(input.discountValue, 0)));
    return round2(subtotalPre * (pct / 100));
  }
  return round2(Math.max(0, Math.min(subtotalPre, toNum(input.discountValue, 0))));
}

/** Calcula subtotal / iva / total de UN item. */
export function computeItemTotals(input: {
  quantity?: unknown;
  unitCost?: unknown;
  /** Importe o % de descuento, según `discountType`. */
  discountValue?: unknown;
  discountType?: unknown;
  ivaPercent?: unknown;
}): ItemTotals {
  const quantity   = Math.max(0, toNum(input.quantity, 1));
  const unitCost   = Math.max(0, toNum(input.unitCost, 0));
  const ivaPercent = Math.max(0, Math.min(100, toNum(input.ivaPercent, 15)));

  const subtotalPre     = round2(quantity * unitCost);
  const discountAmount  = computeDiscountAmount(input);
  const subtotal        = round2(Math.max(0, subtotalPre - discountAmount));
  const ivaAmount       = round2(subtotal * (ivaPercent / 100));
  const total           = round2(subtotal + ivaAmount);
  return { subtotal, ivaAmount, total, discountAmount };
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
  discountType?: unknown;
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
    const ivaPercent = Math.max(0, Math.min(100, toNum(it.ivaPercent, 15)));

    grandSubtotal += t.subtotal;
    grandIva      += t.ivaAmount;
    grandTotal    += t.total;
    totalDiscount += t.discountAmount;

    // Acumular por bucket de % de IVA.
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
