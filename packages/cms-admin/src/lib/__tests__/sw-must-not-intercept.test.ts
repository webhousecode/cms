import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The service worker must never answer a request on the browser's behalf.
 *
 * `event.respondWith(fetch(event.request))` looks like a no-op pass-through and
 * is the opposite: it takes the browser's networking out of the loop, so a
 * rejected inner fetch kills the page — and a service worker SURVIVES A HARD
 * RELOAD, so it keeps killing it.
 *
 * Measured 28 Aug 2026: a deploy restarted the single production machine for
 * ~50s. Christian's tab was stuck on a dead webhouse.app afterwards; ten hard
 * reloads did not help, while the same URLs answered 200 in under 200ms for
 * everyone else — including an authenticated request to the exact page he was
 * on. The server was healthy; the worker in his browser was not.
 *
 * The hazard was known: public/sw.js's own comment said it caused "dead pages",
 * and pwa-register.tsx unregisters the worker — but only when
 * NODE_ENV !== "production". The environment where deploys actually happen kept
 * it. That is the shape this test exists to stop coming back.
 */

const SW = join(process.cwd(), "public/sw.js");
const src = readFileSync(SW, "utf8");

/** Code only. The explanation above is allowed to say "respondWith". */
const code = src
  .split("\n")
  .filter((l) => {
    const t = l.trim();
    return t && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  })
  .join("\n");

describe("the production service worker", () => {
  it("was actually read", () => {
    // A guard that silently scanned nothing is worse than no guard.
    expect(code.length, "sw.js is empty or all comments").toBeGreaterThan(200);
  });

  it("never calls respondWith in a fetch handler", () => {
    const at = code.indexOf('addEventListener("fetch"');
    expect(at, "the fetch listener is gone — the anchor moved").toBeGreaterThan(-1);
    const body = code.slice(at, at + 400);
    expect(body, "the fetch handler intercepts requests again — this is the bug that bricked a tab")
      .not.toMatch(/respondWith/);
  });

  it("still handles push and notificationclick — this is not 'delete the worker'", () => {
    // Without these, gutting sw.js entirely would pass the test above while
    // silently killing deploy notifications.
    expect(code).toMatch(/addEventListener\("push"/);
    expect(code).toMatch(/addEventListener\("notificationclick"/);
    expect(code, "showNotification is gone — push would arrive and show nothing")
      .toMatch(/showNotification/);
  });

  it("takes over from an old worker immediately", () => {
    // The worker being replaced is the dangerous one; a new one that waits for
    // every tab to close would leave it in place for days.
    expect(code).toMatch(/skipWaiting/);
    expect(code).toMatch(/clients\.claim/);
  });
});
