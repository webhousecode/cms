/**
 * F178.4 — the ONE place the suite learns which server it is talking to.
 *
 * This existed only inside playwright.config.ts, and three spec files carried
 * their own copy: `const BASE = "http://localhost:3010"`. The config had
 * already been moved OFF 3010 on purpose — that port is the live cms-admin dev
 * server on Christian's machine, and a repo hard rule says nothing may bind,
 * kill or disturb it. The specs kept pointing at it.
 *
 * What that cost, measured 28 Aug 2026:
 *
 *   - In CI there is no server on 3010, so those specs answered
 *     ERR_CONNECTION_REFUSED and 34 of 43 tests failed. The `Tests` workflow
 *     had failed 99 of its last 100 runs and had never once been green.
 *   - Locally it was worse than noise. 03-richtext.spec.ts did a PATCH against
 *     `localhost:3010/api/cms/...` — a WRITE into whichever site Christian had
 *     open. That is the exact damage the config comment says was closed.
 *
 * So the value lives here, both callers import it, and a guard test fails if a
 * literal host reappears in a spec. One source, per the house rule.
 */

/** Deliberately NOT 3010. Override with E2E_PORT when you need another. */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3011);

/** Absolute origin of the server under test — no trailing slash. */
export const BASE_URL =
  process.env.E2E_BASE_URL ?? `http://localhost:${E2E_PORT}`;

/**
 * Where the fixture's registry, users and per-site state live, and which site
 * the suite runs against. Shared so playwright.config.ts and global-setup.ts
 * cannot disagree about it — the reason this file exists at all.
 */
import path from "node:path";

export const E2E_DATA_DIR =
  process.env.E2E_DATA_DIR ?? path.join(__dirname, "..", ".e2e-data");

export const FIXTURE_CONFIG =
  process.env.E2E_CMS_CONFIG_PATH ??
  path.resolve(__dirname, "../../../../examples/blog/cms.config.ts");

export const FIXTURE_SITE_ID = process.env.E2E_SITE_ID ?? "default";
