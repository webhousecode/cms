import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readFile } from "node:fs/promises";
import { requirePermission } from "@/lib/permissions";
import { loadRegistry, findSite } from "@/lib/site-registry";
import { getAI, mistralModel, parseJsonLoose } from "@/lib/ai/client";
import { getServerTSafe } from "@/i18n/server";

export interface DiagnoseIssue {
  field: string;
  problem: string;
  fix: string;
  autoFixable: boolean;
}

export interface DiagnoseResult {
  siteName: string;
  configPath: string;
  isFilesystem: boolean;
  summary: string;
  issues: DiagnoseIssue[];
  canAutoFix: boolean;
  autoFixNotes?: string;
}

export async function POST(req: Request) {
  const t = await getServerTSafe();
  const denied = await requirePermission("sites.write");
  if (denied) return denied;

  const { rawErrors } = (await req.json()) as { rawErrors: string };

  // Find active site from cookies
  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get("cms-active-org")?.value;
  const activeSiteId = cookieStore.get("cms-active-site")?.value;

  const registry = await loadRegistry();
  if (!registry || !activeOrgId || !activeSiteId) {
    return NextResponse.json({ error: t("errAdmin.siteConfig.noActiveSite") }, { status: 400 });
  }

  const site = findSite(registry, activeOrgId, activeSiteId);
  if (!site) {
    return NextResponse.json({ error: t("errAdmin.siteConfig.siteNotInRegistry") }, { status: 404 });
  }

  const isFilesystem = !site.configPath.startsWith("github://");
  let configContent = "";

  if (isFilesystem) {
    try {
      configContent = await readFile(site.configPath, "utf-8");
    } catch {
      return NextResponse.json({ error: t("errAdmin.siteConfig.readConfigFailed") }, { status: 500 });
    }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    // Return a basic diagnosis without LLM
    return NextResponse.json({
      siteName: site.name,
      configPath: site.configPath,
      isFilesystem,
      summary: t("errAdmin.siteConfig.diagnoseSummary"),
      issues: rawErrors.split("\n").filter(Boolean).map((line) => ({
        field: line.split(":")[0]?.trim() ?? "unknown",
        problem: line.trim(),
        fix: t("errAdmin.siteConfig.diagnoseFix"),
        autoFixable: false,
      })),
      canAutoFix: false,
    } satisfies DiagnoseResult);
  }

  const system = `You are a friendly CMS configuration assistant for @webhouse/cms.

A developer added a new site with an invalid cms.config.ts. Your job is to explain what went wrong in plain language and tell them how to fix it.

@webhouse/cms schema rules (the most common mistakes):
- "select" field options MUST be objects: { value: "string", label: "string" } — NOT plain strings
- "array" fields need a nested "fields" array defining child field structure
- "richtext" and "blocks" are valid types; "html" is not
- All collection names must be unique strings
- Required field: name, type in every field definition

Be warm, friendly and encouraging. Don't use jargon like "Zod schema" or "validation error" — say "the configuration format" instead.

Output ONLY valid JSON (no markdown fences) matching this exact shape:
{
  "summary": "2-3 sentence friendly explanation of what happened and that it's easy to fix",
  "issues": [
    {
      "field": "short path like collections[3].fields[2].options",
      "problem": "human-friendly description of what's wrong",
      "fix": "concrete one-line instruction for how to fix it",
      "autoFixable": true
    }
  ],
  "canAutoFix": true,
  "autoFixNotes": "optional caveat if auto-fix has limitations"
}`;

  // i18n-ignore: model prompt (both branches)
  const user = isFilesystem // i18n-ignore: model prompt
    /* i18n-ignore: model prompt */
    ? `Site name: ${site.name}
Config file path: ${site.configPath}

Validation errors:
${rawErrors}

Config file content:
\`\`\`typescript
${configContent.slice(0, 8000)}
\`\`\`` // i18n-ignore: model prompt
    /* i18n-ignore: model prompt */
    : `Site name: ${site.name}
Config: GitHub-backed (${site.configPath})

Validation errors:
${rawErrors}`;

  let aiText: string;
  try {
    const ai = await getAI();
    const { text } = await ai.chat({
      ...mistralModel("mistral-small-latest"),
      maxTokens: 1200,
      system,
      messages: [{ role: "user", content: user }],
      responseFormat: "json",
      purpose: "site-config.diagnose",
    });
    aiText = text;
  } catch {
    return NextResponse.json({ error: t("errAdmin.siteConfig.aiDiagnosisUnavailable") }, { status: 502 });
  }

  let parsed: { summary?: string; issues?: DiagnoseIssue[]; canAutoFix?: boolean; autoFixNotes?: string } = {};
  try {
    parsed = (parseJsonLoose(aiText) as typeof parsed) ?? {};
  } catch {
    // fall through — return raw text as summary
  }
  const text = aiText;

  return NextResponse.json({
    siteName: site.name,
    configPath: site.configPath,
    isFilesystem,
    summary: parsed.summary ?? text,
    issues: parsed.issues ?? [],
    canAutoFix: isFilesystem && (parsed.canAutoFix ?? false),
    autoFixNotes: parsed.autoFixNotes,
  } satisfies DiagnoseResult);
}
