import type { AuthSession } from "@/context/AuthContext";
import type { ActionKey } from "@/lib/module-tree";

const BYPASS_ROLES = ["superadmin", "owner_empresa", "admin_empresa"] as const;

/**
 * Verifica si la sesión activa tiene permiso para una acción concreta.
 *
 * Uso:
 *   const canDelete = can(session, "gestion", "flotas", "eliminar");
 */
export function can(
  session: AuthSession | null,
  module: string,
  submodule: string,
  action: ActionKey,
): boolean {
  if (!session) return false;
  if ((BYPASS_ROLES as readonly string[]).includes(session.role)) return true;
  return session.permissions?.[module]?.[submodule]?.includes(action) ?? false;
}

/**
 * Verifica si tiene acceso de lectura a un módulo completo
 * (útil para mostrar/ocultar items del sidebar).
 */
export function canViewModule(session: AuthSession | null, module: string): boolean {
  if (!session) return false;
  if ((BYPASS_ROLES as readonly string[]).includes(session.role)) return true;
  const submodules = session.permissions?.[module];
  if (!submodules) return false;
  return Object.values(submodules).some((actions) => actions.includes("ver"));
}