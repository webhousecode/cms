import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, unlink, mkdir } from "fs/promises";
import path from "path";
import { getActiveSitePaths } from "@/lib/site-paths";

/* ─── Types ──────────────────────────────────────────────────── */
interface InteractiveMeta {
  id: string;
  name: string;
  filename: string;
  size: number;
  createdAt: string;
  updatedAt: string;
}

/* ─── Helpers ────────────────────────────────────────────────── */
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

async function saveMeta(meta: InteractiveMeta[]): Promise<void> {
  const metaPath = await getMetaPath();
  await writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");
}

/* ─── GET: get interactive metadata + content ────────────────── */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const meta = await loadMeta();
    const entry = meta.find((m) => m.id === id);
    if (!entry) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const dir = await getInteractivesDir();
    const filePath = path.join(dir, entry.filename);
    let content: string;
    try {
      content = await readFile(filePath, "utf-8");
    } catch {
      return NextResponse.json({ error: "File not found on disk" }, { status: 404 });
    }

    return NextResponse.json({ ...entry, content });
  } catch (err) {
    console.error("[interactives] get error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/* ─── PUT: update interactive content ────────────────────────── */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const meta = await loadMeta();
    const idx = meta.findIndex((m) => m.id === id);
    if (idx === -1) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();
    const html = body.content as string;
    if (!html) {
      return NextResponse.json({ error: "No content" }, { status: 400 });
    }

    const dir = await getInteractivesDir();
    const filePath = path.join(dir, meta[idx].filename);
    const buffer = Buffer.from(html, "utf-8");
    await writeFile(filePath, buffer);

    meta[idx].size = buffer.length;
    meta[idx].updatedAt = new Date().toISOString();

    // Allow renaming
    if (body.name && typeof body.name === "string") {
      meta[idx].name = body.name;
    }

    await saveMeta(meta);

    return NextResponse.json(meta[idx]);
  } catch (err) {
    console.error("[interactives] update error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/* ─── DELETE: remove interactive ─────────────────────────────── */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const meta = await loadMeta();
    const idx = meta.findIndex((m) => m.id === id);
    if (idx === -1) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const dir = await getInteractivesDir();
    const filePath = path.join(dir, meta[idx].filename);
    try {
      await unlink(filePath);
    } catch {
      // File may already be gone
    }

    meta.splice(idx, 1);
    await saveMeta(meta);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[interactives] delete error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
