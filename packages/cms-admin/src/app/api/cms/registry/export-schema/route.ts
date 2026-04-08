import { NextRequest, NextResponse } from "next/server";
import { toJsonSchema } from "@webhouse/cms";
import { writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * F125 Phase 1 — Schema Export UI endpoint
 *
 * GET  → returns the JSON Schema document for download
 * POST → writes webhouse-schema.json to the project root (next to cms.config.ts)
 *
 * Body for both: { configPath: string, baseUrl?: string }
 * GET passes them as query params; POST as JSON body.
 */

async function loadConfig(configPath: string): Promise<unknown> {
  const absolutePath = path.isAbsolute(configPath)
    ? configPath
    : path.resolve(process.cwd(), configPath);

  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, { interopDefault: true });
  const mod = await jiti.import(absolutePath);
  return (mod as { default?: unknown }).default ?? mod;
}

/** GET — download the schema as JSON */
export async function GET(request: NextRequest) {
  const configPath = request.nextUrl.searchParams.get("configPath");
  const baseUrl = request.nextUrl.searchParams.get("baseUrl") ?? undefined;
  const download = request.nextUrl.searchParams.get("download") === "1";

  if (!configPath) {
    return NextResponse.json({ error: "configPath required" }, { status: 400 });
  }
  if (configPath.startsWith("github://")) {
    return NextResponse.json({ error: "Schema export from GitHub configs not supported yet" }, { status: 400 });
  }

  try {
    const config = await loadConfig(configPath);
    if (!config || typeof config !== "object") {
      return NextResponse.json({ error: "Invalid config" }, { status: 400 });
    }
    const schema = toJsonSchema(config as Parameters<typeof toJsonSchema>[0], { baseUrl });
    const body = JSON.stringify(schema, null, 2);

    if (download) {
      return new NextResponse(body, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": 'attachment; filename="webhouse-schema.json"',
          "Cache-Control": "no-store",
        },
      });
    }
    return new NextResponse(body, {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (err) {
    return NextResponse.json({
      error: `Schema export failed: ${err instanceof Error ? err.message : "Unknown error"}`,
    }, { status: 500 });
  }
}

/** POST — write the schema to webhouse-schema.json next to cms.config.ts */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as { configPath?: string; baseUrl?: string; filename?: string };
  const { configPath, baseUrl, filename = "webhouse-schema.json" } = body;

  if (!configPath) {
    return NextResponse.json({ error: "configPath required" }, { status: 400 });
  }
  if (configPath.startsWith("github://")) {
    return NextResponse.json({ error: "Schema export from GitHub configs not supported yet" }, { status: 400 });
  }

  // Validate filename — no path traversal
  if (!/^[a-zA-Z0-9._-]+\.(json|yaml|yml)$/.test(filename)) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const absolutePath = path.isAbsolute(configPath)
    ? configPath
    : path.resolve(process.cwd(), configPath);
  const projectDir = path.dirname(absolutePath);
  const outPath = path.join(projectDir, filename);

  // Defense in depth — outPath must be inside projectDir
  if (!outPath.startsWith(projectDir)) {
    return NextResponse.json({ error: "Output path escapes project directory" }, { status: 400 });
  }

  try {
    const config = await loadConfig(configPath);
    if (!config || typeof config !== "object") {
      return NextResponse.json({ error: "Invalid config" }, { status: 400 });
    }
    const schema = toJsonSchema(config as Parameters<typeof toJsonSchema>[0], { baseUrl });
    const json = JSON.stringify(schema, null, 2);
    await writeFile(outPath, json, "utf-8");

    const collectionCount = Object.keys(schema.collections).length;
    const blockCount = schema.blocks ? Object.keys(schema.blocks).length : 0;

    return NextResponse.json({
      ok: true,
      path: outPath,
      bytes: Buffer.byteLength(json, "utf-8"),
      collections: collectionCount,
      blocks: blockCount,
      generatedAt: schema["x-generated-at"],
    });
  } catch (err) {
    return NextResponse.json({
      error: `Schema export failed: ${err instanceof Error ? err.message : "Unknown error"}`,
    }, { status: 500 });
  }
}
