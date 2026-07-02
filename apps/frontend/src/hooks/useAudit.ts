import { useState, useEffect, useCallback } from "react";

export interface AuditEntry {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  actorId: string | null;
  actorName: string;
  description: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditFilters {
  entity?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditResponse {
  data: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AuditResponse {
  data: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export function useAudit(companyId: string | null, filters: AuditFilters = {}) {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.entity) params.set("entity", filters.entity);
      if (filters.action) params.set("action", filters.action);
      if (filters.from)   params.set("from", filters.from);
      if (filters.to)     params.set("to", filters.to);
      if (filters.page)   params.set("page", String(filters.page));
      if (filters.pageSize) params.set("pageSize", String(filters.pageSize));

      const qs = params.toString();
      const res = await fetch(`/api/company/${companyId}/audit${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: AuditResponse = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [companyId, filters.entity, filters.action, filters.from, filters.to, filters.page, filters.pageSize]);

  useEffect(() => { void fetch_(); }, [fetch_]);

  return { data, loading, error, refetch: fetch_ };
}