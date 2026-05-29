import { NextResponse } from "next/server";
import { readPublicContent, writePublicContent } from "@/lib/public-content-store";
import type { PublicContentSnapshot } from "@/types/platform";

async function requireMasterAccess() {
  return true;
}

export async function GET() {
  const allowed = await requireMasterAccess();
  if (!allowed) {
    return NextResponse.json({ message: "No autorizado" }, { status: 403 });
  }

  const content = await readPublicContent();
  return NextResponse.json(content, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function PUT(request: Request) {
  const allowed = await requireMasterAccess();
  if (!allowed) {
    return NextResponse.json({ message: "No autorizado" }, { status: 403 });
  }

  const payload = (await request.json()) as PublicContentSnapshot;
  const nextContent: PublicContentSnapshot = {
    ...payload,
    updatedAt: new Date().toISOString(),
  };

  await writePublicContent(nextContent);
  return NextResponse.json(nextContent);
}
