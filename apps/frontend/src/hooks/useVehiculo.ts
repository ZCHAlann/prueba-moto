import { useState, useEffect, useCallback } from 'react';

export type CockpitData = {
  asset: {
    id: string; name: string; plate: string; brand: string;
    model: string; year: string; status: string;
    availability: string; fuelType: string;
    photoUrls: string[]; location: string | null;
  };
  driver: { firstName: string; lastName: string;
            photoUrl: string | null; phone: string | null } | null;
  fuel: { totalLiters: number; totalCost: number;
          lastOdometer: number | null;
          entries: { date: string; liters: string; cost: string | null }[] };
  oilCheck: { nivel: string; color: string; confianza: string;
              puedeSalir: boolean; createdAt: string } | null;
  oilChange: { date: string; reading: number; nextReading: number;
               progressPct: number | null } | null;
  maintenances: { id: string; title: string;
                  priority: string; status: string; dueDate: string }[];
  alerts: { id: string; title: string;
            severity: string; type: string }[];
};

export function useVehicleCockpit(assetId: string | null, companyId: string) {
  const [data, setData]       = useState<CockpitData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const fetch_ = useCallback(async () => {
    if (!assetId || !companyId) return;
    setLoading(true); setError('');
    try {
      const res = await fetch(
        `/api/company/${companyId}/vehicle-cockpit/${assetId}?companyId=${companyId}`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }, [assetId, companyId]);

  useEffect(() => { fetch_(); }, [fetch_]);

  return { data, loading, error, refetch: fetch_ };
}