import type { NavigationSection } from "../lib/navigation";
import type { MasterNavItem } from "../lib/master-navigation";
import { MODULE_TREE } from "../lib/module-tree";
import type { PlatformRole } from "../types/platform";

/* ── Mapeo: ruta → [módulo, submódulo] para chequear permisos granulares ── */

type ModuleSub = [string, string];

const HREF_TO_MODULE_SUB: Array<{ test: (h: string) => boolean; mod: string; sub: string }> = [
  // ── Sub-routes FIRST (most specific wins via find — first match wins) ─────────
  // A/C sub-routes
  { test: (h) => h === "/aires-acondicionados/mantenimientos",                                             mod: "ac", sub: "mantenimientos_ac" },
  // Mantenimiento sub-routes
  { test: (h) => h === "/mantenimiento/inventario",                                                         mod: "mantenimiento", sub: "inventario" },
  // Motores sub-routes
  { test: (h) => h === "/motores/historial",                                                               mod: "motores", sub: "historial_motor" },
  // ── Parent / catch-all routes ──────────────────────────────────────────────────
  { test: (h) => h === "/dashboard" || h.startsWith("/dashboard"),                                        mod: "dashboard",     sub: "dashboard" },
  { test: (h) => h === "/flotas" || h.startsWith("/flotas"),                                              mod: "gestion",       sub: "flotas" },
  { test: (h) => h.startsWith("/operaciones/conductores"),                                                 mod: "gestion",       sub: "conductores" },
  { test: (h) => h.startsWith("/operaciones/asignaciones"),                                                 mod: "gestion",       sub: "asignaciones" },
  { test: (h) => h.startsWith("/gestion/sedes"),                                                          mod: "gestion",       sub: "sedes" },
  { test: (h) => h.startsWith("/gestion/garajes"),                                                        mod: "gestion",       sub: "garajes" },
  { test: (h) => h.startsWith("/gestion/seguros"),                                                        mod: "gestion",       sub: "seguros" },
  { test: (h) => h.startsWith("/gestion/talleres"),                                                       mod: "gestion",       sub: "talleres" },
  { test: (h) => h.startsWith("/gestion/proveedores"),                                                    mod: "gestion",       sub: "proveedores" },
  { test: (h) => h === "/motores" || h.startsWith("/motores"),                                            mod: "motores",       sub: "lista_motores" },
  { test: (h) => h === "/generadores" || h.startsWith("/generadores"),                                    mod: "generadores",   sub: "generadores" },
  { test: (h) => h === "/aires-acondicionados" || h.startsWith("/aires-acondicionados"),                  mod: "ac",            sub: "lista_ac" },
  { test: (h) => h === "/mantenimiento" || h.startsWith("/mantenimiento"),                                 mod: "mantenimiento", sub: "agenda" },
  { test: (h) => h === "/checklist" || h.startsWith("/checklist"),                                        mod: "checklist",     sub: "checklist" },
  { test: (h) => h === "/alertas" || h.startsWith("/alertas"),                                             mod: "alertas",       sub: "alertas" },
  { test: (h) => h === "/reportes" || h.startsWith("/reportes"),                                          mod: "reportes",      sub: "reportes" },
  // Lienzo — módulo top-level (migrado desde `reportes.lienzo` en jun 2026)
  { test: (h) => h === "/lienzo" || h.startsWith("/lienzo"),                                              mod: "lienzo",        sub: "lienzo" },
  { test: (h) => h === "/combustible" || h.startsWith("/combustible"),                                    mod: "combustible",   sub: "combustible" },
  { test: (h) => h === "/peajes"      || h.startsWith("/peajes"),                                         mod: "peajes",        sub: "peajes"      },
  { test: (h) => h === "/geolocalizacion" || h.startsWith("/geolocalizacion"),                            mod: "geolocalizacion", sub: "geolocalizacion" },
  { test: (h) => h === "/autorizaciones" || h.startsWith("/autorizaciones"),                              mod: "autorizaciones", sub: "autorizaciones" },
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

  // /dashboard es especial: sus permisos viven en submódulos
  // (kpis_*, chart_*, feed_*, etc.). El user accede a /dashboard si
  // tiene AL MENOS UN submódulo REAL del dashboard con permiso "ver".
  // (No se considera el placeholder `dashboard.dashboard` que algunos
  //  roles legacy usan para activar el módulo genérico.)
  if (href === "/dashboard" || href.startsWith("/dashboard/")) {
    return hasAnyDashboardSubmoduleVer(modulePermissions);
  }

  const ms = resolveModuleSub(href);
  if (!ms) return true; // ruta sin módulo asociado (ej. /perfil) — pasa

  // /mantenimiento es también un módulo "agregado": el operador debe
  // poder ver la entrada del sidebar con que tenga permiso de ver en
  // AL MENOS UN submódulo (agenda / execution / records). El mapeo
  // del href solo conoce "agenda" — no queremos que el sidebar
  // desaparezca porque el operador solo tiene "execution.ver".
  if (ms[0] === "mantenimiento") {
    return hasAnyMantenimientoSubmoduleVer(modulePermissions);
  }

  return hasVer(modulePermissions, ms[0], ms[1]);
}

