"use client";

import { useState, useEffect, useRef, type CSSProperties } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  style?: CSSProperties;
}

function parseTime(raw: string): { hh: string; mm: string; valid: boolean } {
  const normalized = raw.replace(/[.\s]/g, ":").trim();
  const m = /^(\d{1,2})(?::(\d{0,2}))?$/.exec(normalized);
  if (!m) return { hh: "", mm: "", valid: false };
  const hh = m[1] ?? "";
  const mm = m[2] ?? "";
  const h = parseInt(hh, 10);
  const mi = mm === "" ? 0 : parseInt(mm, 10);
  const valid =
    hh.length > 0 &&
    !Number.isNaN(h) &&
    h >= 0 &&
    h <= 23 &&
    !Number.isNaN(mi) &&
    mi >= 0 &&
    mi <= 59 &&
    (mm === "" || mm.length === 1 || mm.length === 2);
  return { hh, mm, valid };
}

function normalize(raw: string): string | null {
  const { hh, mm, valid } = parseTime(raw);
  if (!valid) return null;
  const h = parseInt(hh, 10);
  const mi = mm === "" ? 0 : parseInt(mm, 10);
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

export function CustomTimeInput({ value, onChange, disabled = false, style }: Props) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const lastEmitted = useRef(value);

  useEffect(() => {
    if (!focused && value !== lastEmitted.current) {
      setDraft(value);
      lastEmitted.current = value;
    }
  }, [value, focused]);

  const normalizedDraft = normalize(draft);
  const draftIsValid = normalizedDraft !== null;
  const showError = focused && draft.length > 0 && !draftIsValid;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value.replace(/[^\d:.]/g, "").replace(/\./g, ":").slice(0, 5);
    setDraft(next);
    const n = normalize(next);
    if (n !== null && n !== lastEmitted.current) {
      lastEmitted.current = n;
      onChange(n);
    }
  }

  function handleBlur() {
    setFocused(false);
    const n = normalize(draft);
    if (n !== null) {
      setDraft(n);
      if (n !== lastEmitted.current) {
        lastEmitted.current = n;
        onChange(n);
      }
    } else {
      setDraft(value);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem", ...style }}>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        value={draft}
        placeholder="HH:MM"
        disabled={disabled}
        onChange={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        style={{
          width: "100%",
          padding: "0.35rem 0.5rem 0.35rem 0.625rem",
          borderRadius: "6px",
          border: `1px solid ${
            showError ? "var(--destructive)" : focused ? "var(--primary)" : "var(--border)"
          }`,
          background: disabled ? "var(--muted)" : "var(--card)",
          color: disabled ? "var(--muted-foreground)" : "var(--foreground)",
          fontSize: "0.8125rem",
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          letterSpacing: "0.04em",
          cursor: disabled ? "not-allowed" : "text",
          outline: "none",
          transition: "border-color 120ms",
          opacity: disabled ? 0.6 : 1,
        }}
      />
      {showError && (
        <span style={{ fontSize: "0.7rem", color: "var(--destructive)", lineHeight: 1.2 }}>
          Use HH:MM (00:00 – 23:59)
        </span>
      )}
    </div>
  );
}
