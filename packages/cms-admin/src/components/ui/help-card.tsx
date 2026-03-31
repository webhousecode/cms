"use client";

import { useState } from "react";
import { Lightbulb, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { getHelpArticle, type HelpArticle } from "@/lib/help/articles";

interface HelpCardProps {
  /** Article ID from the help registry */
  articleId: string;
  /** "inline" = expanded by default, "compact" = collapsed by default */
  variant?: "inline" | "compact";
}

/** Simple markdown renderer — bold, lists, code, paragraphs */
function renderMarkdown(md: string): React.ReactNode[] {
  return md.split("\n\n").map((block, i) => {
    const lines = block.split("\n");
    const isList = lines.every((l) => /^(\d+\.\s|\*\s|-\s|$)/.test(l.trim()));

    if (isList && lines.some((l) => l.trim())) {
      return (
        <ul key={i} style={{ margin: "0.25rem 0", paddingLeft: "1.25rem", listStyle: "disc" }}>
          {lines.filter((l) => l.trim()).map((l, j) => (
            <li key={j} style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", lineHeight: 1.6 }}>
              {renderInline(l.replace(/^(\d+\.\s|\*\s|-\s)/, ""))}
            </li>
          ))}
        </ul>
      );
    }

    return (
      <p key={i} style={{ margin: "0.25rem 0", fontSize: "0.75rem", color: "var(--muted-foreground)", lineHeight: 1.6 }}>
        {renderInline(block)}
      </p>
    );
  });
}

/** Inline markdown: **bold**, `code` */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const codeMatch = remaining.match(/`(.+?)`/);

    const matches = [
      boldMatch ? { type: "bold", index: boldMatch.index!, match: boldMatch } : null,
      codeMatch ? { type: "code", index: codeMatch.index!, match: codeMatch } : null,
    ].filter(Boolean).sort((a, b) => a!.index - b!.index);

    if (matches.length === 0) {
      parts.push(remaining);
      break;
    }

    const first = matches[0]!;
    if (first.index > 0) parts.push(remaining.slice(0, first.index));

    if (first.type === "bold") {
      parts.push(<strong key={key++} style={{ color: "var(--foreground)", fontWeight: 600 }}>{first.match![1]}</strong>);
    } else {
      parts.push(<code key={key++} style={{ fontSize: "0.7rem", padding: "0.1rem 0.3rem", borderRadius: "3px", background: "var(--secondary)", fontFamily: "monospace" }}>{first.match![1]}</code>);
    }
    remaining = remaining.slice(first.index + first.match![0].length);
  }

  return <>{parts}</>;
}

export function HelpCard({ articleId, variant = "inline" }: HelpCardProps) {
  const article = getHelpArticle(articleId);
  const [expanded, setExpanded] = useState(variant === "inline");

  if (!article) return null;

  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: "8px",
      background: "var(--card)", overflow: "hidden",
    }}>
      {/* Header — always visible, clickable to toggle */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: "0.5rem",
          padding: expanded ? "0.75rem 1rem 0.5rem" : "0.5rem 0.75rem",
          border: "none", background: "none", cursor: "pointer",
          color: "var(--foreground)", textAlign: "left",
        }}
      >
        <Lightbulb style={{ width: 14, height: 14, color: "#F7BB2E", flexShrink: 0 }} />
        <span style={{ flex: 1, fontWeight: expanded ? 600 : 500, fontSize: expanded ? "0.8rem" : "0.72rem" }}>
          {article.title}
        </span>
        {expanded
          ? <ChevronUp style={{ width: 12, height: 12, color: "var(--muted-foreground)" }} />
          : <ChevronDown style={{ width: 12, height: 12, color: "var(--muted-foreground)" }} />
        }
      </button>

      {/* Body — collapsible */}
      {expanded && (
        <div style={{ padding: "0 1rem 0.75rem" }}>
          {renderMarkdown(article.body)}

          {/* Actions */}
          {article.actions && article.actions.length > 0 && (
            <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {article.actions.map((action, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.72rem" }}>
                  <span style={{ color: "#F7BB2E" }}>→</span>
                  {action.href ? (
                    <a href={action.href} style={{ color: "var(--foreground)", textDecoration: "none" }}>{action.label}</a>
                  ) : (
                    <span style={{ color: "var(--foreground)" }}>{action.label}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Learn more link */}
          {article.learnMorePath && (
            <div style={{ marginTop: "0.75rem" }}>
              <a
                href={`https://docs.webhouse.app${article.learnMorePath}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: "0.7rem", color: "#F7BB2E", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
              >
                Learn more at docs <ExternalLink style={{ width: 10, height: 10 }} />
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
