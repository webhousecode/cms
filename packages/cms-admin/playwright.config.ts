import { defineConfig } from "@playwright/test";
import path from "node:path";
import { BASE_URL, E2E_PORT as PORT, E2E_DATA_DIR, FIXTURE_CONFIG } from "./e2e/fixtures/base-url";
import { resolveJwtSecret } from "./src/lib/dev-jwt-secret";

// Playwright loads this config as CommonJS, so __dirname is the right handle
// here — `import.meta.url` throws "exports is not defined in ES module scope".
const here = __dirname;

/**
 * NOT 3010. That port is the live cms-admin dev server on Christian's machine
 * and a repo hard rule says nothing may bind, kill or disturb it — yet this
 * config used to point here with reuseExistingServer:true, so running the suite
 * locally aimed tests that seed and DELETE documents at whatever site he had
 * open. Override with E2E_PORT when you need a different one.
 *
 * F178.4: the value moved to e2e/fixtures/base-url.ts and is imported here, so
 * the config and the spec files cannot disagree about it. They did for months —
 * this file was corrected and three specs kept their own hardcoded 3010, which
 * is why the E2E job had never once been green.
 */
// (imported at the top of this file)

/**
 * The suite runs against a site that lives IN THE REPO, so a fresh clone
 * reproduces the same result. Before this, CI booted cms-admin with no
 * registry and no config path at all: /admin/* answered 500 and 30 of 43 tests
 * failed on editors and pages that could not exist.
 *
 * WEBHOUSE_DATA_DIR is pinned too, and that part is not optional — a registry
 * takes PRECEDENCE over CMS_CONFIG_PATH, so without it a developer's own sites
 * would silently replace the fixture and the suite would test something
 * different on every machine.
 */
// F178.5: both moved to e2e/fixtures/base-url.ts so global-setup.ts seeds the
// SAME directory the server reads. They were config-local; a setup step that
// guessed the path would have written a registry nobody loads.
const FIXTURE_DATA_DIR = E2E_DATA_DIR;

export default defineConfig({
  // Seeds registry.json + users.json before anything runs. Without it the admin
  // counts zero users, redirects to /admin/setup, and every test that needs the
  // workspace fails as "element(s) not found".
  globalSetup: "./e2e/global-setup.ts",
  testDir: "./e2e",
  testMatch: "suites/**/*.spec.ts",
  // 30s was too tight against a DEV server: Turbopack compiles each route on
  // first hit, so whichever test reached a page first paid the compile and
  // timed out — and it moved around between runs, which reads as flakiness
  // rather than as a budget problem.
  timeout: 60_000,
  retries: 0,
  // ONE worker. Two workers share a single Next DEV server, and Turbopack
  // compiling a route for worker A stalls worker B past its budget: the i18n
  // suite alone is 6 passed in 45s, and in the parallel run the same six time
  // out at 60s. That is contention reported as failure — the worst kind of red,
  // because it moves between runs and reads as flakiness.
  workers: 1,
  use: {
    baseURL: BASE_URL,
    headless: true,
  },
  webServer: {
    command: `pnpm exec next dev --port ${PORT}`,
    port: PORT,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      CMS_CONFIG_PATH: FIXTURE_CONFIG,
      WEBHOUSE_DATA_DIR: FIXTURE_DATA_DIR,
      // The server and the tests MUST sign with the same key, and they did not.
      //
      // `next dev` loads .env.local; the Playwright process does not. So on any
      // machine with a real CMS_JWT_SECRET in .env.local — every developer's —
      // the server verified with that while the auth fixture signed with the
      // DEV_JWT_SECRET fallback. Every authed test was rejected, redirected to
      // /admin/login, and failed as "element(s) not found": twenty tests all
      // reporting a missing sidebar, an absent tab bar, no agents, no editor.
      //
      // CI never showed it (no .env.local, so both sides fell back and agreed),
      // which is the worst shape for this: the suite failed ONLY where someone
      // would try to reproduce it.
      //
      // Passing it explicitly makes the run hermetic — Next does not override an
      // env var that is already set, so the fixture's key wins over .env.local.
      CMS_JWT_SECRET: resolveJwtSecret(),
      // Its own build dir, or it cannot boot beside a running dev server —
      // `next dev` holds an exclusive lock on .next/dev/lock. See next.config.ts.
      NEXT_DIST_DIR: process.env.NEXT_DIST_DIR ?? ".next-e2e",
    },
  },
});
