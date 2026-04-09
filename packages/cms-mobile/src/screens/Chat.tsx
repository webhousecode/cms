import { useLocation } from "wouter";
import { Screen } from "@/components/Screen";
import { ScreenHeader, BackButton } from "@/components/ScreenHeader";

/**
 * AI Chat screen — placeholder for Phase 1.5.
 *
 * Phase 6 wires this to F107 (Chat with Your Site) — full conversation,
 * voice input, agent tool calls, push when long-running tasks complete.
 *
 * Per user direction: AI is a first-class citizen in everything, so the
 * chat is reachable from EVERY screen via the bottom-right FAB.
 */
export function Chat() {
  const [, setLocation] = useLocation();

  return (
    <Screen>
      <ScreenHeader
        left={<BackButton onClick={() => window.history.back()} />}
        subtitle="Assistant"
        title="Chat with your site"
      />

      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="text-5xl">💬</div>
        <h2 className="text-lg font-semibold">Coming in Phase 6</h2>
        <p className="max-w-xs text-sm text-white/60">
          Talk to your CMS like a teammate — ask questions, get drafts, run
          long-running agents in the background and get a push when they're done.
          Voice input, F107 tool integration, the works.
        </p>
        <button
          type="button"
          onClick={() => setLocation("/home")}
          className="mt-4 text-sm text-brand-gold hover:underline"
        >
          Back to home
        </button>
      </div>
    </Screen>
  );
}
