/**
 * Server-side user state persistence.
 * Each user gets a JSON file at _data/user-state/{userId}.json.
 * Contains tabs, sidebar prefs, editor prefs — everything that should
 * survive browser clears and device switches.
 */
import fs from "fs/promises";
import path from "path";
import { getActiveSitePaths } from "./site-paths";

export interface UserTab {
  id: string;
  path: string;
  title: string;
  status?: string;
}

export interface Favorite {
  /** Unique ID (auto-generated) */
  id: string;
  /** Favorite type */
  type: "document" | "collection" | "page" | "tool" | "interactive";
  /** Display label */
  label: string;
  /** Admin route, used as unique key */
  path: string;
  /** Lucide icon name (optional) */
  icon?: string;
  /** For documents: which collection */
  collection?: string;
  /** For documents: which slug */
  slug?: string;
  /** ISO timestamp when added */
  addedAt: string;
}

export interface OnboardingState {
  /** Has user completed the main welcome tour? */
  tourCompleted: boolean;
  /** Step IDs that have been seen/dismissed */
  completedSteps: string[];
  /** Currently active tour ID (null = no tour running) */
  activeTour: string | null;
  /** Timestamp of first login (set once) */
  firstLoginAt: string | null;
}

export interface UserState {
  /** Open editor tabs */
  tabs: UserTab[];
  /** Active tab ID */
  activeTabId: string | null;
  /** Sidebar preferences */
  sidebarContentOpen: boolean;
  /** Show logo icon in sidebar */
  showLogoIcon: boolean;
  /** Agents view mode */
  agentsView: "grid" | "list";
  /** Curation queue active tab */
  curationTab: string;
  /** Default calendar view */
  calendarView: "day" | "week" | "month" | "year";
  /** Default media view */
  mediaView: "grid" | "list";
  /** Default interactives view */
  intsView: "grid" | "list";
  /** Onboarding tour progress (F120) */
  onboarding: OnboardingState;
  /** Favorites (F94) */
  favorites: Favorite[];
  /** Sidebar Favorites section collapsed state */
  sidebarFavoritesOpen: boolean;
  /** Last update */
  updatedAt: string;
}

const ONBOARDING_DEFAULTS: OnboardingState = {
  tourCompleted: false,
  completedSteps: [],
  activeTour: null,
  firstLoginAt: null,
};

const DEFAULTS: UserState = {
  tabs: [],
  activeTabId: null,
  sidebarContentOpen: true,
  showLogoIcon: true,
  agentsView: "grid",
  curationTab: "ready",
  calendarView: "week",
  mediaView: "grid",
  intsView: "grid",
  onboarding: ONBOARDING_DEFAULTS,
  favorites: [],
  sidebarFavoritesOpen: true,
  updatedAt: new Date().toISOString(),
};

/**
 * Per-site user state — stored in the active site's _data/user-state/.
 * Tabs are site-specific (different collections/documents per site).
 */
async function getStatePath(userId: string): Promise<string> {
  const { dataDir } = await getActiveSitePaths();
  const dir = path.join(dataDir, "user-state");
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, `${userId}.json`);
}

export async function readUserState(userId: string): Promise<UserState> {
  try {
    const filePath = await getStatePath(userId);
    const raw = await fs.readFile(filePath, "utf-8");
    const stored = JSON.parse(raw) as Partial<UserState>;
    return {
      ...DEFAULTS,
      ...stored,
      // Deep-merge onboarding so existing users get defaults for new fields
      onboarding: { ...ONBOARDING_DEFAULTS, ...(stored.onboarding ?? {}) },
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function writeUserState(userId: string, patch: Partial<UserState>): Promise<UserState> {
  const filePath = await getStatePath(userId);
  let existing: Partial<UserState> = {};
  try {
    existing = JSON.parse(await fs.readFile(filePath, "utf-8")) as Partial<UserState>;
  } catch { /* first write */ }

  const merged = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  await fs.writeFile(filePath, JSON.stringify(merged, null, 2));
  return { ...DEFAULTS, ...merged };
}
