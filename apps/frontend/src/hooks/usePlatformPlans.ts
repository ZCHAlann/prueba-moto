import { useState, useEffect, useCallback } from "react";
import type { PlatformPlan, PlatformPlanInput } from "../types/platform";

interface UsePlatformPlansResult {
  plans: PlatformPlan[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  createPlan: (input: PlatformPlanInput) => Promise<PlatformPlan>;
  updatePlan: (id: string, input: Partial<PlatformPlanInput>) => Promise<PlatformPlan>;
  deletePlan: (id: string) => Promise<void>;
}

export function usePlatformPlans(): UsePlatformPlansResult {
  const [plans, setPlans]     = useState<PlatformPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/plans", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: { data: PlatformPlan[]; total: number } = await res.json();
      setPlans(json.data);  // ← antes era: setPlans(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchPlans(); }, [fetchPlans]);

  const createPlan = useCallback(async (input: PlatformPlanInput): Promise<PlatformPlan> => {
    const res = await fetch("/api/platform/plans", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? `HTTP ${res.status}`);
    }
    const created: PlatformPlan = await res.json();
    setPlans((prev) => [...prev, created]);
    return created;
  }, []);

  const updatePlan = useCallback(
    async (id: string, input: Partial<PlatformPlanInput>): Promise<PlatformPlan> => {
      const res = await fetch(`/api/platform/plans/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `HTTP ${res.status}`);
      }
      const updated: PlatformPlan = await res.json();
      setPlans((prev) => prev.map((p) => (p.id === id ? updated : p)));
      return updated;
    },
    []
  );

  const deletePlan = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`/api/platform/plans/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? `HTTP ${res.status}`);
    }
    setPlans((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return { plans, loading, error, refetch: fetchPlans, createPlan, updatePlan, deletePlan };
}