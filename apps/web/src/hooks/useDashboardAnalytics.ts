"use client";

import { useState, useEffect, useCallback } from "react";

export interface DashboardKpis {
  totalAssets: number;
  operativeAssets: number;
  totalDrivers: number;
  activeDrivers: number;
  openMaintenances: number;
  totalMaintenances: number;
  openAlerts: number;
  criticalAlerts: number;
  totalFuelLiters: number;
  totalFuelCost: number;
  activeAssignments: number;
  totalChecklists: number;
}

export interface MonthlyData {
  categories: string[];
  count: number[];
  cost: number[];
}

export interface FuelData {
  categories: string[];
  liters: number[];
  cost: number[];
}

export interface SeriesItem {
  name: string;
  value: number;
}

export interface DashboardCharts {
  maintenancesByMonth: MonthlyData;
  fuelOverTime: FuelData;
  assetsByCategory: SeriesItem[];
  assetsByStatus: SeriesItem[];
  assetsByFuelType: SeriesItem[];
  driversByLicense: SeriesItem[];
  alertsBySeverity: SeriesItem[];
  alertsByType: SeriesItem[];
  maintenancesByKind: SeriesItem[];
}

export interface DashboardAnalytics {
  kpis: DashboardKpis;
  charts: DashboardCharts;
  recentActivity: Array<{
    id: string;
    action: string;
    entity: string;
    entityId: string;
    actor: string;
    description: string;
    at: string;
  }>;
}

export function useDashboardAnalytics(companyId: string | null) {
  const [data, setData] = useState<DashboardAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/company/${companyId}/analytics/dashboard`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void fetch_(); }, [fetch_]);

  return { data, loading, error, refetch: fetch_ };
}