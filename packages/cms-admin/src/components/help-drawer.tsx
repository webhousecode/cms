"use client";

import { useState } from "react";
import {
  HelpCircle, X, BookOpen, Wrench, Activity, Mail,
  MessageCircle, Keyboard, ExternalLink,
} from "lucide-react";

const ICON_SIZE = { width: "1rem", height: "1rem" };

const HELP_LINKS = [
  { label: "Documentation", sublabel: "Guides and references", icon: <BookOpen style={ICON_SIZE} />, href: "https://webhouse.app/docs" },
  { label: "Troubleshooting", sublabel: "Common issues and fixes", icon: <Wrench style={ICON_SIZE} />, href: "https://webhouse.app/docs/troubleshooting" },
  { label: "System status", sublabel: "Service health dashboard", icon: <Activity style={ICON_SIZE} />, href: "https://status.webhouse.app" },
  { label: "Contact support", sublabel: "Get help from the team", icon: <Mail style={ICON_SIZE} />, href: "mailto:support@webhouse.app" },
];

const SHORTCUTS = [
  { keys: "⌘ K", label: "Command palette" },
  { keys: "⌘ S", label: "Save document" },
  { keys: "⌘ ⇧ ←/→", label: "Switch tab" },
  { keys: "t", label: "New tab" },
  { keys: "n", label: "New item" },
  { keys: "g", label: "Generate content" },
  { keys: "?", label: "Help & Support" },
];

export function HelpDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
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
          width: "340px", zIndex: 200,
          background: "var(--card)",
          borderLeft: "1px solid var(--border)",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.3)",
          display: "flex", flexDirection: "column",
          animation: "slideInRight 200ms ease-out",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0.875rem 1.25rem",
          borderBottom: "1px solid var(--border)",
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

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem" }}>
          {/* Help links */}
          <div style={{ marginBottom: "2rem" }}>
            <p style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.25rem" }}>Need help with your project?</p>
            <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>Start with our docs or community.</p>

            <div style={{
              borderRadius: "10px", border: "1px solid var(--border)",
              overflow: "hidden",
            }}>
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
                    color: "var(--foreground)",
                    textDecoration: "none",
                    fontSize: "0.85rem",
                    transition: "background 120ms",
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

          {/* Community */}
          <div style={{ marginBottom: "2rem" }}>
            <p style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.25rem" }}>Community</p>
            <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>
              Our Discord community can help with technical questions. Many questions are answered in minutes.
            </p>
            <a
              href="https://discord.gg/webhouse"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex", alignItems: "center", gap: "0.5rem",
                padding: "0.6rem 1rem",
                borderRadius: "8px",
                background: "rgb(88 101 242)",
                color: "#fff",
                textDecoration: "none",
                fontSize: "0.85rem",
                fontWeight: 600,
                width: "fit-content",
              }}
            >
              <MessageCircle style={{ width: "1rem", height: "1rem" }} />
              Join us on Discord
            </a>
          </div>

          {/* Keyboard shortcuts */}
          <div>
            <p style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "1rem" }}>Keyboard shortcuts</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {SHORTCUTS.map((s) => (
                <div key={s.keys} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>{s.label}</span>
                  <kbd style={{
                    fontSize: "0.65rem", fontFamily: "monospace",
                    padding: "0.15rem 0.5rem", borderRadius: "4px",
                    border: "1px solid var(--border)",
                    color: "var(--muted-foreground)",
                    background: "var(--secondary)",
                  }}>{s.keys}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "0.875rem 1.25rem",
          borderTop: "1px solid var(--border)",
          fontSize: "0.7rem",
          color: "var(--muted-foreground)",
          fontFamily: "monospace",
        }}>
          webhouse.app · v0.2.10
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

export function HelpButton() {
  const [open, setOpen] = useState(false);

  // "?" shortcut
  useState(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "?" || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || (document.activeElement as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      setOpen((o) => !o);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "var(--muted-foreground)", padding: "0.25rem",
          display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: "50%",
          width: "2rem", height: "2rem",
        }}
        className="hover:bg-accent/50 hover:text-foreground transition-colors"
        title="Help & Support (?)"
      >
        <HelpCircle style={{ width: "1.1rem", height: "1.1rem" }} />
      </button>
      <HelpDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
