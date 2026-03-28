import { NextRequest, NextResponse } from "next/server";
import { validateSite } from "@webhouse/cms";
import path from "path";

/**
 * POST /api/cms/registry/validate
 * Body: { configPath: string, contentDir?: string }
 * Returns: ValidationResult
 */
export async function POST(request: NextRequest) {
  try {
    const { configPath, contentDir } = (await request.json()) as {
      configPath?: string;
      contentDir?: string;
    };

    if (!configPath) {
      return NextResponse.json({ error: "configPath required" }, { status: 400 });
    }

    // GitHub configs not validated at file level (handled by GitHub adapter)
    if (configPath.startsWith("github://")) {
      return NextResponse.json({ valid: true, errors: [], warnings: [] });
    }

    // Load config via jiti
    const absolutePath = path.isAbsolute(configPath)
      ? configPath
      : path.resolve(process.cwd(), configPath);

    let config: unknown;
    try {
      const { createJiti } = await import("jiti");
      const jiti = createJiti(import.meta.url, { interopDefault: true });
      const mod = await jiti.import(absolutePath);
      config = (mod as { default?: unknown }).default ?? mod;
    } catch (err) {
      return NextResponse.json({
        valid: false,
        errors: [{
          level: "error",
          category: "config",
          path: absolutePath,
          message: `Cannot load config file: ${err instanceof Error ? err.message : "Unknown error"}`,
          suggestion: "Make sure the file exists and exports a valid config with defineConfig().",
        }],
        warnings: [],
      });
    }

    // Resolve content dir
    const resolvedContentDir = contentDir
      ? (path.isAbsolute(contentDir) ? contentDir : path.resolve(path.dirname(absolutePath), contentDir))
      : path.join(path.dirname(absolutePath), "content");

    const result = await validateSite(config, resolvedContentDir);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Validation failed" },
      { status: 500 },
    );
  }
}
