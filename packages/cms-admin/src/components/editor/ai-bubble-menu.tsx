"use client";

import { BubbleMenu } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { useState } from "react";
import { Sparkles, ChevronDown } from "lucide-react";

interface Props {
  editor: Editor;
}

type Action = {
  label: string;
  instruction: string;
};

const QUICK_ACTIONS: Action[] = [
  { label: "Shorter", instruction: "Rewrite this text to be more concise while keeping the meaning." },
  { label: "Longer", instruction: "Expand this text with more detail and context." },
  { label: "Formal", instruction: "Rewrite in a more formal, professional tone." },
  { label: "Casual", instruction: "Rewrite in a casual, conversational tone." },
  { label: "→ English", instruction: "Translate this text to English." },
  { label: "→ Danish", instruction: "Translate this text to Danish." },
];

export function AIBubbleMenu({ editor }: Props) {
  const [loading, setLoading] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customInstruction, setCustomInstruction] = useState("");
  const [error, setError] = useState("");

  async function rewrite(instruction: string) {
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, " ");
    if (!selectedText.trim()) return;

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/cms/ai/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: selectedText, instruction }),
      });
      const data = (await res.json()) as { result?: string; error?: string };
      if (!res.ok || !data.result) {
        setError(data.error ?? "AI rewrite failed");
        setLoading(false);
        return;
      }
      // Replace selected text with result
      editor.chain().focus().deleteSelection().insertContent(data.result).run();
      setShowCustom(false);
      setCustomInstruction("");
    } catch {
      setError("Network error");
    }
    setLoading(false);
  }

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{ duration: 100, placement: "top-start", maxWidth: "none" }}
      shouldShow={({ editor, from, to }) => {
        return !editor.isActive("image") && from !== to;
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0",
          background: "var(--popover)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
          overflow: "hidden",
          minWidth: "200px",
        }}
      >
        {/* Quick actions row */}
        <div style={{ display: "flex", alignItems: "center", gap: "0", borderBottom: showCustom ? "1px solid var(--border)" : undefined }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
            padding: "0.35rem 0.5rem",
            borderRight: "1px solid var(--border)",
            color: "var(--muted-foreground)",
            fontSize: "0.7rem",
          }}>
            <Sparkles style={{ width: "0.8rem", height: "0.8rem" }} />
            <span style={{ fontWeight: 600, letterSpacing: "0.03em" }}>AI</span>
          </div>
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              disabled={loading}
              onClick={() => rewrite(action.instruction)}
              style={{
                padding: "0.35rem 0.5rem",
                fontSize: "0.72rem",
                background: "transparent",
                border: "none",
                borderRight: "1px solid var(--border)",
                color: loading ? "var(--muted-foreground)" : "var(--foreground)",
                cursor: loading ? "wait" : "pointer",
                whiteSpace: "nowrap",
                transition: "background 100ms",
              }}
              onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = "var(--accent)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              {loading ? "…" : action.label}
            </button>
          ))}
          <button
            type="button"
            disabled={loading}
            onClick={() => setShowCustom((o) => !o)}
            title="Custom instruction"
            style={{
              padding: "0.35rem 0.5rem",
              fontSize: "0.72rem",
              background: showCustom ? "var(--accent)" : "transparent",
              border: "none",
              color: "var(--muted-foreground)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.2rem",
            }}
          >
            Custom <ChevronDown style={{ width: "0.65rem", height: "0.65rem" }} />
          </button>
        </div>

        {/* Custom instruction input */}
        {showCustom && (
          <div style={{ padding: "0.5rem", display: "flex", gap: "0.375rem" }}>
            <input
              type="text"
              value={customInstruction}
              onChange={(e) => setCustomInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && customInstruction.trim()) {
                  rewrite(customInstruction);
                }
                if (e.key === "Escape") setShowCustom(false);
              }}
              autoFocus
              placeholder="e.g. Make it a question"
              style={{
                flex: 1,
                padding: "0.3rem 0.5rem",
                borderRadius: "5px",
                border: "1px solid var(--border)",
                background: "var(--background)",
                color: "var(--foreground)",
                fontSize: "0.75rem",
                outline: "none",
              }}
            />
            <button
              type="button"
              disabled={loading || !customInstruction.trim()}
              onClick={() => rewrite(customInstruction)}
              style={{
                padding: "0.3rem 0.625rem",
                borderRadius: "5px",
                border: "none",
                background: "var(--primary)",
                color: "var(--primary-foreground)",
                fontSize: "0.75rem",
                cursor: loading || !customInstruction.trim() ? "not-allowed" : "pointer",
                opacity: loading || !customInstruction.trim() ? 0.5 : 1,
              }}
            >
              Go
            </button>
          </div>
        )}

        {error && (
          <p style={{ padding: "0.35rem 0.75rem", fontSize: "0.7rem", color: "var(--destructive)", margin: 0, borderTop: "1px solid var(--border)" }}>
            {error}
          </p>
        )}
      </div>
    </BubbleMenu>
  );
}
