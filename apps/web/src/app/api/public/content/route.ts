import { NextResponse } from "next/server";
import { readPublicContent } from "@/lib/public-content-store";

export async function GET() {
  const content = await readPublicContent();
  return NextResponse.json(content, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
