import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  kind: "platform-user" | "company-user";
  email: string;
  username: string;
  role: string;
  status: string;
  companyId?: number;
  profile: {
    firstName: string;
    lastName: string;
    title: string;
    phone: string;
    avatarUrl: string;
    timezone: string;
    language: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
  username?: string;
  phone?: string;
  avatarUrl?: string;
  timezone?: string;
  language?: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/** Resultado del cambio de contraseña — permite al componente avanzar el stepper. */
export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; field?: "currentPassword" | "newPassword" | "confirmPassword"; message: string };

// ─── Helper interno de fetch ──────────────────────────────────────────────────

async function apiFetch<T>(
  url: string,
  options?: RequestInit
): Promise<{ data: T | null; error: string | null; field?: string }> {
  try {
    const res = await fetch(url, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...options,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        data: null,
        error: body.error ?? "Error inesperado.",
        field: body.field,
      };
    }

    const data: T = await res.json();
    return { data, error: null };
  } catch {
    return { data: null, error: "No se pudo conectar con el servidor." };
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useProfile() {
  const { session } = useAuth();

  /**
   * Base URL construida desde el companyId de la sesión.
   * Si el usuario es platform-user (superadmin, etc.) no tiene companyId
   * y usamos la ruta plana /api/auth/me como fallback.
   */
  const baseUrl = useMemo(() => {
    if (session?.companyId) {
      return `/api/company/${session.companyId}/auth/me`;
    }
    // Fallback para usuarios de plataforma (sin empresa).
    return `/api/auth/me`;
  }, [session?.companyId]);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPwd, setIsChangingPwd] = useState(false);

  // Evita actualizar estado si el componente ya se desmontó.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── Carga inicial ─────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    if (!session) return;

    setIsLoading(true);
    const { data, error } = await apiFetch<UserProfile>(baseUrl);

    if (!mountedRef.current) return;

    if (error || !data) {
      toast.error("No se pudo cargar el perfil", { description: error ?? undefined });
      setIsLoading(false);
      return;
    }

    setProfile(data);
    setIsLoading(false);
  }, [baseUrl, session]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── Actualizar perfil ─────────────────────────────────────────────────────

  const updateProfile = useCallback(
    async (input: UpdateProfileInput): Promise<boolean> => {
      if (!profile) return false;

      setIsSaving(true);

      // Optimistic update — revertir si falla.
      const previous = profile;
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              username: input.username ?? prev.username,
              profile: { ...prev.profile, ...input },
            }
          : prev
      );

      const { error } = await apiFetch(baseUrl, {
        method: "PATCH",
        body: JSON.stringify(input),
      });

      if (!mountedRef.current) return false;

      setIsSaving(false);

      if (error) {
        setProfile(previous);
        toast.error("No se pudo guardar el perfil", { description: error });
        return false;
      }

      await refresh();
      toast.success("Perfil actualizado correctamente.");
      return true;
    },
    [baseUrl, profile, refresh]
  );

  // ── Cambiar contraseña ────────────────────────────────────────────────────

  const changePassword = useCallback(
    async (input: ChangePasswordInput): Promise<ChangePasswordResult> => {
      // Validación client-side antes de ir al servidor.
      if (input.newPassword !== input.confirmPassword) {
        return {
          ok: false,
          field: "confirmPassword",
          message: "Las contraseñas no coinciden.",
        };
      }

      if (input.newPassword.length < 8) {
        return {
          ok: false,
          field: "newPassword",
          message: "La nueva contraseña debe tener al menos 8 caracteres.",
        };
      }

      setIsChangingPwd(true);

      const { error, field } = await apiFetch(`${baseUrl}/password`, {
        method: "PATCH",
        body: JSON.stringify({
          currentPassword: input.currentPassword,
          newPassword: input.newPassword,
          confirmPassword: input.confirmPassword,
        }),
      });

      if (!mountedRef.current) return { ok: false, message: "Componente desmontado." };

      setIsChangingPwd(false);

      if (error) {
        return {
          ok: false,
          field: field as "currentPassword" | "newPassword" | "confirmPassword" | undefined,
          message: error,
        };
      }

      toast.success("Contraseña actualizada correctamente.");
      return { ok: true };
    },
    [baseUrl]
  );

  // ── Helpers de presentación ───────────────────────────────────────────────

  /** Nombre completo o username como fallback. */
  const displayName = profile
    ? [profile.profile.firstName, profile.profile.lastName].filter(Boolean).join(" ") ||
      profile.username
    : "";

  /** Iniciales para el avatar (máximo 2 caracteres). */
  const initials = displayName
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return {
    profile,
    isLoading,
    isSaving,
    isChangingPwd,
    displayName,
    initials,
    updateProfile,
    changePassword,
    refresh,
  } as const;
}