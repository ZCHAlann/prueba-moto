import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings,
  Shield,
  Mail,
  Bell,
  Building2,
  Save,
  RefreshCw,
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  Plus,
  Trash2,
  Pencil,
  User,
  ChevronDown,
} from "lucide-react";
import { usePlatformSettings } from "../../../hooks/usePlatformSettings";
import { usePlatformUsers }    from "../../../hooks/usePlatformUsers";
import type { PlatformSettings } from "../../../hooks/usePlatformSettings";
import type { CreatePlatformUserInput } from "../../../hooks/usePlatformUsers";
import { SettingsPage } from "@/pages/Settings/page";
import { fmtDateShortEc } from "@/lib/datetime";

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId = "general" | "security" | "smtp" | "notifications" | "defaults" | "users";

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{ duration: 0.22 }}
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-2xl px-4 py-3 shadow-xl text-sm font-medium
        ${type === "success" ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"}`}
    >
      {type === "success" ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
      {message}
    </motion.div>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({
  title, subtitle, icon, children, delay = 0,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay }}
      className="rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-[#0F172A]"
    >
      <div className="flex items-center gap-3 border-b border-gray-100 px-6 py-4 dark:border-white/[0.06]">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-50 text-brand-500 dark:bg-brand-500/10 dark:text-brand-400">
          {icon}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-white">{title}</p>
          {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500">{subtitle}</p>}
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </motion.div>
  );
}

// ─── Field helpers ────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-400">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">{hint}</p>}
    </div>
  );
}

const inputCls =
  "h-9 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-800 placeholder:text-gray-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200";

const numInputCls =
  "h-9 w-28 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200";

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none
        ${checked ? "bg-brand-500" : "bg-gray-200 dark:bg-white/[0.1]"}`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform duration-200
          ${checked ? "translate-x-4" : "translate-x-0"}`}
      />
    </button>
  );
}

// ─── Tab nav ──────────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "general",       label: "General",              icon: <Settings size={13} /> },
  { id: "security",      label: "Seguridad",             icon: <Shield size={13} /> },
  { id: "smtp",          label: "SMTP / Email",          icon: <Mail size={13} /> },
  { id: "notifications", label: "Notificaciones",        icon: <Bell size={13} /> },
  { id: "defaults",      label: "Defaults empresas",     icon: <Building2 size={13} /> },
  { id: "users",         label: "Usuarios plataforma",   icon: <User size={13} /> },
];

// ─── User Modal ───────────────────────────────────────────────────────────────

