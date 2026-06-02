"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import type { CompanySettings } from "../types/fleet";
import type { AlertConfig } from "../types/fleet";

type UseSettingsReturn = {
  settings: CompanySettings | null;
  loading: boolean;
  error: string | null;
  updateSettings: (input: Partial<Omit<CompanySettings, "tenantId">>) => Promise<boolean>;
  toggleAlertConfig: (id: string) => Promise<boolean>;
};

function mapApiToSettings(data: Record<string, unknown>, companyId: string): CompanySettings {
  return {
    tenantId: `tenant-company-${companyId}`,
    maintenanceLeadTimeDays: Number(data.maintenanceLeadTimeDays ?? data.maintenance_lead_time_days ?? 7),
    checklistRequired: Boolean(data.checklistRequired ?? data.checklist_required ?? true),
    fuelCurrency: String(data.fuelCurrency ?? data.fuel_currency ?? "USD"),
    alertEmail: String(data.alertEmail ?? data.alert_email ?? ""),
    alertConfigs: Array.isArray(data.alertConfigs) ? data.alertConfigs as AlertConfig[] : [],
  };
}

function mapSettingsToApi(input: Partial<Omit<CompanySettings, "tenantId">>) {
  return {
    maintenanceLeadTimeDays: input.maintenanceLeadTimeDays,
    checklistRequired:       input.checklistRequired,
    fuelCurrency:            input.fuelCurrency,
    alertEmail:              input.alertEmail,
    alertConfigs:            input.alertConfigs,
  };
}

export function useSettings(): UseSettingsReturn {
  const { session } = useAuth();
  const companyId = session?.companyId ? String(session.companyId) : null;

  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`/api/company/${companyId}/settings`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`Error ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setSettings(mapApiToSettings(data as Record<string, unknown>, companyId));
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error cargando configuracion");
      })
      .finally(() => setLoading(false));
  }, [companyId]);

  const updateSettings = useCallback(
    async (input: Partial<Omit<CompanySettings, "tenantId">>): Promise<boolean> => {
      if (!companyId) return false;

      try {
        const res = await fetch(`/api/company/${companyId}/settings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mapSettingsToApi(input)),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
        }

        const data = await res.json();
        setSettings(mapApiToSettings(data as Record<string, unknown>, companyId));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error guardando configuracion");
        return false;
      }
    },
    [companyId]
  );

  const toggleAlertConfig = useCallback(
    async (id: string): Promise<boolean> => {
      if (!settings) return false;
      const updatedConfigs = (settings.alertConfigs ?? []).map(config =>
        config.id === id ? { ...config, enabled: !config.enabled } : config
      );
      return updateSettings({ alertConfigs: updatedConfigs });
    },
    [settings, updateSettings]
  );

  return { settings, loading, error, updateSettings, toggleAlertConfig };
}