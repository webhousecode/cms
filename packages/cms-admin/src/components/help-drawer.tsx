"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  HelpCircle, X, BookOpen, Wrench, Activity, Mail,
  MessageCircle, Keyboard, ExternalLink, Bot,
  Search, FileText, Settings, Pencil, Send, Trash2,
  BarChart3, Shield, Clock, Copy, Image, Sparkles,
} from "lucide-react";

const ICON_SIZE = { width: "1rem", height: "1rem" };

const HELP_LINKS = [
  { label: "Documentation", icon: <BookOpen style={ICON_SIZE} />, href: "https://docs.webhouse.app" },
  { label: "Troubleshooting", icon: <Wrench style={ICON_SIZE} />, href: "https://docs.webhouse.app/docs/troubleshooting" },
  { label: "System status", icon: <Activity style={ICON_SIZE} />, href: "https://status.webhouse.app" },
  { label: "Contact support", icon: <Mail style={ICON_SIZE} />, href: "mailto:cms@webhouse.dk" },
];

const SHORTCUT_GROUPS = [
  {
    label: "Chat with Your Site",
    shortcuts: [
      { keys: "⌃ ⇧ C", label: "Toggle Chat / Admin mode" },
      { keys: "/", label: "Focus chat input" },
      { keys: "⌘ ⇧ N", label: "New conversation" },
    ],
  },
  {
    label: "General",
    shortcuts: [
      { keys: "⌘ K", label: "Command palette" },
      { keys: "h", label: "Help & Support" },
      { keys: "p", label: "Preview site" },
      { keys: "d", label: "Deploy site" },
      { keys: "t", label: "New tab" },
      { keys: "c", label: "Close tab" },
      { keys: "⌘ ⇧ ←", label: "Previous tab" },
      { keys: "⌘ ⇧ →", label: "Next tab" },
    ],
  },
  {
    label: "Document Editor",
    shortcuts: [
      { keys: "⌘ S", label: "Save document" },
      { keys: "⌘ ⇧ P", label: "Publish" },
    ],
  },
  {
    label: "Collection List",
    shortcuts: [
      { keys: "n", label: "New item" },
      { keys: "g", label: "Generate with AI" },
    ],
  },
  {
    label: "Rich Text Editor",
    shortcuts: [
      { keys: "⌘ B", label: "Bold" },
      { keys: "⌘ I", label: "Italic" },
      { keys: "⌘ U", label: "Underline" },
      { keys: "⌘ ⇧ X", label: "Strikethrough" },
      { keys: "⌘ ⇧ 7", label: "Ordered list" },
      { keys: "⌘ ⇧ 8", label: "Bullet list" },
      { keys: "⌘ ⇧ B", label: "Blockquote" },
      { keys: "⌘ ⇧ E", label: "Code block" },
    ],
  },
];

type DrawerPage = "help" | "shortcuts" | "ai-tools";

export function HelpDrawer({ open, onClose, initialPage = "help" }: { open: boolean; onClose: () => void; initialPage?: DrawerPage }) {
  const [page, setPage] = useState<DrawerPage>(initialPage);

  // Reset page when opened
  useEffect(() => { if (open) setPage(initialPage); }, [open, initialPage]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: "340px", zIndex: 9999,
      background: "var(--card)", borderLeft: "1px solid var(--border)",
      boxShadow: "-4px 0 20px rgba(0,0,0,0.3)",
      display: "flex", flexDirection: "column",
    }}>
        {/* Header with tabs */}
        <div style={{ borderBottom: "1px solid var(--border)" }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "0.75rem 1.25rem 0",
          }}>
            <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>Help & Support</span>
            <button
              type="button"
              onClick={onClose}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "0.25rem" }}
            >
              <X style={{ width: "1rem", height: "1rem" }} />
            </button>
          </div>
          <div style={{ display: "flex", gap: "0.25rem", padding: "0.5rem 1rem" }}>
            {([
              { id: "help" as const, label: "Help", icon: <HelpCircle style={{ width: "0.8rem", height: "0.8rem" }} /> },
              { id: "shortcuts" as const, label: "Shortcuts", icon: <Keyboard style={{ width: "0.8rem", height: "0.8rem" }} /> },
              { id: "ai-tools" as const, label: "AI Chat", icon: <Bot style={{ width: "0.8rem", height: "0.8rem" }} /> },
            ]).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPage(tab.id)}
                style={{
                  display: "flex", alignItems: "center", gap: "0.35rem",
                  padding: "0.4rem 0.75rem",
                  fontSize: "0.8rem", fontWeight: 500,
                  color: page === tab.id ? "var(--foreground)" : "var(--muted-foreground)",
                  background: page === tab.id ? "var(--accent)" : "transparent",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer", transition: "all 150ms",
                }}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem" }}>
          {page === "help" && <HelpPage />}
          {page === "shortcuts" && <ShortcutsPage />}
          {page === "ai-tools" && <AiToolsPage />}
        </div>

        {/* Footer */}
        <div style={{
          padding: "0.75rem 1.25rem",
          borderTop: "1px solid var(--border)",
          fontSize: "0.65rem",
          color: "var(--muted-foreground)",
          fontFamily: "monospace",
        }}>
          <span style={{ color: "#fff", fontWeight: 600 }}>webhouse</span><span style={{ color: "var(--primary)" }}>.app</span> · v0.2.10
        </div>
    </div>,
    document.body
  );
}

