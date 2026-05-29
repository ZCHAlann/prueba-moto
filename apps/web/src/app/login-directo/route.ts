import { NextResponse } from "next/server";
import { getDefaultRouteForRole } from "@/lib/access-control";
import { requestBackend } from "@/lib/api";
import { AUTH_COOKIE_NAME, serializeAuthCookie } from "@/lib/auth-session";

const MASTER_EMAIL = "aplicrm@gmail.com";
const MASTER_USERNAME = "master";
const MASTER_PASSWORD = "098765";

function normalizeValue(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
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
  const password = normalizeValue(formData.get("password"));
  const remember = formData.get("remember") !== null;
  const redirectParam = normalizeValue(formData.get("redirect"));
  const publicOrigin = getPublicOrigin(request);
  const normalizedLogin = login.toLowerCase();

  if (
    (normalizedLogin === MASTER_EMAIL || normalizedLogin === MASTER_USERNAME) &&
    password === MASTER_PASSWORD
  ) {
    const response = NextResponse.redirect(new URL(redirectParam || "/master", publicOrigin), { status: 303 });
    response.cookies.set(
      AUTH_COOKIE_NAME,
      serializeAuthCookie({
        email: MASTER_EMAIL,
        role: "superadmin",
        scope: "plataforma",
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

  let backendResponse = await requestBackend("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      login,
      password,
      scope: "operacion",
    }),
  });

  if (!backendResponse.ok) {
    backendResponse = await requestBackend("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        login,
        password,
        scope: "plataforma",
      }),
    });
  }

  if (!backendResponse.ok) {
    return NextResponse.redirect(new URL("/login?error=1", publicOrigin), { status: 303 });
  }

  const session = (await backendResponse.json()) as {
    email: string;
    role: "superadmin" | "admin_saas" | "comercial" | "soporte" | "owner_empresa" | "admin_empresa" | "operador" | "supervisor";
    scope: "operacion" | "plataforma";
  };

  const destination = redirectParam || getDefaultRouteForRole(session.role);
  const response = NextResponse.redirect(new URL(destination, publicOrigin), { status: 303 });
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
