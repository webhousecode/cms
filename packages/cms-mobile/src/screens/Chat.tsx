import { Fragment, createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";

/** Site context for doc pills — orgId/siteId available to all markdown renderers */
const SiteCtx = createContext<{ orgId: string; siteId: string }>({ orgId: "", siteId: "" });
import { Screen } from "@/components/Screen";
import { ScreenHeader, BackButton } from "@/components/ScreenHeader";
import { startChat, pollChat, listConversations, saveConversation, getConversation as fetchConversation, deleteConversation as apiDeleteConversation, getMemories } from "@/api/client";
import { getActiveOrgId, getActiveSiteId } from "@/lib/prefs";

// ─── Types ───────────────────────────────────────────

interface ToolCall {
  tool: string;
  input?: string;
  result?: string;
  status: "running" | "done" | "error";
}

interface Message {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  thinking?: string;
}

interface Conversation {
  id?: string;
  title: string;
  messages: Message[];
  createdAt?: string;
}

// ─── Quick Action Chips ──────────────────────────────

const QUICK_ACTIONS = [
  { label: "Site overview", icon: "📊" },
  { label: "Show drafts", icon: "📄" },
  { label: "Search content", icon: "🔍" },
  { label: "What can you do?", icon: "🔧" },
];

// ─── Markdown Renderer (ported from desktop chat) ────
// Block-based parser identical to cms-admin's markdown-renderer.tsx
// with CSS vars replaced by dark-mode colors.

const C = {
  fg: "#fff",
  muted: "rgba(255,255,255,0.5)",
  border: "rgba(255,255,255,0.1)",
  bg: "rgba(255,255,255,0.05)",
  gold: "#F7BB2E",
};

interface MdBlock {
  type: "paragraph" | "heading" | "code" | "table" | "ul" | "ol" | "blockquote" | "hr" | "image";
  content: string;
  level?: number;
  lang?: string;
  rows?: string[][];
  alt?: string;
}

function parseMdBlocks(text: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Image
    const imgMatch = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) { blocks.push({ type: "image", content: imgMatch[2], alt: imgMatch[1] }); i++; continue; }
    // HR
    if (/^---+$/.test(line.trim())) { blocks.push({ type: "hr", content: "" }); i++; continue; }
    // Code block
    if (line.trimStart().startsWith("```")) {
      const lang = line.trimStart().slice(3).trim();
      const codeLines: string[] = []; i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) { codeLines.push(lines[i]); i++; }
      i++;
      blocks.push({ type: "code", content: codeLines.join("\n"), lang }); continue;
    }
    // Heading
    const hm = line.match(/^(#{1,3})\s+(.+)/);
    if (hm) { blocks.push({ type: "heading", content: hm[2], level: hm[1].length }); i++; continue; }
    // Table
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?[\s-:|]+\|/.test(lines[i + 1])) {
      const tl: string[] = [line]; i++; i++;
      while (i < lines.length && lines[i].includes("|")) { tl.push(lines[i]); i++; }
      const rows = tl.map((l) => l.split("|").map((c) => c.trim()).filter((c) => c !== ""));
      blocks.push({ type: "table", content: "", rows }); continue;
    }
    // Blockquote
    if (line.startsWith("> ")) {
      const ql: string[] = [];
      while (i < lines.length && (lines[i].startsWith("> ") || lines[i].startsWith(">"))) { ql.push(lines[i].replace(/^>\s?/, "")); i++; }
      blocks.push({ type: "blockquote", content: ql.join("\n") }); continue;
    }
    // UL
    if (/^[-*•]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s/.test(lines[i])) { items.push(lines[i].replace(/^[-*•]\s/, "")); i++; }
      blocks.push({ type: "ul", content: items.join("\n") }); continue;
    }
    // OL
    if (/^\d+[.)]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s/.test(lines[i])) { items.push(lines[i].replace(/^\d+[.)]\s/, "")); i++; }
      blocks.push({ type: "ol", content: items.join("\n") }); continue;
    }
    // Empty
    if (line.trim() === "") { i++; continue; }
    // Paragraph
    const pl: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !lines[i].startsWith("```") && !lines[i].match(/^#{1,3}\s/) && !lines[i].match(/^[-*•]\s/) && !lines[i].match(/^\d+[.)]\s/) && !lines[i].startsWith("> ") && !/^---+$/.test(lines[i].trim())) {
      pl.push(lines[i]); i++;
    }
    if (pl.length > 0) blocks.push({ type: "paragraph", content: pl.join("\n") });
  }
  return blocks;
}