/* ─── Help page ──────────────────────────────────────────────── */

function HelpPage() {
  return (
    <>
      <div style={{ marginBottom: "2rem" }}>
        <p style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.25rem" }}>Need help with your project?</p>
        <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>Start with our docs or community.</p>

        <div style={{ borderRadius: "10px", border: "1px solid var(--border)", overflow: "hidden" }}>
          {HELP_LINKS.map((link, i) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex", alignItems: "center", gap: "0.75rem",
                padding: "0.75rem 1rem",
                borderTop: i > 0 ? "1px solid var(--border)" : "none",
                color: "var(--foreground)", textDecoration: "none",
                fontSize: "0.85rem", transition: "background 120ms",
              }}
              className="hover:bg-accent/50"
            >
              <span style={{ color: "var(--muted-foreground)" }}>{link.icon}</span>
              <span style={{ flex: 1 }}>{link.label}</span>
              <ExternalLink style={{ width: "0.7rem", height: "0.7rem", color: "var(--muted-foreground)" }} />
            </a>
          ))}
        </div>
      </div>

      <div>
        <p style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.25rem" }}>Community</p>
        <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>
          Join our Discord to get support, report bugs, or discuss features. Many questions are answered in minutes.
        </p>
        <a
          href="https://discord.gg/jtjnEkVX8D"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex", alignItems: "center", gap: "0.5rem",
            padding: "0.6rem 1rem", borderRadius: "8px",
            background: "rgb(88 101 242)", color: "#fff",
            textDecoration: "none", fontSize: "0.85rem", fontWeight: 600,
          }}
        >
          <MessageCircle style={{ width: "1rem", height: "1rem" }} />
          Join us on Discord
        </a>
      </div>
    </>
  );
}

/* ─── Shortcuts page ─────────────────────────────────────────── */

function ShortcutsPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {SHORTCUT_GROUPS.map((group) => (
        <div key={group.label}>
          <p style={{
            fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.08em", color: "var(--muted-foreground)",
            marginBottom: "0.75rem",
          }}>
            {group.label}
          </p>
          <div style={{
            borderRadius: "10px", border: "1px solid var(--border)",
            overflow: "hidden",
          }}>
            {group.shortcuts.map((s, i) => (
              <div
                key={s.keys}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "0.6rem 1rem",
                  borderTop: i > 0 ? "1px solid var(--border)" : "none",
                }}
              >
                <span style={{ fontSize: "0.85rem" }}>{s.label}</span>
                <div style={{ display: "flex", gap: "0.3rem" }}>
                  {s.keys.split(" ").map((k, j) => (
                    <kbd key={j} style={{
                      fontSize: "0.8rem", fontFamily: "monospace",
                      padding: "0.3rem 0.6rem", borderRadius: "6px",
                      border: "1px solid var(--border)",
                      background: "var(--secondary)",
                      color: "var(--foreground)",
                      minWidth: "1.75rem", minHeight: "1.75rem",
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      boxShadow: "0 2px 0 var(--border)",
                      lineHeight: 1,
                    }}>{k}</kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── AI Chat Tools page ─────────────────────────────────────── */

const AI_TOOL_GROUPS = [
  {
    label: "Content",
    tools: [
      { icon: BarChart3, name: "Site overview", desc: "Collections, doc counts, settings" },
      { icon: Search, name: "Search content", desc: "Full-text search across all documents" },
      { icon: FileText, name: "List / read docs", desc: "Browse collections, read full documents" },
      { icon: Pencil, name: "Create / edit", desc: "Create, update, publish, unpublish docs" },
      { icon: Copy, name: "Clone document", desc: "Duplicate any document as draft" },
      { icon: Sparkles, name: "Generate content", desc: "AI-write or rewrite any field" },
      { icon: Pencil, name: "Inline edit form", desc: "Edit specific fields directly in chat" },
      { icon: Send, name: "Bulk publish", desc: "Publish all drafts at once" },
      { icon: Pencil, name: "Bulk update", desc: "Update a field across many docs" },
    ],
  },
  {
    label: "Media",
    tools: [
      { icon: Image, name: "Search media", desc: "Find images by AI captions, tags, filename" },
      { icon: Image, name: "List media", desc: "Browse all files with AI analysis data" },
      { icon: Image, name: "Upload", desc: "Upload images via + button or drag & drop" },
    ],
  },
  {
    label: "AI Agents",
    tools: [
      { icon: Bot, name: "List agents", desc: "View all configured AI agents" },
      { icon: Bot, name: "Create agent", desc: "Set up a new copywriter, SEO, or custom agent" },
      { icon: Sparkles, name: "Run agent", desc: "Execute an agent with a prompt" },
      { icon: FileText, name: "Curation queue", desc: "Review, approve, or reject AI content" },
    ],
  },
  {
    label: "Operations",
    tools: [
      { icon: Send, name: "Deploy", desc: "Deploy site to configured provider" },
      { icon: Settings, name: "Build site", desc: "Rebuild static pages" },
      { icon: Shield, name: "Backup", desc: "Create a backup right now" },
      { icon: Activity, name: "Link checker", desc: "Check for broken links" },
      { icon: Settings, name: "Site settings", desc: "View and update configuration" },
      { icon: Clock, name: "Deploy history", desc: "View recent deployments" },
    ],
  },
  {
    label: "Scheduling & History",
    tools: [
      { icon: Clock, name: "Schedule publish", desc: "Set future publish/unpublish date" },
      { icon: Clock, name: "Calendar", desc: "View scheduled publishes/unpublishes" },
      { icon: Clock, name: "Revisions", desc: "View document change history" },
      { icon: Trash2, name: "Trash", desc: "List trashed docs, restore them" },
      { icon: BarChart3, name: "Content stats", desc: "Word counts, AI ratio, activity" },
    ],
  },
];

function AiToolsPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <p style={{ fontSize: "0.8rem", color: "var(--muted-foreground)", lineHeight: 1.5 }}>
        Switch to <strong>Chat</strong> mode to use these tools. Ask in natural language — the AI picks the right tool automatically.
      </p>
      {AI_TOOL_GROUPS.map((group) => (
        <div key={group.label}>
          <div style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted-foreground)", marginBottom: "0.5rem" }}>
            {group.label}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {group.tools.map((tool) => (
              <div
                key={tool.name}
                style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px 8px", borderRadius: "6px" }}
              >
                <tool.icon style={{ width: "14px", height: "14px", color: "var(--primary)", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: "0.8rem", fontWeight: 500 }}>{tool.name}</div>
                  <div style={{ fontSize: "0.65rem", color: "var(--muted-foreground)" }}>{tool.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Help button (for header) ───────────────────────────────── */

export function HelpButton() {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<DrawerPage>("help");

  // "h" or "?" shortcut → toggle help drawer
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key !== "?" && e.key !== "h") || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || (document.activeElement as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      setPage("help");
      setOpen((o) => !o);
    }
    function onOpenHelp() { setPage("help"); setOpen(true); }
    document.addEventListener("keydown", onKey);
    window.addEventListener("cms:open-help", onOpenHelp);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("cms:open-help", onOpenHelp);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => { setPage("help"); setOpen(true); }}
        style={{
          background: "none",
          border: "1.5px solid var(--border)",
          cursor: "pointer",
          color: "var(--muted-foreground)",
          display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: "50%",
          width: "2rem", height: "2rem",
          padding: 0,
        }}
        className="hover:border-foreground hover:text-foreground transition-colors"
        title="Help & Support (?)"
      >
        <HelpCircle style={{ width: "0.95rem", height: "0.95rem" }} />
      </button>
      <HelpDrawer open={open} onClose={() => setOpen(false)} initialPage={page} />
    </>
  );
}
