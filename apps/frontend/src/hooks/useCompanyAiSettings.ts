"use client";

// hooks/useCompanyAiSettings.ts
// ─────────────────────────────────────────────────────────────────────
// Hook para que la empresa configure sus API keys de IA (jul 2026 v7).
//
// La empresa SOLO carga sus API keys de Groq y Gemini. El modelo
// lo define ApliSmart — no se puede elegir.
//
//   GET    /company/:id/ai-settings
//   PUT    /company/:id/ai-settings
//   DELETE /company/:id/ai-settings
//   POST   /company/:id/ai-settings/test  (body: { provider: 'groq' | 'gemini' })
//   GET    /company/:id/ai-usage?from&to
//   GET    /company/:id/ai-providers
// ─────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

// jul 2026 v7 — la empresa NO elige provider. Solo "groq" y "gemini"
// son tipos válidos como flag de "tengo key cargada", no como
// provider a elegir.
export type AiProviderId = "platform_default" | "groq" | "gemini";

export interface CompanyAiSettings {
  companyId: string;
  isEnabled: boolean;

  // Groq (texto, chat, análisis)
  hasGroqApiKey: boolean;
  groqApiKeyLast4: string | null;
  groqApiKeySetAt: string | null;

  // Gemini (imágenes)
  hasGeminiApiKey: boolean;
  geminiApiKeyLast4: string | null;
  geminiApiKeySetAt: string | null;

  // Rate limits / budget
  rpmLimit: number | null;
  tpmLimit: number | null;
  monthlyBudgetUsd: number | null;

  // Toggles por feature
  useJarvis: boolean;
  useExitAnalysis: boolean;
  useAiInsights: boolean;
  useTts: boolean;

  // Estado
  killedByPlatform: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  keySource: "platform" | "company";
  provider: AiProviderId;   // compat: siempre 'platform_default' en v7.

  // Compat con código viejo (deprecated en v7):
  hasApiKey: boolean;        // = hasGroqApiKey || hasGeminiApiKey
  apiKeyLast4: string | null; // = groq o gemini (preferentemente groq)
  apiKeySetAt: string | null; // = groq o gemini (preferentemente groq)
  modelPrimary: string | null;  // siempre null — lo define ApliSmart
  modelFallback: string | null; // siempre null
  modelTtsVoice: string | null; // siempre null
}

export interface AiProviderInfo {
  id: AiProviderId;
  label: string;
  description: string;
  model: string;            // El modelo lo define ApliSmart.
  managedBy: 'aplismart';
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
  updateSettings: (input: Partial<CompanyAiSettings> & {
    groqApiKey?: string;
    groqApiKeyClear?: boolean;
    geminiApiKey?: string;
    geminiApiKeyClear?: boolean;
  }) => Promise<boolean>;
  resetToDefault: () => Promise<boolean>;
  testConnection: (provider: 'groq' | 'gemini') => Promise<{ ok: boolean; latencyMs?: number; error?: string }>;
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
    async (input: Partial<CompanyAiSettings> & {
      groqApiKey?: string;
      groqApiKeyClear?: boolean;
      geminiApiKey?: string;
      geminiApiKeyClear?: boolean;
    }): Promise<boolean> => {
      if (!companyId) return false;
      try {
        // jul 2026 v7 — schema minimalista. NO mandamos provider/modelo.
        const body: any = {
          isEnabled:        input.isEnabled,
          rpmLimit:         input.rpmLimit,
          tpmLimit:         input.tpmLimit,
          monthlyBudgetUsd: input.monthlyBudgetUsd,
          useJarvis:        input.useJarvis,
          useExitAnalysis:  input.useExitAnalysis,
          useAiInsights:    input.useAiInsights,
          useTts:           input.useTts,
        };
        if (input.groqApiKey        && input.groqApiKey.trim().length > 0)        body.groqApiKey        = input.groqApiKey.trim();
        if (input.geminiApiKey      && input.geminiApiKey.trim().length > 0)      body.geminiApiKey      = input.geminiApiKey.trim();
        if (input.groqApiKeyClear)  body.groqApiKeyClear  = true;
        if (input.geminiApiKeyClear) body.geminiApiKeyClear = true;

        const r = await fetch(`/api/company/${companyId}/ai-settings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
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

  const testConnection = useCallback(async (provider: 'groq' | 'gemini') => {
    if (!companyId) return { ok: false, error: "Sin empresa" };
    try {
      const r = await fetch(`/api/company/${companyId}/ai-settings/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
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
