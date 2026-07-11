// lib/finance-bypass.ts
//
// jul 2026 — Helpers compartidos para los routers de finanzas.
//
// Centraliza la lógica de "este usuario es admin de la empresa y
// bypasea filtros / permisos granulares" para no repetirla en cada
// router.

/**
 * Roles a nivel empresa/plataforma que bypassean los checks de
 * "ver solo lo mío" y la mayoría de permisos granulares de finanzas.
 * Coincide con BYPASS_ROLES del middleware requirePermission.
 */
export const FINANCE_ADMIN_ROLES = new Set([
  'superadmin',
  'owner_empresa',
  'admin_empresa',
]);

/**
 * Devuelve true si el usuario autenticado tiene un rol admin a nivel
 * empresa/plataforma.
 */
export function isAdminRole(req: any): boolean {
  const role = (req.user as any)?.role as string | undefined;
  return !!role && FINANCE_ADMIN_ROLES.has(role);
}

/**
 * Devuelve true si el usuario tiene el permiso granular O es admin.
 * Usado para endpoints de revisión contable y similares.
 */
export function hasPermOrAdmin(
  req: any,
  module: string,
  submodule: string,
  action: string,
): boolean {
  const perms = ((req.user as any)?.modulePermissions as Record<string, Record<string, string[]>>) ?? {};
  const hasPerm = (perms[module]?.[submodule] ?? []).includes(action);
  return hasPerm || isAdminRole(req);
}
