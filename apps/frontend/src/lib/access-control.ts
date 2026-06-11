import type { NavigationSection } from "../lib/navigation";
import type { MasterNavItem } from "../lib/master-navigation";
import type { PlatformRole } from "../types/platform";

/* ── Mapeo: ruta → [módulo, submódulo] para chequear permisos granulares ── */

type ModuleSub = [string, string];

const HREF_TO_MODULE_SUB: Array<{ test: (h: string) => boolean; mod: string; sub: string }> = [
  // ── Sub-routes FIRST (most specific wins via find — first match wins) ─────────
  // A/C sub-routes
  { test: (h) => h === "/aires-acondicionados/mantenimientos",                                             mod: "ac", sub: "mantenimientos_ac" },
  // Mantenimiento sub-routes
  { test: (h) => h === "/mantenimiento/inventario",                                                         mod: "mantenimiento", sub: "inventario" },
  { test: (h) => h === "/mantenimiento/verificacion-aceite",                                              mod: "mantenimiento", sub: "oil" },
  // Motores sub-routes
  { test: (h) => h === "/motores/mantenimientos",                                                          mod: "motores", sub: "mantenimientos_motor" },
  { test: (h) => h === "/motores/historial",                                                               mod: "motores", sub: "historial_motor" },
  // ── Parent / catch-all routes ──────────────────────────────────────────────────
  { test: (h) => h === "/dashboard" || h.startsWith("/dashboard"),                                        mod: "dashboard",     sub: "dashboard" },
  { test: (h) => h === "/flotas" || h.startsWith("/flotas"),                                              mod: "gestion",       sub: "flotas" },
  { test: (h) => h.startsWith("/operaciones/conductores"),                                                 mod: "gestion",       sub: "conductores" },
  { test: (h) => h.startsWith("/operaciones/asignaciones"),                                                 mod: "gestion",       sub: "asignaciones" },
  { test: (h) => h.startsWith("/gestion/sedes"),                                                          mod: "gestion",       sub: "sedes" },
  { test: (h) => h.startsWith("/gestion/garajes"),                                                        mod: "gestion",       sub: "garajes" },
  { test: (h) => h.startsWith("/gestion/seguros"),                                                        mod: "gestion",       sub: "seguros" },
  { test: (h) => h === "/motores" || h.startsWith("/motores"),                                            mod: "motores",       sub: "lista_motores" },
  { test: (h) => h === "/generadores" || h.startsWith("/generadores"),                                    mod: "generadores",   sub: "generadores" },
  { test: (h) => h === "/aires-acondicionados" || h.startsWith("/aires-acondicionados"),                  mod: "ac",            sub: "lista_ac" },
  { test: (h) => h === "/mantenimiento" || h.startsWith("/mantenimiento"),                                 mod: "mantenimiento", sub: "ordenes" },
  { test: (h) => h === "/checklist" || h.startsWith("/checklist"),                                        mod: "checklist",     sub: "checklist" },
  { test: (h) => h === "/alertas" || h.startsWith("/alertas"),                                             mod: "alertas",       sub: "alertas" },
  { test: (h) => h === "/reportes" || h.startsWith("/reportes"),                                          mod: "reportes",      sub: "reportes" },
  { test: (h) => h === "/combustible" || h.startsWith("/combustible"),                                    mod: "combustible",   sub: "combustible" },
  { test: (h) => h === "/geolocalizacion" || h.startsWith("/geolocalizacion"),                            mod: "geolocalizacion", sub: "geolocalizacion" },
  { test: (h) => h === "/accesos" || h.startsWith("/accesos/"),                                            mod: "accesos",       sub: "accesos" },
  { test: (h) => h === "/soporte" || h.startsWith("/soporte"),                                            mod: "soporte",       sub: "soporte" },
];

function resolveModuleSub(href: string): ModuleSub | null {
  const m = HREF_TO_MODULE_SUB.find((r) => r.test(href));
  return m ? [m.mod, m.sub] : null;
}