function DocPill({ collection, slug, variant }: { collection: string; slug: string; variant: "edit" | "view" }) {
  const [, setLocation] = useLocation();
  const { orgId, siteId } = useContext(SiteCtx);
  const label = variant === "edit" ? "Edit" : "View";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (variant === "edit") {
          setLocation(`/site/${orgId}/${siteId}/edit/${collection}/${slug}`);
        } else {
          setLocation(`/site/${orgId}/${siteId}/preview`);
        }
      }}
      style={{
        display: "inline-flex", alignItems: "center", gap: 3,
        padding: "1px 7px", borderRadius: 4, fontSize: "0.65rem", fontWeight: 500,
        lineHeight: "1.5", marginLeft: 3, cursor: "pointer",
        background: variant === "edit" ? "rgba(247,187,46,0.15)" : C.bg,
        color: variant === "edit" ? C.gold : C.muted,
        border: `1px solid ${variant === "edit" ? "rgba(247,187,46,0.3)" : C.border}`,
      }}
    >
      {label}
    </button>
  );
}

function InlineRich({ text }: { text: string }) {
  const regex = /(!\[[^\]]*\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|\[doc:[^\]]+\]|\[form:[^\]]+\]|\[[^\]]+\]\([^)]+\))/g;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) parts.push(text.slice(lastIdx, match.index));
    const m = match[0];
    if (m.startsWith("![")) {
      const im = m.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (im) {
        parts.push(<ChatImage key={match.index} src={im[2]} alt={im[1] || im[2].split("/").pop() || ""} inline />);
      }
    } else if (m.startsWith("`") && m.endsWith("`")) {
      parts.push(<code key={match.index} style={{ padding: "2px 6px", borderRadius: 4, fontSize: "0.82em", backgroundColor: C.bg, border: `1px solid ${C.border}`, fontFamily: "monospace", color: C.gold }}>{m.slice(1, -1)}</code>);
    } else if (m.startsWith("**")) {
      parts.push(<strong key={match.index} style={{ fontWeight: 600, color: C.fg }}>{m.slice(2, -2)}</strong>);
    } else if (m.startsWith("*")) {
      parts.push(<em key={match.index}>{m.slice(1, -1)}</em>);
    } else if (m.startsWith("~~")) {
      parts.push(<s key={match.index} style={{ opacity: 0.6 }}>{m.slice(2, -2)}</s>);
    } else if (m.startsWith("[doc:")) {
      const dm = m.match(/^\[doc:([^/]+)\/([^|\]]+)(?:\|([^\]]*))?\]$/);
      if (dm) {
        parts.push(
          <span key={match.index} style={{ whiteSpace: "nowrap" }}>
            <DocPill collection={dm[1]} slug={dm[2]} variant="edit" />
            <DocPill collection={dm[1]} slug={dm[2]} variant="view" />
          </span>
        );
      }
    } else if (m.startsWith("[form:")) {
      const fm = m.match(/^\[form:([^\]]+)\]$/);
      if (fm) {
        parts.push(<code key={match.index} style={{ padding: "2px 6px", borderRadius: 4, fontSize: "0.82em", backgroundColor: C.bg, border: `1px solid ${C.border}`, fontFamily: "monospace", color: C.gold }}>{fm[1]}</code>);
      }
    } else if (m.startsWith("[")) {
      const lm = m.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (lm) parts.push(<a key={match.index} href={lm[2]} target="_blank" rel="noopener noreferrer" style={{ color: C.gold, textDecoration: "underline", textUnderlineOffset: "2px" }}>{lm[1]}</a>);
    }
    lastIdx = match.index + m.length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return <>{parts}</>;
}

