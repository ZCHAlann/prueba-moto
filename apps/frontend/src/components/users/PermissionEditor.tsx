"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Eye, Plus, Pencil, Trash2, Check, Sparkles, Layers,
  ChevronDown, RotateCcw, CheckCircle2, Settings, Users,
} from "lucide-react";
import { MODULE_TREE, type ActionKey, type PermissionMap } from "../../lib/module-tree";

/* ── Configuración de las acciones (botones coloridos) ──────────────────── */

const ACTIONS: ActionKey[] = ["ver", "crear", "editar", "eliminar"];

// jul 2026 v4-b — Acciones extra que SOLO aplican a submódulos puntuales.
// El editor las suma automáticamente a los chips del submódulo indicado.
// Esto permite exponer permisos granulares como "ver_todos" sin pedirle
// al admin que sepa el string exacto.
const EXTRA_ACTIONS_BY_SUB: Record<string, ActionKey[]> = {
  // Caja Chica: el admin configura visibilidad por pestaña y bypass por dueño.
  "finanzas.caja_chica": [
    "ver_solicitudes",
    "ver_vales",
    "ver_historial",
    "configurar_caja",
    "aprobar",
    "reponer",
    "ver_todos",
  ],
  // Checklists — mantener 'aprobar' como acción específica.
  "checklist.reautorizaciones": ["aprobar", "crear"],
  // Geolocalización / Reportes / etc.: aquí se podrán agregar en el futuro.
};

const EXTRA_ACTION_LABELS: Record<ActionKey, string> = {
  ver:        "Ver",
  crear:      "Crear",
  editar:     "Editar",
  eliminar:   "Eliminar",
  aprobar:    "Aprobar",
  reponer:    "Reponer",
  // v4-b
  ver_solicitudes: "Ver · Solicitudes",
  ver_vales:       "Ver · Vales",
  ver_historial:   "Ver · Historial",
  configurar_caja: "Configurar caja",
  ver_todos:       "Ver todos",
};

const EXTRA_ACTION_STYLES: Record<ActionKey, string> = {
  ver:        "bg-blue-600 text-white border-blue-600",
  crear:      "bg-emerald-600 text-white border-emerald-600",
  editar:     "bg-amber-500 text-white border-amber-500",
  eliminar:   "bg-rose-600 text-white border-rose-600",
  aprobar:    "bg-violet-600 text-white border-violet-600",
  reponer:    "bg-cyan-600 text-white border-cyan-600",
  // v4-b — chips con estilo distintivo para que el admin las reconozca
  ver_solicitudes: "bg-slate-600 text-white border-slate-600",
  ver_vales:       "bg-slate-600 text-white border-slate-600",
  ver_historial:   "bg-slate-600 text-white border-slate-600",
  configurar_caja: "bg-indigo-600 text-white border-indigo-600",
  ver_todos:       "bg-pink-600 text-white border-pink-600",
};

/** Devuelve el set completo de acciones disponibles para un (mod, sub). */
function actionsFor(mod: string, sub: string): ActionKey[] {
  const base = [...ACTIONS];
  const extras = EXTRA_ACTIONS_BY_SUB[`${mod}.${sub}`];
  if (extras) base.push(...extras);
  return base;
}

