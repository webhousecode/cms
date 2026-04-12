import { PUBLIC_TOOLS } from "@webhouse/cms-mcp-client";

export const ADMIN_TOOLS = [
  ...PUBLIC_TOOLS,

  // ── Content creation ──────────────────────────────────────────
  {
    name: "create_document",
    description:
      "Creates a new document in a collection. Provide collection name and fields " +
      "matching that collection's schema. Use get_schema first to learn required fields. " +
      "Returns the new document slug.",
    inputSchema: {
      type: "object" as const,
      properties: {
        collection: { type: "string" },
        fields: { type: "object", description: "Document fields matching the collection schema." },
        status: {
          type: "string",
          enum: ["draft", "published"],
          description: "Initial status. Default: draft.",
        },
      },
      required: ["collection", "fields"] as string[],
    },
  },
  {
    name: "update_document",
    description:
      "Updates specific fields on an existing document. Only provided fields change — " +
      "others are preserved. AI-locked fields are skipped automatically.",
    inputSchema: {
      type: "object" as const,
      properties: {
        collection: { type: "string" },
        slug: { type: "string" },
        fields: { type: "object", description: "Fields to update." },
      },
      required: ["collection", "slug", "fields"] as string[],
    },
  },
  {
    name: "publish_document",
    description: "Sets a document status to 'published'. Optionally triggers an immediate build.",
    inputSchema: {
      type: "object" as const,
      properties: {
        collection: { type: "string" },
        slug: { type: "string" },
        auto_build: { type: "boolean", description: "Trigger site build after publishing. Default: false." },
      },
      required: ["collection", "slug"] as string[],
    },
  },
  {
    name: "unpublish_document",
    description: "Sets a document back to draft status.",
    inputSchema: {
      type: "object" as const,
      properties: {
        collection: { type: "string" },
        slug: { type: "string" },
      },
      required: ["collection", "slug"] as string[],
    },
  },
  {
    name: "trash_document",
    description: "Move a document to trash. The document can be restored later.",
    inputSchema: {
      type: "object" as const,
      properties: {
        collection: { type: "string" },
        slug: { type: "string" },
      },
      required: ["collection", "slug"] as string[],
    },
  },
  {
    name: "clone_document",
    description: "Create a copy of a document. The clone is created as a draft with '-copy' suffix.",
    inputSchema: {
      type: "object" as const,
      properties: {
        collection: { type: "string" },
        slug: { type: "string" },
      },
      required: ["collection", "slug"] as string[],
    },
  },
  {
    name: "restore_from_trash",
    description: "Restore a trashed document back to draft status.",
    inputSchema: {
      type: "object" as const,
      properties: {
        collection: { type: "string" },
        slug: { type: "string" },
      },
      required: ["collection", "slug"] as string[],
    },
  },
  {
    name: "empty_trash",
    description: "Permanently delete all trashed items. Cannot be undone.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },

  // ── AI content generation ─────────────────────────────────────
  {
    name: "generate_with_ai",
    description:
      "Generates content for a new document using AI. Provide intent and collection. Returns a draft.",
    inputSchema: {
      type: "object" as const,
      properties: {
        collection: { type: "string" },
        intent: { type: "string", description: "Natural language description of what to create." },
        status: { type: "string", enum: ["draft", "published"], description: "Default: draft." },
      },
      required: ["collection", "intent"] as string[],
    },
  },
  {
    name: "rewrite_field",
    description:
      "Rewrites a field with AI. Use for: shorten, expand, change tone, translate. Respects AI Lock.",
    inputSchema: {
      type: "object" as const,
      properties: {
        collection: { type: "string" },
        slug: { type: "string" },
        field: { type: "string" },
        instruction: { type: "string", description: "E.g. 'Translate to Danish', 'Make 30% shorter'." },
      },
      required: ["collection", "slug", "field", "instruction"] as string[],
    },
  },
  {
    name: "generate_content",
    description: "Generate AI content for a specific field on a document.",
    inputSchema: {
      type: "object" as const,
      properties: {
        collection: { type: "string" },
        slug: { type: "string" },
        field: { type: "string", description: "Field name to generate for." },
        prompt: { type: "string", description: "Instructions for what to generate." },
      },
      required: ["collection", "slug", "field", "prompt"] as string[],
    },
  },
  {
    name: "generate_interactive",
    description: "Generate a self-contained HTML interactive (calculator, quiz, widget, etc.).",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Name for the interactive." },
        description: { type: "string", description: "What it should do and look like." },
      },
      required: ["title", "description"] as string[],
    },
  },

  // ── Translation ───────────────────────────────────────────────
  {
    name: "translate_document",
    description: "Translate a document to another language. Creates a linked translation.",
    inputSchema: {
      type: "object" as const,
      properties: {
        collection: { type: "string" },
        slug: { type: "string" },
        targetLocale: { type: "string", description: "Target locale (e.g. 'en', 'da', 'de')." },
        publish: { type: "boolean", description: "Publish immediately. Default: false." },
      },
      required: ["collection", "slug", "targetLocale"] as string[],
    },
  },
  {
    name: "translate_site",
    description: "Translate ALL untranslated documents to a target language.",
    inputSchema: {
      type: "object" as const,
      properties: {
        targetLocale: { type: "string" },
        publish: { type: "boolean", description: "Default: false." },
      },
      required: ["targetLocale"] as string[],
    },
  },

  // ── Builds & Deploy ──────────────────────────────────────────
  {
    name: "trigger_build",
    description: "Triggers a static site build. Returns build status.",
    inputSchema: {
      type: "object" as const,
      properties: {
        mode: { type: "string", enum: ["full", "incremental"], description: "Default: incremental." },
      },
      required: [] as string[],
    },
  },
  {
    name: "trigger_deploy",
    description: "Deploy the site to the configured provider (GitHub Pages, Fly.io, Vercel, etc.).",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: "list_deploy_history",
    description: "Show recent deployment history.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },

  // ── Bulk operations ───────────────────────────────────────────
  {
    name: "bulk_publish",
    description: "Publish all drafts in a collection (or all collections if omitted).",
    inputSchema: {
      type: "object" as const,
      properties: {
        collection: { type: "string", description: "Optional: target collection." },
      },
      required: [] as string[],
    },
  },
  {
    name: "bulk_update",
    description: "Update a field across multiple documents. Supports 'append' mode for arrays (tags).",
    inputSchema: {
      type: "object" as const,
      properties: {
        collection: { type: "string" },
        field: { type: "string" },
        value: { description: "New value." },
        mode: { type: "string", description: "'set' (default) or 'append' for arrays." },
        filter: {
          type: "object",
          properties: {
            status: { type: "string" },
            slugs: { type: "array", items: { type: "string" } },
          },
        },
      },
      required: ["collection", "field", "value"] as string[],
    },
  },

  // ── Scheduling ────────────────────────────────────────────────
  {
    name: "schedule_publish",
    description: "Schedule a document for future publishing/unpublishing. ISO 8601 dates.",
    inputSchema: {
      type: "object" as const,
      properties: {
        collection: { type: "string" },
        slug: { type: "string" },
        publishAt: { type: "string", description: "ISO datetime to publish." },
        unpublishAt: { type: "string", description: "ISO datetime to unpublish." },
      },
      required: ["collection", "slug"] as string[],
    },
  },
  {
    name: "list_scheduled",
    description: "List all content scheduled for future publishing/unpublishing.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },

  // ── Drafts & Read ─────────────────────────────────────────────
  {
    name: "list_drafts",
    description: "Lists all unpublished draft documents across all (or one) collection.",
    inputSchema: {
      type: "object" as const,
      properties: {
        collection: { type: "string", description: "Optional: filter by collection." },
      },
      required: [] as string[],
    },
  },
  {
    name: "get_version_history",
    description: "Returns revision history for a document.",
    inputSchema: {
      type: "object" as const,
      properties: {
        collection: { type: "string" },
        slug: { type: "string" },
        limit: { type: "number", description: "Default 10." },
      },
      required: ["collection", "slug"] as string[],
    },
  },
  {
    name: "get_site_config",
    description: "Get site configuration: name, adapter, deploy settings, locales.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: "update_site_settings",
    description: "Update site settings. Sensitive fields (API keys) cannot be changed.",
    inputSchema: {
      type: "object" as const,
      properties: {
        settings: { type: "object", description: "Key-value pairs to update." },
      },
      required: ["settings"] as string[],
    },
  },
  {
    name: "content_stats",
    description: "Content statistics: word counts, document counts, published/draft breakdown.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },

  // ── Media ─────────────────────────────────────────────────────
  {
    name: "list_media",
    description: "List all media files with AI analysis, tags, EXIF data.",
    inputSchema: {
      type: "object" as const,
      properties: {
        type: { type: "string", description: "'image', 'video', 'audio', 'document', 'all'." },
        limit: { type: "number", description: "Default: 50." },
      },
      required: [] as string[],
    },
  },
  {
    name: "search_media",
    description: "Search media by AI captions, tags, or filename.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string" },
        type: { type: "string", description: "Default: 'image'." },
        limit: { type: "number", description: "Default: 10." },
      },
      required: ["query"] as string[],
    },
  },

  // ── Trash ─────────────────────────────────────────────────────
  {
    name: "list_trash",
    description: "List all trashed documents and media.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },

  // ── Agents & Curation ─────────────────────────────────────────
  {
    name: "list_agents",
    description: "List configured AI agents with name, role, target collections, status.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: "create_agent",
    description: "Create a new AI agent with name, role, and system prompt.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string" },
        role: { type: "string", description: "copywriter, seo, translator, refresher, or custom." },
        systemPrompt: { type: "string" },
        targetCollections: { type: "array", items: { type: "string" } },
      },
      required: ["name", "role", "systemPrompt"] as string[],
    },
  },
  {
    name: "run_agent",
    description: "Run an AI agent to generate content into the curation queue.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agentId: { type: "string" },
        prompt: { type: "string" },
        collection: { type: "string", description: "Override target collection." },
      },
      required: ["agentId", "prompt"] as string[],
    },
  },
  {
    name: "list_curation_queue",
    description: "List items in the AI curation queue awaiting review.",
    inputSchema: {
      type: "object" as const,
      properties: {
        status: { type: "string", description: "ready, in_review, approved, rejected, published." },
      },
      required: [] as string[],
    },
  },
  {
    name: "approve_queue_item",
    description: "Approve a curation queue item for publishing.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string" },
        asDraft: { type: "boolean", description: "Approve as draft. Default: false." },
      },
      required: ["id"] as string[],
    },
  },
  {
    name: "reject_queue_item",
    description: "Reject a curation queue item with feedback.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string" },
        feedback: { type: "string" },
      },
      required: ["id", "feedback"] as string[],
    },
  },

  // ── Maintenance ───────────────────────────────────────────────
  {
    name: "list_revisions",
    description: "List revision history for a document.",
    inputSchema: {
      type: "object" as const,
      properties: {
        collection: { type: "string" },
        slug: { type: "string" },
      },
      required: ["collection", "slug"] as string[],
    },
  },
  {
    name: "run_link_check",
    description: "Check all links across the site for broken URLs.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: "create_backup",
    description: "Create a backup of the site's content.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },
] as const;

