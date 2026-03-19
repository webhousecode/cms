"use client";

import { useState, type ReactNode, type InputHTMLAttributes } from "react";
import { Copy, Check } from "lucide-react";

/** Settings card — rounded border container for grouping fields */
export function SettingsCard({ children }: { children: ReactNode }) {
  return (
    <div style={{
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: "10px",
      padding: "1.25rem 1.5rem",
      display: "flex",
      flexDirection: "column",
      gap: "1rem",
    }}>
      {children}
    </div>
  );
}

/** Input row with label, optional description, and copy-to-clipboard button */
export function SettingsInput({ label, description, copiable, ...inputProps }: {
  label: string;
  description?: string;
  copiable?: boolean;
} & InputHTMLAttributes<HTMLInputElement>) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const value = String(inputProps.value ?? "");
    if (!value) return;
    navigator.clipboard.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
      <label style={{ fontSize: "0.75rem", fontWeight: 500 }}>{label}</label>
      {description && <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", margin: 0 }}>{description}</p>}
      <div style={{ position: "relative" }}>
        <input
          {...inputProps}
          style={{
            padding: "0.45rem 0.75rem",
            paddingRight: copiable ? "2.25rem" : "0.75rem",
            borderRadius: "7px",
            border: "1px solid var(--border)",
            background: "var(--background)",
            color: "var(--foreground)",
            fontSize: "0.875rem",
            outline: "none",
            width: "100%",
            boxSizing: "border-box",
          }}
          onFocus={(e) => { e.target.style.borderColor = "var(--primary)"; }}
          onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
        />
        {copiable && inputProps.value && (
          <button
            type="button"
            onClick={handleCopy}
            title="Copy to clipboard"
            style={{
              position: "absolute",
              right: "0.5rem",
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: copied ? "rgb(74 222 128)" : "var(--muted-foreground)",
              padding: "0.1rem",
              display: "flex",
              alignItems: "center",
            }}
          >
            {copied ? <Check style={{ width: "0.85rem", height: "0.85rem" }} /> : <Copy style={{ width: "0.85rem", height: "0.85rem" }} />}
          </button>
        )}
      </div>
    </div>
  );
}
