import { useState, useEffect, useCallback } from "react";
import type { PlatformCompany, PlatformCompanyInput } from "../types/platform";

interface UsePlatformCompaniesResult {
  companies: PlatformCompany[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  createCompany: (input: PlatformCompanyInput) => Promise<PlatformCompany>;
  updateCompany: (id: number, input: Partial<PlatformCompanyInput>) => Promise<PlatformCompany>;
  deleteCompany: (id: number) => Promise<void>;
}

export function usePlatformCompanies(): UsePlatformCompaniesResult {
  const [companies, setCompanies] = useState<PlatformCompany[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/platform/companies", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: PlatformCompany[] = await res.json();
      setCompanies(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchCompanies(); }, [fetchCompanies]);

  const createCompany = useCallback(async (input: PlatformCompanyInput): Promise<PlatformCompany> => {
    const res = await fetch("/platform/companies", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? `HTTP ${res.status}`);
    }
    const created: PlatformCompany = await res.json();
    setCompanies((prev) => [created, ...prev]);
    return created;
  }, []);

  const updateCompany = useCallback(
    async (id: number, input: Partial<PlatformCompanyInput>): Promise<PlatformCompany> => {
      const res = await fetch(`/platform/companies/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `HTTP ${res.status}`);
      }
      const updated: PlatformCompany = await res.json();
      setCompanies((prev) => prev.map((c) => (c.id === id ? updated : c)));
      return updated;
    },
    []
  );

  const deleteCompany = useCallback(async (id: number): Promise<void> => {
    const res = await fetch(`/platform/companies/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? `HTTP ${res.status}`);
    }
    setCompanies((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return { companies, loading, error, refetch: fetchCompanies, createCompany, updateCompany, deleteCompany };
}