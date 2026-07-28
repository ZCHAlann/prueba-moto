// hooks/useDriverSchedule.ts
// ─────────────────────────────────────────────────────────────────────────────
// jul 2026 — Hook para el schedule de conductores (driver_time_off).
//
// Endpoints consumidos:
//   GET    /api/company/:id/driver-schedule?from=&to=
//   GET    /api/company/:id/driver-schedule/has-any?month=&year=
//   POST   /api/company/:id/driver-schedule
//   DELETE /api/company/:id/driver-schedule/:id
//   POST   /api/company/:id/driver-schedule/copy-from-previous
//
// Sigue el patrón del proyecto: React Query + fetch con credentials include,
// tipos exportados para los componentes.
// ─────────────────────────────────────────────────────────────────────────────

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type DriverTimeOffReason = 'libre' | 'vacaciones' | 'permiso' | 'enfermedad';

export interface DriverRef {
  id:        string;          // 'driver-N'
  firstName: string;
  lastName:  string;
  code:      string;
  status:    string;
}

export interface DriverTimeOffEntry {
  id:         string;         // 'dto-N'
  companyId:  string;
  driverId:   string;         // 'driver-N'
  date:       string;         // 'YYYY-MM-DD'
  reason:     DriverTimeOffReason | null;
  notes:      string | null;
  createdBy:  string | null;
  createdAt:  string;
  updatedAt:  string;
  driver:     DriverRef;
}

export interface DriverTimeOffListResponse {
  data:       DriverTimeOffEntry[];
  from:       string;          // 'YYYY-MM-DD'
  toExclusive: string;         // 'YYYY-MM-DD'
}

export interface HasAnyResponse {
  hasAny: boolean;
  count:  number;
  year:   number;
  month:  number;
}

export interface CreateDriverTimeOffInput {
  driverId: number;
  date:     string;            // 'YYYY-MM-DD'
  reason?:  DriverTimeOffReason | null;
  notes?:   string | null;
}

export interface CopyFromPreviousInput {
  targetMonth?: number;
  targetYear?:  number;
  sourceMonth?: number;
  sourceYear?:  number;
}

