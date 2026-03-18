import { NextRequest, NextResponse } from "next/server";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

/**
 * POST /api/cms/registry/import
 * Body: { folderPath: string }
 *
 * Scans a folder for cms.config.ts, reads it to extract site info,
 * and returns auto-detected values for the "New site" form.
 */
export async function POST(request: NextRequest) {
  const { folderPath } = (await request.json()) as { folderPath: string };

  if (!folderPath) {
    return NextResponse.json({ error: "folderPath is required" }, { status: 400 });
  }

  const absPath = resolve(folderPath);

  // Check folder exists
  try {
    const s = await stat(absPath);
    if (!s.isDirectory()) {
      return NextResponse.json({ error: "Path is not a directory" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: `Directory not found: ${absPath}` }, { status: 404 });
  }

  // Find cms.config.ts
  const configCandidates = ["cms.config.ts", "cms.config.js", "cms.config.mjs"];
  let configFile: string | null = null;
  for (const candidate of configCandidates) {
    try {
      await stat(join(absPath, candidate));
      configFile = candidate;
      break;
    } catch { /* try next */ }
  }

  if (!configFile) {
    return NextResponse.json(
      { error: `No cms.config.ts found in ${absPath}` },
      { status: 400 },
    );
  }

  const configPath = join(absPath, configFile);

  // Try to extract site name from config file (simple regex, not full parse)
  let siteName = "";
  try {
    const configSource = await readFile(configPath, "utf-8");
    // Look for name/title in defineConfig or top-level
    const nameMatch = configSource.match(/name:\s*['"]([^'"]+)['"]/);
    if (nameMatch) {
      // Use the first collection name as a hint, but prefer folder name
      siteName = "";
    }
    // Try to find a more explicit site name pattern
    const siteNameMatch = configSource.match(/siteName:\s*['"]([^'"]+)['"]/);
    if (siteNameMatch) {
      siteName = siteNameMatch[1];
    }
  } catch { /* ignore parse errors */ }

  // Fall back to folder name as site name
  if (!siteName) {
    const folderName = absPath.split("/").filter(Boolean).pop() ?? "my-site";
    siteName = folderName
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // Detect content directory
  let contentDir = "";
  const contentCandidates = ["content", "src/content", "data"];
  for (const candidate of contentCandidates) {
    try {
      const s = await stat(join(absPath, candidate));
      if (s.isDirectory()) {
        contentDir = join(absPath, candidate);
        break;
      }
    } catch { /* try next */ }
  }

  // Also try to read contentDir from config source
  if (!contentDir) {
    try {
      const configSource = await readFile(configPath, "utf-8");
      const contentDirMatch = configSource.match(/contentDir:\s*['"]([^'"]+)['"]/);
      if (contentDirMatch) {
        contentDir = join(absPath, contentDirMatch[1]);
      }
    } catch { /* ignore */ }
  }

  // Count collections (for info display)
  let collections: string[] = [];
  if (contentDir) {
    try {
      const entries = await readdir(contentDir, { withFileTypes: true });
      collections = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch { /* ignore */ }
  }

  // Check for dist/ (has been built before)
  let hasDist = false;
  try {
    const s = await stat(join(absPath, "dist"));
    hasDist = s.isDirectory();
  } catch { /* no dist */ }

  return NextResponse.json({
    siteName,
    configPath,
    contentDir,
    collections,
    hasDist,
    folderPath: absPath,
  });
}
