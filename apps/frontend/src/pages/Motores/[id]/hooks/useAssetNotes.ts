import { useState, useEffect, useCallback } from 'react';

export type Note = {
  id: string;
  body: string;
  authorId: number | null;
  authorName: string | null;
  createdAt: string;
};

export function useAssetNotes(assetId: string | null, companyId: string) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    if (!assetId || !companyId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/company/${companyId}/vehicle-cockpit/${assetId}/notes?limit=50`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setNotes(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar notas');
    } finally {
      setLoading(false);
    }
  }, [assetId, companyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addNote = useCallback(async (body: string) => {
    const res = await fetch(
      `/api/company/${companyId}/vehicle-cockpit/${assetId}/notes`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      }
    );
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const created: Note = await res.json();
    setNotes((prev) => [created, ...prev]);
    return created;
  }, [assetId, companyId]);

  const removeNote = useCallback(async (noteId: string) => {
    const numId = noteId.toString().replace(/^note-/, '');
    const res = await fetch(
      `/api/company/${companyId}/vehicle-cockpit/${assetId}/notes/${numId}`,
      { method: 'DELETE', credentials: 'include' }
    );
    if (!res.ok) throw new Error(`Error ${res.status}`);
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  }, [assetId, companyId]);

  return { notes, loading, error, refetch: fetchData, addNote, removeNote };
}
