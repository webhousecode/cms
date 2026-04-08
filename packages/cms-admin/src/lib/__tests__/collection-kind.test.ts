import { describe, it, expect } from "vitest";

/**
 * F127 — Collection Purpose Metadata
 *
 * These tests mirror the logic in `src/lib/chat/system-prompt.ts` so we can
 * verify the kind/description injection without pulling in server-only
 * dependencies (getAdminCms, next/headers, etc.).
 *
 * When the real implementation changes, these tests MUST be updated to match.
 */

type Kind = "page" | "snippet" | "data" | "form" | "global";

interface TestCollection {
  name: string;
  label: string;
  fields: Array<{ name: string; type: string; label?: string; required?: boolean }>;
  documentCount: number;
  kind?: Kind;
  description?: string;
  previewable?: boolean;
}

// Mirror of buildChatSystemPrompt's collection-description block
function buildCollectionBlock(collections: TestCollection[]): string {
  return collections
    .map((c) => {
      const fieldList = c.fields
        .map((f) => {
          const lbl = f.label && f.label !== f.name ? ` — ${f.label}` : "";
          return `    - \`${f.name}\` (${f.type})${f.required ? " *required" : ""}${lbl}`;
        })
        .join("\n");
      const kindLabel = c.kind ? ` · ${c.kind}` : "";
      const headerLine = `  ### ${c.label} ('${c.name}')${kindLabel} — ${c.documentCount} documents`;
      const descLine = c.description ? `  > ${c.description}\n` : "";
      return `${headerLine}\n${descLine}${fieldList}`;
    })
    .join("\n\n");
}

// Mirror of buildChatSystemPrompt's kind-instructions block
function buildKindSection(collections: TestCollection[]): string {
  const kindsInUse = new Set(collections.map((c) => c.kind ?? "page"));
  const instructions: string[] = [];
  if (kindsInUse.has("snippet")) {
    instructions.push(
      "- `snippet` collections: reusable fragments embedded in other pages via `{{snippet:slug}}`. They have NO standalone URL. Do NOT generate SEO metadata. Do NOT include View pills — only Edit pills. You can still translate them."
    );
  }
  if (kindsInUse.has("data")) {
    instructions.push(
      "- `data` collections: records rendered on OTHER pages via loops (team, testimonials, FAQ, products). They have NO standalone URL. Do NOT generate SEO metadata. Do NOT include View pills — only Edit pills. Do NOT remap `body`/`content` to richtext — use the exact field names from the schema. Build is usually still needed so the host pages pick up the new data."
    );
  }
  if (kindsInUse.has("form")) {
    instructions.push(
      "- `form` collections: form submissions (contact, lead capture). READ-ONLY from your perspective. Do NOT create, update, or delete documents in form collections. You may list and search them."
    );
  }
  if (kindsInUse.has("global")) {
    instructions.push(
      "- `global` collections: site-wide configuration, usually a single record. No URL, no SEO, no View pill. Treat them as settings."
    );
  }
  return instructions.length > 0
    ? `\n## Collection Kinds — How to Handle Different Types\n${instructions.join("\n")}\n`
    : "";
}

const baseCollection: TestCollection = {
  name: "posts",
  label: "Posts",
  fields: [{ name: "title", type: "text", required: true }],
  documentCount: 0,
};

describe("F127 — Collection block rendering", () => {
  it("omits kind badge when kind is not set (backwards compatible)", () => {
    const out = buildCollectionBlock([baseCollection]);
    expect(out).toContain("### Posts ('posts') — 0 documents");
    expect(out).not.toContain("· page");
    expect(out).not.toContain("· data");
  });

  it("includes kind badge when kind is set", () => {
    const out = buildCollectionBlock([
      { ...baseCollection, name: "team", label: "Team", kind: "data" },
    ]);
    expect(out).toContain("### Team ('team') · data");
  });

  it("renders description as quoted line when present", () => {
    const out = buildCollectionBlock([
      { ...baseCollection, name: "team", label: "Team", kind: "data", description: "Members rendered on /about." },
    ]);
    expect(out).toContain("> Members rendered on /about.");
  });

  it("omits description line when undefined", () => {
    const out = buildCollectionBlock([baseCollection]);
    expect(out).not.toContain("> undefined");
    expect(out).not.toContain("> null");
  });

  it("preserves field list format", () => {
    const out = buildCollectionBlock([baseCollection]);
    expect(out).toContain("- `title` (text) *required");
  });

  it("handles all five kinds", () => {
    for (const kind of ["page", "snippet", "data", "form", "global"] as const) {
      const out = buildCollectionBlock([{ ...baseCollection, kind }]);
      expect(out).toContain(`· ${kind}`);
    }
  });
});

