"use client";

import { useState } from "react";
import { AlertTriangle, X, Plus, Trash2, Loader2, Check } from "lucide-react";
import { useT } from "@/lib/i18n-context";

interface Props {
  collection: string;
  collectionName: string;
  fields: string[];
}

export function SchemaDriftBanner({ collection, collectionName, fields }: Props) {
  const t = useT();
  const storageKey = `drift-dismissed:${collection}`;
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(storageKey) === "1";
  });

  // Add-to-schema state
  const [confirmAdd, setConfirmAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addResult, setAddResult] = useState<{ addedFields: string[] } | null>(null);
  const [addError, setAddError] = useState("");

  // Remove-from-content state
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeResult, setRemoveResult] = useState<{ fixed: number } | null>(null);
  const [removeError, setRemoveError] = useState("");

  if (dismissed) return null;

  async function handleAdd() {
    setAdding(true);
    setAddError("");
    try {
      const res = await fetch("/api/cms/schema-drift/add-to-schema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection: collectionName, fields }),
      });
      const data = await res.json();
      if (res.ok) {
        setAddResult(data);
        setTimeout(() => { sessionStorage.setItem(storageKey, "1"); setDismissed(true); }, 4000);
      } else {
        setAddError(data.error ?? t("schema.schemaDriftBanner.addFailed"));
        setConfirmAdd(false);
      }
    } catch (e) {
      setAddError(e instanceof Error ? e.message : t("schema.schemaDriftBanner.addFailed"));
      setConfirmAdd(false);
    }
    setAdding(false);
  }

  async function handleRemove() {
    setRemoving(true);
    setRemoveError("");
    try {
      const res = await fetch("/api/cms/schema-drift/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection: collectionName, fields }),
      });
      const data = await res.json();
      if (res.ok) {
        setRemoveResult(data);
        setTimeout(() => { sessionStorage.setItem(storageKey, "1"); setDismissed(true); }, 3000);
      } else {
        setRemoveError(data.error ?? t("schema.schemaDriftBanner.removeFailed"));
        setConfirmRemove(false);
      }
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : t("schema.schemaDriftBanner.removeFailed"));
      setConfirmRemove(false);
    }
    setRemoving(false);
  }

  if (addResult) {
    return (
      <div style={{
        margin: "0 1.25rem 0.75rem", padding: "0.75rem 1rem",
        background: "rgba(74, 222, 128, 0.08)", border: "1px solid rgba(74, 222, 128, 0.25)",
        borderRadius: "8px", display: "flex", gap: "0.75rem", alignItems: "center",
        fontSize: "0.8rem", color: "var(--foreground)",
      }}>
        <Check style={{ width: 16, height: 16, color: "#4ade80", flexShrink: 0 }} />
        {(addResult.addedFields.length > 1 ? t("schema.schemaDriftBanner.addedOther", { count: addResult.addedFields.length }) : t("schema.schemaDriftBanner.addedOne", { count: addResult.addedFields.length }))}
      </div>
    );
  }

  if (removeResult) {
    return (
      <div style={{
        margin: "0 1.25rem 0.75rem", padding: "0.75rem 1rem",
        background: "rgba(74, 222, 128, 0.08)", border: "1px solid rgba(74, 222, 128, 0.25)",
        borderRadius: "8px", display: "flex", gap: "0.75rem", alignItems: "center",
        fontSize: "0.8rem", color: "var(--foreground)",
      }}>
        <Check style={{ width: 16, height: 16, color: "#4ade80", flexShrink: 0 }} />
        {t(
          `schema.schemaDriftBanner.removed${fields.length > 1 ? "Fields" : "Field"}${removeResult.fixed !== 1 ? "Docs" : "Doc"}`,
          { count: fields.length, docs: removeResult.fixed },
        )}
      </div>
    );
  }

  return (
    <div style={{
      margin: "0 1.25rem 0.75rem",
      padding: "0.75rem 1rem",
      background: "color-mix(in srgb, var(--brand) 8%, transparent)",
      border: "1px solid color-mix(in srgb, var(--brand) 25%, transparent)",
      borderRadius: "8px",
      display: "flex",
      gap: "0.75rem",
      alignItems: "flex-start",
    }}>
      <AlertTriangle style={{ width: 18, height: 18, color: "var(--brand)", flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, fontSize: "0.8rem", lineHeight: 1.5 }}>
        <p style={{ margin: 0, fontWeight: 600, color: "var(--foreground)" }}>
          {t("schema.schemaDriftBanner.title", { collection })}
        </p>
        <p style={{ margin: "0.25rem 0 0", color: "var(--muted-foreground)" }}>
          {(fields.length > 1 ? t("schema.schemaDriftBanner.foundOther", { count: fields.length }) : t("schema.schemaDriftBanner.foundOne", { count: fields.length }))}{" "}
          <span style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
            {fields.join(", ")}
          </span>
        </p>
        <p style={{ margin: "0.25rem 0 0", color: "var(--muted-foreground)", fontSize: "0.72rem" }}>
          {t("schema.schemaDriftBanner.invisible")}
        </p>
        {(addError || removeError) && (
          <p style={{ margin: "0.25rem 0 0", color: "#f87171", fontSize: "0.72rem" }}>{addError || removeError}</p>
        )}

        <div style={{ marginTop: "0.6rem", display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          {/* Primary: Add to schema */}
          {!confirmAdd && !confirmRemove && (
            <button
              data-testid="schema-drift-add-button"
              type="button"
              onClick={() => setConfirmAdd(true)}
              style={{
                display: "inline-flex", alignItems: "center", gap: "0.375rem",
                padding: "0.3rem 0.75rem", borderRadius: "6px", border: "none",
                background: "var(--brand)", color: "var(--brand-foreground)", cursor: "pointer",
                fontSize: "0.75rem", fontWeight: 600,
              }}
            >
              <Plus style={{ width: 12, height: 12 }} /> {t("schema.schemaDriftBanner.addToSchema")}
            </button>
          )}

          {/* Confirm add */}
          {confirmAdd && (
            <>
              <span style={{ fontSize: "0.72rem", color: "var(--foreground)", fontWeight: 500 }}>
                {(fields.length > 1 ? t("schema.schemaDriftBanner.confirmAddOther", { count: fields.length }) : t("schema.schemaDriftBanner.confirmAddOne", { count: fields.length }))}
              </span>
              <button
                data-testid="schema-drift-confirm-add-yes"
                onClick={handleAdd}
                disabled={adding}
                style={{
                  fontSize: "0.7rem", padding: "0.2rem 0.5rem", borderRadius: "4px",
                  border: "none", background: "var(--primary)", color: "#0D0D0D",
                  cursor: adding ? "wait" : "pointer", display: "inline-flex", alignItems: "center", gap: "0.25rem",
                }}
              >
                {adding && <Loader2 style={{ width: 10, height: 10 }} className="animate-spin" />}
                {t("schema.schemaDriftBanner.yes")}
              </button>
              <button
                data-testid="schema-drift-confirm-add-no"
                onClick={() => setConfirmAdd(false)}
                disabled={adding}
                style={{
                  fontSize: "0.7rem", padding: "0.2rem 0.5rem", borderRadius: "4px",
                  border: "1px solid var(--border)", background: "transparent",
                  color: "var(--foreground)", cursor: "pointer",
                }}
              >
                {t("schema.schemaDriftBanner.no")}
              </button>
            </>
          )}

          {/* Secondary: Remove from content (only visible when not in confirm flow) */}
          {!confirmAdd && !confirmRemove && (
            <button
              data-testid="schema-drift-remove-button"
              type="button"
              onClick={() => setConfirmRemove(true)}
              style={{
                display: "inline-flex", alignItems: "center", gap: "0.375rem",
                padding: "0.3rem 0.65rem", borderRadius: "6px",
                border: "1px solid var(--border)", background: "transparent",
                color: "var(--muted-foreground)", cursor: "pointer",
                fontSize: "0.72rem", fontWeight: 500,
              }}
            >
              <Trash2 style={{ width: 11, height: 11 }} /> {t("schema.schemaDriftBanner.removeFromContent")}
            </button>
          )}

          {/* Confirm remove */}
          {confirmRemove && (
            <>
              <span style={{ fontSize: "0.72rem", color: "var(--destructive)", fontWeight: 500 }}>
                {(fields.length > 1 ? t("schema.schemaDriftBanner.confirmRemoveOther", { count: fields.length }) : t("schema.schemaDriftBanner.confirmRemoveOne", { count: fields.length }))}
              </span>
              <button
                data-testid="schema-drift-confirm-remove-yes"
                onClick={handleRemove}
                disabled={removing}
                style={{
                  fontSize: "0.7rem", padding: "0.2rem 0.5rem", borderRadius: "4px",
                  border: "none", background: "var(--destructive)", color: "#fff",
                  cursor: removing ? "wait" : "pointer", display: "inline-flex", alignItems: "center", gap: "0.25rem",
                }}
              >
                {removing && <Loader2 style={{ width: 10, height: 10 }} className="animate-spin" />}
                {t("schema.schemaDriftBanner.yes")}
              </button>
              <button
                data-testid="schema-drift-confirm-remove-no"
                onClick={() => setConfirmRemove(false)}
                disabled={removing}
                style={{
                  fontSize: "0.7rem", padding: "0.2rem 0.5rem", borderRadius: "4px",
                  border: "1px solid var(--border)", background: "transparent",
                  color: "var(--foreground)", cursor: "pointer",
                }}
              >
                {t("schema.schemaDriftBanner.no")}
              </button>
            </>
          )}
        </div>
      </div>
      <button
        data-testid="schema-drift-dismiss"
        type="button"
        onClick={() => { sessionStorage.setItem(storageKey, "1"); setDismissed(true); }}
        title={t("schema.schemaDriftBanner.dismiss")}
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
