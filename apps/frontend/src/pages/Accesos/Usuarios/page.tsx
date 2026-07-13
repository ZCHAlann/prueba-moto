"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useUsersFormOptions } from "@/hooks/useFormOptions";
import { useCompanyUsers, uploadUserPhoto, type CompanyUser, type CreateCompanyUserInput, type UpdateCompanyUserInput } from "@/hooks/useCompanyUsers";
import { useCompanyRoles } from "@/hooks/useCompanyRoles";
import { useCompanyLimits } from "@/hooks/useCompanyLimits";
import type { PlatformRole } from "@/types/platform";
import { MODULE_TREE, countModulesWithAccess, type ActionKey, type PermissionMap } from "@/lib/module-tree";
import { isBypassRole, hasAnyPermission } from "@/lib/permissions";
import { PermissionEditor } from "@/components/users/PermissionEditor";
import { RowActionMenu } from "@/components/ui/table/RowActionMenu";
import { ChevronLeft, ChevronRight } from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 8;

// ─── Banner de límites del plan ───────────────────────────────────────────────

function PlanLimitBanner({
  planName, planId: _planId, counts, max, breakdown,
}: {
  planName: string;
  planId: string;
  counts: { total: number; admins: number; supervisors: number; operators: number; drivers: number };
  max: number | null;
  breakdown: Array<{ label: string; used: number; max: number | null }>;
}) {
  const total = counts.total;
  const pct = max !== null && max > 0 ? Math.min(100, (total / max) * 100) : 0;
  const isOver = max !== null && total > max;
  const isNear = max !== null && total >= max * 0.8 && total < max;

  return (
    <div className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between
      ${isOver
        ? "border-rose-200 bg-rose-50 dark:border-rose-500/20 dark:bg-rose-500/10"
        : isNear
          ? "border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10"
          : "border-blue-200 bg-blue-50 dark:border-blue-500/20 dark:bg-blue-500/10"
      }`}>
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white dark:bg-white/[0.05]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={isOver ? "text-rose-600" : isNear ? "text-amber-600" : "text-blue-600"}>
            <path d="M12 2L2 22h20L12 2z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <circle cx="12" cy="17" r="0.5" fill="currentColor"/>
          </svg>
        </div>
        <div>
          <p className={`text-sm font-semibold ${
            isOver ? "text-rose-900 dark:text-rose-300" :
            isNear ? "text-amber-900 dark:text-amber-300" :
            "text-blue-900 dark:text-blue-300"
          }`}>
            Plan {planName}
            {isOver && " — excedido"}
            {isNear && !isOver && " — cerca del límite"}
          </p>
          <p className={`text-xs ${
            isOver ? "text-rose-700 dark:text-rose-400" :
            isNear ? "text-amber-700 dark:text-amber-400" :
            "text-blue-700 dark:text-blue-400"
          }`}>
            {total} de {max ?? "∞"} usuarios usados
            {isOver && " — contactá al superadmin para cambiar de plan"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {breakdown.map(b => (
          <div key={b.label} className="rounded-lg bg-white/80 px-2.5 py-1 dark:bg-white/[0.05]">
            <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{b.label}</p>
            <p className="text-xs font-bold text-gray-800 dark:text-white tabular-nums">
              {b.used} / {b.max ?? "∞"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}



const ROLE_LABELS: Record<string, string> = {
  owner_empresa:  "Dueño / Propietario",
  admin_empresa:  "Administrador",
  supervisor:     "Supervisor",
  operador:       "Operador",
  conductor:      "Conductor",
};

const PLATFORM_ROLES: PlatformRole[] = ["owner_empresa", "admin_empresa"];

// ─── Permisos por defecto por rol ─────────────────────────────────────────────

const ALL_ACTIONS: ActionKey[] = ["ver", "crear", "editar", "eliminar"];

function buildFullPermissions(): PermissionMap {
  const result: PermissionMap = {};
  for (const [mod, def] of Object.entries(MODULE_TREE)) {
    result[mod] = {};
    for (const sub of Object.keys(def.submodules)) {
      result[mod][sub] = [...ALL_ACTIONS];
    }
  }
  return result;
}

/**
 * Devuelve los permisos efectivos de un rol (catálogo + hardcodeados).
 * Si el rol es custom, usa los permisos del catálogo (BD).
 * Si es un rol hardcodeado (supervisor, operador, conductor) o platform
 * (owner/admin), usa los defaults locales.
 */
function getDefaultPermissionsForRole(
  roleKey: string,
  companyRoles: Array<{ key: string; permissions: PermissionMap }>,
): PermissionMap {
  // 1) Roles platform con bypass total
  if (roleKey === "owner_empresa" || roleKey === "admin_empresa") {
    return buildFullPermissions();
  }
  // 2) Roles custom del catálogo (BD) — buscar por key
  const fromCatalog = companyRoles.find((r) => r.key === roleKey);
  if (fromCatalog) {
    return normalizeModulePermissions(fromCatalog.permissions ?? {});
  }
  // 3) Roles hardcodeados (supervisor, operador, conductor)
  return ROLE_DEFAULT_PERMISSIONS[roleKey] ?? {};
}

/**
 * Normaliza `modulePermissions` al shape esperado: `{ [modKey]: { [subKey]: ActionKey[] } }`.
 *
 * Caso histórico de datos mal guardados (pre-migración 0013): los submódulos
 * de mantenimiento ("agenda", "execution", "records", "notifications") aparecen
 * al top-level del jsonb en vez de anidados bajo "mantenimiento". Si el
 * editor los recibe así, no puede renderizar nada bajo el módulo correcto.
 *
 * Esta función envuelve los keys sueltos bajo "mantenimiento" sin pisar lo
 * que ya esté bien.
 */
const MANTENIMIENTO_SUBMODULES = new Set(["agenda", "execution", "records", "notifications"]);

function normalizeModulePermissions(perms: PermissionMap | null | undefined): PermissionMap {
  if (!perms || typeof perms !== "object") return {};
  const result: PermissionMap = JSON.parse(JSON.stringify(perms));
  const loose: Record<string, unknown> = {};
  let hasLoose = false;
  for (const k of Object.keys(result)) {
    if (MANTENIMIENTO_SUBMODULES.has(k)) {
      loose[k] = result[k];
      delete result[k];
      hasLoose = true;
    }
  }
  if (!hasLoose) return result;

  // Merge con el "mantenimiento" existente (si lo hay)
  const existing = (result.mantenimiento && typeof result.mantenimiento === "object")
    ? { ...(result.mantenimiento as Record<string, unknown>) }
    : {};
  result.mantenimiento = { ...existing, ...loose };
  return result;
}

const ROLE_DEFAULT_PERMISSIONS: Record<string, PermissionMap> = {
  owner_empresa: buildFullPermissions(),
  admin_empresa: buildFullPermissions(),
  supervisor: {
    dashboard:     { dashboard: ["ver"] },
    gestion: {
      flotas:        ["ver"],
      conductores:   ["ver"],
      sedes:         ["ver"],
      garajes:       ["ver"],
      asignaciones:  ["ver"],
      talleres:      ["ver"],
      proveedores:   ["ver"],
    },
    // Jun 2026 — `seguros` migró de submódulo de gestion a módulo
    // top-level (alineado con `requireModule('seguros')` en insurance.ts).
    seguros:       { polizas: ["ver"] },
    mantenimiento: { agenda: ["ver"], execution: ["ver", "crear", "editar"], records: ["ver"] },
    combustible:   { combustible: ["ver", "crear", "editar"] },
    peajes:        { peajes: ["ver", "crear", "editar"] },
    checklist:     { checklist: ["ver", "crear"] },
    alertas:       { alertas: ["ver"] },
    reportes:      { reportes: ["ver"] },
    // jul 2026 — Caja Chica / Finanzas (alineado con role-catalog.service.ts):
    // supervisor aprueba/rechaza solicitudes; NO rellena caja chica.
    finanzas:      {
      caja_chica:   ["ver", "crear", "aprobar"],
      transacciones:["ver"],
    },
  },
  operador: {
    dashboard:     { dashboard: ["ver"] },
    gestion: {
      flotas:        ["ver"],
      talleres:      ["ver"],
      proveedores:   ["ver"],
    },
    mantenimiento: { agenda: ["ver"], execution: ["ver", "crear"], records: ["ver"] },
    combustible:   { combustible: ["ver", "crear"] },
    peajes:        { peajes: ["ver", "crear"] },
    checklist:     { checklist: ["ver", "crear"] },
    alertas:       { alertas: ["ver"] },
    geolocalizacion: { geolocalizacion: ["ver"] },
    // jul 2026 — operador crea solicitudes, ve sus vales. NO aprueba.
    finanzas:      {
      caja_chica:   ["ver", "crear"],
    },
  },
  conductor: {
    dashboard:     { dashboard: ["ver"] },
    checklist:     { checklist: ["ver", "crear"] },
    alertas:       { alertas: ["ver"] },
    geolocalizacion: { geolocalizacion: ["ver"] },
  },
};

const COMPANY_ROLES: PlatformRole[] = [
  "owner_empresa",
  "admin_empresa",
  "supervisor",
  "operador",
  "conductor",
];

const DEFAULT_COMPANY_ROLE_KEYS = new Set(["supervisor", "operador", "conductor"]);

// ─── Types ────────────────────────────────────────────────────────────────────

type UserFormState = {
  email: string;
  username: string;
  password: string;
  role: PlatformRole;
  status: "active" | "inactive";
  permissions: PermissionMap;
  fullName: string;
  lastName: string;
  phone: string;
  /** ID de la sede (formato "site-N") cuando el admin elige una. */
  siteId: string;
  /** Nombre legible de la sede (para mostrar en selects simples). */
  site: string;
  area: string;
  documentNumber: string;
  /** jun 2026 — campo de cédula/DNI en columna dedicada (company_users.dni).
   *  En el form se mantiene sincronizado con `documentNumber` (que sigue
   *  viajando en profileData por compat). El backend prioriza este campo
   *  si llega; si no, mantiene el de profileData.documentNumber. */
  dni: string;
  notes: string;
  photoUrl: string | null;
  // ── Datos del conductor (solo se usan cuando role === "conductor") ──
  licenseNumber: string;
  licenseType: string;
  licenseExpiry: string;
  licensePoints: number;
};

type UserFormErrors = Partial<Record<keyof UserFormState, string>>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createEmptyForm(
  defaultSiteName: string,
  defaultSiteId: string = "",
  initialRole: PlatformRole = "operador",
): UserFormState {
  // Si el rol pedido existe en el mapa de defaults, se usan sus permisos.
  // Si no, caemos al default de "operador" para no romper.
  const roleForPerms: PlatformRole =
    initialRole in ROLE_DEFAULT_PERMISSIONS ? initialRole : "operador";
  return {
    email: "",
    username: "",
    password: "",
    role: initialRole,
    status: "active",
    permissions: ROLE_DEFAULT_PERMISSIONS[roleForPerms],
    fullName: "",
    lastName: "",
    phone: "",
    siteId: defaultSiteId,
    site: defaultSiteName,
    area: "",
    documentNumber: "",
    dni: "",
    notes: "",
    photoUrl: null,
    licenseNumber: "",
    licenseType: "",
    licenseExpiry: "",
    licensePoints: 0,
  };
}

function validateForm(form: UserFormState): UserFormErrors {
  const errors: UserFormErrors = {};
  if (!form.email.trim())    errors.email    = "El correo es obligatorio.";
  else if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(form.email.trim())) errors.email = "Formato de correo inválido.";
  if (!form.username.trim()) errors.username = "El usuario es obligatorio.";
  else if (form.username.length < 3) errors.username = "Mínimo 3 caracteres.";
  else if (form.username.length > 40) errors.username = "Máximo 40 caracteres.";
  else if (!/^[a-zA-Z0-9_.-]+$/.test(form.username)) errors.username = "Solo letras, números, guion, guion bajo y punto.";
  if (!form.password.trim()) errors.password = "La contraseña es obligatoria.";
  else if (form.password.length < 8) errors.password = "Mínimo 8 caracteres.";
  else if (form.password.length > 128) errors.password = "Máximo 128 caracteres.";
  // El nombre y apellido son obligatorios siempre, y no pueden contener
  // números (regla tomada del módulo Conductores). Para conductores, además
  // los enviamos al backend como firstName/lastName por separado para que
  // la fila de `company_drivers` se cree con el nombre real de la persona
  // (no con el username).
  if (!form.fullName.trim()) errors.fullName = "El nombre es obligatorio.";
  else if (form.fullName.trim().length < 2) errors.fullName = "Mínimo 2 caracteres.";
  else if (form.fullName.trim().length > 80) errors.fullName = "Máximo 80 caracteres.";
  else if (/\d/.test(form.fullName)) errors.fullName = "El nombre no puede contener números.";
  if (!form.lastName.trim()) errors.lastName = "El apellido es obligatorio.";
  else if (form.lastName.trim().length < 2) errors.lastName = "Mínimo 2 caracteres.";
  else if (form.lastName.trim().length > 80) errors.lastName = "Máximo 80 caracteres.";
  else if (/\d/.test(form.lastName)) errors.lastName = "El apellido no puede contener números.";
  if (form.documentNumber && form.documentNumber.trim()) {
    if (!/^\d{10}$/.test(form.documentNumber)) errors.documentNumber = "La cédula debe tener exactamente 10 dígitos.";
  }
  if (form.phone && form.phone.trim()) {
    if (!/^\d{10}$/.test(form.phone)) errors.phone = "El teléfono debe tener exactamente 10 dígitos.";
  }
  if (!form.role) errors.role = "El rol es obligatorio.";

  // Datos del conductor: solo se validan si el rol es conductor.
  if (form.role === "conductor") {
    if (form.licenseNumber && form.licenseNumber.trim()) {
      if (!/^\d{10}$/.test(form.licenseNumber)) {
        errors.licenseNumber = "El número de licencia debe tener exactamente 10 dígitos.";
      }
    }
    if (form.licenseType && !["A", "B", "C", "D", "E", "F"].includes(form.licenseType)) {
      errors.licenseType = "Tipo de licencia inválido.";
    }
    if (form.licenseExpiry && !/^\d{4}-\d{2}-\d{2}$/.test(form.licenseExpiry)) {
      errors.licenseExpiry = "Fecha de vencimiento inválida (YYYY-MM-DD).";
    }
    if (form.licensePoints < 0 || form.licensePoints > 30) {
      errors.licensePoints = "Los puntos deben estar entre 0 y 30.";
    }
  }
  return errors;
}

function validateEditForm(form: UserFormState): UserFormErrors {
  const errors: UserFormErrors = {};
  if (!form.email.trim())    errors.email    = "El correo es obligatorio.";
  else if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(form.email.trim())) errors.email = "Formato de correo inválido.";
  if (!form.username.trim()) errors.username = "El usuario es obligatorio.";
  else if (form.username.length < 3) errors.username = "Mínimo 3 caracteres.";
  else if (form.username.length > 40) errors.username = "Máximo 40 caracteres.";
  else if (!/^[a-zA-Z0-9_.-]+$/.test(form.username)) errors.username = "Solo letras, números, guion, guion bajo y punto.";
  if (form.password && form.password.length > 0) {
    if (form.password.length < 8) errors.password = "Mínimo 8 caracteres.";
    else if (form.password.length > 128) errors.password = "Máximo 128 caracteres.";
  }
  if (!form.fullName.trim()) errors.fullName = "El nombre es obligatorio.";
  else if (form.fullName.trim().length < 2) errors.fullName = "Mínimo 2 caracteres.";
  else if (form.fullName.trim().length > 80) errors.fullName = "Máximo 80 caracteres.";
  else if (/\d/.test(form.fullName)) errors.fullName = "El nombre no puede contener números.";
  if (!form.lastName.trim()) errors.lastName = "El apellido es obligatorio.";
  else if (form.lastName.trim().length < 2) errors.lastName = "Mínimo 2 caracteres.";
  else if (form.lastName.trim().length > 80) errors.lastName = "Máximo 80 caracteres.";
  else if (/\d/.test(form.lastName)) errors.lastName = "El apellido no puede contener números.";
  if (form.documentNumber && form.documentNumber.trim()) {
    if (!/^\d{10}$/.test(form.documentNumber)) errors.documentNumber = "La cédula debe tener exactamente 10 dígitos.";
  }
  if (form.phone && form.phone.trim()) {
    if (!/^\d{10}$/.test(form.phone)) errors.phone = "El teléfono debe tener exactamente 10 dígitos.";
  }
  if (!form.role) errors.role = "El rol es obligatorio.";

  if (form.role === "conductor") {
    if (form.licenseNumber && form.licenseNumber.trim()) {
      if (!/^\d{10}$/.test(form.licenseNumber)) {
        errors.licenseNumber = "El número de licencia debe tener exactamente 10 dígitos.";
      }
    }
    if (form.licenseType && !["A", "B", "C", "D", "E", "F"].includes(form.licenseType)) {
      errors.licenseType = "Tipo de licencia inválido.";
    }
    if (form.licenseExpiry && !/^\d{4}-\d{2}-\d{2}$/.test(form.licenseExpiry)) {
      errors.licenseExpiry = "Fecha de vencimiento inválida (YYYY-MM-DD).";
    }
    if (form.licensePoints < 0 || form.licensePoints > 30) {
      errors.licensePoints = "Los puntos deben estar entre 0 y 30.";
    }
  }
  return errors;
}

/**
 * Elimina submódulos con array vacío y módulos sin ningún submódulo activo.
 * Evita que queden claves "fantasma" en modulePermissions cuando el admin
 * activó y luego desactivó permisos en el editor (ej. tocó "Ninguno" en un
 * módulo que no terminó usando).
 */
function pruneEmptyPermissions(perms: PermissionMap): PermissionMap {
  const result: PermissionMap = {};
  for (const [mod, subs] of Object.entries(perms)) {
    const cleanSubs: Record<string, ActionKey[]> = {};
    let hasAny = false;
    for (const [sub, actions] of Object.entries(subs ?? {})) {
      if (Array.isArray(actions) && actions.length > 0) {
        cleanSubs[sub] = actions;
        hasAny = true;
      }
    }
    if (hasAny) result[mod] = cleanSubs;
  }
  return result;
}

function formToCreateInput(form: UserFormState, options?: { restrictRoleToConductor?: boolean }): CreateCompanyUserInput {
  const isConductor = form.role === "conductor";
  // Defensa en profundidad: si el caller NO puede asignar permisos
  // manualmente, mandamos los defaults del rol 'conductor' en el body.
  // El backend los validará/overrride de todos modos (resolveModule…),
  // pero así evitamos enviar un {} vacío o permisos manipulados.
  const modulePermissions = options?.restrictRoleToConductor
    ? ROLE_DEFAULT_PERMISSIONS.conductor
    : pruneEmptyPermissions(form.permissions);
  return {
    email:    form.email.trim().toLowerCase(),
    username: form.username.trim().toLowerCase(),
    password: form.password,
    role:     form.role,
    status:   form.status,
    // jun 2026 — DNI dedicado. Si el form está vacío, mandamos null
    // para que el backend caiga al profileData.documentNumber.
    dni:      form.dni.trim() || null,
    modulePermissions,
    profileData: {
      // fullName se conserva por compatibilidad (algunos lugares lo muestran
      // directo), pero ahora también mandamos firstName / lastName por
      // separado para que el driver y los serializers usen el nombre real.
      fullName:       `${form.fullName.trim()} ${form.lastName.trim()}`.trim(),
      firstName:      form.fullName.trim(),
      lastName:       form.lastName.trim(),
      phone:          form.phone.trim(),
      site:           form.site.trim(),
      siteId:         form.siteId || undefined,
      area:           form.area.trim(),
      documentNumber: form.documentNumber.trim(),
      notes:          form.notes.trim(),
      // Datos del conductor: solo se incluyen si el rol es "conductor".
      ...(isConductor ? {
        licenseNumber: form.licenseNumber.trim() || undefined,
        licenseType:   form.licenseType || undefined,
        licenseExpiry: form.licenseExpiry || undefined,
        licensePoints: Number.isFinite(form.licensePoints) ? form.licensePoints : 0,
      } : {}),
    },
    photoUrl: form.photoUrl ?? null,
  };
}

function formToUpdateInput(form: UserFormState, options?: { restrictRoleToConductor?: boolean }): UpdateCompanyUserInput {
  const isConductor = form.role === "conductor";
  const modulePermissions = options?.restrictRoleToConductor
    ? ROLE_DEFAULT_PERMISSIONS.conductor
    : pruneEmptyPermissions(form.permissions);
  const input: UpdateCompanyUserInput = {
    email:    form.email.trim().toLowerCase(),
    username: form.username.trim().toLowerCase(),
    role:     form.role,
    status:   form.status,
    dni:      form.dni.trim() || null,
    modulePermissions,
    profileData: {
      fullName:       `${form.fullName.trim()} ${form.lastName.trim()}`.trim(),
      firstName:      form.fullName.trim(),
      lastName:       form.lastName.trim(),
      phone:          form.phone.trim(),
      site:           form.site.trim(),
      siteId:         form.siteId || undefined,
      area:           form.area.trim(),
      documentNumber: form.documentNumber.trim(),
      notes:          form.notes.trim(),
      ...(isConductor ? {
        licenseNumber: form.licenseNumber.trim() || undefined,
        licenseType:   form.licenseType || undefined,
        licenseExpiry: form.licenseExpiry || undefined,
        licensePoints: Number.isFinite(form.licensePoints) ? form.licensePoints : 0,
      } : {}),
    },
    photoUrl: form.photoUrl ?? null,
  };
  if (form.password.trim()) input.password = form.password;
  return input;
}

function userToForm(user: CompanyUser, defaultSiteId: string = "", defaultSiteName: string = ""): UserFormState {
  const p = user.profileData;
  // Resolver firstName/lastName desde profileData. Preferencia: firstName
  // explícito > primera palabra de fullName. Si no hay nada, vacío.
  const fullNameStr = String(
    p.fullName ??
    [p.firstName, p.lastName].filter(Boolean).join(" ") ??
    ""
  ).trim();
  const firstFromProfile = typeof p.firstName === "string" ? p.firstName.trim() : "";
  const lastFromProfile  = typeof p.lastName  === "string" ? p.lastName.trim()  : "";
  let resolvedFirst = firstFromProfile;
  let resolvedLast  = lastFromProfile;
  if (!resolvedFirst && !resolvedLast && fullNameStr) {
    const tokens = fullNameStr.split(/\s+/).filter(Boolean);
    resolvedFirst = tokens[0] ?? "";
    resolvedLast  = tokens.slice(1).join(" ");
  }
  // siteId puede venir como número crudo o como string "site-N" (compat).
  let siteId = "";
  if (p.siteId != null && p.siteId !== "") {
    siteId = typeof p.siteId === "number"
      ? `site-${p.siteId}`
      : String(p.siteId);
  }

  return {
    email:          user.email,
    username:       user.username,
    password:       "",
    role:           user.role,
    status:         user.status,
    permissions:    Object.keys(user.modulePermissions).length > 0
                      ? normalizeModulePermissions(user.modulePermissions)
                      : ROLE_DEFAULT_PERMISSIONS[user.role] ?? {},
    fullName:       resolvedFirst,
    lastName:       resolvedLast,
    phone:          String(p.phone ?? ""),
    site:           String(p.site ?? defaultSiteName),
    siteId:         siteId || defaultSiteId,
    area:           String(p.area ?? ""),
    documentNumber: String(p.documentNumber ?? ""),
    // jun 2026 — backend expone `user.dni` (columna dedicada).
    // Si viene null (datos legacy sin migrar), caemos a documentNumber.
    dni:            String(user.dni ?? p.documentNumber ?? ""),
    notes:          String(p.notes ?? ""),
    photoUrl:       user.photoUrl ?? null,
    licenseNumber:  String(p.licenseNumber ?? ""),
    licenseType:    String(p.licenseType ?? ""),
    licenseExpiry:  String(p.licenseExpiry ?? ""),
    licensePoints:  typeof p.licensePoints === "number" ? p.licensePoints : 0,
  };
}

function autoUsername(fullName: string, documentNumber: string) {
  const chunks = fullName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const base   = chunks.slice(0, 2).join("") || "usuario";
  const suffix = documentNumber.replace(/\D/g, "").slice(-4) || "0001";
  return `${base}${suffix}`.slice(0, 20);
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-lg border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.04] px-3 py-2 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 dark:focus:border-blue-400 transition";

function FormField({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-gray-400 dark:text-gray-500">{hint}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  detail,
  accent,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  accent: "blue" | "green" | "red" | "yellow";
  icon: React.ReactNode;
}) {
  const cfg = {
    blue:   { bar: "bg-blue-500",   bg: "bg-blue-50 dark:bg-blue-500/10",     text: "text-blue-600 dark:text-blue-400"   },
    green:  { bar: "bg-green-500",  bg: "bg-green-50 dark:bg-green-500/10",   text: "text-green-600 dark:text-green-400" },
    red:    { bar: "bg-red-500",    bg: "bg-red-50 dark:bg-red-500/10",       text: "text-red-600 dark:text-red-400"     },
    yellow: { bar: "bg-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-500/10", text: "text-yellow-600 dark:text-yellow-400" },
  }[accent];

  return (
    <div className="relative rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] px-5 py-4 overflow-hidden flex items-start gap-4">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${cfg.bar}`} />
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${cfg.bg} ${cfg.text}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-gray-800 dark:text-white leading-tight">{value}</p>
        <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{detail}</p>
      </div>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: "active" | "inactive" }) {
  return status === "active" ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 dark:bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-700 dark:text-green-400">
      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
      Activo
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 dark:bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-700 dark:text-red-400">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
      Inactivo
    </span>
  );
}

