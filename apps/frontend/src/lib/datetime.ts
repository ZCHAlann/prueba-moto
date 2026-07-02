// lib/datetime.ts
// ─────────────────────────────────────────────────────────────────────
// Helpers centralizados para formatear fechas/horas en zona horaria
// de Ecuador (America/Guayaquil, UTC-5).
//
// El backend guarda timestamps como `timestamp` (sin timezone) en
// Postgres, interpretados como UTC. Si el frontend los muestra con
// `new Date(iso).toLocaleString(...)` sin especificar `timeZone`, el
// browser los convierte usando la zona local del usuario — y como
// la mayoría de los servidores están en UTC, las horas se ven
// adelantadas 5 horas en la UI.
//
// Estos helpers SIEMPRE formatean en America/Guayaquil, sin importar
// la zona del browser.
//
// Uso:
//   import { fmtDateTimeEc, fmtDateEc, fmtTimeEc } from "@/lib/datetime";
//
// Notas:
//   - Aceptan `string` (ISO) o `Date` o `number` (epoch ms).
//   - Si el valor es null/undefined/inválido → devuelven "—".
//   - NO usar `slice(0,16).replace("T"," ")` en código nuevo: ese
//     patrón muestra la hora UTC cruda, no la hora de Ecuador.
// ─────────────────────────────────────────────────────────────────────

const TZ = "America/Guayaquil" as const;

/**
 * Devuelve "—" si el valor es null/undefined/empty/inválido.
 * Si es válido, devuelve un `Date`. Si no, `null`.
 */
function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  let s = String(value).trim();
  if (!s) return null;

  // Si el string NO tiene indicador de timezone (ni 'Z' final ni offset
  // ±HH:MM), lo tratamos como UTC explícito. Esto es necesario porque
  // algunos endpoints devuelven timestamps de Postgres vía SQL crudo
  // (db.execute(sql`...`)) como "2026-07-02 22:54:06.86" (sin T, sin Z),
  // y JS interpreta eso como hora LOCAL del navegador en vez de UTC,
  // rompiendo la conversión a hora de Ecuador más abajo. Cuando el
  // valor SÍ viene de Drizzle vía .returning()/select() normal, ya
  // llega como Date/ISO con "Z" y este branch no se activa.
  const hasTimezoneInfo = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s);
  if (!hasTimezoneInfo) {
    // Normalizar separador " " → "T" si hace falta, y forzar UTC con "Z".
    s = s.includes("T") ? s : s.replace(" ", "T");
    s = s + "Z";
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** "24/06/2026 16:40" — fecha + hora en Ecuador. */
export function fmtDateTimeEc(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  const date = d.toLocaleDateString("es-EC", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("es-EC", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${date} ${time}`;
}

/** "24/06/2026" — solo fecha en Ecuador. */
export function fmtDateEc(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("es-EC", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** "16:40" — solo hora en Ecuador (24h). */
export function fmtTimeEc(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleTimeString("es-EC", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Variante con mes abreviado: "24 jun 2026" — para tablas/listas. */
export function fmtDateShortEc(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("es-EC", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Variante con mes largo: "24 de junio de 2026" — para perfiles/headers. */
export function fmtDateLongEc(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("es-EC", {
    timeZone: TZ,
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ─── Ecuador date creators (no UTC conversion) ───────────────────────────────

/**
 * Returns "2026-06-27" in Ecuador timezone (America/Bogotá).
 * Use for default date form values instead of new Date().toISOString().slice(0,10)
 * which produces wrong dates when browser timezone ≠ UTC.
 */
export function todayEcuador(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const dd   = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Returns "2026-06-27T14:10" in Ecuador timezone (America/Bogotá).
 * Use for default datetime-local form values instead of
 * new Date().toISOString().slice(0,16) which shifts the date by timezone offset.
 */
export function nowEcuador(): string {
  const d   = new Date();
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const dd   = String(d.getDate()).padStart(2, "0");
  const hh   = String(d.getHours()).padStart(2, "0");
  const min  = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

/**
 * Returns a date string N days from today in Ecuador timezone.
 */
export function daysFromNowEcuador(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const dd   = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}