describe("F127 — Kind-specific instructions", () => {
  it("produces empty section when all collections default to page", () => {
    const out = buildKindSection([baseCollection]);
    expect(out).toBe("");
  });

  it("produces empty section when only page-kind collections exist", () => {
    const out = buildKindSection([
      { ...baseCollection, kind: "page" },
      { ...baseCollection, name: "pages", label: "Pages", kind: "page" },
    ]);
    expect(out).toBe("");
  });

  it("adds snippet instructions when a snippet collection exists", () => {
    const out = buildKindSection([
      { ...baseCollection, name: "snippets", label: "Snippets", kind: "snippet" },
    ]);
    expect(out).toContain("Collection Kinds");
    expect(out).toContain("`snippet`");
    expect(out).toContain("{{snippet:slug}}");
    expect(out).toContain("Do NOT generate SEO");
  });

  it("adds data instructions when a data collection exists", () => {
    const out = buildKindSection([
      { ...baseCollection, name: "team", label: "Team", kind: "data" },
    ]);
    expect(out).toContain("`data` collections");
    expect(out).toContain("NO standalone URL");
    expect(out).toContain("Do NOT remap");
  });

  it("adds form instructions when a form collection exists", () => {
    const out = buildKindSection([
      { ...baseCollection, name: "contact", label: "Contact", kind: "form" },
    ]);
    expect(out).toContain("`form` collections");
    expect(out).toContain("READ-ONLY");
    expect(out).toContain("Do NOT create");
  });

  it("adds global instructions when a global collection exists", () => {
    const out = buildKindSection([
      { ...baseCollection, name: "settings", label: "Settings", kind: "global" },
    ]);
    expect(out).toContain("`global` collections");
    expect(out).toContain("settings");
  });

  it("combines multiple kind sections in deterministic order", () => {
    const out = buildKindSection([
      { ...baseCollection, name: "posts", label: "Posts", kind: "page" },
      { ...baseCollection, name: "snippets", label: "Snippets", kind: "snippet" },
      { ...baseCollection, name: "team", label: "Team", kind: "data" },
      { ...baseCollection, name: "contact", label: "Contact", kind: "form" },
      { ...baseCollection, name: "settings", label: "Settings", kind: "global" },
    ]);
    expect(out).toContain("`snippet`");
    expect(out).toContain("`data` collections");
    expect(out).toContain("`form` collections");
    expect(out).toContain("`global` collections");
    // Order matters — snippet before data before form before global
    const snippetIdx = out.indexOf("`snippet`");
    const dataIdx = out.indexOf("`data` collections");
    const formIdx = out.indexOf("`form` collections");
    const globalIdx = out.indexOf("`global` collections");
    expect(snippetIdx).toBeLessThan(dataIdx);
    expect(dataIdx).toBeLessThan(formIdx);
    expect(formIdx).toBeLessThan(globalIdx);
  });

  it("does not repeat instructions when multiple collections share a kind", () => {
    const out = buildKindSection([
      { ...baseCollection, name: "team", label: "Team", kind: "data" },
      { ...baseCollection, name: "faq", label: "FAQ", kind: "data" },
      { ...baseCollection, name: "testimonials", label: "Testimonials", kind: "data" },
    ]);
    const matches = out.match(/`data` collections/g) ?? [];
    expect(matches).toHaveLength(1);
  });
});

