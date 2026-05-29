import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requestBackend } from "@/lib/api";
import { AUTH_COOKIE_NAME, type BackendLoginResponse } from "@/lib/auth-session";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ message: "Sin sesión" }, { status: 401 });
  }

  // Verificar el token contra el backend — /auth/refresh valida y re-firma
  const response = await requestBackend("/auth/refresh", {
    method: "POST",
    token,
  });

  if (!response.ok) {
    return NextResponse.json({ message: "Sesión expirada" }, { status: 401 });
  }

  const { token: newToken } = (await response.json()) as { token: string };

  // Decodificar el nuevo token para leer el payload (sin verificar firma — eso lo hizo Express)
  const parts = newToken.split(".");
  if (parts.length !== 3) {
    return NextResponse.json({ message: "Token inválido" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return NextResponse.json({ message: "Token inválido" }, { status: 401 });
  }

  const session = {
    id: payload.sub as string,
    email: payload.email as string,
    name: payload.name as string,
    role: payload.role as string,
    roleLabel: payload.role as string,
    title: payload.role as string,
    scope: payload.scope as string,
    companyId: payload.companyId ? String(payload.companyId) : null,
    companyName: "",
    modulePermissions: (payload.modulePermissions as string[]) ?? [],
  };

  const nextResponse = NextResponse.json(session);

  // Renovar la cookie con el token fresco
  nextResponse.cookies.set(AUTH_COOKIE_NAME, newToken, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
  });

  return nextResponse;
}