export function getBackendBaseUrl() {
  return process.env.API_INTERNAL_URL ?? "http://127.0.0.1:5000";
}

export async function requestBackend(
  path: string,
  init?: RequestInit & { timeoutMs?: number; token?: string }
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init?.timeoutMs ?? 6000);

  try {
    const response = await fetch(`${getBackendBaseUrl()}${path}`, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init?.token ? { Authorization: `Bearer ${init.token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });

    return response;
  } finally {
    clearTimeout(timeout);
  }
}

// Verifica que el backend esté vivo
export async function getBackendMessage() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(`${getBackendBaseUrl()}/health`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error("Backend no disponible");
    return await res.text();
  } catch {
    return "Error conectando con backend";
  } finally {
    clearTimeout(timeout);
  }
}