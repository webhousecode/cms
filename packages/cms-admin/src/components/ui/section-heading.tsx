/**
 * Canonical section heading for settings panels.
 * Uppercase, small — muted in light mode, white in dark mode.
 * First heading has no top margin; subsequent headings have 1.5rem gap from previous card.
 *
 * Optional `id` lets command-palette / external links scroll directly to a
 * named section (e.g. /admin/settings?tab=deploy#custom-domain).
 */
export function SectionHeading({ children, first, id }: { children: React.ReactNode; first?: boolean; id?: string }) {
  return (
    <h2 id={id} className="text-muted-foreground dark:text-white" style={{ fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", margin: `${first ? "0" : "1.5rem"} 0 0.75rem`, scrollMarginTop: "5rem" }}>
      {children}
    </h2>
  );
}
