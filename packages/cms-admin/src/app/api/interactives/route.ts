import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { getActiveSitePaths } from "@/lib/site-paths";

/* ─── Types ──────────────────────────────────────────────────── */
export interface InteractiveMeta {
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
  const dir = path.join(uploadDir, "interactives");
  await mkdir(dir, { recursive: true });
  return dir;
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

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.html?$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/* ─── GET: list all interactives ─────────────────────────────── */
export async function GET() {
  try {
    const meta = await loadMeta();
    return NextResponse.json(meta);
  } catch (err) {
    console.error("[interactives] list error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/* ─── POST: upload new interactive ───────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const originalName = file.name;
    const baseId = slugify(originalName);
    const meta = await loadMeta();

    // Ensure unique ID
    let id = baseId || "interactive";
    let counter = 1;
    while (meta.some((m) => m.id === id)) {
      id = `${baseId}-${counter++}`;
    }

    const filename = `${id}.html`;
    const dir = await getInteractivesDir();
    const filePath = path.join(dir, filename);

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    const now = new Date().toISOString();
    const entry: InteractiveMeta = {
      id,
      name: originalName.replace(/\.html?$/i, ""),
      filename,
      size: buffer.length,
      createdAt: now,
      updatedAt: now,
    };

    meta.push(entry);
    await saveMeta(meta);

    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    console.error("[interactives] upload error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
