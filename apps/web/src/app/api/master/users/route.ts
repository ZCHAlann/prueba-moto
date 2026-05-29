import { NextResponse } from "next/server";
import { requestBackend } from "@/lib/api";
import { hasMasterAccess } from "@/lib/master-route-auth";

export async function POST(request: Request) {
  if (!(await hasMasterAccess())) {
    return NextResponse.json({ message: "No autorizado" }, { status: 403 });
  }

  const body = await request.json();
  const response = await requestBackend("/platform/users", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  return NextResponse.json(payload, { status: response.status });
}
