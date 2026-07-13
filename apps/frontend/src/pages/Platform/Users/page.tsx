// src/pages/Platform/Users/page.tsx
import { useState, useMemo, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Users, ShieldCheck, Building2, UserPlus,
  Pencil, Trash2, X, Search, Filter,
  Mail, User, Lock, ChevronRight, Eye, EyeOff,
  Crown, Wrench, Headphones,
  BadgeCheck, UserCog, ChevronDown 
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../context/AuthContext";
import { usePlatformUsers }    from "../../../hooks/usePlatformUsers";
import { usePlatformCompanies } from "../../../hooks/usePlatformCompanies";
import { fmtDateShortEc } from "@/lib/datetime";
import {
  PlatformKpiCard, PlatformModal, ModalActions,
  InputField, SelectField,
} from "../../../components/platform";
import { StatusPill } from "../../../components/common/StatusPill";
import { MODULE_TREE, type ModuleKey } from "../../../lib/module-tree";
import type {
  PlatformUserRow, CompanyUserRow,
  CreatePlatformUserInput, CreateCompanyUserInput,
  UpdatePlatformUserInput, UpdateCompanyUserInput,
} from "../../../hooks/usePlatformUsers";

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_ROLES: PlatformUserRow["role"][] = ["superadmin", "admin_saas", "soporte"];
const COMPANY_ROLES:  CompanyUserRow["role"][]  = ["owner_empresa", "admin_empresa", "supervisor", "operador", "conductor"];
const MODULE_KEYS = Object.keys(MODULE_TREE) as ModuleKey[];

const PLATFORM_ROLE_META: Record<PlatformUserRow["role"], {
  label: string; icon: React.ReactNode;
  bg: string; text: string; border: string;
}> = {
  superadmin: { label: "Superadmin",  icon: <Crown size={11} />,      bg: "bg-violet-50 dark:bg-violet-500/10",  text: "text-violet-700 dark:text-violet-300",  border: "border-violet-200 dark:border-violet-500/20" },
  admin_saas: { label: "Admin SaaS",  icon: <ShieldCheck size={11} />,bg: "bg-brand-50 dark:bg-brand-500/10",    text: "text-brand-700 dark:text-brand-300",    border: "border-brand-200 dark:border-brand-500/20"   },
  soporte:    { label: "Soporte",     icon: <Headphones size={11} />, bg: "bg-amber-50 dark:bg-amber-500/10",    text: "text-amber-700 dark:text-amber-300",    border: "border-amber-200 dark:border-amber-500/20"   },
};

const COMPANY_ROLE_META: Record<CompanyUserRow["role"], {
  label: string; icon: React.ReactNode;
  bg: string; text: string; border: string;
}> = {
  owner_empresa:  { label: "Owner",      icon: <Crown size={11} />,      bg: "bg-violet-50 dark:bg-violet-500/10",  text: "text-violet-700 dark:text-violet-300",  border: "border-violet-200 dark:border-violet-500/20" },
  admin_empresa:  { label: "Admin",      icon: <UserCog size={11} />,    bg: "bg-brand-50 dark:bg-brand-500/10",    text: "text-brand-700 dark:text-brand-300",    border: "border-brand-200 dark:border-brand-500/20"   },
  supervisor:     { label: "Supervisor", icon: <BadgeCheck size={11} />, bg: "bg-emerald-50 dark:bg-emerald-500/10",text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200 dark:border-emerald-500/20"},
  operador:       { label: "Operador",   icon: <Wrench size={11} />,     bg: "bg-amber-50 dark:bg-amber-500/10",    text: "text-amber-700 dark:text-amber-300",    border: "border-amber-200 dark:border-amber-500/20"   },
  conductor:      { label: "Conductor",  icon: <User size={11} />,       bg: "bg-gray-50 dark:bg-white/[0.04]",     text: "text-gray-600 dark:text-gray-300",      border: "border-gray-200 dark:border-white/[0.08]"    },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(/[@.\s]/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
}

const AVATAR_COLORS = [
  ["bg-brand-100 dark:bg-brand-500/20",    "text-brand-700 dark:text-brand-300"],
  ["bg-violet-100 dark:bg-violet-500/20",  "text-violet-700 dark:text-violet-300"],
  ["bg-emerald-100 dark:bg-emerald-500/20","text-emerald-700 dark:text-emerald-300"],
  ["bg-amber-100 dark:bg-amber-500/20",    "text-amber-700 dark:text-amber-300"],
  ["bg-rose-100 dark:bg-rose-500/20",      "text-rose-700 dark:text-rose-300"],
  ["bg-cyan-100 dark:bg-cyan-500/20",      "text-cyan-700 dark:text-cyan-300"],
];

function avatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function fmtDate(d: string) {
  return fmtDateShortEc(d);
}

// ─── Role Badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role, type }: { role: string; type: "platform" | "company" }) {
  const meta = type === "platform"
    ? PLATFORM_ROLE_META[role as PlatformUserRow["role"]]
    : COMPANY_ROLE_META[role as CompanyUserRow["role"]];
  if (!meta) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.bg} ${meta.text} ${meta.border}`}>
      {meta.icon}{meta.label}
    </span>
  );
}

// ─── User Avatar ──────────────────────────────────────────────────────────────

function UserAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const [bg, text] = avatarColor(name);
  const sz = { sm: "h-7 w-7 text-[10px]", md: "h-9 w-9 text-xs", lg: "h-11 w-11 text-sm" }[size];
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-xl font-bold ${sz} ${bg} ${text}`}>
      {getInitials(name)}
    </div>
  );
}

