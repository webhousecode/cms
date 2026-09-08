/**
 * F191.8 — podcast-modulet. ÉN rute, tre faner.
 *
 * Skallen: ActionBar + fanerne, præcis som /admin/agents. Indholdet af hver
 * fane bor i components/podcast/*-fane.tsx; de var indtil nu tre selvstændige
 * ruter man forlod hinanden for at nå.
 *
 * Afsnits-DETALJEN bliver på sin egen rute (/admin/podcast/<slug>) — samme
 * skille som Agents har mellem listen og /admin/agents/[id], og Christian
 * bruger den URL direkte.
 */
import { ActionBar, ActionBarBreadcrumb } from "@/components/action-bar";
import { PodcastTabs } from "@/components/podcast-tabs";

export default function PodcastPage() {
  return (
    <div data-testid="podcast-root">
      <ActionBar>
        <ActionBarBreadcrumb items={["Podcast"]} />
      </ActionBar>
      <div style={{ padding: "1.25rem 1.5rem" }}>
        <PodcastTabs />
      </div>
    </div>
  );
}
