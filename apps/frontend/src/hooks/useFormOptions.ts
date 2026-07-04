/**
 * Hooks para que cada módulo del frontend pida los catálogos que
 * necesita para sus forms/selectores, pero al ENDPOINT DEL MÓDULO
 * (no al endpoint del módulo dueño).
 *
 * Antes (mal): el módulo Checklist llamaba a `useAssets()` que pegaba
 * al endpoint `/assets` con permiso de `gestion/flotas` → 403 si el
 * usuario solo tenía permiso de Checklist.
 *
 * Ahora (bien): cada módulo expone `form-options` con su propio
 * permiso, y este hook lo consume.
 *
 * Por ahora cada módulo tiene SU hook específico (useMaintenanceOptions,
 * useChecklistOptions, etc.) porque la forma de los datos es distinta.
 * Si en el futuro se estandariza, podemos unificar.
 */

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";

// ─── Accesos / Usuarios ────────────────────────────────────────────────────

export interface UsersOptionSite {
  id: string; name: string; code: string; status: string;
}
export interface UsersOptionRole {
  key: string; label: string;
  permissions: unknown;
  isSystem: boolean;
}
export interface UsersFormOptions {
  sites: UsersOptionSite[];
  roles: UsersOptionRole[];
}

export function useUsersFormOptions() {
  const { companyId } = useAuth();
  const cid = companyId ? String(companyId) : null;
  return useQuery({
    queryKey: ["users-form-options", cid],
    queryFn: async (): Promise<UsersFormOptions> => {
      const res = await fetch(`/api/company/${cid}/users/form-options`, {
        credentials: "include",
      });
      if (!res.ok) return { sites: [], roles: [] };
      return (await res.json()) as UsersFormOptions;
    },
    enabled: !!cid,
    staleTime: 5 * 60_000,
  });
}

// ─── Mantenimientos ─────────────────────────────────────────────────────────

export interface MaintenanceOptionAsset {
  id: string; name: string; plate: string | null; brand: string | null; model: string | null;
}
export interface MaintenanceOptionWorkshop { id: string; name: string; }
export interface MaintenanceOptionSupplier { id: string; name: string; }
export interface MaintenanceOptionUser {
  id: string; username: string; role: string;
  firstName: string | null; lastName: string | null; fullName: string;
}
export interface MaintenanceFormOptions {
  assets:   MaintenanceOptionAsset[];
  workshops: MaintenanceOptionWorkshop[];
  suppliers: MaintenanceOptionSupplier[];
  users:     MaintenanceOptionUser[];
}

async function fetchMaintenanceFormOptions(companyId: string): Promise<MaintenanceFormOptions> {
  const res = await fetch(`/api/company/${companyId}/maintenances?pageSize=1`, {
    credentials: "include",
  });
  if (!res.ok) {
    return { assets: [], workshops: [], suppliers: [], users: [] };
  }
  const body = (await res.json()) as Record<string, unknown>;
  return {
    assets:   (body.assets   as MaintenanceOptionAsset[])   ?? [],
    workshops:(body.workshops as MaintenanceOptionWorkshop[])?? [],
    suppliers:(body.suppliers as MaintenanceOptionSupplier[])?? [],
    users:    (body.users    as MaintenanceOptionUser[])    ?? [],
  };
}

export function useMaintenanceFormOptions() {
  const { companyId } = useAuth();
  const cid = companyId ? String(companyId) : null;
  return useQuery({
    queryKey: ["maintenance-form-options", cid],
    queryFn: () => fetchMaintenanceFormOptions(cid!),
    enabled: !!cid,
    staleTime: 5 * 60_000, // 5 min: los catálogos cambian poco
  });
}

// ─── Checklist ─────────────────────────────────────────────────────────────

export interface ChecklistOptionAsset {
  id: string; plate: string | null; name: string; code: string;
  brand: string | null; model: string | null; status: string | null;
}
export interface ChecklistOptionUser {
  id: string; username: string; role: string;
  firstName: string | null; lastName: string | null; fullName: string;
}
export interface ChecklistFormOptions {
  assets: ChecklistOptionAsset[];
  users:  ChecklistOptionUser[];
}

