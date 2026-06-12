import {
  createContext, useCallback, useContext,
  useEffect, useMemo, useState, type ReactNode,
} from "react";
import { canAccessPath, getDefaultRouteForRole, getDefaultRouteForSession } from "../lib/access-control";
import type { PlatformModuleKey, PlatformRole } from "../types/platform";
import type { PermissionMap } from "../lib/module-tree";

const roleLabelMap: Record<string, string> = {
  superadmin:    "Administrador master",
  admin_saas:    "Administrador de plataforma",
  comercial:     "Comercial",
  soporte:       "Soporte",
  owner_empresa: "Propietario de empresa",
  admin_empresa: "Administrador de empresa",
  conductor:     "Conductor",
  operador:      "Operador",
  supervisor:    "Supervisor",
};

export type AuthSession = {
  id: string;
  email: string;
  name: string;
  role: PlatformRole;
  companyModules: string[];
  modulePermissions: Record<string, string[]>;
  permissions: PermissionMap;
  roleLabel: string;
  companyId: string | null;
  scope: "operacion" | "plataforma";
  companyName: string;
  photoUrl: string | null;          // ← NUEVO
};

type LoginInput  = { email: string; password: string; remember: boolean };
type LoginResult =
  | { ok: true;  redirectTo: string }
  | { ok: false; title: string; description: string };

type AuthContextValue = {
  ready: boolean;
  session: AuthSession | null;
  isAuthenticated: boolean;
  login: (input: LoginInput) => Promise<LoginResult>;
  loginPlatform: (input: LoginInput) => Promise<LoginResult>;
  logout: () => void;
  canAccessCurrentPath: (pathname: string) => boolean;
  getHomePath: () => string;
  /** Actualiza photoUrl en la sesión sin recargar la página */
  refreshPhotoUrl: (url: string | null) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Helper para construir la sesión desde la respuesta del servidor ────────────
function buildSession(data: Record<string, unknown>): AuthSession {
  return {
    ...(data as AuthSession),
    companyName:       (data.companyName as string)  ?? "",
    companyModules:    (data.companyModules as string[])   ?? [],
    modulePermissions: (data.modulePermissions as Record<string, string[]>) ?? {},
    permissions:       (data.permissions as PermissionMap) ?? {},
    roleLabel:         roleLabelMap[data.role as string] ?? (data.role as string),
    photoUrl:          (data.photoUrl as string | null) ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [ready,   setReady]   = useState(false);

  // Restaurar sesión desde la cookie httpOnly
  useEffect(() => {
    let mounted = true;
    fetch("/api/auth/session", { credentials: "include" })
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (mounted && data) setSession(buildSession(data));
      })
      .catch(() => {})
      .finally(() => { if (mounted) setReady(true); });

    return () => { mounted = false; };
  }, []);

  // Login operadores (scope: operacion)
  const login = useCallback(async ({ email, password, remember }: LoginInput): Promise<LoginResult> => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: email, password, remember, scope: "operacion" }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { ok: false, title: "Acceso denegado", description: (err as {message?: string}).message ?? "Credenciales inválidas." };
      }

      const data = await res.json();
      const built = buildSession(data);
      setSession(built);
      return {
        ok: true,
        redirectTo: getDefaultRouteForSession({
          role: built.role,
          modulePermissions: built.modulePermissions,
          companyModules: built.companyModules,
        }),
      };
    } catch {
      return { ok: false, title: "Error de conexión", description: "No se pudo conectar con el servidor." };
    }
  }, []);

  // Login superadmin (scope: plataforma)
  const loginPlatform = useCallback(async ({ email, password, remember }: LoginInput): Promise<LoginResult> => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: email, password, remember, scope: "plataforma" }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { ok: false, title: "Acceso denegado", description: (err as {message?: string}).message ?? "Credenciales inválidas." };
      }

      const data = await res.json();
      setSession(buildSession(data));
      return { ok: true, redirectTo: "/platform/dashboard" };
    } catch {
      return { ok: false, title: "Error de conexión", description: "No se pudo conectar con el servidor." };
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    setSession(null);
    window.location.assign("/signin");
  }, []);

  /** Permite actualizar solo la foto sin re-fetch completo */
  const refreshPhotoUrl = useCallback((url: string | null) => {
    setSession((prev) => prev ? { ...prev, photoUrl: url } : prev);
  }, []);

  const canAccessCurrentPath = useCallback(
    (pathname: string) => session ? canAccessPath(session.role, pathname) : false,
    [session]
  );

  const getHomePath = useCallback(
    () => session
      ? getDefaultRouteForSession({
          role: session.role,
          modulePermissions: session.modulePermissions,
          companyModules: session.companyModules,
        })
      : "/signin",
    [session]
  );

  const value = useMemo<AuthContextValue>(() => ({
    ready,
    session,
    isAuthenticated: Boolean(session),
    login,
    loginPlatform,
    logout,
    canAccessCurrentPath,
    getHomePath,
    refreshPhotoUrl,
  }), [ready, session, login, loginPlatform, logout, canAccessCurrentPath, getHomePath, refreshPhotoUrl]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}