"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  min?: string;
  max?: string;
  style?: CSSProperties;
}

function isValidYmd(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (mo < 1 || mo > 12) return false;
  if (d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

function normalize(raw: string): string | null {
  const compact = raw.replace(/[.\/\s]/g, "-").trim();
  const m = /^(\d{1,4})-(\d{1,2})-(\d{1,4})$/.exec(compact);
  if (!m) return null;
  let y: string, mo: string, d: string;
  if (m[1].length === 4) {
    y = m[1];
    mo = m[2].padStart(2, "0");
    d = m[3].padStart(2, "0");
  } else if (m[3].length === 4) {
    d = m[1].padStart(2, "0");
    mo = m[2].padStart(2, "0");
    y = m[3];
  } else {
    return null;
  }
  const candidate = `${y}-${mo}-${d}`;
  return isValidYmd(candidate) ? candidate : null;
}

function ymd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseYmdLocal(s: string): Date | null {
  if (!isValidYmd(s)) return null;
  const [y, mo, d] = s.split("-").map((n) => parseInt(n, 10));
  return new Date(y, mo - 1, d);
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function CustomDateInput({
  value,
  onChange,
  disabled = false,
  placeholder = "YYYY-MM-DD",
  min,
  max,
  style,
}: Props) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState<Date>(() => parseYmdLocal(value) ?? new Date());
  const lastEmitted = useRef(value);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focused && value !== lastEmitted.current) {
      setDraft(value);
      lastEmitted.current = value;
      const d = parseYmdLocal(value);
      if (d) setCursor(d);
    }
  }, [value, focused]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const normalizedDraft = normalize(draft);
  const draftIsValid = normalizedDraft !== null;
  const showError = focused && draft.length > 0 && !draftIsValid;

  function emit(v: string) {
    if (v !== lastEmitted.current) {
      lastEmitted.current = v;
      onChange(v);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value.replace(/[^\d\-./\s]/g, "").slice(0, 10);
    setDraft(next);
    const n = normalize(next);
    if (n !== null) {
      emit(n);
      const d = parseYmdLocal(n);
      if (d) setCursor(d);
    }
  }

  function handleBlur() {
    setFocused(false);
    const n = normalize(draft);
    if (n !== null) {
      setDraft(n);
      emit(n);
    } else {
      setDraft(value);
    }
  }

  function pickDate(d: Date) {
    const v = ymd(d);
    setDraft(v);
    emit(v);
    setOpen(false);
  }

  function inRange(d: Date): boolean {
    const v = ymd(d);
    if (min && v < min) return false;
    if (max && v > max) return false;
    return true;
  }

  // Calendar grid
  const calStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const calStartDay = (calStart.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const today = ymd(new Date());
  const selectedYmd = isValidYmd(value) ? value : null;

  const cells: Array<Date | null> = [];
  for (let i = 0; i < calStartDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "flex", flexDirection: "column", gap: "0.2rem", ...style }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          value={draft}
          placeholder={placeholder}
          disabled={disabled}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          style={{
            width: "100%",
            padding: "0.35rem 2rem 0.35rem 0.625rem",
            borderRadius: "6px",
            border: `1px solid ${
              showError ? "var(--destructive)" : focused || open ? "var(--primary)" : "var(--border)"
            }`,
            background: disabled ? "var(--muted)" : "var(--card)",
            color: disabled ? "var(--muted-foreground)" : "var(--foreground)",
            fontSize: "0.8125rem",
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
            letterSpacing: "0.02em",
            cursor: disabled ? "not-allowed" : "text",
            outline: "none",
            transition: "border-color 120ms",
            opacity: disabled ? 0.6 : 1,
          }}
        />
        <button
          type="button"
          onClick={() => {
            if (disabled) return;
            const d = parseYmdLocal(draft) ?? parseYmdLocal(value) ?? new Date();
            setCursor(d);
            setOpen((v) => !v);
          }}
          disabled={disabled}
          aria-label="Open calendar"
          style={{
            position: "absolute",
            right: "0.4rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "1.3rem",
            height: "1.3rem",
            background: "transparent",
            border: "none",
            color: "var(--muted-foreground)",
            cursor: disabled ? "not-allowed" : "pointer",
            borderRadius: "4px",
          }}
        >
          <Calendar style={{ width: "0.85rem", height: "0.85rem" }} />
        </button>
      </div>
      {showError && (
        <span style={{ fontSize: "0.7rem", color: "var(--destructive)", lineHeight: 1.2 }}>
          Use YYYY-MM-DD
        </span>
      )}
      {open && !disabled && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 9999,
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)",
            padding: "0.6rem",
            minWidth: "240px",
            animation: "csDown 100ms ease-out",
          }}
        >
          <style>{`@keyframes csDown{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}`}</style>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
            <button
              type="button"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              style={navBtnStyle}
              aria-label="Previous month"
            >
              <ChevronLeft style={{ width: "0.8rem", height: "0.8rem" }} />
            </button>
            <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>
              {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
            </span>
            <button
              type="button"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              style={navBtnStyle}
              aria-label="Next month"
            >
              <ChevronRight style={{ width: "0.8rem", height: "0.8rem" }} />
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px" }}>
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <div
                key={i}
                style={{
                  fontSize: "0.65rem",
                  textAlign: "center",
                  color: "var(--muted-foreground)",
                  padding: "0.2rem 0",
                }}
              >
                {d}
              </div>
            ))}
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const v = ymd(d);
              const isSel = v === selectedYmd;
              const isToday = v === today;
              const enabled = inRange(d);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!enabled}
                  onClick={() => enabled && pickDate(d)}
                  style={{
                    fontSize: "0.75rem",
                    padding: "0.3rem 0",
                    borderRadius: "4px",
                    border: isToday && !isSel ? "1px solid var(--primary)" : "1px solid transparent",
                    background: isSel ? "var(--primary)" : "transparent",
                    color: !enabled
                      ? "var(--muted-foreground)"
                      : isSel
                      ? "var(--primary-foreground, #fff)"
                      : "var(--foreground)",
                    cursor: enabled ? "pointer" : "not-allowed",
                    opacity: enabled ? 1 : 0.35,
                    transition: "background 80ms",
                  }}
                  onMouseEnter={(e) => {
                    if (enabled && !isSel)
                      e.currentTarget.style.background =
                        "color-mix(in srgb, var(--primary) 12%, transparent)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSel) e.currentTarget.style.background = "transparent";
                  }}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.5rem" }}>
            <button type="button" onClick={() => pickDate(new Date())} style={footBtnStyle}>
              Today
            </button>
            {value && (
              <button
                type="button"
                onClick={() => {
                  setDraft("");
                  emit("");
                  setOpen(false);
                }}
                style={footBtnStyle}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const navBtnStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "1.5rem",
  height: "1.5rem",
  borderRadius: "4px",
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--foreground)",
  cursor: "pointer",
};

const footBtnStyle: CSSProperties = {
  fontSize: "0.7rem",
  padding: "0.2rem 0.5rem",
  borderRadius: "4px",
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--foreground)",
  cursor: "pointer",
};
