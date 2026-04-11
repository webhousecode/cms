import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { readSiteConfig } from "@/lib/site-config";
import { loadRegistry, findSite } from "@/lib/site-registry";
import { saveRevision } from "@/lib/revisions";
import { buildLocaleInstruction, getSeoLimits } from "@/lib/ai/locale-prompt";
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

        // Build page path — locale prefix + category
        const col = config.collections.find((c) => c.name === collection);
        const { readSiteConfig: readSC2 } = await import("@/lib/site-config");
        const sc2 = await readSC2();
        const docLoc = (doc as any).locale || sc2.defaultLocale || "en";
        const defLoc = sc2.defaultLocale || "en";
        const localeStrategy = sc2.localeStrategy || "prefix-other";
        // Locale prefix: "prefix-other" = default locale has no prefix, others get /{locale}
        const locPrefix = (localeStrategy === "prefix-all" || docLoc !== defLoc) ? `/${docLoc}` : "";

        const urlPrefix = col?.urlPrefix ?? `/${collection}`;
        const cleanPrefix = urlPrefix.endsWith("/") ? urlPrefix.slice(0, -1) : urlPrefix;
        // If collection has a "category" select field, insert its value into the path
        const categoryField = col?.fields.find(f => f.name === "category" && f.type === "select");
        const categoryValue = categoryField ? String(doc.data.category ?? "") : "";
        const pagePath = categoryValue
          ? `${locPrefix}${cleanPrefix}/${categoryValue}/${slug}/`
          : `${locPrefix}${cleanPrefix}/${slug}/`;

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
          "Search across ALL content on the site — documents, pages, AND media files (by AI tags, user tags, captions, filenames). Returns matching documents and media with their details.",
        input_schema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query — matches document text, tags, media tags, AI captions, filenames" },
            limit: { type: "number", description: "Max results (default: 20)" },
          },
          required: ["query"],
        },
      },
      handler: async (input) => {
        const query = String(input.query);
        const q = query.toLowerCase();
        const limit = Math.min(Number(input.limit ?? 20), 50);

        // 1. Search documents
        const cms = await getAdminCms();
        const docResults = await cms.content.search(query, { limit });
        const parts: string[] = [];

        if (docResults.length > 0) {
          parts.push("**Documents:**");
          for (const r of docResults as any[]) {
            parts.push(`- "${r.title}" (${r.collectionLabel}) ${r.url} — ${r.excerpt ?? ""}`);
          }
        }

        // 2. Search media (tags, captions, filenames)
        try {
          const { readMediaMeta } = await import("@/lib/media/media-meta");
          const { getMediaAdapter } = await import("@/lib/media");
          const [files, meta] = await Promise.all([
            getMediaAdapter().then((a) => a.listMedia()),
            readMediaMeta(),
          ]);
          const metaMap = new Map(meta.map((m) => [m.key, m]));

          const mediaHits = files
            .filter((f) => !/-\d+w\.webp$/i.test(f.name))
            .map((f) => {
              const key = f.folder ? `${f.folder}/${f.name}` : f.name;
              const m = metaMap.get(key);
              let score = 0;
              if (f.name.toLowerCase().includes(q)) score += 3;
              if (m?.aiCaption?.toLowerCase().includes(q)) score += 5;
              if (m?.aiAlt?.toLowerCase().includes(q)) score += 4;
              if (m?.aiTags?.some((t) => t.toLowerCase().includes(q))) score += 4;
              if (m?.tags?.some((t) => t.toLowerCase().includes(q))) score += 6; // user tags high priority
              return { file: f, meta: m, score };
            })
            .filter((s) => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);

          if (mediaHits.length > 0) {
            parts.push("\n**Media files:**");
            for (const { file: f, meta: m } of mediaHits) {
              const tags = [...(m?.tags ?? []), ...(m?.aiTags ?? [])].join(", ");
              const caption = m?.aiCaption ?? "";
              parts.push(`- **${f.name}** (${f.mediaType}) URL: ${f.url}${tags ? ` Tags: ${tags}` : ""}${caption ? ` Caption: ${caption}` : ""}`);
              // Show image inline in chat
              if (f.mediaType === "image") {
                const safeImgAlt = (m?.aiAlt ?? f.name).replace(/[\[\]()]/g, "").replace(/\n/g, " ").slice(0, 100);
                parts.push(`\n![${safeImgAlt}](${f.url})`);
              }
            }
          }
        } catch { /* media search failed — non-fatal */ }

        if (parts.length === 0) return `No results for "${query}".`;
        return parts.join("\n");
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
          const lbl = f.label && f.label !== f.name ? ` — ${f.label}` : "";
          const parts = [`\`${f.name}\` (${f.type})${lbl}`];
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
            if (m?.exif) {
              const e = m.exif;
              if (e.gpsLat != null && e.gpsLon != null) parts.push(`  GPS: ${e.gpsLat.toFixed(5)}, ${e.gpsLon.toFixed(5)}`);
              if (e.date) parts.push(`  Date taken: ${e.date}`);
              if (e.make || e.model) parts.push(`  Camera: ${[e.make, e.model].filter(Boolean).join(" ")}`);
            }
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
            locale: { type: "string", description: "Locale for alt-text/captions (e.g. 'en', 'da'). Defaults to site default locale." },
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

        // Resolve document locale for locale-aware alt/caption
        const { readSiteConfig: readSC } = await import("@/lib/site-config");
        const sc = await readSC();
        const contentLocale = String(input.locale ?? sc.defaultLocale ?? "en");

        // Score each file by relevance
        const scored = files
          .filter((f) => !/-\d+w\.webp$/i.test(f.name))
          .filter((f) => typeFilter === "all" || f.mediaType === typeFilter)
          .map((f) => {
            const key = f.folder ? `${f.folder}/${f.name}` : f.name;
            const m = metaMap.get(key);
            let score = 0;

            // Match against various fields (legacy + per-locale)
            if (f.name.toLowerCase().includes(query)) score += 3;
            if (m?.aiCaption?.toLowerCase().includes(query)) score += 5;
            if (m?.aiAlt?.toLowerCase().includes(query)) score += 4;
            // Per-locale captions/alts
            const mAny = m as any;
            if (mAny?.aiCaptions) {
              for (const v of Object.values(mAny.aiCaptions) as string[]) {
                if (v?.toLowerCase().includes(query)) { score += 5; break; }
              }
            }
            if (mAny?.aiAlts) {
              for (const v of Object.values(mAny.aiAlts) as string[]) {
                if (v?.toLowerCase().includes(query)) { score += 4; break; }
              }
            }
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
            const mAny = m as any;
            const parts = [`- **${f.name}** (${f.mediaType})`];
            parts.push(`  URL: ${f.url}`);
            // Use locale-specific alt/caption, fall back to legacy
            const caption = mAny?.aiCaptions?.[contentLocale] ?? m?.aiCaption;
            const alt = mAny?.aiAlts?.[contentLocale] ?? m?.aiAlt;
            if (caption) parts.push(`  Caption: ${caption}`);
            if (alt) parts.push(`  Alt: ${alt}`);
            // Show image inline in chat + provide copyable markdown
            const safeAlt = (alt ?? f.name).replace(/[\[\]()]/g, "").replace(/\n/g, " ").slice(0, 100);
            if (f.mediaType === "image") parts.push(`\n![${safeAlt}](${f.url})`);
            parts.push(`  Markdown: \`![${safeAlt}](${f.url})\``);
            if (m?.tags?.length) parts.push(`  User tags: ${m.tags.join(", ")}`);
            if (m?.aiTags?.length) parts.push(`  AI tags: ${m.aiTags.join(", ")}`);
            if (m?.exif) {
              const e = m.exif;
              if (e.gpsLat != null && e.gpsLon != null) parts.push(`  GPS: ${e.gpsLat.toFixed(5)}, ${e.gpsLon.toFixed(5)}`);
              if (e.date) parts.push(`  Date taken: ${e.date}`);
            }
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
            locale: { type: "string", description: "Document locale (e.g. 'en', 'da', 'de'). Defaults to site default locale. Set this when creating content in a specific language." },
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

        // F127 — block form collections from being created via AI
        const colKind = (col as any).kind as string | undefined;
        if (colKind === "form") {
          return `Error: Collection "${collection}" is a form collection (kind: form). Form submissions are read-only from AI — they are created by end users via frontend forms, not via chat.`;
        }

        // Validate and fix field names — AI sometimes uses labels or common aliases
        const schemaFields = new Set(col.fields.map((f) => f.name));
        const labelToName = new Map<string, string>();
        for (const f of col.fields) {
          // Map common aliases: label words joined → field name
          if (f.label) {
            const camel = f.label.replace(/\s+(.)/g, (_, c) => c.toUpperCase()).replace(/^\w/, (c) => c.toLowerCase());
            labelToName.set(camel, f.name);
            labelToName.set(f.label.toLowerCase().replace(/\s+/g, ""), f.name);
          }
        }
        // Also map common field aliases — but NOT for data/form/global kinds where
        // the schema is usually explicit and aliases cause more harm than good (F127)
        const remapBodyContent = colKind !== "data" && colKind !== "form" && colKind !== "global";
        for (const f of col.fields) {
          if (f.type === "richtext" && remapBodyContent) {
            if (!schemaFields.has("body")) labelToName.set("body", f.name);
            if (!schemaFields.has("content")) labelToName.set("content", f.name);
          }
          if (f.type === "date") {
            if (!schemaFields.has("publishDate")) labelToName.set("publishDate", f.name);
            if (!schemaFields.has("publishdate")) labelToName.set("publishdate", f.name);
          }
        }

        // Remap unknown fields to schema field names
        const cleanData: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(data)) {
          if (key.startsWith("_")) { cleanData[key] = value; continue; } // preserve meta fields
          if (key === "status" || key === "slug" || key === "id" || key === "collection") continue; // reserved doc-level fields
          if (schemaFields.has(key)) {
            cleanData[key] = value;
          } else {
            const mapped = labelToName.get(key);
            if (mapped && !(mapped in cleanData)) {
              cleanData[mapped] = value;
            }
            // Drop truly unknown fields silently
          }
        }

        // Check slug doesn't already exist
        const existing = await cms.content.findBySlug(collection, slug).catch(() => null);
        if (existing) return `Error: Document with slug "${slug}" already exists in ${collection}.`;

        // Set locale — explicit from AI, or fall back to site default
        const { readSiteConfig } = await import("@/lib/site-config");
        const siteConfig = await readSiteConfig();
        const docLocale = input.locale ? String(input.locale) : (siteConfig.defaultLocale || "en");

        const doc = await cms.content.create(collection, {
          slug,
          data: cleanData,
          status: "draft",
          locale: docLocale,
        });

        // Auto-generate _seo with AI (non-blocking — update after creation)
        // F127 — skip SEO generation for non-page kinds; they have no indexable URL
        const needsSeo = (colKind ?? "page") === "page" && (col as any).previewable !== false;
        try {
          const docTitle = String(data.title ?? data.name ?? "");
          const docContent = String(data.content ?? data.body ?? "").slice(0, 2000);
          if (needsSeo && docTitle) {
            const { getApiKey: getKey } = await import("@/lib/ai-config");
            const Anthropic = (await import("@anthropic-ai/sdk")).default;
            const seoApiKey = await getKey("anthropic");
            if (seoApiKey) {
              const { getModel } = await import("@/lib/ai/model-resolver");
              const seoModel = await getModel("content");
              const seoClient = new Anthropic({ apiKey: seoApiKey });
              const seoLocale = docLocale || siteConfig.defaultLocale || "en";
              const seoLimits = getSeoLimits(seoLocale);
              const seoLocaleInstr = buildLocaleInstruction(seoLocale);
              const seoRes = await seoClient.messages.create({
                model: seoModel,
                max_tokens: 512,
                system: `${seoLocaleInstr}\nYou generate SEO metadata. Return ONLY a JSON object, no explanation.`,
                messages: [{ role: "user", content: `Generate SEO for this page:\nTitle: ${docTitle}\nContent: ${docContent}\n\nReturn JSON:\n{\n  "metaTitle": "SEO title (${seoLimits.titleMin}-${seoLimits.titleMax} chars)",\n  "metaDescription": "description (${seoLimits.descMin}-${seoLimits.descMax} chars)",\n  "keywords": ["kw1", "kw2", "kw3", "kw4", "kw5"]\n}` }],
              });
              const raw = (seoRes.content[0] as { text: string }).text.trim();
              const parsed = JSON.parse(raw.replace(/^```json?\n?/, "").replace(/\n?```$/, ""));

              // Auto-extract OG image from content or image fields
              const rawContent = String(data.content ?? data.body ?? "");
              const fieldImg = String(data.heroImage ?? data.coverImage ?? data.image ?? "");
              let ogImage = "";
              if (fieldImg && fieldImg.startsWith("/uploads/")) {
                ogImage = fieldImg;
              } else {
                const mdMatch = rawContent.match(/!\[[^\]]*\]\((\/uploads\/[^\s"]+)/);
                if (mdMatch) ogImage = mdMatch[1];
              }

              // Calculate SEO score
              const { calculateSeoScore } = await import("@/lib/seo/score");
              const seoFields = {
                metaTitle: parsed.metaTitle,
                metaDescription: parsed.metaDescription,
                keywords: parsed.keywords,
                ...(ogImage ? { ogImage } : {}),
                robots: "index,follow",
              };
              const { score, details } = calculateSeoScore({ slug, data }, seoFields);

              // Auto-generate OG image if source image available
              let generatedOgImage = ogImage;
              if (ogImage) {
                try {
                  const { generateOgImage } = await import("@/lib/seo/og-image");
                  const ogUrl = await generateOgImage(ogImage, parsed.metaTitle || docTitle, slug);
                  if (ogUrl) generatedOgImage = ogUrl;
                } catch { /* non-fatal */ }
              }

              const seoData = {
                metaTitle: parsed.metaTitle,
                metaDescription: parsed.metaDescription,
                keywords: parsed.keywords,
                ogImage: generatedOgImage || undefined,
                robots: "index,follow",
                score,
                scoreDetails: details,
                lastOptimized: new Date().toISOString(),
              };
              await cms.content.update(collection, doc.id, {
                data: { ...data, _seo: seoData },
              });
            }
          }
        } catch { /* SEO generation failed — non-fatal */ }

        // Auto-translate to all other configured locales (F48 i18n)
        const translatedSlugs: string[] = [];
        try {
          const targetLocales = (siteConfig.locales || []).filter((l: string) => l !== (siteConfig.defaultLocale || "en"));
          if (targetLocales.length > 0 && col.translatable !== false && siteConfig.autoRetranslateOnUpdate) {
            // Set locale on source doc
            const { generateId } = await import("@webhouse/cms");
            const translationGroupId = generateId();
            await cms.content.update(collection, doc.id, { locale: docLocale, translationGroup: translationGroupId });

            const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3010}`;
            const serviceToken = process.env.CMS_JWT_SECRET;
            for (const targetLocale of targetLocales) {
              try {
                const res = await fetch(`${baseUrl}/api/cms/${collection}/${doc.slug}/translate`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "x-cms-service-token": serviceToken || "" },
                  body: JSON.stringify({ targetLocale, publish: false }),
                });
                if (res.ok) {
                  const result = await res.json();
                  translatedSlugs.push(`${targetLocale}: ${result.slug}`);
                }
              } catch { /* non-fatal */ }
            }
          }
        } catch { /* translation failed — non-fatal */ }

        const translationInfo = translatedSlugs.length > 0
          ? `\nTranslations: ${translatedSlugs.join(", ")}`
          : "";
        // F127 — only mention SEO when it was actually generated
        const seoInfo = needsSeo ? "\nSEO: auto-optimized with AI." : "";
        return `Created "${data.title ?? slug}" in ${collection} (draft).\nSlug: ${doc.slug}\nStatus: draft${seoInfo}${translationInfo}`;
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

    // ── build_site ─────────────────────────────────────────────
    {
      definition: {
        name: "build_site",
        description:
          "Build/rebuild the static site so changes are visible in preview. Call this ONCE after you finish creating, updating, publishing, or deleting documents — not after every single document. Includes drafts with a DRAFT banner.",
        input_schema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      handler: async () => {
        try {
          const { getActiveSitePaths } = await import("@/lib/site-paths");
          const { getAdminCms, getAdminConfig } = await import("@/lib/cms");
          const { existsSync } = await import("node:fs");
          const path = await import("node:path");
          const sitePaths = await getActiveSitePaths();
          const projectDir = sitePaths.projectDir;

          // Strategy 1: custom build.ts
          const buildFile = path.join(projectDir, "build.ts");
          if (existsSync(buildFile)) {
            const { execSync } = await import("node:child_process");
            execSync("npx tsx build.ts", {
              cwd: projectDir,
              timeout: 30000,
              env: { ...process.env, NODE_ENV: "production", BASE_PATH: "", INCLUDE_DRAFTS: "true" },
              stdio: "pipe",
            });
            return "Site built successfully. Changes are now visible in preview.";
          }

          // Strategy 2: use CMS runBuild directly
          const { runBuild } = await import("@webhouse/cms");
          const cms = await getAdminCms();
          const config = await getAdminConfig();
          const distDir = path.join(projectDir, "dist");
          const result = await runBuild(config, cms.storage, {
            outDir: distDir,
            includeDrafts: true,
          });
          return `Site built successfully — ${result.pages} pages. Changes are now visible in preview.`;
        } catch (err) {
          return `Build failed: ${err instanceof Error ? err.message : "unknown error"}`;
        }
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

        const { getModel: getM } = await import("@/lib/ai/model-resolver");
        const genModel = await getM("code");
        const genLocaleConfig = await readSiteConfig();
        const genLocale = genLocaleConfig.defaultLocale || "en";
        const genLocaleInstr = buildLocaleInstruction(genLocale);
        const response = await client.messages.create({
          model: genModel,
          max_tokens: 2048,
          system: `${genLocaleInstr}\nYou are a content writer. Generate content for the "${fieldDef?.label ?? field}" field. ${constraint}\nExisting document: ${JSON.stringify(doc.data, null, 2)}`,
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

        const { getModel: getM2 } = await import("@/lib/ai/model-resolver");
        const rwModel = await getM2("code");
        const rwLocaleConfig = await readSiteConfig();
        const rwLocale = rwLocaleConfig.defaultLocale || "en";
        const rwLocaleInstr = buildLocaleInstruction(rwLocale);
        const client = new Anthropic({ apiKey });
        const response = await client.messages.create({
          model: rwModel,
          max_tokens: 2048,
          system: `${rwLocaleInstr}\nYou are a content rewriter. Output ONLY the rewritten content. No preamble, no explanation.`,
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

        const { getModel: getM3 } = await import("@/lib/ai/model-resolver");
        const intModel = await getM3("code");
        const client = new Anthropic({ apiKey });
        const response = await client.messages.create({
          model: intModel,
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
        const cloned = await cms.content.create(collection, { slug: newSlug, status: "draft", data: { ...doc.data }, ...(doc.locale ? { locale: doc.locale } : {}) });
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

    // ═══════════════════════════════════════════════════════════
    // Phase 4: Bulk & Workflow tools
    // ═══════════════════════════════════════════════════════════

    // ── bulk_publish ─────────────────────────────────────────
    {
      definition: {
        name: "bulk_publish",
        description:
          "Publish multiple draft documents at once. Can target a specific collection or all collections. Returns a list of what was published.",
        input_schema: {
          type: "object",
          properties: {
            collection: { type: "string", description: "Collection name to publish drafts from. If omitted, publishes drafts across ALL collections." },
          },
        },
      },
      handler: async (input) => {
        const targetCollection = input.collection ? String(input.collection) : null;
        const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
        const published: string[] = [];

        const collections = targetCollection
          ? config.collections.filter((c) => c.name === targetCollection)
          : config.collections.filter((c) => c.name !== "global");

        if (targetCollection && collections.length === 0) {
          return `Error: Collection "${targetCollection}" not found.`;
        }

        for (const col of collections) {
          const { documents } = await cms.content.findMany(col.name, {}).catch(() => ({ documents: [] as any[] }));
          const drafts = documents.filter((d: any) => d.status === "draft");
          for (const d of drafts) {
            await saveRevision(col.name, d).catch(() => {});
            await cms.content.update(col.name, d.id, { status: "published" });
            published.push(`${col.label ?? col.name}/${d.slug} — "${d.data.title ?? d.slug}"`);
          }
        }

        if (published.length === 0) {
          return targetCollection
            ? `No drafts to publish in ${targetCollection}.`
            : "No drafts to publish anywhere.";
        }
        return `Published ${published.length} document(s):\n${published.map((p) => `- ${p}`).join("\n")}`;
      },
    },

    // ── bulk_update ──────────────────────────────────────────
    {
      definition: {
        name: "bulk_update",
        description:
          "Update a field on multiple documents in a collection. Useful for adding tags, changing a category, or setting a value across many documents. Supports 'append' mode for array fields (tags) to add values without replacing existing ones.",
        input_schema: {
          type: "object",
          properties: {
            collection: { type: "string", description: "Collection name" },
            field: { type: "string", description: "Field name to update (e.g. 'tags', 'category', 'author')" },
            value: { description: "New value for the field. For tags with mode 'append', this should be an array of strings to add." },
            mode: { type: "string", description: "'set' replaces the field value (default), 'append' adds to array fields (like tags)" },
            filter: {
              type: "object",
              description: "Optional filter. { status: 'published' } to only update published docs. { slug: ['a','b'] } to target specific slugs.",
              properties: {
                status: { type: "string", description: "Filter by status: published, draft" },
                slugs: { type: "array", items: { type: "string" }, description: "Only update these specific slugs" },
              },
            },
          },
          required: ["collection", "field", "value"],
        },
      },
      handler: async (input) => {
        const collection = String(input.collection);
        const field = String(input.field);
        const value = input.value;
        const mode = String(input.mode ?? "set");
        const filter = (input.filter ?? {}) as { status?: string; slugs?: string[] };

        const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
        const col = config.collections.find((c) => c.name === collection);
        if (!col) return `Error: Collection "${collection}" not found.`;

        // Verify the field exists in schema
        const fieldDef = (col.fields ?? []).find((f: any) => f.name === field);
        if (!fieldDef) return `Error: Field "${field}" not found in ${collection} schema. Use get_schema to check available fields.`;

        const { documents } = await cms.content.findMany(collection, {}).catch(() => ({ documents: [] as any[] }));
        let targets = documents.filter((d: any) => d.status !== "trashed");

        if (filter.status) {
          targets = targets.filter((d: any) => d.status === filter.status);
        }
        if (filter.slugs?.length) {
          const slugSet = new Set(filter.slugs);
          targets = targets.filter((d: any) => slugSet.has(d.slug));
        }

        if (targets.length === 0) return `No documents match the filter in ${collection}.`;

        const updated: string[] = [];
        for (const d of targets) {
          await saveRevision(collection, d).catch(() => {});
          let newValue = value;
          if (mode === "append" && Array.isArray(value)) {
            const existing = Array.isArray(d.data[field]) ? d.data[field] : [];
            const combined = [...existing, ...value.filter((v: any) => !existing.includes(v))];
            newValue = combined;
          }
          await cms.content.update(collection, d.id, {
            data: { ...d.data, [field]: newValue },
          });
          updated.push(`${d.slug} — "${d.data.title ?? d.slug}"`);
        }

        return `Updated "${field}" on ${updated.length} document(s) in ${collection} (mode: ${mode}):\n${updated.map((u) => `- ${u}`).join("\n")}`;
      },
    },

    // ── schedule_publish ─────────────────────────────────────
    {
      definition: {
        name: "schedule_publish",
        description:
          "Schedule a document for future publishing or unpublishing. The scheduler runs every 60 seconds and will automatically change the status when the time comes. Dates should be ISO 8601 format (e.g. '2026-03-29T09:00:00').",
        input_schema: {
          type: "object",
          properties: {
            collection: { type: "string", description: "Collection name" },
            slug: { type: "string", description: "Document slug" },
            publishAt: { type: "string", description: "ISO 8601 datetime to publish (e.g. '2026-03-29T09:00:00'). Set to null to clear." },
            unpublishAt: { type: "string", description: "ISO 8601 datetime to unpublish (e.g. '2026-04-15T00:00:00'). Set to null to clear." },
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

        const update: Record<string, unknown> = {};
        if (input.publishAt !== undefined) {
          update.publishAt = input.publishAt === "null" || input.publishAt === null ? null : String(input.publishAt);
        }
        if (input.unpublishAt !== undefined) {
          update.unpublishAt = input.unpublishAt === "null" || input.unpublishAt === null ? null : String(input.unpublishAt);
        }

        if (Object.keys(update).length === 0) {
          return `Error: Provide publishAt and/or unpublishAt.`;
        }

        await saveRevision(collection, doc).catch(() => {});
        await cms.content.update(collection, doc.id, update);

        const parts = [`Scheduled "${doc.data.title ?? slug}" in ${collection}:`];
        if (update.publishAt) parts.push(`  Publish at: ${update.publishAt}`);
        if (update.publishAt === null) parts.push(`  Cleared publish schedule`);
        if (update.unpublishAt) parts.push(`  Unpublish at: ${update.unpublishAt}`);
        if (update.unpublishAt === null) parts.push(`  Cleared unpublish schedule`);
        return parts.join("\n");
      },
    },

    // ── translate_document ─────────────────────────────────────
    {
      definition: {
        name: "translate_document",
        description: "Translate a document to another language using AI. Creates a new translated document linked to the original.",
        input_schema: {
          type: "object" as const,
          properties: {
            collection: { type: "string", description: "Collection name" },
            slug: { type: "string", description: "Source document slug" },
            targetLocale: { type: "string", description: "Target locale code (e.g. 'en', 'da', 'de')" },
            publish: { type: "boolean", description: "Publish immediately (default: false, creates as draft)" },
          },
          required: ["collection", "slug", "targetLocale"],
        },
      },
      handler: async (input: any) => {
        const { collection, slug, targetLocale, publish } = input;
        const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3010}`;
        const serviceToken = process.env.CMS_JWT_SECRET ?? "";
        const res = await fetch(`${baseUrl}/api/cms/${collection}/${slug}/translate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-cms-service-token": serviceToken },
          body: JSON.stringify({ targetLocale, publish: publish ?? false }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Translation failed" }));
          return JSON.stringify({ error: err.error ?? "Translation failed" });
        }
        const result = await res.json();
        return JSON.stringify({ success: true, ...result });
      },
    },

    // ── translate_site ─────────────────────────────────────────
    {
      definition: {
        name: "translate_site",
        description: "Translate ALL untranslated documents on the site to a target language. Creates draft translations for review.",
        input_schema: {
          type: "object" as const,
          properties: {
            targetLocale: { type: "string", description: "Target locale code (e.g. 'en', 'da', 'de')" },
            publish: { type: "boolean", description: "Publish translations immediately (default: false)" },
          },
          required: ["targetLocale"],
        },
      },
      handler: async (input: any) => {
        const { targetLocale, publish } = input;
        const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3010}`;
        const serviceToken = process.env.CMS_JWT_SECRET ?? "";
        const res = await fetch(`${baseUrl}/api/admin/translate-bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-cms-service-token": serviceToken },
          body: JSON.stringify({ targetLocale, publish: publish ?? false }),
        });
        if (!res.ok) {
          return JSON.stringify({ error: "Bulk translation failed" });
        }
        // Read NDJSON stream
        const text = await res.text();
        const lines = text.trim().split("\n").map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        const results = lines.filter((l: any) => l.type === "result");
        const errors = lines.filter((l: any) => l.type === "error");
        const done = lines.find((l: any) => l.type === "done");
        return JSON.stringify({
          success: true,
          translated: results.length,
          errors: errors.length,
          total: done?.total ?? 0,
          details: results.map((r: any) => `${r.collection}/${r.slug}`),
          errorDetails: errors.map((e: any) => `${e.collection}/${e.slug}: ${e.error}`),
        });
      },
    },

    // ── Lighthouse (F98) ─────────────────────────────────────────
    {
      definition: {
        name: "get_lighthouse_history",
        description:
          "Get Lighthouse score history over time. Shows how performance, accessibility, SEO, and best practices scores have changed across scans. Useful for tracking improvements.",
        input_schema: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Max entries to show. Default: 10." },
          },
        },
      },
      handler: async (input) => {
        const { getHistory } = await import("@/lib/lighthouse/history");
        const history = await getHistory();
        if (history.length === 0) return "No Lighthouse scan history yet. I can run a scan for you — just say the word.";

        const limit = Math.min(Number(input.limit ?? 10), 50);
        const recent = history.slice(-limit);

        const lines = [`**Lighthouse score history** (${history.length} total scans, showing last ${recent.length}):`, ""];

        // Group by date for cleaner output
        for (const entry of recent) {
          const date = new Date(entry.timestamp).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
          const s = entry.scores;
          lines.push(`- **${date}** (${entry.strategy}) — Perf: ${s.performance} | A11y: ${s.accessibility} | SEO: ${s.seo} | BP: ${s.bestPractices}`);
        }

        // Trend analysis
        const mobileScans = recent.filter((e) => e.strategy === "mobile");
        const desktopScans = recent.filter((e) => e.strategy === "desktop");

        if (mobileScans.length >= 2) {
          const first = mobileScans[0].scores.performance;
          const last = mobileScans[mobileScans.length - 1].scores.performance;
          const diff = last - first;
          const arrow = diff > 0 ? "↑" : diff < 0 ? "↓" : "→";
          lines.push("", `**Mobile trend:** ${first} → ${last} (${arrow}${Math.abs(diff)})`);
        }
        if (desktopScans.length >= 2) {
          const first = desktopScans[0].scores.performance;
          const last = desktopScans[desktopScans.length - 1].scores.performance;
          const diff = last - first;
          const arrow = diff > 0 ? "↑" : diff < 0 ? "↓" : "→";
          lines.push(`**Desktop trend:** ${first} → ${last} (${arrow}${Math.abs(diff)})`);
        }

        return lines.join("\n");
      },
    },
    {
      definition: {
        name: "get_lighthouse_scores",
        description:
          "Get the latest Lighthouse/PageSpeed Insights scores for the site. Shows performance, accessibility, SEO, and best practices scores plus Core Web Vitals and top improvement opportunities.",
        input_schema: { type: "object", properties: {} },
      },
      handler: async () => {
        const { getLatestBoth } = await import("@/lib/lighthouse/history");
        const { mobile, desktop } = await getLatestBoth();
        if (!mobile && !desktop) return "No Lighthouse audit results yet. I can run a scan for you — just say the word.";

        const lines: string[] = [];

        for (const result of [mobile, desktop]) {
          if (!result) continue;
          const s = result.scores;
          lines.push(
            `**${result.strategy === "mobile" ? "Mobile" : "Desktop"}** (${new Date(result.timestamp).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })})`,
            `URL: ${result.url}`,
            ``,
            `| Category | Score |`,
            `|----------|-------|`,
            `| Performance | ${s.performance}/100 |`,
            `| Accessibility | ${s.accessibility}/100 |`,
            `| SEO | ${s.seo}/100 |`,
            `| Best Practices | ${s.bestPractices}/100 |`,
          );

          if (result.coreWebVitals) {
            const cwv = result.coreWebVitals;
            lines.push(``, `**Core Web Vitals:**`);
            if (cwv.lcp != null) lines.push(`- LCP: ${cwv.lcp}ms`);
            if (cwv.cls != null) lines.push(`- CLS: ${cwv.cls}`);
            if (cwv.inp != null) lines.push(`- INP: ${cwv.inp}ms`);
            if (cwv.fcp != null) lines.push(`- FCP: ${cwv.fcp}ms`);
            if (cwv.ttfb != null) lines.push(`- TTFB: ${cwv.ttfb}ms`);
          }

          if (result.opportunities?.length) {
            const top = result.opportunities
              .filter((o: any) => o.score !== null && o.score < 1)
              .sort((a: any, b: any) => (b.savingsMs ?? 0) - (a.savingsMs ?? 0))
              .slice(0, 5);
            if (top.length > 0) {
              lines.push(``, `**Top opportunities:**`);
              for (const o of top) {
                const savings = o.savingsMs ? ` (save ~${Math.round(o.savingsMs)}ms)` : "";
                lines.push(`- ${o.title}${savings}`);
              }
            }
          }
          lines.push(``, `---`, ``);
        }

        return lines.join("\n");
      },
    },
    {
      definition: {
        name: "run_lighthouse",
        description:
          "Run a Lighthouse/PageSpeed Insights scan on the site right now. Takes 10-20 seconds. Returns performance, accessibility, SEO, and best practices scores.",
        input_schema: { type: "object", properties: {} },
      },
      handler: async () => {
        try {
          const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3010}`;
          const serviceToken = process.env.CMS_JWT_SECRET ?? "";
          const res = await fetch(`${baseUrl}/api/admin/lighthouse/scan`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-cms-service-token": serviceToken },
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: "Scan failed" }));
            return `Lighthouse scan failed: ${err.error ?? res.statusText}`;
          }
          const data = await res.json();
          // Scan endpoint returns { mobile: LighthouseResult, desktop: LighthouseResult }
          const results = [data.mobile, data.desktop].filter(Boolean);
          if (results.length === 0) return "Scan completed but returned no results.";

          const lines: string[] = [`**Lighthouse scan complete!** (${results[0]?.url ?? ""})`, ""];
          for (const r of results) {
            const s = r.scores;
            if (!s) continue;
            lines.push(`**${(r.strategy ?? "unknown").charAt(0).toUpperCase() + (r.strategy ?? "").slice(1)}:**`);
            lines.push(`- Performance: ${s.performance}/100`);
            lines.push(`- Accessibility: ${s.accessibility}/100`);
            lines.push(`- SEO: ${s.seo}/100`);
            lines.push(`- Best Practices: ${s.bestPractices}/100`);
            if (r.coreWebVitals) {
              const cwv = r.coreWebVitals;
              if (cwv.lcp != null) lines.push(`- LCP: ${cwv.lcp}ms`);
              if (cwv.cls != null) lines.push(`- CLS: ${cwv.cls}`);
              if (cwv.fcp != null) lines.push(`- FCP: ${cwv.fcp}ms`);
            }
            if (r.opportunities?.length) {
              const top = r.opportunities
                .filter((o: any) => o.score !== null && o.score < 1)
                .sort((a: any, b: any) => (b.savingsMs ?? 0) - (a.savingsMs ?? 0))
                .slice(0, 3);
              if (top.length > 0) {
                lines.push(`  Top issues:`);
                for (const o of top) {
                  const savings = o.savingsMs ? ` (save ~${Math.round(o.savingsMs)}ms)` : "";
                  lines.push(`  - ${o.title}${savings}`);
                }
              }
            }
            lines.push("");
          }
          return lines.join("\n");
        } catch (err) {
          return `Lighthouse scan error: ${err instanceof Error ? err.message : "unknown"}`;
        }
      },
    },

    // ── Forms (F30) ───────────────────────────────────────────────
    {
      definition: {
        name: "list_form_submissions",
        description:
          "List recent form submissions (contact form, signup, etc.). Shows sender, subject, date, and read status. Optionally filter by form name and status.",
        input_schema: {
          type: "object",
          properties: {
            form: { type: "string", description: "Form name to filter by (e.g. 'contact'). If omitted, lists submissions across all forms." },
            status: { type: "string", description: "Filter by status: 'new', 'read', 'archived'. Default: all." },
            limit: { type: "number", description: "Max results. Default: 20." },
          },
        },
      },
      handler: async () => {
        try {
          const { FormService } = await import("@/lib/forms/service");
          const { getActiveSitePaths } = await import("@/lib/site-paths");
          const { dataDir } = await getActiveSitePaths();
          const config = await getAdminConfig();
          const forms = (config as any).forms as Array<{ name: string; label: string }> | undefined;
          if (!forms?.length) return "No forms configured on this site. Add a `forms` array to cms.config.ts.";

          const svc = new FormService(dataDir);
          const allItems: Array<{ form: string; id: string; data: Record<string, unknown>; status: string; createdAt: string }> = [];

          for (const f of forms) {
            const items = await svc.list(f.name);
            for (const item of items) {
              allItems.push({ form: f.name, id: item.id, data: item.data, status: item.status, createdAt: item.createdAt });
            }
          }

          allItems.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          const limited = allItems.slice(0, 20);

          if (limited.length === 0) return "No form submissions yet.";

          // Group by form for the pill links
          const formsUsed = [...new Set(limited.map((s) => s.form))];
          const header = formsUsed.map((f) => `[form:${f}]`).join(" ");

          return header + "\n\n" + limited.map((s) => {
            const name = String(s.data.name ?? s.data.email ?? "Anonymous");
            const subject = s.data.subject ? ` — ${s.data.subject}` : "";
            const date = new Date(s.createdAt).toLocaleDateString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
            const badge = s.status === "new" ? " **NEW**" : s.status === "archived" ? " (archived)" : "";
            const msg = String(s.data.message ?? s.data.body ?? "").slice(0, 80);
            const preview = msg ? `\n  > ${msg}${msg.length >= 80 ? "…" : ""}` : "";
            return `- [${s.form}] **${name}**${subject} — ${date}${badge} (ID: \`${s.id}\`)${preview}`;
          }).join("\n");
        } catch {
          return "Forms module not available on this site.";
        }
      },
    },
    {
      definition: {
        name: "form_stats",
        description:
          "Get form submission statistics: total count, unread count, and breakdown by form and status.",
        input_schema: { type: "object", properties: {} },
      },
      handler: async () => {
        try {
          const { FormService } = await import("@/lib/forms/service");
          const { getActiveSitePaths } = await import("@/lib/site-paths");
          const { dataDir: formDataDir } = await getActiveSitePaths();
          const config = await getAdminConfig();
          const forms = (config as any).forms as Array<{ name: string; label: string }> | undefined;
          if (!forms?.length) return "No forms configured on this site.";

          const svc = new FormService(formDataDir);
          const unread = await svc.unreadCounts();

          const lines = [`**Form submissions overview:**`, ``];
          let totalAll = 0;
          let totalUnread = 0;

          for (const f of forms) {
            const items = await svc.list(f.name);
            const newCount = items.filter((i: any) => i.status === "new").length;
            const readCount = items.filter((i: any) => i.status === "read").length;
            const archivedCount = items.filter((i: any) => i.status === "archived").length;
            totalAll += items.length;
            totalUnread += newCount;
            lines.push(`**${f.label}** (\`${f.name}\`): ${items.length} total (${newCount} new, ${readCount} read, ${archivedCount} archived)`);
          }

          lines.push(``, `**Total:** ${totalAll} submissions, ${totalUnread} unread`);
          return lines.join("\n");
        } catch {
          return "Forms module not available on this site.";
        }
      },
    },

    {
      definition: {
        name: "get_form_submission",
        description:
          "Read the full content of a specific form submission. Use this when the user asks to see the details or message body of a submission.",
        input_schema: {
          type: "object",
          properties: {
            form: { type: "string", description: "Form name (e.g. 'contact')" },
            id: { type: "string", description: "Submission ID" },
          },
          required: ["form", "id"],
        },
      },
      handler: async (input) => {
        try {
          const { FormService } = await import("@/lib/forms/service");
          const { getActiveSitePaths } = await import("@/lib/site-paths");
          const { dataDir } = await getActiveSitePaths();
          const svc = new FormService(dataDir);
          const sub = await svc.get(String(input.form), String(input.id));
          if (!sub) return `Submission not found: ${input.form}/${input.id}`;

          const lines = [
            `**Form:** ${sub.form}`,
            `**Status:** ${sub.status}`,
            `**Submitted:** ${new Date(sub.createdAt).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`,
            ``,
          ];
          for (const [key, value] of Object.entries(sub.data)) {
            lines.push(`**${key}:** ${String(value)}`);
          }
          return lines.join("\n");
        } catch {
          return "Forms module not available on this site.";
        }
      },
    },

    // ── Memory tools (F114) ────────────────────────────────────
    {
      definition: {
        name: "search_memories",
        description:
          "Search your memory of past conversations. Use this to recall what you know about the user's preferences, decisions, and patterns.",
        input_schema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query — keywords about what you want to recall",
            },
          },
          required: ["query"],
        },
      },
      handler: async (input: any) => {
        const { queryMemories } = await import("@/lib/chat/memory-search");
        const results = await queryMemories(input.query, 15);
        if (results.length === 0) return "No memories found for that query.";
        return results
          .map((r) => `- [${r.memory.category}] ${r.memory.fact} (confidence: ${r.memory.confidence})`)
          .join("\n");
      },
    },
    {
      definition: {
        name: "add_memory",
        description:
          'Save a fact to memory for future conversations. Use when the user says "remember this", "don\'t forget", etc.',
        input_schema: {
          type: "object",
          properties: {
            fact: {
              type: "string",
              description: "The fact, preference, or instruction to remember",
            },
            category: {
              type: "string",
              enum: ["preference", "decision", "pattern", "correction", "fact"],
              description: "Classification of the memory",
            },
            entities: {
              type: "array",
              items: { type: "string" },
              description: "Related names, collections, or topics",
            },
          },
          required: ["fact", "category"],
        },
      },
      handler: async (input: any) => {
        const { addMemory } = await import("@/lib/chat/memory-store");
        const memory = await addMemory({
          fact: input.fact,
          category: input.category,
          entities: input.entities ?? [],
          sourceConversationId: "chat-tool",
          confidence: 1.0,
        });
        return `Remembered: "${memory.fact}" [${memory.category}]`;
      },
    },
    {
      definition: {
        name: "forget_memory",
        description:
          'Delete a specific memory. Use when the user says "forget that", "that\'s no longer true", etc. Search first to find the memory ID.',
        input_schema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query to find the memory to delete",
            },
          },
          required: ["query"],
        },
      },
      handler: async (input: any) => {
        const { queryMemories } = await import("@/lib/chat/memory-search");
        const { deleteMemory } = await import("@/lib/chat/memory-store");
        const results = await queryMemories(input.query, 1);
        if (results.length === 0) return "No matching memory found to forget.";
        const mem = results[0].memory;
        await deleteMemory(mem.id);
        return `Forgotten: "${mem.fact}" [${mem.category}]`;
      },
    },

    // ════════════════════════════════════════════════════════════
    //  Phase 6 — workflows, templates, budgets, feedback
    // ════════════════════════════════════════════════════════════

    // ── list_workflows ────────────────────────────────────────
    {
      definition: {
        name: "list_workflows",
        description:
          "List all agent workflows on this site. A workflow is an ordered chain of agents that runs as a single pipeline (e.g. Writer → SEO → Translator). Returns the workflow name, the chained agent ids, schedule status, and run stats.",
        input_schema: { type: "object", properties: {} },
      },
      handler: async () => {
        const { listWorkflows } = await import("@/lib/agent-workflows");
        const workflows = await listWorkflows();
        if (workflows.length === 0) return "No workflows configured.";
        return workflows.map((w) =>
          `- **${w.name}** (${w.steps.length} step${w.steps.length === 1 ? "" : "s"}) [${w.schedule.enabled ? w.schedule.frequency : "manual"}]\n` +
          `  ID: \`${w.id}\` | Runs: ${w.stats.totalRuns} | Total: $${w.stats.totalCostUsd.toFixed(4)}\n` +
          `  Steps: ${w.steps.map((s) => s.agentId).join(" → ")}`
        ).join("\n");
      },
    },

    // ── create_workflow ───────────────────────────────────────
    {
      definition: {
        name: "create_workflow",
        description:
          "Create a new agent workflow — an ordered chain of agents. Each step takes the previous step's output as input. The first step receives the run prompt; only the final step's output lands in the curation queue.",
        input_schema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Workflow display name (e.g. 'Writer → SEO → Translator')" },
            agentIds: { type: "array", items: { type: "string" }, description: "Ordered list of agent ids the pipeline runs through. Use list_agents to find ids." },
            scheduleEnabled: { type: "boolean", description: "Run on a schedule? Default false." },
            frequency: { type: "string", description: "daily | weekly | manual | cron (default: manual)" },
            time: { type: "string", description: "HH:MM scheduled time (default: 06:00)" },
            cron: { type: "string", description: "Cron expression when frequency=cron, e.g. '0 9 * * 1-5' for weekdays at 9am" },
            defaultPrompt: { type: "string", description: "Prompt sent to step 1 on each scheduled run. Manual runs use whatever prompt the curator provides." },
          },
          required: ["name", "agentIds"],
        },
      },
      handler: async (input) => {
        const { createWorkflow } = await import("@/lib/agent-workflows");
        const agentIds = (input.agentIds as string[]) ?? [];
        if (agentIds.length === 0) return "Workflow needs at least one agent in agentIds.";
        const wf = await createWorkflow({
          name: String(input.name),
          steps: agentIds.map((agentId, i) => ({ id: `step-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`, agentId })),
          active: true,
          schedule: {
            enabled: input.scheduleEnabled === true,
            frequency: (String(input.frequency ?? "manual")) as never,
            time: String(input.time ?? "06:00"),
            maxPerRun: 1,
            ...(input.cron ? { cron: String(input.cron) } : {}),
          },
          ...(input.defaultPrompt ? { defaultPrompt: String(input.defaultPrompt) } : {}),
        });
        return `Created workflow **${wf.name}**\nID: \`${wf.id}\`\nSteps: ${wf.steps.map((s) => s.agentId).join(" → ")}`;
      },
    },

    // ── run_workflow ──────────────────────────────────────────
    {
      definition: {
        name: "run_workflow",
        description:
          "Run an agent workflow with a prompt. Each step's agent processes the previous step's output. Synchronous — blocks until the entire pipeline finishes (could take 1-2 minutes for a 3-step workflow). The final output lands as one curation queue item.",
        input_schema: {
          type: "object",
          properties: {
            workflowId: { type: "string", description: "Workflow ID (use list_workflows)" },
            prompt: { type: "string", description: "Prompt for the first step" },
          },
          required: ["workflowId", "prompt"],
        },
      },
      handler: async (input) => {
        const { runWorkflow } = await import("@/lib/workflow-runner");
        const result = await runWorkflow(String(input.workflowId), String(input.prompt));
        const stepLines = result.steps.map((s, i) =>
          `  ${i + 1}. ${s.agentName} (${s.model}) — $${s.costUsd.toFixed(4)}, ${(s.durationMs / 1000).toFixed(1)}s`
        ).join("\n");
        return `Workflow **${result.workflowName}** → **${result.title}**\n` +
          `Queue item: \`${result.queueItemId}\` (${result.collection}/${result.slug})\n` +
          `Total: $${result.costUsd.toFixed(4)} in ${(result.totalDurationMs / 1000).toFixed(1)}s\n${stepLines}`;
      },
    },

    // ── delete_workflow ───────────────────────────────────────
    {
      definition: {
        name: "delete_workflow",
        description: "Permanently delete an agent workflow. The workflow's stored stats are lost. The agents themselves remain.",
        input_schema: {
          type: "object",
          properties: {
            workflowId: { type: "string", description: "Workflow ID" },
          },
          required: ["workflowId"],
        },
      },
      handler: async (input) => {
        const { deleteWorkflow, getWorkflow } = await import("@/lib/agent-workflows");
        const wf = await getWorkflow(String(input.workflowId));
        if (!wf) return `Workflow ${input.workflowId} not found.`;
        await deleteWorkflow(wf.id);
        return `Deleted workflow **${wf.name}**.`;
      },
    },

    // ── list_agent_templates ──────────────────────────────────
    {
      definition: {
        name: "list_agent_templates",
        description:
          "List agent templates the curator can start a new agent from. Returns both local org templates (saved from existing agents) and curated marketplace templates fetched from github.com/webhousecode/cms-agents.",
        input_schema: {
          type: "object",
          properties: {
            source: { type: "string", description: "Filter: local | marketplace | all (default)" },
          },
        },
      },
      handler: async (input) => {
        const { cookies } = await import("next/headers");
        const cookieStore = await cookies();
        const orgId = cookieStore.get("cms-active-org")?.value ?? null;
        const source = String(input.source ?? "all");

        const { listLocalTemplates } = await import("@/lib/agent-templates");
        const { fetchMarketplaceTemplates } = await import("@/lib/marketplace-templates");

        const local = orgId && (source === "local" || source === "all") ? await listLocalTemplates(orgId) : [];
        const market = (source === "marketplace" || source === "all") ? (await fetchMarketplaceTemplates()).templates : [];

        if (local.length === 0 && market.length === 0) {
          return "No templates available. Marketplace may be unreachable or you have no local templates yet.";
        }

        const lines: string[] = [];
        if (local.length > 0) {
          lines.push(`### Local org templates (${local.length})`);
          for (const t of local) {
            lines.push(`- **${t.name}**${t.category ? ` _(${t.category})_` : ""} — ${t.description || "no description"}\n  ID: \`${t.id}\``);
          }
        }
        if (market.length > 0) {
          lines.push(`\n### Marketplace (${market.length})`);
          for (const t of market) {
            lines.push(`- ${t.icon ?? ""} **${t.name}**${t.category ? ` _(${t.category})_` : ""} — ${t.description || "no description"}\n  ID: \`${t.id}\``);
          }
        }
        return lines.join("\n");
      },
    },

    // ── create_agent_from_template ────────────────────────────
    {
      definition: {
        name: "create_agent_from_template",
        description:
          "Create a new agent by instantiating a template (local or marketplace). Looks up the template by id, applies its payload, then creates the agent. The new agent starts with autonomy='draft' and an inactive schedule — adjust afterwards via update_agent if needed.",
        input_schema: {
          type: "object",
          properties: {
            templateId: { type: "string", description: "Template ID from list_agent_templates" },
            name: { type: "string", description: "Override the agent name (optional — defaults to template name)" },
          },
          required: ["templateId"],
        },
      },
      handler: async (input) => {
        const templateId = String(input.templateId);
        const { cookies } = await import("next/headers");
        const cookieStore = await cookies();
        const orgId = cookieStore.get("cms-active-org")?.value ?? null;

        // Try local first, then marketplace
        let template = null as null | Awaited<ReturnType<typeof import("@/lib/agent-templates").getLocalTemplate>>;
        if (orgId) {
          const { getLocalTemplate } = await import("@/lib/agent-templates");
          template = await getLocalTemplate(orgId, templateId);
        }
        if (!template) {
          const { fetchMarketplaceTemplates } = await import("@/lib/marketplace-templates");
          const { templates } = await fetchMarketplaceTemplates();
          template = templates.find((t) => t.id === templateId) ?? null;
        }
        if (!template) return `Template ${templateId} not found in local org templates or marketplace.`;

        const { templateToAgentInput } = await import("@/lib/agent-templates");
        const agentInput = templateToAgentInput(template, { name: input.name ? String(input.name) : undefined });

        const { createAgent } = await import("@/lib/agents");
        const agent = await createAgent(agentInput as never);
        return `Created agent **${agent.name}** from template "${template.name}"\nID: \`${agent.id}\`\nRole: ${agent.role}\nTools: ${Object.entries(agent.tools).filter(([, v]) => v).map(([k]) => k).join(", ") || "none"}`;
      },
    },

    // ── save_agent_as_template ────────────────────────────────
    {
      definition: {
        name: "save_agent_as_template",
        description:
          "Save an existing agent as a reusable local template for the active org. Strips per-instance fields (stats, schedule, budgets, locale, active) so the template represents the agent's BEHAVIOR, not the running instance.",
        input_schema: {
          type: "object",
          properties: {
            agentId: { type: "string", description: "Agent ID to template" },
            name: { type: "string", description: "Template display name (optional — defaults to agent name)" },
            description: { type: "string", description: "One-line summary shown on the template card" },
          },
          required: ["agentId"],
        },
      },
      handler: async (input) => {
        const { cookies } = await import("next/headers");
        const cookieStore = await cookies();
        const orgId = cookieStore.get("cms-active-org")?.value ?? null;
        if (!orgId) return "No active org — cannot save template.";

        const { getAgent } = await import("@/lib/agents");
        const agent = await getAgent(String(input.agentId));
        if (!agent) return `Agent ${input.agentId} not found.`;

        const { agentToTemplatePayload, saveLocalTemplate } = await import("@/lib/agent-templates");
        const tpl = await saveLocalTemplate(orgId, {
          name: String(input.name ?? agent.name),
          description: String(input.description ?? `Template based on ${agent.name}`),
          payload: agentToTemplatePayload(agent),
        });
        return `Saved template **${tpl.name}** (\`${tpl.id}\`) for org \`${orgId}\``;
      },
    },

    // ── set_agent_budget ──────────────────────────────────────
    {
      definition: {
        name: "set_agent_budget",
        description:
          "Set per-agent cost guards. Each cap is checked pre-flight against analytics spend; runs that would exceed the cap are blocked with a clear error. Pass null or 0 to clear a cap. All caps are in USD.",
        input_schema: {
          type: "object",
          properties: {
            agentId: { type: "string", description: "Agent ID" },
            dailyBudgetUsd: { type: "number", description: "Daily cap (resets at midnight). 0 or absent = no cap." },
            weeklyBudgetUsd: { type: "number", description: "Rolling 7-day cap. 0 or absent = no cap." },
            monthlyBudgetUsd: { type: "number", description: "Calendar-month cap (resets on the 1st). 0 or absent = no cap." },
          },
          required: ["agentId"],
        },
      },
      handler: async (input) => {
        const { getAgent, updateAgent } = await import("@/lib/agents");
        const agent = await getAgent(String(input.agentId));
        if (!agent) return `Agent ${input.agentId} not found.`;
        const patch: Record<string, unknown> = {};
        const set = (key: string, val: unknown) => {
          if (val === undefined) return;
          const n = Number(val);
          patch[key] = n > 0 ? n : undefined;
        };
        set("dailyBudgetUsd", input.dailyBudgetUsd);
        set("weeklyBudgetUsd", input.weeklyBudgetUsd);
        set("monthlyBudgetUsd", input.monthlyBudgetUsd);
        const updated = await updateAgent(agent.id, patch as never);
        const fmt = (v?: number) => v != null && v > 0 ? `$${v.toFixed(2)}` : "—";
        return `Budgets for **${updated.name}**: daily=${fmt(updated.dailyBudgetUsd)} weekly=${fmt(updated.weeklyBudgetUsd)} monthly=${fmt(updated.monthlyBudgetUsd)}`;
      },
    },

    // ── set_agent_locale ──────────────────────────────────────
    {
      definition: {
        name: "set_agent_locale",
        description:
          "Set the language an agent writes its primary output in. Use this on multi-locale sites to host parallel agents (e.g. one DA and one EN content writer on the same site). Pass an empty string to clear and inherit the site default. Approval-time auto-translate (if enabled in site settings) still flows from the default locale to the others.",
        input_schema: {
          type: "object",
          properties: {
            agentId: { type: "string", description: "Agent ID" },
            locale: { type: "string", description: "Locale code (e.g. 'en', 'da', 'de'). Empty string = inherit site default." },
          },
          required: ["agentId", "locale"],
        },
      },
      handler: async (input) => {
        const { getAgent, updateAgent } = await import("@/lib/agents");
        const agent = await getAgent(String(input.agentId));
        if (!agent) return `Agent ${input.agentId} not found.`;
        const locale = String(input.locale).trim();
        const updated = await updateAgent(agent.id, { locale: locale || undefined } as never);
        return `Locale for **${updated.name}**: ${updated.locale ?? "(inherit site default)"}`;
      },
    },

    // ── enable_image_generation ───────────────────────────────
    {
      definition: {
        name: "enable_image_generation",
        description:
          "Toggle the image-generation tool on or off for an agent. When enabled, the agent gains a generate_image tool that calls Google Gemini Nano Banana ($0.039 per image) and saves the result to the media library with full AI-generated provenance. Requires a Gemini API key on the site or org.",
        input_schema: {
          type: "object",
          properties: {
            agentId: { type: "string", description: "Agent ID" },
            enabled: { type: "boolean", description: "true to enable, false to disable" },
          },
          required: ["agentId", "enabled"],
        },
      },
      handler: async (input) => {
        const { getAgent, updateAgent } = await import("@/lib/agents");
        const agent = await getAgent(String(input.agentId));
        if (!agent) return `Agent ${input.agentId} not found.`;
        const updated = await updateAgent(agent.id, {
          tools: { ...agent.tools, imageGeneration: input.enabled === true },
        } as never);
        return `Image generation for **${updated.name}**: ${updated.tools.imageGeneration ? "ENABLED" : "disabled"}`;
      },
    },

    // ── list_agent_feedback ───────────────────────────────────
    {
      definition: {
        name: "list_agent_feedback",
        description:
          "Show the most recent corrections and rejections recorded for an agent. The runner injects the last 5 corrections as few-shot examples and the last 5 rejection notes as 'things to avoid' on the agent's next run.",
        input_schema: {
          type: "object",
          properties: {
            agentId: { type: "string", description: "Agent ID" },
            limit: { type: "number", description: "Max entries to return (default 10)" },
          },
          required: ["agentId"],
        },
      },
      handler: async (input) => {
        const { readFeedback } = await import("@/lib/agent-feedback");
        const all = await readFeedback(String(input.agentId));
        const limit = Number(input.limit ?? 10);
        const recent = all.slice(-limit).reverse();
        if (recent.length === 0) return "No feedback recorded for this agent yet.";
        return recent.map((e) => {
          if (e.type === "rejection") return `- **rejection** _(${new Date(e.createdAt).toLocaleDateString()})_: ${e.notes ?? "(no notes)"}`;
          return `- **${e.type}** on \`${e.field ?? "?"}\`: \"${(e.original ?? "").slice(0, 60)}\" → \"${(e.corrected ?? "").slice(0, 60)}\"`;
        }).join("\n");
      },
    },

  ];
}
