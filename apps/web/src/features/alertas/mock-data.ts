import type { AlertConfig, AlertRecord } from "@/types/fleet";

export const defaultAlerts: AlertRecord[] = [];

export const defaultAlertConfigs = [
  {
    id: "cfg-001",
    tenantId: "tenant-fleetops",
    key: "maintenance-due",
    label: "Aviso de mantenimiento",
    description: "Genera alertas por vencimientos preventivos.",
    enabled: true,
  },
  {
    id: "cfg-002",
    tenantId: "tenant-fleetops",
    key: "checklist-missed",
    label: "Checklist pendiente",
    description: "Notifica checklist sin cierre por turno.",
    enabled: true,
  },
  {
    id: "cfg-003",
    tenantId: "tenant-fleetops",
    key: "asset-down",
    label: "Activo fuera de servicio",
    description: "Escala eventos con impacto operativo alto.",
    enabled: true,
  },
] satisfies AlertConfig[];