describe("F127 — Backwards compatibility", () => {
  it("legacy collections (no kind/description) render without noise", () => {
    const collections: TestCollection[] = [
      { name: "posts", label: "Posts", fields: [{ name: "title", type: "text", required: true }], documentCount: 3 },
      { name: "pages", label: "Pages", fields: [{ name: "title", type: "text", required: true }], documentCount: 5 },
    ];
    const block = buildCollectionBlock(collections);
    const section = buildKindSection(collections);

    // No kind badges
    expect(block).not.toMatch(/ · (page|snippet|data|form|global)/);
    // No description lines
    expect(block).not.toContain("> ");
    // No kind section at all
    expect(section).toBe("");
  });

  it("does not break when description contains markdown", () => {
    const out = buildCollectionBlock([
      { ...baseCollection, name: "team", label: "Team", kind: "data", description: "Members with **bold** and [links](/about)" },
    ]);
    expect(out).toContain("**bold**");
    expect(out).toContain("[links](/about)");
  });

  it("does not break when description contains newlines", () => {
    const out = buildCollectionBlock([
      { ...baseCollection, kind: "data", description: "Line one.\nLine two." },
    ]);
    // First line should be in the quoted block
    expect(out).toContain("> Line one.");
  });
});

describe("F127 — create_document form-kind guard", () => {
  // Mirrors the guard in create_document handler
  function canCreate(kind: Kind | undefined): { ok: boolean; reason?: string } {
    if (kind === "form") {
      return { ok: false, reason: "form collections are read-only" };
    }
    return { ok: true };
  }

  it("blocks create for form kind", () => {
    const result = canCreate("form");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("read-only");
  });

  it("allows create for page, snippet, data, global, and undefined", () => {
    expect(canCreate("page").ok).toBe(true);
    expect(canCreate("snippet").ok).toBe(true);
    expect(canCreate("data").ok).toBe(true);
    expect(canCreate("global").ok).toBe(true);
    expect(canCreate(undefined).ok).toBe(true);
  });
});

describe("F127 — SEO skip logic", () => {
  // Mirrors the needsSeo computation in create_document
  function needsSeo(kind: Kind | undefined, previewable: boolean | undefined): boolean {
    return (kind ?? "page") === "page" && previewable !== false;
  }

  it("generates SEO for page kind with default previewable", () => {
    expect(needsSeo("page", undefined)).toBe(true);
  });

  it("generates SEO for undefined kind (defaults to page)", () => {
    expect(needsSeo(undefined, undefined)).toBe(true);
  });

  it("skips SEO for snippet kind", () => {
    expect(needsSeo("snippet", undefined)).toBe(false);
  });

  it("skips SEO for data kind", () => {
    expect(needsSeo("data", undefined)).toBe(false);
  });

  it("skips SEO for form kind", () => {
    expect(needsSeo("form", undefined)).toBe(false);
  });

  it("skips SEO for global kind", () => {
    expect(needsSeo("global", undefined)).toBe(false);
  });

  it("skips SEO for page kind when previewable is false", () => {
    expect(needsSeo("page", false)).toBe(false);
  });
});

describe("F127 — body/content remap logic", () => {
  // Mirrors the remapBodyContent gate in create_document
  function remapBodyContent(kind: Kind | undefined): boolean {
    return kind !== "data" && kind !== "form" && kind !== "global";
  }

  it("remaps body/content for undefined (legacy) kind", () => {
    expect(remapBodyContent(undefined)).toBe(true);
  });

  it("remaps body/content for page kind", () => {
    expect(remapBodyContent("page")).toBe(true);
  });

  it("remaps body/content for snippet kind", () => {
    expect(remapBodyContent("snippet")).toBe(true);
  });

  it("does NOT remap body/content for data kind", () => {
    expect(remapBodyContent("data")).toBe(false);
  });

  it("does NOT remap body/content for form kind", () => {
    expect(remapBodyContent("form")).toBe(false);
  });

  it("does NOT remap body/content for global kind", () => {
    expect(remapBodyContent("global")).toBe(false);
  });
});