export interface CopyFromPreviousResponse {
  copied:             number;
  sourceYear:         number;
  sourceMonth:        number;
  targetYear:         number;
  targetMonth:        number;
  skippedDayMismatch: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    credentials: 'include',
    // jul 2026 — Bypass del browser cache. Sin esto, Chrome cachea
    // el GET inicial (con 304 Not Modified en la segunda request) y
    // después de un POST que crea una entry nueva, el siguiente GET
    // devuelve el response viejo cacheado (vacío) en vez de ir al
    // server. El default de fetch es `cache: 'no-cache'` que igual
    // revalida con `If-Modified-Since` — el server Express no tiene
    // `Last-Modified` ni `ETag` configurados para estos endpoints
    // dinámicos, así que el browser igual recibe 304 y devuelve la
    // copia vieja. `no-store` saltea el cache del browser por
    // completo (más seguro para endpoints de schedule que cambian
    // seguido).
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/** jul 2026 — YYYY-MM-DD de "hoy" interpretado en America/Guayaquil. */
export function todayYmdEc(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/** jul 2026 — [from, toExclusive) del mes en EC (toExclusive = día 1 del mes siguiente). */
export function monthRangeEc(year: number, month: number): { from: string; toExclusive: string } {
  const fromIso = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-01`;
  let ny = year;
  let nm = month + 1;
  if (nm > 12) { ny = ny + 1; nm = 1; }
  const toExclusiveIso = `${ny.toString().padStart(4, '0')}-${nm.toString().padStart(2, '0')}-01`;
  return { from: fromIso, toExclusive: toExclusiveIso };
}

export interface ByAssetResponse {
  /** Map: assetId ('asset-N') → [YYYY-MM-DD] de días libres del driver activo. */
  byAsset: Record<string, string[]>;
  from: string;
  toExclusive: string;
}

export interface BulkDriverTimeOffInput {
  driverId: number;
  date:     string;            // 'YYYY-MM-DD'
  reason?:  DriverTimeOffReason | null;
}

export interface BulkDriverTimeOffResponse {
  total:    number;
  inserted: number;
  skipped:  number;             // ya existían (ON CONFLICT DO NOTHING)
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

/**
 * Lista las entradas de schedule en un rango [from, toExclusive).
 * Si no se pasan from/to, el backend devuelve el mes actual EC.
 */
export function useDriverScheduleList(
  filters: { from?: string; to?: string } = {},
  options?: { enabled?: boolean },
) {
  const { companyId } = useAuth();
  const enabled = (options?.enabled ?? true) && !!companyId;
  return useQuery({
    queryKey: ['driverSchedule', companyId, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.from) params.set('from', filters.from);
      if (filters.to)   params.set('to',   filters.to);
      const qs = params.toString();
      return jsonFetch<DriverTimeOffListResponse>(
        `/api/company/${companyId}/driver-schedule${qs ? `?${qs}` : ''}`,
      );
    },
    enabled,
  });
}

/**
 * Pregunta livianamente "¿tiene entradas este mes?". Usado por el
 * front para decidir si mostrar el prompt "copiar del mes anterior".
 */
export function useDriverScheduleHasAny(year: number, month: number, options?: { enabled?: boolean }) {
  const { companyId } = useAuth();
  const enabled = (options?.enabled ?? true) && !!companyId;
  return useQuery({
    queryKey: ['driverScheduleHasAny', companyId, year, month],
    queryFn: async () => {
      const params = new URLSearchParams({ year: String(year), month: String(month) });
      return jsonFetch<HasAnyResponse>(
        `/api/company/${companyId}/driver-schedule/has-any?${params.toString()}`,
      );
    },
    enabled,
  });
}

/** Crea (o actualiza si ya existe) una entrada. */
export function useCreateDriverTimeOff() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateDriverTimeOffInput) => {
      return jsonFetch<{ data: DriverTimeOffEntry }>(
        `/api/company/${companyId}/driver-schedule`,
        { method: 'POST', body: JSON.stringify(input) },
      );
    },
    onSuccess: () => {
      // jul 2026 — IMPORTANTE: invalidar también `assetDriverAvailability`.
      // El hook que pinta el panel de Agendar de verde usa este queryKey
      // con staleTime de 5 min. Sin esta invalidación, después de
      // crear/borrar un libre, el panel seguía mostrando data vieja
      // (sin el nuevo libre) hasta que pasen 5 min o el user recargue.
      void qc.invalidateQueries({ queryKey: ['driverSchedule', companyId] });
      void qc.invalidateQueries({ queryKey: ['driverScheduleHasAny', companyId] });
      void qc.invalidateQueries({ queryKey: ['assetDriverAvailability', companyId] });
    },
  });
}

/** Borra una entrada. */
export function useDeleteDriverTimeOff() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // `id` viene como 'dto-N' (prefijo). El backend acepta ese formato.
      return jsonFetch<void>(
        `/api/company/${companyId}/driver-schedule/${id}`,
        { method: 'DELETE' },
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['driverSchedule', companyId] });
      void qc.invalidateQueries({ queryKey: ['driverScheduleHasAny', companyId] });
      void qc.invalidateQueries({ queryKey: ['assetDriverAvailability', companyId] });
    },
  });
}

/** Copia el mes anterior al actual. */
export function useCopyDriverScheduleFromPrevious() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CopyFromPreviousInput = {}) => {
      return jsonFetch<CopyFromPreviousResponse>(
        `/api/company/${companyId}/driver-schedule/copy-from-previous`,
        { method: 'POST', body: JSON.stringify(input) },
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['driverSchedule', companyId] });
      void qc.invalidateQueries({ queryKey: ['driverScheduleHasAny', companyId] });
      void qc.invalidateQueries({ queryKey: ['assetDriverAvailability', companyId] });
    },
  });
}

/**
 * jul 2026 — Para el calendario de Mantenimientos: devuelve los días
 * en que el conductor ACTIVO de cada vehículo está libre. Se usa para
 * pintar de verde el panel de vehículos y los días del calendario
 * durante el drag-and-drop.
 *
 * Devuelve un Record<assetId, Set<date>> para lookups O(1) en el
 * calendar grid. Si la lista de fechas está vacía, el vehículo no
 * tiene al driver libre ningún día del rango (no se marca).
 */
export function useAssetDriverAvailability(
  from: string,
  to: string,
  options?: { enabled?: boolean },
) {
  const { companyId } = useAuth();
  const enabled = (options?.enabled ?? true) && !!companyId;
  return useQuery({
    queryKey: ['assetDriverAvailability', companyId, from, to],
    queryFn: async () => {
      const params = new URLSearchParams({ from, to });
      const url = `/api/company/${companyId}/driver-schedule/by-asset?${params.toString()}`;
      const res = await jsonFetch<ByAssetResponse>(url);
      return res;
    },
    enabled,
    // Cachea 5 min: el schedule cambia cuando el admin edita, no en
    // cada keystroke. Si el admin marca un libre nuevo, va a tener que
    // esperar 5 min o refrescar — aceptable para la fase actual.
    // (jul 2026 — las mutations ya invalidan este query, así que en
    // práctica el cache es defensivo.)
    staleTime: 5 * 60 * 1000,
    select: (data) => {
      // Transformar a Record<assetId, Set<date>> para lookup O(1).
      const out: Record<string, Set<string>> = {};
      for (const [assetId, dates] of Object.entries(data.byAsset)) {
        out[assetId] = new Set(dates);
      }
      return out;
    },
  });
}

/** jul 2026 — Bulk insert para el Patrón de trabajo/descanso. */
export function useBulkCreateDriverTimeOff() {
  const { companyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entries: BulkDriverTimeOffInput[]) => {
      return jsonFetch<BulkDriverTimeOffResponse>(
        `/api/company/${companyId}/driver-schedule/bulk`,
        { method: 'POST', body: JSON.stringify({ entries }) },
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['driverSchedule', companyId] });
      void qc.invalidateQueries({ queryKey: ['driverScheduleHasAny', companyId] });
      void qc.invalidateQueries({ queryKey: ['assetDriverAvailability', companyId] });
    },
  });
}