const ACTION_STYLES: Record<ActionKey, {
  Icon: React.ElementType;
  active: string;
  inactive: string;
  label: string;
  description: string;
}> = {
  ver: {
    Icon: Eye,
    active: "bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-500/30",
    inactive: "bg-transparent text-gray-500 dark:text-gray-400 border-gray-200 dark:border-white/10 hover:border-blue-300 dark:hover:border-blue-500/40 hover:text-blue-600 dark:hover:text-blue-400",
    label: "Ver",
    description: "Puede consultar y abrir registros",
  },
  crear: {
    Icon: Plus,
    active: "bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-500/30",
    inactive: "bg-transparent text-gray-500 dark:text-gray-400 border-gray-200 dark:border-white/10 hover:border-emerald-300 dark:hover:border-emerald-500/40 hover:text-emerald-600 dark:hover:text-emerald-400",
    label: "Crear",
    description: "Puede registrar elementos nuevos",
  },
  editar: {
    Icon: Pencil,
    active: "bg-amber-500 text-white border-amber-500 shadow-sm shadow-amber-500/30",
    inactive: "bg-transparent text-gray-500 dark:text-gray-400 border-gray-200 dark:border-white/10 hover:border-amber-300 dark:hover:border-amber-500/40 hover:text-amber-600 dark:hover:text-amber-400",
    label: "Editar",
    description: "Puede modificar registros existentes",
  },
  eliminar: {
    Icon: Trash2,
    active: "bg-rose-600 text-white border-rose-600 shadow-sm shadow-rose-500/30",
    inactive: "bg-transparent text-gray-500 dark:text-gray-400 border-gray-200 dark:border-white/10 hover:border-rose-300 dark:hover:border-rose-500/40 hover:text-rose-600 dark:hover:text-rose-400",
    label: "Eliminar",
    description: "Puede borrar o desactivar registros",
  },
  // jul 2026 v4-b
  aprobar: {
    Icon: Check,
    active: "bg-violet-600 text-white border-violet-600 shadow-sm shadow-violet-500/30",
    inactive: "bg-transparent text-gray-500 dark:text-gray-400 border-gray-200 dark:border-white/10 hover:border-violet-300 dark:hover:border-violet-500/40 hover:text-violet-600 dark:hover:text-violet-400",
    label: "Aprobar",
    description: "Puede aprobar / rechazar solicitudes",
  },
  reponer: {
    Icon: RotateCcw,
    active: "bg-cyan-600 text-white border-cyan-600 shadow-sm shadow-cyan-500/30",
    inactive: "bg-transparent text-gray-500 dark:text-gray-400 border-gray-200 dark:border-white/10 hover:border-cyan-300 dark:hover:border-cyan-500/40 hover:text-cyan-600 dark:hover:text-cyan-400",
    label: "Reponer",
    description: "Puede rellenar / resetear caja chica",
  },
  ver_solicitudes: {
    Icon: Eye,
    active: "bg-slate-600 text-white border-slate-600 shadow-sm shadow-slate-500/30",
    inactive: "bg-transparent text-gray-500 dark:text-gray-400 border-gray-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-slate-500/40 hover:text-slate-600 dark:hover:text-slate-300",
    label: "Ver · Solicitudes",
    description: "Muestra la pestaña de Solicitudes",
  },
  ver_vales: {
    Icon: Eye,
    active: "bg-slate-600 text-white border-slate-600 shadow-sm shadow-slate-500/30",
    inactive: "bg-transparent text-gray-500 dark:text-gray-400 border-gray-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-slate-500/40 hover:text-slate-600 dark:hover:text-slate-300",
    label: "Ver · Vales",
    description: "Muestra la pestaña de Vales",
  },
  ver_historial: {
    Icon: Eye,
    active: "bg-slate-600 text-white border-slate-600 shadow-sm shadow-slate-500/30",
    inactive: "bg-transparent text-gray-500 dark:text-gray-400 border-gray-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-slate-500/40 hover:text-slate-600 dark:hover:text-slate-300",
    label: "Ver · Historial",
    description: "Muestra la pestaña de Historial",
  },
  configurar_caja: {
    Icon: Settings,
    active: "bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-500/30",
    inactive: "bg-transparent text-gray-500 dark:text-gray-400 border-gray-200 dark:border-white/10 hover:border-indigo-300 dark:hover:border-indigo-500/40 hover:text-indigo-600 dark:hover:text-indigo-400",
    label: "Configurar caja",
    description: "Acceso a la pestaña Configuración (cuentas, límites)",
  },
  ver_todos: {
    Icon: Users,
    active: "bg-pink-600 text-white border-pink-600 shadow-sm shadow-pink-500/30",
    inactive: "bg-transparent text-gray-500 dark:text-gray-400 border-gray-200 dark:border-white/10 hover:border-pink-300 dark:hover:border-pink-500/40 hover:text-pink-600 dark:hover:text-pink-400",
    label: "Ver todos",
    description: "Bypass de filtro por dueño: ve todas las solicitudes/vales de la empresa",
  },
};

