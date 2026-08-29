import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { E2E_DATA_DIR, FIXTURE_CONFIG, FIXTURE_SITE_ID } from "./fixtures/base-url";
import { TEST_PRINCIPAL } from "../src/lib/dev-jwt-secret";

/**
 * F178.5 — the suite had no seeded state at all, and every failure followed.
 *
 * The admin decides it has never been set up by counting users
 * (`/api/auth/setup` → `hasUsers: users.length > 0`). With an empty data dir
 * that is false, so /admin/login sends the browser to /admin/setup and the
 * workspace never renders. Measured through Lens against the fixture server:
 *
 *   goto /admin → 307 /admin/login → /admin/setup
 *
 * That single fact produced 20 of the 21 red tests. They were not twenty bugs
 * in twenty features — the sidebar, the tab bar, the agents list, the editor
 * and the locale filter are all simply absent from a first-run setup screen,
 * so every one of them failed as "element(s) not found" and looked like its
 * own problem.
 *
 * There was no globalSetup and nothing else seeded the directory. So the suite
 * had never once run against a configured admin, on any machine.
 *
 * DELIBERATELY NOT a login through the UI: the auth fixture mints a session
 * cookie directly, and a setup flow driven per-run would make every test
 * depend on the setup page continuing to work. This writes the two files the
 * server reads and nothing else.
 */

const REGISTRY = path.join(E2E_DATA_DIR, "registry.json");
const USERS = path.join(E2E_DATA_DIR, "_data", "users.json");

export default function globalSetup() {
  if (!existsSync(FIXTURE_CONFIG)) {
    // Fail loudly. A missing fixture config would otherwise seed a registry
    // pointing at nothing, and the suite would fail later with errors about
    // collections instead of about the thing that is actually wrong.
    throw new Error(
      `E2E fixture config not found: ${FIXTURE_CONFIG}\n` +
        `The suite seeds a registry that points at it; without the file there is nothing to test against.`,
    );
  }

  const projectDir = path.dirname(FIXTURE_CONFIG);
  // Every seeded site points at the SAME fixture project on disk. They exist so
  // the specs' hand-set cookies resolve, not to be different sites.
  const site = (id: string, name: string) => ({
    id,
    name,
    adapter: "filesystem" as const,
    configPath: FIXTURE_CONFIG,
    contentDir: path.join(projectDir, "content"),
    uploadDir: path.join(projectDir, "public", "uploads"),
  });
  mkdirSync(path.join(E2E_DATA_DIR, "_data"), { recursive: true });

  writeFileSync(
    REGISTRY,
    JSON.stringify(
      {
        defaultOrgId: "default",
        defaultSiteId: FIXTURE_SITE_ID,
        // TWO orgs, because the specs set cms-active-org/site cookies by hand
        // and they do not agree: 01-auth uses default/default, 12-i18n uses
        // examples/simple-blog. Both resolved to nothing, and the server fell
        // back with `Site "simple-blog" not found in org "examples" — searching
        // all orgs` on EVERY request those tests made.
        //
        // Seeding the ids the tests actually ask for is the honest fix: the
        // alternative is rewriting six specs to match a registry I invented,
        // which changes what they test to suit the fixture.
        orgs: [
          {
            id: "default",
            name: "Default",
            type: "company",
            plan: "pro",
            sites: [site("default", "E2E Blog"), site("cms-docs", "E2E Docs")],
          },
          {
            id: "examples",
            name: "Examples",
            type: "company",
            plan: "pro",
            sites: [site("simple-blog", "Simple Blog")],
          },
        ],
      },
      null,
      2,
    ),
  );

  // The user's id MUST be TEST_PRINCIPAL — the `sub` the auth fixture signs.
  //
  // require-role short-circuits that principal to a role, so the tests are
  // authorised either way; what is NOT short-circuited is /api/admin/profile,
  // which looks the sub up in this list. With any other id it answered 404, the
  // shared header context came back empty, and the sidebar — which renders each
  // item behind `ctxUser?.permissions?.includes(...)` — rendered NOTHING.
  //
  // So a wrong id here does not look like an auth failure. It looks like a
  // missing sidebar, a missing tab bar and a dashboard stuck on skeletons, in
  // eight tests that each name a different feature.
  writeFileSync(
    USERS,
    JSON.stringify(
      [
        {
          id: TEST_PRINCIPAL,
          email: "cb@webhouse.dk",
          name: "E2E Admin",
          role: "admin",
          createdAt: new Date(0).toISOString(),
          source: "local",
        },
      ],
      null,
      2,
    ),
  );

  seedOnboardingComplete();
  seedTeamMembership();
}