function renderMdBlock(block: MdBlock, key: number): React.ReactNode {
  switch (block.type) {
    case "hr": return <hr key={key} style={{ border: "none", borderTop: `1px solid ${C.border}`, margin: "16px 0" }} />;
    case "image": return <div key={key}><ChatImage src={block.content} alt={block.alt ?? ""} /></div>;
    case "heading": {
      const s = { 1: { fontSize: "1.15rem", fontWeight: 700, margin: "16px 0 6px" }, 2: { fontSize: "1rem", fontWeight: 650, margin: "12px 0 5px" }, 3: { fontSize: "0.9rem", fontWeight: 600, margin: "10px 0 4px" } }[block.level ?? 2]!;
      return <div key={key} style={{ ...s, color: C.fg }}><InlineRich text={block.content} /></div>;
    }
    case "code": return (
      <div key={key} style={{ margin: "8px 0" }}>
        {block.lang && <div style={{ fontSize: "0.65rem", color: C.muted, padding: "4px 12px 0", backgroundColor: C.bg, borderRadius: "8px 8px 0 0", border: `1px solid ${C.border}`, borderBottom: "none", fontFamily: "monospace" }}>{block.lang}</div>}
        <pre style={{ padding: "10px 12px", borderRadius: block.lang ? "0 0 8px 8px" : "8px", backgroundColor: C.bg, border: `1px solid ${C.border}`, borderTop: block.lang ? "none" : undefined, fontSize: "0.78rem", lineHeight: 1.5, fontFamily: "monospace", overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}><code>{block.content}</code></pre>
      </div>
    );
    case "table": return (
      <div key={key} style={{ margin: "8px 0", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
          {block.rows && block.rows.length > 0 && (<>
            <thead><tr>{block.rows[0].map((cell, ci) => <th key={ci} style={{ padding: "6px 10px", textAlign: "left", fontWeight: 600, borderBottom: `2px solid ${C.border}`, color: C.fg, whiteSpace: "nowrap" }}><InlineRich text={cell} /></th>)}</tr></thead>
            <tbody>{block.rows.slice(1).map((row, ri) => <tr key={ri}>{row.map((cell, ci) => <td key={ci} style={{ padding: "5px 10px", borderBottom: `1px solid ${C.border}`, color: C.muted }}><InlineRich text={cell} /></td>)}</tr>)}</tbody>
          </>)}
        </table>
      </div>
    );
    case "ul": return <ul key={key} style={{ margin: "6px 0", paddingLeft: 20, listStyleType: "disc" }}>{block.content.split("\n").map((item, j) => <li key={j} style={{ margin: "3px 0", color: C.fg, fontSize: "0.85rem" }}><InlineRich text={item} /></li>)}</ul>;
    case "ol": return <ol key={key} style={{ margin: "6px 0", paddingLeft: 20, listStyleType: "decimal" }}>{block.content.split("\n").map((item, j) => <li key={j} style={{ margin: "3px 0", color: C.fg, fontSize: "0.85rem" }}><InlineRich text={item} /></li>)}</ol>;
    case "blockquote": return <blockquote key={key} style={{ margin: "8px 0", padding: "8px 12px", borderLeft: `3px solid ${C.gold}`, backgroundColor: "rgba(247,187,46,0.05)", borderRadius: "0 6px 6px 0", color: C.fg }}><InlineRich text={block.content} /></blockquote>;
    case "paragraph": return <p key={key} style={{ margin: "6px 0", color: C.fg, fontSize: "0.875rem", lineHeight: 1.6 }}>{block.content.split("\n").map((line, j) => <Fragment key={j}>{j > 0 && <br />}<InlineRich text={line} /></Fragment>)}</p>;
  }
}

/** Resolve and display images in chat — fetches relative URLs via Bearer JWT and creates blob URL */
function ChatImage({ src, alt, inline }: { src: string; alt: string; inline?: boolean }) {
  const { orgId, siteId } = useContext(SiteCtx);
  const [blobUrl, setBlobUrl] = useState<string | null>(src.startsWith("data:") ? src : null);

  useEffect(() => {
    if (src.startsWith("data:")) { setBlobUrl(src); return; }
    // External URLs without /uploads/ — can display directly
    if (src.startsWith("http") && !src.includes("/uploads/")) { setBlobUrl(src); return; }
    let revoked = false;
    void (async () => {
      try {
        const { getServerUrl, getJwt } = await import("@/lib/prefs");
        const server = await getServerUrl();
        const jwt = await getJwt();
        if (!server || !jwt || !orgId || !siteId) return;
        // Extract file path from /uploads/xxx or http://server:port/uploads/xxx
        const uploadsMatch = src.match(/\/uploads\/(.+)$/);
        if (!uploadsMatch) return;
        const filePath = uploadsMatch[1];
        const res = await fetch(
          `${server}/api/mobile/media/file?orgId=${encodeURIComponent(orgId)}&siteId=${encodeURIComponent(siteId)}&path=${encodeURIComponent(filePath)}`,
          { headers: { Authorization: `Bearer ${jwt}` }, credentials: "omit" },
        );
        if (res.ok) {
          const blob = await res.blob();
          if (!revoked) setBlobUrl(URL.createObjectURL(blob));
        }
      } catch { /* image won't show */ }
    })();
    return () => { revoked = true; };
  }, [src, orgId, siteId]);

  if (!blobUrl) return null;

  return (
    <img
      src={blobUrl}
      alt={alt}
      style={inline ? {
        width: 40, height: 40, objectFit: "cover", borderRadius: 6,
        border: `1px solid ${C.border}`, display: "inline-block", verticalAlign: "middle",
      } : {
        maxWidth: "100%", maxHeight: 300, borderRadius: 8,
        border: `1px solid ${C.border}`, objectFit: "contain", display: "block", margin: "8px 0",
      }}
      loading="lazy"
    />
  );
}

function MarkdownContent({ text }: { text: string }) {
  if (!text) return null;
  const clean = text.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  const blocks = parseMdBlocks(clean);
  return <div style={{ wordBreak: "break-word" }}>{blocks.map((b, i) => renderMdBlock(b, i))}</div>;
}

// ─── Tool Call Card ──────────────────────────────────

function ToolCallCard({ tool }: { tool: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 my-1.5">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left active:bg-white/5"
      >
        {tool.status === "running" ? (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-gold border-t-transparent shrink-0" />
        ) : tool.status === "done" ? (
          <span className="text-green-400 text-xs shrink-0">✓</span>
        ) : (
          <span className="text-red-400 text-xs shrink-0">✗</span>
        )}
        <span className="text-xs text-white/50 truncate">{tool.tool.replace(/_/g, " ")}</span>
      </button>
      {expanded && tool.result && (
        <div className="px-3 pb-2 text-[10px] text-white/30 font-mono max-h-32 overflow-y-auto border-t border-white/5">
          {tool.result.slice(0, 500)}
        </div>
      )}
    </div>
  );
}

// ─── Conversation Context Menu ───────────────────────

function ConversationMenu({ conv, onDelete, onRename }: {
  conv: Conversation;
  onDelete: () => void;
  onRename: (title: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(conv.title);

  function copyId() {
    if (!conv.id) return;
    navigator.clipboard.writeText(conv.id).then(() => {
      setCopied(true);
      setTimeout(() => { setCopied(false); setOpen(false); }, 1000);
    });
  }

  function startRename() {
    setRenameValue(conv.title);
    setRenaming(true);
    setOpen(false);
  }

  function submitRename() {
    if (renameValue.trim() && renameValue !== conv.title) {
      onRename(renameValue.trim());
    }
    setRenaming(false);
  }

  if (renaming) {
    return (
      <div className="flex items-center gap-1 shrink-0 pr-2">
        <input
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submitRename(); if (e.key === "Escape") setRenaming(false); }}
          autoFocus
          className="w-28 text-xs bg-brand-darkPanel border border-white/20 rounded px-2 py-1 text-white outline-none focus:border-brand-gold"
        />
        <button type="button" onClick={submitRename} className="text-green-400 p-1">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
    );
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="px-3 py-3 text-white/20 active:text-white/60"
        aria-label="Menu"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="3" r="1.25" fill="currentColor" /><circle cx="8" cy="8" r="1.25" fill="currentColor" /><circle cx="8" cy="13" r="1.25" fill="currentColor" /></svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 w-40 rounded-lg bg-brand-darkPanel border border-white/15 shadow-xl overflow-hidden">
            <button type="button" onClick={copyId} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-xs text-white/70 active:bg-white/10">
              {copied ? (
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3 3 7-7" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" /></svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" /><path d="M3 11V3.5A.5.5 0 013.5 3H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              )}
              {copied ? "Copied!" : "Copy ID"}
            </button>
            <button type="button" onClick={startRename} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-xs text-white/70 active:bg-white/10 border-t border-white/5">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3L5 14H2v-3z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Rename
            </button>
            <button type="button" onClick={() => { setOpen(false); onDelete(); }} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-xs text-red-400 active:bg-white/10 border-t border-white/5">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M5 4v8a1 1 0 001 1h4a1 1 0 001-1V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Copy Button ─────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-md text-[11px] active:scale-95 transition-all"
      style={{
        background: C.bg,
        border: `1px solid ${C.border}`,
        color: copied ? "#4ade80" : C.muted,
      }}
    >
      {copied ? (
        <>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Copied
        </>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" /><path d="M3 11V3.5A.5.5 0 013.5 3H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          Copy
        </>
      )}
    </button>
  );
}

// ─── Thinking Animation (ported from desktop) ───────

function ThinkingIndicator({ startTime }: { startTime: number | null }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTime) { setElapsed(0); return; }
    setElapsed(Math.floor((Date.now() - startTime) / 1000));
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = `${minutes}:${String(seconds).padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-2.5 px-1 py-2">
      <style>{`
        @keyframes chat-orbit {
          0%   { transform: rotate(0deg)   translateX(9px) rotate(0deg);   opacity: 1; }
          33%  { opacity: 0.6; }
          66%  { opacity: 1; }
          100% { transform: rotate(360deg) translateX(9px) rotate(-360deg); opacity: 1; }
        }
        @keyframes chat-pulse-ring {
          0%, 100% { transform: scale(0.85); opacity: 0.15; }
          50%      { transform: scale(1.1);  opacity: 0.05; }
        }
      `}</style>
      <div className="relative" style={{ width: 28, height: 28 }}>
        {/* Pulse ring */}
        <div
          className="absolute rounded-full border-[1.5px] border-brand-gold"
          style={{ inset: -2, animation: "chat-pulse-ring 2.4s ease-in-out infinite" }}
        />
        {/* Orbiting dots */}
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="absolute rounded-full bg-brand-gold"
            style={{
              top: "50%", left: "50%", width: 5, height: 5,
              marginTop: -2.5, marginLeft: -2.5,
              animation: "chat-orbit 1.8s cubic-bezier(0.4,0,0.2,1) infinite",
              animationDelay: `${i * -0.6}s`,
            }}
          />
        ))}
        {/* Center dot */}
        <div
          className="absolute rounded-full bg-brand-gold opacity-40"
          style={{ top: "50%", left: "50%", width: 4, height: 4, marginTop: -2, marginLeft: -2 }}
        />
      </div>
      <span className="text-xs text-white/40 italic">Thinking...</span>
      {elapsed > 0 && (
        <span className="text-xs text-white/30 tabular-nums">{timeStr}</span>
      )}
    </div>
  );
}

// ─── Chat Screen ─────────────────────────────────────

export function Chat() {
  const [, setLocation] = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [attachedImages, setAttachedImages] = useState<{ preview: string; url?: string; uploading?: boolean }[]>([]);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [thinkingStartTime, setThinkingStartTime] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [historyTab, setHistoryTab] = useState<"chats" | "memory">("chats");
  const [memories, setMemories] = useState<any[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [orgId, setOrgId] = useState("");
  const [siteId, setSiteId] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load active org/site
  useEffect(() => {
    void (async () => {
      const o = await getActiveOrgId();
      const s = await getActiveSiteId();
      if (o) setOrgId(o);
      if (s) setSiteId(s);
    })();
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  // Thinking start time
  useEffect(() => {
    if (streaming) {
      setThinkingStartTime(Date.now());
    } else {
      setThinkingStartTime(null);
    }
  }, [streaming]);

  const goBack = useCallback(() => {
    if (window.history.length > 1) window.history.back();
    else setLocation("/home");
  }, [setLocation]);

  async function send(text: string) {
    if ((!text.trim() && attachedImages.length === 0) || streaming || !orgId || !siteId) return;
    if (attachedImages.some((img) => img.uploading)) return;

    let content = text.trim();
    for (const img of attachedImages) {
      if (img.url) content += `\n![](${img.url})`;
    }
    setAttachedImages([]);

    const userMsg: Message = { role: "user", content };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);

    const assistantMsg: Message = { role: "assistant", content: "", toolCalls: [] };
    setMessages([...newMessages, assistantMsg]);

    let currentToolIdx = -1;

    try {
      // Start job — returns immediately with jobId
      const apiMessages = newMessages.map((m) => ({ role: m.role, content: m.content }));
      const jobId = await startChat(orgId, siteId, apiMessages, conversationId);

      // Poll for events every 1.5s until done
      let cursor = 0;
      let done = false;
      while (!done) {
        await new Promise((r) => setTimeout(r, 1500));
        try {
          const poll = await pollChat(jobId, cursor);
          cursor = poll.cursor;
          done = poll.done;

          // Process new events
          for (const evt of poll.events) {
            const data = evt.data;
            setMessages((prev) => {
              const msgs = [...prev];
              const last = { ...msgs[msgs.length - 1] };
              last.toolCalls = [...(last.toolCalls ?? [])];

              switch (evt.event) {
                case "text":
                  last.content += data?.text ?? "";
                  break;
                case "thinking":
                  last.thinking = (last.thinking ?? "") + (data?.text ?? "");
                  break;
                case "tool_call":
                  last.toolCalls.push({
                    tool: data?.tool ?? data?.name ?? "unknown",
                    input: typeof data?.input === "string" ? data.input : JSON.stringify(data?.input),
                    status: "running",
                  });
                  currentToolIdx = last.toolCalls.length - 1;
                  break;
                case "tool_result":
                  if (currentToolIdx >= 0 && last.toolCalls[currentToolIdx]) {
                    last.toolCalls[currentToolIdx] = {
                      ...last.toolCalls[currentToolIdx],
                      result: typeof data?.result === "string" ? data.result : JSON.stringify(data?.result),
                      status: "done",
                    };
                  }
                  break;
                case "error":
                  last.content += `\n\n⚠️ ${data?.message ?? data?.error ?? JSON.stringify(data)}`;
                  break;
              }

              msgs[msgs.length - 1] = last;
              return msgs;
            });
          }
        } catch {
          // Poll failed — retry next iteration
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const msgs = [...prev];
        const last = msgs[msgs.length - 1];
        if (last?.role === "assistant") {
          last.content += `\n\n⚠️ ${(err as Error).message}`;
        }
        return msgs;
      });
    } finally {
      setStreaming(false);

      // Auto-save for sync
      try {
        setMessages((current) => {
          if (current.length >= 2) {
            const title = current[0].content.slice(0, 80);
            saveConversation(orgId, siteId, {
              id: conversationId,
              title,
              messages: current.map((m) => ({ role: m.role, content: m.content })),
            }).then((saved) => {
              if (saved?.id) setConversationId(saved.id);
            }).catch(() => {});
          }
          return current;
        });
      } catch { /* non-fatal */ }
    }
  }

  function handleQuickAction(label: string) {
    send(label);
  }

  function stopStreaming() {
    // Poll-based: just set streaming false — job continues server-side
    setStreaming(false);
  }

  const chatFileRef = useRef<HTMLInputElement>(null);

  async function pickChatImage() {
    try {
      const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
      const photo = await Camera.getPhoto({
        quality: 85,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt,
      });
      if (photo.dataUrl) {
        await uploadAndAttachImage(photo.dataUrl, photo.format === "png" ? "png" : "jpg");
      }
    } catch {
      // Native not available or cancelled — fall back to file input
      chatFileRef.current?.click();
    }
  }

  async function uploadAndAttachImage(dataOrPath: string, ext: string) {
    if (!orgId || !siteId) return;
    const localPreview = dataOrPath;
    const idx = attachedImages.length;
    setAttachedImages((prev) => [...prev, { preview: localPreview, uploading: true }]);
    try {
      const res = await fetch(dataOrPath);
      const blob = await res.blob();
      const file = new File([blob], `chat-${Date.now()}.${ext}`, { type: `image/${ext}` });
      const { uploadFile } = await import("@/api/client");
      const result = await uploadFile(orgId, siteId, file);
      // Keep local preview, add server URL
      setAttachedImages((prev) => prev.map((img, i) => i === idx ? { ...img, url: result.url, uploading: false } : img));
    } catch (err) {
      console.error("Chat image upload failed:", err);
      // Remove failed upload
      setAttachedImages((prev) => prev.filter((_, i) => i !== idx));
    }
  }

  function removeAttachedImage(idx: number) {
    setAttachedImages((prev) => prev.filter((_, i) => i !== idx));
  }

  async function loadHistory() {
    if (!orgId || !siteId) return;
    setHistoryOpen(true);
    try {
      const [convData, memData] = await Promise.all([
        listConversations(orgId, siteId).catch(() => []),
        getMemories(orgId, siteId).catch(() => ({ memories: [] })),
      ]);
      const list = Array.isArray(convData) ? convData : (convData as any)?.conversations ?? [];
      setConversations(list);
      setMemories((memData as any)?.memories ?? []);
    } catch { /* ignore */ }
  }

  async function loadConversation(conv: Conversation) {
    setHistoryOpen(false);
    setConversationId(conv.id);

    // Fetch full conversation from server (includes tool calls, full content)
    if (conv.id && orgId && siteId) {
      try {
        const data = await fetchConversation(orgId, siteId, conv.id);
        const full = data?.conversation ?? data;
        if (full?.messages) {
          setMessages(
            full.messages.map((m: any) => ({
              role: m.role,
              content: m.content,
              toolCalls: m.toolCalls?.map((tc: any) => ({
                tool: tc.tool,
                input: typeof tc.input === "string" ? tc.input : JSON.stringify(tc.input),
                result: tc.result,
                status: "done" as const,
              })),
            })),
          );
          return;
        }
      } catch { /* fall back to summary */ }
    }

    // Fallback: use the summary messages from the list
    setMessages(
      (conv.messages ?? []).map((m: any) => ({
        role: m.role ?? "user",
        content: m.content ?? "",
      })),
    );
  }

  function newChat() {
    setMessages([]);
    setConversationId(undefined);
    setHistoryOpen(false);
  }

  const isEmpty = messages.length === 0;

  return (
    <SiteCtx.Provider value={{ orgId, siteId }}>
    <Screen>
      <ScreenHeader
        left={<BackButton onClick={goBack} />}
        title="Chat"
        subtitle="AI Assistant"
        right={
          <button
            type="button"
            onClick={loadHistory}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/60 active:scale-90 transition-transform"
            aria-label="History"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 5v3.5l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        }
      />

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-4" style={{ overflowX: "hidden" }}>
        {isEmpty ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full gap-4 px-2">
            <div className="w-14 h-14 rounded-2xl bg-brand-gold flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0D0D0D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-white">Chat with your site</h2>
            <p className="text-xs text-white/40 text-center max-w-[250px]">
              Ask anything about <strong className="text-white/60">your site</strong>. I know your schema, content, and settings.
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-2">
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => handleQuickAction(a.label)}
                  className="flex items-center gap-2 rounded-xl bg-brand-darkSoft border border-white/10 px-3.5 py-2.5 text-xs text-white/70 active:scale-95 active:bg-white/5 transition-all"
                >
                  <span>{a.icon}</span>
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Message list */
          <div className="flex flex-col gap-3 pt-2">
            {messages.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                {msg.role === "user" ? (
                  <div className="max-w-[85%]">
                    <div className="rounded-2xl rounded-br-md bg-brand-darkSoft border border-white/10 px-4 py-2.5">
                      <MarkdownContent text={msg.content} />
                    </div>
                    <div className="flex justify-end mt-1">
                      <CopyButton text={msg.content} />
                    </div>
                  </div>
                ) : (
                  <div className="max-w-[95%]">
                    {/* Tool calls */}
                    {msg.toolCalls?.map((tc, j) => (
                      <ToolCallCard key={j} tool={tc} />
                    ))}
                    {/* Content */}
                    {msg.content && <MarkdownContent text={msg.content} />}
                    {/* Copy button */}
                    {msg.content && !streaming && (
                      <CopyButton text={msg.content} />
                    )}
                  </div>
                )}
              </div>
            ))}
            {streaming && messages[messages.length - 1]?.content === "" && (
              <ThinkingIndicator startTime={thinkingStartTime} />
            )}
          </div>
        )}
      </div>

      {/* Input bar — Claude iOS style: everything inside one rounded box */}
      <div className="shrink-0 border-t border-white/10 bg-brand-dark px-4 py-3 safe-bottom">
        <div className="flex items-end gap-2">
          {/* Input container — images + textarea + plus button all inside */}
          <div className="flex-1 min-w-0 rounded-2xl bg-brand-darkPanel border border-white/10 focus-within:border-brand-gold transition-colors overflow-hidden">
            {/* Attached images */}
            {attachedImages.length > 0 && (
              <div className="flex gap-2 px-3 pt-3">
                {attachedImages.map((img, idx) => (
                  <div key={idx} className="relative shrink-0">
                    <img
                      src={img.preview}
                      alt=""
                      className="h-20 w-20 rounded-xl object-cover"
                      onClick={() => setFullscreenImage(img.preview)}
                    />
                    {img.uploading ? (
                      <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => removeAttachedImage(idx)}
                        className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-neutral-600 text-white active:scale-90 shadow"
                      >
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* Textarea */}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="How can I help today?"
              rows={1}
              className="w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm text-white outline-none max-h-32"
              style={{ fieldSizing: "content" } as any}
            />
            {/* + button inside field, bottom-left */}
            <div className="flex items-center px-2 pb-2">
              <button
                type="button"
                onClick={pickChatImage}
                disabled={streaming}
                className="flex h-7 w-7 items-center justify-center rounded-full text-white/40 active:text-white/70 active:bg-white/10 transition-all disabled:opacity-30"
                aria-label="Add image"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
          {streaming ? (
            <button
              type="button"
              onClick={stopStreaming}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-red-400 active:scale-90 transition-transform"
              aria-label="Stop"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <rect x="3" y="3" width="10" height="10" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => send(input)}
              disabled={!input.trim() || !orgId}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-gold text-brand-dark active:scale-90 transition-transform disabled:opacity-30"
              aria-label="Send"
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                <path d="M14 2L7 9M14 2l-4.5 12-2-5.5L2 6.5 14 2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* History drawer */}
      {historyOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-brand-dark">
          {/* Header with tabs */}
          <div className="px-4 pt-safe-top py-3 border-b border-white/10">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setHistoryTab("chats")}
                  className={`text-sm font-medium pb-0.5 ${historyTab === "chats" ? "text-white border-b-2 border-brand-gold" : "text-white/40"}`}
                >
                  Chats
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryTab("memory")}
                  className={`text-sm font-medium pb-0.5 flex items-center gap-1.5 ${historyTab === "memory" ? "text-white border-b-2 border-brand-gold" : "text-white/40"}`}
                >
                  Memory
                  {memories.length > 0 && (
                    <span className="text-[10px] bg-white/10 rounded-full px-1.5 py-0.5 tabular-nums">{memories.length}</span>
                  )}
                </button>
              </div>
              <div className="flex items-center gap-2">
                {historyTab === "chats" && (
                  <button type="button" onClick={newChat} className="text-xs text-brand-gold active:opacity-70 px-2 py-1">+ New</button>
                )}
                <button
                  type="button"
                  onClick={() => setHistoryOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white active:scale-90"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {historyTab === "chats" ? (
              /* Chats list */
              conversations.length === 0 ? (
                <p className="text-xs text-white/30 text-center py-12">No saved chats yet</p>
              ) : (
                conversations.map((conv, i) => (
                  <div
                    key={conv.id ?? i}
                    className="flex items-center border-b border-white/5"
                  >
                    <button
                      type="button"
                      onClick={() => loadConversation(conv)}
                      className="flex-1 min-w-0 text-left px-4 py-3 active:bg-white/5"
                    >
                      <p className="text-sm text-white truncate">{conv.title}</p>
                      {conv.createdAt && (
                        <p className="text-[10px] text-white/30 mt-0.5">
                          {new Date(conv.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      )}
                    </button>
                    <ConversationMenu
                      conv={conv}
                      onDelete={async () => {
                        if (conv.id) {
                          await apiDeleteConversation(orgId, siteId, conv.id).catch(() => {});
                          setConversations((prev) => prev.filter((c) => c.id !== conv.id));
                        }
                      }}
                      onRename={(title) => {
                        if (conv.id) {
                          saveConversation(orgId, siteId, { id: conv.id, title, messages: conv.messages ?? [] }).catch(() => {});
                          setConversations((prev) => prev.map((c) => c.id === conv.id ? { ...c, title } : c));
                        }
                      }}
                    />
                  </div>
                ))
              )
            ) : (
              /* Memory list */
              memories.length === 0 ? (
                <p className="text-xs text-white/30 text-center py-12">No memories yet</p>
              ) : (
                memories.map((mem: any, i: number) => (
                  <div
                    key={mem.id ?? i}
                    className="px-4 py-3 border-b border-white/5"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-medium uppercase tracking-wider rounded px-1.5 py-0.5 bg-brand-gold/15 text-brand-gold border border-brand-gold/30">
                        {mem.category ?? "fact"}
                      </span>
                      {mem.useCount != null && (
                        <span className="text-[10px] text-white/30">{mem.useCount}x used</span>
                      )}
                    </div>
                    <p className="text-sm text-white/80">{mem.fact}</p>
                    {mem.entities?.length > 0 && (
                      <p className="text-[10px] text-white/30 mt-1">{mem.entities.join(", ")}</p>
                    )}
                  </div>
                ))
              )
            )}
          </div>
        </div>
      )}
      {/* Fullscreen image preview */}
      {fullscreenImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setFullscreenImage(null)}
        >
          <img src={fullscreenImage} alt="" className="max-w-full max-h-full object-contain" />
          <button
            type="button"
            onClick={() => setFullscreenImage(null)}
            className="absolute top-safe-top right-4 mt-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white active:scale-90"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}

      {/* Hidden file input for web fallback */}
      <input
        ref={chatFileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            const ext = f.name.split(".").pop()?.toLowerCase() ?? "jpg";
            const url = URL.createObjectURL(f);
            uploadAndAttachImage(url, ext);
          }
          e.target.value = "";
        }}
      />
    </Screen>
    </SiteCtx.Provider>
  );
}
