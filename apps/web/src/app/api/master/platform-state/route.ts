import { NextResponse } from "next/server";
import { requestBackend } from "@/lib/api";
import { hasMasterAccess } from "@/lib/master-route-auth";

export async function GET() {
  if (!(await hasMasterAccess())) {
    return NextResponse.json({ message: "No autorizado" }, { status: 403 });
  }

  const response = await requestBackend("/platform/state");
  const payload = await response.json();
  return NextResponse.json(payload, { status: response.status });
}