/**
 * Mark the test user's onboarding tour as already taken.
 *
 * This is what the last seven red tests actually were. A fresh user gets the
 * 7-step welcome tour 800ms after the admin mounts, and it renders a full-area
 * overlay inside <main>. Playwright's default action timeout is 0 — no limit —
 * so a click on anything underneath retried until the 90s test budget ran out.
 *
 * It presented as seven unrelated feature failures ("agent detail fields",
 * "Media content", "Tools group expands"), every one of them reporting only
 * `Test timeout of 90000ms exceeded.` with no locator error — because the click
 * never gave up long enough to produce one. The page snapshot taken at timeout
 * showed the whole page rendered correctly, which is what made it read like
 * flakiness: the element WAS there, WAS visible, and could not be reached. The
 * tell was one line at the very bottom of that snapshot: `3 / 7`.
 *
 * The tour starts unless the stored state says otherwise (`tourCompleted` OR
 * `firstLoginAt`), and that state is per-site JSON under {dataDir}/user-state/.
 * All three seeded sites share examples/blog as their projectDir, so one file
 * covers them. Both flags are written: `tourCompleted` is the honest one, and
 * `firstLoginAt` keeps it shut if the start condition is ever narrowed to that.
 */
function seedOnboardingComplete() {
  const dir = path.join(path.dirname(FIXTURE_CONFIG), "_data", "user-state");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, `${TEST_PRINCIPAL}.json`),
    JSON.stringify(
      {
        onboarding: {
          tourCompleted: true,
          firstLoginAt: new Date(0).toISOString(),
        },
      },
      null,
      2,
    ),
  );
}

/**
 * Give the test user an admin membership on the fixture site.
 *
 * `/api/auth/me` derives `siteRole` from team.json — the per-site membership
 * list — not from the user's global role. It auto-bootstraps the oldest user as
 * admin ONLY when that list is empty, and examples/blog's list has not been
 * empty since April 2026: it holds two userIds from someone's dogfooding
 * session, neither of them ours. So the bootstrap never ran, `siteRole` came
 * back null, and every sidebar item behind `siteRole === "admin"` was correctly
 * hidden from a user who genuinely had no role on that site.
 *
 * That is why "Tools group expands" failed on `nav-link-backup` while
 * `nav-link-link-checker` — same group, no role gate — was visible, and why the
 * backup PAGE loaded fine in its own test. Nothing was broken; the test user was
 * a stranger to the site.
 *
 * Appends rather than replaces: this file is real local fixture data, and a
 * suite run should not quietly delete whoever is in it.
 */
function seedTeamMembership() {
  const file = path.join(path.dirname(FIXTURE_CONFIG), "_data", "team.json");
  let members: { userId: string; role: string; addedAt?: string }[] = [];
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf-8"));
      if (Array.isArray(parsed)) members = parsed;
    } catch {
      // Unreadable list — start clean rather than fail the whole run.
    }
  }
  if (!members.some((m) => m.userId === TEST_PRINCIPAL)) {
    members.push({ userId: TEST_PRINCIPAL, role: "admin", addedAt: new Date(0).toISOString() });
    writeFileSync(file, JSON.stringify(members, null, 2));
  }
}
