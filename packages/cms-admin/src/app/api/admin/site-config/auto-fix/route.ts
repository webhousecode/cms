import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readFile, writeFile } from "node:fs/promises";
import { requirePermission } from "@/lib/permissions";
import { loadRegistry, findSite } from "@/lib/site-registry";
import { invalidate } from "@/lib/site-pool";
import { getAI, mistralModel } from "@/lib/ai/client";
import { getServerTSafe } from "@/i18n/server";

export async function POST(req: Request) {
  const t = await getServerTSafe();
  const denied = await requirePermission("sites.write");
  if (denied) return denied;

  const { rawErrors } = (await req.json()) as { rawErrors: string };

  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get("cms-active-org")?.value;
  const activeSiteId = cookieStore.get("cms-active-site")?.value;

  const registry = await loadRegistry();
  if (!registry || !activeOrgId || !activeSiteId) {
    return NextResponse.json({ error: t("errAdmin.siteConfig.noActiveSite") }, { status: 400 });
  }

  const site = findSite(registry, activeOrgId, activeSiteId);
  if (!site) return NextResponse.json({ error: t("errAdmin.siteConfig.siteNotFound") }, { status: 404 });
  if (site.configPath.startsWith("github://")) {
    return NextResponse.json({ error: t("errAdmin.siteConfig.autoFixFilesystemOnly") }, { status: 400 });
  }

  let original: string;
  try {
    original = await readFile(site.configPath, "utf-8");
  } catch {
    return NextResponse.json({ error: t("errAdmin.siteConfig.readConfigFailed") }, { status: 500 });
  }

  const system = `You are a TypeScript code fixer for @webhouse/cms configuration files.

Given a cms.config.ts file and a list of validation errors, return the COMPLETE corrected TypeScript file.

Fix ONLY the reported errors. Do not change anything else — not formatting, not field order, not comments, not logic.

Common fixes:
- options arrays with plain strings → convert each string "Foo Bar" to { value: "foo-bar", label: "Foo Bar" } (slug-ify value: lowercase, spaces to hyphens)
- Missing required fields → add them with sensible defaults

Return ONLY the raw TypeScript source code. No markdown fences, no explanations.`;

  // i18n-ignore: model prompt
  const user = `Validation errors to fix:
${rawErrors}

Original cms.config.ts:
${original}`;

  let fixed: string;
  try {
    const ai = await getAI();
    const { text } = await ai.chat({
      ...mistralModel("mistral-small-latest"),
      maxTokens: 4096,
      system,
      messages: [{ role: "user", content: user }],
      purpose: "site-config.auto-fix",
    });
    fixed = text;
  } catch {
    return NextResponse.json({ error: t("errAdmin.siteConfig.aiFixFailed") }, { status: 502 });
  }

  // Strip markdown fences if model added them anyway
  fixed = fixed.replace(/^```(?:typescript|ts)?\n?/m, "").replace(/\n?```\s*$/m, "").trim();

  if (!fixed || fixed.length < 50) {
    return NextResponse.json({ error: t("errAdmin.siteConfig.aiFixEmpty") }, { status: 502 });
  }

  // Write corrected config + invalidate site pool cache
  await writeFile(site.configPath, fixed, "utf-8");
  invalidate(activeOrgId, activeSiteId);

  return NextResponse.json({ ok: true, siteName: site.name, configPath: site.configPath });
}
