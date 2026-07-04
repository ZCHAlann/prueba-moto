/**
 * Wrapper centralizado de `fetch` con manejo automático de:
 *  - 401 por inactividad (USER_INACTIVE | DRIVER_INACTIVE | SITE_INACTIVE)
 *  - 401 genérico (token expirado)
 *  - Headers JSON + credentials por defecto
 *
 * IMPORTANTE: este wrapper es drop-in para `fetch(url, opts)` con la única
 * diferencia de que:
 *  1) Siempre envía `credentials: "include"` y `Content-Type: application/json`
 *     si el body es JSON (se puede sobreescribir pasando headers explícitos).
 *  2) Si la response es 401/403 con un `code` de inactividad, dispara el
 *     evento global `auth:invalidated` y rechaza con un error tipado.
 *  3) Si la response NO es ok, rechaza con un `ApiError` que tiene
 *     `.status`, `.code` y `.message`.
 *
 * Para mantener compat con el código existente, los hooks pueden seguir
 * usando `fetch(...)` directo (no es obligatorio migrar a este wrapper).
 * Solo se recomienda para los hooks más críticos y/o nuevos.
 */

import { dispatchAuthInvalidated } from "./authEvents";

export class ApiError extends Error {
  status: number;
  code: string | null;
  body: unknown;
  constructor(message: string, status: number, code: string | null, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: BodyInit | Record<string, unknown> | null;
  /** Si false, no dispara el evento global en 401/403. Default: true */
  fireAuthEvents?: boolean;
}

export async function apiFetch<T = unknown>(
  input: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { body, headers, fireAuthEvents = true, ...rest } = options;

  const finalHeaders: Record<string, string> = {
    ...(headers as Record<string, string> | undefined),
  };

  // Si el body es un objeto plano, serializar a JSON y setear Content-Type.
  let finalBody: BodyInit | null | undefined = body as BodyInit | null | undefined;
  if (
    body != null &&
    typeof body === "object" &&
    !(body instanceof FormData) &&
    !(body instanceof Blob) &&
    !(body instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(body)
  ) {
    finalBody = JSON.stringify(body);
    if (!("Content-Type" in finalHeaders)) {
      finalHeaders["Content-Type"] = "application/json";
    }
  }

  const res = await fetch(input, {
    credentials: "include",
    ...rest,
    headers: finalHeaders,
    body: finalBody as BodyInit | null | undefined,
  });

  // 401 o 403 con código de inactividad → evento global + rechazo
  if (!res.ok && (res.status === 401 || res.status === 403)) {
    let errBody: Record<string, unknown> = {};
    try {
      errBody = (await res.json()) as Record<string, unknown>;
    } catch {
      // body no era JSON; dejamos errBody = {}
    }

    const code = typeof errBody.code === "string" ? (errBody.code as string) : null;
    const message = typeof errBody.message === "string"
      ? (errBody.message as string)
      : `Error ${res.status}`;

    const inactiveCodes = ["USER_INACTIVE", "DRIVER_INACTIVE", "SITE_INACTIVE"];

    if (fireAuthEvents && code && inactiveCodes.includes(code)) {
      dispatchAuthInvalidated({
        code,
        message,
        status: res.status,
      });
    }

    throw new ApiError(message, res.status, code, errBody);
  }

  if (!res.ok) {
    // Otros errores: leer body si se puede
    let errBody: unknown = null;
    try { errBody = await res.json(); } catch { /* ignore */ }
    const message =
      (errBody && typeof errBody === "object" && "message" in errBody && typeof (errBody as { message: unknown }).message === "string")
        ? (errBody as { message: string }).message
        : `Error ${res.status}`;
    const code =
      (errBody && typeof errBody === "object" && "code" in errBody && typeof (errBody as { code: unknown }).code === "string")
        ? (errBody as { code: string }).code
        : null;
    throw new ApiError(message, res.status, code, errBody);
  }

  // 2xx: parsear JSON si aplica
  const ct = res.headers.get("Content-Type") ?? "";
  if (ct.includes("application/json")) {
    return (await res.json()) as T;
  }
  return undefined as unknown as T;
}
