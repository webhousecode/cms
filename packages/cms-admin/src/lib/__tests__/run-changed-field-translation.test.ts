/**
 * Seals the LAST link in the chain: a translation that saved must also be
 * PUSHED to the live site.
 *
 * This test exists because the feature shipped without it and was, from the
 * editor's chair, completely inert. Every guard was proven, the model call
 * worked, the sibling document in the CMS was correct — and the live English
 * page kept showing the old text for hours, because nothing ever told the site
 * the document had changed. Measured on broberg.ai, 6 September 2026.
 *
 * The lesson the test encodes: "the CMS has the right value" is a narrower
 * claim than "the site shows it", and only the second one is the feature.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const dispatchRevalidation = vi.fn();
const getActiveSiteEntry = vi.fn();
const update = vi.fn();
const chat = vi.fn();

vi.mock("@/lib/revalidation", () => ({ dispatchRevalidation }));
vi.mock("@/lib/site-paths", () => ({ getActiveSiteEntry }));
vi.mock("@/lib/cms", () => ({
  getAdminCms: async () => ({
    content: {
      findMany: async () => ({ documents: siblings }),
      update,
    },
  }),
  getAdminConfig: async () => ({
    collections: [
      {
        name: "posts",
        urlPrefix: "/ai-metode",
        fields: [{ name: "lead", type: "text" }],
      },
    ],
  }),
}));
vi.mock("@/lib/ai/client", () => ({
  getAI: async () => ({ chat }),
  mistralModel: (m: string) => ({ model: m }),
}));
vi.mock("@/lib/ai/model-resolver", () => ({ getModel: async () => "mistral-large-latest" }));
vi.mock("@/lib/ai/locale-prompt", () => ({ buildLocaleInstruction: () => "" }));
vi.mock("@/lib/locale", () => ({ LOCALE_LABELS: { da: "Danish", en: "English" } }));

let siblings: unknown[] = [];

const GROUP = "grp-1";

const source = {
  id: "da-1",
  slug: "vaerktoejet",
  locale: "da",
  translationGroup: GROUP,
  data: { lead: "Ny dansk tekst." },
};

const englishSibling = {
  id: "en-1",
  slug: "the-instrument",
  locale: "en",
  translationGroup: GROUP,
  data: { lead: "Old English text." },
};

function run(overrides: Record<string, unknown> = {}) {
  return import("../ai/run-changed-field-translation").then((m) =>
    m.runChangedFieldTranslation({
      collection: "posts",
      source: source as never,
      changed: { lead: "Ny dansk tekst." },
      previousData: { lead: "Gammel dansk tekst." },
      targetLocale: "en",
      defaultLocale: "da",
      autoRetranslateOnUpdate: true,
      expectSiteId: "broberg-ai",
      ...overrides,
    } as never),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  siblings = [source, englishSibling];
  chat.mockResolvedValue({ text: '{"lead":"New English text."}' });
  update.mockResolvedValue({ ...englishSibling, data: { lead: "New English text." } });
  getActiveSiteEntry.mockResolvedValue({
    id: "broberg-ai",
    revalidateUrl: "https://broberg-ai.fly.dev/icd",
  });
});

describe("runChangedFieldTranslation — the push to the site", () => {
  it("pushes the translated sibling to the live site after saving it", async () => {
    const r = await run();
    expect(r.ok).toBe(true);

    // The write happened…
    expect(update).toHaveBeenCalledOnce();
    // …and so did the push. Without this call the CMS is right and the page
    // is wrong, which is exactly the failure this test exists for.
    expect(dispatchRevalidation).toHaveBeenCalledOnce();

    const [site, payload, urlPrefix] = dispatchRevalidation.mock.calls[0];
    expect(site.revalidateUrl).toBe("https://broberg-ai.fly.dev/icd");
    expect(payload.collection).toBe("posts");
    // The SIBLING's slug, never the source's — pushing the Danish slug would
    // re-render the page that was already correct and leave English stale.
    expect(payload.slug).toBe("the-instrument");
    expect(payload.action).toBe("updated");
    expect((payload.document as { data: { lead: string } }).data.lead).toBe("New English text.");
    expect(urlPrefix).toBe("/ai-metode");
  });

  it("pushes the document the site must render — the SAVED one, not the pre-save copy", async () => {
    await run();
    const [, payload] = dispatchRevalidation.mock.calls[0];
    expect((payload.document as { data: { lead: string } }).data.lead).not.toBe("Old English text.");
  });

  it("does not push when there is nothing to translate", async () => {
    // Same value as before → not an edit of it → no model call, no write, no push.
    const r = await run({ changed: { lead: "Gammel dansk tekst." } });
    expect(r.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
    expect(dispatchRevalidation).not.toHaveBeenCalled();
  });

  it("still reports success when the site push fails — the translation is saved", async () => {
    dispatchRevalidation.mockRejectedValue(new Error("site is down"));
    const r = await run();
    expect(r.ok).toBe(true);
    expect(update).toHaveBeenCalledOnce();
  });

  it("skips the push for a site with no revalidateUrl, without failing the save", async () => {
    getActiveSiteEntry.mockResolvedValue({ id: "broberg-ai" });
    const r = await run();
    expect(r.ok).toBe(true);
    expect(dispatchRevalidation).not.toHaveBeenCalled();
  });

  it("refuses when the source is not the default locale (the circular guard)", async () => {
    // An English edit must never translate back into Danish and overwrite it.
    const r = await run({
      source: { ...source, locale: "en" },
      targetLocale: "da",
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("not the default");
    expect(update).not.toHaveBeenCalled();
    expect(dispatchRevalidation).not.toHaveBeenCalled();
  });
});

describe("runChangedFieldTranslation — the tenant must be PROVEN, not assumed", () => {
  // Raised by the cardmem session: "works on today's runtime" is a sentence
  // that reads as a guarantee in six months. These tests are what keeps the
  // claim true when the runtime changes underneath us — a lost tenant becomes a
  // logged REFUSAL, not a write into somebody else's site.

  it("REFUSES when the ambient tenant resolves to a different site", async () => {
    // Exactly what a lost request context produces: site-paths' cookies() catch
    // answers with the registry default, which is a real, plausible site id.
    getActiveSiteEntry.mockResolvedValue({
      id: "webhouse-site",
      revalidateUrl: "https://wh-site.webhouse.net/icd",
    });
    const r = await run();
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("tenant lost");
    expect(r.reason).toContain("webhouse-site");
    // Nothing read, nothing written, nothing pushed.
    expect(chat).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(dispatchRevalidation).not.toHaveBeenCalled();
  });

  it("REFUSES when no site resolves at all", async () => {
    getActiveSiteEntry.mockResolvedValue(null);
    const r = await run();
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("tenant lost");
    expect(update).not.toHaveBeenCalled();
    expect(dispatchRevalidation).not.toHaveBeenCalled();
  });

  it("refuses BEFORE the model call — a lost tenant costs nothing", async () => {
    getActiveSiteEntry.mockResolvedValue({ id: "sanneandersen" });
    await run();
    expect(chat).not.toHaveBeenCalled();
  });
});
