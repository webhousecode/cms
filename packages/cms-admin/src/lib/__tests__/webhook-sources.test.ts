/**
 * F35 — webhook-sources tests.
 *
 * Verifies that resolveWebhooks correctly merges site + org webhook
 * configurations across all categories.
 */
import { describe, it, expect } from "vitest";
import { resolveWebhooks } from "../webhook-sources";
import type { SiteConfig } from "../site-config";
import type { OrgSettings } from "../org-settings";

const W = (id: string, url: string, secret?: string) => ({ id, url, secret });

describe("resolveWebhooks", () => {
  it("returns empty when both site and org have no webhooks", () => {
    expect(resolveWebhooks("content", null, null)).toEqual([]);
    expect(resolveWebhooks("content", {} as SiteConfig, {} as OrgSettings)).toEqual([]);
  });

  it("returns site webhooks when org has none", () => {
    const site = { contentWebhooks: [W("1", "https://a.com/wh")] } as unknown as SiteConfig;
    const result = resolveWebhooks("content", site, null);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("https://a.com/wh");
  });

  it("returns org webhooks when site has none", () => {
    const org: OrgSettings = { contentWebhooks: [W("o1", "https://org.com/wh")] };
    const result = resolveWebhooks("content", null, org);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("https://org.com/wh");
  });

  it("merges site + org webhooks (site first)", () => {
    const site = { contentWebhooks: [W("s1", "https://site.com/wh")] } as unknown as SiteConfig;
    const org: OrgSettings = { contentWebhooks: [W("o1", "https://org.com/wh")] };
    const result = resolveWebhooks("content", site, org);
    expect(result).toHaveLength(2);
    expect(result[0].url).toBe("https://site.com/wh");
    expect(result[1].url).toBe("https://org.com/wh");
  });

  it("deduplicates by URL — site config wins on duplicate", () => {
    const site = { contentWebhooks: [W("s1", "https://shared.com/wh", "site-secret")] } as unknown as SiteConfig;
    const org: OrgSettings = { contentWebhooks: [W("o1", "https://shared.com/wh", "org-secret")] };
    const result = resolveWebhooks("content", site, org);
    expect(result).toHaveLength(1);
    expect(result[0].secret).toBe("site-secret");
  });

  it("works for all categories", () => {
    const site = {
      contentWebhooks: [W("c", "https://c.com/wh")],
      publishWebhooks: [W("p", "https://p.com/wh")],
      backupWebhooks: [W("b", "https://b.com/wh")],
      linkCheckWebhooks: [W("l", "https://l.com/wh")],
      agentDefaultWebhooks: [W("a", "https://a.com/wh")],
      deployWebhooks: [W("d", "https://d.com/wh")],
      mediaWebhooks: [W("m", "https://m.com/wh")],
    } as unknown as SiteConfig;

    expect(resolveWebhooks("content", site, null)[0].url).toBe("https://c.com/wh");
    expect(resolveWebhooks("publish", site, null)[0].url).toBe("https://p.com/wh");
    expect(resolveWebhooks("backup", site, null)[0].url).toBe("https://b.com/wh");
    expect(resolveWebhooks("linkCheck", site, null)[0].url).toBe("https://l.com/wh");
    expect(resolveWebhooks("agent", site, null)[0].url).toBe("https://a.com/wh");
    expect(resolveWebhooks("deploy", site, null)[0].url).toBe("https://d.com/wh");
    expect(resolveWebhooks("media", site, null)[0].url).toBe("https://m.com/wh");
  });

  it("ignores entries without URL", () => {
    const site = {
      contentWebhooks: [
        W("s1", ""),
        W("s2", "https://valid.com/wh"),
      ],
    } as unknown as SiteConfig;
    const result = resolveWebhooks("content", site, null);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("https://valid.com/wh");
  });

  it("preserves secrets for HMAC signing", () => {
    const site = {
      contentWebhooks: [W("s1", "https://signed.com/wh", "my-secret-key")],
    } as unknown as SiteConfig;
    const result = resolveWebhooks("content", site, null);
    expect(result[0].secret).toBe("my-secret-key");
  });
});
