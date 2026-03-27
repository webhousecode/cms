"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";

interface Props {
  collection: string;
  fields: string[];
  schemaEnabled: boolean;
  editHref: string;
}

export function SchemaDriftBanner({ collection, fields, schemaEnabled, editHref }: Props) {
  const storageKey = `drift-dismissed:${collection}`;
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(storageKey) === "1";
  });

  if (dismissed) return null;

  return (
    <div style={{
      margin: "0 1.25rem 0.75rem",
      padding: "0.75rem 1rem",
      background: "rgba(247, 187, 46, 0.08)",
      border: "1px solid rgba(247, 187, 46, 0.25)",
      borderRadius: "8px",
      display: "flex",
      gap: "0.75rem",
      alignItems: "flex-start",
    }}>
      <AlertTriangle style={{ width: 18, height: 18, color: "#F7BB2E", flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, fontSize: "0.8rem", lineHeight: 1.5 }}>
        <p style={{ margin: 0, fontWeight: 600, color: "var(--foreground)" }}>
          Schema drift detected in &ldquo;{collection}&rdquo;
        </p>
        <p style={{ margin: "0.25rem 0 0", color: "var(--muted-foreground)" }}>
          {fields.length} field{fields.length > 1 ? "s" : ""} found in content but missing from schema:{" "}
          <span style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
            {fields.join(", ")}
          </span>
        </p>
        <p style={{ margin: "0.25rem 0 0", color: "var(--muted-foreground)", fontSize: "0.72rem" }}>
          These fields exist in your content files but are not visible in the editor. This could mean data loss.
        </p>
        {schemaEnabled && (
          <a
            href={editHref}
            style={{
              display: "inline-block",
              marginTop: "0.5rem",
              fontSize: "0.75rem",
              color: "#F7BB2E",
              textDecoration: "underline",
              textUnderlineOffset: "2px",
            }}
          >
            Edit Schema
          </a>
        )}
      </div>
      <button
        type="button"
        onClick={() => { sessionStorage.setItem(storageKey, "1"); setDismissed(true); }}
        title="Dismiss for this session"
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "var(--muted-foreground)", padding: 2, flexShrink: 0,
        }}
      >
        <X style={{ width: 14, height: 14 }} />
      </button>
    </div>
  );
}
