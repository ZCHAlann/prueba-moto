import { useState, useEffect, useCallback } from 'react';

export interface AuditStats {
  byDay:      Record<string, number>;
  topActions: { action: string; count: number }[];
  byEntity:   { entity: string; count: number }[];
  topActors:  { actor: string; count: number }[];
  byHour:     { hour: number; count: number }[];
  total:      number;
}

interface UsePlatformAuditStatsResult {
  stats:   AuditStats | null;
  loading: boolean;
  error:   string | null;
  refetch: (from?: string, to?: string) => void;
}

const EMPTY: AuditStats = {
  byDay: {}, topActions: [], byEntity: [], topActors: [], byHour: [], total: 0,
};

export function usePlatformAuditStats(from = '', to = ''): UsePlatformAuditStatsResult {
  const [stats,   setStats]   = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const fetchStats = useCallback(async (f = from, t = to) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (f) params.set('from', f);
      if (t) params.set('to',   t);
      const res = await fetch(`/api/platform/audit/stats?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: AuditStats = await res.json();
      setStats(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setStats(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void fetchStats(); }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
}   