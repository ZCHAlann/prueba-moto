import type { AuthSession } from "@/context/AuthContext";
import type { ActionKey } from "@/lib/module-tree";

/**
 * Roles que tienen bypass automático de permisos granulares.
 *
 * IMPORTANTE: incluye `superadmin`. Cualquier helper que liste roles
 * "admin" / "full access" / "bypass" en el frontend DEBE usar este set
 * (o llamar a `isBypassRole()`) — antes había hardcodes inconsistentes
 * en varias páginas que excluían `superadmin` y rompían la UX para
 * esos usuarios.
 */
export const BYPASS_ROLES = ["superadmin", "owner_empresa", "admin_empresa"] as const;

/**
 * Roles que tienen bypass automático de permisos granulares.
 * Usar preferentemente este helper en vez de hardcodear la lista.
 */
export function isBypassRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return (BYPASS_ROLES as readonly string[]).includes(role);
}

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
  if (isBypassRole(session.role)) return true;
  return session.permissions?.[module]?.[submodule]?.includes(action) ?? false;
}

/**
 * Verifica si tiene acceso de lectura a un módulo completo
 * (útil para mostrar/ocultar items del sidebar).
 */
export function canViewModule(session: AuthSession | null, module: string): boolean {
  if (!session) return false;
  if (isBypassRole(session.role)) return true;
  const submodules = session.permissions?.[module];
  if (!submodules) return false;
  return Object.values(submodules).some((actions) => actions.includes("ver"));
}

/**
 * Indica si la sesión pertenece a un rol admin/owner/superadmin de la
 * empresa (es decir, bypass). Útil para mostrar UI distinta o
 * restricciones de scope (ej. en la página de Usuarios, solo estos
 * roles ven el módulo completo; el resto solo ve conductores).
 */
export function isCompanyAdmin(session: AuthSession | null): boolean {
  return isBypassRole(session?.role);
}

/**
 * Indica si la sesión tiene al menos UN permiso granular en cualquiera
 * de los submódulos provistos. Usado para detectar operadores que
 * entran al módulo de Usuarios por `gestion.conductores.*` (no por
 * `accesos.usuarios.*`) — coherente con el backend, donde el
 * requirePermissionAny acepta ambos paths.
 *
 * Uso:
 *   const hasAny = hasAnyPermission(session, [
 *     { module: 'accesos', submodule: 'usuarios' },
 *     { module: 'gestion', submodule: 'conductores' },
 *   ], 'editar');
 */
export function hasAnyPermission(
  session: AuthSession | null,
  entries: Array<{ module: string; submodule: string }>,
  action: ActionKey,
): boolean {
  if (!session) return false;
  if (isBypassRole(session.role)) return true;
  const perms = (session.permissions ?? {}) as Record<string, Record<string, ActionKey[]>>;
  for (const { module: m, submodule: s } of entries) {
    const actions = perms?.[m]?.[s] ?? [];
    if (actions.includes(action)) return true;
  }
  return false;
}