"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import {
  MODULE_TREE,
  type ActionKey,
  type PermissionMap,
} from "@/lib/module-tree";

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_ACTIONS: ActionKey[] = ["ver", "crear", "editar", "eliminar"];
const STORAGE_KEY = "aplismart_role_permissions";

const ACTION_CONFIG: Record<ActionKey, { label: string; color: string; ring: string; dot: string }> = {
  ver:      { label: "Ver",      color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",   ring: "ring-blue-500/30",   dot: "bg-blue-500" },
  crear:    { label: "Crear",    color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", ring: "ring-emerald-500/30", dot: "bg-emerald-500" },
  editar:   { label: "Editar",   color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",  ring: "ring-amber-500/30",  dot: "bg-amber-500" },
  eliminar: { label: "Eliminar", color: "bg-red-500/10 text-red-600 dark:text-red-400",       ring: "ring-red-500/30",    dot: "bg-red-500" },
};

const COMPANY_ROLES: Array<{
  key: string;
  label: string;
  description: string;
  activeCls: string;
  countCls: string;
}> = [
  {
    key: "supervisor",
    label: "Supervisor",
    description: "Supervisa operaciones, revisa reportes y gestiona órdenes de trabajo.",
    activeCls: "bg-violet-600 text-white border-violet-600 shadow-sm",
    countCls: "bg-white/20 text-white",
  },
  {
    key: "operador",
    label: "Operador",
    description: "Ejecuta tareas de mantenimiento, crea checklists y registra novedades.",
    activeCls: "bg-blue-600 text-white border-blue-600 shadow-sm",
    countCls: "bg-white/20 text-white",
  },
  {
    key: "conductor",
    label: "Conductor",
    description: "Acceso básico a checklist, alertas y geolocalización de unidades.",
    activeCls: "bg-cyan-600 text-white border-cyan-600 shadow-sm",
    countCls: "bg-white/20 text-white",
  },
];

const PLATFORM_ROLES = [
  { key: "owner_empresa", label: "Propietario" },
  { key: "admin_empresa", label: "Administrador" },
];

// ─── Default permissions ──────────────────────────────────────────────────────

const DEFAULT_PERMISSIONS: Record<string, PermissionMap> = {
  supervisor: {
    dashboard:     { dashboard:              ["ver"] },
    gestion:       { flotas: ["ver"], conductores: ["ver"], sedes: ["ver"], garajes: ["ver"], asignaciones: ["ver"], seguros: ["ver"] },
    motores:       { lista_motores: ["ver"], mantenimientos_motor: ["ver", "crear"], historial_motor: ["ver"] },
    mantenimiento: { ordenes: ["ver", "crear", "editar"], inventario: ["ver"], oil: ["ver"] },
    checklist:     { checklist: ["ver", "crear"] },
    alertas:       { alertas: ["ver"] },
    reportes:      { reportes: ["ver"] },
  },
  operador: {
    dashboard:       { dashboard:       ["ver"] },
    mantenimiento:   { ordenes: ["ver", "crear"], inventario: ["ver"], oil: ["ver"] },
    checklist:       { checklist:       ["ver", "crear"] },
    alertas:         { alertas:         ["ver"] },
    geolocalizacion: { geolocalizacion: ["ver"] },
  },
  conductor: {
    dashboard:       { dashboard:       ["ver"] },
    checklist:       { checklist:       ["ver", "crear"] },
    alertas:         { alertas:         ["ver"] },
    geolocalizacion: { geolocalizacion: ["ver"] },
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadStored(): Record<string, PermissionMap> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, PermissionMap>) : {};
  } catch { return {}; }
}

function saveStored(data: Record<string, PermissionMap>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* silent */ }
}

function getPerms(roleKey: string, stored: Record<string, PermissionMap>): PermissionMap {
  return stored[roleKey] ?? DEFAULT_PERMISSIONS[roleKey] ?? {};
}

function countPerms(p: PermissionMap): number {
  return Object.values(p).reduce(
    (a, subs) => a + Object.values(subs).reduce((b, acts) => b + acts.length, 0), 0,
  );
}

// ─── Toggle Switch ────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  action,
  readonly,
}: {
  checked: boolean;
  onChange: () => void;
  action: ActionKey;
  readonly: boolean;
}) {
  const cfg = ACTION_CONFIG[action];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={readonly}
      onClick={onChange}
      className={[
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        checked ? cfg.dot + " ring-0" : "bg-gray-200 dark:bg-white/[0.08]",
        readonly ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        checked ? cfg.ring : "",
      ].join(" ")}
      style={checked ? undefined : undefined}
    >
      <span
        className={[
          "pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200",
          checked ? "translate-x-4" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}

// ─── Module icons ─────────────────────────────────────────────────────────────

const MODULE_ICONS: Record<string, React.ReactNode> = {
  dashboard: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  ),
  gestion: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
    </svg>
  ),
  motores: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 2v3m0 14v3M4.22 4.22l2.12 2.12m11.32 11.32 2.12 2.12M2 12h3m14 0h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
    </svg>
  ),
  mantenimiento: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
    </svg>
  ),
  checklist: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
    </svg>
  ),
  alertas: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/>
    </svg>
  ),
  reportes: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  geolocalizacion: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
    </svg>
  ),
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export function RolesPage() {
  const { session } = useAuth();

  const canManage = ["owner_empresa", "admin_empresa", "superadmin"].includes(session?.role ?? "");

  const [stored, setStored]             = useState<Record<string, PermissionMap>>({});
  const [selectedRole, setSelectedRole] = useState<string>(COMPANY_ROLES[0].key);
  const [permissions, setPermissions]   = useState<PermissionMap>({});
  const [dirty, setDirty]               = useState(false);
  const [saving, setSaving]             = useState(false);

  useEffect(() => {
    const data = loadStored();
    setStored(data);
    setPermissions(getPerms(COMPANY_ROLES[0].key, data));
    setDirty(false);
  }, []);

  const handleSelectRole = (roleKey: string) => {
    setSelectedRole(roleKey);
    setPermissions(getPerms(roleKey, stored));
    setDirty(false);
  };

  const handleToggleAction = (mod: string, sub: string, action: ActionKey) => {
    setPermissions((prev) => {
      const current: ActionKey[] = prev[mod]?.[sub] ?? [];
      let next: ActionKey[];
      if (action === "ver") {
        next = current.includes("ver") ? [] : ["ver"];
      } else {
        if (current.includes(action)) {
          next = current.filter((a) => a !== action);
        } else {
          next = current.includes("ver") ? [...current, action] : ["ver", ...current, action];
        }
      }
      return { ...prev, [mod]: { ...(prev[mod] ?? {}), [sub]: next } };
    });
    setDirty(true);
  };

  const handleSetAll = (mod: string, sub: string | null, all: boolean) => {
    setPermissions((prev) => {
      const modDef = MODULE_TREE[mod as keyof typeof MODULE_TREE];
      if (!modDef) return prev;
      if (sub === null) {
        const updated: Record<string, ActionKey[]> = {};
        for (const s of Object.keys(modDef.submodules)) updated[s] = all ? [...ALL_ACTIONS] : [];
        return { ...prev, [mod]: updated };
      }
      return { ...prev, [mod]: { ...(prev[mod] ?? {}), [sub]: all ? [...ALL_ACTIONS] : [] } };
    });
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 280));
    const next = { ...stored, [selectedRole]: permissions };
    setStored(next);
    saveStored(next);
    setDirty(false);
    setSaving(false);
    toast.success("Plantilla guardada", {
      description: `Permisos de "${COMPANY_ROLES.find((r) => r.key === selectedRole)?.label}" actualizados.`,
    });
  };

  const handleReset = () => {
    setPermissions(DEFAULT_PERMISSIONS[selectedRole] ?? {});
    setDirty(true);
  };

  const activeRole = COMPANY_ROLES.find((r) => r.key === selectedRole);
  const totalPerms = countPerms(permissions);

  return (
    <div className="flex flex-col gap-5 h-full">

      {/* ── Page header ── */}
      <div>
        <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 px-2.5 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
          <span className="text-xs font-medium text-blue-700 dark:text-blue-400">Accesos</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Roles y permisos</h1>
        <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
          Define qué puede hacer cada rol en cada módulo del sistema.
        </p>
      </div>

      {/* ── Role selector bar ── */}
      <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] px-4 py-3 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide shrink-0">
            Rol
          </span>

          {/* Editable role chips */}
          <div className="flex gap-2 flex-wrap">
            {COMPANY_ROLES.map((role) => {
              const isActive = selectedRole === role.key;
              const count    = countPerms(getPerms(role.key, stored));
              return (
                <motion.button
                  key={role.key}
                  type="button"
                  onClick={() => handleSelectRole(role.key)}
                  whileTap={{ scale: 0.94 }}
                  className={[
                    "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all duration-200",
                    isActive
                      ? role.activeCls
                      : "border-gray-200 dark:border-white/[0.08] text-gray-600 dark:text-gray-400 bg-transparent hover:bg-gray-50 dark:hover:bg-white/[0.04]",
                  ].join(" ")}
                >
                  {role.label}
                  {count > 0 && (
                    <span className={[
                      "text-[10px] font-bold tabular-nums rounded-full px-1.5 py-0.5 leading-none",
                      isActive ? role.countCls : "bg-gray-100 dark:bg-white/[0.08] text-gray-500 dark:text-gray-400",
                    ].join(" ")}>
                      {count}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>

          <div className="h-5 w-px bg-gray-200 dark:bg-white/[0.08] shrink-0" />

          {/* Platform read-only pills */}
          <div className="flex gap-2 flex-wrap">
            {PLATFORM_ROLES.map((role) => (
              <span
                key={role.key}
                className="inline-flex items-center gap-1.5 rounded-full border border-green-200 dark:border-green-500/20 bg-green-50 dark:bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-700 dark:text-green-400"
              >
                {role.label}
                <span className="opacity-60 text-[10px]">acceso total</span>
              </span>
            ))}
          </div>

          {/* Spacer + save actions */}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <AnimatePresence>
              {dirty && (
                <motion.span
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  className="text-xs rounded-full border px-2.5 py-1 font-medium bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20"
                >
                  Sin guardar
                </motion.span>
              )}
            </AnimatePresence>
            {canManage && (
              <>
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-lg border border-gray-200 dark:border-white/[0.06] px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition"
                >
                  Restaurar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!dirty || saving}
                  className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-1.5 text-xs font-medium text-white transition"
                >
                  {saving ? "Guardando…" : "Guardar plantilla"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Active role description */}
        <AnimatePresence mode="wait">
          <motion.div
            key={selectedRole}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.14 }}
            className="mt-2.5 flex items-center gap-2 flex-wrap"
          >
            <span className="text-xs text-gray-400 dark:text-gray-500">{activeRole?.description}</span>
            <span className="text-gray-300 dark:text-white/20 text-xs">·</span>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {totalPerms} permiso{totalPerms !== 1 ? "s" : ""} activo{totalPerms !== 1 ? "s" : ""}
            </span>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Permissions table with internal scroll ── */}
      <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] flex flex-col min-h-0 flex-1">

        {/* Sticky thead wrapper */}
        <div className="shrink-0 border-b border-gray-100 dark:border-white/[0.06]">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[44%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Módulo / Submódulo
                </th>
                {ALL_ACTIONS.map((action) => (
                  <th
                    key={action}
                    className="px-2 py-3 text-center text-[11px] font-semibold uppercase tracking-wider"
                  >
                    <span className={[
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
                      ACTION_CONFIG[action].color,
                    ].join(" ")}>
                      <span className={["h-1.5 w-1.5 rounded-full", ACTION_CONFIG[action].dot].join(" ")} />
                      {ACTION_CONFIG[action].label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
          </table>
        </div>

        {/* Scrollable tbody */}
        <div className="overflow-y-auto flex-1" style={{ scrollbarWidth: "thin" }}>
          <AnimatePresence mode="wait">
            <motion.table
              key={selectedRole}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16 }}
              className="w-full table-fixed"
            >
              <colgroup>
                <col className="w-[44%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
              </colgroup>
              <tbody>
                {Object.entries(MODULE_TREE).map(([modKey, modDef]) => {
                  const subs = Object.entries(modDef.submodules);
                  const activeSubCount = subs.filter(
                    ([s]) => (permissions[modKey]?.[s]?.length ?? 0) > 0
                  ).length;

                  return (
                    <>
                      {/* Module header row */}
                      <tr key={`mod-${modKey}`} className="border-t border-gray-100 dark:border-white/[0.04]">
                        <td
                          colSpan={5}
                          className="px-4 py-2 bg-gray-50/60 dark:bg-white/[0.02]"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400 dark:text-gray-500 shrink-0">
                              {MODULE_ICONS[modKey] ?? (
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                  <circle cx="12" cy="12" r="9" />
                                </svg>
                              )}
                            </span>
                            <span className="text-xs font-bold text-gray-600 dark:text-gray-300">
                              {modDef.label}
                            </span>
                            <span className="text-[10px] text-gray-400 dark:text-gray-600 tabular-nums">
                              {activeSubCount}/{subs.length}
                            </span>
                            {canManage && (
                              <div className="flex gap-1 ml-1">
                                <button
                                  type="button"
                                  onClick={() => handleSetAll(modKey, null, true)}
                                  className="text-[10px] text-blue-500 dark:text-blue-400 hover:underline leading-none"
                                >
                                  Todo
                                </button>
                                <span className="text-gray-300 dark:text-white/20 text-[10px]">·</span>
                                <button
                                  type="button"
                                  onClick={() => handleSetAll(modKey, null, false)}
                                  className="text-[10px] text-gray-400 dark:text-gray-500 hover:underline leading-none"
                                >
                                  Nada
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Submodule rows */}
                      {subs.map(([subKey, subLabel]) => {
                        const activeActions: ActionKey[] = permissions[modKey]?.[subKey] ?? [];
                        const hasAny = activeActions.length > 0;

                        return (
                          <tr
                            key={`sub-${modKey}-${subKey}`}
                            className={[
                              "border-t border-gray-100 dark:border-white/[0.03] transition-colors",
                              hasAny
                                ? "bg-white dark:bg-white/[0.02] hover:bg-gray-50/50 dark:hover:bg-white/[0.03]"
                                : "bg-white dark:bg-transparent hover:bg-gray-50/50 dark:hover:bg-white/[0.02]",
                            ].join(" ")}
                          >
                            <td className="px-4 py-2.5">
                              <span className={[
                                "text-[13px] pl-5",
                                hasAny ? "text-gray-700 dark:text-gray-200" : "text-gray-400 dark:text-gray-600",
                              ].join(" ")}>
                                {subLabel as string}
                              </span>
                            </td>
                            {ALL_ACTIONS.map((action) => (
                              <td key={action} className="px-2 py-2.5 text-center">
                                <div className="flex justify-center">
                                  <Toggle
                                    checked={activeActions.includes(action)}
                                    onChange={() => handleToggleAction(modKey, subKey, action)}
                                    action={action}
                                    readonly={!canManage}
                                  />
                                </div>
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </>
                  );
                })}
              </tbody>
            </motion.table>
          </AnimatePresence>
        </div>
      </div>

      {/* ── Read-only notice ── */}
      {!canManage && (
        <div className="rounded-xl border border-yellow-200 dark:border-yellow-500/20 bg-yellow-50 dark:bg-yellow-500/10 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-400 shrink-0">
          Solo administradores pueden modificar las plantillas de permisos.
        </div>
      )}
    </div>
  );
}