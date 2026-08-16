/**
 * F165 — regression test for the 2026-08-16 incident.
 *
 * Christian asked for a WYSIWYG editor on sanneandersen's section text. The
 * schema change was already on disk AND `GET /api/schema` returned it — but the
 * document editor still rendered a plain <textarea>, because site-pool caches
 * the compiled CmsConfig FOREVER in production. Next.js runs route handlers and
 * server components as separate module instances with separate pools, so the
 * documented `invalidate()` call cleared one and left the other stale; only a
 * deploy (a process restart) surfaced the change.
 *
 * Same fix, same shape as loadRegistry()'s (see site-registry-cache.test.ts):
 * stat the config file and rebuild when its mtime moves, so a write through ANY
 * instance — or from outside the app entirely (a beam/ICD push) — surfaces on
 * the next request.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

const CONFIG = (bodyType: string) => `
export default {
  collections: [
    {
      name: "sider-content",
      label: "Sider",
      fields: [
        { name: "title", type: "text", label: "Titel" },
        { name: "body", type: "${bodyType}", label: "Sektion-tekst" },
      ],
    },
  ],
  storage: { filesystem: { contentDir: "__CONTENT__" } },
};
`;

describe("site-pool — mtime-based cache invalidation", () => {
  let dir: string;
  let configPath: string;
  let site: { id: string; name: string; adapter: "filesystem"; configPath: string };

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "pool-cache-"));
    await fs.mkdir(path.join(dir, "content"), { recursive: true });
    configPath = path.join(dir, "cms.config.ts");
    site = { id: "site-a", name: "A", adapter: "filesystem", configPath };
    // The forever-cache only engages in production — exercise that exact path.
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(dir, { recursive: true, force: true });
  });

  const write = async (bodyType: string) =>
    fs.writeFile(configPath, CONFIG(bodyType).replace("__CONTENT__", path.join(dir, "content")));

  const fieldType = (config: { collections: Array<{ fields: Array<{ name: string; type: string }> }> }) =>
    config.collections[0]?.fields.find((f) => f.name === "body")?.type;

  it("returns the NEW config after cms.config.ts changes on disk — no restart, no invalidate() call", async () => {
    const { getOrCreateInstance } = await import("../site-pool");

    await write("textarea");
    const first = await getOrCreateInstance("org1", site as never);
    expect(fieldType(first.config as never)).toBe("textarea");

    // Simulate the real incident: the config is rewritten by ANOTHER module
    // instance (or an out-of-band push), with a deterministically newer mtime.
    // No invalidate() — that is the whole point; this instance never hears.
    await write("richtext");
    const future = new Date(Date.now() + 5000);
    await fs.utimes(configPath, future, future);

    const second = await getOrCreateInstance("org1", site as never);
    expect(fieldType(second.config as never)).toBe("richtext");
  });

  it("does NOT rebuild when the file is untouched — the cache still caches", async () => {
    const { getOrCreateInstance } = await import("../site-pool");

    await write("textarea");
    const a = await getOrCreateInstance("org1", site as never);
    const b = await getOrCreateInstance("org1", site as never);

    // Same object identity proves it was served from the pool, not recompiled.
    expect(b).toBe(a);
  });

  it("keeps the last good instance when stat fails (file briefly absent mid-write)", async () => {
    const { getOrCreateInstance } = await import("../site-pool");

    await write("textarea");
    const a = await getOrCreateInstance("org1", site as never);

    await fs.rm(configPath);
    const b = await getOrCreateInstance("org1", site as never);

    expect(b).toBe(a);
    expect(fieldType(b.config as never)).toBe("textarea");
  });
});
