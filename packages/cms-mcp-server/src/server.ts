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
  generateContent(collection: string, slug: string, field: string, prompt: string): Promise<string>;
  generateInteractive(title: string, description: string): Promise<string>;
}

/** Service callbacks injected by the host (Next.js app router) for admin-only operations */
export interface AdminServices {
  readSiteConfig(): Promise<any>;
  writeSiteConfig(patch: Record<string, unknown>): Promise<any>;
  listMedia(type: string, limit: number): Promise<string>;
  searchMedia(query: string, type: string, limit: number): Promise<string>;
  listAgents(): Promise<any[]>;
  createAgent(opts: Record<string, unknown>): Promise<any>;
  runAgent(agentId: string, prompt: string, collection?: string): Promise<any>;
  listCurationQueue(status?: string): Promise<{ items: any[]; stats: Record<string, number> }>;
  approveQueueItem(id: string, asDraft: boolean): Promise<any>;
  rejectQueueItem(id: string, feedback: string): Promise<any>;
  triggerDeploy(): Promise<any>;
  listDeploys(): Promise<any[]>;
  listRevisions(collection: string, slug: string): Promise<any[]>;
  readLinkCheckResult(): Promise<any>;
  createBackup(): Promise<any>;
  translateDocument(collection: string, slug: string, targetLocale: string, publish: boolean): Promise<any>;
  translateSite(targetLocale: string, publish: boolean): Promise<any>;
  listTrashedMedia(): Promise<Array<{ name: string; folder?: string; trashedAt?: string }>>;
  deleteTrashedMedia(): Promise<number>;
}

export interface AdminServerOptions {
  content: ContentService;
  config: CmsConfig;
  scopes: string[];
  actor: string;
  ai?: AiGenerator;
  services?: AdminServices;
  onBuild?: (mode: "full" | "incremental") => Promise<{ ok: boolean; message: string }>;
}

