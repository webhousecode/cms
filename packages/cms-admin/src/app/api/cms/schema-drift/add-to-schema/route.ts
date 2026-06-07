import { NextRequest, NextResponse } from "next/server";
import { getAdminConfig } from "@/lib/cms";
import { getActiveSitePaths } from "@/lib/site-paths";
import { getSiteRole } from "@/lib/require-role";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { invalidateActiveSite } from "@/lib/site-pool";
import {
  inferFieldType,
  serializeFieldLine,
  insertFieldsIntoCollection,
  assertConfigStructureIntact,
} from "@/lib/schema-field-infer";

/**
 * POST /api/cms/schema-drift/add-to-schema
 *
 * Adds orphaned fields (present in content, missing from schema) to a
 * collection's `fields` array in cms.config.ts.
 *
 * DETERMINISTIC — no AI. Field types are inferred from sample values with
 * fixed rules, and the new field lines are INSERTED surgically into the
 * target collection's fields array; every other byte of the file (urlPattern,
 * nested array fields, forms, blocks, autolinks, storage, locales) is left
 * untouched. The result is structurally validated before it is written, and
 * the original is backed up to `<config>.bak` first.
 *
 * (The previous implementation asked an LLM to rewrite the whole file and
 * wrote the raw output to disk unvalidated — it destroyed webhouse-site's
 * config on 2026-06-07. See lib/schema-field-infer.ts for the full story.)
 *
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

    // Only add fields that are truly NOT in the schema.
    const schemaKeys = new Set(colConfig.fields.map((f) => f.name));
    const newFields = fields.filter((f) => !schemaKeys.has(f));
    if (newFields.length === 0) {
      return NextResponse.json({ error: "All specified fields already exist in schema" }, { status: 400 });
    }

    const { contentDir, configPath } = await getActiveSitePaths();
    if (configPath.startsWith("github://")) {
      return NextResponse.json({ error: "Add-to-schema is only available for filesystem sites" }, { status: 400 });
    }

    // Path-traversal guard on the collection directory.
    const collectionDir = join(contentDir, collection);
    if (collectionDir !== contentDir && !collectionDir.startsWith(contentDir + "/")) {
      return NextResponse.json({ error: "Invalid collection path" }, { status: 400 });
    }

    // Sample content to infer types (read a generous slice of docs).
    const samples: Record<string, unknown>[] = [];
    if (existsSync(collectionDir)) {
      const jsonFiles = readdirSync(collectionDir).filter((f) => f.endsWith(".json")).slice(0, 25);
      for (const file of jsonFiles) {
        try {
          const doc = JSON.parse(readFileSync(join(collectionDir, file), "utf-8"));
          if (doc.data) samples.push(doc.data as Record<string, unknown>);
        } catch { /* skip unparseable doc */ }
      }
    }

    // Build deterministic field lines for each orphaned field.
    const fieldLines = newFields.map((field) => {
      const values = samples.map((d) => d[field]);
      return serializeFieldLine(field, inferFieldType(values));
    });

    const source = readFileSync(configPath, "utf-8");
    const updated = insertFieldsIntoCollection(source, collection, fieldLines); // throws if not locatable
    assertConfigStructureIntact(source, updated, config.collections.map((c) => c.name), newFields);

    // Back up the original, then write. Both happen only after validation passes.
    writeFileSync(configPath + ".bak", source, "utf-8");
    writeFileSync(configPath, updated, "utf-8");

    // Drop the in-memory site-pool entry so the next read re-parses the config.
    await invalidateActiveSite();

    return NextResponse.json({ ok: true, addedFields: newFields });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Add to schema failed" },
      { status: 500 },
    );
  }
}
