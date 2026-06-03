import { useState, useEffect, useCallback } from "react";
import type {
  CRMDeal, CRMPipelineStage, CRMStats,
  CRMForecast, CRMActivity, CRMConvertInput,
  LeadStatus, PlatformLeadInput,
} from "../types/platform";

interface UseCRMResult {
  // Data
  pipeline:  CRMPipelineStage[];
  stats:     CRMStats | null;
  forecast:  CRMForecast | null;
  activity:  CRMActivity[];
  // Loading states
  loadingPipeline: boolean;
  loadingStats:    boolean;
  loadingForecast: boolean;
  loadingActivity: boolean;
  // Errors
  error: string | null;
  // Actions
  refetch:      () => void;
  moveDeal:     (id: number, status: LeadStatus) => Promise<CRMDeal>;
  convertDeal:  (id: number, input: CRMConvertInput) => Promise<{ company: any; lead: CRMDeal }>;
  createDeal:   (input: PlatformLeadInput) => Promise<CRMDeal>;
  updateDeal:   (id: number, input: Partial<PlatformLeadInput>) => Promise<CRMDeal>;
  deleteDeal:   (id: number) => Promise<void>;
  searchDeals:  (q: string) => Promise<CRMDeal[]>;
}

export function useCRM(): UseCRMResult {
  const [pipeline,  setPipeline]  = useState<CRMPipelineStage[]>([]);
  const [stats,     setStats]     = useState<CRMStats | null>(null);
  const [forecast,  setForecast]  = useState<CRMForecast | null>(null);
  const [activity,  setActivity]  = useState<CRMActivity[]>([]);

  const [loadingPipeline, setLoadingPipeline] = useState(false);
  const [loadingStats,    setLoadingStats]    = useState(false);
  const [loadingForecast, setLoadingForecast] = useState(false);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Fetchers ────────────────────────────────────────────────────────────

  const fetchPipeline = useCallback(async () => {
    setLoadingPipeline(true);
    try {
      const res = await fetch("/api/platform/crm/pipeline", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setPipeline(json.pipeline);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoadingPipeline(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await fetch("/api/platform/crm/stats", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStats(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const fetchForecast = useCallback(async () => {
    setLoadingForecast(true);
    try {
      const res = await fetch("/api/platform/crm/forecast", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setForecast(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoadingForecast(false);
    }
  }, []);

  const fetchActivity = useCallback(async () => {
    setLoadingActivity(true);
    try {
      const res = await fetch("/api/platform/crm/activity", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setActivity(json.activity);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoadingActivity(false);
    }
  }, []);

  const refetch = useCallback(() => {
    void fetchPipeline();
    void fetchStats();
    void fetchForecast();
    void fetchActivity();
  }, [fetchPipeline, fetchStats, fetchForecast, fetchActivity]);

  useEffect(() => { refetch(); }, [refetch]);

  // ── Actions ─────────────────────────────────────────────────────────────

  const moveDeal = useCallback(async (id: number, status: LeadStatus): Promise<CRMDeal> => {
    const res = await fetch(`/api/platform/crm/deals/${id}/move`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? `HTTP ${res.status}`);
    }
    const updated: CRMDeal = await res.json();
    // Actualizar pipeline local
    setPipeline(prev => prev.map(stage => ({
      ...stage,
      deals: stage.deals.filter(d => d.id !== id),
    })).map(stage =>
      stage.stage === status
        ? { ...stage, deals: [...stage.deals, updated], count: stage.count + 1 }
        : stage
    ));
    return updated;
  }, []);

  const convertDeal = useCallback(async (
    id: number, input: CRMConvertInput
  ): Promise<{ company: any; lead: CRMDeal }> => {
    const res = await fetch(`/api/platform/crm/deals/${id}/convert`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? `HTTP ${res.status}`);
    }
    const result = await res.json();
    // Refetch completo después de conversión
    void refetch();
    return result;
  }, [refetch]);

  const createDeal = useCallback(async (input: PlatformLeadInput): Promise<CRMDeal> => {
    const res = await fetch("/api/platform/leads", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? `HTTP ${res.status}`);
    }
    const created: CRMDeal = await res.json();
    void fetchPipeline();
    return created;
  }, [fetchPipeline]);

  const updateDeal = useCallback(async (
    id: number, input: Partial<PlatformLeadInput>
  ): Promise<CRMDeal> => {
    const res = await fetch(`/api/platform/leads/${id}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? `HTTP ${res.status}`);
    }
    const updated: CRMDeal = await res.json();
    void fetchPipeline();
    return updated;
  }, [fetchPipeline]);

  const deleteDeal = useCallback(async (id: number): Promise<void> => {
    const res = await fetch(`/api/platform/leads/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? `HTTP ${res.status}`);
    }
    setPipeline(prev => prev.map(stage => ({
      ...stage,
      deals: stage.deals.filter(d => d.id !== id),
      count: stage.deals.filter(d => d.id !== id).length,
    })));
  }, []);

  const searchDeals = useCallback(async (q: string): Promise<CRMDeal[]> => {
    if (!q.trim()) return [];
    const res = await fetch(
      `/api/platform/crm/search?q=${encodeURIComponent(q)}`,
      { credentials: "include" }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return json.results;
  }, []);

  return {
    pipeline, stats, forecast, activity,
    loadingPipeline, loadingStats, loadingForecast, loadingActivity,
    error,
    refetch, moveDeal, convertDeal, createDeal, updateDeal, deleteDeal, searchDeals,
  };
}