export type AdminToolName = (typeof ADMIN_TOOLS)[number]["name"];

// Which scopes are required per tool
export const TOOL_SCOPES: Record<AdminToolName, string[]> = {
  // Public (inherited)
  get_site_summary:      ["read"],
  list_collection:       ["read"],
  search_content:        ["read"],
  get_page:              ["read"],
  get_schema:            ["read"],
  export_all:            ["read"],
  // Read
  list_drafts:           ["read"],
  get_version_history:   ["read"],
  get_site_config:       ["read"],
  list_media:            ["read"],
  search_media:          ["read"],
  content_stats:         ["read"],
  list_scheduled:        ["read"],
  list_agents:           ["read"],
  list_curation_queue:   ["read"],
  list_revisions:        ["read"],
  list_trash:            ["read"],
  list_deploy_history:   ["read"],
  run_link_check:        ["read"],
  // Write
  create_document:       ["write"],
  update_document:       ["write"],
  trash_document:        ["write"],
  clone_document:        ["write"],
  restore_from_trash:    ["write"],
  empty_trash:           ["write", "admin"],
  update_site_settings:  ["admin"],
  bulk_update:           ["write"],
  create_backup:         ["admin"],
  create_agent:          ["write", "ai", "admin"],
  approve_queue_item:    ["write"],
  reject_queue_item:     ["write"],
  // Publish
  publish_document:      ["publish"],
  unpublish_document:    ["publish"],
  bulk_publish:          ["publish"],
  schedule_publish:      ["publish"],
  // Deploy
  trigger_build:         ["deploy"],
  trigger_deploy:        ["deploy"],
  // AI
  generate_with_ai:      ["write", "ai"],
  rewrite_field:         ["write", "ai"],
  generate_content:      ["write", "ai"],
  generate_interactive:  ["write", "ai"],
  translate_document:    ["write", "ai"],
  translate_site:        ["write", "ai"],
  run_agent:             ["write", "ai"],
};