export function useChecklistFormOptions() {
  const { companyId } = useAuth();
  const cid = companyId ? String(companyId) : null;
  return useQuery({
    queryKey: ["checklist-form-options", cid],
    queryFn: async (): Promise<ChecklistFormOptions> => {
      const res = await fetch(`/api/company/${cid}/checklists/form-options`, {
        credentials: "include",
      });
      if (!res.ok) return { assets: [], users: [] };
      return (await res.json()) as ChecklistFormOptions;
    },
    enabled: !!cid,
    staleTime: 5 * 60_000,
  });
}

// ─── Alertas ──────────────────────────────────────────────────────────────

export interface AlertsOptionAsset  { id: string; plate: string | null; name: string; code: string | null; brand: string | null; model: string | null; }
export interface AlertsOptionDriver { id: string; firstName: string; lastName: string; }
export interface AlertsFormOptions {
  assets:  AlertsOptionAsset[];
  drivers: AlertsOptionDriver[];
}

export function useAlertsFormOptions() {
  const { companyId } = useAuth();
  const cid = companyId ? String(companyId) : null;
  return useQuery({
    queryKey: ["alerts-form-options", cid],
    queryFn: async (): Promise<AlertsFormOptions> => {
      const res = await fetch(`/api/company/${cid}/alerts/form-options`, {
        credentials: "include",
      });
      if (!res.ok) return { assets: [], drivers: [] };
      return (await res.json()) as AlertsFormOptions;
    },
    enabled: !!cid,
    staleTime: 5 * 60_000,
  });
}

// ─── Reports (EntityPicker) ────────────────────────────────────────────────

export interface ReportsOptionAsset  { id: string; plate: string | null; name: string; }
export interface ReportsOptionDriver { id: string; firstName: string; lastName: string; }
export interface ReportsFormOptions {
  assets:  ReportsOptionAsset[];
  drivers: ReportsOptionDriver[];
}

export function useReportsFormOptions() {
  const { companyId } = useAuth();
  const cid = companyId ? String(companyId) : null;
  return useQuery({
    queryKey: ["reports-form-options", cid],
    queryFn: async (): Promise<ReportsFormOptions> => {
      const res = await fetch(`/api/company/${cid}/reports/form-options`, {
        credentials: "include",
      });
      if (!res.ok) return { assets: [], drivers: [] };
      return (await res.json()) as ReportsFormOptions;
    },
    enabled: !!cid,
    staleTime: 5 * 60_000,
  });
}

// ─── AC (Aires Acondicionados) ────────────────────────────────────────────

export interface ACOptionSite  { id: string; name: string; code: string; status: string; }
export interface ACOptionUser  { id: string; username: string; role: string; fullName: string; }
export interface ACFormOptions {
  sites: ACOptionSite[];
  users: ACOptionUser[];
}

export function useACFormOptions() {
  const { companyId } = useAuth();
  const cid = companyId ? String(companyId) : null;
  return useQuery({
    queryKey: ["ac-form-options", cid],
    queryFn: async (): Promise<ACFormOptions> => {
      const res = await fetch(`/api/company/${cid}/ac-units/form-options`, {
        credentials: "include",
      });
      if (!res.ok) return { sites: [], users: [] };
      return (await res.json()) as ACFormOptions;
    },
    enabled: !!cid,
    staleTime: 5 * 60_000,
  });
}

// ─── Motores ──────────────────────────────────────────────────────────────

export interface MotorOptionDriver {
  id: string; firstName: string; lastName: string;
  name: string;
  code: string; licenseType: string | null; status: string;
}
export interface MotorFormOptions {
  drivers: MotorOptionDriver[];
}

export function useMotorFormOptions() {
  const { companyId } = useAuth();
  const cid = companyId ? String(companyId) : null;
  return useQuery({
    queryKey: ["motor-form-options", cid],
    queryFn: async (): Promise<MotorFormOptions> => {
      const res = await fetch(`/api/company/${cid}/vehicles/form-options`, {
        credentials: "include",
      });
      if (!res.ok) return { drivers: [] };
      return (await res.json()) as MotorFormOptions;
    },
    enabled: !!cid,
    staleTime: 5 * 60_000,
  });
}

// ─── Asignaciones ─────────────────────────────────────────────────────────

