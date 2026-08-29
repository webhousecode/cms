import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { E2E_DATA_DIR, FIXTURE_CONFIG, FIXTURE_SITE_ID } from "./fixtures/base-url";

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

  // The session the auth fixture mints carries sub=TEST_PRINCIPAL and gets its
  // role from require-role's short-circuit, so this user is not what authorises
  // the tests. It exists so `hasUsers` is true — that is the whole job, and
  // pretending otherwise would invite someone to "fix" auth by editing it.
  writeFileSync(
    USERS,
    JSON.stringify(
      [
        {
          id: "e2e-admin",
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
}
