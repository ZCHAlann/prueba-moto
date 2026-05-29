import { NextResponse } from "next/server";
import { requestBackend } from "@/lib/api";
import { hasMasterAccess } from "@/lib/master-route-auth";

type Context = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: Request, context: Context) {
  if (!(await hasMasterAccess())) {
    return NextResponse.json({ message: "No autorizado" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const response = await requestBackend(`/platform/users/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  return NextResponse.json(payload, { status: response.status });
}

export async function DELETE(_request: Request, context: Context) {
  if (!(await hasMasterAccess())) {
    return NextResponse.json({ message: "No autorizado" }, { status: 403 });
  }

  const { id } = await context.params;
  const response = await requestBackend(`/platform/users/${id}`, {
    method: "DELETE",
  });
  const payload = await response.json();
  return NextResponse.json(payload, { status: response.status });
}
