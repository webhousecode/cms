"use client";

interface Props {
  children?: React.ReactNode;
}

export function PageHeader({ children }: Props) {
  if (!children) return null;
  return (
    <header style={{ position: "sticky", top: 84, zIndex: 30, height: "40px", display: "flex", alignItems: "center", borderBottom: "1px solid var(--border)", backgroundColor: "var(--card)" }}>
      <div style={{ display: "flex", flex: 1, alignItems: "center", gap: "0.5rem", padding: "0 1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", color: "var(--muted-foreground)", fontFamily: "monospace" }}>{children}</div>
      </div>
    </header>
  );
}
