import { useState, useEffect, useCallback } from 'react';

export type Route = {
  id: string;
  date: string;
  origin: string | null;
  destination: string | null;
  distanceKm: number | null;
  durationMin: number | null;
  coordinates: { lat: number; lng: number }[] | number[][] | any;
  notes: string | null;
  driverId: number | null;
};

export type CreateRoutePayload = {
  date: string;
  origin?: string;
  destination?: string;
  distanceKm?: number;
  durationMin?: number;
  coordinates?: any;
  driverId?: number;
  notes?: string;
};

export function useVehicleRoutes(assetId: string | null, companyId: string) {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    if (!assetId || !companyId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/company/${companyId}/vehicle-cockpit/${assetId}/routes`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setRoutes(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar rutas');
    } finally {
      setLoading(false);
    }
  }, [assetId, companyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const createRoute = useCallback(async (payload: CreateRoutePayload) => {
    const res = await fetch(
      `/api/company/${companyId}/vehicle-cockpit/${assetId}/routes`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const created: Route = await res.json();
    setRoutes((prev) => [created, ...prev]);
    return created;
  }, [assetId, companyId]);

  return { routes, loading, error, refetch: fetchData, createRoute };
}
