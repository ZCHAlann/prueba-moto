import { NextRequest, NextResponse } from "next/server";
import { requestBackend } from "@/lib/api";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json({ message: "Empresa obligatoria" }, { status: 400 });
  }

  const response = await requestBackend(`/platform/operation-state/${encodeURIComponent(companyId)}`);
  const payload = await response.json();
  return NextResponse.json(payload, { status: response.status });
}

export async function PUT(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json({ message: "Empresa obligatoria" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const response = await requestBackend(`/platform/operation-state/${encodeURIComponent(companyId)}`, {
    method: "PUT",
    body: JSON.stringify({ state: body.state ?? {} }),
  });
  const payload = await response.json();
  return NextResponse.json(payload, { status: response.status });
}
