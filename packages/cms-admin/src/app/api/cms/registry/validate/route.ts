import { NextRequest, NextResponse } from "next/server";
import { validateSite } from "@webhouse/cms";
import path from "path";
import { requirePermission } from "@/lib/permissions";
import { configLoadAllowed } from "@/lib/code-path-policy";
import { getServerTSafe } from "@/i18n/server";

/** Security W41 C5 — settings.edit, and only the active site's own config
 *  (an arbitrary path loaded by jiti = code execution). */
async function guardConfigLoad(configPath: string): Promise<Response | null> {
  const denied = await requirePermission("settings.edit"); if (denied) return denied;
  const { getActiveSitePaths } = await import("@/lib/site-paths");
  const { isInstanceAdmin } = await import("@/lib/instance-admin");
  let active: string | null = null;
  try { active = (await getActiveSitePaths()).configPath; } catch { active = null; }
  if (!configLoadAllowed(configPath, active, { instanceAdmin: await isInstanceAdmin() })) {
    return NextResponse.json({ error: (await getServerTSafe())("errCms.shared.activeConfigOnly") }, { status: 403 });
  }
  return null;
}

/**
 * POST /api/cms/registry/validate
 * Body: { configPath: string, contentDir?: string }
 * Returns: ValidationResult
 */
export async function POST(request: NextRequest) {
  const t = await getServerTSafe();
  try {
    const { configPath, contentDir } = (await request.json()) as {
      configPath?: string;
      contentDir?: string;
    };

    if (!configPath) {
      return NextResponse.json({ error: t("errCms.shared.configPathRequired") }, { status: 400 });
    }

    // GitHub configs not validated at file level (handled by GitHub adapter)
    if (configPath.startsWith("github://")) {
      return NextResponse.json({ valid: true, errors: [], warnings: [] });
    }
    const guarded = await guardConfigLoad(configPath); if (guarded) return guarded;

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
          message: t("errCms.registryValidate.cannotLoad", { error: err instanceof Error ? err.message : t("errCms.shared.unknownError") }),
          suggestion: t("errCms.registryValidate.suggestion"),
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
      { error: err instanceof Error ? err.message : t("errCms.registryValidate.failed") },
      { status: 500 },
    );
  }
}
