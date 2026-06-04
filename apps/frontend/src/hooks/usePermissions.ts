import { useAuth } from "../context/AuthContext";
import type { ActionKey, PermissionMap } from "../lib/module-tree";

const ADMIN_ROLES = ["owner_empresa", "admin_empresa", "superadmin"];

export function usePermissions() {
  const { session } = useAuth();

  function can(module: string, submodule: string, action: ActionKey): boolean {
    if (!session) return false;

    if (ADMIN_ROLES.includes(session.role)) {
      return (
        session.companyModules.includes(module) ||
        ["dashboard", "cuenta", "accesos"].includes(module)
      );
    }

    const perms = session.modulePermissions as unknown as PermissionMap;
    const subPerms = perms[module]?.[submodule] ?? [];
    return subPerms.includes(action);
  }

  function canSeeModule(module: string): boolean {
    if (!session) return false;

    if (ADMIN_ROLES.includes(session.role)) {
      return (
        session.companyModules.includes(module) ||
        ["dashboard", "cuenta", "accesos"].includes(module)
      );
    }

    const perms = session.modulePermissions as unknown as PermissionMap;
    const modulePerm = perms[module] ?? {};
    return Object.values(modulePerm).some((actions) =>
      actions.includes("ver")
    );
  }

  function actionsFor(module: string, submodule: string): ActionKey[] {
    if (!session) return [];

    if (ADMIN_ROLES.includes(session.role)) {
      return ["ver", "crear", "editar", "eliminar"];
    }

    const perms = session.modulePermissions as unknown as PermissionMap;
    return (perms[module]?.[submodule] ?? []) as ActionKey[];
  }

  return { can, canSeeModule, actionsFor };
}