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
        href: "/panel/dashboard",
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
      { label: "Empresas",          href: "/panel/companies", icon: "EM",  description: "Clientes, planes y modulos activos",  accent: "sky" },
      { label: "Planes",            href: "/panel/plans",     icon: "PL",  description: "Oferta comercial y limites",           accent: "sky" },
      { label: "Módulos",           href: "/panel/modules",   icon: "MD",  description: "Habilitacion por empresa",             accent: "sky" },
      { label: "Usuarios globales", href: "/panel/users",     icon: "US",  description: "Roles y accesos de plataforma",        accent: "sky" },
      { label: "Soporte",           href: "/panel/tickets",   icon: "TK",  description: "Gestión de tickets de soporte",        accent: "sky" },
      { label: "Auditoría",         href: "/panel/audit",     icon: "AU",  description: "Logs y trazabilidad",                  accent: "sky" },
      { label: "Configuración",     href: "/panel/settings",  icon: "CF",  description: "Branding e integraciones",             accent: "sky" },
    ],
  },
  {
    label: "Flota y equipos",
    icon: "FL",
    description: "Activos fisicos",
    accent: "orange",
    items: [
      { label: "Flotas",      href: "/panel/fleet",      icon: "FL", description: "Vehiculos operativos por empresa", accent: "orange" },
      { label: "Generadores", href: "/panel/generators", icon: "GE", description: "Equipos de respaldo electrico",    accent: "orange" },
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
        // jul 2026 v6 — antes apuntaba a /geolocalizacion (ruta de
        // operacion) que dejaba la pagina en blanco para el superadmin
        // porque no tiene empresa. Ahora apunta al placeholder de
        // plataforma.
        href: "/panel/geolocalizacion",
        icon: "GL",
        description: "Vista de unidades y zonas activas",
        accent: "teal",
      },
    ],
  }

];