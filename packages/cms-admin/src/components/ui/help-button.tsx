"use client";

import { useState, useRef, useEffect, lazy, Suspense, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { Lightbulb, ExternalLink, X, Settings2, Loader2 } from "lucide-react";
import { getHelpArticle } from "@/lib/help/articles";

/** Registry of ISU (Inline Settings Update) components */
const ISU_COMPONENTS: Record<string, ComponentType> = {};

// Lazy-load ISU components on demand
function getISUComponent(id: string): ComponentType | null {
  if (ISU_COMPONENTS[id]) return ISU_COMPONENTS[id];
  if (id === "media-processing") {
    const Comp = lazy(() => import("./isu-media-processing").then((m) => ({ default: m.ISUMediaProcessing })));
    ISU_COMPONENTS[id] = Comp;
    return Comp;
  }
  return null;
}

interface HelpButtonProps {
  articleId: string;
}

function renderMarkdown(md: string): React.ReactNode[] {
  return md.split("\n\n").map((block, i) => {
    const lines = block.split("\n");
    const isList = lines.every((l) => /^(\d+\.\s|\*\s|-\s|$)/.test(l.trim()));
    if (isList && lines.some((l) => l.trim())) {
      return (
        <ul key={i} style={{ margin: "0.25rem 0", paddingLeft: "1.25rem", listStyle: "disc" }}>
          {lines.filter((l) => l.trim()).map((l, j) => (
            <li key={j} style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", lineHeight: 1.6 }}>
              {renderInline(l.replace(/^(\d+\.\s|\*\s|-\s)/, ""))}
            </li>
          ))}
        </ul>
      );
    }
    return (
      <p key={i} style={{ margin: "0.25rem 0", fontSize: "0.72rem", color: "var(--muted-foreground)", lineHeight: 1.6 }}>
        {renderInline(block)}
      </p>
    );
  });
}

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
    if (matches.length === 0) { parts.push(remaining); break; }
    const first = matches[0]!;
    if (first.index > 0) parts.push(remaining.slice(0, first.index));
    if (first.type === "bold") {
      parts.push(<strong key={key++} style={{ color: "var(--foreground)", fontWeight: 600 }}>{first.match![1]}</strong>);
    } else {
      parts.push(<code key={key++} style={{ fontSize: "0.68rem", padding: "0.1rem 0.3rem", borderRadius: "3px", background: "var(--secondary)", fontFamily: "monospace" }}>{first.match![1]}</code>);
    }
    remaining = remaining.slice(first.index + first.match![0].length);
  }
  return <>{parts}</>;
}

export function HelpButton({ articleId }: HelpButtonProps) {
  const article = getHelpArticle(articleId);
  const [open, setOpen] = useState(false);
  const [activeISU, setActiveISU] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function handleOpen() {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, left: rect.left });
    }
    setOpen(!open);
  }

  if (!article) return null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleOpen}
        title={article.title}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: open ? "#F7BB2E" : "var(--muted-foreground)",
          padding: "0.2rem", display: "flex", alignItems: "center",
          borderRadius: "4px", transition: "color 0.15s",
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.color = "#F7BB2E"; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.color = open ? "#F7BB2E" : "var(--muted-foreground)"; }}
      >
        <Lightbulb style={{ width: "0.85rem", height: "0.85rem" }} />
      </button>

      {open && createPortal(
        <div ref={popoverRef} style={{
          position: "fixed", top: pos.top, left: pos.left,
          width: "22rem", zIndex: 9999,
          background: "var(--card)", border: "1px solid var(--border)",
          borderRadius: "10px", boxShadow: "0 8px 30px rgba(0,0,0,0.4)",
          padding: "1rem",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Lightbulb style={{ width: "0.8rem", height: "0.8rem", color: "#F7BB2E" }} />
              <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>{article.title}</span>
            </div>
            <button type="button" onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "0.15rem" }}>
              <X style={{ width: "0.7rem", height: "0.7rem" }} />
            </button>
          </div>

          {renderMarkdown(article.body)}

          {article.actions && article.actions.length > 0 && (
            <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {article.actions.map((action, i) => {
                // ISU action — toggle inline settings form
                if (action.isu) {
                  const ISUComp = getISUComponent(action.isu);
                  return (
                    <div key={i}>
                      <button
                        type="button"
                        onClick={() => setActiveISU(activeISU === action.isu ? null : action.isu!)}
                        style={{
                          display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.72rem",
                          background: "none", border: "none", cursor: "pointer", padding: 0,
                          color: activeISU === action.isu ? "#F7BB2E" : "var(--foreground)",
                        }}
                      >
                        <Settings2 style={{ width: "0.7rem", height: "0.7rem", color: "#F7BB2E" }} />
                        {action.label}
                      </button>
                      {activeISU === action.isu && ISUComp && (
                        <Suspense fallback={
                          <div style={{ padding: "0.5rem 0", display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.7rem", color: "var(--muted-foreground)" }}>
                            <Loader2 className="animate-spin" style={{ width: "0.65rem", height: "0.65rem" }} /> Loading...
                          </div>
                        }>
                          <ISUComp />
                        </Suspense>
                      )}
                    </div>
                  );
                }
                // Regular action
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.72rem" }}>
                    <span style={{ color: "#F7BB2E" }}>→</span>
                    {action.href ? (
                      <a href={action.href} onClick={() => setOpen(false)} style={{ color: "var(--foreground)", textDecoration: "none" }}>{action.label}</a>
                    ) : (
                      <span style={{ color: "var(--foreground)" }}>{action.label}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {article.learnMorePath && (
            <div style={{ marginTop: "0.75rem", paddingTop: "0.5rem", borderTop: "1px solid var(--border)" }}>
              <a
                href={`https://docs.webhouse.app${article.learnMorePath}`}
                target="_blank" rel="noopener noreferrer"
                style={{ fontSize: "0.7rem", color: "#F7BB2E", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
              >
                Learn more at docs <ExternalLink style={{ width: 10, height: 10 }} />
              </a>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
