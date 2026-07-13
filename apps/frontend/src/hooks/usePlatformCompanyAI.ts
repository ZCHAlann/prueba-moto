"use client";

// hooks/usePlatformCompanyAI.ts
// ─────────────────────────────────────────────────────────────────────
// Hook de superadmin para ver / gestionar la config de IA de una empresa.
//   GET /platform/companies/:id/ai-settings
//   GET /platform/companies/:id/ai-usage?from&to
//   POST /platform/companies/:id/ai-disable
//   POST /platform/companies/:id/ai-enable
// ─────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";

export interface PlatformCompanyAiSettings {
  company: {
    id: string;
    name: string;
    slug: string;
  };
  config: {
    provider: string;
    isEnabled: boolean;
    hasApiKey: boolean;
    apiKeyLast4: string | null;
    apiKeySetAt: string | null;
    modelPrimary: string | null;
    modelFallback: string | null;
    modelTtsVoice: string | null;
    rpmLimit: number | null;
    tpmLimit: number | null;
    monthlyBudgetUsd: number | null;
    useJarvis: boolean;
    useExitAnalysis: boolean;
    useAiInsights: boolean;
    useTts: boolean;
    killedByPlatform: boolean;
    keySource: "platform" | "company";
  };
}

export interface PlatformAiUsageRow {
  periodDay: string;
  feature: string;
  provider: string;
  tokensIn: number;
  tokensOut: number;
  requests: number;
  costUsd: string;
}

interface UsePlatformCompanyAIReturn {
  data: PlatformCompanyAiSettings | null;
  loading: boolean;
  error: string | null;
  usage: PlatformAiUsageRow[];
  usageLoading: boolean;
  disable: (reason?: string) => Promise<boolean>;
  enable: () => Promise<boolean>;
  refresh: () => Promise<void>;
  refreshUsage: (from?: Date, to?: Date) => Promise<void>;
}

export function usePlatformCompanyAI(companyId: string | null | undefined): UsePlatformCompanyAIReturn {
  const [data, setData]             = useState<PlatformCompanyAiSettings | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [usage, setUsage]           = useState<PlatformAiUsageRow[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/platform/companies/${companyId}/ai-settings`, { cache: "no-store" });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.error || `Error ${r.status}`);
      }
      setData(await r.json());
    } catch (e: any) {
      setError(e?.message ?? "Error cargando IA de la empresa");
    } finally { setLoading(false); }
  }, [companyId]);

  const refreshUsage = useCallback(async (from?: Date, to?: Date) => {
    if (!companyId) return;
    setUsageLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from.toISOString());
      if (to)   params.set("to",   to.toISOString());
      const qs = params.toString();
      const r = await fetch(`/api/platform/companies/${companyId}/ai-usage${qs ? `?${qs}` : ""}`, { cache: "no-store" });
      if (r.ok) {
        const d = await r.json();
        setUsage(d.rows ?? []);
      }
    } catch { /* noop */ }
    finally { setUsageLoading(false); }
  }, [companyId]);

  useEffect(() => { void refresh(); void refreshUsage(); }, [refresh, refreshUsage]);

  const disable = useCallback(async (reason?: string): Promise<boolean> => {
    if (!companyId) return false;
    try {
      const r = await fetch(`/api/platform/companies/${companyId}/ai-disable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason ?? "" }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.error || `Error ${r.status}`);
      }
      await refresh();
      return true;
    } catch (e: any) {
      setError(e?.message ?? "Error al deshabilitar IA");
      return false;
    }
  }, [companyId, refresh]);

  const enable = useCallback(async (): Promise<boolean> => {
    if (!companyId) return false;
    try {
      const r = await fetch(`/api/platform/companies/${companyId}/ai-enable`, { method: "POST" });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.error || `Error ${r.status}`);
      }
      await refresh();
      return true;
    } catch (e: any) {
      setError(e?.message ?? "Error al habilitar IA");
      return false;
    }
  }, [companyId, refresh]);

  return { data, loading, error, usage, usageLoading, disable, enable, refresh, refreshUsage };
}