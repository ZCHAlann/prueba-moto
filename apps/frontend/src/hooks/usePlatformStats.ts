import { useState, useEffect, useCallback } from "react";
import type { PlatformStats } from "../types/platform";

interface UsePlatformStatsResult {
  data: PlatformStats | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function usePlatformStats(): UsePlatformStatsResult {
  const [data, setData]       = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/platform/stats", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: PlatformStats = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchStats(); }, [fetchStats]);

  return { data, loading, error, refetch: fetchStats };
}