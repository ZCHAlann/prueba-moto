// lib/geo.ts
// ─────────────────────────────────────────────────────────────────────────────
// Helpers de geolocalización para auditoría.
// ─────────────────────────────────────────────────────────────────────────────
// Usado por:
//   - lib/audit.ts   → enriquece cada `logAudit()` con garage-match.
//   - routes/company/audit.ts (stats) → cálculo de "top anomalous actors".
//   - routes/company/exit-authorizations.ts → persistir request_garage_id.
//
// Decisión: fórmula de Haversine en JS (no PostGIS). Las tablas de
// auditoria no van a llegar a un volumen donde el cálculo dentro de
// Postgres marque la diferencia, y evitamos la dependencia de la
// extensión. Si en el futuro hay >100k filas/mes, migrar a ST_Distance.
// ─────────────────────────────────────────────────────────────────────────────

import { eq, and, isNotNull } from 'drizzle-orm';
import { db } from '../db/client';
import { companyGarages } from '../db/schema/operational';

// ── Haversine ───────────────────────────────────────────────────────────────
// Retorna la distancia en METROS entre dos coordenadas (lat1, lng1) y
// (lat2, lng2). R = 6,371,000 m. Las latitudes van en grados.

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// ── Format helpers (usado por el frontend vía serializador) ─────────────────

/** 850 → "850m", 1500 → "1.5km", 12345 → "12.3km" */
export function formatDistanceMeters(m: number): string {
  if (!Number.isFinite(m) || m < 0) return '—';
  if (m < 1_000) return `${Math.round(m)} m`;
  return `${(m / 1_000).toFixed(1)} km`;
}

// ── findNearestGarage ──────────────────────────────────────────────────────
// Devuelve el garaje más cercano al punto (lat, lng) entre los
// configurados para `companyId`. Si la empresa no tiene garajes
// georreferenciados devuelve null.
//
// Implementación simple: SELECT todos los garajes con lat/lng
// (típicamente <50 por empresa) y los comparamos en memoria. Esto es
// O(n) en JS, no es un problema hasta que haya cientos por empresa.

export interface GarageMatch {
  garageId: number;
  garageName: string;
  distanceM: number;
}

export async function findNearestGarage(
  companyId: number,
  lat: number,
  lng: number,
): Promise<GarageMatch | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const rows = await db
    .select({
      id: companyGarages.id,
      name: companyGarages.name,
      latitude: companyGarages.latitude,
      longitude: companyGarages.longitude,
    })
    .from(companyGarages)
    .where(and(
      eq(companyGarages.companyId, companyId),
      isNotNull(companyGarages.latitude),
      isNotNull(companyGarages.longitude),
    ));

  if (rows.length === 0) return null;

  let best: GarageMatch | null = null;
  for (const g of rows) {
    if (g.latitude == null || g.longitude == null) continue;
    const d = haversineMeters(lat, lng, g.latitude, g.longitude);
    if (best === null || d < best.distanceM) {
      best = { garageId: g.id, garageName: g.name, distanceM: d };
    }
  }
  return best;
}

// ── isAnomalous ────────────────────────────────────────────────────────────
// Umbral por defecto 150m. Configurable por empresa via company_settings
// en una fase posterior; por ahora hardcoded hasta tener feedback de UX.

export const DEFAULT_GEO_TOLERANCE_M = 150;

export function isAnomalous(distanceM: number | null, toleranceM = DEFAULT_GEO_TOLERANCE_M): boolean {
  if (distanceM == null) return false;
  return distanceM > toleranceM;
}
