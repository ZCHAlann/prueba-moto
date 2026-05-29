"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  canAccessPath,
  getDefaultRouteForRole,
} from "@/lib/access-control";
import type { PlatformRole } from "@/types/platform";
import type { AuthScope } from "@/lib/auth-session";

const roleLabelMap: Record<string, string> = {
  superadmin: "Administrador master",
  admin_saas: "Administrador de plataforma",
  comercial: "Comercial",
  soporte: "Soporte",
  owner_empresa: "Propietario de empresa",
  admin_empresa: "Administrador de empresa",
  conductor: "Conductor",
  operador: "Operador",
  supervisor: "Supervisor",
};

function enrichSession(raw: AuthSession): AuthSession {
  return {
    ...raw,
    roleLabel: raw.roleLabel || roleLabelMap[raw.role] || raw.role,
    title: raw.title || roleLabelMap[raw.role] || raw.role,
    modulePermissions: raw.modulePermissions ?? [],
    companyName: raw.companyName ?? "",
  };
}

export type AuthSession = {
  id: string;
  email: string;
  name: string;
  role: PlatformRole;
  modulePermissions: string[];
  roleLabel: string;
  title: string;
  companyId: string | null;
  companyName: string;
  scope: AuthScope;
};

type LoginInput = {
  email: string;
  password: string;
  remember: boolean;
  scope: AuthScope;
};

type LoginResult =
  | { ok: true; redirectTo: string }
  | { ok: false; title: string; description: string };

type AuthContextValue = {
  ready: boolean;
  session: AuthSession | null;
  isAuthenticated: boolean;
  login: (input: LoginInput) => Promise<LoginResult>;
  logout: () => void;
  canAccessCurrentPath: (pathname: string) => boolean;
  getHomePath: () => string;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);

  // Al montar: intentar refrescar sesión desde el JWT en cookie httpOnly
  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
          credentials: "include",
        });

        if (!response.ok) {
          return;
        }

        const data = enrichSession(await response.json() as AuthSession);
        if (mounted) {
          setSession(data);
        }
      } catch {
        // Backend no disponible — sin sesión
      } finally {
        if (mounted) setReady(true);
      }
    }

    void restoreSession();
    return () => { mounted = false; };
  }, []);

  const login = useCallback(async ({ email, password, remember, scope }: LoginInput): Promise<LoginResult> => {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: email, password, remember, scope }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return {
          ok: false,
          title: "Acceso denegado",
          description: err.message ?? "Credenciales inválidas.",
        };
      }

      const data = enrichSession(await response.json() as AuthSession);
      setSession(data);

      return {
        ok: true,
        redirectTo: getDefaultRouteForRole(data.role),
      };
    } catch {
      return {
        ok: false,
        title: "Error de conexión",
        description: "No se pudo conectar con el servidor. Intenta nuevamente.",
      };
    }
  }, []);

  const logout = useCallback(async () => {
    // Borrar la cookie httpOnly desde el servidor
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    setSession(null);
    window.location.assign("/login");
  }, []);

  const canAccessCurrentPath = useCallback(
    (pathname: string) => session ? canAccessPath(session.role, pathname) : false,
    [session]
  );

  const getHomePath = useCallback(
    () => session ? getDefaultRouteForRole(session.role) : "/login",
    [session]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      session,
      isAuthenticated: Boolean(session),
      login,
      logout,
      canAccessCurrentPath,
      getHomePath,
    }),
    [ready, session, login, logout, canAccessCurrentPath, getHomePath]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}