/**
 * ModeToggle — small bordered pill that switches between a UI editor
 * and a JSON view of the same data. Originally lived inline in
 * structured-array-editor.tsx; extracted here so the agent workflow
 * editor (and any future curator-facing JSON-aware view) can reuse it.
 */
"use client";

import { Code, LayoutList } from "lucide-react";

export function ModeToggle({ mode, onToggle }: { mode: "ui" | "json"; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={mode === "ui" ? "Switch to JSON" : "Switch to UI"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3rem",
        background: "none",
        border: "1px solid var(--border)",
        borderRadius: "5px",
        cursor: "pointer",
        color: "var(--muted-foreground)",
        fontSize: "0.7rem",
        padding: "0.2rem 0.5rem",
      }}
      className="hover:border-primary hover:text-primary transition-colors"
    >
      {mode === "ui"
        ? <Code style={{ width: 12, height: 12 }} />
        : <LayoutList style={{ width: 12, height: 12 }} />}
      {mode === "ui" ? "JSON" : "UI"}
    </button>
  );
}