/** True si el user tiene AL MENOS UN submódulo de mantenimiento con "ver". */
function hasAnyMantenimientoSubmoduleVer(
  modulePermissions: Record<string, Record<string, string[]>>,
): boolean {
  const mantPerms = modulePermissions?.mantenimiento ?? {};
  return Object.values(mantPerms).some(
    (acts) => Array.isArray(acts) && acts.includes("ver"),
  );
}

/** True si el user tiene AL MENOS UN submódulo real del dashboard con "ver". */
function hasAnyDashboardSubmoduleVer(
  modulePermissions: Record<string, Record<string, string[]>>,
): boolean {
  const dashboardPerms = modulePermissions?.dashboard ?? {};
  const realSubs = Object.keys(MODULE_TREE.dashboard.submodules);
  return realSubs.some(
    (sub) => Array.isArray(dashboardPerms[sub]) && dashboardPerms[sub].includes("ver"),
  );
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
  "peajes",
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
      pathname.startsWith("/gestion/talleres") ||
      pathname.startsWith("/gestion/proveedores"),
    roles: [...companyAdminRoles, "supervisor", "operador"],
  },
  {
    test: (pathname) =>
      pathname.startsWith("/gestion/seguros") ||
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
      pathname.startsWith("/lienzo") ||
      pathname.startsWith("/combustible") ||
      pathname.startsWith("/peajes") ||
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

/**
 * Devuelve la ruta a la que el usuario debe ir al iniciar sesión, elegida
 * por orden de prioridad según sus permisos reales:
 *
 *   1. Lista de prioridad del rol (los conductores priorizan "autorizaciones",
 *      los demás priorizan "dashboard").
 *   2. Si ninguno de los prioritarios está permitido, el primer módulo
 *      al que el usuario tenga acceso, en el orden del MODULE_TREE.
 *   3. Si no tiene permiso a nada, devuelve "/signin" (forzará re-login).
 *
 * @param session  sesión actual con `role`, `modulePermissions` y
 *                 `companyModules` (no se usa `companyAdminRole` corto-circuito
 *                 porque aquí queremos evaluar permisos reales granulares).
 */
export function getDefaultRouteForSession(session: {
  role: PlatformRole;
  modulePermissions: Record<string, Record<string, string[]>>;
  companyModules: string[];
} | null): string {
  if (!session) return "/signin";

  // Si la sesión es de un admin/owner de empresa, saltamos a dashboard
  // (siempre tienen acceso total).
  if (isCompanyAdminRole(session.role)) {
    return "/dashboard";
  }

  // 1) Prioridades por rol
  const rolePriority: Record<string, string[]> = {
    conductor:  ["/autorizaciones", "/dashboard", "/perfil"],
    supervisor: ["/dashboard", "/autorizaciones", "/perfil"],
    operador:   ["/dashboard", "/autorizaciones", "/perfil"],
  };
  const priority = rolePriority[session.role];
  if (priority) {
    for (const href of priority) {
      if (canAccessHref(session.role, href, session.modulePermissions)) {
        return href;
      }
    }
  }

  // 2) Fallback: recorrer el MODULE_TREE en orden y devolver el primer
  //    href permitido.
  const fallbackOrder = [
    "/dashboard",
    "/autorizaciones",
    "/flotas",
    "/operaciones/conductores",
    "/operaciones/asignaciones",
    "/gestion/sedes",
    "/gestion/garajes",
    "/gestion/seguros",
    "/motores",
    "/generadores",
    "/aires-acondicionados",
    "/mantenimiento",
    "/mantenimiento/inventario",
    "/checklist",
    "/alertas",
    "/reportes",
    "/lienzo",
    "/combustible",
    "/geolocalizacion",
    "/accesos/usuarios",
    "/accesos/roles",
    "/perfil",
  ];
  for (const href of fallbackOrder) {
    if (canAccessHref(session.role, href, session.modulePermissions)) {
      return href;
    }
  }

  // 3) Sin permisos a nada — devolvemos /perfil (que siempre está
  //    permitido) en lugar de /signin para evitar el loop de redirect
  //    cuando la sesión sigue activa pero no tiene acceso a ningún
  //    módulo. La página /perfil mostrará un mensaje claro.
  return "/perfil";
}

export function canAccessPath(role: PlatformRole, pathname: string) {
  if (isPublicPath(pathname)) {
    return true;
  }

  if (isCompanyEntryPath(pathname)) {
    return isOperationalRole(role) || isUnknownOperationalRole(role) || role === "superadmin";
  }

  if (role === "superadmin") {
    return true;
  }

  if ((role === "operador" || role === "conductor") && isMutationPath(pathname)) {
    return false;
  }

  const rule = rules.find((entry) => entry.test(pathname));
  if (!rule) return false;
  // Si el role está en la lista de la regla, pasa.
  if (rule.roles.includes(role)) return true;
  // Roles personalizados (no platform, no en OPERATIONAL_ROLES) tienen scope
  // operacion; los dejamos pasar para que el gating granular de `canAccessItem`
  // decida por permisos.
  if (isUnknownOperationalRole(role) && !isPlatformRole(role)) return true;
  return false;
}

/**
 * Un role "operacional desconocido" es un string que no está en
 * OPERATIONAL_ROLES ni en PLATFORM_ROLES. En la práctica, son roles
 * personalizados creados por el admin en `company_roles`. Su scope
 * siempre es operación.
 */
function isUnknownOperationalRole(role: PlatformRole): boolean {
  return !OPERATIONAL_ROLES.includes(role) && !PLATFORM_ROLES.includes(role);
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
  "lienzo":           ["lienzo"],
  "combustible":      ["combustible"],
  "peajes":           ["peajes"],
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

      // ── "dashboard" sólo es alwaysVisible si el usuario tiene AL MENOS
      //    UN submódulo REAL del dashboard con permiso "ver" (kpis_*,
      //    chart_*, feed_*, etc.). Si no, se filtra como cualquier
      //    otra sección.
      const hasDashboardPerm = hasAnyDashboardSubmoduleVer(modulePermissions);
      const effectiveAlwaysVisible = isAdmin
        ? ALWAYS_VISIBLE_ADMIN
        : (hasDashboardPerm ? ALWAYS_VISIBLE : ALWAYS_VISIBLE.filter((k) => k !== "dashboard"));

      if (effectiveAlwaysVisible.includes(sectionKey)) {
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
  // /perfil es un recurso personal del usuario autenticado: cualquier role
  // del scope operación puede acceder (incluso roles personalizados).
  if (isPersonalProfilePath(href) && !isPlatformRole(role)) return true;
  if (!canAccessPath(role, href)) return false;
  if (isCompanyAdminRole(role)) return true;
  return canAccessItem(role, href, modulePermissions);
}

function isPersonalProfilePath(pathname: string) {
  return pathname === "/perfil" || pathname.startsWith("/perfil/");
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