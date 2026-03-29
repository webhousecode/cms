"use client";

import { useState, useEffect } from "react";
import { Lightbulb, ChevronDown, ChevronUp, ExternalLink, X } from "lucide-react";
import { getHelpArticle, type HelpArticle } from "@/lib/help/articles";

interface HelpCardProps {
  /** Article ID from the help registry */
  articleId: string;
  /** "inline" = full card (default), "compact" = collapsible single-line */
  variant?: "inline" | "compact";
}

/** Simple markdown renderer — bold, lists, code, paragraphs */
function renderMarkdown(md: string): React.ReactNode[] {
  return md.split("\n\n").map((block, i) => {
    // Detect if block is a list (all lines start with - or number.)
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
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Code
    const codeMatch = remaining.match(/`(.+?)`/);

    // Find earliest match
    const matches = [
      boldMatch ? { type: "bold", index: boldMatch.index!, match: boldMatch } : null,
      codeMatch ? { type: "code", index: codeMatch.index!, match: codeMatch } : null,
    ].filter(Boolean).sort((a, b) => a!.index - b!.index);

    if (matches.length === 0) {
      parts.push(remaining);
      break;
    }

    const first = matches[0]!;
    if (first.index > 0) {
      parts.push(remaining.slice(0, first.index));
    }

    if (first.type === "bold") {
      parts.push(<strong key={key++} style={{ color: "var(--foreground)", fontWeight: 600 }}>{first.match![1]}</strong>);
      remaining = remaining.slice(first.index + first.match![0].length);
    } else {
      parts.push(<code key={key++} style={{ fontSize: "0.7rem", padding: "0.1rem 0.3rem", borderRadius: "3px", background: "var(--secondary)", fontFamily: "monospace" }}>{first.match![1]}</code>);
      remaining = remaining.slice(first.index + first.match![0].length);
    }
  }

  return <>{parts}</>;
}

export function HelpCard({ articleId, variant = "inline" }: HelpCardProps) {
  const article = getHelpArticle(articleId);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(variant === "inline");
  const [loaded, setLoaded] = useState(false);

  // Check dismissed state from user prefs
  useEffect(() => {
    fetch("/api/admin/user-state")
      .then((r) => r.json())
      .then((state: { dismissedHelp?: string[] }) => {
        if (state.dismissedHelp?.includes(articleId)) setDismissed(true);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [articleId]);

  if (!article || dismissed || !loaded) return null;

  function handleDismiss() {
    setDismissed(true);
    // Persist to user state
    fetch("/api/admin/user-state")
      .then((r) => r.json())
      .then((state: { dismissedHelp?: string[] }) => {
        const existing = state.dismissedHelp ?? [];
        if (!existing.includes(articleId)) {
          fetch("/api/admin/user-state", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dismissedHelp: [...existing, articleId] }),
          });
        }
      })
      .catch(() => {});
  }

  if (variant === "compact") {
    return (
      <div style={{
        border: "1px solid var(--border)", borderRadius: "8px",
        background: "var(--card)", overflow: "hidden",
      }}>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: "0.5rem",
            padding: "0.5rem 0.75rem", border: "none", background: "none",
            cursor: "pointer", color: "var(--muted-foreground)", fontSize: "0.72rem",
          }}
        >
          <Lightbulb style={{ width: 14, height: 14, color: "#F7BB2E", flexShrink: 0 }} />
          <span style={{ flex: 1, textAlign: "left", fontWeight: 500 }}>{article.title}</span>
          {expanded ? <ChevronUp style={{ width: 12, height: 12 }} /> : <ChevronDown style={{ width: 12, height: 12 }} />}
        </button>
        {expanded && (
          <div style={{ padding: "0 0.75rem 0.75rem" }}>
            {renderMarkdown(article.body)}
            {renderActions(article)}
            <DismissRow onDismiss={handleDismiss} />
          </div>
        )}
      </div>
    );
  }

  // Inline variant
  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: "8px",
      background: "var(--card)", padding: "1rem",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <Lightbulb style={{ width: 16, height: 16, color: "#F7BB2E", flexShrink: 0, marginTop: 1 }} />
        <span style={{ flex: 1, fontWeight: 600, fontSize: "0.8rem", color: "var(--foreground)" }}>{article.title}</span>
        <button
          type="button"
          onClick={handleDismiss}
          title="Dismiss"
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 0 }}
        >
          <X style={{ width: 14, height: 14 }} />
        </button>
      </div>

      {renderMarkdown(article.body)}
      {renderActions(article)}

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
  );
}

function renderActions(article: HelpArticle) {
  if (!article.actions?.length) return null;
  return (
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
  );
}

function DismissRow({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div style={{ marginTop: "0.5rem", textAlign: "right" }}>
      <button
        type="button"
        onClick={onDismiss}
        style={{
          background: "none", border: "none", cursor: "pointer",
          fontSize: "0.6rem", color: "var(--muted-foreground)",
          textDecoration: "underline", padding: 0,
        }}
      >
        Don't show again
      </button>
    </div>
  );
}
