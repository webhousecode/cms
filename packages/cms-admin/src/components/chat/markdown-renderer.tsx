"use client";

import { Fragment, useState, useEffect, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import { PagePreviewCard } from "./page-preview-card";

/**
 * Rich markdown renderer for chat messages.
 * Supports: headings, bold, italic, inline code, code blocks, tables,
 * ordered/unordered lists, blockquotes, horizontal rules, links.
 */
export function MarkdownRenderer({ text }: { text: string }) {
  if (!text) return null;
  // Decode common HTML entities that AI might generate
  const clean = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
  const blocks = parseBlocks(clean);
  return <>{blocks.map((block, i) => renderBlock(block, i))}</>;
}

/** Small copy button — used on code blocks */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);
  return (
    <button
      onClick={handleCopy}
      title="Copy"
      style={{
        position: "absolute",
        top: "6px",
        right: "6px",
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "4px",
        padding: "3px 5px",
        cursor: "pointer",
        color: copied ? "rgb(74 222 128)" : "var(--muted-foreground)",
        display: "flex",
        alignItems: "center",
        gap: "3px",
        fontSize: "0.65rem",
        opacity: copied ? 1 : 0.6,
        transition: "opacity 150ms",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
      onMouseLeave={(e) => { if (!copied) e.currentTarget.style.opacity = "0.6"; }}
    >
      {copied ? <Check style={{ width: "11px", height: "11px" }} /> : <Copy style={{ width: "11px", height: "11px" }} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ── Block-level parsing ──────────────────────────────────

interface Block {
  type: "paragraph" | "heading" | "code" | "table" | "ul" | "ol" | "blockquote" | "hr" | "preview";
  content: string;
  level?: number; // heading level 1-3
  lang?: string;  // code block language
  rows?: string[][]; // table rows
}

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Page preview embed: [preview:/path]
    const previewMatch = line.match(/^\[preview:(\/[^\]]+)\]$/);
    if (previewMatch) {
      blocks.push({ type: "preview", content: previewMatch[1] });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      blocks.push({ type: "hr", content: "" });
      i++;
      continue;
    }

    // Code block (fenced)
    if (line.trimStart().startsWith("```")) {
      const lang = line.trimStart().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: "code", content: codeLines.join("\n"), lang });
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      blocks.push({ type: "heading", content: headingMatch[2], level: headingMatch[1].length });
      i++;
      continue;
    }

    // Table (pipes)
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?[\s-:|]+\|/.test(lines[i + 1])) {
      const tableLines: string[] = [line];
      i++;
      // Skip separator
      i++;
      while (i < lines.length && lines[i].includes("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      const rows = tableLines.map((l) =>
        l.split("|").map((c) => c.trim()).filter((c) => c !== "")
      );
      blocks.push({ type: "table", content: "", rows });
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i].startsWith("> ") || lines[i].startsWith(">"))) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "blockquote", content: quoteLines.join("\n") });
      continue;
    }

    // Unordered list
    if (/^[-*•]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*•]\s/, ""));
        i++;
      }
      blocks.push({ type: "ul", content: items.join("\n") });
      continue;
    }

    // Ordered list
    if (/^\d+[.)]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+[.)]\s/, ""));
        i++;
      }
      blocks.push({ type: "ol", content: items.join("\n") });
      continue;
    }

    // Empty line — skip
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph — collect consecutive non-empty, non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("```") &&
      !lines[i].match(/^#{1,3}\s/) &&
      !lines[i].match(/^[-*•]\s/) &&
      !lines[i].match(/^\d+[.)]\s/) &&
      !lines[i].startsWith("> ") &&
      !/^---+$/.test(lines[i].trim()) &&
      !lines[i].match(/^\[preview:\/[^\]]+\]$/)
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: "paragraph", content: paraLines.join("\n") });
    }
  }

  return blocks;
}

// ── Block rendering ──────────────────────────────────────