export interface AssignmentsOptionAsset  { id: string; plate: string | null; name: string; }
export interface AssignmentsOptionDriver { id: string; firstName: string; lastName: string; }
export interface AssignmentsFormOptions {
  assets:  AssignmentsOptionAsset[];
  drivers: AssignmentsOptionDriver[];
}

// ─── Drivers ──────────────────────────────────────────────────────────────

export interface DriverOptionSite { id: string; name: string; code: string; }
export interface DriverFormOptions {
  sites: DriverOptionSite[];
}

export function useDriverFormOptions() {
  const { companyId } = useAuth();
  const cid = companyId ? String(companyId) : null;
  return useQuery({
    queryKey: ["driver-form-options", cid],
    queryFn: async (): Promise<DriverFormOptions> => {
      const res = await fetch(`/api/company/${cid}/drivers/form-options`, {
        credentials: "include",
      });
      if (!res.ok) return { sites: [] };
      return (await res.json()) as DriverFormOptions;
    },
    enabled: !!cid,
    staleTime: 5 * 60_000,
  });
}

// ─── Seguros ──────────────────────────────────────────────────────────────

export interface InsuranceOptionAsset {
  id: string; code: string; name: string; plate: string | null;
  brand: string | null; model: string | null;
}
export interface InsuranceFormOptions {
  assets: InsuranceOptionAsset[];
}

export function useInsuranceFormOptions() {
  const { companyId } = useAuth();
  const cid = companyId ? String(companyId) : null;
  return useQuery({
    queryKey: ["insurance-form-options", cid],
    queryFn: async (): Promise<InsuranceFormOptions> => {
      const res = await fetch(`/api/company/${cid}/insurance/form-options`, {
        credentials: "include",
      });
      if (!res.ok) return { assets: [] };
      return (await res.json()) as InsuranceFormOptions;
    },
    enabled: !!cid,
    staleTime: 5 * 60_000,
  });
}

// ─── Garajes ──────────────────────────────────────────────────────────────

export interface GaragesOptionAsset  { id: string; plate: string | null; name: string; code: string; }
export interface GaragesOptionUser  { id: string; username: string; role: string; fullName: string; }
export interface GaragesFormOptions {
  assets: GaragesOptionAsset[];
  users:  GaragesOptionUser[];
}

export function useGaragesFormOptions() {
  const { companyId } = useAuth();
  const cid = companyId ? String(companyId) : null;
  return useQuery({
    queryKey: ["garages-form-options", cid],
    queryFn: async (): Promise<GaragesFormOptions> => {
      const res = await fetch(`/api/company/${cid}/garages/form-options`, {
        credentials: "include",
      });
      if (!res.ok) return { assets: [], users: [] };
      return (await res.json()) as GaragesFormOptions;
    },
    enabled: !!cid,
    staleTime: 5 * 60_000,
  });
}

// ─── Settings ──────────────────────────────────────────────────────────────

export interface SettingsFormOptions {
  sitesCount: number;
  assetsCount: number;
  driversCount: number;
  usersCount: number;
}

export function useSettingsFormOptions() {
  const { companyId } = useAuth();
  const cid = companyId ? String(companyId) : null;
  return useQuery({
    queryKey: ["settings-form-options", cid],
    queryFn: async (): Promise<SettingsFormOptions> => {
      const res = await fetch(`/api/company/${cid}/settings/form-options`, {
        credentials: "include",
      });
      if (!res.ok) return { sitesCount: 0, assetsCount: 0, driversCount: 0, usersCount: 0 };
      return (await res.json()) as SettingsFormOptions;
    },
    enabled: !!cid,
    staleTime: 5 * 60_000,
  });
}

export function useAssignmentsFormOptions() {
  const { companyId } = useAuth();
  const cid = companyId ? String(companyId) : null;
  return useQuery({
    queryKey: ["assignments-form-options", cid],
    queryFn: async (): Promise<AssignmentsFormOptions> => {
      const res = await fetch(`/api/company/${cid}/assignments/form-options`, {
        credentials: "include",
      });
      if (!res.ok) return { assets: [], drivers: [] };
      return (await res.json()) as AssignmentsFormOptions;
    },
    enabled: !!cid,
    staleTime: 5 * 60_000,
  });
}
