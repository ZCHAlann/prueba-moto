import {
  createContext, useCallback, useContext,
  useEffect, useMemo, useState, type ReactNode,
} from "react";
import { toast } from "sonner";
import { canAccessPath, getDefaultRouteForSession } from "../lib/access-control";
import type { PlatformRole } from "../types/platform";
import type { PermissionMap } from "../lib/module-tree";
import { onAuthInvalidated, defaultMessageForCode } from "../lib/authEvents";

const roleLabelMap: Record<string, string> = {
  superadmin:    "Administrador master",
  admin_saas:    "Administrador de plataforma",
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
  modulePermissions: Record<string, Record<string, string[]>>;
  permissions: PermissionMap;
  roleLabel: string;
  companyId: string | null;
  scope: "operacion" | "plataforma";
  companyName: string;
  photoUrl: string | null;
  /** jun 2026 — DNI/cédula del usuario logueado. Lo emite el backend en
   *  /auth/session leyendo la columna `dni` de `company_users` /
   *  `platform_users` (migración 0040). Sirve para que el wizard del
   *  acta PDF de asignaciones autorrellene la firma del responsable
   *  (Departamento Logístico) sin tipear a mano. */
  dni: string | null;
  /** Timestamp del último cambio de permisos en BD. Lo emite el backend
   *  en `/auth/session`. Sirve para que el frontend invalide la sesión
   *  si el JWT tiene una versión vieja. */
  permissionsUpdatedAt: string | null;
  /** jul 2026 v5 — Sede principal del usuario (de `profileData.siteId`).
   *  Si es `null`, el usuario no tiene sede asignada (admin / plataforma
   *  / owner). El modal de "Nueva solicitud" de Caja Chica usa este
   *  campo para autoseccionar la sede del operador y NO darle a
   *  elegir entre varias. */
  siteId: number | null;
  /** JWT crudo (no la cookie httpOnly, sino el valor que viene en el body
   *  del login). Se usa SOLO para el upgrade del WebSocket (los browsers
   *  no envían cookies en conexiones WS). NUNCA persistir en disco. */
  token?: string | null;
};

type LoginInput  = { email: string; password: string; remember: boolean };
type LoginResult =
  | { ok: true;  redirectTo: string }
  | { ok: false; title: string; description: string };

