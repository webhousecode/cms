/**
 * F120 — Onboarding tour definitions.
 *
 * Each tour is a sequence of tooltip steps anchored to data-testid selectors (F80).
 * All text lives in the i18n catalog (libText.onboardingTours.*). Renderers call
 * t(step.titleKey) / t(step.bodyKey), so the tour follows the ADMIN language.
 */

export interface TourStep {
  id: string;
  /** CSS selector for the target element (typically [data-testid="..."]) */
  target: string;
  /** Catalog keys (libText.onboardingTours.*) — the text lives in the i18n catalog */
  titleKey: string;
  bodyKey: string;
  /** Tooltip placement relative to target */
  placement: "top" | "bottom" | "left" | "right";
  /** Navigate to this URL before showing the step */
  navigateTo?: string;
}

export interface Tour {
  id: string;
  name: string;
  steps: TourStep[];
}

function step(id: string, target: string, key: string, placement: TourStep["placement"]): TourStep {
  const titleKey = `libText.onboardingTours.${key}.title`; // i18n-ignore: i18n key template
  const bodyKey = `libText.onboardingTours.${key}.body`; // i18n-ignore: i18n key template
  return {
    id,
    target,
    titleKey,
    bodyKey,
    placement,
  };
}

// ---------------------------------------------------------------------------
// Welcome Tour — shown on first login, walks through sidebar navigation
// ---------------------------------------------------------------------------

export const WELCOME_TOUR: Tour = {
  id: "welcome",
  name: "Welcome to webhouse.app", // i18n-ignore: internal tour label, never rendered
  steps: [
    step("welcome-dashboard", '[data-testid="nav-link-dashboard"]', "welcomeDashboard", "right"),
    step("welcome-content", '[data-testid="nav-link-content"]', "welcomeContent", "right"),
    step("welcome-chat", '[data-testid="mode-toggle-chat"]', "welcomeChat", "bottom"),
    step("welcome-agents", '[data-testid="nav-link-agents"]', "welcomeAgents", "right"),
    step("welcome-media", '[data-testid="nav-link-media"]', "welcomeMedia", "right"),
    step("welcome-tools", '[data-testid="nav-link-tools"]', "welcomeTools", "right"),
    step("welcome-done", '[data-testid="nav-link-content"]', "welcomeDone", "right"),
  ],
};

// ---------------------------------------------------------------------------
// First Document Tour — shown when user first enters the document editor
// ---------------------------------------------------------------------------

export const FIRST_DOCUMENT_TOUR: Tour = {
  id: "first-document",
  name: "Create your first document", // i18n-ignore: internal tour label, never rendered
  steps: [
    step("doc-title", '[data-testid^="field-text-title"], [data-testid^="field-text-name"]', "docTitle", "bottom"), // i18n-ignore: CSS selector
    step("doc-editor", '[data-testid^="field-richtext"]', "docEditor", "top"),
    step("doc-action-bar", '[data-testid="action-bar"]', "docActionBar", "bottom"),
  ],
};

/** All available tours */
export const TOURS: Tour[] = [WELCOME_TOUR, FIRST_DOCUMENT_TOUR];

/** Get a tour by ID */
export function getTour(id: string): Tour | undefined {
  return TOURS.find((t) => t.id === id);
}