function renderBlock(block: Block, key: number): React.ReactNode {
  switch (block.type) {
    case "preview":
      return <PagePreviewCard key={key} pagePath={block.content} />;

    case "hr":
      return (
        <hr
          key={key}
          style={{
            border: "none",
            borderTop: "1px solid var(--border)",
            margin: "16px 0",
          }}
        />
      );

    case "heading": {
      const sizes: Record<number, { fontSize: string; fontWeight: number; margin: string }> = {
        1: { fontSize: "1.25rem", fontWeight: 700, margin: "20px 0 8px" },
        2: { fontSize: "1.1rem", fontWeight: 650, margin: "16px 0 6px" },
        3: { fontSize: "0.95rem", fontWeight: 600, margin: "12px 0 4px" },
      };
      const s = sizes[block.level ?? 2] ?? sizes[2];
      return (
        <div key={key} style={{ fontSize: s.fontSize, fontWeight: s.fontWeight, margin: s.margin, color: "var(--foreground)" }}>
          <InlineRich text={block.content} />
        </div>
      );
    }

    case "code":
      return (
        <div key={key} style={{ position: "relative", margin: "8px 0" }}>
          <CopyButton text={block.content} />
          {block.lang && (
            <div style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", padding: "6px 14px 0", backgroundColor: "var(--muted)", borderRadius: "8px 8px 0 0", border: "1px solid var(--border)", borderBottom: "none", fontFamily: "monospace" }}>
              {block.lang}
            </div>
          )}
          <pre
            style={{
              padding: "12px 14px",
              borderRadius: block.lang ? "0 0 8px 8px" : "8px",
              backgroundColor: "var(--muted)",
              border: "1px solid var(--border)",
              borderTop: block.lang ? "none" : undefined,
              fontSize: "0.8rem",
              lineHeight: 1.5,
              fontFamily: "monospace",
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              margin: 0,
            }}
          >
            <code>{block.content}</code>
          </pre>
        </div>
      );

    case "table":
      return (
        <div key={key} style={{ margin: "8px 0", overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.8rem",
            }}
          >
            {block.rows && block.rows.length > 0 && (
              <>
                <thead>
                  <tr>
                    {block.rows[0].map((cell, ci) => (
                      <th
                        key={ci}
                        style={{
                          padding: "8px 12px",
                          textAlign: "left",
                          fontWeight: 600,
                          borderBottom: "2px solid var(--border)",
                          color: "var(--foreground)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <InlineRich text={cell} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.slice(1).map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          style={{
                            padding: "6px 12px",
                            borderBottom: "1px solid var(--border)",
                            color: "var(--muted-foreground)",
                          }}
                        >
                          <InlineRich text={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </>
            )}
          </table>
        </div>
      );

    case "ul":
      return (
        <ul key={key} style={{ margin: "6px 0", paddingLeft: "20px", listStyleType: "disc" }}>
          {block.content.split("\n").map((item, j) => (
            <li key={j} style={{ margin: "3px 0", color: "var(--foreground)" }}>
              <InlineRich text={item} />
            </li>
          ))}
        </ul>
      );

    case "ol":
      return (
        <ol key={key} style={{ margin: "6px 0", paddingLeft: "20px", listStyleType: "decimal" }}>
          {block.content.split("\n").map((item, j) => (
            <li key={j} style={{ margin: "3px 0", color: "var(--foreground)" }}>
              <InlineRich text={item} />
            </li>
          ))}
        </ol>
      );

    case "blockquote":
      return (
        <blockquote
          key={key}
          style={{
            margin: "8px 0",
            padding: "8px 14px",
            borderLeft: "3px solid var(--primary)",
            backgroundColor: "rgba(247, 187, 46, 0.05)",
            borderRadius: "0 6px 6px 0",
            color: "var(--foreground)",
          }}
        >
          <InlineRich text={block.content} />
        </blockquote>
      );

    case "paragraph":
      return (
        <p key={key} style={{ margin: "6px 0", color: "var(--foreground)" }}>
          {block.content.split("\n").map((line, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              <InlineRich text={line} />
            </Fragment>
          ))}
        </p>
      );
  }
}

// ── Inline rendering ─────────────────────────────────────

/** Resolve preview base URL — previewSiteUrl first, sirv as fallback */
let _previewBase: string | null = null;
async function getPreviewBase(): Promise<string> {
  if (_previewBase) return _previewBase;
  // Prefer configured previewSiteUrl
  try {
    const r = await fetch("/api/admin/site-config", { cache: "no-store" });
    if (r.ok) {
      const d = await r.json();
      if (d?.previewSiteUrl) { _previewBase = d.previewSiteUrl.replace(/\/$/, ""); return _previewBase; }
    }
  } catch { /* no config */ }
  // Fallback: sirv
  try {
    const r = await fetch("/api/preview-serve", { method: "POST" });
    if (r.ok) {
      const d = await r.json() as { url?: string };
      if (d?.url) { _previewBase = d.url; return _previewBase; }
    }
  } catch { /* sirv not available */ }
  return "";
}

/** Small pill button for document actions */
/** View pill that only renders when collection is previewable */
function DocPillView({ collection, slug }: { collection: string; slug: string }) {
  const [show, setShow] = useState(true); // optimistic, hide if not previewable
  useEffect(() => {
    fetch(`/api/cms/collections/${collection}/schema`)
      .then(r => r.ok ? r.json() : null)
      .then(schema => { if (schema?.previewable === false) setShow(false); })
      .catch(() => {});
  }, [collection]);
  if (!show) return null;
  return <DocPill collection={collection} slug={slug} variant="view" />;
}

function DocPill({ collection, slug, variant }: { collection: string; slug: string; variant: "edit" | "view" }) {
  const label = variant === "edit" ? "Edit" : "View";
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (variant === "edit") {
          // Navigate to document — ?mode=admin ensures admin UI shows (not chat)
          window.location.href = `/admin/${collection}/${slug}?mode=admin`;
          return;
        } else {
          // Resolve the exact preview URL — fetch doc + collection schema
          const base = await getPreviewBase();
          try {
            const [cfgRes, schemaRes, docRes] = await Promise.all([
              fetch("/api/admin/site-config", { cache: "no-store" }),
              fetch(`/api/cms/collections/${collection}/schema`),
              fetch(`/api/cms/${collection}/${slug}`),
            ]);
            const cfg = cfgRes.ok ? await cfgRes.json() : {};
            const schema = schemaRes.ok ? await schemaRes.json() : null;
            const doc = docRes.ok ? await docRes.json() : null;
            const urlPrefix = (schema?.urlPrefix ?? `/${collection}`).replace(/\/$/, "");
            const docLocale = doc?.locale || cfg.defaultLocale || "";
            const defLocale = cfg.defaultLocale || "en";
            const locPrefix = docLocale && docLocale !== defLocale ? `/${docLocale}` : "";
            const category = doc?.data?.category ? `/${doc.data.category}` : "";
            window.open(`${base}${locPrefix}${urlPrefix}${category}/${slug}/`, "_blank");
          } catch {
            window.open(`${base}/${collection}/${slug}/`, "_blank");
          }
        }
      }}
      style={{
        display: "inline-flex", alignItems: "center", gap: "3px",
        padding: "1px 7px", borderRadius: "4px", fontSize: "0.65rem", fontWeight: 500,
        textDecoration: "none", lineHeight: "1.5", marginLeft: "3px", cursor: "pointer",
        background: variant === "edit" ? "color-mix(in srgb, var(--primary) 15%, transparent)" : "color-mix(in srgb, var(--foreground) 10%, transparent)",
        color: variant === "edit" ? "var(--primary)" : "var(--muted-foreground)",
        border: `1px solid ${variant === "edit" ? "color-mix(in srgb, var(--primary) 30%, transparent)" : "var(--border)"}`,
      }}
    >
      {label}
    </button>
  );
}

/** Render inline markdown: bold, italic, code, links, strikethrough, doc refs */
function InlineRich({ text }: { text: string }) {
  // Split on: `code`, **bold**, *italic*, ~~strike~~, [link](url), [doc:col/slug|Title]
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|\[doc:[^\]]+\]|\[[^\]]+\]\([^)]+\))/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const m = match[0];

    if (m.startsWith("`") && m.endsWith("`")) {
      parts.push(
        <code
          key={match.index}
          style={{
            padding: "2px 6px",
            borderRadius: "4px",
            fontSize: "0.82em",
            backgroundColor: "var(--muted)",
            border: "1px solid var(--border)",
            fontFamily: "monospace",
            color: "var(--primary)",
          }}
        >
          {m.slice(1, -1)}
        </code>
      );
    } else if (m.startsWith("**") && m.endsWith("**")) {
      parts.push(<strong key={match.index} style={{ fontWeight: 600, color: "var(--foreground)" }}>{m.slice(2, -2)}</strong>);
    } else if (m.startsWith("*") && m.endsWith("*")) {
      parts.push(<em key={match.index}>{m.slice(1, -1)}</em>);
    } else if (m.startsWith("~~") && m.endsWith("~~")) {
      parts.push(<s key={match.index} style={{ opacity: 0.6 }}>{m.slice(2, -2)}</s>);
    } else if (m.startsWith("[doc:")) {
      // [doc:collection/slug] or [doc:collection/slug|Title]
      const docMatch = m.match(/^\[doc:([^/]+)\/([^|\]]+)(?:\|([^\]]*))?\]$/);
      if (docMatch) {
        const [, col, slug] = docMatch;
        parts.push(
          <span key={match.index} style={{ whiteSpace: "nowrap" }}>
            <DocPill collection={col} slug={slug} variant="edit" />
            <DocPillView collection={col} slug={slug} />
          </span>
        );
      }
    } else if (m.startsWith("[")) {
      const linkMatch = m.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        parts.push(
          <a
            key={match.index}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--primary)", textDecoration: "underline", textUnderlineOffset: "2px" }}
          >
            {linkMatch[1]}
          </a>
        );
      }
    }

    lastIndex = match.index + m.length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}
