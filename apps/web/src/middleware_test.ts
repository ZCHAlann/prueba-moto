import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth-session";
import { isPublicPath } from "@/lib/access-control";

function withPathHeader(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-current-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Redireccion legacy
  if (pathname === "/master/login" || pathname === "/superadmin/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/master/acceso";
    return NextResponse.redirect(url);
  }

  // Rutas que Next.js maneja internamente — pasar siempre
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/api") ||
    pathname === "/login-directo" ||
    pathname.startsWith("/images") ||
    /\.(?:png|jpg|jpeg|gif|webp|svg|ico)$/i.test(pathname)
  ) {
    return withPathHeader(request);
  }

  // Master y superadmin tienen su propia auth — pasar siempre
  if (
    pathname === "/master" ||
    pathname.startsWith("/master/") ||
    pathname === "/superadmin" ||
    pathname.startsWith("/superadmin/")
  ) {
    return withPathHeader(request);
  }

  // Rutas públicas — pasar siempre
  if (isPublicPath(pathname)) {
    return withPathHeader(request);
  }

  // Verificar que exista el JWT en cookie
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (token) {
    return withPathHeader(request);
  }

  // Sin token → redirigir al login
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (pathname !== "/login") {
    url.searchParams.set("redirect", `${pathname}${search}`);
  }
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|images|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};