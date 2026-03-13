import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ContentReader } from "@webhouse/cms-mcp-client";
import { ADMIN_TOOLS, TOOL_SCOPES } from "./tools.js";
import { hasScope } from "./auth.js";
import { writeAudit } from "./audit.js";
import type { ContentService, CmsConfig } from "@webhouse/cms";
import type { AdminToolName } from "./tools.js";

export interface AiGenerator {
  generate(intent: string, collectionName: string): Promise<{ fields: Record<string, string>; slug: string }>;
  rewriteField(collection: string, slug: string, field: string, instruction: string, currentValue: string): Promise<string>;
}

export interface AdminServerOptions {
  content: ContentService;
  config: CmsConfig;
  /** Resolved scopes for this session — determined by auth middleware before connect */
  scopes: string[];
  /** Label identifying the API key / user for audit log */
  actor: string;
  /** Optional AI generator — if not provided, AI tools return a "not configured" error */
  ai?: AiGenerator;
  /** Called when a write tool needs to trigger a build */
  onBuild?: (mode: "full" | "incremental") => Promise<{ ok: boolean; message: string }>;
}

export function createAdminMcpServer(opts: AdminServerOptions): Server {
  const reader = new ContentReader(opts.content, opts.config);
  const { content, config, scopes, actor, ai, onBuild } = opts;

  const server = new Server(
    { name: "cms-admin", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ADMIN_TOOLS as unknown as unknown[],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    const a = args as Record<string, unknown>;
    const toolName = name as AdminToolName;

    // ── Scope check ───────────────────────────────────────────────
    const required = TOOL_SCOPES[toolName] ?? ["read"];
    if (!hasScope(scopes, required)) {
      writeAudit({ timestamp: new Date().toISOString(), tool: name, actor, result: "error", error: "Insufficient scope" } satisfies import("./audit.js").AuditEntry);
      return {
        content: [{ type: "text" as const, text: `Forbidden: requires scopes [${required.join(", ")}]` }],
        isError: true,
      };
    }

    const audit = (auditResult: "success" | "error", docRef?: string, auditError?: string) => {
      const entry: import("./audit.js").AuditEntry = { timestamp: new Date().toISOString(), tool: name, actor, result: auditResult };
      if (docRef !== undefined) entry.documentRef = docRef;
      if (auditError !== undefined) entry.error = auditError;
      writeAudit(entry);
    };

    try {
      let result: unknown;

      switch (name) {
        // ── Inherited public read tools ──────────────────────────
        case "get_site_summary":
          result = await reader.getSiteSummary();
          break;
        case "list_collection": {
          const lArgs: Parameters<typeof reader.listCollection>[0] = { collection: String(a["collection"] ?? "") };
          if (a["limit"] !== undefined) lArgs.limit = a["limit"] as number;
          if (a["offset"] !== undefined) lArgs.offset = a["offset"] as number;
          if (a["sort"] !== undefined) lArgs.sort = a["sort"] as "date_desc" | "date_asc" | "title_asc";
          result = await reader.listCollection(lArgs);
          break;
        }
        case "search_content": {
          const sArgs: Parameters<typeof reader.search>[0] = { query: String(a["query"] ?? "") };
          if (a["collection"] !== undefined) sArgs.collection = a["collection"] as string;
          if (a["limit"] !== undefined) sArgs.limit = a["limit"] as number;
          result = await reader.search(sArgs);
          break;
        }
        case "get_page": {
          const pArgs: Parameters<typeof reader.getPage>[0] = { slug: String(a["slug"] ?? "") };
          if (a["collection"] !== undefined) pArgs.collection = a["collection"] as string;
          result = await reader.getPage(pArgs);
          break;
        }
        case "get_schema":
          result = await reader.getSchema(String(a["collection"] ?? ""));
          break;
        case "export_all": {
          const eArgs: Parameters<typeof reader.exportAll>[0] = {};
          if (a["include_body"] !== undefined) eArgs.include_body = a["include_body"] as boolean;
          result = await reader.exportAll(eArgs);
          break;
        }

        // ── Write tools ──────────────────────────────────────────
        case "create_document": {
          const col = String(a["collection"] ?? "");
          const fields = (a["fields"] as Record<string, unknown>) ?? {};
          const status = (a["status"] as "draft" | "published") ?? "draft";
          const doc = await content.create(col, { data: fields, status }, { actor: "ai", aiModel: "mcp" });
          result = { slug: doc.slug, id: doc.id, collection: col, status: doc.status };
          audit("success", `${col}/${doc.slug}`);
          break;
        }

        case "update_document": {
          const col = String(a["collection"] ?? "");
          const slug = String(a["slug"] ?? "");
          const fields = (a["fields"] as Record<string, unknown>) ?? {};
          const existing = await content.findBySlug(col, slug);
          if (!existing) {
            result = { error: `Document "${slug}" not found in "${col}"` };
            break;
          }
          const { document: updated, skippedFields } = await content.updateWithContext(
            col, existing.id, { data: fields }, { actor: "ai", aiModel: "mcp" }
          );
          result = { slug: updated.slug, skippedFields };
          audit("success", `${col}/${slug}`);
          break;
        }

        case "publish_document": {
          const col = String(a["collection"] ?? "");
          const slug = String(a["slug"] ?? "");
          const existing = await content.findBySlug(col, slug);
          if (!existing) { result = { error: `Document "${slug}" not found` }; break; }
          await content.update(col, existing.id, { status: "published" }, { actor: "user" });
          result = { slug, status: "published" };
          audit("success", `${col}/${slug}`);
          if (a["auto_build"] && onBuild) {
            const buildResult = await onBuild("incremental");
            result = { ...result as object, build: buildResult };
          }
          break;
        }

        case "unpublish_document": {
          const col = String(a["collection"] ?? "");
          const slug = String(a["slug"] ?? "");
          const existing = await content.findBySlug(col, slug);
          if (!existing) { result = { error: `Document "${slug}" not found` }; break; }
          await content.update(col, existing.id, { status: "draft" }, { actor: "user" });
          result = { slug, status: "draft" };
          audit("success", `${col}/${slug}`);
          break;
        }

        // ── AI tools ─────────────────────────────────────────────
        case "generate_with_ai": {
          if (!ai) { result = { error: "AI provider not configured on this server" }; break; }
          const col = String(a["collection"] ?? "");
          const intent = String(a["intent"] ?? "");
          const status = (a["status"] as "draft" | "published") ?? "draft";
          const generated = await ai.generate(intent, col);
          const doc = await content.create(col, { data: generated.fields, slug: generated.slug, status }, { actor: "ai", aiModel: "mcp-generate" });
          result = { slug: doc.slug, id: doc.id, collection: col, status: doc.status, fields: doc.data };
          audit("success", `${col}/${doc.slug}`);
          break;
        }

        case "rewrite_field": {
          if (!ai) { result = { error: "AI provider not configured on this server" }; break; }
          const col = String(a["collection"] ?? "");
          const slug = String(a["slug"] ?? "");
          const field = String(a["field"] ?? "");
          const instruction = String(a["instruction"] ?? "");
          const existing = await content.findBySlug(col, slug);
          if (!existing) { result = { error: `Document "${slug}" not found` }; break; }

          // Check AI lock
          const { isFieldLocked } = await import("@webhouse/cms");
          if (isFieldLocked(existing._fieldMeta ?? {}, field)) {
            result = { error: `FIELD_LOCKED: Field '${field}' is AI-locked and cannot be modified by agents` };
            audit("error", `${col}/${slug}`, "FIELD_LOCKED");
            break;
          }

          const currentValue = String(existing.data[field] ?? "");
          const rewritten = await ai.rewriteField(col, slug, field, instruction, currentValue);
          await content.updateWithContext(col, existing.id, { data: { ...existing.data, [field]: rewritten } }, { actor: "ai", aiModel: "mcp-rewrite" });
          result = { slug, field, rewritten };
          audit("success", `${col}/${slug}`);
          break;
        }

        // ── Build tools ──────────────────────────────────────────
        case "trigger_build": {
          if (!onBuild) { result = { error: "Build not configured on this server" }; break; }
          const mode = (a["mode"] as "full" | "incremental") ?? "incremental";
          result = await onBuild(mode);
          audit("success");
          break;
        }

        // ── Draft tools ──────────────────────────────────────────
        case "list_drafts": {
          const collections = a["collection"]
            ? [String(a["collection"])]
            : config.collections.map((c) => c.name);
          const drafts = [];
          for (const col of collections) {
            const { documents } = await content.findMany(col, { status: "draft", limit: 100 });
            for (const doc of documents) {
              drafts.push({
                collection: col,
                slug: doc.slug,
                title: String(doc.data["title"] ?? doc.data["name"] ?? doc.slug),
                updatedAt: doc.updatedAt,
              });
            }
          }
          result = { total: drafts.length, drafts };
          break;
        }

        case "get_version_history": {
          const col = String(a["collection"] ?? "");
          const slug = String(a["slug"] ?? "");
          const doc = await content.findBySlug(col, slug);
          if (!doc) { result = { error: `Document "${slug}" not found` }; break; }
          result = { collection: col, slug, id: doc.id, note: "Version history is stored in _data/revisions/ by the admin UI" };
          break;
        }

        default:
          return { content: [{ type: "text" as const, text: `Unknown tool: ${name}` }], isError: true };
      }

      const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
      return { content: [{ type: "text" as const, text }] };
    } catch (err) {
      const msg = (err as Error).message;
      audit("error", undefined, msg ?? "unknown error");
      return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
    }
  });

  return server;
}
