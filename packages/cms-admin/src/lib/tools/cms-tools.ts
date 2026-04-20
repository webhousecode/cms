import { getAdminCms, getAdminConfig } from "@/lib/cms";
import type { ToolDefinition, ToolHandler } from "./index";

interface ToolPair {
  definition: ToolDefinition;
  handler: ToolHandler;
}

/** Built-in CMS tools — lets agents search and read existing site content */
export async function buildCmsTools(): Promise<ToolPair[]> {
  return [
    {
      definition: {
        name: "cms_search",
        description: "Search across all published content on the site. Returns titles, URLs, and excerpts of matching documents.",
        input_schema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            limit: { type: "number", description: "Max results (default 10)" },
          },
          required: ["query"],
        },
      },
      handler: async (input) => {
        const query = String(input.query ?? "");
        const limit = Number(input.limit ?? 10);
        const cms = await getAdminCms();
        const results = await cms.content.search(query, { status: "published", limit });
        if (results.length === 0) return "No results found.";
        return results
          .map((r) => `- "${r.title}" (${r.collectionLabel}) ${r.url} — ${r.excerpt}`)
          .join("\n");
      },
    },
    {
      definition: {
        name: "cms_get_document",
        description: "Get the full content of a specific document by collection and slug.",
        input_schema: {
          type: "object",
          properties: {
            collection: { type: "string", description: "Collection name (e.g. 'posts', 'pages')" },
            slug: { type: "string", description: "Document slug" },
          },
          required: ["collection", "slug"],
        },
      },
      handler: async (input) => {
        const collection = String(input.collection ?? "");
        const slug = String(input.slug ?? "");
        const cms = await getAdminCms();
        const doc = await cms.content.findBySlug(collection, slug);
        if (!doc) return `Document not found: ${collection}/${slug}`;
        const data = { ...doc.data };
        // Truncate very long content fields
        for (const [key, val] of Object.entries(data)) {
          if (typeof val === "string" && val.length > 1000) {
            data[key] = val.slice(0, 1000) + "… [truncated]";
          }
        }
        return JSON.stringify(data, null, 2);
      },
    },
    {
      definition: {
        name: "cms_list_collection",
        description: "List all published documents in a collection. Returns titles and slugs.",
        input_schema: {
          type: "object",
          properties: {
            collection: { type: "string", description: "Collection name" },
          },
          required: ["collection"],
        },
      },
      handler: async (input) => {
        const collection = String(input.collection ?? "");
        const cms = await getAdminCms();
        const { documents } = await cms.content.findMany(collection, { status: "published" });
        if (documents.length === 0) return `No published documents in ${collection}.`;
        return documents
          .map((d) => `- "${d.data.title ?? d.data.name ?? d.slug}" (${d.slug})`)
          .join("\n");
      },
    },
    {
      definition: {
        name: "cms_list_collections",
        description: "List all available content collections and their document counts.",
        input_schema: {
          type: "object",
          properties: {},
        },
      },
      handler: async () => {
        const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
        const lines: string[] = [];
        for (const col of config.collections) {
          if (col.kind === "global") continue;
          const { documents } = await cms.content.findMany(col.name, { status: "published" }).catch(() => ({ documents: [] }));
          lines.push(`- ${col.label ?? col.name} (${col.name}): ${documents.length} published`);
        }
        return lines.join("\n");
      },
    },
  ];
}