// ─── Password Field ───────────────────────────────────────────────────────────

function PasswordField({
  label, value, onChange, required = false, placeholder,
}: {
  label: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean; placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
        {label}{required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={onChange}
          required={required}
          placeholder={placeholder ?? "••••••••"}
          className="h-9 w-full rounded-xl border border-gray-200 bg-white px-3 pr-9 text-sm
            text-gray-700 placeholder:text-gray-400 outline-none transition
            focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10
            dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300"
        />
        <button type="button" onClick={() => setShow(v => !v)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          {show ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      </div>
    </div>
  );
}

// ─── Platform User Drawer ─────────────────────────────────────────────────────

function PlatformUserDrawer({
  user, onClose, onEdit,
}: { user: PlatformUserRow | null; onClose: () => void; onEdit: () => void }) {
  return (
    <AnimatePresence>
      {user && (
        <>
          <motion.div key="bd" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-gray-950/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div key="dr"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 350, damping: 35 }}
            className="fixed right-0 top-0 z-50 h-full w-full max-w-sm overflow-y-auto border-l border-gray-200 bg-white shadow-2xl dark:border-white/[0.06] dark:bg-gray-900"
          >
            <div className="relative border-b border-gray-100 px-5 py-5 dark:border-white/[0.06]">
              <div className="absolute inset-x-0 top-0 h-0.5 bg-brand-500" />
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <UserAvatar name={user.email} size="lg" />
                  <div>
                    <p className="font-bold text-gray-800 dark:text-white">{user.username}</p>
                    <p className="text-xs text-gray-400">{user.email}</p>
                  </div>
                </div>
                <button type="button" onClick={onClose}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 dark:border-white/[0.08]"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <RoleBadge role={user.role} type="platform" />
                <StatusPill label={user.status === "active" ? "Activo" : "Inactivo"} tone={user.status === "active" ? "success" : "neutral"} />
              </div>
            </div>

            <div className="space-y-5 px-5 py-5">
              <DrawerSection title="Información">
                <DrawerRow label="Username"  value={user.username} />
                <DrawerRow label="Email"     value={user.email} />
                <DrawerRow label="Rol"       value={PLATFORM_ROLE_META[user.role]?.label} />
                <DrawerRow label="Estado"    value={user.status === "active" ? "Activo" : "Inactivo"} />
                <DrawerRow label="Creado"    value={fmtDate(user.createdAt)} />
                <DrawerRow label="Actualizado" value={fmtDate(user.updatedAt)} />
              </DrawerSection>
              <button type="button" onClick={onEdit}
                className="w-full rounded-xl bg-brand-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-500/20 transition hover:bg-brand-600 active:scale-95"
              >
                Editar usuario
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Company User Drawer ──────────────────────────────────────────────────────

function CompanyUserDrawer({
  user, onClose, onEdit,
}: { user: CompanyUserRow | null; onClose: () => void; onEdit: () => void }) {
  return (
    <AnimatePresence>
      {user && (
        <>
          <motion.div key="bd" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-gray-950/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div key="dr"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 350, damping: 35 }}
            className="fixed right-0 top-0 z-50 h-full w-full max-w-sm overflow-y-auto border-l border-gray-200 bg-white shadow-2xl dark:border-white/[0.06] dark:bg-gray-900"
          >
            <div className="relative border-b border-gray-100 px-5 py-5 dark:border-white/[0.06]">
              <div className="absolute inset-x-0 top-0 h-0.5 bg-violet-500" />
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <UserAvatar name={user.email} size="lg" />
                  <div>
                    <p className="font-bold text-gray-800 dark:text-white">{user.username}</p>
                    <p className="text-xs text-gray-400">{user.email}</p>
                  </div>
                </div>
                <button type="button" onClick={onClose}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 dark:border-white/[0.08]"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <RoleBadge role={user.role} type="company" />
                <StatusPill label={user.status === "active" ? "Activo" : "Inactivo"} tone={user.status === "active" ? "success" : "neutral"} />
              </div>
            </div>

            <div className="space-y-5 px-5 py-5">
              <DrawerSection title="Información">
                <DrawerRow label="Username"  value={user.username} />
                <DrawerRow label="Email"     value={user.email} />
                <DrawerRow label="Empresa"   value={user.companyName} />
                <DrawerRow label="Rol"       value={COMPANY_ROLE_META[user.role]?.label} />
                <DrawerRow label="Estado"    value={user.status === "active" ? "Activo" : "Inactivo"} />
                <DrawerRow label="Creado"    value={fmtDate(user.createdAt)} />
              </DrawerSection>

              {user.modulePermissions.length > 0 && (
                <DrawerSection title={`Módulos con acceso (${user.modulePermissions.length})`}>
                  <div className="flex flex-wrap gap-1.5 p-3">
                    {user.modulePermissions.map(m => (
                      <span key={m} className="rounded-lg bg-brand-50 px-2.5 py-1 text-[11px] font-medium text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                        {MODULE_TREE[m as ModuleKey]?.label ?? m}
                      </span>
                    ))}
                  </div>
                </DrawerSection>
              )}

              <button type="button" onClick={onEdit}
                className="w-full rounded-xl bg-brand-500 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-500/20 transition hover:bg-brand-600 active:scale-95"
              >
                Editar usuario
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">{title}</p>
      <div className="rounded-xl border border-gray-100 dark:border-white/[0.06] divide-y divide-gray-100 dark:divide-white/[0.04]">
        {children}
      </div>
    </div>
  );
}

function DrawerRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5">
      <span className="text-xs text-gray-400 dark:text-gray-500">{label}</span>
      <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{value || "—"}</span>
    </div>
  );
}

// ─── Platform User Form ───────────────────────────────────────────────────────

type PlatformUserFormData = {
  email: string; username: string; password: string;
  role: PlatformUserRow["role"]; status: "active" | "inactive";
};

function PlatformUserForm({
  form, onChange, isEdit,
}: { form: PlatformUserFormData; onChange: (f: PlatformUserFormData) => void; isEdit: boolean }) {
  function set<K extends keyof PlatformUserFormData>(k: K, v: PlatformUserFormData[K]) {
    onChange({ ...form, [k]: v });
  }
  return (
    <div className="grid gap-4 p-6 sm:grid-cols-2">
      <InputField label="Email" type="email" value={form.email} required
        onChange={e => set("email", e.target.value)} />
      <InputField label="Username" value={form.username} required
        onChange={e => set("username", e.target.value)} />
      <PasswordField label="Contraseña" value={form.password}
        required={!isEdit}
        placeholder={isEdit ? "Dejar vacío para no cambiar" : undefined}
        onChange={e => set("password", e.target.value)} />
      <SelectField label="Rol" value={form.role}
        onChange={e => set("role", e.target.value as PlatformUserRow["role"])}>
        {PLATFORM_ROLES.map(r => (
          <option key={r} value={r}>{PLATFORM_ROLE_META[r].label}</option>
        ))}
      </SelectField>
      <SelectField label="Estado" value={form.status}
        onChange={e => set("status", e.target.value as "active" | "inactive")}>
        <option value="active">Activo</option>
        <option value="inactive">Inactivo</option>
      </SelectField>
    </div>
  );
}

// ─── Company User Form ────────────────────────────────────────────────────────

type CompanyUserFormData = {
  companyId: string; email: string; username: string; password: string;
  role: CompanyUserRow["role"]; status: "active" | "inactive";
  modulePermissions: string[];
};

function CompanyUserForm({
  form, onChange, isEdit, companies,
}: {
  form: CompanyUserFormData;
  onChange: (f: CompanyUserFormData) => void;
  isEdit: boolean;
  companies: Array<{ id: number; name: string; enabledModules: string[] }>;
}) {
  function set<K extends keyof CompanyUserFormData>(k: K, v: CompanyUserFormData[K]) {
    onChange({ ...form, [k]: v });
  }

  const selectedCompany = companies.find(c => String(c.id) === form.companyId);
  const companyModules = (selectedCompany?.enabledModules ?? []) as ModuleKey[];

  function toggleModule(key: string) {
    const has = form.modulePermissions.includes(key);
    set("modulePermissions", has
      ? form.modulePermissions.filter(m => m !== key)
      : [...form.modulePermissions, key]
    );
  }

  return (
    <div className="grid gap-4 p-6 sm:grid-cols-2">
      <SelectField label="Empresa" value={form.companyId} required
        onChange={e => { set("companyId", e.target.value); set("modulePermissions", []); }}
        colSpan="full"
      >
        <option value="">Seleccionar empresa…</option>
        {companies.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
      </SelectField>

      <InputField label="Email" type="email" value={form.email} required
        onChange={e => set("email", e.target.value)} />
      <InputField label="Username" value={form.username} required
        onChange={e => set("username", e.target.value)} />
      <PasswordField label="Contraseña" value={form.password}
        required={!isEdit}
        placeholder={isEdit ? "Dejar vacío para no cambiar" : undefined}
        onChange={e => set("password", e.target.value)} />
      <SelectField label="Rol" value={form.role}
        onChange={e => set("role", e.target.value as CompanyUserRow["role"])}>
        {COMPANY_ROLES.map(r => (
          <option key={r} value={r}>{COMPANY_ROLE_META[r].label}</option>
        ))}
      </SelectField>
      <SelectField label="Estado" value={form.status}
        onChange={e => set("status", e.target.value as "active" | "inactive")}>
        <option value="active">Activo</option>
        <option value="inactive">Inactivo</option>
      </SelectField>

      {/* Module permissions */}
      <div className="sm:col-span-2">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Permisos de módulos
          {form.companyId && ` — ${form.modulePermissions.length} seleccionados`}
        </p>
        {!form.companyId ? (
          <p className="text-xs text-gray-400">Selecciona una empresa para ver sus módulos disponibles.</p>
        ) : companyModules.length === 0 ? (
          <p className="text-xs text-gray-400">Esta empresa no tiene módulos habilitados.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {companyModules.map(key => {
              const active = form.modulePermissions.includes(key);
              return (
                <motion.button key={key} type="button" whileTap={{ scale: 0.93 }}
                  onClick={() => toggleModule(key)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-all ${
                    active
                      ? "border-brand-400 bg-brand-50 text-brand-600 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-400"
                      : "border-gray-200 text-gray-500 hover:border-gray-300 dark:border-white/[0.08] dark:text-gray-500"
                  }`}
                >
                  {MODULE_TREE[key]?.label ?? key}
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── User Table ───────────────────────────────────────────────────────────────

function UserTable<T extends PlatformUserRow | CompanyUserRow>({
  users, type, onDetail, onEdit, onDelete, isSuperadmin,
}: {
  users: T[];
  type: "platform" | "company";
  onDetail: (u: T) => void;
  onEdit: (u: T) => void;
  onDelete: (u: T) => void;
  isSuperadmin: boolean;
}) {
  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16">
        <Users size={20} className="text-gray-300 dark:text-gray-600" />
        <p className="text-sm font-medium text-gray-400">Sin usuarios</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px] text-sm">
        <thead>
          <tr className="border-b border-gray-100 dark:border-white/[0.06]">
            {["Usuario", "Rol", type === "company" ? "Empresa" : "ID", "Estado", "Creado", ""].map((h, i, arr) => (
              <th
                key={h}
                className={`px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 ${i === arr.length - 1 ? "" : ""}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
          <AnimatePresence>
            {users.map((user, i) => (
              <motion.tr key={user.id}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, delay: i * 0.03 }}
                className="group cursor-pointer transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.02]"
                onClick={() => onDetail(user)}
              >
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <UserAvatar name={user.email} size="sm" />
                    <div>
                      <p className="font-semibold text-gray-800 dark:text-white">{user.username}</p>
                      <p className="text-[11px] text-gray-400">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <RoleBadge role={user.role} type={type} />
                </td>
                <td className="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400">
                  {type === "company"
                    ? (user as CompanyUserRow).companyName ?? "—"
                    : <span className="font-mono text-[10px]">{user.id}</span>
                  }
                </td>
                <td className="px-5 py-3.5">
                  <StatusPill
                    label={user.status === "active" ? "Activo" : "Inactivo"}
                    tone={user.status === "active" ? "success" : "neutral"}
                  />
                </td>
                <td className="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400">
                  {fmtDate(user.createdAt)}
                </td>
                <td className=" group-hover:bg-gray-50/80 dark:group-hover:bg-white/[0.02] px-5 py-3.5">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={e => e.stopPropagation()}
                  >
                    <motion.button type="button" whileTap={{ scale: 0.9 }}
                      onClick={() => onEdit(user)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition hover:text-brand-500 dark:border-white/[0.08]"
                    >
                      <Pencil size={12} />
                    </motion.button>
                    {isSuperadmin && (
                      <motion.button type="button" whileTap={{ scale: 0.9 }}
                        onClick={() => onDelete(user)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition hover:text-rose-500 dark:border-white/[0.08]"
                      >
                        <Trash2 size={12} />
                      </motion.button>
                    )}
                  </div>
                </td>
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
}

// ─── Agrupador por empresa (jul 2026 v6) ────────────────────────────────────
//
// En la tab "Empresas", en vez de mostrar una tabla plana con todos los
// usuarios mezclados (y un columna "Empresa" repetida), los agrupamos
// por empresa en "carpetitas" colapsables. Cada grupo tiene su header
// con el nombre de la empresa, contador de usuarios y un botón para
// expandir/colapsar. Mantiene la coherencia con el resto del proyecto
// (mismo look&feel que los `Section` de Companies/page.tsx).

function GroupedCompanyUsers<T extends CompanyUserRow>({
  users, onDetail, onEdit, onDelete, isSuperadmin,
}: {
  users: T[];
  onDetail: (u: T) => void;
  onEdit: (u: T) => void;
  onDelete: (u: T) => void;
  isSuperadmin: boolean;
}) {
  // Agrupamos por (companyId, companyName). Si un user no tiene
  // companyName (data legacy), caemos en "Sin empresa".
  const groups = useMemo(() => {
    const map = new Map<string, { id: string; name: string; users: T[] }>();
    for (const u of users) {
      const cu = u as CompanyUserRow;
      const id   = cu.companyId ?? "none";
      const name = cu.companyName ?? "Sin empresa";
      if (!map.has(id)) map.set(id, { id, name, users: [] });
      map.get(id)!.users.push(u);
    }
    // Orden: por cantidad de users desc, luego alfabético. Así la
    // empresa con más usuarios queda arriba.
    return Array.from(map.values()).sort((a, b) => {
      if (b.users.length !== a.users.length) return b.users.length - a.users.length;
      return a.name.localeCompare(b.name);
    });
  }, [users]);

  // Por defecto TODAS las carpetas colapsadas. El superadmin abre las
  // que quiere con un click (o "Expandir todo" si quiere ver todo).
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  // Si cambia la cantidad de grupos (filtros / búsqueda), respetamos
  // los que el user ya tenía abiertos y descartamos los que se fueron.
  useEffect(() => {
    setExpanded(prev => {
      const next = new Set<string>();
      for (const g of groups) {
        if (prev.has(g.id)) next.add(g.id);
      }
      return next;
    });
  }, [groups]);

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll   = () => setExpanded(new Set(groups.map(g => g.id)));
  const collapseAll = () => setExpanded(new Set());

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16">
        <Users size={20} className="text-gray-300 dark:text-gray-600" />
        <p className="text-sm font-medium text-gray-400">Sin usuarios</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-white/[0.04]">
      {/* Toolbar: expandir/colapsar todo. Útil cuando hay 10+ empresas. */}
      {groups.length > 1 && (
        <div className="flex items-center justify-end gap-2 px-5 py-2 text-xs">
          <button type="button" onClick={expandAll}
            className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.04]">
            Expandir todo
          </button>
          <button type="button" onClick={collapseAll}
            className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.04]">
            Colapsar todo
          </button>
        </div>
      )}

      {groups.map(group => {
        const isOpen = expanded.has(group.id);
        return (
          <div key={group.id}>
            {/* Header de la carpetita */}
            <button type="button"
              onClick={() => toggle(group.id)}
              aria-expanded={isOpen}
              className="group flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors
                hover:bg-gray-50/60 dark:hover:bg-white/[0.02]">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                  <Building2 size={14} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-800 dark:text-white">
                    {group.name}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {group.users.length} usuario{group.users.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              <ChevronDown size={14}
                className={`shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>

            {/* Body: tabla de la empresa. AnimatePresence para que abra/cierre
                con animación suave, sin parpadeos. */}
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  key="body"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <UserTable
                    users={group.users}
                    type="company"
                    onDetail={onDetail}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    isSuperadmin={isSuperadmin}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type TabType = "platform" | "company";

const EMPTY_PLATFORM_FORM: PlatformUserFormData = {
  email: "", username: "", password: "", role: "admin_saas", status: "active",
};

const EMPTY_COMPANY_FORM: CompanyUserFormData = {
  companyId: "", email: "", username: "", password: "",
  role: "operador", status: "active", modulePermissions: [],
};

export function PlatformUsersPage() {
  const { session } = useAuth();
  const isSuperadmin = session?.role === "superadmin";

  const { platformUsers, companyUsers, loading, createUser, updateUser, deleteUser } = usePlatformUsers();
  const { companies } = usePlatformCompanies();

  const [tab,         setTab]         = useState<TabType>("platform");
  const [search,      setSearch]      = useState("");
  const [filterRole,  setFilterRole]  = useState("all");
  const [modalOpen,   setModalOpen]   = useState(false);
  const [deleteOpen,  setDeleteOpen]  = useState(false);
  const [editingUser, setEditingUser] = useState<PlatformUserRow | CompanyUserRow | null>(null);
  const [deletingUser,setDeletingUser]= useState<PlatformUserRow | CompanyUserRow | null>(null);
  const [drawerPU,    setDrawerPU]    = useState<PlatformUserRow | null>(null);
  const [drawerCU,    setDrawerCU]    = useState<CompanyUserRow | null>(null);
  const [platformForm,setPlatformForm]= useState<PlatformUserFormData>(EMPTY_PLATFORM_FORM);
  const [companyForm, setCompanyForm] = useState<CompanyUserFormData>(EMPTY_COMPANY_FORM);
  const [submitting,  setSubmitting]  = useState(false);

  // ── Filtered ──────────────────────────────────────────────────────────────

  const filteredPlatform = useMemo(() => {
    const q = search.trim().toLowerCase();
    return platformUsers.filter(u => {
      if (filterRole !== "all" && u.role !== filterRole) return false;
      if (q && !u.email.toLowerCase().includes(q) && !u.username.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [platformUsers, search, filterRole]);

  const filteredCompany = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companyUsers.filter(u => {
      if (filterRole !== "all" && u.role !== filterRole) return false;
      if (q && !u.email.toLowerCase().includes(q) && !u.username.toLowerCase().includes(q) &&
          !(u.companyName ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [companyUsers, search, filterRole]);

  const activeRoles = tab === "platform" ? PLATFORM_ROLES : COMPANY_ROLES;

  // ── Handlers ──────────────────────────────────────────────────────────────

  function openCreate() {
    setEditingUser(null);
    setPlatformForm(EMPTY_PLATFORM_FORM);
    setCompanyForm(EMPTY_COMPANY_FORM);
    setModalOpen(true);
  }

  function openEdit(user: PlatformUserRow | CompanyUserRow) {
    setEditingUser(user);
    if (user.type === "platform") {
      setPlatformForm({ email: user.email, username: user.username, password: "", role: user.role, status: user.status });
    } else {
      const cu = user as CompanyUserRow;
      // companyId viene como "company-1", extraemos el número
      const rawId = cu.companyId.replace("company-", "");
      setCompanyForm({
        companyId: rawId, email: cu.email, username: cu.username,
        password: "", role: cu.role, status: cu.status,
        modulePermissions: cu.modulePermissions,
      });
    }
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingUser) {
        if (editingUser.type === "platform") {
          const { password, ...rest } = platformForm;
          const input: UpdatePlatformUserInput = { ...rest, ...(password ? { password } : {}) };
          await updateUser(editingUser.id, input);
        } else {
          const { companyId, password, ...rest } = companyForm;
          const input: UpdateCompanyUserInput = {
            ...rest,
            companyId: `company-${companyId}`,
            ...(password ? { password } : {}),
          };
          await updateUser(editingUser.id, input);
        }
        toast.success("Usuario actualizado");
      } else {
        if (tab === "platform") {
          const input: CreatePlatformUserInput = { type: "platform", ...platformForm };
          await createUser(input);
        } else {
          const input: CreateCompanyUserInput = {
            type: "company",
            ...companyForm,
            companyId: `company-${companyForm.companyId}`,
          };
          await createUser(input);
        }
        toast.success("Usuario creado");
      }
      setModalOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deletingUser) return;
    setSubmitting(true);
    try {
      await deleteUser(deletingUser.id);
      toast.success("Usuario eliminado");
      setDeleteOpen(false);
      setDeletingUser(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
      >
        <div>
          <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-brand-200 dark:border-brand-500/20 bg-brand-50 dark:bg-brand-500/10 px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            <span className="text-xs font-medium text-brand-700 dark:text-brand-400">Panel master</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Usuarios globales</h1>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            Gestiona usuarios de plataforma y usuarios de empresa desde un solo lugar.
          </p>
        </div>

        <motion.button type="button" whileTap={{ scale: 0.95 }} onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-500/20 transition hover:bg-brand-600 self-start"
        >
          <UserPlus size={15} /> Nuevo usuario
        </motion.button>
      </motion.div>

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          { icon: <Users size={16} />,      label: "Total usuarios",   value: (platformUsers.length + companyUsers.length).toString(), sub: "Plataforma + empresa", accent: "bg-brand-500"   },
          { icon: <ShieldCheck size={16} />,label: "De plataforma",    value: platformUsers.length.toString(),                        sub: "Equipo ApliSmart",    accent: "bg-violet-500" },
          { icon: <Building2 size={16} />,  label: "De empresa",       value: companyUsers.length.toString(),                         sub: "Usuarios de tenants", accent: "bg-emerald-500" },
          { icon: <UserPlus size={16} />,   label: "Activos",          value: [...platformUsers,...companyUsers].filter(u => u.status === "active").length.toString(), sub: "En estado activo", accent: "bg-amber-500" },
        ].map((kpi, i) => (
          <motion.div key={kpi.label}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.07 }}
          >
            <PlatformKpiCard {...kpi} />
          </motion.div>
        ))}
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]"
      >
        {/* Tab bar */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 dark:border-white/[0.06]">
          <div className="flex">
            {(["platform", "company"] as TabType[]).map(t => (
              <button key={t} type="button"
                onClick={() => { setTab(t); setSearch(""); setFilterRole("all"); }}
                className={`relative flex items-center gap-2 px-4 py-4 text-sm font-semibold transition-colors
                  ${tab === t
                    ? "text-brand-600 dark:text-brand-400"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  }`}
              >
                {t === "platform" ? <><ShieldCheck size={14} />Plataforma</> : <><Building2 size={14} />Empresas</>}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold
                  ${tab === t ? "bg-brand-100 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400" : "bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400"}`}
                >
                  {t === "platform" ? platformUsers.length : companyUsers.length}
                </span>
                {tab === t && (
                  <motion.div layoutId="tab-indicator"
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-brand-500"
                  />
                )}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 py-2">
            <div className="relative">
              <Search size={12} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar…"
                className="h-8 rounded-xl border border-gray-200 bg-transparent pl-8 pr-3 text-xs text-gray-700 placeholder:text-gray-400 outline-none transition focus:border-brand-500 dark:border-white/[0.08] dark:text-gray-300"
              />
            </div>
            <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
              className="h-8 rounded-xl border border-gray-200 bg-transparent px-2 text-xs text-gray-600 outline-none dark:border-white/[0.08] dark:text-gray-300"
            >
              <option value="all">Todos los roles</option>
              {activeRoles.map(r => {
                const meta = tab === "platform" ? PLATFORM_ROLE_META[r as PlatformUserRow["role"]] : COMPANY_ROLE_META[r as CompanyUserRow["role"]];
                return <option key={r} value={r}>{meta.label}</option>;
              })}
            </select>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-gray-400">
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <span className="text-sm">Cargando usuarios…</span>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={tab}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}
            >
              {tab === "platform" ? (
                <UserTable
                  users={filteredPlatform}
                  type="platform"
                  onDetail={u => setDrawerPU(u as PlatformUserRow)}
                  onEdit={openEdit}
                  onDelete={u => { setDeletingUser(u); setDeleteOpen(true); }}
                  isSuperadmin={isSuperadmin}
                />
              ) : (
                // jul 2026 v6 — En la tab "Empresas", agrupamos por
                // empresa (carpetitas colapsables) en vez de mostrar
                // una tabla plana con todos mezclados.
                <GroupedCompanyUsers
                  users={filteredCompany}
                  onDetail={u => setDrawerCU(u as CompanyUserRow)}
                  onEdit={openEdit}
                  onDelete={u => { setDeletingUser(u); setDeleteOpen(true); }}
                  isSuperadmin={isSuperadmin}
                />
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </motion.div>

      {/* ── Drawers ─────────────────────────────────────────────────────────── */}
      <PlatformUserDrawer
        user={drawerPU}
        onClose={() => setDrawerPU(null)}
        onEdit={() => { if (drawerPU) { openEdit(drawerPU); setDrawerPU(null); } }}
      />
      <CompanyUserDrawer
        user={drawerCU}
        onClose={() => setDrawerCU(null)}
        onEdit={() => { if (drawerCU) { openEdit(drawerCU); setDrawerCU(null); } }}
      />

      {/* ── Modal crear/editar ─────────────────────────────────────────────── */}
      <PlatformModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingUser
          ? `Editar — ${editingUser.username}`
          : tab === "platform" ? "Nuevo usuario de plataforma" : "Nuevo usuario de empresa"
        }
        subtitle={editingUser ? "Modifica los datos del usuario." : "Completa el formulario para crear el usuario."}
        icon={<UserPlus size={15} />}
        iconBg="bg-brand-50 dark:bg-brand-500/[0.12]"
        iconColor="text-brand-600 dark:text-brand-400"
        maxWidth="max-w-2xl"
        footer={
          <ModalActions
            onCancel={() => setModalOpen(false)}
            submitting={submitting}
            submitLabel={editingUser ? "Guardar cambios" : "Crear usuario"}
          />
        }
      >
        <form onSubmit={handleSubmit}>
          {/* Tab selector dentro del modal cuando es creación */}
          {!editingUser && (
            <div className="flex gap-2 border-b border-gray-100 px-6 pt-4 dark:border-white/[0.06]">
              {(["platform", "company"] as TabType[]).map(t => (
                <button key={t} type="button"
                  onClick={() => setTab(t)}
                  className={`flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-xs font-semibold transition-colors
                    ${tab === t
                      ? "border-b-2 border-brand-500 text-brand-600 dark:text-brand-400"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
                    }`}
                >
                  {t === "platform" ? <><ShieldCheck size={12} />Plataforma</> : <><Building2 size={12} />Empresa</>}
                </button>
              ))}
            </div>
          )}
          {tab === "platform" || editingUser?.type === "platform" ? (
            <PlatformUserForm form={platformForm} onChange={setPlatformForm} isEdit={!!editingUser} />
          ) : (
            <CompanyUserForm form={companyForm} onChange={setCompanyForm} isEdit={!!editingUser} companies={companies} />
          )}
        </form>
      </PlatformModal>

      {/* ── Modal eliminar ─────────────────────────────────────────────────── */}
      <PlatformModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Eliminar usuario"
        subtitle={`¿Seguro que deseas eliminar a "${deletingUser?.username}"?`}
        icon={<Trash2 size={15} />}
        iconBg="bg-error-50 dark:bg-error-500/[0.12]"
        iconColor="text-error-600 dark:text-error-400"
        maxWidth="max-w-md"
        footer={
          <ModalActions
            onCancel={() => setDeleteOpen(false)}
            submitting={submitting}
            submitLabel="Sí, eliminar"
            danger
          />
        }
      >
        <form onSubmit={handleDelete}>
          <div className="px-6 py-4">
            <div className="rounded-xl border border-error-100 bg-error-50 px-4 py-3 dark:border-error-500/20 dark:bg-error-500/[0.07]">
              <p className="text-sm text-error-700 dark:text-error-400">
                Esta acción es permanente y no se puede deshacer.
              </p>
            </div>
          </div>
        </form>
      </PlatformModal>
    </div>
  );
}