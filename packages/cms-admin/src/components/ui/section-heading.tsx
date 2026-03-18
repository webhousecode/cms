/**
 * Canonical section heading for settings panels.
 * Uppercase, small — muted in light mode, white in dark mode.
 */
export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-muted-foreground dark:text-white" style={{ fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", margin: "0 0 0.875rem" }}>
      {children}
    </h2>
  );
}
