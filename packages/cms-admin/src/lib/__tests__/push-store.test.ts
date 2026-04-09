/**
 * Tests for the push token + topic preference store.
 *
 * Uses a temp dir as CMS_CONFIG_PATH so each test starts clean.
 */

import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  ALL_TOPICS,
  defaultTopicPrefs,
  deleteToken,
  deleteTokensByIds,
  getTokensForUser,
  getTopicPrefs,
  registerDeviceToken,
  setTopicPrefs,
} from "../push-store";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "wha-push-test-"));
  // The store reads CMS_CONFIG_PATH and writes alongside it under _data/
  process.env.CMS_CONFIG_PATH = path.join(tmpDir, "cms.config.ts");
  // Touch a fake config so getActiveSitePaths fallback isn't used
  await fs.writeFile(process.env.CMS_CONFIG_PATH, "// test", "utf-8");
});

describe("push-store — tokens", () => {
  it("registers a new token and returns the row", async () => {
    const t = await registerDeviceToken("user-1", "ios", "fcm-token-abc", "iPhone 16");
    expect(t.userId).toBe("user-1");
    expect(t.platform).toBe("ios");
    expect(t.token).toBe("fcm-token-abc");
    expect(t.deviceLabel).toBe("iPhone 16");
    expect(t.id).toBeDefined();
  });

  it("re-registering the same token refreshes lastSeen, no duplicate row", async () => {
    const a = await registerDeviceToken("user-1", "ios", "tok");
    await new Promise((r) => setTimeout(r, 5));
    const b = await registerDeviceToken("user-1", "ios", "tok");
    expect(b.id).toBe(a.id);
    const all = await getTokensForUser("user-1");
    expect(all).toHaveLength(1);
    expect(b.lastSeen >= a.lastSeen).toBe(true);
  });

  it("supports multiple devices per user", async () => {
    await registerDeviceToken("user-1", "ios", "tok-iphone");
    await registerDeviceToken("user-1", "android", "tok-pixel");
    await registerDeviceToken("user-1", "web", '{"endpoint":"..."}');
    const all = await getTokensForUser("user-1");
    expect(all).toHaveLength(3);
    expect(all.map((t) => t.platform).sort()).toEqual(["android", "ios", "web"]);
  });

  it("isolates tokens between users", async () => {
    await registerDeviceToken("user-1", "ios", "a");
    await registerDeviceToken("user-2", "ios", "b");
    expect(await getTokensForUser("user-1")).toHaveLength(1);
    expect(await getTokensForUser("user-2")).toHaveLength(1);
  });

  it("deletes a single token by id", async () => {
    const t = await registerDeviceToken("user-1", "ios", "tok");
    await deleteToken(t.id);
    expect(await getTokensForUser("user-1")).toHaveLength(0);
  });

  it("bulk-deletes tokens by ids (used by send cleanup)", async () => {
    const a = await registerDeviceToken("user-1", "ios", "a");
    const b = await registerDeviceToken("user-1", "android", "b");
    const c = await registerDeviceToken("user-1", "web", "c");
    await deleteTokensByIds([a.id, c.id]);
    const remaining = await getTokensForUser("user-1");
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe(b.id);
  });
});

describe("push-store — preferences", () => {
  it("returns sensible defaults for a brand-new user", async () => {
    const prefs = await getTopicPrefs("never-seen");
    expect(prefs).toEqual(defaultTopicPrefs());
    // build_failed is opt-in by default
    expect(prefs.build_failed).toBe(true);
    // build_succeeded is opt-out by default
    expect(prefs.build_succeeded).toBe(false);
  });

  it("merges patches into existing prefs without losing other keys", async () => {
    await setTopicPrefs("user-1", { build_succeeded: true });
    const after = await getTopicPrefs("user-1");
    expect(after.build_succeeded).toBe(true);
    expect(after.build_failed).toBe(true);
    expect(after.curation_pending).toBe(true);
  });

  it("each topic key in ALL_TOPICS is settable", async () => {
    const all: Partial<Record<string, boolean>> = {};
    for (const k of ALL_TOPICS) all[k] = false;
    await setTopicPrefs("user-1", all as Partial<Record<typeof ALL_TOPICS[number], boolean>>);
    const after = await getTopicPrefs("user-1");
    for (const k of ALL_TOPICS) {
      expect(after[k]).toBe(false);
    }
  });

  it("isolates prefs between users", async () => {
    await setTopicPrefs("user-1", { build_failed: false });
    const u2 = await getTopicPrefs("user-2");
    expect(u2.build_failed).toBe(true); // user-2 still has default
  });
});
