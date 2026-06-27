"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useProfile } from "@/hooks/useProfile";
import type { UpdateProfileInput, ChangePasswordInput } from "@/hooks/useProfile";
import { fmtDateLongEc } from "@/lib/datetime";

// ─── Iconos inline ────────────────────────────────────────────────────────────

function IconUser({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}
function IconShield({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M12 3l8 4v5c0 5-3.5 9-8 10C4.5 21 1 17 1 12V7l11-4z" />
    </svg>
  );
}
function IconCheck({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconEye({ className, open }: { className?: string; open: boolean }) {
  return open ? (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
function IconX({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
    </svg>
  );
}
function IconCamera({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
function IconTrash({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconLoader({ className }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
    </svg>
  );
}

// ─── Campo de texto reutilizable ──────────────────────────────────────────────

function Field({
  label, value, onChange, type = "text", error, disabled, hint,
  noDigits, digitsOnly, maxLength, toLowerCase,
}: {
  label: string; value: string; onChange?: (v: string) => void;
  type?: string; error?: string; disabled?: boolean; hint?: string;
  noDigits?: boolean; digitsOnly?: boolean; maxLength?: number; toLowerCase?: boolean;
}) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword ? (show ? "text" : "password") : type;

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">
        {label}
      </label>
      <div className="relative">
        <input
          type={inputType}
          value={value}
          maxLength={maxLength ?? undefined}
          onKeyDown={(e) => {
            if (noDigits && /\d/.test(e.key)) e.preventDefault();
            if (digitsOnly && !/[0-9]/.test(e.key) && !['Backspace','Delete','Tab','ArrowLeft','ArrowRight','Home','End'].includes(e.key)) e.preventDefault();
          }}
          onChange={(e) => {
            let v = e.target.value;
            if (toLowerCase) v = v.toLowerCase();
            if (maxLength) v = v.slice(0, maxLength);
            onChange?.(v);
          }}
          disabled={disabled}
          className={`
            w-full rounded-xl border bg-white dark:bg-white/[0.03] px-4 py-2.5 text-sm
            text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-600
            transition-all outline-none
            ${error
              ? "border-error-500 focus:border-error-400 focus:ring-2 focus:ring-error-500/20"
              : "border-gray-200 dark:border-white/[0.06] focus:border-brand-400 dark:focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            }
            ${disabled ? "opacity-50 cursor-not-allowed" : ""}
            ${isPassword ? "pr-10" : ""}
          `}
        />
        {isPassword && (
          <button type="button" onClick={() => setShow((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <IconEye className="w-4 h-4" open={show} />
          </button>
        )}
      </div>
      {error && <p className="text-xs text-error-500">{error}</p>}
      {hint && !error && <p className="text-xs text-gray-400 dark:text-gray-500">{hint}</p>}
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-gray-100 dark:bg-white/[0.05] ${className}`} />;
}

// ─── Modal cambio de contraseña ───────────────────────────────────────────────

type PwdStep = 1 | 2 | 3;
const PWD_STEPS = [
  { step: 1 as PwdStep, label: "Verificar identidad" },
  { step: 2 as PwdStep, label: "Nueva contraseña" },
  { step: 3 as PwdStep, label: "Confirmación" },
];

function PasswordModal({ onClose, onSubmit, isLoading }: {
  onClose: () => void;
  onSubmit: (input: ChangePasswordInput) => Promise<void>;
  isLoading: boolean;
}) {
  const [step, setStep] = useState<PwdStep>(1);
  const [fields, setFields] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [errors, setErrors] = useState<Partial<typeof fields>>({});

  function setField(key: keyof typeof fields, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "" }));
  }

  async function handleNext() {
    if (step === 1) {
      if (!fields.currentPassword) { setErrors({ currentPassword: "Ingresa tu contraseña actual." }); return; }
      setStep(2); return;
    }
    if (step === 2) {
      if (fields.newPassword.length < 8) { setErrors({ newPassword: "Mínimo 8 caracteres." }); return; }
      setStep(3); return;
    }
    if (step === 3) {
      if (fields.newPassword !== fields.confirmPassword) { setErrors({ confirmPassword: "Las contraseñas no coinciden." }); return; }
      await onSubmit(fields);
    }
  }

  return (
    <AnimatePresence>
      <motion.div key="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div key="modal"
        initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }} transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md">
        <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-gray-900 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 pt-6 pb-4 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-500/10 flex items-center justify-center">
                <IconShield className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-white">Cambiar contraseña</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">{PWD_STEPS[step - 1].label}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors">
              <IconX className="w-4 h-4" />
            </button>
          </div>
          <div className="px-4 pb-2 sm:px-6">
            <div className="flex items-center gap-2 mb-3">
              {PWD_STEPS.map((s, i) => (
                <div key={s.step} className="flex items-center gap-2 flex-1">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 shrink-0 ${step > s.step ? "bg-success-500 text-white" : step === s.step ? "bg-brand-500 text-white ring-4 ring-brand-500/20" : "bg-gray-100 dark:bg-white/[0.06] text-gray-400 dark:text-gray-500"}`}>
                    {step > s.step ? <IconCheck className="w-3 h-3" /> : s.step}
                  </div>
                  {i < PWD_STEPS.length - 1 && (
                    <div className="h-px flex-1 bg-gray-100 dark:bg-white/[0.06] overflow-hidden rounded-full">
                      <motion.div className="h-full bg-brand-500" animate={{ width: step > s.step ? "100%" : "0%" }} transition={{ duration: 0.4, ease: "easeOut" }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="px-4 pb-6 sm:px-6">
            <AnimatePresence mode="wait">
              <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }} className="space-y-4">
                {step === 1 && (<><p className="text-xs text-gray-400 dark:text-gray-500">Ingresa tu contraseña actual para verificar que eres tú.</p><Field label="Contraseña actual" type="password" value={fields.currentPassword} onChange={(v) => setField("currentPassword", v)} error={errors.currentPassword} /></>)}
                {step === 2 && (<><p className="text-xs text-gray-400 dark:text-gray-500">Elige una contraseña segura con al menos 8 caracteres.</p><Field label="Nueva contraseña" type="password" value={fields.newPassword} onChange={(v) => setField("newPassword", v)} error={errors.newPassword} />{fields.newPassword.length > 0 && (<div className="space-y-1"><div className="flex gap-1">{[1, 2, 3, 4].map((i) => { const strength = Math.min(Math.floor(fields.newPassword.length / 3), 4); return (<div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= strength ? strength <= 1 ? "bg-error-500" : strength <= 2 ? "bg-warning-500" : strength <= 3 ? "bg-brand-400" : "bg-success-500" : "bg-gray-100 dark:bg-white/[0.06]"}`} />); })}</div><p className="text-xs text-gray-400 dark:text-gray-500">{fields.newPassword.length < 8 ? "Muy corta" : fields.newPassword.length < 12 ? "Aceptable" : fields.newPassword.length < 16 ? "Buena" : "Excelente"}</p></div>)}</>)}
                {step === 3 && (<><p className="text-xs text-gray-400 dark:text-gray-500">Confirma la nueva contraseña para completar el cambio.</p><Field label="Confirmar contraseña" type="password" value={fields.confirmPassword} onChange={(v) => setField("confirmPassword", v)} error={errors.confirmPassword} />{fields.confirmPassword && fields.newPassword === fields.confirmPassword && (<div className="flex items-center gap-2 text-success-600 dark:text-success-400"><IconCheck className="w-4 h-4" /><span className="text-xs font-medium">Las contraseñas coinciden</span></div>)}</>)}
              </motion.div>
            </AnimatePresence>
            <div className="flex flex-col-reverse items-stretch gap-2 mt-6 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" onClick={() => step > 1 ? setStep((s) => (s - 1) as PwdStep) : onClose()} className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                {step > 1 ? "← Atrás" : "Cancelar"}
              </button>
              <button type="button" onClick={handleNext} disabled={isLoading} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors disabled:opacity-60">
                {isLoading && <IconLoader className="w-4 h-4" />}
                {step < 3 ? "Continuar →" : "Cambiar contraseña"}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function ProfilePage() {
  const { session } = useAuth();
  const {
    profile, isLoading, isSaving, isChangingPwd,
    displayName, initials, updateProfile, changePassword,
  } = useProfile();

  const [form, setForm] = useState<UpdateProfileInput>({});
  const [showPwdModal, setShowPwdModal] = useState(false);

  // Preview local de la foto (data-URI mientras no se guarda)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  // true mientras se procesa el archivo
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  // Sincronizar form cuando carga el perfil
  useEffect(() => {
    if (!profile) return;
    setForm({
      firstName: profile.profile.firstName,
      lastName:  profile.profile.lastName,
      username:  profile.username,
      phone:     profile.profile.phone,
      timezone:  profile.profile.timezone,
      language:  profile.profile.language,
    });
    // Usar photoUrl de la columna real (no del profileData legado)
    setPhotoPreview(profile.photoUrl ?? null);
  }, [profile]);

  function handleField(key: keyof UpdateProfileInput, value: string) {
    // Saneado defensivo contra XSS / SQLi en strings largos
    if (key === "phone") {
      value = value.replace(/\D/g, "").slice(0, 10);
    } else if (key === "firstName" || key === "lastName") {
      value = value.replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñÜü\s'-]/g, "").slice(0, 80);
    } else if (key === "username") {
      value = value.toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 40);
    } else if (typeof value === "string") {
      // Eliminar HTML y patrones peligrosos
      value = value.replace(/[<>]/g, "").slice(0, 200);
    }
    setForm((f) => ({ ...f, [key]: value }));
  }

  // ── Manejo de archivo de foto ────────────────────────────────────────────

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tamaño (máx 2 MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error("La imagen es muy grande", { description: "El máximo permitido es 2 MB." });
      return;
    }

    setIsProcessingPhoto(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setPhotoPreview(dataUrl);
      setIsProcessingPhoto(false);
    };
    reader.onerror = () => {
      toast.error("No se pudo leer el archivo.");
      setIsProcessingPhoto(false);
    };
    reader.readAsDataURL(file);

    // Reset input para permitir reseleccionar el mismo archivo
    e.target.value = "";
  }

  function handleRemovePhoto() {
    setPhotoPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  // ── Submit ───────────────────────────────────────────────────────────────

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await updateProfile({
      ...form,
      photoUrl: photoPreview,   // null = eliminar foto, string = nueva foto
    });
  }

  async function handlePasswordSubmit(input: ChangePasswordInput) {
    const result = await changePassword(input);
    if (result.ok) {
      setShowPwdModal(false);
    } else {
      toast.error(result.message);
    }
  }

  // ── Foto actual a mostrar (preview local tiene prioridad) ────────────────
  const currentPhoto = photoPreview;
  const photoChanged = photoPreview !== (profile?.photoUrl ?? null);

  // ── Skeleton ─────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex items-center gap-3">
          <Skeleton className="w-16 h-5" />
          <Skeleton className="w-32 h-7" />
        </div>
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Skeleton className="h-96" />
          <div className="space-y-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {showPwdModal && (
        <PasswordModal onClose={() => setShowPwdModal(false)} onSubmit={handlePasswordSubmit} isLoading={isChangingPwd} />
      )}

      <div className="space-y-6">

        {/* Header de página */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-lg bg-brand-50 dark:bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:text-brand-400 tracking-wide">Cuenta</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white tracking-tight">Mi perfil</h1>
            <p className="text-sm text-gray-400 dark:text-gray-500">Gestiona tu información personal, preferencias y seguridad de acceso.</p>
          </div>
          <button type="button" onClick={() => setShowPwdModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] text-sm font-medium text-gray-600 dark:text-gray-300 hover:border-brand-300 dark:hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400 transition-all">
            <IconShield className="w-4 h-4" />
            Cambiar contraseña
          </button>
        </motion.div>

        {/* Layout principal */}
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">

          {/* Columna izquierda: avatar + resumen */}
          <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 0.1 }} className="space-y-4">

            {/* Avatar card */}
            <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] p-6 flex flex-col items-center gap-4">

              {/* Avatar */}
              <div className="relative">
                {/* Anillo pulsante */}
                <div className="absolute inset-0 rounded-full border-2 border-brand-400/30 dark:border-brand-500/30 animate-ping" style={{ animationDuration: "3s" }} />
                <div className="absolute inset-0 rounded-full border border-brand-400/20 dark:border-brand-500/20" />

                <div className="relative w-24 h-24 rounded-full border-2 border-brand-400/40 dark:border-brand-500/40 overflow-hidden bg-gradient-to-br from-brand-400 to-brand-600">
                  {isProcessingPhoto ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <IconLoader className="w-6 h-6 text-white" />
                    </div>
                  ) : currentPhoto ? (
                    <img src={currentPhoto} alt="Foto de perfil" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white text-2xl font-bold tracking-tight">
                      {initials || <IconUser className="w-10 h-10 opacity-80" />}
                    </div>
                  )}
                </div>

                {/* Botón subir foto */}
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-white/[0.06] flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-brand-500 dark:hover:text-brand-400 transition-colors shadow-sm"
                  title="Cambiar foto">
                  <IconCamera className="w-3.5 h-3.5" />
                </button>

                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              </div>

              {/* Nombre y rol */}
              <div className="text-center space-y-1">
                <p className="text-base font-semibold text-gray-800 dark:text-white">{displayName || "—"}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">{profile?.profile.title || session?.roleLabel || "—"}</p>
              </div>

              {/* Estado */}
              <div className="flex items-center gap-1.5 text-xs text-success-600 dark:text-success-400">
                <span className="w-2 h-2 rounded-full bg-success-500 animate-pulse" />
                Sesión activa
              </div>

              {/* Botones de foto */}
              <div className="flex gap-2 w-full">
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.06] text-xs font-medium text-gray-600 dark:text-gray-300 hover:border-brand-300 dark:hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400 transition-all">
                  <IconCamera className="w-3.5 h-3.5" />
                  {currentPhoto ? "Cambiar" : "Subir foto"}
                </button>
                {currentPhoto && (
                  <button type="button" onClick={handleRemovePhoto}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-white/[0.06] text-xs font-medium text-gray-500 dark:text-gray-400 hover:border-red-300 dark:hover:border-red-500/40 hover:text-red-500 dark:hover:text-red-400 transition-all"
                    title="Quitar foto">
                    <IconTrash className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Indicador de cambio pendiente */}
              {photoChanged && (
                <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
                  Foto modificada — guarda los cambios para aplicar.
                </p>
              )}

              <p className="text-[10px] text-gray-400 dark:text-gray-600 text-center">
                JPG, PNG o WebP · máx. 2 MB
              </p>
            </div>

            {/* Resumen de acceso */}
            <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] p-4 space-y-3">
              <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500 px-1">Acceso</p>
              {[
                { label: "Rol",          value: session?.roleLabel ?? "—" },
                { label: "Correo",       value: profile?.email ?? "—" },
                { label: "Estado",       value: profile?.status === "active" ? "Activo" : "Inactivo" },
                { label: "Zona horaria", value: profile?.profile.timezone ?? "—" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-white/[0.04] last:border-0">
                  <span className="text-xs text-gray-400 dark:text-gray-500">{item.label}</span>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300 text-right max-w-[160px] truncate">{item.value}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Columna derecha: formulario */}
          <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 0.15 }}>
            <form onSubmit={handleSave}>
              <div className="rounded-2xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] p-6 space-y-6">

                {/* Datos personales */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3 pb-3 border-b border-gray-100 dark:border-white/[0.04]">
                    <div className="w-7 h-7 rounded-lg bg-brand-50 dark:bg-brand-500/10 flex items-center justify-center">
                      <IconUser className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800 dark:text-white">Datos personales</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">Información visible en la plataforma</p>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Nombre"   value={form.firstName ?? ""} onChange={(v) => handleField("firstName", v)} noDigits maxLength={80} />
                    <Field label="Apellido" value={form.lastName  ?? ""} onChange={(v) => handleField("lastName", v)} noDigits maxLength={80} />
                    <Field label="Usuario"  value={form.username  ?? ""} onChange={(v) => handleField("username", v)} hint="Usado para iniciar sesión" maxLength={40} toLowerCase />
                    <Field label="Teléfono" type="tel" value={form.phone ?? ""} onChange={(v) => handleField("phone", v)} digitsOnly maxLength={10} />
                    <Field label="Correo electrónico" type="email" value={profile?.email ?? ""} disabled hint="El correo no puede modificarse aquí" />
                  </div>
                </div>

                {/* Preferencias */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3 pb-3 border-b border-gray-100 dark:border-white/[0.04]">
                    <div>
                      <p className="text-sm font-semibold text-gray-800 dark:text-white">Preferencias</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">Idioma y zona horaria</p>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">Idioma</label>
                      <select value={form.language ?? "es"} onChange={(e) => handleField("language", e.target.value)}
                        className="w-full rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] px-4 py-2.5 text-sm text-gray-800 dark:text-white outline-none focus:border-brand-400 dark:focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all">
                        <option value="es">Español</option>
                        <option value="en">English</option>
                        <option value="pt">Português</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">Zona horaria</label>
                      <select value={form.timezone ?? "America/Guayaquil"} onChange={(e) => handleField("timezone", e.target.value)}
                        className="w-full rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] px-4 py-2.5 text-sm text-gray-800 dark:text-white outline-none focus:border-brand-400 dark:focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all">
                        <option value="America/Guayaquil">Ecuador (GMT-5)</option>
                        <option value="America/Bogota">Colombia (GMT-5)</option>
                        <option value="America/Lima">Perú (GMT-5)</option>
                        <option value="America/Santiago">Chile (GMT-4)</option>
                        <option value="America/Buenos_Aires">Argentina (GMT-3)</option>
                        <option value="America/Mexico_City">México (GMT-6)</option>
                        <option value="America/New_York">New York (GMT-5)</option>
                        <option value="Europe/Madrid">Madrid (GMT+1)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex flex-col-reverse items-stretch gap-3 pt-4 border-t border-gray-100 dark:border-white/[0.04] sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Última actualización:{" "}
                    {fmtDateLongEc(profile?.updatedAt ?? null)}
                  </p>
                  <button type="submit" disabled={isSaving}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold transition-colors disabled:opacity-60">
                    {isSaving && <IconLoader className="w-4 h-4" />}
                    {isSaving ? "Guardando..." : "Guardar cambios"}
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        </div>
      </div>
    </>
  );
}