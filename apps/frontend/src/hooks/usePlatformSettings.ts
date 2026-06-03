import { useState, useEffect, useCallback } from 'react';

export interface PlatformSettings {
  // General
  platformName:          string;
  platformUrl:           string;
  supportEmail:          string;
  defaultTimezone:       string;
  defaultLanguage:       string;
  // Seguridad
  passwordMinLength:     number;
  passwordRequireUpper:  boolean;
  passwordRequireNumber: boolean;
  passwordRequireSymbol: boolean;
  passwordExpiryDays:    number;
  sessionExpiryHours:    number;
  maxLoginAttempts:      number;
  lockoutMinutes:        number;
  // SMTP
  smtpHost:              string;
  smtpPort:              number;
  smtpUser:              string;
  smtpFromAddress:       string;
  smtpFromName:          string;
  // Notificaciones
  notifyOnNewCompany:    boolean;
  notifyOnTrialExpiring: boolean;
  notifyOnLoginFailure:  boolean;
  // Defaults empresas
  defaultTrialDays:      number;
  defaultMaxUsers:       number;
  defaultMaxAssets:      number;
  updatedAt:             string;
}

interface UsePlatformSettingsResult {
  settings:  PlatformSettings | null;
  loading:   boolean;
  error:     string | null;
  saving:    boolean;
  saveError: string | null;
  refetch:   () => void;
  save:      (data: Partial<PlatformSettings>) => Promise<void>;
}

export function usePlatformSettings(): UsePlatformSettingsResult {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [saveError,setSaveError]= useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/platform/settings', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: PlatformSettings = await res.json();
      setSettings(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchSettings(); }, [fetchSettings]);

  const save = useCallback(async (data: Partial<PlatformSettings>) => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/platform/settings', {
        method:      'PUT',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `HTTP ${res.status}`);
      }
      const updated: PlatformSettings = await res.json();
      setSettings(updated);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error al guardar');
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  return { settings, loading, error, saving, saveError, refetch: fetchSettings, save };
}