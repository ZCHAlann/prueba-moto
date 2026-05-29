import { type NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME } from "@/lib/auth-session";
import { getBackendBaseUrl } from "@/lib/api";

const BACKEND = getBackendBaseUrl();

async function proxy(req: NextRequest, segments: string[]) {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  console.log("PROXY →", req.method, segments.join("/"));
  console.log("BACKEND URL →", BACKEND);
  console.log("TOKEN →", token ? `${token.slice(0, 20)}...` : "NO TOKEN");

  const path = segments.join("/");
  const url = `${BACKEND}/${path}${req.nextUrl.search}`;

  const isMultipart = req.headers.get("content-type")?.includes("multipart/form-data");

  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // Para multipart dejamos que fetch maneje el Content-Type con el boundary
  if (!isMultipart) {
    headers["Content-Type"] = "application/json";
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD";

  const response = await fetch(url, {
    method: req.method,
    headers,
    body: hasBody ? (isMultipart ? await req.blob() : await req.text()) : undefined,
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));
  return NextResponse.json(data, { status: response.status });
}

type RouteContext = { params: Promise<{ route: string[] }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { route } = await ctx.params;
  return proxy(req, route);
}
export async function POST(req: NextRequest, ctx: RouteContext) {
  const { route } = await ctx.params;
  return proxy(req, route);
}
export async function PUT(req: NextRequest, ctx: RouteContext) {
  const { route } = await ctx.params;
  return proxy(req, route);
}
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { route } = await ctx.params;
  return proxy(req, route);
}
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const { route } = await ctx.params;
  return proxy(req, route);
}