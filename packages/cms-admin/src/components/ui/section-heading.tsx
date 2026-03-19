/**
 * Canonical section heading for settings panels.
 * Uppercase, small — muted in light mode, white in dark mode.
 * First heading has no top margin; subsequent headings have 1.5rem gap from previous card.
 */
export function SectionHeading({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <h2 className="text-muted-foreground dark:text-white" style={{ fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", margin: `${first ? "0" : "1.5rem"} 0 0.75rem` }}>
      {children}
    </h2>
  );
}
