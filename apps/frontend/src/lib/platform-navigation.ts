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
      { label: "Leads",       href: "/platform/leads",   icon: "LD",  description: "Solicitudes de demo y oportunidades", accent: "amber" },
      { label: "Clientes",    href: "/platform/clients", icon: "CL",  description: "Cartera activa",                      accent: "amber" },
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
      { label: "Motores",     href: "/platform/motors",     icon: "MT", description: "Inventario tecnico de motores",    accent: "orange" },
      { label: "Generadores", href: "/platform/generators", icon: "GE", description: "Equipos de respaldo electrico",    accent: "orange" },
    ],
  },
  {
    label: "Personal y operación",
    icon: "CD",
    description: "Quien opera que",
    accent: "teal",
    items: [
      { label: "Conductores",  href: "/platform/drivers",     icon: "CD", description: "Licencias, estado y disponibilidad", accent: "teal" },
      { label: "Asignaciones", href: "/platform/assignments", icon: "AS", description: "Vehiculo asignado por conductor",     accent: "teal" },
      { label: "Sedes",        href: "/platform/sites",       icon: "SD", description: "Bases, patios y plantas",             accent: "teal" },
    ],
  },
  {
    label: "Mantenimiento",
    icon: "MN",
    description: "Taller y stock",
    accent: "amber",
    items: [
      { label: "Preventivo / correctivo", href: "/platform/maintenance", icon: "MN", description: "OT, fechas y responsables", accent: "amber" },
      { label: "Inventario",              href: "/platform/inventory",   icon: "IV", description: "Repuestos y stock minimo",   accent: "amber" },
      { label: "Checklist",               href: "/platform/checklist",   icon: "CK", description: "Inspecciones operativas",    accent: "amber" },
    ],
  },
  {
    label: "Seguimiento",
    icon: "AL",
    description: "Monitoreo y control",
    accent: "rose",
    items: [
      { label: "Alertas",         href: "/platform/alerts",      icon: "AL", description: "Criticidad y seguimiento",  accent: "rose" },
      { label: "Reportes",        href: "/platform/reports",     icon: "RP", description: "Reportes y exportaciones",  accent: "rose" },
      { label: "Combustible",     href: "/platform/fuel",        icon: "CB", description: "Consumo y rendimiento",     accent: "rose" },
      { label: "Geolocalización", href: "/platform/geolocation", icon: "GL", description: "Mapa y unidades activas",   accent: "rose" },
      { label: "Seguros",         href: "/platform/insurance",   icon: "SG", description: "Polizas y vencimientos",    accent: "rose" },
    ],
  },
];