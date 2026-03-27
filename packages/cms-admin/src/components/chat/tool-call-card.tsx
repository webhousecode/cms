"use client";

import { Wrench, Check, AlertCircle, Plus, Pencil, Send, Undo2, Trash2, Sparkles, RotateCcw, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface ToolMeta {
  label: string;
  icon?: LucideIcon;
  destructive?: boolean;
}

const TOOL_META: Record<string, ToolMeta> = {
  // Phase 1: Read
  site_summary:      { label: "Getting site overview" },
  list_documents:    { label: "Listing documents" },
  get_document:      { label: "Reading document" },
  search_content:    { label: "Searching content" },
  get_schema:        { label: "Reading schema" },
  list_drafts:       { label: "Checking drafts" },
  get_site_config:   { label: "Reading site config" },
  // Settings
  update_site_settings: { label: "Updating settings", icon: Pencil },
  // Media
  list_media:        { label: "Browsing media library" },
  search_media:      { label: "Searching media", icon: Search },
  // Phase 3: Forms
  show_edit_form:    { label: "Showing edit form", icon: Pencil },
  // Artifacts
  generate_interactive: { label: "Generating interactive", icon: Sparkles },
  // Operations
  list_scheduled:    { label: "Checking calendar" },
  list_agents:       { label: "Listing agents" },
  create_agent:      { label: "Creating agent", icon: Plus },
  run_agent:         { label: "Running agent", icon: Sparkles },
  list_curation_queue: { label: "Checking curation queue" },
  approve_queue_item:  { label: "Approving content", icon: Check },
  reject_queue_item:   { label: "Rejecting content", icon: AlertCircle },
  trigger_deploy:    { label: "Deploying site", icon: Send },
  trigger_build:     { label: "Building site" },
  list_revisions:    { label: "Checking revisions" },
  clone_document:    { label: "Cloning document", icon: Plus },
  list_trash:        { label: "Checking trash" },
  restore_from_trash:{ label: "Restoring from trash", icon: RotateCcw },
  empty_trash:       { label: "Emptying trash", icon: Trash2, destructive: true },
  run_link_check:    { label: "Checking links" },
  create_backup:     { label: "Creating backup" },
  content_stats:     { label: "Calculating stats" },
  list_deploy_history: { label: "Checking deploy history" },
  // Phase 2: Write
  create_document:   { label: "Creating document", icon: Plus },
  update_document:   { label: "Updating document", icon: Pencil },
  publish_document:  { label: "Publishing", icon: Send },
  unpublish_document:{ label: "Unpublishing", icon: Undo2 },
  trash_document:    { label: "Moving to trash", icon: Trash2, destructive: true },
  generate_content:  { label: "Generating content", icon: Sparkles },
  rewrite_field:     { label: "Rewriting field", icon: RotateCcw },
};

interface ToolCallCardProps {
  tool: string;
  input?: Record<string, unknown>;
  result?: string;
  status: "running" | "done" | "error";
}

export function ToolCallCard({ tool, input, result, status }: ToolCallCardProps) {
  const meta = TOOL_META[tool] ?? { label: tool.replace(/_/g, " ") };
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
        <span style={{ fontWeight: 500 }}>{meta.label}</span>
        {detail && (
          <span style={{ marginLeft: "6px", opacity: 0.7 }}>{detail}</span>
        )}
      </div>
    </div>
  );
}
