"use client";

// hooks/useCompanyAiSettings.ts
// ─────────────────────────────────────────────────────────────────────
// Hook para que la empresa configure su propia IA (jul 2026 v6).
//   GET    /company/:id/ai-settings
//   PUT    /company/:id/ai-settings
//   DELETE /company/:id/ai-settings
//   POST   /company/:id/ai-settings/test
//   GET    /company/:id/ai-usage?from&to
//   GET    /company/:id/ai-providers
// ─────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

export type AiProviderId =
  | "platform_default"
  | "groq"
  | "gemini"
  | "openai"
  | "anthropic"
  | "custom";

export interface CompanyAiSettings {
  companyId: string;
  provider: AiProviderId;
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
  createdAt: string | null;
  updatedAt: string | null;
  keySource: "platform" | "company";
}

export interface AiProviderInfo {
  id: AiProviderId;
  label: string;
  description: string;
  models: string[];
}

export interface AiUsageRow {
  periodDay: string;
  feature: string;
  provider: string;
  tokensIn: number;
  tokensOut: number;
  requests: number;
  costUsd: string;
}

interface UseAiSettingsReturn {
  settings: CompanyAiSettings | null;
  loading: boolean;
  error: string | null;
  providers: AiProviderInfo[];
  updateSettings: (input: Partial<CompanyAiSettings> & { apiKey?: string; apiKeyClear?: boolean }) => Promise<boolean>;
  resetToDefault: () => Promise<boolean>;
  testConnection: () => Promise<{ ok: boolean; latencyMs?: number; error?: string }>;
  usage: AiUsageRow[];
  usageLoading: boolean;
  refreshUsage: (from?: Date, to?: Date) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useCompanyAiSettings(): UseAiSettingsReturn {
  const { session } = useAuth();
  const companyId = session?.companyId ? String(session.companyId) : null;

  const [settings, setSettings]     = useState<CompanyAiSettings | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [providers, setProviders]   = useState<AiProviderInfo[]>([]);
  const [usage, setUsage]           = useState<AiUsageRow[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/company/${companyId}/ai-settings`, { cache: "no-store" });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.error || `Error ${r.status}`);
      }
      const data = await r.json();
      setSettings(data as CompanyAiSettings);
    } catch (e: any) {
      setError(e?.message ?? "Error cargando configuración IA");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const refreshProviders = useCallback(async () => {
    if (!companyId) return;
    try {
      const r = await fetch(`/api/company/${companyId}/ai-providers`, { cache: "no-store" });
      if (r.ok) {
        const data = await r.json();
        setProviders(data.providers ?? []);
      }
    } catch { /* noop */ }
  }, [companyId]);

  const refreshUsage = useCallback(async (from?: Date, to?: Date) => {
    if (!companyId) return;
    setUsageLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from.toISOString());
      if (to)   params.set("to",   to.toISOString());
      const qs = params.toString();
      const r = await fetch(`/api/company/${companyId}/ai-usage${qs ? `?${qs}` : ""}`, { cache: "no-store" });
      if (r.ok) {
        const data = await r.json();
        setUsage(data.rows ?? []);
      }
    } catch { /* noop */ }
    finally { setUsageLoading(false); }
  }, [companyId]);

  useEffect(() => { void refresh(); void refreshProviders(); void refreshUsage(); }, [refresh, refreshProviders, refreshUsage]);

  const updateSettings = useCallback(
    async (input: Partial<CompanyAiSettings> & { apiKey?: string; apiKeyClear?: boolean }): Promise<boolean> => {
      if (!companyId) return false;
      try {
        const r = await fetch(`/api/company/${companyId}/ai-settings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!r.ok) {
          const b = await r.json().catch(() => ({}));
          throw new Error(b.error || `Error ${r.status}`);
        }
        await refresh();
        return true;
      } catch (e: any) {
        setError(e?.message ?? "Error guardando configuración IA");
        return false;
      }
    },
    [companyId, refresh]
  );

  const resetToDefault = useCallback(async (): Promise<boolean> => {
    if (!companyId) return false;
    try {
      const r = await fetch(`/api/company/${companyId}/ai-settings`, { method: "DELETE" });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.error || `Error ${r.status}`);
      }
      await refresh();
      return true;
    } catch (e: any) {
      setError(e?.message ?? "Error reseteando configuración IA");
      return false;
    }
  }, [companyId, refresh]);

  const testConnection = useCallback(async () => {
    if (!companyId) return { ok: false, error: "Sin empresa" };
    try {
      const r = await fetch(`/api/company/${companyId}/ai-settings/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: data.error || `Error ${r.status}` };
      return { ok: true, latencyMs: data.latencyMs };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Error de red" };
    }
  }, [companyId]);

  return {
    settings,
    loading,
    error,
    providers,
    updateSettings,
    resetToDefault,
    testConnection,
    usage,
    usageLoading,
    refreshUsage,
    refresh,
  };
}