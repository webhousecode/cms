import { NextRequest, NextResponse } from "next/server";
import { getSessionWithSiteRole } from "@/lib/require-role";
import { importExportZip } from "@/lib/chat/chat-export";

/** POST /api/cms/chat/import — import full chat export ZIP */
export async function POST(request: NextRequest) {
  const session = await getSessionWithSiteRole();
  if (!session) return NextResponse.json({ error: "No access" }, { status: 403 });

  const contentType = request.headers.get("content-type") ?? "";

  let zipBuffer: Buffer;
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    zipBuffer = Buffer.from(await file.arrayBuffer());
  } else {
    const arrayBuf = await request.arrayBuffer();
    zipBuffer = Buffer.from(arrayBuf);
  }

  if (zipBuffer.length === 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }

  try {
    const result = await importExportZip(zipBuffer, session.userId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: `Import failed: ${err instanceof Error ? err.message : "invalid ZIP"}` },
      { status: 400 }
    );
  }
}
