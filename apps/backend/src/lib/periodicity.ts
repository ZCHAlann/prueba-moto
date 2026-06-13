// apps/backend/src/lib/periodicity.ts
//
// Helpers para calcular el ciclo actual de una categoría con periodicidad.
// Usado por:
//   - GET /checklists/pendientes  (deriva qué hay que hacer este ciclo)
//   - GET /checklists/vencidos    (sweep on-demand de ciclos cerrados)
//   - POST /checklists            (valida que aún esté dentro de la ventana)
//
// Modelo de periodicidad (definido en el schema):
//   - 'none'   -> no hay ciclo. Pendiente = combinación categoría × activo
//                 sin hacer nunca. (legacy: comportamiento actual)
//   - 'weekly' -> ciclo lunes 00:00 — domingo 23:59 (semana natural UTC).
//   - 'days'   -> ciclo cada N días corridos desde el inicio.
//
// `windowDays` = margen desde el inicio del ciclo. Si `today > start + windowDays`
// el ciclo actual está vencido y no se puede hacer.

import { companyChecklistCategories } from '../db/schema/operational';

export type CadenceKind = 'none' | 'weekly' | 'days';
export type ScopeKind = 'pick' | 'site_assets' | 'asset_type';

export type CategoryLike = {
  cadenceKind: CadenceKind;
  cadenceDays: number | null;
  windowDays: number;
  createdAt: Date | string;
};

export type CycleWindow = {
  start: Date;        // inclusive
  end: Date;          // exclusive
  windowEnd: Date;    // start + windowDays (inclusive)
  label: string;      // p.ej. "Semana del 8 al 14 de junio"
} | null;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Resta N días a una fecha (no muta). */
function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * MS_PER_DAY);
}

/** Inicio de la semana natural (lunes 00:00:00) que contiene `d`. */
function startOfIsoWeek(d: Date): Date {
  const day = d.getUTCDay(); // 0=Dom, 1=Lun, ..., 6=Sáb
  // ISO: lunes=1, domingo=7. Necesitamos offset para llegar al lunes.
  const offsetToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return addDays(monday, -offsetToMonday);
}

/** Etiqueta legible para un ciclo, p.ej. "Semana del 8 al 14 de jun". */
function formatRange(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString('es-EC', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${fmt(start)} – ${fmt(addDays(end, -1))}`;
}

/**
 * Devuelve la ventana del ciclo que contiene `now` para la categoría dada.
 * Si `cadenceKind === 'none'`, devuelve `null` (no hay ciclo; el caller decide
 * cómo cruzar contra los hechos sin filtro de fecha).
 */
export function currentCycle(cat: CategoryLike, now: Date = new Date()): CycleWindow {
  if (cat.cadenceKind === 'none') return null;

  if (cat.cadenceKind === 'weekly') {
    const start = startOfIsoWeek(now);
    const end = addDays(start, 7);
    const windowEnd = addDays(start, Math.max(1, cat.windowDays));
    return { start, end, windowEnd, label: `Semana del ${formatRange(start, end)}` };
  }

  // 'days'
  const period = Math.max(1, cat.cadenceDays ?? 1);
  const created = cat.createdAt instanceof Date ? cat.createdAt : new Date(cat.createdAt);
  // Cálculo del ciclo N que contiene `now`:
  //   cyclesSinceCreation = floor((now - created) / period_days)
  //   cycleStart = created + cyclesSinceCreation * period_days
  const elapsedDays = (now.getTime() - created.getTime()) / MS_PER_DAY;
  const cyclesSince = Math.max(0, Math.floor(elapsedDays / period));
  const start = addDays(created, cyclesSince * period);
  const end = addDays(start, period);
  const windowEnd = addDays(start, Math.max(1, cat.windowDays));
  return { start, end, windowEnd, label: formatRange(start, end) };
}

/** ¿El ciclo actual ya cerró su ventana? (today > windowEnd).
 *  Para `cadenceKind='none'` siempre false (no hay ciclo). */
export function isCycleClosed(cat: CategoryLike, now: Date = new Date()): boolean {
  if (cat.cadenceKind === 'none') return false;
  const c = currentCycle(cat, now);
  return c !== null && now.getTime() > c.windowEnd.getTime();
}

/** ¿Estamos dentro de la ventana del ciclo actual?
 *  Para `cadenceKind='none'` siempre true. */
export function isWithinWindow(cat: CategoryLike, now: Date = new Date()): boolean {
  if (cat.cadenceKind === 'none') return true;
  const c = currentCycle(cat, now);
  return c !== null && now.getTime() <= c.windowEnd.getTime();
}

/**
 * Para el sweep on-demand: dado un ciclo que ya cerró, devuelve su ventana exacta.
 * `referenceEnd` es la fecha de cierre (p.ej. la fecha del ciclo anterior).
 */
export function cycleEndingAt(end: Date, cat: CategoryLike): CycleWindow {
  if (cat.cadenceKind === 'none') return null;
  if (cat.cadenceKind === 'weekly') {
    const start = addDays(end, -7);
    const windowEnd = addDays(start, Math.max(1, cat.windowDays));
    return { start, end, windowEnd, label: formatRange(start, end) };
  }
  const period = Math.max(1, cat.cadenceDays ?? 1);
  const start = addDays(end, -period);
  const windowEnd = addDays(start, Math.max(1, cat.windowDays));
  return { start, end, windowEnd, label: formatRange(start, end) };
}

/** El último ciclo cerrado justo antes de `now` (o null si no hay). */
export function previousCycle(cat: CategoryLike, now: Date = new Date()): CycleWindow | null {
  if (cat.cadenceKind === 'none') return null;
  const c = currentCycle(cat, now);
  if (c === null) return null;
  if (cat.cadenceKind === 'weekly') {
    return cycleEndingAt(c.start, cat);
  }
  const period = Math.max(1, cat.cadenceDays ?? 1);
  return cycleEndingAt(c.start, cat);
}

// Re-export del enum-like por si lo quieren importar desde un solo lugar.
export const CadenceKinds = {
  NONE: 'none' as const,
  WEEKLY: 'weekly' as const,
  DAYS: 'days' as const,
};
