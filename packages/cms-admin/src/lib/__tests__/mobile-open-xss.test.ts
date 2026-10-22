/**
 * Security W41 H5 — /api/mobile/open reflected ?url= unescaped into an href
 * and into a <script>; `</script><b>MARKER` came back verbatim (measured live).
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../../app/api/mobile/open/route";

async function page(url: string): Promise<string> {
  const res = await GET(new NextRequest(`https://webhouse.app/api/mobile/open?url=${encodeURIComponent(url)}`));
  return res.text();
}

describe("mobile/open", () => {
  it("a </script> in the url cannot close the script block or inject markup", async () => {
    const html = await page('webhouseapp://x</script><b id="MARKER">"\'<img src=x onerror=alert(1)>');
    expect(html).not.toContain("<b id=");
    expect(html).not.toContain("<img src=x");
    expect(html.match(/<\/script>/g)?.length).toBe(1);
  });
  it("an ordinary deep link still works", async () => {
    const html = await page("webhouseapp://login?code=abc&x=1");
    expect(html).toContain('href="webhouseapp://login?code=abc&amp;x=1"');
    expect(html).toContain('"webhouseapp://login?code=abc&x=1"');
  });
});
