import { NextRequest, NextResponse } from "next/server";
import { readFile, mkdir } from "fs/promises";
import path from "path";
import { getActiveSitePaths } from "@/lib/site-paths";

/* ─── Helpers ────────────────────────────────────────────────── */
interface InteractiveMeta {
  id: string;
  name: string;
  filename: string;
  size: number;
  createdAt: string;
  updatedAt: string;
}

async function getInteractivesDir(): Promise<string> {
  const { uploadDir } = await getActiveSitePaths();
  return path.join(uploadDir, "interactives");
}

async function getMetaPath(): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  await mkdir(dataDir, { recursive: true });
  return path.join(dataDir, "interactives.json");
}

async function loadMeta(): Promise<InteractiveMeta[]> {
  const metaPath = await getMetaPath();
  try {
    const raw = await readFile(metaPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/* ─── GET: serve HTML for iframe preview ─────────────────────── */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const meta = await loadMeta();
    const entry = meta.find((m) => m.id === id);
    if (!entry) {
      return new NextResponse("Not found", { status: 404 });
    }

    const dir = await getInteractivesDir();
    const filePath = path.join(dir, entry.filename);
    let content: string;
    try {
      content = await readFile(filePath, "utf-8");
    } catch {
      return new NextResponse("File not found on disk", { status: 404 });
    }

    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[interactives] preview error:", err);
    return new NextResponse("Internal error", { status: 500 });
  }
}
