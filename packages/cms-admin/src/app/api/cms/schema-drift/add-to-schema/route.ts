import { NextRequest, NextResponse } from "next/server";
import { getAdminConfig } from "@/lib/cms";
import { getActiveSitePaths } from "@/lib/site-paths";
import { getSiteRole } from "@/lib/require-role";
import { getApiKey } from "@/lib/ai-config";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { invalidate } from "@/lib/site-pool";
import { cookies } from "next/headers";
import { loadRegistry, findSite } from "@/lib/site-registry";

/**
 * POST /api/cms/schema-drift/add-to-schema
 *
 * Adds orphaned fields to the collection schema in cms.config.ts.
 * Uses Haiku to infer types from content samples and insert field definitions.
 * Body: { collection: string, fields: string[] }
 */
export async function POST(req: NextRequest) {
  const role = await getSiteRole();
  if (!role || role === "viewer") {
    return NextResponse.json({ error: "No write access" }, { status: 403 });
  }

  try {
    const { collection, fields } = (await req.json()) as { collection?: string; fields?: string[] };
    if (!collection || !fields?.length) {
      return NextResponse.json({ error: "collection and fields[] required" }, { status: 400 });
    }

    const config = await getAdminConfig();
    const colConfig = config.collections.find((c) => c.name === collection);
    if (!colConfig) {
      return NextResponse.json({ error: `Collection "${collection}" not found` }, { status: 404 });
    }

    // Only add fields that are truly NOT in the schema
    const schemaKeys = new Set(colConfig.fields.map((f) => f.name));
    const newFields = fields.filter((f) => !schemaKeys.has(f));
    if (newFields.length === 0) {
      return NextResponse.json({ error: "All specified fields already exist in schema" }, { status: 400 });
    }

    // Sample content to infer types
    const { contentDir, configPath } = await getActiveSitePaths();
    if (configPath.startsWith("github://")) {
      return NextResponse.json({ error: "Add-to-schema is only available for filesystem sites" }, { status: 400 });
    }

    const collectionDir = join(contentDir, collection);
    if (!collectionDir.startsWith(contentDir + "/")) {
      return NextResponse.json({ error: "Invalid collection path" }, { status: 400 });
    }

    let samples: Record<string, unknown>[] = [];
    if (existsSync(collectionDir)) {
      const jsonFiles = readdirSync(collectionDir)
        .filter((f) => f.endsWith(".json"))
        .slice(0, 3);
      for (const file of jsonFiles) {
        try {
          const doc = JSON.parse(readFileSync(join(collectionDir, file), "utf-8"));
          if (doc.data) samples.push(doc.data);
        } catch { /* skip */ }
      }
    }

    // Extract sample values for the orphaned fields
    const fieldSamples: Record<string, unknown[]> = {};
    for (const field of newFields) {
      fieldSamples[field] = samples
        .map((d) => d[field])
        .filter((v) => v !== undefined && v !== null)
        .slice(0, 2);
    }

    const configSource = readFileSync(configPath, "utf-8");

    const apiKey = await getApiKey("anthropic");
    if (!apiKey) {
      return NextResponse.json({ error: "Anthropic API key not configured — set it in AI Settings or ANTHROPIC_API_KEY env" }, { status: 503 });
    }

    const system = `You are a TypeScript code editor for @webhouse/cms configuration files.

Given a cms.config.ts file, a collection name, and orphaned field names with content samples, add field definitions to that collection's fields array.

@webhouse/cms field types: text, textarea, richtext, number, boolean, date, select, multiselect, image, file, array, blocks, relation.

Rules for type inference:
- string value, no line breaks, short (<200 chars) → "text"
- string value with HTML or line breaks → "richtext" or "textarea"
- number → "number"
- boolean → "boolean"
- ISO date string → "date"
- array of objects → "array" with nested fields
- object → "blocks" or "text" (use "text" if unsure)
- url/path string → "text"

Add each new field with { name: "fieldName", type: "inferred-type", label: "Human Label" }.
For "select" or "multiselect" type, add an options array only if you see clear enum values in the samples.

Insert the new field definitions at the END of the fields array for the specified collection. Do not change anything else.

Return ONLY the complete raw TypeScript source code. No markdown fences, no explanations.`;

    const user = `Collection: ${collection}
New fields to add (with sample values from content):
${JSON.stringify(fieldSamples, null, 2)}

Existing schema for this collection's fields:
${JSON.stringify(colConfig.fields.map((f) => ({ name: f.name, type: f.type, label: f.label })), null, 2)}

cms.config.ts:
${configSource.slice(0, 8000)}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "AI type inference failed" }, { status: 502 });
    }

    const payload = await res.json() as { content: Array<{ type: string; text?: string }> };
    let updated = payload.content.find((c) => c.type === "text")?.text ?? "";

    // Strip markdown fences if model added them anyway
    updated = updated.replace(/^```(?:typescript|ts)?\n?/m, "").replace(/\n?```\s*$/m, "").trim();

    if (!updated || updated.length < 50) {
      return NextResponse.json({ error: "AI returned an empty or unusable result" }, { status: 502 });
    }

    writeFileSync(configPath, updated, "utf-8");

    // Invalidate site pool cache so the next request picks up the updated config
    const cookieStore = await cookies();
    const activeOrgId = cookieStore.get("cms-active-org")?.value;
    const activeSiteId = cookieStore.get("cms-active-site")?.value;
    if (activeOrgId && activeSiteId) {
      invalidate(activeOrgId, activeSiteId);
    } else {
      const registry = await loadRegistry();
      if (registry) {
        const site = findSite(registry, registry.defaultOrgId ?? "", registry.defaultSiteId ?? "");
        if (site) invalidate(registry.defaultOrgId ?? "", registry.defaultSiteId ?? "");
      }
    }

    return NextResponse.json({ ok: true, addedFields: newFields });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Add to schema failed" },
      { status: 500 },
    );
  }
}
