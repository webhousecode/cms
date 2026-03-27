import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { readSiteConfig } from "@/lib/site-config";
import { loadRegistry, findSite } from "@/lib/site-registry";
import { cookies } from "next/headers";
import type { ToolDefinition, ToolHandler } from "@/lib/tools";

interface ToolPair {
  definition: ToolDefinition;
  handler: ToolHandler;
}

/** Phase 1: Read-only chat tools */
export async function buildChatTools(): Promise<ToolPair[]> {
  return [
    // ── site_summary ──────────────────────────────────────────
    {
      definition: {
        name: "site_summary",
        description: "Get an overview of the site: name, adapter, collections with document counts, and configuration.",
        input_schema: { type: "object", properties: {} },
      },
      handler: async () => {
        const [cms, config, siteConfig] = await Promise.all([
          getAdminCms(),
          getAdminConfig(),
          readSiteConfig(),
        ]);

        // Get site name + adapter from registry
        let siteName = "Unnamed";
        let adapter = "filesystem";
        try {
          const registry = await loadRegistry();
          if (registry) {
            const cookieStore = await cookies();
            const orgId = cookieStore.get("cms-active-org")?.value ?? registry.defaultOrgId;
            const siteId = cookieStore.get("cms-active-site")?.value ?? registry.defaultSiteId;
            const site = findSite(registry, orgId, siteId);
            if (site) { siteName = site.name; adapter = site.adapter; }
          }
        } catch { /* fallback */ }

        const lines: string[] = [
          `Site: ${siteName}`,
          `Adapter: ${adapter}`,
          `Collections:`,
        ];

        for (const col of config.collections) {
          if (col.name === "global") continue;
          const { documents } = await cms.content
            .findMany(col.name, {})
            .catch(() => ({ documents: [] as any[] }));
          const active = documents.filter((d: any) => d.status !== "trashed");
          const published = active.filter((d: any) => d.status === "published");
          const drafts = active.filter((d: any) => d.status === "draft");
          lines.push(
            `  - ${col.label ?? col.name} (${col.name}): ${active.length} total (${published.length} published, ${drafts.length} drafts)`
          );
        }

        if (siteConfig.deployProvider && siteConfig.deployProvider !== "off") {
          lines.push(`Deploy: ${siteConfig.deployProvider}`);
        }

        return lines.join("\n");
      },
    },

    // ── list_documents ────────────────────────────────────────
    {
      definition: {
        name: "list_documents",
        description:
          "List documents in a collection. Can filter by status. Returns title, slug, status, and date.",
        input_schema: {
          type: "object",
          properties: {
            collection: { type: "string", description: "Collection name (e.g. 'posts', 'pages')" },
            status: {
              type: "string",
              description: "Filter by status: 'published', 'draft', 'all' (default: 'all')",
            },
            limit: { type: "number", description: "Max documents to return (default: 50)" },
          },
          required: ["collection"],
        },
      },
      handler: async (input) => {
        const collection = String(input.collection);
        const statusFilter = String(input.status ?? "all");
        const limit = Math.min(Number(input.limit ?? 50), 200);

        const cms = await getAdminCms();
        const { documents } = await cms.content.findMany(collection, {});

        let docs = documents.filter((d: any) => d.status !== "trashed");
        if (statusFilter !== "all") {
          docs = docs.filter((d: any) => d.status === statusFilter);
        }
        docs = docs.slice(0, limit);

        if (docs.length === 0) return `No documents found in ${collection} (filter: ${statusFilter}).`;

        return docs
          .map((d: any) => {
            const title = d.data.title ?? d.data.name ?? d.slug;
            const date = d.data.date ?? d.updatedAt ?? "";
            return `- "${title}" (${d.slug}) [${d.status}]${date ? ` — ${date}` : ""}`;
          })
          .join("\n");
      },
    },

    // ── get_document ──────────────────────────────────────────
    {
      definition: {
        name: "get_document",
        description:
          "Get the full content of a specific document by collection and slug. Returns all fields.",
        input_schema: {
          type: "object",
          properties: {
            collection: { type: "string", description: "Collection name" },
            slug: { type: "string", description: "Document slug" },
          },
          required: ["collection", "slug"],
        },
      },
      handler: async (input) => {
        const collection = String(input.collection);
        const slug = String(input.slug);

        const cms = await getAdminCms();
        const doc = await cms.content.findBySlug(collection, slug);
        if (!doc) return `Document not found: ${collection}/${slug}`;

        const data = { ...doc.data };
        // Truncate very long fields for readability
        for (const [key, val] of Object.entries(data)) {
          if (typeof val === "string" && val.length > 2000) {
            data[key] = val.slice(0, 2000) + "\n… [truncated]";
          }
        }

        return JSON.stringify(
          { slug: doc.slug, status: doc.status, ...data },
          null,
          2
        );
      },
    },

    // ── search_content ────────────────────────────────────────
    {
      definition: {
        name: "search_content",
        description:
          "Search across all content on the site. Returns matching documents with titles, collections, and excerpts.",
        input_schema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            limit: { type: "number", description: "Max results (default: 20)" },
          },
          required: ["query"],
        },
      },
      handler: async (input) => {
        const query = String(input.query);
        const limit = Math.min(Number(input.limit ?? 20), 50);

        const cms = await getAdminCms();
        const results = await cms.content.search(query, { limit });

        if (results.length === 0) return `No results for "${query}".`;

        return results
          .map((r: any) => `- "${r.title}" (${r.collectionLabel}) ${r.url} — ${r.excerpt ?? ""}`)
          .join("\n");
      },
    },

    // ── get_schema ────────────────────────────────────────────
    {
      definition: {
        name: "get_schema",
        description:
          "Get the full schema (fields, types, options) for a collection. Useful for understanding what data a collection holds.",
        input_schema: {
          type: "object",
          properties: {
            collection: { type: "string", description: "Collection name" },
          },
          required: ["collection"],
        },
      },
      handler: async (input) => {
        const collection = String(input.collection);
        const config = await getAdminConfig();
        const col = config.collections.find((c) => c.name === collection);
        if (!col) return `Collection not found: ${collection}`;

        const fields = (col.fields ?? []).map((f: any) => {
          const parts = [`${f.label ?? f.name} (${f.type})`];
          if (f.required) parts.push("*required");
          if (f.options) parts.push(`options: ${JSON.stringify(f.options)}`);
          if (f.defaultValue !== undefined) parts.push(`default: ${JSON.stringify(f.defaultValue)}`);
          return `  - ${parts.join(" | ")}`;
        });

        return `Collection: ${col.label ?? col.name} (${col.name})\n${fields.join("\n")}`;
      },
    },

    // ── list_drafts ───────────────────────────────────────────
    {
      definition: {
        name: "list_drafts",
        description:
          "List all draft (unpublished) documents across all collections.",
        input_schema: { type: "object", properties: {} },
      },
      handler: async () => {
        const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);

        const lines: string[] = [];

        for (const col of config.collections) {
          if (col.name === "global") continue;
          const { documents } = await cms.content
            .findMany(col.name, {})
            .catch(() => ({ documents: [] as any[] }));
          const drafts = documents.filter((d: any) => d.status === "draft");
          for (const d of drafts) {
            const title = d.data.title ?? d.data.name ?? d.slug;
            lines.push(`- "${title}" (${col.label ?? col.name} / ${d.slug})`);
          }
        }

        if (lines.length === 0) return "No drafts found. All content is published.";
        return `${lines.length} draft(s):\n${lines.join("\n")}`;
      },
    },

    // ── get_site_config ───────────────────────────────────────
    {
      definition: {
        name: "get_site_config",
        description:
          "Get the site configuration: name, adapter, deploy settings, AI settings, and more.",
        input_schema: { type: "object", properties: {} },
      },
      handler: async () => {
        const siteConfig = await readSiteConfig();
        // Remove sensitive keys
        const safe = { ...siteConfig } as Record<string, unknown>;
        delete safe.anthropicApiKey;
        delete safe.openaiApiKey;
        return JSON.stringify(safe, null, 2);
      },
    },
  ];
}
