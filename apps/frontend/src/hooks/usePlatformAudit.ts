import { useState, useEffect, useCallback } from 'react';
import type { PlatformAuditEntry, PlatformAuditFilters } from '../types/platform';

interface AuditPage {
  data:  PlatformAuditEntry[];
  total: number;
  page:  number;
  limit: number;
}

interface UsePlatformAuditResult {
  entries:  PlatformAuditEntry[];
  total:    number;
  page:     number;
  loading:  boolean;
  error:    string | null;
  filters:  PlatformAuditFilters;
  setFilters: (f: Partial<PlatformAuditFilters>) => void;
  setPage:    (p: number) => void;
  refetch:    () => void;
}

const DEFAULT_FILTERS: PlatformAuditFilters = {
  entity:  '',
  action:  '',
  actorId: '',
  from:    '',
  to:      '',
  search:  '',
  limit:   50,
};

export function usePlatformAudit(): UsePlatformAuditResult {
  const [entries,  setEntries]  = useState<PlatformAuditEntry[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [filters,  setFiltersState] = useState<PlatformAuditFilters>(DEFAULT_FILTERS);

  const setFilters = useCallback((f: Partial<PlatformAuditFilters>) => {
    setFiltersState(prev => ({ ...prev, ...f }));
    setPage(1); // reset página al filtrar
  }, []);

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page',  String(page));
      params.set('limit', String(filters.limit));
      if (filters.entity)  params.set('entity',  filters.entity);
      if (filters.action)  params.set('action',  filters.action);
      if (filters.actorId) params.set('actorId', filters.actorId);
      if (filters.from)    params.set('from',    filters.from);
      if (filters.to)      params.set('to',      filters.to);
      if (filters.search)  params.set('search',  filters.search);

      const res = await fetch(`/api/platform/audit?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json: AuditPage = await res.json();
      setEntries(json.data);
      setTotal(json.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => { void fetchAudit(); }, [fetchAudit]);

  return {
    entries, total, page, loading, error,
    filters, setFilters, setPage,
    refetch: fetchAudit,
  };
}