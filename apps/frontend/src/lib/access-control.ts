import type { NavigationSection } from "../lib/navigation";
import type { MasterNavItem } from "../lib/master-navigation";
import type { PlatformModuleKey, PlatformRole } from "../types/platform";

export const PUBLIC_PATHS = [
  "/",
  "/login",
  "/login-directo",
  "/forgot-password",
  "/solicitar-demo",
  "/contacto",
  "/master/acceso",
  "/master/activar",
  "/master/login",
  "/master/login-directo",
  "/superadmin/login",
] as const;

export const PLATFORM_ROLES: PlatformRole[] = [
  "superadmin",
  "admin_saas",
  "comercial",
  "soporte",
];

export const OPERATIONAL_ROLES: PlatformRole[] = [
  "owner_empresa",
  "admin_empresa",
  "conductor",
  "supervisor",
  "operador",
];

type RouteRule = {
  test: (pathname: string) => boolean;
  roles: PlatformRole[];
};

type HomeMap = Record<PlatformRole, string>;

const platformFullAccess: PlatformRole[] = ["superadmin", "admin_saas"];
const platformCommercialAccess: PlatformRole[] = ["superadmin", "admin_saas", "comercial"];
const platformSupportAccess: PlatformRole[] = ["superadmin", "admin_saas", "soporte"];
const companyAdminRoles: PlatformRole[] = ["superadmin", "owner_empresa", "admin_empresa"];
const operationalManagers: PlatformRole[] = ["superadmin", "owner_empresa", "admin_empresa", "supervisor"];
const operationalViewers: PlatformRole[] = [
  "superadmin",
  "owner_empresa",
  "admin_empresa",
  "supervisor",
  "operador",
];
const driverAccess: PlatformRole[] = [
  "superadmin",
  "owner_empresa",
  "admin_empresa",
  "supervisor",
  "operador",
  "conductor",
];
const reservedTopLevelSegments = new Set([
  ...PUBLIC_PATHS.map((path) => path.replace(/^\//, "").split("/")[0]).filter(Boolean),
  "master",
  "superadmin",
  "dashboard",
  "configuracion",
  "perfil",
  "accesos",
  "gestion",
  "flotas",
  "activos",
  "motores",
  "generadores",
  "aires-acondicionados",
  "mantenimiento",
  "checklist",
  "alertas",
  "reportes",
  "combustible",
  "geolocalizacion",
  "operaciones",
  "api",
]);

const defaultHomes: HomeMap = {
  superadmin: "/master",
  admin_saas: "/master",
  comercial: "/master/crm",
  soporte: "/master/empresas",
  owner_empresa: "/dashboard",
  admin_empresa: "/dashboard",
  conductor: "/dashboard",
  supervisor: "/dashboard",
  operador: "/dashboard",
};

const rules: RouteRule[] = [
  { test: (pathname) => pathname === "/master", roles: [...PLATFORM_ROLES] },
  {
    test: (pathname) => pathname.startsWith("/master/operacion"),
    roles: [...platformFullAccess, "soporte"],
  },
  {
    test: (pathname) => pathname.startsWith("/master/configuracion"),
    roles: [...platformFullAccess],
  },
  {
    test: (pathname) => pathname.startsWith("/master/contenido"),
    roles: [...platformFullAccess],
  },
  {
    test: (pathname) =>
      pathname.startsWith("/master/planes") || pathname.startsWith("/master/modulos"),
    roles: [...platformFullAccess],
  },
  {
    test: (pathname) =>
      pathname.startsWith("/master/crm") ||
      pathname.startsWith("/master/leads") ||
      pathname.startsWith("/master/clientes") ||
      pathname.startsWith("/master/facturacion"),
    roles: [...platformCommercialAccess],
  },
  {
    test: (pathname) => pathname.startsWith("/master/pagos"),
    roles: [...platformFullAccess],
  },
  {
    test: (pathname) =>
      pathname.startsWith("/master/empresas") || pathname.startsWith("/master/usuarios"),
    roles: [...platformFullAccess, "soporte"],
  },
  {
    test: (pathname) => pathname.startsWith("/master/auditoria"),
    roles: [...platformSupportAccess],
  },
  {
    test: (pathname) =>
      pathname === "/perfil" ||
      pathname.startsWith("/perfil/"),
    roles: [
      "superadmin",
      "admin_saas",
      "comercial",
      "soporte",
      "owner_empresa",
      "admin_empresa",
      "conductor",
      "supervisor",
      "operador",
    ],
  },
  {
    test: (pathname) =>
      pathname === "/configuracion" ||
      pathname.startsWith("/configuracion/"),
    roles: [...companyAdminRoles],
  },
  {
    test: (pathname) =>
      pathname === "/accesos/roles" || pathname.startsWith("/accesos/roles/"),
    roles: [...companyAdminRoles],
  },
  {
    test: (pathname) =>
      pathname === "/accesos/usuarios" || pathname.startsWith("/accesos/usuarios/"),
    roles: [...companyAdminRoles, "supervisor"],
  },
  {
    test: (pathname) => pathname.startsWith("/gestion/sedes"),
    roles: [...companyAdminRoles],
  },
  {
    test: (pathname) =>
      pathname.startsWith("/gestion/seguros") ||
      pathname.startsWith("/gestion/tipos-aceite") ||
      pathname.startsWith("/gestion/garajes"),
    roles: [...operationalManagers],
  },
  {
    test: (pathname) =>
      pathname.startsWith("/dashboard") ||
      pathname.startsWith("/checklist") ||
      pathname.startsWith("/alertas") ||
      pathname.startsWith("/reportes/checklist") ||
      pathname.startsWith("/reportes/alertas-conductores") ||
      pathname.startsWith("/geolocalizacion"),
    roles: [...driverAccess],
  },
  {
    test: (pathname) =>
      pathname.startsWith("/flotas") ||
      pathname.startsWith("/activos") ||
      pathname.startsWith("/motores") ||
      pathname.startsWith("/generadores") ||
      pathname.startsWith("/aires-acondicionados") ||
      pathname.startsWith("/mantenimiento") ||
      pathname.startsWith("/checklist") ||
      pathname.startsWith("/alertas") ||
      pathname.startsWith("/reportes") ||
      pathname.startsWith("/combustible") ||
      pathname.startsWith("/geolocalizacion") ||
      pathname.startsWith("/operaciones") ||
      pathname.startsWith("/dashboard"),
    roles: [...operationalViewers],
  },
];

function matchPath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isMutationPath(pathname: string) {
  return (
    pathname.includes("/nuevo") ||
    pathname.endsWith("/editar") ||
    pathname.includes("/editar/") ||
    pathname.endsWith("/configuracion")
  );
}

export function isCompanyEntryPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  return segments.length === 1 && !reservedTopLevelSegments.has(segments[0]);
}

export function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.includes(pathname as (typeof PUBLIC_PATHS)[number]);
}