function UserModal({
  open,
  onClose,
  onSubmit,
  initial,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreatePlatformUserInput & { id?: string }) => Promise<void>;
  initial?: { id: string; email: string; username: string; role: string } | null;
  loading: boolean;
}) {
  const [form, setForm] = useState<CreatePlatformUserInput>({
    type: "platform",
    email: "",
    username: "",
    password: "",
    role: "admin_saas",
  });
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (open) {
      setErr("");
      setShowPw(false);
      setForm({
        type: "platform",
        email:    initial?.email    ?? "",
        username: initial?.username ?? "",
        password: "",
        role:     (initial?.role as CreatePlatformUserInput["role"]) ?? "admin_saas",
      });
    }
  }, [open, initial]);

  async function handleSubmit() {
    setErr("");
    try {
      await onSubmit({ ...form, ...(initial ? { id: initial.id } : {}) });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al guardar");
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.2 }}
        className="relative z-10 w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-white/[0.08] dark:bg-[#0F172A]"
      >
        <h3 className="mb-5 text-base font-semibold text-gray-800 dark:text-white">
          {initial ? "Editar usuario" : "Nuevo usuario de plataforma"}
        </h3>

        <div className="space-y-3.5">
          <Field label="Email">
            <input type="email" value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className={inputCls} placeholder="admin@ejemplo.com" />
          </Field>
          <Field label="Username">
            <input type="text" value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              className={inputCls} placeholder="admin_name" />
          </Field>
          <Field label={initial ? "Nueva contraseña (dejar vacío para no cambiar)" : "Contraseña"}>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className={`${inputCls} pr-10`}
                placeholder="••••••••"
              />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </Field>
          <Field label="Rol">
            <div className="relative">
              <select value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value as CreatePlatformUserInput["role"] }))}
                className={`${inputCls} appearance-none pr-8`}>
                <option value="superadmin">Superadmin</option>
                <option value="admin_saas">Admin SaaS</option>
                <option value="comercial">Comercial</option>
                <option value="soporte">Soporte</option>
              </select>
              <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
          </Field>
        </div>

        {err && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-rose-500">
            <AlertCircle size={12} /> {err}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-400">
            Cancelar
          </button>
          <button type="button" onClick={handleSubmit} disabled={loading}
            className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-600 transition disabled:opacity-60">
            {loading && <RefreshCw size={12} className="animate-spin" />}
            {initial ? "Guardar cambios" : "Crear usuario"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function PlatformSettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const { settings, loading, saving, save, refetch } = usePlatformSettings();
  const { platformUsers: users, loading: usersLoading, createUser, updateUser, deleteUser } = usePlatformUsers();

  const [draft, setDraft] = useState<Partial<PlatformSettings>>({});
  useEffect(() => { if (settings) setDraft(settings); }, [settings]);

  const [userModal, setUserModal] = useState<{
    open: boolean;
    initial?: { id: string; email: string; username: string; role: string } | null;
  }>({ open: false, initial: null });
  const [userActionLoading, setUserActionLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function set<K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) {
    setDraft(d => ({ ...d, [key]: value }));
  }

  function val<K extends keyof PlatformSettings>(key: K): PlatformSettings[K] {
    return (draft[key] ?? settings?.[key]) as PlatformSettings[K];
  }

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
  }

  async function handleSave() {
    try {
      await save(draft);
      showToast("Configuración guardada correctamente", "success");
    } catch {
      showToast("Error al guardar la configuración", "error");
    }
  }

  // ── User actions ──────────────────────────────────────────────────────────

  async function handleUserSubmit(data: CreatePlatformUserInput & { id?: string }) {
    setUserActionLoading(true);
    try {
      if (data.id) {
        const { id, ...input } = data;
        await updateUser(id, input);
        showToast("Usuario actualizado", "success");
      } else {
        await createUser(data);
        showToast("Usuario creado", "success");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Error al guardar usuario", "error");
    } finally {
      setUserActionLoading(false);
    }
  }

  async function handleDeleteUser(id: string) {
    try {
      await deleteUser(id);
      showToast("Usuario eliminado", "success");
    } catch {
      showToast("Error al eliminar usuario", "error");
    }
    setDeleteConfirm(null);
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-48 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/[0.04]" />
        ))}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
        )}
      </AnimatePresence>

      {/* User modal */}
      <AnimatePresence>
        {userModal.open && (
          <UserModal
            open={userModal.open}
            initial={userModal.initial}
            onClose={() => setUserModal({ open: false, initial: null })}
            onSubmit={handleUserSubmit}
            loading={userActionLoading}
          />
        )}
      </AnimatePresence>

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
      >
        <div>
          <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-violet-200 dark:border-violet-500/20 bg-violet-50 dark:bg-violet-500/10 px-2.5 py-1">
            <Shield size={11} className="text-violet-500 dark:text-violet-400" />
            <span className="text-xs font-medium text-violet-700 dark:text-violet-400">Superadmin</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Configuración de plataforma</h1>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            Gestiona la configuración global, seguridad, correo y usuarios de plataforma.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="flex items-center gap-2 self-start"
        >
          <button type="button" onClick={refetch}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 transition dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-400">
            <RefreshCw size={12} /> Recargar
          </button>
          {activeTab !== "users" && (
            <button type="button" onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-600 transition disabled:opacity-60">
              {saving ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
              Guardar cambios
            </button>
          )}
        </motion.div>
      </motion.div>

      {/* ── Tab bar ───────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, delay: 0.05 }}
        className="flex flex-wrap gap-1 rounded-2xl border border-gray-200 bg-white p-1.5 dark:border-white/[0.06] dark:bg-[#0F172A]"
      >
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-all
              ${activeTab === tab.id
                ? "bg-brand-500 text-white shadow-sm"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.04]"
              }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </motion.div>

      {/* ── Tab content ───────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">

        {/* ─────────────── GENERAL ─────────────────────────────────────── */}
        {activeTab === "general" && (
          <motion.div key="general" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
            <SectionCard title="Información general" subtitle="Datos básicos de la plataforma" icon={<Settings size={14} />}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nombre de la plataforma">
                  <input type="text" value={val("platformName") ?? ""}
                    onChange={e => set("platformName", e.target.value)}
                    className={inputCls} placeholder="Mi Plataforma SaaS" />
                </Field>
                <Field label="URL base">
                  <input type="url" value={val("platformUrl") ?? ""}
                    onChange={e => set("platformUrl", e.target.value)}
                    className={inputCls} placeholder="https://app.ejemplo.com" />
                </Field>
                <Field label="Email de soporte">
                  <input type="email" value={val("supportEmail") ?? ""}
                    onChange={e => set("supportEmail", e.target.value)}
                    className={inputCls} placeholder="soporte@ejemplo.com" />
                </Field>
                <Field label="Zona horaria por defecto">
                  <div className="relative">
                    <select value={val("defaultTimezone") ?? "America/Guayaquil"}
                      onChange={e => set("defaultTimezone", e.target.value)}
                      className={`${inputCls} appearance-none pr-8`}>
                      <option value="America/Guayaquil">America/Guayaquil</option>
                      <option value="America/Bogota">America/Bogota</option>
                      <option value="America/Lima">America/Lima</option>
                      <option value="America/New_York">America/New_York</option>
                      <option value="America/Mexico_City">America/Mexico_City</option>
                      <option value="America/Santiago">America/Santiago</option>
                      <option value="America/Sao_Paulo">America/Sao_Paulo</option>
                      <option value="UTC">UTC</option>
                    </select>
                    <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  </div>
                </Field>
                <Field label="Idioma por defecto">
                  <div className="relative">
                    <select value={val("defaultLanguage") ?? "es"}
                      onChange={e => set("defaultLanguage", e.target.value)}
                      className={`${inputCls} appearance-none pr-8`}>
                      <option value="es">Español</option>
                      <option value="en">English</option>
                      <option value="pt">Português</option>
                    </select>
                    <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  </div>
                </Field>
              </div>
            </SectionCard>
          </motion.div>
        )}

        {/* ─────────────── SECURITY ────────────────────────────────────── */}
        {activeTab === "security" && (
          <motion.div key="security" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
            <div className="space-y-5">
              <SectionCard title="Política de contraseñas" subtitle="Requisitos mínimos para todas las contraseñas" icon={<Shield size={14} />} delay={0}>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Longitud mínima" hint="Mínimo de caracteres requeridos">
                    <input type="number" min={6} max={32} value={val("passwordMinLength") ?? 8}
                      onChange={e => set("passwordMinLength", Number(e.target.value))}
                      className={numInputCls} />
                  </Field>
                  <Field label="Expiración de contraseña (días)" hint="0 = nunca expira">
                    <input type="number" min={0} max={365} value={val("passwordExpiryDays") === 0 ? "" : (val("passwordExpiryDays") ?? "")}
                      onChange={e => set("passwordExpiryDays", e.target.value === "" ? 0 : Number(e.target.value))}
                      className={numInputCls} />
                  </Field>
                  <div className="sm:col-span-2 grid gap-3 sm:grid-cols-3">
                    {([
                      ["passwordRequireUpper",  "Requiere mayúscula"],
                      ["passwordRequireNumber", "Requiere número"],
                      ["passwordRequireSymbol", "Requiere símbolo"],
                    ] as [keyof PlatformSettings, string][]).map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3 dark:border-white/[0.05] dark:bg-white/[0.02]">
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
                        <Toggle checked={!!val(key)} onChange={v => set(key, v as never)} />
                      </div>
                    ))}
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Sesión y bloqueo" subtitle="Control de acceso y tiempos de sesión" icon={<Shield size={14} />} delay={0.06}>
                <div className="grid gap-5 sm:grid-cols-3">
                  <Field label="Expiración de sesión (horas)" hint="Tiempo antes de logout automático">
                    <input type="number" min={1} max={720} value={val("sessionExpiryHours") ?? 24}
                      onChange={e => set("sessionExpiryHours", Number(e.target.value))}
                      className={numInputCls} />
                  </Field>
                  <Field label="Máx. intentos de login" hint="Intentos fallidos antes del bloqueo">
                    <input type="number" min={2} max={20} value={val("maxLoginAttempts") ?? 5}
                      onChange={e => set("maxLoginAttempts", Number(e.target.value))}
                      className={numInputCls} />
                  </Field>
                  <Field label="Minutos de bloqueo" hint="Duración del bloqueo tras superar intentos">
                    <input type="number" min={1} max={1440} value={val("lockoutMinutes") ?? 30}
                      onChange={e => set("lockoutMinutes", Number(e.target.value))}
                      className={numInputCls} />
                  </Field>
                </div>
                <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-500/[0.07]">
                  <AlertCircle size={14} className="mt-0.5 shrink-0 text-amber-500" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Estos valores aplican en tiempo real. Cambios en <strong>maxLoginAttempts</strong> y <strong>lockoutMinutes</strong> afectan el próximo intento fallido, ya que el backend los lee de DB en cada login.
                  </p>
                </div>
              </SectionCard>
            </div>
          </motion.div>
        )}

        {/* ─────────────── SMTP ────────────────────────────────────────── */}
        {activeTab === "smtp" && (
          <motion.div key="smtp" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
            <SectionCard title="Configuración SMTP" subtitle="Servidor de correo para envío de emails del sistema" icon={<Mail size={14} />}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Host SMTP">
                  <input type="text" value={val("smtpHost") ?? ""}
                    onChange={e => set("smtpHost", e.target.value)}
                    className={inputCls} placeholder="smtp.ejemplo.com" />
                </Field>
                <Field label="Puerto SMTP">
                  <input type="number" value={val("smtpPort") ?? 587}
                    onChange={e => set("smtpPort", Number(e.target.value))}
                    className={numInputCls} placeholder="587" />
                </Field>
                <Field label="Usuario SMTP">
                  <input type="text" value={val("smtpUser") ?? ""}
                    onChange={e => set("smtpUser", e.target.value)}
                    className={inputCls} placeholder="no-reply@ejemplo.com" />
                </Field>
                <Field label="Email remitente (From)">
                  <input type="email" value={val("smtpFromAddress") ?? ""}
                    onChange={e => set("smtpFromAddress", e.target.value)}
                    className={inputCls} placeholder="no-reply@ejemplo.com" />
                </Field>
                <Field label="Nombre remitente">
                  <input type="text" value={val("smtpFromName") ?? ""}
                    onChange={e => set("smtpFromName", e.target.value)}
                    className={inputCls} placeholder="Mi Plataforma" />
                </Field>
              </div>
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-500/20 dark:bg-blue-500/[0.07]">
                <AlertCircle size={14} className="mt-0.5 shrink-0 text-blue-500" />
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  La contraseña SMTP no se muestra por seguridad. Si necesitas cambiarla, actualízala directamente en el backend.
                </p>
              </div>
            </SectionCard>
          </motion.div>
        )}

        {/* ─────────────── NOTIFICATIONS ───────────────────────────────── */}
        {activeTab === "notifications" && (
          <motion.div key="notifications" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
            <SectionCard title="Notificaciones de plataforma" subtitle="Alertas que recibe el equipo de superadmins" icon={<Bell size={14} />}>
              <div className="space-y-3">
                {([
                  ["notifyOnNewCompany",    "Nueva empresa registrada",    "Notificar cuando se active una nueva empresa en la plataforma"],
                  ["notifyOnTrialExpiring", "Trial próximo a vencer",       "Alertar 3 días antes de que venza el período de prueba de una empresa"],
                  ["notifyOnLoginFailure",  "Fallo repetido de login",      "Notificar cuando una cuenta sea bloqueada por intentos fallidos"],
                ] as [keyof PlatformSettings, string, string][]).map(([key, title, description]) => (
                  <div key={key} className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3.5 dark:border-white/[0.05]">
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</p>
                      <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{description}</p>
                    </div>
                    <Toggle checked={!!val(key)} onChange={v => set(key, v as never)} />
                  </div>
                ))}
              </div>
            </SectionCard>
          </motion.div>
        )}

        {/* ─────────────── DEFAULTS ────────────────────────────────────── */}
        {activeTab === "defaults" && (
          <motion.div key="defaults" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
            <SectionCard title="Valores por defecto para empresas" subtitle="Se aplican al crear una empresa sin plan específico" icon={<Building2 size={14} />}>
              <div className="grid gap-5 sm:grid-cols-3">
                <Field label="Días de trial" hint="Período de prueba gratuito al crear una empresa">
                  <input type="number" min={0} max={365} value={val("defaultTrialDays") ?? 14}
                    onChange={e => set("defaultTrialDays", Number(e.target.value))}
                    className={numInputCls} />
                </Field>
                <Field label="Máx. usuarios" hint="Límite de usuarios por empresa por defecto">
                  <input type="number" min={1} max={9999} value={val("defaultMaxUsers") ?? 10}
                    onChange={e => set("defaultMaxUsers", Number(e.target.value))}
                    className={numInputCls} />
                </Field>
                <Field label="Máx. activos" hint="Límite de activos/vehículos por empresa por defecto">
                  <input type="number" min={1} max={99999} value={val("defaultMaxAssets") ?? 50}
                    onChange={e => set("defaultMaxAssets", Number(e.target.value))}
                    className={numInputCls} />
                </Field>
              </div>
              <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-4 dark:border-white/[0.05] dark:bg-white/[0.02]">
                <p className="mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Resumen actual</p>
                <div className="flex flex-wrap gap-4">
                  {[
                    ["Trial",    `${val("defaultTrialDays")  ?? 14} días`],
                    ["Usuarios", `hasta ${val("defaultMaxUsers")  ?? 10}`],
                    ["Activos",  `hasta ${val("defaultMaxAssets") ?? 50}`],
                  ].map(([label, value]) => (
                    <div key={label} className="text-center">
                      <p className="text-lg font-bold text-gray-800 dark:text-white">{value}</p>
                      <p className="text-[11px] text-gray-400">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>
          </motion.div>
        )}

        {/* ─────────────── USERS ───────────────────────────────────────── */}
        {activeTab === "users" && (
          <motion.div key="users" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
            <div className="rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-[#0F172A]">

              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-white/[0.06]">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-50 text-brand-500 dark:bg-brand-500/10 dark:text-brand-400">
                    <User size={14} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-white">Usuarios de plataforma</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{users.length} usuarios</p>
                  </div>
                </div>
                <button type="button"
                  onClick={() => setUserModal({ open: true, initial: null })}
                  className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600 transition">
                  <Plus size={12} /> Nuevo usuario
                </button>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px]">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-white/[0.06]">
                      {["Usuario", "Email", "Rol", "Estado", "Creado", ""].map((h, i, arr) => (
                        <th
                          key={h}
                          className={`px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 ${i === arr.length - 1 ? "" : ""}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {usersLoading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <tr key={i} className="border-b border-gray-50 dark:border-white/[0.03]">
                          {Array.from({ length: 6 }).map((_, j) => (
                            <td key={j} className="px-5 py-3">
                              <div className="h-4 animate-pulse rounded-lg bg-gray-100 dark:bg-white/[0.04]"
                                style={{ width: `${[40, 60, 30, 25, 35, 15][j]}%` }} />
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : users.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-sm text-gray-400">
                          No hay usuarios de plataforma todavía.
                        </td>
                      </tr>
                    ) : (
                      users.map((user, i) => (
                        <motion.tr
                          key={user.id}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.18, delay: i * 0.03 }}
                          className="border-b border-gray-50 transition-colors hover:bg-gray-50/60 dark:border-white/[0.03] dark:hover:bg-white/[0.02]"
                        >
                          <td className="px-5 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                            {user.username}
                          </td>
                          <td className="px-5 py-3 text-xs text-gray-500 dark:text-gray-400">
                            {user.email}
                          </td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-semibold
                              ${user.role === "superadmin"
                                ? "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"
                                : "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"
                              }`}>
                              {user.role}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-semibold
                              ${user.status === "active"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                                : "bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400"
                              }`}>
                              {user.status}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                            {fmtDateShortEc(user.createdAt)}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button type="button"
                                onClick={() => setUserModal({ open: true, initial: { id: user.id, email: user.email, username: user.username, role: user.role } })}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:border-brand-300 hover:text-brand-500 transition dark:border-white/[0.08] dark:bg-white/[0.03]">
                                <Pencil size={11} />
                              </button>
                              {deleteConfirm === user.id ? (
                                <div className="flex items-center gap-1">
                                  <button type="button" onClick={() => handleDeleteUser(user.id)}
                                    className="rounded-lg bg-rose-500 px-2 py-1 text-[10px] font-semibold text-white hover:bg-rose-600 transition">
                                    Confirmar
                                  </button>
                                  <button type="button" onClick={() => setDeleteConfirm(null)}
                                    className="rounded-lg border border-gray-200 px-2 py-1 text-[10px] text-gray-500 hover:bg-gray-50 transition dark:border-white/[0.08]">
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button type="button"
                                  onClick={() => setDeleteConfirm(user.id)}
                                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:border-rose-300 hover:text-rose-500 transition dark:border-white/[0.08] dark:bg-white/[0.03]">
                                  <Trash2 size={11} />
                                </button>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}

export default PlatformSettingsPage;