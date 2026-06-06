import { useState, useCallback } from 'react';

export function useEndAssignment(companyId: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const endAssignment = useCallback(async (assignmentId: string) => {
    if (!companyId || !assignmentId) return null;
    setLoading(true);
    setError('');
    try {
      const numId = assignmentId.toString().replace(/^assignment-/, '');
      const res = await fetch(
        `/api/company/${companyId}/assignments/${numId}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'Finalizada' }),
        }
      );
      if (!res.ok) throw new Error(`Error ${res.status}`);
      return await res.json();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al finalizar asignación');
      return null;
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  return { endAssignment, loading, error };
}
