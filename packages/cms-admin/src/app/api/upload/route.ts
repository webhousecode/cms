import { NextRequest, NextResponse } from "next/server";
import { getMediaAdapter } from "@/lib/media";

const UPLOAD_BASE = process.env.UPLOAD_BASE ?? "";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const folderParam = (formData.get("folder") as string | null) ?? req.nextUrl.searchParams.get("folder") ?? "";
  const folder = folderParam.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60);

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  try {
    const adapter = await getMediaAdapter();
    const result = await adapter.uploadFile(filename, buffer, folder || undefined);
    const url = adapter.type === "filesystem" ? `${UPLOAD_BASE}${result.url}` : result.url;
    return NextResponse.json({ url, folder, name: filename });
  } catch (err) {
    console.error("[upload] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