export function isSuperadminPath(pathname: string) {
  return pathname === "/master" || pathname.startsWith("/master/") || pathname === "/superadmin" || pathname.startsWith("/superadmin/");
}

export function isPlatformRole(role: PlatformRole) {
  return PLATFORM_ROLES.includes(role);
}

export function isOperationalRole(role: PlatformRole) {
  return OPERATIONAL_ROLES.includes(role);
}

export function getDefaultRouteForRole(role: PlatformRole) {
  return defaultHomes[role];
}

export function canAccessPath(role: PlatformRole, pathname: string) {
  if (isPublicPath(pathname)) {
    return true;
  }

  if (isCompanyEntryPath(pathname)) {
    return isOperationalRole(role) || role === "superadmin";
  }

  if (role === "superadmin") {
    return true;
  }

  if ((role === "operador" || role === "conductor") && isMutationPath(pathname)) {
    return false;
  }

  const rule = rules.find((entry) => entry.test(pathname));
  return rule ? rule.roles.includes(role) : false;
}

export function getAccessMessage(role: PlatformRole, pathname: string) {
  if (isSuperadminPath(pathname) && !isPlatformRole(role)) {
    return "Tu perfil actual pertenece a la operacion y no tiene acceso al panel master.";
  }

  if (role === "operador") {
    return "Tu perfil operador solo puede consultar y ejecutar modulos operativos limitados.";
  }

  if (role === "conductor") {
    return "Tu perfil conductor solo puede trabajar checklist, alertas, ubicacion, reportes asignados y perfil.";
  }

  if (role === "comercial") {
    return "Tu perfil comercial puede trabajar CRM, leads, clientes y facturacion, pero no la operacion diaria.";
  }

  if (role === "soporte") {
    return "Tu perfil soporte puede revisar empresas, usuarios y auditoria, pero no toda la administracion comercial.";
  }

  if (role === "admin_saas") {
    return "Tu perfil de administrador de plataforma trabaja el panel master y la configuracion general.";
  }

  return "Tu rol actual no tiene permiso para abrir esta pantalla.";
}

