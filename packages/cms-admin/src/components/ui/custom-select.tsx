"use client";

import { useState, useRef, useEffect, type CSSProperties, type KeyboardEvent } from "react";
import { ChevronDown, Check } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface Props {
  options: SelectOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  direction?: "up" | "down" | "auto";
  disabled?: boolean;
  style?: CSSProperties;
  className?: string;
}

export function CustomSelect({
  options,
  value,
  onChange,
  placeholder,
  direction = "auto",
  disabled = false,
  style,
}: Props) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(0);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [animDir, setAnimDir] = useState<"up" | "down">("down");
  const selected = options.find((o) => o.value === value);

  // Compute fixed position when opening
  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuH = Math.min(options.length * 36 + 8, 260);
    const MARGIN = 6;
    const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
    const spaceAbove = rect.top - MARGIN;
    const goUp = direction === "up" || (direction === "auto" && spaceAbove > spaceBelow && spaceAbove >= menuH);
    setAnimDir(goUp ? "up" : "down");
    if (goUp) {
      const top = Math.max(MARGIN, rect.top - menuH);
      setMenuStyle({ top, left: rect.left, width: rect.width, maxHeight: rect.top - MARGIN });
    } else {
      const maxH = Math.min(menuH, spaceBelow);
      setMenuStyle({ top: rect.bottom + MARGIN, left: rect.left, width: rect.width, maxHeight: maxH });
    }
  }, [open, direction, options.length]);

  // Close on outside click or scroll
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleScroll(e: Event) {
      // Don't close if scrolling inside the dropdown itself
      if (ref.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("scroll", handleScroll, true);
    };
  }, [open]);

  function toggle() {
    if (disabled) return;
    setOpen((v) => {
      if (!v) setFocused(Math.max(0, options.findIndex((o) => o.value === value)));
      return !v;
    });
  }

  function select(val: string) {
    onChange(val);
    setOpen(false);
  }

  function handleKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setFocused(Math.max(0, options.findIndex((o) => o.value === value)));
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setFocused((i) => Math.min(i + 1, options.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFocused((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const opt = options[focused];
      if (opt && !opt.disabled) select(opt.value);
    }
  }

  return (
    <div ref={ref} style={{ position: "relative", ...style }}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        onKeyDown={handleKey}
        disabled={disabled}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "0.375rem",
          padding: "0.35rem 0.5rem 0.35rem 0.625rem",
          borderRadius: "6px",
          border: `1px solid ${open ? "var(--primary)" : "var(--border)"}`,
          background: open
            ? "color-mix(in srgb, var(--primary) 8%, var(--card))"
            : disabled
            ? "var(--muted)/40"
            : "var(--card)",
          color: disabled ? "var(--muted-foreground)" : "var(--foreground)",
          fontSize: "0.8125rem",
          cursor: disabled ? "not-allowed" : "pointer",
          textAlign: "left",
          transition: "border-color 120ms, background 120ms",
          outline: "none",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected?.label ?? placeholder ?? "—"}
        </span>
        <ChevronDown
          style={{
            width: "0.7rem",
            height: "0.7rem",
            flexShrink: 0,
            color: "var(--muted-foreground)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 150ms",
          }}
        />
      </button>

      {/* Dropdown panel — fixed position to escape any overflow:hidden parent */}
      {open && (
        <div
          style={{
            position: "fixed",
            ...menuStyle,
            zIndex: 9999,
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)",
            overflowY: "auto",
            animation: animDir === "up" ? "csUp 100ms ease-out" : "csDown 100ms ease-out",
          }}
        >
          <style>{`
            @keyframes csDown{from{opacity:0;transform:translateY(-4px) scale(0.97)}to{opacity:1;transform:translateY(0) scale(1)}}
            @keyframes csUp{from{opacity:0;transform:translateY(4px) scale(0.97)}to{opacity:1;transform:translateY(0) scale(1)}}
          `}</style>
          {options.map((opt, i) => {
            const isSel = opt.value === value;
            const isFoc = i === focused;
            return (
              <div
                key={opt.value}
                onMouseEnter={() => !opt.disabled && setFocused(i)}
                onClick={() => !opt.disabled && select(opt.value)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.45rem 0.625rem",
                  fontSize: "0.8125rem",
                  cursor: opt.disabled ? "not-allowed" : "pointer",
                  background: isFoc && !opt.disabled
                    ? "color-mix(in srgb, var(--primary) 12%, var(--card))"
                    : "transparent",
                  color: opt.disabled
                    ? "var(--muted-foreground)"
                    : isSel
                    ? "var(--primary)"
                    : "var(--foreground)",
                  fontWeight: isSel ? 500 : 400,
                  opacity: opt.disabled ? 0.5 : 1,
                  transition: "background 80ms",
                }}
              >
                <span style={{ width: "0.75rem", flexShrink: 0, display: "flex", alignItems: "center" }}>
                  {isSel && <Check style={{ width: "0.65rem", height: "0.65rem" }} />}
                </span>
                {opt.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
