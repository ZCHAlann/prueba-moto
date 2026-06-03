import { useState, useEffect, useCallback } from "react";
import type { PlatformLead, PlatformLeadInput } from "../types/platform";

interface UsePlatformLeadsResult {
  leads: PlatformLead[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  createLead: (input: PlatformLeadInput) => Promise<PlatformLead>;
  updateLead: (id: number, input: Partial<PlatformLeadInput>) => Promise<PlatformLead>;
  deleteLead: (id: number) => Promise<void>;
}

export function usePlatformLeads(): UsePlatformLeadsResult {
  const [leads, setLeads]     = useState<PlatformLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/leads", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: PlatformLead[] = await res.json();
      setLeads(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchLeads(); }, [fetchLeads]);

  const createLead = useCallback(async (input: PlatformLeadInput): Promise<PlatformLead> => {
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
    const created: PlatformLead = await res.json();
    setLeads((prev) => [created, ...prev]);
    return created;
  }, []);

  const updateLead = useCallback(
    async (id: number, input: Partial<PlatformLeadInput>): Promise<PlatformLead> => {
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
      const updated: PlatformLead = await res.json();
      setLeads((prev) => prev.map((l) => (l.id === id ? updated : l)));
      return updated;
    },
    []
  );

  const deleteLead = useCallback(async (id: number): Promise<void> => {
    const res = await fetch(`/api/platform/leads/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? `HTTP ${res.status}`);
    }
    setLeads((prev) => prev.filter((l) => l.id !== id));
  }, []);

  return { leads, loading, error, refetch: fetchLeads, createLead, updateLead, deleteLead };
}