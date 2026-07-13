import { useAuth } from "../context/AuthContext";
import type { ActionKey, PermissionMap } from "../lib/module-tree";

const ADMIN_ROLES = ["owner_empresa", "admin_empresa", "superadmin"];

/**
 * Compat shim (jun 2026): módulos que vivían como submódulo de otro y se
 * migraron a top-level. Cuando se consulta el path nuevo y no se encuentra,
 * se intenta el path viejo como fallback.
 *
 *  - `lienzo.lienzo.*` → `reportes.lienzo.*`
 */
const LEGACY_FALLBACK: Record<string, Record<string, string>> = {
  lienzo: { lienzo: "reportes.lienzo" },
};

function resolveLookup(
  module: string,
  submodule: string,
): Array<{ module: string; submodule: string }> {
  const primary = [{ module, submodule }];
  const fallback = LEGACY_FALLBACK[module]?.[submodule];
  if (fallback) {
    const [m2, s2] = fallback.split(".");
    if (m2 && s2) primary.push({ module: m2, submodule: s2 });
  }
  return primary;
}

export function usePermissions() {
  const { session } = useAuth();

  function can(module: string, submodule: string, action: ActionKey): boolean {
    if (!session) return false;

    // Admins de empresa y propietarios tienen acceso total a los módulos
    // de su compañía, sin depender de `companyModules` ni de las claves
    // exactas del JWT. El backend refuerza con `requireModule` /
    // `requireSupervisor` / `requireAdmin` donde corresponde.
    if (ADMIN_ROLES.includes(session.role)) {
      return true;
    }

    const perms = session.modulePermissions as unknown as PermissionMap;
    for (const { module: m, submodule: s } of resolveLookup(module, submodule)) {
      const subPerms = perms[m]?.[s] ?? [];
      if (subPerms.includes(action)) return true;
    }
    return false;
  }

  function canSeeModule(module: string): boolean {
    if (!session) return false;

    if (ADMIN_ROLES.includes(session.role)) {
      return true;
    }

    const perms = session.modulePermissions as unknown as PermissionMap;
    const modulePerm = perms[module] ?? {};
    // Mostrar el módulo si el usuario tiene AL MENOS una acción (de cualquier
    // tipo) en AL MENOS un submódulo. Así un Conductor con permiso
    // "checklist.inspecciones.crear" ve el módulo "checklist" sin necesidad
    // de tener explícitamente "checklist.checklist.ver" o similar.
    return Object.values(modulePerm).some((actions) =>
      Array.isArray(actions) && actions.length > 0
    );
  }

  function actionsFor(module: string, submodule: string): ActionKey[] {
    if (!session) return [];

    if (ADMIN_ROLES.includes(session.role)) {
      return ["ver", "crear", "editar", "eliminar"];
    }

    const perms = session.modulePermissions as unknown as PermissionMap;
    for (const { module: m, submodule: s } of resolveLookup(module, submodule)) {
      const acts = perms[m]?.[s];
      if (Array.isArray(acts) && acts.length > 0) return acts as ActionKey[];
    }
    return [];
  }

  return { can, canSeeModule, actionsFor };
}

/**
 * Hook de gating a nivel EMPRESA (no user).
 *
 * Devuelve helpers para chequear si un módulo está habilitado para la
 * empresa del user actual (vía `session.companyModules`). El superadmin
 * de plataforma bypassa este check (ve todo).
 *
 * Diferencia con `usePermissions`:
 *  - `usePermissions` filtra por permisos granulares del user (override
 *    per-user o heredado del rol). Sirve para "este user puede ver X".
 *  - `useCompanyModuleAccess` filtra por módulos de la empresa (lo que el
 *    owner configuró al crear/editar la empresa). Sirve para "esta
 *    empresa tiene acceso al módulo X, sin importar el user".
 *
 * Caso típico de uso: el dashboard. Si la empresa no tiene el módulo
 * "combustible" habilitado, no se muestran los KPIs/charts de combustible
 * ni siquiera para el admin.
 */
export function useCompanyModuleAccess() {
  const { session } = useAuth();
  const modules: string[] = (session?.companyModules ?? []) as string[];

  function hasModule(module: string): boolean {
    if (!session) return false;
    if (session.role === "superadmin") return true;
    return modules.includes(module);
  }

  /** Helper de batches: `hasAny(["combustible", "alertas"])`. */
  function hasAny(required: string[]): boolean {
    if (!session) return false;
    if (session.role === "superadmin") return true;
    return required.some(m => modules.includes(m));
  }

  return { hasModule, hasAny, modules };
}