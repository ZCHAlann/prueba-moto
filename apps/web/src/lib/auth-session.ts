import type { PlatformRole } from "@/types/platform";

export const AUTH_COOKIE_NAME = "aplismart-token";

export type AuthScope = "operacion" | "plataforma";

// Lo que guardamos en el JWT (viene del backend)
export type AuthCookiePayload = {
  email: string;
  role: PlatformRole;
  scope: AuthScope;
};

// Shape del user que devuelve el backend en /auth/login y /auth/session
export type BackendUser = {
  id: string;
  email: string;
  username: string;
  name?: string;
  role: PlatformRole;
  scope: AuthScope;
  companyId?: number | null;
};

// Shape completo de /auth/login
export type BackendLoginResponse = {
  token: string;
  user: BackendUser;
};

// Helpers para leer el token desde cookie del cliente (no httpOnly)
// Solo se usa en el middleware de Next.js — el token real es httpOnly
export function getTokenFromCookieHeader(cookieHeader: string): string | null {
  const match = cookieHeader
    .split("; ")
    .find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
  return match ? match.split("=")[1] : null;
}

// Decodifica el payload del JWT sin verificar firma (solo para leer claims en el cliente)
// La verificación real la hace el backend Express
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

// Para compatibilidad con el middleware que chequea si hay sesión válida
export function parseAuthCookie(rawValue?: string | null): AuthCookiePayload | null {
  if (!rawValue) return null;
  try {
    // El nuevo token es un JWT opaco — solo verificamos que tenga forma de JWT
    const parts = rawValue.split(".");
    if (parts.length !== 3) return null;

    const payload = decodeJwtPayload(rawValue);
    if (!payload) return null;

    return {
      email: payload.email as string,
      role: payload.role as PlatformRole,
      scope: payload.scope as AuthScope,
    };
  } catch {
    return null;
  }
}

// Serializar — ya no se usa para guardar JSON, pero se mantiene por compatibilidad
export function serializeAuthCookie(payload: AuthCookiePayload) {
  return encodeURIComponent(JSON.stringify(payload));
}