export function createAdminMcpServer(opts: AdminServerOptions): Server {
  const reader = new ContentReader(opts.content, opts.config);
  const { content, config, scopes, actor, ai, services, onBuild } = opts;

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
          if (!existing) { result = { error: `Document "${slug}" not found in "${col}"` }; break; }
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

        case "trash_document": {
          const col = String(a["collection"] ?? "");
          const slug = String(a["slug"] ?? "");
          const existing = await content.findBySlug(col, slug);
          if (!existing) { result = { error: `Document "${slug}" not found` }; break; }
          await content.update(col, existing.id, {
            status: "trashed" as any,
            data: { ...existing.data, _trashedAt: new Date().toISOString() },
          });
          result = { slug, status: "trashed" };
          audit("success", `${col}/${slug}`);
          break;
        }

        case "clone_document": {
          const col = String(a["collection"] ?? "");
          const slug = String(a["slug"] ?? "");
          const existing = await content.findBySlug(col, slug);
          if (!existing) { result = { error: `Document "${slug}" not found` }; break; }
          let newSlug = `${slug}-copy`;
          let dup = await content.findBySlug(col, newSlug).catch(() => null);
          let n = 2;
          while (dup) { newSlug = `${slug}-copy-${n}`; dup = await content.findBySlug(col, newSlug).catch(() => null); n++; }
          const cloned = await content.create(col, { slug: newSlug, status: "draft", data: { ...existing.data }, ...(existing.locale ? { locale: existing.locale } : {}) });
          result = { slug: cloned.slug, collection: col, clonedFrom: slug };
          audit("success", `${col}/${cloned.slug}`);
          break;
        }

        case "restore_from_trash": {
          const col = String(a["collection"] ?? "");
          const slug = String(a["slug"] ?? "");
          const existing = await content.findBySlug(col, slug);
          if (!existing) { result = { error: `Document "${slug}" not found` }; break; }
          if ((existing.status as string) !== "trashed") { result = { error: `Document is not trashed (status: ${existing.status})` }; break; }
          const data = { ...existing.data };
          delete data._trashedAt;
          await content.update(col, existing.id, { status: "draft", data });
          result = { slug, status: "draft", restored: true };
          audit("success", `${col}/${slug}`);
          break;
        }

        case "empty_trash": {
          let deleted = 0;
          for (const col of config.collections) {
            const { documents } = await content.findMany(col.name, {}).catch(() => ({ documents: [] as any[] }));
            for (const d of documents) {
              if ((d.status as string) === "trashed") {
                await content.delete(col.name, d.id);
                deleted++;
              }
            }
          }
          // Also delete trashed media
          if (services) {
            try { deleted += await services.deleteTrashedMedia(); } catch { /* ignore */ }
          }
          result = { deleted };
          audit("success", undefined, `Deleted ${deleted} items`);
          break;
        }

        // ── AI tools ─────────────────────────────────────────────
        case "generate_with_ai": {
          if (!ai) { result = { error: "AI provider not configured" }; break; }
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
          if (!ai) { result = { error: "AI provider not configured" }; break; }
          const col = String(a["collection"] ?? "");
          const slug = String(a["slug"] ?? "");
          const field = String(a["field"] ?? "");
          const instruction = String(a["instruction"] ?? "");
          const existing = await content.findBySlug(col, slug);
          if (!existing) { result = { error: `Document "${slug}" not found` }; break; }
          const { isFieldLocked } = await import("@webhouse/cms");
          if (isFieldLocked(existing._fieldMeta ?? {}, field)) {
            result = { error: `FIELD_LOCKED: Field '${field}' is AI-locked` };
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

        case "generate_content": {
          if (!ai) { result = { error: "AI provider not configured" }; break; }
          const col = String(a["collection"] ?? "");
          const slug = String(a["slug"] ?? "");
          const field = String(a["field"] ?? "");
          const prompt = String(a["prompt"] ?? "");
          const existing = await content.findBySlug(col, slug);
          if (!existing) { result = { error: `Document "${slug}" not found` }; break; }
          const generated = await ai.generateContent(col, slug, field, prompt);
          await content.updateWithContext(col, existing.id, { data: { ...existing.data, [field]: generated } }, { actor: "ai", aiModel: "mcp-generate" });
          result = { slug, field, preview: generated.slice(0, 300) };
          audit("success", `${col}/${slug}`);
          break;
        }

        case "generate_interactive": {
          if (!ai) { result = { error: "AI provider not configured" }; break; }
          const title = String(a["title"] ?? "");
          const desc = String(a["description"] ?? "");
          const html = await ai.generateInteractive(title, desc);
          result = { title, html: html.slice(0, 200) + "...", fullLength: html.length };
          audit("success");
          break;
        }

        // ── Translation tools ────────────────────────────────────
        case "translate_document": {
          if (!services) { result = { error: "Services not configured" }; break; }
          const col = String(a["collection"] ?? "");
          const slug = String(a["slug"] ?? "");
          const targetLocale = String(a["targetLocale"] ?? "");
          const publish = a["publish"] === true;
          result = await services.translateDocument(col, slug, targetLocale, publish);
          audit("success", `${col}/${slug}`);
          break;
        }

        case "translate_site": {
          if (!services) { result = { error: "Services not configured" }; break; }
          const targetLocale = String(a["targetLocale"] ?? "");
          const publish = a["publish"] === true;
          result = await services.translateSite(targetLocale, publish);
          audit("success");
          break;
        }

        // ── Build & Deploy ───────────────────────────────────────
        case "trigger_build": {
          if (!onBuild) { result = { error: "Build not configured" }; break; }
          const mode = (a["mode"] as "full" | "incremental") ?? "incremental";
          result = await onBuild(mode);
          audit("success");
          break;
        }

        case "trigger_deploy": {
          if (!services) { result = { error: "Services not configured" }; break; }
          result = await services.triggerDeploy();
          audit("success");
          break;
        }

        case "list_deploy_history": {
          if (!services) { result = { error: "Services not configured" }; break; }
          const deploys = await services.listDeploys();
          result = { deploys: deploys.slice(0, 10) };
          break;
        }

        // ── Bulk operations ──────────────────────────────────────
        case "bulk_publish": {
          const targetCol = a["collection"] ? String(a["collection"]) : null;
          const collections = targetCol
            ? config.collections.filter((c) => c.name === targetCol)
            : config.collections.filter((c) => c.name !== "global");
          if (targetCol && collections.length === 0) { result = { error: `Collection "${targetCol}" not found` }; break; }
          const published: string[] = [];
          for (const col of collections) {
            const { documents } = await content.findMany(col.name, {}).catch(() => ({ documents: [] as any[] }));
            for (const d of documents) {
              if (d.status === "draft") {
                await content.update(col.name, d.id, { status: "published" });
                published.push(`${col.name}/${d.slug}`);
              }
            }
          }
          result = { published: published.length, documents: published };
          audit("success", undefined, `Published ${published.length} documents`);
          break;
        }

        case "bulk_update": {
          const col = String(a["collection"] ?? "");
          const field = String(a["field"] ?? "");
          const value = a["value"];
          const mode = String(a["mode"] ?? "set");
          const filter = (a["filter"] ?? {}) as { status?: string; slugs?: string[] };
          const colDef = config.collections.find((c) => c.name === col);
          if (!colDef) { result = { error: `Collection "${col}" not found` }; break; }
          const { documents } = await content.findMany(col, {}).catch(() => ({ documents: [] as any[] }));
          let targets = documents.filter((d: any) => d.status !== "trashed");
          if (filter.status) targets = targets.filter((d: any) => d.status === filter.status);
          if (filter.slugs?.length) { const s = new Set(filter.slugs); targets = targets.filter((d: any) => s.has(d.slug)); }
          const updated: string[] = [];
          for (const d of targets) {
            let newValue = value;
            if (mode === "append" && Array.isArray(value)) {
              const existing = Array.isArray(d.data[field]) ? d.data[field] : [];
              newValue = [...existing, ...value.filter((v: any) => !existing.includes(v))];
            }
            await content.update(col, d.id, { data: { ...d.data, [field]: newValue } });
            updated.push(d.slug);
          }
          result = { updated: updated.length, slugs: updated, field, mode };
          audit("success", undefined, `Updated ${updated.length} documents`);
          break;
        }

        // ── Scheduling ───────────────────────────────────────────
        case "schedule_publish": {
          const col = String(a["collection"] ?? "");
          const slug = String(a["slug"] ?? "");
          const existing = await content.findBySlug(col, slug);
          if (!existing) { result = { error: `Document "${slug}" not found` }; break; }
          const update: Record<string, unknown> = {};
          if (a["publishAt"] !== undefined) update.publishAt = a["publishAt"] === "null" || a["publishAt"] === null ? null : String(a["publishAt"]);
          if (a["unpublishAt"] !== undefined) update.unpublishAt = a["unpublishAt"] === "null" || a["unpublishAt"] === null ? null : String(a["unpublishAt"]);
          if (Object.keys(update).length === 0) { result = { error: "Provide publishAt and/or unpublishAt" }; break; }
          await content.update(col, existing.id, update);
          result = { slug, ...update };
          audit("success", `${col}/${slug}`);
          break;
        }

        case "list_scheduled": {
          const items: Array<{ title: string; collection: string; slug: string; status: string; publishAt?: string; unpublishAt?: string }> = [];
          for (const col of config.collections) {
            if (col.name === "global") continue;
            const { documents } = await content.findMany(col.name, {}).catch(() => ({ documents: [] as any[] }));
            for (const d of documents) {
              if (d.publishAt || d.unpublishAt) {
                items.push({ title: String(d.data.title ?? d.slug), collection: col.name, slug: d.slug, status: d.status, publishAt: d.publishAt, unpublishAt: d.unpublishAt });
              }
            }
          }
          result = { total: items.length, items };
          break;
        }

        // ── Drafts ───────────────────────────────────────────────
        case "list_drafts": {
          const collections = a["collection"]
            ? [String(a["collection"])]
            : config.collections.map((c) => c.name);
          const drafts: Array<{ collection: string; slug: string; title: string; updatedAt: string }> = [];
          for (const col of collections) {
            const { documents } = await content.findMany(col, { status: "draft", limit: 100 });
            for (const doc of documents) {
              drafts.push({ collection: col, slug: doc.slug, title: String(doc.data["title"] ?? doc.data["name"] ?? doc.slug), updatedAt: doc.updatedAt });
            }
          }
          result = { total: drafts.length, drafts };
          break;
        }

        case "get_version_history": {
          if (!services) {
            result = { note: "Version history requires services" };
            break;
          }
          const col = String(a["collection"] ?? "");
          const slug = String(a["slug"] ?? "");
          const revisions = await services.listRevisions(col, slug);
          result = { collection: col, slug, revisions };
          break;
        }

        // ── Config & Stats ───────────────────────────────────────
        case "get_site_config": {
          if (!services) { result = { error: "Services not configured" }; break; }
          result = await services.readSiteConfig();
          break;
        }

        case "update_site_settings": {
          if (!services) { result = { error: "Services not configured" }; break; }
          const patch = (a["settings"] as Record<string, unknown>) ?? {};
          const blocked = ["anthropicApiKey", "openaiApiKey", "geminiApiKey", "braveApiKey", "tavilyApiKey", "resendApiKey", "deployApiToken", "calendarSecret"];
          const attempted = Object.keys(patch).filter((k) => blocked.includes(k));
          if (attempted.length > 0) { result = { error: `Cannot update sensitive fields: ${attempted.join(", ")}` }; break; }
          result = await services.writeSiteConfig(patch);
          audit("success");
          break;
        }

        case "content_stats": {
          let totalDocs = 0, totalWords = 0, published = 0, drafts = 0;
          for (const col of config.collections) {
            if (col.name === "global") continue;
            const { documents } = await content.findMany(col.name, {}).catch(() => ({ documents: [] as any[] }));
            for (const d of documents) {
              if (d.status === "trashed") continue;
              totalDocs++;
              if (d.status === "published") published++;
              if (d.status === "draft") drafts++;
              totalWords += String(d.data.content ?? d.data.body ?? "").split(/\s+/).filter(Boolean).length;
            }
          }
          result = { totalDocuments: totalDocs, published, drafts, totalWords };
          break;
        }

        // ── Media ────────────────────────────────────────────────
        case "list_media": {
          if (!services) { result = { error: "Services not configured" }; break; }
          const text = await services.listMedia(String(a["type"] ?? "all"), Number(a["limit"] ?? 50));
          result = text;
          break;
        }

        case "search_media": {
          if (!services) { result = { error: "Services not configured" }; break; }
          const text = await services.searchMedia(String(a["query"] ?? ""), String(a["type"] ?? "image"), Number(a["limit"] ?? 10));
          result = text;
          break;
        }

        // ── Trash ────────────────────────────────────────────────
        case "list_trash": {
          const trashItems: Array<{ title: string; type: string; collection?: string; slug?: string; trashedAt?: string }> = [];
          for (const col of config.collections) {
            const { documents } = await content.findMany(col.name, {}).catch(() => ({ documents: [] as any[] }));
            for (const d of documents) {
              if ((d.status as string) === "trashed") {
                trashItems.push({ title: String(d.data.title ?? d.slug), type: "document", collection: col.name, slug: d.slug, trashedAt: d.data._trashedAt as string });
              }
            }
          }
          // Media trash
          if (services) {
            try {
              const trashedMedia = await services.listTrashedMedia();
              for (const m of trashedMedia) {
                trashItems.push({ title: m.name, type: "media", trashedAt: m.trashedAt ?? "" });
              }
            } catch { /* media trash not available */ }
          }
          result = { total: trashItems.length, items: trashItems };
          break;
        }

        // ── Agents & Curation ────────────────────────────────────
        case "list_agents": {
          if (!services) { result = { error: "Services not configured" }; break; }
          result = await services.listAgents();
          break;
        }

        case "create_agent": {
          if (!services) { result = { error: "Services not configured" }; break; }
          result = await services.createAgent(a);
          audit("success");
          break;
        }

        case "run_agent": {
          if (!services) { result = { error: "Services not configured" }; break; }
          result = await services.runAgent(String(a["agentId"]), String(a["prompt"]), a["collection"] ? String(a["collection"]) : undefined);
          audit("success");
          break;
        }

        case "list_curation_queue": {
          if (!services) { result = { error: "Services not configured" }; break; }
          result = await services.listCurationQueue(a["status"] ? String(a["status"]) : undefined);
          break;
        }

        case "approve_queue_item": {
          if (!services) { result = { error: "Services not configured" }; break; }
          result = await services.approveQueueItem(String(a["id"]), a["asDraft"] === true);
          audit("success");
          break;
        }

        case "reject_queue_item": {
          if (!services) { result = { error: "Services not configured" }; break; }
          result = await services.rejectQueueItem(String(a["id"]), String(a["feedback"]));
          audit("success");
          break;
        }

        // ── Maintenance ──────────────────────────────────────────
        case "list_revisions": {
          if (!services) { result = { error: "Services not configured" }; break; }
          const col = String(a["collection"] ?? "");
          const slug = String(a["slug"] ?? "");
          result = await services.listRevisions(col, slug);
          break;
        }

        case "run_link_check": {
          if (!services) { result = { error: "Services not configured" }; break; }
          result = await services.readLinkCheckResult();
          if (!result) result = { note: "No link check results yet" };
          break;
        }

        case "create_backup": {
          if (!services) { result = { error: "Services not configured" }; break; }
          result = await services.createBackup();
          audit("success");
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
