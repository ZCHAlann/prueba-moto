export type DashboardTone = "emerald" | "amber" | "rose" | "sky";

export type KpiCard = {
  label: string;
  value: string;
  detail: string;
  tone: DashboardTone;
  href?: string;
};

export type ActivityItem = {
  title: string;
  description: string;
  time: string;
  tone: DashboardTone;
};

export type AlertItem = {
  title: string;
  description: string;
  severity: "Alta" | "Media" | "Baja";
  time: string;
};

export type MaintenanceItem = {
  asset: string;
  service: string;
  date: string;
  status: string;
};
