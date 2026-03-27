"use client";

import { useState } from "react";
import { AlertTriangle, X, Wrench, Loader2 } from "lucide-react";

interface Props {
  collection: string;
  collectionName: string;
  fields: string[];
}

export function SchemaDriftBanner({ collection, collectionName, fields }: Props) {
  const storageKey = `drift-dismissed:${collection}`;
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(storageKey) === "1";
  });
  const [confirmFix, setConfirmFix] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [result, setResult] = useState<{ fixed: number } | null>(null);

  if (dismissed) return null;

  async function handleFix() {
    setFixing(true);
    try {
      const res = await fetch("/api/cms/schema-drift/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection: collectionName, fields }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
        setTimeout(() => setDismissed(true), 3000);
      }
    } catch { /* ignore */ }
    setFixing(false);
  }

  if (result) {
    return (
      <div style={{
        margin: "0 1.25rem 0.75rem", padding: "0.75rem 1rem",
        background: "rgba(74, 222, 128, 0.08)", border: "1px solid rgba(74, 222, 128, 0.25)",
        borderRadius: "8px", display: "flex", gap: "0.75rem", alignItems: "center",
        fontSize: "0.8rem", color: "var(--foreground)",
      }}>
        <span style={{ color: "#4ade80" }}>&#10003;</span>
        Removed {fields.length} orphaned field{fields.length > 1 ? "s" : ""} from {result.fixed} document{result.fixed !== 1 ? "s" : ""}.
      </div>
    );
  }

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
          These fields exist in your content files but are not visible in the editor.
        </p>
        <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {!confirmFix ? (
            <button
              type="button"
              onClick={() => setConfirmFix(true)}
              style={{
                display: "inline-flex", alignItems: "center", gap: "0.375rem",
                padding: "0.3rem 0.75rem", borderRadius: "6px", border: "none",
                background: "#F7BB2E", color: "#0D0D0D", cursor: "pointer",
                fontSize: "0.75rem", fontWeight: 600,
              }}
            >
              <Wrench style={{ width: 12, height: 12 }} /> Remove orphaned fields
            </button>
          ) : (
            <>
              <span style={{ fontSize: "0.72rem", color: "var(--destructive)", fontWeight: 500 }}>
                Remove {fields.length} field{fields.length > 1 ? "s" : ""} from all documents?
              </span>
              <button
                onClick={handleFix}
                disabled={fixing}
                style={{
                  fontSize: "0.7rem", padding: "0.2rem 0.5rem", borderRadius: "4px",
                  border: "none", background: "var(--destructive)", color: "#fff",
                  cursor: fixing ? "wait" : "pointer", display: "inline-flex", alignItems: "center", gap: "0.25rem",
                }}
              >
                {fixing ? <Loader2 style={{ width: 10, height: 10, animation: "spin 1s linear infinite" }} /> : null}
                Yes
              </button>
              <button
                onClick={() => setConfirmFix(false)}
                style={{
                  fontSize: "0.7rem", padding: "0.2rem 0.5rem", borderRadius: "4px",
                  border: "1px solid var(--border)", background: "transparent",
                  color: "var(--foreground)", cursor: "pointer",
                }}
              >
                No
              </button>
            </>
          )}
        </div>
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
