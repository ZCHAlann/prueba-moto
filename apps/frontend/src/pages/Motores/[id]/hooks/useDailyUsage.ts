import { useState, useEffect, useCallback } from 'react';

export type DailyUsagePoint = { hour: number; km: number };

export function useDailyUsage(assetId: string | null, companyId: string, date?: Date) {
  const [data, setData] = useState<DailyUsagePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const dateIso = (date ?? new Date()).toISOString().slice(0, 10);

  const fetchData = useCallback(async () => {
    if (!assetId || !companyId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/company/${companyId}/vehicle-cockpit/${assetId}/daily-usage?date=${dateIso}`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar uso diario');
    } finally {
      setLoading(false);
    }
  }, [assetId, companyId, dateIso]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
