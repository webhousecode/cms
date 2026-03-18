"use client";

/**
 * Styled checkbox — matches the Toggle/Switch design language.
 * Uses primary color (gold) when checked, border color when unchecked.
 */
export function Checkbox({ checked, onChange, label, description, disabled }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1 }}>
      <div
        onClick={(e) => { e.preventDefault(); if (!disabled) onChange(!checked); }}
        style={{
          flexShrink: 0,
          width: "18px",
          height: "18px",
          borderRadius: "4px",
          border: `1.5px solid ${checked ? "var(--primary)" : "var(--border)"}`,
          background: checked ? "var(--primary)" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 150ms",
          marginTop: "1px",
        }}
      >
        {checked && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
            <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      {(label || description) && (
        <div>
          {label && <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>{label}</span>}
          {description && <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: "0.1rem 0 0" }}>{description}</p>}
        </div>
      )}
    </label>
  );
}

/**
 * Styled radio button — circle with filled dot when selected.
 * Uses primary color (gold) when selected.
 */
export function Radio({ checked, onChange, label, description, disabled }: {
  checked: boolean;
  onChange: () => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1 }}>
      <div
        onClick={(e) => { e.preventDefault(); if (!disabled) onChange(); }}
        style={{
          flexShrink: 0,
          width: "18px",
          height: "18px",
          borderRadius: "50%",
          border: `1.5px solid ${checked ? "var(--primary)" : "var(--border)"}`,
          background: "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 150ms",
          marginTop: "1px",
        }}
      >
        {checked && (
          <div style={{
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            background: "var(--primary)",
          }} />
        )}
      </div>
      {(label || description) && (
        <div>
          {label && <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>{label}</span>}
          {description && <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: "0.1rem 0 0" }}>{description}</p>}
        </div>
      )}
    </label>
  );
}
