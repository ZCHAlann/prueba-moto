import { useState, useEffect, useCallback } from 'react';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type FleetHealthTier = 'free' | 'starter' | 'pro' | 'enterprise';
export type FleetHealthStatus = 'active' | 'inactive' | 'suspended' | 'trial';

export interface FleetHealthItem {
  companyId:      number;
  name:           string;
  slug:           string;
  status:         FleetHealthStatus;
  planId:         string;
  planName:       string;
  tier:           FleetHealthTier;
  maxAssets:      number | null;
  maxUsers:       number | null;
  totalAssets:    number;
  saturation:     number | null;   // % 0-100, null si plan sin límite
  nearLimit:      boolean;
  criticalAlerts: number;
  warningAlerts:  number;
  createdAt:      string;          // ISO — mes de creación de la empresa
  assetsByMonth:  number[];        // 12 meses: # de assets NUEVOS por mes
  totalByMonth:   number[];        // 12 meses: acumulado de assets hasta fin de mes
}

export interface FleetHealthResponse {
  data:        FleetHealthItem[];
  monthLabels: string[];     // 12 labels dinámicos alineados con totalByMonth
  generatedAt: string;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFleetHealth() {
  const [data,        setData]        = useState<FleetHealthItem[]>([]);
  const [monthLabels, setMonthLabels] = useState<string[]>([
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
  ]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/platform/fleet-health', {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json: FleetHealthResponse = await res.json();
      setData(json.data);
      if (Array.isArray(json.monthLabels) && json.monthLabels.length === 12) {
        setMonthLabels(json.monthLabels);
      }
      setGeneratedAt(json.generatedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  return { data, monthLabels, generatedAt, loading, error, refetch: fetch_ };
}