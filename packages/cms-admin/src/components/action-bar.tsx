"use client";

import type { ReactNode } from "react";

/* ─── ActionBar ─────────────────────────────────────────────── */

interface ActionBarProps {
  children?: ReactNode;   // Left side: breadcrumb, title, status
  actions?: ReactNode;    // Right side: buttons
}

/**
 * Standardized action bar — sticky below tabs (top: 48px header + 36px tab bar = 84px).
 * Fixed 40px height. Left: breadcrumb/context. Right: action buttons.
 */
export function ActionBar({ children, actions }: ActionBarProps) {
  return (
    <div style={{
      position: "sticky",
      top: 84, // header 48px + tab bar 36px
      zIndex: 29,
      height: "40px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 1.5rem",
      borderBottom: "1px solid var(--border)",
      backgroundColor: "var(--card)",
      flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", overflow: "hidden", minWidth: 0 }}>
        {children}
      </div>
      {actions && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </div>
  );
}

/* ─── Breadcrumb ────────────────────────────────────────────── */

/** Muted breadcrumb text with separator */
export function ActionBarBreadcrumb({ items }: { items: string[] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", overflow: "hidden" }}>
      {items.map((item, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          {i > 0 && <span style={{ color: "var(--border)", fontSize: "0.75rem" }}>/</span>}
          <span style={{
            fontSize: "0.8rem",
            color: i === items.length - 1 ? "var(--foreground)" : "var(--muted-foreground)",
            fontWeight: i === items.length - 1 ? 500 : 400,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {item}
          </span>
        </span>
      ))}
    </div>
  );
}

/* ─── ActionButton ──────────────────────────────────────────── */

interface ActionButtonProps {
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost";
  children: ReactNode;
  title?: string;
  icon?: ReactNode;
}

const VARIANT_STYLES = {
  primary: {
    background: "var(--primary)",
    color: "var(--primary-foreground)",
    border: "none",
  },
  secondary: {
    background: "transparent",
    color: "var(--foreground)",
    border: "1px solid var(--border)",
  },
  ghost: {
    background: "transparent",
    color: "var(--muted-foreground)",
    border: "none",
  },
} as const;

/**
 * Standardized action button — 28px height, consistent padding.
 * Use inside ActionBar's `actions` slot.
 */
export function ActionButton({ onClick, disabled, variant = "secondary", children, title, icon }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        ...VARIANT_STYLES[variant],
        height: "28px",
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        padding: icon && !children ? "0 0.35rem" : "0 0.65rem",
        borderRadius: "6px",
        fontSize: "0.75rem",
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        whiteSpace: "nowrap",
        transition: "opacity 0.15s",
        lineHeight: 1,
      }}
    >
      {icon}
      {children}
    </button>
  );
}
