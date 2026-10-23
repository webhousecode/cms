"use client";

import { Wrench, Check, AlertCircle, Plus, Pencil, Send, Undo2, Trash2, Sparkles, RotateCcw, Search, Brain } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useT } from "@/lib/i18n-context";

interface ToolMeta {
  /** i18n key, translated where it renders */
  label: string;
  icon?: LucideIcon;
  destructive?: boolean;
}

const TOOL_META: Record<string, ToolMeta> = {
  // Phase 1: Read
  site_summary:      { label: "chat.toolCallCard.siteSummary" },
  list_documents:    { label: "chat.toolCallCard.listDocuments" },
  get_document:      { label: "chat.toolCallCard.getDocument" },
  search_content:    { label: "chat.toolCallCard.searchContent" },
  get_schema:        { label: "chat.toolCallCard.getSchema" },
  list_drafts:       { label: "chat.toolCallCard.listDrafts" },
  get_site_config:   { label: "chat.toolCallCard.getSiteConfig" },
  // Settings
  update_site_settings: { label: "chat.toolCallCard.updateSiteSettings", icon: Pencil },
  // Media
  list_media:        { label: "chat.toolCallCard.listMedia" },
  search_media:      { label: "chat.toolCallCard.searchMedia", icon: Search },
  // Phase 3: Forms
  show_edit_form:    { label: "chat.toolCallCard.showEditForm", icon: Pencil },
  // Artifacts
  generate_interactive: { label: "chat.toolCallCard.generateInteractive", icon: Sparkles },
  // Operations
  list_scheduled:    { label: "chat.toolCallCard.listScheduled" },
  list_agents:       { label: "chat.toolCallCard.listAgents" },
  create_agent:      { label: "chat.toolCallCard.createAgent", icon: Plus },
  run_agent:         { label: "chat.toolCallCard.runAgent", icon: Sparkles },
  list_curation_queue: { label: "chat.toolCallCard.listCurationQueue" },
  approve_queue_item:  { label: "chat.toolCallCard.approveQueueItem", icon: Check },
  reject_queue_item:   { label: "chat.toolCallCard.rejectQueueItem", icon: AlertCircle },
  trigger_deploy:    { label: "chat.toolCallCard.triggerDeploy", icon: Send },
  trigger_build:     { label: "chat.toolCallCard.triggerBuild" },
  list_revisions:    { label: "chat.toolCallCard.listRevisions" },
  clone_document:    { label: "chat.toolCallCard.cloneDocument", icon: Plus },
  list_trash:        { label: "chat.toolCallCard.listTrash" },
  restore_from_trash:{ label: "chat.toolCallCard.restoreFromTrash", icon: RotateCcw },
  empty_trash:       { label: "chat.toolCallCard.emptyTrash", icon: Trash2, destructive: true },
  run_link_check:    { label: "chat.toolCallCard.runLinkCheck" },
  create_backup:     { label: "chat.toolCallCard.createBackup" },
  content_stats:     { label: "chat.toolCallCard.contentStats" },
  list_deploy_history: { label: "chat.toolCallCard.listDeployHistory" },
  // Phase 2: Write
  create_document:   { label: "chat.toolCallCard.createDocument", icon: Plus },
  update_document:   { label: "chat.toolCallCard.updateDocument", icon: Pencil },
  publish_document:  { label: "chat.toolCallCard.publishDocument", icon: Send },
  unpublish_document:{ label: "chat.toolCallCard.unpublishDocument", icon: Undo2 },
  trash_document:    { label: "chat.toolCallCard.trashDocument", icon: Trash2, destructive: true },
  generate_content:  { label: "chat.toolCallCard.generateContent", icon: Sparkles },
  rewrite_field:     { label: "chat.toolCallCard.rewriteField", icon: RotateCcw },
  // Phase 4: Bulk & Workflow
  bulk_publish:      { label: "chat.toolCallCard.bulkPublish", icon: Send },
  bulk_update:       { label: "chat.toolCallCard.bulkUpdate", icon: Pencil },
  schedule_publish:  { label: "chat.toolCallCard.schedulePublish", icon: Sparkles },
  // Translation
  translate_document:{ label: "chat.toolCallCard.translateDocument", icon: Sparkles },
  translate_site:    { label: "chat.toolCallCard.translateSite", icon: Sparkles },
  // Lighthouse (F98)
  get_lighthouse_scores: { label: "chat.toolCallCard.getLighthouseScores" },
  get_lighthouse_history:{ label: "chat.toolCallCard.getLighthouseHistory" },
  run_lighthouse:        { label: "chat.toolCallCard.runLighthouse", icon: Sparkles },
  // Forms (F30)
  list_form_submissions: { label: "chat.toolCallCard.listFormSubmissions" },
  get_form_submission:   { label: "chat.toolCallCard.getFormSubmission" },
  form_stats:            { label: "chat.toolCallCard.formStats" },
  // Memory (F114)
  search_memories:   { label: "chat.toolCallCard.searchMemories", icon: Brain },
  add_memory:        { label: "chat.toolCallCard.addMemory", icon: Brain },
  forget_memory:     { label: "chat.toolCallCard.forgetMemory", icon: Brain },
};

interface ToolCallCardProps {
  tool: string;
  input?: Record<string, unknown>;
  result?: string;
  status: "running" | "done" | "error";
}

export function ToolCallCard({ tool, input, result, status }: ToolCallCardProps) {
  const t = useT();
  const known = TOOL_META[tool];
  const meta = known ?? { label: tool.replace(/_/g, " ") };
  const label = known ? t(known.label) : meta.label;
  const detail = input?.collection
    ? `${input.collection}${input.slug ? `/${input.slug}` : ""}`
    : input?.query
      ? `"${input.query}"`
      : "";

  const isDestructive = meta.destructive;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "6px 10px",
        margin: "4px 0",
        borderRadius: "6px",
        fontSize: "0.75rem",
        backgroundColor: isDestructive ? "rgba(239, 68, 68, 0.08)" : "var(--muted)",
        border: `1px solid ${isDestructive ? "rgba(239, 68, 68, 0.25)" : "var(--border)"}`,
        color: isDestructive ? "var(--destructive)" : "var(--muted-foreground)",
      }}
    >
      {status === "running" ? (
        <Wrench style={{ width: "0.8rem", height: "0.8rem", flexShrink: 0 }} className="animate-spin" />
      ) : status === "error" ? (
        <AlertCircle style={{ width: "0.8rem", height: "0.8rem", flexShrink: 0, color: "var(--destructive)" }} />
      ) : meta.icon ? (
        <meta.icon style={{ width: "0.8rem", height: "0.8rem", flexShrink: 0, color: isDestructive ? "var(--destructive)" : "rgb(74 222 128)" }} />
      ) : (
        <Check style={{ width: "0.8rem", height: "0.8rem", flexShrink: 0, color: "rgb(74 222 128)" }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 500 }}>{label}</span>
        {detail && (
          <span style={{ marginLeft: "6px", opacity: 0.7 }}>{detail}</span>
        )}
      </div>
    </div>
  );
}
