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
  photoUrl: string | null;          // ← columna real en la tabla
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
  /** URL o data-URI de la foto — se guarda en la columna photo_url */
  photoUrl?: string | null;
  timezone?: string;
  language?: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

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
        error: (body as { error?: string }).error ?? "Error inesperado.",
        field: (body as { field?: string }).field,
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
  const { session, refreshPhotoUrl } = useAuth();

  const baseUrl = useMemo(() => {
    if (session?.companyId) return `/api/company/${session.companyId}/auth/me`;
    return `/api/auth/me`;
  }, [session?.companyId]);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPwd, setIsChangingPwd] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
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

  useEffect(() => { refresh(); }, [refresh]);

  // ── Actualizar perfil ─────────────────────────────────────────────────────

  const updateProfile = useCallback(
    async (input: UpdateProfileInput): Promise<boolean> => {
      if (!profile) return false;
      setIsSaving(true);

      // Optimistic update
      const previous = profile;
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              username: input.username ?? prev.username,
              photoUrl: input.photoUrl !== undefined ? (input.photoUrl ?? null) : prev.photoUrl,
              profile: {
                ...prev.profile,
                firstName: input.firstName ?? prev.profile.firstName,
                lastName:  input.lastName  ?? prev.profile.lastName,
                phone:     input.phone     ?? prev.profile.phone,
                timezone:  input.timezone  ?? prev.profile.timezone,
                language:  input.language  ?? prev.profile.language,
              },
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

      // Refrescar perfil completo y sincronizar foto en el header
      await refresh();

      // Actualizar photoUrl en la sesión para que el header lo refleje de inmediato
      if (input.photoUrl !== undefined) {
        refreshPhotoUrl(input.photoUrl ?? null);
      }

      toast.success("Perfil actualizado correctamente.");
      return true;
    },
    [baseUrl, profile, refresh, refreshPhotoUrl]
  );

  // ── Cambiar contraseña ────────────────────────────────────────────────────

  const changePassword = useCallback(
    async (input: ChangePasswordInput): Promise<ChangePasswordResult> => {
      if (input.newPassword !== input.confirmPassword) {
        return { ok: false, field: "confirmPassword", message: "Las contraseñas no coinciden." };
      }
      if (input.newPassword.length < 8) {
        return { ok: false, field: "newPassword", message: "Mínimo 8 caracteres." };
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

  const displayName = profile
    ? [profile.profile.firstName, profile.profile.lastName].filter(Boolean).join(" ") || profile.username
    : "";

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