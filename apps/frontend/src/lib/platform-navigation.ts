import type { NavigationSection } from "./navigation";

export const platformNavigationSections: NavigationSection[] = [
  {
    label: "Dashboard",
    icon: "DB",
    description: "Vision general del producto",
    accent: "emerald",
    items: [
      {
        label: "Dashboard",
        href: "/platform/dashboard",
        icon: "DB",
        description: "Vision general del producto",
        accent: "emerald",
      },
    ],
  },
  {
    label: "Panel master",
    icon: "EM",
    description: "Administracion global",
    accent: "sky",
    items: [
      { label: "Empresas",          href: "/platform/companies", icon: "EM",  description: "Clientes, planes y modulos activos",  accent: "sky" },
      { label: "Planes",            href: "/platform/plans",     icon: "PL",  description: "Oferta comercial y limites",           accent: "sky" },
      { label: "Módulos",           href: "/platform/modules",   icon: "MD",  description: "Habilitacion por empresa",             accent: "sky" },
      { label: "Usuarios globales", href: "/platform/users",     icon: "US",  description: "Roles y accesos de plataforma",        accent: "sky" },
      { label: "Soporte",           href: "/platform/tickets",   icon: "TK",  description: "Gestión de tickets de soporte",        accent: "sky" },
      { label: "Auditoría",         href: "/platform/audit",     icon: "AU",  description: "Logs y trazabilidad",                  accent: "sky" },
      { label: "Configuración",     href: "/platform/settings",  icon: "CF",  description: "Branding e integraciones",             accent: "sky" },
    ],
  },
  {
    label: "Comercial",
    icon: "CRM",
    description: "Pipeline y clientes",
    accent: "amber",
    items: [
      { label: "CRM",         href: "/platform/crm",     icon: "CRM", description: "Embudo y seguimiento",                accent: "amber" },
      { label: "Facturación", href: "/platform/billing", icon: "FC",  description: "Renovaciones y pagos",                accent: "amber" },
    ],
  },
  {
    label: "Flota y equipos",
    icon: "FL",
    description: "Activos fisicos",
    accent: "orange",
    items: [
      { label: "Flotas",      href: "/platform/fleet",      icon: "FL", description: "Vehiculos operativos por empresa", accent: "orange" },
      { label: "Generadores", href: "/platform/generators", icon: "GE", description: "Equipos de respaldo electrico",    accent: "orange" },
    ],
  },
  {
    label: "Geolocalizacion",
    icon: "GL",
    description: "Ubicacion operativa y monitoreo",
    accent: "teal",
    items: [
      {
        label: "Geolocalizacion",
        href: "/geolocalizacion",
        icon: "GL",
        description: "Vista de unidades y zonas activas",
        accent: "teal",
      },
    ],
  }
  
];