type AuthContextValue = {
  ready: boolean;
  session: AuthSession | null;
  isAuthenticated: boolean;
  /**
   * ID numérico de la empresa actual como string (formato esperado por los
   * endpoints `/api/company/:companyId/...`). Viene de `session.companyId`.
   * `null` cuando no hay sesión o el usuario no pertenece a una empresa
   * (ej. superadmin sin empresa asignada).
   */
  companyId: string | null;
  login: (input: LoginInput) => Promise<LoginResult>;
  loginPlatform: (input: LoginInput) => Promise<LoginResult>;
  logout: () => void;
  canAccessCurrentPath: (pathname: string) => boolean;
  getHomePath: () => string;
  /** Actualiza photoUrl en la sesión sin recargar la página */
  refreshPhotoUrl: (url: string | null) => void;
  /**
   * Vuelve a llamar a `/api/auth/session` y refresca la sesión local con
   * los permisos actuales. Usar después de cambiar permisos/roles de un
   * usuario para que los cambios se vean sin re-login.
   */
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Helper para construir la sesión desde la respuesta del servidor ────────────
function buildSession(data: Record<string, unknown>): AuthSession {
  return {
    ...(data as AuthSession),
    companyName:          (data.companyName as string)  ?? "",
    companyModules:       (data.companyModules as string[])   ?? [],
    modulePermissions:    (data.modulePermissions as Record<string, Record<string, string[]>>) ?? {},
    permissions:          (data.permissions as PermissionMap) ?? {},
    roleLabel:            roleLabelMap[data.role as string] ?? (data.role as string),
    photoUrl:             (data.photoUrl as string | null) ?? null,
    dni:                  (data.dni as string | null) ?? null,
    permissionsUpdatedAt: (data.permissionsUpdatedAt as string | null) ?? null,
    // jul 2026 v5 — Sede principal del usuario. null = admin/plataforma
    // o usuario sin sede asignada.
    siteId:               (data.siteId as number | null) ?? null,
    token:                (data.token as string | undefined) ?? null,
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

  // Nota: el re-fetch por cambio de ruta se hace en <SessionRefresher />,
  // un componente que está dentro del <Router>. No podemos usar
  // useLocation() aquí porque el provider se monta afuera del Router.
  // (ver: src/App.tsx → <SessionRefresher />).

  // ── Listener global de auth:invalidated (Fase 3.4) ─────────────────────
  // Cuando cualquier apiFetch (en cualquier hook) recibe 401/403 con
  // un code de inactividad, dispatcha este evento. Acá lo capturamos
  // para hacer logout + mostrar toast + redirigir.
  useEffect(() => {
    return onAuthInvalidated((detail) => {
      // Limpia la sesión local
      setSession(null);
      // Toast con el motivo
      toast.error(defaultMessageForCode(detail.code), {
        description: "Tu sesión fue cerrada por un cambio de estado administrativo.",
        duration: 8000,
      });
      // Redirige a login con el motivo en query para que el form lo muestre
      const qs = new URLSearchParams({ reason: detail.code }).toString();
      // Solo redirigir si no estamos ya en /signin (evita loop)
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/signin")) {
        window.location.assign(`/signin?${qs}`);
      }
    });
  }, []);

  // Guardamos el JWT en sessionStorage (NO localStorage) para que el WS
  // pueda leerlo sin tener que volver a pedirlo al backend en cada reconexión.
// sessionStorage se borra al cerrar la pestaña — más seguro que localStorage.
  function stashToken(token: string | null | undefined) {
    try {
      if (token) sessionStorage.setItem('wsToken', token);
      else sessionStorage.removeItem('wsToken');
    } catch { /* ignore */ }
  }

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
        const code = typeof (err as { code?: unknown }).code === "string"
          ? (err as { code: string }).code
          : null;
        // Si el backend indica inactividad, el título es más específico
        // (Fase 3.3). El form de login ya muestra `description` tal cual.
        const titleByCode: Record<string, string> = {
          USER_INACTIVE:   "Cuenta inactiva",
          DRIVER_INACTIVE: "Conductor inactivo",
          SITE_INACTIVE:   "Sede inactiva",
        };
        const title = (code && titleByCode[code]) || "Acceso denegado";
        const description = (err as {message?: string}).message ?? "Credenciales inválidas.";
        return { ok: false, title, description };
      }

      const data = await res.json();
      const built = buildSession(data);
      setSession(built);
      stashToken(built.token);
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
      const built = buildSession(data);
      setSession(built);
      stashToken(built.token);
      return { ok: true, redirectTo: "/platform/dashboard" };
    } catch {
      return { ok: false, title: "Error de conexión", description: "No se pudo conectar con el servidor." };
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    setSession(null);
    stashToken(null);
    window.location.assign("/signin");
  }, []);

  /** Permite actualizar solo la foto sin re-fetch completo */
  const refreshPhotoUrl = useCallback((url: string | null) => {
    setSession((prev) => prev ? { ...prev, photoUrl: url } : prev);
  }, []);

  /**
   * Vuelve a leer la sesión del backend y actualiza el estado. Usar después
   * de cambiar permisos/rol de cualquier usuario (incluido el actual) para
   * que los cambios se reflejen sin re-login. La respuesta trae siempre
   * los permisos frescos de BD.
   */
  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setSession(buildSession(data));
    } catch {
      /* ignore */
    }
  }, []);

  const canAccessCurrentPath = useCallback(
    (pathname: string) =>
      session
        ? canAccessPath(session.role, pathname, (session.modulePermissions ?? {}) as Record<string, Record<string, string[]>>)
        : false,
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
    companyId: session?.companyId ?? null,
    login,
    loginPlatform,
    logout,
    canAccessCurrentPath,
    getHomePath,
    refreshPhotoUrl,
    refreshSession,
  }), [ready, session, login, loginPlatform, logout, canAccessCurrentPath, getHomePath, refreshPhotoUrl, refreshSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}