// Mapa explícito sectionKey → moduleKeys del JWT
const SECTION_MODULE_MAP: Record<string, string[]> = {
  "dashboard":            ["dashboard"],
  "accesos":              ["accesos"],
  "gestion":              ["gestion", "garajes", "seguros", "conductores", "activos"],
  "motores":              ["motores"],
  "generadores":          ["generadores"],
  "aires_acondicionados": ["ac"],
  "mantenimiento":        ["mantenimiento", "inventario"],
  "checklist":            ["checklist"],
  "alertas":              ["alertas"],
  "reportes":             ["reportes"],
  "combustible":          ["combustible"],
  "geolocalizacion":      ["geolocalizacion"],
  "cuenta":               [],
};

const ADMIN_ROLES = ["superadmin", "owner_empresa", "admin_empresa"];
const ALWAYS_VISIBLE = ["dashboard", "cuenta"];
const ALWAYS_VISIBLE_ADMIN = ["dashboard", "cuenta", "accesos"];

export function filterOperationalNavigation(
  sections: NavigationSection[],
  role: PlatformRole | null,
  modulePermissions: Record<string, Record<string, string[]>> = {},
  companyModules: string[] = [],
) {
  if (!role) return [];

  const isAdmin = ADMIN_ROLES.includes(role);

  return sections
    .map((section) => {
      const filteredItems = section.items.filter((item) => canAccessPath(role, item.href));
      const sectionKey = section.label.toLowerCase().replace(/[\s/]+/g, "_");

      // Superadmin ve todo
      if (role === "superadmin") {
        return { ...section, items: filteredItems };
      }

      // Secciones siempre visibles
      const alwaysVisible = isAdmin ? ALWAYS_VISIBLE_ADMIN : ALWAYS_VISIBLE;
      if (alwaysVisible.includes(sectionKey)) {
        return { ...section, items: filteredItems };
      }

      const mappedKeys = SECTION_MODULE_MAP[sectionKey] ?? [];

      if (isAdmin) {
        // Admins: mostrar si alguno de los moduleKeys está en enabledModules de la empresa
        const allowed = mappedKeys.some((key) => companyModules.includes(key));
        if (!allowed) return { ...section, items: [] };
      } else {
        // Otros roles: necesitan "ver" en al menos un submódulo del módulo
        const allowed = mappedKeys.some((key) => {
          const modulePerm = modulePermissions[key] ?? {};
          return Object.values(modulePerm).some(
            (actions) => Array.isArray(actions) && actions.includes("ver")
          );
        });
        if (!allowed) return { ...section, items: [] };
      }

      return { ...section, items: filteredItems };
    })
    .filter((section) => section.items.length > 0);
}

export function filterSuperadminNavigation(
  sections: ReadonlyArray<{ label: string; items: MasterNavItem[] }>,
  role: PlatformRole | null
) {
  if (!role) {
    return [];
  }

  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canAccessPath(role, item.href)),
    }))
    .filter((section) => section.items.length > 0);
}

export function getNearestAllowedRoute(role: PlatformRole) {
  return getDefaultRouteForRole(role);
}

export function isAllowedMenuItem(role: PlatformRole | null, href: string) {
  if (!role) {
    return false;
  }

  return canAccessPath(role, href) && !((role === "operador" || role === "conductor") && isMutationPath(href));
}

export function isAllowedCurrentPath(role: PlatformRole | null, pathname: string) {
  return role ? canAccessPath(role, pathname) : false;
}

export function matchesCurrentPath(pathname: string, href: string) {
  return matchPath(pathname, href);
}