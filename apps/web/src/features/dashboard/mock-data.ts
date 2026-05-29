import type {
  ActivityItem,
  AlertItem,
  KpiCard,
  MaintenanceItem,
} from "@/types/dashboard";

export const kpiCards = [
  {
    label: "Vehiculos",
    value: "0",
    detail: "Sin vehiculos registrados",
    tone: "emerald",
  },
  {
    label: "Mantenimientos",
    value: "0",
    detail: "Sin ordenes registradas",
    tone: "amber",
  },
  {
    label: "Alertas",
    value: "0",
    detail: "Sin alertas activas",
    tone: "rose",
  },
  {
    label: "Combustible",
    value: "0 L",
    detail: "Sin consumos registrados",
    tone: "sky",
  },
] satisfies KpiCard[];

export const activityItems: ActivityItem[] = [];

export const alertItems: AlertItem[] = [];

export const maintenanceItems: MaintenanceItem[] = [];
