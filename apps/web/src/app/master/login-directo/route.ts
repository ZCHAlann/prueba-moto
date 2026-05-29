import { NextResponse } from "next/server";
import { requestBackend } from "@/lib/api";
import { AUTH_COOKIE_NAME, serializeAuthCookie } from "@/lib/auth-session";

function normalizeValue(value: FormDataEntryValue | null) {
  return String(value ?? "").trim().toLowerCase();
}

function getPublicOrigin(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  if (forwardedHost) {
    return `${forwardedProto ?? "https"}://${forwardedHost}`;
  }

  return process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const login = normalizeValue(formData.get("login"));
  const password = String(formData.get("password") ?? "").trim();
  const remember = formData.get("remember") !== null;
  const publicOrigin = getPublicOrigin(request);
  const backendResponse = await requestBackend("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      login,
      password,
      scope: "plataforma",
    }),
  });

  if (!backendResponse.ok) {
    return NextResponse.redirect(new URL("/master/acceso?error=1", publicOrigin), { status: 303 });
  }

  const session = (await backendResponse.json()) as {
    email: string;
    role: "superadmin" | "admin_saas" | "comercial" | "soporte" | "owner_empresa" | "admin_empresa" | "operador" | "supervisor";
    scope: "operacion" | "plataforma";
  };

  const activateUrl = new URL("/master/activar", publicOrigin);
  activateUrl.searchParams.set("remember", remember ? "1" : "0");
  activateUrl.searchParams.set("email", session.email);
  activateUrl.searchParams.set("role", session.role);
  activateUrl.searchParams.set("scope", session.scope);
  const response = NextResponse.redirect(activateUrl, { status: 303 });
  response.cookies.set(
    AUTH_COOKIE_NAME,
    serializeAuthCookie({
      email: session.email,
      role: session.role,
      scope: session.scope,
    }),
    {
      path: "/",
      sameSite: "lax",
      httpOnly: false,
      maxAge: remember ? 60 * 60 * 24 * 30 : undefined,
    }
  );

  return response;
}