/* ── Helpers ──────────────────────────────────────────────────────────── */

// jul 2026 v6 — Normaliza el shape de `submodules` del MODULE_TREE. Los
// submódulos pueden ser un string plano (caso legacy) o un objeto
// { label, requires? } (caso nuevo con gating por módulo de empresa).
function subLabel(mod: string, sub: string): string {
  const def = (MODULE_TREE[mod as keyof typeof MODULE_TREE]?.submodules as Record<string, unknown> | undefined)?.[sub];
  if (typeof def === "string") return def;
  if (def && typeof def === "object" && "label" in (def as Record<string, unknown>)) {
    return String((def as { label: string }).label);
  }
  return sub;
}

function subRequires(mod: string, sub: string): string[] {
  const def = (MODULE_TREE[mod as keyof typeof MODULE_TREE]?.submodules as Record<string, unknown> | undefined)?.[sub];
  if (def && typeof def === "object" && "requires" in (def as Record<string, unknown>)) {
    const r = (def as { requires?: string[] }).requires;
    return Array.isArray(r) ? r : [];
  }
  return [];
}

// jul 2026 v6 — Wrapper simple para que el JSX quede legible. Acepta
// submódulos como string (legacy) o como { label, requires? }.
function renderSubLabel(mod: string, sub: string): string {
  return subLabel(mod, sub);
}

function isModuleAll(perms: PermissionMap, mod: string): boolean {
  const modDef = MODULE_TREE[mod as keyof typeof MODULE_TREE];
  if (!modDef) return false;
  return Object.keys(modDef.submodules).every((sub) =>
    ACTIONS.every((a) => (perms[mod]?.[sub] ?? []).includes(a)),
  );
}

function isModuleNone(perms: PermissionMap, mod: string): boolean {
  const modDef = MODULE_TREE[mod as keyof typeof MODULE_TREE];
  if (!modDef) return true;
  return Object.keys(modDef.submodules).every((sub) =>
    (perms[mod]?.[sub] ?? []).length === 0,
  );
}

/** Cuenta permisos activos / posibles de un módulo, sumando todos sus
 *  submódulos. Ej: 2 submódulos con "ver" cada uno → { active: 2, total: 8 }. */
function countModuleProgress(perms: PermissionMap, mod: string): { active: number; total: number } {
  const modDef = MODULE_TREE[mod as keyof typeof MODULE_TREE];
  if (!modDef) return { active: 0, total: 0 };
  const subs = Object.keys(modDef.submodules);
  let active = 0;
  for (const sub of subs) {
    active += (perms[mod]?.[sub] ?? []).length;
  }
  return { active, total: subs.length * ACTIONS.length };
}

/* ── Componente principal ──────────────────────────────────────────────── */

type Props = {
  permissions: PermissionMap;
  onChange: (next: PermissionMap) => void;
  /** Permiso que se va a aplicar como "plantilla" del rol. */
  defaultPermissions?: PermissionMap;
  /**
   * Si el usuario siendo editado es admin_empresa u owner_empresa,
   * mostramos todos los permisos ya activados y deshabilitamos la edición
   * (porque tienen acceso total por construcción).
   */
  readOnlyWithFullAccess?: boolean;
  /**
   * Snapshot de los permisos originales al abrir el editor. Si está
   * presente, se muestra un botón "Permisos actuales" que restaura
   * este objeto. Solo aplica en modo edición.
   */
  originalPermissions?: PermissionMap;
  /**
   * Si es true, muestra los permisos del rol + los del user sumados en
   * la vista (modo "preview"). El admin edita y se guarda en `permissions`
   * lo que él defina. Por defecto false.
   */
  combineWithRole?: boolean;
  /**
   * Lista de módulos habilitados para la empresa (lo que el owner/admin
   * configuró al crear/editar la empresa, p.ej. ["flotas", "conductores"]).
   * Si se pasa, el editor SOLO muestra los módulos de esta lista — no se
   * pueden asignar permisos a un módulo que la empresa no tiene activo.
   * Si es undefined o vacío, se muestran todos los del MODULE_TREE
   * (modo "system" donde no hay restricción de empresa).
   */
  enabledModules?: string[];
};

