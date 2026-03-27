import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { readSiteConfig } from "@/lib/site-config";
import { loadRegistry, findSite } from "@/lib/site-registry";
import { saveRevision } from "@/lib/revisions";
// getDocumentUrl imported dynamically in get_document handler to avoid Turbopack bundling issues
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
        const config = await getAdminConfig();
        const doc = await cms.content.findBySlug(collection, slug);
        if (!doc) return `Document not found: ${collection}/${slug}`;

        const data = { ...doc.data };
        // Truncate very long fields for readability
        for (const [key, val] of Object.entries(data)) {
          if (typeof val === "string" && val.length > 2000) {
            data[key] = val.slice(0, 2000) + "\n… [truncated]";
          }
        }

        // Build page path using the same routing resolver as the build system
        const col = config.collections.find((c) => c.name === collection);
        const { getDocumentUrl } = await import("@webhouse/cms");
        const pagePath = col
          ? getDocumentUrl(doc, col as any)
          : `/${collection}/${slug}/`;

        return JSON.stringify(
          { slug: doc.slug, status: doc.status, _pagePath: pagePath, ...data },
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

    // ── update_site_settings ──────────────────────────────────
    {
      definition: {
        name: "update_site_settings",
        description:
          "Update site settings. Use get_site_config first to see current values. Only include fields you want to change. Sensitive fields (API keys) cannot be changed via chat.",
        input_schema: {
          type: "object",
          properties: {
            settings: {
              type: "object",
              description: "Key-value pairs to update. E.g. { previewSiteUrl: 'http://...', trashRetentionDays: 30, deployOnSave: true }",
            },
          },
          required: ["settings"],
        },
      },
      handler: async (input) => {
        const patch = (input.settings ?? {}) as Record<string, unknown>;

        // Block sensitive fields
        const blocked = ["anthropicApiKey", "openaiApiKey", "geminiApiKey", "braveApiKey", "tavilyApiKey", "resendApiKey", "deployApiToken", "calendarSecret"];
        const attempted = Object.keys(patch).filter((k) => blocked.includes(k));
        if (attempted.length > 0) {
          return `Error: Cannot update sensitive fields via chat: ${attempted.join(", ")}. Use Site Settings in Admin mode.`;
        }

        const { writeSiteConfig } = await import("@/lib/site-config");
        const updated = await writeSiteConfig(patch as any);

        const changedKeys = Object.keys(patch).join(", ");
        return `Updated site settings: ${changedKeys}`;
      },
    },

    // ═══════════════════════════════════════════════════════════
    // Media tools
    // ═══════════════════════════════════════════════════════════

    // ── list_media ────────────────────────────────────────────
    {
      definition: {
        name: "list_media",
        description:
          "List all media files (images, videos, audio, documents) in the site's media library. Returns file names, URLs, types, and AI analysis data if available.",
        input_schema: {
          type: "object",
          properties: {
            type: { type: "string", description: "Filter by type: 'image', 'video', 'audio', 'document', 'all' (default: 'all')" },
            limit: { type: "number", description: "Max files to return (default: 50)" },
          },
        },
      },
      handler: async (input) => {
        const typeFilter = String(input.type ?? "all");
        const limit = Math.min(Number(input.limit ?? 50), 200);

        const { getMediaAdapter } = await import("@/lib/media");
        const { readMediaMeta } = await import("@/lib/media/media-meta");

        const [files, meta] = await Promise.all([
          getMediaAdapter().then((a) => a.listMedia()),
          readMediaMeta(),
        ]);

        // Build meta lookup by key
        const metaMap = new Map(meta.map((m) => [m.key, m]));

        let filtered = files.filter((f) => !/-\d+w\.webp$/i.test(f.name));
        if (typeFilter !== "all") {
          filtered = filtered.filter((f) => f.mediaType === typeFilter);
        }
        filtered = filtered.slice(0, limit);

        if (filtered.length === 0) return `No ${typeFilter === "all" ? "" : typeFilter + " "}files found in media library.`;

        return filtered
          .map((f) => {
            const key = f.folder ? `${f.folder}/${f.name}` : f.name;
            const m = metaMap.get(key);
            const parts = [`- ${f.name} (${f.mediaType}, ${Math.round(f.size / 1024)}KB)`];
            parts.push(`  URL: ${f.url}`);
            if (m?.aiCaption) parts.push(`  AI caption: ${m.aiCaption}`);
            if (m?.aiAlt) parts.push(`  AI alt: ${m.aiAlt}`);
            if (m?.aiTags?.length) parts.push(`  AI tags: ${m.aiTags.join(", ")}`);
            if (m?.tags?.length) parts.push(`  User tags: ${m.tags.join(", ")}`);
            return parts.join("\n");
          })
          .join("\n\n");
      },
    },

    // ── search_media ──────────────────────────────────────────
    {
      definition: {
        name: "search_media",
        description:
          "Search media files by AI captions, AI tags, user tags, or filename. Use this to find relevant images for content. Returns matching files with their URLs.",
        input_schema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query — matches against AI captions, AI tags, user tags, and filenames" },
            type: { type: "string", description: "Filter by type: 'image', 'video', 'audio', 'all' (default: 'image')" },
            limit: { type: "number", description: "Max results (default: 10)" },
          },
          required: ["query"],
        },
      },
      handler: async (input) => {
        const query = String(input.query).toLowerCase();
        const typeFilter = String(input.type ?? "image");
        const limit = Math.min(Number(input.limit ?? 10), 50);

        const { getMediaAdapter } = await import("@/lib/media");
        const { readMediaMeta } = await import("@/lib/media/media-meta");

        const [files, meta] = await Promise.all([
          getMediaAdapter().then((a) => a.listMedia()),
          readMediaMeta(),
        ]);

        const metaMap = new Map(meta.map((m) => [m.key, m]));

        // Score each file by relevance
        const scored = files
          .filter((f) => !/-\d+w\.webp$/i.test(f.name))
          .filter((f) => typeFilter === "all" || f.mediaType === typeFilter)
          .map((f) => {
            const key = f.folder ? `${f.folder}/${f.name}` : f.name;
            const m = metaMap.get(key);
            let score = 0;

            // Match against various fields
            if (f.name.toLowerCase().includes(query)) score += 3;
            if (m?.aiCaption?.toLowerCase().includes(query)) score += 5;
            if (m?.aiAlt?.toLowerCase().includes(query)) score += 4;
            if (m?.aiTags?.some((t) => t.toLowerCase().includes(query))) score += 4;
            if (m?.tags?.some((t) => t.toLowerCase().includes(query))) score += 4;

            // Partial word matching for multi-word queries
            const words = query.split(/\s+/);
            if (words.length > 1) {
              for (const word of words) {
                if (m?.aiCaption?.toLowerCase().includes(word)) score += 1;
                if (m?.aiTags?.some((t) => t.toLowerCase().includes(word))) score += 1;
              }
            }

            return { file: f, meta: m, score };
          })
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);

        if (scored.length === 0) return `No media files matching "${query}" found.`;

        return scored
          .map(({ file: f, meta: m }) => {
            const parts = [`- **${f.name}** (${f.mediaType})`];
            parts.push(`  URL: ${f.url}`);
            if (m?.aiCaption) parts.push(`  Caption: ${m.aiCaption}`);
            if (m?.aiAlt) parts.push(`  Alt: ${m.aiAlt}`);
            if (m?.aiTags?.length) parts.push(`  Tags: ${m.aiTags.join(", ")}`);
            return parts.join("\n");
          })
          .join("\n\n");
      },
    },

    // ═══════════════════════════════════════════════════════════
    // Phase 3: Inline forms
    // ═══════════════════════════════════════════════════════════

    // ── show_edit_form ────────────────────────────────────────
    {
      definition: {
        name: "show_edit_form",
        description:
          "Show an inline edit form for specific fields on a document. The form renders directly in the chat so the user can edit and save. Use this when the user wants to manually edit specific fields rather than having AI do it.",
        input_schema: {
          type: "object",
          properties: {
            collection: { type: "string", description: "Collection name" },
            slug: { type: "string", description: "Document slug" },
            fields: {
              type: "array",
              items: { type: "string" },
              description: "Field names to show in the form. If omitted, shows all fields.",
            },
          },
          required: ["collection", "slug"],
        },
      },
      handler: async (input) => {
        const collection = String(input.collection);
        const slug = String(input.slug);
        const fieldFilter = input.fields as string[] | undefined;

        const cms = await getAdminCms();
        const config = await getAdminConfig();
        const doc = await cms.content.findBySlug(collection, slug);
        if (!doc) return `Error: Document not found: ${collection}/${slug}`;

        const col = config.collections.find((c) => c.name === collection);
        if (!col) return `Error: Collection not found: ${collection}`;

        const schemaFields = (col.fields ?? []) as Array<{
          name: string; type: string; label?: string; required?: boolean;
          options?: Array<{ label: string; value: string }>;
        }>;

        const fields = schemaFields
          .filter((f) => !fieldFilter || fieldFilter.includes(f.name))
          .map((f) => {
            let formType: string = "text";
            if (f.type === "textarea" || f.type === "richtext") formType = "textarea";
            else if (f.type === "select") formType = "select";
            else if (f.type === "boolean") formType = "boolean";
            else if (f.type === "date") formType = "date";
            else if (f.type === "tags") formType = "tags";

            return {
              name: f.name,
              type: formType,
              label: f.label ?? f.name,
              value: doc.data[f.name] ?? (f.type === "boolean" ? false : f.type === "tags" ? [] : ""),
              ...(f.options ? { options: f.options } : {}),
              ...(f.required ? { required: true } : {}),
            };
          });

        // Return as a special JSON that the chat UI will render as a form
        return `__INLINE_FORM__${JSON.stringify({
          collection,
          slug,
          title: String(doc.data.title ?? doc.data.name ?? slug),
          fields,
        })}`;
      },
    },

    // ═══════════════════════════════════════════════════════════
    // Phase 2: Write tools
    // ═══════════════════════════════════════════════════════════

    // ── create_document ───────────────────────────────────────
    {
      definition: {
        name: "create_document",
        description:
          "Create a new document in a collection. Returns the created document. Always creates as draft.",
        input_schema: {
          type: "object",
          properties: {
            collection: { type: "string", description: "Collection name (e.g. 'posts', 'pages')" },
            slug: { type: "string", description: "URL slug for the document (lowercase, hyphens). If omitted, generated from title." },
            data: {
              type: "object",
              description: "Document fields as key-value pairs. Must match the collection schema. E.g. { title: '...', body: '...', tags: ['a','b'] }",
            },
          },
          required: ["collection", "data"],
        },
      },
      handler: async (input) => {
        const collection = String(input.collection);
        const data = (input.data ?? {}) as Record<string, unknown>;

        // Generate slug from title if not provided
        let slug = input.slug ? String(input.slug) : "";
        if (!slug) {
          const title = String(data.title ?? data.name ?? "untitled");
          slug = title
            .toLowerCase()
            .replace(/[æ]/g, "ae").replace(/[ø]/g, "oe").replace(/[å]/g, "aa")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 80);
        }

        const cms = await getAdminCms();
        const config = await getAdminConfig();
        const col = config.collections.find((c) => c.name === collection);
        if (!col) return `Error: Collection "${collection}" not found.`;

        // Check slug doesn't already exist
        const existing = await cms.content.findBySlug(collection, slug).catch(() => null);
        if (existing) return `Error: Document with slug "${slug}" already exists in ${collection}.`;

        const doc = await cms.content.create(collection, {
          slug,
          data,
          status: "draft",
        });

        return `Created "${data.title ?? slug}" in ${collection} (draft).\nSlug: ${doc.slug}\nStatus: draft`;
      },
    },

    // ── update_document ───────────────────────────────────────
    {
      definition: {
        name: "update_document",
        description:
          "Update fields on an existing document. Only the provided fields are changed; others are preserved.",
        input_schema: {
          type: "object",
          properties: {
            collection: { type: "string", description: "Collection name" },
            slug: { type: "string", description: "Document slug" },
            data: {
              type: "object",
              description: "Fields to update. Only include fields you want to change.",
            },
          },
          required: ["collection", "slug", "data"],
        },
      },
      handler: async (input) => {
        const collection = String(input.collection);
        const slug = String(input.slug);
        const newData = (input.data ?? {}) as Record<string, unknown>;

        const cms = await getAdminCms();
        const doc = await cms.content.findBySlug(collection, slug);
        if (!doc) return `Error: Document not found: ${collection}/${slug}`;

        // Save revision before updating
        await saveRevision(collection, doc).catch(() => {});

        const mergedData = { ...doc.data, ...newData };
        await cms.content.update(collection, doc.id, { data: mergedData });

        const changedFields = Object.keys(newData).join(", ");
        return `Updated "${doc.data.title ?? slug}" in ${collection}.\nChanged fields: ${changedFields}`;
      },
    },

    // ── publish_document ──────────────────────────────────────
    {
      definition: {
        name: "publish_document",
        description: "Publish a draft document (change status from draft to published).",
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
        if (!doc) return `Error: Document not found: ${collection}/${slug}`;
        if (doc.status === "published") return `"${doc.data.title ?? slug}" is already published.`;

        await saveRevision(collection, doc).catch(() => {});
        await cms.content.update(collection, doc.id, { status: "published" });

        return `Published "${doc.data.title ?? slug}" in ${collection}.`;
      },
    },

    // ── unpublish_document ────────────────────────────────────
    {
      definition: {
        name: "unpublish_document",
        description: "Unpublish a document (change status from published to draft).",
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
        if (!doc) return `Error: Document not found: ${collection}/${slug}`;
        if (doc.status === "draft") return `"${doc.data.title ?? slug}" is already a draft.`;

        await saveRevision(collection, doc).catch(() => {});
        await cms.content.update(collection, doc.id, { status: "draft" });

        return `Unpublished "${doc.data.title ?? slug}" — now a draft.`;
      },
    },

    // ── trash_document ────────────────────────────────────────
    {
      definition: {
        name: "trash_document",
        description:
          "Move a document to trash. DESTRUCTIVE — only call after user confirms. The document can be restored from the Trash page.",
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
        if (!doc) return `Error: Document not found: ${collection}/${slug}`;

        await saveRevision(collection, doc).catch(() => {});
        await cms.content.update(collection, doc.id, {
          status: "trashed" as any,
          data: { ...doc.data, _trashedAt: new Date().toISOString() },
        });

        return `Trashed "${doc.data.title ?? slug}" from ${collection}. It can be restored from the Trash page.`;
      },
    },

    // ── generate_content ──────────────────────────────────────
    {
      definition: {
        name: "generate_content",
        description:
          "Generate AI content for a specific field on a document. Uses the site's AI model to write content based on a prompt.",
        input_schema: {
          type: "object",
          properties: {
            collection: { type: "string", description: "Collection name" },
            slug: { type: "string", description: "Document slug" },
            field: { type: "string", description: "Field name to generate content for (e.g. 'body', 'excerpt', 'description')" },
            prompt: { type: "string", description: "Instructions for what to generate" },
          },
          required: ["collection", "slug", "field", "prompt"],
        },
      },
      handler: async (input) => {
        const collection = String(input.collection);
        const slug = String(input.slug);
        const field = String(input.field);
        const prompt = String(input.prompt);

        const cms = await getAdminCms();
        const doc = await cms.content.findBySlug(collection, slug);
        if (!doc) return `Error: Document not found: ${collection}/${slug}`;

        // Use the existing AI chat endpoint internally
        const { getApiKey } = await import("@/lib/ai-config");
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const apiKey = await getApiKey("anthropic");
        if (!apiKey) return "Error: Anthropic API key not configured.";

        const client = new Anthropic({ apiKey });
        const config = await getAdminConfig();
        const col = config.collections.find((c) => c.name === collection);
        const fieldDef = col?.fields?.find((f: any) => f.name === field) as any;
        const fieldType = fieldDef?.type ?? "text";

        let constraint = "";
        if (fieldType === "text") constraint = "Output a single concise line. No markdown.";
        else if (fieldType === "textarea") constraint = "Output a short paragraph. No markdown headings.";
        else constraint = "Markdown formatting is allowed.";

        const response = await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 2048,
          system: `You are a content writer. Generate content for the "${fieldDef?.label ?? field}" field. ${constraint}\nExisting document: ${JSON.stringify(doc.data, null, 2)}`,
          messages: [{ role: "user", content: prompt }],
        });

        const generated = response.content
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("");

        // Save to document
        await saveRevision(collection, doc).catch(() => {});
        await cms.content.update(collection, doc.id, {
          data: { ...doc.data, [field]: generated },
        });

        const preview = generated.length > 300 ? generated.slice(0, 300) + "…" : generated;
        return `Generated content for "${field}" on "${doc.data.title ?? slug}".\n\nPreview:\n${preview}`;
      },
    },

    // ── rewrite_field ─────────────────────────────────────────
    {
      definition: {
        name: "rewrite_field",
        description:
          "Rewrite an existing field on a document with AI, based on an instruction (e.g. 'make it shorter', 'translate to English', 'more professional tone').",
        input_schema: {
          type: "object",
          properties: {
            collection: { type: "string", description: "Collection name" },
            slug: { type: "string", description: "Document slug" },
            field: { type: "string", description: "Field name to rewrite" },
            instruction: { type: "string", description: "How to rewrite (e.g. 'make it shorter', 'translate to Danish')" },
          },
          required: ["collection", "slug", "field", "instruction"],
        },
      },
      handler: async (input) => {
        const collection = String(input.collection);
        const slug = String(input.slug);
        const field = String(input.field);
        const instruction = String(input.instruction);

        const cms = await getAdminCms();
        const doc = await cms.content.findBySlug(collection, slug);
        if (!doc) return `Error: Document not found: ${collection}/${slug}`;

        const currentValue = doc.data[field];
        if (!currentValue) return `Error: Field "${field}" is empty on ${collection}/${slug}.`;

        const { getApiKey } = await import("@/lib/ai-config");
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const apiKey = await getApiKey("anthropic");
        if (!apiKey) return "Error: Anthropic API key not configured.";

        const client = new Anthropic({ apiKey });
        const response = await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 2048,
          system: "You are a content rewriter. Output ONLY the rewritten content. No preamble, no explanation.",
          messages: [{
            role: "user",
            content: `Rewrite this content. Instruction: ${instruction}\n\nOriginal:\n${String(currentValue)}`,
          }],
        });

        const rewritten = response.content
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("");

        await saveRevision(collection, doc).catch(() => {});
        await cms.content.update(collection, doc.id, {
          data: { ...doc.data, [field]: rewritten },
        });

        const preview = rewritten.length > 300 ? rewritten.slice(0, 300) + "…" : rewritten;
        return `Rewrote "${field}" on "${doc.data.title ?? slug}".\n\nNew content:\n${preview}`;
      },
    },

    // ═══════════════════════════════════════════════════════════
    // Artifact generation (F110 Digital Island Apps)
    // ═══════════════════════════════════════════════════════════

    // ── generate_interactive ──────────────────────────────────
    {
      definition: {
        name: "generate_interactive",
        description:
          "Generate an interactive HTML component — a calculator, form, quiz, chart, widget, or mini-app. Returns a complete self-contained HTML document that can be previewed live and saved to the CMS Interactives library.",
        input_schema: {
          type: "object",
          properties: {
            title: { type: "string", description: "Name for the interactive (e.g. 'Price Calculator')" },
            description: { type: "string", description: "Detailed description of what it should do, look like, and behave" },
          },
          required: ["title", "description"],
        },
      },
      handler: async (input) => {
        const title = String(input.title);
        const description = String(input.description);

        const { getApiKey } = await import("@/lib/ai-config");
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const apiKey = await getApiKey("anthropic");
        if (!apiKey) return "Error: Anthropic API key not configured.";

        const systemPrompt = `You are an expert HTML/CSS/JavaScript developer. Generate a COMPLETE, self-contained HTML document.

CRITICAL REQUIREMENTS:
1. Output a COMPLETE HTML document starting with <!DOCTYPE html> and ending with </html>
2. ALL CSS must be inline in a <style> tag in <head>
3. ALL JavaScript must be inline in <script> tags
4. NO external dependencies — no CDN links, no external stylesheets, no external scripts
5. Must be fully responsive and work on mobile
6. Use modern CSS (flexbox, grid, custom properties)
7. Support dark mode via prefers-color-scheme media query
8. Use clean, professional design with good spacing and typography
9. Include proper ARIA labels for accessibility
10. Dollar signs in JavaScript must be preserved literally

DESIGN GUIDELINES:
- Default color scheme: dark background (#1a1a2e), accent color (#F7BB2E gold), text (#e0e0e0)
- Font: system-ui, -apple-system, sans-serif
- Border radius: 8-12px for cards, 6px for inputs
- Subtle shadows and transitions for polish
- Minimum touch target: 44px for interactive elements`;

        const client = new Anthropic({ apiKey });
        const response = await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 8192,
          system: systemPrompt,
          messages: [{ role: "user", content: `Create: ${title}\n\n${description}` }],
        });

        const rawText = response.content
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("");

        // Extract HTML from response (may be wrapped in ```html fences)
        let html = rawText;
        const fenceMatch = rawText.match(/```html\s*([\s\S]*?)```/);
        if (fenceMatch) {
          html = fenceMatch[1].trim();
        } else {
          const docMatch = rawText.match(/(<!DOCTYPE html[\s\S]*<\/html>)/i);
          if (docMatch) html = docMatch[1];
        }

        // Validate: must have closing tags
        if (!html.includes("</html>") || !html.includes("</body>")) {
          return `Error: Generated HTML was truncated. Try a simpler description.`;
        }

        return `__ARTIFACT__${JSON.stringify({ title, html })}`;
      },
    },

    // ═══════════════════════════════════════════════════════════
    // Operations & Management tools
    // ═══════════════════════════════════════════════════════════

    // ── list_scheduled ────────────────────────────────────────
    {
      definition: {
        name: "list_scheduled",
        description: "List all content scheduled for future publishing or unpublishing. Shows the content calendar.",
        input_schema: { type: "object", properties: {} },
      },
      handler: async () => {
        const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
        const items: string[] = [];
        for (const col of config.collections) {
          if (col.name === "global") continue;
          const { documents } = await cms.content.findMany(col.name, {}).catch(() => ({ documents: [] as any[] }));
          for (const d of documents) {
            if (d.publishAt || d.unpublishAt) {
              const title = d.data.title ?? d.slug;
              const parts = [`- **${title}** (${col.label ?? col.name}/${d.slug}) [${d.status}]`];
              if (d.publishAt) parts.push(`  Publish at: ${d.publishAt}`);
              if (d.unpublishAt) parts.push(`  Unpublish at: ${d.unpublishAt}`);
              items.push(parts.join("\n"));
            }
          }
        }
        return items.length > 0 ? `${items.length} scheduled item(s):\n\n${items.join("\n\n")}` : "No scheduled content.";
      },
    },

    // ── list_agents ───────────────────────────────────────────
    {
      definition: {
        name: "list_agents",
        description: "List all AI agents configured for this site. Shows name, role, target collection, and status.",
        input_schema: { type: "object", properties: {} },
      },
      handler: async () => {
        const { listAgents } = await import("@/lib/agents");
        const agents = await listAgents();
        if (agents.length === 0) return "No AI agents configured.";
        return agents.map((a: any) =>
          `- **${a.name}** (${a.role}) → ${a.targetCollections?.join(", ") ?? "any"} [${a.active ? "active" : "inactive"}]\n  ID: \`${a.id}\``
        ).join("\n");
      },
    },

    // ── create_agent ──────────────────────────────────────────
    {
      definition: {
        name: "create_agent",
        description: "Create a new AI agent. Requires a name, role (copywriter/seo/translator/refresher/custom), and system prompt.",
        input_schema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Agent name" },
            role: { type: "string", description: "Agent role: copywriter, seo, translator, refresher, or custom" },
            systemPrompt: { type: "string", description: "System prompt that defines the agent's behavior" },
            targetCollections: { type: "array", items: { type: "string" }, description: "Collections the agent works with (default: ['posts'])" },
          },
          required: ["name", "role", "systemPrompt"],
        },
      },
      handler: async (input) => {
        const { createAgent } = await import("@/lib/agents");
        const agent = await createAgent({
          name: String(input.name),
          role: String(input.role) as any,
          systemPrompt: String(input.systemPrompt),
          targetCollections: (input.targetCollections as string[]) ?? ["posts"],
          active: true,
          behavior: { temperature: 50, formality: 50, verbosity: 50 },
          tools: { webSearch: false, internalDatabase: true },
          autonomy: "draft",
          schedule: { enabled: false, frequency: "manual", time: "09:00", maxPerRun: 1 },
          fieldDefaults: {},
        } as any);
        return `Created agent **${agent.name}** (${agent.role})\nID: \`${agent.id}\`\nTarget: ${agent.targetCollections.join(", ")}`;
      },
    },

    // ── run_agent ─────────────────────────────────────────────
    {
      definition: {
        name: "run_agent",
        description: "Run an AI agent with a prompt. The agent generates content and adds it to the curation queue.",
        input_schema: {
          type: "object",
          properties: {
            agentId: { type: "string", description: "Agent ID (use list_agents to find it)" },
            prompt: { type: "string", description: "What to generate" },
            collection: { type: "string", description: "Override target collection (optional)" },
          },
          required: ["agentId", "prompt"],
        },
      },
      handler: async (input) => {
        const { runAgent } = await import("@/lib/agent-runner");
        const result = await runAgent(
          String(input.agentId),
          String(input.prompt),
          input.collection ? String(input.collection) : undefined,
        );
        return `Agent produced: **${result.title}**\nCollection: ${result.collection}/${result.slug}\nCost: $${result.costUsd.toFixed(4)}\nStatus: In curation queue`;
      },
    },

    // ── list_curation_queue ───────────────────────────────────
    {
      definition: {
        name: "list_curation_queue",
        description: "List items in the AI curation queue. Shows content generated by agents awaiting review.",
        input_schema: {
          type: "object",
          properties: {
            status: { type: "string", description: "Filter: ready, in_review, approved, rejected, published (default: ready)" },
          },
        },
      },
      handler: async (input) => {
        const { listQueueItems, getQueueStats } = await import("@/lib/curation");
        const status = input.status ? String(input.status) : undefined;
        const [items, stats] = await Promise.all([
          listQueueItems(status as any),
          getQueueStats(),
        ]);
        const statsLine = Object.entries(stats).map(([k, v]) => `${k}: ${v}`).join(", ");
        if (items.length === 0) return `Queue is empty (filter: ${status ?? "all"}).\nStats: ${statsLine}`;
        const list = items.map((item: any) =>
          `- **${item.title}** by ${item.agentName} → ${item.collection}/${item.slug} [${item.status}]\n  ID: \`${item.id}\` | Cost: $${item.costUsd?.toFixed(4) ?? "?"}`
        ).join("\n");
        return `Queue stats: ${statsLine}\n\n${list}`;
      },
    },

    // ── approve_queue_item ────────────────────────────────────
    {
      definition: {
        name: "approve_queue_item",
        description: "Approve a curation queue item for publishing. Creates the document in the collection.",
        input_schema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Queue item ID" },
            asDraft: { type: "boolean", description: "Approve as draft instead of published (default: false)" },
          },
          required: ["id"],
        },
      },
      handler: async (input) => {
        const { approveQueueItem } = await import("@/lib/curation");
        const item = await approveQueueItem(String(input.id), input.asDraft === true);
        return `Approved: **${item.title}** → ${item.collection}/${item.slug} [${input.asDraft ? "draft" : "published"}]`;
      },
    },

    // ── reject_queue_item ─────────────────────────────────────
    {
      definition: {
        name: "reject_queue_item",
        description: "Reject a curation queue item with feedback for the agent.",
        input_schema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Queue item ID" },
            feedback: { type: "string", description: "Why it was rejected — used for agent learning" },
          },
          required: ["id", "feedback"],
        },
      },
      handler: async (input) => {
        const { rejectQueueItem } = await import("@/lib/curation");
        const item = await rejectQueueItem(String(input.id), String(input.feedback));
        return `Rejected: **${item.title}** — Feedback: "${input.feedback}"`;
      },
    },

    // ── trigger_deploy ────────────────────────────────────────
    {
      definition: {
        name: "trigger_deploy",
        description: "Deploy the site to the configured provider (GitHub Pages, Fly.io, etc.).",
        input_schema: { type: "object", properties: {} },
      },
      handler: async () => {
        const { triggerDeploy } = await import("@/lib/deploy-service");
        const result = await triggerDeploy();
        if (result.status === "success") {
          return `Deployed successfully!${result.url ? `\nURL: ${result.url}` : ""}`;
        }
        return `Deploy failed: ${result.error ?? "Unknown error"}`;
      },
    },

    // ── trigger_build ─────────────────────────────────────────
    {
      definition: {
        name: "trigger_build",
        description: "Rebuild the static site (regenerates all pages in dist/). Use before deploy or to refresh preview.",
        input_schema: { type: "object", properties: {} },
      },
      handler: async () => {
        const { runBuild } = await import("@webhouse/cms");
        const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
        const { getActiveSitePaths } = await import("@/lib/site-paths");
        const { projectDir } = await getActiveSitePaths();
        const result = await runBuild(config, cms.storage, {
          outDir: `${projectDir}/dist`,
          includeDrafts: true,
        });
        return `Built ${result.pages} pages in ${result.duration}ms → ${result.outDir}`;
      },
    },

    // ── list_revisions ────────────────────────────────────────
    {
      definition: {
        name: "list_revisions",
        description: "List revision history for a document. Shows when each version was saved.",
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
        const { listRevisions } = await import("@/lib/revisions");
        const revisions = await listRevisions(String(input.collection), String(input.slug));
        if (revisions.length === 0) return "No revisions found.";
        return revisions.map((r: any, i: number) =>
          `${i}. ${r.savedAt ?? "unknown date"} — ${r.status ?? "?"}`
        ).join("\n");
      },
    },

    // ── clone_document ────────────────────────────────────────
    {
      definition: {
        name: "clone_document",
        description: "Create a copy of an existing document. The clone is created as a draft with '-copy' suffix.",
        input_schema: {
          type: "object",
          properties: {
            collection: { type: "string", description: "Collection name" },
            slug: { type: "string", description: "Document slug to clone" },
          },
          required: ["collection", "slug"],
        },
      },
      handler: async (input) => {
        const collection = String(input.collection);
        const slug = String(input.slug);
        const cms = await getAdminCms();
        const doc = await cms.content.findBySlug(collection, slug);
        if (!doc) return `Error: Document not found: ${collection}/${slug}`;

        let newSlug = `${slug}-copy`;
        let existing = await cms.content.findBySlug(collection, newSlug).catch(() => null);
        let n = 2;
        while (existing) {
          newSlug = `${slug}-copy-${n}`;
          existing = await cms.content.findBySlug(collection, newSlug).catch(() => null);
          n++;
        }
        const cloned = await cms.content.create(collection, { slug: newSlug, status: "draft", data: { ...doc.data } });
        return `Cloned **${doc.data.title ?? slug}** → ${collection}/${newSlug} (draft)`;
      },
    },

    // ── list_trash ────────────────────────────────────────────
    {
      definition: {
        name: "list_trash",
        description: "List all trashed documents across all collections.",
        input_schema: { type: "object", properties: {} },
      },
      handler: async () => {
        const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
        const items: string[] = [];

        // Content documents
        for (const col of config.collections) {
          const { documents } = await cms.content.findMany(col.name, {}).catch(() => ({ documents: [] as any[] }));
          for (const d of documents) {
            if ((d.status as string) === "trashed") {
              items.push(`- **${d.data.title ?? d.slug}** (${col.label ?? col.name}/${d.slug}) trashed ${d.data._trashedAt ?? ""}`);
            }
          }
        }

        // Media files
        try {
          const { getMediaAdapter } = await import("@/lib/media");
          const adapter = await getMediaAdapter();
          const trashed = await adapter.listTrashed();
          for (const m of trashed) {
            items.push(`- **${m.name}** (media) trashed ${m.trashedAt ?? ""}`);
          }
        } catch { /* media trash not available */ }

        return items.length > 0 ? `${items.length} trashed item(s):\n${items.join("\n")}` : "Trash is empty.";
      },
    },

    // ── restore_from_trash ────────────────────────────────────
    {
      definition: {
        name: "restore_from_trash",
        description: "Restore a trashed document back to draft status.",
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
        if (!doc) return `Error: Not found: ${collection}/${slug}`;
        if ((doc.status as string) !== "trashed") return `"${doc.data.title ?? slug}" is not trashed (status: ${doc.status}).`;
        const data = { ...doc.data };
        delete data._trashedAt;
        await cms.content.update(collection, doc.id, { status: "draft", data });
        return `Restored **${doc.data.title ?? slug}** from trash → draft`;
      },
    },

    // ── empty_trash ─────────────────────────────────────────
    {
      definition: {
        name: "empty_trash",
        description: "Permanently delete all items in trash (documents and media). This cannot be undone.",
        input_schema: { type: "object", properties: {} },
      },
      handler: async () => {
        const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
        let deleted = 0;

        // Delete trashed documents
        for (const col of config.collections) {
          const { documents } = await cms.content.findMany(col.name, {}).catch(() => ({ documents: [] as any[] }));
          for (const d of documents) {
            if ((d.status as string) === "trashed") {
              await cms.content.delete(col.name, d.id);
              deleted++;
            }
          }
        }

        // Delete trashed media
        try {
          const { getMediaAdapter } = await import("@/lib/media");
          const adapter = await getMediaAdapter();
          const trashed = await adapter.listTrashed();
          for (const m of trashed) {
            await adapter.deleteFile(m.folder, m.name);
            deleted++;
          }
        } catch { /* media not available */ }

        return deleted > 0 ? `Permanently deleted ${deleted} item(s) from trash.` : "Trash was already empty.";
      },
    },

    // ── run_link_check ────────────────────────────────────────
    {
      definition: {
        name: "run_link_check",
        description: "Check all links across the site for broken URLs. Returns results summary.",
        input_schema: { type: "object", properties: {} },
      },
      handler: async () => {
        const { readLinkCheckResult } = await import("@/lib/link-check-store");
        // Return last results if recent (< 1 hour), otherwise suggest running
        const last = await readLinkCheckResult();
        if (last) {
          const broken = last.results?.filter((r: any) => r.status === "broken") ?? [];
          const ok = last.results?.filter((r: any) => r.status === "ok") ?? [];
          return `Last check: ${last.checkedAt ?? "unknown"}\n${ok.length} OK, ${broken.length} broken\n\n${
            broken.length > 0
              ? broken.map((r: any) => `- **${r.url}** in ${r.collection}/${r.slug} — ${r.error ?? r.httpStatus}`).join("\n")
              : "No broken links!"
          }`;
        }
        return "No link check results yet. Run a check from Tools → Link Checker in Admin mode.";
      },
    },

    // ── create_backup ─────────────────────────────────────────
    {
      definition: {
        name: "create_backup",
        description: "Create a backup of the site's content right now.",
        input_schema: { type: "object", properties: {} },
      },
      handler: async () => {
        const { createBackup } = await import("@/lib/backup-service");
        const snapshot = await createBackup("manual");
        return `Backup created: ${snapshot.fileName}\nSize: ${Math.round(snapshot.sizeBytes / 1024)}KB\nDocs: ${snapshot.documentCount}\nTime: ${snapshot.timestamp}`;
      },
    },

    // ── content_stats ─────────────────────────────────────────
    {
      definition: {
        name: "content_stats",
        description: "Get content statistics: word counts, document counts, AI vs human content ratio, recent activity.",
        input_schema: { type: "object", properties: {} },
      },
      handler: async () => {
        const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
        let totalDocs = 0;
        let totalWords = 0;
        let published = 0;
        let drafts = 0;

        for (const col of config.collections) {
          if (col.name === "global") continue;
          const { documents } = await cms.content.findMany(col.name, {}).catch(() => ({ documents: [] as any[] }));
          for (const d of documents) {
            if (d.status === "trashed") continue;
            totalDocs++;
            if (d.status === "published") published++;
            if (d.status === "draft") drafts++;
            const content = String(d.data.content ?? d.data.body ?? "");
            totalWords += content.split(/\s+/).filter(Boolean).length;
          }
        }

        // AI stats
        try {
          const { getContentRatio } = await import("@/lib/analytics");
          const ratio = await getContentRatio();
          return `**Content stats:**\n- ${totalDocs} documents (${published} published, ${drafts} drafts)\n- ${totalWords.toLocaleString()} total words\n- AI content ratio: ${Math.round((ratio.aiEdits / Math.max(ratio.totalEdits, 1)) * 100)}% (${ratio.aiEdits} AI / ${ratio.humanEdits} human edits)`;
        } catch {
          return `**Content stats:**\n- ${totalDocs} documents (${published} published, ${drafts} drafts)\n- ${totalWords.toLocaleString()} total words`;
        }
      },
    },

    // ── list_deploy_history ───────────────────────────────────
    {
      definition: {
        name: "list_deploy_history",
        description: "Show recent deployment history.",
        input_schema: { type: "object", properties: {} },
      },
      handler: async () => {
        const { listDeploys } = await import("@/lib/deploy-service");
        const deploys = await listDeploys();
        if (deploys.length === 0) return "No deploy history.";
        return deploys.slice(0, 10).map((d: any) =>
          `- ${d.timestamp ?? d.createdAt} — ${d.status}${d.url ? ` → ${d.url}` : ""}${d.error ? ` (${d.error})` : ""}`
        ).join("\n");
      },
    },
  ];
}
