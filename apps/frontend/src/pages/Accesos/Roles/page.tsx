"use client";

import { useEffect, useState, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, X, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { useCompanyRoles, type CompanyRole, type PermissionMap } from "@/hooks/useCompanyRoles";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { MODULE_TREE, type ActionKey } from "@/lib/module-tree";
import { useAuth } from "@/context/AuthContext";

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_ACTIONS: ActionKey[] = ["ver", "crear", "editar", "eliminar"];

const ACTION_CONFIG: Record<ActionKey, { label: string; color: string; ring: string; dot: string }> = {
  ver:      { label: "Ver",      color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",           ring: "ring-blue-500/30",    dot: "bg-blue-500"    },
  crear:    { label: "Crear",    color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",   ring: "ring-emerald-500/30", dot: "bg-emerald-500" },
  editar:   { label: "Editar",   color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",         ring: "ring-amber-500/30",   dot: "bg-amber-500"   },
  eliminar: { label: "Eliminar", color: "bg-red-500/10 text-red-600 dark:text-red-400",               ring: "ring-red-500/30",     dot: "bg-red-500"     },
};

const PLATFORM_ROLES = [
  { key: "owner_empresa", label: "Propietario" },
  { key: "admin_empresa", label: "Administrador" },
];

const PALETTES: Array<{ name: string; activeCls: string; countCls: string }> = [
  { name: "Esmeralda", activeCls: "bg-emerald-600 text-white border-emerald-600 shadow-sm", countCls: "bg-white/20 text-white" },
  { name: "Rosa",      activeCls: "bg-pink-600 text-white border-pink-600 shadow-sm",       countCls: "bg-white/20 text-white" },
  { name: "Púrpura",   activeCls: "bg-purple-600 text-white border-purple-600 shadow-sm",   countCls: "bg-white/20 text-white" },
  { name: "Naranja",   activeCls: "bg-orange-600 text-white border-orange-600 shadow-sm",   countCls: "bg-white/20 text-white" },
  { name: "Indigo",    activeCls: "bg-indigo-600 text-white border-indigo-600 shadow-sm",   countCls: "bg-white/20 text-white" },
];

function paletteCls(name: string) {
  return PALETTES.find((p) => p.name === name) ?? PALETTES[0];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countPerms(p: PermissionMap): number {
  return Object.values(p).reduce(
    (a, subs) => a + Object.values(subs).reduce((b, acts) => b + acts.length, 0), 0,
  );
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

// ─── Module icons ─────────────────────────────────────────────────────────────

const MODULE_ICONS: Record<string, React.ReactNode> = {
  dashboard:       <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  gestion:         <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>,
  motores:         <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M4.22 4.22l2.12 2.12m11.32 11.32 2.12 2.12M2 12h3m14 0h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>,
  mantenimiento:   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>,
  checklist:       <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>,
  alertas:         <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>,
  reportes:        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  geolocalizacion: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>,
};

// ─── Toggle Switch ────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, action, readonly }: {
  checked: boolean; onChange: () => void; action: ActionKey; readonly: boolean;
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
        checked ? cfg.dot : "bg-gray-200 dark:bg-white/[0.08]",
        readonly ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        checked ? cfg.ring : "",
      ].join(" ")}
    >
      <span className={[
        "pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200",
        checked ? "translate-x-4" : "translate-x-0",
      ].join(" ")} />
    </button>
  );
}

// ─── Module Row (collapsible) ─────────────────────────────────────────────────

function ModuleSection({
  modKey,
  modDef,
  draft,
  canManage,
  onToggle,
  onSetAll,
}: {
  modKey: string;
  modDef: (typeof MODULE_TREE)[keyof typeof MODULE_TREE];
  draft: PermissionMap;
  canManage: boolean;
  onToggle: (mod: string, sub: string, action: ActionKey) => void;
  onSetAll: (mod: string, sub: string | null, all: boolean) => void;
}) {
  const subs = Object.entries(modDef.submodules);
  const activePermCount = subs.reduce((sum, [s]) => sum + (draft[modKey]?.[s]?.length ?? 0), 0);
  const totalPermCount  = subs.length * ALL_ACTIONS.length;
  const isComplete = activePermCount > 0 && activePermCount === totalPermCount;
  const isPartial  = activePermCount > 0 && !isComplete;
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* ── Module header ── */}
      <tr className="border-t border-gray-100 dark:border-white/[0.05]">
        <td colSpan={5} className="bg-gray-50/80 dark:bg-white/[0.025]">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
          >
            {/* Chevron */}
            <ChevronDown
              size={13}
              className={`shrink-0 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
            />
            {/* Icon */}
            <span className="text-gray-400 dark:text-gray-500 shrink-0">
              {MODULE_ICONS[modKey] ?? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="9" />
                </svg>
              )}
            </span>
            {/* Label */}
            <span className="text-xs font-bold text-gray-600 dark:text-gray-300">{modDef.label}</span>
            {/* Counter */}
            <span
              className={[
                "text-[10px] font-semibold tabular-nums rounded-full px-1.5 py-0.5",
                isComplete
                  ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : isPartial
                  ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                  : "text-gray-400 dark:text-gray-600",
              ].join(" ")}
            >
              {activePermCount}/{totalPermCount}
            </span>
            {/* Todo / Nada */}
            {canManage && (
              <div className="flex gap-1 ml-1" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => onSetAll(modKey, null, true)}
                  className="text-[10px] text-blue-500 dark:text-blue-400 hover:underline leading-none"
                >
                  Todo
                </button>
                <span className="text-gray-300 dark:text-white/20 text-[10px]">·</span>
                <button
                  type="button"
                  onClick={() => onSetAll(modKey, null, false)}
                  className="text-[10px] text-gray-400 dark:text-gray-500 hover:underline leading-none"
                >
                  Nada
                </button>
              </div>
            )}
          </button>
        </td>
      </tr>

      {/* ── Submodule rows ── */}
      {open && subs.map(([subKey, subLabel]) => {
        const activeActions = (draft[modKey]?.[subKey] ?? []) as ActionKey[];
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
                "text-[13px] pl-8",
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
                    onChange={() => onToggle(modKey, subKey, action)}
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
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function RolesPage() {
  const { can } = usePermissions();
  const canManage = can("accesos", "accesos", "editar");

  // jul 2026 — Filtrar el MODULE_TREE por los módulos activos de la empresa.
  // El superadmin de plataforma sigue viendo todos (puede editar roles de
  // cualquier empresa). Para admins de empresa, sólo se muestran los
  // módulos que la empresa tiene habilitados (mismo criterio que el menú
  // lateral y el editor de usuarios). Coincide con la validación del
  // backend: PUT /roles/:id rechaza submódulos cuyo módulo no esté en
  // `companyModules`, así que mostrar menos acá no rompe la UX pero sí
  // la alinea.
  // jul 2026 v9 — Mismo fix que Reports/page.tsx: filtrar por
  // `companyModules` siempre que haya contexto de empresa, sin
  // eximir al superadmin. Sin `companyId` (master) mostramos todo.
  const { session } = useAuth();
  const companyModules = (session?.companyModules ?? []) as string[];
  const hasCompanyContext = !!session?.companyId;
  const visibleModuleKeys = useMemo(() => {
    if (!hasCompanyContext) return Object.keys(MODULE_TREE);
    if (companyModules.length === 0) return Object.keys(MODULE_TREE);
    return Object.keys(MODULE_TREE).filter((k) => companyModules.includes(k));
  }, [hasCompanyContext, companyModules.length, companyModules.join("|")]);

  const { roles, loading, createRole, updateRole, deleteRole } = useCompanyRoles();

  useEffect(() => {
    try {
      localStorage.removeItem("aplismart_role_permissions");
      localStorage.removeItem("aplismart_custom_roles_v1");
    } catch { /* silent */ }
  }, []);

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [draft, setDraft]                   = useState<PermissionMap>({});
  const [dirty, setDirty]                   = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [showNewRoleModal, setShowNewRoleModal] = useState(false);
  const [pendingDelete, setPendingDelete]   = useState<CompanyRole | null>(null);

  useEffect(() => {
    if (roles.length === 0) { setSelectedRoleId(null); return; }
    if (!selectedRoleId || !roles.find((r) => r.id === selectedRoleId)) {
      const first = roles[0];
      setSelectedRoleId(first.id);
      setDraft(first.permissions ?? {});
      setDirty(false);
    }
  }, [roles, selectedRoleId]);

  const selectedRole = useMemo<CompanyRole | null>(
    () => roles.find((r) => r.id === selectedRoleId) ?? null,
    [roles, selectedRoleId],
  );

  const handleSelectRole = (id: string) => {
    const r = roles.find((x) => x.id === id);
    if (!r) return;
    setSelectedRoleId(id);
    setDraft(r.permissions ?? {});
    setDirty(false);
  };

  const handleToggleAction = (mod: string, sub: string, action: ActionKey) => {
    if (!canManage) return;
    setDraft((prev) => {
      const current = (prev[mod]?.[sub] ?? []) as ActionKey[];
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
    if (!canManage) return;
    setDraft((prev) => {
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
    if (!canManage || !selectedRole) return;
    setSaving(true);
    try {
      await updateRole(selectedRole.id, { permissions: draft });
      setDirty(false);
      toast.success("Plantilla guardada", { description: `Permisos de "${selectedRole.label}" actualizados.` });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!canManage || !selectedRole) return;
    setDraft(selectedRole.permissions ?? {});
    setDirty(false);
  };

  const handleCreateRole = async (def: { label: string; description: string; sourceKey: string; palette: string }) => {
    if (!canManage) return;
    const existingKeys = new Set(roles.map((r) => r.key));
    let baseKey = slugify(def.label) || `rol_${Date.now()}`;
    let key = baseKey;
    let suffix = 1;
    while (existingKeys.has(key)) key = `${baseKey}_${suffix++}`;
    const sourceRole = roles.find((r) => r.key === def.sourceKey);
    const seed = sourceRole?.permissions ?? {};
    try {
      await createRole({ key, label: def.label.trim(), description: def.description.trim(), palette: def.palette, permissions: seed });
      setShowNewRoleModal(false);
      toast.success("Rol creado", { description: `"${def.label.trim()}" se agregó a las plantillas.` });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear el rol");
    }
  };

  const handleDeleteRole = (id: string) => {
    if (!canManage) return;
    const role = roles.find((r) => r.id === id);
    if (!role) return;
    if (role.isSystem) { toast.error("Los roles del sistema no se pueden eliminar."); return; }
    setPendingDelete(role);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const role = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteRole(role.id);
      toast.success("Plantilla eliminada", { description: `"${role.label}" se quitó de la lista.` });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    }
  };

  const totalPerms = countPerms(draft);

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
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-3 md:flex-wrap">
          <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide shrink-0">
            Rol
          </span>

          <div className="flex gap-2 flex-wrap">
            {loading ? (
              <span className="text-xs text-gray-400 dark:text-gray-500">Cargando…</span>
            ) : roles.length === 0 ? (
              <span className="text-xs text-gray-400 dark:text-gray-500">Aún no hay roles. Crea el primero.</span>
            ) : (
              roles.map((role) => {
                const isActive = selectedRoleId === role.id;
                const palette = paletteCls(role.palette);
                const count = countPerms(role.permissions ?? {});
                return (
                  <div key={role.id} className="relative group">
                    <motion.button
                      type="button"
                      onClick={() => handleSelectRole(role.id)}
                      whileTap={{ scale: 0.94 }}
                      className={[
                        "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all duration-200",
                        isActive
                          ? palette.activeCls
                          : "border-gray-200 dark:border-white/[0.08] text-gray-600 dark:text-gray-400 bg-transparent hover:bg-gray-50 dark:hover:bg-white/[0.04]",
                      ].join(" ")}
                    >
                      {role.label}
                      {count > 0 && (
                        <span className={[
                          "text-[10px] font-bold tabular-nums rounded-full px-1.5 py-0.5 leading-none",
                          isActive ? palette.countCls : "bg-gray-100 dark:bg-white/[0.08] text-gray-500 dark:text-gray-400",
                        ].join(" ")}>
                          {count}
                        </span>
                      )}
                      {!role.isSystem && canManage && (
                        <span
                          role="button"
                          tabIndex={-1}
                          onClick={(e) => { e.stopPropagation(); void handleDeleteRole(role.id); }}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void handleDeleteRole(role.id); }}}
                          className="ml-0.5 -mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-black/15 hover:bg-red-500 hover:text-white cursor-pointer transition-colors"
                          title="Eliminar plantilla"
                        >
                          <X size={9} strokeWidth={3} />
                        </span>
                      )}
                    </motion.button>
                  </div>
                );
              })
            )}

            {canManage && (
              <button
                type="button"
                onClick={() => setShowNewRoleModal(true)}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 dark:border-white/[0.12] px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:border-blue-400 dark:hover:border-blue-500/50 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/5 transition-all"
              >
                <Plus size={13} />
                Nuevo rol
              </button>
            )}
          </div>

          <div className="hidden h-5 w-px bg-gray-200 dark:bg-white/[0.08] shrink-0 md:block" />

          <div className="flex gap-2 flex-wrap">
            {PLATFORM_ROLES.map((role) => (
              <span key={role.key}
                className="inline-flex items-center gap-1.5 rounded-full border border-green-200 dark:border-green-500/20 bg-green-50 dark:bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-700 dark:text-green-400">
                {role.label}
                <span className="opacity-60 text-[10px]">acceso total</span>
              </span>
            ))}
          </div>

          <div className="md:ml-auto flex flex-wrap items-center gap-2 shrink-0">
            <AnimatePresence>
              {dirty && (
                <motion.span
                  initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
                  className="text-xs rounded-full border px-2.5 py-1 font-medium bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20"
                >
                  Sin guardar
                </motion.span>
              )}
            </AnimatePresence>
            {canManage && (
              <>
                <button type="button" onClick={handleReset}
                  className="rounded-lg border border-gray-200 dark:border-white/[0.06] px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition">
                  Restaurar
                </button>
                <button type="button" onClick={handleSave} disabled={!dirty || saving}
                  className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-1.5 text-xs font-medium text-white transition">
                  {saving ? "Guardando…" : "Guardar plantilla"}
                </button>
              </>
            )}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {selectedRole && (
            <motion.div
              key={selectedRole.id}
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.14 }}
              className="mt-2.5 flex items-center gap-2 flex-wrap"
            >
              <span className="text-xs text-gray-400 dark:text-gray-500">{selectedRole.description}</span>
              <span className="text-gray-300 dark:text-white/20 text-xs">·</span>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {totalPerms} permiso{totalPerms !== 1 ? "s" : ""} activo{totalPerms !== 1 ? "s" : ""}
              </span>
              {selectedRole.isSystem && (
                <span className="text-[10px] font-semibold rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-0.5">
                  Sistema
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Permissions table ── */}
      <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] flex flex-col min-h-0 flex-1 overflow-hidden">

        {/* Sticky header */}
        <div className="shrink-0 border-b border-gray-100 dark:border-white/[0.06] overflow-x-auto" style={{ scrollbarWidth: "thin" }}>
          <table className="w-full table-fixed min-w-[560px]">
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
                  <th key={action} className="px-2 py-3 text-center text-[11px] font-semibold uppercase tracking-wider">
                    <span className={["inline-flex items-center gap-1 rounded-full px-2 py-0.5", ACTION_CONFIG[action].color].join(" ")}>
                      <span className={["h-1.5 w-1.5 rounded-full", ACTION_CONFIG[action].dot].join(" ")} />
                      {ACTION_CONFIG[action].label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
          </table>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto overflow-x-auto flex-1" style={{ scrollbarWidth: "thin" }}>
          <AnimatePresence mode="wait">
            <motion.table
              key={selectedRoleId ?? "none"}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16 }}
              className="w-full table-fixed min-w-[560px]"
            >
              <colgroup>
                <col className="w-[44%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
              </colgroup>
              <tbody>
                {visibleModuleKeys.map((modKey) => {
                  const modDef = MODULE_TREE[modKey as keyof typeof MODULE_TREE];
                  if (!modDef) return null;
                  return (
                    <ModuleSection
                      key={modKey}
                      modKey={modKey}
                      modDef={modDef}
                      draft={draft}
                      canManage={canManage}
                      onToggle={handleToggleAction}
                      onSetAll={handleSetAll}
                    />
                  );
                })}
              </tbody>
            </motion.table>
          </AnimatePresence>
        </div>
      </div>

      {!canManage && (
        <div className="rounded-xl border border-yellow-200 dark:border-yellow-500/20 bg-yellow-50 dark:bg-yellow-500/10 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-400 shrink-0">
          Solo administradores pueden modificar las plantillas de permisos.
        </div>
      )}

      <NewRoleModal
        open={showNewRoleModal}
        onClose={() => setShowNewRoleModal(false)}
        existingRoles={roles}
        onCreate={handleCreateRole}
      />

      <ConfirmModal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="Eliminar plantilla"
        tone="danger"
        confirmLabel="Eliminar"
        description={
          pendingDelete
            ? <>¿Eliminar la plantilla <strong className="text-gray-800 dark:text-white">{pendingDelete.label}</strong>? Los usuarios con este rol quedarán sin asignar.</>
            : null
        }
      />
    </div>
  );
}

// ─── New Role Modal ───────────────────────────────────────────────────────────

function NewRoleModal({ open, onClose, existingRoles, onCreate }: {
  open: boolean;
  onClose: () => void;
  existingRoles: CompanyRole[];
  onCreate: (def: { label: string; description: string; sourceKey: string; palette: string }) => void;
}) {
  const [label, setLabel]             = useState("");
  const [description, setDescription] = useState("");
  const [sourceKey, setSourceKey]     = useState(existingRoles[0]?.key ?? "supervisor");
  const [palette, setPalette]         = useState(PALETTES[0].name);
  const [touched, setTouched]         = useState(false);

  useEffect(() => {
    if (open) {
      setLabel(""); setDescription("");
      setSourceKey(existingRoles[0]?.key ?? "supervisor");
      setPalette(PALETTES[0].name);
      setTouched(false);
    }
  }, [open, existingRoles]);

  const trimmed = label.trim();
  const isValid = trimmed.length >= 2 && trimmed.length <= 60;
  const willShowError = touched && !isValid;

  const handleSubmit = () => {
    setTouched(true);
    if (!isValid) return;
    onCreate({ label: trimmed, description: description.trim(), sourceKey, palette });
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2"
          >
            <div className="rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-white/[0.06]">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500">Nueva plantilla</p>
                  <h2 className="mt-0.5 text-base font-semibold text-gray-800 dark:text-white">Crear rol personalizado</h2>
                </div>
                <button type="button" onClick={onClose}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition">
                  <X size={14} />
                </button>
              </div>

              <div className="px-5 py-4 space-y-3.5">
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                    Nombre del rol *
                  </label>
                  <input
                    type="text" value={label} maxLength={60}
                    onChange={(e) => setLabel(e.target.value.slice(0, 60))}
                    placeholder="Ej. Mecánico líder" autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                    className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/10 transition"
                  />
                  {willShowError && (
                    <p className="mt-1 text-xs text-rose-500">El nombre debe tener entre 2 y 60 caracteres.</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                    Descripción
                  </label>
                  <textarea value={description} maxLength={250}
                    onChange={(e) => setDescription(e.target.value.slice(0, 250))}
                    placeholder="Responsabilidades o alcance del rol (opcional)" rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] text-sm text-gray-800 dark:text-white placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/10 transition resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                      Copiar permisos de
                    </label>
                    <select value={sourceKey} onChange={(e) => setSourceKey(e.target.value)}
                      className="w-full h-10 px-3 pr-8 rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] text-sm text-gray-800 dark:text-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/10 appearance-none transition">
                      {existingRoles.map((r) => (
                        <option key={r.id} value={r.key}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                      Color
                    </label>
                    <div className="flex gap-1.5">
                      {PALETTES.map((p) => (
                        <button key={p.name} type="button" onClick={() => setPalette(p.name)}
                          className={`h-10 flex-1 rounded-lg ${p.activeCls} text-[10px] font-semibold uppercase tracking-wider ring-2 ${palette === p.name ? "ring-blue-500" : "ring-transparent hover:ring-gray-300 dark:hover:ring-white/20"} transition`}
                          title={p.name}>
                          {p.name.slice(0, 1)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                  Se creará la plantilla <code className="px-1 py-0.5 rounded bg-gray-100 dark:bg-white/[0.06]">{slugify(label) || "rol"}</code> con {existingRoles.length + 1}° orden en la lista.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-gray-200 dark:border-white/[0.06] bg-gray-50 dark:bg-white/[0.02]">
                <button type="button" onClick={onClose}
                  className="rounded-lg border border-gray-200 dark:border-white/[0.08] px-3.5 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.04] transition">
                  Cancelar
                </button>
                <button type="button" onClick={handleSubmit} disabled={!isValid}
                  className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-1.5 text-sm font-medium text-white transition">
                  Crear plantilla
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}