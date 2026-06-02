import type { PlatformRole } from "@/types/platform";

export type CustomerAccessTier = Extract<
  PlatformRole,
  "owner_empresa" | "admin_empresa" | "supervisor" | "operador" | "conductor"
>;

export type CustomerRoleTemplate = {
  id: string;
  name: string;
  description: string;
  accessTier: CustomerAccessTier;
  focusModules: string[];
  summary: string;
};

export const customerRoleTemplates: CustomerRoleTemplate[] = [
  {
    id: "cli-supervisor",
    name: "Supervisor",
    description: "Supervisa garajes, responsables, disponibilidad de unidades y actividades operativas por sede.",
    accessTier: "supervisor",
    focusModules: ["Dashboard", "Garajes", "Flotas", "Conductores", "Reportes"],
    summary: "Perfil de supervision general para controlar garajes, flota y operacion diaria.",
  },
  {
    id: "cli-tecnico-ac",
    name: "Tecnico A/C",
    description: "Gestiona equipos de aire acondicionado, evidencias, mantenimientos y reportes tecnicos.",
    accessTier: "operador",
    focusModules: ["Aires acondicionados", "Mantenimiento", "Checklist", "Reportes"],
    summary: "Perfil tecnico para equipos A/C con acceso operativo controlado.",
  },
  {
    id: "cli-gerente",
    name: "Gerente",
    description: "Control ejecutivo sobre la operación, KPIs, configuración y decisiones por sede.",
    accessTier: "owner_empresa",
    focusModules: ["Dashboard", "Reportes", "Configuración", "Flotas", "Mantenimiento"],
    summary: "Perfil de dirección con visibilidad completa y control general de la empresa.",
  },
  {
    id: "cli-supervisor-mantenimiento",
    name: "Supervisor de Mantenimiento",
    description: "Coordina taller, órdenes, checklist técnico, alertas y seguimiento diario.",
    accessTier: "supervisor",
    focusModules: ["Mantenimiento", "Checklist", "Alertas", "Reportes", "Inventario"],
    summary: "Perfil de supervisión técnica y control operativo de mantenimiento.",
  },
  {
    id: "cli-tecnico-mantenimiento",
    name: "Técnico de Mantenimiento Preventivo / Correctivo",
    description: "Ejecuta trabajos, registra novedades, checklist y seguimiento de unidades o equipos.",
    accessTier: "operador",
    focusModules: ["Mantenimiento", "Checklist", "Alertas", "Geolocalización"],
    summary: "Perfil de ejecución en campo o taller con acceso controlado.",
  },
  {
    id: "cli-ingeniero-mantenimiento",
    name: "Ingeniero de Mantenimiento / Mantenimiento Predictivo",
    description: "Analiza criticidad, tendencias, eventos técnicos y soporta decisiones de mantenimiento.",
    accessTier: "supervisor",
    focusModules: ["Motores", "Generadores", "Mantenimiento", "Reportes", "Alertas"],
    summary: "Perfil técnico avanzado con foco en análisis y continuidad operativa.",
  },
  {
    id: "cli-planificador",
    name: "Planificador de Mantenimiento",
    description: "Programa ventanas de servicio, asigna responsables y controla vencimientos.",
    accessTier: "supervisor",
    focusModules: ["Mantenimiento", "Reportes", "Alertas", "Combustible"],
    summary: "Perfil orientado a planificación y orden de cargas de trabajo.",
  },
  {
    id: "cli-almacenero",
    name: "Almacenero o Encargado de Repuestos",
    description: "Controla stock, entradas, salidas y soporte al mantenimiento desde inventario.",
    accessTier: "operador",
    focusModules: ["Inventario", "Mantenimiento", "Reportes"],
    summary: "Perfil de apoyo logístico con foco en repuestos y abastecimiento técnico.",
  },
  {
    id: "cli-administrativo",
    name: "Personal Administrativo",
    description: "Gestiona usuarios, soporte documental, reportes y configuración base de la empresa.",
    accessTier: "admin_empresa",
    focusModules: ["Accesos", "Configuración", "Reportes", "Seguros"],
    summary: "Perfil administrativo para soporte de gestión y control documental.",
  },
  {
    id: "cli-conductor",
    name: "Conductor",
    description: "Registra checklist, novedades, alertas y evidencias asociadas a su operación diaria.",
    accessTier: "conductor",
    focusModules: ["Dashboard", "Checklist", "Alertas", "Reportes", "Geolocalización"],
    summary: "Perfil de conductor con acceso limitado a inspecciones, novedades, alertas y su cuenta personal.",
  },
  {
    id: "cli-auxiliares",
    name: "Auxiliares o Ayudantes de Mantenimiento",
    description: "Apoya tareas operativas, checklist y registro básico de novedades en campo.",
    accessTier: "operador",
    focusModules: ["Checklist", "Mantenimiento", "Alertas"],
    summary: "Perfil de apoyo operativo con acceso acotado para ejecución diaria.",
  },
];

export const customerRoleOptions = customerRoleTemplates.map((role) => ({
  value: role.name,
  label: role.name,
}));

export const customerAccessTierLabels: Record<CustomerAccessTier, string> = {
  owner_empresa: "Control ejecutivo total",
  admin_empresa: "Administración y configuración",
  supervisor: "Supervisión operativa",
  conductor: "Conductor",
  operador: "Ejecución controlada",
};

function normalizeRoleName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function getCustomerRoleTemplate(roleName: string) {
  const normalizedRoleName = normalizeRoleName(roleName);
  return (
    customerRoleTemplates.find((role) => normalizeRoleName(role.name) === normalizedRoleName) ??
    customerRoleTemplates[0]
  );
}
