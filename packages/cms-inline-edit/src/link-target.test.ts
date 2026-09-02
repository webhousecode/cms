import { describe, expect, it } from "vitest";
import { extractLinkTargets, isBareEmail, isDangerousUrl, isExternalHost, isSchemeless, withHttps } from "./link-target";

describe("isSchemeless", () => {
  // Christian, 2026-09-02: typed www.trailmem.com into the free-address field
  // and the link landed on /bag-om/www.trailmem.com. Valid HTML, dead link.
  it("flags an address the browser will read as a path on this site", () => {
    expect(isSchemeless("www.trailmem.com")).toBe(true);
    expect(isSchemeless("trailmem.com")).toBe(true);
    expect(isSchemeless("example.com/side")).toBe(true);
    expect(isSchemeless("  trailmem.com  ")).toBe(true);
  });

  // The negative control. Without it, a predicate that always returned true
  // would pass every test above — and would then nag on every correct address
  // until editors learned to ignore the notice entirely.
  it("stays quiet on every address that is already unambiguous", () => {
    for (const ok of [
      "https://www.trailmem.com",
      "http://example.com",
      "HTTPS://EXAMPLE.COM",
      "/flagskibe/trail",
      "#kontakt",
      "?side=2",
      "mailto:cb@webhouse.dk",
      "tel:+4512345678",
      "//cdn.example.com/x.js",
      "",
      "   ",
    ]) {
      expect(isSchemeless(ok), ok).toBe(false);
    }
  });

  // These are the false positives that made us refuse to auto-normalise: they
  // are correctly flagged as DOUBTFUL, and would be corrupted by a rewrite.
  // The notice asks; it must never decide.
  it("flags relative paths that merely look like hostnames", () => {
    expect(isSchemeless("index.html")).toBe(true);
    expect(isSchemeless("v2.0-noter")).toBe(true);
    expect(isSchemeless("docs/kom-i-gang.md")).toBe(true);
  });
});

describe("withHttps", () => {
  it("prefixes the scheme without doubling a slash", () => {
    expect(withHttps("trailmem.com")).toBe("https://trailmem.com");
    expect(withHttps("  www.trailmem.com ")).toBe("https://www.trailmem.com");
    expect(withHttps("/trailmem.com")).toBe("https://trailmem.com");
  });
});

describe("isExternalHost", () => {
  it("is true only for an http(s) address on another host", () => {
    expect(isExternalHost("https://www.trailmem.com", "broberg.ai")).toBe(true);
    expect(isExternalHost("https://broberg.ai/flagskibe", "broberg.ai")).toBe(false);
    expect(isExternalHost("https://BROBERG.AI/x", "broberg.ai")).toBe(false);
  });

  it("is false for anything we cannot resolve to a host", () => {
    // A schemeless or relative address must not default the new-tab box on:
    // the whole point is that we do not know where it goes.
    expect(isExternalHost("trailmem.com", "broberg.ai")).toBe(false);
    expect(isExternalHost("/flagskibe", "broberg.ai")).toBe(false);
    expect(isExternalHost("mailto:cb@webhouse.dk", "broberg.ai")).toBe(false);
    expect(isExternalHost("https://", "broberg.ai")).toBe(false);
  });
});

describe("extractLinkTargets", () => {
  it("finds both HTML anchors and Markdown links", () => {
    const md = 'se [Trail](www.trailmem.com) og <a href="/flagskibe">her</a>';
    expect(extractLinkTargets(md)).toEqual([
      { syntax: "html", value: "/flagskibe" },
      { syntax: "markdown", value: "www.trailmem.com" },
    ]);
  });

  it("ignores Markdown image sources", () => {
    // A relative image path is normal and correct. Flagging it would bury the
    // real findings under noise until nobody reads the report.
    expect(extractLinkTargets("![foto](uploads/x.jpg)")).toEqual([]);
  });

  it("handles single-quoted href and finds nothing in plain prose", () => {
    expect(extractLinkTargets("<a href='trailmem.com'>x</a>")).toEqual([
      { syntax: "html", value: "trailmem.com" },
    ]);
    expect(extractLinkTargets("ingen links her overhovedet")).toEqual([]);
  });
});

