import { NextResponse } from "next/server";
import { getAdminCms, getAdminConfig } from "@/lib/cms";

const SYSTEM_KEYS = new Set([
  "slug", "status", "id", "createdAt", "updatedAt",
  "_fieldMeta", "_lastEditedBy", "_trashedAt", "_trashedBy",
  "_lockedFields", "locale", "translationOf",
  "publishAt", "unpublishAt",
]);

const SAMPLE_SIZE = 5;

export interface CollectionDrift {
  collection: string;
  label: string;
  missingFields: string[];
  sampleSize: number;
}

/**
 * GET /api/cms/schema-drift
 *
 * For each collection, samples up to 5 documents and compares their
 * data keys against the schema fields. Returns collections where
 * content has fields that are NOT in the schema (= silent data loss risk).
 */
export async function GET() {
  try {
    const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
    const results: CollectionDrift[] = [];

    for (const col of config.collections) {
      try {
        const { documents } = await cms.content.findMany(col.name, {
          limit: SAMPLE_SIZE,
        });

        // Skip empty collections or all-trashed
        const activeDocs = documents.filter((d: { status?: string }) => d.status !== "trashed");
        if (activeDocs.length === 0) continue;

        const schemaKeys = new Set(col.fields.map((f) => f.name));
        const contentKeys = new Set<string>();

        for (const doc of activeDocs) {
          const data = (doc as { data?: Record<string, unknown> }).data;
          if (!data) continue;
          for (const key of Object.keys(data)) {
            if (!SYSTEM_KEYS.has(key) && !key.startsWith("_")) {
              contentKeys.add(key);
            }
          }
        }

        const missingFields = [...contentKeys]
          .filter((k) => !schemaKeys.has(k))
          .sort();

        if (missingFields.length > 0) {
          results.push({
            collection: col.name,
            label: col.label ?? col.name,
            missingFields,
            sampleSize: activeDocs.length,
          });
        }
      } catch {
        // Skip collections that fail to load (e.g., missing directory)
      }
    }

    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Schema drift check failed" },
      { status: 500 },
    );
  }
}
