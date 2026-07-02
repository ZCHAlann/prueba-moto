// lib/pagination.ts
//
// Helper reutilizable para TODOS los endpoints que devuelvan listas paginadas.
//
// REGLAS DEL CONTRATO (no cambiar sin consenso del dueño):
//   - page: entero >= 1 (default 1). NaN/0/negativo/"abc" → 1.
//   - pageSize: entero >= 1, default 20, cap 100 (configurable via
//               defaults.maxPageSize). 0/negativo → 1. > maxPageSize → maxPageSize.
//   - offset = (page - 1) * pageSize.
//   - buildPageResponse arma SIEMPRE { data, total, page, pageSize, totalPages }.
//     totalPages = Math.max(1, Math.ceil(total / pageSize)) — incluso para
//     total=0 devuelve 1 (evita "Página 0 de 0" en la UI, igual que el patrón
//     client-side ya usado en el proyecto).
//
// MANTENER ESTE ARCHIVO:
//   - Sin dependencias de Drizzle, Zod o Express.
//   - Sin validación de query params que ya esté en middlewares existentes.
//   - Es un módulo PURO: recibir y devolver, nada de logs, nada de side-effects.

/**
 * Resultado normalizado de parsePageParams.
 * `offset` es derivado de `page` y `pageSize` — no se acepta por query.
 */
export interface PageParams {
  page: number;
  pageSize: number;
  offset: number;
}

export interface PagePaginationDefaults {
  pageSize?: number;
  maxPageSize?: number;
}

export interface PageResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_MAX_PAGE_SIZE = 100;

/**
 * Sanitiza un valor arbitrario de query string a entero positivo.
 * Devuelve `fallback` cuando el valor no es un entero >= 1.
 */
function toPositiveInt(raw: unknown, fallback: number): number {
  if (raw === undefined || raw === null || raw === '') return fallback;
  // Aceptar números directos (algunos middlewares ya los parsean) o strings
  // numéricos al estilo "?page=3" / "?page=3.14".
  const n = typeof raw === 'number' ? raw : Number(String(raw));
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  return i >= 1 ? i : fallback;
}

/**
 * Parsea query params de paginación desde `req.query` (o cualquier
 * `Record<string, unknown>`) y devuelve la triplet canónica.
 *
 * Reglas:
 *   - `page` ausente/inválido → 1.
 *   - `pageSize` ausente → `defaults.pageSize` ?? 20.
 *   - `pageSize` > `defaults.maxPageSize` (o 100 si no se pasa) → cap.
 *   - `pageSize` < 1 → 1.
 *
 * No valida nada más del query — eso queda en middlewares (zod, etc.).
 */
export function parsePageParams(
  query: Record<string, unknown>,
  defaults: PagePaginationDefaults = {},
): PageParams {
  const defaultSize = defaults.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxSize = defaults.maxPageSize ?? DEFAULT_MAX_PAGE_SIZE;

  const page = toPositiveInt(query.page, 1);
  const requestedSize = toPositiveInt(query.pageSize, defaultSize);
  const cappedSize = Math.min(requestedSize, maxSize);
  // Después de cap, vuelve a garantizar mínimo 1 (cubre el caso patológico
  // maxSize=0 — no debería pasar, pero defenderse).
  const pageSize = cappedSize >= 1 ? cappedSize : 1;

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

/**
 * Construye la respuesta paginada con la forma canónica del contrato.
 *
 * - `total` SIEMPRE viene del universo (COUNT WHERE) — NUNCA de `data.length`.
 * - `totalPages = Math.max(1, Math.ceil(total / pageSize))` para evitar
 *   el "Página 0 de 0" en la UI cuando no hay filas.
 */
export function buildPageResponse<T>(
  rows: T[],
  total: number,
  page: number,
  pageSize: number,
): PageResponse<T> {
  // El offset ya se aplicó en la query (Promise.all([select limit/offset,
  // select count])). Acá sólo se asegura que `page`/`pageSize` sean
  // enteros >= 1 para la respuesta.
  const safePage = page >= 1 ? Math.trunc(page) : 1;
  const safeSize = pageSize >= 1 ? Math.trunc(pageSize) : 1;
  const totalPages = Math.max(1, Math.ceil(total / safeSize));

  return {
    data: rows,
    total,
    page: safePage,
    pageSize: safeSize,
    totalPages,
  };
}
