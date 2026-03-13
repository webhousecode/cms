import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { UPLOAD_DIR, safeUploadPath } from "@/lib/upload-dir";

const UPLOAD_BASE = process.env.UPLOAD_BASE ?? "";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  // Optional folder — sanitized via safeUploadPath
  const folderParam = (formData.get("folder") as string | null) ?? req.nextUrl.searchParams.get("folder") ?? "";
  const folder = folderParam.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60);

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  try {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const destDir = folder ? safeUploadPath([folder]) : UPLOAD_DIR;
    await mkdir(destDir, { recursive: true });
    await writeFile(path.join(destDir, filename), buffer);

    const urlPath = folder ? `/uploads/${folder}/${filename}` : `/uploads/${filename}`;
    return NextResponse.json({ url: `${UPLOAD_BASE}${urlPath}`, folder, name: filename });
  } catch (err) {
    console.error("[upload] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
