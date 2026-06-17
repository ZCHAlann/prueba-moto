// services/role-catalog.service.ts
// Catálogo de roles por empresa + seed inicial.
//
// `company_users.role` guarda el `key` (string). Este servicio es la
// fuente de verdad de los permisos por defecto para cada `key`.
// Al crear una empresa, se siembran 3 roles default (supervisor,
// operador, conductor) con sus permisos. Los admins pueden crear
// roles adicionales desde la UI.

import { eq, and } from "drizzle-orm";
import { db } from "../db/client";
import { companyRoles } from "../db/schema/platform";

export type ModulePermissionMap = Record<string, Record<string, string[]>>;

export const DEFAULT_ROLE_KEYS = ["supervisor", "operador", "conductor"] as const;
export type DefaultRoleKey = typeof DEFAULT_ROLE_KEYS[number];

/** Permisos por defecto para los 3 roles del sistema. */
export const DEFAULT_ROLE_PERMISSIONS: Record<DefaultRoleKey, ModulePermissionMap> = {
  supervisor: {
    dashboard:     { dashboard:              ["ver"] },
    gestion:       { flotas: ["ver"], conductores: ["ver"], sedes: ["ver"], garajes: ["ver"], asignaciones: ["ver"], seguros: ["ver"] },
    motores:       { lista_motores: ["ver"], mantenimientos_motor: ["ver", "crear"], historial_motor: ["ver"] },
    mantenimiento: { ordenes: ["ver", "crear", "editar"], inventario: ["ver"], oil: ["ver"] },
    combustible:   { combustible: ["ver", "crear", "editar"] },
    peajes:        { peajes: ["ver", "crear", "editar"] },
    checklist:     { checklist: ["ver", "crear"] },
    alertas:       { alertas: ["ver"] },
    reportes:      { reportes: ["ver"] },
  },
  operador: {
    dashboard:       { dashboard:       ["ver"] },
    mantenimiento:   { ordenes: ["ver", "crear"], inventario: ["ver"], oil: ["ver"] },
    combustible:     { combustible: ["ver", "crear"] },
    peajes:          { peajes: ["ver", "crear"] },
    checklist:       { checklist:       ["ver", "crear"] },
    alertas:         { alertas:         ["ver"] },
    geolocalizacion: { geolocalizacion: ["ver"] },
  },
  conductor: {
    dashboard:       { dashboard:       ["ver"] },
    checklist:       { checklist:       ["ver", "crear"] },
    alertas:         { alertas:         ["ver"] },
    geolocalizacion: { geolocalizacion: ["ver"] },
    autorizaciones:  { autorizaciones:  ["ver", "crear"] },
  },
};

const DEFAULT_LABELS: Record<DefaultRoleKey, { label: string; description: string; palette: string }> = {
  supervisor: { label: "Supervisor", description: "Supervisa operaciones, revisa reportes y gestiona órdenes de trabajo.", palette: "Púrpura" },
  operador:   { label: "Operador",   description: "Ejecuta tareas de mantenimiento, crea checklists y registra novedades.",   palette: "Esmeralda" },
  conductor:  { label: "Conductor",  description: "Acceso básico a checklist, alertas y geolocalización de unidades.",       palette: "Indigo" },
};

/**
 * Si la empresa no tiene roles seeded, siembra los 3 default.
 * Idempotente: no hace nada si ya existen filas para esa empresa.
 */
export async function ensureDefaultRolesForCompany(companyId: number): Promise<void> {
  const existing = await db
    .select({ key: companyRoles.key })
    .from(companyRoles)
    .where(eq(companyRoles.companyId, companyId));

  const existingKeys = new Set(existing.map((r) => r.key));
  const toInsert = DEFAULT_ROLE_KEYS
    .filter((k) => !existingKeys.has(k))
    .map((k) => ({
      companyId,
      key: k,
      label: DEFAULT_LABELS[k].label,
      description: DEFAULT_LABELS[k].description,
      palette: DEFAULT_LABELS[k].palette,
      permissions: DEFAULT_ROLE_PERMISSIONS[k] as unknown as Record<string, unknown>,
      isSystem: true,
    }));

  if (toInsert.length > 0) {
    await db.insert(companyRoles).values(toInsert);
  }
}

/** Devuelve los permisos por defecto de un `role` para una empresa. {} si no matchea. */
export async function getPermissionsForRole(
  companyId: number,
  roleKey: string,
): Promise<ModulePermissionMap> {
  const [row] = await db
    .select({ permissions: companyRoles.permissions })
    .from(companyRoles)
    .where(and(eq(companyRoles.companyId, companyId), eq(companyRoles.key, roleKey)))
    .limit(1);

  if (!row) return {};
  return (row.permissions as ModulePermissionMap) ?? {};
}

/**
 * Mergear permisos: los del rol son la base, los del usuario (per-user
 * override) se SUMAN submódulo por submódulo, acción por acción. Si
 * el rol tiene `gestion.flotas: ["ver"]` y el per-user agrega
 * `gestion.talleres: ["ver"]`, el resultado es:
 *   { gestion: { flotas: ["ver"], talleres: ["ver"] } }
 *
 * Si tanto el rol como el per-user definen acciones para el mismo
 * submódulo, se hace union (sin duplicados): la acción aparece una sola
 * vez si está en cualquiera de los dos.
 */
export function mergePermissions(
  base: ModulePermissionMap,
  override: ModulePermissionMap,
): ModulePermissionMap {
  const out: ModulePermissionMap = {};

  // 1) Copiamos todos los módulos del rol base
  for (const [mod, subs] of Object.entries(base ?? {})) {
    out[mod] = {};
    for (const [sub, actions] of Object.entries(subs ?? {})) {
      out[mod][sub] = Array.from(new Set(actions ?? []));
    }
  }

  // 2) Sumamos los del per-user override, sin pisar lo del rol
  for (const [mod, subs] of Object.entries(override ?? {})) {
    if (!out[mod]) out[mod] = {};
    for (const [sub, actions] of Object.entries(subs ?? {})) {
      const existing = out[mod][sub] ?? [];
      const merged = Array.from(new Set([...existing, ...(actions ?? [])]));
      out[mod][sub] = merged;
    }
  }

  return out;
}
