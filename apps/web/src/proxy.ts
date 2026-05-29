import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, parseAuthCookie } from "@/lib/auth-session";
import { isPublicPath, isSuperadminPath } from "@/lib/access-control";

function nextWithPathHeader(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-current-pathname", request.nextUrl.pathname);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === "/master/login") {
    const nextUrl = request.nextUrl.clone();
    nextUrl.pathname = "/master/acceso";
    return NextResponse.redirect(nextUrl);
  }

  if (pathname === "/superadmin/login") {
    const nextUrl = request.nextUrl.clone();
    nextUrl.pathname = "/master/acceso";
    return NextResponse.redirect(nextUrl);
  }

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/api") ||
    pathname === "/login-directo" ||
    pathname.startsWith("/images") ||
    /\.(?:png|jpg|jpeg|gif|webp|svg|ico)$/i.test(pathname)
  ) {
    return nextWithPathHeader(request);
  }

  if (pathname === "/master" || pathname.startsWith("/master/") || pathname === "/superadmin" || pathname.startsWith("/superadmin/")) {
    return nextWithPathHeader(request);
  }

  if (isPublicPath(pathname)) {
    return nextWithPathHeader(request);
  }

  const sessionCookie = parseAuthCookie(request.cookies.get(AUTH_COOKIE_NAME)?.value);
  if (sessionCookie) {
    return nextWithPathHeader(request);
  }

  const destination = "/login";
  const nextUrl = request.nextUrl.clone();
  nextUrl.pathname = destination;
  nextUrl.search = "";

  if (pathname !== destination) {
    nextUrl.searchParams.set("redirect", `${pathname}${search}`);
  }

  return NextResponse.redirect(nextUrl);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|images|favicon.ico|sitemap.xml|robots.txt).*)"],
};