/** True si el objeto de permisos tiene al menos una acción en cualquier
 *  submódulo (es decir, el user tiene un override per-user no vacío). */
export function hasAnyPermission(permissions: PermissionMap): boolean {
  if (!permissions) return false;
  for (const subs of Object.values(permissions)) {
    if (!subs) continue;
    for (const actions of Object.values(subs)) {
      if (Array.isArray(actions) && actions.length > 0) return true;
    }
  }
  return false;
}

export function PermissionEditor({
  permissions,
  onChange,
  defaultPermissions,
  readOnlyWithFullAccess = false,
  originalPermissions,
  combineWithRole = false,
  enabledModules,
}: Props) {
  const hasUserOverride = hasAnyPermission(permissions);

  // Acordeón: solo un módulo abierto a la vez. `null` = todos cerrados.
  // Se inicializa cerrado y SOLO cambia por clicks del usuario (no se
  // resetea cuando cambian `permissions` ni `defaultPermissions`, p.ej.
  // al elegir otro rol en el selector del padre).
  const [openModule, setOpenModule] = useState<string | null>(null);
  const [filter, setFilter] = useState<"todos" | "asignados" | "vacios">("todos");

  // Si `enabledModules` está definido y no está vacío, el editor SOLO
  // expone los módulos habilitados por la empresa. Si es undefined o
  // vacío, mostramos todos los del MODULE_TREE (modo "system / sin
  // restricción de empresa" — ej. superadmin de plataforma).
  const moduleKeys = useMemo(() => {
    const all = Object.keys(MODULE_TREE);
    if (!enabledModules || enabledModules.length === 0) return all;
    const set = new Set(enabledModules);
    return all.filter((m) => set.has(m));
  }, [enabledModules]);

  // Limpia cualquier permiso cuyo módulo ya no esté habilitado por la
  // empresa, para que al guardar no se queden permisos "huérfanos" sobre
  // módulos que la empresa desactivó.
  const stripDisabledModules = (next: PermissionMap): PermissionMap => {
    if (!enabledModules || enabledModules.length === 0) return next;
    const set = new Set(enabledModules);
    const out: PermissionMap = {};
    for (const [mod, subs] of Object.entries(next)) {
      if (!set.has(mod)) continue;
      out[mod] = subs;
    }
    return out;
  };

  // Si combineWithRole es true, el editor VISUALIZA los permisos del rol
  // (defaultPermissions) sumados a los del user (permissions), pero al
  // guardar (onChange) solo se persiste lo que el user tiene per-user.
  // El admin edita sobre la vista combinada y eso crea/reemplaza el
  // override per-user automáticamente.
  const displayedPerms: PermissionMap = useMemo(() => {
    if (!combineWithRole || !defaultPermissions) return permissions;
    const merged: PermissionMap = {};
    // 1) Copiamos los del rol
    for (const [mod, subs] of Object.entries(defaultPermissions)) {
      merged[mod] = {};
      for (const [sub, actions] of Object.entries(subs ?? {})) {
        merged[mod][sub] = Array.from(new Set(actions ?? []));
      }
    }
    // 2) Sumamos los del user
    for (const [mod, subs] of Object.entries(permissions)) {
      if (!merged[mod]) merged[mod] = {};
      for (const [sub, actions] of Object.entries(subs ?? {})) {
        const existing = merged[mod][sub] ?? [];
        merged[mod][sub] = Array.from(new Set([...existing, ...(actions ?? [])]));
      }
    }
    return merged;
  }, [combineWithRole, defaultPermissions, permissions]);

  // Wrapper de onChange: si combineWithRole, traducimos los cambios
  // sobre la vista combinada a "lo que debe persistir en el user".
  // La estrategia: al activar/desactivar un permiso en la vista, lo
  // guardamos en el override per-user SOLO si difiere de los permisos
  // del rol. Si coincide con el rol, no lo guardamos (no se duplica).
  const handleChange = (next: PermissionMap) => {
    const cleaned = stripDisabledModules(next);
    if (!combineWithRole || !defaultPermissions) {
      onChange(cleaned);
      return;
    }
    // next es la vista combinada. Extraemos solo lo que NO está en el
    // rol (= override del user).
    const userOnly: PermissionMap = {};
    for (const [mod, subs] of Object.entries(cleaned)) {
      for (const [sub, actions] of Object.entries(subs ?? {})) {
        const roleActions = defaultPermissions[mod]?.[sub] ?? [];
        const roleSet = new Set(roleActions);
        // Lo que el user tiene extra sobre el rol
        const extras = (actions ?? []).filter((a) => !roleSet.has(a));
        if (extras.length > 0) {
          if (!userOnly[mod]) userOnly[mod] = {};
          userOnly[mod][sub] = extras;
        }
      }
    }
    onChange(userOnly);
  };

  // Restaurar los permisos originales (los que el user tenía al abrir el modal)
  const restoreOriginal = () => {
    if (originalPermissions) onChange(stripDisabledModules(JSON.parse(JSON.stringify(originalPermissions))));
  };

  // Quitar TODO el override (volver a heredar del rol)
  const clearAll = () => {
    onChange({});
  };

  const visibleMods = useMemo(() => {
    if (filter === "todos") return moduleKeys;
    return moduleKeys.filter((m) => {
      if (filter === "asignados") return !isModuleNone(displayedPerms, m);
      return isModuleNone(displayedPerms, m);
    });
  }, [filter, moduleKeys, displayedPerms]);

  // Permisos efectivos que se renderizan. Si es admin/owner, se
  // muestran todos los del MODULE_TREE ya marcados (sin tocar `permissions`).
  const effectivePerms: PermissionMap = useMemo(() => {
    if (!readOnlyWithFullAccess) return displayedPerms;
    const full: PermissionMap = {};
    for (const [mod, def] of Object.entries(MODULE_TREE)) {
      full[mod] = {};
      for (const sub of Object.keys(def.submodules)) {
        full[mod][sub] = [...ACTIONS];
      }
    }
    return full;
  }, [displayedPerms, readOnlyWithFullAccess]);

  const toggle = (mod: string, sub: string, action: ActionKey) => {
    if (readOnlyWithFullAccess) return;
    const current = displayedPerms[mod]?.[sub] ?? [];
    let next: ActionKey[];

    if (action === "ver") {
      next = current.includes("ver") ? [] : ["ver"];
    } else {
      if (current.includes(action)) {
        next = current.filter((a) => a !== action);
      } else {
        next = current.includes("ver")
          ? [...current, action]
          : ["ver", ...current, action];
      }
    }

    handleChange({
      ...displayedPerms,
      [mod]: {
        ...(displayedPerms[mod] ?? {}),
        [sub]: next,
      },
    });
  };

  const setModuleAll = (mod: string, all: boolean) => {
    if (readOnlyWithFullAccess) return;
    const modDef = MODULE_TREE[mod as keyof typeof MODULE_TREE];
    if (!modDef) return;
    const updated: Record<string, ActionKey[]> = {};
    for (const sub of Object.keys(modDef.submodules)) {
      updated[sub] = all ? [...ACTIONS] : [];
    }
    handleChange({ ...displayedPerms, [mod]: updated });
  };

  const applyTemplate = () => {
    if (readOnlyWithFullAccess) return;
    if (!defaultPermissions) return;
    // Reemplaza el override con los permisos del rol (clon profundo),
    // pasando por handleChange para que respete combineWithRole.
    handleChange(JSON.parse(JSON.stringify(defaultPermissions)));
  };

  const toggleModule = (mod: string) => {
    setOpenModule((prev) => (prev === mod ? null : mod));
  };

  return (
    <div className="space-y-4">
      {/* ── Toolbar: filtros + acciones rápidas ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.04] p-0.5">
          {([
            { id: "todos",     label: "Todos" },
            { id: "asignados", label: "Con acceso" },
            { id: "vacios",    label: "Vacíos" },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFilter(opt.id)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                filter === opt.id
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {defaultPermissions && !readOnlyWithFullAccess && (
            <button
              type="button"
              onClick={applyTemplate}
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 dark:border-violet-500/30 bg-violet-50 dark:bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300 transition hover:bg-violet-100 dark:hover:bg-violet-500/20"
            >
              <Sparkles size={12} />
              Aplicar plantilla
            </button>
          )}
          {originalPermissions && !readOnlyWithFullAccess && (
            <button
              type="button"
              onClick={restoreOriginal}
              title="Descarta todos los cambios manuales y restaura los permisos que el usuario tiene actualmente guardados"
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 transition hover:bg-amber-100 dark:hover:bg-amber-500/20"
            >
              <RotateCcw size={12} />
              Permisos actuales
            </button>
          )}
          {!readOnlyWithFullAccess && (
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-400 transition hover:bg-gray-50 dark:hover:bg-white/[0.06]"
            >
              <RotateCcw size={12} />
              Limpiar todo
            </button>
          )}
        </div>
      </div>

      {/* ── Banner para admin/owner ── */}
      {readOnlyWithFullAccess && (
        <div className="flex items-start gap-3 rounded-xl border border-purple-200 dark:border-purple-500/30 bg-purple-50 dark:bg-purple-500/10 px-4 py-3">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-purple-600 dark:text-purple-400" />
          <div>
            <p className="text-sm font-semibold text-purple-700 dark:text-purple-300">
              Acceso total habilitado
            </p>
            <p className="mt-0.5 text-xs text-purple-700/80 dark:text-purple-300/80">
              Este usuario tiene rol con acceso total. Los permisos granulares no aplican.
            </p>
          </div>
        </div>
      )}

      {/* ── Banner: ¿tiene override per-user o hereda del rol? ── */}
      {!readOnlyWithFullAccess && !hasUserOverride && defaultPermissions && Object.keys(defaultPermissions).length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 px-4 py-3">
          <Layers size={18} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
              Heredando del rol
            </p>
            <p className="mt-0.5 text-xs text-blue-700/80 dark:text-blue-300/80">
              Los permisos del rol se aplican directamente. Si querés dar permisos
              personalizados a este usuario (que no dependen del rol), tocá cualquier
              permiso abajo o usá el botón <strong>Aplicar plantilla</strong> para
              copiarlos como override.
            </p>
          </div>
        </div>
      )}

      {!readOnlyWithFullAccess && hasUserOverride && defaultPermissions && Object.keys(defaultPermissions).length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3">
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
              Permisos personalizados
            </p>
            <p className="mt-0.5 text-xs text-amber-700/80 dark:text-amber-300/80">
              Este usuario tiene permisos definidos individualmente que prevalecen
              sobre los del rol. 
              <strong> Limpiar todo</strong>.
            </p>
          </div>
        </div>
      )}

      {/* ── Lista de módulos ── */}
      {visibleMods.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-8 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 dark:bg-white/[0.05] text-gray-400">
            <Layers size={18} />
          </div>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Sin módulos en este filtro</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            Cambia el filtro para ver más resultados.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleMods.map((modKey) => {
            const modDef = MODULE_TREE[modKey as keyof typeof MODULE_TREE];
            // jul 2026 v6 — Filtramos submódulos por `requires`: si la
            // empresa no tiene los módulos requeridos (y la prop
            // `enabledModules` está definida), ocultamos el submódulo
            // del editor. Así no se asignan permisos a cards que la
            // empresa no va a poder mostrar (ej. KPIs de mantenimiento
            // si la empresa no tiene el módulo de mantenimiento).
            const allSubs = Object.keys(modDef.submodules);
            const subs    = enabledModules && enabledModules.length > 0
              ? allSubs.filter((s) => {
                  const reqs = subRequires(modKey, s);
                  if (reqs.length === 0) return true; // sin deps, siempre visible
                  return reqs.every((r) => enabledModules.includes(r));
                })
              : allSubs;
            const isOpen = openModule === modKey;
            const all    = isModuleAll(effectivePerms, modKey);
            const { active: activeCount, total: totalCount } = countModuleProgress(effectivePerms, modKey);

            return (
              <div
                key={modKey}
                className="overflow-hidden rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03]"
              >
                {/* Header */}
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => toggleModule(modKey)}
                    className="flex flex-1 items-center gap-2 text-left"
                  >
                    <ChevronDown
                      size={14}
                      className={`shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                    <p className="truncate text-sm font-semibold text-gray-800 dark:text-white">
                      {modDef.label}
                    </p>
                    {activeCount > 0 && (
                      <span
                        className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                          all
                            ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        }`}
                      >
                        {activeCount}/{totalCount}
                      </span>
                    )}
                    {all && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 size={10} /> Completo
                      </span>
                    )}
                  </button>

                  {!readOnlyWithFullAccess && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setModuleAll(modKey, true)}
                        className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Todos
                      </button>
                      <span className="text-gray-300 dark:text-white/20">·</span>
                      <button
                        type="button"
                        onClick={() => setModuleAll(modKey, false)}
                        className="text-xs font-medium text-gray-400 dark:text-gray-500 hover:underline"
                      >
                        Ninguno
                      </button>
                    </div>
                  )}
                </div>

                {/* Submódulos */}
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      key="content"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                      className="overflow-hidden border-t border-gray-100 dark:border-white/[0.04]"
                    >
                      <div className="divide-y divide-gray-100 dark:divide-white/[0.04]">
                        {subs.map((subKey) => {
                          const subLabel  = renderSubLabel(modKey, subKey);
                          const acts      = effectivePerms[modKey]?.[subKey] ?? [];
                          const subActive = acts.length;
                          // jul 2026 v4-b — Para Caja Chica y similares el set
                          // de acciones visibles puede ser > 4 (incluye
                          // ver_vales, ver_todos, etc.). Calculamos el denom.
                          const totalActions = actionsFor(modKey, subKey).length;

                          return (
                            <div
                              key={subKey}
                              className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <span
                                  className={`flex h-1.5 w-1.5 shrink-0 rounded-full ${
                                    subActive === totalActions
                                      ? "bg-emerald-500"
                                      : subActive > 0
                                      ? "bg-blue-500"
                                      : "bg-gray-300 dark:bg-gray-600"
                                  }`}
                                />
                                <span
                                  className={`truncate text-sm ${
                                    subActive > 0
                                      ? "text-gray-800 dark:text-white font-medium"
                                      : "text-gray-500 dark:text-gray-400"
                                  }`}
                                >
                                  {subLabel}
                                </span>
                                {subActive > 0 && (
                                  <span className="inline-flex shrink-0 items-center rounded-md bg-gray-100 dark:bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400">
                                    {subActive}/{totalActions}
                                  </span>
                                )}
                              </div>

                              {/* jul 2026 v4-b — Grid responsive en vez de flex-wrap
                                  para que las acciones queden alineadas en
                                  columnas, no amontonadas. Para Caja Chica
                                  con 11 acciones, el grid se adapta a 3 o 4
                                  columnas según el ancho del sub-row. */}
                              <div className="grid w-full grid-cols-2 gap-1.5 sm:max-w-md sm:grid-cols-3 lg:grid-cols-4">
                                {actionsFor(modKey, subKey).map((action) => {
                                  const v = ACTION_STYLES[action];
                                  const Icon = v.Icon;
                                  const isActive = acts.includes(action);
                                  return (
                                    <button
                                      key={action}
                                      type="button"
                                      onClick={() => toggle(modKey, subKey, action)}
                                      disabled={readOnlyWithFullAccess}
                                      title={v.description}
                                      className={`inline-flex items-center justify-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${
                                        isActive ? v.active : v.inactive
                                      } ${readOnlyWithFullAccess ? "cursor-default" : ""}`}
                                    >
                                      <Icon size={11} strokeWidth={2.2} />
                                      {v.label}
                                      {isActive && <Check size={10} strokeWidth={3} />}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}