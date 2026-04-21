import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readFile } from "node:fs/promises";
import { requirePermission } from "@/lib/permissions";
import { loadRegistry, findSite } from "@/lib/site-registry";

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
  const denied = await requirePermission("sites.write");
  if (denied) return denied;

  const { rawErrors } = (await req.json()) as { rawErrors: string };

  // Find active site from cookies
  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get("cms-active-org")?.value;
  const activeSiteId = cookieStore.get("cms-active-site")?.value;

  const registry = await loadRegistry();
  if (!registry || !activeOrgId || !activeSiteId) {
    return NextResponse.json({ error: "Could not resolve active site" }, { status: 400 });
  }

  const site = findSite(registry, activeOrgId, activeSiteId);
  if (!site) {
    return NextResponse.json({ error: "Site not found in registry" }, { status: 404 });
  }

  const isFilesystem = !site.configPath.startsWith("github://");
  let configContent = "";

  if (isFilesystem) {
    try {
      configContent = await readFile(site.configPath, "utf-8");
    } catch {
      return NextResponse.json({ error: "Could not read config file" }, { status: 500 });
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Return a basic diagnosis without LLM
    return NextResponse.json({
      siteName: site.name,
      configPath: site.configPath,
      isFilesystem,
      summary: "The site configuration has validation errors that prevent it from loading.",
      issues: rawErrors.split("\n").filter(Boolean).map((line) => ({
        field: line.split(":")[0]?.trim() ?? "unknown",
        problem: line.trim(),
        fix: "Review the cms.config.ts file and correct the field format.",
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

  const user = isFilesystem
    ? `Site name: ${site.name}
Config file path: ${site.configPath}

Validation errors:
${rawErrors}

Config file content:
\`\`\`typescript
${configContent.slice(0, 8000)}
\`\`\``
    : `Site name: ${site.name}
Config: GitHub-backed (${site.configPath})

Validation errors:
${rawErrors}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: "AI diagnosis unavailable" }, { status: 502 });
  }

  const payload = await res.json() as { content: Array<{ type: string; text?: string }> };
  const text = payload.content.find((c) => c.type === "text")?.text ?? "{}";

  let parsed: { summary?: string; issues?: DiagnoseIssue[]; canAutoFix?: boolean; autoFixNotes?: string } = {};
  try {
    const match = /\{[\s\S]*\}/.exec(text);
    if (match) parsed = JSON.parse(match[0]);
  } catch {
    // fall through — return raw text as summary
  }

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
