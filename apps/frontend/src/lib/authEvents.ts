/**
 * Bus de eventos de autenticación (Fase 3.4).
 *
 * Cuando el backend detecta que un usuario/conductor/sede quedó
 * inactivo, el apiFetch dispara `auth:invalidated` y `AuthContext`
 * lo escucha para:
 *   1. Limpiar la sesión local (setSession(null))
 *   2. Mostrar un toast con el motivo
 *   3. Redirigir a /signin con el motivo en query string (?reason=SITE_INACTIVE)
 *
 * Usar `CustomEvent` en lugar de un EventEmitter para evitar dependencias
 * y porque el evento cruza árbol de React sin problemas.
 */

export type AuthInvalidatedCode =
  | "USER_INACTIVE"
  | "DRIVER_INACTIVE"
  | "SITE_INACTIVE"
  | "UNAUTHENTICATED"
  | "BAD_TOKEN";

export interface AuthInvalidatedDetail {
  code: AuthInvalidatedCode | string;
  message: string;
  status: number;
}

const EVENT_NAME = "auth:invalidated";

export function dispatchAuthInvalidated(detail: AuthInvalidatedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AuthInvalidatedDetail>(EVENT_NAME, { detail }));
}

export function onAuthInvalidated(
  handler: (detail: AuthInvalidatedDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const listener = (e: Event) => {
    const ce = e as CustomEvent<AuthInvalidatedDetail>;
    handler(ce.detail);
  };
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}

/**
 * Mensaje legible por defecto según el código.
 */
export function defaultMessageForCode(code: string): string {
  switch (code) {
    case "USER_INACTIVE":
      return "Tu cuenta de usuario está inactiva. Contacta a tu administrador.";
    case "DRIVER_INACTIVE":
      return "Tu cuenta de conductor está inactiva. Contacta a tu administrador.";
    case "SITE_INACTIVE":
      return "La sede a la que perteneces está inactiva. Contacta a tu administrador.";
    default:
      return "Tu sesión ya no es válida.";
  }
}
