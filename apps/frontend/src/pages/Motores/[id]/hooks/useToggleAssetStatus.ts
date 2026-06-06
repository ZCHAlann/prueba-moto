import { useState, useCallback } from 'react';

export type AssetStatus = 'Operativo' | 'En mantenimiento' | 'Fuera de servicio';

export function useToggleAssetStatus(assetId: string | null, companyId: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const updateStatus = useCallback(async (status: AssetStatus) => {
    if (!assetId || !companyId) return null;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/company/${companyId}/vehicle-cockpit/${assetId}/status`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        }
      );
      if (!res.ok) throw new Error(`Error ${res.status}`);
      return await res.json();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cambiar status');
      return null;
    } finally {
      setLoading(false);
    }
  }, [assetId, companyId]);

  return { updateStatus, loading, error };
}
