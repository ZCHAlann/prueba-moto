import type {
  BillingStatus,
  CompanyPlanId,
  CompanyStatus,
  LeadStatus,
  PlatformCompany,
  PlatformModule,
  PlatformPlan,
  PlatformRole,
  PlatformUserStatus,
} from "@/types/platform";

export const leadStatusOptions: { value: LeadStatus; label: string }[] = [
  { value: "nuevo", label: "Nuevo" },
  { value: "contactado", label: "Contactado" },
  { value: "demo agendada", label: "Demo agendada" },
  { value: "propuesta enviada", label: "Propuesta enviada" },
  { value: "ganado", label: "Ganado" },
  { value: "perdido", label: "Perdido" },
];

export const companyStatusOptions: { value: CompanyStatus; label: string }[] = [
  { value: "Activa", label: "Activa" },
  { value: "Prospecto", label: "Prospecto" },
  { value: "Inactiva", label: "Inactiva" },
];

export const billingStatusOptions: { value: BillingStatus; label: string }[] = [
  { value: "Al dia", label: "Al dia" },
  { value: "Pendiente", label: "Pendiente" },
  { value: "Vencido", label: "Vencido" },
];

export const planOptions: { value: CompanyPlanId; label: string }[] = [
  { value: "basic", label: "Basico" },
  { value: "pro", label: "Pro" },
  { value: "enterprise", label: "Enterprise" },
];

export const userStatusOptions: { value: PlatformUserStatus; label: string }[] = [
  { value: "Activo", label: "Activo" },
  { value: "Invitado", label: "Invitado" },
  { value: "Suspendido", label: "Suspendido" },
];

export const industryOptions = [
  "Logistica y distribucion",
  "Proveedor de internet",
  "Transporte terrestre",
  "Energia y respaldo critico",
  "Renta de equipos",
  "Servicios de campo",
  "Taller y mantenimiento",
];

export const roleLabelMap: Record<PlatformRole, string> = {
  superadmin: "Administrador master",
  admin_saas: "Administrador de plataforma",
  comercial: "Comercial",
  soporte: "Soporte",
  owner_empresa: "Propietario de empresa",
  admin_empresa: "Administrador de empresa",
  conductor: "Conductor",
  operador: "Operador",
  supervisor: "Supervisor",
};

export const roleGroupMap: Record<PlatformRole, "Plataforma" | "Operacion"> = {
  superadmin: "Plataforma",
  admin_saas: "Plataforma",
  comercial: "Plataforma",
  soporte: "Plataforma",
  owner_empresa: "Operacion",
  admin_empresa: "Operacion",
  conductor: "Operacion",
  operador: "Operacion",
  supervisor: "Operacion",
};

export const MASTER_CACHE_BUST = "20260423master";

export function withMasterCacheBust(href: string) {
  if (!href.startsWith("/master")) {
    return href;
  }

  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}v=${MASTER_CACHE_BUST}`;
}

export const platformRoleGroups = {
  plataforma: ["superadmin", "admin_saas", "comercial", "soporte"] as PlatformRole[],
  operacion: ["owner_empresa", "admin_empresa", "conductor", "operador", "supervisor"] as PlatformRole[],
};

export function getCompanyName(companies: PlatformCompany[], companyId: string | null) {
  if (!companyId) {
    return "Plataforma";
  }

  return companies.find((company) => company.id === companyId)?.name ?? "Sin empresa";
}

export function getPlanName(plans: PlatformPlan[], planId: CompanyPlanId) {
  return plans.find((plan) => plan.id === planId)?.name ?? planId;
}

export function getModuleName(modules: PlatformModule[], key: string) {
  return modules.find((module) => module.key === key)?.name ?? key;
}

export function normalizeValue(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function matchCompanyToTenant(tenantName: string, companies: PlatformCompany[]) {
  const tenantKey = normalizeValue(tenantName);
  return (
    companies.find((company) => normalizeValue(company.name) === tenantKey) ??
    companies.find(
      (company) =>
        normalizeValue(company.name).includes(tenantKey) ||
        tenantKey.includes(normalizeValue(company.name))
    ) ??
    null
  );
}

export function toSlug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