describe("isDangerousUrl", () => {
  // A javascript: link is script execution on click, in the SITE's own origin —
  // which is where the editor's edit-session token lives in localStorage. The
  // package already refused these on every OTHER attribute; href was emitted
  // separately and escaped the check.
  it("blocks the schemes that execute", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "  javascript:alert(1)",
      "java\tscript:alert(1)", // browsers ignore control chars inside a scheme
      "java\nscript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
    ]) {
      expect(isDangerousUrl(bad), bad).toBe(true);
    }
  });

  // The negative control. A predicate that returned true for everything would
  // pass the block-list above and refuse every legitimate link on the site.
  it("lets every ordinary address through", () => {
    for (const ok of [
      "https://www.trailmem.com",
      "http://example.com",
      "/flagskibe/trail",
      "#kontakt",
      "mailto:cb@webhouse.dk",
      "tel:+4512345678",
      "trailmem.com",
      "//cdn.example.com/x.js",
      "javascriptdings.dk", // a hostname that merely STARTS with the word
      "https://x.dk/?q=javascript:1", // the scheme appears, but not as the scheme
      "",
    ]) {
      expect(isDangerousUrl(ok), ok).toBe(false);
    }
  });
});

describe("isBareEmail", () => {
  // Typing an email address used to raise the schemeless notice and offer
  // "add https://", which produces https://cb@webhouse.dk — parsed as host
  // webhouse.dk with userinfo cb. A dead link that then LOOKS unambiguous, so
  // the notice disappears and nothing warns again.
  it("recognises a bare address and keeps the notice away", () => {
    for (const mail of ["cb@webhouse.dk", "christian@broberg.ai", " a.b@x.co "]) {
      expect(isBareEmail(mail), mail).toBe(true);
      expect(isSchemeless(mail), mail).toBe(false);
    }
  });

  // The negative control: an ordinary URL that happens to contain an @ must
  // not be mistaken for one, or it would lose its notice.
  it("is not fooled by an @ inside a URL", () => {
    for (const notMail of [
      "https://x.dk/@bruger",
      "trailmem.com",
      "user@host/path",
      "@handle",
      "a@b",
    ]) {
      expect(isBareEmail(notMail), notMail).toBe(false);
    }
    expect(isSchemeless("user@host/path")).toBe(true);
  });
});

describe("extractLinkTargets — the forms a scanner must not miss", () => {
  // An unquoted href is legal HTML5 and common in pasted or imported markup —
  // exactly the content this scanner audits. Requiring quotes made the site
  // scan clean while the dead link was live.
  it("finds an unquoted href", () => {
    expect(extractLinkTargets("<a href=trailmem.com>Trail</a>")).toEqual([
      { syntax: "html", value: "trailmem.com" },
    ]);
  });

  // A linked image must report the LINK's address, not the image's — the old
  // pattern stopped at the inner ] and reported a.png as a schemeless link.
  it("reports the link address of a linked image, not the image source", () => {
    expect(extractLinkTargets("[![alt](a.png)](https://x.com)")).toEqual([
      { syntax: "markdown", value: "https://x.com" },
    ]);
  });

  it("still skips a plain image and an ordinary link is unchanged", () => {
    expect(extractLinkTargets("![foto](uploads/x.jpg)")).toEqual([]);
    expect(extractLinkTargets("[Trail](https://trailmem.com)")).toEqual([
      { syntax: "markdown", value: "https://trailmem.com" },
    ]);
  });
});

describe("the {v} placeholder is not a substitution pattern", () => {
  // String.replace interprets $&, $` and $' in the REPLACEMENT, so a plain
  // string replacement splices the label's own markup back in after escaping
  // has run — worst of all in the security warning. The dialog uses the
  // function form; this pins why.
  const LABEL = "<b>{v}</b> læses som en side på <b>dette</b> site.";
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  it("the string form corrupts the label — this is the bug, kept visible", () => {
    expect(LABEL.replace("{v}", esc("a$`b"))).not.toBe("<b>a$`b</b> læses som en side på <b>dette</b> site.");
  });

  it("the function form does not", () => {
    expect(LABEL.replace("{v}", () => esc("a$`b"))).toBe(
      "<b>a$`b</b> læses som en side på <b>dette</b> site.",
    );
    expect(LABEL.replace("{v}", () => esc("x$'y"))).toContain("x$'y");
  });
});