function hasVer(
  modulePermissions: Record<string, Record<string, string[]>>,
  mod: string,
  sub: string,
): boolean {
  const acts = modulePermissions?.[mod]?.[sub];
  return Array.isArray(acts) && acts.includes("ver");
}

function canAccessItem(
  role: PlatformRole,
  href: string,
  modulePermissions: Record<string, Record<string, string[]>>,
): boolean {
  if (isCompanyAdminRole(role)) return true;

  const ms = resolveModuleSub(href);
  if (!ms) return true; // ruta sin módulo asociado (ej. /perfil) — pasa
  return hasVer(modulePermissions, ms[0], ms[1]);
}

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
    roles: [...companyAdminRoles, "supervisor", "operador"],
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
// Keys deben coincidir exactamente con las keys de MODULE_TREE (module-tree.ts)
const SECTION_MODULE_MAP: Record<string, string[]> = {
  "dashboard":       ["dashboard"],
  "accesos":         ["accesos"],
  "gestion":          ["gestion"],
  "motores":          ["motores"],
  "generadores":      ["generadores"],
  "ac":               ["ac"],                        // "aires acondicionados" en navigation → "ac" en MODULE_TREE
  "mantenimiento":    ["mantenimiento"],
  "checklist":        ["checklist"],
  "alertas":          ["alertas"],
  "reportes":         ["reportes"],
  "combustible":      ["combustible"],
  "geolocalizacion":  ["geolocalizacion"],
  "soporte":          ["soporte"],
  "autorizaciones":   ["autorizaciones"],
  "cuenta":           [],
};

const ADMIN_ROLES = ["superadmin", "owner_empresa", "admin_empresa"];
const ALWAYS_VISIBLE = ["dashboard", "cuenta"];
const ALWAYS_VISIBLE_ADMIN = ["dashboard", "cuenta", "accesos"];

// Hrefs que solo deben mostrarse a admins_empresa / owner_empresa / superadmin
const ADMIN_ONLY_HREFS = new Set<string>([
  "/configuracion",
]);

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
      // 1) Filtrar items por permisos granulares (no por role)
      //    y, si el item es admin-only, por rol
      const filteredItems = section.items.filter((item) => {
        if (ADMIN_ONLY_HREFS.has(item.href) && !isAdmin) return false;
        return canAccessItem(role, item.href, modulePermissions);
      });
      const sectionKey = section.label.toLowerCase().replace(/[\s/]+/g, "_");

      // Superadmin ve todo
      if (role === "superadmin") {
        return { ...section, items: filteredItems };
      }

      // Secciones siempre visibles para su rol
      const alwaysVisible = isAdmin ? ALWAYS_VISIBLE_ADMIN : ALWAYS_VISIBLE;
      if (alwaysVisible.includes(sectionKey)) {
        return { ...section, items: filteredItems };
      }

      // Si ningún item del bloque quedó visible, ocultar la sección
      if (filteredItems.length === 0) {
        return { ...section, items: [] };
      }

      // Compat: admins de empresa también pasan por aquí
      if (isAdmin) {
        const hasModule  = (SECTION_MODULE_MAP[sectionKey] ?? []).some((key) =>
          companyModules.includes(key),
        );
        if (!hasModule) return { ...section, items: [] };
      }

      return { ...section, items: filteredItems };
    })
    .filter((section) => section.items.length > 0);
}

/* ── Guard: chequea si el role + permisos granulares permiten acceder a un href ── */
export function canAccessHref(
  role: PlatformRole | null,
  href: string,
  modulePermissions: Record<string, Record<string, string[]>> = {},
): boolean {
  if (!role) return false;
  if (isPublicPath(href)) return true;
  if (!canAccessPath(role, href)) return false;
  if (isCompanyAdminRole(role)) return true;
  return canAccessItem(role, href, modulePermissions);
}

function isCompanyAdminRole(role: PlatformRole): boolean {
  return ADMIN_ROLES.includes(role);
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