import { useState, useEffect, useRef } from 'react';

export type Location = { lat: number | null; lng: number | null; updatedAt: string | null };

export function useVehicleLocation(
  assetId: string | null,
  companyId: string,
  intervalMs: number = 5000
) {
  const [location, setLocation] = useState<Location>({ lat: null, lng: null, updatedAt: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (!assetId || !companyId) return;
    stoppedRef.current = false;

    const tick = async () => {
      if (stoppedRef.current) return;
      try {
        setLoading(true);
        const res = await fetch(
          `/api/company/${companyId}/vehicle-cockpit/${assetId}/location`,
          { credentials: 'include' }
        );
        if (!res.ok) throw new Error(`Error ${res.status}`);
        const json: Location = await res.json();
        setLocation(json);
        setError('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al obtener ubicación');
      } finally {
        setLoading(false);
      }
    };

    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      stoppedRef.current = true;
      clearInterval(id);
    };
  }, [assetId, companyId, intervalMs]);

  return { location, loading, error };
}
