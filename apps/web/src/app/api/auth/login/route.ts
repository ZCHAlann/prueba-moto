import { NextResponse } from "next/server";
import { requestBackend } from "@/lib/api";
import { AUTH_COOKIE_NAME, type BackendLoginResponse } from "@/lib/auth-session";

type LoginPayload = {
  login: string;
  password: string;
  remember: boolean;
  scope: "operacion" | "plataforma";
};

async function parseLoginPayload(request: Request): Promise<LoginPayload> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await request.json();
    return {
      login: String(body.login ?? body.email ?? body.username ?? "").trim(),
      password: String(body.password ?? "").trim(),
      remember: Boolean(body.remember),
      scope: body.scope === "plataforma" ? "plataforma" : "operacion",
    };
  }

  const formData = await request.formData();
  return {
    login: String(formData.get("login") ?? formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? "").trim(),
    remember: formData.has("remember"),
    scope: formData.get("scope") === "plataforma" ? "plataforma" : "operacion",
  };
}

export async function POST(request: Request) {
  const payload = await parseLoginPayload(request);

  // Intentar login con el scope pedido
  let response = await requestBackend("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      login: payload.login,
      password: payload.password,
      scope: payload.scope,
    }),
  });

  // Si falla en operacion, intentar plataforma (mismo comportamiento que antes)
  if (!response.ok && payload.scope === "operacion") {
    response = await requestBackend("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        login: payload.login,
        password: payload.password,
        scope: "plataforma",
      }),
    });
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    return NextResponse.json(
      { message: errorBody.error ?? "Credenciales inválidas." },
      { status: response.status }
    );
  }

  const data = (await response.json()) as BackendLoginResponse;
  const { token, user } = data;

  // Construir la sesión que espera el auth-provider
  const session = {
    id: user.id,
    email: user.email,
    name: user.name ?? user.username,
    username: user.username,
    role: user.role,
    roleLabel: user.role,
    title: user.role,
    scope: user.scope,
    companyId: user.companyId ? String(user.companyId) : null,
    companyName: "",
  };

  const nextResponse = NextResponse.json(session);

  // Guardar el JWT como httpOnly — el browser no puede leerlo, solo enviarlo
  nextResponse.cookies.set(AUTH_COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: payload.remember ? 60 * 60 * 24 * 7 : undefined, // 7 días o sesión
  });

  return nextResponse;
}