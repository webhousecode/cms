"use client";

import { Wrench, Check, AlertCircle } from "lucide-react";

const TOOL_LABELS: Record<string, string> = {
  site_summary: "Getting site overview",
  list_documents: "Listing documents",
  get_document: "Reading document",
  search_content: "Searching content",
  get_schema: "Reading schema",
  list_drafts: "Checking drafts",
  get_site_config: "Reading site config",
};

interface ToolCallCardProps {
  tool: string;
  input?: Record<string, unknown>;
  result?: string;
  status: "running" | "done" | "error";
}

export function ToolCallCard({ tool, input, result, status }: ToolCallCardProps) {
  const label = TOOL_LABELS[tool] ?? tool.replace(/_/g, " ");
  const detail = input?.collection
    ? `${input.collection}${input.slug ? `/${input.slug}` : ""}`
    : input?.query
      ? `"${input.query}"`
      : "";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "8px",
        padding: "6px 10px",
        margin: "4px 0",
        borderRadius: "6px",
        fontSize: "0.75rem",
        backgroundColor: "var(--muted)",
        border: "1px solid var(--border)",
        color: "var(--muted-foreground)",
      }}
    >
      {status === "running" ? (
        <Wrench style={{ width: "0.8rem", height: "0.8rem", marginTop: "1px", flexShrink: 0 }} className="animate-spin" />
      ) : status === "error" ? (
        <AlertCircle style={{ width: "0.8rem", height: "0.8rem", marginTop: "1px", flexShrink: 0, color: "var(--destructive)" }} />
      ) : (
        <Check style={{ width: "0.8rem", height: "0.8rem", marginTop: "1px", flexShrink: 0, color: "rgb(74 222 128)" }} />
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
