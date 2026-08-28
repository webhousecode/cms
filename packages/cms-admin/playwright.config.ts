import { defineConfig } from "@playwright/test";
import path from "node:path";
import { BASE_URL, E2E_PORT as PORT } from "./e2e/fixtures/base-url";

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
const FIXTURE_CONFIG =
  process.env.E2E_CMS_CONFIG_PATH ??
  path.resolve(here, "../../examples/blog/cms.config.ts");
const FIXTURE_DATA_DIR =
  process.env.E2E_DATA_DIR ?? path.join(here, ".e2e-data");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "suites/**/*.spec.ts",
  timeout: 30_000,
  retries: 0,
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
      // Its own build dir, or it cannot boot beside a running dev server —
      // `next dev` holds an exclusive lock on .next/dev/lock. See next.config.ts.
      NEXT_DIST_DIR: process.env.NEXT_DIST_DIR ?? ".next-e2e",
    },
  },
});
