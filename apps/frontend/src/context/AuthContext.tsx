import {
  createContext, useCallback, useContext,
  useEffect, useMemo, useState, type ReactNode,
} from "react";
import { canAccessPath, getDefaultRouteForRole } from "../lib/access-control";
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
};

const AuthContext = createContext<AuthContextValue | null>(null);

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
        if (mounted && data) {
          setSession({
            ...data,
            companyModules:    data.companyModules ?? [],
            modulePermissions: data.modulePermissions ?? {},
            permissions:       data.permissions ?? {},
            roleLabel:         roleLabelMap[data.role] ?? data.role,
          });
        }
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
        return { ok: false, title: "Acceso denegado", description: err.message ?? "Credenciales inválidas." };
      }

      const data = await res.json();
      setSession({
        ...data,
        companyModules:    data.companyModules ?? [],
        modulePermissions: data.modulePermissions ?? {},
        permissions:       data.permissions ?? {},
        roleLabel:         roleLabelMap[data.role] ?? data.role,
      });

      return { ok: true, redirectTo: getDefaultRouteForRole(data.role) };
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
        return { ok: false, title: "Acceso denegado", description: err.message ?? "Credenciales inválidas." };
      }

      const data = await res.json();
      setSession({
        ...data,
        companyModules:    data.companyModules ?? [],
        modulePermissions: data.modulePermissions ?? {},
        permissions:       data.permissions ?? {},
        roleLabel:         roleLabelMap[data.role] ?? data.role,
      });

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

  const canAccessCurrentPath = useCallback(
    (pathname: string) => session ? canAccessPath(session.role, pathname) : false,
    [session]
  );

  const getHomePath = useCallback(
    () => session ? getDefaultRouteForRole(session.role) : "/signin",
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
  }), [ready, session, login, loginPlatform, logout, canAccessCurrentPath, getHomePath]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}