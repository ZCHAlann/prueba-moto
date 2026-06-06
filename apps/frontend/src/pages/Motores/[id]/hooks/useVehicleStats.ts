import { useState, useEffect, useCallback } from 'react';

function makeFetcher<T>(kind: string) {
  return function useStats(assetId: string | null, companyId: string) {
    const [data, setData] = useState<T[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const fetchData = useCallback(async () => {
      if (!assetId || !companyId) return;
      setLoading(true);
      setError('');
      try {
        const res = await fetch(
          `/api/company/${companyId}/vehicle-cockpit/${assetId}/stats/${kind}`,
          { credentials: 'include' }
        );
        if (!res.ok) throw new Error(`Error ${res.status}`);
        setData(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cargar estadísticas');
      } finally {
        setLoading(false);
      }
    }, [assetId, companyId]);

    useEffect(() => {
      fetchData();
    }, [fetchData]);

    return { data, loading, error, refetch: fetchData };
  };
}

export type FuelStat       = { month: string; liters: number };
export type MaintenanceStat = { month: string; Pendiente: number; 'En proceso': number; Completado: number };
export type OdometerStat   = { date: string; odometer: number };
export type CostStat       = { month: string; fuel: number; maintenance: number };

export const useStatsFuel         = makeFetcher<FuelStat>('fuel');
export const useStatsMaintenances = makeFetcher<MaintenanceStat>('maintenances');
export const useStatsOdometer     = makeFetcher<OdometerStat>('odometer');
export const useStatsCosts        = makeFetcher<CostStat>('costs');