// ─── Role Badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const cfg: Record<string, string> = {
    owner_empresa: "bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400",
    admin_empresa: "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400",
    supervisor:    "bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
    operador:      "bg-gray-100 dark:bg-white/[0.06] text-gray-600 dark:text-gray-400",
    conductor:     "bg-yellow-50 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${cfg[role] ?? cfg.operador}`}>
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteConfirmModal({
  open,
  username,
  email,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  username: string;
  email: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onCancel}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="fixed left-1/2 top-1/2 z-[60] w-full max-w-sm -translate-x-1/2 -translate-y-1/2"
          >
            <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-gray-900 shadow-2xl p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/10 text-red-500 mb-4">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-gray-800 dark:text-white">Eliminar usuario</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                El usuario <span className="font-medium text-gray-800 dark:text-white">@{username}</span>{" "}
                (<span className="font-medium text-gray-800 dark:text-white">{email}</span>) será eliminado de la empresa. Esta acción no se puede deshacer.
              </p>
              <div className="mt-5 flex gap-2">
                <button
                  onClick={onCancel}
                  className="flex-1 rounded-lg border border-gray-200 dark:border-white/[0.06] px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition"
                >
                  Cancelar
                </button>
                <button
                  disabled={deleting}
                  onClick={async () => {
                    setDeleting(true);
                    await onConfirm();
                    setDeleting(false);
                  }}
                  className="flex-1 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60 px-4 py-2 text-sm font-medium text-white transition"
                >
                  {deleting ? "Eliminando…" : "Eliminar"}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── User Form Modal ──────────────────────────────────────────────────────────

function UserFormModal({
  open,
  user,
  siteOptions,
  roleOptions,
  companyRoles,
  originalPermissions,
  initialRole,
  restrictRoleToConductor,
  onClose,
  onCreate,
  onUpdate,
}: {
  open: boolean;
  user: CompanyUser | null;
  siteOptions: Array<{ id: string; name: string }>;
  roleOptions: { key: string; label: string }[];
  companyRoles: Array<{ key: string; permissions: PermissionMap }>;
  /**
   * Snapshot de los permisos del usuario al abrir el modal. Se usa para
   * el botón "Volver a originales" del editor. Solo en modo edición.
   */
  originalPermissions?: PermissionMap;
  /**
   * Rol con el que se pre-selecciona el `<select>` al crear un usuario
   * nuevo. Útil cuando se abre el modal desde otra página con un query
   * param `?rol=conductor` (ej: el botón "Nuevo conductor" de
   * /operaciones/conductores redirige acá). En modo edición se ignora.
   */
  initialRole?: PlatformRole;
  /**
   * true si el caller (UsersPage) determinó que este usuario SOLO puede
   * crear usuarios con role="conductor" — es decir, no es admin, no tiene
   * `accesos.accesos.crear`, pero sí tiene `gestion.conductores.crear`.
   * En ese caso el `<select>` de rol se bloquea a "conductor" únicamente,
   * en paridad con la validación que hace el backend en POST /company/:id/users.
   *
   * Se calcula UNA SOLA VEZ en el padre (UsersPage) y se pasa ya resuelto
   * como booleano — antes este componente intentaba recalcularlo leyendo
   * `isAdminRole` y `accesosActions`, que son variables del scope de
   * UsersPage y no existen acá, causando un ReferenceError en tiempo de
   * ejecución cada vez que se abría el modal para un usuario con permiso
   * de "solo conductores".
   */
  restrictRoleToConductor: boolean;
  onClose: () => void;
  onCreate: (input: CreateCompanyUserInput) => Promise<void>;
  onUpdate: (id: string, input: UpdateCompanyUserInput) => Promise<void>;
}) {
  const { session } = useAuth();
  // Solo admin_empresa/owner_empresa pueden cambiar la foto de un usuario
  // (propio o ajeno). Coincide con el chequeo de rol en el backend
  // (PUT /company/:id/users/:userId).
  const canEditPhoto = session?.role === "admin_empresa" || session?.role === "owner_empresa";
  const [form, setForm]         = useState<UserFormState>(() => createEmptyForm(
    siteOptions[0]?.name ?? "",
    siteOptions[0]?.id ?? "",
    initialRole,
  ));
  const [errors, setErrors]     = useState<UserFormErrors>({});
  const [saving, setSaving]     = useState(false);
  const [usernameTouched, setUsernameTouched] = useState(false);

  useEffect(() => {
    if (open) {
      if (user) {
        setForm(userToForm(user, siteOptions[0]?.id ?? "", siteOptions[0]?.name ?? ""));
        setUsernameTouched(true);
      } else {
        setForm(createEmptyForm(
          siteOptions[0]?.name ?? "",
          siteOptions[0]?.id ?? "",
          initialRole,
        ));
        setUsernameTouched(false);
      }
      setErrors({});
    }
  }, [open, user, siteOptions]);

  const set = (key: keyof UserFormState, value: string) => {
    setErrors((prev) => { const next = { ...prev }; delete next[key]; return next; });
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // jun 2026 — sync dni ↔ documentNumber. Mantenemos ambos campos
      // del form sincronizados para que el form legado (profileData)
      // y la columna dedicada (dni) tengan el mismo valor siempre.
      if (key === "documentNumber") next.dni = value;
      if (key === "dni") next.documentNumber = value;
      if (!user && !usernameTouched && (key === "fullName" || key === "documentNumber")) {
        next.username = autoUsername(
          key === "fullName" ? value : prev.fullName,
          key === "documentNumber" ? value : prev.documentNumber,
        );
      }
      if (key === "role") {
        // Al cambiar de rol, siempre partimos de los permisos completos
        // de ese rol nuevo como punto de partida. El admin ajusta desde
        // ahí (enciende/apaga lo que quiera) — eso queda como override.
        next.permissions = getDefaultPermissionsForRole(value, companyRoles);
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = user ? validateEditForm(form) : validateForm(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      toast.error("Formulario incompleto", { description: "Completa los campos obligatorios." });
      return;
    }
    setSaving(true);
    try {
      if (user) {
        await onUpdate(user.id, formToUpdateInput(form, { restrictRoleToConductor }));
        toast.success("Usuario actualizado");
      } else {
        await onCreate(formToCreateInput(form, { restrictRoleToConductor }));
        toast.success("Usuario creado", { description: "El colaborador ya tiene acceso al sistema." });
      }
      onClose();
    } catch {
      toast.error("Error al guardar", { description: "No se pudo completar la operación." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 max-h-[90vh] flex flex-col"
          >
            <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-gray-900 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

              {/* Header */}
              <div className="flex items-center justify-between px-4 py-5 sm:px-6 border-b border-gray-200 dark:border-white/[0.06] shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-500 dark:text-blue-400">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-gray-800 dark:text-white">
                      {user ? "Editar usuario" : "Nuevo usuario"}
                    </h2>
                    <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                      Credenciales y permisos de acceso al sistema.
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M3 3l10 10M13 3L3 13" />
                  </svg>
                </button>
              </div>

              {/* Body */}
              <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden">
                <div className="overflow-y-auto px-4 py-5 sm:px-6 space-y-5">

                  {/* Foto */}
                  {canEditPhoto && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Foto</p>
                      <div className="flex items-center gap-4">
                        <div className="h-20 w-20 overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 dark:border-white/[0.08] dark:bg-white/[0.05]">
                          {form.photoUrl ? (
                            <img src={form.photoUrl} alt="Foto" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">Sin foto</div>
                          )}
                        </div>
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-3.5 py-2.5 text-sm font-semibold text-gray-600 transition hover:border-brand-400 hover:text-brand-600 dark:border-white/[0.12] dark:bg-white/[0.04] dark:text-gray-300">
                          Subir foto
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setSaving(true);
                              try {
                                const url = await uploadUserPhoto(file, session?.companyId ?? 0);
                                setForm((prev) => ({ ...prev, photoUrl: url }));
                                toast.success("Foto subida");
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : "Error al subir");
                              } finally {
                                setSaving(false);
                                e.target.value = "";
                              }
                            }}
                          />
                        </label>
                        {form.photoUrl && (
                          <button
                            type="button"
                            onClick={() => setForm((prev) => ({ ...prev, photoUrl: null }))}
                            className="text-xs font-semibold text-gray-500 hover:text-rose-500"
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Datos personales */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Datos personales</p>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FormField label="Nombre completo *" error={errors.fullName}>
                        <input className={inputCls} placeholder="Nombres completos" maxLength={80} value={form.fullName}
                          onKeyDown={(e) => { if (/\d/.test(e.key)) e.preventDefault(); }}
                          onChange={(e) => set("fullName", e.target.value)} />
                      </FormField>
                      <FormField label="Apellidos" error={errors.lastName}>
                        <input className={inputCls} placeholder="Apellidos" maxLength={80} value={form.lastName}
                          onKeyDown={(e) => { if (/\d/.test(e.key)) e.preventDefault(); }}
                          onChange={(e) => set("lastName", e.target.value)} />
                      </FormField>
                      <FormField label="Documento de identidad" error={errors.documentNumber}>
                        <input className={inputCls} placeholder="Cédula / DNI (10 dígitos)" maxLength={10} value={form.documentNumber}
                          onKeyDown={(e) => { if (!/[0-9]/.test(e.key) && !['Backspace','Delete','Tab','ArrowLeft','ArrowRight','Home','End'].includes(e.key)) e.preventDefault(); }}
                          onChange={(e) => set("documentNumber", e.target.value.replace(/\D/g, '').slice(0, 10))} />
                      </FormField>
                      <FormField label="Teléfono" error={errors.phone}>
                        <input className={inputCls} placeholder="Número de contacto (10 dígitos)" maxLength={10} value={form.phone}
                          onKeyDown={(e) => { if (!/[0-9]/.test(e.key) && !['Backspace','Delete','Tab','ArrowLeft','ArrowRight','Home','End'].includes(e.key)) e.preventDefault(); }}
                          onChange={(e) => set("phone", e.target.value.replace(/\D/g, '').slice(0, 10))} />
                      </FormField>
                    </div>
                  </div>

                  {/* Datos laborales */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Datos laborales</p>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FormField label="Sede" error={errors.site}>
                        <select
                          className={inputCls}
                          value={form.siteId}
                          onChange={(e) => {
                            const opt = siteOptions.find((s) => s.id === e.target.value);
                            set("siteId", e.target.value);
                            set("site", opt?.name ?? "");
                          }}
                        >
                          <option value="">Seleccionar sede…</option>
                          {siteOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </FormField>
                      <FormField label="Área / Cargo">
                        <input className={inputCls} placeholder="Ej. Coordinación técnica" value={form.area}
                          onChange={(e) => set("area", e.target.value)} />
                      </FormField>
                      <FormField label="Rol *" error={errors.role}>
                        {restrictRoleToConductor ? (
                          // Caller que NO es admin/owner/superadmin: solo puede
                          // crear usuarios con role="conductor" (regla aplicada
                          // también en el backend — resolveUsersScope devuelve
                          // 'conductor' y POST /users rechaza body.role distinto
                          // con 403). Mostramos un input plano, sin flecha de
                          // dropdown, para que sea claro que NO hay elección.
                          <input
                            type="text"
                            className={inputCls + " cursor-not-allowed bg-gray-50 dark:bg-white/[0.02]"}
                            value="Conductor"
                            readOnly
                            aria-readonly="true"
                          />
                        ) : (
                          <select className={inputCls} value={form.role} onChange={(e) => set("role", e.target.value)}>
                            {roleOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                          </select>
                        )}
                      </FormField>
                      <FormField label="Estado">
                        <select className={inputCls} value={form.status} onChange={(e) => set("status", e.target.value)}>
                          <option value="active">Activo</option>
                          <option value="inactive">Inactivo</option>
                        </select>
                      </FormField>
                    </div>
                  </div>

                  {/* Datos del conductor (solo si rol === "conductor") */}
                  {form.role === "conductor" && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                        Información de licencia
                      </p>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <FormField label="Número de licencia" error={errors.licenseNumber}>
                          <input
                            className={inputCls}
                            placeholder="0912345678"
                            maxLength={10}
                            value={form.licenseNumber}
                            onKeyDown={(e) => {
                              if (!/[0-9]/.test(e.key) && !['Backspace','Delete','Tab','ArrowLeft','ArrowRight','Home','End'].includes(e.key)) e.preventDefault();
                            }}
                            onChange={(e) => set("licenseNumber", e.target.value.replace(/\D/g, "").slice(0, 10))}
                          />
                        </FormField>
                        <FormField label="Tipo de licencia" error={errors.licenseType}>
                          <select className={inputCls} value={form.licenseType} onChange={(e) => set("licenseType", e.target.value)}>
                            <option value="">Seleccionar…</option>
                            {["A", "B", "C", "D", "E", "F"].map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </FormField>
                        <FormField label="Vencimiento de licencia" error={errors.licenseExpiry}>
                          <input
                            type="date"
                            className={inputCls}
                            value={form.licenseExpiry}
                            onChange={(e) => set("licenseExpiry", e.target.value)}
                          />
                        </FormField>
                        <FormField label="Puntos de licencia" error={errors.licensePoints}>
                          <input
                            type="number"
                            min={0}
                            max={30}
                            className={inputCls}
                            placeholder="30"
                            value={form.licensePoints === 0 ? "" : form.licensePoints}
                            onChange={(e) => {
                              // Forzar 0..30, default 0 si vacío o NaN.
                              const n = Number(e.target.value);
                              const safe = Number.isFinite(n) ? Math.max(0, Math.min(30, n)) : 0;
                              setForm((prev) => ({ ...prev, licensePoints: safe }));
                            }}
                          />
                        </FormField>
                      </div>
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        Estos datos se guardan también en la ficha del conductor y se usan para alertas de vencimiento.
                      </p>
                    </div>
                  )}

                  {/* Credenciales */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Credenciales de acceso</p>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FormField label="Correo electrónico *" error={errors.email}>
                        <input type="email" className={inputCls} placeholder="correo@empresa.com" maxLength={120} value={form.email}
                          onChange={(e) => set("email", e.target.value.toLowerCase().trim())} />
                      </FormField>
                      <FormField label="Usuario *" error={errors.username} hint={!user ? "Se genera automáticamente del nombre." : undefined}>
                        <input className={inputCls} placeholder="nombre de usuario" maxLength={40} value={form.username}
                          onChange={(e) => { setUsernameTouched(true); set("username", e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, '')); }} />
                      </FormField>
                      <FormField label={user ? "Nueva contraseña (opcional)" : "Contraseña *"} error={errors.password}
                        hint={user ? "Dejar vacío para no cambiarla." : undefined}>
                        <input type="password" className={inputCls} placeholder={user ? "Dejar vacío para mantener" : "Mínimo 8 caracteres"} maxLength={128} value={form.password}
                          onChange={(e) => set("password", e.target.value)} />
                      </FormField>
                    </div>
                  </div>

                  {/* Permisos — solo visible para admins. El operador (no admin)
                      no elige permisos: los del rol 'conductor' los define el
                      backend y se asignan automáticamente al crear/editar. */}
                  {!restrictRoleToConductor && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Permisos por módulo</p>
                      <PermissionEditor
                        permissions={form.permissions}
                        onChange={(next) => setForm((prev) => ({ ...prev, permissions: next }))}
                        defaultPermissions={getDefaultPermissionsForRole(form.role, companyRoles)}
                        // El editor de permisos granulares es readonly cuando
                        // el target es admin/owner/superadmin: el caller NO
                        // debería poder modificar permisos de un admin (ni
                        // siquiera siendo admin, para evitar autoescalación).
                        // Para roles "no-admin" (operador/supervisor/etc.),
                        // el editor sí está activo.
                        readOnlyWithFullAccess={isBypassRole(form.role)}
                        originalPermissions={user ? originalPermissions : undefined}
                      />
                    </div>
                  )}

                  {/* Notas */}
                  <FormField label="Observaciones">
                    <textarea className={`${inputCls} resize-none`} rows={2}
                      placeholder="Notas relevantes del colaborador."
                      value={form.notes} onChange={(e) => set("notes", e.target.value)} />
                  </FormField>
                </div>

                {/* Footer */}
                <div className="flex flex-col-reverse gap-2 px-4 py-4 sm:flex-row sm:justify-end sm:px-6 border-t border-gray-200 dark:border-white/[0.06] shrink-0">
                  <button type="button" onClick={onClose}
                    className="rounded-lg border border-gray-200 dark:border-white/[0.06] px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition">
                    Cancelar
                  </button>
                  <button type="submit" disabled={saving}
                    className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-4 py-2 text-sm font-medium text-white transition">
                    {saving ? "Guardando…" : user ? "Guardar cambios" : "Crear usuario"}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function UsersPage() {
  const { session } = useAuth();
  // Antes usábamos `useSites()` que pega al endpoint /sites (requiere
  // `gestion/sedes.ver`). Un usuario con permiso de Accesos/Usuarios pero
  // SIN permiso de Sedes no podía abrir el modal — el `useSites` fallaba
  // con 403. Ahora usamos `useUsersFormOptions()` que es el endpoint
  // propio del módulo de Usuarios (sin requerir permiso extra).
  const { data: formOptions } = useUsersFormOptions();
  const allSites = formOptions?.sites ?? [];
  const { users, loading, createUser, updateUser, deleteUser } = useCompanyUsers();
  const limits = useCompanyLimits();
  // `users` ya viene paginado del backend con pageSize=100 (suficiente para
  // la lista típica de usuarios de una empresa). Los filtros display-only
  // (rol, status, búsqueda por texto) siguen siendo locales.
  const { roles: companyRoles } = useCompanyRoles();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Permisos de gestión ──────────────────────────────────────────────────
  // superadmin / owner_empresa / admin_empresa: acceso total (bypass),
  // igual que en el resto de la app (ver lib/permissions.ts →
  // isBypassRole).
  // Cualquier otro rol (supervisor, operador, conductor, custom): depende
  // de los permisos granulares `accesos.usuarios.*` (legacy
  // `accesos.accesos.*`) Y `gestion.conductores.*`. Un operador con
  // `gestion.conductores.crear/editar/eliminar` puede gestionar
  // SOLO conductores — el backend filtra el listado y valida el target
  // (ver apps/backend/src/routes/company/user.ts).
  const isAdminRole = isBypassRole(session?.role);
  // Permisos granulares. Soportamos ambos paths porque `accesos.usuarios`
  // y `gestion.conductores` son entradas distintas del mismo flujo:
  //   - `accesos.usuarios` = admin gestiona usuarios (cualquier rol)
  //   - `gestion.conductores` = operador gestiona conductores
  // El backend usa requirePermissionAny que acepta cualquiera de los dos.
  const accesosActions: string[] =
    (session as any)?.modulePermissions?.accesos?.usuarios ?? [];
  const accesosLegacyActions: string[] =
    (session as any)?.modulePermissions?.accesos?.accesos ?? [];
  const conductoresActions: string[] =
    (session as any)?.modulePermissions?.gestion?.conductores ?? [];
  // Permiso granular para crear SOLO conductores (sin acceso completo al módulo
  // de accesos). Un usuario con este permiso entra al flujo de "Nuevo conductor"
  // y solo puede crear usuarios con role="conductor" — el backend ya valida
  // esa restricción en POST /company/:id/users.
  const canCreateConductoresOnly = conductoresActions.includes("crear") && !isAdminRole;
  // canCreate: admin → sí. Si no, necesita 'crear' en accesos (path
  // nuevo o legacy) o `gestion.conductores.crear` (operador scope
  // 'conductor' que solo gestiona conductores).
  const canCreate = isAdminRole
    || accesosActions.includes("crear")
    || accesosLegacyActions.includes("crear")
    || canCreateConductoresOnly;
  // canEdit / canDelete: además de los accesos granulares, también
  // aceptamos `gestion.conductores.{editar,eliminar}` (operador scope
  // 'conductor' que quiere editar/eliminar un conductor).
  const canEdit   = isAdminRole
    || accesosActions.includes("editar")
    || accesosLegacyActions.includes("editar")
    || conductoresActions.includes("editar");
  const canDeleteUsers = isAdminRole
    || accesosActions.includes("eliminar")
    || accesosLegacyActions.includes("eliminar")
    || conductoresActions.includes("eliminar");
  const canManage = canCreate || canEdit || canDeleteUsers;
  // restrictRoleToConductor: si el caller NO es admin/owner/superadmin,
  // el único role que puede asignar al crear es 'conductor'. Esto
  // coincide con el backend (resolveUsersScope devuelve 'conductor'
  // para todo no-admin, y POST /users rechaza body.role distinto).
  const restrictRoleToConductor = !isAdminRole;

  // ── Apertura por deep link ────────────────────────────────────────────────
  // Si el admin llega con `?rol=conductor&nuevo=1` (caso típico: el botón
  // "Nuevo conductor" de /operaciones/conductores redirige acá para que
  // los conductores se creen SIEMPRE desde Accesos/Usuarios), abrimos
  // el modal automáticamente con el rol pre-seleccionado.
  //
  // El query param `nuevo=1` se limpia después de abrir el modal para que
  // un refresh de la página no reabra el modal (UX consistente con el
  // resto de "deep links" de la app).
  const deepLinkRole = searchParams.get("rol") as PlatformRole | null;
  const deepLinkNuevo = searchParams.get("nuevo") === "1";
  const deepLinkInitialRole: PlatformRole | undefined =
    deepLinkNuevo && deepLinkRole && (deepLinkRole in ROLE_LABELS || ["supervisor", "operador", "conductor"].includes(deepLinkRole))
      ? deepLinkRole
      : undefined;

  useEffect(() => {
    if (!deepLinkInitialRole) return;
    // Solo abrir si el usuario puede crear y no estamos ya editando.
    if (!canCreate) return;
    if (modalOpen) return;
    setEditingUser(null);
    setOriginalPermissionsSnapshot(undefined);
    setModalOpen(true);
    // Limpiar el query param para que un refresh no reabra el modal.
    const next = new URLSearchParams(searchParams);
    next.delete("rol");
    next.delete("nuevo");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkInitialRole, canCreate]);

  const roleOptions = useMemo(() => {
    const opts: { key: string; label: string }[] = PLATFORM_ROLES.map((r) => ({
      key: r, label: ROLE_LABELS[r] ?? r,
    }));
    const seen = new Set(opts.map((o) => o.key));
    if (companyRoles.length > 0) {
      for (const r of companyRoles) {
        if (seen.has(r.key)) continue;
        seen.add(r.key);
        opts.push({ key: r.key, label: r.label });
      }
    } else {
      for (const key of ["supervisor", "operador", "conductor"] as const) {
        if (seen.has(key)) continue;
        seen.add(key);
        opts.push({ key, label: ROLE_LABELS[key] ?? key });
      }
    }
    return opts;
  }, [companyRoles]);

  const [query, setQuery]               = useState("");
  const [page, setPage]                 = useState(1);
  const [modalOpen, setModalOpen]       = useState(false);
  const [editingUser, setEditingUser]   = useState<CompanyUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompanyUser | null>(null);
  // Snapshot de los permisos del user al abrir el modal de edición.
  // Se usa para el botón "Volver a originales" del editor.
  const [originalPermissionsSnapshot, setOriginalPermissionsSnapshot] = useState<PermissionMap | undefined>(undefined);

  const activeSites = useMemo(
    () => allSites.filter((s) => s.status === "Activa").map((s) => ({ id: s.id, name: s.name })),
    [allSites]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const p = u.profileData;
      const displayName = (
        String(p.fullName ?? "") ||
        [String(p.firstName ?? ""), String(p.lastName ?? "")].filter(Boolean).join(" ")
      ).toLowerCase();
      const roleLabel = (ROLE_LABELS[u.role] ?? u.role).toLowerCase();
      return (
        u.email.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q) ||
        roleLabel.includes(q) ||
        displayName.includes(q) ||
        String(p.lastName ?? "").toLowerCase().includes(q) ||
        String(p.firstName ?? "").toLowerCase().includes(q) ||
        String(p.site ?? "").toLowerCase().includes(q)
      );
    });
  }, [query, users]);

  // ─── Paginado ──────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Resetear página al cambiar búsqueda
  const handleQuery = (q: string) => { setQuery(q); setPage(1); };

  const openCreate = () => { setEditingUser(null); setOriginalPermissionsSnapshot(undefined); setModalOpen(true); };
  const openEdit   = (u: CompanyUser) => {
    setEditingUser(u);
    setOriginalPermissionsSnapshot(normalizeModulePermissions(u.modulePermissions));
    setModalOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const ok = await deleteUser(deleteTarget.id);
    if (ok) {
      toast.success("Usuario eliminado", { description: "El acceso ha sido revocado." });
    } else {
      toast.error("Error al eliminar");
    }
    setDeleteTarget(null);
  };

  if (loading) {
    return (
      <div className="space-y-5 p-6">
        <div className="h-8 w-48 rounded-lg bg-gray-200 dark:bg-white/[0.06] animate-pulse" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-gray-200 dark:bg-white/[0.06] animate-pulse" />
          ))}
        </div>
        <div className="h-64 rounded-xl bg-gray-200 dark:bg-white/[0.06] animate-pulse" />
      </div>
    );
  }

  const totalActive   = users.filter((u) => u.status === "active").length;
  const totalInactive = users.filter((u) => u.status === "inactive").length;

  return (
    <>
      <div className="space-y-5">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 px-2.5 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              <span className="text-xs font-medium text-blue-700 dark:text-blue-400">Accesos</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Usuarios</h1>
            <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
              Gestión de colaboradores, credenciales y permisos por módulo.
            </p>
          </div>
          {canCreate && (
            <button onClick={openCreate}
              disabled={limits.plan !== null && limits.counts.total >= (limits.plan.maxUsers ?? Infinity)}
              title={limits.plan && limits.counts.total >= (limits.plan.maxUsers ?? Infinity)
                ? `Tu plan "${limits.plan.planName}" alcanzó el máximo de usuarios.`
                : undefined}
              className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M7 1v12M1 7h12" />
              </svg>
              Nuevo usuario
            </button>
          )}
        </div>

        {/* Banner límites del plan */}
        {limits.plan && (
          <PlanLimitBanner
            planName={limits.plan.planName}
            planId={limits.plan.planId}
            counts={limits.counts}
            max={limits.plan.maxUsers}
            breakdown={[
              { label: "Admins",      used: limits.counts.admins,      max: limits.plan.maxAdmins },
              { label: "Supervisores", used: limits.counts.supervisors, max: limits.plan.maxSupervisors },
              { label: "Operadores",   used: limits.counts.operators,   max: limits.plan.maxOperators },
              { label: "Conductores",  used: limits.counts.drivers,     max: limits.plan.maxDrivers },
            ]}
          />
        )}

        {/* KPI row */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Total usuarios" value={String(users.length)} detail="Base total de la empresa" accent="blue"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>}
          />
          <KpiCard label="Activos" value={String(totalActive)} detail="Con acceso operativo" accent="green"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>}
          />
          <KpiCard label="Inactivos" value={String(totalInactive)} detail="Acceso suspendido" accent="red"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>}
          />
          <KpiCard label="Módulos" value={String(Object.keys(MODULE_TREE).length)} detail="Disponibles para asignar" accent="yellow"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>}
          />
        </div>

        {/* Table card */}
        <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] overflow-hidden">
          {/* Toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-5 py-4 border-b border-gray-200 dark:border-white/[0.06]">
            <div>
              <h2 className="text-sm font-semibold text-gray-800 dark:text-white">Usuarios registrados</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
                {totalPages > 1 && <span className="ml-2">· Pág. {page} / {totalPages}</span>}
              </p>
            </div>
            <div className="relative w-full sm:w-72">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="6.5" cy="6.5" r="4.5" />
                <path d="M10.5 10.5l3.5 3.5" />
              </svg>
              <input
                className="w-full rounded-lg border border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.04] pl-9 pr-4 py-2 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition"
                placeholder="Buscar por nombre, usuario, rol…"
                value={query}
                onChange={(e) => handleQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-white/[0.06] text-gray-400">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-800 dark:text-white">Sin usuarios</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {query ? "No hay resultados para esa búsqueda." : "Crea el primer usuario para comenzar."}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px]">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-white/[0.06]">
                      {["Colaborador", "Credenciales", "Laboral", "Rol", "Módulos", "Estado", ""].map((h, i, arr) => {
                        const isLast = i === arr.length - 1;
                        return (
                          <th key={h} className={isLast ? "" : "px-5 py-3 text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide"}>
                            {h}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
                    {paginated.map((u) => {
                      const p = u.profileData;
                      const fullName =
                        String(p.fullName ?? "") ||
                        [String(p.firstName ?? ""), String(p.lastName ?? "")].filter(Boolean).join(" ") ||
                        "—";
                      const documentNumber = String(p.documentNumber ?? "");
                      const site = String(p.site ?? "Operativo");
                      const area = String(p.area ?? "");

                      return (
                        <tr key={u.id} className="group hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                          <td className="px-5 py-3.5">
                            <p className="font-semibold text-sm text-gray-800 dark:text-white">{fullName}</p>
                            {documentNumber && <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{documentNumber}</p>}
                          </td>
                          <td className="px-5 py-3.5">
                            <p className="text-sm font-medium text-gray-800 dark:text-white">@{u.username}</p>
                            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{u.email}</p>
                          </td>
                          <td className="px-5 py-3.5">
                            <p className="text-sm text-gray-700 dark:text-gray-300">{site}</p>
                            {area && <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{area}</p>}
                          </td>
                          <td className="px-5 py-3.5">
                            <RoleBadge role={u.role} />
                          </td>
                            <td className="px-5 py-3.5">
                                {isBypassRole(u.role) ? (
                                  <span className="inline-flex items-center rounded-full bg-purple-50 dark:bg-purple-500/10 px-2 py-0.5 text-xs font-medium text-purple-700 dark:text-purple-400">
                                    Acceso total
                                  </span>
                                ) : (
                                  <>
                                    <span className="text-sm font-medium text-gray-800 dark:text-white">
                                      {Object.keys(u.modulePermissions).length}
                                    </span>
                                    <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">
                                      / {Object.keys(MODULE_TREE).length}
                                    </span>
                                  </>
                                )}
                              </td>
                              <td className="px-5 py-3.5">
                                <StatusBadge status={u.status} />
                              </td>
                              <td className="group-hover:bg-gray-50 dark:group-hover:bg-white/[0.02] px-5 py-3.5">
                                {(canEdit || canDeleteUsers) && (
                                  <RowActionMenu
                                    ariaLabel="Acciones del usuario"
                                    items={[
                                      ...(canEdit ? [{ label: "Editar", onClick: () => openEdit(u), tone: "default" as const }] : []),
                                      ...(canDeleteUsers ? [{ label: "Eliminar", onClick: () => setDeleteTarget(u), tone: "danger" as const }] : []),
                                    ]}
                                  />
                                )}
                              </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ─── Paginador ─────────────────────────────────────────────────── */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-100 dark:border-white/[0.06] px-5 py-3">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/[0.08] px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-40 transition"
                  >
                    <ChevronLeft size={13} />Anterior
                  </button>
                  <div className="flex gap-1">
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`h-7 w-7 rounded-lg text-xs font-semibold transition ${
                          page === p
                            ? "bg-blue-600 text-white"
                            : "text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.05]"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/[0.08] px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] disabled:opacity-40 transition"
                  >
                    Siguiente<ChevronRight size={13} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {!canCreate && !canEdit && (
          <div className="rounded-xl border border-yellow-200 dark:border-yellow-500/20 bg-yellow-50 dark:bg-yellow-500/10 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-400">
            Solo administradores pueden crear o editar usuarios.
          </div>
        )}
      </div>

      {/* Modals */}
      <UserFormModal
        open={modalOpen}
        user={editingUser}
        siteOptions={activeSites}
        roleOptions={roleOptions}
        companyRoles={companyRoles as Array<{ key: string; permissions: PermissionMap }>}
        originalPermissions={originalPermissionsSnapshot}
        restrictRoleToConductor={restrictRoleToConductor}
        initialRole={
          editingUser
            ? undefined
            : (restrictRoleToConductor ? "conductor" : deepLinkInitialRole)
        }
        onClose={() => setModalOpen(false)}
        onCreate={async (input) => { await createUser(input); }}
        onUpdate={async (id, input) => { await updateUser(id, input); }}
      />

      <DeleteConfirmModal
        open={Boolean(deleteTarget)}
        username={deleteTarget?.username ?? ""}
        email={deleteTarget?.email ?? ""}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </>
  );
}