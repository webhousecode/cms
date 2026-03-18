"use client";

import { useState, useEffect } from "react";
import {
  HelpCircle, X, BookOpen, Wrench, Activity, Mail,
  MessageCircle, Keyboard, ExternalLink,
} from "lucide-react";

const ICON_SIZE = { width: "1rem", height: "1rem" };

const HELP_LINKS = [
  { label: "Documentation", icon: <BookOpen style={ICON_SIZE} />, href: "https://webhouse.app/docs" },
  { label: "Troubleshooting", icon: <Wrench style={ICON_SIZE} />, href: "https://webhouse.app/docs/troubleshooting" },
  { label: "System status", icon: <Activity style={ICON_SIZE} />, href: "https://status.webhouse.app" },
  { label: "Contact support", icon: <Mail style={ICON_SIZE} />, href: "mailto:support@webhouse.app" },
];

const SHORTCUT_GROUPS = [
  {
    label: "General",
    shortcuts: [
      { keys: "⌘ K", label: "Command palette" },
      { keys: "h", label: "Help & Support" },
      { keys: "t", label: "New tab" },
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
      { keys: "⌘ K", label: "Insert link" },
    ],
  },
];

type DrawerPage = "help" | "shortcuts";

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

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 199,
          background: "rgba(0,0,0,0.3)",
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0,
          width: "360px", zIndex: 200,
          background: "var(--card)",
          borderLeft: "1px solid var(--border)",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.3)",
          display: "flex", flexDirection: "column",
          animation: "slideInRight 200ms ease-out",
        }}
      >
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
          <div style={{ display: "flex", padding: "0 1.25rem", marginTop: "0.5rem" }}>
            {([
              { id: "help" as const, label: "Help", icon: <HelpCircle style={{ width: "0.8rem", height: "0.8rem" }} /> },
              { id: "shortcuts" as const, label: "Shortcuts", icon: <Keyboard style={{ width: "0.8rem", height: "0.8rem" }} /> },
            ]).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPage(tab.id)}
                style={{
                  display: "flex", alignItems: "center", gap: "0.35rem",
                  padding: "0.5rem 0.75rem",
                  fontSize: "0.8rem", fontWeight: 500,
                  color: page === tab.id ? "var(--primary)" : "var(--muted-foreground)",
                  background: "none",
                  border: "none",
                  borderBottom: page === tab.id ? "2px solid var(--primary)" : "2px solid transparent",
                  cursor: "pointer", transition: "all 150ms",
                  marginBottom: "-1px",
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
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
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
          Our Discord community can help with technical questions. Many questions are answered in minutes.
        </p>
        <a
          href="https://discord.gg/webhouse"
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
                <span style={{ fontSize: "0.8rem" }}>{s.label}</span>
                <div style={{ display: "flex", gap: "0.25rem" }}>
                  {s.keys.split(" ").map((k, j) => (
                    <kbd key={j} style={{
                      fontSize: "0.65rem", fontFamily: "monospace",
                      padding: "0.2rem 0.45rem", borderRadius: "5px",
                      border: "1px solid var(--border)",
                      background: "var(--secondary)",
                      color: "var(--foreground)",
                      minWidth: "1.5rem", textAlign: "center",
                      boxShadow: "0 1px 0 var(--border)",
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

/* ─── Help button (for header) ───────────────────────────────── */

export function HelpButton() {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<DrawerPage>("help");

  // "?" shortcut → toggle help drawer
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key !== "?" && e.key !== "h") || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || (document.activeElement as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      setPage("help");
      setOpen((o) => !o);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
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
