import { useState, useCallback } from 'react';

export function useToggleEngine(assetId: string | null, companyId: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggle = useCallback(async (): Promise<{ engineOn: boolean } | null> => {
    if (!assetId || !companyId) return null;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/company/${companyId}/vehicle-cockpit/${assetId}/engine-toggle`,
        { method: 'POST', credentials: 'include' }
      );
      if (!res.ok) throw new Error(`Error ${res.status}`);
      return await res.json();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al alternar motor');
      return null;
    } finally {
      setLoading(false);
    }
  }, [assetId, companyId]);

  return { toggle, loading, error };
}
