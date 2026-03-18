/**
 * Canonical section heading for settings panels.
 * Uppercase, muted, small — used across all Account & Site Settings tabs.
 */
export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted-foreground)", margin: "0 0 0.875rem" }}>
      {children}
    </h2>
  );
}
