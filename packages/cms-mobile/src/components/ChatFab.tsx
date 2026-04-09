import { useLocation } from "wouter";

/**
 * Floating Action Button — bottom right, on every screen.
 *
 * Per user direction: "AI er en first class citizen i ALT hvad vi laver".
 * The chat with your site is the central feature, so it lives one tap
 * away on every screen via this FAB.
 *
 * Phase 1.5: opens a placeholder Chat screen.
 * Phase 6: wires to F107 backend (chat with your site, voice input).
 *
 * Position is fixed relative to the safe-area inset so it's always above
 * the home indicator and never overlapping content.
 */
export function ChatFab() {
  const [, setLocation] = useLocation();

  return (
    <button
      type="button"
      onClick={() => setLocation("/chat")}
      aria-label="Open AI chat"
      className="fixed right-5 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-brand-gold text-brand-dark shadow-xl shadow-black/50 border border-brand-goldDark active:scale-95 hover:bg-brand-goldDark transition"
      style={{
        bottom: "calc(env(safe-area-inset-bottom) + 20px)",
      }}
    >
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
        <path
          d="M21 12a8 8 0 01-12.5 6.6L3 20l1.4-5.4A8 8 0 1121 12z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="8.5" cy="12" r="1.1" fill="currentColor" />
        <circle cx="12" cy="12" r="1.1" fill="currentColor" />
        <circle cx="15.5" cy="12" r="1.1" fill="currentColor" />
      </svg>
    </button>
  );
}
