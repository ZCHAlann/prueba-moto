"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/providers/auth-provider";
import type { Permission, UserRole } from "@/types/fleet";

/* ─── Permisos por rol ───────────────────────────────────────────────────── */
const rolePermissions: Record<UserRole, Permission[]> = {
  admin: [
    "assets.manage",
    "drivers.manage",
    "assignments.manage",
    "maintenance.manage",
    "checklists.manage",
    "alerts.manage",
    "reports.export",
    "fuel.manage",
    "inventory.manage",
    "garages.manage",
    "ac.manage",
    "settings.manage",
  ],
  operaciones: [
    "assets.manage",
    "drivers.manage",
    "assignments.manage",
    "maintenance.manage",
    "checklists.manage",
    "alerts.manage",
    "reports.export",
    "fuel.manage",
    "garages.manage",
    "ac.manage",
  ],
  mantenimiento: [
    "assets.manage",
    "maintenance.manage",
    "checklists.manage",
    "alerts.manage",
    "inventory.manage",
    "garages.manage",
    "ac.manage",
    "reports.export",
  ],
  consulta: [
    "reports.export",
    "checklists.manage",
    "alerts.manage",
  ],
};

function mapRoleToFleetRole(role: string): UserRole {
  switch (role) {
    case "owner_empresa":
    case "admin_empresa":
    case "superadmin":
      return "admin";
    case "supervisor":
      return "operaciones";
    case "operador":
      return "mantenimiento";
    case "conductor":
      return "consulta";
    default:
      return "consulta";
  }
}

/* ─── Context ────────────────────────────────────────────────────────────── */
type FleetOpsContextValue = {
  ready: boolean;
  currentTenantId: string | null;
  can: (permission: Permission) => boolean;
};

const FleetOpsContext = createContext<FleetOpsContextValue | null>(null);

/* ─── Provider ───────────────────────────────────────────────────────────── */
export function FleetOpsProvider({ children }: { children: ReactNode }) {
  const { session, ready } = useAuth();

  const currentTenantId = session?.companyId ?? null;
  const fleetRole = mapRoleToFleetRole(session?.role ?? "");

  const can = useCallback(
    (permission: Permission) => {
      return rolePermissions[fleetRole]?.includes(permission) ?? false;
    },
    [fleetRole]
  );

  const value = useMemo<FleetOpsContextValue>(
    () => ({
      ready,
      currentTenantId,
      can,
    }),
    [ready, currentTenantId, can]
  );

  return (
    <FleetOpsContext.Provider value={value}>
      {children}
    </FleetOpsContext.Provider>
  );
}

export function useFleetOps() {
  const context = useContext(FleetOpsContext);
  if (!context) throw new Error("useFleetOps must be used within FleetOpsProvider");
  return context;
}