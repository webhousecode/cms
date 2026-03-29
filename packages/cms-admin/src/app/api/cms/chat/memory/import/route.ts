import { NextRequest, NextResponse } from "next/server";
import { getSessionWithSiteRole } from "@/lib/require-role";
import { importMemories } from "@/lib/chat/memory-store";

/** POST /api/cms/chat/memory/import — import memories from text or JSON */
export async function POST(request: NextRequest) {
  const session = await getSessionWithSiteRole();
  if (!session) return NextResponse.json({ error: "No access" }, { status: 403 });

  const contentType = request.headers.get("content-type") ?? "";
  let input: string;

  if (contentType.includes("text/plain")) {
    input = await request.text();
  } else {
    const body = await request.json();
    input = typeof body.text === "string" ? body.text : JSON.stringify(body.memories ?? []);
  }

  if (!input.trim()) {
    return NextResponse.json({ error: "No data to import" }, { status: 400 });
  }

  const result = await importMemories(input);
  return NextResponse.json(result);
}
