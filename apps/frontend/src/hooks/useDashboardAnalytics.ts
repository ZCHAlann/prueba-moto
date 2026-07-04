// hooks/useDashboardAnalytics.ts

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
  galones: number[];
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

// ── Fase 1: Vistas inteligentes ─────────────────────────────────────────────

export interface FlotaPorSede {
  name: string;
  total: number;
  operative: number;
}
export interface KpisPorSede {
  name: string;
  total: number;
  operative: number;
  availability: number; // % operativo
}
export interface FlotaPorGaraje {
  id: number;
  name: string;
  total: number;
  capacity: number;
}
export interface OcupacionGaraje {
  name: string;
  used: number;
  capacity: number;
  occupancy: number; // %
}
export interface CombustiblePorVehiculo {
  id: number;
  plate: string;
  name: string;
  gallons: number;
  cost: number;
}

export interface DashboardIntelligent {
  flotaPorSede:       FlotaPorSede[];
  kpisPorSede:        KpisPorSede[];
  flotaPorGaraje:     FlotaPorGaraje[];
  ocupacionGarajes:   OcupacionGaraje[];
  consumoPorVehiculo: CombustiblePorVehiculo[];
  costoPorVehiculo:    CombustiblePorVehiculo[];
}

export interface DashboardAnalytics {
  kpis: DashboardKpis;
  charts: DashboardCharts;
  intelligent: DashboardIntelligent;
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

// ── Fase 2: Hooks individuales para endpoints extendidos ────────────────────

export interface ConsumoPorConductor {
  id: number;
  name: string;
  code: string | null;
  gallons: number;
  cost: number;
}

export function useConsumoPorConductor(companyId: string | null, limit = 10) {
  const [data, setData] = useState<ConsumoPorConductor[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    fetch(`/api/company/${companyId}/analytics/dashboard-extended/consumo-por-conductor?limit=${limit}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(j => setData(j.data ?? []))
      .catch(err => setError(err instanceof Error ? err.message : "Error"))
      .finally(() => setLoading(false));
  }, [companyId, limit]);

  return { data, loading, error };
}

export interface EstadoAsignacionesData {
  items: SeriesItem[];
  total: number;
}

export function useEstadoAsignaciones(companyId: string | null) {
  const [data, setData] = useState<EstadoAsignacionesData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    fetch(`/api/company/${companyId}/analytics/dashboard-extended/estado-asignaciones`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(j => setData({ items: j.data ?? [], total: j.total ?? 0 }))
      .catch(() => setData({ items: [], total: 0 }))
      .finally(() => setLoading(false));
  }, [companyId]);

  return { data, loading };
}

export function useDisponibilidadConductores(companyId: string | null) {
  const [data, setData] = useState<{ items: SeriesItem[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    fetch(`/api/company/${companyId}/analytics/dashboard-extended/disponibilidad-conductores`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(j => setData({ items: j.data ?? [], total: j.total ?? 0 }))
      .catch(() => setData({ items: [], total: 0 }))
      .finally(() => setLoading(false));
  }, [companyId]);

  return { data, loading };
}

// ── Fase 3: Tipos para los 11 submódulos restantes ──────────────────────────

export interface PolizaPorVencer {
  assetId: number;
  insurer: string;
  policyNumber: string;
  endDate: string;
  daysLeft: number;
  plate: string | null;
  assetName: string | null;
}
export interface PolizasPorVencerData {
  data: SeriesItem[];           // bucketed: vencidas/30/60/90/vigentes
  total: number;
  proximas: PolizaPorVencer[];
}

export function usePolizasPorVencer(companyId: string | null) {
  const [data, setData] = useState<PolizasPorVencerData | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    fetch(`/api/company/${companyId}/analytics/dashboard-extended/polizas-por-vencer`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(j => setData({ data: j.data ?? [], total: j.total ?? 0, proximas: j.proximas ?? [] }))
      .catch(() => setData({ data: [], total: 0, proximas: [] }))
      .finally(() => setLoading(false));
  }, [companyId]);
  return { data, loading };
}

export interface CoberturaActivosData {
  data: SeriesItem[];
  total: number;
  coveragePercent: number;
}
export function useCoberturaActivos(companyId: string | null) {
  const [data, setData] = useState<CoberturaActivosData | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    fetch(`/api/company/${companyId}/analytics/dashboard-extended/cobertura-activos`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(j => setData({ data: j.data ?? [], total: j.total ?? 0, coveragePercent: j.coveragePercent ?? 0 }))
      .catch(() => setData({ data: [], total: 0, coveragePercent: 0 }))
      .finally(() => setLoading(false));
  }, [companyId]);
  return { data, loading };
}

export interface ChecklistsKpisData {
  data: SeriesItem[];
  total: number;
}
export function useKpisChecklists(companyId: string | null) {
  const [data, setData] = useState<ChecklistsKpisData | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    fetch(`/api/company/${companyId}/analytics/dashboard-extended/kpis-checklists`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(j => setData({ data: j.data ?? [], total: j.total ?? 0 }))
      .catch(() => setData({ data: [], total: 0 }))
      .finally(() => setLoading(false));
  }, [companyId]);
  return { data, loading };
}

export interface ChecklistPendiente {
  id: number;
  date: string;
  targetKind: string;
  targetLabel: string;
  plate: string | null;
  assetName: string | null;
  summary: string | null;
}
export function useChecklistsPendientes(companyId: string | null) {
  const [data, setData] = useState<{ data: ChecklistPendiente[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    fetch(`/api/company/${companyId}/analytics/dashboard-extended/checklists-pendientes?limit=20`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(j => setData({ data: j.data ?? [], total: j.total ?? 0 }))
      .catch(() => setData({ data: [], total: 0 }))
      .finally(() => setLoading(false));
  }, [companyId]);
  return { data, loading };
}

export interface InventarioBajo {
  id: number;
  code: string;
  name: string;
  category: string | null;
  stock: number;
  minStock: number;
  unit: string | null;
  location: string | null;
  deficit: number;
}
export function useInventarioBajo(_companyId: string | null) {
  // El módulo de Inventario ya no existe: el endpoint backend fue removido
  // en el borrado del módulo Inventario. Devolvemos una respuesta vacía
  // estable para que los consumidores no rompan con 404 ni borren UI que
  // ya tenían condicionada a esta card.
  return { data: { data: [], total: 0 }, loading: false };
}

export interface KpisAcData {
  data: SeriesItem[];
  total: number;
}
export function useKpisAc(companyId: string | null) {
  const [data, setData] = useState<KpisAcData | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    fetch(`/api/company/${companyId}/analytics/dashboard-extended/kpis-ac`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(j => setData({ data: j.data ?? [], total: j.total ?? 0 }))
      .catch(() => setData({ data: [], total: 0 }))
      .finally(() => setLoading(false));
  }, [companyId]);
  return { data, loading };
}

export interface ServicioAcPendiente {
  id: number;
  code: string;
  name: string;
  brand: string | null;
  model: string | null;
  nextService: string;
  status: string | null;
  technician: string | null;
}
export function useServiciosAcPendientes(companyId: string | null) {
  const [data, setData] = useState<{ data: ServicioAcPendiente[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    fetch(`/api/company/${companyId}/analytics/dashboard-extended/servicios-ac-pendientes`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(j => setData({ data: j.data ?? [], total: j.total ?? 0 }))
      .catch(() => setData({ data: [], total: 0 }))
      .finally(() => setLoading(false));
  }, [companyId]);
  return { data, loading };
}

export interface ActividadUsuarioItem {
  actorName: string;
  count: number;
}
export interface ActividadEntidadItem {
  entity: string;
  action: string;
  count: number;
}
export interface ActividadUsuarioData {
  data: ActividadUsuarioItem[];
  total: number;
}
export interface ActividadEntidadData {
  data: ActividadEntidadItem[];
  total: number;
}
export function useActividadPorUsuario(companyId: string | null) {
  const [data, setData] = useState<ActividadUsuarioData | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    fetch(`/api/company/${companyId}/analytics/dashboard-extended/actividad-por-usuario?limit=10`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(j => setData({ data: j.data ?? [], total: j.total ?? 0 }))
      .catch(() => setData({ data: [], total: 0 }))
      .finally(() => setLoading(false));
  }, [companyId]);
  return { data, loading };
}

export function useActividadPorEntidad(companyId: string | null) {
  const [data, setData] = useState<ActividadEntidadData | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    fetch(`/api/company/${companyId}/analytics/dashboard-extended/actividad-por-entidad?limit=10`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(j => setData({ data: j.data ?? [], total: j.total ?? 0 }))
      .catch(() => setData({ data: [], total: 0 }))
      .finally(() => setLoading(false));
  }, [companyId]);
  return { data, loading };
}
